import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { errorMessage } from '../../lib/api';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-primary', className ?? 'h-5 w-5')} aria-hidden />;
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-muted" role="status">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-12 px-6 border border-dashed border-border rounded-xl bg-surface/40">
      {icon && <div className="text-primary/80">{icon}</div>}
      <h3 className="font-semibold text-lg">{title}</h3>
      {children && <div className="text-muted max-w-md text-sm">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-error/40 bg-error/10 p-4 text-sm">
      <XCircle className="h-5 w-5 text-error shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-error font-medium">{errorMessage(error)}</p>
        {onRetry && (
          <button className="mt-2 text-primary underline underline-offset-2" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function Alert({ tone = 'warning', children, title }: { tone?: 'warning' | 'info' | 'success' | 'error'; title?: string; children: ReactNode }) {
  const tones = {
    warning: 'border-warning/40 bg-warning/10 text-warning',
    info: 'border-primary/40 bg-primary/10 text-primary',
    success: 'border-success/40 bg-success/10 text-success',
    error: 'border-error/40 bg-error/10 text-error',
  };
  return (
    <div className={cn('rounded-lg border p-3 text-sm flex gap-2', tones[tone])}>
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="text-text/90">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error'; className?: string }) {
  const tones = {
    default: 'bg-surface-2 text-muted border-border',
    primary: 'bg-primary/10 text-primary border-primary/30',
    secondary: 'bg-secondary/10 text-secondary border-secondary/30',
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    error: 'bg-error/10 text-error border-error/30',
  };
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

const STATUS_TONES: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error' | 'secondary'> = {
  completed: 'success',
  ready: 'success',
  running: 'primary',
  generating: 'primary',
  processing: 'primary',
  queued: 'default',
  pending: 'default',
  awaiting_review: 'secondary',
  partially_completed: 'warning',
  partial: 'warning',
  failed: 'error',
  cancelled: 'default',
  skipped: 'default',
  source_added: 'primary',
  empty: 'default',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'default'}>{status.replace(/_/g, ' ')}</Badge>;
}

export function StageIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-5 w-5 text-success" aria-label="completed" />;
  if (status === 'running') return <Spinner className="h-5 w-5" />;
  if (status === 'failed') return <XCircle className="h-5 w-5 text-error" aria-label="failed" />;
  if (status === 'skipped') return <CircleDashed className="h-5 w-5 text-muted/50" aria-label="skipped" />;
  return <CircleDashed className="h-5 w-5 text-muted" aria-label="pending" />;
}
