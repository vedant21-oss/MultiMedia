import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bell, CalendarDays, FileText, Image as ImageIcon, LayoutDashboard, Library,
  LogOut, Menu, MessageSquare, Mic, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings,
  Sparkles, Sun, Video, X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useCapabilities } from '@/hooks/useCapabilities';
import { Badge, Button } from '@/components/ui';
import { CommandSearch } from './CommandSearch';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/create', label: 'Create Content', icon: Sparkles },
  { to: '/app/video', label: 'Video Studio', icon: Video },
  { to: '/app/audio', label: 'Audio Studio', icon: Mic },
  { to: '/app/image', label: 'Image Studio', icon: ImageIcon },
  { to: '/app/documents', label: 'Document Studio', icon: FileText },
  { to: '/app/chat', label: 'AI Content Chat', icon: MessageSquare },
  { to: '/app/library', label: 'Content Library', icon: Library },
  { to: '/app/planner', label: 'Social Planner', icon: CalendarDays },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

export function AppShell() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('creatorai.sidebar') === 'collapsed',
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { data: caps } = useCapabilities();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem('creatorai.sidebar', collapsed ? 'collapsed' : 'expanded');
  }, [collapsed]);

  // Close the mobile drawer on navigation.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const initials = (user?.full_name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const demoMode = caps?.ai_mode !== 'live';

  return (
    <div className="flex min-h-screen">
      {/* ---------- Sidebar ---------- */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-surface-1/95 backdrop-blur-xl transition-all duration-200',
          collapsed ? 'lg:w-[68px]' : 'lg:w-64',
          'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-4">
          <Link to="/app" className="flex items-center gap-2.5 overflow-hidden">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand to-accent">
              <Sparkles className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
            </div>
            {!collapsed && (
              <span className="whitespace-nowrap text-[15px] font-extrabold tracking-tight text-ink">
                Creator<span className="text-brand">AI</span>
              </span>
            )}
          </Link>
          <button
            className="ml-auto rounded-md p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand/12 text-brand'
                    : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                  collapsed && 'lg:justify-center lg:px-0',
                )
              }
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {demoMode && !collapsed && (
          <div className="mx-2.5 mb-2.5 rounded-lg border border-warning/30 bg-warning/[0.07] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-warning">Demo mode</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
              No AI key configured. Extraction, OCR and video tools are live; generation is
              extractive.
            </p>
            <Link
              to="/app/settings"
              className="mt-2 inline-block text-[11px] font-semibold text-warning hover:underline"
            >
              How to enable →
            </Link>
          </div>
        )}

        <div className="hidden border-t border-line p-2.5 lg:block">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-faint hover:bg-surface-2 hover:text-ink',
              collapsed && 'justify-center px-0',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" />
            ) : (
              <>
                <PanelLeftClose className="h-[18px] w-[18px]" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ---------- Main column ---------- */}
      <div className={cn('flex min-w-0 flex-1 flex-col', collapsed ? 'lg:pl-[68px]' : 'lg:pl-64')}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface-0/85 px-4 backdrop-blur-xl sm:px-6">
          <button
            className="rounded-md p-2 text-ink-muted hover:bg-surface-2 hover:text-ink lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-9 flex-1 items-center gap-2.5 rounded-lg border border-line bg-surface-1 px-3 text-sm text-ink-faint transition-colors hover:border-line hover:bg-surface-2 sm:max-w-md"
          >
            <Search className="h-4 w-4" />
            <span className="truncate">Search your content…</span>
            <kbd className="ml-auto hidden rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-faint sm:block">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {demoMode && (
              <Badge tone="warning" className="hidden sm:inline-flex">
                Demo mode
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              onClick={() => navigate('/app/settings?tab=notifications')}
            >
              <Bell className="h-[18px] w-[18px]" />
            </Button>

            <div className="mx-1 hidden h-6 w-px bg-line sm:block" />

            <Link to="/app/settings" className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-surface-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">
                {initials}
              </div>
              <div className="hidden text-left leading-tight sm:block">
                <div className="text-[13px] font-semibold text-ink">{user?.full_name}</div>
                <div className="text-[11px] text-ink-faint">{user?.email}</div>
              </div>
            </Link>

            <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out" title="Sign out">
              <LogOut className="h-[18px] w-[18px]" />
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>

      <CommandSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
