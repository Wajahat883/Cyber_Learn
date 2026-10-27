import { randomUUID } from 'node:crypto';
import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { authenticate } from './middleware/authenticate.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { progressRouter } from './modules/progress/progress.routes.js';
import { projectsRouter } from './modules/projects/projects.routes.js';
import { sourcesRouter } from './modules/sources/sources.routes.js';
import { subjectsRouter } from './modules/subjects/subjects.routes.js';
import { logger } from './utils/logger.js';

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
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'up' : 'down', time: new Date().toISOString() });
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
  api.use(secured);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
