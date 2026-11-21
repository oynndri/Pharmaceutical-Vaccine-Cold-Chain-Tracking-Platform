import { createServer } from 'node:http'
import express from 'express'
import { frontendApi, userView } from './frontend-api.mjs'
import { createHash, randomBytes, scryptSync } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { hashSecret, matches, openDatabase } from './db.mjs'
import { newQr, simulate, storeReading } from './operations.mjs'
import { report } from './reports.mjs'

const roles = ['admin', 'dispatcher', 'driver', 'receiver', 'auditor']
const digest = value => createHash('sha256').update(value).digest('hex')
const dummyPassword = 'dummy:' + scryptSync('unused', 'dummy', 32).toString('hex')
const shipmentFields = {
  _id: 0, id: 1, batch: 1, origin: 1, destination: 1, vehicle_id: 1, driver_id: 1,
  receiver_id: 1, min_temp: 1, max_temp: 1, eta: 1, status: 1, product: 1, category: 1,
  humidity_warning: 1, critical_minutes: 1, location: 1
}
const publicRecord = { projection: { _id: 0 } }
const managers = ['admin', 'dispatcher']

function fail(status, message) {
  throw Object.assign(new Error(message), { status })
}

function requireRole(user, allowed) {
  if (!allowed.includes(user.role)) fail(403, 'This role cannot perform the operation')
}

function string(body, key, max = 120) {
  const value = body[key]
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, 'Invalid ' + key)
  return value
}

function number(body, key, min, max) {
  const value = body[key]
  if (!Number.isFinite(value) || value < min || value > max) fail(400, 'Invalid ' + key)
  return value
}

function integer(body, key, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const value = number(body, key, min, max)
  if (!Number.isSafeInteger(value)) fail(400, 'Invalid ' + key)
  return value
}

function eventTime(body) {
  return integer(body, 'recordedAt', 0, Date.now() + 30_000)
}

function pin(body, key) {
  const value = string(body, key, 8)
  if (!/^\d{4,8}$/.test(value)) fail(400, 'Invalid ' + key)
  return value
}

async function json(req, maxBytes = 32_768) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) fail(413, 'Request too large')
    chunks.push(chunk)
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks))
    if (body && typeof body === 'object' && !Array.isArray(body)) return body
  } catch {}
  fail(400, 'Expected a JSON object')
}

function scope(user) {
  if (user.role === 'driver') return { driver_id: user.id }
  if (user.role === 'receiver') return { receiver_id: user.id }
  return {}
}

async function getShipment(db, user, id, options) {
  const shipment = await db.shipments.findOne({ id, ...scope(user) }, options)
  if (!shipment) fail(404, 'Shipment not found')
  return shipment
}

async function listShipments(db, user, url) {
  const query = { after: Number(url.searchParams.get('after') ?? 0), limit: Number(url.searchParams.get('limit') ?? 50) }
  const after = integer(query, 'after', 0)
  const limit = integer(query, 'limit', 1, 100)
  const filter = scope(user)
  const status = url.searchParams.get('status')
  if (status) {
    if (!['scheduled', 'in_transit', 'delivered'].includes(status)) fail(400, 'Invalid status')
    filter.status = status
  }
  const search = url.searchParams.get('q')?.trim()
  if (search) {
    if (search.length > 120) fail(400, 'Search is too long')
    const pattern = new RegExp(RegExp.escape(search), 'i')
    filter.$or = ['batch', 'destination', 'product'].map(key => ({ [key]: pattern }))
    const id = Number(search)
    if (Number.isSafeInteger(id)) filter.$or.push({ id })
  }
  const rows = await db.shipments.aggregate([
    { $match: { ...filter, id: { $gt: after } } },
    { $sort: { id: 1 } }, { $limit: limit + 1 },
    { $project: { ...shipmentFields, temperature: { $ifNull: ['$latest.temperature', null] },
      temperature_at: { $ifNull: ['$latest.recorded_at', null] },
      humidity: { $ifNull: ['$latest.humidity', null] } } }
  ]).toArray()
  const items = rows.slice(0, limit)
  return { items, nextAfter: rows.length > limit ? items.at(-1).id : null }
}

async function createShipment(db, body, pinFor) {
  const vehicleId = integer(body, 'vehicleId')
  const driverId = integer(body, 'driverId')
  const receiverId = integer(body, 'receiverId')
  const min = number(body, 'minTemp', -100, 100)
  const max = number(body, 'maxTemp', -100, 100)
  if (min >= max) fail(400, 'maxTemp must exceed minTemp')
  const pickupQr = newQr()
  const deliveryQr = newQr()
  const [vehicle, driver, receiver] = await Promise.all([
    db.vehicles.findOne({ id: vehicleId }), db.users.findOne({ id: driverId, role: 'driver' }),
    db.users.findOne({ id: receiverId, role: 'receiver' })
  ])
  if (!vehicle || !driver || !receiver) fail(400, 'Invalid vehicle, driver, or receiver')
  try {
    const id = await db.insert('shipments', {
      batch: string(body, 'batch'), origin: string(body, 'origin'), destination: string(body, 'destination'),
      vehicle_id: vehicleId, active_vehicle: vehicleId, driver_id: driverId, receiver_id: receiverId,
      min_temp: min, max_temp: max, eta: integer(body, 'eta', 1, 8_640_000_000_000_000),
      pickup_qr: pickupQr, delivery_qr: deliveryQr, status: 'scheduled', created_at: Date.now(),
      ...(pinFor && { frontend_credentials: true }),
      ...(body.product !== undefined && { product: string(body, 'product') }),
      ...(body.category !== undefined && { category: string(body, 'category') }),
      ...(body.humidityWarning !== undefined && { humidity_warning: number(body, 'humidityWarning', 0, 100) }),
      critical_minutes: body.criticalMinutes === undefined ? 10 : integer(body, 'criticalMinutes', 1, 120),
      pickup_pin: hashSecret(pinFor ? pinFor(pickupQr, 'pickup') : pin(body, 'pickupPin')),
      delivery_pin: hashSecret(pinFor ? pinFor(deliveryQr, 'delivery') : pin(body, 'deliveryPin'))
    })
    return { id, pickupQr, deliveryQr }
  } catch (error) {
    if (error.code === 11000) fail(409, 'Vehicle already assigned to an active shipment')
    throw error
  }
}

async function handoff(db, user, shipment, body, frontend = false) {
  const stage = string(body, 'stage')
  if (!['pickup', 'delivery'].includes(stage)) fail(400, 'Invalid stage')
  const roles = stage === 'pickup' ? ['driver'] : ['driver', 'receiver']
  requireRole(user, frontend ? ['admin', ...roles] : roles)
  const eventId = string(body, 'eventId')
  const time = eventTime(body)
  const latitude = frontend && body.latitude === null ? null : number(body, 'latitude', -90, 90)
  const longitude = frontend && body.longitude === null ? null : number(body, 'longitude', -180, 180)
  const signature = frontend ? body.signature : null
  const condition = string(body, 'condition')
  const qr = string(body, 'qr')
  const suppliedPin = pin(body, 'pin')
  return db.transaction(async options => {
    const fresh = await getShipment(db, user, shipment.id, options)
    const existing = await db.handoffs.findOne({ shipment_id: shipment.id, event_id: eventId }, options)
    if (existing) {
      if (existing.actor_id !== user.id || existing.stage !== stage || existing.recorded_at !== time ||
          existing.latitude !== latitude || existing.longitude !== longitude || existing.condition !== condition || (existing.signature ?? null) !== signature) {
        fail(409, 'eventId already used')
      }
      return { id: existing.id, duplicate: true }
    }
    if (qr !== fresh[stage + '_qr'] || !matches(suppliedPin, fresh[stage + '_pin'])) fail(403, 'Invalid QR or PIN')
    const expected = stage === 'pickup' ? 'scheduled' : 'in_transit'
    if (fresh.status !== expected) fail(409, 'Handoff out of sequence')
    if (stage === 'delivery') {
      const pickup = await db.handoffs.findOne({ shipment_id: fresh.id, stage: 'pickup' }, options)
      if (time < pickup.recorded_at) fail(409, 'Delivery timestamp precedes pickup')
    }
    const update = stage === 'pickup' ? { $set: { status: 'in_transit' } } :
      { $set: { status: 'delivered', delivered_at: time }, $unset: { active_vehicle: '' } }
    await db.shipments.updateOne({ id: fresh.id }, update, options)
    const id = await db.insert('handoffs', {
      shipment_id: fresh.id, event_id: eventId, actor_id: user.id, stage,
      recorded_at: time, latitude, longitude, condition, ...(signature && { signature })
    }, options)
    return { id, duplicate: false }
  })
}

export function createApp(db, { reportKey, frontendOrigin } = {}) {
  if (!reportKey) throw new Error('A report signing key is required')
  const app = express()
  app.disable('x-powered-by')
  const handleFrontend = frontendApi(db, { fail, requireRole, scope, json, string, number, integer, getShipment, createShipment, handoff }, reportKey)
  const origins = new Set((frontendOrigin ?? '').split(',').map(origin => origin.trim()).filter(Boolean))
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.vary('Origin')
    if (origins.has(req.headers.origin)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
      res.setHeader('Access-Control-Expose-Headers', 'X-Report-HMAC-SHA256, Content-Disposition')
    }
    if (req.method === 'OPTIONS') return res.status(204).end()
    next()
  })
  app.get('/health', (req, res) => res.json({ status: 'ok' }))
  app.use(async (req, res) => {
    const send = (status, data) => status === 204 ? res.status(204).end() : res.status(status).json(data)
    try {
      const url = new URL(req.url, 'http://localhost')
      const path = url.pathname
      const method = req.method
      if (method === 'POST' && ['/api/login', '/api/auth/login'].includes(path)) {
        let username = '(invalid)'
        let user
        try {
          const body = await json(req)
          username = string(body, 'username', 64)
          const password = string(body, 'password', 256)
          user = await db.users.findOne({ username })
          if (!matches(password, user?.password ?? dummyPassword) || !user) fail(401, 'Invalid credentials')
        } catch (error) {
          if (error.status) await db.insert('audit', { username, action: 'login_failed', recorded_at: Date.now() })
          throw error
        }
        const token = randomBytes(32).toString('hex')
        await db.sessions.insertOne({ _id: digest(token), user_id: user.id, expires: new Date(Date.now() + 43_200_000) })
        send(200, { token, user: path === '/api/auth/login' ? userView(user) : { id: user.id, username, role: user.role } })
        return
      }
      const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization ?? '')?.[1]
      const session = token && await db.sessions.findOne({ _id: digest(token), expires: { $gt: new Date() } })
      const user = session && await db.users.findOne({ id: session.user_id }, { projection: { id: 1, role: 1 } })
      if (!user) fail(401, 'Authentication required')
      if (await handleFrontend(req, url, user, send)) return
      if (method === 'GET' && path === '/api/me') {
        const profile = await db.users.findOne({ id: user.id }, { projection: { _id: 0, id: 1, username: 1, role: 1 } })
        send(200, profile)
        return
      }
      if (method === 'GET' && path === '/api/dashboard') {
        requireRole(user, [...managers, 'auditor'])
        const [shipmentCounts, recentHandoffs, recentAlerts, criticalAlerts, vehicleCount] = await Promise.all([
          db.shipments.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
          db.handoffs.find({}, publicRecord).sort({ id: -1 }).limit(10).toArray(),
          db.alerts.find({}, publicRecord).sort({ id: -1 }).limit(10).toArray(),
          db.alerts.countDocuments({ severity: 'critical' }), db.vehicles.countDocuments()
        ])
        const counts = Object.fromEntries(shipmentCounts.map(row => [row._id, row.count]))
        const scheduled = counts.scheduled ?? 0
        const inTransit = counts.in_transit ?? 0
        const delivered = counts.delivered ?? 0
        send(200, { scheduled, inTransit, delivered, activeShipments: scheduled + inTransit,
          criticalAlerts, vehicleCount, recentAlerts, recentHandoffs })
        return
      }
      if (method === 'GET' && path === '/api/users') {
        requireRole(user, managers)
        const all = url.searchParams.get('all') === 'true'
        if (all) requireRole(user, ['admin'])
        send(200, await db.users.find(all ? {} : { role: { $in: ['driver', 'receiver'] } },
          { projection: { _id: 0, id: 1, username: 1, role: 1 } }).sort({ username: 1 }).toArray())
        return
      }
      if (method === 'POST' && path === '/api/users') {
        requireRole(user, ['admin'])
        const body = await json(req)
        const username = string(body, 'username', 64)
        const password = string(body, 'password', 256)
        if (password.length < 12 || !roles.includes(body.role)) fail(400, 'Invalid role or password shorter than 12 characters')
        try {
          const id = await db.insert('users', { username, role: body.role, password: hashSecret(password) })
          send(201, { id })
        } catch (error) {
          if (error.code === 11000) fail(409, 'Username already exists')
          throw error
        }
        return
      }
      if (path === '/api/vehicles') {
        requireRole(user, managers)
        if (method === 'GET') { send(200, await db.vehicles.find({}, publicRecord).sort({ id: 1 }).toArray()); return }
        if (method === 'POST') {
          const plate = string(await json(req), 'plate')
          try {
            send(201, { id: await db.insert('vehicles', { plate }) })
          } catch (error) {
            if (error.code === 11000) fail(409, 'Vehicle already exists')
            throw error
          }
          return
        }
      }
      if (method === 'GET' && path === '/api/audit') {
        requireRole(user, ['admin', 'auditor'])
        send(200, await db.audit.find({}, publicRecord).sort({ id: -1 }).limit(100).toArray())
        return
      }
      if (path === '/api/shipments') {
        if (method === 'GET') { send(200, await listShipments(db, user, url)); return }
        if (method === 'POST') { requireRole(user, managers); send(201, await createShipment(db, await json(req))); return }
      }
      if (method === 'GET' && path === '/api/alerts') {
        requireRole(user, [...managers, 'driver', 'auditor'])
        const after = integer({ after: Number(url.searchParams.get('after') ?? 0) }, 'after', 0)
        const filter = { id: { $gt: after } }
        if (user.role === 'driver') {
          const assigned = await db.shipments.find(scope(user), { projection: { id: 1 } }).toArray()
          filter.shipment_id = { $in: assigned.map(shipment => shipment.id) }
        }
        const items = await db.alerts.find(filter, publicRecord).sort({ id: 1 }).limit(100).toArray()
        send(200, { items, nextAfter: items.at(-1)?.id ?? after })
        return
      }
      const batch = /^\/api\/batches\/([^/]+)\/report\.(csv|pdf)$/.exec(path)
      if (method === 'GET' && batch) {
        requireRole(user, [...managers, 'auditor'])
        let name
        try { name = decodeURIComponent(batch[1]) } catch { fail(400, 'Invalid batch') }
        const output = await report(db, name, batch[2], reportKey)
        if (!output) fail(404, 'Batch not found')
        res.set(output.headers).send(output.body)
        return
      }
      const route = /^\/api\/shipments\/([1-9]\d*)(?:\/(eta|location|telemetry|handoffs))?$/.exec(path)
      if (route) {
        const id = integer({ id: Number(route[1]) }, 'id')
        const shipment = await getShipment(db, user, id)
        const action = route[2]
        if (!action && method === 'GET') {
          send(200, await db.shipments.findOne({ id }, { projection: shipmentFields }))
          return
        }
        if (method === 'PATCH' && action === 'location') {
          requireRole(user, [...managers, 'driver'])
          const body = await json(req)
          const location = {
            latitude: number(body, 'latitude', -90, 90), longitude: number(body, 'longitude', -180, 180),
            recorded_at: eventTime(body)
          }
          const result = await db.shipments.updateOne({ id, status: 'in_transit', $or: [
            { location: { $exists: false } }, { 'location.recorded_at': { $lte: location.recorded_at } }
          ] }, { $set: { location } })
          if (!result.matchedCount) fail(409, 'Shipment is outside transit or already has a newer location')
          send(200, { id, location })
          return
        }
        if (method === 'PATCH' && action === 'eta') {
          requireRole(user, [...managers, 'driver'])
          const eta = integer(await json(req), 'eta', 1, 8_640_000_000_000_000)
          const result = await db.shipments.updateOne({ id, status: { $ne: 'delivered' } }, { $set: { eta } })
          if (!result.matchedCount) {
            fail(409, 'Shipment already delivered')
          }
          send(200, { id, eta })
          return
        }
        if (method === 'GET' && ['telemetry', 'handoffs'].includes(action)) {
          const after = integer({ after: Number(url.searchParams.get('after') ?? 0) }, 'after', 0)
          const items = await db[action].find({ shipment_id: id, id: { $gt: after } }, publicRecord)
            .sort({ id: 1 }).limit(100).toArray()
          send(200, { items, nextAfter: items.at(-1)?.id ?? after })
          return
        }
        if (method === 'POST' && action === 'telemetry') {
          requireRole(user, [...managers, 'driver'])
          const body = await json(req)
          const reading = {
            eventId: string(body, 'eventId'), time: eventTime(body), actor: user.id,
            temperature: number(body, 'temperature', -150, 150), humidity: number(body, 'humidity', 0, 100)
          }
          if (reading.eventId.startsWith('sim-')) fail(400, 'Reserved eventId prefix')
          const inserted = await storeReading(db, shipment.id, reading)
          send(inserted ? 201 : 200, { duplicate: !inserted })
          return
        }
        if (method === 'POST' && action === 'handoffs') {
          requireRole(user, ['driver', 'receiver'])
          const result = await handoff(db, user, shipment, await json(req))
          send(result.duplicate ? 200 : 201, result)
          return
        }
      }
      fail(404, 'Endpoint not found')
    } catch (error) {
      if (!error.status) console.error(error)
      const message = error.status ? error.message : 'Internal server error'
      send(error.status ?? 500, { error: message, message })
    }
  })
  return app
}

export function createApi(db, options) {
  return createServer(createApp(db, options))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ADMIN_PASSWORD, REPORT_KEY, MONGODB_URI, MONGODB_DB, MONGODB_INITIALIZE, FRONTEND_ORIGIN, PORT, HOST } = process.env
  if (!REPORT_KEY || REPORT_KEY.length < 32) throw new Error('Set REPORT_KEY to at least 32 characters')
  if (!MONGODB_URI) throw new Error('Set MONGODB_URI to a MongoDB Atlas or replica set connection string')
  const db = await openDatabase(MONGODB_URI, MONGODB_DB, { initialize: MONGODB_INITIALIZE !== 'false' })
  try {
    if (!await db.users.findOne({ role: 'admin' })) {
      if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12 || ADMIN_PASSWORD.length > 256) {
        throw new Error('Set ADMIN_PASSWORD to 12–256 characters on first startup')
      }
      try {
        await db.insert('users', { username: 'admin', role: 'admin', password: hashSecret(ADMIN_PASSWORD) })
      } catch (error) {
        if (error.code !== 11000 || !await db.users.findOne({ username: 'admin', role: 'admin' })) throw error
      }
    }
  } catch (error) {
    await db.close()
    throw error
  }
  let currentTick
  const timer = setInterval(async () => {
    if (currentTick) return
    currentTick = simulate(db)
    try { await currentTick } catch (error) { console.error('Simulator tick failed', error) }
    finally { currentTick = undefined }
  }, 30_000)
  const server = createApi(db, { reportKey: REPORT_KEY, frontendOrigin: FRONTEND_ORIGIN })
  server.on('close', async () => {
    clearInterval(timer)
    await currentTick?.catch(() => {})
    await db.close()
  })
  server.listen(Number(PORT ?? 3000), HOST ?? '127.0.0.1', () => console.log('ColdChain Pulse Connected on port ' + server.address().port))
}
