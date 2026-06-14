/**
 * Role-Based Workspace Configuration — 4 Workspace Model (OB-97)
 *
 * Defines which workspaces are available to each role and their default behaviors.
 * Eliminated workspaces: Investigate → Operate, Design → Configure, Govern → Configure
 */

import type { UserRole } from '@/types/auth';
import type { WorkspaceId } from '@/types/navigation';
import type { PersonaKey } from '@/lib/design/tokens';

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

// OB-207: agent-nav access. Admin/platform reach all three acts + the foundation;
// manager/rep reach Decide (their intelligence) + Consolidate (financial views).
export const ROLE_WORKSPACE_ACCESS: Record<UserRole, WorkspaceId[]> = {
  platform: ['decide', 'calculate', 'consolidate', 'platform-core'],
  admin: ['decide', 'calculate', 'consolidate', 'platform-core'],
  manager: ['decide', 'consolidate'],
  sales_rep: ['decide', 'consolidate'],
};

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
 * Check if a role can access a workspace
 */
export function canAccessWorkspace(role: UserRole, workspace: WorkspaceId): boolean {
  return ROLE_WORKSPACE_ACCESS[role]?.includes(workspace) ?? false;
}

/**
 * Get all workspaces a role can access
 */
export function getAccessibleWorkspaces(role: UserRole): WorkspaceId[] {
  return ROLE_WORKSPACE_ACCESS[role] ?? [];
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
    consolidate: { canViewAll: true, canEdit: true },
  },
  admin: {
    calculate: { canViewAll: true, canEdit: true },
    decide: { canViewAll: true, canEdit: true },
    'platform-core': { canViewAll: true, canEdit: true },
    consolidate: { canViewAll: true, canEdit: true },
  },
  manager: {
    decide: { canViewAll: true, canEdit: false },
    consolidate: { canViewAll: true, canEdit: false },
  },
  sales_rep: {
    decide: { canViewAll: false, canEdit: false, limitedSections: ['dashboard', 'compensation'] },
    consolidate: { canViewAll: false, canEdit: false, limitedSections: ['staff'] },
  },
};

/**
 * Get feature access for a role in a workspace
 */
export function getWorkspaceFeatureAccess(role: UserRole, workspace: WorkspaceId): WorkspaceFeatureAccess | null {
  return WORKSPACE_FEATURE_ACCESS[role]?.[workspace] ?? null;
}
