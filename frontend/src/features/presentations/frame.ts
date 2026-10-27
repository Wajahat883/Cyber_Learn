import type { Caption, Slide } from '@cyberlearn/shared';

export interface RevealLookup {
  /** Reveal progress 0..1; elements without a reveal event are fully visible. */
  get(id: string): number;
}

export interface SlideFrame {
  reveal: RevealLookup;
  highlighted: Set<string>;
  dimmed: Set<string>;
  tokens: { edgeId: string; t: number }[];
}

const ease = (x: number) => 1 - (1 - x) ** 3;

/**
 * Pure function of (slide, time): which elements are visible, highlighted or
 * moving. Because nothing depends on wall-clock timers, any time can be
 * rendered exactly — after a pause, a seek or a speed change.
 */
export function frameAt(slide: Slide, elapsedMs: number): SlideFrame {
  const reveal = new Map<string, number>();
  const revealTargets = new Set(slide.events.filter((e) => e.type === 'reveal').map((e) => e.targetId));
  const highlighted = new Set<string>();
  const dimmed = new Set<string>();
  const tokens: SlideFrame['tokens'] = [];

  for (const event of slide.events) {
    const local = elapsedMs - event.atMs;
    switch (event.type) {
      case 'reveal': {
        // Elements scheduled at 0 ms are on screen from the first frame, so a paused slide is never blank.
        const amount = event.atMs === 0 ? 1 : local < 0 ? 0 : ease(Math.min(1, local / Math.max(1, event.durationMs)));
        reveal.set(event.targetId, Math.max(reveal.get(event.targetId) ?? 0, amount));
        break;
      }
      case 'highlight':
        if (local >= 0 && local <= event.durationMs) highlighted.add(event.targetId);
        break;
      case 'dim':
        if (local >= 0) dimmed.add(event.targetId);
        break;
      case 'moveAlongPath':
        if (local >= 0 && local <= event.durationMs && event.pathId) tokens.push({ edgeId: event.pathId, t: local / event.durationMs });
        break;
    }
  }

  return {
    // Elements without a reveal event are visible from the start.
    reveal: { get: (id: string) => (revealTargets.has(id) ? (reveal.get(id) ?? 0) : 1) },
    highlighted,
    dimmed,
    tokens,
  };
}

export function captionAt(captions: Caption[], elapsedMs: number): Caption | undefined {
  return captions.find((c) => elapsedMs >= c.startMs && elapsedMs < c.endMs);
}
