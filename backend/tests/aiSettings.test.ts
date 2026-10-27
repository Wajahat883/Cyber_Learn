import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { drainInlineJobs } from '../src/jobs/queues.js';
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
});
