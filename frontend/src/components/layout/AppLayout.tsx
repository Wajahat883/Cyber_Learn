import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  Compass,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useSubjects, useWorkspace } from '../../features/subjects/useSubjects';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useTheme, type ThemeChoice } from '../../hooks/useTheme';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { PageLoader } from '../ui/Feedback';
import { buttonClass } from '../ui/Button';
import type { Generation } from '../../types/models';
import { CommandPalette } from './CommandPalette';

/**
 * Five destinations instead of eleven. Related screens live inside each
 * destination as tabs, so every page is still one or two clicks away.
 */
const NAV = [
  { to: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { to: '/library', label: 'Library', icon: BookOpen, match: (p: string) => /^\/(library|projects|presentations|subjects|lessons|generations)/.test(p) },
  { to: '/revision', label: 'Study', icon: GraduationCap, match: (p: string) => p.startsWith('/revision') },
  { to: '/progress', label: 'Progress', icon: TrendingUp, match: (p: string) => p.startsWith('/progress') },
  { to: '/ask', label: 'Explore', icon: Compass, match: (p: string) => p.startsWith('/ask') || p.startsWith('/knowledge-graph') },
];

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onOutside();
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [onOutside]);
  return ref;
}

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { data: subjects } = useSubjects();
  const { workspaceId, setWorkspaceId } = useWorkspace();
  const current = subjects?.find((s) => s._id === workspaceId);
  if (collapsed) {
    return <span className="mx-auto block h-3 w-3 rounded-full" style={{ background: current?.color ?? 'var(--muted)' }} title={current?.name ?? 'All subjects'} />;
  }
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted px-1">Workspace</span>
      <div className="relative mt-1.5">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full pointer-events-none" style={{ background: current?.color ?? 'var(--muted)' }} />
        <select
          aria-label="Current workspace"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          className="w-full h-9 appearance-none rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-text truncate focus:outline-none focus:border-primary"
        >
          <option value="">All subjects</option>
          {subjects?.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function Sidebar({ collapsed, onToggle, onNavigate }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Main" className="flex flex-col h-full">
      <Link to="/" className={cn('flex items-center gap-2.5 h-16 shrink-0', collapsed ? 'justify-center' : 'px-5')} onClick={onNavigate}>
        <span className="h-8 w-8 rounded-[10px] bg-primary text-primary-fg flex items-center justify-center shrink-0">
          <ShieldCheck className="h-[18px] w-[18px]" />
        </span>
        {!collapsed && <span className="font-display font-bold text-[17px] tracking-tight">CyberLearn</span>}
      </Link>

      <div className={cn('pb-4', collapsed ? 'px-3' : 'px-4')}>
        <Link to="/create" onClick={onNavigate} className={buttonClass('primary', collapsed ? 'icon' : 'md', collapsed ? 'w-10 mx-auto flex' : 'w-full')} aria-label="Create lesson">
          <Plus className="h-4 w-4" /> {!collapsed && 'Create lesson'}
        </Link>
      </div>

      <ul className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.match(pathname);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-[10px] px-3 h-10 text-sm font-medium transition-colors',
                  active ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text hover:bg-surface/60',
                  collapsed && 'justify-center px-0',
                )}
              >
                <Icon className={cn('h-[18px] w-[18px] shrink-0', active && 'text-primary')} />
                {!collapsed && item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={cn('space-y-3 pb-4', collapsed ? 'px-3' : 'px-4')}>
        <WorkspaceSwitcher collapsed={collapsed} />
        <Link
          to="/settings"
          onClick={onNavigate}
          aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
          title={collapsed ? 'Settings' : undefined}
          className={cn('flex items-center gap-3 rounded-[10px] px-3 h-9 text-sm text-muted hover:text-text hover:bg-surface/60', collapsed && 'justify-center px-0', pathname.startsWith('/settings') && 'text-text')}
        >
          <Settings className="h-4 w-4" /> {!collapsed && 'Settings'}
        </Link>
        {onToggle && (
          <button onClick={onToggle} className={cn('hidden lg:flex items-center gap-3 rounded-[10px] px-3 h-9 w-full text-sm text-muted hover:text-text', collapsed && 'justify-center px-0')} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && 'Collapse'}
          </button>
        )}
      </div>
    </nav>
  );
}

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

function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
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

/** Bottom tab bar on phones: the same five destinations, always one tap away. */
function MobileTabs() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Primary" className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-surface/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.match(pathname);
          return (
            <li key={item.to}>
              <Link to={item.to} aria-current={active ? 'page' : undefined} className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', active ? 'text-primary' : 'text-muted')}>
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useLocalStorage('cl.sidebarCollapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setPaletteOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-fg">
        Skip to content
      </a>
      <aside className={cn('hidden lg:block shrink-0 bg-sidebar border-r border-border transition-[width] duration-200', collapsed ? 'w-[76px]' : 'w-60')}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </aside>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-sidebar border-r border-border shadow-pop">
            <button className={buttonClass('ghost', 'icon', 'absolute right-3 top-3.5')} onClick={() => setMobileOpen(false)} aria-label="Close navigation">
              <X className="h-5 w-5" />
            </button>
            <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto">
        <TopBar onMenu={() => setMobileOpen(true)} onSearch={() => setPaletteOpen(true)} />
        <main id="main" className="flex-1 px-4 sm:px-8 pt-4 pb-24 lg:pb-12 max-w-[1440px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
      <MobileTabs />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
