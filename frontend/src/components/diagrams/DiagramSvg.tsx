import type { DiagramSpec } from '@cyberlearn/shared';
import { KIND_COLORS, NODE_H, NODE_W, pointAlong, polylinePath, type DiagramLayout } from '../../lib/diagramLayout';

export interface DiagramFrame {
  /** Elements shown so far; undefined = everything visible. */
  visible?: Set<string>;
  highlighted?: Set<string>;
  /** Tokens travelling along edges, t from 0 to 1. */
  tokens?: { edgeId: string; t: number }[];
  /** Per-element reveal progress 0..1 for fade/scale-in. */
  reveal?: Map<string, number>;
}

function wrap(label: string, max = 22): string[] {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = `${cur} ${w}`.trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2).map((l, i, all) => (i === 1 && words.join(' ').length > all.join(' ').length ? `${l.slice(0, max - 1)}…` : l));
}

/**
 * Plain SVG rendering of a diagram with literal colours, so it can be exported
 * as a standalone file and animated frame-by-frame by the presentation clock.
 */
export function DiagramSvg({ diagram, layout, frame = {}, title }: { diagram: DiagramSpec; layout: DiagramLayout; frame?: DiagramFrame; title?: string }) {
  const shown = (id: string) => !frame.visible || frame.visible.has(id);
  const amount = (id: string) => (frame.reveal?.get(id) ?? (shown(id) ? 1 : 0));
  const hot = (id: string) => frame.highlighted?.has(id) ?? false;
  const edgeById = new Map(layout.edges.map((e) => [e.id, e]));

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`-20 -20 ${layout.width + 20} ${layout.height + 20}`} width="100%" height="100%" role="img" aria-label={title ?? diagram.title} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <title>{title ?? diagram.title}</title>
      <defs>
        <marker id={`arrow-${diagram.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#64748b" />
        </marker>
        <marker id={`arrow-hot-${diagram.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#38BDF8" />
        </marker>
      </defs>
      {layout.edges.map((e) => {
        const a = amount(e.id);
        if (a <= 0) return null;
        const mid = pointAlong(e.points, 0.5);
        const isHot = hot(e.id);
        return (
          <g key={e.id} opacity={a}>
            <path d={polylinePath(e.points)} fill="none" stroke={isHot ? '#38BDF8' : '#64748b'} strokeWidth={isHot ? 3 : 2} markerEnd={`url(#${isHot ? 'arrow-hot' : 'arrow'}-${diagram.id})`} strokeLinejoin="round" />
            {e.label && (
              <g>
                <rect x={mid.x - e.label.length * 3.4 - 6} y={mid.y - 11} width={e.label.length * 6.8 + 12} height={20} rx={5} fill="#0b1020" stroke="#263449" />
                <text x={mid.x} y={mid.y + 4} textAnchor="middle" fontSize="11" fill="#94A3B8">
                  {e.label}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {layout.nodes.map((n) => {
        const a = amount(n.id);
        if (a <= 0) return null;
        const color = KIND_COLORS[n.kind];
        const isHot = hot(n.id);
        const lines = wrap(n.label);
        const scale = 0.85 + 0.15 * a;
        return (
          <g key={n.id} opacity={a} transform={`translate(${n.x + NODE_W / 2} ${n.y + NODE_H / 2}) scale(${scale}) translate(${-NODE_W / 2} ${-NODE_H / 2})`}>
            {isHot && <rect x={-6} y={-6} width={NODE_W + 12} height={NODE_H + 12} rx={16} fill={color} opacity={0.18} />}
            <rect width={NODE_W} height={NODE_H} rx={n.kind === 'decision' ? 4 : 12} fill="#0f1830" stroke={color} strokeWidth={isHot ? 3.5 : 2} />
            {lines.map((line, i) => (
              <text key={i} x={NODE_W / 2} y={NODE_H / 2 + (i - (lines.length - 1) / 2) * 16 - 2} textAnchor="middle" fontSize="13" fontWeight="600" fill="#F1F5F9">
                {line}
              </text>
            ))}
            <text x={NODE_W / 2} y={NODE_H - 7} textAnchor="middle" fontSize="9" letterSpacing="1" fill={color}>
              {n.kind.toUpperCase()}
            </text>
          </g>
        );
      })}
      {frame.tokens?.map((tok, i) => {
        const edge = edgeById.get(tok.edgeId);
        if (!edge) return null;
        const p = pointAlong(edge.points, tok.t);
        return (
          <g key={`${tok.edgeId}-${i}`}>
            <circle cx={p.x} cy={p.y} r={11} fill="#38BDF8" opacity={0.25} />
            <circle cx={p.x} cy={p.y} r={6} fill="#38BDF8" stroke="#F1F5F9" strokeWidth={1.5} />
          </g>
        );
      })}
    </svg>
  );
}
