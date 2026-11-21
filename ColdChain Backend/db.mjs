import { MongoClient } from 'mongodb'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashSecret(secret) {
  const salt = randomBytes(16).toString('hex')
  return salt + ':' + scryptSync(secret, salt, 32).toString('hex')
}

export function matches(secret, stored) {
  const [salt, hash] = stored.split(':')
  return timingSafeEqual(scryptSync(secret, salt, 32), Buffer.from(hash, 'hex'))
}

const indexes = {
  counters: [],
  users: [{ key: { username: 1 }, unique: true }],
  sessions: [{ key: { expires: 1 }, expireAfterSeconds: 0 }],
  vehicles: [{ key: { plate: 1 }, unique: true }],
  shipments: [
    { key: { active_vehicle: 1 }, unique: true, sparse: true },
    { key: { driver_id: 1, id: 1 } }, { key: { receiver_id: 1, id: 1 } },
    { key: { batch: 1, id: 1 } }, { key: { status: 1 } }
  ],
  telemetry: [
    { key: { shipment_id: 1, event_id: 1 }, unique: true },
    { key: { shipment_id: 1, recorded_at: 1, id: 1 } }, { key: { shipment_id: 1, id: 1 } }
  ],
  handoffs: [
    { key: { shipment_id: 1, event_id: 1 }, unique: true },
    { key: { shipment_id: 1, stage: 1 }, unique: true }, { key: { shipment_id: 1, id: 1 } }
  ],
  alerts: [
    { key: { shipment_id: 1, severity: 1, episode_start: 1 }, unique: true },
    { key: { shipment_id: 1, id: 1 } }
  ],
  audit: [],
  alert_state: [],
  alert_acknowledgements: []
}
const numbered = ['users', 'vehicles', 'shipments', 'telemetry', 'handoffs', 'alerts', 'audit']

export async function openDatabase(uri, name = 'coldchain', { initialize = true } = {}) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
  try {
    await client.connect()
    const database = client.db(name)
    const hello = await database.command({ hello: 1 })
    if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('MongoDB must be a replica set or Atlas cluster')
    const collections = Object.fromEntries(Object.keys(indexes).map(key => [key, database.collection(key)]))
    if (initialize) {
      for (const [key, definitions] of Object.entries(indexes)) {
        try { await database.createCollection(key) } catch (error) {
          if (error.code !== 48) throw error
        }
        const required = numbered.includes(key) ? [{ key: { id: 1 }, unique: true }, ...definitions] : definitions
        if (required.length) await collections[key].createIndexes(required)
      }
      for (const key of numbered) {
        await collections.counters.updateOne({ _id: key }, { $setOnInsert: { value: 0 } }, { upsert: true })
      }
    }
    return {
      ...collections,
      close: () => client.close(),
      transaction: work => client.withSession(session => session.withTransaction(
        () => work({ session }), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }
      )),
      async append(key, records, options) {
        if (!records.length) return []
        const counter = await collections.counters.findOneAndUpdate(
          { _id: key }, { $inc: { value: records.length } }, { ...options, returnDocument: 'after' }
        )
        const documents = records.map((data, index) => ({ ...data, id: counter.value - records.length + index + 1 }))
        await collections[key].insertMany(documents, options)
        return documents
      },
      async insert(key, data, options) {
        const [document] = await this.append(key, [data], options)
        return document.id
      }
    }
  } catch (error) {
    await client.close()
    throw error
  }
}
