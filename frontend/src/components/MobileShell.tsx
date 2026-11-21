import clsx from 'clsx';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useOnline, useOutbox } from '../offline/hooks';
import { syncOutbox } from '../offline/outbox';
import { ErrorBoundary } from './ErrorBoundary';
import { LogoMark } from './Logo';

/** Mobile-first layout for drivers and clinic receivers. Always shows connection + queue state. */
export function MobileShell({ title, home }: { title: string; home: string }) {
  const { user, logout } = useAuth();
  const online = useOnline();
  const outbox = useOutbox();
  const pending = outbox.filter((i) => i.status === 'pending').length;
  const failed = outbox.filter((i) => i.status === 'failed').length;

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="sticky top-0 z-20 bg-navy-900 text-white shadow">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link to={home} className="flex items-center gap-2 text-lg font-semibold">
            <LogoMark className="h-7 w-7" />
            {title}
          </Link>
          <span className="ml-auto truncate text-sm text-sidebar-text">{user?.name}</span>
          <button onClick={logout} className="min-h-11 rounded-md px-3 text-sm text-sidebar-text hover:bg-white/10">
            Sign out
          </button>
        </div>
        <div
          role="status"
          aria-live="polite"
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-base font-semibold',
            online ? 'bg-ok-text' : 'bg-warn text-navy-900',
          )}
        >
          <span aria-hidden className={clsx('h-3 w-3 rounded-full', online ? 'bg-white' : 'bg-navy-900')} />
          {online ? 'Online' : 'Offline — saving on this phone'}
          <span className="ml-auto">
            {pending > 0 ? `${pending} waiting to sync` : 'All synced'}
            {failed > 0 && <span className="ml-2 rounded bg-crit-text px-2 py-0.5 text-white">{failed} need attention</span>}
          </span>
          {online && pending > 0 && (
            <button onClick={() => void syncOutbox()} className="rounded bg-white/20 px-3 py-1 text-sm">
              Sync now
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 p-4">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
