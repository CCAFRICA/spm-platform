/**
 * Page-Level Batched Data Loaders
 *
 * Every page calls ONE loader. No component-level Supabase calls on mount.
 * Each function batches all queries for a specific page route.
 */

import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function extractTotalPayoutFromSummary(summary: Json): number {
  if (typeof summary === 'number') return summary;
  if (typeof summary === 'object' && summary !== null && !Array.isArray(summary)) {
    const obj = summary as Record<string, Json | undefined>;
    if (typeof obj.total_payout === 'number') return obj.total_payout;
    if (typeof obj.totalPayout === 'number') return obj.totalPayout;
  }
  return 0;
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface PeriodRecord {
  id: string;
  canonical_key: string;
  label?: string;
  start_date: string;
  end_date: string;
  status: string;
  lifecycleState: string | null;
}

export interface OperatePageData {
  periods: PeriodRecord[];
  activePeriodId: string | null;
  activePeriodKey: string | null;
  hasActivePlan: boolean;
  ruleSetId: string | null;
  lastImportStatus: string | null;
  lastBatchId: string | null;
  lastBatchCreatedAt: string | null;
  lifecycleState: string | null;
  outcomes: Array<{
    entity_id: string;
    total_payout: number;
    attainment_summary: Json;
  }>;
  entityNames: Map<string, string>;
}

export interface ReconciliationPageData {
  batches: Array<{
    id: string;
    lifecycle_state: string;
    entity_count: number;
    total_payout: number;
    created_at: string;
    period_label: string | null;
    canonical_key: string | null;
  }>;
  ruleSetComponents: Json | null;
  ruleSetName: string | null;
}

export interface CalculatePageData {
  ruleSetId: string | null;
  ruleSetName: string | null;
  ruleSetComponents: Json | null;
  periodId: string | null;
  periodKey: string | null;
  periodLabel: string | null;
  entityCount: number;
  assignmentCount: number;
  committedDataCount: number;
  batches: Array<{
    id: string;
    lifecycle_state: string;
    entity_count: number;
    total_payout: number;
    created_at: string;
  }>;
}

// ──────────────────────────────────────────────
// Tenant Periods Loader (reusable across pages)
// ──────────────────────────────────────────────

export async function loadTenantPeriods(tenantId: string): Promise<Array<{ id: string; canonical_key: string; label?: string }>> {
  const supabase = createClient();
  const { data } = await supabase
    .from('periods')
    .select('id, canonical_key, label')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: false });
  return data ?? [];
}

// ──────────────────────────────────────────────
// Operate Page Loader
// ──────────────────────────────────────────────

export async function loadOperatePageData(tenantId: string): Promise<OperatePageData> {
  const supabase = createClient();

  // Round 1: periods + plan + import + latest batch (parallel)
  const [periodsRes, planRes, importRes] = await Promise.all([
    supabase
      .from('periods')
      .select('id, canonical_key, label, start_date, end_date, status')
      .eq('tenant_id', tenantId)
      .order('start_date', { ascending: false }),
    supabase
      .from('rule_sets')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('import_batches')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rawPeriods = periodsRes.data ?? [];

  // Find the active (open) period, or fall back to the most recent
  const activePeriod = rawPeriods.find(p => p.status === 'open') ?? rawPeriods[0] ?? null;
  const activePeriodId = activePeriod?.id ?? null;
  const activePeriodKey = activePeriod?.canonical_key ?? null;

  // Round 2: batch lifecycle states + outcomes + entity names (parallel, no conditional)
  const periodIds = rawPeriods.map(p => p.id);

  // Always query — empty periodIds/activePeriodId handled by returning empty arrays
  const batchQuery = periodIds.length > 0
    ? supabase
        .from('calculation_batches')
        .select('id, period_id, lifecycle_state, created_at, entity_count, summary')
        .eq('tenant_id', tenantId)
        .is('superseded_by', null)
        .in('period_id', periodIds)
        .order('created_at', { ascending: false })
    : null;

  const entityQuery = supabase
    .from('entities')
    .select('id, display_name, external_id')
    .eq('tenant_id', tenantId);

  const [batchesRes, entitiesRes] = await Promise.all([
    batchQuery,
    entityQuery,
  ]);

  const allBatches = batchesRes?.data ?? [];
  const entities = entitiesRes.data ?? [];

  // Build period → latest batch lifecycle state map
  const periodBatchMap = new Map<string, string>();
  for (const batch of allBatches) {
    if (batch.period_id && !periodBatchMap.has(batch.period_id)) {
      periodBatchMap.set(batch.period_id, batch.lifecycle_state);
    }
  }

  // Find latest batch for active period
  const activeBatch = activePeriodId
    ? allBatches.find((b) => b.period_id === activePeriodId)
    : null;

  // OB-73 Mission 4 / F-56: Load from calculation_results (source of truth), not entity_period_outcomes.
  // entity_period_outcomes only materializes at OFFICIAL+ state, so can be stale.
  // calculation_results always reflects the current batch's actual computed data.
  let outcomes: Array<{ entity_id: string; total_payout: number; attainment_summary: Json }> = [];
  if (activeBatch?.id) {
    const { data: calcResults } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout, attainment')
      .eq('tenant_id', tenantId)
      .eq('batch_id', activeBatch.id);
    outcomes = (calcResults ?? []).map(r => ({
      entity_id: r.entity_id,
      total_payout: r.total_payout || 0,
      attainment_summary: (r.attainment ?? {}) as Json,
    }));
  }

  const entityNames = new Map(entities.map(e => [
    e.id,
    e.external_id ? `${e.display_name} (${e.external_id})` : e.display_name,
  ]));

  return {
    periods: rawPeriods.map(p => ({
      id: p.id,
      canonical_key: p.canonical_key,
      label: p.label,
      start_date: p.start_date,
      end_date: p.end_date,
      status: p.status,
      lifecycleState: periodBatchMap.get(p.id) ?? null,
    })),
    activePeriodId,
    activePeriodKey,
    hasActivePlan: !!planRes.data,
    ruleSetId: planRes.data?.id ?? null,
    lastImportStatus: importRes.data?.status ?? null,
    lastBatchId: activeBatch?.id ?? null,
    lastBatchCreatedAt: activeBatch?.created_at ?? null,
    lifecycleState: activeBatch?.lifecycle_state ?? null,
    outcomes,
    entityNames,
  };
}

// ──────────────────────────────────────────────
// Calculate Page Loader
// ──────────────────────────────────────────────

export async function loadCalculatePageData(tenantId: string, periodKey?: string): Promise<CalculatePageData> {
  const supabase = createClient();

  // Round 1: rule set + period + entities + assignments + committed data + batches
  const periodQuery = periodKey
    ? supabase.from('periods').select('*').eq('tenant_id', tenantId).eq('canonical_key', periodKey).maybeSingle()
    : supabase.from('periods').select('*').eq('tenant_id', tenantId).eq('status', 'open').order('start_date', { ascending: false }).limit(1).maybeSingle();

  const [ruleSetRes, periodRes, entityCountRes, batchesRes] = await Promise.all([
    supabase.from('rule_sets').select('id, name, components').eq('tenant_id', tenantId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    periodQuery,
    supabase.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('calculation_batches').select('id, lifecycle_state, entity_count, summary, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
  ]);

  const ruleSet = ruleSetRes.data;
  const period = periodRes.data;

  // Round 2: assignment count + committed data count (need rule_set_id and period_key)
  let assignmentCount = 0;
  let committedDataCount = 0;

  if (ruleSet?.id) {
    const assignRes = await supabase.from('rule_set_assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('rule_set_id', ruleSet.id);
    assignmentCount = assignRes.count ?? 0;
  }
  if (period?.id) {
    const committedRes = await supabase.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('period_id', period.id);
    committedDataCount = committedRes.count ?? 0;
  }

  return {
    ruleSetId: ruleSet?.id ?? null,
    ruleSetName: ruleSet?.name ?? null,
    ruleSetComponents: ruleSet?.components ?? null,
    periodId: period?.id ?? null,
    periodKey: period?.canonical_key ?? null,
    periodLabel: period?.label ?? period?.canonical_key ?? null,
    entityCount: entityCountRes.count ?? 0,
    assignmentCount,
    committedDataCount,
    batches: (batchesRes.data ?? []).map(b => ({
      id: b.id,
      lifecycle_state: b.lifecycle_state,
      entity_count: b.entity_count,
      total_payout: extractTotalPayoutFromSummary(b.summary),
      created_at: b.created_at,
    })),
  };
}

// ──────────────────────────────────────────────
// Reconciliation Page Loader
// ──────────────────────────────────────────────

export async function loadReconciliationPageData(tenantId: string): Promise<ReconciliationPageData> {
  const supabase = createClient();

  const [batchesRes, ruleSetRes] = await Promise.all([
    supabase
      .from('calculation_batches')
      .select('id, lifecycle_state, entity_count, summary, created_at, period_id')
      .eq('tenant_id', tenantId)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('rule_sets')
      .select('id, name, components')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
  ]);

  const rawBatches = batchesRes.data ?? [];

  // Resolve period labels for batches
  const periodIds = Array.from(new Set(rawBatches.map(b => b.period_id).filter(Boolean)));
  let periodMap = new Map<string, { label: string | null; canonical_key: string | null }>();

  if (periodIds.length > 0) {
    const { data: periods } = await supabase
      .from('periods')
      .select('id, canonical_key, label')
      .in('id', periodIds as string[]);
    periodMap = new Map((periods ?? []).map(p => [p.id, { label: p.label || p.canonical_key, canonical_key: p.canonical_key }]));
  }

  return {
    batches: rawBatches.map(b => ({
      id: b.id,
      lifecycle_state: b.lifecycle_state,
      entity_count: b.entity_count,
      total_payout: extractTotalPayoutFromSummary(b.summary),
      created_at: b.created_at,
      period_label: periodMap.get(b.period_id ?? '')?.label ?? null,
      canonical_key: periodMap.get(b.period_id ?? '')?.canonical_key ?? null,
    })),
    ruleSetComponents: ruleSetRes.data?.components ?? null,
    ruleSetName: ruleSetRes.data?.name ?? null,
  };
}
