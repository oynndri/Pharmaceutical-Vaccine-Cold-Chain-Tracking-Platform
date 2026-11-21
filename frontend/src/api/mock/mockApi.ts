/**
 * In-browser mock backend for development only.
 * Loaded via dynamic import when VITE_USE_MOCK_API=true, so it is not shipped in production builds.
 * Simulates 600 shipments with telemetry every 30s (sim-time; one tick per poll) and the
 * warning / critical (>10 min out of range) alert rules from the brief.
 */
import { ApiError } from '../client';
import type { ColdChainApi } from '../index';
import type {
  Alert,
  AlertLevel,
  HandoffRecord,
  OverviewStats,
  Role,
  Shipment,
  TelemetryReading,
  User,
  Vehicle,
} from '../../types';

const SHIPMENT_COUNT = 600;
const VEHICLE_COUNT = 640;
const TICK_SIM_MS = 30_000;
const CRITICAL_AFTER_MS = 10 * 60_000;
const WARNING_MARGIN_C = 0.5;
const MAX_READINGS = 120;
const MAX_FLEET_POINTS = 240;

let seed = 42;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const round1 = (n: number) => Math.round(n * 10) / 10;
const pad = (n: number, w: number) => String(n).padStart(w, '0');

const warehouses = ['Central Warehouse, Dhaka', 'Chattogram Hub', 'Khulna Depot'];
const clinics = [
  'Rural Health Clinic, Gazipur', 'District Hospital, Tangail', 'Community Clinic, Savar',
  'City Health Center, Dhaka', 'Upazila Health Center, Manikganj', 'General Hospital, Narayanganj',
  'Community Clinic, Tongi', 'Upazila Health Complex, Narsingdi', 'Rural Health Post, Keraniganj',
];
const products: [string, string][] = [
  ['BCG Vaccine', 'VAC-BCG'], ['Insulin Glargine', 'INS-GLA'], ['Polio Vaccine', 'VAC-OPV'],
  ['Hepatitis B Vaccine', 'VAC-HEP'], ['Measles-Rubella Vaccine', 'VAC-MR'], ['Tetanus Toxoid', 'VAC-TT'],
  ['Pentavalent Vaccine', 'VAC-PENTA'], ['Oxytocin Injection', 'INJ-OXY'],
];
const driverNames = [
  'Rahim Ahmed', 'Karim Hassan', 'Abdul Rahman', 'Jamal Uddin', 'Shafiq Islam', 'Sohel Rana', 'Faruk Ali',
  'Mizanur Rahman', 'Habib Khan', 'Rashed Karim', 'Tanvir Hossain', 'Selim Reza', 'Anwar Hossain',
  'Nazmul Haque', 'Kamal Uddin', 'Delwar Hossain', 'Shahin Alam', 'Mamun Mia', 'Jahid Hasan', 'Rubel Mia',
  'Arif Hossain', 'Masud Rana', 'Hasan Mahmud', 'Imran Hossain', 'Sumon Ahmed', 'Babul Mia', 'Liton Das',
  'Sabbir Ahmed', 'Monir Hossain', 'Polash Roy', 'Riaz Uddin', 'Shamim Reza', 'Alamgir Kabir', 'Zahid Hasan',
  'Noor Alam', 'Biplob Das', 'Mostafa Kamal', 'Ripon Mia', 'Kawsar Ahmed', 'Hridoy Khan',
];
const receivers = ['Dr. Nusrat Jahan', 'Dr. Farhana Akter', 'Sabina Yasmin', 'Dr. Tahmina Begum'];

const users: (User & { password: string })[] = [
  { id: 'u-admin', name: 'Ayesha Siddiqua', role: 'admin', password: 'demo' },
  { id: 'u-disp', name: 'Nadia Islam', role: 'dispatcher', password: 'demo' },
  { id: 'u-clinic', name: 'Dr. Nusrat Jahan', role: 'clinic_receiver', password: 'demo' },
  { id: 'u-audit', name: 'Imran Chowdhury', role: 'auditor', password: 'demo' },
  ...driverNames.map((name, i) => ({
    id: `u-drv-${i + 1}`,
    name,
    role: 'driver' as Role,
    phone: `+880 17${pad(10 + i, 2)} ${pad(100 + i * 7, 3)} ${pad(200 + i * 13, 3)}`,
    password: 'demo',
  })),
];
// Login usernames: admin, dispatcher, clinic, auditor, driver (= first driver)
const usernames: Record<string, string> = {
  admin: 'u-admin', dispatcher: 'u-disp', clinic: 'u-clinic', auditor: 'u-audit', driver: 'u-drv-1',
};

const vehicles: Vehicle[] = Array.from({ length: VEHICLE_COUNT }, (_, i) => ({
  id: `v-${i + 1}`,
  plate: `MED-TRUCK-${pad(i + 1, 3)}`,
  refrigerated: true,
  available: true,
}));

interface SimState {
  drift: number;
  outOfRangeSinceMs: number | null;
}
const shipments: Shipment[] = [];
const sim = new Map<string, SimState>();
const readings = new Map<string, TelemetryReading[]>();
const alerts: Alert[] = [];
const handoffs: HandoffRecord[] = [];
const fleetTemp: OverviewStats['fleetTemp'] = [];
const seenIdempotencyKeys = new Set<string>();

let simNowMs = Date.now();

function levelFor(s: Shipment, st: SimState): AlertLevel {
  const t = s.currentTempC;
  if (t === null) return 'ok';
  const out = t < s.minTempC || t > s.maxTempC;
  if (out && st.outOfRangeSinceMs !== null && simNowMs - st.outOfRangeSinceMs > CRITICAL_AFTER_MS) return 'critical';
  if (out || t < s.minTempC + WARNING_MARGIN_C || t > s.maxTempC - WARNING_MARGIN_C) return 'warning';
  return 'ok';
}

function raiseAlert(s: Shipment, st: SimState) {
  const t = s.currentTempC!;
  const high = t > (s.minTempC + s.maxTempC) / 2;
  const threshold = high ? s.maxTempC : s.minTempC;
  const mins = st.outOfRangeSinceMs !== null ? Math.round((simNowMs - st.outOfRangeSinceMs) / 60000) : 0;
  const critical = s.alertLevel === 'critical';
  alerts.unshift({
    id: `ALT-2026-${pad(alerts.length + 1, 4)}`,
    shipmentId: s.id,
    shipmentCode: s.code,
    level: critical ? 'critical' : 'warning',
    title: critical ? 'Temperature excursion' : high ? 'Approaching upper limit' : 'Approaching lower limit',
    message: critical
      ? `${high ? 'Above' : 'Below'} ${threshold}°C for ${mins} continuous minutes`
      : `Temperature is nearing the ${threshold}°C limit`,
    tempC: t,
    thresholdC: threshold,
    vehiclePlate: s.vehiclePlate,
    destination: s.destination,
    triggeredAtIso: new Date(simNowMs).toISOString(),
    acknowledged: false,
  });
}

function pushReading(s: Shipment, st: SimState) {
  const mid = (s.minTempC + s.maxTempC) / 2;
  const prev = s.currentTempC ?? mid;
  const pull = (mid - prev) * (st.drift === 0 ? 0.15 : 0.02);
  const next = round1(prev + pull + st.drift + (rand() - 0.5) * 0.4);
  const hum = round1(55 + (rand() - 0.5) * 10);
  s.currentTempC = next;
  s.currentHumidity = hum;
  s.lastReadingIso = new Date(simNowMs).toISOString();

  const out = next < s.minTempC || next > s.maxTempC;
  if (out && st.outOfRangeSinceMs === null) st.outOfRangeSinceMs = simNowMs;
  if (!out) st.outOfRangeSinceMs = null;

  const list = readings.get(s.id)!;
  list.push({ shipmentId: s.id, tempC: next, humidity: hum, recordedAtIso: s.lastReadingIso });
  if (list.length > MAX_READINGS) list.shift();

  const before = s.alertLevel;
  s.alertLevel = levelFor(s, st);
  if (s.alertLevel === 'critical') s.hadExcursion = true;
  if (s.alertLevel !== 'ok' && s.alertLevel !== before) raiseAlert(s, st);
}

function stepFleet() {
  let sum = 0;
  let n = 0;
  for (const s of shipments) {
    if (s.status !== 'in_transit') continue;
    pushReading(s, sim.get(s.id)!);
    sum += s.currentTempC!;
    n++;
  }
  if (n) fleetTemp.push({ timeIso: new Date(simNowMs).toISOString(), avgC: round1(sum / n) });
  if (fleetTemp.length > MAX_FLEET_POINTS) fleetTemp.shift();
}

function addHandoff(s: Shipment, type: 'pickup' | 'delivery', atMs: number) {
  handoffs.push({
    id: `h-${handoffs.length + 1}`,
    clientId: `seed-${handoffs.length + 1}`,
    shipmentId: s.id,
    shipmentCode: s.code,
    type,
    qrPayload: `CCP:${s.id}`,
    pin: '****',
    signatureDataUrl: null,
    condition: 'intact',
    lat: 23.8 + rand() * 0.2,
    lng: 90.3 + rand() * 0.2,
    recordedAtIso: new Date(atMs).toISOString(),
    actorName: type === 'pickup' ? s.driverName : pick(receivers),
  });
}

function seedData() {
  const drivers = users.filter((u) => u.role === 'driver');
  const now = Date.now();
  for (let i = 0; i < SHIPMENT_COUNT; i++) {
    const driver = i < 3 ? drivers[0] : drivers[i % drivers.length];
    const vehicle = vehicles[i];
    const [product, batchPrefix] = pick(products);
    const status = i % 9 === 8 ? 'delivered' : i % 15 === 14 ? 'scheduled' : 'in_transit';
    const createdMs = now - (1 + rand() * 5) * 3600_000;
    const deliveredMs = status === 'delivered' ? now - rand() * 6 * 3600_000 : null;
    const etaMs =
      deliveredMs !== null
        ? deliveredMs + (rand() < 0.94 ? 1 : -1) * rand() * 40 * 60_000
        : now + (0.5 + rand() * 6) * 3600_000;
    const s: Shipment = {
      id: `s-${i + 1}`,
      code: `SHP-2026-${pad(842 + i, 4)}`,
      product,
      batchNo: `${batchPrefix}-${24000 + Math.floor(rand() * 999)}`,
      origin: pick(warehouses),
      destination: pick(clinics),
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.plate,
      driverId: driver.id,
      driverName: driver.name,
      status,
      minTempC: 2,
      maxTempC: 8,
      currentTempC: null,
      currentHumidity: null,
      alertLevel: 'ok',
      etaIso: new Date(etaMs).toISOString(),
      lastReadingIso: null,
      createdAtIso: new Date(createdMs).toISOString(),
      deliveredAtIso: deliveredMs !== null ? new Date(deliveredMs).toISOString() : null,
      hadExcursion: status === 'delivered' && rand() < 0.06,
    };
    if (status !== 'delivered') vehicle.available = false;
    // ~4% of trucks have a failing compressor and drift warm.
    const drift = status === 'in_transit' && rand() < 0.04 ? 0.06 + rand() * 0.06 : 0;
    shipments.push(s);
    sim.set(s.id, { drift, outOfRangeSinceMs: null });
    readings.set(s.id, []);
    if (status !== 'scheduled') addHandoff(s, 'pickup', createdMs + 20 * 60_000);
    if (deliveredMs !== null) {
      addHandoff(s, 'delivery', deliveredMs);
      // Completed trips keep their full temperature history for compliance reports.
      const startMs = createdMs + 20 * 60_000;
      const steps = Math.min(MAX_READINGS, Math.max(2, Math.floor((deliveredMs - startMs) / (TICK_SIM_MS * 4))));
      let t = 5 + (rand() - 0.5);
      const list = readings.get(s.id)!;
      for (let k = 0; k < steps; k++) {
        t = round1(t + (5 - t) * 0.2 + (rand() - 0.5) * 0.5 + (s.hadExcursion && k > steps * 0.4 && k < steps * 0.6 ? 0.9 : 0));
        list.push({ shipmentId: s.id, tempC: t, humidity: round1(55 + (rand() - 0.5) * 10), recordedAtIso: new Date(startMs + ((deliveredMs - startMs) * k) / (steps - 1)).toISOString() });
      }
      s.currentTempC = t;
    }
  }
  handoffs.sort((a, b) => a.recordedAtIso.localeCompare(b.recordedAtIso));
  // Backfill 60 readings (30 min) of history.
  simNowMs -= 60 * TICK_SIM_MS;
  for (let k = 0; k < 60; k++) {
    simNowMs += TICK_SIM_MS;
    stepFleet();
  }
}
seedData();

let lastTickReal = Date.now();
function tick() {
  // One 30s sim tick per ≥3s of real time, so the board visibly moves while polling.
  const now = Date.now();
  if (now - lastTickReal < 3000) return;
  lastTickReal = now;
  simNowMs += TICK_SIM_MS;
  stepFleet();
}

async function respond<T>(value: T, latency = 150 + rand() * 250): Promise<T> {
  if (!navigator.onLine) throw new TypeError('Failed to fetch');
  await new Promise((r) => setTimeout(r, latency));
  return structuredClone(value);
}

function requireUser(...roles: Role[]): User {
  let id: string | null = null;
  try {
    const t = localStorage.getItem('ccp.token');
    id = t?.startsWith('mock.') ? t.slice(5) : null;
  } catch {
    /* ignore */
  }
  const u = users.find((x) => x.id === id);
  if (!u) throw new ApiError(401, 'Not signed in');
  if (roles.length && !roles.includes(u.role)) throw new ApiError(403, 'You do not have permission for this action');
  return { id: u.id, name: u.name, role: u.role, phone: u.phone };
}

const findShipment = (idOrCode: string) =>
  shipments.find((x) => x.id === idOrCode || x.code.toLowerCase() === idOrCode.trim().toLowerCase());

export const mockApi: ColdChainApi = {
  async login(username, password) {
    const id = usernames[username.trim().toLowerCase()];
    const u = users.find((x) => x.id === id);
    if (!u || u.password !== password) {
      await respond(null);
      throw new ApiError(401, 'Invalid username or password');
    }
    return respond({ token: `mock.${u.id}`, user: { id: u.id, name: u.name, role: u.role } });
  },

  async me() {
    return respond(requireUser());
  },

  async listShipments(q) {
    requireUser();
    tick();
    const search = q.search?.trim().toLowerCase();
    let items = shipments.filter(
      (s) =>
        (!q.alertLevel || s.alertLevel === q.alertLevel) &&
        (!q.status || s.status === q.status) &&
        (!q.driverId || s.driverId === q.driverId) &&
        (!search ||
          s.code.toLowerCase().includes(search) ||
          s.destination.toLowerCase().includes(search) ||
          s.product.toLowerCase().includes(search) ||
          s.driverName.toLowerCase().includes(search)),
    );
    const pageSize = q.pageSize ?? 50;
    const page = q.page ?? 1;
    const total = items.length;
    items = items.slice((page - 1) * pageSize, page * pageSize);
    return respond({ items, total, page, pageSize });
  },

  async getShipment(id) {
    requireUser();
    tick();
    const s = findShipment(id);
    if (!s) throw new ApiError(404, 'Shipment not found');
    return respond(s);
  },

  async createShipment(input) {
    requireUser('admin', 'dispatcher');
    if (input.minTempC >= input.maxTempC) throw new ApiError(422, 'Min temperature must be below max');
    const v = vehicles.find((x) => x.id === input.vehicleId);
    const d = users.find((x) => x.id === input.driverId);
    if (!v || !d) throw new ApiError(422, 'Unknown vehicle or driver');
    const s: Shipment = {
      id: `s-${shipments.length + 1}`,
      code: `SHP-2026-${pad(842 + shipments.length, 4)}`,
      ...input,
      vehiclePlate: v.plate,
      driverName: d.name,
      status: 'scheduled',
      currentTempC: null,
      currentHumidity: null,
      alertLevel: 'ok',
      lastReadingIso: null,
      createdAtIso: new Date().toISOString(),
      deliveredAtIso: null,
      hadExcursion: false,
    };
    shipments.unshift(s);
    sim.set(s.id, { drift: 0, outOfRangeSinceMs: null });
    readings.set(s.id, []);
    v.available = false;
    return respond(s);
  },

  async listVehicles() {
    requireUser();
    return respond(vehicles);
  },

  async listDrivers() {
    requireUser();
    return respond(users.filter((u) => u.role === 'driver').map(({ id, name, role, phone }) => ({ id, name, role, phone })));
  },

  async getTelemetry(id) {
    requireUser();
    tick();
    return respond(readings.get(findShipment(id)?.id ?? id) ?? []);
  },

  async listAlerts({ unacknowledgedOnly }) {
    requireUser();
    tick();
    const list = unacknowledgedOnly ? alerts.filter((a) => !a.acknowledged) : alerts;
    // Only the latest alert per shipment is actionable.
    const seen = new Set<string>();
    const latest = list.filter((a) => {
      if (seen.has(a.shipmentId)) return false;
      seen.add(a.shipmentId);
      return true;
    });
    return respond(latest.slice(0, 200));
  },

  async acknowledgeAlert(id) {
    requireUser('admin', 'dispatcher');
    const a = alerts.find((x) => x.id === id);
    if (a) a.acknowledged = true;
    return respond(undefined);
  },

  async submitHandoff(input) {
    const u = requireUser('admin', 'driver', 'clinic_receiver');
    if (seenIdempotencyKeys.has(input.clientId)) return respond(undefined); // duplicate retry: no-op
    const s = findShipment(input.shipmentId);
    if (!s) throw new ApiError(404, 'Shipment not found');
    if (!/^\d{4,6}$/.test(input.pin)) throw new ApiError(422, 'PIN must be 4–6 digits');
    seenIdempotencyKeys.add(input.clientId);
    handoffs.push({ ...input, shipmentId: s.id, shipmentCode: s.code, id: `h-${handoffs.length + 1}`, actorName: u.name });
    if (input.type === 'pickup' && s.status === 'scheduled') s.status = 'in_transit';
    if (input.type === 'delivery') {
      s.status = 'delivered';
      s.deliveredAtIso = input.recordedAtIso;
      const v = vehicles.find((x) => x.id === s.vehicleId);
      if (v) v.available = true;
    }
    return respond(undefined);
  },

  async submitTempLog(input) {
    requireUser('admin', 'driver');
    if (seenIdempotencyKeys.has(input.clientId)) return respond(undefined);
    const list = readings.get(input.shipmentId);
    if (!list) throw new ApiError(404, 'Shipment not found');
    seenIdempotencyKeys.add(input.clientId);
    list.push({ shipmentId: input.shipmentId, tempC: input.tempC, humidity: input.humidity ?? 0, recordedAtIso: input.recordedAtIso });
    return respond(undefined);
  },

  async getAuditReport(id) {
    requireUser('admin', 'auditor', 'dispatcher');
    const s = findShipment(id);
    if (!s) throw new ApiError(404, 'Shipment not found');
    return respond({
      shipment: s,
      readings: readings.get(s.id) ?? [],
      handoffs: handoffs.filter((h) => h.shipmentId === s.id),
      alerts: alerts.filter((a) => a.shipmentId === s.id),
    });
  },

  async listHandoffs({ limit = 20 }) {
    requireUser();
    return respond(handoffs.slice(-limit).reverse());
  },

  async getOverview() {
    requireUser();
    tick();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const delivered = shipments.filter((s) => s.deliveredAtIso && new Date(s.deliveredAtIso) >= dayStart);
    const onTime = delivered.filter((s) => !s.etaIso || s.deliveredAtIso! <= s.etaIso).length;
    return respond({
      deliveredToday: delivered.length,
      onTimeToday: onTime,
      delayedToday: delivered.length - onTime,
      activeVehicles: vehicles.filter((v) => !v.available).length,
      totalVehicles: vehicles.length,
      fleetTemp,
    });
  },
};
