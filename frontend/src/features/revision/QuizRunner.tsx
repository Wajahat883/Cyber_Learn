import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, CheckCircle2, XCircle } from 'lucide-react';
import type { PublicQuestion, Question } from '@cyberlearn/shared';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Button } from '../../components/ui/Button';
import { Alert, Badge, PageLoader } from '../../components/ui/Feedback';
import { Markdown } from '../../components/ui/Markdown';
import type { Quiz } from '../../types/models';

interface GradedResult {
  questionId: string;
  selectedOptionIndex: number | null;
  text: string;
  correct: boolean;
  score: number;
  feedback: string;
  missing: string[];
}

const TYPE_LABEL: Record<string, string> = {
  mcq: 'Multiple choice',
  'true-false': 'True / false',
  'short-answer': 'Short answer',
  explain: 'Explain',
  'log-analysis': 'Log analysis',
  scenario: 'Scenario',
  'next-step': 'Next investigation step',
};

export function QuestionCard({
  question,
  index,
  answer,
  onAnswer,
  result,
  full,
  bookmarked,
  onBookmark,
  lessonId,
}: {
  question: PublicQuestion | Question;
  index: number;
  answer?: { selectedOptionIndex?: number; text?: string };
  onAnswer?: (a: { selectedOptionIndex?: number; text?: string }) => void;
  result?: GradedResult;
  full?: Question;
  bookmarked?: boolean;
  onBookmark?: () => void;
  lessonId?: string;
}) {
  const choice = question.type === 'mcq' || question.type === 'true-false';
  return (
    <div className={cn('rounded-xl border p-5 bg-surface', result ? (result.correct ? 'border-success/50' : 'border-error/50') : 'border-border')}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge>{index + 1}</Badge>
          <Badge tone="secondary">{TYPE_LABEL[question.type] ?? question.type}</Badge>
          <Badge>{question.difficulty}</Badge>
          {question.relatedConcept && <Badge tone="primary">{question.relatedConcept}</Badge>}
        </div>
        {onBookmark && (
          <button onClick={onBookmark} aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark question'} aria-pressed={bookmarked} className="p-1 text-muted hover:text-warning">
            {bookmarked ? <BookmarkCheck className="h-4 w-4 text-warning" /> : <Bookmark className="h-4 w-4" />}
          </button>
        )}
      </div>
      <Markdown className="font-medium">{question.prompt}</Markdown>
      {question.context && <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-code p-3 text-[13px] font-mono text-code-fg">{question.context}</pre>}
      <div className="mt-4">
        {choice ? (
          <div role="radiogroup" className="space-y-2">
            {question.options.map((opt, i) => {
              const selected = answer?.selectedOptionIndex === i;
              const isCorrect = full?.correctOptionIndex === i;
              return (
                <label
                  key={i}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border px-3 py-2 text-sm cursor-pointer',
                    result ? (isCorrect ? 'border-success bg-success/10' : selected ? 'border-error bg-error/10' : 'border-border opacity-70') : selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-surface-2',
                  )}
                >
                  <input type="radio" name={`q-${question.id}`} className="mt-1 accent-[var(--color-primary)]" checked={selected} disabled={Boolean(result)} onChange={() => onAnswer?.({ selectedOptionIndex: i })} />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <textarea
            value={answer?.text ?? ''}
            onChange={(e) => onAnswer?.({ text: e.target.value })}
            disabled={Boolean(result)}
            rows={4}
            aria-label="Your answer"
            placeholder="Write your answer…"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        )}
      </div>
      {result && (
        <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm space-y-2">
          <p className={cn('font-semibold flex items-center gap-2', result.correct ? 'text-success' : 'text-error')}>
            {result.correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {result.correct ? 'Correct' : choice ? 'Incorrect' : `Partly covered (${Math.round(result.score * 100)}%)`}
          </p>
          <Markdown>{result.feedback}</Markdown>
          {result.missing.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">Points to include</p>
              <ul className="list-disc pl-5">
                {result.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {lessonId && question.sectionId && (
            <Link to={`/lessons/${lessonId}#${question.sectionId}`} className="text-primary text-xs hover:underline">
              Review the lesson section
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** Takes a quiz; answer keys arrive only with the graded results. */
export function QuizRunner({ quizId, onDone }: { quizId: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['quiz', quizId],
    queryFn: () => api.get<{ quiz: Quiz; bookmarks: string[] }>(`/quizzes/${quizId}`),
  });
  const [answers, setAnswers] = useState<Record<string, { selectedOptionIndex?: number; text?: string }>>({});
  const [startedAt] = useState(() => new Date().toISOString());
  const [result, setResult] = useState<{ results: GradedResult[]; questions: Question[]; attempt: { score: number; maxScore: number } } | null>(null);
  useEffect(() => {
    setAnswers({});
    setResult(null);
  }, [quizId]);

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ results: GradedResult[]; questions: Question[]; attempt: { score: number; maxScore: number } }>(`/quizzes/${quizId}/attempts`, {
        answers: Object.entries(answers).map(([questionId, a]) => ({ questionId, ...a })),
        startedAt,
      }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['quizzes'] });
      qc.invalidateQueries({ queryKey: ['review-questions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });
  const bookmark = useMutation({
    mutationFn: (v: { questionId: string; bookmarked: boolean }) => api.post(`/quizzes/${quizId}/bookmarks`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quiz', quizId] });
      qc.invalidateQueries({ queryKey: ['review-questions'] });
    },
  });

  if (isLoading || !data) return <PageLoader />;
  const { quiz, bookmarks } = data;
  const answered = Object.values(answers).filter((a) => a.selectedOptionIndex !== undefined || a.text?.trim()).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{quiz.title}</h2>
        {result ? (
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold">
              Score: {Math.round((result.attempt.score / result.attempt.maxScore) * 100)}% ({result.attempt.score}/{result.attempt.maxScore})
            </span>
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setAnswers({});
              }}
            >
              Try again
            </Button>
            {onDone && <Button onClick={onDone}>Back to quizzes</Button>}
          </div>
        ) : (
          <span className="text-sm text-muted">
            {answered} of {quiz.questions.length} answered
          </span>
        )}
      </div>
      {submit.error && <Alert tone="error">{errorMessage(submit.error)}</Alert>}
      {quiz.questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          question={q}
          index={i}
          answer={result ? { selectedOptionIndex: result.results[i]?.selectedOptionIndex ?? undefined, text: result.results[i]?.text } : answers[q.id]}
          onAnswer={(a) => setAnswers((all) => ({ ...all, [q.id]: a }))}
          result={result?.results.find((r) => r.questionId === q.id)}
          full={result?.questions.find((x) => x.id === q.id)}
          bookmarked={bookmarks.includes(q.id)}
          onBookmark={() => bookmark.mutate({ questionId: q.id, bookmarked: !bookmarks.includes(q.id) })}
          lessonId={quiz.lessonId}
        />
      ))}
      {!result && (
        <div className="flex justify-end">
          <Button size="lg" loading={submit.isPending} disabled={!answered} onClick={() => submit.mutate()}>
            Submit answers
          </Button>
        </div>
      )}
    </div>
  );
}
