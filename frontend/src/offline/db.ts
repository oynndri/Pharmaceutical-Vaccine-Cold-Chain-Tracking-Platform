import Dexie from 'dexie';
import type { EntityTable } from 'dexie';
import type { HandoffInput, Shipment, TempLogInput } from '../types';

export type OutboxItem =
  | { id: string; kind: 'handoff'; payload: HandoffInput; createdAt: number; status: OutboxStatus; attempts: number; lastError: string | null }
  | { id: string; kind: 'temp_log'; payload: TempLogInput; createdAt: number; status: OutboxStatus; attempts: number; lastError: string | null };

/** pending: waiting to sync. failed: server rejected it (needs a human), kept so nothing is lost. */
export type OutboxStatus = 'pending' | 'failed';

export const db = new Dexie('coldchain-pulse') as Dexie & {
  outbox: EntityTable<OutboxItem, 'id'>;
  shipmentCache: EntityTable<Shipment, 'id'>;
};

db.version(1).stores({
  outbox: 'id, createdAt, status',
  shipmentCache: 'id, driverId',
});
