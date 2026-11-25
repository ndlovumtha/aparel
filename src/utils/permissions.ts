import {
  ALL_STAFF_PERMISSIONS,
  SessionAccount,
  StaffPermission,
} from '../types/store';

export function hasOpsPermission(
  account: SessionAccount | null,
  isFirebaseAdmin: boolean,
  permission: StaffPermission
): boolean {
  if (isFirebaseAdmin) return true;
  if (!account) return false;
  if (account.role === 'superuser') return true;
  if (account.role === 'staff') {
    return Array.isArray(account.permissions) && account.permissions.includes(permission);
  }
  return false;
}

export function hasAnyOpsPermission(
  account: SessionAccount | null,
  isFirebaseAdmin: boolean,
  permissions: StaffPermission[] = ALL_STAFF_PERMISSIONS
): boolean {
  if (isFirebaseAdmin) return true;
  if (!account) return false;
  if (account.role === 'superuser') return true;
  if (account.role === 'staff') {
    const granted = Array.isArray(account.permissions) ? account.permissions : [];
    return permissions.some((p) => granted.includes(p));
  }
  return false;
}
