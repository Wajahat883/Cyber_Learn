import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface p-5', className)} {...rest} />;
}

export function CardTitle({ children, icon, action, className }: { children: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-2 mb-4', className)}>
      <h2 className="font-semibold flex items-center gap-2 text-text">
        {icon && <span className="text-primary">{icon}</span>}
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow && <div className="text-xs uppercase tracking-widest text-primary mb-1">{eyebrow}</div>}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight break-words">{title}</h1>
        {description && <p className="text-muted mt-1 max-w-3xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-muted text-sm">
        {label}
        {icon && <span className="text-primary/80">{icon}</span>}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </Card>
  );
}
