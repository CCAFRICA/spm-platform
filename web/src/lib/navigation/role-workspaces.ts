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
 * Check if a role can access a workspace — derived from the single PDP (capabilities),
 * optionally module-gated by the live tenants.features map. (OB-207 Inc2 binding.)
 */
export function canAccessWorkspace(role: UserRole, workspace: WorkspaceId, enabledFeatures?: Record<string, boolean>): boolean {
  return getWorkspaceRoutesForRole(workspace, role, enabledFeatures).length > 0;
}

/**
 * Get all workspaces a role can access — a workspace is accessible if the role can reach
 * >=1 of its routes via the capability matrix (single PDP), module-gated by tenant features.
 */
export function getAccessibleWorkspaces(role: UserRole, enabledFeatures?: Record<string, boolean>): WorkspaceId[] {
  return (Object.keys(WORKSPACES) as WorkspaceId[]).filter(
    ws => getWorkspaceRoutesForRole(ws, role, enabledFeatures).length > 0,
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
  },
  admin: {
    calculate: { canViewAll: true, canEdit: true },
    decide: { canViewAll: true, canEdit: true },
    'platform-core': { canViewAll: true, canEdit: true },
    finance: { canViewAll: true, canEdit: true },
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
