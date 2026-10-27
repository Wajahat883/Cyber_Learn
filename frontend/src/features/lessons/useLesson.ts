import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Lesson, Progress } from '../../types/models';

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
