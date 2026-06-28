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

// HF-283 A1.1: platform alias set lives in resolve-identity.ts (single declaration).
// Used only inside resolveRole (call-time) — no module-init cycle.
import { PLATFORM_ROLE_VALUES } from '@/lib/auth/resolve-identity';
import { PRISM_FEATURE_KEY } from '@/lib/prism/capability'; // OB-250: the single canonical feature key

// =============================================================================
// TYPES
// =============================================================================

export type Role = 'platform' | 'admin' | 'manager' | 'member' | 'viewer' | 'cda';

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
  | 'data.upload' // OB-247 DS-032: Customer Data Administrator — deliver a file via the focused portal
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
  | 'view.own_uploads' // OB-247 DS-032: CDA sees only their own deliveries
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

export const CANONICAL_ROLES: readonly Role[] = ['platform', 'admin', 'manager', 'member', 'viewer', 'cda'] as const;

// =============================================================================
// ROLE ALIAS RESOLUTION
// =============================================================================

// HF-283 A1.1: platform aliases DERIVE from PLATFORM_ROLE_VALUES (the single
// canonical platform declaration in resolve-identity.ts, paired with the DB
// predicate public.is_platform()). Non-platform aliases stay here. Both modules
// reference the other only at call-time (resolveRole below; resolveIdentity in
// resolve-identity.ts) so there is no module-init cycle.
const NON_PLATFORM_ALIASES: Record<string, Role> = {
  'admin': 'admin',
  'tenant_admin': 'admin',
  'manager': 'manager',
  'member': 'member',
  'individual': 'member',
  'sales_rep': 'member',
  'viewer': 'viewer',
  'cda': 'cda', // OB-247: Customer Data Administrator (canonical, so resolveRole/MFA/provision accept it)
};

/**
 * Resolve any role string (including retired aliases) to a canonical Role.
 * Returns null for unknown roles. Platform aliases ('platform','vl_admin')
 * derive from PLATFORM_ROLE_VALUES.
 */
export function resolveRole(role: string): Role | null {
  if ((PLATFORM_ROLE_VALUES as readonly string[]).includes(role)) return 'platform';
  return NON_PLATFORM_ALIASES[role] ?? null;
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
    'data.upload', // OB-247 R2: canonical membrane-delivery capability (operator + CDA share it)
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
    'data.upload', // OB-247 R2: canonical membrane-delivery capability (operator + CDA share it)
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

  // OB-247 DS-032 Slice A — Customer Data Administrator. A customer-side user whose
  // ONLY job is to deliver data: the focused upload portal + their own deliveries.
  // Deliberately minimal (DS-014 "if you can't use it, you can't see it") — no
  // operator capabilities, so their nav/landing fall out near-empty by the rule.
  cda: new Set<Capability>([
    'data.upload',
    'view.own_uploads',
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
// OB-204 A.1 — CAPABILITY DERIVATION SEAM (single source for the writer)
// =============================================================================

/**
 * OB-204 A.1 / DS-028 §1.2 — derive a role's capabilities as a JSONB-array-ready
 * `string[]`, drawn EXACTLY from the DS-014 §4 matrix encoded in ROLE_CAPABILITIES
 * above. This is THE seam: the single writer (provision-user) and any future
 * per-tenant override layer call this — `profiles.capabilities` is NEVER authored
 * by hand, never an object, never free text (closes the OB-204 defect class).
 *
 * DS-028 §1.2 governs the contents: "derivation follows the matrix, not intuition"
 * — the output is `Array.from(getCapabilities(role))`, the matrix verbatim, not a
 * hand-curated list. Sorted so persisted rows are deterministic (stable diffs,
 * idempotent normalization). Structural vocabulary only (Korean Test): the strings
 * are the PDP's typed `Capability` union, never language/domain literals.
 */
export function deriveCapabilities(role: Role): string[] {
  return Array.from(getCapabilities(role)).sort();
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
  '/portal': 'data.upload', // OB-247: the CDA focused portal (middleware workspace gate)
  '/stream': 'view.intelligence_stream', // OB-247: keep the CDA (no operator caps) out of the Intelligence Stream by direct URL (Invariant 7). All operator roles hold this cap.
  '/financial': 'view.team_results',
  '/approvals': 'data.approve_results', // OB-246: gate the approver hub at middleware too (defense-in-depth)
};

// =============================================================================
// OB-250 — WORKSPACE → TENANT-FEATURE MAPPING (the SERVER-SIDE second gate)
// =============================================================================

/**
 * Exact PRISM page prefixes that require a TENANT feature (prism_enabled) IN ADDITION to the
 * capability gate above — the server-side half of the two-gate, enforced in middleware so the
 * off-state cannot be reached by deep link (SR-39 / I2). EXACT subpaths ONLY: never the bare
 * `/data` or `/operate` prefix, which hold surfaces that MUST stay reachable when PRISM is off —
 * `/data/transactions` (I5 committed-data view) and `/operate/import` (I6 local import). The
 * feature literal is the canonical PRISM_FEATURE_KEY (imported below).
 */
export const WORKSPACE_FEATURES: ReadonlyArray<{ prefix: string; feature: string }> = [
  { prefix: '/data/submit', feature: PRISM_FEATURE_KEY },
  { prefix: '/data/in-progress', feature: PRISM_FEATURE_KEY },
  { prefix: '/data-operations', feature: PRISM_FEATURE_KEY },
  // OB-252 Phase 3: the licensable Finance agent — server-side deep-link gate (it was previously only
  // nav-hidden). The whole /financial subtree is Finance-exclusive, so gating the prefix is safe; a
  // non-Finance tenant cannot reach any /financial route by direct URL. Default-OFF (DEFAULT_FEATURES
  // .financial=false) so existing non-Finance tenants are byte-identical.
  { prefix: '/financial', feature: 'financial' },

  // OB-252 Phase 3 (review closure): server-side deep-link gates for the two DEFAULT-ON agents, using
  // the DEDICATED entitlement keys (Compensation='compensation_enabled', Intelligence=
  // 'intelligence_enabled' — NOT the billing keys), so the Observatory toggle is enforced server-side,
  // not menu/UI only. The feature read is default-on aware (isFeatureEnabled → DEFAULT_FEATURES = true),
  // so a tenant with no explicit key is allowed (byte-identical for every existing tenant); only an
  // explicit toggle-OFF blocks. ONLY the agent-EXCLUSIVE exec sub-paths are listed — NEVER the bare
  // /operate (shares /operate/import, I6 local import must stay reachable), NEVER /stream (the
  // universal landing, Decision 128), NEVER bare /perform or /configure. Longest-prefix match keeps
  // /operate/import → null. The engine API handlers (/api/calculation/*) are intentionally NOT gated
  // here (HALT-CALC: no feature check is added inside the calc path; resolveCallerTenant already binds
  // them to the caller's own tenant — no cross-tenant exposure).
  { prefix: '/operate/calculate', feature: 'compensation_enabled' },
  { prefix: '/operate/reconciliation', feature: 'compensation_enabled' },
  { prefix: '/operate/results', feature: 'compensation_enabled' },
  { prefix: '/operate/pay', feature: 'compensation_enabled' },
  { prefix: '/operate/lifecycle', feature: 'compensation_enabled' },
  { prefix: '/approvals', feature: 'compensation_enabled' },
  { prefix: '/performance/adjustments', feature: 'compensation_enabled' },
  { prefix: '/configure/plans', feature: 'compensation_enabled' },
  { prefix: '/insights', feature: 'intelligence_enabled' },
  { prefix: '/acceleration', feature: 'intelligence_enabled' },
];

/** The tenant feature a path requires (longest exact-prefix match), or null. Boundary-safe:
 *  only matches the exact path or a child path (never `/data/submitXYZ`). */
export function requiredFeatureForPath(pathname: string): string | null {
  const match = WORKSPACE_FEATURES
    .filter(w => pathname === w.prefix || pathname.startsWith(w.prefix + '/'))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match ? match.feature : null;
}

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
