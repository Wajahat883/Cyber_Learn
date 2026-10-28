import type { ChunkInput } from '../ai/contentAnalyzer.js';
import { embedTexts, embeddingConfig, type EmbeddingConfig } from '../ai/embeddings.js';
import { cosine, rankChunks } from '../ai/retrieval.js';
import { logger } from '../utils/logger.js';
import { SourceChunk } from '../models/index.js';

/** Loads chunks with the same global numbering the generation pipeline used. */
export async function loadChunks(ownerId: string, sourceIds: unknown[]): Promise<ChunkInput[]> {
  const chunks = await SourceChunk.find({ ownerId, sourceId: { $in: sourceIds } })
    .sort({ sourceId: 1, index: 1 })
    .lean();
  return chunks.map((c, i) => ({ index: i, text: c.text, heading: c.heading, page: c.page, sourceId: String(c.sourceId), id: String(c._id) }));
}

/** Embeddings computed per request at most (the rest are filled in by later questions). */
const MAX_NEW_EMBEDDINGS = 64;
/** Already-embedded chunks scanned for library-wide semantic search. */
const SEMANTIC_SCAN_LIMIT = 1000;

const embedText = (c: { heading: string; text: string }) => (c.heading ? `${c.heading}\n${c.text}` : c.text);

/**
 * Ranks `chunks` by embedding similarity to the question (chunk indexes, best first).
 * Missing vectors are computed lazily and stored on the chunk.
 */
async function semanticRanking(ownerId: string, question: string, chunks: ChunkInput[], cfg: EmbeddingConfig, known = new Map<string, number[]>()): Promise<number[]> {
  const ids = chunks.map((c) => c.id).filter((id): id is string => Boolean(id) && !known.has(id!));
  if (ids.length) {
    const stored = await SourceChunk.find({ ownerId, _id: { $in: ids }, embeddingModel: cfg.model }).select('+embedding +embeddingModel').lean();
    for (const s of stored) if (s.embedding?.length) known.set(String(s._id), s.embedding);
  }
  const missing = chunks.filter((c) => c.id && !known.has(c.id)).slice(0, MAX_NEW_EMBEDDINGS);
  const [questionVector, ...vectors] = await embedTexts([question, ...missing.map(embedText)], cfg);
  if (missing.length) {
    missing.forEach((c, i) => known.set(c.id!, vectors[i]));
    await SourceChunk.bulkWrite(
      missing.map((c, i) => ({ updateOne: { filter: { _id: c.id, ownerId }, update: { $set: { embedding: vectors[i], embeddingModel: cfg.model } } } })),
      { ordered: false },
    ).catch((err) => logger.warn({ err }, 'Could not store chunk embeddings'));
  }
  return chunks
    .filter((c) => c.id && known.has(c.id))
    .map((c) => ({ index: c.index, score: cosine(questionVector, known.get(c.id!)!) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.index);
}

async function trySemantic(ownerId: string, question: string, chunks: ChunkInput[], known?: Map<string, number[]>): Promise<number[][]> {
  const cfg = embeddingConfig();
  if (!cfg || !chunks.length) return [];
  try {
    return [await semanticRanking(ownerId, question, chunks, cfg, known)];
  } catch (err) {
    // Embeddings are an optional boost; keyword ranking still answers.
    logger.warn({ err }, 'Embedding ranking failed; using keyword ranking only');
    return [];
  }
}

/**
 * In-lesson Ask: ranks the lesson's chunks against the question (BM25, plus
 * embeddings when configured). The section being read gets a boost, not
 * automatic priority, so a relevant chunk elsewhere in the lesson still wins.
 */
export async function rankLessonChunks(ownerId: string, question: string, chunks: ChunkInput[], options: { boost?: Set<number>; limit: number }): Promise<ChunkInput[]> {
  const extraRankings = await trySemantic(ownerId, question, chunks);
  return rankChunks(question, chunks, { boost: options.boost, limit: options.limit, extraRankings });
}

/**
 * Library-wide Ask: MongoDB $text candidates (owner-scoped index) re-ranked with
 * BM25 and fused with the text score and, when configured, embedding similarity
 * over the owner's embedded chunks.
 */
export async function searchLibrary(ownerId: string, question: string, limit: number): Promise<ChunkInput[]> {
  const hits = await SourceChunk.find({ ownerId, $text: { $search: question } }, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(50)
    .lean();
  const candidates: ChunkInput[] = [];
  const keywordScores = new Map<number, number>();
  const seen = new Set<string>();
  for (const c of hits) {
    const index = candidates.length;
    candidates.push({ index, text: c.text, heading: c.heading, page: c.page, sourceId: String(c.sourceId), id: String(c._id) });
    keywordScores.set(index, (c as { score?: number }).score ?? 0);
    seen.add(String(c._id));
  }

  const known = new Map<string, number[]>();
  const cfg = embeddingConfig();
  if (cfg) {
    // Semantic candidates: the owner's chunks that already have a vector for this model.
    const embedded = await SourceChunk.find({ ownerId, embeddingModel: cfg.model })
      .select('+embedding text heading page sourceId')
      .sort({ _id: -1 })
      .limit(SEMANTIC_SCAN_LIMIT)
      .lean()
      .catch(() => []);
    for (const c of embedded) {
      if (c.embedding?.length) known.set(String(c._id), c.embedding);
      if (seen.has(String(c._id))) continue;
      seen.add(String(c._id));
      candidates.push({ index: candidates.length, text: c.text, heading: c.heading, page: c.page, sourceId: String(c.sourceId), id: String(c._id) });
    }
  }
  if (!candidates.length) return [];
  const extraRankings = await trySemantic(ownerId, question, candidates, known);
  return rankChunks(question, candidates, { limit, keywordScores, extraRankings, dropUnscored: true });
}
