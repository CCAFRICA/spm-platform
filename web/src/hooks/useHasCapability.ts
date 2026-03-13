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
import { hasCapability, type Capability } from '@/lib/auth/permissions';

export function useHasCapability(capability: Capability): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return hasCapability(user.role, capability);
}
