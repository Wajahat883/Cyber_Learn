import type { RequestHandler } from 'express';
import { type ZodType, z } from 'zod';
import { badRequest } from '../utils/errors.js';
import { isValidObjectId } from 'mongoose';

type Part = 'body' | 'query' | 'params';

/**
 * Validates and replaces a request part with the parsed (typed, defaulted) value.
 * Express 5 makes req.query a getter, so parsed query values go to res.locals.query.
 */
export function validate(schema: ZodType, part: Part = 'body'): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      throw badRequest('Request validation failed', z.flattenError(result.error));
    }
    if (part === 'query') res.locals.query = result.data;
    else req[part] = result.data;
    next();
  };
}

/** Rejects malformed MongoDB ids in route params early. */
export function validateIds(...names: string[]): RequestHandler {
  return (req, _res, next) => {
    for (const name of names) {
      const value = req.params[name];
      if (!value || !isValidObjectId(value) || String(value).length !== 24) throw badRequest(`Invalid ${name}`);
    }
    next();
  };
}
