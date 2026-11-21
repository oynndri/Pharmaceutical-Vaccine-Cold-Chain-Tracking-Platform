import { ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAuditReport, useShipment, useTelemetry } from '../../api/queries';
import { TempAreaChart } from '../../components/charts';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, ShipmentStatusBadge } from '../../components/ui';
import { levelTextColor } from '../../components/ui/styles';
import { fmtDateTime, fmtRelative, fmtTemp } from '../../lib/format';

export function ShipmentDetailPage() {
  const { id = '' } = useParams();
  const shipment = useShipment(id);
  const telemetry = useTelemetry(id);
  const report = useAuditReport(id);

  if (shipment.isPending) return <LoadingState />;
  if (shipment.isError) return <ErrorState message={errorMessage(shipment.error)} onRetry={() => shipment.refetch()} />;
  const s = shipment.data;

  return (
    <div className="space-y-6">
      <Link to="/shipments" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-brand-link">
        <ArrowLeft className="h-4 w-4" /> All shipments
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-bold tracking-tightest text-ink">{s.code}</h1>
        <ShipmentStatusBadge status={s.status} level={s.alertLevel} />
        <span className="text-[13px] text-muted">{s.product} · Batch {s.batchNo}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Current temperature">
          <span className={`text-[28px] font-semibold tracking-tightest tabular ${levelTextColor[s.alertLevel]}`}>{fmtTemp(s.currentTempC)}</span>
          <span className="block text-[12px] text-faint">Safe range {s.minTempC}–{s.maxTempC}°C</span>
        </Stat>
        <Stat label="Humidity">
          <span className="text-[28px] font-semibold tracking-tightest text-ink tabular">{s.currentHumidity === null ? '—' : `${s.currentHumidity}%`}</span>
          <span className="block text-[12px] text-faint">Last reading {fmtRelative(s.lastReadingIso)}</span>
        </Stat>
        <Stat label="Vehicle / Driver">
          <span className="block font-semibold text-ink">{s.vehiclePlate}</span>
          <span className="block text-[13px] text-muted">{s.driverName}</span>
        </Stat>
        <Stat label={s.status === 'delivered' ? 'Delivered' : 'ETA'}>
          <span className="block font-semibold text-ink">{fmtDateTime(s.status === 'delivered' ? s.deliveredAtIso : s.etaIso)}</span>
          <span className="block text-[13px] text-muted">{s.origin} → {s.destination}</span>
        </Stat>
      </div>

      <Card>
        <CardHeader title="Temperature history" subtitle="Sensor readings every 30 seconds" />
        <div className="px-5 pb-5">
          {telemetry.isPending ? (
            <LoadingState />
          ) : telemetry.isError ? (
            <ErrorState message={errorMessage(telemetry.error)} onRetry={() => telemetry.refetch()} />
          ) : (
            <TempAreaChart label={`${s.code} temperature`} min={s.minTempC} max={s.maxTempC} points={telemetry.data.map((r) => ({ t: r.recordedAtIso, v: r.tempC }))} />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Chain of custody" subtitle="Append-only handoff records" />
        <div className="px-5 pb-5">
          {report.isPending ? (
            <LoadingState />
          ) : report.isError ? (
            <ErrorState message={errorMessage(report.error)} onRetry={() => report.refetch()} />
          ) : report.data.handoffs.length === 0 ? (
            <EmptyState title="No handoffs recorded yet" />
          ) : (
            <ol className="space-y-4">
              {report.data.handoffs.map((h) => (
                <li key={h.id} className="flex gap-3">
                  {h.condition === 'intact' ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-ok" aria-hidden /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-crit" aria-hidden />}
                  <div className="text-[13px]">
                    <p className="font-semibold capitalize text-ink">{h.type} · {h.condition.replace('_', ' ')}</p>
                    <p className="text-muted">{h.actorName} · {fmtDateTime(h.recordedAtIso)}</p>
                    <p className="text-[11px] text-faint">{h.lat !== null ? `GPS ${h.lat.toFixed(4)}, ${h.lng?.toFixed(4)}` : 'No GPS fix'} · QR + PIN verified</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <p className="mb-1 text-[12px] text-muted">{label}</p>
      {children}
    </Card>
  );
}
