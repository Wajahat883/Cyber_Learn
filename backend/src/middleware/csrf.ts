import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { randomToken, safeEqual } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';

export const CSRF_COOKIE = 'cl_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF protection for cookie-authenticated requests (spec 7.1).
 * The token cookie is readable by our own frontend, which echoes it in a header;
 * a cross-site page can trigger the request but cannot read the cookie.
 * Requests with a foreign Origin header are rejected as well.
 */
export const csrfProtection: RequestHandler = (req, res, next) => {
  let token: string | undefined = req.cookies?.[CSRF_COOKIE];
  if (!token) {
    token = randomToken(24);
    res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/' });
  }
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (origin && !env.allowedOrigins.includes(origin)) {
    throw new AppError(403, 'BAD_ORIGIN', 'Request origin is not allowed');
  }
  const header = req.get(CSRF_HEADER);
  if (!header || !req.cookies?.[CSRF_COOKIE] || !safeEqual(header, req.cookies[CSRF_COOKIE])) {
    throw new AppError(403, 'CSRF_FAILED', 'Missing or invalid CSRF token');
  }
  next();
};
