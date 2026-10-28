import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Alert } from '../../components/ui/Feedback';

interface SourcePassage {
  chunkIndex: number;
  heading: string;
  page: number | null;
  text: string;
  excerpts: string[];
}

/** Marks the excerpts the section cites inside the full source passage. */
function highlighted(text: string, excerpts: string[]): ReactNode[] {
  const ranges: [number, number][] = [];
  const lower = text.toLowerCase();
  for (const raw of excerpts) {
    const clean = raw.replace(/[….\s]+$/u, '').replace(/^[….\s]+/u, '').trim();
    for (const probe of [clean, clean.slice(0, 60)]) {
      if (probe.length < 12) continue;
      const at = lower.indexOf(probe.toLowerCase());
      if (at >= 0) {
        ranges.push([at, at + probe.length]);
        break;
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const out: ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([a, b], i) => {
    if (a < pos) a = pos;
    if (b <= a) return;
    out.push(text.slice(pos, a), <mark key={i} className="rounded bg-primary/20 text-text px-0.5">{text.slice(a, b)}</mark>);
    pos = b;
  });
  out.push(text.slice(pos));
  return out;
}

export function SourcePane({ lessonId, sectionId, onClose }: { lessonId: string; sectionId: string; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['section-source', lessonId, sectionId],
    queryFn: () => api.get<{ passages: SourcePassage[] }>(`/lessons/${lessonId}/sections/${sectionId}/source`),
  });
  return (
    <aside className="rounded-xl border border-border bg-surface-2/60 p-4 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-7rem)] overflow-y-auto" aria-label="Your notes">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Your notes</p>
        <button onClick={onClose} className="text-xs text-muted hover:text-text">
          Close
        </button>
      </div>
      {isLoading && <p className="text-sm text-muted">Loading the source…</p>}
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {data && !data.passages.length && <p className="text-sm text-muted">This section has no source passages; it is supplementary.</p>}
      <div className="space-y-4">
        {data?.passages.map((p) => (
          <div key={p.chunkIndex} className="text-sm leading-relaxed">
            <p className="text-xs text-muted mb-1">
              {p.heading || `Passage ${p.chunkIndex + 1}`}
              {p.page ? ` · page ${p.page}` : ''}
            </p>
            <p className="whitespace-pre-wrap text-text/90">{highlighted(p.text, p.excerpts)}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

