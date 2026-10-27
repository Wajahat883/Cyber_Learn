/**
 * Small deterministic force-directed layout for the knowledge graph:
 * repulsion between all concepts, springs along edges, gentle centering.
 * Same input always gives the same picture.
 */
export function forceLayout(ids: string[], edges: { source: string; target: string }[], iterations = 300) {
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  // Start on a golden-angle spiral so the result is deterministic.
  const pos = ids.map((_, i) => {
    const r = 40 * Math.sqrt(i + 1);
    const a = i * 2.39996;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  const links = edges.map((e) => [index.get(e.source), index.get(e.target)]).filter((l): l is [number, number] => l[0] !== undefined && l[1] !== undefined);
  const ideal = 140;
  for (let it = 0; it < iterations; it++) {
    const temp = 30 * (1 - it / iterations) + 1;
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const d2 = Math.max(dx * dx + dy * dy, 25);
        const f = (ideal * ideal) / d2;
        disp[i].x += dx * f * 0.05;
        disp[i].y += dy * f * 0.05;
        disp[j].x -= dx * f * 0.05;
        disp[j].y -= dy * f * 0.05;
      }
    }
    for (const [a, b] of links) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const f = (d - ideal) / d;
      disp[a].x -= dx * f * 0.5;
      disp[a].y -= dy * f * 0.5;
      disp[b].x += dx * f * 0.5;
      disp[b].y += dy * f * 0.5;
    }
    for (let i = 0; i < n; i++) {
      disp[i].x -= pos[i].x * 0.01;
      disp[i].y -= pos[i].y * 0.01;
      const len = Math.max(Math.hypot(disp[i].x, disp[i].y), 0.01);
      pos[i].x += (disp[i].x / len) * Math.min(len, temp);
      pos[i].y += (disp[i].y / len) * Math.min(len, temp);
    }
  }
  return new Map(ids.map((id, i) => [id, pos[i]]));
}
