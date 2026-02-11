/**
 * Authentication Types - ViaLuce SPM Platform
 */

export type UserRole = 'vl_admin' | 'admin' | 'manager' | 'sales_rep';

export interface BaseUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: string;
  lastLoginAt?: string;
  status: 'active' | 'inactive';
}

export interface TenantUser extends BaseUser {
  role: Exclude<UserRole, 'vl_admin'>;
  tenantId: string;
  teamId?: string;
  regionId?: string;
  storeId?: string;
  managerId?: string;
  permissions: string[];
  dataAccessLevel: 'own' | 'team' | 'region' | 'all';
  meseroId?: number; // Links to mesero record for hospitality tenants
}

export interface VLAdminUser extends BaseUser {
  role: 'vl_admin';
  tenantId: null;
  accessLevel: 'full' | 'readonly';
  department?: string;
}

export type User = TenantUser | VLAdminUser;

// Backward compatibility alias
export type CCAdminUser = VLAdminUser;

export function isVLAdmin(user: User): user is VLAdminUser {
  return user.role === 'vl_admin';
}

// Backward compatibility alias
export const isCCAdmin = isVLAdmin;

export function isTenantUser(user: User): user is TenantUser {
  return user.role !== 'vl_admin';
}

export function getUserDisplayRole(user: User): string {
  switch (user.role) {
    case 'vl_admin':
      return 'Platform Administrator';
    case 'admin':
      return 'Administrator';
    case 'manager':
      return 'Manager';
    case 'sales_rep':
      return 'Sales Representative';
    default:
      return 'User';
  }
}
