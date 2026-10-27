import type { ZodType } from 'zod';

/** Every structured AI call names its task so usage can be tracked and the offline provider can respond. */
export type AiTask = 'analyze' | 'section' | 'assessment' | 'diagram' | 'narration' | 'answer' | 'examples';

export interface StructuredRequest<T> {
  task: AiTask;
  /** What to do. Trusted text written by the application. */
  instructions: string;
  /** Learning material. Always treated as untrusted data, never as instructions. */
  content: string;
  schema: ZodType<T>;
  /** Structured inputs used by the offline mock provider (ignored by LLM providers). */
  context?: unknown;
  maxTokens?: number;
}

export interface AiUsage {
  calls: number;
  inputChars: number;
  outputChars: number;
}

export interface StructuredResult<T> {
  data: T;
  usage: AiUsage;
}

export interface TextGenerationProvider {
  readonly name: string;
  readonly model: string;
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
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
  ) {
    super(message);
    this.name = 'AiOutputError';
  }
}
