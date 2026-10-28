import { connectDatabase, disconnectDatabase } from './config/database.js';
import { storage } from './config/storage.js';
import { closeEventBus } from './jobs/eventBus.js';
import './jobs/processors.js';
import { closeQueues, startWorkers } from './jobs/queues.js';
import { logger } from './utils/logger.js';
import { startGenerationSweeper } from './services/generationSweeper.js';
import { startHeartbeatFile } from './utils/heartbeat.js';
import { env } from './config/env.js';
import { startMetricsServer } from './services/metrics.js';

/** Standalone background worker (the `worker` service in docker-compose). */
async function main() {
  await connectDatabase();
  await storage.ensureReady();
  const stop = startWorkers();
  const stopSweeper = startGenerationSweeper();
  const stopHeartbeat = startHeartbeatFile();
  if (env.METRICS_PORT) startMetricsServer(env.METRICS_PORT);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down');
    stopSweeper();
    stopHeartbeat();
    await stop();
    await closeQueues();
    await closeEventBus();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
