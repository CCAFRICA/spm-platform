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

// ── getPeriodTotal — the authoritative period total (SUM of clean entity payouts) ────────────────────────
/** SUM(total_payout) for the period, from the clean entity results (entity_period_outcomes →
 *  calculation_results). This is the number /perform and /stream both show — no re-aggregation. */
export async function getPeriodTotal(
  tenantId: string,
  periodId: string,
  client?: SupabaseClient<Database>,
): Promise<number> {
  if (!tenantId || !periodId) return 0;
  const sb = client ?? createClient();
  const rows = await getEntityResults(tenantId, ALL_INSIGHTS_SCOPE, { periodId }, sb);
  return rows.reduce((s, r) => s + (r.totalPayout ?? 0), 0);
}

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
