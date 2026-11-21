import type { Role } from '../types';

/**
 * Frontend RBAC: decides what each role can see.
 * The backend must enforce the same rules; this is only so the UI never offers forbidden actions.
 */
export const permissions = {
  viewDispatch: ['admin', 'dispatcher'],
  createShipment: ['admin', 'dispatcher'],
  acknowledgeAlert: ['admin', 'dispatcher'],
  driverApp: ['admin', 'driver'],
  receiveDelivery: ['admin', 'clinic_receiver'],
  viewAudit: ['admin', 'dispatcher', 'auditor'],
  viewSettings: ['admin', 'dispatcher', 'auditor'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof permissions;

export function can(role: Role | undefined, perm: Permission): boolean {
  return !!role && (permissions[perm] as readonly Role[]).includes(role);
}

export const homeFor: Record<Role, string> = {
  admin: '/overview',
  dispatcher: '/overview',
  driver: '/driver',
  clinic_receiver: '/receive',
  auditor: '/compliance',
};

export const roleLabel: Record<Role, string> = {
  admin: 'Administrator',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
  clinic_receiver: 'Clinic Receiver',
  auditor: 'External Auditor',
};
