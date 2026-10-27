import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  MessageSquareText,
  MonitorPlay,
  Network,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  X,
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useSubjects, useWorkspace } from '../../features/subjects/useSubjects';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { PageLoader } from '../ui/Feedback';
import { buttonClass } from '../ui/Button';
import type { Generation } from '../../types/models';

/** Sidebar entries from spec 4.2, plus the universal-workspace screens. */
const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/library', label: 'My Library', icon: BookOpen },
  { to: '/create', label: 'Create Lesson', icon: Plus },
  { to: '/presentations', label: 'Presentations', icon: MonitorPlay },
  { to: '/revision?tab=flashcards', label: 'Flashcards', icon: Layers, match: '/revision' },
  { to: '/revision?tab=quizzes', label: 'Quizzes', icon: GraduationCap, match: '/revision' },
  { to: '/progress', label: 'Learning Progress', icon: TrendingUp },
  { to: '/subjects', label: 'Subjects', icon: FolderKanban },
  { to: '/ask', label: 'Ask My Notes', icon: MessageSquareText },
  { to: '/knowledge-graph', label: 'Knowledge Graph', icon: Network },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Sidebar({ collapsed, onToggle, onNavigate }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void }) {
  const location = useLocation();
  const tab = new URLSearchParams(location.search).get('tab');
  return (
    <nav aria-label="Main" className="flex flex-col h-full">
      <Link to="/" className="flex items-center gap-2 px-4 h-16 border-b border-border shrink-0" onClick={onNavigate}>
        <ShieldCheck className="h-7 w-7 text-primary shrink-0" />
        {!collapsed && (
          <span className="font-bold tracking-tight text-lg">
            CyberLearn <span className="text-primary">AI</span>
          </span>
        )}
      </Link>
      <ul className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isRevision = item.match === '/revision';
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) => {
                  const active = isRevision ? location.pathname === '/revision' && (item.to.endsWith(tab ?? 'flashcards') || (!tab && item.label === 'Flashcards')) : isActive;
                  return cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    active ? 'bg-primary/10 text-primary border border-primary/25' : 'text-muted hover:text-text hover:bg-surface-2 border border-transparent',
                    collapsed && 'justify-center px-2',
                  );
                }}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            </li>
          );
        })}
      </ul>
      {onToggle && (
        <button
          onClick={onToggle}
          className="hidden lg:flex items-center gap-2 px-4 h-12 border-t border-border text-muted hover:text-text text-sm"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4 mx-auto" /> : <ChevronsLeft className="h-4 w-4" />}
          {!collapsed && 'Collapse'}
        </button>
      )}
    </nav>
  );
}

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
        <Bell className="h-5 w-5" />
        {items.length > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border bg-surface shadow-2xl z-50 p-2">
          <p className="px-2 py-1 text-xs uppercase tracking-wider text-muted">Generation jobs</p>
          {items.length === 0 && <p className="px-2 py-3 text-sm text-muted">No jobs are running.</p>}
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

function ProfileMenu() {
  const { user, logout } = useAuth();
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
        className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-secondary text-bg font-bold text-sm flex items-center justify-center"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-xl border border-border bg-surface shadow-2xl z-50 p-2">
          <div className="px-2 py-2 border-b border-border mb-1">
            <p className="font-medium truncate">{user?.displayName}</p>
            <p className="text-xs text-muted truncate">{user?.email}</p>
          </div>
          <Link to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-2 text-sm">
            <Settings className="h-4 w-4" /> Settings
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
      )}
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { data: subjects } = useSubjects();
  const { workspaceId, setWorkspaceId } = useWorkspace();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/library?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-bg/85 backdrop-blur flex items-center gap-2 sm:gap-3 px-3 sm:px-6">
      <button className={buttonClass('ghost', 'icon', 'lg:hidden')} onClick={onMenu} aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>
      <form onSubmit={submit} role="search" className="flex-1 max-w-xl relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search lessons, tags, subjects…"
          aria-label="Search library"
          className="w-full h-10 rounded-lg border border-border bg-surface pl-9 pr-3 text-sm placeholder:text-muted/70 focus:border-primary focus:outline-none"
        />
      </form>
      <select
        aria-label="Current workspace"
        value={workspaceId}
        onChange={(e) => setWorkspaceId(e.target.value)}
        className="hidden md:block h-10 max-w-48 rounded-lg border border-border bg-surface px-2 text-sm text-text"
      >
        <option value="">All subjects</option>
        {subjects?.map((s) => (
          <option key={s._id} value={s._id}>
            {s.name}
          </option>
        ))}
      </select>
      <Link to="/create" className={buttonClass('primary', 'md', 'hidden sm:inline-flex')}>
        <Plus className="h-4 w-4" /> New project
      </Link>
      <Link to="/create" className={buttonClass('primary', 'icon', 'sm:hidden')} aria-label="Create new project">
        <Plus className="h-4 w-4" />
      </Link>
      <Notifications />
      <ProfileMenu />
    </header>
  );
}

export function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useLocalStorage('cl.sidebarCollapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-bg">
        Skip to content
      </a>
      <aside className={cn('hidden lg:block shrink-0 border-r border-border bg-sidebar transition-[width] duration-200', collapsed ? 'w-[72px]' : 'w-64')}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </aside>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-sidebar border-r border-border">
            <button className={buttonClass('ghost', 'icon', 'absolute right-2 top-3.5')} onClick={() => setMobileOpen(false)} aria-label="Close navigation">
              <X className="h-5 w-5" />
            </button>
            <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto">
        <TopBar onMenu={() => setMobileOpen(true)} />
        <main id="main" className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

