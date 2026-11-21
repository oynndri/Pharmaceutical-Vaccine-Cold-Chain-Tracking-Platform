import { createHmac } from 'node:crypto'

const columns = [
  'type', 'shipment_id', 'batch', 'origin', 'destination', 'status', 'eta',
  'product', 'category', 'humidity_warning', 'critical_minutes', 'min_temp', 'max_temp',
  'recorded_at', 'temperature', 'humidity', 'stage',
  'latitude', 'longitude', 'condition', 'actor_id', 'severity', 'event_id', 'episode_start'
]
const timestamps = new Set(['eta', 'recorded_at', 'episode_start'])

function csvCell(value) {
  const text = typeof value === 'string' && /^[\s]*[=+@-]/.test(value) ? "'" + value : String(value)
  return '"' + text.replaceAll('"', '""') + '"'
}

function pdf(lines) {
  const objects = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>']
  const pages = []
  const wrapped = lines.flatMap(line => line.replace(/[^ -~]/g, '?').match(/.{1,92}/g) ?? [''])
  for (let index = 0; index < wrapped.length; index += 54) {
    const page = objects.length + 1
    pages.push(page + ' 0 R')
    const content = wrapped.slice(index, index + 54).map(line => {
      return '(' + line.replace(/[\\()]/g, '\\$&') + ') Tj T*'
    }).join('\n')
    const stream = 'BT /F1 9 Tf 11 TL 36 750 Td\n' + content + '\nET\n'
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page + 1} 0 R >>`)
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`)
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${pages.join(' ')}] >>`
  const chunks = ['%PDF-1.4\n']
  const offsets = ['0000000000 65535 f \n']
  let offset = Buffer.byteLength(chunks[0])
  for (const [index, object] of objects.entries()) {
    offsets.push(String(offset).padStart(10, '0') + ' 00000 n \n')
    const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`
    chunks.push(chunk)
    offset += Buffer.byteLength(chunk)
  }
  chunks.push(`xref\n0 ${offsets.length}\n${offsets.join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`)
  return Buffer.from(chunks.join(''))
}

export async function report(db, batch, format, key) {
  const rows = await db.transaction(async options => {
    const shipments = await db.shipments.find({ batch }, options).sort({ id: 1 }).toArray()
    const ids = shipments.map(shipment => shipment.id)
    const records = new Map(shipments.map(shipment => [
      shipment.id, [{ ...shipment, shipment_id: shipment.id, type: 'shipment' }]
    ]))
    for (const table of ['telemetry', 'handoffs', 'alerts']) {
      const cursor = db[table].find({ shipment_id: { $in: ids } }, options).sort({ recorded_at: 1, id: 1 })
      for await (const record of cursor) records.get(record.shipment_id).push({ ...record, type: table, batch })
    }
    return [...records.values()].flat()
  })
  if (!rows.length) return null
  const valueOf = (row, column) => {
    const value = row[column]
    return value != null && timestamps.has(column) ? new Date(value).toISOString() : value ?? ''
  }
  const body = format === 'csv'
    ? Buffer.from([columns.join(','), ...rows.map(row => columns.map(column => csvCell(valueOf(row, column))).join(','))].join('\r\n') + '\r\n')
    : pdf(['ColdChain Pulse batch report', '', ...rows.flatMap(row => [
      columns.filter(column => row[column] != null).map(column => column + '=' + valueOf(row, column)).join('  '), ''
    ])])
  return {
    body,
    headers: {
      'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf',
      'Content-Disposition': `attachment; filename="coldchain-report.${format}"`,
      'X-Report-HMAC-SHA256': createHmac('sha256', key).update(body).digest('hex')
    }
  }
}
