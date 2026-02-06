/**
 * Authentication Types - Entity B SPM Platform
 */

export type UserRole = 'cc_admin' | 'admin' | 'manager' | 'sales_rep';

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
  role: Exclude<UserRole, 'cc_admin'>;
  tenantId: string;
  teamId?: string;
  regionId?: string;
  storeId?: string;
  managerId?: string;
  permissions: string[];
  dataAccessLevel: 'own' | 'team' | 'region' | 'all';
  meseroId?: number; // Links to mesero record for hospitality tenants
}

export interface CCAdminUser extends BaseUser {
  role: 'cc_admin';
  tenantId: null;
  accessLevel: 'full' | 'readonly';
  department?: string;
}

export type User = TenantUser | CCAdminUser;

export function isCCAdmin(user: User): user is CCAdminUser {
  return user.role === 'cc_admin';
}

export function isTenantUser(user: User): user is TenantUser {
  return user.role !== 'cc_admin';
}

export function getUserDisplayRole(user: User): string {
  switch (user.role) {
    case 'cc_admin':
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
