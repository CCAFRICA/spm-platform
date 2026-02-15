/**
 * useCapability — Check if the current user has a specific capability.
 *
 * Capabilities come from the user's Supabase profile.
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

/**
 * Check if the current user has a specific capability.
 * VL admins always have all capabilities.
 */
export function useCapability(capability: string): boolean {
  const { user, capabilities } = useAuth();
  if (!user) return false;
  if (user.role === 'vl_admin') return true;
  return capabilities.includes(capability);
}

/**
 * Check if the current user has any of the given capabilities.
 */
export function useHasAnyCapability(caps: string[]): boolean {
  const { user, capabilities } = useAuth();
  if (!user) return false;
  if (user.role === 'vl_admin') return true;
  return caps.some(cap => capabilities.includes(cap));
}

/**
 * Check if the current user has all of the given capabilities.
 */
export function useHasAllCapabilities(caps: string[]): boolean {
  const { user, capabilities } = useAuth();
  if (!user) return false;
  if (user.role === 'vl_admin') return true;
  return caps.every(cap => capabilities.includes(cap));
}
