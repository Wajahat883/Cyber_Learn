import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { drainInlineJobs } from '../src/jobs/queues.js';
import { newAgent, SAMPLE_TEXT, signUp, type Session } from './helpers.js';

async function lesson(s: Session) {
  const p = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).send({ title: 'SIEM Architecture' });
  const src = await s.agent.post(`/api/v1/projects/${p.body.project._id}/sources/text`).set('x-csrf-token', s.csrf).send({ title: 'n', text: SAMPLE_TEXT });
  const gen = await s.agent.post(`/api/v1/projects/${p.body.project._id}/generations`).set('x-csrf-token', s.csrf).send({ sourceIds: [src.body.source._id], autoContinue: true }).expect(202);
  await drainInlineJobs();
  const lessonId = (await s.agent.get(`/api/v1/generations/${gen.body.generation._id}`)).body.generation.lessonId as string;
  const pres = (await s.agent.get(`/api/v1/lessons/${lessonId}/presentation`)).body.presentation;
  return { lessonId, presentationId: pres._id as string, projectId: p.body.project._id as string };
}

async function exportFile(s: Session, presentationId: string, format: string) {
  const req = await s.agent.post(`/api/v1/presentations/${presentationId}/exports`).set('x-csrf-token', s.csrf).send({ format }).expect(202);
  await drainInlineJobs();
  const asset = (await s.agent.get(`/api/v1/exports/${req.body.export._id}`).expect(200)).body.export;
  expect(asset.status, asset.error).toBe('ready');
  const file = await s.agent.get(`/api/v1/assets/${asset._id}/content?download=1`).buffer(true).parse((res, cb) => {
    const parts: Buffer[] = [];
    res.on('data', (c: Buffer) => parts.push(c));
    res.on('end', () => cb(null, Buffer.concat(parts)));
  });
  expect(file.status).toBe(200);
  expect(file.headers['content-disposition']).toContain(asset.filename);
  return file.body as Buffer;
}

describe('exports and polish (Phase 7)', () => {
  it('exports PDF notes, PPTX slides with notes and Markdown', async () => {
    const s = await signUp();
    const { lessonId, presentationId, projectId } = await lesson(s);
    const pdf = await exportFile(s, presentationId, 'pdf');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(3000);

    const pptx = await exportFile(s, presentationId, 'pptx');
    expect(pptx.subarray(0, 2).toString()).toBe('PK');
    expect(pptx.toString('latin1')).toContain('ppt/notesSlides');

    const md = (await exportFile(s, presentationId, 'markdown')).toString('utf8');
    expect(md).toContain('# SIEM Architecture');
    expect(md).toContain('```mermaid');
    expect(md).toContain('## Practice questions');

    const list = (await s.agent.get(`/api/v1/lessons/${lessonId}/exports`)).body.exports;
    expect(list).toHaveLength(3);
    expect((await s.agent.get(`/api/v1/projects/${projectId}`)).body.project.status.export).toBe('ready');
  });

  it('saves and restores presentation versions', async () => {
    const s = await signUp();
    const { lessonId, presentationId } = await lesson(s);
    const before = (await s.agent.get(`/api/v1/lessons/${lessonId}/presentation`)).body.presentation;
    await s.agent.post(`/api/v1/presentations/${presentationId}/versions`).set('x-csrf-token', s.csrf).send({ label: 'Before edits' }).expect(201);
    const versions = (await s.agent.get(`/api/v1/presentations/${presentationId}/versions`)).body.versions;
    expect(versions[0].label).toBe('Before edits');

    const shorter = before.manifest.slides.slice(0, -1);
    await s.agent.patch(`/api/v1/presentations/${presentationId}`).set('x-csrf-token', s.csrf).send({ slides: shorter }).expect(200);
    // Invalid edits are rejected by manifest validation.
    const broken = [{ ...shorter[0], events: [{ atMs: 0, type: 'reveal', targetId: 'missing' }] }];
    await s.agent.patch(`/api/v1/presentations/${presentationId}`).set('x-csrf-token', s.csrf).send({ slides: broken }).expect(400);

    await s.agent.post(`/api/v1/presentations/${presentationId}/versions/${versions[0].version}/restore`).set('x-csrf-token', s.csrf).expect(200);
    const after = (await s.agent.get(`/api/v1/lessons/${lessonId}/presentation`)).body.presentation;
    expect(after.manifest.slides).toHaveLength(before.manifest.slides.length);
    expect(after.version).toBeGreaterThan(before.version);
  });

  it('exports all data, signs out other sessions and deletes the account', async () => {
    const s = await signUp('leaving@example.com');
    await lesson(s);
    const backup = await s.agent.get('/api/v1/account/export').expect(200);
    const data = JSON.parse(backup.text);
    expect(data.format).toBe('cyberlearn-backup');
    expect(data.lessons).toHaveLength(1);
    expect(data.sources[0].extractedText.join(' ')).toContain('SIEM');
    expect(JSON.stringify(data)).not.toContain('passwordHash');

    const overview = (await s.agent.get('/api/v1/account/overview').expect(200)).body;
    expect(overview.storage.totalBytes).toBeGreaterThan(0);
    expect(overview.providers.text.provider).toBe('mock');
    expect(JSON.stringify(overview)).not.toMatch(/api_?key/i);

    // A second session for the same account is signed out by "log out everywhere".
    const { agent: second, csrf } = await newAgent();
    await second.post('/api/v1/auth/login').set('x-csrf-token', csrf).send({ email: 'leaving@example.com', password: 'correct horse battery' }).expect(200);
    await s.agent.post('/api/v1/account/logout-all').set('x-csrf-token', s.csrf).expect(204);
    await second.get('/api/v1/auth/me').expect(401);
    await s.agent.get('/api/v1/auth/me').expect(200);

    await s.agent.delete('/api/v1/account').set('x-csrf-token', s.csrf).send({ password: 'wrong', confirm: 'DELETE' }).expect(401);
    await s.agent.delete('/api/v1/account').set('x-csrf-token', s.csrf).send({ password: 'correct horse battery', confirm: 'DELETE' }).expect(204);
    await s.agent.get('/api/v1/auth/me').expect(401);
    const db = mongoose.connection.db!;
    for (const name of ['projects', 'lessons', 'sources', 'sourcechunks', 'assets', 'flashcards', 'quizzes', 'presentations', 'subjects', 'activities']) {
      expect(await db.collection(name).countDocuments({ ownerId: new mongoose.Types.ObjectId(s.user.id) }), name).toBe(0);
    }
  });
});
