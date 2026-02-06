/**
 * Permission Service
 *
 * Manages roles, permissions, and user permission assignments.
 * Uses localStorage for demo persistence.
 */

import type {
  Permission,
  Role,
  UserPermissionAssignment,
  EffectivePermissions,
  PermissionScope,
  PermissionCheckResult,
} from '@/types/permission';
import { createSystemRolesForTenant } from './role-templates';

const ROLES_STORAGE_KEY = 'spm_roles';
const ASSIGNMENTS_STORAGE_KEY = 'spm_permission_assignments';

// ============================================
// ROLE MANAGEMENT
// ============================================

/**
 * Get all roles for a tenant
 */
export function getRoles(tenantId: string): Role[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(ROLES_STORAGE_KEY);
  if (!stored) {
    // Initialize with system roles
    const systemRoles = createSystemRolesForTenant(tenantId);
    localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(systemRoles));
    return systemRoles;
  }

  try {
    const allRoles: Role[] = JSON.parse(stored);
    const tenantRoles = allRoles.filter((r) => r.tenantId === tenantId);

    // Ensure system roles exist
    if (!tenantRoles.some((r) => r.isSystem)) {
      const systemRoles = createSystemRolesForTenant(tenantId);
      const combined = [...allRoles, ...systemRoles];
      localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(combined));
      return systemRoles;
    }

    return tenantRoles;
  } catch {
    return [];
  }
}

/**
 * Get a single role by ID
 */
export function getRole(roleId: string): Role | null {
  const allRoles = getAllRolesInternal();
  return allRoles.find((r) => r.id === roleId) || null;
}

/**
 * Create a new role
 */
export function createRole(
  tenantId: string,
  data: {
    name: string;
    nameEs: string;
    description: string;
    descriptionEs: string;
    permissions: Permission[];
    defaultScope: PermissionScope;
  },
  createdBy: string
): Role {
  const now = new Date().toISOString();
  const role: Role = {
    id: `role-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    tenantId,
    name: data.name,
    nameEs: data.nameEs,
    description: data.description,
    descriptionEs: data.descriptionEs,
    isSystem: false,
    permissions: data.permissions,
    defaultScope: data.defaultScope,
    createdAt: now,
    updatedAt: now,
    createdBy,
  };

  const allRoles = getAllRolesInternal();
  allRoles.push(role);

  if (typeof window !== 'undefined') {
    localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(allRoles));
  }

  return role;
}

/**
 * Update a role
 */
export function updateRole(
  roleId: string,
  updates: Partial<Omit<Role, 'id' | 'tenantId' | 'isSystem' | 'createdAt'>>
): Role | null {
  const allRoles = getAllRolesInternal();
  const index = allRoles.findIndex((r) => r.id === roleId);

  if (index < 0) return null;

  const role = allRoles[index];

  // Cannot modify system roles' core properties
  if (role.isSystem && (updates.permissions || updates.defaultScope)) {
    console.warn('Cannot modify system role permissions');
    return null;
  }

  const updated: Role = {
    ...role,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  allRoles[index] = updated;

  if (typeof window !== 'undefined') {
    localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(allRoles));
  }

  return updated;
}

/**
 * Delete a role (custom roles only)
 */
export function deleteRole(roleId: string): boolean {
  const allRoles = getAllRolesInternal();
  const role = allRoles.find((r) => r.id === roleId);

  if (!role || role.isSystem) {
    console.warn('Cannot delete system role');
    return false;
  }

  const filtered = allRoles.filter((r) => r.id !== roleId);

  if (typeof window !== 'undefined') {
    localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(filtered));
  }

  return true;
}

// ============================================
// USER PERMISSION ASSIGNMENTS
// ============================================

/**
 * Get all permission assignments for a tenant
 */
export function getAssignments(tenantId: string): UserPermissionAssignment[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
  if (!stored) return [];

  try {
    const allAssignments: UserPermissionAssignment[] = JSON.parse(stored);
    // Filter by tenant via role lookup
    return allAssignments.filter((a) => {
      const role = getRole(a.roleId);
      return role?.tenantId === tenantId;
    });
  } catch {
    return [];
  }
}

/**
 * Get permission assignment for a user
 */
export function getUserAssignment(userId: string): UserPermissionAssignment | null {
  const allAssignments = getAllAssignmentsInternal();
  return allAssignments.find((a) => a.userId === userId) || null;
}

/**
 * Assign a role to a user
 */
export function assignRole(
  userId: string,
  userName: string,
  userEmail: string,
  roleId: string,
  scope: PermissionScope,
  assignedBy: string,
  customPermissions?: Permission[],
  deniedPermissions?: Permission[]
): UserPermissionAssignment {
  const role = getRole(roleId);
  if (!role) throw new Error(`Role not found: ${roleId}`);

  const now = new Date().toISOString();
  const assignment: UserPermissionAssignment = {
    id: `assign-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    userId,
    userName,
    userEmail,
    roleId,
    roleName: role.name,
    scope,
    customPermissions,
    deniedPermissions,
    effectiveFrom: now,
    assignedBy,
    assignedAt: now,
  };

  const allAssignments = getAllAssignmentsInternal();

  // Remove existing assignment for this user
  const filtered = allAssignments.filter((a) => a.userId !== userId);
  filtered.push(assignment);

  if (typeof window !== 'undefined') {
    localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(filtered));
  }

  return assignment;
}

/**
 * Update a user's permission assignment
 */
export function updateAssignment(
  userId: string,
  updates: Partial<
    Pick<
      UserPermissionAssignment,
      'roleId' | 'scope' | 'customPermissions' | 'deniedPermissions' | 'effectiveUntil'
    >
  >
): UserPermissionAssignment | null {
  const allAssignments = getAllAssignmentsInternal();
  const index = allAssignments.findIndex((a) => a.userId === userId);

  if (index < 0) return null;

  const updated: UserPermissionAssignment = {
    ...allAssignments[index],
    ...updates,
  };

  // Update role name if role changed
  if (updates.roleId) {
    const role = getRole(updates.roleId);
    if (role) {
      updated.roleName = role.name;
    }
  }

  allAssignments[index] = updated;

  if (typeof window !== 'undefined') {
    localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(allAssignments));
  }

  return updated;
}

/**
 * Remove a user's permission assignment
 */
export function removeAssignment(userId: string): boolean {
  const allAssignments = getAllAssignmentsInternal();
  const filtered = allAssignments.filter((a) => a.userId !== userId);

  if (filtered.length === allAssignments.length) return false;

  if (typeof window !== 'undefined') {
    localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(filtered));
  }

  return true;
}

// ============================================
// EFFECTIVE PERMISSIONS
// ============================================

/**
 * Calculate effective permissions for a user
 */
export function getEffectivePermissions(userId: string): EffectivePermissions | null {
  const assignment = getUserAssignment(userId);
  if (!assignment) return null;

  const role = getRole(assignment.roleId);
  if (!role) return null;

  // Start with role permissions
  let permissions = [...role.permissions];

  // Add custom permissions
  if (assignment.customPermissions) {
    const combined = [...permissions, ...assignment.customPermissions];
    permissions = Array.from(new Set(combined));
  }

  // Remove denied permissions
  if (assignment.deniedPermissions) {
    permissions = permissions.filter((p) => !assignment.deniedPermissions?.includes(p));
  }

  return {
    userId,
    permissions,
    scope: assignment.scope,
    roleId: role.id,
    roleName: role.name,
    customPermissions: assignment.customPermissions || [],
    deniedPermissions: assignment.deniedPermissions || [],
  };
}

/**
 * Check if a user has a specific permission
 */
export function hasPermission(userId: string, permission: Permission): PermissionCheckResult {
  const effective = getEffectivePermissions(userId);

  if (!effective) {
    return {
      allowed: false,
      permission,
      scope: { type: 'own' },
      reason: 'No permission assignment found',
    };
  }

  const allowed = effective.permissions.includes(permission);

  return {
    allowed,
    permission,
    scope: effective.scope,
    reason: allowed ? undefined : 'Permission not granted',
  };
}

/**
 * Check if a user has any of the specified permissions
 */
export function hasAnyPermission(userId: string, permissions: Permission[]): boolean {
  const effective = getEffectivePermissions(userId);
  if (!effective) return false;

  return permissions.some((p) => effective.permissions.includes(p));
}

/**
 * Check if a user has all of the specified permissions
 */
export function hasAllPermissions(userId: string, permissions: Permission[]): boolean {
  const effective = getEffectivePermissions(userId);
  if (!effective) return false;

  return permissions.every((p) => effective.permissions.includes(p));
}

// ============================================
// HELPERS
// ============================================

function getAllRolesInternal(): Role[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(ROLES_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function getAllAssignmentsInternal(): UserPermissionAssignment[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Initialize permission system for a tenant
 */
export function initializePermissions(tenantId: string): void {
  if (typeof window === 'undefined') return;

  // Ensure roles exist
  getRoles(tenantId);
}

/**
 * Reset all permissions (for demo reset)
 */
export function resetPermissions(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(ROLES_STORAGE_KEY);
  localStorage.removeItem(ASSIGNMENTS_STORAGE_KEY);
}
