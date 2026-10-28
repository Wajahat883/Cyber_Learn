import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Play, RotateCcw, Square, Wifi, WifiOff } from 'lucide-react';
import { GENERATION_STAGES, STAGE_LABELS, type GenerationStage, type StageResult } from '@cyberlearn/shared';
import { api, errorMessage } from '../../lib/api';
import { Card, PageHeader } from '../../components/ui/Card';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, ErrorState, PageLoader, StageIcon, StatusBadge } from '../../components/ui/Feedback';
import { cn } from '../../lib/cn';
import { Steps } from '../../components/ui/Steps';
import type { Generation } from '../../types/models';
import { AnalysisPreview } from './AnalysisPreview';
import { TERMINAL_STATUSES, useGenerationStream } from './useGenerationStream';

const RETRYABLE_COMPLETED: GenerationStage[] = ['diagrams', 'images', 'narration', 'assessment'];
const TERMINAL = TERMINAL_STATUSES;
/** How often to poll the generation record while the live stream is down. */
const POLL_MS = 4000;

/** Screen 4 — Generation Workspace with live progress. */
export function GenerationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Fallback when the SSE connection is down: poll the record so progress still moves.
  const [pollWhileDisconnected, setPollWhileDisconnected] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['generation', id],
    queryFn: () => api.get<{ generation: Generation; project: { _id: string; title: string } }>(`/generations/${id}`),
    refetchInterval: pollWhileDisconnected ? POLL_MS : false,
  });
  const status = data?.generation.status;
  const live = Boolean(status && !TERMINAL.includes(status));
  const { event, connected } = useGenerationStream(id, live || status === 'awaiting_review');
  useEffect(() => setPollWhileDisconnected(live && !connected), [live, connected]);

  // Refetch the full record when the status changes (analysis arrives, lesson created, finished).
  useEffect(() => {
    if (event && event.status !== status) {
      void refetch();
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    }
  }, [event, status, refetch, qc]);

  // A finished run creates or updates a lesson; lesson lists elsewhere must see it.
  // Keyed on the record's status so it fires whether the change came via SSE or polling.
  const prevStatus = useRef(status);
  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = status;
    if (prev && status && !TERMINAL.includes(prev) && TERMINAL.includes(status)) {
      qc.invalidateQueries({ queryKey: ['lessons'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    }
  }, [status, qc]);

  const retry = useMutation({ mutationFn: (stage?: GenerationStage) => api.post(`/generations/${id}/retry`, stage ? { stage } : {}), onSuccess: () => refetch() });
  const cancel = useMutation({ mutationFn: () => api.post(`/generations/${id}/cancel`), onSuccess: () => refetch() });

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const gen = data.generation;

  if (gen.status === 'awaiting_review' && gen.analysis) {
    return (
      <AnalysisPreview
        generationId={gen._id}
        analysis={gen.analysis}
        preferences={gen.preferences}
        onContinued={() => refetch()}
        onCancel={async () => {
          await cancel.mutateAsync();
          navigate(`/projects/${data.project._id}`);
        }}
      />
    );
  }

  const results: StageResult[] = event?.stageResults ?? gen.stageResults;
  const currentStatus = event?.status ?? gen.status;
  const lessonId = event?.lessonId ?? gen.lessonId;
  const byStage = new Map(results.map((r) => [r.stage, r]));
  const done = results.filter((r) => r.status === 'completed' || r.status === 'skipped').length;
  const failedStages = results.filter((r) => r.status === 'failed');
  const running = ['queued', 'running'].includes(currentStatus);
  const errorText = event?.errorMessage ?? gen.errorMessage;

  return (
    <div className="space-y-5 max-w-4xl">
      <Steps current={running ? 2 : 3} />
      <PageHeader
        eyebrow={
          <Link to={`/projects/${data.project._id}`} className="hover:underline">
            {data.project.title}
          </Link>
        }
        title={running ? 'Generating your learning experience' : currentStatus === 'failed' ? 'Generation stopped' : 'Your lesson is ready'}
        description={running ? 'You can leave this page; generation continues in the background.' : undefined}
        actions={
          <>
            {running && (
              <Button variant="danger" icon={<Square className="h-4 w-4" />} loading={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel
              </Button>
            )}
            {lessonId && !running && (
              <>
                <ButtonLink to={`/lessons/${lessonId}`} variant="outline" icon={<BookOpen className="h-4 w-4" />}>
                  Open lesson
                </ButtonLink>
                <ButtonLink to={`/lessons/${lessonId}/present`} icon={<Play className="h-4 w-4" />}>
                  Play presentation
                </ButtonLink>
              </>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge status={currentStatus} />
        {/* Stage count instead of a fabricated percentage (spec 4.6). */}
        <span className="text-muted">
          {done} of {GENERATION_STAGES.length} stages done
        </span>
        {running && (
          <span className={cn('flex items-center gap-1', connected ? 'text-success' : 'text-muted')}>
            {connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />} {connected ? 'live' : 'reconnecting…'}
          </span>
        )}
      </div>

      {errorText && <Alert tone="error">{errorText}</Alert>}
      {(retry.error || cancel.error) && <Alert tone="error">{errorMessage(retry.error ?? cancel.error)}</Alert>}
      {currentStatus === 'partially_completed' && (
        <Alert tone="warning" title="Partially completed">
          The lesson is usable. Some optional media failed — retry those stages below without losing what already worked.
        </Alert>
      )}

      <Card className="p-0 overflow-hidden">
        <ol className="divide-y divide-border">
          {GENERATION_STAGES.map((stage) => {
            const r = byStage.get(stage) ?? { stage, status: 'pending', attempts: 0 };
            return (
              <li key={stage} className={cn('flex items-start gap-3 px-5 py-4', r.status === 'running' && 'bg-primary/5')}>
                <div className="mt-0.5">
                  <StageIcon status={r.status} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('font-medium', r.status === 'pending' && 'text-muted', r.status === 'skipped' && 'text-muted line-through')}>{STAGE_LABELS[stage]}</p>
                  {r.detail && <p className="text-sm text-muted">{r.detail}</p>}
                  {r.error && <p className="text-sm text-error">{r.error}</p>}
                  {r.attempts > 1 && <p className="text-xs text-muted">attempt {r.attempts}</p>}
                </div>
                {r.status === 'failed' && !running && (
                  <Button size="sm" variant="outline" icon={<RotateCcw className="h-4 w-4" />} loading={retry.isPending} onClick={() => retry.mutate(stage)}>
                    Retry
                  </Button>
                )}
                {r.status === 'completed' && !running && RETRYABLE_COMPLETED.includes(stage) && TERMINAL.includes(currentStatus) && currentStatus !== 'cancelled' && (
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => retry.mutate(stage)} title="Generate this stage again">
                    Redo
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      {!running && failedStages.length > 1 && (
        <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} loading={retry.isPending} onClick={() => retry.mutate(undefined)}>
          Retry all failed stages
        </Button>
      )}
      {currentStatus === 'cancelled' && (
        <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} loading={retry.isPending} onClick={() => retry.mutate(undefined)}>
          Resume generation
        </Button>
      )}
    </div>
  );
}
