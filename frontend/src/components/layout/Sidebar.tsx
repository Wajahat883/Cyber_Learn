import { Link, useLocation } from 'react-router';
import { ChevronsLeft, ChevronsRight, Plus, Settings, ShieldCheck } from 'lucide-react';
import { useSubjects, useWorkspace } from '../../features/subjects/useSubjects';
import { cn } from '../../lib/cn';
import { buttonClass } from '../ui/Button';
import { NAV } from './nav';

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

export function Sidebar({ collapsed, onToggle, onNavigate }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void }) {
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

