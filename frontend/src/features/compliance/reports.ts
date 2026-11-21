import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';
import type { AuditReport } from '../../types';

/**
 * Tamper-evident exports: the SHA-256 of the canonical CSV is printed on the PDF and saved
 * alongside, so any later edit to the data changes the hash.
 * TODO(backend-sync): if the backend signs reports (recommended), show its signature/hash instead.
 */

export function buildCsv(r: AuditReport): string {
  const s = r.shipment;
  const rows: (string | number)[][] = [
    ['section', 'timestamp', 'field1', 'field2', 'field3', 'field4'],
    ['shipment', s.createdAtIso, s.code, `${s.origin} -> ${s.destination}`, `${s.minTempC}..${s.maxTempC}C`, s.status],
    ...r.readings.map((t) => ['reading', t.recordedAtIso, t.tempC, t.humidity, t.tempC < s.minTempC || t.tempC > s.maxTempC ? 'OUT_OF_RANGE' : 'ok', '']),
    ...r.handoffs.map((h) => ['handoff', h.recordedAtIso, h.type, h.actorName, h.condition, h.lat !== null ? `${h.lat},${h.lng}` : 'no-gps']),
    ...r.alerts.map((a) => ['alert', a.triggeredAtIso, a.level, a.message, a.acknowledged ? 'acknowledged' : 'open', '']),
  ];
  return Papa.unparse(rows, { newline: '\n' });
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadCsv(r: AuditReport) {
  const csv = buildCsv(r);
  const hash = await sha256Hex(csv);
  download(new Blob([csv], { type: 'text/csv' }), `${r.shipment.code}_audit.csv`);
  download(new Blob([`${hash}  ${r.shipment.code}_audit.csv\n`], { type: 'text/plain' }), `${r.shipment.code}_audit.csv.sha256`);
  return hash;
}

export async function downloadPdf(r: AuditReport) {
  const s = r.shipment;
  const hash = await sha256Hex(buildCsv(r));
  const doc = new jsPDF();
  const breaches = r.readings.filter((t) => t.tempC < s.minTempC || t.tempC > s.maxTempC).length;

  doc.setFontSize(16);
  doc.text(`Cold-Chain Audit Report — ${s.code}`, 14, 18);
  doc.setFontSize(10);
  doc.text(`${s.origin} → ${s.destination}   |   Range ${s.minTempC}–${s.maxTempC}°C   |   Status ${s.status}`, 14, 26);
  doc.text(`Readings: ${r.readings.length}   Out-of-range readings: ${breaches}   Alerts: ${r.alerts.length}`, 14, 32);
  doc.text(`Generated ${new Date().toISOString()}`, 14, 38);

  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  autoTable(doc, {
    startY: 44,
    head: [['Handoff', 'Time', 'By', 'Condition', 'GPS']],
    body: r.handoffs.length
      ? r.handoffs.map((h) => [h.type, h.recordedAtIso, h.actorName, h.condition, h.lat !== null ? `${h.lat?.toFixed(5)}, ${h.lng?.toFixed(5)}` : '—'])
      : [['—', 'No handoffs recorded', '', '', '']],
  });
  autoTable(doc, {
    startY: lastY() + 6,
    head: [['Alert', 'Time', 'Message', 'Ack']],
    body: r.alerts.length ? r.alerts.map((a) => [a.level, a.triggeredAtIso, a.message, a.acknowledged ? 'yes' : 'no']) : [['—', 'No alerts', '', '']],
  });
  autoTable(doc, {
    startY: lastY() + 6,
    head: [['Time', 'Temp °C', 'Humidity %', 'In range']],
    body: r.readings.map((t) => [t.recordedAtIso, t.tempC.toFixed(1), String(t.humidity), t.tempC < s.minTempC || t.tempC > s.maxTempC ? 'NO' : 'yes']),
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 3 && d.cell.raw === 'NO') d.cell.styles.textColor = [200, 0, 0];
    },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.text(`SHA-256 (data): ${hash}   ·   page ${i}/${pages}`, 14, 290);
  }
  doc.save(`${s.code}_audit.pdf`);
  return hash;
}
