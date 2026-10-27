import { Redis } from 'ioredis';
import { env } from './env.js';

/** True when background jobs and progress events go through Redis (always in Docker). */
export const useRedis = Boolean(env.REDIS_URL);

export function createRedis(purpose: string): Redis {
  // BullMQ workers require maxRetriesPerRequest: null.
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, connectionName: `cyberlearn-${purpose}`, lazyConnect: false });
}
