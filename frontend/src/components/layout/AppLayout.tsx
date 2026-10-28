import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { X } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { cn } from '../../lib/cn';
import { PageLoader } from '../ui/Feedback';
import { buttonClass } from '../ui/Button';
import { CommandPalette } from './CommandPalette';
import { MobileTabs } from './MobileTabs';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

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
