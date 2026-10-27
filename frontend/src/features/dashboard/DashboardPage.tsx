import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, FileText, Flame, Layers, Loader2, Play, Sparkles, Target, UploadCloud } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { ButtonLink } from '../../components/ui/Button';
import { ErrorState, PageLoader, StatusBadge } from '../../components/ui/Feedback';
import type { Generation, Project, WeakTopic } from '../../types/models';
import { timeAgo } from '../../utils/format';

interface DashboardData {
  stats: { totalProjects: number; totalLessons: number; totalPresentations: number; completedLessons: number; quizAverage: number | null; quizAttempts: number; streak: number };
  continueLearning: { lessonId: string; projectId: string; title: string; completion: number; lastStudiedAt: string } | null;
  recentlyStudied: { lessonId: string; title: string; completion: number; lastStudiedAt: string }[];
  recentProjects: Project[];
  runningGenerations: (Generation & { projectId: { _id: string; title: string } })[];
  revision: { due: number; unseen: number; total: number };
  weakTopics: WeakTopic[];
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${value}%` }} />
    </div>
  );
}

/** First-run home: three clear ways to start instead of empty statistics. */
function Welcome({ name }: { name: string }) {
  const steps = [
    { icon: FileText, title: 'Paste or upload', text: 'Notes, a PDF, DOCX, TXT or Markdown file.' },
    { icon: Sparkles, title: 'Review the plan', text: 'Check the sections before anything is generated.' },
    { icon: Play, title: 'Learn and revise', text: 'Lesson, animated slides, flashcards and quizzes.' },
  ];
  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-border bg-surface p-8 sm:p-12 shadow-card relative overflow-hidden">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-soft blur-2xl" aria-hidden />
        <div className="relative max-w-xl">
          <p className="text-sm font-medium text-primary mb-3">Welcome, {name}</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">Turn your study notes into a lesson you can watch, read and practise.</h1>
          <p className="text-muted mt-4 leading-relaxed">Start your first learning project — statistics appear here once you start studying. Nothing is shown until it is real.</p>
          <div className="flex flex-wrap gap-3 mt-8">
            <ButtonLink to="/create" size="lg" icon={<Sparkles className="h-4 w-4" />}>
              Create your first lesson
            </ButtonLink>
            <ButtonLink to="/create" size="lg" variant="outline" icon={<UploadCloud className="h-4 w-4" />}>
              Upload a document
            </ButtonLink>
          </div>
        </div>
      </div>
      <ol className="grid md:grid-cols-3 gap-4">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-xl bg-surface-2 flex items-center justify-center text-primary">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="text-xs font-semibold text-muted">STEP {i + 1}</span>
              </div>
              <p className="font-semibold mt-4">{s.title}</p>
              <p className="text-sm text-muted mt-1">{s.text}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
    refetchInterval: (q) => ((q.state.data?.runningGenerations.length ?? 0) > 0 ? 5000 : false),
  });

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const name = user?.displayName?.split(' ')[0] ?? 'there';
  if (data.stats.totalProjects === 0) return <Welcome name={name} />;

  const { stats } = data;
  const cont = data.continueLearning;
  // Nothing studied yet: suggest the newest lesson that is ready.
  const startHere = data.recentProjects.find((p) => p.lessonId && p.status.content === 'ready');
  const strip = [
    { label: 'Lessons created', value: stats.totalLessons, to: '/library' },
    { label: 'Presentations', value: stats.totalPresentations, to: '/presentations' },
    { label: 'Completed', value: stats.completedLessons, to: '/progress' },
    { label: 'Quiz performance', value: stats.quizAverage === null ? '—' : `${stats.quizAverage}%`, to: '/revision?tab=quizzes' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight">
            {greeting()}, {name}
          </h1>
        </div>
        {stats.streak > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 text-warning px-3 py-1.5 text-sm font-medium">
            <Flame className="h-4 w-4" /> {stats.streak}-day study streak
          </span>
        )}
      </div>

      {data.runningGenerations.length > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="font-medium">Generation jobs running</span>
          {data.runningGenerations.map((g) => (
            <Link key={g._id} to={`/generations/${g._id}`} className="inline-flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1 hover:shadow-card">
              {g.projectId?.title ?? 'Project'} <StatusBadge status={g.status} />
            </Link>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-3xl border border-border bg-surface p-6 sm:p-7 shadow-card relative overflow-hidden">
          <div className="absolute -right-16 -bottom-20 h-56 w-56 rounded-full bg-primary-soft blur-2xl" aria-hidden />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Continue learning</p>
            {cont ? (
              <>
                <h2 className="text-2xl font-bold mt-2 leading-tight">{cont.title}</h2>
                <p className="text-sm text-muted mt-1">Last studied {timeAgo(cont.lastStudiedAt)}</p>
                <div className="mt-5 max-w-md">
                  <ProgressBar value={cont.completion} />
                  <p className="text-xs text-muted mt-2">{cont.completion}% of sections understood</p>
                </div>
                <div className="flex flex-wrap gap-2 mt-6">
                  <ButtonLink to={`/lessons/${cont.lessonId}`} icon={<BookOpen className="h-4 w-4" />}>
                    Resume lesson
                  </ButtonLink>
                  <ButtonLink to={`/lessons/${cont.lessonId}/present`} variant="outline" icon={<Play className="h-4 w-4" />}>
                    Play
                  </ButtonLink>
                </div>
              </>
            ) : startHere?.lessonId ? (
              <>
                <h2 className="text-2xl font-bold mt-2 leading-tight">{startHere.title}</h2>
                <p className="text-sm text-muted mt-1">Ready to study · not started yet</p>
                <div className="flex flex-wrap gap-2 mt-6">
                  <ButtonLink to={`/lessons/${startHere.lessonId}`} icon={<BookOpen className="h-4 w-4" />}>
                    Start lesson
                  </ButtonLink>
                  <ButtonLink to={`/lessons/${startHere.lessonId}/present`} variant="outline" icon={<Play className="h-4 w-4" />}>
                    Watch presentation
                  </ButtonLink>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold mt-2">Pick up a lesson</h2>
                <p className="text-sm text-muted mt-1">Open a generated lesson to start tracking where you left off.</p>
                <ButtonLink to="/library" className="mt-6" variant="outline" icon={<ArrowRight className="h-4 w-4" />}>
                  Go to library
                </ButtonLink>
              </>
            )}
            {data.recentlyStudied.length > 1 && (
              <div className="mt-6 pt-5 border-t border-border">
                <p className="text-xs font-medium text-muted mb-2">Recently studied</p>
                <div className="flex flex-wrap gap-2">
                  {data.recentlyStudied.slice(1, 5).map((r) => (
                    <Link key={r.lessonId} to={`/lessons/${r.lessonId}`} className="rounded-lg bg-surface-2 px-2.5 py-1 text-sm hover:text-primary">
                      {r.title} <span className="text-muted">· {r.completion}%</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface p-6 shadow-card flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-wider text-secondary">Due today</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="font-display text-5xl font-bold tracking-tight">{data.revision.total}</span>
            <span className="text-muted">flashcards</span>
          </div>
          <p className="text-sm text-muted mt-1">
            {data.revision.due} to review · {data.revision.unseen} new
          </p>
          <div className="mt-auto pt-6">
            <ButtonLink to="/revision" variant={data.revision.total ? 'secondary' : 'outline'} className="w-full" icon={<Layers className="h-4 w-4" />}>
              {data.revision.total ? 'Start revision' : 'Open study area'}
            </ButtonLink>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 rounded-2xl border border-border bg-surface shadow-card divide-x divide-y md:divide-y-0 divide-border overflow-hidden">
        {strip.map((s) => (
          <Link key={s.label} to={s.to} className="p-4 sm:px-6 hover:bg-surface-2 transition-colors">
            <p className="text-[13px] text-muted">{s.label}</p>
            <p className="font-display text-2xl font-bold mt-1 tracking-tight">{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-semibold">Recent projects</h2>
            <Link to="/library" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          <ul>
            {data.recentProjects.map((p) => (
              <li key={p._id} className="border-t border-border">
                <Link to={`/projects/${p._id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors">
                  <span className="h-9 w-9 shrink-0 rounded-xl bg-surface-2 flex items-center justify-center text-muted">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium truncate">{p.title}</span>
                    <span className="block text-xs text-muted">
                      {p.subject || 'No subject detected yet'} · updated {timeAgo(p.updatedAt)}
                    </span>
                  </span>
                  <StatusBadge status={p.status.content} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h2 className="font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-error" /> Topics marked as difficult
          </h2>
          {data.weakTopics.length ? (
            <ul className="mt-4 space-y-3">
              {data.weakTopics.map((t) => (
                <li key={`${t.lessonId}-${t.concept}`}>
                  <Link to={`/lessons/${t.lessonId}`} className="group block">
                    <span className="flex items-center justify-between gap-2 text-sm font-medium group-hover:text-primary">
                      {t.concept}
                      <span className="text-xs text-error font-normal">{t.mistakes}×</span>
                    </span>
                    <span className="block text-xs text-muted truncate">{t.lessonTitle}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted mt-3">Nothing yet. Weak topics appear after you answer quizzes or review flashcards.</p>
          )}
        </section>
      </div>
    </div>
  );
}
