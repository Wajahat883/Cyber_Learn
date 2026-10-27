import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, GraduationCap, Layers, RotateCcw, XCircle } from 'lucide-react';
import type { Question } from '@cyberlearn/shared';
import { api, qs } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Card, CardTitle, PageHeader } from '../../components/ui/Card';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { Badge, EmptyState, PageLoader } from '../../components/ui/Feedback';
import { timeAgo } from '../../utils/format';
import type { Flashcard, WeakTopic } from '../../types/models';
import { useLessons } from '../presentations/PresentationsPage';
import { QuestionCard, QuizRunner } from './QuizRunner';

const GRADES = [
  { grade: 1, label: 'Again', tone: 'danger' as const, hint: 'Forgot it' },
  { grade: 3, label: 'Hard', tone: 'outline' as const, hint: 'Recalled with effort' },
  { grade: 4, label: 'Good', tone: 'secondary' as const, hint: 'Recalled' },
  { grade: 5, label: 'Easy', tone: 'primary' as const, hint: 'Instant' },
];

function FlashcardSession({ lessonId }: { lessonId: string }) {
  const qc = useQueryClient();
  const { data: cards, isLoading } = useQuery({
    queryKey: ['flashcards-due', lessonId],
    queryFn: async () => (await api.get<{ flashcards: Flashcard[] }>(`/flashcards${qs({ due: 'true', lessonId })}`)).flashcards,
  });
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const review = useMutation({
    mutationFn: ({ id, grade }: { id: string; grade: number }) => api.post(`/flashcards/${id}/review`, { grade }),
    onSuccess: () => {
      setFlipped(false);
      setIndex((i) => i + 1);
      setDone((d) => d + 1);
      qc.invalidateQueries({ queryKey: ['revision-due'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if (isLoading) return <PageLoader />;
  const card = cards?.[index];
  if (!card) {
    return (
      <EmptyState icon={<Layers className="h-10 w-10" />} title={done ? `Session complete — ${done} cards reviewed` : 'Nothing due right now'}>
        {done ? 'Cards you found hard will come back sooner.' : 'New and due flashcards appear here. Generate a lesson with flashcards enabled to get started.'}
      </EmptyState>
    );
  }
  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-sm text-muted mb-3 text-center">
        Card {index + 1} of {cards!.length} · {card.review ? `seen ${card.review.reviewCount}×` : 'new card'}
      </p>
      <button
        onClick={() => setFlipped(!flipped)}
        className="w-full min-h-[260px] rounded-2xl border border-border bg-surface p-8 text-center flex flex-col items-center justify-center gap-4 hover:border-primary/50 transition-colors"
        aria-label={flipped ? 'Show question' : 'Show answer'}
      >
        <p className="text-xs uppercase tracking-widest text-muted">{flipped ? 'Answer' : 'Question'}</p>
        <p className={cn('leading-relaxed', flipped ? 'text-lg' : 'text-xl font-semibold')}>{flipped ? card.back : card.front}</p>
        {flipped && card.explanation && <p className="text-sm text-muted">{card.explanation}</p>}
        {!flipped && <p className="text-xs text-muted mt-4">Click or press to reveal the answer</p>}
      </button>
      {flipped ? (
        <div className="grid grid-cols-4 gap-2 mt-4">
          {GRADES.map((g) => (
            <Button key={g.grade} variant={g.tone} className="flex-col h-auto py-2" loading={review.isPending && review.variables?.grade === g.grade} onClick={() => review.mutate({ id: card._id, grade: g.grade })}>
              <span>{g.label}</span>
              <span className="text-[10px] opacity-75 font-normal">{g.hint}</span>
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex justify-center mt-4">
          <Button onClick={() => setFlipped(true)}>Reveal answer</Button>
        </div>
      )}
      <div className="text-center mt-3">
        <Link to={`/lessons/${card.lessonId}${card.sectionId ? `#${card.sectionId}` : ''}`} className="text-xs text-primary hover:underline">
          Open the lesson section
        </Link>
      </div>
    </div>
  );
}

interface QuizRow {
  _id: string;
  lessonId: string;
  title: string;
  difficulty: string;
  questionCount: number;
  attempts: number;
  bestScore: number | null;
  lastAttemptAt: string | null;
}

function QuizList({ lessonId, onOpen }: { lessonId: string; onOpen: (id: string) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['quizzes'], queryFn: async () => (await api.get<{ quizzes: QuizRow[] }>('/quizzes')).quizzes });
  if (isLoading) return <PageLoader />;
  const list = (data ?? []).filter((q) => !lessonId || q.lessonId === lessonId);
  if (!list.length) return <EmptyState icon={<GraduationCap className="h-10 w-10" />} title="No quizzes yet">Quizzes are generated with each lesson when quiz generation is on.</EmptyState>;
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {list.map((q) => (
        <Card key={q._id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold truncate">{q.title}</p>
            <p className="text-xs text-muted">
              {q.questionCount} questions · {q.attempts ? `best ${q.bestScore}% · last ${timeAgo(q.lastAttemptAt)}` : 'not attempted yet'}
            </p>
          </div>
          <Button onClick={() => onOpen(q._id)}>{q.attempts ? 'Retake' : 'Start'}</Button>
        </Card>
      ))}
    </div>
  );
}

interface ReviewItem {
  quizId: string;
  lessonId: string;
  lessonTitle: string;
  question: Question;
  yourAnswer?: { selectedOptionIndex: number | null; text: string };
}

function ReviewQuestions({ kind, onRetake }: { kind: 'mistakes' | 'bookmarked'; onRetake: (quizId: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['review-questions'],
    queryFn: () => api.get<{ mistakes: ReviewItem[]; bookmarked: ReviewItem[] }>('/revision/review-questions'),
  });
  if (isLoading) return <PageLoader />;
  const items = data?.[kind] ?? [];
  if (!items.length) {
    return <EmptyState title={kind === 'mistakes' ? 'No mistakes to review' : 'No bookmarked questions'}>{kind === 'mistakes' ? 'Questions you get wrong in your latest attempt show up here with explanations.' : 'Bookmark questions while taking a quiz to collect them here.'}</EmptyState>;
  }
  return (
    <div className="space-y-4">
      {items.map((m, i) => (
        <div key={`${m.quizId}-${m.question.id}`}>
          <div className="flex items-center justify-between gap-2 mb-1 text-sm">
            <Link to={`/lessons/${m.lessonId}`} className="text-primary hover:underline">
              {m.lessonTitle}
            </Link>
            <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => onRetake(m.quizId)}>
              Retake quiz
            </Button>
          </div>
          <QuestionCard
            question={m.question}
            index={i}
            answer={m.yourAnswer ? { selectedOptionIndex: m.yourAnswer.selectedOptionIndex ?? undefined, text: m.yourAnswer.text } : undefined}
            full={m.question}
            lessonId={m.lessonId}
            result={{
              questionId: m.question.id,
              selectedOptionIndex: m.yourAnswer?.selectedOptionIndex ?? null,
              text: m.yourAnswer?.text ?? '',
              correct: kind === 'bookmarked',
              score: 0,
              feedback: `${m.question.explanation}${m.question.answer ? `\n\nModel answer: ${m.question.answer}` : ''}`,
              missing: [],
            }}
          />
        </div>
      ))}
    </div>
  );
}

const TABS = [
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'quizzes', label: 'Quizzes' },
  { id: 'mistakes', label: 'Mistake review' },
  { id: 'bookmarks', label: 'Bookmarked' },
] as const;

/** Screen 9 — Revision Center. */
export function RevisionCenterPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'flashcards') as (typeof TABS)[number]['id'];
  const lessonId = params.get('lessonId') ?? '';
  const quizId = params.get('quiz');
  const { data: lessons } = useLessons();
  const { data: due } = useQuery({
    queryKey: ['revision-due'],
    queryFn: () => api.get<{ due: number; unseen: number; total: number; weakTopics: WeakTopic[]; schedule: { date: string; count: number }[] }>('/revision/due'),
  });
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  };
  const maxSchedule = useMemo(() => Math.max(1, ...(due?.schedule.map((s) => s.count) ?? [1])), [due]);

  return (
    <div>
      <PageHeader
        title="Study"
        description="Flashcards on a spaced-repetition schedule, quizzes with explanations and a review of your mistakes."
        actions={
          <Select aria-label="Filter by lesson" value={lessonId} onChange={(e) => set({ lessonId: e.target.value || null, quiz: null })}>
            <option value="">All lessons</option>
            {lessons?.map((l) => (
              <option key={l._id} value={l._id}>
                {l.title}
              </option>
            ))}
          </Select>
        }
      />
      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-5">
        <div className="min-w-0">
          <div className="flex gap-1 border-b border-border mb-5 overflow-x-auto" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => set({ tab: t.id, quiz: null })}
                className={cn('px-4 py-2.5 text-sm whitespace-nowrap -mb-px border-b-2', tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text')}
              >
                {t.label}
                {t.id === 'flashcards' && due && due.total > 0 && <Badge tone="primary" className="ml-2">{due.total}</Badge>}
              </button>
            ))}
          </div>
          {tab === 'flashcards' && <FlashcardSession key={lessonId} lessonId={lessonId} />}
          {tab === 'quizzes' && (quizId ? <QuizRunner quizId={quizId} onDone={() => set({ quiz: null })} /> : <QuizList lessonId={lessonId} onOpen={(id) => set({ quiz: id })} />)}
          {tab === 'mistakes' && <ReviewQuestions kind="mistakes" onRetake={(id) => set({ tab: 'quizzes', quiz: id })} />}
          {tab === 'bookmarks' && <ReviewQuestions kind="bookmarked" onRetake={(id) => set({ tab: 'quizzes', quiz: id })} />}
        </div>
        <div className="space-y-4">
          <Card>
            <CardTitle icon={<CalendarClock className="h-4 w-4" />}>Today</CardTitle>
            <p className="text-3xl font-bold">{due?.total ?? 0}</p>
            <p className="text-sm text-muted">
              {due?.due ?? 0} due · {due?.unseen ?? 0} new
            </p>
            {due && due.schedule.length > 0 && (
              <>
                <p className="text-xs uppercase tracking-wider text-muted mt-4 mb-2">Upcoming reviews</p>
                <ul className="space-y-1">
                  {due.schedule.slice(0, 7).map((s) => (
                    <li key={s.date} className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-muted">{new Date(s.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                      <span className="h-2 rounded-full bg-primary" style={{ width: `${(s.count / maxSchedule) * 100}%`, minWidth: 6 }} />
                      <span>{s.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
          <Card>
            <CardTitle icon={<AlertTriangle className="h-4 w-4" />}>Weak topics</CardTitle>
            {due?.weakTopics.length ? (
              <ul className="space-y-2">
                {due.weakTopics.map((t) => (
                  <li key={`${t.lessonId}-${t.concept}`} className="text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      <XCircle className="h-3.5 w-3.5 text-error" />
                      {t.concept}
                    </span>
                    <span className="text-xs text-muted">
                      {t.mistakes} mistake{t.mistakes === 1 ? '' : 's'} ·{' '}
                      <Link to={`/lessons/${t.lessonId}`} className="text-primary hover:underline">
                        {t.lessonTitle}
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No weak topics yet.</p>
            )}
          </Card>
          <ButtonLink to="/progress" variant="outline" className="w-full">
            View learning progress
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
