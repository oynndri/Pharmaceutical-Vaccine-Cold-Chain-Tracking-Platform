import clsx from 'clsx';
import Papa from 'papaparse';
import { ChevronRight, Download, FileText, Search, ShieldCheck } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useLiveShipments } from '../../api/queries';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { inputClass } from '../../components/ui/styles';
import { complianceStatus } from '../../lib/compliance';

const PAGE = 20;


export function CompliancePage() {
  const shipments = useLiveShipments();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'all' | 'excursion' | 'delivered'>('all');
  const [page, setPage] = useState(1);
  const q = useDeferredValue(search.trim().toLowerCase());

  const list = useMemo(() => {
    const items = (shipments.data?.items ?? []).filter(
      (s) =>
        (view === 'all' || (view === 'excursion' ? complianceStatus(s)[0] === 'crit' : s.status === 'delivered')) &&
        (!q || s.code.toLowerCase().includes(q) || s.product.toLowerCase().includes(q) || s.batchNo.toLowerCase().includes(q)),
    );
    // Completed shipments first — those are the ones regulators ask for.
    return items.sort((a, b) => Number(b.status === 'delivered') - Number(a.status === 'delivered') || a.code.localeCompare(b.code));
  }, [shipments.data, view, q]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const current = Math.min(page, pages);
  const rows = list.slice((current - 1) * PAGE, current * PAGE);

  function exportCsv() {
    const csv = Papa.unparse(
      list.map((s) => ({
        shipment: s.code, product: s.product, batch: s.batchNo, status: s.status,
        compliance: complianceStatus(s)[1], origin: s.origin, destination: s.destination,
        delivered_at: s.deliveredAtIso ?? '', eta: s.etaIso ?? '',
      })),
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `compliance_summary_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Compliance Reports" subtitle="Tamper-evident batch reports for regulators." />

      <p className="flex items-center gap-3 rounded-xl border border-ok-line bg-ok-bg px-5 py-3.5 text-[13px] text-ok-text">
        <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden />
        <span>
          <b>Evidence, not assumptions.</b> Trace temperature conditions and verified custody records for every authorized shipment.
        </span>
      </p>

      <Card>
        <CardHeader
          title="Shipment compliance reports"
          subtitle={`${list.length} shipments`}
          actions={
            <Button variant="secondary" onClick={exportCsv} disabled={!list.length}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          }
        />
        <div className="flex flex-wrap gap-3 px-5 pb-4">
          <label className="relative min-w-60 flex-1">
            <span className="sr-only">Search reports</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
            <input type="search" className={clsx(inputClass, 'pl-9')} placeholder="Shipment ID, product or batch…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </label>
          <select aria-label="Filter" className={clsx(inputClass, 'w-auto')} value={view} onChange={(e) => { setView(e.target.value as typeof view); setPage(1); }}>
            <option value="all">All shipments</option>
            <option value="delivered">Completed deliveries</option>
            <option value="excursion">With excursions</option>
          </select>
        </div>

        {shipments.isPending ? (
          <LoadingState />
        ) : shipments.isError && !shipments.data ? (
          <ErrorState message={errorMessage(shipments.error)} onRetry={() => shipments.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No reports match" />
        ) : (
          <ul className="space-y-3 px-5 pb-5">
            {rows.map((s) => {
              const [tone, label] = complianceStatus(s);
              return (
                <li key={s.id}>
                  <Link to={`/compliance/${s.id}`} className="flex items-center gap-4 rounded-xl border border-line p-4 transition hover:border-brand/40 hover:bg-canvas">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <FileText className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{s.code}</p>
                      <p className="truncate text-[12px] text-faint">{s.product} · {s.batchNo}</p>
                      <div className="mt-1.5"><Badge tone={tone}>{label}</Badge></div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-faint" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 && (
          <div className="flex items-center gap-2 border-t border-line-soft px-5 py-3 text-[12px] text-muted">
            Page {current} of {pages}
            <Button variant="secondary" size="sm" className="ml-auto" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
