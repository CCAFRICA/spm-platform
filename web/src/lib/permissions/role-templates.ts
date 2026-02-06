/**
 * Role Templates
 *
 * Pre-defined system roles for common user types.
 * These can be used as templates for custom roles.
 */

import type { Role, Permission } from '@/types/permission';

// System role templates (without id, tenantId, timestamps)
export interface RoleTemplate {
  name: string;
  nameEs: string;
  description: string;
  descriptionEs: string;
  permissions: Permission[];
  defaultScopeType: 'global' | 'region' | 'team' | 'store' | 'own';
}

export const SYSTEM_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    name: 'Sales Representative',
    nameEs: 'Representante de Ventas',
    description: 'Individual contributor with own-data access',
    descriptionEs: 'Contribuidor individual con acceso a datos propios',
    permissions: [
      'dashboard:view',
      'compensation:view_own',
      'transactions:view_own',
      'disputes:create',
      'disputes:view_own',
      'plans:view',
      'personnel:view_own',
    ],
    defaultScopeType: 'own',
  },
  {
    name: 'Team Manager',
    nameEs: 'Gerente de Equipo',
    description: 'Manages a team with team-level access',
    descriptionEs: 'Gestiona un equipo con acceso a nivel de equipo',
    permissions: [
      'dashboard:view',
      'compensation:view_own',
      'compensation:view_team',
      'transactions:view_own',
      'transactions:view_team',
      'transactions:create',
      'disputes:create',
      'disputes:view_own',
      'disputes:view_team',
      'disputes:resolve',
      'plans:view',
      'scenarios:view',
      'scenarios:create',
      'approvals:view',
      'personnel:view_own',
      'personnel:view_team',
      'personnel:edit',
      'teams:view',
    ],
    defaultScopeType: 'team',
  },
  {
    name: 'Regional Manager',
    nameEs: 'Gerente Regional',
    description: 'Manages multiple teams in a region',
    descriptionEs: 'Gestiona múltiples equipos en una región',
    permissions: [
      'dashboard:view',
      'compensation:view_own',
      'compensation:view_team',
      'compensation:view_all',
      'transactions:view_own',
      'transactions:view_team',
      'transactions:view_all',
      'transactions:create',
      'transactions:edit',
      'disputes:create',
      'disputes:view_own',
      'disputes:view_team',
      'disputes:view_all',
      'disputes:resolve',
      'plans:view',
      'plans:create',
      'scenarios:view',
      'scenarios:create',
      'scenarios:convert',
      'approvals:view',
      'approvals:payout_approve',
      'personnel:view_own',
      'personnel:view_team',
      'personnel:view_all',
      'personnel:edit',
      'personnel:transfer',
      'teams:view',
      'teams:create',
      'teams:edit',
      'data:export',
      'data:quality_view',
    ],
    defaultScopeType: 'region',
  },
  {
    name: 'Finance Analyst',
    nameEs: 'Analista Financiero',
    description: 'View-only access to financial data and reports',
    descriptionEs: 'Acceso de solo lectura a datos financieros y reportes',
    permissions: [
      'dashboard:view',
      'compensation:view_all',
      'transactions:view_all',
      'plans:view',
      'scenarios:view',
      'approvals:view',
      'data:export',
      'data:quality_view',
      'audit:view',
      'audit:export',
    ],
    defaultScopeType: 'global',
  },
  {
    name: 'HR Administrator',
    nameEs: 'Administrador de RH',
    description: 'Manages personnel and team configuration',
    descriptionEs: 'Gestiona personal y configuración de equipos',
    permissions: [
      'dashboard:view',
      'personnel:view_all',
      'personnel:create',
      'personnel:edit',
      'personnel:delete',
      'personnel:transfer',
      'teams:view',
      'teams:create',
      'teams:edit',
      'teams:delete',
      'config:locations',
      'data:import',
      'data:export',
    ],
    defaultScopeType: 'global',
  },
  {
    name: 'Administrator',
    nameEs: 'Administrador',
    description: 'Full tenant administration access',
    descriptionEs: 'Acceso completo de administración del tenant',
    permissions: [
      'dashboard:view',
      'compensation:view_own',
      'compensation:view_team',
      'compensation:view_all',
      'transactions:view_own',
      'transactions:view_team',
      'transactions:view_all',
      'transactions:create',
      'transactions:edit',
      'transactions:delete',
      'disputes:create',
      'disputes:view_own',
      'disputes:view_team',
      'disputes:view_all',
      'disputes:resolve',
      'plans:view',
      'plans:create',
      'plans:edit',
      'plans:delete',
      'plans:approve',
      'scenarios:view',
      'scenarios:create',
      'scenarios:convert',
      'approvals:view',
      'approvals:payout_approve',
      'approvals:plan_approve',
      'personnel:view_own',
      'personnel:view_team',
      'personnel:view_all',
      'personnel:create',
      'personnel:edit',
      'personnel:delete',
      'personnel:transfer',
      'teams:view',
      'teams:create',
      'teams:edit',
      'teams:delete',
      'config:terminology',
      'config:locations',
      'config:integrations',
      'data:import',
      'data:export',
      'data:quality_view',
      'data:quality_resolve',
      'audit:view',
      'audit:export',
      'admin:permissions',
      'admin:roles',
    ],
    defaultScopeType: 'global',
  },
];

/**
 * Create system roles for a tenant
 */
export function createSystemRolesForTenant(tenantId: string): Role[] {
  const now = new Date().toISOString();

  return SYSTEM_ROLE_TEMPLATES.map((template, index) => ({
    id: `role-${tenantId}-system-${index + 1}`,
    tenantId,
    name: template.name,
    nameEs: template.nameEs,
    description: template.description,
    descriptionEs: template.descriptionEs,
    isSystem: true,
    permissions: template.permissions,
    defaultScope: { type: template.defaultScopeType },
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * Get role template by name
 */
export function getRoleTemplate(name: string): RoleTemplate | undefined {
  return SYSTEM_ROLE_TEMPLATES.find(
    (t) => t.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Get permissions for a role level (for migration/upgrade)
 */
export function getPermissionsForRoleLevel(
  level: 'sales_rep' | 'manager' | 'admin'
): Permission[] {
  switch (level) {
    case 'sales_rep':
      return SYSTEM_ROLE_TEMPLATES[0].permissions;
    case 'manager':
      return SYSTEM_ROLE_TEMPLATES[1].permissions;
    case 'admin':
      return SYSTEM_ROLE_TEMPLATES[5].permissions;
    default:
      return [];
  }
}
