import { describe, expect, it } from 'vitest';
import { PresentationManifestSchema } from '@cyberlearn/shared';
import { drainInlineJobs } from '../src/jobs/queues.js';
import { setProvidersForTesting } from '../src/ai/providers/index.js';
import { BrowserSpeechProvider } from '../src/ai/providers/placeholder.js';
import { SAMPLE_TEXT, signUp, type Session } from './helpers.js';

async function present(s: Session, preferences: object = {}) {
  const p = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).send({ title: 'SIEM' });
  const src = await s.agent.post(`/api/v1/projects/${p.body.project._id}/sources/text`).set('x-csrf-token', s.csrf).send({ title: 'n', text: SAMPLE_TEXT });
  const gen = await s.agent.post(`/api/v1/projects/${p.body.project._id}/generations`).set('x-csrf-token', s.csrf).send({ sourceIds: [src.body.source._id], autoContinue: true, preferences }).expect(202);
  await drainInlineJobs();
  const done = (await s.agent.get(`/api/v1/generations/${gen.body.generation._id}`)).body.generation;
  const pres = (await s.agent.get(`/api/v1/lessons/${done.lessonId}/presentation`).expect(200)).body.presentation;
  return { gen: done, pres };
}

describe('narration (Phase 5 acceptance)', () => {
  it('speech and visuals follow the same lesson plan', async () => {
    const s = await signUp();
    const { pres } = await present(s);
    const manifest = PresentationManifestSchema.parse(pres.manifest);
    const types = new Set(manifest.slides.map((x) => x.type));
    expect(types.has('title')).toBe(true);
    expect(types.has('data-flow')).toBe(true);
    for (const slide of manifest.slides) {
      expect(slide.narration.text.length).toBeGreaterThan(0);
      expect(slide.narration.captions.length).toBeGreaterThan(0);
      // Captions are consecutive and fit inside the slide.
      slide.narration.captions.forEach((c, i) => {
        expect(c.endMs).toBeGreaterThan(c.startMs);
        if (i) expect(c.startMs).toBeGreaterThanOrEqual(slide.narration.captions[i - 1].endMs);
      });
      expect(slide.durationMs).toBeGreaterThanOrEqual(slide.narration.captions.at(-1)!.endMs);
      // Visual events keep their teaching order after synchronisation.
      const times = slide.events.map((e) => e.atMs);
      expect([...times].sort((a, b) => a - b)).toEqual(times.slice().sort((a, b) => a - b));
    }
    // Diagram nodes are revealed when the narration mentions them.
    const flow = manifest.slides.find((x) => x.type === 'data-flow')!;
    const diagram = manifest.diagrams.find((d) => d.id === flow.diagramId)!;
    const firstNode = diagram.nodes.find((n) => n.id === (diagram.steps[0] ?? diagram.nodes[0].id))!;
    const reveal = flow.events.find((e) => e.type === 'reveal' && e.targetId === firstNode.id)!;
    const mention = flow.narration.captions.find((c) => c.text.toLowerCase().includes(firstNode.label.toLowerCase().split(' ')[0]));
    expect(mention).toBeDefined();
    expect(reveal.atMs).toBe(mention!.startMs);
  });

  it('stores TTS audio per slide when a speech provider is configured', async () => {
    const s = await signUp();
    setProvidersForTesting({ speech: { name: 'fake-tts', producesAudio: true, synthesize: async () => ({ body: Buffer.from('ID3fake-mp3'), mimeType: 'audio/mpeg' }) } });
    try {
      const { pres } = await present(s);
      const withAudio = pres.manifest.slides.filter((x: { narration: { audioAssetId?: string } }) => x.narration.audioAssetId);
      expect(withAudio.length).toBe(pres.manifest.slides.length);
      const audio = await s.agent.get(`/api/v1/assets/${withAudio[0].narration.audioAssetId}/content`).expect(200);
      expect(audio.headers['content-type']).toContain('audio/mpeg');
    } finally {
      setProvidersForTesting({ speech: new BrowserSpeechProvider() });
    }
  });

  it('still produces a timed presentation when narration is off', async () => {
    const s = await signUp();
    const { gen, pres } = await present(s, { narration: false });
    expect(gen.stageResults.find((r: { stage: string }) => r.stage === 'narration').status).toBe('skipped');
    expect(pres.manifest.slides.every((x: { narration: { text: string }; events: unknown[] }) => x.narration.text === '' && x.events.length > 0)).toBe(true);
  });
});
