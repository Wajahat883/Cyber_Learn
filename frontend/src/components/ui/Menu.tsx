import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  to?: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Small dropdown for secondary actions, so screens show one or two primary buttons only. */
export function Menu({ trigger, triggerClassName, label, items, align = 'right' }: { trigger: ReactNode; triggerClassName: string; label: string; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const itemClass = (i: MenuItem) =>
    cn('w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left [&_svg]:h-4 [&_svg]:w-4', i.danger ? 'text-error hover:bg-error/10' : 'hover:bg-surface-2', i.disabled && 'opacity-50 pointer-events-none');

  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={triggerClassName}>
        {trigger}
      </button>
      {open && (
        <div role="menu" className={cn('absolute z-40 mt-2 min-w-52 rounded-xl border border-border bg-surface p-1.5 shadow-pop', align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((item) =>
            item.to ? (
              <Link key={item.label} role="menuitem" to={item.to} className={itemClass(item)} onClick={() => setOpen(false)}>
                <span className="text-muted">{item.icon}</span>
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                className={itemClass(item)}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                <span className={item.danger ? '' : 'text-muted'}>{item.icon}</span>
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
