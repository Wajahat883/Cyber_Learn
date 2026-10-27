import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, CalendarClock, CheckCircle2, Flame, GraduationCap, Loader, MonitorPlay, Play, Plus, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Card, CardTitle, PageHeader, Stat } from '../../components/ui/Card';
import { ButtonLink } from '../../components/ui/Button';
import { EmptyState, ErrorState, PageLoader, StatusBadge } from '../../components/ui/Feedback';
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

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
    refetchInterval: (q) => ((q.state.data?.runningGenerations.length ?? 0) > 0 ? 5000 : false),
  });

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const { stats } = data;
  const isNew = stats.totalProjects === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome${isNew ? '' : ' back'}, ${user?.displayName ?? 'learner'}`}
        description={isNew ? 'Paste your notes or upload a document and CyberLearn AI will build the lesson, diagrams, slides and quizzes for you.' : 'Here is where your learning stands today.'}
        actions={
          <ButtonLink to="/create" size="lg" icon={<Sparkles className="h-4 w-4" />}>
            Create New Lesson
          </ButtonLink>
        }
      />

      {isNew ? (
        <EmptyState
          icon={<BookOpen className="h-10 w-10" />}
          title="Start your first learning project"
          action={
            <ButtonLink to="/create" icon={<Plus className="h-4 w-4" />}>
              Create a lesson
            </ButtonLink>
          }
        >
          Paste study material (for example SIEM notes or an HTB module summary) or upload a PDF, DOCX, TXT or Markdown file. Your statistics will appear here once you start
          studying — nothing is shown until it is real.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Link to="/library">
              <Stat label="Lessons created" value={stats.totalLessons} hint={`${stats.totalProjects} projects`} icon={<BookOpen className="h-4 w-4" />} />
            </Link>
            <Link to="/presentations">
              <Stat label="Presentations" value={stats.totalPresentations} icon={<MonitorPlay className="h-4 w-4" />} />
            </Link>
            <Link to="/progress">
              <Stat label="Completed lessons" value={stats.completedLessons} icon={<CheckCircle2 className="h-4 w-4" />} />
            </Link>
            <Link to="/revision?tab=quizzes">
              <Stat
                label="Quiz performance"
                value={stats.quizAverage === null ? '—' : `${stats.quizAverage}%`}
                hint={stats.quizAttempts ? `${stats.quizAttempts} attempts` : 'No quizzes taken yet'}
                icon={<GraduationCap className="h-4 w-4" />}
              />
            </Link>
            <Link to="/progress" className="col-span-2 lg:col-span-1">
              <Stat label="Study streak" value={`${stats.streak} day${stats.streak === 1 ? '' : 's'}`} icon={<Flame className="h-4 w-4" />} />
            </Link>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardTitle icon={<Play className="h-4 w-4" />}>Continue learning</CardTitle>
              {data.continueLearning ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-lg truncate">{data.continueLearning.title}</p>
                    <p className="text-sm text-muted">Last studied {timeAgo(data.continueLearning.lastStudiedAt)}</p>
                    <div className="mt-3 h-2 w-full max-w-sm rounded-full bg-border overflow-hidden" role="progressbar" aria-valuenow={data.continueLearning.completion} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full bg-primary" style={{ width: `${data.continueLearning.completion}%` }} />
                    </div>
                    <p className="text-xs text-muted mt-1">{data.continueLearning.completion}% of sections understood</p>
                  </div>
                  <div className="flex gap-2">
                    <ButtonLink to={`/lessons/${data.continueLearning.lessonId}`} variant="outline">
                      Open lesson
                    </ButtonLink>
                    <ButtonLink to={`/lessons/${data.continueLearning.lessonId}/present`} icon={<Play className="h-4 w-4" />}>
                      Play
                    </ButtonLink>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">Open a generated lesson to start tracking where you left off.</p>
              )}
            </Card>

            <Card>
              <CardTitle icon={<CalendarClock className="h-4 w-4" />}>Recommended revision</CardTitle>
              {data.revision.total > 0 ? (
                <>
                  <p className="text-3xl font-bold">{data.revision.total}</p>
                  <p className="text-sm text-muted">
                    {data.revision.due} due for review · {data.revision.unseen} new flashcards
                  </p>
                  <ButtonLink to="/revision" className="mt-4" size="sm">
                    Start revision
                  </ButtonLink>
                </>
              ) : (
                <p className="text-sm text-muted">Nothing due. Flashcards from your lessons will be scheduled here.</p>
              )}
            </Card>
          </div>

          {data.runningGenerations.length > 0 && (
            <Card>
              <CardTitle icon={<Loader className="h-4 w-4 animate-spin" />}>Generation jobs running</CardTitle>
              <ul className="divide-y divide-border">
                {data.runningGenerations.map((g) => (
                  <li key={g._id} className="flex items-center justify-between py-2 gap-2">
                    <Link to={`/generations/${g._id}`} className="hover:text-primary truncate">
                      {g.projectId?.title ?? 'Project'}
                    </Link>
                    <span className="flex items-center gap-2 text-sm text-muted shrink-0">
                      {g.currentStage && <span className="hidden sm:inline">{g.currentStage}</span>}
                      <StatusBadge status={g.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardTitle icon={<BookOpen className="h-4 w-4" />} action={<Link to="/library" className="text-sm text-primary">View all</Link>}>
                Recent projects
              </CardTitle>
              <ul className="divide-y divide-border">
                {data.recentProjects.map((p) => (
                  <li key={p._id} className="py-2.5 flex items-center justify-between gap-3">
                    <Link to={`/projects/${p._id}`} className="min-w-0 hover:text-primary">
                      <p className="font-medium truncate">{p.title}</p>
                      <p className="text-xs text-muted">
                        {p.subject || 'No subject detected yet'} · updated {timeAgo(p.updatedAt)}
                      </p>
                    </Link>
                    <StatusBadge status={p.status.content} />
                  </li>
                ))}
              </ul>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardTitle icon={<AlertTriangle className="h-4 w-4" />}>Topics marked as difficult</CardTitle>
                {data.weakTopics.length ? (
                  <ul className="space-y-2">
                    {data.weakTopics.map((t) => (
                      <li key={`${t.lessonId}-${t.concept}`} className="text-sm">
                        <Link to={`/lessons/${t.lessonId}`} className="hover:text-primary font-medium">
                          {t.concept}
                        </Link>
                        <span className="block text-xs text-muted">
                          {t.mistakes} mistake{t.mistakes === 1 ? '' : 's'} · {t.lessonTitle}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Weak topics appear after you answer quizzes or review flashcards.</p>
                )}
              </Card>
              <Card>
                <CardTitle icon={<CheckCircle2 className="h-4 w-4" />}>Recently studied</CardTitle>
                {data.recentlyStudied.length ? (
                  <ul className="space-y-2">
                    {data.recentlyStudied.map((r) => (
                      <li key={r.lessonId} className="text-sm flex justify-between gap-2">
                        <Link to={`/lessons/${r.lessonId}`} className="hover:text-primary truncate">
                          {r.title}
                        </Link>
                        <span className="text-muted shrink-0">{r.completion}%</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No study sessions recorded yet.</p>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
