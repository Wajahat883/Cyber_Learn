import { useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import type { LessonSection } from '@cyberlearn/shared';
import { cn } from '../../lib/cn';
import { Badge } from '../../components/ui/Feedback';
import type { Flashcard, Lesson } from '../../types/models';
import { AskPanel } from './AskPanel';

type RailTab = 'concepts' | 'ask' | 'sources';

/** Right rail as tabs instead of four stacked cards: concepts, the AI teacher and the source material. */
export function LessonRail({ lesson, current, relatedCards }: { lesson: Lesson; current?: LessonSection; relatedCards: Flashcard[] }) {
  const [tab, setTab] = useState<RailTab>('concepts');
  const tabs: { id: RailTab; label: string }[] = [
    { id: 'concepts', label: 'Concepts' },
    { id: 'ask', label: 'Ask AI' },
    { id: 'sources', label: 'Sources' },
  ];
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-card flex flex-col max-h-[calc(100vh-6rem)]">
      <div role="tablist" aria-label="Lesson tools" className="grid grid-cols-3 gap-1 p-1.5 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn('rounded-lg py-1.5 text-[13px] font-medium', tab === t.id ? 'bg-primary-soft text-primary' : 'text-muted hover:text-text')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="overflow-y-auto p-4 space-y-5">
        {current && <p className="text-xs text-muted">Showing: <span className="text-text font-medium">{current.title}</span></p>}
        {tab === 'concepts' && current && (
          <>
            <div>
              <p className="text-sm font-semibold mb-2">Key concepts</p>
              <div className="flex flex-wrap gap-1.5">
                {current.keyConcepts.length ? current.keyConcepts.map((k) => <Badge key={k} tone="primary">{k}</Badge>) : <span className="text-sm text-muted">None listed</span>}
              </div>
              {lesson.keyTerms.filter((t) => current.keyConcepts.some((k) => t.term.startsWith(k))).slice(0, 4).map((t) => (
                <p key={t.term} className="text-xs text-muted mt-2.5 leading-relaxed">
                  <span className="text-text font-medium">{t.term}:</span> {t.definition}
                </p>
              ))}
            </div>
            {current.warnings.length > 0 && (
              <div className="rounded-xl bg-warning/5 border border-warning/30 p-3">
                <p className="text-sm font-semibold mb-1.5 flex items-center gap-2 text-warning">
                  <AlertTriangle className="h-4 w-4" /> Important warnings
                </p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {current.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {relatedCards.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Related flashcards</p>
                <ul className="space-y-2">
                  {relatedCards.map((c) => (
                    <li key={c._id} className="text-sm rounded-lg bg-surface-2 px-3 py-2">
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
          </>
        )}
        {tab === 'ask' && <AskPanel lessonId={lesson._id} sectionId={current?.id} sectionTitle={current?.title} concepts={current?.keyConcepts} />}
        {tab === 'sources' &&
          (current && current.sourceRefs.length > 0 ? (
            <div>
              <p className="text-sm font-semibold mb-2">Source references</p>
              <ul className="space-y-2.5">
                {current.sourceRefs.slice(0, 8).map((r, i) => (
                  <li key={i} className="text-xs text-muted border-l-2 border-primary/40 pl-3 leading-relaxed">
                    <span className="text-text font-medium">Chunk {r.chunkIndex + 1}</span> — {r.excerpt}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted">No source citation for this section.</p>
          ))}
      </div>
    </div>
  );
}

