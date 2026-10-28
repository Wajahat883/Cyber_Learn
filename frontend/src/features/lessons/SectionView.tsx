import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bookmark, BookmarkCheck, CheckCircle2, Circle, Columns2, Layers, MoreHorizontal, RefreshCw, Sparkles } from 'lucide-react';
import type { LessonSection, ProgressUpdateInput } from '@cyberlearn/shared';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Button, buttonClass } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { Alert, Badge } from '../../components/ui/Feedback';
import { ConfirmModal } from '../../components/ui/Modal';
import { CopyButton, Markdown } from '../../components/ui/Markdown';
import { InlineDiagram } from '../../components/diagrams/InlineDiagram';
import type { Lesson, Progress } from '../../types/models';
import { GoDeeper } from './GoDeeper';
import { SourcePane } from './SourcePane';

const GROUNDING: Record<string, { label: string; tone: 'success' | 'secondary' | 'warning' }> = {
  source: { label: 'From your notes', tone: 'success' },
  mixed: { label: 'Notes + supplementary', tone: 'secondary' },
  supplementary: { label: 'Supplementary explanation', tone: 'warning' },
};

export function sectionText(s: LessonSection) {
  return [s.title, s.definition, s.explanation, s.whyItMatters, s.howItWorks, s.example, s.practicalApplication, s.summary, ...s.commonMistakes, ...s.keyConcepts].join(' ').toLowerCase();
}

export function SectionView({
  lesson,
  section,
  progress,
  query,
  onProgress,
  busy,
  comparing,
  onCompare,
}: {
  lesson: Lesson;
  section: LessonSection;
  progress?: Progress;
  query: string;
  onProgress: (u: ProgressUpdateInput) => void;
  busy: boolean;
  comparing: boolean;
  onCompare: (on: boolean) => void;
}) {
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
    <section id={section.id} className={cn('scroll-mt-24 rounded-2xl border bg-surface p-6 sm:p-8 space-y-5 shadow-card', matches ? 'border-primary ring-4 ring-primary/15' : 'border-border', query && !matches && 'opacity-40')}>
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-bold leading-tight">{section.title}</h2>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge tone={grounding.tone}>{grounding.label}</Badge>
            {section.sourceRefs.length === 0 && section.grounding !== 'supplementary' && <span className="self-center text-xs text-muted">No source citation</span>}
            {section.keyConcepts.slice(0, 3).map((k) => (
              <Badge key={k}>{k}</Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {section.sourceRefs.length > 0 && (
            <Button size="sm" variant={comparing ? 'secondary' : 'ghost'} onClick={() => onCompare(!comparing)} icon={<Columns2 className="h-4 w-4" />} aria-pressed={comparing}>
              {comparing ? 'Hide notes' : 'Compare with notes'}
            </Button>
          )}
          <Button size="sm" variant={understood ? 'secondary' : 'outline'} disabled={busy} onClick={() => onProgress(understood ? { uncompletedSectionId: section.id } : { completedSectionId: section.id })} icon={understood ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />} aria-pressed={understood}>
            {understood ? 'Understood' : 'Mark understood'}
          </Button>
          <Button size="icon" variant="ghost" disabled={busy} onClick={() => onProgress(bookmarked ? { unbookmarkSectionId: section.id } : { bookmarkSectionId: section.id })} aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark section'} aria-pressed={bookmarked}>
            {bookmarked ? <BookmarkCheck className="h-4 w-4 text-warning" /> : <Bookmark className="h-4 w-4" />}
          </Button>
          <Menu
            label="Section actions"
            trigger={examples.isPending || regenerate.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
            triggerClassName={buttonClass('ghost', 'icon')}
            items={[
              { label: 'Generate more examples', icon: <Sparkles />, onSelect: () => examples.mutate(), disabled: examples.isPending },
              { label: 'Regenerate section', icon: <RefreshCw />, onSelect: () => setConfirmRegen(true) },
            ]}
          />
        </div>
      </header>

      <div className={cn(comparing && 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]')}>
        <div className="space-y-5 min-w-0">
          {section.definition && (
            <div className="rounded-xl border-l-4 border-primary bg-primary-soft/60 px-5 py-4">
              <p className="text-xs uppercase tracking-wider text-primary mb-1">Definition</p>
              <Markdown>{section.definition}</Markdown>
            </div>
          )}
          {/* The core explanation reads as one flowing text, not a stack of boxes. */}
          <div className="space-y-4 leading-relaxed">
            {section.explanation && <Markdown>{section.explanation}</Markdown>}
            {section.howItWorks && (
              <>
                <h3 className="text-[15px] font-semibold flex items-center gap-2 pt-1">
                  <Layers className="h-4 w-4 text-primary" /> How it works
                </h3>
                <Markdown>{section.howItWorks}</Markdown>
              </>
            )}
          </div>
          {diagrams.map((d) => (
            <InlineDiagram key={d.id} diagram={d} lessonId={lesson._id} />
          ))}
          {section.codeSnippets.map((c, i) => (
            <div key={i} className="relative">
              <pre className="bg-code text-code-fg rounded-xl p-4 overflow-x-auto text-sm font-mono">
                <code>{c.code}</code>
              </pre>
              <CopyButton text={c.code} />
              {c.caption && <p className="text-xs text-muted mt-1">{c.caption}</p>}
            </div>
          ))}
          <GoDeeper section={section} />
          {section.unverifiedClaims && section.unverifiedClaims.length > 0 && (
            <div className="rounded-xl bg-warning/5 border border-warning/30 p-3 text-sm">
              <p className="font-semibold mb-1.5 flex items-center gap-2 text-warning">
                <AlertTriangle className="h-4 w-4" /> Not found in your source — double-check
              </p>
              <ul className="list-disc pl-5 space-y-1">
                {section.unverifiedClaims.map((c) => (
                  <li key={c} className="font-mono text-[13px] break-all">
                    {c}
                  </li>
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
        </div>
        {comparing && <SourcePane lessonId={lesson._id} sectionId={section.id} onClose={() => onCompare(false)} />}
      </div>
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

