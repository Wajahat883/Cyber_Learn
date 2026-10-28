import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, CheckCircle2, FileText, History, Image as ImageIcon, Info, Layers, MoreHorizontal, Network, Pencil, Play, Save, Search } from 'lucide-react';
import type { LessonSection, ProgressUpdateInput } from '@cyberlearn/shared';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Button, ButtonLink, buttonClass } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { Badge, ErrorState, PageLoader } from '../../components/ui/Feedback';
import type { Flashcard, Progress } from '../../types/models';
import { LessonRail } from './LessonRail';
import { sectionText, SectionView } from './SectionView';
import { useLesson, useLessonProgress } from './useLesson';
import { useLessonAutosave } from './useLessonAutosave';
import { useStudyTimer } from './useStudyTimer';
import { VersionHistory } from './VersionHistory';

// The rich-text editor (TipTap) is only needed while editing; keep it out of the reading bundle.
const SectionEditor = lazy(async () => ({ default: (await import('./SectionEditor')).SectionEditor }));

/** The nearest ancestor that scrolls (the app shell scrolls its content area, not the window). */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [comparing, setComparing] = useState<string | null>(null);
  // Clicking the outline scrolls smoothly; scroll-spy must not fight that scroll.
  const jumping = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  // Autosave edits (spec 17), debounced; flushed when leaving the lesson.
  const { saveState, schedule, saveNow } = useLessonAutosave(id);
  const onEdit = (section: LessonSection) => {
    const next = (draft ?? lesson!.sections).map((s) => (s.id === section.id ? section : s));
    setDraft(next);
    schedule(next);
  };

  // Scroll-spy: the outline and the rail follow the section being read.
  const sectionIds = lesson?.sections.map((x) => x.id).join('|');
  useEffect(() => {
    if (!sectionIds || editing) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        if (jumping.current || !visible.size) return;
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0][0];
        setActive(top);
      },
      // A section counts as "being read" while it crosses the upper part of the screen.
      { rootMargin: '-80px 0px -55% 0px' },
    );
    const ids = sectionIds.split('|');
    for (const sid of ids) {
      const el = document.getElementById(sid);
      if (el) observer.observe(el);
    }
    // A short last section never reaches the reading zone; at the bottom of the page it is the one being read.
    const scroller = scrollParent(document.getElementById(ids[0]));
    const onScroll = () => {
      const atBottom = scroller ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4 : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (!jumping.current && atBottom) setActive(ids[ids.length - 1]);
    };
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      target.removeEventListener('scroll', onScroll);
    };
  }, [sectionIds, editing]);

  const matchCount = useMemo(() => (query && lesson ? lesson.sections.filter((s) => sectionText(s).includes(query.toLowerCase())).length : 0), [query, lesson]);

  if (isLoading) return <PageLoader />;
  if (error || !lesson) return <ErrorState error={error} onRetry={() => refetch()} />;

  const sections = editing ? draft ?? lesson.sections : lesson.sections;
  const current = sections.find((s) => s.id === active) ?? sections[0];
  const done = progress?.completedSections.length ?? 0;
  const relatedCards = (flashcards ?? []).filter((c) => !current || c.sectionId === current.id).slice(0, 4);

  const jump = (sid: string) => {
    setActive(sid);
    clearTimeout(jumping.current);
    jumping.current = setTimeout(() => (jumping.current = undefined), 900);
    document.getElementById(sid)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-[13px] text-muted mb-2">
            <Link to="/library" className="hover:text-text">
              Library
            </Link>
            <span className="mx-1.5">/</span>
            <Link to={`/projects/${lesson.projectId}`} className="hover:text-text">
              {lesson.subject || 'Lesson'}
            </Link>
          </nav>
          <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight leading-tight">{lesson.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-muted">
            <span>{lesson.sections.length} sections</span>
            <span aria-hidden>·</span>
            <span>
              {done} of {lesson.sections.length} understood
            </span>
            <span aria-hidden>·</span>
            <span>version {lesson.version}</span>
            {lesson.generationStatus === 'partial' && <Badge tone="warning">some media still needs a retry</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <Button
              variant="secondary"
              icon={<Save className="h-4 w-4" />}
              onClick={async () => {
                if (draft) await saveNow(draft);
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
          <Menu
            label="More lesson actions"
            trigger={<MoreHorizontal className="h-4 w-4" />}
            triggerClassName={buttonClass('outline', 'icon', 'h-10 w-10')}
            items={[
              ...(lesson.diagrams.length ? [{ label: 'Diagrams', icon: <Network />, to: `/lessons/${lesson._id}/diagrams` }] : []),
              { label: 'Gallery', icon: <ImageIcon />, to: `/lessons/${lesson._id}/gallery` },
              { label: 'History', icon: <History />, onSelect: () => setHistoryOpen(true) },
              { label: 'Flashcards & quizzes', icon: <Layers />, to: `/revision?tab=flashcards&lessonId=${lesson._id}` },
              { label: 'Project & exports', icon: <FileText />, to: `/projects/${lesson.projectId}` },
            ]}
          />
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
        <details className="mb-5 rounded-xl border border-warning/30 bg-warning/5 px-4 py-2.5 text-sm">
          <summary className="cursor-pointer flex items-center gap-2 text-warning font-medium">
            <Info className="h-4 w-4" /> {lesson.warnings.length} note{lesson.warnings.length === 1 ? '' : 's'} about this lesson
          </summary>
          <ul className="mt-2 mb-1 list-disc pl-6 space-y-1 text-text/90">
            {lesson.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      <div className={cn('grid lg:grid-cols-[230px_minmax(0,1fr)] gap-6', !comparing && 'xl:grid-cols-[230px_minmax(0,1fr)_320px]')}>
        <nav aria-label="Lesson outline" className="lg:sticky lg:top-20 lg:self-start space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this lesson"
              aria-label="Search within lesson"
              className="h-9 w-full rounded-[10px] border border-border bg-surface pl-9 pr-3 text-sm shadow-card focus:border-primary focus:outline-none"
            />
          </div>
          {query && <p className="text-xs text-muted px-1">{matchCount} matching sections</p>}
          <div className="rounded-2xl border border-border bg-surface p-3 shadow-card">
            <div className="flex items-center justify-between px-2 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Outline</p>
              <span className="text-[11px] text-muted tabular-nums">
                {done}/{lesson.sections.length}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 mx-2 mb-3 overflow-hidden" role="progressbar" aria-valuenow={done} aria-valuemax={lesson.sections.length} aria-label="Sections understood">
              <div className="h-full bg-success rounded-full" style={{ width: `${(done / Math.max(1, lesson.sections.length)) * 100}%` }} />
            </div>
            <ol className="space-y-0.5">
              {sections.map((s, i) => {
                const isDone = progress?.completedSections.includes(s.id);
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => jump(s.id)}
                      className={cn('w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2', current?.id === s.id && 'bg-primary-soft text-primary font-medium')}
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
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">You will learn to</p>
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
                <Suspense fallback={<p className="text-sm text-muted">Loading editor…</p>}>
                  <SectionEditor section={s} onChange={onEdit} />
                </Suspense>
              </section>
            ) : (
              <SectionView
                key={s.id}
                lesson={lesson}
                section={s}
                progress={progress}
                query={query}
                onProgress={(u) => updateProgress.mutate(u)}
                busy={updateProgress.isPending}
                comparing={comparing === s.id}
                onCompare={(on) => setComparing(on ? s.id : null)}
              />
            ),
          )}
        </div>

        <aside className={cn('hidden xl:sticky xl:top-20 xl:self-start', !comparing && 'xl:block')}>
          <LessonRail lesson={lesson} current={current} relatedCards={relatedCards} />
        </aside>
      </div>
      <VersionHistory lessonId={lesson._id} open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
