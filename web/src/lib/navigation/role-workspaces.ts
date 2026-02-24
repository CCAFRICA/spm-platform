/**
 * Role-Based Workspace Configuration
 *
 * Defines which workspaces are available to each role and their default behaviors.
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
// ROLE WORKSPACE VISIBILITY
// =============================================================================

export const ROLE_WORKSPACE_ACCESS: Record<UserRole, WorkspaceId[]> = {
  vl_admin: ['operate', 'perform', 'investigate', 'design', 'configure', 'govern', 'financial'],
  admin: ['operate', 'perform', 'investigate', 'design', 'configure', 'govern', 'financial'],
  manager: ['perform', 'investigate', 'govern', 'financial'],
  sales_rep: ['perform'],
};

// =============================================================================
// DEFAULT WORKSPACES BY ROLE
// =============================================================================

// OB-73 Mission 3 / F-14, F-22: Role-appropriate default workspaces
export const DEFAULT_WORKSPACE_BY_ROLE: Record<UserRole, WorkspaceId> = {
  vl_admin: 'operate',
  admin: 'operate',
  manager: 'perform',
  sales_rep: 'perform',
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
  return DEFAULT_WORKSPACE_BY_ROLE[role] ?? 'perform';
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
  vl_admin: {
    operate: { canViewAll: true, canEdit: true },
    perform: { canViewAll: true, canEdit: true },
    investigate: { canViewAll: true, canEdit: true },
    design: { canViewAll: true, canEdit: true },
    configure: { canViewAll: true, canEdit: true },
    govern: { canViewAll: true, canEdit: true },
    financial: { canViewAll: true, canEdit: true },
  },
  admin: {
    operate: { canViewAll: true, canEdit: true },
    perform: { canViewAll: true, canEdit: true },
    investigate: { canViewAll: true, canEdit: true },
    design: { canViewAll: true, canEdit: true },
    configure: { canViewAll: true, canEdit: true },
    govern: { canViewAll: true, canEdit: true },
    financial: { canViewAll: true, canEdit: true },
  },
  manager: {
    perform: { canViewAll: true, canEdit: false },
    investigate: { canViewAll: false, canEdit: false, limitedSections: ['search', 'transactions', 'disputes'] },
    govern: { canViewAll: false, canEdit: false, limitedSections: ['approvals'] },
    financial: { canViewAll: true, canEdit: false },
  },
  sales_rep: {
    perform: { canViewAll: false, canEdit: false, limitedSections: ['dashboard', 'compensation', 'transactions', 'inquiries'] },
  },
};

/**
 * Get feature access for a role in a workspace
 */
export function getWorkspaceFeatureAccess(role: UserRole, workspace: WorkspaceId): WorkspaceFeatureAccess | null {
  return WORKSPACE_FEATURE_ACCESS[role]?.[workspace] ?? null;
}
