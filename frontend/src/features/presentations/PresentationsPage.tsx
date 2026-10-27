import { useQuery } from '@tanstack/react-query';
import { BookOpen, MonitorPlay, Play } from 'lucide-react';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/ui/Card';
import { ButtonLink } from '../../components/ui/Button';
import { EmptyState, PageLoader, StatusBadge } from '../../components/ui/Feedback';
import { timeAgo } from '../../utils/format';
import { LibraryTabs } from '../../components/layout/hubs';

export interface LessonSummary {
  _id: string;
  title: string;
  subject: string;
  projectId: string;
  generationStatus: string;
  updatedAt: string;
  sectionCount: number;
  diagramCount: number;
  presentation: { _id: string; version: number; slideCount: number } | null;
}

export function useLessons() {
  return useQuery({ queryKey: ['lessons'], queryFn: async () => (await api.get<{ lessons: LessonSummary[] }>('/lessons')).lessons });
}

export function PresentationsPage() {
  const { data, isLoading } = useLessons();
  if (isLoading) return <PageLoader />;
  const items = (data ?? []).filter((l) => l.presentation);
  return (
    <div>
      <PageHeader title="Library" description="Every generated lesson comes with an animated, narrated presentation." />
      <LibraryTabs active="presentations" />
      {!items.length ? (
        <EmptyState icon={<MonitorPlay className="h-10 w-10" />} title="No presentations yet" action={<ButtonLink to="/create">Create a lesson</ButtonLink>}>
          Generate a lesson to get its presentation.
        </EmptyState>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((l) => (
            <div key={l._id} className="rounded-2xl border border-border bg-surface p-4 flex flex-col shadow-card">
              {/* Slide thumbnail: the presentation stage is dark in both themes. */}
              <div className="aspect-video rounded-xl bg-stage bg-[radial-gradient(ellipse_at_top_left,#16244a,#0b1020_60%)] p-4 flex flex-col justify-end mb-3 text-white">
                <p className="text-[11px] uppercase tracking-widest text-[#2dd4bf]">{l.subject || 'Lesson'}</p>
                <p className="font-display font-bold text-lg leading-tight line-clamp-2">{l.title}</p>
              </div>
              <div className="flex items-center justify-between text-sm text-muted">
                <span>
                  {l.presentation!.slideCount} slides · v{l.presentation!.version} · {timeAgo(l.updatedAt)}
                </span>
                <StatusBadge status={l.generationStatus} />
              </div>
              <div className="flex gap-2 mt-3">
                <ButtonLink to={`/lessons/${l._id}/present`} size="sm" icon={<Play className="h-4 w-4" />}>
                  Play
                </ButtonLink>
                <ButtonLink to={`/lessons/${l._id}`} size="sm" variant="outline" icon={<BookOpen className="h-4 w-4" />}>
                  Lesson
                </ButtonLink>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
