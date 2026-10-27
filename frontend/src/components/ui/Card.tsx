import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-border bg-surface p-5 shadow-card', className)} {...rest} />;
}

export function CardTitle({ children, icon, action, className }: { children: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-2 mb-4', className)}>
      <h2 className="font-semibold text-[15px] flex items-center gap-2 text-text">
        {icon && <span className="text-muted">{icon}</span>}
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div className="min-w-0">
        {eyebrow && <div className="text-xs font-medium text-muted mb-2">{eyebrow}</div>}
        <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight break-words">{title}</h1>
        {description && <p className="text-muted mt-2 max-w-2xl leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card h-full">
      <div className="flex items-center gap-2 text-muted text-[13px]">
        {icon && <span className="text-primary">{icon}</span>}
        {label}
      </div>
      <div className="font-display text-[26px] font-bold mt-1.5 leading-none tracking-tight">
        {value}
      </div>
      {hint && <div className="text-xs text-muted mt-1.5">{hint}</div>}
    </div>
  );
}

/** Pill tabs that link related pages together (Library, Explore …). */
export function SectionTabs({ tabs, active }: { tabs: { to: string; label: string; id: string }[]; active: string }) {
  return (
    <nav aria-label="Section" className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1 mb-6 shadow-card">
      {tabs.map((t) => (
        <Link
          key={t.id}
          to={t.to}
          aria-current={t.id === active ? 'page' : undefined}
          className={cn('rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors', t.id === active ? 'bg-primary-soft text-primary' : 'text-muted hover:text-text hover:bg-surface-2')}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
