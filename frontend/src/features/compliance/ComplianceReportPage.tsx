import { ArrowLeft, CheckCircle2, AlertTriangle, Download, FileDown, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAuditReport } from '../../api/queries';
import { TempAreaChart } from '../../components/charts';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { tableHeadClass } from '../../components/ui/styles';
import { fmtDateTime } from '../../lib/format';
import { complianceStatus } from '../../lib/compliance';
import { downloadCsv, downloadPdf } from './reports';

/** Read-only report view. Auditors can look and export; nothing here mutates data. */
export function ComplianceReportPage() {
  const { id = '' } = useParams();
  const report = useAuditReport(id);
  const [hash, setHash] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'csv' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  if (report.isPending) return <LoadingState />;
  if (report.isError) return <ErrorState message={errorMessage(report.error)} onRetry={() => report.refetch()} />;
  const r = report.data;
  const s = r.shipment;
  const breaches = r.readings.filter((t) => t.tempC < s.minTempC || t.tempC > s.maxTempC).length;
  const [tone, label] = complianceStatus(s);

  async function exportAs(kind: 'pdf' | 'csv') {
    setExporting(kind);
    setExportError(null);
    try {
      setHash(kind === 'pdf' ? await downloadPdf(r) : await downloadCsv(r));
    } catch (e) {
      setExportError(errorMessage(e));
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/compliance" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-brand-link">
        <ArrowLeft className="h-4 w-4" /> All reports
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-bold tracking-tightest text-ink">{s.code}</h1>
            <Badge tone={tone}>{label}</Badge>
          </div>
          <p className="text-[13px] text-muted">{s.product} · Batch {s.batchNo} · {s.origin} → {s.destination}</p>
        </div>
        <Button variant="secondary" loading={exporting === 'csv'} onClick={() => exportAs('csv')}><Download className="h-4 w-4" /> Export CSV</Button>
        <Button loading={exporting === 'pdf'} onClick={() => exportAs('pdf')}><FileDown className="h-4 w-4" /> Export PDF</Button>
      </div>

      {exportError && <ErrorState message={exportError} />}
      {hash && (
        <p className="flex items-start gap-2 break-all rounded-xl border border-ok-line bg-ok-bg px-4 py-3 font-mono text-[11px] text-ok-text">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden /> SHA-256 of exported data: {hash}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ['Readings', r.readings.length],
          ['Out of range', breaches],
          ['Handoffs', r.handoffs.length],
          ['Alerts', r.alerts.length],
        ].map(([k, v]) => (
          <Card key={k} className="p-5">
            <p className="text-[12px] text-muted">{k}</p>
            <p className={`text-[28px] font-semibold tracking-tightest tabular ${k === 'Out of range' && Number(v) > 0 ? 'text-crit' : 'text-ink'}`}>{v}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Temperature history" subtitle={`Safe range ${s.minTempC}–${s.maxTempC}°C`} />
        <div className="px-5 pb-5">
          <TempAreaChart label={`${s.code} temperature history`} min={s.minTempC} max={s.maxTempC} points={r.readings.map((x) => ({ t: x.recordedAtIso, v: x.tempC }))} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Chain of custody" subtitle="Append-only handoff records" />
        {r.handoffs.length === 0 ? (
          <EmptyState title="No handoffs recorded yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className={tableHeadClass}>
                <tr className="border-y border-line-soft">
                  <th className="px-5 py-2.5 font-medium">Event</th>
                  <th className="px-3 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">By</th>
                  <th className="px-3 py-2.5 font-medium">Condition</th>
                  <th className="px-5 py-2.5 font-medium">GPS</th>
                </tr>
              </thead>
              <tbody>
                {r.handoffs.map((h) => (
                  <tr key={h.id} className="border-b border-line-soft last:border-0">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2 font-medium capitalize text-ink">
                        {h.condition === 'intact' ? <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden /> : <AlertTriangle className="h-4 w-4 text-crit" aria-hidden />}
                        {h.type}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-body">{fmtDateTime(h.recordedAtIso)}</td>
                    <td className="px-3 py-3 text-body">{h.actorName}</td>
                    <td className="px-3 py-3 capitalize text-body">{h.condition.replace('_', ' ')}</td>
                    <td className="px-5 py-3 font-mono text-[11px] text-muted">{h.lat !== null ? `${h.lat.toFixed(4)}, ${h.lng?.toFixed(4)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {r.alerts.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="SLA breaches & alerts" />
          <ul className="divide-y divide-line-soft">
            {r.alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
                <Badge tone={a.level === 'critical' ? 'crit' : 'warn'}>{a.level === 'critical' ? 'Critical' : 'Warning'}</Badge>
                <span className="text-body">{a.message}</span>
                <span className="ml-auto text-[12px] text-faint">{fmtDateTime(a.triggeredAtIso)} · {a.acknowledged ? 'Acknowledged' : 'Open'}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
