import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from '../config/env.js';
import { AiUsageDay } from '../models/index.js';
import { inc } from './metrics.js';
import { AiOutputError, AiProviderError, type AiUsage, type ImageGenerationProvider, type SpeechProvider, type StructuredRequest, type TextGenerationProvider } from '../ai/types.js';

export const AI_DAILY_LIMIT = 'AI_DAILY_LIMIT';

const today = () => new Date().toISOString().slice(0, 10);

/** Optional daily token limit (input + output tokens); 0 or unset = no limit. Read here so config stays untouched. */
function tokenLimit(): number {
  const n = Number(process.env.AI_DAILY_TOKEN_LIMIT ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

const limits = () => ({ calls: env.AI_DAILY_CALL_LIMIT, chars: env.AI_DAILY_CHAR_LIMIT, tokens: tokenLimit() });

export async function usageToday(ownerId: string) {
  const row = await AiUsageDay.findOne({ ownerId, day: today() }).lean();
  return {
    day: today(),
    calls: row?.calls ?? 0,
    chars: (row?.inputChars ?? 0) + (row?.outputChars ?? 0),
    tokens: {
      input: row?.inputTokens ?? 0,
      output: row?.outputTokens ?? 0,
      cacheRead: row?.cacheReadTokens ?? 0,
      cacheWrite: row?.cacheWriteTokens ?? 0,
    },
    failedCalls: row?.failedCalls ?? 0,
    imageCalls: row?.imageCalls ?? 0,
    speechCalls: row?.speechCalls ?? 0,
    limits: limits(),
  };
}

const limitError = () => new AiProviderError('You have reached today’s AI usage limit. It resets at midnight UTC.', false, AI_DAILY_LIMIT);

/** Non-atomic check, kept for callers that only want to know. Use `reserveCall` before spending. */
export async function assertBudget(ownerId: string) {
  const u = await usageToday(ownerId);
  const l = u.limits;
  const over =
    (l.calls > 0 && u.calls >= l.calls) || (l.chars > 0 && u.chars >= l.chars) || (l.tokens > 0 && u.tokens.input + u.tokens.output >= l.tokens);
  if (over) throw limitError();
}

const sum = (...fields: string[]) => ({ $add: fields.map((f) => ({ $ifNull: [`$${f}`, 0] })) });

/**
 * Atomically reserves one call against today's budget: the counter is only
 * incremented when the row is still under every limit, so concurrent calls
 * cannot all pass a check-then-call race. Throws AI_DAILY_LIMIT when over.
 */
export async function reserveCall(ownerId: string): Promise<void> {
  const day = today();
  const l = limits();
  // Make sure today's row exists (a concurrent insert may win the unique index; that is fine).
  await AiUsageDay.updateOne({ ownerId, day }, { $setOnInsert: { calls: 0 } }, { upsert: true }).catch((err: { code?: number }) => {
    if (err?.code !== 11000) throw err;
  });
  const under: Record<string, unknown>[] = [];
  if (l.chars > 0) under.push({ $lt: [sum('inputChars', 'outputChars'), l.chars] });
  if (l.tokens > 0) under.push({ $lt: [sum('inputTokens', 'outputTokens'), l.tokens] });
  const filter: Record<string, unknown> = { ownerId, day };
  if (l.calls > 0) filter.calls = { $lt: l.calls };
  if (under.length) filter.$expr = { $and: under };
  const res = await AiUsageDay.updateOne(filter, { $inc: { calls: 1 } });
  if (res.modifiedCount === 0) throw limitError();
}

/** Map keys cannot contain "." or start with "$". */
const modelKey = (model: string) => model.replace(/[.$]/g, '_').slice(0, 100) || 'unknown';

export interface RecordOptions {
  /** Calls already counted by `reserveCall` (not counted again). */
  reservedCalls?: number;
  failed?: boolean;
  imageCalls?: number;
  speechCalls?: number;
  speechChars?: number;
}

export async function recordUsage(ownerId: string, usage: AiUsage, options: RecordOptions = {}) {
  const inc: Record<string, number> = {
    calls: Math.max(0, usage.calls - (options.reservedCalls ?? 0)),
    inputChars: usage.inputChars,
    outputChars: usage.outputChars,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
    failedCalls: options.failed ? 1 : 0,
    imageCalls: options.imageCalls ?? 0,
    speechCalls: options.speechCalls ?? 0,
    speechChars: options.speechChars ?? 0,
  };
  if (usage.model) {
    const key = `byModel.${modelKey(usage.model)}`;
    inc[`${key}.calls`] = usage.calls;
    inc[`${key}.inputTokens`] = usage.inputTokens ?? 0;
    inc[`${key}.outputTokens`] = usage.outputTokens ?? 0;
    inc[`${key}.cacheReadTokens`] = usage.cacheReadTokens ?? 0;
    inc[`${key}.cacheWriteTokens`] = usage.cacheWriteTokens ?? 0;
  }
  await AiUsageDay.updateOne({ ownerId, day: today() }, { $inc: inc }, { upsert: true });
}

/** Usage attached to a failed call (repair attempts, truncated answers...) so it is still counted. */
function usageOf(err: unknown): AiUsage | undefined {
  if (err instanceof AiProviderError || err instanceof AiOutputError) return err.usage;
  return undefined;
}

/**
 * Wraps a provider so every call reserves budget atomically first and is
 * recorded afterwards (in `finally`, so failed but paid calls count too).
 * The offline mock is counted but never limited.
 */
export function metered(provider: TextGenerationProvider, ownerId: string): TextGenerationProvider {
  const free = provider.name === 'mock';
  return {
    name: provider.name,
    model: provider.model,
    ...(provider.withModel ? { withModel: (model: string) => metered(provider.withModel!(model), ownerId) } : {}),
    async generateStructured<T>(request: StructuredRequest<T>) {
      if (!free) await reserveCall(ownerId);
      let usage: AiUsage | undefined;
      let failed = false;
      const started = process.hrtime.bigint();
      try {
        const result = await aiOwnerScope.run(ownerId, () => provider.generateStructured(request));
        usage = result.usage;
        return result;
      } catch (err) {
        failed = true;
        usage = usageOf(err);
        throw err;
      } finally {
        inc('cyberlearn_ai_calls_total', { provider: provider.name, task: request.task, outcome: failed ? 'error' : 'ok' });
        inc('cyberlearn_ai_seconds_sum', { provider: provider.name }, Number(process.hrtime.bigint() - started) / 1e9);
        const counted = usage ?? { calls: free ? 0 : 1, inputChars: 0, outputChars: 0, model: provider.model };
        await recordUsage(ownerId, counted, { reservedCalls: free ? 0 : 1, failed }).catch(() => undefined);
      }
    },
  };
}

/* ---------------------------------------------------------------------------
 * Image and speech calls do not receive an owner id, so they are attributed to
 * the owner of the surrounding async scope (`runWithAiOwner`).
 * ------------------------------------------------------------------------ */

const aiOwnerScope = new AsyncLocalStorage<string>();

/** Runs `fn` with AI image/speech calls billed to `ownerId`. */
export function runWithAiOwner<T>(ownerId: string, fn: () => T): T {
  return aiOwnerScope.run(ownerId, fn);
}

export function currentAiOwner(): string | undefined {
  return aiOwnerScope.getStore();
}

/** Free, offline providers: never limited or counted. */
const FREE_PROVIDERS = new Set(['mock', 'placeholder', 'browser']);

export function meteredImageProvider(provider: ImageGenerationProvider, ownerOverride?: string): ImageGenerationProvider {
  if (FREE_PROVIDERS.has(provider.name)) return provider;
  return {
    name: provider.name,
    model: provider.model,
    async generateImage(input) {
      const ownerId = ownerOverride ?? currentAiOwner();
      if (!ownerId) return provider.generateImage(input);
      await reserveCall(ownerId);
      let failed = false;
      try {
        return await provider.generateImage(input);
      } catch (err) {
        failed = true;
        throw err;
      } finally {
        await recordUsage(ownerId, { calls: 1, inputChars: input.prompt.length, outputChars: 0, model: provider.model }, { reservedCalls: 1, failed, imageCalls: 1 }).catch(
          () => undefined,
        );
      }
    },
  };
}

export function meteredSpeechProvider(provider: SpeechProvider, ownerOverride?: string): SpeechProvider {
  if (FREE_PROVIDERS.has(provider.name) || !provider.producesAudio) return provider;
  return {
    name: provider.name,
    producesAudio: provider.producesAudio,
    async synthesize(input) {
      const ownerId = ownerOverride ?? currentAiOwner();
      if (!ownerId) return provider.synthesize(input);
      await reserveCall(ownerId);
      let failed = false;
      try {
        return await provider.synthesize(input);
      } catch (err) {
        failed = true;
        throw err;
      } finally {
        await recordUsage(ownerId, { calls: 1, inputChars: input.text.length, outputChars: 0 }, { reservedCalls: 1, failed, speechCalls: 1, speechChars: input.text.length }).catch(
          () => undefined,
        );
      }
    },
  };
}
