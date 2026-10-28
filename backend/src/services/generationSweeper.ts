import { GENERATION_STAGES } from '@cyberlearn/shared';
import { publishGenerationEvent } from '../jobs/eventBus.js';
import { generationJobId, isJobPending } from '../jobs/queues.js';
import { Generation, Project, type GenerationDoc } from '../models/index.js';
import { logger } from '../utils/logger.js';
import { staleCutoff, toEvent } from './generationPipeline.js';

export const STALE_RUN_MESSAGE = 'The generation stopped responding (its worker may have restarted). Retry to continue where it left off.';

interface Candidate {
  _id: unknown;
  status: string;
  heartbeatAt?: Date | null;
}

/** True when a queued/running generation has not shown signs of life for GENERATION_STALE_MINUTES. */
export function isStale(gen: { status: string; heartbeatAt?: Date | null; updatedAt?: Date | null }, now = Date.now()) {
  if (!['queued', 'running'].includes(gen.status)) return false;
  const last = gen.heartbeatAt ?? gen.updatedAt;
  return !last || new Date(last).getTime() < staleCutoff(now).getTime();
}

/**
 * Atomically stops a stale run. `failed` (sweeper) marks the interrupted stage as
 * failed so a normal retry resumes from it; `cancelled` (user cancel) resets it
 * to pending. Returns the updated generation, or null if it changed meanwhile.
 */
export async function stopStaleRun(candidate: Candidate, outcome: 'failed' | 'cancelled'): Promise<GenerationDoc | null> {
  const gen = (await Generation.findOneAndUpdate(
    { _id: candidate._id, status: candidate.status, heartbeatAt: candidate.heartbeatAt ?? null },
    outcome === 'failed'
      ? { $set: { status: 'failed', currentStage: null, errorCode: 'STALE_RUN', errorMessage: STALE_RUN_MESSAGE } }
      : { $set: { status: 'cancelled', currentStage: null, cancelRequested: true } },
    { new: true },
  )) as GenerationDoc | null;
  if (!gen) return null;

  if (outcome === 'failed') {
    // Give the retry endpoint a failed stage to resume from.
    const interrupted =
      gen.stageResults.find((s) => s.status === 'running') ??
      GENERATION_STAGES.map((stage) => gen.stageResults.find((s) => s.stage === stage)).find((s) => s && s.status === 'pending');
    if (interrupted) {
      interrupted.status = 'failed';
      interrupted.error = 'Interrupted';
      interrupted.completedAt = new Date().toISOString();
    }
    await Project.updateOne({ _id: gen.projectId }, { $set: { 'status.content': gen.lessonId ? 'ready' : 'failed', 'status.media': 'failed' } });
  } else {
    for (const s of gen.stageResults) if (s.status === 'running') s.status = 'pending';
    await Project.updateOne({ _id: gen.projectId }, { $set: { 'status.content': gen.lessonId ? 'ready' : 'source_added', 'status.media': 'none' } });
  }
  await gen.save();
  await publishGenerationEvent(toEvent(gen));
  return gen;
}

/**
 * Fails runs whose worker crashed: they would otherwise stay queued/running
 * forever, blocking the project and the user's concurrency slot. Queued runs whose
 * job is still waiting in the queue (a busy worker) are left alone.
 */
export async function sweepStaleGenerations(): Promise<number> {
  const cutoff = staleCutoff();
  const candidates = await Generation.find({
    status: { $in: ['queued', 'running'] },
    $or: [{ heartbeatAt: { $lt: cutoff } }, { heartbeatAt: null, updatedAt: { $lt: cutoff } }],
  })
    .select('_id status heartbeatAt attemptCount')
    .limit(200)
    .lean();
  let swept = 0;
  for (const c of candidates) {
    try {
      if (c.status === 'queued' && (await isJobPending('generation:run', generationJobId(c._id, c.attemptCount)))) continue;
      if (await stopStaleRun(c, 'failed')) {
        swept += 1;
        logger.warn({ generationId: String(c._id), status: c.status }, 'Stale generation marked as failed');
      }
    } catch (err) {
      logger.error({ err, generationId: String(c._id) }, 'Failed to sweep stale generation');
    }
  }
  return swept;
}

/** Runs the sweeper periodically. Safe to run in several processes: every transition is conditional. */
export function startGenerationSweeper(intervalMs = 60_000): () => void {
  const tick = () => void sweepStaleGenerations().catch((err) => logger.error({ err }, 'Generation sweeper failed'));
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick();
  return () => clearInterval(timer);
}
