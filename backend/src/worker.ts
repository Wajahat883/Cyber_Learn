import { connectDatabase, disconnectDatabase } from './config/database.js';
import { storage } from './config/storage.js';
import { closeEventBus } from './jobs/eventBus.js';
import './jobs/processors.js';
import { closeQueues, startWorkers } from './jobs/queues.js';
import { logger } from './utils/logger.js';

/** Standalone background worker (the `worker` service in docker-compose). */
async function main() {
  await connectDatabase();
  await storage.ensureReady();
  const stop = startWorkers();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down');
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
