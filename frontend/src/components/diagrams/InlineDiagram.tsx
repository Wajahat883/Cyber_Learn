import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ExternalLink, Maximize2, Play, Square } from 'lucide-react';
import type { DiagramSpec } from '@cyberlearn/shared';
import { KIND_COLORS } from '@cyberlearn/shared';
import { Modal } from '../ui/Modal';
import { DiagramView } from './DiagramView';
import { iconFor } from './securityIcons';

const STEP_MS = 900;

/** Replays the diagram node by node; returns the visible ids while playing. */
function useReplay(diagram: DiagramSpec) {
  const order = useMemo(() => (diagram.steps.length ? diagram.steps : diagram.nodes.map((n) => n.id)), [diagram]);
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    if (step === null) return;
    if (step >= order.length) {
      const done = setTimeout(() => setStep(null), STEP_MS * 1.5);
      return () => clearTimeout(done);
    }
    const next = setTimeout(() => setStep(step + 1), STEP_MS);
    return () => clearTimeout(next);
  }, [step, order.length]);
  const visible = useMemo(() => {
    if (step === null) return undefined;
    const shown = new Set(order.slice(0, step + 1));
    for (const e of diagram.edges) if (shown.has(e.source) && shown.has(e.target)) shown.add(e.id);
    return shown;
  }, [step, order, diagram.edges]);
  return { playing: step !== null, visible, current: step !== null ? order[Math.min(step, order.length - 1)] : null, toggle: () => setStep((s) => (s === null ? 0 : null)) };
}

function Explorer({ diagram, height, lessonId }: { diagram: DiagramSpec; height: string; lessonId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const replay = useReplay(diagram);
  const focus = selected ?? replay.current;
  const node = diagram.nodes.find((n) => n.id === focus);
  const links = diagram.edges.filter((e) => e.source === focus || e.target === focus);
  const highlight = useMemo(() => (focus ? new Set([focus, ...links.flatMap((e) => [e.id, e.source, e.target])]) : undefined), [focus, links]);
  const name = (id: string) => diagram.nodes.find((n) => n.id === id)?.label ?? id;
  const Icon = node ? iconFor(node.label, node.kind) : null;

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <button onClick={replay.toggle} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft">
          {replay.playing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {replay.playing ? 'Stop' : 'Replay step by step'}
        </button>
        <span className="text-xs text-muted">Click any box for details</span>
        <Link to={`/lessons/${lessonId}/diagrams/${diagram.id}`} className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-text">
          Full explorer <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div style={{ height }}>
        <DiagramView diagram={diagram} selectedId={selected} onSelect={setSelected} highlightIds={highlight} visibleIds={replay.visible} />
      </div>
      {node && Icon && (
        <div className="flex gap-3 border-t border-border px-4 py-3" aria-live="polite">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${KIND_COLORS[node.kind]}22`, color: KIND_COLORS[node.kind] }}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold">
              {node.label} <span className="ml-1 text-[11px] uppercase tracking-wider" style={{ color: KIND_COLORS[node.kind] }}>{node.kind}</span>
            </p>
            {node.description && <p className="text-muted mt-0.5">{node.description}</p>}
            {links.length > 0 && (
              <p className="text-xs text-muted mt-1">
                {links.map((e) => (e.source === node.id ? `→ ${name(e.target)}` : `← ${name(e.source)}`) + (e.label ? ` (${e.label})` : '')).join(' · ')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A diagram explored in place: details, step-by-step replay and a full-screen view, without leaving the lesson. */
export function InlineDiagram({ diagram, lessonId }: { diagram: DiagramSpec; lessonId: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <figure className="rounded-xl border border-border overflow-hidden bg-surface">
      <figcaption className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
        <span className="text-sm font-semibold truncate">{diagram.title}</span>
        <button onClick={() => setExpanded(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-2" aria-label={`Expand ${diagram.title}`}>
          <Maximize2 className="h-3.5 w-3.5" /> Expand
        </button>
      </figcaption>
      <Explorer diagram={diagram} height="320px" lessonId={lessonId} />
      <Modal open={expanded} onClose={() => setExpanded(false)} title={diagram.title} wide>
        {expanded && <Explorer diagram={diagram} height="65vh" lessonId={lessonId} />}
      </Modal>
    </figure>
  );
}
