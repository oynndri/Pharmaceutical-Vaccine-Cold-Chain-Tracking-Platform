import type { Shipment } from '../types';

export function complianceStatus(s: Shipment): ['ok' | 'crit' | 'neutral', string] {
  if (s.hadExcursion || s.alertLevel === 'critical') return ['crit', 'Excursion recorded'];
  if (s.status === 'delivered') return ['ok', 'Compliant'];
  return ['neutral', 'In progress'];
}
