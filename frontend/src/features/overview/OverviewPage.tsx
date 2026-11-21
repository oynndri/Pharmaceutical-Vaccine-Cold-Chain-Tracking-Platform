import clsx from 'clsx';
import { AlertTriangle, ArrowRight, Box, Check, CheckCircle2, ExternalLink, Plus, ShieldCheck, Thermometer, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAlerts, useLiveShipments, useOverview, useRecentHandoffs } from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { can } from '../../auth/permissions';
import { Donut, TempAreaChart } from '../../components/charts';
import { NetworkMap } from '../../components/NetworkMap';
import { Badge, Card, CardHeader, EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { buttonClass } from '../../components/ui/styles';
import { fmtRelative } from '../../lib/format';
import type { AlertLevel, Shipment } from '../../types';
import { ShipmentRowsPreview } from '../shipments/ShipmentRowsPreview';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function OverviewPage() {
  const { user } = useAuth();
  const shipments = useLiveShipments();
  const overview = useOverview();
  const all = shipments.data?.items;

  const counts = useMemo(() => {
    const c = { active: 0, warning: 0, critical: 0 };
    for (const s of all ?? []) {
      if (s.status !== 'in_transit') continue;
      c.active++;
      if (s.alertLevel === 'warning') c.warning++;
      if (s.alertLevel === 'critical') c.critical++;
    }
    return c;
  }, [all]);

  const firstName = user?.name.replace(/^Dr\.\s*/, '').split(' ')[0];
  const o = overview.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations overview"
        subtitle={`Welcome back, ${firstName}. Here’s what’s moving across your network today.`}
        actions={
          can(user?.role, 'createShipment') && (
            <Link to="/shipments/new" className={buttonClass('primary', 'md', 'h-11 px-5')}>
              <Plus className="h-4 w-4" /> Create shipment
            </Link>
          )
        }
      />

      {shipments.isError && !all && <ErrorState message={errorMessage(shipments.error)} onRetry={() => shipments.refetch()} />}

      {/* KPI grid: hero card + 2×2 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi hero label="Active shipments" value={all ? counts.active : null} icon={Box} tone="brand" foot={all && `${all.length} total in system`} />
        <div className="grid gap-4 sm:grid-cols-2 md:col-span-2">
          <Kpi label="Delivered today" value={o?.deliveredToday ?? null} icon={Check} tone="ok" foot={o && `${o.onTimeToday} on time`} />
          <Kpi
            label="Temperature warnings"
            value={all ? counts.warning : null}
            icon={Thermometer}
            tone="warn"
            status={counts.warning ? 'Needs attention' : 'All clear'}
            foot="Approaching limits"
          />
          <Kpi
            label="Critical excursions"
            value={all ? counts.critical : null}
            icon={AlertTriangle}
            tone="crit"
            status={counts.critical ? 'Immediate action' : 'None active'}
            foot="Breach > 10 minutes"
          />
          <Kpi
            label="Active vehicles"
            value={o?.activeVehicles ?? null}
            icon={Truck}
            tone="info"
            foot={o && `${o.activeVehicles} of ${o.totalVehicles} · ${((o.activeVehicles / o.totalVehicles) * 100).toFixed(1)}% fleet utilization`}
          />
        </div>
      </div>

      <Card>
        <CardHeader
          title="Live shipment tracking"
          subtitle="Every shipment. Every degree. In view."
          actions={
            <div className="flex items-center gap-4 text-[12px]">
              <span className="flex items-center gap-1.5 font-semibold text-ok-text">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" /> LIVE
              </span>
              <Link to="/tracking" className="flex items-center gap-1 font-medium text-brand-link hover:underline">
                Open map <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          }
        />
        <div className="px-5 pb-5">
          {all ? <NetworkMap shipments={all} className="h-[300px] rounded-lg sm:h-[380px]" /> : <LoadingState />}
        </div>
      </Card>

      <AlertFeedCard />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Temperature monitoring" subtitle="Fleet average · Safe operating range 2°C–8°C" />
          <div className="px-5 pb-5">
            {overview.isPending ? (
              <LoadingState />
            ) : overview.isError ? (
              <ErrorState message={errorMessage(overview.error)} onRetry={() => overview.refetch()} />
            ) : (
              <>
                <FleetNow value={o!.fleetTemp.at(-1)?.avgC ?? null} />
                <TempAreaChart label="Fleet average temperature" min={2} max={8} points={o!.fleetTemp.map((p) => ({ t: p.timeIso, v: p.avgC }))} />
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Delivery performance" actions={<span className="text-[12px] text-muted">Today</span>} />
          <div className="px-5 pb-5">
            {!o ? (
              <LoadingState />
            ) : o.deliveredToday === 0 ? (
              <EmptyState title="No deliveries yet today" />
            ) : (
              <DeliveryPerformance onTime={o.onTimeToday} delayed={o.delayedToday} />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Active shipments"
          subtitle="Shipments that need attention first, then the rest in motion"
          actions={
            <Link to="/shipments" className="flex items-center gap-1 text-[13px] font-medium text-brand-link hover:underline">
              View all shipments <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        {all ? <ShipmentRowsPreview shipments={prioritised(all).slice(0, 6)} /> : <LoadingState />}
      </Card>

      <CustodyEventsCard />
    </div>
  );
}

const rank: Record<AlertLevel, number> = { critical: 0, warning: 1, ok: 2 };
function prioritised(all: Shipment[]) {
  return all.filter((s) => s.status === 'in_transit').sort((a, b) => rank[a.alertLevel] - rank[b.alertLevel] || a.code.localeCompare(b.code));
}

const toneStyles = {
  brand: { chip: 'bg-brand-soft text-brand', num: 'text-ink' },
  ok: { chip: 'bg-ok-bg text-ok', num: 'text-ink' },
  warn: { chip: 'bg-warn-bg text-warn', num: 'text-warn' },
  crit: { chip: 'bg-crit-bg text-crit', num: 'text-crit' },
  info: { chip: 'bg-info-bg text-info', num: 'text-ink' },
};

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  status,
  foot,
  hero,
}: {
  label: string;
  value: number | null;
  icon: LucideIcon;
  tone: keyof typeof toneStyles;
  status?: string;
  foot?: ReactNode;
  hero?: boolean;
}) {
  const t = toneStyles[tone];
  return (
    <Card className={clsx('flex flex-col p-5', hero && 'md:justify-center')}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] text-muted">{label}</span>
        <span className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', t.chip)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div className={clsx('mt-2 font-semibold tracking-tightest tabular', t.num, hero ? 'text-[56px] leading-none md:my-4' : 'text-[36px] leading-tight')}>
        {value === null ? <span className="text-line">—</span> : pad2(value)}
      </div>
      {status && <div className={clsx('mt-1 text-[12px] font-medium', tone === 'crit' ? 'text-crit-text' : tone === 'warn' ? 'text-warn-text' : 'text-muted')}>{status}</div>}
      {foot && <div className="mt-0.5 text-[12px] text-faint">{foot}</div>}
    </Card>
  );
}

function FleetNow({ value }: { value: number | null }) {
  const inRange = value !== null && value >= 2 && value <= 8;
  return (
    <div className="mb-2 flex items-baseline gap-3">
      <span className="text-[32px] font-semibold tracking-tightest text-ink tabular">
        {value === null ? '—' : value.toFixed(1)}
        <span className="text-[16px] font-normal text-muted">°C</span>
      </span>
      {value !== null && (
        <span className={clsx('flex items-center gap-1.5 text-[12px]', inRange ? 'text-ok-text' : 'text-crit-text')}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', inRange ? 'bg-ok' : 'bg-crit')} />
          {inRange ? 'Within safe range' : 'Outside safe range'}
        </span>
      )}
    </div>
  );
}

function DeliveryPerformance({ onTime, delayed }: { onTime: number; delayed: number }) {
  const total = onTime + delayed;
  const pct = total ? onTime / total : 0;
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative">
        <Donut value={pct} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[28px] font-semibold tracking-tightest text-ink tabular">
            {(pct * 100).toFixed(1)}
            <span className="text-[14px] font-normal text-muted">%</span>
          </span>
          <span className="text-[11px] text-muted">On-time delivery</span>
        </div>
      </div>
      <dl className="w-full flex-1 space-y-3 text-[13px]">
        <Row dot="bg-brand" label="On time" value={onTime} />
        <Row dot="bg-[#F0C977]" label="Delayed" value={delayed} />
        <Row label="Total delivered" value={total} strong />
      </dl>
    </div>
  );
}

function Row({ dot, label, value, strong }: { dot?: string; label: string; value: number; strong?: boolean }) {
  return (
    <div className={clsx('flex items-center gap-2', strong && 'border-t border-line pt-3')}>
      {dot && <span className={clsx('h-2 w-2 rounded-full', dot)} />}
      <dt className={clsx('flex-1', strong ? 'font-medium text-ink' : 'text-muted')}>{label}</dt>
      <dd className="font-semibold text-ink tabular">{value}</dd>
    </div>
  );
}

function AlertFeedCard() {
  const alerts = useAlerts();
  const list = useMemo(
    () =>
      [...(alerts.data ?? [])].sort((a, b) =>
        a.level === b.level ? b.triggeredAtIso.localeCompare(a.triggeredAtIso) : a.level === 'critical' ? -1 : 1,
      ),
    [alerts.data],
  );
  const critical = list.filter((a) => a.level === 'critical').length;

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Live alert feed" actions={alerts.data && <Badge tone={critical ? 'crit' : list.length ? 'warn' : 'ok'}>{list.length} active</Badge>} />
      {alerts.isPending ? (
        <LoadingState />
      ) : alerts.isError ? (
        <ErrorState message={errorMessage(alerts.error)} onRetry={() => alerts.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="No open alerts — every shipment is within range" />
      ) : (
        <>
          {critical > 0 && (
            <p role="alert" className="flex items-center gap-2 border-y border-crit-line bg-crit-bg px-5 py-2.5 text-[13px] font-medium text-crit-text">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {critical} critical alert{critical > 1 ? 's' : ''} need{critical === 1 ? 's' : ''} your attention
            </p>
          )}
          <ul className="grid sm:grid-cols-2">
            {list.slice(0, 4).map((a) => (
              <li key={a.id} className="border-b border-line-soft p-5 sm:odd:border-r">
                <div className="flex items-center gap-2">
                  {a.level === 'critical' ? <AlertTriangle className="h-4 w-4 text-crit" aria-hidden /> : <Thermometer className="h-4 w-4 text-warn" aria-hidden />}
                  <span className="font-semibold text-ink">{a.title}</span>
                </div>
                <p className="mt-1.5 text-[12px] text-faint">
                  {a.shipmentCode} · {a.vehiclePlate}
                </p>
                <p className="mt-1 text-[13px] text-muted">{a.message}</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className={clsx('text-[15px] font-semibold tabular', a.level === 'critical' ? 'text-crit-text' : 'text-warn-text')}>{a.tempC.toFixed(1)}°C</span>
                  <Badge tone={a.level === 'critical' ? 'crit' : 'warn'}>{a.level === 'critical' ? 'Critical' : 'Warning'}</Badge>
                  <Link to={`/shipments/${a.shipmentId}`} className="ml-auto flex items-center gap-1 text-[12px] font-medium text-muted hover:text-brand-link">
                    Details <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <div className="p-3 text-center">
            <Link to="/alerts" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-link hover:underline">
              View all alerts <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}

function CustodyEventsCard() {
  const handoffs = useRecentHandoffs(5);
  return (
    <Card>
      <CardHeader
        title="Recent chain-of-custody events"
        actions={
          <span className="flex items-center gap-1.5 text-[12px] text-muted">
            <ShieldCheck className="h-4 w-4" aria-hidden /> Immutable records
          </span>
        }
      />
      {handoffs.isPending ? (
        <LoadingState />
      ) : handoffs.isError ? (
        <ErrorState message={errorMessage(handoffs.error)} onRetry={() => handoffs.refetch()} />
      ) : handoffs.data.length === 0 ? (
        <EmptyState title="No handoffs recorded yet" />
      ) : (
        <ol className="space-y-5 px-5 pb-6">
          {handoffs.data.map((h) => (
            <li key={h.id} className="flex gap-3">
              <span className={clsx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', h.condition === 'intact' ? 'bg-ok-bg text-ok' : 'bg-crit-bg text-crit')}>
                {h.condition === 'intact' ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
              </span>
              <div>
                <p className="font-semibold text-ink">{h.type === 'pickup' ? 'Warehouse pickup verified' : 'Delivery accepted'}</p>
                <p className="text-[12px] text-muted">
                  <Link to={`/shipments/${h.shipmentId}`} className="hover:underline">{h.shipmentCode}</Link> · {h.actorName}
                </p>
                <p className="text-[11px] text-faint">
                  {fmtRelative(h.recordedAtIso)} · QR + PIN verified{h.condition !== 'intact' && ` · ${h.condition.replace('_', ' ')}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
