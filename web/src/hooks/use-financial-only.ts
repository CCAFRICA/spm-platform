'use client';

import { useFeature } from '@/contexts/tenant-context';
import { useSession } from '@/contexts/session-context';

/**
 * Returns true when the current tenant has financial features enabled
 * but NO ICM plans configured (ruleSetCount === 0).
 *
 * Used to hide ICM-specific nav items (My Compensation, Insights,
 * Transactions, Performance) for financial-only tenants like Sabor Grupo.
 *
 * Returns false while session is loading to prevent flash-hiding.
 */
export function useFinancialOnly(): boolean {
  const hasFinancial = useFeature('financial');
  const { ruleSetCount, isLoading } = useSession();

  if (isLoading) return false;
  return hasFinancial && ruleSetCount === 0;
}
