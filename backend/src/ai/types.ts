import type { ZodType } from 'zod';

/** Every structured AI call names its task so usage can be tracked and the offline provider can respond. */
export type AiTask = 'analyze' | 'section' | 'assessment' | 'diagram' | 'narration' | 'answer' | 'examples' | 'grade';

export interface StructuredRequest<T> {
  task: AiTask;
  /** What to do. Trusted text written by the application. */
  instructions: string;
  /** Learning material. Always treated as untrusted data, never as instructions. */
  content: string;
  /**
   * Per-request directions placed in the user message BEFORE (outside) the untrusted
   * <source_material> wrapper, e.g. the learner's own question. Keeping variable text
   * here (not in `instructions`) also keeps the system prompt stable for prompt caching.
   */
  prompt?: string;
  schema: ZodType<T>;
  /** Structured inputs used by the offline mock provider (ignored by LLM providers). */
  context?: unknown;
  maxTokens?: number;
}

export interface AiUsage {
  calls: number;
  inputChars: number;
  outputChars: number;
  /** Real token counts reported by the provider (absent for providers that do not report them). */
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Model that served the call(s). */
  model?: string;
}

/** Token usage reported for one model call. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  model?: string;
}

/** Adds one call's token usage onto a running total. */
export function addTokens(total: AiUsage, t: TokenUsage | undefined): void {
  if (!t) return;
  total.inputTokens = (total.inputTokens ?? 0) + t.inputTokens;
  total.outputTokens = (total.outputTokens ?? 0) + t.outputTokens;
  if (t.cacheReadTokens) total.cacheReadTokens = (total.cacheReadTokens ?? 0) + t.cacheReadTokens;
  if (t.cacheWriteTokens) total.cacheWriteTokens = (total.cacheWriteTokens ?? 0) + t.cacheWriteTokens;
  if (t.model) total.model = t.model;
}

export interface StructuredResult<T> {
  data: T;
  usage: AiUsage;
}

export interface TextGenerationProvider {
  readonly name: string;
  readonly model: string;
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
  /** Same credentials with another model (e.g. a cheaper one for small tasks), when supported. */
  withModel?(model: string): TextGenerationProvider;
}

export interface ImageGenerationProvider {
  readonly name: string;
  readonly model: string;
  generateImage(input: { prompt: string; title: string; concepts: string[]; aspectRatio?: string }): Promise<{ body: Buffer; mimeType: string }>;
}

export interface SpeechResult {
  body: Buffer;
  mimeType: string;
  /** Word boundaries in ms from the start of the audio, when the engine provides them. */
  words?: { startMs: number; endMs: number; text: string }[];
}

export interface SpeechProvider {
  readonly name: string;
  /** False when narration is spoken by the browser instead of stored audio. */
  readonly producesAudio: boolean;
  synthesize(input: { text: string; language: string; voice?: string }): Promise<SpeechResult | null>;
}

/** Provider failure. `retryable` covers rate limits, timeouts and server errors. */
export class AiProviderError extends Error {
  /** Usage already spent before the failure (e.g. a first attempt that succeeded, then a failed repair). */
  usage?: AiUsage;
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly code = 'AI_PROVIDER_ERROR',
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/** The model answered, but the output never matched the schema, even after the repair step. */
export class AiOutputError extends Error {
  constructor(
    message: string,
    public readonly issues: string,
    /** What the failed attempts cost, so the budget still counts them. */
    public usage?: AiUsage,
  ) {
    super(message);
    this.name = 'AiOutputError';
  }
}
