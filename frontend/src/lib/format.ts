export function fmtTemp(t: number | null) {
  return t === null ? '—' : `${t.toFixed(1)}°C`;
}

export function fmtTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtRelative(iso: string | null) {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

export const statusLabel = {
  scheduled: 'Scheduled',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
} as const;
