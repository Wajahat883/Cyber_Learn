import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { storage } from './config/storage.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';

async function main() {
  await connectDatabase();
  await storage.ensureReady();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, aiProvider: env.AI_TEXT_PROVIDER, storage: env.STORAGE_DRIVER }, 'CyberLearn API listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close();
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
