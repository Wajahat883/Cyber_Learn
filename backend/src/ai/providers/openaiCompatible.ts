import { env } from '../../config/env.js';
import { runStructured } from '../structured.js';
import { AiProviderError, type ImageGenerationProvider, type SpeechProvider, type StructuredRequest, type TextGenerationProvider } from '../types.js';

/**
 * Adapter for any OpenAI-compatible HTTP API: OpenCode Zen, OpenAI, OpenRouter,
 * Ollama, LM Studio and similar gateways. Keys never leave the backend.
 */
async function post(baseUrl: string, apiKey: string, path: string, body: unknown, timeoutMs: number): Promise<Response> {
  if (!baseUrl) throw new AiProviderError('AI base URL is not configured', false, 'AI_NOT_CONFIGURED');
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
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
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    const retryable = res.status === 429 || res.status >= 500;
    throw new AiProviderError(`AI provider returned ${res.status}${detail ? `: ${detail}` : ''}`, retryable, `AI_HTTP_${res.status}`);
  }
  return res;
}

export class OpenAICompatibleTextProvider implements TextGenerationProvider {
  readonly name = 'openai-compatible';
  constructor(
    private readonly baseUrl = env.AI_TEXT_BASE_URL,
    private readonly apiKey = env.AI_TEXT_API_KEY,
    readonly model = env.AI_TEXT_MODEL,
  ) {
    if (!model) throw new Error('AI_TEXT_MODEL is required for the openai-compatible provider');
  }

  /** Output-token ceiling learned from the provider (models differ: some allow only 4096). */
  private maxOutputTokens?: number;

  generateStructured<T>(request: StructuredRequest<T>) {
    return runStructured(async (system, user, maxTokens) => {
      const send = (limit: number) =>
        post(
          this.baseUrl,
          this.apiKey,
          '/chat/completions',
          {
            model: this.model,
            max_tokens: limit,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          },
          env.AI_REQUEST_TIMEOUT_MS,
        );
      let res: Response;
      try {
        res = await send(Math.min(maxTokens, this.maxOutputTokens ?? maxTokens));
      } catch (err) {
        // "max_tokens must be less than or equal to 4096": retry once within the model's limit and remember it.
        const limit = err instanceof AiProviderError && /max_tokens|max_completion_tokens/i.test(err.message) ? maxTokensFrom(err.message) : undefined;
        if (!limit) throw err;
        this.maxOutputTokens = limit;
        res = await send(Math.min(maxTokens, limit));
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
      const choice = json.choices?.[0];
      if (!choice?.message?.content) throw new AiProviderError('AI provider returned an empty response', true, 'AI_EMPTY');
      if (choice.finish_reason === 'length') {
        throw new AiProviderError(
          `AI response was cut off: this model allows only ${this.maxOutputTokens ?? maxTokens} output tokens. Choose a model with a larger output limit in Settings, or use shorter notes.`,
          false,
          'AI_TRUNCATED',
        );
      }
      return choice.message.content;
    }, request);
  }
}

/** Reads the largest allowed value from a provider error such as "must be less than or equal to `4096`". */
export function maxTokensFrom(message: string): number | undefined {
  const m = message.match(/(?:less than or equal to|at most|maximum(?: value)?(?: for `?max_tokens`?)? (?:is|of)|<=)\s*`?(\d{3,7})`?/i);
  const value = m ? Number(m[1]) : NaN;
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
