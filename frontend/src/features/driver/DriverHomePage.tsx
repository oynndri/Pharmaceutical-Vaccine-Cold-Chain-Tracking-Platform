import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useDriverShipments } from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { EmptyState, ErrorState, LevelBadge, LoadingState } from '../../components/ui';
import { fmtTemp, fmtTime, statusLabel } from '../../lib/format';
import { useOutbox } from '../../offline/hooks';
import { retryFailed } from '../../offline/outbox';

export function DriverHomePage() {
  const { user } = useAuth();
  const shipments = useDriverShipments(user!.id);
  const outbox = useOutbox();
  const failed = outbox.filter((i) => i.status === 'failed');

  return (
    <div className="space-y-4">
      {failed.length > 0 && (
        <section className="rounded-xl border-2 border-crit bg-crit-bg p-4">
          <h2 className="text-lg font-bold text-crit-text">Not accepted by the server</h2>
          <ul className="mt-2 space-y-2">
            {failed.map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <span className="flex-1 text-crit-text">
                  {i.kind === 'handoff' ? 'Handoff' : 'Temp log'} · {i.payload.shipmentId}: {i.lastError}
                </span>
                <button className="min-h-11 rounded-lg bg-white px-3 font-semibold" onClick={() => void retryFailed(i.id)}>Retry</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h1 className="text-2xl font-bold">My shipments</h1>
      {shipments.data?.fromCache && (
        <p className="rounded-lg border border-warn-line bg-warn-bg p-3 text-warn-text">Showing the last saved list (offline).</p>
      )}

      {shipments.isPending ? (
        <LoadingState />
      ) : shipments.isError ? (
        <ErrorState message={errorMessage(shipments.error)} onRetry={() => shipments.refetch()} />
      ) : shipments.data.items.filter((s) => s.status !== 'delivered').length === 0 ? (
        <EmptyState title="No active shipments assigned to you" />
      ) : (
        <ul className="space-y-3">
          {shipments.data.items
            .filter((s) => s.status !== 'delivered')
            .map((s) => (
              <li key={s.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-code">{s.code}</span>
                  <LevelBadge level={s.alertLevel} />
                  <span className="ml-auto text-faint">{statusLabel[s.status]}</span>
                </div>
                <p className="mt-1 text-lg">{s.destination}</p>
                <p className="text-muted">
                  {fmtTemp(s.currentTempC)} · range {s.minTempC}–{s.maxTempC}°C · ETA {fmtTime(s.etaIso)}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {s.status === 'scheduled' ? (
                    <Link to={`/driver/${s.id}/pickup`} className="col-span-2 flex min-h-14 items-center justify-center rounded-xl bg-brand text-lg font-semibold text-white">
                      Start pickup
                    </Link>
                  ) : (
                    <>
                      <Link to={`/driver/${s.id}/log`} className="flex min-h-14 items-center justify-center rounded-xl border-2 border-line bg-white text-lg font-semibold">
                        Log temp
                      </Link>
                      <Link to={`/driver/${s.id}/deliver`} className="flex min-h-14 items-center justify-center rounded-xl bg-brand text-lg font-semibold text-white">
                        Deliver
                      </Link>
                    </>
                  )}
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
