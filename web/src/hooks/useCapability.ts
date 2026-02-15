/**
 * useCapability — Check if the current user has a specific capability.
 *
 * OB-42 Phase 11C: Capabilities-based UI rendering.
 *
 * Capabilities:
 * - view_outcomes: Can see calculation results
 * - approve_outcomes: Can approve batches
 * - export_results: Can export data
 * - manage_rule_sets: Can edit rule sets
 * - manage_assignments: Can reassign entities
 * - design_scenarios: Can use sandbox
 * - import_data: Can import data
 * - view_audit: Can view audit logs
 * - manage_tenants: Platform admin
 * - manage_profiles: Can manage user profiles
 *
 * Usage:
 *   const canApprove = useCapability('approve_outcomes');
 *   const canExport = useCapability('export_results');
 *   const canManage = useHasAnyCapability(['manage_rule_sets', 'manage_assignments']);
 */

'use client';

import { useAuth } from '@/contexts/auth-context';
import { isTenantUser } from '@/types/auth';

/**
 * Check if the current user has a specific capability.
 * VL admins always have all capabilities.
 */
export function useCapability(capability: string): boolean {
  const { user } = useAuth();
  if (!user) return false;

  // VL admins have all capabilities
  if (user.role === 'vl_admin') return true;

  if (isTenantUser(user)) {
    // Check capabilities first (Supabase mode)
    if (user.capabilities?.includes(capability)) return true;

    // Fall back to permissions (demo mode — mapped from capabilities)
    // Map capability names to permission names for backward compatibility
    const capToPermMap: Record<string, string[]> = {
      view_outcomes: ['view_own_compensation', 'view_all_compensation'],
      approve_outcomes: ['approve_plans', 'approve_results'],
      export_results: ['export_data'],
      manage_rule_sets: ['manage_plans', 'edit_plans'],
      manage_assignments: ['manage_employees', 'manage_team'],
      design_scenarios: ['run_scenarios'],
      import_data: ['import_data'],
      view_audit: ['view_audit'],
      manage_tenants: ['manage_system'],
      manage_profiles: ['manage_employees'],
    };

    const mappedPerms = capToPermMap[capability] || [];
    return mappedPerms.some(p => user.permissions?.includes(p));
  }

  return false;
}

/**
 * Check if the current user has any of the given capabilities.
 */
export function useHasAnyCapability(capabilities: string[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  if (user.role === 'vl_admin') return true;

  if (isTenantUser(user)) {
    return capabilities.some(cap => {
      if (user.capabilities?.includes(cap)) return true;
      return false;
    });
  }

  return false;
}

/**
 * Check if the current user has all of the given capabilities.
 */
export function useHasAllCapabilities(capabilities: string[]): boolean {
  const { user } = useAuth();
  if (!user) return false;
  if (user.role === 'vl_admin') return true;

  if (isTenantUser(user)) {
    return capabilities.every(cap => {
      if (user.capabilities?.includes(cap)) return true;
      return false;
    });
  }

  return false;
}
