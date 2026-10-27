import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Download, Eye, FileText, History, Play, Plus, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import { ALLOWED_UPLOAD_EXTENSIONS, type GenerationPreferences } from '@cyberlearn/shared';
import { api, API_BASE, errorMessage } from '../../lib/api';
import { Card, CardTitle, PageHeader } from '../../components/ui/Card';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Textarea, Input, Toggle } from '../../components/ui/Field';
import { Alert, Badge, EmptyState, ErrorState, PageLoader, StatusBadge } from '../../components/ui/Feedback';
import { ConfirmModal, Modal } from '../../components/ui/Modal';
import { formatBytes, timeAgo } from '../../utils/format';
import type { Generation, Project, Source, SourceChunk } from '../../types/models';
import { PreferencesForm, uploadFile, validateFile } from './CreateLessonPage';
import { ExportPanel } from '../exports/ExportPanel';

interface ProjectDetail {
  project: Project;
  sources: Source[];
  generations: Generation[];
  lesson: { _id: string; title: string; generationStatus: string; version: number; updatedAt: string; sections: { id: string; title: string }[] } | null;
  presentation: { _id: string; title: string; version: number; status: string } | null;
}

function SourceViewer({ sourceId, onClose }: { sourceId: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['source', sourceId],
    queryFn: () => api.get<{ source: Source; chunks: SourceChunk[] }>(`/sources/${sourceId}`),
    enabled: Boolean(sourceId),
  });
  return (
    <Modal open={Boolean(sourceId)} onClose={onClose} title={data?.source.title ?? 'Source material'} wide>
      {isLoading || !data ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge>{data.source.sourceType === 'upload' ? data.source.originalFilename : 'pasted text'}</Badge>
            <Badge>{data.source.chunkCount} chunks</Badge>
            {data.source.metadata.pageCount > 0 && <Badge>{data.source.metadata.pageCount} pages</Badge>}
            <a href={`${API_BASE}/sources/${data.source._id}/original`} className="text-primary flex items-center gap-1">
              <Download className="h-3 w-3" /> Download original
            </a>
          </div>
          {data.chunks.map((c) => (
            <div key={c.index} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted mb-1">
                Chunk {c.index + 1}
                {c.heading && ` · ${c.heading}`}
                {c.page > 0 && ` · page ${c.page}`}
              </p>
              <pre className="whitespace-pre-wrap text-sm font-sans text-text/90">{c.text}</pre>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [deletingSource, setDeletingSource] = useState<Source | null>(null);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [prefs, setPrefs] = useState<GenerationPreferences | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [reviewPlan, setReviewPlan] = useState(true);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get<ProjectDetail>(`/projects/${id}`),
    refetchInterval: (q) => (q.state.data?.generations.some((g) => ['queued', 'running'].includes(g.status)) ? 4000 : false),
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['project', id] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };

  const addText = useMutation({
    mutationFn: () => api.post(`/projects/${id}/sources/text`, { title: newTitle.trim() || 'Notes', text: newText }),
    onSuccess: () => {
      setAdding(false);
      setNewText('');
      setNewTitle('');
      invalidate();
    },
    onError: (err) => setMessage({ tone: 'error', text: errorMessage(err) }),
  });
  const removeSource = useMutation({ mutationFn: (sourceId: string) => api.delete(`/sources/${sourceId}`), onSuccess: invalidate });
  const startGeneration = useMutation({
    mutationFn: (body: { sourceIds: string[]; preferences: GenerationPreferences; autoContinue: boolean }) =>
      api.post<{ generation: Generation }>(`/projects/${id}/generations`, body),
    onSuccess: (res) => navigate(`/generations/${res.generation._id}`),
    onError: (err) => setMessage({ tone: 'error', text: errorMessage(err) }),
  });

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const { project, sources, generations, lesson, presentation } = data;
  const readySources = sources.filter((s) => s.extractionStatus === 'completed');
  const chosen = selected ?? readySources.map((s) => s._id);

  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    for (const file of [...list]) {
      const problem = validateFile(file);
      if (problem) {
        setMessage({ tone: 'error', text: `${file.name}: ${problem}` });
        continue;
      }
      try {
        await uploadFile(project._id, file);
        setMessage({ tone: 'success', text: `${file.name} uploaded` });
      } catch (err) {
        setMessage({ tone: 'error', text: `${file.name}: ${errorMessage(err)}` });
      }
    }
    invalidate();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<Link to="/library">My Library</Link>}
        title={project.title}
        description={project.description || (project.subject ? `Detected subject: ${project.subject}` : undefined)}
        actions={
          <>
            {lesson && (
              <>
                <ButtonLink to={`/lessons/${lesson._id}`} variant="outline" icon={<BookOpen className="h-4 w-4" />}>
                  Open lesson
                </ButtonLink>
                {presentation && (
                  <ButtonLink to={`/lessons/${lesson._id}/present`} variant="outline" icon={<Play className="h-4 w-4" />}>
                    Play presentation
                  </ButtonLink>
                )}
              </>
            )}
            <Button
              icon={<Sparkles className="h-4 w-4" />}
              disabled={!readySources.length}
              onClick={() => {
                setPrefs(project.preferences);
                setGenerateOpen(true);
              }}
            >
              {lesson ? 'Regenerate' : 'Generate lesson'}
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted">Content</span> <StatusBadge status={project.status.content} />
        <span className="text-sm text-muted ml-2">Media</span> <StatusBadge status={project.status.media} />
        <span className="text-sm text-muted ml-2">Export</span> <StatusBadge status={project.status.export} />
        {project.tags.map((t) => (
          <Link key={t} to={`/library?tag=${encodeURIComponent(t)}`}>
            <Badge>#{t}</Badge>
          </Link>
        ))}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardTitle
            icon={<FileText className="h-4 w-4" />}
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
                  Paste text
                </Button>
                <Button size="sm" variant="outline" icon={<UploadCloud className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
                  Upload
                </Button>
                <input ref={fileRef} type="file" hidden multiple accept={ALLOWED_UPLOAD_EXTENSIONS.join(',')} onChange={(e) => onFiles(e.target.files)} />
              </div>
            }
          >
            Source material
          </CardTitle>
          {sources.length === 0 ? (
            <EmptyState title="No sources yet">Paste text or upload a PDF, DOCX, TXT or Markdown file to start.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {sources.map((s) => (
                <li key={s._id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.title}</p>
                    <p className="text-xs text-muted">
                      {s.sourceType === 'upload' ? `${s.originalFilename} · ${formatBytes(s.sizeBytes)}` : 'Pasted text'} · {s.charCount.toLocaleString()} characters · {s.chunkCount} chunks · added{' '}
                      {timeAgo(s.createdAt)}
                    </p>
                    {s.extractionError && <p className="text-xs text-error mt-1">{s.extractionError}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <StatusBadge status={s.extractionStatus} />
                    <Button size="icon" variant="ghost" onClick={() => setViewing(s._id)} aria-label={`View ${s.title}`}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeletingSource(s)} aria-label={`Delete ${s.title}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardTitle icon={<History className="h-4 w-4" />}>Generation history</CardTitle>
            {generations.length === 0 ? (
              <p className="text-sm text-muted">No generations yet.</p>
            ) : (
              <ul className="space-y-2">
                {generations.map((g) => (
                  <li key={g._id}>
                    <Link to={`/generations/${g._id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2 text-sm">
                      <span className="text-muted">{timeAgo(g.createdAt)}</span>
                      <StatusBadge status={g.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {lesson && (
            <Card>
              <CardTitle icon={<BookOpen className="h-4 w-4" />}>Lesson</CardTitle>
              <p className="font-medium">{lesson.title}</p>
              <p className="text-xs text-muted mb-3">
                {lesson.sections.length} sections · version {lesson.version} · updated {timeAgo(lesson.updatedAt)}
              </p>
              <ol className="text-sm space-y-1 list-decimal pl-5 text-muted">
                {lesson.sections.slice(0, 8).map((s) => (
                  <li key={s.id}>
                    <Link to={`/lessons/${lesson._id}#${s.id}`} className="hover:text-primary">
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ol>
            </Card>
          )}
          {lesson && <ExportPanel lessonId={lesson._id} presentationId={presentation?._id ?? null} />}
        </div>
      </div>

      <SourceViewer sourceId={viewing} onClose={() => setViewing(null)} />
      <ConfirmModal
        open={Boolean(deletingSource)}
        onClose={() => setDeletingSource(null)}
        title="Remove source?"
        danger
        confirmLabel="Remove"
        loading={removeSource.isPending}
        onConfirm={async () => {
          if (deletingSource) await removeSource.mutateAsync(deletingSource._id);
          setDeletingSource(null);
        }}
      >
        The original file and extracted text of <strong className="text-text">{deletingSource?.title}</strong> will be deleted. Generated lessons are kept.
      </ConfirmModal>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add pasted text"
        wide
        footer={
          <Button loading={addText.isPending} disabled={newText.trim().length < 20} onClick={() => addText.mutate()}>
            Add source
          </Button>
        }
      >
        <div className="space-y-3">
          <Input label="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Lecture 3 notes" />
          <Textarea label="Text" value={newText} onChange={(e) => setNewText(e.target.value)} className="[&_textarea]:min-h-[260px]" />
        </div>
      </Modal>
      <Modal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title={lesson ? 'Regenerate learning experience' : 'Generate learning experience'}
        wide
        footer={
          <Button
            icon={<Sparkles className="h-4 w-4" />}
            loading={startGeneration.isPending}
            disabled={!chosen.length || !prefs}
            onClick={() => prefs && startGeneration.mutate({ sourceIds: chosen, preferences: prefs, autoContinue: !reviewPlan })}
          >
            Generate
          </Button>
        }
      >
        <div className="space-y-5">
          {lesson && <Alert tone="info">The current lesson is saved to its version history before it is replaced.</Alert>}
          <div>
            <p className="text-sm font-medium mb-2">Sources to use</p>
            <ul className="space-y-1">
              {readySources.map((s) => (
                <li key={s._id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-[var(--color-primary)]"
                      checked={chosen.includes(s._id)}
                      onChange={(e) => setSelected(e.target.checked ? [...chosen, s._id] : chosen.filter((x) => x !== s._id))}
                    />
                    {s.title}
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <Toggle label="Review the plan first" description="Pause after analysis to edit the plan" checked={reviewPlan} onChange={setReviewPlan} />
          {prefs && <PreferencesForm value={prefs} onChange={setPrefs} />}
        </div>
      </Modal>
    </div>
  );
}
