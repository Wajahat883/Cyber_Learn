import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { runStructured, type ModelCall, type ModelReply } from '../structured.js';
import { AiProviderError, type StructuredRequest, type TextGenerationProvider, type TokenUsage } from '../types.js';
import { maxTokensFrom } from './openaiCompatible.js';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
/** Cheap model used for small side tasks such as rubric grading. */
export const CHEAP_ANTHROPIC_MODEL = 'claude-haiku-5-5';

/** Streaming avoids HTTP timeouts, so the output cap can be generous; tokens are only billed when generated. */
const FIRST_MAX_TOKENS = 32_000;
/** One retry with this larger cap when a response is cut off. */
const RETRY_MAX_TOKENS = 64_000;

function tokenUsage(message: Anthropic.Beta.BetaMessage): TokenUsage {
  return {
    inputTokens: message.usage.input_tokens ?? 0,
    outputTokens: message.usage.output_tokens ?? 0,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    model: message.model,
  };
}

function sumUsage(a: TokenUsage | undefined, b: TokenUsage): TokenUsage {
  if (!a) return b;
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0),
    cacheWriteTokens: (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0),
    model: b.model ?? a.model,
  };
}

const textOf = (message: Anthropic.Beta.BetaMessage) =>
  message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

/** Attaches what a failed call already cost, so the daily budget still counts it. */
function withUsage(error: AiProviderError, usage: TokenUsage | undefined, outputChars = 0): AiProviderError {
  if (usage) error.usage = { calls: 0, inputChars: 0, outputChars, ...usage };
  return error;
}

/**
 * Claude via the official Anthropic SDK.
 * - Streams every call (`.finalMessage()`), so a large output cap never hits HTTP timeouts.
 * - Native JSON-schema structured output (`output_config.format`); Zod still validates the result.
 * - The system prompt is a stable block marked with `cache_control`, so repeated calls
 *   for the same task (sections, repair attempts) read it from the prompt cache.
 * - Uses the server-side refusal fallback so a request declined by a safety classifier
 *   (likely for some cybersecurity material) is retried on a fallback model in the same call.
 */
export class AnthropicTextProvider implements TextGenerationProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;
  /** Output-token ceiling learned from the API (older models allow fewer tokens). */
  private outputCap?: number;
  /** Schemas the API refused for native structured output; those fall back to prompt-only JSON. */
  private readonly rejectedSchemas = new WeakSet<object>();

  /** Without options the server configuration (.env) is used; a user's own settings never inherit it. */
  constructor(options?: { apiKey: string; model?: string }) {
    this.model = options ? options.model || DEFAULT_ANTHROPIC_MODEL : env.AI_TEXT_MODEL || DEFAULT_ANTHROPIC_MODEL;
    this.client = new Anthropic({
      apiKey: options ? options.apiKey : env.AI_TEXT_API_KEY || undefined,
      baseURL: options ? undefined : env.AI_TEXT_BASE_URL || undefined,
      timeout: env.AI_REQUEST_TIMEOUT_MS,
      maxRetries: 2,
    });
  }

  /** Model ids the key can use (for the Settings model picker). */
  async listModels(): Promise<string[]> {
    const ids: string[] = [];
    for await (const model of this.client.models.list()) ids.push(model.id);
    return ids;
  }

  /** The same credentials with a different (e.g. cheaper) model. */
  withModel(model: string): AnthropicTextProvider {
    const copy = Object.create(AnthropicTextProvider.prototype) as AnthropicTextProvider;
    Object.assign(copy, this, { model, rejectedSchemas: new WeakSet<object>(), outputCap: undefined });
    return copy;
  }

  generateStructured<T>(request: StructuredRequest<T>) {
    return runStructured((system, user, maxTokens, call) => this.complete(system, user, maxTokens, call), request);
  }

  private async send(system: string, user: string, maxTokens: number, call: ModelCall): Promise<Anthropic.Beta.BetaMessage> {
    const native = !this.rejectedSchemas.has(call.jsonSchema);
    try {
      return await this.client.beta.messages
        .stream({
          model: this.model,
          max_tokens: maxTokens,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'medium', ...(native ? { format: { type: 'json_schema' as const, schema: call.jsonSchema } } : {}) },
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: user }],
        })
        .finalMessage();
    } catch (error) {
      if (error instanceof Anthropic.BadRequestError) {
        // The schema is too complex / unsupported: remember and fall back to prompt-only JSON (Zod still validates).
        if (native && /schema|output_config|format/i.test(error.message) && !/max_tokens/i.test(error.message)) {
          this.rejectedSchemas.add(call.jsonSchema);
          return this.send(system, user, maxTokens, call);
        }
        // "max_tokens: 64000 > 8192, which is the maximum allowed": retry within the model's limit and remember it.
        const limit = /max_tokens/i.test(error.message) ? (maxTokensFrom(error.message) ?? (Number(error.message.match(/>\s*(\d{3,7})/)?.[1]) || undefined)) : undefined;
        if (limit && limit < maxTokens) {
          this.outputCap = limit;
          return this.send(system, user, limit, call);
        }
      }
      throw mapError(error);
    }
  }

  private async complete(system: string, user: string, requested: number, call: ModelCall): Promise<ModelReply> {
    const cap = (n: number) => Math.min(n, this.outputCap ?? n);
    let limit = cap(Math.max(requested, FIRST_MAX_TOKENS));
    let message = await this.send(system, user, limit, call);
    let usage = tokenUsage(message);
    if (message.stop_reason === 'max_tokens') {
      const larger = cap(Math.max(RETRY_MAX_TOKENS, limit));
      if (larger > limit) {
        limit = larger;
        try {
          message = await this.send(system, user, limit, call);
        } catch (err) {
          if (err instanceof AiProviderError) withUsage(err, usage);
          throw err;
        }
        usage = sumUsage(usage, tokenUsage(message));
      }
    }
    if (message.stop_reason === 'refusal') {
      throw withUsage(new AiProviderError('The AI declined to process this material', false, 'AI_REFUSAL'), usage);
    }
    const text = textOf(message);
    if (message.stop_reason === 'max_tokens') {
      throw withUsage(
        new AiProviderError(`AI response was cut off at ${limit} output tokens. Split the notes into smaller projects or choose a model with a larger output limit.`, false, 'AI_TRUNCATED'),
        usage,
        text.length,
      );
    }
    if (!text) throw withUsage(new AiProviderError('Claude returned an empty response', true, 'AI_EMPTY'), usage);
    return { text, usage };
  }
}

function mapError(error: unknown): unknown {
  if (error instanceof AiProviderError) return error;
  if (error instanceof Anthropic.RateLimitError) return new AiProviderError('Claude rate limit reached', true, 'AI_RATE_LIMIT');
  if (error instanceof Anthropic.AuthenticationError) return new AiProviderError('Claude API key is invalid', false, 'AI_AUTH');
  if (error instanceof Anthropic.BadRequestError) return new AiProviderError(`Claude rejected the request: ${error.message}`, false, 'AI_BAD_REQUEST');
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new AiProviderError('Claude request timed out', true, 'AI_TIMEOUT');
  if (error instanceof Anthropic.APIConnectionError) return new AiProviderError('Could not reach the Claude API', true, 'AI_UNREACHABLE');
  if (error instanceof Anthropic.APIError) return new AiProviderError(`Claude API error ${error.status ?? ''}`.trim(), (error.status ?? 500) >= 500, 'AI_HTTP_ERROR');
  return error;
}
