import type { ChunkInput } from '../ai/contentAnalyzer.js';
import { SourceChunk } from '../models/index.js';

/** Loads chunks with the same global numbering the generation pipeline used. */
export async function loadChunks(ownerId: string, sourceIds: unknown[]): Promise<ChunkInput[]> {
  const chunks = await SourceChunk.find({ ownerId, sourceId: { $in: sourceIds } })
    .sort({ sourceId: 1, index: 1 })
    .lean();
  return chunks.map((c, i) => ({ index: i, text: c.text, heading: c.heading, page: c.page, sourceId: String(c.sourceId) }));
}
