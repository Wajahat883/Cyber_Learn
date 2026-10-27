import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Circle,
  FileText,
  History,
  Image as ImageIcon,
  Layers,
  Network,
  Lightbulb,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Search,
  Sparkles,
} from 'lucide-react';
import type { LessonSection, ProgressUpdateInput } from '@cyberlearn/shared';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, Badge, ErrorState, PageLoader } from '../../components/ui/Feedback';
import { ConfirmModal } from '../../components/ui/Modal';
import { CopyButton, Markdown } from '../../components/ui/Markdown';
import { DiagramView } from '../../components/diagrams/DiagramView';
import type { Flashcard, Lesson, Progress } from '../../types/models';
import { AskPanel } from './AskPanel';
import { cleanSection, SectionEditor } from './SectionEditor';
import { useLesson, useLessonProgress } from './useLesson';
import { VersionHistory } from './VersionHistory';

const GROUNDING: Record<string, { label: string; tone: 'success' | 'secondary' | 'warning' }> = {
  source: { label: 'From your notes', tone: 'success' },
  mixed: { label: 'Notes + supplementary', tone: 'secondary' },
  supplementary: { label: 'Supplementary explanation', tone: 'warning' },
};

function Block({ title, children, icon, open = true }: { title: string; children: ReactNode; icon?: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-lg border border-border bg-surface/40">
      <summary className="cursor-pointer select-none list-none px-4 py-2.5 font-semibold text-sm flex items-center gap-2 text-text/90 [&::-webkit-details-marker]:hidden">
        <span className="text-primary">{icon}</span>
        {title}
        <span className="ml-auto text-muted text-xs group-open:rotate-90 transition-transform">▶</span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function sectionText(s: LessonSection) {
  return [s.title, s.definition, s.explanation, s.whyItMatters, s.howItWorks, s.example, s.practicalApplication, s.summary, ...s.commonMistakes, ...s.keyConcepts].join(' ').toLowerCase();
}

function SectionView({ lesson, section, progress, query, onProgress, busy }: { lesson: Lesson; section: LessonSection; progress?: Progress; query: string; onProgress: (u: ProgressUpdateInput) => void; busy: boolean }) {
  const qc = useQueryClient();
  const [confirmRegen, setConfirmRegen] = useState(false);
  const understood = progress?.completedSections.includes(section.id);
  const bookmarked = progress?.bookmarks.includes(section.id);
  const grounding = GROUNDING[section.grounding] ?? GROUNDING.mixed;
  const diagrams = lesson.diagrams.filter((d) => d.sectionId === section.id);
  const matches = query && sectionText(section).includes(query.toLowerCase());
  const refresh = (l: Lesson) => qc.setQueryData(['lesson', lesson._id], l);

  const examples = useMutation({ mutationFn: () => api.post<{ lesson: Lesson }>(`/lessons/${lesson._id}/sections/${section.id}/examples`), onSuccess: (r) => refresh(r.lesson) });
  const regenerate = useMutation({
    mutationFn: () => api.post<{ lesson: Lesson }>(`/lessons/${lesson._id}/sections/${section.id}/regenerate`),
    onSuccess: (r) => {
      refresh(r.lesson);
      setConfirmRegen(false);
    },
  });

  return (
    <section id={section.id} className={cn('scroll-mt-24 rounded-xl border bg-surface p-5 sm:p-6 space-y-4', matches ? 'border-primary ring-1 ring-primary/40' : 'border-border', query && !matches && 'opacity-50')}>
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{section.title}</h2>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge tone={grounding.tone}>{grounding.label}</Badge>
            {section.keyConcepts.slice(0, 6).map((k) => (
              <Badge key={k}>{k}</Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <Button size="sm" variant={understood ? 'secondary' : 'outline'} disabled={busy} onClick={() => onProgress(understood ? { uncompletedSectionId: section.id } : { completedSectionId: section.id })} icon={understood ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />} aria-pressed={understood}>
            {understood ? 'Understood' : 'Mark understood'}
          </Button>
          <Button size="icon" variant="ghost" disabled={busy} onClick={() => onProgress(bookmarked ? { unbookmarkSectionId: section.id } : { bookmarkSectionId: section.id })} aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark section'} aria-pressed={bookmarked}>
            {bookmarked ? <BookmarkCheck className="h-4 w-4 text-warning" /> : <Bookmark className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {section.definition && (
        <div className="rounded-lg border-l-4 border-primary bg-primary/5 px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-primary mb-1">Definition</p>
          <Markdown>{section.definition}</Markdown>
        </div>
      )}
      {section.explanation && (
        <Block title="Detailed explanation" icon={<FileText className="h-4 w-4" />}>
          <Markdown>{section.explanation}</Markdown>
        </Block>
      )}
      {section.whyItMatters && (
        <Block title="Why it matters" icon={<Lightbulb className="h-4 w-4" />}>
          <Markdown>{section.whyItMatters}</Markdown>
        </Block>
      )}
      {section.howItWorks && (
        <Block title="How it works" icon={<Layers className="h-4 w-4" />}>
          <Markdown>{section.howItWorks}</Markdown>
        </Block>
      )}
      {diagrams.map((d) => (
        <div key={d.id} className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <p className="text-sm font-semibold">{d.title}</p>
            <Link to={`/lessons/${lesson._id}/diagrams/${d.id}`} className="text-xs text-primary hover:underline">
              Open in Diagram Explorer
            </Link>
          </div>
          <div className="h-[340px]">
            <DiagramView diagram={d} />
          </div>
        </div>
      ))}
      {section.example && (
        <Block title="Technical example" icon={<Sparkles className="h-4 w-4" />}>
          <Markdown>{section.example}</Markdown>
        </Block>
      )}
      {section.codeSnippets.map((c, i) => (
        <div key={i} className="relative">
          <pre className="bg-[#070b16] border border-border rounded-lg p-4 overflow-x-auto text-sm font-mono">
            <code>{c.code}</code>
          </pre>
          <CopyButton text={c.code} />
          {c.caption && <p className="text-xs text-muted mt-1">{c.caption}</p>}
        </div>
      ))}
      {section.commonMistakes.length > 0 && (
        <Block title="Common mistakes" icon={<AlertTriangle className="h-4 w-4" />}>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {section.commonMistakes.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Block>
      )}
      {section.practicalApplication && (
        <Block title="Practical application" icon={<Play className="h-4 w-4" />} open={false}>
          <Markdown>{section.practicalApplication}</Markdown>
        </Block>
      )}
      {section.supplementaryNotes.length > 0 && (
        <div className="rounded-lg border border-secondary/40 bg-secondary/5 px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-secondary mb-1">Supplementary explanation — not in your notes</p>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {section.supplementaryNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {section.summary && (
        <div className="rounded-lg bg-surface-2 px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Key takeaway</p>
          <Markdown>{section.summary}</Markdown>
        </div>
      )}
      <footer className="flex flex-wrap gap-2 pt-2 border-t border-border">
        <Button size="sm" variant="ghost" icon={<Sparkles className="h-4 w-4" />} loading={examples.isPending} onClick={() => examples.mutate()}>
          Generate more examples
        </Button>
        <Button size="sm" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setConfirmRegen(true)}>
          Regenerate section
        </Button>
      </footer>
      {(examples.error || regenerate.error) && <Alert tone="error">{errorMessage(examples.error ?? regenerate.error)}</Alert>}
      <ConfirmModal
        open={confirmRegen}
        onClose={() => setConfirmRegen(false)}
        onConfirm={() => regenerate.mutate()}
        loading={regenerate.isPending}
        title="Regenerate this section?"
        confirmLabel="Regenerate"
      >
        The section is rewritten from your source material. The current text is saved in version history first.
      </ConfirmModal>
    </section>
  );
}

function useStudyTimer(lessonId: string | undefined, onTick: (seconds: number) => void) {
  const tick = useRef(onTick);
  tick.current = onTick;
  useEffect(() => {
    if (!lessonId) return;
    let seconds = 0;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && document.hasFocus()) seconds += 5;
      if (seconds >= 60) {
        tick.current(seconds);
        seconds = 0;
      }
    }, 5000);
    return () => {
      clearInterval(interval);
      if (seconds >= 15) tick.current(seconds);
    };
  }, [lessonId]);
}

/** Screen 5 — Lesson Viewer. */
export function LessonViewerPage() {
  const { id } = useParams();
  const location = useLocation();
  const qc = useQueryClient();
  const { data: lesson, isLoading, error, refetch } = useLesson(id);
  const { data: progress } = useLessonProgress(id);
  const { data: flashcards } = useQuery({
    queryKey: ['flashcards', id],
    queryFn: async () => (await api.get<{ flashcards: Flashcard[] }>(`/lessons/${id}/flashcards`)).flashcards,
    enabled: Boolean(id),
    retry: false,
  });
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LessonSection[] | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [historyOpen, setHistoryOpen] = useState(false);

  const updateProgress = useMutation({
    mutationFn: (body: ProgressUpdateInput) => api.patch<{ progress: Progress }>(`/lessons/${id}/progress`, body),
    onSuccess: (r) => {
      qc.setQueryData(['lesson-progress', id], r.progress);
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  useStudyTimer(id, (seconds) => updateProgress.mutate({ addTimeSeconds: seconds }));

  // Jump to a section from a link like /lessons/:id#section-id.
  useEffect(() => {
    const hash = location.hash.slice(1);
    if (hash && lesson) {
      setActive(hash);
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }));
    }
  }, [location.hash, lesson]);

  // Autosave edits (spec 17), debounced.
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const save = useCallback(
    async (sections: LessonSection[]) => {
      setSaveState('saving');
      try {
        const res = await api.patch<{ lesson: Lesson }>(`/lessons/${id}`, { sections: sections.map(cleanSection) });
        qc.setQueryData(['lesson', id], res.lesson);
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    },
    [id, qc],
  );
  const onEdit = (section: LessonSection) => {
    const next = (draft ?? lesson!.sections).map((s) => (s.id === section.id ? section : s));
    setDraft(next);
    setSaveState('idle');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(next), 1500);
  };
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const matchCount = useMemo(() => (query && lesson ? lesson.sections.filter((s) => sectionText(s).includes(query.toLowerCase())).length : 0), [query, lesson]);

  if (isLoading) return <PageLoader />;
  if (error || !lesson) return <ErrorState error={error} onRetry={() => refetch()} />;

  const sections = editing ? draft ?? lesson.sections : lesson.sections;
  const current = sections.find((s) => s.id === active) ?? sections[0];
  const done = progress?.completedSections.length ?? 0;
  const relatedCards = (flashcards ?? []).filter((c) => !current || c.sectionId === current.id).slice(0, 4);

  const jump = (sid: string) => {
    setActive(sid);
    document.getElementById(sid)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-5">
        <div className="min-w-0">
          <Link to={`/projects/${lesson.projectId}`} className="text-xs uppercase tracking-widest text-primary">
            {lesson.subject || 'Lesson'}
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{lesson.title}</h1>
          <p className="text-sm text-muted mt-1">
            {lesson.sections.length} sections · {done} understood · version {lesson.version}
            {lesson.generationStatus === 'partial' && ' · some media still needs a retry'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this lesson"
              aria-label="Search within lesson"
              className="h-10 w-56 rounded-lg border border-border bg-surface pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
            />
            {query && <span className="absolute -bottom-5 left-1 text-xs text-muted">{matchCount} matching sections</span>}
          </div>
          {lesson.diagrams.length > 0 && (
            <ButtonLink to={`/lessons/${lesson._id}/diagrams`} variant="outline" icon={<Network className="h-4 w-4" />}>
              Diagrams
            </ButtonLink>
          )}
          <ButtonLink to={`/lessons/${lesson._id}/gallery`} variant="outline" icon={<ImageIcon className="h-4 w-4" />}>
            Gallery
          </ButtonLink>
          <Button variant="outline" icon={<History className="h-4 w-4" />} onClick={() => setHistoryOpen(true)}>
            History
          </Button>
          {editing ? (
            <Button
              variant="secondary"
              icon={<Save className="h-4 w-4" />}
              onClick={async () => {
                clearTimeout(saveTimer.current);
                if (draft) await save(draft);
                setEditing(false);
                setDraft(null);
              }}
            >
              Done editing
            </Button>
          ) : (
            <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <ButtonLink to={`/lessons/${lesson._id}/present`} icon={<Play className="h-4 w-4" />}>
            Play presentation
          </ButtonLink>
        </div>
      </div>
      {editing && (
        <p className="text-sm mb-3 text-muted" aria-live="polite">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : saveState === 'error' ? <span className="text-error">Could not save — check your connection</span> : 'Changes save automatically'}
        </p>
      )}
      {lesson.warnings.length > 0 && !editing && (
        <div className="mb-4 space-y-2">
          {lesson.warnings.map((w) => (
            <Alert key={w} tone="warning">
              {w}
            </Alert>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_300px] gap-5">
        <nav aria-label="Lesson outline" className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs uppercase tracking-wider text-muted px-2 mb-2">Outline</p>
            <div className="h-1.5 rounded-full bg-border mx-2 mb-3 overflow-hidden" role="progressbar" aria-valuenow={done} aria-valuemax={lesson.sections.length} aria-label="Sections understood">
              <div className="h-full bg-success" style={{ width: `${(done / Math.max(1, lesson.sections.length)) * 100}%` }} />
            </div>
            <ol className="space-y-0.5">
              {sections.map((s, i) => {
                const isDone = progress?.completedSections.includes(s.id);
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => jump(s.id)}
                      className={cn('w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2', current?.id === s.id && 'bg-surface-2 text-primary')}
                    >
                      {isDone ? <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" /> : <span className="text-muted text-xs w-4 shrink-0 mt-0.5">{i + 1}</span>}
                      <span className="flex-1">{s.title}</span>
                      {progress?.bookmarks.includes(s.id) && <Bookmark className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </nav>

        <div className="space-y-5 min-w-0">
          {lesson.learningObjectives.length > 0 && !editing && (
            <div className="rounded-xl border border-border bg-surface p-5">
              <p className="text-sm font-semibold mb-2">Learning objectives</p>
              <ul className="list-disc pl-5 text-sm space-y-1 text-text/90">
                {lesson.learningObjectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          {sections.map((s) =>
            editing ? (
              <section key={s.id} id={s.id} className="rounded-xl border border-border bg-surface p-5">
                <SectionEditor section={s} onChange={onEdit} />
              </section>
            ) : (
              <SectionView key={s.id} lesson={lesson} section={s} progress={progress} query={query} onProgress={(u) => updateProgress.mutate(u)} busy={updateProgress.isPending} />
            ),
          )}
        </div>

        <aside className="hidden xl:block space-y-4 xl:sticky xl:top-20 xl:self-start xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
          {current && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold mb-2">Key concepts</p>
              <div className="flex flex-wrap gap-1.5">
                {current.keyConcepts.length ? current.keyConcepts.map((k) => <Badge key={k} tone="primary">{k}</Badge>) : <span className="text-sm text-muted">None listed</span>}
              </div>
              {lesson.keyTerms.filter((t) => current.keyConcepts.some((k) => t.term.startsWith(k))).slice(0, 4).map((t) => (
                <p key={t.term} className="text-xs text-muted mt-2">
                  <span className="text-text font-medium">{t.term}:</span> {t.definition}
                </p>
              ))}
            </div>
          )}
          {relatedCards.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold mb-2">Related flashcards</p>
              <ul className="space-y-2">
                {relatedCards.map((c) => (
                  <li key={c._id} className="text-sm">
                    <details>
                      <summary className="cursor-pointer">{c.front}</summary>
                      <p className="text-muted mt-1">{c.back}</p>
                    </details>
                  </li>
                ))}
              </ul>
              <Link to={`/revision?tab=flashcards&lessonId=${lesson._id}`} className="text-xs text-primary mt-2 inline-block">
                Study all flashcards
              </Link>
            </div>
          )}
          <div className="rounded-xl border border-border bg-surface p-4">
            <AskPanel lessonId={lesson._id} sectionId={current?.id} sectionTitle={current?.title} />
          </div>
          {current && current.warnings.length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
              <p className="text-sm font-semibold mb-2 flex items-center gap-2 text-warning">
                <AlertTriangle className="h-4 w-4" /> Important warnings
              </p>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {current.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {current && current.sourceRefs.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold mb-2">Source references</p>
              <ul className="space-y-2">
                {current.sourceRefs.slice(0, 5).map((r, i) => (
                  <li key={i} className="text-xs text-muted border-l-2 border-border pl-2">
                    <span className="text-text">Chunk {r.chunkIndex + 1}</span> — {r.excerpt}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
      <VersionHistory lessonId={lesson._id} open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
