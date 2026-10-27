import type { Model } from 'mongoose';
import { notFound } from '../utils/errors.js';

/**
 * Loads a document only if it belongs to the user. Knowing a document id is
 * never enough to access another user's material (spec 8.12).
 */
export async function findOwned<T>(model: Model<T>, id: string, ownerId: string, what = 'Resource', projection?: string) {
  const query = model.findOne({ _id: id, ownerId });
  if (projection) query.select(projection);
  const doc = await query;
  if (!doc) throw notFound(what);
  return doc;
}
