// Domain types shared across the app.
// TODO(backend-sync): align field names with the backend team's schema once their code lands.

export type Role = 'admin' | 'dispatcher' | 'driver' | 'clinic_receiver' | 'auditor';

export interface User {
  id: string;
  name: string;
  role: Role;
  phone?: string;
}

export interface Session {
  token: string;
  user: User;
}

export type AlertLevel = 'ok' | 'warning' | 'critical';
export type ShipmentStatus = 'scheduled' | 'in_transit' | 'delivered' | 'cancelled';

export interface Shipment {
  id: string;
  code: string;
  product: string;
  batchNo: string;
  origin: string;
  destination: string;
  vehicleId: string;
  vehiclePlate: string;
  driverId: string;
  driverName: string;
  status: ShipmentStatus;
  minTempC: number;
  maxTempC: number;
  currentTempC: number | null;
  currentHumidity: number | null;
  alertLevel: AlertLevel;
  etaIso: string | null;
  lastReadingIso: string | null;
  createdAtIso: string;
  deliveredAtIso: string | null;
  /** True if the shipment ever had a critical excursion (drives compliance status). */
  hadExcursion: boolean;
}

export interface Vehicle {
  id: string;
  plate: string;
  refrigerated: boolean;
  available: boolean;
}

export interface TelemetryReading {
  shipmentId: string;
  tempC: number;
  humidity: number;
  recordedAtIso: string;
}

export interface Alert {
  id: string;
  shipmentId: string;
  shipmentCode: string;
  level: 'warning' | 'critical';
  title: string;
  message: string;
  tempC: number;
  thresholdC: number;
  vehiclePlate: string;
  destination: string;
  triggeredAtIso: string;
  acknowledged: boolean;
}

export type HandoffType = 'pickup' | 'delivery';
export type HandoffCondition = 'intact' | 'damaged' | 'temperature_compromised';

/** Created on the device. `clientId` doubles as the idempotency key so retried syncs never duplicate. */
export interface HandoffInput {
  clientId: string;
  shipmentId: string;
  type: HandoffType;
  qrPayload: string;
  pin: string;
  signatureDataUrl: string | null;
  condition: HandoffCondition;
  lat: number | null;
  lng: number | null;
  recordedAtIso: string;
}

export interface HandoffRecord extends HandoffInput {
  id: string;
  shipmentCode: string;
  actorName: string;
}

export interface OverviewStats {
  deliveredToday: number;
  onTimeToday: number;
  delayedToday: number;
  activeVehicles: number;
  totalVehicles: number;
  /** Fleet-average temperature over the day, oldest first. */
  fleetTemp: { timeIso: string; avgC: number }[];
}

export interface TempLogInput {
  clientId: string;
  shipmentId: string;
  tempC: number;
  humidity: number | null;
  note: string;
  recordedAtIso: string;
}

export interface AuditReport {
  shipment: Shipment;
  readings: TelemetryReading[];
  handoffs: HandoffRecord[];
  alerts: Alert[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ShipmentQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  alertLevel?: AlertLevel;
  status?: ShipmentStatus;
  driverId?: string;
}

export interface CreateShipmentInput {
  product: string;
  batchNo: string;
  origin: string;
  destination: string;
  vehicleId: string;
  driverId: string;
  minTempC: number;
  maxTempC: number;
  etaIso: string;
}
