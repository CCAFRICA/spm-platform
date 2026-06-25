// OB-234 T1-B — End-State A data layer. The ONE clean read-path every Intelligence surface binds to.
//
// CONTRACT (End-State A): ZERO functions here query `committed_data`. Every value terminates at
// `calculation_results` / `entity_period_outcomes` / `calculation_batches` — Compensation's
// result-of-record. Intelligence is the analytics tier; it NEVER re-derives. One validity verdict, one
// source (getBatchValidity), all surfaces reflect it.
//
// This module re-exports the existing CLEAN lib/insights functions (so a surface has one import site) and
// adds the three the redesign needs: getPeriodTotal, getBatchValidity (the single verdict), and
// getDimensions (discovered dimensions enriched with OB-235 comprehension characterizations — the
// learning-loop read; G8).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import { getEntityResults } from '@/lib/drill-through';
import { scopeIsDeny, scopeIsNarrowed } from '@/lib/drill-through/entity-scope';
import type { EntityScope } from '@/lib/drill-through/types';
import { ALL_INSIGHTS_SCOPE } from './periods';
import { discoverDimensions, type DiscoveredDimension } from './dimension-discovery';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Re-export the clean existing layer (one binding site for all 8 surfaces) ─────────────────────────────
export { getCalculatedPeriods } from './periods';
export { getComponentTotals, getPayoutDistribution } from './distribution';
export { getEntityTrajectory, getPopulationTrend } from './trajectory';
export { getEntityResults } from '@/lib/drill-through';
export { aggregateByDimension } from './dimension-discovery';
export type { DiscoveredDimension } from './dimension-discovery';

// ── Period-rollup sentinel (OB-237 T-AGG) — the WRITE-TIME period-level materialization ──────────────────
// The per-entity D7 materialization (entity_period_outcomes) carries one row per (entity, period). Reading a
// PERIOD TOTAL meant fetching all N entity rows and JS .reduce-ing them (BCL = 85 rows/period). OB-237 builds
// a period-level rollup: one sentinel row per (tenant, period) in summary_artifacts with
// data_type='period_outcomes', selected by period_id. metrics carries the pre-summed total_payout +
// entity_count + component_totals (by componentId) + component_totals_by_name (by componentName). The reads
// below fetch THAT one row (no reduce); they fall back to the per-entity path only when the sentinel is
// absent (graceful — populated by scripts/ob237-populate-period-rollup-*.ts; absent tenants keep working).
interface PeriodRollup {
  total_payout: number;
  entity_count: number;
  component_totals: Record<string, number>;            // keyed by componentId
  component_totals_by_name: Record<string, number>;    // keyed by componentName (getComponentTotals contract)
  component_entity_counts_by_name: Record<string, number>; // entities per component name
}

const num = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : 0;

const asNumberRecord = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = num(val);
  }
  return out;
};

/** Read the one period-rollup sentinel row for (tenant, period), or null if it hasn't been materialized. */
async function getPeriodRollup(
  tenantId: string,
  periodId: string,
  sb: SupabaseClient<Database>,
): Promise<PeriodRollup | null> {
  if (!tenantId || !periodId) return null;
  const { data } = await (sb as any)
    .from('summary_artifacts')
    .select('metrics')
    .eq('tenant_id', tenantId)
    .eq('data_type', 'period_outcomes')
    .eq('period_id', periodId)
    .limit(1);
  const row = (data ?? [])[0] as any;
  const metrics = row?.metrics;
  if (!metrics || typeof metrics !== 'object') return null;
  return {
    total_payout: num(metrics.total_payout),
    entity_count: num(metrics.entity_count),
    component_totals: asNumberRecord(metrics.component_totals),
    component_totals_by_name: asNumberRecord(metrics.component_totals_by_name),
    component_entity_counts_by_name: asNumberRecord(metrics.component_entity_counts_by_name),
  };
}

// ── getPeriodTotal — the authoritative period total (SUM of clean entity payouts) ────────────────────────
/** SUM(total_payout) for the period. Reads the ONE period-rollup sentinel row (OB-237 — no O(n) reduce over
 *  the 85 entity_period_outcomes rows). Falls back to the per-entity getEntityResults path only when the
 *  sentinel is absent. This is the number /perform and /stream both show — no re-aggregation. */
export async function getPeriodTotal(
  tenantId: string,
  periodId: string,
  // HF-343: optional authenticated scope (default ALL = admin → byte-identical to prior callers).
  // The period-rollup sentinel is TENANT-WIDE by construction (no per-entity vector), so a narrowed
  // scope MUST bypass it and sum only the visible entities' payouts (§3.1 — OB-237 materialized path
  // filtered through the scope resolver). A DENY scope reads nothing.
  scope: EntityScope = ALL_INSIGHTS_SCOPE,
  client?: SupabaseClient<Database>,
): Promise<number> {
  if (!tenantId || !periodId) return 0;
  if (scopeIsDeny(scope)) return 0;
  const sb = client ?? createClient();
  if (scopeIsNarrowed(scope)) {
    // narrowed (member own / manager team): sum the scoped per-entity rows — NOT the tenant sentinel
    const rows = await getEntityResults(tenantId, scope, { periodId }, sb);
    return rows.reduce((s, r) => s + (r.totalPayout ?? 0), 0);
  }
  const rollup = await getPeriodRollup(tenantId, periodId, sb);
  if (rollup) return rollup.total_payout; // admin/all: one row, no reduce
  // graceful fallback: tenant/period without a materialized rollup
  const rows = await getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId }, sb);
  return rows.reduce((s, r) => s + (r.totalPayout ?? 0), 0);
}

// internal export for sibling lib/insights modules (distribution/trajectory) to read the same sentinel.
export { getPeriodRollup };

// ── getBatchValidity — THE single validity verdict (calculation_batches.summary) ─────────────────────────
export type ValiditySeverity = 'clean' | 'warning' | 'critical' | 'none';
export interface ValidityVerdict {
  hasBatch: boolean;
  matchPercent: number | null;   // reconciliation match quality from the batch summary
  exceptionCount: number;        // anomalies/exceptions recorded for the batch
  severity: ValiditySeverity;    // clean | warning | critical | none(no batch)
  recommendation: string;        // honest one-line guidance
  totalPayout: number;
  entityCount: number;
}

/** The ONE data-quality verdict for a period's batch, read from calculation_batches.summary the same way
 *  the state-reader reads match quality — so /stream and /perform render the SAME verdict (G4). */
export async function getBatchValidity(
  tenantId: string,
  periodId: string,
  client?: SupabaseClient<Database>,
): Promise<ValidityVerdict> {
  const none: ValidityVerdict = { hasBatch: false, matchPercent: null, exceptionCount: 0, severity: 'none', recommendation: 'No calculation batch for this period yet.', totalPayout: 0, entityCount: 0 };
  if (!tenantId || !periodId) return none;
  const sb = client ?? createClient();
  const { data } = await sb.from('calculation_batches')
    .select('entity_count, summary, created_at')
    .eq('tenant_id', tenantId).eq('period_id', periodId)
    .order('created_at', { ascending: false }).limit(1);
  const batch = (data ?? [])[0] as any;
  if (!batch) return none;

  const summary = (batch.summary ?? {}) as Record<string, unknown>;
  // match quality — same derivation as state-reader.ts (match_percent, else exactMatches/matched)
  const matchPercent: number | null =
    summary.match_percent != null ? Number(summary.match_percent)
    : (summary.exactMatches != null && summary.matched != null)
      ? (Number(summary.exactMatches) / Math.max(Number(summary.matched), 1)) * 100
      : null;
  // exceptions/anomalies recorded on the batch (open vocabulary — read whichever the writer used)
  const exceptionCount = Number(
    summary.exception_count ?? summary.exceptions ?? summary.anomaly_count ?? summary.anomalies ?? 0,
  ) || 0;
  const totalPayout = Number(summary.total_payout ?? 0) || 0;
  const entityCount = Number(batch.entity_count ?? 0) || 0;

  // severity: exceptions dominate; else match quality. Honest, threshold-light.
  let severity: ValiditySeverity;
  let recommendation: string;
  if (exceptionCount > 0) {
    severity = exceptionCount >= 5 ? 'critical' : 'warning';
    recommendation = `${exceptionCount} exception${exceptionCount === 1 ? '' : 's'} flagged — review before sign-off.`;
  } else if (matchPercent != null && matchPercent < 90) {
    severity = matchPercent < 70 ? 'critical' : 'warning';
    recommendation = `Reconciliation match ${matchPercent.toFixed(1)}% — investigate unmatched rows.`;
  } else {
    severity = 'clean';
    recommendation = matchPercent != null ? `Reconciliation match ${matchPercent.toFixed(1)}% — within expected parameters.` : 'No exceptions recorded.';
  }
  return { hasBatch: true, matchPercent, exceptionCount, severity, recommendation, totalPayout, entityCount };
}

// ── getDimensions — discovered dimensions enriched with comprehension characterizations (learning-loop) ───
export interface EnrichedDimension extends DiscoveredDimension {
  /** OB-235 comprehension_artifacts characterization for this dimension's field, when one exists. */
  characterization: string | null;
}

/** discoverDimensions (OB-322, field-name-blind) enriched with the OB-235 comprehension layer: where a
 *  dimension key matches a comprehended field, attach its free-form characterization (what the column
 *  MEANS, in the data's own language). This is the learning-loop read at the data layer (G8). */
export async function getDimensions(
  tenantId: string,
  periodId: string,
  client?: SupabaseClient<Database>,
): Promise<EnrichedDimension[]> {
  if (!tenantId || !periodId) return [];
  const sb = client ?? createClient();
  const dims = await discoverDimensions(tenantId, periodId, sb);
  // comprehension characterizations (the OB-235 store) — match dimension key ↔ comprehended field name.
  const { data: comp } = await (sb as any).from('comprehension_artifacts')
    .select('field_name, characterization').eq('tenant_id', tenantId);
  const charByField = new Map<string, string>();
  for (const r of (comp ?? []) as any[]) {
    if (typeof r.field_name === 'string' && typeof r.characterization === 'string') {
      charByField.set(r.field_name.toLowerCase(), r.characterization);
    }
  }
  return dims.map((d) => ({ ...d, characterization: charByField.get(d.key.toLowerCase()) ?? null }));
}
