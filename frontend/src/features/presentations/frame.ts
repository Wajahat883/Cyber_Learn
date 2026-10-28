import type { Caption, DiagramLayout, Slide } from '@cyberlearn/shared';
import { NODE_H, NODE_W } from '@cyberlearn/shared';

export interface RevealLookup {
  /** Reveal progress 0..1; elements without a reveal event are fully visible. */
  get(id: string): number;
}

export interface SlideFrame {
  reveal: RevealLookup;
  highlighted: Set<string>;
  dimmed: Set<string>;
  tokens: { edgeId: string; t: number }[];
  elapsedMs: number;
  /** 0..1 through the slide. */
  progress: number;
  /** Element revealed most recently (after the opening frame), i.e. what the narrator is on now. */
  latest: string | null;
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
  let latest: { id: string; at: number } | null = null;

  for (const event of slide.events) {
    const local = elapsedMs - event.atMs;
    switch (event.type) {
      case 'reveal': {
        // Elements scheduled at 0 ms are on screen from the first frame, so a paused slide is never blank.
        const amount = event.atMs === 0 ? 1 : local < 0 ? 0 : ease(Math.min(1, local / Math.max(1, event.durationMs)));
        reveal.set(event.targetId, Math.max(reveal.get(event.targetId) ?? 0, amount));
        if (event.atMs > 0 && local >= 0 && (!latest || event.atMs >= latest.at)) latest = { id: event.targetId, at: event.atMs };
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
    elapsedMs,
    progress: Math.min(1, elapsedMs / Math.max(1, slide.durationMs)),
    latest: (latest as { id: string } | null)?.id ?? null,
  };
}

export function captionAt(captions: Caption[], elapsedMs: number): Caption | undefined {
  return captions.find((c) => elapsedMs >= c.startMs && elapsedMs < c.endMs);
}

/** Visible region of a diagram: x, y, width, height in layout coordinates. */
export type CameraBox = [number, number, number, number];

const CAMERA_MOVE_MS = 1100;
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Auto-camera that follows the narration: it glides to whatever the slide's
 * events point at (a highlighted node, a packet on its way, a newly revealed
 * step) and pulls back to the whole picture before the slide ends. Like
 * frameAt it is a pure function of time, so seeking lands on the same shot.
 */
export function cameraAt(
  slide: Slide,
  layout: DiagramLayout,
  elapsedMs: number,
): CameraBox {
  const node = { w: NODE_W, h: NODE_H };
  const full: CameraBox = [-20, -20, layout.width + 20, layout.height + 20];
  // Small diagrams already fill the stage; zooming would only crop them.
  if (layout.nodes.length < 4) return full;
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const edges = new Map(layout.edges.map((e) => [e.id, e]));

  const boxAround = (ids: string[], zoom: number): CameraBox | null => {
    const nodes = ids.map((id) => byId.get(id)).filter((n): n is NonNullable<typeof n> => Boolean(n));
    if (!nodes.length) return null;
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + node.w));
    const maxY = Math.max(...nodes.map((n) => n.y + node.h));
    // Keep the stage's proportions and enough context around the subject.
    const w = Math.min(full[2], Math.max(maxX - minX + node.w * 1.6, full[2] / zoom, 560));
    const h = Math.min(full[3], Math.max(maxY - minY + node.h * 2.4, full[3] / zoom, 250));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const x = Math.min(Math.max(cx - w / 2, full[0]), full[0] + full[2] - w);
    const y = Math.min(Math.max(cy - h / 2, full[1]), full[1] + full[3] - h);
    return [x, y, w, h];
  };

  const keys: { at: number; box: CameraBox }[] = [];
  for (const e of slide.events) {
    if (e.atMs === 0) continue;
    let box: CameraBox | null = null;
    if (e.type === 'highlight') box = boxAround([e.targetId], 1.9);
    else if (e.type === 'moveAlongPath' && e.pathId) {
      const edge = edges.get(e.pathId);
      if (edge) box = boxAround([edge.source, edge.target], 1.6);
    } else if (e.type === 'reveal' && byId.has(e.targetId)) box = boxAround([e.targetId], 1.5);
    if (box) keys.push({ at: e.atMs, box });
  }
  if (!keys.length) return full;
  keys.sort((a, b) => a.at - b.at);
  // Pull back to the overview for the closing seconds.
  const lastFocus = keys[keys.length - 1].at;
  const overviewAt = Math.max(lastFocus + 2500, slide.durationMs - 3000);
  if (overviewAt < slide.durationMs) keys.push({ at: overviewAt, box: full });

  let start: CameraBox = full;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const until = Math.min(elapsedMs, keys[i + 1]?.at ?? Infinity);
    if (until < k.at) break;
    const p = smooth(Math.min(1, (until - k.at) / CAMERA_MOVE_MS));
    const box = start.map((v, j) => lerp(v, k.box[j], p)) as CameraBox;
    if (elapsedMs < (keys[i + 1]?.at ?? Infinity)) return box;
    start = box;
  }
  return start;
}

/** Index of the word being spoken: provider timings when present, otherwise estimated from position in the caption. */
export function wordAt(caption: Caption, elapsedMs: number, words: { startMs: number; endMs: number }[] = []): number {
  const timed = words.filter((w) => w.startMs >= caption.startMs && w.endMs <= caption.endMs + 50);
  if (timed.length) {
    const i = timed.findIndex((w) => elapsedMs < w.endMs);
    return i < 0 ? timed.length - 1 : i;
  }
  const parts = caption.text.split(/\s+/).filter(Boolean);
  const p = (elapsedMs - caption.startMs) / Math.max(1, caption.endMs - caption.startMs);
  // Weight by word length so long technical terms take longer, as in speech.
  const total = parts.reduce((n, w) => n + w.length + 1, 0);
  let acc = 0;
  for (let i = 0; i < parts.length; i++) {
    acc += parts[i].length + 1;
    if (acc / total >= p) return i;
  }
  return parts.length - 1;
}
