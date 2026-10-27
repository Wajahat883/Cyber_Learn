import type { DiagramSpec, NodeKind } from '@cyberlearn/shared';

export const NODE_W = 190;
export const NODE_H = 64;
const GAP_MAIN = 90;
const GAP_CROSS = 50;

export interface PositionedNode {
  id: string;
  label: string;
  kind: NodeKind;
  description: string;
  x: number;
  y: number;
}

export interface PositionedEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  /** Polyline points from the source border to the target border. */
  points: { x: number; y: number }[];
}

export interface DiagramLayout {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

export const KIND_COLORS: Record<NodeKind, string> = {
  source: '#38BDF8',
  processor: '#8B5CF6',
  storage: '#FBBF24',
  destination: '#34D399',
  actor: '#F472B6',
  decision: '#F87171',
  concept: '#22D3EE',
  event: '#A3E635',
};

/**
 * Deterministic layered layout: nodes are ranked by longest path from the
 * sources and ordered by the teaching steps. The same layout drives the
 * interactive explorer, the presentation stage and SVG/PNG export.
 */
export function layoutDiagram(diagram: DiagramSpec): DiagramLayout {
  const ids = diagram.nodes.map((n) => n.id);
  const rank = new Map(ids.map((id) => [id, 0]));
  const incoming = new Set(diagram.edges.map((e) => e.target));
  const roots = ids.filter((id) => !incoming.has(id));
  if (!roots.length && ids[0]) rank.set(ids[0], 0);
  // Longest-path ranking; bounded iterations make cycles safe.
  for (let i = 0; i < ids.length; i++) {
    let changed = false;
    for (const e of diagram.edges) {
      const next = (rank.get(e.source) ?? 0) + 1;
      if (next > (rank.get(e.target) ?? 0) && next < ids.length) {
        rank.set(e.target, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const stepIndex = new Map((diagram.steps.length ? diagram.steps : ids).map((id, i) => [id, i]));
  const layers = new Map<number, string[]>();
  for (const id of ids) layers.set(rank.get(id)!, [...(layers.get(rank.get(id)!) ?? []), id]);
  for (const layer of layers.values()) layer.sort((a, b) => (stepIndex.get(a) ?? 99) - (stepIndex.get(b) ?? 99));

  const lr = diagram.direction === 'LR';
  const maxLayer = Math.max(...[...layers.values()].map((l) => l.length), 1);
  const crossSize = lr ? NODE_H : NODE_W;
  const mainSize = lr ? NODE_W : NODE_H;
  const crossSpan = maxLayer * crossSize + (maxLayer - 1) * GAP_CROSS;

  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const nodes: PositionedNode[] = [];
  for (const [r, layer] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
    const span = layer.length * crossSize + (layer.length - 1) * GAP_CROSS;
    const start = (crossSpan - span) / 2;
    layer.forEach((id, i) => {
      const main = r * (mainSize + GAP_MAIN);
      const cross = start + i * (crossSize + GAP_CROSS);
      const n = byId.get(id)!;
      nodes.push({ id, label: n.label, kind: n.kind, description: n.description, x: lr ? main : cross, y: lr ? cross : main });
    });
  }
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const edges: PositionedEdge[] = diagram.edges.map((e) => {
    const a = pos.get(e.source)!;
    const b = pos.get(e.target)!;
    const from = lr ? { x: a.x + NODE_W, y: a.y + NODE_H / 2 } : { x: a.x + NODE_W / 2, y: a.y + NODE_H };
    const to = lr ? { x: b.x, y: b.y + NODE_H / 2 } : { x: b.x + NODE_W / 2, y: b.y };
    // Backward or same-layer edges route around instead of crossing nodes.
    const backwards = lr ? to.x <= from.x : to.y <= from.y;
    const points = backwards
      ? lr
        ? [from, { x: from.x + 30, y: from.y }, { x: from.x + 30, y: Math.max(a.y, b.y) + NODE_H + 30 }, { x: to.x - 30, y: Math.max(a.y, b.y) + NODE_H + 30 }, { x: to.x - 30, y: to.y }, to]
        : [from, { x: from.x, y: from.y + 30 }, { x: Math.max(a.x, b.x) + NODE_W + 30, y: from.y + 30 }, { x: Math.max(a.x, b.x) + NODE_W + 30, y: to.y - 30 }, { x: to.x, y: to.y - 30 }, to]
      : lr
        ? [from, { x: (from.x + to.x) / 2, y: from.y }, { x: (from.x + to.x) / 2, y: to.y }, to]
        : [from, { x: from.x, y: (from.y + to.y) / 2 }, { x: to.x, y: (from.y + to.y) / 2 }, to];
    return { id: e.id, source: e.source, target: e.target, label: e.label, points };
  });
  const width = Math.max(...nodes.map((n) => n.x + NODE_W), 0) + 40;
  const height = Math.max(...nodes.map((n) => n.y + NODE_H), 0) + 60;
  return { nodes, edges, width, height };
}

/** Point at fraction t (0..1) along a polyline, for tokens moving along a path. */
export function pointAlong(points: { x: number; y: number }[], t: number) {
  const segs = points.slice(1).map((p, i) => ({ a: points[i], b: p, len: Math.hypot(p.x - points[i].x, p.y - points[i].y) }));
  const total = segs.reduce((s, x) => s + x.len, 0) || 1;
  let d = Math.max(0, Math.min(1, t)) * total;
  for (const s of segs) {
    if (d <= s.len) return { x: s.a.x + ((s.b.x - s.a.x) * d) / (s.len || 1), y: s.a.y + ((s.b.y - s.a.y) * d) / (s.len || 1) };
    d -= s.len;
  }
  return points[points.length - 1];
}

export const polylinePath = (points: { x: number; y: number }[]) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
