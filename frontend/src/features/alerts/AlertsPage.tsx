import clsx from 'clsx';
import { AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAcknowledgeAlert, useAllAlerts } from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { can } from '../../auth/permissions';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Tabs } from '../../components/ui';
import { tableHeadClass } from '../../components/ui/styles';
import { fmtRelative } from '../../lib/format';

type Tab = 'all' | 'critical' | 'warning';

export function AlertsPage() {
  const { user } = useAuth();
  const alerts = useAllAlerts();
  const ack = useAcknowledgeAlert();
  const [tab, setTab] = useState<Tab>('all');
  const canAck = can(user?.role, 'acknowledgeAlert');

  const list = useMemo(
    () =>
      [...(alerts.data ?? [])].sort(
        (a, b) =>
          Number(a.acknowledged) - Number(b.acknowledged) ||
          (a.level === b.level ? b.triggeredAtIso.localeCompare(a.triggeredAtIso) : a.level === 'critical' ? -1 : 1),
      ),
    [alerts.data],
  );
  const open = list.filter((a) => !a.acknowledged);
  const criticalOpen = open.filter((a) => a.level === 'critical').length;
  const shown = tab === 'all' ? list : list.filter((a) => a.level === tab);

  return (
    <div className="space-y-6">
      <PageHeader title="Alerts & incidents" subtitle="Stay ahead of excursions. Protect every shipment." />

      {criticalOpen > 0 && (
        <div role="alert" className="flex items-start gap-4 rounded-xl border border-crit-line bg-crit-bg p-5">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-crit" aria-hidden />
          <div>
            <p className="text-[16px] font-semibold text-crit-text">
              {criticalOpen} confirmed critical excursion{criticalOpen > 1 ? 's' : ''}
            </p>
            <p className="text-[13px] text-crit-text/80">Temperature breaches lasting more than 10 continuous minutes require immediate attention.</p>
          </div>
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'all', label: 'All alerts', count: list.length },
          { value: 'critical', label: 'Critical', count: list.filter((a) => a.level === 'critical').length },
          { value: 'warning', label: 'Warning', count: list.filter((a) => a.level === 'warning').length },
        ]}
      />

      <Card className="overflow-hidden">
        {alerts.isPending ? (
          <LoadingState />
        ) : alerts.isError ? (
          <ErrorState message={errorMessage(alerts.error)} onRetry={() => alerts.refetch()} />
        ) : shown.length === 0 ? (
          <EmptyState title="No alerts in this view" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-[13px]">
              <thead className={tableHeadClass}>
                <tr className="whitespace-nowrap border-b border-line-soft">
                  <th className="px-5 py-2.5 font-medium">Alert / Shipment</th>
                  <th className="px-3 py-2.5 font-medium">Classification</th>
                  <th className="px-3 py-2.5 font-medium">Current / Threshold</th>
                  <th className="px-3 py-2.5 font-medium">Raised</th>
                  <th className="px-3 py-2.5 font-medium">Destination</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id} className={clsx('border-b border-line-soft last:border-0', a.acknowledged && 'opacity-60')}>
                    <td className="px-5 py-3.5">
                      <div className="whitespace-nowrap font-semibold text-ink">{a.id}</div>
                      <Link to={`/shipments/${a.shipmentId}`} className="text-[11px] text-faint hover:underline">{a.shipmentCode}</Link>
                    </td>
                    <td className="px-3 py-3.5">
                      <Badge tone={a.level === 'critical' ? 'crit' : 'warn'}>{a.level === 'critical' ? 'Critical' : 'Warning'}</Badge>
                      <div className="mt-1 whitespace-nowrap text-[11px] text-faint">{a.title}</div>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className={clsx('font-semibold tabular', a.level === 'critical' ? 'text-crit-text' : 'text-warn-text')}>{a.tempC.toFixed(1)}°C</div>
                      <div className="text-[11px] text-faint">Limit {a.thresholdC}°C</div>
                    </td>
                    <td className="px-3 py-3.5 text-body">
                      {fmtRelative(a.triggeredAtIso)}
                      <div className="text-[11px] text-faint">{a.message}</div>
                    </td>
                    <td className="px-3 py-3.5 text-body">
                      {a.destination.split(', ').at(-1)}
                      <div className="whitespace-nowrap text-[11px] text-faint">{a.vehiclePlate}</div>
                    </td>
                    <td className="px-3 py-3.5">
                      {a.acknowledged ? <Badge tone="neutral">Acknowledged</Badge> : <Badge tone="warn">Unacknowledged</Badge>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">
                        {canAck && !a.acknowledged && (
                          <Button variant="secondary" size="sm" loading={ack.isPending && ack.variables === a.id} onClick={() => ack.mutate(a.id)}>
                            Acknowledge
                          </Button>
                        )}
                        <Link to={`/shipments/${a.shipmentId}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-white px-3 text-[13px] font-semibold text-body shadow-sm hover:bg-canvas">
                          Review <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="flex items-center gap-2 rounded-xl border border-ok-line bg-ok-bg px-5 py-3 text-[13px] text-ok-text">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        Acknowledgment does not resolve a temperature excursion. Every response is added as a new audit event.
      </p>
    </div>
  );
}
