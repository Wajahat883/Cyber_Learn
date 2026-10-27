import { randomUUID } from 'node:crypto';
import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { queueHealth } from './jobs/queues.js';
import { env } from './config/env.js';
import { authenticate } from './middleware/authenticate.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { accountRouter } from './modules/account/account.routes.js';
import { askRouter } from './modules/ask/ask.routes.js';
import { assetsRouter } from './modules/assets/assets.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { exportsRouter } from './modules/exports/exports.routes.js';
import { generationsRouter } from './modules/generations/generations.routes.js';
import { knowledgeRouter } from './modules/knowledge/knowledge.routes.js';
import { lessonsRouter } from './modules/lessons/lessons.routes.js';
import { presentationsRouter } from './modules/presentations/presentations.routes.js';
import { progressRouter } from './modules/progress/progress.routes.js';
import { projectsRouter } from './modules/projects/projects.routes.js';
import { revisionRouter } from './modules/revision/revision.routes.js';
import { sourcesRouter } from './modules/sources/sources.routes.js';
import { subjectsRouter } from './modules/subjects/subjects.routes.js';
import { logger } from './utils/logger.js';
import './jobs/processors.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind nginx / a reverse proxy in Docker.
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string) || randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      serializers: { req: (req) => ({ id: req.id, method: req.method, url: req.url }) },
    }),
  );
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: env.allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());

  const api = Router();
  api.get('/health', async (_req, res) => {
    const database = mongoose.connection.readyState === 1 ? 'up' : 'down';
    const jobs = await queueHealth().catch(() => ({ driver: 'unavailable' }));
    res.status(database === 'up' ? 200 : 503).json({ status: database === 'up' ? 'ok' : 'degraded', database, jobs, time: new Date().toISOString() });
  });

  api.use(apiLimiter);
  api.use(csrfProtection);
  api.use('/auth', authRouter);

  // Everything below requires a signed-in user.
  const secured = Router();
  secured.use(authenticate);
  secured.use(subjectsRouter);
  secured.use(projectsRouter);
  secured.use(sourcesRouter);
  secured.use(progressRouter);
  secured.use(generationsRouter);
  secured.use(lessonsRouter);
  secured.use(presentationsRouter);
  secured.use(assetsRouter);
  secured.use(askRouter);
  secured.use(revisionRouter);
  secured.use(exportsRouter);
  secured.use(accountRouter);
  secured.use(knowledgeRouter);
  api.use(secured);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
