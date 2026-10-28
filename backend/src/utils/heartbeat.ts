import { writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Touches WORKER_HEARTBEAT_FILE every 30 s while the worker is connected to
 * MongoDB. The container healthcheck fails when the file gets old.
 */
export function startHeartbeatFile(intervalMs = 30_000): () => void {
  const touch = () => {
    if (mongoose.connection.readyState !== 1) return;
    writeFile(env.WORKER_HEARTBEAT_FILE, new Date().toISOString()).catch((err) => logger.warn({ err }, 'Could not write worker heartbeat file'));
  };
  touch();
  const timer = setInterval(touch, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
