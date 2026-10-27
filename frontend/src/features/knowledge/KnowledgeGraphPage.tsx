import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowRight, Network } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { Card, PageHeader } from '../../components/ui/Card';
import { Input, Select, Toggle } from '../../components/ui/Field';
import { Badge, EmptyState, PageLoader } from '../../components/ui/Feedback';
import { ButtonLink } from '../../components/ui/Button';
import { useSubjects } from '../subjects/useSubjects';
import { forceLayout } from './forceLayout';
import { ExploreTabs } from '../../components/layout/hubs';
import { useThemeColors } from '../../hooks/useThemeColors';

interface GraphNode {
  id: string;
  label: string;
  definition: string;
  weight: number;
  lessons: { lessonId: string; title: string; sectionId: string; subject: string; color: string }[];
}
interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: 'stated' | 'related';
}

type ConceptData = { label: string; colors: string[]; weight: number; selected: boolean; dimmed: boolean };

const Concept = memo(function Concept({ data }: NodeProps<Node<ConceptData>>) {
  const size = 18 + Math.min(4, data.weight) * 6;
  const ring = data.colors.length > 1 ? `conic-gradient(${data.colors.map((c, i) => `${c} ${(i / data.colors.length) * 100}% ${((i + 1) / data.colors.length) * 100}%`).join(', ')})` : data.colors[0];
  return (
    <div className="flex flex-col items-center" style={{ opacity: data.dimmed ? 0.25 : 1 }}>
      <Handle type="target" position={Position.Top} className="!opacity-0 !top-1/2" />
      <div className="rounded-full p-[3px]" style={{ background: ring, boxShadow: data.selected ? `0 0 0 3px var(--text), 0 0 24px ${data.colors[0]}` : undefined }}>
        <div className="rounded-full bg-surface" style={{ width: size, height: size }} />
      </div>
      <span className="mt-1 max-w-[140px] text-center text-[11px] font-medium leading-tight text-text">{data.label}</span>
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !top-1/2" />
    </div>
  );
});

const nodeTypes = { concept: Concept };

/** Knowledge Graph (Roman Urdu "08"): how concepts connect across lessons and subjects. */
export function KnowledgeGraphPage() {
  const { data: subjects } = useSubjects();
  const [subjectId, setSubjectId] = useState('');
  const [query, setQuery] = useState('');
  const [bridgesOnly, setBridgesOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const colors = useThemeColors();
  const { data, isLoading } = useQuery({
    queryKey: ['knowledge-graph', subjectId],
    queryFn: () => api.get<{ nodes: GraphNode[]; edges: GraphEdge[]; lessonCount: number }>(`/knowledge-graph${qs({ subjectId })}`),
  });

  const visible = useMemo(() => {
    if (!data) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    let nodes = data.nodes;
    if (bridgesOnly) {
      const bridges = new Set(nodes.filter((n) => n.weight > 1).map((n) => n.id));
      const neighbours = new Set(data.edges.filter((e) => bridges.has(e.source) || bridges.has(e.target)).flatMap((e) => [e.source, e.target]));
      nodes = nodes.filter((n) => bridges.has(n.id) || neighbours.has(n.id));
    }
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, edges: data.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
  }, [data, bridgesOnly]);

  const positions = useMemo(() => forceLayout(visible.nodes.map((n) => n.id), visible.edges), [visible]);

  if (isLoading) return <PageLoader />;
  if (!data?.nodes.length) {
    return (
      <>
        <PageHeader title="Explore" />
        <ExploreTabs active="graph" />
        <EmptyState icon={<Network className="h-10 w-10" />} title="No concepts yet" action={<ButtonLink to="/create">Create a lesson</ButtonLink>}>
          Concepts from your lessons appear here and connect across subjects, for example HTTP → Authentication → Session Management.
        </EmptyState>
      </>
    );
  }

  const q = query.trim().toLowerCase();
  const node = visible.nodes.find((n) => n.id === selected);
  const neighbourEdges = node ? visible.edges.filter((e) => e.source === node.id || e.target === node.id) : [];
  const focus = node ? new Set([node.id, ...neighbourEdges.flatMap((e) => [e.source, e.target])]) : null;
  const label = (id: string) => data.nodes.find((n) => n.id === id)?.label ?? id;

  const flowNodes: Node<ConceptData>[] = visible.nodes.map((n) => ({
    id: n.id,
    type: 'concept',
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    data: {
      label: n.label,
      colors: [...new Set(n.lessons.map((l) => l.color))].slice(0, 4),
      weight: n.weight,
      selected: n.id === selected,
      dimmed: Boolean((focus && !focus.has(n.id)) || (q && !n.label.toLowerCase().includes(q))),
    },
    draggable: true,
    ariaLabel: `${n.label}, in ${n.weight} lesson${n.weight === 1 ? '' : 's'}`,
  }));
  const flowEdges: Edge[] = visible.edges.map((e) => {
    const hot = focus?.has(e.source) && focus?.has(e.target) && (e.source === selected || e.target === selected);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.kind === 'stated' && (hot || !focus) ? e.label : undefined,
      type: 'straight',
      markerEnd: e.kind === 'stated' ? { type: MarkerType.ArrowClosed, color: hot ? colors.primary : colors.muted } : undefined,
      style: { stroke: hot ? colors.primary : colors.muted, strokeWidth: hot ? 2 : 1, strokeDasharray: e.kind === 'related' ? '4 4' : undefined, opacity: focus && !hot ? 0.15 : 0.8 },
      labelStyle: { fill: colors.muted, fontSize: 10 },
      labelBgStyle: { fill: colors.surface },
    };
  });
  const bridges = data.nodes.filter((n) => new Set(n.lessons.map((l) => l.subject)).size > 1).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Explore"
        description={`${data.nodes.length} concepts from ${data.lessonCount} lesson${data.lessonCount === 1 ? '' : 's'} · ${bridges} concept${bridges === 1 ? '' : 's'} shared across subjects. Solid arrows are relationships stated in your material; dashed lines link concepts taught together.`}
      />
      <ExploreTabs active="graph" />
      <div className="flex flex-col md:flex-row gap-3 md:items-end">
        <Select aria-label="Filter by subject" value={subjectId} onChange={(e) => (setSubjectId(e.target.value), setSelected(null))} className="md:w-60">
          <option value="">All subjects</option>
          {subjects?.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Input aria-label="Find a concept" placeholder="Find a concept…" value={query} onChange={(e) => setQuery(e.target.value)} className="md:w-72" />
        <div className="md:w-72">
          <Toggle label="Only concepts shared by several lessons" checked={bridgesOnly} onChange={setBridgesOnly} />
        </div>
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <Card className="p-0 h-[620px] overflow-hidden">
          <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} fitView minZoom={0.1} maxZoom={2} onNodeClick={(_, n) => setSelected(n.id)} onPaneClick={() => setSelected(null)} proOptions={{ hideAttribution: true }} colorMode={colors.mode} nodesConnectable={false}>
            <Background color={colors.border} gap={28} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </Card>
        <Card>
          {node ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">{node.label}</h2>
                {node.definition && <p className="text-sm text-muted mt-1">{node.definition}</p>}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted mb-2">Studied in</p>
                <ul className="space-y-2">
                  {node.lessons.map((l) => (
                    <li key={l.lessonId} className="text-sm">
                      <Link to={`/lessons/${l.lessonId}${l.sectionId ? `#${l.sectionId}` : ''}`} className="text-primary hover:underline">
                        {l.title}
                      </Link>
                      <span className="block text-xs text-muted">
                        <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: l.color }} />
                        {l.subject || 'No subject'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {neighbourEdges.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted mb-2">Connected concepts</p>
                  <ul className="space-y-1.5 text-sm">
                    {neighbourEdges.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-1.5">
                        <button className={e.source === node.id ? 'font-medium' : 'text-primary hover:underline'} onClick={() => setSelected(e.source)}>
                          {label(e.source)}
                        </button>
                        <ArrowRight className="h-3.5 w-3.5 text-muted" />
                        {e.label && <Badge>{e.label}</Badge>}
                        <button className={e.target === node.id ? 'font-medium' : 'text-primary hover:underline'} onClick={() => setSelected(e.target)}>
                          {label(e.target)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted space-y-3">
              <p>Select a concept to see which lessons teach it and how it connects to other ideas.</p>
              <p>Ring colours show the subjects a concept belongs to; multi-coloured rings are bridges between subjects.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
