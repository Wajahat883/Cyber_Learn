import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { providerFetch } from '../../utils/safeFetch.js';
import { runStructured } from '../structured.js';
import { AiProviderError, type ImageGenerationProvider, type SpeechProvider, type StructuredRequest, type TextGenerationProvider, type TokenUsage } from '../types.js';

/**
 * Adapter for any OpenAI-compatible HTTP API: OpenCode Zen, OpenAI, OpenRouter,
 * Ollama, LM Studio and similar gateways. Keys never leave the backend.
 */
async function post(baseUrl: string, apiKey: string, path: string, body: unknown, timeoutMs: number): Promise<Response> {
  if (!baseUrl) throw new AiProviderError('AI base URL is not configured', false, 'AI_NOT_CONFIGURED');
  let res: Response;
  try {
    res = await providerFetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timeout = (err as Error).name === 'TimeoutError';
    throw new AiProviderError(timeout ? 'AI provider timed out' : `AI provider unreachable: ${(err as Error).message}`, true, timeout ? 'AI_TIMEOUT' : 'AI_UNREACHABLE');
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    const detail = providerMessage(raw).slice(0, 300);
    // OpenRouter answers 402 while other requests hold the account's credit; that clears once they finish.
    const inFlight = res.status === 402 && /in[- ]flight/i.test(raw);
    const retryable = res.status === 429 || res.status >= 500 || inFlight;
    const prefix = res.status === 402 ? 'AI provider account is out of credits (402)' : `AI provider returned ${res.status}`;
    throw new AiProviderError(`${prefix}${detail ? `: ${detail}` : ''}`, retryable, `AI_HTTP_${res.status}`);
  }
  return res;
}

/** The provider's own error text (`{"error":{"message":…}}`) rather than a raw JSON dump. */
function providerMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown } | string; message?: unknown };
    const msg = typeof parsed.error === 'string' ? parsed.error : (parsed.error?.message ?? parsed.message);
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  } catch {
    // Not JSON: fall through to the raw body.
  }
  return raw.trim();
}

/** Retries a request that failed only because other in-flight requests hold the account's credit. */
async function postWithBackoff(...args: Parameters<typeof post>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await post(...args);
    } catch (err) {
      const inFlight = err instanceof AiProviderError && err.code === 'AI_HTTP_402' && err.retryable;
      if (!inFlight || attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
}

/** Errors where another model may still work: credits, rate limits, unavailable model, provider outage. */
export function shouldSwitchModel(err: unknown): boolean {
  if (!(err instanceof AiProviderError)) return false;
  if (['AI_TIMEOUT', 'AI_EMPTY'].includes(err.code)) return true;
  const status = Number(err.code.match(/^AI_HTTP_(\d{3})$/)?.[1]);
  if ([402, 404, 408, 429].includes(status) || status >= 500) return true;
  // "not a valid model ID", "No endpoints found for …": this model is unusable, the key is fine.
  return status === 400 && /model|endpoint/i.test(err.message) && !/max_tokens|max_completion_tokens/i.test(err.message);
}

/** After this long on a fallback, try the main model again (daily and per-minute limits reset). */
const RETRY_PRIMARY_MS = 60 * 60_000;

export class OpenAICompatibleTextProvider implements TextGenerationProvider {
  readonly name = 'openai-compatible';
  /** Main model first, then the user's fallbacks in order. */
  private readonly models: string[];
  private active = 0;
  private switchedAt = 0;
  /** Per model: output-token ceiling learned from the provider, and json_schema support (undefined = unknown). */
  private readonly learned = new Map<string, { maxOutputTokens?: number; jsonSchemaSupported?: boolean }>();

  constructor(
    private readonly baseUrl = env.AI_TEXT_BASE_URL,
    private readonly apiKey = env.AI_TEXT_API_KEY,
    model = env.AI_TEXT_MODEL,
    fallbackModels: string[] = [],
  ) {
    if (!model) throw new Error('AI_TEXT_MODEL is required for the openai-compatible provider');
    this.models = [...new Set([model, ...fallbackModels.filter(Boolean)])];
  }

  /** The model currently in use (a fallback after the main model hit a limit). */
  get model(): string {
    return this.models[this.active];
  }

  generateStructured<T>(request: StructuredRequest<T>) {
    return runStructured(async (system, user, maxTokens, call) => {
      if (this.active > 0 && Date.now() - this.switchedAt > RETRY_PRIMARY_MS) this.active = 0;
      for (;;) {
        const model = this.model;
        try {
          return await this.callModel(model, system, user, maxTokens, call.task, call.jsonSchema);
        } catch (err) {
          if (this.active >= this.models.length - 1 || !shouldSwitchModel(err)) throw err;
          this.active += 1;
          this.switchedAt = Date.now();
          logger.warn({ from: model, to: this.model, reason: (err as Error).message.slice(0, 200) }, 'AI model unavailable, switching to fallback model');
        }
      }
    }, request);
  }

  private async callModel(model: string, system: string, user: string, maxTokens: number, task: string, jsonSchema: unknown) {
    const learned = this.learned.get(model) ?? {};
    this.learned.set(model, learned);
    const send = (limit: number, structured: boolean) =>
      postWithBackoff(
        this.baseUrl,
        this.apiKey,
        '/chat/completions',
        {
          model,
          max_tokens: limit,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          // Native structured output where supported; the prompt still carries the schema and Zod validates.
          ...(structured ? { response_format: { type: 'json_schema', json_schema: { name: `cyberlearn_${task}`, schema: jsonSchema, strict: false } } } : {}),
        },
        env.AI_REQUEST_TIMEOUT_MS,
      );
    const sendWithFallback = async (limit: number): Promise<Response> => {
      const structured = learned.jsonSchemaSupported !== false;
      try {
        const ok = await send(limit, structured);
        if (structured) learned.jsonSchemaSupported = true;
        return ok;
      } catch (err) {
        // Providers without json_schema support reject the request (400/422): retry plain JSON and remember.
        const rejected = err instanceof AiProviderError && /AI_HTTP_(400|422)/.test(err.code) && !/max_tokens|max_completion_tokens/i.test(err.message);
        if (!structured || learned.jsonSchemaSupported === true || !rejected) throw err;
        const res = await send(limit, false);
        learned.jsonSchemaSupported = false;
        return res;
      }
    };
    let res: Response;
    try {
      res = await sendWithFallback(Math.min(maxTokens, learned.maxOutputTokens ?? maxTokens));
    } catch (err) {
      // "max_tokens must be less than or equal to 4096": retry once within the model's limit and remember it.
      const limit = err instanceof AiProviderError && /max_tokens|max_completion_tokens/i.test(err.message) ? maxTokensFrom(err.message) : undefined;
      if (!limit) throw err;
      learned.maxOutputTokens = limit;
      res = await sendWithFallback(Math.min(maxTokens, limit));
    }
    const json = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    };
    const usage: TokenUsage | undefined = json.usage
      ? {
          inputTokens: json.usage.prompt_tokens ?? 0,
          outputTokens: json.usage.completion_tokens ?? 0,
          cacheReadTokens: json.usage.prompt_tokens_details?.cached_tokens ?? 0,
          model: json.model || model,
        }
      : undefined;
    const choice = json.choices?.[0];
    if (!choice?.message?.content) throw new AiProviderError('AI provider returned an empty response', true, 'AI_EMPTY');
    if (choice.finish_reason === 'length') {
      const err = new AiProviderError(
        `AI response was cut off: this model allows only ${learned.maxOutputTokens ?? maxTokens} output tokens. Choose a model with a larger output limit in Settings, or use shorter notes.`,
        false,
        'AI_TRUNCATED',
      );
      if (usage) err.usage = { calls: 0, inputChars: 0, outputChars: choice.message.content.length, ...usage };
      throw err;
    }
    return { text: choice.message.content, usage };
  }
}

/** Reads the largest allowed value from a provider error such as "must be less than or equal to `4096`". */
export function maxTokensFrom(message: string): number | undefined {
  const m = message.match(/(?:less than or equal to|at most|maximum(?: value)?(?: for `?max_tokens`?)? (?:is|of)|<=)\s*`?(\d{3,7})`?/i);
  // OpenRouter credit limit: "You requested up to 16000 tokens, but can only afford 14998". Keep a small margin.
  const afford = message.match(/can only afford\s*(\d{3,7})/i);
  const value = m ? Number(m[1]) : afford ? Math.floor(Number(afford[1]) * 0.95) : NaN;
  return Number.isFinite(value) && value >= 256 ? value : undefined;
}

export class OpenAICompatibleImageProvider implements ImageGenerationProvider {
  readonly name = 'openai-compatible';
  readonly model = env.AI_IMAGE_MODEL;

  async generateImage(input: { prompt: string; aspectRatio?: string }) {
    const size = input.aspectRatio === '1:1' ? '1024x1024' : '1536x1024';
    const res = await post(
      env.AI_IMAGE_BASE_URL,
      env.AI_IMAGE_API_KEY,
      '/images/generations',
      { model: this.model, prompt: input.prompt, size, n: 1, response_format: 'b64_json' },
      env.AI_REQUEST_TIMEOUT_MS,
    );
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new AiProviderError('Image provider returned no image', true, 'AI_EMPTY');
    return { body: Buffer.from(b64, 'base64'), mimeType: 'image/png' };
  }
}

export class OpenAICompatibleSpeechProvider implements SpeechProvider {
  readonly name = 'openai-compatible';
  readonly producesAudio = true;

  async synthesize(input: { text: string }) {
    const res = await post(
      env.AI_SPEECH_BASE_URL,
      env.AI_SPEECH_API_KEY,
      '/audio/speech',
      { model: env.AI_SPEECH_MODEL, voice: env.AI_SPEECH_VOICE || 'alloy', input: input.text.slice(0, 4000), response_format: 'mp3' },
      env.AI_REQUEST_TIMEOUT_MS,
    );
    return { body: Buffer.from(await res.arrayBuffer()), mimeType: 'audio/mpeg' };
  }
}
