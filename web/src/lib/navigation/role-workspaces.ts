/**
 * Role-Based Workspace Configuration — 4 Workspace Model (OB-97)
 *
 * Defines which workspaces are available to each role and their default behaviors.
 * Eliminated workspaces: Investigate → Operate, Design → Configure, Govern → Configure
 */

import type { UserRole } from '@/types/auth';
import type { WorkspaceId } from '@/types/navigation';
import type { PersonaKey } from '@/lib/design/tokens';
import { WORKSPACES, getWorkspaceRoutesForRole } from './workspace-config';

// =============================================================================
// PERSONA → ROLE MAPPING (OB-94)
// =============================================================================

/**
 * Map a PersonaKey to its equivalent UserRole for workspace access checks.
 * This is the SINGLE canonical mapping — all navigation filtering uses this.
 */
export function personaToRole(persona: PersonaKey): UserRole {
  switch (persona) {
    case 'admin': return 'admin';
    case 'manager': return 'manager';
    case 'rep': return 'sales_rep';
  }
}

// =============================================================================
// ROLE WORKSPACE VISIBILITY — 4 WORKSPACE MODEL
// =============================================================================

// OB-207 Increment 2: workspace access is DERIVED from the DS-014 single PDP (hasCapability),
// not a parallel role list. The prior ROLE_WORKSPACE_ACCESS map is RETIRED (it was the F-38
// role-vocabulary-divergence anti-pattern — a second source of truth that drifts). Access now
// = "the role can reach >=1 route in the workspace" computed from each route's requiredCapability,
// optionally module-gated by the live tenants.features (FP-49). Decision 123: the sidebar a user
// sees IS their capability set rendered.

// =============================================================================
// DEFAULT WORKSPACES BY ROLE
// =============================================================================

// OB-207 / Decision 128: /stream is HOME for every persona → Decide is the default workspace.
export const DEFAULT_WORKSPACE_BY_ROLE: Record<UserRole, WorkspaceId> = {
  platform: 'decide',
  admin: 'decide',
  manager: 'decide',
  sales_rep: 'decide',
};

// =============================================================================
// WORKSPACE VISIBILITY HELPERS
// =============================================================================

/**
 * Check if a role can access a workspace — the SINGLE two-gate composition point (OB-250 M2/I2).
 * = WORKSPACE-level featureFlag (TENANT gate) AND reachable-via-capability (USER gate).
 *
 * OB-250: the WORKSPACE-level featureFlag was previously enforced ONLY in the 3 sidebars' own
 * .filter (getWorkspaceRoutesForRole checks SECTION-level featureFlag, never the workspace's).
 * Folding it in here makes this the ONE derivation: a flagged workspace (data-operations:'prism_enabled',
 * finance:'financial') is inaccessible when `enabledFeatures` is supplied and the flag is not on —
 * so the menu rail, navigation-context redirect validation, and any other caller all agree. When
 * `enabledFeatures` is omitted (legacy capability-only callers), behavior is unchanged (DD-7).
 */
export function canAccessWorkspace(role: UserRole, workspace: WorkspaceId, enabledFeatures?: Record<string, boolean>): boolean {
  const ws = WORKSPACES[workspace];
  if (ws?.featureFlag && enabledFeatures && enabledFeatures[ws.featureFlag] !== true) return false;
  return getWorkspaceRoutesForRole(workspace, role, enabledFeatures).length > 0;
}

/**
 * Get all workspaces a role can access — a workspace is accessible if the role can reach
 * >=1 of its routes via the capability matrix (single PDP), module-gated by tenant features.
 */
export function getAccessibleWorkspaces(role: UserRole, enabledFeatures?: Record<string, boolean>): WorkspaceId[] {
  // OB-250: delegates to canAccessWorkspace so the WORKSPACE-level featureFlag (tenant gate) is
  // honored in the SAME place as everywhere else (single composition — I1).
  return (Object.keys(WORKSPACES) as WorkspaceId[]).filter(
    ws => canAccessWorkspace(role, ws, enabledFeatures),
  );
}

/**
 * Get the default workspace for a role
 */
export function getDefaultWorkspace(role: UserRole): WorkspaceId {
  return DEFAULT_WORKSPACE_BY_ROLE[role] ?? 'decide';
}

// =============================================================================
// WORKSPACE FEATURE ACCESS (for limited access scenarios)
// =============================================================================

export interface WorkspaceFeatureAccess {
  canViewAll: boolean;
  canEdit: boolean;
  limitedSections?: string[];
}

export const WORKSPACE_FEATURE_ACCESS: Record<UserRole, Partial<Record<WorkspaceId, WorkspaceFeatureAccess>>> = {
  platform: {
    calculate: { canViewAll: true, canEdit: true },
    decide: { canViewAll: true, canEdit: true },
    'platform-core': { canViewAll: true, canEdit: true },
    finance: { canViewAll: true, canEdit: true },
    'data-operations': { canViewAll: true, canEdit: true }, // OB-250
  },
  admin: {
    calculate: { canViewAll: true, canEdit: true },
    decide: { canViewAll: true, canEdit: true },
    'platform-core': { canViewAll: true, canEdit: true },
    finance: { canViewAll: true, canEdit: true },
    'data-operations': { canViewAll: true, canEdit: true }, // OB-250
  },
  manager: {
    decide: { canViewAll: true, canEdit: false },
    finance: { canViewAll: true, canEdit: false },
  },
  sales_rep: {
    decide: { canViewAll: false, canEdit: false, limitedSections: ['dashboard', 'compensation'] },
    finance: { canViewAll: false, canEdit: false, limitedSections: ['staff'] },
  },
};

/**
 * Get feature access for a role in a workspace
 */
export function getWorkspaceFeatureAccess(role: UserRole, workspace: WorkspaceId): WorkspaceFeatureAccess | null {
  return WORKSPACE_FEATURE_ACCESS[role]?.[workspace] ?? null;
}
