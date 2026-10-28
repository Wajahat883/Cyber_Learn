import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  // Which item gets focus when the menu opens: the first, or the last when opened with ArrowUp.
  const initialFocus = useRef<'first' | 'last'>('first');

  const menuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
  const focusItem = (which: 'first' | 'last' | 'next' | 'prev') => {
    const list = menuItems();
    if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    const index = which === 'first' ? 0 : which === 'last' ? list.length - 1 : which === 'next' ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
    list[index].focus();
  };
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    focusItem(initialFocus.current);
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openWith = (focus: 'first' | 'last') => {
    initialFocus.current = focus;
    setOpen(true);
  };

  const itemClass = (i: MenuItem) =>
    cn('w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left [&_svg]:h-4 [&_svg]:w-4', i.danger ? 'text-error hover:bg-error/10' : 'hover:bg-surface-2', i.disabled && 'opacity-50 pointer-events-none');

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : openWith('first'))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openWith(e.key === 'ArrowDown' ? 'first' : 'last');
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={(e) => {
            const keys: Record<string, 'first' | 'last' | 'next' | 'prev'> = { ArrowDown: 'next', ArrowUp: 'prev', Home: 'first', End: 'last' };
            if (keys[e.key]) {
              e.preventDefault();
              focusItem(keys[e.key]);
            } else if (e.key === 'Tab') close(false);
          }}
          className={cn('absolute z-40 mt-2 min-w-52 rounded-xl border border-border bg-surface p-1.5 shadow-pop', align === 'right' ? 'right-0' : 'left-0')}
        >
          {items.map((item) =>
            item.to ? (
              <Link key={item.label} role="menuitem" tabIndex={-1} to={item.to} className={itemClass(item)} onClick={() => setOpen(false)}>
                <span className="text-muted">{item.icon}</span>
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                tabIndex={-1}
                disabled={item.disabled}
                className={itemClass(item)}
                onClick={() => {
                  close(true);
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
