import { describe, expect, it } from 'vitest';
import { DiagramSpecSchema, PresentationManifestSchema } from '@cyberlearn/shared';
import { drainInlineJobs } from '../src/jobs/queues.js';
import { setProvidersForTesting } from '../src/ai/providers/index.js';
import { PlaceholderImageProvider } from '../src/ai/providers/placeholder.js';
import { AiProviderError } from '../src/ai/types.js';
import { SAMPLE_TEXT, signUp, type Session } from './helpers.js';

// 1x1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function generatedLesson(s: Session) {
  const p = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).send({ title: 'SIEM' });
  const src = await s.agent.post(`/api/v1/projects/${p.body.project._id}/sources/text`).set('x-csrf-token', s.csrf).send({ title: 'n', text: SAMPLE_TEXT });
  const gen = await s.agent.post(`/api/v1/projects/${p.body.project._id}/generations`).set('x-csrf-token', s.csrf).send({ sourceIds: [src.body.source._id], autoContinue: true }).expect(202);
  await drainInlineJobs();
  const done = (await s.agent.get(`/api/v1/generations/${gen.body.generation._id}`)).body.generation;
  const lesson = (await s.agent.get(`/api/v1/lessons/${done.lessonId}`)).body.lesson;
  return { gen: done, lesson };
}

describe('diagrams and visuals (Phase 3 acceptance)', () => {
  it('lesson contains validated diagrams and relevant illustrations', async () => {
    const s = await signUp();
    const { lesson } = await generatedLesson(s);
    expect(lesson.diagrams.length).toBeGreaterThan(0);
    for (const d of lesson.diagrams) expect(DiagramSpecSchema.safeParse(d).success).toBe(true);
    const flow = lesson.diagrams.find((d: { type: string }) => d.type === 'data-flow');
    expect(flow).toBeDefined();

    const images = (await s.agent.get(`/api/v1/assets?lessonId=${lesson._id}&type=image`).expect(200)).body.assets;
    expect(images.length).toBeGreaterThan(0);
    expect(images[0].status).toBe('ready');
    expect(images[0].usage.length).toBeGreaterThan(0);
    const content = await s.agent.get(`/api/v1/assets/${images[0]._id}/content`).expect(200);
    expect(content.headers['content-type']).toContain('image/svg+xml');
    expect(content.headers['content-security-policy']).toContain('sandbox');

    const pres = (await s.agent.get(`/api/v1/projects/${lesson.projectId}`)).body.presentation;
    expect(pres).not.toBeNull();
  });

  it('falls back to a placeholder when the image provider fails, then regenerates in place', async () => {
    const s = await signUp();
    const real = new PlaceholderImageProvider();
    setProvidersForTesting({ image: { name: 'down', model: 'x', generateImage: () => Promise.reject(new AiProviderError('Image API down', true)) } });
    let lessonId: string;
    try {
      const { gen, lesson } = await generatedLesson(s);
      lessonId = lesson._id;
      expect(gen.status).toBe('completed');
      expect(gen.stageResults.find((r: { stage: string }) => r.stage === 'images').detail).toMatch(/placeholder/);
    } finally {
      setProvidersForTesting({ image: real });
    }
    const [img] = (await s.agent.get(`/api/v1/assets?lessonId=${lessonId}&type=image`)).body.assets;
    expect(img.generationMetadata.fallback).toBe(true);
    await s.agent.post(`/api/v1/assets/${img._id}/regenerate`).set('x-csrf-token', s.csrf).expect(202);
    await drainInlineJobs();
    const [after] = (await s.agent.get(`/api/v1/assets?lessonId=${lessonId}&type=image`)).body.assets;
    expect(after._id).toBe(img._id);
    expect(after.generationMetadata.fallback).toBe(false);
    expect(after.status).toBe('ready');
  });

  it('replaces an illustration only with a real image file', async () => {
    const s = await signUp();
    const { lesson } = await generatedLesson(s);
    const [img] = (await s.agent.get(`/api/v1/assets?lessonId=${lesson._id}&type=image`)).body.assets;
    await s.agent.post(`/api/v1/assets/${img._id}/replace`).set('x-csrf-token', s.csrf).attach('file', Buffer.from('<svg onload="alert(1)"/>'), 'evil.png').expect(400);
    const ok = await s.agent.post(`/api/v1/assets/${img._id}/replace`).set('x-csrf-token', s.csrf).attach('file', PNG, 'mine.png').expect(200);
    expect(ok.body.asset.mimeType).toBe('image/png');
    const other = await signUp();
    await other.agent.get(`/api/v1/assets/${img._id}/content`).expect(404);
  });

  it('editing a diagram keeps the presentation valid', async () => {
    const s = await signUp();
    const { lesson } = await generatedLesson(s);
    const diagram = lesson.diagrams.find((d: { nodes: unknown[] }) => d.nodes.length >= 3) ?? lesson.diagrams[0];
    const removed = diagram.nodes[diagram.nodes.length - 1].id;
    const edited = {
      ...diagram,
      title: 'Edited flow',
      nodes: diagram.nodes.filter((n: { id: string }) => n.id !== removed),
      edges: diagram.edges.filter((e: { source: string; target: string }) => e.source !== removed && e.target !== removed),
      steps: diagram.steps.filter((x: string) => x !== removed),
    };
    await s.agent.patch(`/api/v1/lessons/${lesson._id}/diagrams/${diagram.id}`).set('x-csrf-token', s.csrf).send(edited).expect(200);
    // Edges pointing at unknown nodes are rejected.
    await s.agent
      .patch(`/api/v1/lessons/${lesson._id}/diagrams/${diagram.id}`)
      .set('x-csrf-token', s.csrf)
      .send({ ...edited, edges: [{ id: 'bad', source: edited.nodes[0].id, target: 'ghost' }] })
      .expect(400);
    const pres = (await s.agent.get(`/api/v1/lessons/${lesson._id}/presentation`).expect(200)).body.presentation;
    expect(PresentationManifestSchema.safeParse(pres.manifest).success).toBe(true);
    expect(pres.manifest.diagrams.find((d: { id: string }) => d.id === diagram.id).title).toBe('Edited flow');
  });
});
