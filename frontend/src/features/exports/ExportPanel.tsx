import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileDown, FileText, Presentation as PptIcon } from 'lucide-react';
import { api, assetUrl, errorMessage } from '../../lib/api';
import { Card, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Alert, StatusBadge } from '../../components/ui/Feedback';
import { formatBytes, timeAgo } from '../../utils/format';
import type { Asset } from '../../types/models';

const FORMATS = [
  { format: 'pdf', label: 'PDF notes', icon: FileText },
  { format: 'pptx', label: 'PPTX slides', icon: PptIcon },
  { format: 'markdown', label: 'Markdown', icon: FileDown },
] as const;

/** Export lesson notes and presentations (spec 14). */
export function ExportPanel({ lessonId, presentationId }: { lessonId: string; presentationId: string | null }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['exports', lessonId],
    queryFn: async () => (await api.get<{ exports: Asset[] }>(`/lessons/${lessonId}/exports`)).exports,
    refetchInterval: (q) => (q.state.data?.some((a) => a.status === 'pending' || a.status === 'processing') ? 2000 : false),
  });
  const request = useMutation({
    mutationFn: (format: string) =>
      presentationId ? api.post(`/presentations/${presentationId}/exports`, { format }) : api.post(`/lessons/${lessonId}/exports`, { format }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exports', lessonId] }),
  });

  return (
    <Card>
      <CardTitle icon={<Download className="h-4 w-4" />}>Export</CardTitle>
      <div className="grid grid-cols-3 gap-2">
        {FORMATS.map(({ format, label, icon: Icon }) => (
          <Button
            key={format}
            variant="outline"
            size="sm"
            className="flex-col h-auto py-3"
            loading={request.isPending && request.variables === format}
            disabled={format === 'pptx' && !presentationId}
            onClick={() => request.mutate(format)}
          >
            <Icon className="h-5 w-5" />
            <span className="text-xs">{label}</span>
          </Button>
        ))}
      </div>
      {request.error && (
        <div className="mt-3">
          <Alert tone="error">{errorMessage(request.error)}</Alert>
        </div>
      )}
      {data && data.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {data.map((a) => (
            <li key={a._id} className="flex items-center justify-between gap-2">
              <span className="truncate text-muted">
                {a.filename || a.assetType} · {timeAgo(a.createdAt)}
              </span>
              {a.status === 'ready' ? (
                <a href={`${assetUrl(a._id)}?download=1`} className="text-primary flex items-center gap-1 shrink-0">
                  <Download className="h-3.5 w-3.5" /> {formatBytes(a.sizeBytes)}
                </a>
              ) : (
                <span title={a.error}>
                  <StatusBadge status={a.status} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
