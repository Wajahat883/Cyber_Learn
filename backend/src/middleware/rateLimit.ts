import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const common = { standardHeaders: 'draft-7' as const, legacyHeaders: false, skip: () => env.isTest };

const message = (text: string) => ({ error: { code: 'TOO_MANY_REQUESTS', message: text } });

export const apiLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 300, message: message('Too many requests, slow down') });

export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60_000,
  limit: 20,
  message: message('Too many authentication attempts, try again later'),
});

/** Expensive AI-backed endpoints. */
export const aiLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 20, message: message('Too many AI requests, try again shortly') });

export const uploadLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 15, message: message('Too many uploads, try again shortly') });

/** Export builds (PDF/PPTX/Markdown, account backup) are CPU-heavy: limited per signed-in user, not per IP. */
export const exportLimiter = rateLimit({
  ...common,
  windowMs: 10 * 60_000,
  limit: 20,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${req.ip ?? 'unknown'}`),
  message: message('Too many exports, try again in a few minutes'),
});
