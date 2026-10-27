import { describe, expect, it } from 'vitest';
import http from 'node:http';
import PDFDocument from 'pdfkit';
import { drainInlineJobs } from '../src/jobs/queues.js';
import { setProvidersForTesting } from '../src/ai/providers/index.js';
import { MockTextProvider } from '../src/ai/providers/mock.js';
import { AiProviderError, type StructuredRequest } from '../src/ai/types.js';
import { app, SAMPLE_TEXT, signUp, type Session } from './helpers.js';

function makePdf(text: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const parts: Buffer[] = [];
    doc.on('data', (b: Buffer) => parts.push(b));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    doc.fontSize(12).text(text);
    doc.end();
  });
}

async function projectWithText(s: Session, text = SAMPLE_TEXT) {
  const p = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).send({ title: 'SIEM Architecture' }).expect(201);
  const src = await s.agent.post(`/api/v1/projects/${p.body.project._id}/sources/text`).set('x-csrf-token', s.csrf).send({ title: 'notes', text }).expect(201);
  return { projectId: p.body.project._id as string, sourceId: src.body.source._id as string };
}

async function generate(s: Session, projectId: string, sourceId: string, autoContinue = true, preferences?: object) {
  const res = await s.agent.post(`/api/v1/projects/${projectId}/generations`).set('x-csrf-token', s.csrf).send({ sourceIds: [sourceId], autoContinue, preferences }).expect(202);
  await drainInlineJobs();
  const gen = await s.agent.get(`/api/v1/generations/${res.body.generation._id}`).expect(200);
  return gen.body.generation;
}

describe('uploads and extraction', () => {
  it('extracts a real PDF with page references', async () => {
    const s = await signUp();
    const p = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).send({ title: 'PDF' });
    const pdf = await makePdf('Windows Event Logs\n\nEvent ID 4625 records a failed logon. Event ID 4624 records a successful logon. Analysts correlate both to detect brute force.');
    const res = await s.agent.post(`/api/v1/projects/${p.body.project._id}/sources/upload`).set('x-csrf-token', s.csrf).attach('file', pdf, 'logs.pdf').expect(201);
    expect(res.body.source.extractionStatus).toBe('completed');
    expect(res.body.source.mimeType).toBe('application/pdf');
    const detail = await s.agent.get(`/api/v1/sources/${res.body.source._id}`).expect(200);
    expect(detail.body.chunks[0].text).toContain('4625');
    const original = await s.agent.get(`/api/v1/sources/${res.body.source._id}/original`).expect(200);
    expect(original.headers['content-type']).toContain('application/pdf');
  });

  it('accepts Markdown and rejects files whose content does not match the extension', async () => {
    const s = await signUp();
    const p = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).send({ title: 'Uploads' });
    const url = `/api/v1/projects/${p.body.project._id}/sources/upload`;
    await s.agent.post(url).set('x-csrf-token', s.csrf).attach('file', Buffer.from(SAMPLE_TEXT), 'siem.md').expect(201);
    const fakePdf = await s.agent.post(url).set('x-csrf-token', s.csrf).attach('file', Buffer.from('just text pretending'), 'fake.pdf').expect(400);
    expect(fakePdf.body.error.message).toMatch(/not a PDF/);
    const pdf = await makePdf('hello world text');
    await s.agent.post(url).set('x-csrf-token', s.csrf).attach('file', pdf, 'notes.txt').expect(400);
    await s.agent.post(url).set('x-csrf-token', s.csrf).attach('file', Buffer.from('MZ\x90\x00binary'), 'tool.exe').expect(400);
    await s.agent.post(url).set('x-csrf-token', s.csrf).attach('file', Buffer.from('PK\x03\x04garbage'), 'doc.docx').expect(400);
  });

  it('gives a clear error for PDFs without text', async () => {
    const s = await signUp();
    const p = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).send({ title: 'Scan' });
    const empty = await makePdf(' ');
    const res = await s.agent.post(`/api/v1/projects/${p.body.project._id}/sources/upload`).set('x-csrf-token', s.csrf).attach('file', empty, 'scan.pdf').expect(400);
    expect(res.body.error.message).toMatch(/scanned|OCR|no readable/i);
  });
});

describe('generation pipeline (Phase 2 acceptance)', () => {
  it('turns pasted content into a structured, editable lesson', async () => {
    const s = await signUp();
    const { projectId, sourceId } = await projectWithText(s);
    const gen = await generate(s, projectId, sourceId);
    expect(gen.status).toBe('completed');
    expect(gen.stageResults.every((r: { status: string }) => ['completed', 'skipped'].includes(r.status))).toBe(true);
    expect(gen.analysis.subject).toBe('Cybersecurity');

    const lesson = (await s.agent.get(`/api/v1/lessons/${gen.lessonId}`).expect(200)).body.lesson;
    expect(lesson.sections.map((x: { title: string }) => x.title)).toEqual(expect.arrayContaining(['Log Collection', 'Correlation and Alerting', 'Investigation']));
    const correlation = lesson.sections.find((x: { title: string }) => x.title === 'Correlation and Alerting');
    expect(correlation.explanation).toContain('4625');
    expect(correlation.sourceRefs.length).toBeGreaterThan(0);
    expect(correlation.grounding).toBe('source');

    // Editing with autosave keeps a version history.
    const edited = lesson.sections.map((x: { id: string; summary: string }) => (x.id === correlation.id ? { ...x, summary: 'Edited summary' } : x));
    const saved = await s.agent.patch(`/api/v1/lessons/${lesson._id}`).set('x-csrf-token', s.csrf).send({ sections: edited }).expect(200);
    expect(saved.body.lesson.sections.find((x: { id: string }) => x.id === correlation.id).summary).toBe('Edited summary');
    const versions = await s.agent.get(`/api/v1/lessons/${lesson._id}/versions`).expect(200);
    expect(versions.body.versions.length).toBe(1);
    await s.agent.post(`/api/v1/lessons/${lesson._id}/versions/${versions.body.versions[0].version}/restore`).set('x-csrf-token', s.csrf).expect(200);

    const project = (await s.agent.get(`/api/v1/projects/${projectId}`).expect(200)).body;
    expect(project.project.status.content).toBe('ready');
    expect(project.project.subject).toBe('Cybersecurity');
    expect(project.presentation).not.toBeNull();
  });

  it('pauses for plan review and continues with the edited plan', async () => {
    const s = await signUp();
    const { projectId, sourceId } = await projectWithText(s);
    const gen = await generate(s, projectId, sourceId, false);
    expect(gen.status).toBe('awaiting_review');
    expect(gen.lessonId).toBeNull();

    // A second generation cannot start while one waits for review.
    await s.agent.post(`/api/v1/projects/${projectId}/generations`).set('x-csrf-token', s.csrf).send({ sourceIds: [sourceId] }).expect(409);

    const analysis = { ...gen.analysis, title: 'Edited SIEM Lesson', sections: gen.analysis.sections.map((x: { title: string }) => ({ ...x, include: x.title !== 'Investigation' })) };
    await s.agent.post(`/api/v1/generations/${gen._id}/continue`).set('x-csrf-token', s.csrf).send({ analysis }).expect(202);
    await drainInlineJobs();
    const done = (await s.agent.get(`/api/v1/generations/${gen._id}`)).body.generation;
    expect(done.status).toBe('completed');
    const lesson = (await s.agent.get(`/api/v1/lessons/${done.lessonId}`)).body.lesson;
    expect(lesson.title).toBe('Edited SIEM Lesson');
    expect(lesson.sections.map((x: { title: string }) => x.title)).not.toContain('Investigation');
  });

  it('keeps successful work when an optional stage fails and retries only what failed', async () => {
    const s = await signUp();
    const { projectId, sourceId } = await projectWithText(s);
    const mock = new MockTextProvider();
    let failDiagrams = true;
    setProvidersForTesting({
      text: {
        name: 'flaky',
        model: 'test',
        generateStructured: <T,>(req: StructuredRequest<T>) => {
          if (req.task === 'diagram' && failDiagrams) return Promise.reject(new AiProviderError('Provider is down', false));
          return mock.generateStructured(req);
        },
      },
    });
    try {
      const gen = await generate(s, projectId, sourceId);
      expect(gen.status).toBe('partially_completed');
      expect(gen.stageResults.find((r: { stage: string }) => r.stage === 'diagrams').status).toBe('failed');
      const lessonBefore = (await s.agent.get(`/api/v1/lessons/${gen.lessonId}`)).body.lesson;
      expect(lessonBefore.sections.length).toBeGreaterThan(0);

      failDiagrams = false;
      await s.agent.post(`/api/v1/generations/${gen._id}/retry`).set('x-csrf-token', s.csrf).send({}).expect(202);
      await drainInlineJobs();
      const retried = (await s.agent.get(`/api/v1/generations/${gen._id}`)).body.generation;
      expect(retried.status).toBe('completed');
      const lessonAfter = (await s.agent.get(`/api/v1/lessons/${gen.lessonId}`)).body.lesson;
      expect(lessonAfter._id).toBe(lessonBefore._id);
      expect(lessonAfter.diagrams.length).toBeGreaterThan(0);
      // Sections written in the first run were reused, not regenerated.
      expect(lessonAfter.sections.map((x: { id: string }) => x.id)).toEqual(lessonBefore.sections.map((x: { id: string }) => x.id));
    } finally {
      setProvidersForTesting({ text: mock });
    }
  });

  it('fails cleanly when a critical stage fails', async () => {
    const s = await signUp();
    const { projectId, sourceId } = await projectWithText(s);
    const mock = new MockTextProvider();
    setProvidersForTesting({ text: { name: 'broken', model: 'x', generateStructured: () => Promise.reject(new AiProviderError('Invalid API key', false)) } });
    try {
      const gen = await generate(s, projectId, sourceId);
      expect(gen.status).toBe('failed');
      expect(gen.errorMessage).toBe('Invalid API key');
    } finally {
      setProvidersForTesting({ text: mock });
    }
  });

  it('cancels a generation waiting for review', async () => {
    const s = await signUp();
    const { projectId, sourceId } = await projectWithText(s);
    const gen = await generate(s, projectId, sourceId, false);
    await s.agent.post(`/api/v1/generations/${gen._id}/cancel`).set('x-csrf-token', s.csrf).expect(200);
    const after = (await s.agent.get(`/api/v1/generations/${gen._id}`)).body.generation;
    expect(after.status).toBe('cancelled');
  });

  it('streams progress over SSE', async () => {
    const s = await signUp();
    const { projectId, sourceId } = await projectWithText(s);
    const gen = await generate(s, projectId, sourceId, false);
    const login = await s.agent.post('/api/v1/auth/login').set('x-csrf-token', s.csrf).send({ email: s.user.email, password: 'correct horse battery' }).expect(200);
    const cookies = ([] as string[])
      .concat(login.headers['set-cookie'])
      .map((c) => c.split(';')[0])
      .join('; ');
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    const first = await new Promise<string>((resolve, reject) => {
      const req = http.get({ port, path: `/api/v1/generations/${gen._id}/events`, headers: { cookie: cookies } }, (res) => {
        expect(res.headers['content-type']).toContain('text/event-stream');
        res.once('data', (d: Buffer) => {
          resolve(d.toString());
          req.destroy();
        });
      });
      req.on('error', reject);
    });
    server.close();
    expect(first).toContain('event: progress');
    expect(first).toContain('awaiting_review');
  });

  it('enforces ownership on generations and lessons', async () => {
    const owner = await signUp();
    const other = await signUp();
    const { projectId, sourceId } = await projectWithText(owner);
    const gen = await generate(owner, projectId, sourceId);
    await other.agent.get(`/api/v1/generations/${gen._id}`).expect(404);
    await other.agent.get(`/api/v1/lessons/${gen.lessonId}`).expect(404);
    await other.agent.post(`/api/v1/generations/${gen._id}/retry`).set('x-csrf-token', other.csrf).send({}).expect(404);
    // Using someone else's source id in your own project is rejected.
    const mine = await other.agent.post('/api/v1/projects').set('x-csrf-token', other.csrf).send({ title: 'x' });
    await other.agent.post(`/api/v1/projects/${mine.body.project._id}/generations`).set('x-csrf-token', other.csrf).send({ sourceIds: [sourceId] }).expect(400);
  });

  it('answers questions only from the notes', async () => {
    const s = await signUp();
    const { projectId, sourceId } = await projectWithText(s);
    const gen = await generate(s, projectId, sourceId);
    const yes = await s.agent.post('/api/v1/ask').set('x-csrf-token', s.csrf).send({ question: 'Which event ID shows a failed logon?', lessonId: gen.lessonId }).expect(200);
    expect(yes.body.supported).toBe(true);
    expect(yes.body.answer).toContain('4625');
    expect(yes.body.citations.length).toBeGreaterThan(0);
    const no = await s.agent.post('/api/v1/ask').set('x-csrf-token', s.csrf).send({ question: 'How do Kubernetes pods autoscale?', lessonId: gen.lessonId }).expect(200);
    expect(no.body.supported).toBe(false);
  });
});
