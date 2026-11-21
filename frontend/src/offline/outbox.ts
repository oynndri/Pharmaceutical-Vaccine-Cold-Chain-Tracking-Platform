import { api } from '../api';
import { ApiError, errorMessage } from '../api/client';
import { config } from '../config';
import type { HandoffInput, TempLogInput } from '../types';
import { db } from './db';
import type { OutboxItem } from './db';

/**
 * Offline-first write path. Driver writes ALWAYS go to the IndexedDB outbox first, then sync.
 * - Each item's id is a UUID created on the device and sent as the Idempotency-Key,
 *   so a retry after a dropped response cannot create a duplicate on the server.
 * - A Web Lock stops two open tabs from syncing the same items at once.
 * - Items are sent oldest-first; a network failure stops the run and keeps order.
 */

export function newClientId() {
  return crypto.randomUUID();
}

export async function enqueueHandoff(payload: HandoffInput) {
  await db.outbox.add({ id: payload.clientId, kind: 'handoff', payload, createdAt: Date.now(), status: 'pending', attempts: 0, lastError: null });
  void syncOutbox();
}

export async function enqueueTempLog(payload: TempLogInput) {
  await db.outbox.add({ id: payload.clientId, kind: 'temp_log', payload, createdAt: Date.now(), status: 'pending', attempts: 0, lastError: null });
  void syncOutbox();
}

async function send(item: OutboxItem) {
  if (item.kind === 'handoff') await api.submitHandoff(item.payload);
  else await api.submitTempLog(item.payload);
}

let inFlight: Promise<void> | null = null;

async function runSync() {
  const pending = await db.outbox.where('status').equals('pending').sortBy('createdAt');
  for (const item of pending) {
    if (!navigator.onLine) return;
    try {
      await send(item);
      await db.outbox.delete(item.id);
    } catch (err) {
      if (err instanceof ApiError && err.isPermanent) {
        await db.outbox.update(item.id, { status: 'failed', attempts: item.attempts + 1, lastError: errorMessage(err) });
        continue;
      }
      // Network / 5xx: keep it pending and try again later, preserving order.
      await db.outbox.update(item.id, { attempts: item.attempts + 1, lastError: errorMessage(err) });
      return;
    }
  }
}

export function syncOutbox(): Promise<void> {
  if (!navigator.onLine) return Promise.resolve();
  if (inFlight) return inFlight;
  const run = navigator.locks
    ? navigator.locks.request('ccp-outbox-sync', { ifAvailable: true }, async (lock) => {
        if (lock) await runSync();
      })
    : runSync();
  inFlight = Promise.resolve(run).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export async function retryFailed(id: string) {
  await db.outbox.update(id, { status: 'pending' });
  return syncOutbox();
}

let started = false;
export function startAutoSync() {
  if (started) return;
  started = true;
  window.addEventListener('online', () => void syncOutbox());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncOutbox();
  });
  setInterval(() => void syncOutbox(), config.outboxSyncMs);
  void syncOutbox();
}
