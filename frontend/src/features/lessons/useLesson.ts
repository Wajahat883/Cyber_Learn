import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Lesson, LessonSummary, Progress } from '../../types/models';

/** All of the user's lessons (shared by the presentations list, revision filters and the command palette). */
export function useLessons(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: ['lessons'], queryFn: async () => (await api.get<{ lessons: LessonSummary[] }>('/lessons')).lessons, enabled: options.enabled ?? true });
}

export function useLesson(id: string | undefined) {
  return useQuery({
    queryKey: ['lesson', id],
    queryFn: async () => (await api.get<{ lesson: Lesson }>(`/lessons/${id}`)).lesson,
    enabled: Boolean(id),
  });
}

export function useLessonProgress(id: string | undefined) {
  return useQuery({
    queryKey: ['lesson-progress', id],
    queryFn: async () => (await api.get<{ progress: Progress }>(`/lessons/${id}/progress`)).progress,
    enabled: Boolean(id),
  });
}
