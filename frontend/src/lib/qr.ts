/** TODO(backend-sync): confirm the QR payload format; we accept "CCP:<shipmentId>" or a bare id/code. */
export function parseQr(text: string) {
  const t = text.trim();
  return t.startsWith('CCP:') ? t.slice(4) : t;
}
