import type { RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { unauthorized } from '../utils/errors.js';

export const SESSION_COOKIE = 'cl_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

interface SessionPayload {
  sub: string;
  sv: number;
}

export function setSessionCookie(res: Response, userId: string, sessionVersion: number) {
  const token = jwt.sign({ sub: userId, sv: sessionVersion } satisfies SessionPayload, env.SESSION_SECRET, {
    expiresIn: SESSION_TTL_SECONDS,
    algorithm: 'HS256',
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/' });
}

async function resolveUser(token: string | undefined) {
  if (!token) return null;
  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, env.SESSION_SECRET, { algorithms: ['HS256'] }) as unknown as SessionPayload;
  } catch {
    return null;
  }
  const user = await User.findById(payload.sub).select('email displayName sessionVersion').lean();
  if (!user || user.sessionVersion !== payload.sv) return null;
  return { id: String(user._id), email: user.email, displayName: user.displayName };
}

/** Requires a valid session cookie and attaches req.user. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const user = await resolveUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) throw unauthorized();
  req.user = user;
  next();
};

/** Attaches req.user when a valid session exists, but does not require one. */
export const optionalAuthenticate: RequestHandler = async (req, _res, next) => {
  const user = await resolveUser(req.cookies?.[SESSION_COOKIE]);
  if (user) req.user = user;
  next();
};
