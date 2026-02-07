/**
 * Batch Calculation Engine
 *
 * Core calculation logic for compensation processing.
 */

import type {
  LedgerEntry,
  LedgerEntryType,
  EmployeeCalculationResult,
  TierDefinition,
  TierResult,
  QuotaAttainment,
  Accelerator,
  AcceleratorApplication,
} from '@/types/calculation-engine';

// ============================================
// TIER CALCULATION
// ============================================

/**
 * Calculate payout based on tiered rate structure
 */
export function calculateTieredPayout(
  amount: number,
  tierDef: TierDefinition
): { total: number; breakdown: TierResult[] } {
  const breakdown: TierResult[] = [];
  let total = 0;
  let remainingAmount = amount;

  for (let i = 0; i < tierDef.tiers.length; i++) {
    const tier = tierDef.tiers[i];

    if (remainingAmount <= 0) break;
    if (amount < tier.min) continue;

    let tierAmount: number;

    if (tier.marginal) {
      // Marginal: only the portion within this tier
      const tierStart = tier.min;
      const tierEnd = tier.max === Infinity ? amount : Math.min(tier.max, amount);
      tierAmount = Math.max(0, tierEnd - tierStart);
    } else {
      // Non-marginal: rate applies to full amount if in tier
      tierAmount = amount >= tier.min && (tier.max === Infinity || amount <= tier.max) ? amount : 0;
    }

    if (tierAmount <= 0) continue;

    let earnedAmount: number;
    switch (tier.rateType) {
      case 'percentage':
        earnedAmount = tierAmount * (tier.rate / 100);
        break;
      case 'fixed':
        earnedAmount = tier.rate;
        break;
      case 'per_unit':
        earnedAmount = tierAmount * tier.rate;
        break;
      default:
        earnedAmount = 0;
    }

    breakdown.push({
      tierId: tierDef.id,
      tierIndex: i,
      baseAmount: amount,
      tierAmount,
      rate: tier.rate,
      earnedAmount,
    });

    total += earnedAmount;
    remainingAmount -= tierAmount;

    // For non-marginal tiers, we only use one tier
    if (!tier.marginal) break;
  }

  return { total, breakdown };
}

// ============================================
// QUOTA CALCULATION
// ============================================

/**
 * Calculate quota attainment for an employee
 */
export function calculateQuotaAttainment(
  employeeId: string,
  periodId: string,
  quotaId: string,
  quotaAmount: number,
  credits: Array<{ sourceId: string; sourceType: string; amount: number; creditDate: string }>,
  previousPeriods: Array<{ quota: number; attained: number }> = []
): QuotaAttainment {
  const attainedAmount = credits.reduce((sum, c) => sum + c.amount, 0);
  const attainmentPercentage = quotaAmount > 0 ? (attainedAmount / quotaAmount) * 100 : 0;

  // Calculate PTD (period-to-date)
  const ptdQuota = quotaAmount;
  const ptdAttained = attainedAmount;
  const ptdPercentage = attainmentPercentage;

  // Calculate YTD (year-to-date)
  const ytdQuota = previousPeriods.reduce((sum, p) => sum + p.quota, 0) + quotaAmount;
  const ytdAttained = previousPeriods.reduce((sum, p) => sum + p.attained, 0) + attainedAmount;
  const ytdPercentage = ytdQuota > 0 ? (ytdAttained / ytdQuota) * 100 : 0;

  return {
    employeeId,
    periodId,
    quotaId,
    quotaAmount,
    attainedAmount,
    attainmentPercentage,
    components: credits.map((c) => ({
      sourceId: c.sourceId,
      sourceType: c.sourceType as 'transaction' | 'credit' | 'adjustment',
      amount: c.amount,
      creditDate: c.creditDate,
    })),
    ptdQuota,
    ptdAttained,
    ptdPercentage,
    ytdQuota,
    ytdAttained,
    ytdPercentage,
  };
}

// ============================================
// ACCELERATOR CALCULATION
// ============================================

/**
 * Apply accelerator to earnings
 */
export function applyAccelerator(
  accelerator: Accelerator,
  employeeId: string,
  periodId: string,
  baseEntries: LedgerEntry[],
  attainmentPercentage: number
): AcceleratorApplication | null {
  // Check if accelerator is triggered
  let triggered = false;

  switch (accelerator.triggerType) {
    case 'attainment':
      triggered = attainmentPercentage >= (accelerator.triggerThreshold || 100);
      break;
    case 'date':
      triggered = accelerator.triggerDate
        ? new Date().toISOString() >= accelerator.triggerDate
        : false;
      break;
    case 'manual':
      triggered = true; // Assume manual accelerators are already approved
      break;
    default:
      triggered = false;
  }

  if (!triggered) return null;

  // Calculate base amount from applicable entries
  const applicableEntries = baseEntries.filter((e) =>
    accelerator.appliesTo.includes(e.type)
  );
  const baseAmount = applicableEntries.reduce((sum, e) => sum + e.amount, 0);

  // Apply multiplier
  let acceleratedAmount = baseAmount * (accelerator.multiplier - 1); // Additional amount

  // Apply caps
  let capped = false;
  let capAmount: number | undefined;

  if (accelerator.maxEarnings && acceleratedAmount > accelerator.maxEarnings) {
    capAmount = accelerator.maxEarnings;
    acceleratedAmount = accelerator.maxEarnings;
    capped = true;
  }

  return {
    acceleratorId: accelerator.id,
    employeeId,
    periodId,
    triggeredAt: new Date().toISOString(),
    multiplier: accelerator.multiplier,
    baseAmount,
    acceleratedAmount,
    capped,
    capAmount,
  };
}

// ============================================
// LEDGER OPERATIONS
// ============================================

/**
 * Create a ledger entry
 */
export function createLedgerEntry(
  batchId: string,
  employeeId: string,
  periodId: string,
  type: LedgerEntryType,
  amount: number,
  description: string,
  source: { type: 'transaction' | 'plan' | 'manual' | 'rule'; id?: string },
  userId: string
): Omit<LedgerEntry, 'id'> {
  return {
    batchId,
    employeeId,
    periodId,
    type,
    description,
    amount,
    currency: 'USD',
    sourceType: source.type,
    sourceId: source.id,
    status: 'pending',
    calculatedAt: new Date().toISOString(),
    calculatedBy: userId,
  };
}

/**
 * Create a reversal entry for an existing entry
 */
export function createReversalEntry(
  originalEntry: LedgerEntry,
  batchId: string,
  reason: string,
  userId: string
): Omit<LedgerEntry, 'id'> {
  return {
    batchId,
    employeeId: originalEntry.employeeId,
    periodId: originalEntry.periodId,
    type: originalEntry.type,
    description: `Reversal: ${reason}`,
    amount: -originalEntry.amount,
    currency: originalEntry.currency,
    sourceType: 'manual',
    reversedEntryId: originalEntry.id,
    status: 'pending',
    calculatedAt: new Date().toISOString(),
    calculatedBy: userId,
  };
}

/**
 * Summarize ledger entries by type
 */
export function summarizeByType(
  entries: LedgerEntry[]
): Record<LedgerEntryType, number> {
  const summary: Record<LedgerEntryType, number> = {
    base_salary: 0,
    commission: 0,
    bonus: 0,
    spiff: 0,
    adjustment: 0,
    clawback: 0,
    draw: 0,
    guarantee: 0,
    override: 0,
    accelerator: 0,
  };

  for (const entry of entries) {
    summary[entry.type] += entry.amount;
  }

  return summary;
}

// ============================================
// BATCH PROCESSING
// ============================================

/**
 * Process calculation results for an employee
 */
export function processEmployeeCalculation(
  employeeId: string,
  batchId: string,
  periodId: string,
  entries: LedgerEntry[],
  rulesApplied: string[],
  jurisdictions: string[]
): EmployeeCalculationResult {
  const grossPayout = entries
    .filter((e) => e.amount > 0)
    .reduce((sum, e) => sum + e.amount, 0);

  const deductions = entries
    .filter((e) => e.amount < 0)
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  const netPayout = grossPayout - deductions;

  return {
    employeeId,
    batchId,
    periodId,
    grossPayout,
    deductions,
    netPayout,
    currency: 'USD',
    byType: summarizeByType(entries),
    entries,
    rulesApplied,
    jurisdictionsEvaluated: jurisdictions,
    errors: [],
    warnings: [],
    status: 'success',
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Validate calculation result
 */
export function validateCalculationResult(
  result: EmployeeCalculationResult
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for negative net payout
  if (result.netPayout < 0) {
    warnings.push('Net payout is negative - employee owes money');
  }

  // Check for missing commission when expected
  if (result.byType.commission === 0 && result.entries.some((e) => e.planId)) {
    warnings.push('No commission calculated despite having plan assignments');
  }

  // Check for unusually high payouts
  if (result.grossPayout > 100000) {
    warnings.push('Gross payout exceeds $100,000 - please verify');
  }

  // Check for clawbacks exceeding commissions
  const commissions = result.byType.commission + result.byType.bonus;
  const clawbacks = Math.abs(result.byType.clawback);
  if (clawbacks > commissions) {
    warnings.push('Clawbacks exceed earned commissions');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
