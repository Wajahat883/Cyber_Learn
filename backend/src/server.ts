import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { storage } from './config/storage.js';
import { createApp } from './app.js';
import { closeEventBus } from './jobs/eventBus.js';
import { closeQueues, startWorkers } from './jobs/queues.js';
import { logger } from './utils/logger.js';
import { startGenerationSweeper } from './services/generationSweeper.js';

async function main() {
  await connectDatabase();
  await storage.ensureReady();

  const app = createApp();
  // In development the API can also process jobs; in Docker a separate worker container does.
  const stopWorkers = env.RUN_WORKER_IN_PROCESS ? startWorkers() : async () => undefined;
  // Fails runs whose worker crashed. Also runs here so recovery works while the worker container is down.
  const stopSweeper = startGenerationSweeper();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, aiProvider: env.AI_TEXT_PROVIDER, storage: env.STORAGE_DRIVER }, 'CyberLearn API listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close();
    stopSweeper();
    await stopWorkers();
    await closeQueues();
    await closeEventBus();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start API');
  process.exit(1);
});
