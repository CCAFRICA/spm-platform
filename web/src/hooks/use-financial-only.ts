'use client';

/**
 * useFinancialOnly — Returns true when tenant is financial-only (no ICM plans).
 *
 * Financial-only = financial feature enabled AND ruleSetCount === 0.
 * Returns false while session is still loading to prevent flash redirects.
 */

import { useFeature } from '@/contexts/tenant-context';
import { useSession } from '@/contexts/session-context';

export function useFinancialOnly(): boolean {
  const financialEnabled = useFeature('financial');
  const { ruleSetCount, isLoading } = useSession();

  // Don't redirect while still loading — prevents flash
  if (isLoading) return false;

  return financialEnabled && ruleSetCount === 0;
}
