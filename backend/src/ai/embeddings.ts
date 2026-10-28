import { AiProviderError } from './types.js';

/**
 * Optional embeddings for Ask My Notes (IMPROVEMENTS 3.1). Enabled only when
 * AI_EMBEDDING_PROVIDER=openai-compatible and AI_EMBEDDING_BASE_URL / _MODEL are set
 * (AI_EMBEDDING_API_KEY optional for local servers). Read from process.env so the
 * shared config module stays untouched. Server-configured URL only, never user input.
 */
export interface EmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export function embeddingConfig(): EmbeddingConfig | null {
  const provider = (process.env.AI_EMBEDDING_PROVIDER ?? '').trim().toLowerCase();
  const baseUrl = (process.env.AI_EMBEDDING_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const model = (process.env.AI_EMBEDDING_MODEL ?? '').trim();
  if (!['openai-compatible', 'openai'].includes(provider) || !baseUrl || !model) return null;
  const timeout = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 60_000);
  return { baseUrl, apiKey: process.env.AI_EMBEDDING_API_KEY ?? '', model, timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 60_000 };
}

const BATCH = 64;
/** Embedding inputs are capped; chunks are already bounded, this only guards odd data. */
const MAX_INPUT_CHARS = 8000;

/** Embeds texts with an OpenAI-compatible `/embeddings` endpoint, in batches, preserving order. */
export async function embedTexts(texts: string[], cfg: EmbeddingConfig): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const input = texts.slice(i, i + BATCH).map((t) => t.slice(0, MAX_INPUT_CHARS) || ' ');
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify({ model: cfg.model, input }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
        redirect: 'error',
      });
    } catch (err) {
      throw new AiProviderError(`Embedding provider unreachable: ${(err as Error).message}`, true, 'AI_UNREACHABLE');
    }
    if (!res.ok) throw new AiProviderError(`Embedding provider returned ${res.status}`, res.status === 429 || res.status >= 500, `AI_HTTP_${res.status}`);
    const json = (await res.json()) as { data?: { embedding?: number[]; index?: number }[] };
    const data = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (data.length !== input.length || data.some((d) => !Array.isArray(d.embedding))) {
      throw new AiProviderError('Embedding provider returned an unexpected response', false, 'AI_EMPTY');
    }
    out.push(...data.map((d) => d.embedding!));
  }
  return out;
}
