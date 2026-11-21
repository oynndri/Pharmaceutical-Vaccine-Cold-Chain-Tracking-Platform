import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { config } from '../config';
import { db } from '../offline/db';
import type { CreateShipmentInput, ShipmentQuery } from '../types';
import { api } from './index';

export const qk = {
  shipments: (q: ShipmentQuery) => ['shipments', q] as const,
  shipment: (id: string) => ['shipment', id] as const,
  telemetry: (id: string) => ['telemetry', id] as const,
  alerts: ['alerts'] as const,
  allAlerts: ['alerts', 'all'] as const,
  overview: ['overview'] as const,
  handoffs: (limit: number) => ['handoffs', limit] as const,
  vehicles: ['vehicles'] as const,
  drivers: ['drivers'] as const,
  driverShipments: (driverId: string) => ['driver-shipments', driverId] as const,
  audit: (id: string) => ['audit', id] as const,
};

/** Live board: all active shipments, refreshed on an interval. */
export function useLiveShipments() {
  const q: ShipmentQuery = { pageSize: 2000 };
  return useQuery({
    queryKey: qk.shipments(q),
    queryFn: () => api.listShipments(q),
    refetchInterval: config.livePollMs,
    placeholderData: keepPreviousData,
  });
}

export function useShipment(id: string) {
  return useQuery({ queryKey: qk.shipment(id), queryFn: () => api.getShipment(id), refetchInterval: config.livePollMs });
}

export function useTelemetry(id: string) {
  return useQuery({ queryKey: qk.telemetry(id), queryFn: () => api.getTelemetry(id), refetchInterval: config.livePollMs });
}

/** Open (unacknowledged) alerts — drives sidebar badge, bell and overview feed. */
export function useAlerts({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.alerts,
    queryFn: () => api.listAlerts({ unacknowledgedOnly: true }),
    refetchInterval: config.livePollMs,
    enabled,
  });
}

/** Every alert, including acknowledged ones (Alerts & Incidents page). */
export function useAllAlerts() {
  return useQuery({
    queryKey: qk.allAlerts,
    queryFn: () => api.listAlerts({ unacknowledgedOnly: false }),
    refetchInterval: config.livePollMs,
  });
}

export function useOverview() {
  return useQuery({ queryKey: qk.overview, queryFn: api.getOverview, refetchInterval: config.livePollMs });
}

export function useRecentHandoffs(limit = 5) {
  return useQuery({ queryKey: qk.handoffs(limit), queryFn: () => api.listHandoffs({ limit }), refetchInterval: 15_000 });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.acknowledgeAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useVehicles() {
  return useQuery({ queryKey: qk.vehicles, queryFn: api.listVehicles, staleTime: 60_000 });
}

export function useDrivers() {
  return useQuery({ queryKey: qk.drivers, queryFn: api.listDrivers, staleTime: 60_000 });
}

export function useCreateShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShipmentInput) => api.createShipment(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipments'] }),
  });
}

/**
 * Driver's assigned shipments. Network first; on success the list is cached in IndexedDB,
 * and when offline the cached copy is served so the driver can still do handoffs.
 */
export function useDriverShipments(driverId: string) {
  return useQuery({
    queryKey: qk.driverShipments(driverId),
    queryFn: async () => {
      try {
        const page = await api.listShipments({ driverId, pageSize: 100 });
        await db.transaction('rw', db.shipmentCache, async () => {
          await db.shipmentCache.where('driverId').equals(driverId).delete();
          await db.shipmentCache.bulkPut(page.items);
        });
        return { items: page.items, fromCache: false };
      } catch (err) {
        const cached = await db.shipmentCache.where('driverId').equals(driverId).toArray();
        if (cached.length) return { items: cached, fromCache: true };
        throw err;
      }
    },
    refetchInterval: 30_000,
    networkMode: 'always',
  });
}

export function useAuditReport(id: string | null) {
  return useQuery({
    queryKey: qk.audit(id ?? ''),
    queryFn: () => api.getAuditReport(id!),
    enabled: !!id,
    retry: false,
  });
}
