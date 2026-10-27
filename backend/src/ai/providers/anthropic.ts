import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { runStructured } from '../structured.js';
import { AiProviderError, type StructuredRequest, type TextGenerationProvider } from '../types.js';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

/**
 * Claude via the official Anthropic SDK. Uses the server-side refusal fallback
 * so a request declined by a safety classifier (likely for some cybersecurity
 * material) is retried on a fallback model inside the same call.
 */
export class AnthropicTextProvider implements TextGenerationProvider {
  readonly name = 'anthropic';
  readonly model = env.AI_TEXT_MODEL || DEFAULT_ANTHROPIC_MODEL;
  private readonly client = new Anthropic({
    apiKey: env.AI_TEXT_API_KEY || undefined,
    baseURL: env.AI_TEXT_BASE_URL || undefined,
    timeout: env.AI_REQUEST_TIMEOUT_MS,
    maxRetries: 2,
  });

  generateStructured<T>(request: StructuredRequest<T>) {
    return runStructured(async (system, user, maxTokens) => {
      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await this.client.beta.messages.create({
          model: this.model,
          max_tokens: maxTokens,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'medium' },
          system,
          messages: [{ role: 'user', content: user }],
        });
      } catch (error) {
        if (error instanceof Anthropic.RateLimitError) throw new AiProviderError('Claude rate limit reached', true, 'AI_RATE_LIMIT');
        if (error instanceof Anthropic.AuthenticationError) throw new AiProviderError('Claude API key is invalid', false, 'AI_AUTH');
        if (error instanceof Anthropic.BadRequestError) throw new AiProviderError(`Claude rejected the request: ${error.message}`, false, 'AI_BAD_REQUEST');
        if (error instanceof Anthropic.APIConnectionTimeoutError) throw new AiProviderError('Claude request timed out', true, 'AI_TIMEOUT');
        if (error instanceof Anthropic.APIConnectionError) throw new AiProviderError('Could not reach the Claude API', true, 'AI_UNREACHABLE');
        if (error instanceof Anthropic.APIError) throw new AiProviderError(`Claude API error ${error.status}`, (error.status ?? 500) >= 500, 'AI_HTTP_ERROR');
        throw error;
      }
      if (message.stop_reason === 'refusal') {
        throw new AiProviderError('The AI declined to process this material', false, 'AI_REFUSAL');
      }
      if (message.stop_reason === 'max_tokens') throw new AiProviderError('AI response was cut off (token limit)', false, 'AI_TRUNCATED');
      const text = message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      if (!text) throw new AiProviderError('Claude returned an empty response', true, 'AI_EMPTY');
      return text;
    }, request);
  }
}
