import type { DiagramSpec } from '@cyberlearn/shared';
import { KIND_COLORS, NODE_H, NODE_W, pointAlong, polylinePath, type DiagramLayout } from '@cyberlearn/shared';
import { iconFor } from './securityIcons';

export interface DiagramFrame {
  /** Elements shown so far; undefined = everything visible. */
  visible?: Set<string>;
  highlighted?: Set<string>;
  /** Tokens travelling along edges, t from 0 to 1. */
  tokens?: { edgeId: string; t: number }[];
  /** Per-element reveal progress 0..1 for fade/scale-in. */
  reveal?: Map<string, number>;
  /** Visible region (x, y, w, h); the auto-camera moves it. Undefined = whole diagram. */
  camera?: [number, number, number, number];
  /** When set, everything not in focus fades back so the subject stands out. */
  focus?: Set<string>;
  selected?: string | null;
}

function wrap(label: string, max = 17): string[] {
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

const TRAIL = 7;

/**
 * Plain SVG rendering of a diagram with literal colours, so it can be exported
 * as a standalone file and animated frame-by-frame by the presentation clock.
 */
export function DiagramSvg({
  diagram,
  layout,
  frame = {},
  title,
  onNodeClick,
}: {
  diagram: DiagramSpec;
  layout: DiagramLayout;
  frame?: DiagramFrame;
  title?: string;
  onNodeClick?: (id: string) => void;
}) {
  const shown = (id: string) => !frame.visible || frame.visible.has(id);
  const amount = (id: string) => (frame.reveal?.get(id) ?? (shown(id) ? 1 : 0));
  const hot = (id: string) => (frame.highlighted?.has(id) ?? false) || frame.selected === id;
  const faded = (id: string) => Boolean(frame.focus?.size) && !frame.focus!.has(id);
  const edgeById = new Map(layout.edges.map((e) => [e.id, e]));
  const busy = new Set((frame.tokens ?? []).map((t) => t.edgeId));
  const [vx, vy, vw, vh] = frame.camera ?? [-20, -20, layout.width + 20, layout.height + 20];
  const glow = `glow-${diagram.id}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`}
      width="100%"
      height="100%"
      role="img"
      aria-label={title ?? diagram.title}
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <title>{title ?? diagram.title}</title>
      <defs>
        <marker id={`arrow-${diagram.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#64748b" />
        </marker>
        <marker id={`arrow-hot-${diagram.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#38BDF8" />
        </marker>
        <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {layout.edges.map((e) => {
        const a = amount(e.id);
        if (a <= 0) return null;
        const mid = pointAlong(e.points, 0.5);
        const isHot = hot(e.id) || busy.has(e.id);
        const dim = faded(e.id) && !busy.has(e.id);
        return (
          <g key={e.id} opacity={a * (dim ? 0.3 : 1)}>
            {isHot && <path d={polylinePath(e.points)} fill="none" stroke="#38BDF8" strokeWidth={7} opacity={0.25} filter={`url(#${glow})`} strokeLinejoin="round" />}
            <path d={polylinePath(e.points)} fill="none" stroke={isHot ? '#38BDF8' : '#64748b'} strokeWidth={isHot ? 3 : 2} markerEnd={`url(#${isHot ? 'arrow-hot' : 'arrow'}-${diagram.id})`} strokeLinejoin="round" />
            {e.label && (
              <g>
                <rect x={mid.x - e.label.length * 3.4 - 6} y={mid.y - 11} width={e.label.length * 6.8 + 12} height={20} rx={5} fill="#0b1020" stroke={isHot ? '#38BDF8' : '#263449'} />
                <text x={mid.x} y={mid.y + 4} textAnchor="middle" fontSize="11" fill={isHot ? '#E0F2FE' : '#94A3B8'}>
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
        const scale = (0.85 + 0.15 * a) * (isHot ? 1.04 : 1);
        const Icon = iconFor(n.label, n.kind);
        const textX = 46 + (NODE_W - 46) / 2;
        return (
          <g
            key={n.id}
            opacity={a * (faded(n.id) && !isHot ? 0.35 : 1)}
            transform={`translate(${n.x + NODE_W / 2} ${n.y + NODE_H / 2}) scale(${scale}) translate(${-NODE_W / 2} ${-NODE_H / 2})`}
            onClick={
              onNodeClick
                ? (ev) => {
                    ev.stopPropagation();
                    onNodeClick(n.id);
                  }
                : undefined
            }
            style={onNodeClick ? { cursor: 'pointer' } : undefined}
          >
            {onNodeClick && <title>{`${n.label} — click for details`}</title>}
            {isHot && <rect x={-6} y={-6} width={NODE_W + 12} height={NODE_H + 12} rx={16} fill={color} opacity={0.3} filter={`url(#${glow})`} />}
            <rect width={NODE_W} height={NODE_H} rx={n.kind === 'decision' ? 4 : 12} fill="#0f1830" stroke={color} strokeWidth={isHot ? 3.5 : 2} />
            <rect x={9} y={NODE_H / 2 - 15} width={30} height={30} rx={8} fill={color} opacity={0.16} />
            <Icon x={14} y={NODE_H / 2 - 10} width={20} height={20} color={color} strokeWidth={2} aria-hidden="true" />
            {lines.map((line, i) => (
              <text key={i} x={textX} y={NODE_H / 2 + (i - (lines.length - 1) / 2) * 16 - 2} textAnchor="middle" fontSize="13" fontWeight="600" fill="#F1F5F9">
                {line}
              </text>
            ))}
            <text x={textX} y={NODE_H - 7} textAnchor="middle" fontSize="9" letterSpacing="1" fill={color}>
              {n.kind.toUpperCase()}
            </text>
          </g>
        );
      })}
      {frame.tokens?.map((tok, i) => {
        const edge = edgeById.get(tok.edgeId);
        if (!edge) return null;
        const p = pointAlong(edge.points, tok.t);
        // Comet trail: fading copies just behind the packet.
        return (
          <g key={`${tok.edgeId}-${i}`}>
            {Array.from({ length: TRAIL }, (_, k) => {
              const back = tok.t - (k + 1) * 0.018;
              if (back <= 0) return null;
              const q = pointAlong(edge.points, back);
              return <circle key={k} cx={q.x} cy={q.y} r={5.5 - k * 0.6} fill="#38BDF8" opacity={0.5 * (1 - k / TRAIL)} />;
            })}
            <circle cx={p.x} cy={p.y} r={13} fill="#38BDF8" opacity={0.35} filter={`url(#${glow})`} />
            <circle cx={p.x} cy={p.y} r={6} fill="#E0F2FE" stroke="#38BDF8" strokeWidth={2} />
          </g>
        );
      })}
    </svg>
  );
}
