import { Queue, Worker, type Job } from 'bullmq';
import { createRedis, useRedis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

/**
 * Job queues (spec 12). With Redis: BullMQ with retries, exponential backoff and
 * a retained failed set (dead letters). Without Redis (development and tests):
 * the same processors run in-process.
 */
export type JobName = 'generation:run' | 'media:regenerate-image' | 'media:export';

export interface JobPayloads {
  'generation:run': { generationId: string };
  'media:regenerate-image': { assetId: string };
  'media:export': { assetId: string };
}

type Processor = (name: JobName, data: JobPayloads[JobName]) => Promise<void>;

const QUEUE_FOR: Record<JobName, 'generation' | 'media'> = {
  'generation:run': 'generation',
  'media:regenerate-image': 'media',
  'media:export': 'media',
};

let processor: Processor | undefined;
/** Registered by the worker module; kept as a hook to avoid an import cycle. */
export function registerProcessor(p: Processor) {
  processor = p;
}

const queues = new Map<string, Queue>();
function queue(name: 'generation' | 'media') {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: createRedis(`queue-${name}`) });
    queues.set(name, q);
  }
  return q;
}

// ---------------------------------------------------------------- in-process driver

const inflight = new Set<Promise<void>>();
const running = new Set<string>();

function runInline<N extends JobName>(name: N, data: JobPayloads[N], jobId: string) {
  if (running.has(jobId)) return; // duplicate-job prevention
  running.add(jobId);
  const task = (async () => {
    await new Promise((r) => setImmediate(r));
    try {
      if (!processor) throw new Error('No job processor registered');
      await processor(name, data);
    } catch (err) {
      logger.error({ err, name, jobId }, 'In-process job failed');
    } finally {
      running.delete(jobId);
    }
  })();
  inflight.add(task);
  void task.finally(() => inflight.delete(task));
}

/** Test helper: resolves when every in-process job has finished. */
export async function drainInlineJobs() {
  while (inflight.size) await Promise.all([...inflight]);
}

// ---------------------------------------------------------------- public API

export async function enqueue<N extends JobName>(name: N, data: JobPayloads[N], jobId: string) {
  if (!useRedis) {
    runInline(name, data, jobId);
    return;
  }
  await queue(QUEUE_FOR[name]).add(name, data, {
    jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 24 * 3600, count: 1000 },
    // Failed jobs are kept as dead letters for inspection.
    removeOnFail: { age: 14 * 24 * 3600 },
  });
}

export function startWorkers(concurrency = { generation: 2, media: 2 }) {
  if (!useRedis) {
    logger.info('No REDIS_URL: jobs run in-process');
    return async () => undefined;
  }
  const make = (name: 'generation' | 'media', n: number) =>
    new Worker(
      name,
      async (job: Job) => {
        if (!processor) throw new Error('No job processor registered');
        await processor(job.name as JobName, job.data);
      },
      { connection: createRedis(`worker-${name}`), concurrency: n },
    )
      .on('failed', (job, err) => logger.error({ err, job: job?.name, jobId: job?.id, attempts: job?.attemptsMade }, 'Job failed'))
      .on('error', (err) => logger.error({ err }, 'Worker error'));
  const workers = [make('generation', concurrency.generation), make('media', concurrency.media)];
  logger.info('Background workers started');
  return async () => {
    await Promise.all(workers.map((w) => w.close()));
  };
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}

/** Queue depth and dead-letter (failed) counts for operational monitoring. */
export async function queueHealth() {
  if (!useRedis) return { driver: 'in-process', inflight: inflight.size };
  const out: Record<string, Record<string, number>> = {};
  for (const name of ['generation', 'media'] as const) out[name] = await queue(name).getJobCounts('waiting', 'active', 'delayed', 'failed');
  return { driver: 'bullmq', queues: out };
}
