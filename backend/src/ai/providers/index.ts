import { env } from '../../config/env.js';
import { meteredImageProvider, meteredSpeechProvider } from '../../services/aiBudget.js';
import type { ImageGenerationProvider, SpeechProvider, TextGenerationProvider } from '../types.js';
import { AnthropicTextProvider } from './anthropic.js';
import { MockTextProvider } from './mock.js';
import { OpenAICompatibleImageProvider, OpenAICompatibleSpeechProvider, OpenAICompatibleTextProvider } from './openaiCompatible.js';
import { BrowserSpeechProvider, PlaceholderImageProvider } from './placeholder.js';

/** Provider selection is configuration only, so services can be swapped without code changes (spec 11). */
let text: TextGenerationProvider | undefined;
let image: ImageGenerationProvider | undefined;
let speech: SpeechProvider | undefined;

export function textProvider(): TextGenerationProvider {
  text ??=
    env.AI_TEXT_PROVIDER === 'anthropic'
      ? new AnthropicTextProvider()
      : env.AI_TEXT_PROVIDER === 'openai-compatible'
        ? new OpenAICompatibleTextProvider()
        : new MockTextProvider();
  return text;
}

/**
 * Paid image/speech calls are metered against the daily AI budget of the owner of the
 * surrounding scope (`runWithAiOwner` in services/aiBudget.ts); free offline providers are not.
 */
export function imageProvider(): ImageGenerationProvider {
  image ??= meteredImageProvider(rawImage());
  return image;
}

/** The image provider with calls billed to `ownerId` (no async scope needed). */
export function imageProviderFor(ownerId: string): ImageGenerationProvider {
  return meteredImageProvider(rawImage(), ownerId);
}

/** Offline fallback used when the configured image provider fails, so a lesson is never left without its visual. */
export const fallbackImageProvider = new PlaceholderImageProvider();

export function speechProvider(): SpeechProvider {
  speech ??= meteredSpeechProvider(rawSpeech());
  return speech;
}

/** The speech provider with calls billed to `ownerId` (no async scope needed). */
export function speechProviderFor(ownerId: string): SpeechProvider {
  return meteredSpeechProvider(rawSpeech(), ownerId);
}

let rawImageProvider: ImageGenerationProvider | undefined;
let rawSpeechProvider: SpeechProvider | undefined;
function rawImage(): ImageGenerationProvider {
  rawImageProvider ??= env.AI_IMAGE_PROVIDER === 'openai-compatible' ? new OpenAICompatibleImageProvider() : new PlaceholderImageProvider();
  return rawImageProvider;
}
function rawSpeech(): SpeechProvider {
  rawSpeechProvider ??= env.AI_SPEECH_PROVIDER === 'openai-compatible' ? new OpenAICompatibleSpeechProvider() : new BrowserSpeechProvider();
  return rawSpeechProvider;
}

/** Test hook. */
export function setProvidersForTesting(p: { text?: TextGenerationProvider; image?: ImageGenerationProvider; speech?: SpeechProvider }) {
  if (p.text) text = p.text;
  if (p.image) image = rawImageProvider = p.image;
  if (p.speech) speech = rawSpeechProvider = p.speech;
}
