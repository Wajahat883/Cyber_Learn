import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { drainInlineJobs } from '../src/jobs/queues.js';
import { env } from '../src/config/env.js';
import { metered } from '../src/services/aiBudget.js';
import type { TextGenerationProvider } from '../src/ai/types.js';
import { SAMPLE_TEXT, signUp } from './helpers.js';

// A fake local Ollama (OpenAI-compatible) on the port configured in tests/setup.ts.
let calls: { path: string; auth?: string; body: { model?: string } }[] = [];
let reply = '{"answer":"OK","supported":true,"citedChunks":[]}';
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    calls.push({ path: req.url ?? '', auth: req.headers.authorization, body: raw ? JSON.parse(raw) : {} });
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url?.endsWith('/models')) res.end(JSON.stringify({ object: 'list', data: [{ id: 'llama3.1' }, { id: 'qwen2.5' }] }));
    else res.end(JSON.stringify({ choices: [{ message: { content: reply }, finish_reason: 'stop' }] }));
  });
});
beforeAll(() => new Promise<void>((r) => server.listen(11999, '127.0.0.1', () => r())));
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('AI provider settings', () => {
  it('lists presets and starts on the server default', async () => {
    const s = await signUp();
    const res = await s.agent.get('/api/v1/account/ai').expect(200);
    expect(res.body.settings).toBeNull();
    expect(res.body.presets.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining(['opencode', 'groq', 'gemini', 'openai', 'anthropic', 'ollama']));
  });

  it('blocks custom endpoints that point at internal addresses (SSRF)', async () => {
    const s = await signUp();
    for (const baseUrl of ['http://example.com/v1', 'https://127.0.0.1/v1', 'https://localhost/v1', 'https://10.0.0.5/v1']) {
      const res = await s.agent.put('/api/v1/account/ai').set('x-csrf-token', s.csrf).send({ provider: 'custom', baseUrl, model: 'x', apiKey: 'k' });
      expect(res.status, baseUrl).toBe(400);
    }
    await s.agent.put('/api/v1/account/ai').set('x-csrf-token', s.csrf).send({ provider: 'opencode', model: 'deepseek-v4-pro' }).expect(400);
  });

  it('connects a local model: list models, test, save, and generate with it', async () => {
    const s = await signUp();
    calls = [];
    const models = await s.agent.post('/api/v1/account/ai/models').set('x-csrf-token', s.csrf).send({ provider: 'ollama' }).expect(200);
    expect(models.body.models).toEqual(['llama3.1', 'qwen2.5']);
    const test = await s.agent.post('/api/v1/account/ai/test').set('x-csrf-token', s.csrf).send({ provider: 'ollama', model: 'llama3.1' }).expect(200);
    expect(test.body.ok).toBe(true);
    expect(calls.at(-1)?.body.model).toBe('llama3.1');
    await s.agent.put('/api/v1/account/ai').set('x-csrf-token', s.csrf).send({ provider: 'ollama', model: 'llama3.1' }).expect(200);

    // Generation now goes to the user's provider (this fake one replies with the wrong JSON, so it fails at analysis).
    calls = [];
    const p = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).send({ title: 'SIEM' });
    const src = await s.agent.post(`/api/v1/projects/${p.body.project._id}/sources/text`).set('x-csrf-token', s.csrf).send({ title: 'n', text: SAMPLE_TEXT });
    const gen = await s.agent.post(`/api/v1/projects/${p.body.project._id}/generations`).set('x-csrf-token', s.csrf).send({ sourceIds: [src.body.source._id], autoContinue: true }).expect(202);
    await drainInlineJobs();
    const done = (await s.agent.get(`/api/v1/generations/${gen.body.generation._id}`)).body.generation;
    expect(done.status).toBe('failed');
    expect(calls.some((c) => c.path.endsWith('/chat/completions'))).toBe(true);

    const overview = (await s.agent.get('/api/v1/account/overview')).body;
    expect(overview.providers.text.source).toBe('yours');
    await s.agent.delete('/api/v1/account/ai').set('x-csrf-token', s.csrf).expect(204);
    expect((await s.agent.get('/api/v1/account/ai')).body.settings).toBeNull();
  });

  it('saves OpenRouter with fallback models and caps the list', async () => {
    const s = await signUp();
    const fallbackModels = ['vendor/model-a:free', 'vendor/model-b:free'];
    await s.agent.put('/api/v1/account/ai').set('x-csrf-token', s.csrf).send({ provider: 'openrouter', model: 'vendor/main', apiKey: 'sk-or-1234', fallbackModels }).expect(200);
    const got = await s.agent.get('/api/v1/account/ai').expect(200);
    expect(got.body.settings).toMatchObject({ provider: 'openrouter', model: 'vendor/main', fallbackModels });
    const tooMany = Array.from({ length: 6 }, (_, i) => `vendor/m${i}:free`);
    await s.agent.put('/api/v1/account/ai').set('x-csrf-token', s.csrf).send({ provider: 'openrouter', model: 'vendor/main', fallbackModels: tooMany }).expect(400);
  });

  it('stores API keys encrypted and never returns or exports them', async () => {
    const s = await signUp();
    const secret = 'sk-test-SUPERSECRET-1234';
    await s.agent.put('/api/v1/account/ai').set('x-csrf-token', s.csrf).send({ provider: 'groq', model: 'some-model', apiKey: secret }).expect(200);
    const stored = await mongoose.connection.db!.collection('users').findOne({ _id: new mongoose.Types.ObjectId(s.user.id) });
    expect(stored?.aiSettings.apiKeyEnc).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain(secret);
    const got = await s.agent.get('/api/v1/account/ai').expect(200);
    expect(got.body.settings.keyHint).toBe('••••1234');
    expect(JSON.stringify(got.body)).not.toContain('SUPERSECRET');
    const backup = await s.agent.get('/api/v1/account/export').expect(200);
    expect(backup.text).not.toContain('SUPERSECRET');
    expect(backup.text).not.toContain('apiKeyEnc');
    // Changing only the model keeps the saved key.
    await s.agent.put('/api/v1/account/ai').set('x-csrf-token', s.csrf).send({ provider: 'groq', model: 'other-model' }).expect(200);
    expect((await s.agent.get('/api/v1/account/ai')).body.settings.keyHint).toBe('••••1234');
  });

  it('enforces a per-user daily AI budget and reports usage', async () => {
    const s = await signUp();
    const fake: TextGenerationProvider = {
      name: 'openai-compatible',
      model: 'm',
      generateStructured: async <T,>() => ({ data: {} as T, usage: { calls: 1, inputChars: 1000, outputChars: 200, inputTokens: 250, outputTokens: 50, model: 'm' } }),
    };
    const provider = metered(fake, s.user.id);
    const before = env.AI_DAILY_CALL_LIMIT;
    env.AI_DAILY_CALL_LIMIT = 2;
    try {
      const req = { task: 'answer' as const, instructions: '', content: '', schema: {} as never };
      await provider.generateStructured(req);
      await provider.generateStructured(req);
      await expect(provider.generateStructured(req)).rejects.toMatchObject({ code: 'AI_DAILY_LIMIT', retryable: false });
      // The offline mock is never limited.
      await expect(metered({ ...fake, name: 'mock' }, s.user.id).generateStructured(req)).resolves.toBeTruthy();
      const usage = (await s.agent.get('/api/v1/account/ai').expect(200)).body.usage;
      expect(usage.calls).toBe(3);
      expect(usage.chars).toBe(3600);
      expect(usage.limits.calls).toBe(2);
      // Real token counts are recorded alongside characters.
      expect(usage.tokens).toMatchObject({ input: 750, output: 150 });
    } finally {
      env.AI_DAILY_CALL_LIMIT = before;
    }
  });

  it('still enforces the daily character limit, and counts failed calls', async () => {
    const s = await signUp();
    const before = env.AI_DAILY_CHAR_LIMIT;
    env.AI_DAILY_CHAR_LIMIT = 1500;
    try {
      const req = { task: 'answer' as const, instructions: '', content: '', schema: {} as never };
      const failing: TextGenerationProvider = {
        name: 'openai-compatible',
        model: 'm',
        generateStructured: async () => {
          throw new Error('boom');
        },
      };
      const ok: TextGenerationProvider = { ...failing, generateStructured: async <T,>() => ({ data: {} as T, usage: { calls: 1, inputChars: 1400, outputChars: 200 } }) };
      await expect(metered(failing, s.user.id).generateStructured(req)).rejects.toThrow('boom');
      await metered(ok, s.user.id).generateStructured(req);
      await expect(metered(ok, s.user.id).generateStructured(req)).rejects.toMatchObject({ code: 'AI_DAILY_LIMIT' });
      const usage = (await s.agent.get('/api/v1/account/ai').expect(200)).body.usage;
      expect(usage.calls).toBe(2);
      expect(usage.failedCalls).toBe(1);
      expect(usage.chars).toBe(1600);
    } finally {
      env.AI_DAILY_CHAR_LIMIT = before;
    }
  });
});
