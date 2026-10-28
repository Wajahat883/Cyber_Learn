import { Link, useLocation } from 'react-router';
import { cn } from '../../lib/cn';
import { NAV } from './nav';

/** Bottom tab bar on phones: the same five destinations, always one tap away. */
export function MobileTabs() {
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

