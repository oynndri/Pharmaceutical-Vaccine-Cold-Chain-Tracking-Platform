import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { test } from 'node:test'
import { hashSecret, openDatabase } from './db.mjs'
import { MongoClient } from 'mongodb'
import { advanceAlerts, simulate } from './operations.mjs'
import { createApi } from './server.mjs'

const password = 'integration-test-password'
const reportKey = 'integration-test-signing-key-long'
const testUri = process.env.MONGODB_TEST_URI
const integration = { skip: !testUri && 'Set MONGODB_TEST_URI to run MongoDB integration tests' }

async function fixture(t) {
  const name = 'coldchain_test_' + randomUUID().replaceAll('-', '')
  const db = await openDatabase(testUri, name)
  let server
  t.after(async () => {
    if (server?.listening) await new Promise(resolve => server.close(resolve))
    await db.close()
    const cleanup = new MongoClient(testUri)
    try { await cleanup.db(name).dropDatabase() } finally { await cleanup.close() }
  })
  const hash = hashSecret(password)
  for (const role of ['admin', 'dispatcher', 'driver', 'receiver', 'auditor']) {
    await db.insert('users', { username: role, role, password: hash })
  }
  await db.insert('users', { username: 'other-driver', role: 'driver', password: hash })
  await db.insert('vehicles', { plate: 'VAN-01' })
  server = createApi(db, { reportKey, frontendOrigin: 'http://localhost:5173, https://frontend.example' })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  async function request(path, { token, body, origin, accept, idempotencyKey, method = body ? 'POST' : 'GET' } = {}) {
    return fetch('http://127.0.0.1:' + server.address().port + path, {
      method,
      headers: { ...(token && { Authorization: 'Bearer ' + token }), ...(body && { 'Content-Type': 'application/json' }),
        ...(origin && { Origin: origin }), ...(accept && { Accept: accept }), ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }) },
      body: body && JSON.stringify(body)
    })
  }
  async function login(username) {
    const response = await request('/api/login', { body: { username, password } })
    assert.equal(response.status, 200)
    return (await response.json()).token
  }
  return { db, request, login }
}

const shipmentBody = {
  batch: 'MED-01', origin: 'Warehouse', destination: 'Clinic', vehicleId: 1, driverId: 3,
  receiverId: 4, minTemp: 2, maxTemp: 8, pickupPin: '346790', deliveryPin: '239458',
  eta: Date.now() + 3_600_000
}

test('dispatch, scoped access, offline replay, handoffs, export and audit', integration, async t => {
  const { db, request, login } = await fixture(t)
  const [dispatcher, driver, receiver, auditor, outsider] = await Promise.all(
    ['dispatcher', 'driver', 'receiver', 'auditor', 'other-driver'].map(login)
  )
  assert.equal((await request('/api/shipments')).status, 401)
  const preflight = await request('/api/shipments', { method: 'OPTIONS', origin: 'https://frontend.example' })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://frontend.example')
  assert.equal((await request('/api/shipments', { token: auditor, body: shipmentBody })).status, 403)
  const create = await request('/api/shipments', {
    token: dispatcher, body: { ...shipmentBody, product: 'Biologic sample', category: 'Biologics', humidityWarning: 70 }
  })
  assert.equal(create.status, 201)
  const { id, pickupQr, deliveryQr } = await create.json()
  const path = '/api/shipments/' + id
  assert.equal((await (await request('/api/me', { token: driver })).json()).role, 'driver')
  const overview = await (await request('/api/dashboard', { token: dispatcher })).json()
  assert.equal(overview.activeShipments, 1)
  assert.equal((await request('/api/dashboard', { token: driver })).status, 403)
  const filtered = await (await request('/api/shipments?status=scheduled&q=biologic', { token: dispatcher })).json()
  assert.deepEqual(filtered.items.map(item => item.id), [id])
  assert.equal(filtered.items[0].humidity_warning, 70)
  assert.equal((await request(path, { token: outsider })).status, 404)
  assert.equal((await request(path + '/eta', { token: driver, method: 'PATCH', body: { eta: shipmentBody.eta + 1000 } })).status, 200)

  const pickup = {
    stage: 'pickup', qr: pickupQr, pin: '346790', eventId: 'pickup-1', recordedAt: Date.now() - 60_000,
    latitude: 23.81, longitude: 90.41, condition: 'sealed'
  }
  const delivery = { ...pickup, stage: 'delivery', qr: deliveryQr, pin: '239458', eventId: 'delivery-1', recordedAt: Date.now() }
  assert.equal((await request(path + '/handoffs', { token: receiver, body: delivery })).status, 409)
  assert.equal((await request(path + '/handoffs', { token: driver, body: { ...pickup, pin: '111111' } })).status, 403)
  const pickupAttempts = await Promise.all(Array.from({ length: 2 }, () =>
    request(path + '/handoffs', { token: driver, body: pickup })
  ))
  assert.deepEqual(pickupAttempts.map(response => response.status).sort(), [200, 201])
  assert.equal((await request(path + '/handoffs', { token: driver, body: pickup })).status, 200)
  const location = { latitude: 23.82, longitude: 90.42, recordedAt: pickup.recordedAt + 10_000 }
  const updateLocation = (body, token = driver) => request(path + '/location', { token, method: 'PATCH', body })
  assert.equal((await updateLocation(location, outsider)).status, 404)
  assert.equal((await updateLocation(location)).status, 200)
  assert.equal((await updateLocation({ ...location, recordedAt: pickup.recordedAt })).status, 409)
  assert.equal((await request(path + '/handoffs', { token: receiver, body: delivery })).status, 201)
  assert.equal((await request('/api/shipments', { token: dispatcher, body: shipmentBody })).status, 201)

  const reading = { eventId: 'reading-1', recordedAt: pickup.recordedAt + 30_000, temperature: 4, humidity: 53 }
  const concurrent = await Promise.all(Array.from({ length: 2 }, () =>
    request(path + '/telemetry', { token: driver, body: reading })
  ))
  assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 201])
  assert.equal((await request(path + '/telemetry', { token: driver, body: reading })).status, 200)
  assert.equal((await request(path + '/telemetry', { token: driver, body: { ...reading, temperature: 5 } })).status, 409)
  assert.equal((await request(path + '/telemetry', { token: dispatcher, method: 'PATCH', body: reading })).status, 404)
  assert.equal((await request(path + '/handoffs', { token: dispatcher, method: 'DELETE' })).status, 404)
  assert.equal(await db.telemetry.countDocuments({ shipment_id: id }), 1)
  assert.equal(await db.handoffs.countDocuments({ shipment_id: id }), 2)

  for (const format of ['csv', 'pdf']) {
    const response = await request('/api/batches/MED-01/report.' + format, { token: auditor })
    assert.equal(response.status, 200)
    const body = Buffer.from(await response.arrayBuffer())
    assert.match(body.toString(), format === 'csv' ? /^type,shipment_id/ : /^%PDF-1\.4/)
    assert.match(body.toString(), /reading-1/)
    assert.equal(response.headers.get('x-report-hmac-sha256'), createHmac('sha256', reportKey).update(body).digest('hex'))
  }
  assert.equal((await request('/api/login', { body: { username: 'driver', password: 'wrong' } })).status, 401)
  const audit = await request('/api/audit', { token: auditor })
  assert.equal((await audit.json())[0].action, 'login_failed')
})

test('warning, strict ten-minute threshold, recovery and a missing-data gap', () => {
  const shipment = { min_temp: 2, max_temp: 8 }
  const timeline = []
  const record = (recorded_at, temperature) => timeline.push({ recorded_at, temperature })
  const alerts = () => advanceAlerts(shipment, timeline.toSorted((a, b) => a.recorded_at - b.recorded_at)).alerts
  const critical = () => alerts().filter(row => row.severity === 'critical').map(row => row.recorded_at)
  record(0, 7.6)
  assert.equal(alerts()[0].severity, 'warning')
  for (let time = 30_000; time <= 630_000; time += 30_000) record(time, 9)
  assert.deepEqual(critical(), [])
  record(660_000, 9)
  record(690_000, 9)
  assert.deepEqual(critical(), [660_000])
  record(675_000, 9)
  assert.deepEqual(critical(), [660_000])
  record(720_000, 5)
  record(750_000, 1)
  record(1_400_000, 1)
  assert.deepEqual(critical(), [660_000])
  for (let time = 1_430_000; time <= 2_030_000; time += 30_000) record(time, 1)
  assert.deepEqual(critical(), [660_000, 2_030_000])
  const custom = advanceAlerts(
    { ...shipment, humidity_warning: 70, critical_minutes: 1 },
    [{ recorded_at: 0, temperature: 5, humidity: 71 }, ...[30_000, 60_000, 90_000, 120_000].map(recorded_at =>
      ({ recorded_at, temperature: 9, humidity: 65 }))]
  ).alerts
  assert.equal(custom[0].humidity, 71)
  assert.equal(custom.find(alert => alert.severity === 'critical').recorded_at, 120_000)
})

test('simulator and cursor pagination cover 500 active shipments', integration, async t => {
  const { db, request, login } = await fixture(t)
  const idsToSeed = Array.from({ length: 500 }, (_, index) => index + 1)
  await db.vehicles.insertMany(idsToSeed.slice(1).map(id => ({ id, plate: 'VAN-' + id })))
  await db.shipments.insertMany(idsToSeed.map(id => ({
    id, batch: 'A', origin: 'B', destination: 'C', vehicle_id: id, active_vehicle: id,
    driver_id: 3, receiver_id: 4, min_temp: 2, max_temp: 8, eta: 10000000, status: 'in_transit'
  })))
  const now = Date.now()
  assert.equal(await simulate(db, now), 500)
  await simulate(db, now)
  assert.equal(await db.telemetry.countDocuments(), 500)
  const token = await login('dispatcher')
  let cursor = 0
  const ids = []
  do {
    const response = await request('/api/shipments?limit=100&after=' + cursor, { token })
    assert.equal(response.status, 200)
    const { items, nextAfter } = await response.json()
    assert(items.every(item => Number.isFinite(item.temperature)))
    ids.push(...items.map(item => item.id))
    cursor = nextAfter
  } while (cursor !== null)
  assert.equal(new Set(ids).size, 500)
})

test('unchanged React client contract works end to end', integration, async t => {
  const { db, request, login } = await fixture(t)
  const browserRequest = (path, options = {}) => request(path, { ...options, accept: 'application/json' })
  const signedIn = await browserRequest('/api/auth/login', { body: { username: 'receiver', password } })
  const session = await signedIn.json()
  assert.equal(session.user.role, 'clinic_receiver')
  assert.equal(typeof session.user.id, 'string')
  const dispatcher = await login('dispatcher')
  const driver = await login('driver')
  const vehicleResponse = await browserRequest('/api/vehicles', { token: dispatcher })
  assert.deepEqual((await vehicleResponse.json())[0], { id: '1', plate: 'VAN-01', refrigerated: true, available: true })
  const created = await browserRequest('/api/shipments', { token: dispatcher, body: {
    product: 'Vaccine demo', batchNo: 'V001', origin: 'Warehouse', destination: 'Clinic',
    vehicleId: '1', driverId: '3', minTempC: 2, maxTempC: 8, etaIso: new Date(Date.now() + 3600000).toISOString()
  } })
  assert.equal(created.status, 201)
  const shipment = await created.json()
  const id = shipment.id
  const itemPath = '/api/shipments/' + id
  assert.equal(shipment.driverName, 'driver')
  const list = await (await browserRequest('/api/shipments?page=1&pageSize=2000&search=V001', { token: dispatcher })).json()
  assert.equal(list.total, 1)
  assert.deepEqual(list.items[0], shipment)
  assert.equal((await browserRequest(itemPath + '/handoff-credentials', { token: driver })).status, 403)
  const credentials = await (await browserRequest(itemPath + '/handoff-credentials', { token: dispatcher })).json()
  const signatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jc0sAAAAASUVORK5CYII='
  const pickup = { clientId: 'web-pickup', shipmentId: id, type: 'pickup', qrPayload: credentials.qrPayload,
    pin: credentials.pickupPin, signatureDataUrl, condition: 'intact', lat: null, lng: null,
    recordedAtIso: new Date(Date.now() - 10000).toISOString() }
  const sync = (path, body, token) => browserRequest(path, { token, body, idempotencyKey: body.clientId })
  assert.equal((await sync('/api/handoffs', pickup, driver)).status, 204)
  assert.equal((await sync('/api/handoffs', pickup, driver)).status, 204)
  const reading = { shipmentId: id, clientId: 'web-temp', tempC: 7.9, humidity: null, note: 'manual check',
    recordedAtIso: new Date().toISOString() }
  assert.equal((await sync('/api/temperature-logs', reading, driver)).status, 204)
  assert.equal((await sync('/api/temperature-logs', reading, driver)).status, 204)
  const telemetry = await (await browserRequest(itemPath + '/telemetry', { token: driver })).json()
  assert.equal(telemetry[0].tempC, 7.9)
  assert.equal(telemetry[0].note, 'manual check')
  const alertList = '/api/alerts?unacknowledged=true'
  const [alert] = await (await browserRequest(alertList, { token: dispatcher })).json()
  assert.equal(alert.level, 'warning')
  assert.equal((await browserRequest('/api/alerts/' + alert.id + '/ack', { token: dispatcher, method: 'POST' })).status, 204)
  assert.deepEqual(await (await browserRequest(alertList, { token: dispatcher })).json(), [])
  const delivery = { ...pickup, clientId: 'web-delivery', type: 'delivery', pin: credentials.deliveryPin,
    lat: 23.81, lng: 90.41, recordedAtIso: new Date().toISOString() }
  assert.equal((await sync('/api/handoffs', delivery, session.token)).status, 204)
  const report = await (await browserRequest('/api/audit/shipments/' + id, { token: dispatcher })).json()
  assert.equal(report.shipment.status, 'delivered')
  assert.equal(report.handoffs.length, 2)
  assert.equal(report.handoffs[0].signatureDataUrl, signatureDataUrl)
  assert.equal(report.handoffs[0].pin, '')
  assert.equal(report.alerts[0].acknowledged, true)
  assert.equal(await db.telemetry.countDocuments({ shipment_id: Number(id) }), 1)
  const stats = await (await browserRequest('/api/stats/overview', { token: dispatcher })).json()
  assert.equal(stats.deliveredToday, 1)
  assert.equal(stats.onTimeToday, 1)
  assert.equal((await (await browserRequest('/api/handoffs?limit=1', { token: dispatcher })).json())[0].type, 'delivery')
})
