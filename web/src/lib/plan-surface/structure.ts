/**
 * OB-228 — getPlanStructure / getVisiblePlans (Concept ① data layer).
 *
 * Reads `rule_sets` and normalizes `components` via the Korean-Test normalizer.
 * Plan-level confidence (metadata.aiConfidence) is hoisted onto components that
 * lack their own (Carry Everything: confidence is a hint, never a gate).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import { normalizeComponents } from './normalize';
import type { PersonaScope, PlanStructure } from './types';

function toNum(v: unknown, fallback = 1): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function getPlanStructure(ruleSetId: string, client?: SupabaseClient<Database>): Promise<PlanStructure | null> {
  const sb = client ?? createClient();
  const { data, error } = await sb
    .from('rule_sets')
    .select('id, name, status, version, effective_from, effective_to, components, metadata')
    .eq('id', ruleSetId)
    .maybeSingle();
  if (error || !data) return null;
  return buildPlanStructure(data as any);
}

export function buildPlanStructure(row: {
  id: string; name: string; status: string; version: unknown;
  effective_from: string | null; effective_to: string | null;
  components: unknown; metadata: Record<string, unknown> | null;
}): PlanStructure {
  const { variants, recognized } = normalizeComponents(row.components);
  const metadata = row.metadata ?? {};
  const planConfidence = typeof (metadata as any).aiConfidence === 'number' ? (metadata as any).aiConfidence : undefined;

  // Hoist plan-level confidence onto components lacking their own (hint, not gate).
  if (planConfidence !== undefined) {
    for (const v of variants) for (const c of v.components) if (c.confidence === undefined) c.confidence = planConfidence;
  }

  const componentCount = variants.reduce((s, v) => s + v.components.length, 0);
  return {
    id: row.id,
    name: row.name,
    version: toNum(row.version),
    status: String(row.status ?? 'draft'),
    effectiveFrom: row.effective_from ?? null,
    effectiveTo: row.effective_to ?? null,
    variants,
    confidence: planConfidence,
    metadata: metadata as Record<string, unknown>,
    componentCount,
    shapeUnrecognized: !recognized,
  };
}

/**
 * Persona-scoped plan list for a tenant. Admin/unrestricted ⇒ all the tenant's
 * plans; otherwise filtered by scope.visibleRuleSetIds.
 */
export async function getVisiblePlans(tenantId: string, scope: PersonaScope, client?: SupabaseClient<Database>): Promise<PlanStructure[]> {
  const sb = client ?? createClient();
  let q = sb
    .from('rule_sets')
    .select('id, name, status, version, effective_from, effective_to, components, metadata')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (!scope.unrestricted) {
    if (scope.visibleRuleSetIds.length === 0) return []; // non-admin, no scope ⇒ fail closed
    q = q.in('id', scope.visibleRuleSetIds);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as any[]).map(buildPlanStructure);
}
