/**
 * RBAC Service
 *
 * Manages roles, permissions, and audit logging.
 */

import type {
  Permission,
  Role,
  UserRoleAssignment,
  AuditLogEntry,
  AuditFilter,
  AuditAction,
  PermissionCategory,
  PermissionAction,
} from '@/types/rbac';

const ROLES_STORAGE_KEY = 'rbac_roles';
const ASSIGNMENTS_STORAGE_KEY = 'rbac_assignments';
const AUDIT_STORAGE_KEY = 'rbac_audit_log';

// ============================================
// PERMISSIONS
// ============================================

/**
 * Get all available permissions
 */
export function getAllPermissions(): Permission[] {
  return getDefaultPermissions();
}

/**
 * Get permissions by category
 */
export function getPermissionsByCategory(category: PermissionCategory): Permission[] {
  return getAllPermissions().filter((p) => p.category === category);
}

/**
 * Get a permission by ID
 */
export function getPermission(permissionId: string): Permission | null {
  return getAllPermissions().find((p) => p.id === permissionId) || null;
}

// ============================================
// ROLES
// ============================================

/**
 * Get all roles
 */
export function getAllRoles(): Role[] {
  if (typeof window === 'undefined') return getDefaultRoles();

  const stored = localStorage.getItem(ROLES_STORAGE_KEY);
  if (!stored) {
    const defaults = getDefaultRoles();
    localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Get roles for a tenant
 */
export function getRoles(tenantId: string): Role[] {
  return getAllRoles()
    .filter((r) => r.tenantId === tenantId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get a role by ID
 */
export function getRole(roleId: string): Role | null {
  return getAllRoles().find((r) => r.id === roleId) || null;
}

/**
 * Create a new role
 */
export function createRole(
  tenantId: string,
  name: string,
  description: string,
  permissions: string[],
  createdBy: string
): Role {
  const now = new Date().toISOString();

  const role: Role = {
    id: `role-${Date.now()}`,
    tenantId,
    name,
    nameEs: name, // In real app, would translate
    description,
    descriptionEs: description,
    permissions,
    isSystem: false,
    userCount: 0,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  const roles = getAllRoles();
  roles.push(role);
  saveRoles(roles);

  // Log audit event
  logAuditEvent(tenantId, createdBy, 'create', 'admin', 'role', role.id, role.name, {
    permissions,
  });

  return role;
}

/**
 * Update a role
 */
export function updateRole(
  roleId: string,
  updates: Partial<Pick<Role, 'name' | 'description' | 'permissions'>>,
  updatedBy: string
): Role | null {
  const roles = getAllRoles();
  const index = roles.findIndex((r) => r.id === roleId);

  if (index < 0) return null;

  const role = roles[index];
  if (role.isSystem) {
    // Can only update permissions on system roles
    if (updates.name || updates.description) {
      return null;
    }
  }

  const updated: Role = {
    ...role,
    ...updates,
    nameEs: updates.name || role.nameEs,
    descriptionEs: updates.description || role.descriptionEs,
    updatedAt: new Date().toISOString(),
  };

  roles[index] = updated;
  saveRoles(roles);

  // Log audit event
  logAuditEvent(role.tenantId, updatedBy, 'permission_change', 'admin', 'role', role.id, role.name, {
    previousPermissions: role.permissions,
    newPermissions: updated.permissions,
  });

  return updated;
}

/**
 * Delete a role
 */
export function deleteRole(roleId: string, deletedBy: string): boolean {
  const roles = getAllRoles();
  const role = roles.find((r) => r.id === roleId);

  if (!role || role.isSystem) return false;

  const filtered = roles.filter((r) => r.id !== roleId);
  saveRoles(filtered);

  // Log audit event
  logAuditEvent(role.tenantId, deletedBy, 'delete', 'admin', 'role', role.id, role.name, {});

  return true;
}

// ============================================
// USER ROLE ASSIGNMENTS
// ============================================

/**
 * Get all user role assignments
 */
export function getAllAssignments(): UserRoleAssignment[] {
  if (typeof window === 'undefined') return getDefaultAssignments();

  const stored = localStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
  if (!stored) {
    const defaults = getDefaultAssignments();
    localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Get assignments for a role
 */
export function getAssignmentsForRole(roleId: string): UserRoleAssignment[] {
  return getAllAssignments().filter((a) => a.roleId === roleId);
}

/**
 * Get assignments for a user
 */
export function getAssignmentsForUser(userId: string): UserRoleAssignment[] {
  return getAllAssignments().filter((a) => a.userId === userId);
}

/**
 * Assign a role to a user
 */
export function assignRole(
  userId: string,
  userName: string,
  userEmail: string,
  roleId: string,
  assignedBy: string,
  tenantId: string
): UserRoleAssignment | null {
  const role = getRole(roleId);
  if (!role) return null;

  // Check if already assigned
  const existing = getAllAssignments().find(
    (a) => a.userId === userId && a.roleId === roleId
  );
  if (existing) return existing;

  const assignment: UserRoleAssignment = {
    userId,
    userName,
    userEmail,
    roleId,
    roleName: role.name,
    assignedBy,
    assignedAt: new Date().toISOString(),
  };

  const assignments = getAllAssignments();
  assignments.push(assignment);
  saveAssignments(assignments);

  // Update role user count
  updateRoleUserCount(roleId);

  // Log audit event
  logAuditEvent(tenantId, assignedBy, 'role_assign', 'admin', 'user', userId, userName, {
    roleId,
    roleName: role.name,
  });

  return assignment;
}

/**
 * Revoke a role from a user
 */
export function revokeRole(
  userId: string,
  roleId: string,
  revokedBy: string,
  tenantId: string
): boolean {
  const assignments = getAllAssignments();
  const assignment = assignments.find(
    (a) => a.userId === userId && a.roleId === roleId
  );

  if (!assignment) return false;

  const filtered = assignments.filter(
    (a) => !(a.userId === userId && a.roleId === roleId)
  );
  saveAssignments(filtered);

  // Update role user count
  updateRoleUserCount(roleId);

  // Log audit event
  logAuditEvent(tenantId, revokedBy, 'role_revoke', 'admin', 'user', userId, assignment.userName, {
    roleId,
    roleName: assignment.roleName,
  });

  return true;
}

function updateRoleUserCount(roleId: string): void {
  const count = getAssignmentsForRole(roleId).length;
  const roles = getAllRoles();
  const index = roles.findIndex((r) => r.id === roleId);

  if (index >= 0) {
    roles[index] = { ...roles[index], userCount: count };
    saveRoles(roles);
  }
}

// ============================================
// AUDIT LOG
// ============================================

/**
 * Get audit log entries
 */
export function getAuditLog(tenantId: string, filter?: AuditFilter): AuditLogEntry[] {
  const all = getAllAuditLogs().filter((e) => e.tenantId === tenantId);

  let filtered = all;

  if (filter?.startDate) {
    filtered = filtered.filter((e) => e.timestamp >= filter.startDate!);
  }
  if (filter?.endDate) {
    filtered = filtered.filter((e) => e.timestamp <= filter.endDate!);
  }
  if (filter?.userId) {
    filtered = filtered.filter((e) => e.userId === filter.userId);
  }
  if (filter?.action) {
    filtered = filtered.filter((e) => e.action === filter.action);
  }
  if (filter?.category) {
    filtered = filtered.filter((e) => e.category === filter.category);
  }
  if (filter?.resourceId) {
    filtered = filtered.filter((e) => e.resourceId === filter.resourceId);
  }

  return filtered.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/**
 * Log an audit event
 */
export function logAuditEvent(
  tenantId: string,
  userId: string,
  action: AuditAction,
  category: PermissionCategory,
  resource: string,
  resourceId?: string,
  resourceName?: string,
  details: Record<string, unknown> = {}
): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tenantId,
    timestamp: new Date().toISOString(),
    userId,
    userName: userId, // In real app, would look up user name
    action,
    category,
    resource,
    resourceId,
    resourceName,
    details,
  };

  const logs = getAllAuditLogs();
  logs.push(entry);

  // Keep only last 1000 entries
  const trimmed = logs.slice(-1000);
  saveAuditLogs(trimmed);

  return entry;
}

function getAllAuditLogs(): AuditLogEntry[] {
  if (typeof window === 'undefined') return getDefaultAuditLogs();

  const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
  if (!stored) {
    const defaults = getDefaultAuditLogs();
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

// ============================================
// PERMISSION CHECK
// ============================================

/**
 * Check if a user has a specific permission
 */
export function hasPermission(
  userId: string,
  category: PermissionCategory,
  action: PermissionAction,
  resource?: string
): boolean {
  const assignments = getAssignmentsForUser(userId);
  const roleIds = assignments.map((a) => a.roleId);

  for (const roleId of roleIds) {
    const role = getRole(roleId);
    if (!role) continue;

    for (const permissionId of role.permissions) {
      const permission = getPermission(permissionId);
      if (!permission) continue;

      if (
        permission.category === category &&
        permission.action === action &&
        (!resource || permission.resource === resource || permission.resource === '*')
      ) {
        return true;
      }
    }
  }

  return false;
}

// ============================================
// HELPERS
// ============================================

function saveRoles(roles: Role[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(roles));
  }
}

function saveAssignments(assignments: UserRoleAssignment[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments));
  }
}

function saveAuditLogs(logs: AuditLogEntry[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
  }
}

// ============================================
// DEFAULT DATA
// ============================================

function getDefaultPermissions(): Permission[] {
  const permissions: Permission[] = [];
  const categories: PermissionCategory[] = [
    'transactions',
    'compensation',
    'performance',
    'workforce',
    'data',
    'insights',
    'configuration',
    'admin',
  ];
  const actions: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'approve', 'export'];

  const resources: Record<PermissionCategory, string[]> = {
    transactions: ['orders', 'disputes', 'inquiries'],
    compensation: ['plans', 'payouts', 'statements'],
    performance: ['goals', 'scenarios', 'approvals'],
    workforce: ['personnel', 'teams', 'roles'],
    data: ['imports', 'quality', 'readiness'],
    insights: ['reports', 'analytics', 'trends'],
    configuration: ['settings', 'terminology', 'locations'],
    admin: ['users', 'roles', 'audit'],
  };

  for (const category of categories) {
    for (const resource of resources[category]) {
      for (const action of actions) {
        permissions.push({
          id: `perm-${category}-${resource}-${action}`,
          category,
          action,
          resource,
          name: `${action.charAt(0).toUpperCase() + action.slice(1)} ${resource}`,
          nameEs: `${getActionNameEs(action)} ${resource}`,
          description: `Can ${action} ${resource}`,
          descriptionEs: `Puede ${getActionNameEs(action).toLowerCase()} ${resource}`,
        });
      }
    }
  }

  return permissions;
}

function getActionNameEs(action: PermissionAction): string {
  const map: Record<PermissionAction, string> = {
    view: 'Ver',
    create: 'Crear',
    edit: 'Editar',
    delete: 'Eliminar',
    approve: 'Aprobar',
    export: 'Exportar',
  };
  return map[action];
}

function getDefaultRoles(): Role[] {
  const now = new Date().toISOString();
  const allPermissions = getDefaultPermissions();

  return [
    {
      id: 'role-admin',
      tenantId: 'retailco',
      name: 'Administrator',
      nameEs: 'Administrador',
      description: 'Full system access',
      descriptionEs: 'Acceso completo al sistema',
      permissions: allPermissions.map((p) => p.id),
      isSystem: true,
      userCount: 2,
      createdBy: 'system',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'role-manager',
      tenantId: 'retailco',
      name: 'Sales Manager',
      nameEs: 'Gerente de Ventas',
      description: 'Manage team performance and approvals',
      descriptionEs: 'Gestionar rendimiento del equipo y aprobaciones',
      permissions: allPermissions
        .filter(
          (p) =>
            ['transactions', 'performance', 'insights'].includes(p.category) ||
            (p.category === 'workforce' && p.action === 'view')
        )
        .map((p) => p.id),
      isSystem: true,
      userCount: 5,
      createdBy: 'system',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'role-rep',
      tenantId: 'retailco',
      name: 'Sales Representative',
      nameEs: 'Representante de Ventas',
      description: 'View own transactions and performance',
      descriptionEs: 'Ver transacciones y rendimiento propio',
      permissions: allPermissions
        .filter(
          (p) =>
            p.action === 'view' &&
            ['transactions', 'compensation', 'performance'].includes(p.category)
        )
        .map((p) => p.id),
      isSystem: true,
      userCount: 25,
      createdBy: 'system',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'role-analyst',
      tenantId: 'retailco',
      name: 'Compensation Analyst',
      nameEs: 'Analista de Compensación',
      description: 'Manage compensation plans and scenarios',
      descriptionEs: 'Gestionar planes de compensación y escenarios',
      permissions: allPermissions
        .filter(
          (p) =>
            ['compensation', 'performance', 'insights', 'data'].includes(p.category) &&
            p.action !== 'delete'
        )
        .map((p) => p.id),
      isSystem: false,
      userCount: 3,
      createdBy: 'admin',
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function getDefaultAssignments(): UserRoleAssignment[] {
  const now = new Date().toISOString();
  return [
    {
      userId: 'user-admin',
      userName: 'System Admin',
      userEmail: 'admin@retailco.com',
      roleId: 'role-admin',
      roleName: 'Administrator',
      assignedBy: 'system',
      assignedAt: now,
    },
    {
      userId: 'sarah-chen',
      userName: 'Sarah Chen',
      userEmail: 'sarah.chen@retailco.com',
      roleId: 'role-manager',
      roleName: 'Sales Manager',
      assignedBy: 'system',
      assignedAt: now,
    },
    {
      userId: 'maria-rodriguez',
      userName: 'Maria Rodriguez',
      userEmail: 'maria.rodriguez@retailco.com',
      roleId: 'role-rep',
      roleName: 'Sales Representative',
      assignedBy: 'system',
      assignedAt: now,
    },
    {
      userId: 'finance-team',
      userName: 'Finance Team',
      userEmail: 'finance@retailco.com',
      roleId: 'role-analyst',
      roleName: 'Compensation Analyst',
      assignedBy: 'system',
      assignedAt: now,
    },
  ];
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function getDefaultAuditLogs(): AuditLogEntry[] {
  return [
    {
      id: 'audit-1',
      tenantId: 'retailco',
      timestamp: daysAgo(0),
      userId: 'sarah-chen',
      userName: 'Sarah Chen',
      action: 'approve',
      category: 'compensation',
      resource: 'payout',
      resourceId: 'payout-001',
      resourceName: 'January 2024 Payout',
      details: { amount: 12500, entityCount: 15 },
    },
    {
      id: 'audit-2',
      tenantId: 'retailco',
      timestamp: daysAgo(1),
      userId: 'admin',
      userName: 'System Admin',
      action: 'role_assign',
      category: 'admin',
      resource: 'role',
      resourceId: 'role-analyst',
      resourceName: 'Compensation Analyst',
      details: { userId: 'new-user', userName: 'New User' },
    },
    {
      id: 'audit-3',
      tenantId: 'retailco',
      timestamp: daysAgo(2),
      userId: 'finance-team',
      userName: 'Finance Team',
      action: 'update',
      category: 'compensation',
      resource: 'plan',
      resourceId: 'plan-optivision',
      resourceName: 'OptiVision Sales Plan',
      details: { field: 'commission_rate', oldValue: 5, newValue: 6 },
    },
    {
      id: 'audit-4',
      tenantId: 'retailco',
      timestamp: daysAgo(3),
      userId: 'maria-rodriguez',
      userName: 'Maria Rodriguez',
      action: 'create',
      category: 'transactions',
      resource: 'dispute',
      resourceId: 'dispute-123',
      resourceName: 'Commission Dispute',
      details: { reason: 'Missing transaction', amount: 250 },
    },
    {
      id: 'audit-5',
      tenantId: 'retailco',
      timestamp: daysAgo(4),
      userId: 'admin',
      userName: 'System Admin',
      action: 'export',
      category: 'insights',
      resource: 'report',
      resourceId: 'report-monthly',
      resourceName: 'Monthly Performance Report',
      details: { format: 'xlsx', recordCount: 150 },
    },
  ];
}

/**
 * Initialize RBAC data
 */
export function initializeRBAC(): void {
  if (typeof window === 'undefined') return;

  if (!localStorage.getItem(ROLES_STORAGE_KEY)) {
    localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(getDefaultRoles()));
  }
  if (!localStorage.getItem(ASSIGNMENTS_STORAGE_KEY)) {
    localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(getDefaultAssignments()));
  }
  if (!localStorage.getItem(AUDIT_STORAGE_KEY)) {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(getDefaultAuditLogs()));
  }
}

/**
 * Reset RBAC data to defaults
 */
export function resetRBAC(): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(getDefaultRoles()));
  localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(getDefaultAssignments()));
  localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(getDefaultAuditLogs()));
}
