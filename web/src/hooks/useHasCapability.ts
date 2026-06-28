'use client';

/**
 * useHasCapability — DS-014 inline capability check
 *
 * Replaces useCanPerform. Reads role from AuthContext,
 * checks against permissions.ts capability matrix.
 *
 * Usage:
 *   const canCalculate = useHasCapability('data.calculate');
 *   const canImport = useHasCapability('data.import');
 */

import { useAuth } from '@/contexts/auth-context';
import { useTenantFeaturesSafe } from '@/contexts/tenant-context';
import { hasCapability, type Capability } from '@/lib/auth/permissions';
import { tenantEntitlementRevocations } from '@/lib/navigation/workspace-config';

export function useHasCapability(capability: Capability): boolean {
  const { user } = useAuth();
  // OB-252 Phase 3 / DS-014 §9: role capabilities ∩ tenant entitlement (deterministic, zero LLM).
  const features = useTenantFeaturesSafe();
  if (!user) return false;
  return hasCapability(user.role, capability, tenantEntitlementRevocations(features));
}
