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
  /** Enables GET /api/v1/metrics (Prometheus format) for scrapers sending "Authorization: Bearer <token>". */
  METRICS_TOKEN: z.string().optional().default(''),
  /** Standalone worker only: serve its metrics on this port (0 = off). */
  METRICS_PORT: z.coerce.number().int().nonnegative().default(0),

  AI_TEXT_PROVIDER: z.enum(['mock', 'openai-compatible', 'anthropic']).default('mock'),
  AI_TEXT_BASE_URL: z.string().optional().default(''),
  AI_TEXT_API_KEY: z.string().optional().default(''),
  AI_TEXT_MODEL: z.string().optional().default(''),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  /** Per-user daily AI ceiling: model calls and characters sent + received (~4 chars per token). 0 = unlimited. */
  AI_DAILY_CALL_LIMIT: z.coerce.number().int().nonnegative().default(400),
  AI_DAILY_CHAR_LIMIT: z.coerce.number().int().nonnegative().default(4_000_000),
  // Optional; listed for documentation. The AI modules read these from process.env at call time
  // (services/aiBudget.ts, services/grading.ts, ai/embeddings.ts), so they are kept as loose strings here.
  /** Optional daily token ceiling (input + output tokens). 0 / empty = unlimited. */
  AI_DAILY_TOKEN_LIMIT: z.string().optional().default(''),
  /** true = grade open quiz answers with the AI against a rubric (falls back to word overlap). */
  AI_RUBRIC_GRADING: z.string().optional().default(''),
  /** Embeddings for Ask My Notes hybrid retrieval: 'openai-compatible' or empty (keyword/BM25 only). */
  AI_EMBEDDING_PROVIDER: z.string().optional().default(''),
  AI_EMBEDDING_BASE_URL: z.string().optional().default(''),
  AI_EMBEDDING_API_KEY: z.string().optional().default(''),
  AI_EMBEDDING_MODEL: z.string().optional().default(''),

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
  /** A queued/running generation whose heartbeat is older than this is treated as crashed and failed (retryable). */
  GENERATION_STALE_MINUTES: z.coerce.number().positive().default(10),
  /** File the standalone worker touches periodically; the container healthcheck checks its age. */
  WORKER_HEARTBEAT_FILE: z.string().default('/tmp/cyberlearn-worker-heartbeat'),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

const raw = parsed.data;

/** Secrets that were ever shipped as defaults (docs, compose) and must never sign production sessions. */
const KNOWN_DEFAULT_SECRETS = new Set([
  'local-docker-only-secret-change-me-0123456789abcdef',
  'development-only-secret-change-me-0123456789',
]);

/** Returns a problem description, or null when the secret is acceptable for production. */
export function productionSecretProblem(name: string, value: string): string | null {
  if (value.length < 32) return `${name} must be at least 32 characters in production.`;
  if (KNOWN_DEFAULT_SECRETS.has(value) || /change[-_ ]?me/i.test(value)) {
    return `${name} is a published default/placeholder value. Generate a new one (e.g. \`openssl rand -hex 32\`).`;
  }
  return null;
}

if (raw.NODE_ENV === 'production') {
  const problems = [
    productionSecretProblem('SESSION_SECRET', raw.SESSION_SECRET),
    // Stored API keys are encrypted with SECRETS_KEY; production must not derive it from the session secret.
    raw.SECRETS_KEY ? productionSecretProblem('SECRETS_KEY', raw.SECRETS_KEY) : 'SECRETS_KEY is required in production (encrypts stored AI provider API keys).',
  ].filter(Boolean);
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  if (raw.SECRETS_KEY === raw.SESSION_SECRET) console.warn('SECRETS_KEY equals SESSION_SECRET; use two independent random values.');
  if (!raw.COOKIE_SECURE) {
    console.warn('COOKIE_SECURE is false in production: session cookies will also be sent over plain HTTP. Set COOKIE_SECURE=true when serving over HTTPS.');
  }
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
