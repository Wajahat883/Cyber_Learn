import { env } from '../../config/env.js';
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

export function imageProvider(): ImageGenerationProvider {
  image ??= env.AI_IMAGE_PROVIDER === 'openai-compatible' ? new OpenAICompatibleImageProvider() : new PlaceholderImageProvider();
  return image;
}

/** Offline fallback used when the configured image provider fails, so a lesson is never left without its visual. */
export const fallbackImageProvider = new PlaceholderImageProvider();

export function speechProvider(): SpeechProvider {
  speech ??= env.AI_SPEECH_PROVIDER === 'openai-compatible' ? new OpenAICompatibleSpeechProvider() : new BrowserSpeechProvider();
  return speech;
}

/** Test hook. */
export function setProvidersForTesting(p: { text?: TextGenerationProvider; image?: ImageGenerationProvider; speech?: SpeechProvider }) {
  if (p.text) text = p.text;
  if (p.image) image = p.image;
  if (p.speech) speech = p.speech;
}
