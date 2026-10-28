import { lookup } from 'node:dns/promises';
import { metered } from '../../services/aiBudget.js';
import { AI_PROVIDER_PRESETS, presetById, type AiProviderId } from '@cyberlearn/shared';
import { env } from '../../config/env.js';
import { User } from '../../models/index.js';
import { decryptSecret } from '../../utils/crypto.js';
import { badRequest } from '../../utils/errors.js';
import { isPublicAddress, markUntrustedEndpoint, providerFetch } from '../../utils/safeFetch.js';
import { AiProviderError, type TextGenerationProvider } from '../types.js';
import { AnthropicTextProvider } from './anthropic.js';
import { textProvider } from './index.js';
import { OpenAICompatibleTextProvider } from './openaiCompatible.js';

export interface ProviderConfig {
  provider: AiProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
  fallbackModels?: string[];
}

/**
 * "Custom" endpoints must be public HTTPS, so a user cannot make the server
 * call internal services (SSRF). Presets have fixed, known URLs. This check
 * gives a friendly error up front; the real enforcement happens at connect
 * time in utils/safeFetch.ts (pinned DNS answer, no redirects).
 */
async function assertPublicHttps(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest('Enter a valid URL, e.g. https://api.example.com/v1');
  }
  if (parsed.protocol !== 'https:') throw badRequest('Custom endpoints must use https://');
  const addresses = await lookup(parsed.hostname.replace(/^\[|\]$/g, ''), { all: true }).catch(() => []);
  if (!addresses.length) throw badRequest('That host name could not be resolved');
  if (addresses.some((a) => !isPublicAddress(a.address))) throw badRequest('Custom endpoints must be public internet addresses');
}

export async function resolveBaseUrl(provider: AiProviderId, customUrl: string): Promise<string> {
  if (provider === 'ollama') return env.OLLAMA_BASE_URL;
  // Ollama is the operator's own endpoint from .env (may be localhost) and stays trusted.
  if (provider === 'custom') {
    await assertPublicHttps(customUrl);
    const base = customUrl.replace(/\/+$/, '');
    markUntrustedEndpoint(base);
    return base;
  }
  const base = presetById(provider)?.baseUrl ?? '';
  markUntrustedEndpoint(base);
  return base;
}

export function buildProvider(cfg: ProviderConfig): TextGenerationProvider {
  const preset = presetById(cfg.provider);
  if (!preset) throw badRequest('Unknown provider');
  if (preset.needsKey && !cfg.apiKey) throw badRequest(`${preset.label} needs an API key`);
  if (preset.protocol === 'anthropic') return new AnthropicTextProvider({ apiKey: cfg.apiKey, model: cfg.model || undefined });
  if (!cfg.model) throw badRequest('Choose a model');
  return new OpenAICompatibleTextProvider(cfg.baseUrl, cfg.apiKey, cfg.model, cfg.fallbackModels);
}

/** Lists model ids the credentials can use, for the Settings model picker. */
export async function listModels(cfg: ProviderConfig): Promise<string[]> {
  const preset = presetById(cfg.provider);
  if (preset?.protocol === 'anthropic') return new AnthropicTextProvider({ apiKey: cfg.apiKey }).listModels();
  let res: Response;
  try {
    res = await providerFetch(`${cfg.baseUrl}/models`, { headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new AiProviderError(cfg.provider === 'ollama' ? `Ollama is not reachable at ${cfg.baseUrl}. Is it running?` : 'The provider could not be reached', true, 'AI_UNREACHABLE');
  }
  if (!res.ok) throw new AiProviderError(res.status === 401 || res.status === 403 ? 'The API key was rejected' : `The provider returned ${res.status}`, false, `AI_HTTP_${res.status}`);
  const json = (await res.json()) as { data?: { id: string }[]; models?: { name: string }[] };
  const ids = (json.data?.map((m) => m.id) ?? json.models?.map((m) => m.name) ?? []).map((id) => id.replace(/^models\//, ''));
  return [...new Set(ids)].sort();
}

const cache = new Map<string, TextGenerationProvider>();

/**
 * The text provider for a user: the one they connected in Settings, otherwise
 * the server default from .env (or the offline provider).
 */
export async function textProviderFor(ownerId: string): Promise<TextGenerationProvider> {
  return metered(await resolveTextProvider(ownerId), ownerId);
}

async function resolveTextProvider(ownerId: string): Promise<TextGenerationProvider> {
  const user = await User.findById(ownerId).select('+aiSettings.apiKeyEnc').lean();
  const s = user?.aiSettings;
  if (!s?.provider) return textProvider();
  const key = `${ownerId}:${s.updatedAt ? new Date(s.updatedAt).getTime() : 0}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const apiKey = s.apiKeyEnc ? decryptSecret(s.apiKeyEnc) : '';
  if (apiKey === null) throw new AiProviderError('Your saved API key can no longer be read. Re-enter it in Settings.', false, 'AI_KEY_UNREADABLE');
  const providerId = s.provider as AiProviderId;
  const provider = buildProvider({ provider: providerId, model: s.model, baseUrl: await resolveBaseUrl(providerId, s.baseUrl), apiKey, fallbackModels: s.fallbackModels ?? [] });
  for (const k of cache.keys()) if (k.startsWith(`${ownerId}:`)) cache.delete(k);
  cache.set(key, provider);
  return provider;
}

export { AI_PROVIDER_PRESETS };
