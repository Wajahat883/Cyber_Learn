import { Router } from 'express';
import {
  ACTIVE_GENERATION_STATUSES,
  ContinueGenerationSchema,
  GENERATION_STAGES,
  GenerationPreferencesSchema,
  StartGenerationSchema,
  type GenerationStage,
} from '@cyberlearn/shared';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { findOwned } from '../../middleware/authorize.js';
import { aiLimiter } from '../../middleware/rateLimit.js';
import { validate, validateIds } from '../../middleware/validate.js';
import { Generation, Project, Source, User, type GenerationDoc } from '../../models/index.js';
import { subscribeGeneration } from '../../jobs/eventBus.js';
import { enqueue, generationJobId } from '../../jobs/queues.js';
import { recordActivity } from '../../services/activity.js';
import { initialStageResults, resetForRetry, toEvent } from '../../services/generationPipeline.js';
import { isStale, stopStaleRun } from '../../services/generationSweeper.js';
import { AppError, badRequest, conflict, tooMany } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { param, userId } from '../../utils/http.js';

export const generationsRouter = Router();

/**
 * Queues a run whose status was just (atomically) set to "queued". The job id is
 * deterministic per attempt, so a duplicate enqueue is a no-op. If the queue is
 * unavailable the run is marked failed instead of being stranded in "queued".
 */
async function enqueueRun(gen: GenerationDoc) {
  try {
    await enqueue('generation:run', { generationId: String(gen._id) }, generationJobId(gen._id, gen.attemptCount));
  } catch (err) {
    logger.error({ err, generationId: String(gen._id) }, 'Failed to enqueue generation');
    await Generation.updateOne(
      { _id: gen._id, status: 'queued' },
      { $set: { status: 'failed', currentStage: null, errorCode: 'ENQUEUE_FAILED', errorMessage: 'The job queue is unavailable. Try again in a moment.' } },
    );
    await Project.updateOne({ _id: gen.projectId, 'status.content': 'generating' }, { $set: { 'status.content': gen.lessonId ? 'ready' : 'source_added', 'status.media': 'none' } });
    throw new AppError(503, 'QUEUE_UNAVAILABLE', 'The job queue is unavailable. Try again in a moment.');
  }
}

generationsRouter.post('/projects/:id/generations', aiLimiter, validateIds('id'), validate(StartGenerationSchema), async (req, res) => {
  const ownerId = userId(req);
  const project = await findOwned(Project, param(req, 'id'), ownerId, 'Project');
  const sourceIds: string[] = [...new Set<string>(req.body.sourceIds)];
  const sources = await Source.find({ ownerId, projectId: project._id, _id: { $in: sourceIds } }).select('extractionStatus').lean();
  if (sources.length !== sourceIds.length) throw badRequest('One or more sources do not belong to this project');
  if (!sources.some((s) => s.extractionStatus === 'completed')) throw badRequest('None of the selected sources has extracted text');

  // Duplicate-job prevention and per-user concurrency limits (spec 12).
  if (await Generation.exists({ ownerId, projectId: project._id, status: { $in: [...ACTIVE_GENERATION_STATUSES, 'awaiting_review'] } })) {
    throw conflict('A generation for this project is already in progress or waiting for review');
  }
  const active = await Generation.countDocuments({ ownerId, status: { $in: ACTIVE_GENERATION_STATUSES } });
  if (active >= env.MAX_CONCURRENT_GENERATIONS_PER_USER) {
    throw tooMany(`You can run ${env.MAX_CONCURRENT_GENERATIONS_PER_USER} generations at a time. Wait for one to finish.`);
  }

  const preferences = GenerationPreferencesSchema.parse({ ...project.toObject().preferences, ...(req.body.preferences ?? {}) });
  const gen = (await Generation.create({
    ownerId,
    projectId: project._id,
    sourceIds,
    preferences,
    autoContinue: req.body.autoContinue,
    stageResults: initialStageResults(),
    attemptCount: 1,
    heartbeatAt: new Date(),
  })) as GenerationDoc;
  project.set({ preferences, 'status.content': 'generating' });
  await project.save();
  await enqueueRun(gen);
  await User.updateOne({ _id: ownerId }, { $inc: { 'usage.generations': 1 } });
  await recordActivity({ ownerId, type: 'generation_started', projectId: project._id });
  res.status(202).json({ generation: gen });
});

generationsRouter.get('/generations', async (req, res) => {
  const ownerId = userId(req);
  const filter: Record<string, unknown> = { ownerId };
  if (req.query.active === 'true') filter.status = { $in: [...ACTIVE_GENERATION_STATUSES, 'awaiting_review'] };
  const generations = await Generation.find(filter).sort({ createdAt: -1 }).limit(50).select('-analysis').populate('projectId', 'title').lean();
  res.json({ generations });
});

generationsRouter.get('/generations/:id', validateIds('id'), async (req, res) => {
  const gen = await findOwned(Generation, param(req, 'id'), userId(req), 'Generation');
  const project = await Project.findById(gen.projectId).select('title').lean();
  res.json({ generation: gen, project });
});

/** Saves the reviewed plan and starts the expensive stages (Screen 3 -> Screen 4). */
generationsRouter.post('/generations/:id/continue', aiLimiter, validateIds('id'), validate(ContinueGenerationSchema), async (req, res) => {
  const ownerId = userId(req);
  const current = (await findOwned(Generation, param(req, 'id'), ownerId, 'Generation')) as GenerationDoc;
  if (current.status !== 'awaiting_review') throw conflict('This generation is not waiting for review');
  const analysis = req.body.analysis as z.infer<typeof ContinueGenerationSchema>['analysis'];
  if (!analysis.sections.some((s) => s.include)) throw badRequest('Keep at least one section');
  // Atomic transition: a double submit finds the run already queued and gets a 409.
  const gen = (await Generation.findOneAndUpdate(
    { _id: current._id, ownerId, status: 'awaiting_review' },
    { $set: { analysis, autoContinue: true, status: 'queued', heartbeatAt: new Date() }, $inc: { attemptCount: 1 } },
    { new: true },
  )) as GenerationDoc | null;
  if (!gen) throw conflict('This generation is not waiting for review');
  await Project.updateOne({ _id: gen.projectId }, { $set: { 'status.content': 'generating' } });
  await enqueueRun(gen);
  res.status(202).json({ generation: toEvent(gen) });
});

const RetrySchema = z.object({ stage: z.enum(GENERATION_STAGES).optional() });

/** Retries failed stages without losing successful work (spec 21.13). */
generationsRouter.post('/generations/:id/retry', aiLimiter, validateIds('id'), validate(RetrySchema), async (req, res) => {
  const ownerId = userId(req);
  const current = (await findOwned(Generation, param(req, 'id'), ownerId, 'Generation')) as GenerationDoc;
  if (['queued', 'running'].includes(current.status)) throw conflict('This generation is still running');
  if (current.status === 'awaiting_review') throw conflict('Review the plan and continue instead');
  const stage = req.body.stage as GenerationStage | undefined;
  if (stage && !['completed', 'partially_completed', 'failed', 'cancelled'].includes(current.status)) throw conflict('Cannot retry this stage now');
  if (current.status === 'cancelled') {
    for (const s of current.stageResults) if (s.status === 'running') s.status = 'pending';
    if (stage) resetForRetry(current, stage);
  } else if (!resetForRetry(current, stage)) {
    throw badRequest('There are no failed stages to retry');
  }
  // Optimistic, atomic transition: only succeeds if nobody changed the run since it was read.
  const gen = (await Generation.findOneAndUpdate(
    { _id: current._id, ownerId, status: current.status, updatedAt: current.updatedAt },
    {
      $set: {
        stageResults: current.toObject().stageResults,
        regenerateSections: current.regenerateSections,
        status: 'queued',
        cancelRequested: false,
        errorMessage: '',
        errorCode: '',
        autoContinue: true,
        heartbeatAt: new Date(),
      },
      $inc: { attemptCount: 1 },
    },
    { new: true },
  )) as GenerationDoc | null;
  if (!gen) throw conflict('This generation was already restarted');
  await Project.updateOne({ _id: gen.projectId }, { $set: { 'status.content': 'generating' } });
  await enqueueRun(gen);
  res.status(202).json({ generation: toEvent(gen) });
});

generationsRouter.post('/generations/:id/cancel', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const current = (await findOwned(Generation, param(req, 'id'), ownerId, 'Generation')) as GenerationDoc;
  let gen: GenerationDoc | null = null;
  if (current.status === 'running' && isStale(current)) {
    // Its worker is gone: nothing would ever read cancelRequested, so stop it here.
    gen = await stopStaleRun(current, 'cancelled');
  } else if (current.status === 'awaiting_review' || current.status === 'queued') {
    gen = (await Generation.findOneAndUpdate(
      { _id: current._id, ownerId, status: { $in: ['awaiting_review', 'queued'] } },
      { $set: { status: 'cancelled', cancelRequested: true, currentStage: null } },
      { new: true },
    )) as GenerationDoc | null;
    if (gen) {
      await Project.updateOne({ _id: gen.projectId, 'status.content': { $in: ['generating', 'awaiting_review'] } }, { $set: { 'status.content': gen.lessonId ? 'ready' : 'source_added', 'status.media': 'none' } });
    }
  } else if (current.status === 'running') {
    // The worker stops at the next safe point between stages or sections.
    gen = (await Generation.findOneAndUpdate({ _id: current._id, ownerId, status: 'running' }, { $set: { cancelRequested: true } }, { new: true })) as GenerationDoc | null;
  }
  if (!gen) {
    // Finished (or changed state) in the meantime.
    const latest = (await Generation.findById(current._id)) as GenerationDoc | null;
    if (latest && latest.status === 'cancelled') {
      res.json({ generation: toEvent(latest) });
      return;
    }
    throw conflict('This generation has already finished');
  }
  res.json({ generation: toEvent(gen) });
});

/** Live progress via Server-Sent Events (spec 4.6). */
generationsRouter.get('/generations/:id/events', validateIds('id'), async (req, res) => {
  const gen = (await findOwned(Generation, param(req, 'id'), userId(req), 'Generation')) as GenerationDoc;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (data: unknown) => res.write(`event: progress\ndata: ${JSON.stringify(data)}\n\n`);
  send(toEvent(gen));
  const unsubscribe = subscribeGeneration(String(gen._id), send);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
