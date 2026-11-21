import { createHmac } from 'node:crypto'
import { matches } from './db.mjs'
import { storeReading } from './operations.mjs'

const managers = ['admin', 'dispatcher']
const auditors = [...managers, 'auditor']
const projection = { projection: { _id: 0, id: 1, username: 1, name: 1, phone: 1, role: 1 } }
const userView = user => ({ id: String(user.id), name: user.name ?? user.username,
  role: user.role === 'receiver' ? 'clinic_receiver' : user.role, ...(user.phone && { phone: user.phone }) })
const iso = value => value == null ? null : new Date(value).toISOString()
const code = shipment => shipment.code ?? 'CCP-' + String(shipment.id).padStart(5, '0')
const readingView = row => ({ shipmentId: String(row.shipment_id), tempC: row.temperature,
  humidity: row.humidity ?? 0, recordedAtIso: iso(row.recorded_at), ...(row.note && { note: row.note }) })

const shipmentLookups = [
  { $lookup: { from: 'users', localField: 'driver_id', foreignField: 'id', as: 'drivers' } },
  { $lookup: { from: 'vehicles', localField: 'vehicle_id', foreignField: 'id', as: 'fleet' } },
  { $lookup: { from: 'alert_state', localField: 'id', foreignField: '_id', as: 'states' } },
  { $lookup: { from: 'alerts', localField: 'id', foreignField: 'shipment_id',
    pipeline: [{ $match: { severity: 'critical' } }, { $limit: 1 }, { $project: { _id: 1 } }], as: 'criticalHistory' } },
  { $lookup: { from: 'handoffs', localField: 'id', foreignField: 'shipment_id',
    pipeline: [{ $match: { stage: 'delivery' } }, { $project: { _id: 0, recorded_at: 1 } }], as: 'delivery' } }
]

function shipmentView(row) {
  const state = row.states?.[0]
  const level = state?.critical_sent ? 'critical' : state?.warning_start != null ? 'warning' : 'ok'
  return { id: String(row.id), code: code(row), product: row.product ?? 'Pharmaceutical shipment',
    batchNo: row.batch, origin: row.origin, destination: row.destination, vehicleId: String(row.vehicle_id),
    vehiclePlate: row.fleet?.[0]?.plate ?? '', driverId: String(row.driver_id),
    driverName: row.drivers?.[0]?.name ?? row.drivers?.[0]?.username ?? '', status: row.status,
    minTempC: row.min_temp, maxTempC: row.max_temp, currentTempC: row.latest?.temperature ?? null,
    currentHumidity: row.latest?.humidity ?? null, alertLevel: level, etaIso: iso(row.eta),
    lastReadingIso: iso(row.latest?.recorded_at), createdAtIso: iso(row.created_at ?? row._id?.getTimestamp?.()),
    deliveredAtIso: iso(row.delivered_at ?? row.delivery?.[0]?.recorded_at), hadExcursion: Boolean(row.criticalHistory?.length) }
}

function alertView(row, shipment) {
  const threshold = row.temperature <= (shipment.min_temp + shipment.max_temp) / 2 ? shipment.min_temp : shipment.max_temp
  return { id: String(row.id), shipmentId: String(shipment.id), shipmentCode: code(shipment),
    level: row.severity, title: row.humidity != null ? 'Humidity warning' :
      row.severity === 'critical' ? 'Temperature excursion' : 'Temperature warning',
    message: row.humidity != null ? 'Humidity reached ' + row.humidity + '%.' :
      'Temperature reached ' + row.temperature + '°C. Configured limit: ' + threshold + '°C.',
    tempC: row.temperature, thresholdC: threshold, vehiclePlate: shipment.fleet?.[0]?.plate ?? '',
    destination: shipment.destination, triggeredAtIso: iso(row.recorded_at), acknowledged: Boolean(row.ack?.length) }
}

function handoffView(row, shipment) {
  return { id: String(row.id), clientId: row.event_id, shipmentId: String(row.shipment_id),
    shipmentCode: code(shipment), type: row.stage, qrPayload: 'CCP:' + shipment.id, pin: '',
    signatureDataUrl: row.signature ?? null, condition: row.condition, lat: row.latitude ?? null,
    lng: row.longitude ?? null, recordedAtIso: iso(row.recorded_at),
    actorName: row.actors?.[0]?.name ?? row.actors?.[0]?.username ?? '' }
}

const actorLookup = { $lookup: { from: 'users', localField: 'actor_id', foreignField: 'id', as: 'actors' } }
const shipmentLookup = { $lookup: { from: 'shipments', localField: 'shipment_id', foreignField: 'id', as: 'shipment' } }
const ackLookup = { $lookup: { from: 'alert_acknowledgements', localField: 'id', foreignField: '_id', as: 'ack' } }
const fleetLookup = { $lookup: { from: 'vehicles', localField: 'shipment.vehicle_id', foreignField: 'id', as: 'fleet' } }

export function frontendApi(db, helpers, reportKey) {
  const { fail, requireRole, scope, json, string, number, integer, getShipment, createShipment, handoff } = helpers
  const idOf = input => integer({ id: typeof input === 'string' && /^\d+$/.test(input) ? Number(input) : NaN }, 'id')
  function isoTime(input) {
    if (typeof input !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(input)) fail(400, 'Invalid ISO timestamp')
    return integer({ time: Date.parse(input) }, 'time', 0, 8_640_000_000_000_000)
  }
  function clientEvent(req, body) {
    const id = string(body, 'clientId')
    const header = req.get('Idempotency-Key')
    if ((header && header !== id) || id.startsWith('sim-')) fail(400, 'Invalid idempotency key')
    return id
  }
  const pinFor = (qr, stage) => String(createHmac('sha256', reportKey).update(stage + ':' + qr)
    .digest().readUInt32BE() % 1_000_000).padStart(6, '0')

  async function details(id, user, options) {
    const [row] = await db.shipments.aggregate([{ $match: { id, ...scope(user) } }, ...shipmentLookups], options).toArray()
    if (!row) fail(404, 'Shipment not found')
    return row
  }

  return async (req, url, user, send) => {
    const path = url.pathname
    const method = req.method
    const browser = req.get('Accept') === 'application/json'
    const query = url.searchParams
    if (method === 'GET' && path === '/api/auth/me') {
      send(200, userView(await db.users.findOne({ id: user.id }, projection)))
      return true
    }
    if (method === 'GET' && path === '/api/users' && query.get('role') === 'driver') {
      requireRole(user, managers)
      send(200, (await db.users.find({ role: 'driver' }, projection).sort({ username: 1 }).toArray()).map(userView))
      return true
    }
    if (method === 'GET' && browser && path === '/api/vehicles') {
      requireRole(user, managers)
      const rows = await db.vehicles.aggregate([{ $sort: { id: 1 } },
        { $lookup: { from: 'shipments', localField: 'id', foreignField: 'active_vehicle', as: 'active' } }]).toArray()
      send(200, rows.map(row => ({ id: String(row.id), plate: row.plate,
        refrigerated: row.refrigerated ?? true, available: !row.active.length })))
      return true
    }
    if (method === 'GET' && browser && path === '/api/shipments' && !query.has('after') && !query.has('limit') && !query.has('q')) {
      const page = integer({ page: Number(query.get('page') ?? 1) }, 'page', 1, 100000)
      const pageSize = integer({ pageSize: Number(query.get('pageSize') ?? 20) }, 'pageSize', 1, 2000)
      const filter = scope(user)
      const driver = query.get('driverId')
      if (driver && user.role === 'driver' && idOf(driver) !== user.id) {
        send(200, { items: [], total: 0, page, pageSize }); return true
      }
      if (driver) filter.driver_id = idOf(driver)
      const status = query.get('status')
      if (status) {
        if (!['scheduled', 'in_transit', 'delivered', 'cancelled'].includes(status)) fail(400, 'Invalid status')
        filter.status = status
      }
      const search = query.get('search')?.trim()
      if (search) {
        if (search.length > 120) fail(400, 'Search is too long')
        const pattern = new RegExp(RegExp.escape(search), 'i')
        filter.$or = ['product', 'batch', 'origin', 'destination', 'code'].map(key => ({ [key]: pattern }))
        const candidate = /^(?:CCP-)?0*(\d+)$/i.exec(search)?.[1]
        if (candidate && Number.isSafeInteger(Number(candidate))) filter.$or.push({ id: Number(candidate) })
      }
      const level = query.get('alertLevel')
      if (level && !['ok', 'warning', 'critical'].includes(level)) fail(400, 'Invalid alert level')
      const stateFilter = level === 'critical' ? { 'states.critical_sent': true } :
        level === 'warning' ? { 'states.critical_sent': { $ne: true }, 'states.warning_start': { $exists: true, $ne: null } } :
        { 'states.critical_sent': { $ne: true }, 'states.warning_start': null }
      const [result] = await db.shipments.aggregate([
        { $match: filter }, { $sort: { id: -1 } },
        ...(level ? [shipmentLookups[2], { $match: stateFilter }] : []),
        { $facet: { count: [{ $count: 'total' }], rows: [
          { $skip: (page - 1) * pageSize }, { $limit: pageSize },
          ...(level ? shipmentLookups.filter((_, index) => index !== 2) : shipmentLookups)
        ] } }
      ]).toArray()
      send(200, { items: result.rows.map(shipmentView), total: result.count[0]?.total ?? 0, page, pageSize })
      return true
    }
    if (method === 'POST' && browser && path === '/api/shipments') {
      requireRole(user, managers)
      const body = await json(req)
      const configured = process.env.FRONTEND_RECEIVER_ID
      const receivers = await db.users.find(configured ? { role: 'receiver', id: idOf(configured) } : { role: 'receiver' })
        .limit(2).toArray()
      if (receivers.length !== 1) fail(409, 'Configure a default clinic receiver or create exactly one clinic receiver account')
      const result = await createShipment(db, { ...body, batch: string(body, 'batchNo'),
        vehicleId: idOf(body.vehicleId), driverId: idOf(body.driverId), receiverId: receivers[0].id,
        minTemp: body.minTempC, maxTemp: body.maxTempC, eta: isoTime(body.etaIso) }, pinFor)
      send(201, shipmentView(await details(result.id, user)))
      return true
    }
    const shipmentRoute = /^\/api\/shipments\/(\d+)(?:\/(telemetry|handoff-credentials))?$/.exec(path)
    if (method === 'GET' && shipmentRoute && (browser || shipmentRoute[2] === 'handoff-credentials') && !query.has('after')) {
      const [, rawId, action] = shipmentRoute
      const id = idOf(rawId)
      if (action === 'handoff-credentials') {
        requireRole(user, managers)
        const row = await getShipment(db, user, id)
        if (!row.frontend_credentials) fail(404, 'Shipment uses separately issued credentials')
        const pickupPin = pinFor(row.pickup_qr, 'pickup')
        const deliveryPin = pinFor(row.delivery_qr, 'delivery')
        if (!matches(pickupPin, row.pickup_pin) || !matches(deliveryPin, row.delivery_pin)) fail(409, 'Original report key is required to recover these PINs')
        send(200, { qrPayload: 'CCP:' + id, pickupPin, deliveryPin })
      } else if (action === 'telemetry') {
        await getShipment(db, user, id)
        const rows = await db.telemetry.find({ shipment_id: id }).sort({ recorded_at: -1, id: -1 }).limit(500).toArray()
        send(200, rows.reverse().map(readingView))
      } else {
        send(200, shipmentView(await details(id, user)))
      }
      return true
    }
    if (method === 'POST' && ['/api/handoffs', '/api/temperature-logs'].includes(path)) {
      requireRole(user, path === '/api/handoffs' ? ['admin', 'driver', 'receiver'] : [...managers, 'driver'])
      const body = await json(req, path === '/api/handoffs' ? 300_000 : 32_768)
      const clientId = clientEvent(req, body)
      const shipment = await getShipment(db, user, idOf(body.shipmentId))
      const recordedAt = isoTime(body.recordedAtIso)
      if (recordedAt > Date.now() + 30_000) fail(400, 'Recorded timestamp is in the future')
      if (path === '/api/handoffs') {
        const stage = string(body, 'type')
        const condition = string(body, 'condition')
        if (!['pickup', 'delivery'].includes(stage) || !['intact', 'damaged', 'temperature_compromised'].includes(condition)) fail(400, 'Invalid handoff type or condition')
        const qr = string(body, 'qrPayload').trim().replace(/^CCP:/, '')
        if (qr !== String(shipment.id) && qr !== code(shipment) && qr !== shipment[stage + '_qr']) fail(400, 'QR does not match the shipment')
        const signature = body.signatureDataUrl
        if (typeof signature !== 'string' || signature.length > 250000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(signature)) fail(400, 'A PNG signature is required')
        await handoff(db, user, shipment, { stage, eventId: clientId, recordedAt,
          latitude: body.lat, longitude: body.lng, condition, qr: shipment[stage + '_qr'], pin: body.pin, signature }, true)
      } else {
        const note = body.note
        if (typeof note !== 'string' || note.length > 1000) fail(400, 'Invalid note')
        await storeReading(db, shipment.id, { eventId: clientId, actor: user.id, time: recordedAt,
          temperature: number(body, 'tempC', -150, 150), humidity: body.humidity === null ? null : number(body, 'humidity', 0, 100), note })
      }
      send(204)
      return true
    }
    const ackRoute = /^\/api\/alerts\/(\d+)\/ack$/.exec(path)
    if (method === 'POST' && ackRoute) {
      requireRole(user, managers)
      const id = idOf(ackRoute[1])
      if (!await db.alerts.findOne({ id })) fail(404, 'Alert not found')
      try {
        await db.alert_acknowledgements.insertOne({ _id: id, actor_id: user.id, recorded_at: Date.now() })
      } catch (error) {
        if (error.code !== 11000) throw error
      }
      send(204)
      return true
    }
    async function alertsFor(filter, unread, options, limit) {
      const shipmentFilter = Object.fromEntries(Object.entries(scope(user)).map(([key, value]) => ['shipment.' + key, value]))
      const rows = await db.alerts.aggregate([{ $match: filter }, { $sort: { id: -1 } },
        shipmentLookup, { $unwind: '$shipment' }, { $match: shipmentFilter }, ackLookup,
        ...(unread ? [{ $match: { 'ack.0': { $exists: false } } }] : []),
        ...(limit ? [{ $limit: limit }] : []), fleetLookup], options).toArray()
      return rows.map(row => alertView(row, { ...row.shipment, fleet: row.fleet }))
    }
    if (method === 'GET' && browser && path === '/api/alerts' && !query.has('after')) {
      requireRole(user, [...auditors, 'driver'])
      send(200, await alertsFor({}, query.get('unacknowledged') === 'true', undefined, 500))
      return true
    }
    if (method === 'GET' && path === '/api/handoffs') {
      requireRole(user, auditors)
      const limit = integer({ limit: Number(query.get('limit') ?? 10) }, 'limit', 1, 100)
      const rows = await db.handoffs.aggregate([{ $sort: { id: -1 } }, { $limit: limit }, actorLookup,
        shipmentLookup, { $unwind: '$shipment' }]).toArray()
      send(200, rows.map(row => handoffView(row, row.shipment)))
      return true
    }
    const audit = /^\/api\/audit\/shipments\/(\d+)$/.exec(path)
    if (method === 'GET' && audit) {
      requireRole(user, auditors)
      const id = idOf(audit[1])
      const report = await db.transaction(async options => {
        const shipment = await details(id, user, options)
        const readings = await db.telemetry.find({ shipment_id: id }, options).sort({ recorded_at: 1, id: 1 }).toArray()
        const handoffs = await db.handoffs.aggregate([{ $match: { shipment_id: id } }, { $sort: { recorded_at: 1, id: 1 } },
          actorLookup], options).toArray()
        return { shipment: shipmentView(shipment), readings: readings.map(readingView),
          handoffs: handoffs.map(row => handoffView(row, shipment)), alerts: await alertsFor({ shipment_id: id }, false, options) }
      })
      send(200, report)
      return true
    }
    if (method === 'GET' && path === '/api/stats/overview') {
      requireRole(user, managers)
      const now = Date.now()
      const dayStart = Math.floor((now + 21600000) / 86400000) * 86400000 - 21600000
      const [deliveries, activeVehicles, totalVehicles, fleet] = await Promise.all([
        db.handoffs.aggregate([{ $match: { stage: 'delivery', recorded_at: { $gte: dayStart, $lte: now } } },
          shipmentLookup, { $unwind: '$shipment' },
          { $group: { _id: null, total: { $sum: 1 }, onTime: { $sum: { $cond: [{ $lte: ['$recorded_at', '$shipment.eta'] }, 1, 0] } } } }]).toArray(),
        db.shipments.countDocuments({ status: 'in_transit' }), db.vehicles.countDocuments(),
        db.telemetry.aggregate([{ $match: { recorded_at: { $gte: dayStart, $lte: now } } },
          { $group: { _id: { $subtract: ['$recorded_at', { $mod: ['$recorded_at', 1800000] }] },
            avgC: { $avg: '$temperature' } } }, { $sort: { _id: 1 } }]).toArray()
      ])
      const deliveredToday = deliveries[0]?.total ?? 0
      const onTimeToday = deliveries[0]?.onTime ?? 0
      send(200, { deliveredToday, onTimeToday, delayedToday: deliveredToday - onTimeToday, activeVehicles,
        totalVehicles, fleetTemp: fleet.map(row => ({ timeIso: iso(row._id), avgC: row.avgC })) })
      return true
    }
    return false
  }
}

export { userView }
