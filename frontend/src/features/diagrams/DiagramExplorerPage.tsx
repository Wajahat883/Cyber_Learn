import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Download, FileImage, Network, Pause, Pencil, Play, RotateCcw, Save } from 'lucide-react';
import type { DiagramSpec } from '@cyberlearn/shared';
import { api, errorMessage } from '../../lib/api';
import { downloadDiagramPng, downloadDiagramSvg } from '../../lib/download';
import { KIND_COLORS } from '../../lib/diagramLayout';
import { DiagramView } from '../../components/diagrams/DiagramView';
import { Card, PageHeader } from '../../components/ui/Card';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { Alert, Badge, EmptyState, ErrorState, PageLoader } from '../../components/ui/Feedback';
import { Modal } from '../../components/ui/Modal';
import { cn } from '../../lib/cn';
import type { Lesson } from '../../types/models';
import { useLesson } from '../lessons/useLesson';

const REPLAY_STEP_MS = 1300;

function useReplay(diagram: DiagramSpec | undefined) {
  const order = useMemo(() => (diagram ? (diagram.steps.length ? diagram.steps : diagram.nodes.map((n) => n.id)) : []), [diagram]);
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || step === null) return;
    if (step >= order.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => (s ?? 0) + 1), REPLAY_STEP_MS);
    return () => clearTimeout(t);
  }, [playing, step, order.length]);

  const visible = useMemo(() => {
    if (step === null || !diagram) return undefined;
    const nodes = new Set(order.slice(0, step));
    const edges = diagram.edges.filter((e) => nodes.has(e.source) && nodes.has(e.target)).map((e) => e.id);
    return new Set([...nodes, ...edges]);
  }, [step, order, diagram]);

  return {
    order,
    step,
    playing,
    visible,
    current: step !== null && step > 0 ? order[step - 1] : null,
    play: () => {
      setStep((s) => (s === null || s >= order.length ? 0 : s));
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    reset: () => {
      setPlaying(false);
      setStep(null);
    },
    goTo: (i: number) => {
      setPlaying(false);
      setStep(i + 1);
    },
  };
}

function DiagramEditor({ lesson, diagram, onClose }: { lesson: Lesson; diagram: DiagramSpec; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<DiagramSpec>(diagram);
  const save = useMutation({
    mutationFn: () => api.patch<{ lesson: Lesson }>(`/lessons/${lesson._id}/diagrams/${diagram.id}`, draft),
    onSuccess: (r) => {
      qc.setQueryData(['lesson', lesson._id], r.lesson);
      qc.invalidateQueries({ queryKey: ['presentation', lesson._id] });
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit diagram labels"
      wide
      footer={
        <Button icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate()}>
          Save diagram
        </Button>
      }
    >
      <div className="space-y-4">
        {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
        <Input label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <p className="text-sm font-semibold">Nodes</p>
        {draft.nodes.map((n, i) => (
          <div key={n.id} className="grid sm:grid-cols-[1fr_140px] gap-2">
            <Input aria-label={`Label for ${n.id}`} value={n.label} onChange={(e) => setDraft({ ...draft, nodes: draft.nodes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <Select aria-label={`Kind for ${n.id}`} value={n.kind} onChange={(e) => setDraft({ ...draft, nodes: draft.nodes.map((x, j) => (j === i ? { ...x, kind: e.target.value as typeof n.kind } : x)) })}>
              {Object.keys(KIND_COLORS).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
            <Input
              className="sm:col-span-2"
              aria-label={`Description for ${n.id}`}
              placeholder="Description"
              value={n.description}
              onChange={(e) => setDraft({ ...draft, nodes: draft.nodes.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })}
            />
          </div>
        ))}
        <p className="text-sm font-semibold">Connections</p>
        {draft.edges.map((e, i) => (
          <div key={e.id} className="flex items-center gap-2 text-sm">
            <span className="w-32 truncate text-muted">{draft.nodes.find((n) => n.id === e.source)?.label}</span>
            <ArrowRight className="h-4 w-4 text-muted shrink-0" />
            <span className="w-32 truncate text-muted">{draft.nodes.find((n) => n.id === e.target)?.label}</span>
            <Input className="flex-1" aria-label="Connection label" value={e.label} onChange={(ev) => setDraft({ ...draft, edges: draft.edges.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)) })} />
            <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, edges: draft.edges.filter((_, j) => j !== i) })} aria-label="Remove connection">
              Remove
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Screen 7 — Diagram Explorer. */
export function DiagramExplorerPage() {
  const { id, diagramId } = useParams();
  const navigate = useNavigate();
  const { data: lesson, isLoading, error, refetch } = useLesson(id);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const diagram = lesson?.diagrams.find((d) => d.id === diagramId) ?? lesson?.diagrams[0];
  const replay = useReplay(diagram);

  useEffect(() => {
    setSelected(null);
    replay.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram?.id]);

  if (isLoading) return <PageLoader />;
  if (error || !lesson) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!diagram) {
    return (
      <EmptyState icon={<Network className="h-10 w-10" />} title="No diagrams in this lesson" action={<ButtonLink to={`/lessons/${lesson._id}`}>Back to lesson</ButtonLink>}>
        Diagrams are generated when the material describes systems, flows or procedures and the visual mode includes diagrams.
      </EmptyState>
    );
  }

  const focus = selected ?? replay.current;
  const node = diagram.nodes.find((n) => n.id === focus);
  const related = node ? diagram.edges.filter((e) => e.source === node.id || e.target === node.id) : [];
  const highlight = node ? new Set([node.id, ...related.flatMap((e) => [e.id, e.source, e.target])]) : undefined;
  const section = lesson.sections.find((s) => s.id === diagram.sectionId);
  const label = (nid: string) => diagram.nodes.find((n) => n.id === nid)?.label ?? nid;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <Link to={`/lessons/${lesson._id}`} className="hover:underline">
            {lesson.title}
          </Link>
        }
        title={diagram.title}
        description={diagram.description || undefined}
        actions={
          <>
            {lesson.diagrams.length > 1 && (
              <Select aria-label="Choose diagram" value={diagram.id} onChange={(e) => navigate(`/lessons/${lesson._id}/diagrams/${e.target.value}`)}>
                {lesson.diagrams.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </Select>
            )}
            <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
              Edit labels
            </Button>
            <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => downloadDiagramSvg(diagram)}>
              SVG
            </Button>
            <Button variant="outline" icon={<FileImage className="h-4 w-4" />} onClick={() => void downloadDiagramPng(diagram)}>
              PNG
            </Button>
          </>
        }
      />

      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
            {replay.playing ? (
              <Button size="sm" variant="outline" icon={<Pause className="h-4 w-4" />} onClick={replay.pause}>
                Pause
              </Button>
            ) : (
              <Button size="sm" icon={<Play className="h-4 w-4" />} onClick={replay.play}>
                {replay.step === null ? 'Replay animation' : 'Resume'}
              </Button>
            )}
            {replay.step !== null && (
              <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={replay.reset}>
                Show all
              </Button>
            )}
            <span className="text-xs text-muted ml-auto">{replay.step !== null ? `Step ${Math.min(replay.step, replay.order.length)} of ${replay.order.length}` : 'Scroll to zoom · drag to pan · click a node'}</span>
          </div>
          <div className="h-[560px]">
            <DiagramView diagram={diagram} selectedId={focus} onSelect={setSelected} highlightIds={highlight} visibleIds={replay.visible} minimap />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            {node ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: KIND_COLORS[node.kind] }} />
                  <h2 className="font-semibold text-lg">{node.label}</h2>
                  <Badge className="ml-auto">{node.kind}</Badge>
                </div>
                <p className="text-sm text-text/90">{node.description || 'No description for this component.'}</p>
                {related.length > 0 && (
                  <>
                    <p className="text-xs uppercase tracking-wider text-muted mt-4 mb-2">Relationships</p>
                    <ul className="space-y-1.5 text-sm">
                      {related.map((e) => (
                        <li key={e.id} className="flex items-center gap-1.5 flex-wrap">
                          <button className="text-primary hover:underline" onClick={() => setSelected(e.source)}>
                            {label(e.source)}
                          </button>
                          <ArrowRight className="h-3.5 w-3.5 text-muted" />
                          {e.label && <span className="text-muted">{e.label}</span>}
                          {e.label && <ArrowRight className="h-3.5 w-3.5 text-muted" />}
                          <button className="text-primary hover:underline" onClick={() => setSelected(e.target)}>
                            {label(e.target)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">Select a node to see its role, its connections and related notes.</p>
            )}
          </Card>
          <Card>
            <p className="text-sm font-semibold mb-2">Sequence of events</p>
            <ol className="space-y-1">
              {replay.order.map((nid, i) => (
                <li key={nid}>
                  <button
                    onClick={() => {
                      replay.goTo(i);
                      setSelected(nid);
                    }}
                    className={cn('w-full text-left text-sm rounded-md px-2 py-1 hover:bg-surface-2 flex gap-2', focus === nid && 'bg-surface-2 text-primary')}
                  >
                    <span className="text-muted w-5">{i + 1}.</span> {label(nid)}
                  </button>
                </li>
              ))}
            </ol>
          </Card>
          {section && (
            <Card>
              <p className="text-sm font-semibold mb-1">Related lesson section</p>
              <Link to={`/lessons/${lesson._id}#${section.id}`} className="text-primary hover:underline text-sm">
                {section.title}
              </Link>
              {section.definition && <p className="text-xs text-muted mt-2 line-clamp-4">{section.definition}</p>}
            </Card>
          )}
        </div>
      </div>
      {editing && <DiagramEditor lesson={lesson} diagram={diagram} onClose={() => setEditing(false)} />}
    </div>
  );
}
