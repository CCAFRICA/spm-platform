/**
 * DS-014 Permission Infrastructure — Single Source of Truth
 *
 * All access control in the platform reads from this file.
 * Four enforcement layers:
 *   1. Middleware (workspace routing)
 *   2. RequireCapability component (page-level)
 *   3. useHasCapability hook (inline checks)
 *   4. API route guards
 *
 * NEVER add role checks elsewhere. Import hasCapability from here.
 */

// =============================================================================
// TYPES
// =============================================================================

export type Role = 'platform' | 'admin' | 'manager' | 'member' | 'viewer';

export type Capability =
  // Platform
  | 'platform.provision_tenant'
  | 'platform.view_all_tenants'
  | 'platform.access_observatory'
  | 'platform.system_config'
  // Tenant
  | 'tenant.manage_users'
  | 'tenant.configure_periods'
  | 'tenant.configure_entities'
  | 'tenant.view_settings'
  | 'tenant.edit_settings'
  // Data
  | 'data.import'
  | 'data.upload_storage'
  | 'data.calculate'
  | 'data.advance_lifecycle'
  | 'data.reconcile'
  | 'data.approve_results'
  | 'data.export'
  // View
  | 'view.all_results'
  | 'view.team_results'
  | 'view.own_results'
  | 'view.intelligence_stream'
  | 'view.all_entities'
  | 'view.team_entities'
  | 'view.audit_trail'
  // Dispute
  | 'dispute.submit'
  | 'dispute.resolve'
  // Statement
  | 'statement.view'
  // ICM
  | 'icm.configure_plans'
  | 'icm.view_plan_details'
  | 'icm.simulate';

// =============================================================================
// CANONICAL ROLES
// =============================================================================

export const CANONICAL_ROLES: readonly Role[] = ['platform', 'admin', 'manager', 'member', 'viewer'] as const;

// =============================================================================
// ROLE ALIAS RESOLUTION
// =============================================================================

const ROLE_ALIASES: Record<string, Role> = {
  'platform': 'platform',
  'vl_admin': 'platform',
  'admin': 'admin',
  'tenant_admin': 'admin',
  'manager': 'manager',
  'member': 'member',
  'individual': 'member',
  'sales_rep': 'member',
  'viewer': 'viewer',
};

/**
 * Resolve any role string (including retired aliases) to a canonical Role.
 * Returns null for unknown roles.
 */
export function resolveRole(role: string): Role | null {
  return ROLE_ALIASES[role] ?? null;
}

// =============================================================================
// ROLE → CAPABILITY MATRIX (explicit, no inheritance)
// =============================================================================

const ROLE_CAPABILITIES: Record<Role, Set<Capability>> = {
  platform: new Set<Capability>([
    // Platform
    'platform.provision_tenant',
    'platform.view_all_tenants',
    'platform.access_observatory',
    'platform.system_config',
    // Tenant (platform can do everything)
    'tenant.manage_users',
    'tenant.configure_periods',
    'tenant.configure_entities',
    'tenant.view_settings',
    'tenant.edit_settings',
    // Data
    'data.import',
    'data.upload_storage',
    'data.calculate',
    'data.advance_lifecycle',
    'data.reconcile',
    'data.approve_results',
    'data.export',
    // View
    'view.all_results',
    'view.team_results',
    'view.own_results',
    'view.intelligence_stream',
    'view.all_entities',
    'view.team_entities',
    'view.audit_trail',
    // Dispute
    'dispute.submit',
    'dispute.resolve',
    // Statement
    'statement.view',
    // ICM
    'icm.configure_plans',
    'icm.view_plan_details',
    'icm.simulate',
  ]),

  admin: new Set<Capability>([
    // Tenant
    'tenant.manage_users',
    'tenant.configure_periods',
    'tenant.configure_entities',
    'tenant.view_settings',
    'tenant.edit_settings',
    // Data
    'data.import',
    'data.upload_storage',
    'data.calculate',
    'data.advance_lifecycle',
    'data.reconcile',
    'data.approve_results',
    'data.export',
    // View
    'view.all_results',
    'view.team_results',
    'view.own_results',
    'view.intelligence_stream',
    'view.all_entities',
    'view.team_entities',
    'view.audit_trail',
    // Dispute
    'dispute.submit',
    'dispute.resolve',
    // Statement
    'statement.view',
    // ICM
    'icm.configure_plans',
    'icm.view_plan_details',
    'icm.simulate',
  ]),

  manager: new Set<Capability>([
    // Tenant (limited)
    'tenant.view_settings',
    // Data (limited)
    'data.approve_results',
    // View
    'view.team_results',
    'view.own_results',
    'view.intelligence_stream',
    'view.team_entities',
    // Dispute
    'dispute.submit',
    'dispute.resolve',
    // Statement
    'statement.view',
    // ICM (view only)
    'icm.view_plan_details',
  ]),

  member: new Set<Capability>([
    // View
    'view.own_results',
    'view.intelligence_stream',
    // Dispute
    'dispute.submit',
    // Statement
    'statement.view',
  ]),

  viewer: new Set<Capability>([
    // View (read-only)
    'view.own_results',
    'view.intelligence_stream',
    // Statement
    'statement.view',
  ]),
};

// =============================================================================
// TENANT OVERRIDES (optional per-tenant customization)
// =============================================================================

export interface TenantPermissionOverrides {
  /** Additional capabilities granted to specific roles for this tenant */
  grants?: Partial<Record<Role, Capability[]>>;
  /** Capabilities revoked from specific roles for this tenant */
  revocations?: Partial<Record<Role, Capability[]>>;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Check if a role has a specific capability.
 * Handles role aliases (vl_admin → platform, tenant_admin → admin, etc.)
 * Returns false for unknown roles — never throws.
 */
export function hasCapability(
  role: string,
  capability: Capability,
  tenantOverrides?: TenantPermissionOverrides
): boolean {
  const resolved = resolveRole(role);
  if (!resolved) return false;

  const base = ROLE_CAPABILITIES[resolved];

  if (tenantOverrides) {
    // Check revocations first
    if (tenantOverrides.revocations?.[resolved]?.includes(capability)) {
      return false;
    }
    // Then grants
    if (tenantOverrides.grants?.[resolved]?.includes(capability)) {
      return true;
    }
  }

  return base.has(capability);
}

/**
 * Get all capabilities for a role.
 * Returns empty set for unknown roles — never throws.
 */
export function getCapabilities(
  role: string,
  tenantOverrides?: TenantPermissionOverrides
): Set<Capability> {
  const resolved = resolveRole(role);
  if (!resolved) return new Set();

  const base = new Set(ROLE_CAPABILITIES[resolved]);

  if (tenantOverrides) {
    // Apply revocations
    if (tenantOverrides.revocations?.[resolved]) {
      for (const cap of tenantOverrides.revocations[resolved]) {
        base.delete(cap);
      }
    }
    // Apply grants
    if (tenantOverrides.grants?.[resolved]) {
      for (const cap of tenantOverrides.grants[resolved]) {
        base.add(cap);
      }
    }
  }

  return base;
}

// =============================================================================
// WORKSPACE → CAPABILITY MAPPING (used by middleware)
// =============================================================================

/**
 * Maps workspace path prefixes to the minimum capability required to enter.
 * If a user has ANY capability that matches, they're allowed in.
 */
export const WORKSPACE_CAPABILITIES: Record<string, Capability> = {
  '/admin': 'platform.system_config',
  '/operate': 'data.import',
  '/configure': 'tenant.edit_settings',
  '/configuration': 'tenant.edit_settings',
  '/govern': 'data.approve_results',
  '/data': 'data.import',
  '/financial': 'view.team_results',
};

/**
 * Check if a role can access a workspace path.
 * Uses capability mapping instead of hardcoded role arrays.
 */
export function canAccessWorkspace(role: string, pathname: string): boolean {
  const matchedWorkspace = Object.keys(WORKSPACE_CAPABILITIES)
    .filter(prefix => pathname.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];

  if (!matchedWorkspace) return true; // Unrestricted path
  return hasCapability(role, WORKSPACE_CAPABILITIES[matchedWorkspace]);
}
