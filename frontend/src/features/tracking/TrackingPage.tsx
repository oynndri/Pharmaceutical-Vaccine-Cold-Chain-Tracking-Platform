import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { errorMessage } from '../../api/client';
import { useLiveShipments } from '../../api/queries';
import { NetworkMap } from '../../components/NetworkMap';
import { Badge, Card, CardHeader, EmptyState, ErrorState, LoadingState, PageHeader, TempReading } from '../../components/ui';
import { fmtRelative } from '../../lib/format';

export function TrackingPage() {
  const shipments = useLiveShipments();
  const all = shipments.data?.items;
  const moving = useMemo(() => (all ?? []).filter((s) => s.status === 'in_transit'), [all]);
  const flagged = useMemo(
    () => moving.filter((s) => s.alertLevel !== 'ok').sort((a, b) => (a.alertLevel === b.alertLevel ? 0 : a.alertLevel === 'critical' ? -1 : 1)),
    [moving],
  );

  return (
    <div>
      <PageHeader title="Live Tracking" subtitle="A connected view of your pharmaceutical supply chain." />
      {shipments.isError && !all ? (
        <ErrorState message={errorMessage(shipments.error)} onRetry={() => shipments.refetch()} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <Card className="overflow-hidden">
            <CardHeader
              title="Network live view"
              subtitle={`${moving.length} active vehicles`}
              actions={<Badge tone={shipments.isError ? 'warn' : 'ok'}>{shipments.isError ? 'Reconnecting' : 'Connected'}</Badge>}
            />
            <div className="px-5 pb-5">
              {all ? <NetworkMap shipments={all} className="h-[460px] rounded-lg sm:h-[600px]" /> : <LoadingState />}
            </div>
          </Card>

          <Card className="flex max-h-[720px] flex-col">
            <CardHeader title="Needs attention" subtitle="Vehicles outside or near their range" />
            {!all ? (
              <LoadingState />
            ) : flagged.length === 0 ? (
              <EmptyState title="Every vehicle is within range" />
            ) : (
              <ul className="flex-1 divide-y divide-line-soft overflow-y-auto">
                {flagged.map((s) => (
                  <li key={s.id}>
                    <Link to={`/shipments/${s.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-code">{s.vehiclePlate}</p>
                        <p className="truncate text-[12px] text-faint">{s.code} · {s.destination}</p>
                        <p className="text-[11px] text-faint">Updated {fmtRelative(s.lastReadingIso)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <TempReading tempC={s.currentTempC} level={s.alertLevel} />
                        <Badge tone={s.alertLevel === 'critical' ? 'crit' : 'warn'}>{s.alertLevel === 'critical' ? 'Critical' : 'Warning'}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
