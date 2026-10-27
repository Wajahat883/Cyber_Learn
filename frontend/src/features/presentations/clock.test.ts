import { describe, expect, it } from 'vitest';
import type { Slide } from '@cyberlearn/shared';
import { PresentationClock } from './clock';
import { captionAt, frameAt } from './frame';

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
