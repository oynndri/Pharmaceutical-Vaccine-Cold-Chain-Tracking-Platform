import { config } from '../config';
import { http } from './client';
import type {
  Alert,
  AuditReport,
  CreateShipmentInput,
  HandoffInput,
  HandoffRecord,
  OverviewStats,
  Page,
  Session,
  Shipment,
  ShipmentQuery,
  TelemetryReading,
  TempLogInput,
  User,
  Vehicle,
} from '../types';

/**
 * Every backend call the frontend makes goes through this interface.
 * When the backend code arrives, only `httpApi` below needs to change.
 */
export interface ColdChainApi {
  login(username: string, password: string): Promise<Session>;
  me(): Promise<User>;
  listShipments(q: ShipmentQuery): Promise<Page<Shipment>>;
  getShipment(id: string): Promise<Shipment>;
  createShipment(input: CreateShipmentInput): Promise<Shipment>;
  listVehicles(): Promise<Vehicle[]>;
  listDrivers(): Promise<User[]>;
  getTelemetry(shipmentId: string): Promise<TelemetryReading[]>;
  listAlerts(opts: { unacknowledgedOnly?: boolean }): Promise<Alert[]>;
  acknowledgeAlert(id: string): Promise<void>;
  submitHandoff(input: HandoffInput): Promise<void>;
  submitTempLog(input: TempLogInput): Promise<void>;
  getAuditReport(shipmentId: string): Promise<AuditReport>;
  listHandoffs(opts: { limit?: number }): Promise<HandoffRecord[]>;
  getOverview(): Promise<OverviewStats>;
}

// TODO(backend-sync): confirm every path, verb and payload against the backend routes.
export const httpApi: ColdChainApi = {
  login: (username, password) => http('/auth/login', { method: 'POST', body: { username, password } }),
  me: () => http('/auth/me'),
  listShipments: (q) => http('/shipments', { query: { ...q } }),
  getShipment: (id) => http(`/shipments/${encodeURIComponent(id)}`),
  createShipment: (input) => http('/shipments', { method: 'POST', body: input }),
  listVehicles: () => http('/vehicles'),
  listDrivers: () => http('/users', { query: { role: 'driver' } }),
  getTelemetry: (id) => http(`/shipments/${encodeURIComponent(id)}/telemetry`),
  listAlerts: ({ unacknowledgedOnly }) =>
    http('/alerts', { query: { unacknowledged: unacknowledgedOnly ? 'true' : undefined } }),
  acknowledgeAlert: (id) => http(`/alerts/${encodeURIComponent(id)}/ack`, { method: 'POST' }),
  submitHandoff: (input) => http('/handoffs', { method: 'POST', body: input, idempotencyKey: input.clientId }),
  submitTempLog: (input) => http('/temperature-logs', { method: 'POST', body: input, idempotencyKey: input.clientId }),
  getAuditReport: (id) => http(`/audit/shipments/${encodeURIComponent(id)}`),
  listHandoffs: ({ limit }) => http('/handoffs', { query: { limit } }),
  getOverview: () => http('/stats/overview'),
};

const impl: Promise<ColdChainApi> = config.useMockApi
  ? import('./mock/mockApi').then((m) => m.mockApi)
  : Promise.resolve(httpApi);

export const api: ColdChainApi = {
  login: async (...a) => (await impl).login(...a),
  me: async () => (await impl).me(),
  listShipments: async (...a) => (await impl).listShipments(...a),
  getShipment: async (...a) => (await impl).getShipment(...a),
  createShipment: async (...a) => (await impl).createShipment(...a),
  listVehicles: async () => (await impl).listVehicles(),
  listDrivers: async () => (await impl).listDrivers(),
  getTelemetry: async (...a) => (await impl).getTelemetry(...a),
  listAlerts: async (...a) => (await impl).listAlerts(...a),
  acknowledgeAlert: async (...a) => (await impl).acknowledgeAlert(...a),
  submitHandoff: async (...a) => (await impl).submitHandoff(...a),
  submitTempLog: async (...a) => (await impl).submitTempLog(...a),
  getAuditReport: async (...a) => (await impl).getAuditReport(...a),
  listHandoffs: async (...a) => (await impl).listHandoffs(...a),
  getOverview: async () => (await impl).getOverview(),
};
