import type { Request } from 'express';
import { unauthorized } from './errors.js';

/** Id of the authenticated user (routes using this are behind `authenticate`). */
export function userId(req: Request): string {
  if (!req.user) throw unauthorized();
  return req.user.id;
}

/** Route param as a string (Express 5 types params loosely). */
export function param(req: Request, name: string): string {
  return String(req.params[name]);
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
