/**
 * OB-228 — getBaselineOutcomes (Concept ② baseline for the consequence engine).
 *
 * Reads entity_period_outcomes.component_breakdown (preferred) or
 * calculation_results.components (fallback) for a rule_set + period. Phase 1:
 * MIR is uncalculated (EPO=0, CR=0) → returns [] (the consequence diff has no
 * baseline; surfaced as the HALT-4 seam in Phase 4 — never fabricated).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import type { BaselineOutcome } from './types';

function toBreakdown(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  // Object dialect: { compName: amount } ; Array dialect: [{ name, amount }] (HALT-2-safe)
  if (Array.isArray(v)) {
    const out: Record<string, number> = {};
    for (const c of v) {
      const name = (c as any)?.name ?? (c as any)?.component_name ?? (c as any)?.componentName;
      const amt = Number((c as any)?.amount ?? (c as any)?.value ?? (c as any)?.total ?? 0);
      if (name) out[String(name)] = Number.isFinite(amt) ? amt : 0;
    }
    return out;
  }
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const n = typeof val === 'number' ? val : Number((val as any)?.amount ?? val);
    if (Number.isFinite(n)) out[k] = n as number;
  }
  return out;
}

export async function getBaselineOutcomes(
  ruleSetId: string,
  periodId: string,
  client?: SupabaseClient<Database>,
): Promise<BaselineOutcome[]> {
  const sb = client ?? createClient();
  const { data: rs } = await sb.from('rule_sets').select('tenant_id').eq('id', ruleSetId).maybeSingle();
  const tenantId = (rs as any)?.tenant_id as string | undefined;
  if (!tenantId) return [];

  // Preferred: entity_period_outcomes (materialized per entity per period)
  const { data: epo } = await sb
    .from('entity_period_outcomes')
    .select('entity_id, total_payout, component_breakdown')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId);
  if (epo && epo.length > 0) {
    return (epo as any[]).map((r) => ({
      entityId: r.entity_id,
      totalPayout: Number(r.total_payout) || 0,
      componentBreakdown: toBreakdown(r.component_breakdown),
    }));
  }

  // Fallback: calculation_results scoped to this rule_set + period
  const { data: cr } = await sb
    .from('calculation_results')
    .select('entity_id, total_payout, components')
    .eq('tenant_id', tenantId)
    .eq('rule_set_id', ruleSetId)
    .eq('period_id', periodId);
  if (cr && cr.length > 0) {
    return (cr as any[]).map((r) => ({
      entityId: r.entity_id,
      totalPayout: Number(r.total_payout) || 0,
      componentBreakdown: toBreakdown(r.components),
    }));
  }

  return []; // uncalculated (MIR) — baseline absent
}
