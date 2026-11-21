import clsx from 'clsx';
import {
  Bell,
  ChevronRight,
  FileText,
  LayoutGrid,
  LogOut,
  Map,
  Menu,
  Package,
  Search,
  Settings,
  Smartphone,
  Truck,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAlerts } from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { can, roleLabel } from '../auth/permissions';
import type { Permission } from '../auth/permissions';
import { config } from '../config';
import { useOnline, useOutbox } from '../offline/hooks';
import { ErrorBoundary } from './ErrorBoundary';
import { Logo, LogoMark } from './Logo';
import { Avatar } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  perm: Permission;
  badge?: 'alerts';
}

const nav: NavItem[] = [
  { to: '/overview', label: 'Overview', icon: LayoutGrid, perm: 'viewDispatch' },
  { to: '/shipments', label: 'Shipments', icon: Package, perm: 'viewDispatch' },
  { to: '/tracking', label: 'Live Tracking', icon: Map, perm: 'viewDispatch' },
  { to: '/alerts', label: 'Alerts & Incidents', icon: Bell, perm: 'viewDispatch', badge: 'alerts' },
  { to: '/fleet', label: 'Drivers & Vehicles', icon: Truck, perm: 'viewDispatch' },
  { to: '/compliance', label: 'Compliance Reports', icon: FileText, perm: 'viewAudit' },
  { to: '/settings', label: 'Settings', icon: Settings, perm: 'viewSettings' },
];

const titles: [string, string][] = [
  ['/overview', 'Overview'],
  ['/shipments/new', 'New shipment'],
  ['/shipments', 'Shipments'],
  ['/tracking', 'Live Tracking'],
  ['/alerts', 'Alerts & Incidents'],
  ['/fleet', 'Drivers & Vehicles'],
  ['/compliance', 'Compliance Reports'],
  ['/settings', 'Settings'],
];

/** Desktop shell for dispatcher, admin and auditor — sidebar + top bar, per the Figma design. */
export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 lg:block">
        <Sidebar />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[264px] max-w-[85vw]">
            <Sidebar onClose={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setDrawerOpen(true)} />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
        <footer className="mx-auto flex w-full max-w-[1280px] gap-4 px-4 pb-6 text-[11px] text-faint sm:px-8">
          {config.useMockApi && <span>Demo environment · mock API</span>}
          <span>All times in local time</span>
        </footer>
      </div>
    </div>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user, logout } = useAuth();
  const role = user?.role;
  const alerts = useAlerts({ enabled: can(role, 'viewDispatch') });
  const online = useOnline();
  const outbox = useOutbox();
  const pending = outbox.filter((i) => i.status === 'pending').length;
  const [menuOpen, setMenuOpen] = useState(false);
  const items = nav.filter((n) => can(role, n.perm));

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-navy-900 px-4 pb-4 pt-5 text-sidebar-text">
      <div className="flex items-center justify-between px-1">
        <Logo />
        {onClose && (
          <button onClick={onClose} aria-label="Close navigation" className="rounded-md p-1.5 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-700 text-[13px] font-bold text-white">M</span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-semibold text-white">MedSwift Logistics</div>
          <div className="text-[11px]">Enterprise workspace</div>
        </div>
      </div>

      <p className="mb-2 mt-6 px-2 text-[10px] font-medium uppercase tracking-eyebrow text-sidebar-label">Workspace</p>
      <nav className="space-y-1" aria-label="Main">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              clsx(
                'flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition',
                isActive ? 'bg-brand text-white shadow-nav' : 'hover:bg-white/[0.06] hover:text-white',
              )
            }
          >
            <n.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            <span className="flex-1">{n.label}</span>
            {n.badge === 'alerts' && !!alerts.data?.length && (
              <span className="rounded bg-crit/25 px-1.5 text-[11px] font-semibold text-[#FFB3B0] tabular">{alerts.data.length}</span>
            )}
          </NavLink>
        ))}
        {role === 'admin' && (
          <NavLink to="/driver" className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium hover:bg-white/[0.06] hover:text-white">
            <Smartphone className="h-[18px] w-[18px]" aria-hidden />
            Driver app
          </NavLink>
        )}
      </nav>

      <div className="mt-auto pt-6">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <LogoMark className="h-6 w-6" />
          <p className="mt-3 text-[13px] font-semibold text-white">Cold chain. Complete confidence.</p>
          <p className="mt-0.5 text-[12px]">Your supply chain, protected.</p>
          <p className="mt-3 flex items-center gap-2 text-[11px]">
            <span className={clsx('h-1.5 w-1.5 rounded-full', online ? 'bg-accent' : 'bg-warn')} />
            {online ? (pending ? `${pending} records waiting to sync` : 'All systems operational') : 'Offline — changes saved locally'}
          </p>
        </div>

        <div className="relative mt-4 border-t border-white/10 pt-4">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-white/[0.06]"
          >
            <Avatar name={user?.name ?? '?'} className="h-9 w-9 bg-[#F1E4D3] text-[12px] text-[#7A5A35]" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-semibold text-white">{user?.name}</span>
              <span className="text-[11px]">{role && roleLabel[role]}</span>
            </span>
            <ChevronRight className={clsx('h-4 w-4 transition', menuOpen && '-rotate-90')} aria-hidden />
          </button>
          {menuOpen && (
            <button onClick={logout} className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] hover:bg-white/[0.06] hover:text-white">
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnline();
  const showDispatch = can(user?.role, 'viewDispatch');
  const alerts = useAlerts({ enabled: showDispatch });
  const [q, setQ] = useState('');
  const title = titles.find(([p]) => location.pathname.startsWith(p))?.[1] ?? '';
  const critical = alerts.data?.some((a) => a.level === 'critical');

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-4 px-4 sm:px-8">
        <button onClick={onMenu} aria-label="Open navigation" className="-ml-1 rounded-md p-2 text-muted hover:bg-canvas lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13px]">
          <span className="hidden text-faint sm:inline">Workspace</span>
          <ChevronRight className="hidden h-3.5 w-3.5 text-faint sm:block" aria-hidden />
          <span className="truncate font-medium text-ink">{title}</span>
        </nav>

        {showDispatch && (
          <form
            role="search"
            className="ml-auto hidden w-full max-w-xs items-center md:flex"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/shipments?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <label className="relative w-full">
              <span className="sr-only">Search shipments</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search shipments, drivers, clinics…"
                className="h-9 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-[13px] placeholder:text-faint focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/15"
              />
            </label>
          </form>
        )}

        <div className={clsx('flex items-center gap-4', !showDispatch && 'ml-auto')}>
          <span className="hidden items-center gap-2 text-[12px] text-muted sm:flex" role="status">
            <span className={clsx('h-2 w-2 rounded-full', online ? 'bg-ok' : 'bg-warn')} />
            {online ? 'System live' : 'Offline'}
          </span>
          {showDispatch && (
            <NavLink to="/alerts" aria-label={`Alerts${alerts.data?.length ? `, ${alerts.data.length} open` : ''}`} className="relative rounded-md p-2 text-muted hover:bg-canvas hover:text-ink">
              <Bell className="h-5 w-5" />
              {!!alerts.data?.length && <span className={clsx('absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-white', critical ? 'bg-crit' : 'bg-warn')} />}
            </NavLink>
          )}
          <Avatar name={user?.name ?? '?'} />
        </div>
      </div>
    </header>
  );
}
