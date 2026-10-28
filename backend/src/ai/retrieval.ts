/**
 * Retrieval helpers for Ask My Notes (IMPROVEMENTS 3.1): BM25 keyword ranking,
 * cosine similarity for optional embeddings, and reciprocal rank fusion.
 * Pure functions: no I/O.
 */

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'by', 'with', 'from', 'into', 'as', 'is', 'are', 'was', 'were', 'be',
  'been', 'it', 'its', 'this', 'that', 'these', 'those', 'there', 'their', 'they', 'them', 'what', 'which', 'who', 'whom', 'when', 'where', 'why',
  'how', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'i', 'you', 'we', 'he', 'she', 'me', 'my',
  'your', 'our', 'about', 'if', 'then', 'than', 'so', 'not', 'no', 'yes', 'also', 'such', 'some', 'any', 'all', 'more', 'most', 'other',
  'explain', 'tell', 'please', 'mean', 'means', 'meaning', 'kya', 'hai', 'ka', 'ki', 'ke', 'ko', 'se', 'mein', 'aur', 'kaise', 'kyun',
]);

/** Lower-case word tokens (letters/digits, inner _ - . kept so "event_id", "cmd.exe", "4625" survive), minus stop words. */
export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[\p{L}\p{N}]+(?:[_.-][\p{L}\p{N}]+)*/gu) ?? [];
  const out: string[] = [];
  for (const token of raw) {
    if (STOP.has(token)) continue;
    out.push(token);
    // Also index the parts of compound tokens ("cmd.exe" -> "cmd", "exe").
    if (/[_.-]/.test(token)) for (const part of token.split(/[_.-]/)) if (part.length > 1 && !STOP.has(part)) out.push(part);
  }
  return out;
}

export interface Bm25Options {
  k1?: number;
  b?: number;
}

/** BM25 score of every document against the query (same order as `docs`). */
export function bm25Scores(query: string, docs: string[], options: Bm25Options = {}): number[] {
  const k1 = options.k1 ?? 1.2;
  const b = options.b ?? 0.75;
  const terms = [...new Set(tokenize(query))];
  if (!terms.length || !docs.length) return docs.map(() => 0);
  const tokenized = docs.map(tokenize);
  const avgLen = tokenized.reduce((n, t) => n + t.length, 0) / tokenized.length || 1;
  const df = new Map<string, number>();
  for (const tokens of tokenized) for (const term of new Set(tokens)) if (terms.includes(term)) df.set(term, (df.get(term) ?? 0) + 1);
  const N = docs.length;
  return tokenized.map((tokens) => {
    const tf = new Map<string, number>();
    for (const t of tokens) if (df.has(t)) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const term of terms) {
      const f = tf.get(term) ?? 0;
      if (!f) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * tokens.length) / avgLen));
    }
    return score;
  });
}

/** Indexes of `scores` sorted best-first (ties keep the original order). */
export function rankOrder(scores: number[]): number[] {
  return scores
    .map((score, i) => ({ score, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.i);
}

/**
 * Reciprocal rank fusion of several rankings (each a list of item keys, best first).
 * Returns fused scores per key.
 */
export function reciprocalRankFusion<K>(rankings: K[][], k = 60): Map<K, number> {
  const fused = new Map<K, number>();
  for (const ranking of rankings) ranking.forEach((key, rank) => fused.set(key, (fused.get(key) ?? 0) + 1 / (k + rank + 1)));
  return fused;
}

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface RankableChunk {
  index: number;
  text: string;
  heading: string;
}

export interface RankOptions {
  /** Chunk indexes that get a boost (e.g. the section the learner is reading). Boost, not automatic priority. */
  boost?: Set<number>;
  limit: number;
  /** Extra rankings to fuse (e.g. by embedding similarity), as chunk indexes best-first. */
  extraRankings?: number[][];
  /** Precomputed per-chunk keyword scores (e.g. MongoDB textScore) to fuse as another ranking. */
  keywordScores?: Map<number, number>;
  /** Drop chunks with no signal at all instead of appending them in document order. */
  dropUnscored?: boolean;
}

/**
 * Ranks chunks against a question: BM25 over heading + text, fused (RRF) with any
 * extra rankings; boosted chunks get a bonus worth half a first place in one list.
 * Chunks with no signal at all keep document order after the scored ones.
 */
export function rankChunks<C extends RankableChunk>(question: string, chunks: C[], options: RankOptions): C[] {
  if (!chunks.length) return [];
  const scores = bm25Scores(
    question,
    chunks.map((c) => `${c.heading} ${c.heading} ${c.text}`),
  );
  const positions = chunks.map((c) => c.index);
  const rankings: number[][] = [rankOrder(scores).filter((i) => scores[i] > 0).map((i) => positions[i])];
  if (options.keywordScores?.size) {
    rankings.push([...options.keywordScores.entries()].sort((a, b) => b[1] - a[1]).map(([index]) => index));
  }
  for (const extra of options.extraRankings ?? []) rankings.push(extra);
  const fused = reciprocalRankFusion(rankings);
  const bonus = 0.5 / (60 + 1);
  for (const index of options.boost ?? []) fused.set(index, (fused.get(index) ?? 0) + bonus);
  return chunks
    .map((chunk, order) => ({ chunk, order, score: fused.get(chunk.index) ?? 0 }))
    .filter((x) => !options.dropUnscored || x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, options.limit)
    .map((x) => x.chunk);
}
