import { useRef } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ImageIcon, RefreshCw, Upload } from 'lucide-react';
import { api, assetUrl, errorMessage } from '../../lib/api';
import { PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Alert, Badge, EmptyState, PageLoader, Spinner } from '../../components/ui/Feedback';
import { formatBytes, timeAgo } from '../../utils/format';
import type { Asset } from '../../types/models';
import { useLesson } from '../lessons/useLesson';

type GalleryAsset = Asset & { usage: { slideId: string; title: string }[]; updatedAt: string };

function ImageCard({ asset, lessonId, topic }: { asset: GalleryAsset; lessonId: string; topic: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['gallery', lessonId] });
  const regenerate = useMutation({ mutationFn: () => api.post(`/assets/${asset._id}/regenerate`), onSuccess: refresh });
  const replace = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post(`/assets/${asset._id}/replace`, form);
    },
    onSuccess: refresh,
  });
  const busy = asset.status === 'processing' || asset.status === 'pending' || regenerate.isPending;
  const src = `${assetUrl(asset._id)}?v=${encodeURIComponent(asset.updatedAt)}`;

  return (
    <article className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col">
      <div className="relative aspect-video bg-bg">
        {asset.status === 'ready' && <img src={src} alt={`Illustration: ${topic}`} className="w-full h-full object-cover" loading="lazy" />}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/70 gap-2 text-sm">
            <Spinner /> Generating…
          </div>
        )}
      </div>
      <div className="p-4 space-y-2 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{topic}</h3>
          {asset.generationMetadata.fallback ? (
            <Badge tone="warning">fallback — provider failed</Badge>
          ) : (
            <Badge tone="primary">{asset.generationMetadata.provider === 'placeholder' ? 'offline art' : asset.generationMetadata.provider || 'generated'}</Badge>
          )}
        </div>
        {asset.generationMetadata.prompt && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Generation description</summary>
            <p className="mt-1">{asset.generationMetadata.prompt}</p>
          </details>
        )}
        <p className="text-xs text-muted">
          {asset.usage.length ? `Used on ${asset.usage.length} slide${asset.usage.length === 1 ? '' : 's'}: ${asset.usage.map((u) => u.title).join(', ')}` : 'Not used on any slide'} · {formatBytes(asset.sizeBytes)} · {timeAgo(asset.updatedAt)}
        </p>
        {asset.error && <p className="text-xs text-warning">{asset.error}</p>}
        {(regenerate.error || replace.error) && <Alert tone="error">{errorMessage(regenerate.error ?? replace.error)}</Alert>}
        <div className="flex flex-wrap gap-2 pt-2 mt-auto">
          <Button size="sm" variant="outline" icon={<RefreshCw className="h-4 w-4" />} disabled={busy} onClick={() => regenerate.mutate()}>
            Regenerate
          </Button>
          <Button size="sm" variant="outline" icon={<Upload className="h-4 w-4" />} loading={replace.isPending} onClick={() => fileRef.current?.click()}>
            Replace
          </Button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && replace.mutate(e.target.files[0])} />
          <a className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-lg text-muted hover:text-text hover:bg-surface-2" href={`${assetUrl(asset._id)}?download=1`}>
            <Download className="h-4 w-4" /> Download
          </a>
        </div>
      </div>
    </article>
  );
}

/** Screen 8 — AI Image Gallery. */
export function GalleryPage() {
  const { id } = useParams();
  const { data: lesson } = useLesson(id);
  const { data: assets, isLoading } = useQuery({
    queryKey: ['gallery', id],
    queryFn: async () => (await api.get<{ assets: GalleryAsset[] }>(`/assets?lessonId=${id}&type=image`)).assets,
    refetchInterval: (q) => (q.state.data?.some((a) => a.status === 'processing' || a.status === 'pending') ? 2000 : false),
  });

  if (isLoading || !lesson) return <PageLoader />;
  const topic = (a: GalleryAsset) =>
    a.generationMetadata.topic === 'cover' ? `${lesson.title} (cover)` : lesson.sections.find((s) => s.id === a.generationMetadata.sectionId)?.title ?? a.generationMetadata.topic ?? 'Illustration';

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link to={`/lessons/${lesson._id}`} className="hover:underline">
            {lesson.title}
          </Link>
        }
        title="Illustration gallery"
        description="Illustrations support understanding; exact technical details stay in diagrams and editable labels."
      />
      {!assets?.length ? (
        <EmptyState icon={<ImageIcon className="h-10 w-10" />} title="No illustrations yet">
          Illustrations are generated when the visual mode includes illustrations.
        </EmptyState>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {assets.map((a) => (
            <ImageCard key={a._id} asset={a} lessonId={lesson._id} topic={topic(a)} />
          ))}
        </div>
      )}
    </div>
  );
}
