import { memo, useMemo } from 'react';
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { DiagramSpec, NodeKind } from '@cyberlearn/shared';
import { KIND_COLORS, layoutDiagram, NODE_H, NODE_W } from '@cyberlearn/shared';

type DiagramNodeData = { label: string; kind: NodeKind; selected: boolean; dimmed: boolean; highlighted: boolean; direction: 'LR' | 'TB' };

const DiagramNode = memo(function DiagramNode({ data }: NodeProps<Node<DiagramNodeData>>) {
  const color = KIND_COLORS[data.kind];
  const lr = data.direction === 'LR';
  return (
    <div
      className="rounded-xl border-2 bg-[#0f1830] px-3 flex flex-col justify-center text-center transition-all duration-300"
      style={{
        width: NODE_W,
        height: NODE_H,
        borderColor: color,
        opacity: data.dimmed ? 0.3 : 1,
        boxShadow: data.highlighted || data.selected ? `0 0 0 3px ${color}55, 0 0 24px ${color}88` : undefined,
        borderRadius: data.kind === 'decision' ? 4 : undefined,
      }}
    >
      <Handle type="target" position={lr ? Position.Left : Position.Top} className="!opacity-0" />
      <span className="text-[13px] font-semibold text-text leading-tight line-clamp-2">{data.label}</span>
      <span className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color }}>
        {data.kind}
      </span>
      <Handle type="source" position={lr ? Position.Right : Position.Bottom} className="!opacity-0" />
    </div>
  );
});

const nodeTypes = { diagram: DiagramNode };

/** Interactive React Flow rendering of a validated diagram (zoom, pan, select). */
export function DiagramView({
  diagram,
  selectedId,
  onSelect,
  highlightIds,
  visibleIds,
  interactive = true,
  minimap = false,
}: {
  diagram: DiagramSpec;
  selectedId?: string | null;
  onSelect?: (nodeId: string | null) => void;
  /** Nodes/edges to emphasise (e.g. relationships of the selected node). */
  highlightIds?: Set<string>;
  /** When set, only these elements are shown (diagram animation replay). */
  visibleIds?: Set<string>;
  interactive?: boolean;
  minimap?: boolean;
}) {
  const layout = useMemo(() => layoutDiagram(diagram), [diagram]);
  const nodes: Node<DiagramNodeData>[] = layout.nodes
    .filter((n) => !visibleIds || visibleIds.has(n.id))
    .map((n) => ({
      id: n.id,
      type: 'diagram',
      position: { x: n.x, y: n.y },
      data: {
        label: n.label,
        kind: n.kind,
        selected: n.id === selectedId,
        highlighted: Boolean(highlightIds?.has(n.id)),
        dimmed: Boolean(highlightIds && highlightIds.size > 0 && !highlightIds.has(n.id)),
        direction: diagram.direction,
      },
      draggable: false,
      selectable: interactive,
      ariaLabel: `${n.label} (${n.kind})`,
    }));
  const visibleNodes = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = diagram.edges
    .filter((e) => visibleNodes.has(e.source) && visibleNodes.has(e.target) && (!visibleIds || visibleIds.has(e.id) || !diagram.edges.some((x) => visibleIds.has(x.id))))
    .map((e) => {
      const hot = highlightIds?.has(e.id);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || undefined,
        type: 'smoothstep',
        animated: Boolean(hot),
        markerEnd: { type: MarkerType.ArrowClosed, color: hot ? '#38BDF8' : '#4b5d7a' },
        style: { stroke: hot ? '#38BDF8' : '#4b5d7a', strokeWidth: hot ? 2.5 : 1.5, opacity: highlightIds && highlightIds.size > 0 && !hot ? 0.25 : 1 },
        labelStyle: { fill: '#94A3B8', fontSize: 11 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
      };
    });

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.2}
      maxZoom={2.5}
      nodesConnectable={false}
      nodesDraggable={false}
      elementsSelectable={interactive}
      panOnDrag={interactive}
      zoomOnScroll={interactive}
      onNodeClick={(_, node) => onSelect?.(node.id)}
      onPaneClick={() => onSelect?.(null)}
      proOptions={{ hideAttribution: true }}
      colorMode="dark"
    >
      <Background color="#1d2a47" gap={24} />
      {interactive && <Controls showInteractive={false} />}
      {minimap && <MiniMap pannable zoomable nodeColor={(n) => KIND_COLORS[(n.data as DiagramNodeData).kind]} />}
    </ReactFlow>
  );
}
