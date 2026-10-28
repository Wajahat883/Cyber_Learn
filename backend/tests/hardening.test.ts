import http from 'node:http';
import type { LookupAddress } from 'node:dns';
import { afterEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { storage } from '../src/config/storage.js';
import { drainInlineJobs } from '../src/jobs/queues.js';
import { setProvidersForTesting } from '../src/ai/providers/index.js';
import { MockTextProvider } from '../src/ai/providers/mock.js';
import { AiOutputError, type StructuredRequest, type TextGenerationProvider } from '../src/ai/types.js';
import { Generation, Lesson, Source } from '../src/models/index.js';
import { runGeneration } from '../src/services/generationPipeline.js';
import { sweepStaleGenerations } from '../src/services/generationSweeper.js';
import { sha256 } from '../src/utils/crypto.js';
import { BlockedAddressError, checkedLookup, createGuardedFetch, isPublicAddress } from '../src/utils/safeFetch.js';
import { app, SAMPLE_TEXT, signUp, type Session } from './helpers.js';

const mock = new MockTextProvider();
afterEach(() => setProvidersForTesting({ text: mock }));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function projectWithText(s: Session) {
  const p = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).send({ title: 'SIEM Architecture' }).expect(201);
  const src = await s.agent.post(`/api/v1/projects/${p.body.project._id}/sources/text`).set('x-csrf-token', s.csrf).send({ title: 'notes', text: SAMPLE_TEXT }).expect(201);
  return { projectId: p.body.project._id as string, sourceId: src.body.source._id as string };
}

async function start(s: Session, autoContinue = true) {
  const { projectId, sourceId } = await projectWithText(s);
  const res = await s.agent.post(`/api/v1/projects/${projectId}/generations`).set('x-csrf-token', s.csrf).send({ sourceIds: [sourceId], autoContinue }).expect(202);
  return { projectId, sourceId, generationId: res.body.generation._id as string };
}

const getGen = async (s: Session, id: string) => (await s.agent.get(`/api/v1/generations/${id}`).expect(200)).body.generation;
const stage = (gen: { stageResults: { stage: string; status: string; attempts: number }[] }, name: string) => gen.stageResults.find((r) => r.stage === name)!;

/** Counts structured calls per task while delegating to the offline mock. */
function countingProvider(counts: Record<string, number>, hook?: (task: string) => Promise<void> | void): TextGenerationProvider {
  return {
    name: 'counting',
    model: 'test',
    generateStructured: async <T,>(req: StructuredRequest<T>) => {
      counts[req.task] = (counts[req.task] ?? 0) + 1;
      await hook?.(req.task);
      return mock.generateStructured(req);
    },
  };
}

// ---------------------------------------------------------------- 1.2 SSRF

describe('SSRF guard for user-chosen endpoints', () => {
  it('accepts only public unicast addresses, including IPv4-mapped IPv6 forms', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '255.255.255.255', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::a00:1', '2002:7f00:1::', 'not-an-ip']) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8']) expect(isPublicAddress(ip), ip).toBe(true);
  });

  const lookupWith = (answers: () => LookupAddress[]) => {
    const lookup = checkedLookup(async () => answers());
    return (opts: { all?: boolean }) =>
      new Promise<unknown>((resolve, reject) => lookup('api.example.com', opts, (err, address) => (err ? reject(err) : resolve(address))));
  };

  it('vets the address inside the connection lookup and rejects mixed or rebinding answers', async () => {
    await expect(lookupWith(() => [{ address: '93.184.216.34', family: 4 }])({})).resolves.toBe('93.184.216.34');
    await expect(lookupWith(() => [{ address: '93.184.216.34', family: 4 }])({ all: true })).resolves.toEqual([{ address: '93.184.216.34', family: 4 }]);
    await expect(lookupWith(() => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }])({})).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(lookupWith(() => [{ address: '::ffff:169.254.169.254', family: 6 }])({})).rejects.toBeInstanceOf(BlockedAddressError);
    // DNS rebinding: public at "check" time, private at connect time. Every connect re-checks.
    let calls = 0;
    const rebinding = lookupWith(() => [{ address: calls++ === 0 ? '93.184.216.34' : '10.0.0.5', family: 4 }]);
    await expect(rebinding({})).resolves.toBe('93.184.216.34');
    await expect(rebinding({})).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it('blocks private hosts, private IP literals and redirects', async () => {
    const server = http.createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { location: '/target' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as { port: number }).port;
    try {
      const guarded = createGuardedFetch();
      await expect(guarded(`http://127.0.0.1:${port}/`)).rejects.toBeInstanceOf(BlockedAddressError);
      await expect(guarded(`http://[::ffff:127.0.0.1]:${port}/`)).rejects.toBeInstanceOf(BlockedAddressError);
      // A host name that resolves to loopback is refused at connect time.
      await expect(guarded(`http://localhost:${port}/`)).rejects.toThrow();
      // With the address check relaxed, the redirect rule alone still refuses to follow.
      const loopbackAllowed = createGuardedFetch(() => true);
      expect(await (await loopbackAllowed(`http://127.0.0.1:${port}/`)).text()).toBe('ok');
      await expect(loopbackAllowed(`http://127.0.0.1:${port}/redirect`)).rejects.toThrow();
    } finally {
      server.close();
    }
  });
});

// ---------------------------------------------------------------- 1.4 / 1.5 generations

describe('generation state transitions', () => {
  it('a double /continue only starts one pipeline', async () => {
    const s = await signUp();
    const counts: Record<string, number> = {};
    setProvidersForTesting({ text: countingProvider(counts) });
    const { generationId } = await start(s, false);
    await drainInlineJobs();
    const waiting = await getGen(s, generationId);
    expect(waiting.status).toBe('awaiting_review');
    const analysis = (await Generation.findById(generationId).lean())!.analysis;
    const [a, b] = await Promise.all([
      s.agent.post(`/api/v1/generations/${generationId}/continue`).set('x-csrf-token', s.csrf).send({ analysis }),
      s.agent.post(`/api/v1/generations/${generationId}/continue`).set('x-csrf-token', s.csrf).send({ analysis }),
    ]);
    expect([a.status, b.status].sort()).toEqual([202, 409]);
    await drainInlineJobs();
    const done = await getGen(s, generationId);
    expect(done.status).toBe('completed');
    expect(stage(done, 'lesson').attempts).toBe(1);
    expect(counts.assessment).toBe(1);
  });

  it('a double /retry only starts one pipeline, and a duplicate job exits without running', async () => {
    const s = await signUp();
    const counts: Record<string, number> = {};
    let failDiagrams = true;
    setProvidersForTesting({
      text: countingProvider(counts, (task) => {
        if (task === 'diagram' && failDiagrams) throw new AiOutputError('bad output', 'x');
      }),
    });
    const { generationId } = await start(s);
    await drainInlineJobs();
    const partial = await getGen(s, generationId);
    expect(partial.status).toBe('partially_completed');
    // 2.3: invalid model output after the repair attempt is final, not retried 3 times.
    expect(stage(partial, 'diagrams').attempts).toBe(1);

    failDiagrams = false;
    const diagramCalls = counts.diagram;
    const [a, b] = await Promise.all([
      s.agent.post(`/api/v1/generations/${generationId}/retry`).set('x-csrf-token', s.csrf).send({}),
      s.agent.post(`/api/v1/generations/${generationId}/retry`).set('x-csrf-token', s.csrf).send({}),
    ]);
    expect([a.status, b.status].sort()).toEqual([202, 409]);
    await drainInlineJobs();
    const done = await getGen(s, generationId);
    expect(done.status).toBe('completed');
    expect(stage(done, 'diagrams').attempts).toBe(2);
    expect(counts.diagram).toBeGreaterThan(diagramCalls);

    // Redelivered job for a finished run: the claim fails and nothing runs.
    const before = await Generation.findById(generationId).lean();
    await runGeneration(generationId);
    const after = await Generation.findById(generationId).lean();
    expect(after!.status).toBe('completed');
    expect(after!.updatedAt).toEqual(before!.updatedAt);
  });

  it('an explicit retry of the lesson stage rewrites the sections', async () => {
    const s = await signUp();
    const counts: Record<string, number> = {};
    setProvidersForTesting({ text: countingProvider(counts) });
    const { generationId } = await start(s);
    await drainInlineJobs();
    const first = await getGen(s, generationId);
    const lessonBefore = await Lesson.findById(first.lessonId).lean();
    const sectionCalls = counts.section;
    expect(sectionCalls).toBeGreaterThan(0);
    await s.agent.post(`/api/v1/generations/${generationId}/retry`).set('x-csrf-token', s.csrf).send({ stage: 'lesson' }).expect(202);
    await drainInlineJobs();
    const done = await getGen(s, generationId);
    expect(done.status).toBe('completed');
    expect(counts.section).toBe(sectionCalls * 2);
    const lessonAfter = await Lesson.findById(first.lessonId).lean();
    expect(lessonAfter!.version).toBeGreaterThan(lessonBefore!.version);
    expect((lessonAfter!.sections as { id: string }[]).map((x) => x.id)).toEqual((lessonBefore!.sections as { id: string }[]).map((x) => x.id));
  });

  it('sweeps a stale run so it can be retried, and does not steal a live one', async () => {
    const s = await signUp();
    const { generationId } = await start(s);
    await drainInlineJobs();
    const old = new Date(Date.now() - 60 * 60_000);
    // Simulate a worker that crashed during the narration stage.
    await Generation.updateOne(
      { _id: generationId },
      { $set: { status: 'running', heartbeatAt: old, currentStage: 'narration', 'stageResults.$[n].status': 'running', 'stageResults.$[f].status': 'pending' } },
      { arrayFilters: [{ 'n.stage': 'narration' }, { 'f.stage': 'finalize' }] },
    );
    // A live run (fresh heartbeat) is not claimable by a second job.
    await Generation.updateOne({ _id: generationId }, { $set: { heartbeatAt: new Date() } });
    await runGeneration(generationId);
    expect((await Generation.findById(generationId).lean())!.status).toBe('running');
    expect(await sweepStaleGenerations()).toBe(0);

    await Generation.updateOne({ _id: generationId }, { $set: { heartbeatAt: old } });
    expect(await sweepStaleGenerations()).toBe(1);
    const swept = await getGen(s, generationId);
    expect(swept.status).toBe('failed');
    expect(swept.errorCode).toBe('STALE_RUN');
    expect(stage(swept, 'narration').status).toBe('failed');

    await s.agent.post(`/api/v1/generations/${generationId}/retry`).set('x-csrf-token', s.csrf).send({}).expect(202);
    await drainInlineJobs();
    expect((await getGen(s, generationId)).status).toBe('completed');
  });

  it('cancelling a stale running run stops it immediately', async () => {
    const s = await signUp();
    const { generationId } = await start(s);
    await drainInlineJobs();
    await Generation.updateOne({ _id: generationId }, { $set: { status: 'running', heartbeatAt: new Date(Date.now() - 60 * 60_000) } });
    const res = await s.agent.post(`/api/v1/generations/${generationId}/cancel`).set('x-csrf-token', s.csrf).expect(200);
    expect(res.body.generation.status).toBe('cancelled');
  });

  it('deleting a project while it generates stops the pipeline and leaves nothing behind', async () => {
    const s = await signUp();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setProvidersForTesting({ text: countingProvider({}, (task) => (task === 'analyze' ? gate : undefined)) });
    const { projectId, generationId } = await start(s);
    for (let i = 0; i < 100 && (await Generation.findById(generationId).lean())?.status !== 'running'; i++) await sleep(20);
    expect((await Generation.findById(generationId).lean())?.status).toBe('running');

    await s.agent.delete(`/api/v1/projects/${projectId}`).set('x-csrf-token', s.csrf).expect(204);
    release();
    await drainInlineJobs();
    expect(await Generation.countDocuments({ projectId })).toBe(0);
    expect(await Lesson.countDocuments({ projectId })).toBe(0);
  });
});

// ---------------------------------------------------------------- 2.6

describe('sessions, uploads and data exposure', () => {
  it('logout revokes the session token, not just the cookie', async () => {
    const s = await signUp();
    const login = await s.agent.post('/api/v1/auth/login').set('x-csrf-token', s.csrf).send({ email: s.user.email, password: 'correct horse battery' }).expect(200);
    const cookie = ([] as string[])
      .concat(login.headers['set-cookie'])
      .map((c) => c.split(';')[0])
      .find((c) => c.startsWith('cl_session='))!;
    await request(app).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    await s.agent.post('/api/v1/auth/logout').set('x-csrf-token', s.csrf).expect(204);
    await request(app).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
  });

  it('a failed upload can be uploaded again and its stored file is removed', async () => {
    const s = await signUp();
    const p = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).send({ title: 'Uploads' }).expect(201);
    const url = `/api/v1/projects/${p.body.project._id}/sources/upload`;

    // A "PDF" with a valid signature but a broken body: friendly message, no parser internals.
    const broken = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >>\ngarbage garbage');
    const first = await s.agent.post(url).set('x-csrf-token', s.csrf).attach('file', broken, 'broken.pdf').expect(400);
    expect(first.body.error.message).toMatch(/could not be read|password/i);
    const second = await s.agent.post(url).set('x-csrf-token', s.csrf).attach('file', broken, 'broken.pdf').expect(400);
    expect(second.body.duplicate).toBeUndefined();
    expect(await Source.countDocuments({ projectId: p.body.project._id, contentHash: sha256(broken) })).toBe(1);

    // An earlier failed attempt for the same content is replaced, not returned as a duplicate.
    const body = Buffer.from(SAMPLE_TEXT);
    const staleKey = `users/${s.user.id}/projects/${p.body.project._id}/sources/stale-notes.md`;
    await storage.put(staleKey, body, 'text/markdown');
    const failed = await Source.create({
      ownerId: s.user.id,
      projectId: p.body.project._id,
      title: 'notes',
      sourceType: 'upload',
      mimeType: 'text/markdown',
      contentHash: sha256(body),
      storageKey: staleKey,
      extractionStatus: 'failed',
      extractionError: 'boom',
    });
    const ok = await s.agent.post(url).set('x-csrf-token', s.csrf).attach('file', body, 'notes.md').expect(201);
    expect(ok.body.duplicate).toBe(false);
    expect(ok.body.source.extractionStatus).toBe('completed');
    expect(await Source.exists({ _id: failed._id })).toBeNull();
    await expect(storage.get(staleKey)).rejects.toThrow();
    // Now that a completed copy exists, the same file is a duplicate.
    expect((await s.agent.post(url).set('x-csrf-token', s.csrf).attach('file', body, 'notes.md').expect(200)).body.duplicate).toBe(true);
  });

  it('never returns storage keys and keeps presentations, exports and assets private', async () => {
    const owner = await signUp();
    const other = await signUp();
    const { generationId } = await start(owner);
    await drainInlineJobs();
    const gen = await getGen(owner, generationId);
    const presentation = (await owner.agent.get(`/api/v1/lessons/${gen.lessonId}/presentation`).expect(200)).body.presentation;

    const created = await owner.agent.post(`/api/v1/presentations/${presentation._id}/exports`).set('x-csrf-token', owner.csrf).send({ format: 'markdown' }).expect(202);
    expect(JSON.stringify(created.body)).not.toContain('storageKey');
    await drainInlineJobs();
    const exportId = created.body.export._id as string;
    const fetched = await owner.agent.get(`/api/v1/exports/${exportId}`).expect(200);
    expect(fetched.body.export.status).toBe('ready');
    expect(JSON.stringify(fetched.body)).not.toContain('storageKey');
    expect(JSON.stringify((await owner.agent.get(`/api/v1/lessons/${gen.lessonId}/exports`).expect(200)).body)).not.toContain('storageKey');
    const assets = (await owner.agent.get('/api/v1/assets').expect(200)).body;
    expect(assets.assets.length).toBeGreaterThan(0);
    expect(JSON.stringify(assets)).not.toContain('storageKey');
    const lessons = (await owner.agent.get('/api/v1/lessons').expect(200)).body.lessons;
    expect(lessons[0].presentation.slideCount).toBe(presentation.manifest.slides.length);
    await owner.agent.get(`/api/v1/assets/${exportId}/content`).expect(200);

    // Another user gets 404 for every one of them.
    await other.agent.get(`/api/v1/lessons/${gen.lessonId}/presentation`).expect(404);
    await other.agent.get(`/api/v1/presentations/${presentation._id}/versions`).expect(404);
    await other.agent.post(`/api/v1/presentations/${presentation._id}/exports`).set('x-csrf-token', other.csrf).send({ format: 'markdown' }).expect(404);
    await other.agent.get(`/api/v1/exports/${exportId}`).expect(404);
    await other.agent.get(`/api/v1/assets/${exportId}/content`).expect(404);
    await other.agent.delete(`/api/v1/assets/${exportId}`).set('x-csrf-token', other.csrf).expect(404);
    expect((await other.agent.get('/api/v1/assets').expect(200)).body.assets).toHaveLength(0);
    expect(mongoose.connection.readyState).toBe(1);
  });
});
