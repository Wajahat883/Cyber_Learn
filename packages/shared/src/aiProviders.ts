import { z } from 'zod';

/**
 * AI providers a user can connect from Settings. Every text provider except
 * Claude speaks the OpenAI-compatible chat-completions protocol, so one adapter
 * covers them all. Base URLs are fixed per preset (only "custom" takes a URL).
 */
export const AI_PROVIDER_IDS = ['opencode', 'openai', 'groq', 'gemini', 'anthropic', 'ollama', 'custom'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export interface AiProviderPreset {
  id: AiProviderId;
  label: string;
  protocol: 'openai-compatible' | 'anthropic';
  baseUrl: string;
  needsKey: boolean;
  keyUrl: string;
  note: string;
  suggestedModels: string[];
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'opencode',
    label: 'OpenCode',
    protocol: 'openai-compatible',
    baseUrl: 'https://opencode.ai/inference/openai/v1',
    needsKey: true,
    keyUrl: 'https://opencode.ai',
    note: 'Pay-as-you-go gateway to many models. Free models only work inside OpenCode itself.',
    suggestedModels: ['deepseek-v4-pro', 'kimi-k2.6', 'glm-5.3', 'qwen3.8-max'],
  },
  {
    id: 'groq',
    label: 'Groq',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    note: 'Very fast; has a free tier with rate limits.',
    suggestedModels: [],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    protocol: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Google AI Studio key; has a free tier with rate limits.',
    suggestedModels: [],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'Paid API key from the OpenAI platform.',
    suggestedModels: [],
  },
  {
    id: 'anthropic',
    label: 'Claude',
    protocol: 'anthropic',
    baseUrl: '',
    needsKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Anthropic API key. Leave the model empty to use claude-opus-5-5.',
    suggestedModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    protocol: 'openai-compatible',
    baseUrl: '',
    needsKey: false,
    keyUrl: 'https://ollama.com/download',
    note: 'Free and private: runs a model on your own computer. Install Ollama and pull a model first.',
    suggestedModels: ['llama3.1', 'qwen2.5', 'mistral'],
  },
  {
    id: 'custom',
    label: 'Other (OpenAI-compatible)',
    protocol: 'openai-compatible',
    baseUrl: '',
    needsKey: false,
    keyUrl: '',
    note: 'Any HTTPS endpoint that implements /chat/completions.',
    suggestedModels: [],
  },
];

export const presetById = (id: string) => AI_PROVIDER_PRESETS.find((p) => p.id === id);

export const AiSettingsInputSchema = z.object({
  provider: z.enum(AI_PROVIDER_IDS),
  model: z.string().trim().max(120).default(''),
  /** Only for "custom". */
  baseUrl: z.string().trim().max(300).default(''),
  /** Omit to keep the key that is already saved. */
  apiKey: z.string().trim().max(500).optional(),
});

export type AiSettingsInput = z.infer<typeof AiSettingsInputSchema>;

