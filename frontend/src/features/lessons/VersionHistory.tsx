import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Alert, PageLoader } from '../../components/ui/Feedback';
import { timeAgo } from '../../utils/format';
import type { LessonVersionRow } from '../../types/models';

/** Previous lesson versions are preserved so useful notes are never lost (Roman Urdu section 7). */
export function VersionHistory({ lessonId, open, onClose }: { lessonId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['lesson-versions', lessonId],
    queryFn: async () => (await api.get<{ versions: LessonVersionRow[] }>(`/lessons/${lessonId}/versions`)).versions,
    enabled: open,
  });
  const restore = useMutation({
    mutationFn: (version: number) => api.post(`/lessons/${lessonId}/versions/${version}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson', lessonId] });
      qc.invalidateQueries({ queryKey: ['lesson-versions', lessonId] });
      onClose();
    },
  });
  return (
    <Modal open={open} onClose={onClose} title="Version history">
      {restore.error && <Alert tone="error">{errorMessage(restore.error)}</Alert>}
      {isLoading ? (
        <PageLoader />
      ) : !data?.length ? (
        <p className="text-sm text-muted">No earlier versions yet. A version is saved automatically when you edit or regenerate the lesson.</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.map((v) => (
            <li key={v.version} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="font-medium flex items-center gap-2">
                  <History className="h-4 w-4 text-muted" /> Version {v.version}
                </p>
                <p className="text-xs text-muted">
                  {v.reason} · {timeAgo(v.createdAt)}
                </p>
              </div>
              <Button size="sm" variant="outline" loading={restore.isPending && restore.variables === v.version} onClick={() => restore.mutate(v.version)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
