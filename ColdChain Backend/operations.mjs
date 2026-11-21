import { randomUUID } from 'node:crypto'

export function advanceAlerts(shipment, timeline, state = {}) {
  const alerts = []
  let { last_time: lastTime = -Infinity, breach_side: breachSide = 0, breach_start: breachStart,
    warning_start: warningStart = null, critical_sent: criticalSent = false } = state
  const margin = Math.min(0.5, (shipment.max_temp - shipment.min_temp) / 4)
  const criticalAfter = (shipment.critical_minutes ?? 10) * 60_000
  for (const { recorded_at: time, temperature, humidity } of timeline) {
    const continuous = time - lastTime <= 60_000
    const side = temperature < shipment.min_temp ? -1 : temperature > shipment.max_temp ? 1 : 0
    if (!continuous || side !== breachSide) {
      breachStart = time
      criticalSent = false
    }
    const highHumidity = shipment.humidity_warning !== undefined && humidity != null && humidity > shipment.humidity_warning
    if (temperature <= shipment.min_temp + margin || temperature >= shipment.max_temp - margin || highHumidity) {
      if (!continuous || warningStart === null) {
        warningStart = time
        alerts.push({ severity: 'warning', episode_start: time, recorded_at: time, temperature,
          ...(highHumidity && { humidity }) })
      }
    } else {
      warningStart = null
    }
    if (side && !criticalSent && time - breachStart > criticalAfter) {
      alerts.push({ severity: 'critical', episode_start: breachStart, recorded_at: time, temperature })
      criticalSent = true
    }
    breachSide = side
    lastTime = time
  }
  return {
    alerts,
    state: { last_time: lastTime, breach_side: breachSide, breach_start: breachStart,
      warning_start: warningStart, critical_sent: criticalSent }
  }
}

export function storeReading(db, shipmentId, reading) {
  return db.transaction(async options => {
    const shipment = await db.shipments.findOne({ id: shipmentId }, options)
    const record = {
      shipment_id: shipmentId, event_id: reading.eventId, actor_id: reading.actor,
      recorded_at: reading.time, temperature: reading.temperature, humidity: reading.humidity,
      ...(reading.note !== undefined && { note: reading.note })
    }
    const previous = await db.telemetry.findOne({ shipment_id: shipmentId, event_id: reading.eventId }, options)
    if (previous) {
      if (reading.actor !== null && Object.keys(record).some(key => record[key] !== previous[key])) {
        throw Object.assign(new Error('eventId already used'), { status: 409 })
      }
      return false
    }
    await persistReadings(db, [shipment], [record], options)
    return true
  })
}

async function persistReadings(db, shipments, records, options) {
  if (!records.length) return
  const ids = records.map(record => record.shipment_id)
  const previousStates = await db.alert_state.find({ _id: { $in: ids } }, options).toArray()
  const states = new Map(previousStates.map(state => [state._id, state]))
  const byId = new Map(shipments.map(shipment => [shipment.id, shipment]))
  const documents = await db.append('telemetry', records, options)
  const alerts = []
  const changedStates = []
  const shipmentUpdates = []
  for (const record of documents) {
    const id = record.shipment_id
    const shipment = byId.get(id)
    const saved = states.get(id)
    const replay = saved && record.recorded_at < saved.last_time
    const timeline = replay ? await db.telemetry.find({ shipment_id: id }, options)
      .sort({ recorded_at: 1, id: 1 }).toArray() : [record]
    const result = advanceAlerts(shipment, timeline, replay ? undefined : saved)
    for (const alert of result.alerts) {
      const candidate = { ...alert, shipment_id: id }
      if (replay && await db.alerts.findOne({ shipment_id: id, severity: alert.severity,
        episode_start: alert.episode_start }, options)) continue
      alerts.push(candidate)
    }
    changedStates.push({ updateOne: { filter: { _id: id }, update: { $set: result.state }, upsert: true } })
    const latest = shipment.latest
    // Writing the shipment also serializes ingest with a delivery handoff.
    const update = !latest || record.recorded_at >= latest.recorded_at ?
      { $set: { latest: { id: record.id, recorded_at: record.recorded_at, temperature: record.temperature, humidity: record.humidity } } } :
      { $set: { latest } }
    shipmentUpdates.push({ updateOne: { filter: { id }, update } })
  }
  await db.append('alerts', alerts, options)
  await db.alert_state.bulkWrite(changedStates, options)
  await db.shipments.bulkWrite(shipmentUpdates, options)
}

function simulatedReading(shipment, now, slot, eventId) {
  const center = (shipment.min_temp + shipment.max_temp) / 2
  const excursion = shipment.id % 5 === 0 && (slot + shipment.id) % 80 < 25
  const temperature = excursion ? shipment.max_temp + 1 + Math.random() :
    center + (Math.random() - 0.5) * Math.min(1, shipment.max_temp - shipment.min_temp)
  return {
    shipment_id: shipment.id, event_id: eventId, actor_id: null, recorded_at: now,
    temperature: Math.round(temperature * 100) / 100,
    humidity: Math.round((45 + Math.random() * 20) * 10) / 10
  }
}

export async function simulate(db, now = Date.now()) {
  const active = await db.shipments.find({ status: 'in_transit' }, { projection: { id: 1 } }).toArray()
  const slot = Math.floor(now / 30_000)
  const eventId = 'sim-' + slot
  for (let offset = 0; offset < active.length; offset += 100) {
    const ids = active.slice(offset, offset + 100).map(shipment => shipment.id)
    await db.transaction(async options => {
      const shipments = await db.shipments.find({ id: { $in: ids }, status: 'in_transit' }, options).toArray()
      const existing = await db.telemetry.find({ shipment_id: { $in: ids }, event_id: eventId }, options).toArray()
      const sampled = new Set(existing.map(record => record.shipment_id))
      const records = shipments.filter(shipment => !sampled.has(shipment.id))
        .map(shipment => simulatedReading(shipment, now, slot, eventId))
      await persistReadings(db, shipments, records, options)
    })
  }
  return active.length
}

export function newQr() {
  return randomUUID()
}
