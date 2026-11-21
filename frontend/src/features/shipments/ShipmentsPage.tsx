import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import Papa from 'papaparse';
import { ChevronRight, Download, Plus, Search } from 'lucide-react';
import { memo, useDeferredValue, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useLiveShipments } from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';
import { can } from '../../auth/permissions';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, ShipmentStatusBadge, TempReading } from '../../components/ui';
import { buttonClass, inputClass } from '../../components/ui/styles';
import { fmtTime } from '../../lib/format';
import type { AlertLevel, Shipment } from '../../types';

type Filter = 'all' | 'in_transit' | 'warning' | 'critical' | 'scheduled' | 'delivered';
const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'delivered', label: 'Delivered' },
];
const rank: Record<AlertLevel, number> = { critical: 0, warning: 1, ok: 2 };

function matches(s: Shipment, f: Filter) {
  if (f === 'all') return true;
  if (f === 'warning' || f === 'critical') return s.status === 'in_transit' && s.alertLevel === f;
  return s.status === f;
}

export function ShipmentsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const shipments = useLiveShipments();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [filter, setFilter] = useState<Filter>((params.get('status') as Filter) ?? 'all');
  const q = useDeferredValue(search.trim().toLowerCase());
  const all = shipments.data?.items;

  const visible = useMemo(() => {
    const list = (all ?? []).filter(
      (s) =>
        matches(s, filter) &&
        (!q ||
          s.code.toLowerCase().includes(q) ||
          s.product.toLowerCase().includes(q) ||
          s.batchNo.toLowerCase().includes(q) ||
          s.destination.toLowerCase().includes(q) ||
          s.driverName.toLowerCase().includes(q) ||
          s.vehiclePlate.toLowerCase().includes(q)),
    );
    return list.sort((a, b) => {
      const ai = a.status === 'in_transit' ? rank[a.alertLevel] : 3;
      const bi = b.status === 'in_transit' ? rank[b.alertLevel] : 3;
      return ai - bi || a.code.localeCompare(b.code);
    });
  }, [all, filter, q]);

  function exportCsv() {
    const csv = Papa.unparse(
      visible.map((s) => ({
        shipment: s.code, product: s.product, batch: s.batchNo, origin: s.origin, destination: s.destination,
        vehicle: s.vehiclePlate, driver: s.driverName, status: s.status, alert: s.alertLevel,
        temp_c: s.currentTempC ?? '', range: `${s.minTempC}-${s.maxTempC}`, eta: s.etaIso ?? '',
      })),
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `shipments_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div>
      <PageHeader
        title="Shipment management"
        subtitle="Manage your pharmaceutical shipments, from warehouse to hands."
        actions={
          can(user?.role, 'createShipment') && (
            <Link to="/shipments/new" className={buttonClass('primary', 'md', 'h-11 px-5')}>
              <Plus className="h-4 w-4" /> Create shipment
            </Link>
          )
        }
      />
      <Card>
        <div className="space-y-3 p-5">
          <label className="relative block">
            <span className="sr-only">Search shipments</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
            <input
              type="search"
              className={clsx(inputClass, 'h-11 pl-9')}
              placeholder="Search shipment ID, batch, product, driver or destination…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setParams((p) => (e.target.value ? p.set('q', e.target.value) : p.delete('q'), p), { replace: true });
              }}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <select aria-label="Status" className={clsx(inputClass, 'w-auto min-w-48 flex-1 sm:flex-none')} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              {filters.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <span className="text-[12px] text-muted">{shipments.isFetching && 'Updating…'}</span>
            <Button variant="secondary" className="ml-auto" onClick={exportCsv} disabled={!visible.length}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        </div>

        {shipments.isPending ? (
          <LoadingState label="Loading shipments…" />
        ) : shipments.isError && !all ? (
          <ErrorState message={errorMessage(shipments.error)} onRetry={() => shipments.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState title="No shipments match these filters" />
        ) : (
          <VirtualTable rows={visible} />
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-5 py-3 text-[12px] text-muted">
          Showing {visible.length} of {all?.length ?? 0} shipments
          {shipments.isError && all && <span className="text-warn-text">· Live updates paused: {errorMessage(shipments.error)}</span>}
        </div>
      </Card>
    </div>
  );
}

const COLS = 'grid grid-cols-[minmax(9rem,1.1fr)_minmax(12rem,1.6fr)_minmax(9rem,1.1fr)_7rem_5.5rem_7rem_1.5rem] items-center gap-3 px-5';
const ROW_H = 60;

/** Virtualized: only visible rows are in the DOM, so 500+ shipments scroll smoothly. */
function VirtualTable({ rows }: { rows: Shipment[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => ref.current, estimateSize: () => ROW_H, overscan: 8 });
  return (
    <div className="overflow-x-auto" role="table" aria-rowcount={rows.length}>
      <div className="min-w-[860px]">
        <div role="row" className={clsx(COLS, 'h-10 border-y border-line-soft bg-[#F9FAFC] text-[11px] font-medium text-faint')}>
          <span role="columnheader">Shipment / Product</span>
          <span role="columnheader">Destination</span>
          <span role="columnheader">Vehicle / Driver</span>
          <span role="columnheader">Temperature</span>
          <span role="columnheader">ETA</span>
          <span role="columnheader">Status</span>
          <span />
        </div>
        <div ref={ref} className="h-[calc(100vh-22rem)] min-h-[360px] overflow-y-auto">
          <div style={{ height: v.getTotalSize(), position: 'relative' }}>
            {v.getVirtualItems().map((item) => (
              <Row key={rows[item.index].id} s={rows[item.index]} top={item.start} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const Row = memo(function Row({ s, top }: { s: Shipment; top: number }) {
  const navigate = useNavigate();
  const go = () => navigate(`/shipments/${s.id}`);
  return (
    <div
      role="row"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => e.key === 'Enter' && go()}
      style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_H }}
      className={clsx(
        COLS,
        'cursor-pointer border-b border-line-soft text-[13px] hover:bg-canvas focus:bg-canvas focus:outline-none',
        s.status === 'in_transit' && s.alertLevel === 'critical' && 'bg-crit-bg/60 shadow-[inset_3px_0_0_#D75A5E]',
      )}
    >
      <span role="cell" className="min-w-0">
        <span className="block font-semibold text-code">{s.code}</span>
        <span className="block truncate text-[11px] text-faint">{s.product}</span>
      </span>
      <span role="cell" className="min-w-0">
        <span className="block truncate text-body">{s.destination}</span>
        <span className="block truncate text-[11px] text-faint">{s.origin} →</span>
      </span>
      <span role="cell" className="min-w-0">
        <span className="block truncate text-body">{s.vehiclePlate}</span>
        <span className="block truncate text-[11px] text-faint">{s.driverName}</span>
      </span>
      <span role="cell"><TempReading tempC={s.currentTempC} level={s.status === 'in_transit' ? s.alertLevel : 'ok'} /></span>
      <span role="cell" className="text-body tabular">{fmtTime(s.status === 'delivered' ? s.deliveredAtIso : s.etaIso)}</span>
      <span role="cell"><ShipmentStatusBadge status={s.status} level={s.alertLevel} /></span>
      <ChevronRight className="h-4 w-4 text-faint" aria-hidden />
    </div>
  );
});
