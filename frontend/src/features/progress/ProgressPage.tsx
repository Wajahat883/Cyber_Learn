import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { BookOpen, CheckCircle2, Clock, Flame, GraduationCap, Layers, Repeat, TrendingUp } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, CardTitle, PageHeader, Stat } from '../../components/ui/Card';
import { EmptyState, ErrorState, PageLoader, StatusBadge } from '../../components/ui/Feedback';
import { formatDuration, timeAgo } from '../../utils/format';
import type { WeakTopic } from '../../types/models';

interface Summary {
  totals: {
    lessonsCreated: number;
    lessonsViewed: number;
    lessonsCompleted: number;
    averageCompletion: number;
    timeSpentSeconds: number;
    quizAttempts: number;
    averageQuizScore: number | null;
    flashcardReviews: number;
    flashcardAccuracy: number | null;
    streak: number;
  };
  dailyStudy: { date: string; minutes: number }[];
  quizHistory: { date: string; score: number; lessonId: string }[];
  perLesson: { lessonId: string; title: string; completion: number; completionStatus: string; timeSpentSeconds: number; lastStudiedAt: string | null; bestQuizScore: number | null }[];
  repeatedMistakes: { quizId: string; questionId: string; count: number; prompt: string }[];
  weakTopics: WeakTopic[];
}

// Chart tokens: one hue per single-series chart, recessive grid and axes (validated for the dark surface).
const C = { study: '#38BDF8', quiz: '#8B5CF6', grid: '#1e2a42', axis: '#94A3B8', surface: '#121b30' };

function ChartTooltip({ active, payload, label, unit }: TooltipProps<number, string> & { unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-xl">
      <p className="text-muted">{label}</p>
      <p className="text-text font-semibold">
        {payload[0].value}
        {unit}
      </p>
    </div>
  );
}

function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted text-xs">Show data table</summary>
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className="text-left text-muted font-medium py-1 pr-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {r.map((c, j) => (
                  <td key={j} className="py-1 pr-4">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ChartCard({ title, icon, children, empty }: { title: string; icon: ReactNode; children: ReactNode; empty?: string }) {
  return (
    <Card>
      <CardTitle icon={icon}>{title}</CardTitle>
      {empty ? <p className="text-sm text-muted py-10 text-center">{empty}</p> : children}
    </Card>
  );
}

/** Screen 11 — Learning Progress. Every metric reflects real activity. */
export function ProgressPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['progress-summary'], queryFn: () => api.get<Summary>('/progress/summary') });

  // Fill the last 30 days so gaps show as zero-height bars, not missing days.
  const days = useMemo(() => {
    const map = new Map(data?.dailyStudy.map((d) => [d.date, d.minutes]));
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10);
      return { date: d, label: new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), minutes: map.get(d) ?? 0 };
    });
  }, [data]);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const t = data.totals;
  if (!t.lessonsCreated) {
    return (
      <>
        <PageHeader eyebrow="Progress" title="Learning Progress" />
        <EmptyState icon={<TrendingUp className="h-10 w-10" />} title="No learning activity yet">
          Your statistics appear once you study a lesson, review flashcards or take a quiz.
        </EmptyState>
      </>
    );
  }
  const quiz = data.quizHistory.map((q) => ({ ...q, label: new Date(q.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }));
  const studied = days.some((d) => d.minutes > 0);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Progress" title="Learning Progress" description="Opening a lesson does not count as mastering it: completion comes from sections you mark as understood, quizzes and flashcards." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Lessons created" value={t.lessonsCreated} hint={`${t.lessonsViewed} studied`} icon={<BookOpen className="h-4 w-4" />} />
        <Stat label="Completed" value={t.lessonsCompleted} hint={`${t.averageCompletion}% average completion`} icon={<CheckCircle2 className="h-4 w-4" />} />
        <Stat label="Time spent studying" value={formatDuration(t.timeSpentSeconds)} icon={<Clock className="h-4 w-4" />} />
        <Stat label="Learning streak" value={`${t.streak} day${t.streak === 1 ? '' : 's'}`} icon={<Flame className="h-4 w-4" />} />
        <Stat label="Quiz average" value={t.averageQuizScore === null ? '—' : `${t.averageQuizScore}%`} hint={`${t.quizAttempts} attempts`} icon={<GraduationCap className="h-4 w-4" />} />
        <Stat label="Flashcard accuracy" value={t.flashcardAccuracy === null ? '—' : `${t.flashcardAccuracy}%`} hint={`${t.flashcardReviews} reviews`} icon={<Layers className="h-4 w-4" />} />
        <Stat label="Repeated mistakes" value={data.repeatedMistakes.length} icon={<Repeat className="h-4 w-4" />} />
        <Stat label="Topics to revise" value={data.weakTopics.length} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <ChartCard title="Study minutes per day (last 30 days)" icon={<Clock className="h-4 w-4" />} empty={studied ? undefined : 'No study time recorded in the last 30 days.'}>
          <div className="h-56" role="img" aria-label="Bar chart of study minutes per day">
            <ResponsiveContainer>
              <BarChart data={days} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: C.grid }} interval={6} />
                <YAxis allowDecimals={false} tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(148,163,184,0.08)' }} content={<ChartTooltip unit=" min" />} />
                <Bar dataKey="minutes" fill={C.study} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DataTable caption="Study minutes per day" headers={['Date', 'Minutes']} rows={days.filter((d) => d.minutes).map((d) => [d.date, d.minutes])} />
        </ChartCard>

        <ChartCard title="Quiz scores over time" icon={<GraduationCap className="h-4 w-4" />} empty={quiz.length ? undefined : 'Take a quiz to see your scores here.'}>
          <div className="h-56" role="img" aria-label="Line chart of quiz scores">
            <ResponsiveContainer>
              <LineChart data={quiz} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: C.grid }} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ stroke: C.axis, strokeDasharray: '3 3' }} content={<ChartTooltip unit="%" />} />
                <Line type="monotone" dataKey="score" stroke={C.quiz} strokeWidth={2} dot={{ r: 4, fill: C.quiz, stroke: C.surface, strokeWidth: 2 }} activeDot={{ r: 6, stroke: C.surface, strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <DataTable caption="Quiz scores" headers={['Date', 'Score']} rows={quiz.map((q) => [new Date(q.date).toLocaleString(), `${q.score}%`])} />
        </ChartCard>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-5">
          <CardTitle icon={<BookOpen className="h-4 w-4" />}>Progress by lesson</CardTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted text-left">
              <tr className="border-b border-border">
                <th className="px-5 py-2 font-medium">Lesson</th>
                <th className="px-3 py-2 font-medium">Completion</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Best quiz</th>
                <th className="px-3 py-2 font-medium">Last studied</th>
              </tr>
            </thead>
            <tbody>
              {data.perLesson.map((l) => (
                <tr key={l.lessonId} className="border-b border-border last:border-0">
                  <td className="px-5 py-2.5">
                    <Link to={`/lessons/${l.lessonId}`} className="hover:text-primary">
                      {l.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-border overflow-hidden" role="progressbar" aria-valuenow={l.completion} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full bg-success" style={{ width: `${l.completion}%` }} />
                      </div>
                      <span className="text-muted tabular-nums">{l.completion}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={l.completionStatus} />
                  </td>
                  <td className="px-3 py-2.5 text-muted">{formatDuration(l.timeSpentSeconds)}</td>
                  <td className="px-3 py-2.5 text-muted">{l.bestQuizScore === null ? '—' : `${l.bestQuizScore}%`}</td>
                  <td className="px-3 py-2.5 text-muted">{timeAgo(l.lastStudiedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardTitle icon={<Repeat className="h-4 w-4" />}>Repeated mistakes</CardTitle>
          {data.repeatedMistakes.length ? (
            <ul className="space-y-2 text-sm">
              {data.repeatedMistakes.map((m) => (
                <li key={`${m.quizId}-${m.questionId}`} className="flex justify-between gap-3">
                  <span className="line-clamp-2">{m.prompt}</span>
                  <span className="text-error shrink-0">{m.count}×</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No question has been missed more than once.</p>
          )}
        </Card>
        <Card>
          <CardTitle icon={<TrendingUp className="h-4 w-4" />}>Topics requiring revision</CardTitle>
          {data.weakTopics.length ? (
            <ul className="space-y-2 text-sm">
              {data.weakTopics.map((w) => (
                <li key={`${w.lessonId}-${w.concept}`} className="flex justify-between gap-3">
                  <Link to={`/lessons/${w.lessonId}`} className="hover:text-primary">
                    {w.concept} <span className="text-muted">· {w.lessonTitle}</span>
                  </Link>
                  <span className="text-muted shrink-0">{w.mistakes} mistakes</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing flagged yet.</p>
          )}
          <Link to="/revision" className="text-sm text-primary mt-3 inline-block">
            Go to the Revision Center
          </Link>
        </Card>
      </div>
    </div>
  );
}
