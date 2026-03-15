/**
 * State Reader — Tenant Context Computation
 *
 * OB-170: Computes the TenantContext for the intelligence stream.
 * A pure function that queries Supabase in a single Promise.all() batch
 * and returns structured state used to drive section rendering and ordering.
 *
 * Domain-agnostic: uses schema column names only.
 * Korean Test compliant: zero hardcoded domain terms.
 */

import { createClient } from '@/lib/supabase/client';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface CalculatedPeriod {
  periodId: string;
  label: string;
  startDate: string;
  lifecycleState: string;
  totalPayout: number;
  entityCount: number;
  batchId: string;
  hasReconciliation: boolean;
  reconciliationMatch?: number;
}

export interface UncalculatedPeriod {
  periodId: string;
  label: string;
  startDate: string;
  dataRowCount: number;
}

export interface EmptyPeriod {
  periodId: string;
  label: string;
  startDate: string;
}

export interface TenantContext {
  calculatedPeriods: CalculatedPeriod[];
  uncalculatedPeriodsWithData: UncalculatedPeriod[];
  emptyPeriods: EmptyPeriod[];

  entityCount: number;

  activeRuleSet: {
    id: string;
    name: string;
    componentCount: number;
  } | null;

  crlTier: 'cold' | 'warm' | 'hot';
  mostRelevantPeriod: { id: string; label: string } | null;
  hasTrajectoryData: boolean;
}

// ──────────────────────────────────────────────
// State Reader
// ──────────────────────────────────────────────

export async function getStateReader(tenantId: string): Promise<TenantContext> {
  const supabase = createClient();

  // Batch all queries in parallel
  const [
    periodsResult,
    batchesResult,
    entityCountResult,
    ruleSetResult,
    reconciliationResult,
    committedDataResult,
  ] = await Promise.all([
    supabase
      .from('periods')
      .select('id, label, start_date')
      .eq('tenant_id', tenantId)
      .order('start_date', { ascending: true }),

    supabase
      .from('calculation_batches')
      .select('id, period_id, lifecycle_state, entity_count, summary, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),

    supabase
      .from('entities')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),

    supabase
      .from('rule_sets')
      .select('id, name, components')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1),

    supabase
      .from('reconciliation_sessions')
      .select('period_id, status, summary')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed'),

    // Check committed_data: group by source_date to know which months have data
    supabase
      .from('committed_data')
      .select('period_id, source_date, data_type')
      .eq('tenant_id', tenantId)
      .not('data_type', 'eq', 'personal') // personal rows don't have source_date
      .limit(1000),
  ]);

  const periods = periodsResult.data || [];
  const batches = batchesResult.data || [];
  const entityCount = entityCountResult.count || 0;
  const ruleSetData = ruleSetResult.data?.[0] || null;
  const reconciliations = reconciliationResult.data || [];
  const committedRows = committedDataResult.data || [];

  // Build reconciliation lookup: periodId → match percentage
  const reconMap = new Map<string, number>();
  for (const r of reconciliations) {
    if (r.period_id) {
      const summary = r.summary as Record<string, unknown> | null;
      const matchPct = summary?.match_percent
        ? Number(summary.match_percent)
        : summary?.exactMatches != null && summary?.matched != null
          ? (Number(summary.exactMatches) / Math.max(Number(summary.matched), 1)) * 100
          : undefined;
      if (matchPct !== undefined) {
        reconMap.set(r.period_id, matchPct);
      } else {
        reconMap.set(r.period_id, -1); // has reconciliation but unknown match
      }
    }
  }

  // Build latest batch per period
  const latestBatchByPeriod = new Map<string, typeof batches[0]>();
  for (const b of batches) {
    if (b.period_id && !latestBatchByPeriod.has(b.period_id)) {
      latestBatchByPeriod.set(b.period_id, b);
    }
  }

  // Build committed_data lookup: which source_dates have data
  // committed_data may have period_id set or source_date set
  const periodsWithData = new Set<string>();
  const sourceDateMonths = new Set<string>();
  for (const row of committedRows) {
    if (row.period_id) {
      periodsWithData.add(row.period_id);
    }
    if (row.source_date) {
      // Extract YYYY-MM from source_date to match against periods
      const dateStr = String(row.source_date);
      sourceDateMonths.add(dateStr.slice(0, 7)); // "2025-10"
    }
  }

  // Classify periods
  const calculatedPeriods: CalculatedPeriod[] = [];
  const uncalculatedPeriodsWithData: UncalculatedPeriod[] = [];
  const emptyPeriods: EmptyPeriod[] = [];

  for (const period of periods) {
    const batch = latestBatchByPeriod.get(period.id);
    const periodMonth = period.start_date ? String(period.start_date).slice(0, 7) : '';
    const hasData = periodsWithData.has(period.id) || sourceDateMonths.has(periodMonth);

    if (batch) {
      const summary = batch.summary as Record<string, unknown> | null;
      calculatedPeriods.push({
        periodId: period.id,
        label: period.label,
        startDate: period.start_date,
        lifecycleState: batch.lifecycle_state,
        totalPayout: Number(summary?.total_payout ?? 0),
        entityCount: batch.entity_count,
        batchId: batch.id,
        hasReconciliation: reconMap.has(period.id),
        reconciliationMatch: reconMap.get(period.id),
      });
    } else if (hasData) {
      // Count actual data rows for this period
      const count = committedRows.filter(r =>
        r.period_id === period.id ||
        (r.source_date && String(r.source_date).slice(0, 7) === periodMonth)
      ).length;
      uncalculatedPeriodsWithData.push({
        periodId: period.id,
        label: period.label,
        startDate: period.start_date,
        dataRowCount: count || entityCount, // fallback to entity count
      });
    } else {
      emptyPeriods.push({
        periodId: period.id,
        label: period.label,
        startDate: period.start_date,
      });
    }
  }

  // Compute active rule_set component count
  let activeRuleSet: TenantContext['activeRuleSet'] = null;
  if (ruleSetData) {
    const components = ruleSetData.components as unknown;
    let componentCount = 0;
    if (Array.isArray(components)) {
      componentCount = components.length;
    } else if (typeof components === 'object' && components !== null) {
      // BCL uses { variants: [...] } structure
      const obj = components as Record<string, unknown>;
      if (Array.isArray(obj.variants)) {
        for (const v of obj.variants) {
          const variant = v as Record<string, unknown>;
          if (Array.isArray(variant.components)) {
            componentCount += variant.components.length;
          }
        }
      }
    }
    activeRuleSet = {
      id: ruleSetData.id,
      name: ruleSetData.name,
      componentCount,
    };
  }

  // CRL tier
  const calcCount = calculatedPeriods.length;
  const crlTier: 'cold' | 'warm' | 'hot' = calcCount <= 2 ? 'cold' : calcCount <= 6 ? 'warm' : 'hot';

  // Most relevant period: most recent calculated, or earliest uncalculated with data
  let mostRelevantPeriod: TenantContext['mostRelevantPeriod'] = null;
  if (calculatedPeriods.length > 0) {
    const sorted = [...calculatedPeriods].sort((a, b) => b.startDate.localeCompare(a.startDate));
    mostRelevantPeriod = { id: sorted[0].periodId, label: sorted[0].label };
  } else if (uncalculatedPeriodsWithData.length > 0) {
    mostRelevantPeriod = {
      id: uncalculatedPeriodsWithData[0].periodId,
      label: uncalculatedPeriodsWithData[0].label,
    };
  }

  return {
    calculatedPeriods,
    uncalculatedPeriodsWithData,
    emptyPeriods,
    entityCount,
    activeRuleSet,
    crlTier,
    mostRelevantPeriod,
    hasTrajectoryData: calculatedPeriods.length >= 3,
  };
}
