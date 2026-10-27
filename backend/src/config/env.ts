import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
// backend/.env takes priority, then the repository-root .env.
for (const file of [path.resolve(here, '../../.env'), path.resolve(here, '../../../.env')]) {
  dotenv.config({ path: file, quiet: true });
}

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  APP_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/cyberlearn'),
  REDIS_URL: z.string().optional().default(''),
  RUN_WORKER_IN_PROCESS: bool,
  SESSION_SECRET: z.string().optional().default(''),
  /** Optional dedicated key for encrypting stored API keys (falls back to SESSION_SECRET). */
  SECRETS_KEY: z.string().optional().default(''),
  /** Where the Ollama preset connects (http://host.docker.internal:11434/v1 from Docker). */
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434/v1'),
  COOKIE_SECURE: bool,

  AI_TEXT_PROVIDER: z.enum(['mock', 'openai-compatible', 'anthropic']).default('mock'),
  AI_TEXT_BASE_URL: z.string().optional().default(''),
  AI_TEXT_API_KEY: z.string().optional().default(''),
  AI_TEXT_MODEL: z.string().optional().default(''),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),

  AI_IMAGE_PROVIDER: z.enum(['placeholder', 'openai-compatible']).default('placeholder'),
  AI_IMAGE_BASE_URL: z.string().optional().default(''),
  AI_IMAGE_API_KEY: z.string().optional().default(''),
  AI_IMAGE_MODEL: z.string().optional().default(''),

  AI_SPEECH_PROVIDER: z.enum(['browser', 'openai-compatible']).default('browser'),
  AI_SPEECH_BASE_URL: z.string().optional().default(''),
  AI_SPEECH_API_KEY: z.string().optional().default(''),
  AI_SPEECH_MODEL: z.string().optional().default(''),
  AI_SPEECH_VOICE: z.string().optional().default(''),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  STORAGE_ENDPOINT: z.string().optional().default(''),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_BUCKET: z.string().optional().default(''),
  STORAGE_ACCESS_KEY: z.string().optional().default(''),
  STORAGE_SECRET_KEY: z.string().optional().default(''),

  MAX_CONCURRENT_GENERATIONS_PER_USER: z.coerce.number().int().positive().default(2),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

const raw = parsed.data;

if (raw.NODE_ENV === 'production' && raw.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET must be at least 32 characters in production.');
  process.exit(1);
}

export const env = {
  ...raw,
  // A fixed development secret keeps sessions across restarts; production must set its own.
  SESSION_SECRET: raw.SESSION_SECRET || 'development-only-secret-change-me-0123456789',
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  allowedOrigins: raw.APP_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
};

export type Env = typeof env;
