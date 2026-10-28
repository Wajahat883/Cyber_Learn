import { describe, expect, it } from 'vitest';
import type { DiagramSpec, Slide } from '@cyberlearn/shared';
import { layoutDiagram } from '@cyberlearn/shared';
import { PresentationClock } from './clock';
import { cameraAt, captionAt, frameAt, wordAt } from './frame';

function manualClock(durations: number[]) {
  // Never schedules real frames; tests drive time with advance().
  return new PresentationClock(
    durations,
    () => 0,
    () => 1,
    () => undefined,
  );
}

const slide: Slide = {
  id: 's1',
  type: 'data-flow',
  title: 'SIEM',
  subtitle: '',
  sectionId: '',
  bullets: [],
  diagramId: 'd',
  imageAlt: '',
  annotations: [],
  timeline: [],
  terminal: [],
  durationMs: 10000,
  events: [
    { atMs: 0, type: 'reveal', targetId: 'title', durationMs: 800 },
    { atMs: 1000, type: 'reveal', targetId: 'source', durationMs: 1000 },
    { atMs: 3000, type: 'highlight', targetId: 'siem', durationMs: 1000 },
    { atMs: 4000, type: 'moveAlongPath', targetId: 'e1', pathId: 'e1', durationMs: 2000 },
  ],
  narration: { text: '', captions: [{ startMs: 0, endMs: 2000, text: 'Hello' }], words: [], timing: 'estimated' },
  speakerNotes: '',
};

describe('presentation clock (Phase 4 acceptance: pause/resume without losing sync)', () => {
  it('pausing freezes time and resuming continues from the same point', () => {
    const clock = manualClock([10000, 5000]);
    clock.play();
    clock.advance(2500);
    clock.pause();
    clock.advance(5000); // time passing while paused is ignored
    expect(clock.getSnapshot().elapsedMs).toBe(2500);
    clock.play();
    clock.advance(500);
    expect(clock.getSnapshot().elapsedMs).toBe(3000);
  });

  it('playback speed scales time', () => {
    const clock = manualClock([10000]);
    clock.setSpeed(1.5);
    clock.play();
    clock.advance(1000);
    expect(clock.getSnapshot().elapsedMs).toBe(1500);
    clock.setSpeed(0.75);
    clock.advance(1000);
    expect(clock.getSnapshot().elapsedMs).toBe(2250);
  });

  it('advances slides, supports seek/prev/next and ends at the last slide', () => {
    const clock = manualClock([5000, 5000]);
    clock.play();
    clock.advance(5200);
    expect(clock.getSnapshot().slideIndex).toBe(1);
    clock.seek(3000);
    expect(clock.getSnapshot().elapsedMs).toBe(3000);
    clock.prev(); // restarts current slide first
    expect(clock.getSnapshot()).toMatchObject({ slideIndex: 1, elapsedMs: 0 });
    clock.prev();
    expect(clock.getSnapshot().slideIndex).toBe(0);
    clock.next();
    clock.advance(9000);
    expect(clock.getSnapshot()).toMatchObject({ ended: true, playing: false, slideIndex: 1 });
    clock.play(); // play after the end restarts
    expect(clock.getSnapshot()).toMatchObject({ slideIndex: 0, elapsedMs: 0, playing: true });
  });

  it('narration can hold the clock until speech catches up', () => {
    const clock = manualClock([10000]);
    let speaking = true;
    clock.holdAt = (_i, t) => speaking && t >= 2000;
    clock.play();
    clock.advance(2000);
    clock.advance(3000);
    expect(clock.getSnapshot().elapsedMs).toBe(2000);
    speaking = false;
    clock.advance(1000);
    expect(clock.getSnapshot().elapsedMs).toBe(3000);
  });
});

describe('frameAt', () => {
  it('derives the same visual state for the same time, regardless of how we got there', () => {
    const a = frameAt(slide, 5000);
    const b = frameAt(slide, 5000);
    expect(a.reveal.get('source')).toBe(1);
    expect(a.tokens).toEqual([{ edgeId: 'e1', t: 0.5 }]);
    expect(b.tokens).toEqual(a.tokens);
  });

  it('hides elements before their reveal and shows elements without reveal events', () => {
    const f = frameAt(slide, 500);
    expect(f.reveal.get('source')).toBe(0);
    expect(f.reveal.get('siem')).toBe(1);
    expect(frameAt(slide, 0).reveal.get('title')).toBe(1);
    expect(frameAt(slide, 3500).highlighted.has('siem')).toBe(true);
    expect(frameAt(slide, 4500).highlighted.has('siem')).toBe(false);
  });

  it('finds the caption for a time', () => {
    expect(captionAt(slide.narration.captions, 1000)?.text).toBe('Hello');
    expect(captionAt(slide.narration.captions, 2500)).toBeUndefined();
  });
});

describe('auto-camera', () => {
  const diagram = {
    id: 'd1',
    title: 'Pipeline',
    nodes: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, label: id.toUpperCase(), kind: 'processor', description: '' })),
    edges: [
      { id: 'ab', source: 'a', target: 'b', label: '' },
      { id: 'bc', source: 'b', target: 'c', label: '' },
      { id: 'cd', source: 'c', target: 'd', label: '' },
      { id: 'de', source: 'd', target: 'e', label: '' },
    ],
    steps: [],
    direction: 'LR',
  } as unknown as DiagramSpec;
  const layout = layoutDiagram(diagram);
  const zoomSlide = { ...slide, durationMs: 20000, events: [{ type: 'highlight', targetId: 'a', atMs: 2000, durationMs: 2000 }] } as Slide;

  it('starts on the whole diagram, zooms into the highlighted node, and pulls back at the end', () => {
    const full = cameraAt(zoomSlide, layout, 0);
    const zoomed = cameraAt(zoomSlide, layout, 4000);
    expect(zoomed[2]).toBeLessThan(full[2]);
    const a = layout.nodes.find((n) => n.id === 'a')!;
    expect(a.x).toBeGreaterThanOrEqual(zoomed[0]);
    expect(a.x).toBeLessThanOrEqual(zoomed[0] + zoomed[2]);
    expect(cameraAt(zoomSlide, layout, 19900)).toEqual(full);
  });

  it('is a pure function of time', () => {
    expect(cameraAt(zoomSlide, layout, 2500)).toEqual(cameraAt(zoomSlide, layout, 2500));
  });
});

describe('wordAt', () => {
  const caption = { startMs: 0, endMs: 1000, text: 'one two three four' };
  it('estimates the spoken word from the caption position', () => {
    expect(wordAt(caption, 0)).toBe(0);
    expect(wordAt(caption, 999)).toBe(3);
  });
  it('uses provider word timings when present', () => {
    const words = [
      { startMs: 0, endMs: 100, text: 'one' },
      { startMs: 100, endMs: 900, text: 'two' },
      { startMs: 900, endMs: 950, text: 'three' },
      { startMs: 950, endMs: 1000, text: 'four' },
    ];
    expect(wordAt(caption, 500, words)).toBe(1);
  });
});
