import { ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useDrivers, useLiveShipments, useVehicles } from '../../api/queries';
import { Avatar, Badge, Card, CardHeader, ErrorState, LoadingState, PageHeader, Tabs, TempReading } from '../../components/ui';
import { tableHeadClass } from '../../components/ui/styles';
import type { Shipment } from '../../types';

export function FleetPage() {
  const [tab, setTab] = useState<'drivers' | 'vehicles'>('drivers');
  const drivers = useDrivers();
  const vehicles = useVehicles();
  const shipments = useLiveShipments();

  // Active shipment per driver / vehicle (in transit first, then scheduled).
  const { byDriver, byVehicle } = useMemo(() => {
    const byDriver = new Map<string, Shipment[]>();
    const byVehicle = new Map<string, Shipment>();
    for (const s of shipments.data?.items ?? []) {
      if (s.status !== 'in_transit' && s.status !== 'scheduled') continue;
      byDriver.set(s.driverId, [...(byDriver.get(s.driverId) ?? []), s]);
      const cur = byVehicle.get(s.vehicleId);
      if (!cur || (cur.status !== 'in_transit' && s.status === 'in_transit')) byVehicle.set(s.vehicleId, s);
    }
    return { byDriver, byVehicle };
  }, [shipments.data]);

  const loading = drivers.isPending || vehicles.isPending || shipments.isPending;
  const error = drivers.error ?? vehicles.error ?? (shipments.data ? null : shipments.error);

  return (
    <div className="space-y-6">
      <PageHeader title="Drivers & Vehicles" subtitle="A connected view of your pharmaceutical supply chain." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'drivers', label: 'Drivers', count: drivers.data?.length },
          { value: 'vehicles', label: 'Vehicles', count: vehicles.data?.length },
        ]}
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => { void drivers.refetch(); void vehicles.refetch(); void shipments.refetch(); }} />
      ) : tab === 'drivers' ? (
        <Card className="overflow-hidden">
          <CardHeader title="Your delivery team" subtitle="Assigned personnel and their current shipment" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className={tableHeadClass}>
                <tr className="border-y border-line-soft">
                  <th className="px-5 py-2.5 font-medium">Driver</th>
                  <th className="px-3 py-2.5 font-medium">Assigned vehicle</th>
                  <th className="px-3 py-2.5 font-medium">Active shipment</th>
                  <th className="px-3 py-2.5 font-medium">Temperature</th>
                  <th className="px-3 py-2.5 font-medium">Availability</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {drivers.data!.map((d) => {
                  const list = byDriver.get(d.id) ?? [];
                  const s = list.find((x) => x.status === 'in_transit') ?? list[0];
                  return (
                    <tr key={d.id} className="border-b border-line-soft last:border-0">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={d.name} />
                          <div>
                            <div className="font-semibold text-ink">{d.name}</div>
                            <div className="text-[11px] text-faint">{d.phone ?? '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-body">{s?.vehiclePlate ?? '—'}</td>
                      <td className="px-3 py-3 text-body">
                        {s?.code ?? '—'}
                        {list.length > 1 && <span className="ml-1 text-[11px] text-faint">+{list.length - 1} more</span>}
                      </td>
                      <td className="px-3 py-3">{s && s.status === 'in_transit' ? <TempReading tempC={s.currentTempC} level={s.alertLevel} /> : <span className="text-faint">—</span>}</td>
                      <td className="px-3 py-3">
                        {s?.status === 'in_transit' ? <Badge tone="ok">On route</Badge> : s ? <Badge tone="info">Scheduled</Badge> : <Badge tone="neutral">Available</Badge>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {s && (
                          <Link to={`/shipments/${s.id}`} className="inline-flex items-center gap-1 font-medium text-brand-link hover:underline">
                            View assignment <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            title="Refrigerated fleet"
            subtitle={`${vehicles.data!.filter((v) => !v.available).length} of ${vehicles.data!.length} vehicles assigned`}
          />
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className={`${tableHeadClass} sticky top-0`}>
                <tr className="border-y border-line-soft">
                  <th className="px-5 py-2.5 font-medium">Vehicle</th>
                  <th className="px-3 py-2.5 font-medium">Current shipment</th>
                  <th className="px-3 py-2.5 font-medium">Driver</th>
                  <th className="px-3 py-2.5 font-medium">Cargo temperature</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.data!.map((v) => {
                  const s = byVehicle.get(v.id);
                  return (
                    <tr key={v.id} className="border-b border-line-soft last:border-0">
                      <td className="px-5 py-3 font-semibold text-code">
                        {v.plate}
                        <div className="text-[11px] font-normal text-faint">{v.refrigerated ? 'Refrigerated · 2–8°C' : 'Standard'}</div>
                      </td>
                      <td className="px-3 py-3">{s ? <Link to={`/shipments/${s.id}`} className="text-body hover:underline">{s.code}</Link> : <span className="text-faint">—</span>}</td>
                      <td className="px-3 py-3 text-body">{s?.driverName ?? '—'}</td>
                      <td className="px-3 py-3">{s?.status === 'in_transit' ? <TempReading tempC={s.currentTempC} level={s.alertLevel} /> : <span className="text-faint">—</span>}</td>
                      <td className="px-3 py-3">
                        {s?.status === 'in_transit' ? <Badge tone="ok">On the move</Badge> : s ? <Badge tone="info">Loading</Badge> : v.available ? <Badge tone="neutral">Available</Badge> : <Badge tone="neutral">Assigned</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
