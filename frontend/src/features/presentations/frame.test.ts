import { describe, expect, it } from 'vitest';
import type { DiagramSpec, Slide } from '@cyberlearn/shared';
import { layoutDiagram } from '@cyberlearn/shared';
import { cameraAt, captionAt, frameAt, wordAt } from './frame';

const base: Slide = {
  id: 's',
  type: 'bullets',
  title: 'T',
  subtitle: '',
  sectionId: '',
  bullets: [],
  imageAlt: '',
  annotations: [],
  timeline: [],
  terminal: [],
  durationMs: 8000,
  events: [],
  narration: { text: '', captions: [], words: [], timing: 'estimated' },
  speakerNotes: '',
} as unknown as Slide;

const slide = (events: Slide['events'], extra: Partial<Slide> = {}): Slide => ({ ...base, ...extra, events });

describe('frameAt', () => {
  it('eases a reveal from 0 to 1 over its duration and keeps elements at 0 ms visible from the start', () => {
    const s = slide([
      { atMs: 0, type: 'reveal', targetId: 'title', durationMs: 800 },
      { atMs: 1000, type: 'reveal', targetId: 'b1', durationMs: 1000 },
    ]);
    expect(frameAt(s, 0).reveal.get('title')).toBe(1);
    expect(frameAt(s, 999).reveal.get('b1')).toBe(0);
    const mid = frameAt(s, 1500).reveal.get('b1');
    expect(mid).toBeGreaterThan(0.5); // ease-out: past half way at the midpoint
    expect(mid).toBeLessThan(1);
    expect(frameAt(s, 2000).reveal.get('b1')).toBe(1);
    expect(frameAt(s, 5000).reveal.get('untracked')).toBe(1);
  });

  it('highlights only inside the event window; dims persist once started', () => {
    const s = slide([
      { atMs: 1000, type: 'highlight', targetId: 'a', durationMs: 500 },
      { atMs: 2000, type: 'dim', targetId: 'b', durationMs: 100 },
    ]);
    expect(frameAt(s, 999).highlighted.has('a')).toBe(false);
    expect(frameAt(s, 1200).highlighted.has('a')).toBe(true);
    expect(frameAt(s, 1501).highlighted.has('a')).toBe(false);
    expect(frameAt(s, 1999).dimmed.has('b')).toBe(false);
    expect(frameAt(s, 7000).dimmed.has('b')).toBe(true);
  });

  it('moves tokens along a path with progress 0..1 and drops them afterwards', () => {
    const s = slide([{ atMs: 1000, type: 'moveAlongPath', targetId: 'e', pathId: 'e', durationMs: 2000 }]);
    expect(frameAt(s, 500).tokens).toEqual([]);
    expect(frameAt(s, 2000).tokens).toEqual([{ edgeId: 'e', t: 0.5 }]);
    expect(frameAt(s, 3500).tokens).toEqual([]);
  });

  it('tracks the latest revealed element (ignoring the opening frame) and clamps progress', () => {
    const s = slide([
      { atMs: 0, type: 'reveal', targetId: 'title', durationMs: 500 },
      { atMs: 1000, type: 'reveal', targetId: 'b1', durationMs: 500 },
      { atMs: 3000, type: 'reveal', targetId: 'b2', durationMs: 500 },
    ]);
    expect(frameAt(s, 500).latest).toBeNull();
    expect(frameAt(s, 1200).latest).toBe('b1');
    expect(frameAt(s, 3100).latest).toBe('b2');
    expect(frameAt(s, 4000).progress).toBe(0.5);
    expect(frameAt(s, 20_000).progress).toBe(1);
  });
});

describe('captionAt / wordAt', () => {
  const captions = [
    { startMs: 0, endMs: 1000, text: 'one two' },
    { startMs: 1000, endMs: 2000, text: 'three' },
  ];
  it('uses half-open caption ranges', () => {
    expect(captionAt(captions, 999)?.text).toBe('one two');
    expect(captionAt(captions, 1000)?.text).toBe('three');
    expect(captionAt(captions, 2000)).toBeUndefined();
  });

  it('stays within the word range at the caption edges', () => {
    expect(wordAt(captions[0], 0)).toBe(0);
    expect(wordAt(captions[0], 999)).toBe(1);
    expect(wordAt(captions[0], 5000)).toBe(1);
  });
});

describe('cameraAt', () => {
  it('keeps the whole picture for small diagrams', () => {
    const diagram = {
      id: 'd',
      title: 'small',
      type: 'flow',
      direction: 'LR',
      nodes: [
        { id: 'a', label: 'A', kind: 'process', description: '' },
        { id: 'b', label: 'B', kind: 'process', description: '' },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b', label: '' }],
      steps: [],
    } as unknown as DiagramSpec;
    const layout = layoutDiagram(diagram);
    const s = slide([{ atMs: 1000, type: 'highlight', targetId: 'a', durationMs: 1000 }]);
    expect(cameraAt(s, layout, 1500)).toEqual([-20, -20, layout.width + 20, layout.height + 20]);
  });
});
