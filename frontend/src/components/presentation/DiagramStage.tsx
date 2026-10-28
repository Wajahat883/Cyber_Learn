import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { DiagramSpec, Slide } from '@cyberlearn/shared';
import { KIND_COLORS, NODE_W, layoutDiagram } from '@cyberlearn/shared';
import { DiagramSvg } from '../diagrams/DiagramSvg';
import { cameraAt, type SlideFrame } from '../../features/presentations/frame';
import { reducedMotion, type StageInteraction } from './slideStyle';

export function DiagramStage({ slide, diagram, frame, interaction }: { slide: Slide; diagram: DiagramSpec; frame: SlideFrame; interaction?: StageInteraction }) {
  const layout = useMemo(() => layoutDiagram(diagram), [diagram]);
  const reveal = new Map<string, number>();
  const visible = new Set<string>();
  for (const id of [...diagram.nodes.map((n) => n.id), ...diagram.edges.map((e) => e.id)]) {
    const amount = frame.reveal.get(id);
    reveal.set(id, amount);
    if (amount > 0) visible.add(id);
  }
  // Whatever is being talked about stays bright; the rest steps back.
  const focus = new Set<string>(frame.highlighted);
  for (const t of frame.tokens) {
    const e = layout.edges.find((x) => x.id === t.edgeId);
    if (e) focus.add(e.id).add(e.source).add(e.target);
  }
  const selected = interaction?.selectedNode ?? null;
  if (selected) focus.add(selected);
  const camera = reducedMotion() ? undefined : cameraAt(slide, layout, frame.elapsedMs);
  const node = selected ? layout.nodes.find((n) => n.id === selected) : undefined;
  return (
    <div className="relative mt-6 h-[520px] rounded-2xl border border-border bg-[radial-gradient(ellipse_at_center,#13203d,#0b1222_70%)] p-4 overflow-hidden">
      <DiagramSvg diagram={diagram} layout={layout} frame={{ reveal, visible, highlighted: frame.highlighted, tokens: frame.tokens, camera, focus, selected }} onNodeClick={interaction?.onNodeClick} />
      {node && (
        <div
          className={`absolute top-5 w-[380px] rounded-2xl border bg-[#0b1020]/95 p-6 backdrop-blur shadow-2xl ${node.x + NODE_W / 2 > layout.width / 2 ? 'left-5' : 'right-5'}`}
          style={{ borderColor: KIND_COLORS[node.kind] }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={node.label}>
          <button className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:text-text" onClick={interaction?.onCloseDetails} aria-label="Close details">
            <X className="h-5 w-5" />
          </button>
          <p className="text-[13px] uppercase tracking-[0.2em] mb-2" style={{ color: KIND_COLORS[node.kind] }}>
            {node.kind}
          </p>
          <h3 className="text-[26px] font-bold leading-tight pr-8">{node.label}</h3>
          <p className="text-[18px] text-muted mt-3 leading-snug">{node.description || 'No extra detail for this step.'}</p>
          <p className="text-[14px] text-muted mt-4">
            Connects to{' '}
            {layout.edges
              .filter((e) => e.source === node.id)
              .map((e) => layout.nodes.find((n) => n.id === e.target)?.label)
              .filter(Boolean)
              .join(', ') || 'nothing further'}
            . Press play to continue.
          </p>
        </div>
      )}
    </div>
  );
}

