import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut, Menu, Monitor, Moon, Search, Settings, Sun } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useTheme, type ThemeChoice } from '../../hooks/useTheme';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { buttonClass } from '../ui/Button';
import type { Generation } from '../../types/models';
import { useClickOutside } from './useClickOutside';

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const { data } = useQuery({
    queryKey: ['generations', 'active'],
    queryFn: async () => (await api.get<{ generations: Generation[] }>('/generations?active=true')).generations,
    refetchInterval: 10_000,
    retry: false,
  });
  const items = data ?? [];
  return (
    <div className="relative" ref={ref}>
      <button className={buttonClass('ghost', 'icon', 'relative')} onClick={() => setOpen(!open)} aria-label={`Notifications (${items.length} running)`} aria-expanded={open}>
        <Bell className="h-[18px] w-[18px]" />
        {items.length > 0 && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary ring-2 ring-bg animate-pulse" />}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-border bg-surface shadow-pop z-50 p-2">
          <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Generation jobs</p>
          {items.length === 0 && <p className="px-2 py-3 text-sm text-muted">Nothing is generating right now.</p>}
          {items.map((g) => (
            <Link key={g._id} to={`/generations/${g._id}`} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 hover:bg-surface-2 text-sm">
              <span className="font-medium">{typeof g.projectId === 'object' ? g.projectId.title : 'Lesson'}</span>
              <span className="block text-xs text-muted">
                {g.status.replace(/_/g, ' ')}
                {g.currentStage ? ` · ${g.currentStage}` : ''}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function ProfileMenu() {
  const { user, logout } = useAuth();
  const { choice, setChoice } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const initials = (user?.displayName ?? '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="User menu"
        aria-expanded={open}
        className="h-9 w-9 rounded-full bg-secondary-soft text-secondary font-semibold text-sm flex items-center justify-center ring-1 ring-border hover:ring-primary"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-border bg-surface shadow-pop z-50 p-2">
          <div className="px-2 py-2 mb-1">
            <p className="font-medium truncate">{user?.displayName}</p>
            <p className="text-xs text-muted truncate">{user?.email}</p>
          </div>
          <div className="px-2 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Theme</p>
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
              {THEMES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    role="radio"
                    aria-checked={choice === t.value}
                    onClick={() => setChoice(t.value)}
                    className={cn('flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px]', choice === t.value ? 'bg-surface shadow-card text-text' : 'text-muted hover:text-text')}
                  >
                    <Icon className="h-4 w-4" /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-border pt-1">
            <Link to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-2 text-sm">
              <Settings className="h-4 w-4 text-muted" /> Settings
            </Link>
            <button
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-2 text-sm text-error"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header className="sticky top-0 z-30 h-16 bg-bg/80 backdrop-blur-md flex items-center gap-3 px-4 sm:px-8">
      <span className="lg:hidden">
        <button className={buttonClass('ghost', 'icon')} onClick={onMenu} aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </button>
      </span>
      <button
        onClick={onSearch}
        aria-label="Search and jump to (Ctrl+K)"
        className="flex-1 max-w-md h-10 flex items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3 text-sm text-muted shadow-card hover:border-primary/50 transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left truncate">Search or jump to…</span>
        <kbd className="hidden sm:inline text-[11px] border border-border rounded px-1.5 py-0.5">{mac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1.5">
        <Notifications />
        <ProfileMenu />
      </div>
    </header>
  );
}

