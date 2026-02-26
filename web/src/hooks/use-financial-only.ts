'use client';

/**
 * useFinancialOnly — Returns true when tenant is financial-only (no ICM plans).
 *
 * Financial-only = financial feature enabled AND ruleSetCount === 0.
 * Returns false while ANY dependency is still loading to prevent redirect loops.
 */

import { useFeature } from '@/contexts/tenant-context';
import { useSession } from '@/contexts/session-context';
import { useAuth } from '@/contexts/auth-context';

// AUTH GATE — HF-059/HF-061
// This hook gates on auth + session loading state before returning true.
// DO NOT remove the auth/loading checks — they prevent login redirect loops.
// DO NOT add redirects that fire before auth session hydrates.
// See: CC Failure Pattern — Login Redirect Loop (3x regression)

export function useFinancialOnly(): boolean {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const financialEnabled = useFeature('financial');
  const { ruleSetCount, isLoading: sessionLoading } = useSession();

  // Don't return true until ALL state is settled:
  // 1. Auth must be loaded and authenticated
  // 2. Session counts must be loaded for the current tenant
  // Without these gates, stale default zeros cause incorrect redirects → login loop
  if (authLoading || !isAuthenticated || sessionLoading) return false;

  return financialEnabled && ruleSetCount === 0;
}
