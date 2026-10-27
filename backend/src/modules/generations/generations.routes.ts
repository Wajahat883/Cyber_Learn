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
import { enqueue } from '../../jobs/queues.js';
import { recordActivity } from '../../services/activity.js';
import { initialStageResults, resetForRetry, toEvent } from '../../services/generationPipeline.js';
import { badRequest, conflict, tooMany } from '../../utils/errors.js';
import { param, userId } from '../../utils/http.js';

export const generationsRouter = Router();

const jobId = (gen: GenerationDoc) => `gen-${gen._id}-${gen.attemptCount}-${Date.now()}`;

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
  })) as GenerationDoc;
  project.set({ preferences, 'status.content': 'generating' });
  await project.save();
  await User.updateOne({ _id: ownerId }, { $inc: { 'usage.generations': 1 } });
  await recordActivity({ ownerId, type: 'generation_started', projectId: project._id });
  await enqueue('generation:run', { generationId: String(gen._id) }, jobId(gen));
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
  const gen = (await findOwned(Generation, param(req, 'id'), userId(req), 'Generation')) as GenerationDoc;
  if (gen.status !== 'awaiting_review') throw conflict('This generation is not waiting for review');
  const analysis = req.body.analysis as z.infer<typeof ContinueGenerationSchema>['analysis'];
  if (!analysis.sections.some((s) => s.include)) throw badRequest('Keep at least one section');
  gen.set({ analysis, autoContinue: true, status: 'queued' });
  await gen.save();
  await Project.updateOne({ _id: gen.projectId }, { $set: { 'status.content': 'generating' } });
  await enqueue('generation:run', { generationId: String(gen._id) }, jobId(gen));
  res.status(202).json({ generation: toEvent(gen) });
});

const RetrySchema = z.object({ stage: z.enum(GENERATION_STAGES).optional() });

/** Retries failed stages without losing successful work (spec 21.13). */
generationsRouter.post('/generations/:id/retry', aiLimiter, validateIds('id'), validate(RetrySchema), async (req, res) => {
  const gen = (await findOwned(Generation, param(req, 'id'), userId(req), 'Generation')) as GenerationDoc;
  if (['queued', 'running'].includes(gen.status)) throw conflict('This generation is still running');
  if (gen.status === 'awaiting_review') throw conflict('Review the plan and continue instead');
  const stage = req.body.stage as GenerationStage | undefined;
  if (stage && !['completed', 'partially_completed', 'failed', 'cancelled'].includes(gen.status)) throw conflict('Cannot retry this stage now');
  if (gen.status === 'cancelled') {
    for (const s of gen.stageResults) if (s.status === 'running') s.status = 'pending';
  } else if (!resetForRetry(gen, stage)) {
    throw badRequest('There are no failed stages to retry');
  }
  gen.set({ status: 'queued', cancelRequested: false, errorMessage: '', errorCode: '', autoContinue: true });
  await gen.save();
  await enqueue('generation:run', { generationId: String(gen._id) }, jobId(gen));
  res.status(202).json({ generation: toEvent(gen) });
});

generationsRouter.post('/generations/:id/cancel', validateIds('id'), async (req, res) => {
  const gen = (await findOwned(Generation, param(req, 'id'), userId(req), 'Generation')) as GenerationDoc;
  if (gen.status === 'awaiting_review' || gen.status === 'queued') {
    gen.set({ status: 'cancelled', cancelRequested: true, currentStage: null });
    await gen.save();
    await Project.updateOne({ _id: gen.projectId, 'status.content': { $in: ['generating', 'awaiting_review'] } }, { $set: { 'status.content': gen.lessonId ? 'ready' : 'source_added', 'status.media': 'none' } });
  } else if (gen.status === 'running') {
    // The worker stops at the next safe point between stages or sections.
    gen.cancelRequested = true;
    await gen.save();
  } else {
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
