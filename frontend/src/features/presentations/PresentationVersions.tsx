import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Save } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Alert, PageLoader } from '../../components/ui/Feedback';
import { timeAgo } from '../../utils/format';
import type { Presentation } from '../../types/models';

interface VersionRow {
  version: number;
  label: string;
  createdAt: string;
  slideCount: number;
}

/** Presentation version history: save named versions and restore earlier ones. */
export function VersionsButton({ presentation, onRestored }: { presentation: Presentation; onRestored: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const key = ['presentation-versions', presentation._id];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ versions: VersionRow[] }>(`/presentations/${presentation._id}/versions`)).versions,
    enabled: open,
  });
  const save = useMutation({
    mutationFn: () => api.post(`/presentations/${presentation._id}/versions`, { label }),
    onSuccess: () => {
      setLabel('');
      qc.invalidateQueries({ queryKey: key });
      onRestored();
    },
  });
  const restore = useMutation({
    mutationFn: (version: number) => api.post(`/presentations/${presentation._id}/versions/${version}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      onRestored();
      setOpen(false);
    },
  });

  return (
    <>
      <button className="p-2 rounded-lg hover:bg-surface-2" onClick={() => setOpen(true)} aria-label="Version history" title="Version history">
        <History className="h-5 w-5" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Versions — currently v${presentation.version}`}>
        <div className="space-y-4">
          {(save.error || restore.error) && <Alert tone="error">{errorMessage(save.error ?? restore.error)}</Alert>}
          <div className="flex gap-2 items-end">
            <Input className="flex-1" label="Save the current version" placeholder="Label, e.g. Before exam edits" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
            <Button icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </div>
          {isLoading ? (
            <PageLoader />
          ) : !data?.length ? (
            <p className="text-sm text-muted">No saved versions yet. Regenerating the lesson also saves the previous presentation here.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.map((v) => (
                <li key={v.version} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="font-medium">
                      v{v.version} {v.label && <span className="text-muted font-normal">— {v.label}</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {v.slideCount} slides · {timeAgo(v.createdAt)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" loading={restore.isPending && restore.variables === v.version} onClick={() => restore.mutate(v.version)}>
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
