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
  entityCount: number;
}

export interface OperatePageData {
  periods: PeriodRecord[];
  activePeriodId: string | null;
  activePeriodKey: string | null;
  hasActivePlan: boolean;
  ruleSetId: string | null;
  ruleSetName: string | null;
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
  componentBreakdown: Array<{ name: string; type: string; payout: number }>;
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
// Module Health Loader (OB-102 — Operate Landing)
// ──────────────────────────────────────────────

export interface ICMHealthData {
  ruleSetCount: number;
  ruleSetName: string | null;
  entityCount: number;
  periodCount: number;
  lastBatchDate: string | null;
  lifecycleState: string | null;
  totalPayout: number;
  lastImportDate: string | null;
}

export async function loadICMHealthData(tenantId: string): Promise<ICMHealthData> {
  const supabase = createClient();

  const [ruleSetsRes, entitiesRes, periodsRes, importRes, batchRes] = await Promise.all([
    supabase
      .from('rule_sets')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
    supabase
      .from('entities')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    supabase
      .from('periods')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    supabase
      .from('import_batches')
      .select('id, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('calculation_batches')
      .select('id, lifecycle_state, created_at, summary')
      .eq('tenant_id', tenantId)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const ruleSets = ruleSetsRes.data ?? [];
  const latestBatch = batchRes.data;
  const totalPayout = latestBatch?.summary
    ? extractTotalPayoutFromSummary(latestBatch.summary as Json)
    : 0;

  return {
    ruleSetCount: ruleSets.length,
    ruleSetName: ruleSets[0]?.name ?? null,
    entityCount: entitiesRes.count ?? 0,
    periodCount: periodsRes.count ?? 0,
    lastBatchDate: latestBatch?.created_at ?? null,
    lifecycleState: latestBatch?.lifecycle_state ?? null,
    totalPayout,
    lastImportDate: importRes.data?.created_at ?? null,
  };
}

// ──────────────────────────────────────────────
// Operate Page Loader
// ──────────────────────────────────────────────

export async function loadOperatePageData(tenantId: string, periodKey?: string): Promise<OperatePageData> {
  const supabase = createClient();

  // Round 1: periods + plan + import (parallel)
  const [periodsRes, planRes, importRes] = await Promise.all([
    supabase
      .from('periods')
      .select('id, canonical_key, label, start_date, end_date, status')
      .eq('tenant_id', tenantId)
      .order('start_date', { ascending: false }),
    supabase
      .from('rule_sets')
      .select('id, name')
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

  // Round 2: batch lifecycle states (parallel with period query)
  const periodIds = rawPeriods.map(p => p.id);

  const batchQuery = periodIds.length > 0
    ? supabase
        .from('calculation_batches')
        .select('id, period_id, lifecycle_state, created_at, entity_count, summary')
        .eq('tenant_id', tenantId)
        .is('superseded_by', null)
        .in('period_id', periodIds)
        .order('created_at', { ascending: false })
    : null;

  const batchesRes = await batchQuery;
  const allBatches = batchesRes?.data ?? [];

  // Build period → latest batch lifecycle state map + entity count
  const periodBatchMap = new Map<string, string>();
  const periodEntityCountMap = new Map<string, number>();
  for (const batch of allBatches) {
    if (batch.period_id && !periodBatchMap.has(batch.period_id)) {
      periodBatchMap.set(batch.period_id, batch.lifecycle_state);
      periodEntityCountMap.set(batch.period_id, batch.entity_count ?? 0);
    }
  }

  // OB-85-cont: Smart period selection
  // Priority: 1) explicit periodKey, 2) period with latest batch, 3) first open, 4) most recent
  let activePeriod;
  if (periodKey) {
    activePeriod = rawPeriods.find(p => p.canonical_key === periodKey) ?? null;
  }
  if (!activePeriod) {
    // Prefer the period that has the most recent calculation batch
    const latestBatch = allBatches[0]; // already ordered by created_at DESC
    if (latestBatch?.period_id) {
      activePeriod = rawPeriods.find(p => p.id === latestBatch.period_id) ?? null;
    }
  }
  if (!activePeriod) {
    activePeriod = rawPeriods.find(p => p.status === 'open') ?? rawPeriods[0] ?? null;
  }
  const activePeriodId = activePeriod?.id ?? null;
  const activePeriodKey = activePeriod?.canonical_key ?? null;

  // Find latest batch for active period
  const activeBatch = activePeriodId
    ? allBatches.find((b) => b.period_id === activePeriodId)
    : null;

  // OB-73 Mission 4 / F-56: Load from calculation_results (source of truth).
  // OB-85-cont: Also load metadata for entity name fallback.
  let outcomes: Array<{ entity_id: string; total_payout: number; attainment_summary: Json }> = [];
  let componentBreakdown: Array<{ name: string; type: string; payout: number }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let calcResults: Array<Record<string, any>> | null = null;
  if (activeBatch?.id) {
    const { data } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout, attainment, components, metadata')
      .eq('tenant_id', tenantId)
      .eq('batch_id', activeBatch.id);
    calcResults = data;
    outcomes = (calcResults ?? []).map(r => ({
      entity_id: r.entity_id,
      total_payout: r.total_payout || 0,
      attainment_summary: (r.attainment ?? {}) as Json,
    }));

    // Build component breakdown aggregated across all entities
    if (calcResults && calcResults.length > 0) {
      const compMap = new Map<string, { name: string; type: string; payout: number }>();
      for (const r of calcResults) {
        const comps = r.components as Array<{ componentName?: string; componentType?: string; payout?: number }> | null;
        if (comps && Array.isArray(comps)) {
          for (const c of comps) {
            const key = c.componentName ?? 'Unknown';
            const existing = compMap.get(key);
            if (existing) {
              existing.payout += c.payout ?? 0;
            } else {
              compMap.set(key, { name: key, type: c.componentType ?? '', payout: c.payout ?? 0 });
            }
          }
        }
      }
      componentBreakdown = Array.from(compMap.values());
    }
  }

  // OB-85-cont: Build entity names from entities table — batch-specific query
  // Query only the entity IDs we actually need (from calculation results),
  // paginated in batches of 1000 to handle Supabase row limits.
  const entityNames = new Map<string, string>();
  const entityIdsNeeded = (calcResults ?? []).map(r => r.entity_id);

  if (entityIdsNeeded.length > 0) {
    const ENTITY_PAGE = 200; // Standing rule: Supabase URL limit ≤200 UUIDs
    for (let i = 0; i < entityIdsNeeded.length; i += ENTITY_PAGE) {
      const batch = entityIdsNeeded.slice(i, i + ENTITY_PAGE);
      const { data: ents } = await supabase
        .from('entities')
        .select('id, display_name, external_id')
        .in('id', batch);
      for (const e of ents ?? []) {
        // Avoid redundant "12345 (12345)" when display_name equals external_id
        if (e.external_id && e.display_name !== e.external_id) {
          entityNames.set(e.id, `${e.display_name} (${e.external_id})`);
        } else {
          entityNames.set(e.id, e.external_id ?? e.display_name);
        }
      }
    }
  }

  // Fallback: enrich from calculation_results.metadata for any missing entities
  if (calcResults) {
    for (const r of calcResults) {
      if (entityNames.has(r.entity_id)) continue;
      const meta = r.metadata as Record<string, unknown> | null;
      if (!meta) continue;
      const name = meta.entityName as string | undefined;
      const extId = meta.externalId as string | undefined;
      if (name && name !== r.entity_id) {
        entityNames.set(r.entity_id, extId ? `${name} (${extId})` : name);
      } else if (extId) {
        entityNames.set(r.entity_id, extId);
      }
    }
  }

  return {
    periods: rawPeriods.map(p => ({
      id: p.id,
      canonical_key: p.canonical_key,
      label: p.label,
      start_date: p.start_date,
      end_date: p.end_date,
      status: p.status,
      lifecycleState: periodBatchMap.get(p.id) ?? null,
      entityCount: periodEntityCountMap.get(p.id) ?? 0,
    })),
    activePeriodId,
    activePeriodKey,
    hasActivePlan: !!planRes.data,
    ruleSetId: planRes.data?.id ?? null,
    ruleSetName: planRes.data?.name ?? null,
    lastImportStatus: importRes.data?.status ?? null,
    lastBatchId: activeBatch?.id ?? null,
    lastBatchCreatedAt: activeBatch?.created_at ?? null,
    lifecycleState: activeBatch?.lifecycle_state ?? null,
    outcomes,
    entityNames,
    componentBreakdown,
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

// ──────────────────────────────────────────────
// Adjustments Page Loader
// ──────────────────────────────────────────────

export interface AdjustmentRow {
  id: string;
  entityId: string;
  entityName: string;
  amount: number;
  reason: string;
  period: string;
  status: string;
  category: string;
  requestedBy: string;
  requestedAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
}

export interface AdjustmentsPageData {
  adjustments: AdjustmentRow[];
}

export async function loadAdjustmentsPageData(tenantId: string): Promise<AdjustmentsPageData> {
  const supabase = createClient();

  // Round 1: Load disputes
  const { data: disputes, error } = await supabase
    .from('disputes')
    .select(`
      id, entity_id, period_id, category, status,
      description, resolution, amount_disputed, amount_resolved,
      filed_by, resolved_by, created_at, updated_at, resolved_at
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error || !disputes) {
    return { adjustments: [] };
  }

  // Round 2: Entity names + filer names in parallel
  const entityIds = Array.from(new Set(disputes.map(d => d.entity_id).filter(Boolean)));
  const filerIds = Array.from(new Set(
    disputes.map(d => d.filed_by).filter((id): id is string => !!id)
  ));

  const [entityRes, filerRes] = await Promise.all([
    entityIds.length > 0
      ? supabase.from('entities').select('id, display_name').in('id', entityIds)
      : { data: [] },
    filerIds.length > 0
      ? supabase.from('profiles').select('id, display_name').in('id', filerIds)
      : { data: [] },
  ]);

  const entityNames = new Map((entityRes.data || []).map(e => [e.id, e.display_name]));
  const filerNames = new Map((filerRes.data || []).map(p => [p.id, p.display_name]));

  return {
    adjustments: disputes.map(d => ({
      id: d.id,
      entityId: d.entity_id,
      entityName: entityNames.get(d.entity_id) || d.entity_id,
      amount: Number(d.amount_disputed) || 0,
      reason: d.description || '',
      period: d.period_id || '',
      status: d.status || 'open',
      category: d.category || 'adjustment',
      requestedBy: (d.filed_by ? filerNames.get(d.filed_by) : null) || 'Unknown',
      requestedAt: d.created_at,
      resolvedBy: d.resolved_by ? (filerNames.get(d.resolved_by) || d.resolved_by) : undefined,
      resolvedAt: d.resolved_at || undefined,
      resolution: d.resolution || undefined,
    })),
  };
}

// ──────────────────────────────────────────────
// Users Page Loader
// ──────────────────────────────────────────────

export interface UserRow {
  id: string;
  auth_user_id: string;
  display_name: string;
  email: string;
  role: string;
  capabilities: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface LinkedEntity {
  id: string;
  display_name: string;
  external_id: string | null;
  profile_id: string;
}

export interface UsersPageData {
  users: UserRow[];
  entities: LinkedEntity[];
}

export async function loadUsersPageData(tenantId: string): Promise<UsersPageData> {
  const supabase = createClient();

  // Round 1: Load profiles
  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, auth_user_id, display_name, email, role, capabilities, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('display_name');

  const users = (profileData || []) as UserRow[];

  // Round 2: Linked entities (depends on profile IDs)
  const profileIds = users.map(u => u.id);
  let entities: LinkedEntity[] = [];

  if (profileIds.length > 0) {
    const { data: entityData } = await supabase
      .from('entities')
      .select('id, display_name, external_id, profile_id')
      .eq('tenant_id', tenantId)
      .in('profile_id', profileIds);
    entities = (entityData || []) as LinkedEntity[];
  }

  return { users, entities };
}
