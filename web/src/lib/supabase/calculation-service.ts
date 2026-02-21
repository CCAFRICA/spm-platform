/**
 * Calculation Service — Calculation batches, results, traces, lifecycle
 *
 * Supabase-only. No localStorage fallback.
 * Rule 30: OFFICIAL+ states cannot be overwritten, only superseded.
 */

import { createClient, requireTenantId } from './client';
import { writeAuditLog } from '@/lib/audit/audit-logger';
import type { Database, Json, LifecycleState, BatchType } from './database.types';

// ──────────────────────────────────────────────
// Type aliases
// ──────────────────────────────────────────────
type CalcBatchRow = Database['public']['Tables']['calculation_batches']['Row'];
type CalcBatchInsert = Database['public']['Tables']['calculation_batches']['Insert'];
type CalcBatchUpdate = Database['public']['Tables']['calculation_batches']['Update'];
type CalcResultRow = Database['public']['Tables']['calculation_results']['Row'];
type CalcResultInsert = Database['public']['Tables']['calculation_results']['Insert'];
type CalcTraceInsert = Database['public']['Tables']['calculation_traces']['Insert'];
type EntityPeriodOutcomeRow = Database['public']['Tables']['entity_period_outcomes']['Row'];

// ──────────────────────────────────────────────
// Rule 30: Immutable lifecycle states
// States at or beyond OFFICIAL cannot be overwritten — only superseded
// ──────────────────────────────────────────────
const IMMUTABLE_STATES: LifecycleState[] = [
  'OFFICIAL', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'CLOSED', 'PAID', 'PUBLISHED',
];

/** Valid transitions from each state */
const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  DRAFT: ['PREVIEW'],
  PREVIEW: ['DRAFT', 'RECONCILE', 'OFFICIAL'],
  RECONCILE: ['PREVIEW', 'OFFICIAL'],
  OFFICIAL: ['PREVIEW', 'PENDING_APPROVAL', 'SUPERSEDED'],
  PENDING_APPROVAL: ['OFFICIAL', 'APPROVED', 'REJECTED'],
  APPROVED: ['OFFICIAL', 'POSTED'],
  REJECTED: ['OFFICIAL'],
  SUPERSEDED: [],
  POSTED: ['CLOSED'],
  CLOSED: ['PAID'],
  PAID: ['PUBLISHED'],
  PUBLISHED: [],
};

// ──────────────────────────────────────────────
// Calculation Batch CRUD
// ──────────────────────────────────────────────

/**
 * Create a calculation batch.
 */
export async function createCalculationBatch(
  tenantId: string,
  params: {
    periodId: string;
    ruleSetId?: string;
    batchType?: BatchType;
    entityCount?: number;
    config?: Record<string, unknown>;
    createdBy?: string;
  }
): Promise<CalcBatchRow> {
  requireTenantId(tenantId);
  const supabase = createClient();
  const insertRow: CalcBatchInsert = {
    tenant_id: tenantId,
    period_id: params.periodId,
    rule_set_id: params.ruleSetId || null,
    batch_type: params.batchType || 'standard',
    lifecycle_state: 'DRAFT',
    entity_count: params.entityCount || 0,
    config: (params.config || {}) as unknown as Json,
    created_by: params.createdBy || null,
  };
  const { data, error } = await supabase
    .from('calculation_batches')
    .insert(insertRow)
    .select()
    .single();
  if (error) throw error;

  // OB-72: Audit log batch creation
  writeAuditLog(supabase, {
    tenant_id: tenantId,
    profile_id: params.createdBy || null,
    action: 'batch.created',
    resource_type: 'calculation_batch',
    resource_id: data.id,
    changes: {
      period_id: params.periodId,
      batch_type: params.batchType || 'standard',
      entity_count: params.entityCount || 0,
    },
  }).catch(() => {});

  return data as CalcBatchRow;
}

/**
 * Get a calculation batch by ID.
 */
export async function getCalculationBatch(
  tenantId: string,
  batchId: string
): Promise<CalcBatchRow | null> {
  requireTenantId(tenantId);
  const supabase = createClient();
  const { data, error } = await supabase
    .from('calculation_batches')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', batchId)
    .single();
  if (error) return null;
  return data as CalcBatchRow;
}

/**
 * List calculation batches for a tenant/period.
 * Includes 5-second dedup cache so parallel callers (cycle, queue, pulse)
 * share a single Supabase round-trip during the same refresh cycle.
 */
const _batchCache = new Map<string, { data: CalcBatchRow[]; ts: number; promise?: Promise<CalcBatchRow[]> }>();
const CACHE_TTL = 5000; // 5 seconds

export async function listCalculationBatches(
  tenantId: string,
  options?: { periodId?: string; ruleSetId?: string; lifecycleState?: LifecycleState }
): Promise<CalcBatchRow[]> {
  requireTenantId(tenantId);
  const cacheKey = `${tenantId}:${options?.periodId ?? ''}:${options?.ruleSetId ?? ''}:${options?.lifecycleState ?? ''}`;
  const cached = _batchCache.get(cacheKey);
  if (cached) {
    if (cached.promise) return cached.promise; // In-flight — share it
    if (Date.now() - cached.ts < CACHE_TTL) return cached.data; // Fresh — reuse it
  }
  const promise = (async () => {
    const supabase = createClient();
    let query = supabase
      .from('calculation_batches')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (options?.periodId) query = query.eq('period_id', options.periodId);
    if (options?.ruleSetId) query = query.eq('rule_set_id', options.ruleSetId);
    if (options?.lifecycleState) query = query.eq('lifecycle_state', options.lifecycleState);
    const { data, error } = await query;
    if (error) throw error;
    const result = (data || []) as CalcBatchRow[];
    _batchCache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  })();
  _batchCache.set(cacheKey, { data: [], ts: 0, promise });
  try { return await promise; } catch (e) { _batchCache.delete(cacheKey); throw e; }
}

/**
 * Get the active (non-superseded) batch for a period.
 */
export async function getActiveBatch(
  tenantId: string,
  periodId: string,
  ruleSetId?: string
): Promise<CalcBatchRow | null> {
  requireTenantId(tenantId);
  const supabase = createClient();
  let query = supabase
    .from('calculation_batches')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId)
    .is('superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (ruleSetId) query = query.eq('rule_set_id', ruleSetId);
  const { data, error } = await query.single();
  if (error) return null;
  return data as CalcBatchRow;
}

// ──────────────────────────────────────────────
// Lifecycle Management with Rule 30
// ──────────────────────────────────────────────

/**
 * Check if a lifecycle transition is valid.
 */
export function isValidTransition(from: LifecycleState, to: LifecycleState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) || false;
}

/**
 * Check if a batch is in an immutable state (Rule 30).
 */
export function isImmutableState(state: LifecycleState): boolean {
  return IMMUTABLE_STATES.includes(state);
}

/**
 * Transition a calculation batch to a new lifecycle state.
 * Enforces Rule 30: OFFICIAL+ states cannot be overwritten.
 *
 * Returns the updated batch, or null if transition is invalid.
 */
export async function transitionBatchLifecycle(
  tenantId: string,
  batchId: string,
  targetState: LifecycleState,
  params?: {
    summary?: Record<string, unknown>;
    completedAt?: string;
  }
): Promise<CalcBatchRow | null> {
  const batch = await getCalculationBatch(tenantId, batchId);
  if (!batch) return null;

  const currentState = batch.lifecycle_state as LifecycleState;

  // Rule 30: Validate transition
  if (!isValidTransition(currentState, targetState)) {
    console.warn(
      `[CalculationService] Invalid transition: ${currentState} -> ${targetState} for batch ${batchId}`
    );
    return null;
  }

  const supabase = createClient();
  const updateRow: CalcBatchUpdate = {
    lifecycle_state: targetState,
    ...(params?.summary ? { summary: params.summary as unknown as Json } : {}),
    ...(params?.completedAt ? { completed_at: params.completedAt } : {}),
    ...(targetState === 'PREVIEW' ? { started_at: new Date().toISOString() } : {}),
  };
  const { data, error } = await supabase
    .from('calculation_batches')
    .update(updateRow)
    .eq('tenant_id', tenantId)
    .eq('id', batchId)
    .select()
    .single();
  if (error) return null;

  // OB-72: Audit log lifecycle transitions
  writeAuditLog(supabase, {
    tenant_id: tenantId,
    profile_id: null,
    action: `lifecycle.${currentState.toLowerCase()}_to_${targetState.toLowerCase()}`,
    resource_type: 'calculation_batch',
    resource_id: batchId,
    changes: {
      before_state: currentState,
      after_state: targetState,
      period_id: batch.period_id,
    },
  }).catch(() => {
    // Non-blocking — audit failure should not affect transition
  });

  // Trigger materialization on key transitions
  if (['OFFICIAL', 'APPROVED', 'POSTED', 'PUBLISHED'].includes(targetState)) {
    try {
      await materializeEntityPeriodOutcomes(tenantId, batch.period_id, batchId);
    } catch (matErr) {
      console.warn('[CalculationService] Outcomes materialization failed:', matErr);
    }
  }

  return data as CalcBatchRow;
}

/**
 * Rule 30: Supersede an existing batch.
 * When an OFFICIAL+ batch needs to be re-calculated, create a new superseding batch.
 * The old batch is marked as superseded (not deleted or modified).
 */
export async function supersedeBatch(
  tenantId: string,
  existingBatchId: string,
  params: {
    ruleSetId?: string;
    createdBy?: string;
    config?: Record<string, unknown>;
  }
): Promise<CalcBatchRow> {
  const existing = await getCalculationBatch(tenantId, existingBatchId);
  if (!existing) throw new Error(`Batch ${existingBatchId} not found`);

  if (!isImmutableState(existing.lifecycle_state as LifecycleState)) {
    throw new Error(
      `Cannot supersede batch in ${existing.lifecycle_state} state — only OFFICIAL+ batches can be superseded`
    );
  }

  // Create the superseding batch
  const newBatch = await createCalculationBatch(tenantId, {
    periodId: existing.period_id,
    ruleSetId: params.ruleSetId || existing.rule_set_id || undefined,
    batchType: 'superseding',
    config: params.config,
    createdBy: params.createdBy,
  });

  const supabase = createClient();
  // Link the supersession chain
  await supabase
    .from('calculation_batches')
    .update({ supersedes: existingBatchId } as CalcBatchUpdate)
    .eq('id', newBatch.id);

  await supabase
    .from('calculation_batches')
    .update({ superseded_by: newBatch.id } as CalcBatchUpdate)
    .eq('id', existingBatchId);

  return { ...newBatch, supersedes: existingBatchId };
}

// ──────────────────────────────────────────────
// Calculation Results CRUD
// ──────────────────────────────────────────────

/**
 * Write calculation results for a batch.
 * Each result links to an entity_id (UUID FK).
 */
export async function writeCalculationResults(
  tenantId: string,
  batchId: string,
  results: Array<{
    entityId: string;
    ruleSetId?: string;
    periodId?: string;
    totalPayout: number;
    components: Json;
    metrics: Json;
    attainment?: Json;
    metadata?: Json;
  }>
): Promise<{ count: number }> {
  requireTenantId(tenantId);
  const supabase = createClient();
  const insertRows: CalcResultInsert[] = results.map(r => ({
    tenant_id: tenantId,
    batch_id: batchId,
    entity_id: r.entityId,
    rule_set_id: r.ruleSetId || null,
    period_id: r.periodId || null,
    total_payout: r.totalPayout,
    components: r.components,
    metrics: r.metrics,
    attainment: r.attainment || ({} as Json),
    metadata: r.metadata || ({} as Json),
  }));

  // Batch insert in chunks of 500
  const CHUNK_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < insertRows.length; i += CHUNK_SIZE) {
    const chunk = insertRows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from('calculation_results').insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }

  // Update batch entity count
  await supabase
    .from('calculation_batches')
    .update({ entity_count: inserted } as CalcBatchUpdate)
    .eq('id', batchId);

  return { count: inserted };
}

/**
 * Get calculation results for a batch.
 */
export async function getCalculationResults(
  tenantId: string,
  batchId: string
): Promise<CalcResultRow[]> {
  requireTenantId(tenantId);
  const supabase = createClient();
  const { data, error } = await supabase
    .from('calculation_results')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('batch_id', batchId);
  if (error) throw error;
  return (data || []) as CalcResultRow[];
}

/**
 * Get calculation results for an entity across all batches.
 */
export async function getEntityResults(
  tenantId: string,
  entityId: string,
  options?: { periodId?: string }
): Promise<CalcResultRow[]> {
  requireTenantId(tenantId);
  const supabase = createClient();
  let query = supabase
    .from('calculation_results')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  if (options?.periodId) query = query.eq('period_id', options.periodId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as CalcResultRow[];
}

// ──────────────────────────────────────────────
// Calculation Traces
// ──────────────────────────────────────────────

/**
 * Write calculation traces for debugging.
 */
export async function writeCalculationTraces(
  tenantId: string,
  traces: Array<{
    resultId: string;
    componentName: string;
    formula?: string;
    inputs: Json;
    output: Json;
    steps?: Json;
  }>
): Promise<void> {
  requireTenantId(tenantId);
  const supabase = createClient();
  const insertRows: CalcTraceInsert[] = traces.map(t => ({
    tenant_id: tenantId,
    result_id: t.resultId,
    component_name: t.componentName,
    formula: t.formula || null,
    inputs: t.inputs,
    output: t.output,
    steps: t.steps || ([] as Json),
  }));

  // Batch insert
  const CHUNK_SIZE = 500;
  for (let i = 0; i < insertRows.length; i += CHUNK_SIZE) {
    const chunk = insertRows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from('calculation_traces').insert(chunk);
    if (error) throw error;
  }
}

/**
 * Get traces for a specific result.
 */
export async function getCalculationTraces(
  tenantId: string,
  resultId: string
): Promise<Array<Database['public']['Tables']['calculation_traces']['Row']>> {
  requireTenantId(tenantId);
  const supabase = createClient();
  const { data, error } = await supabase
    .from('calculation_traces')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('result_id', resultId);
  if (error) throw error;
  return (data || []) as Array<Database['public']['Tables']['calculation_traces']['Row']>;
}

// ──────────────────────────────────────────────
// Entity Period Outcomes Materialization
// ──────────────────────────────────────────────

/**
 * Materialize entity_period_outcomes for a period.
 *
 * Triggered on lifecycle transitions (OFFICIAL, APPROVED, POSTED, PUBLISHED).
 * For each entity in the batch:
 * 1. Read all calculation_results for the entity in this period
 * 2. Aggregate: total_payout, per-rule-set breakdown, lowest lifecycle state
 * 3. Write/update entity_period_outcomes (upsert by tenant+entity+period)
 */
export async function materializeEntityPeriodOutcomes(
  tenantId: string,
  periodId: string,
  batchId: string
): Promise<EntityPeriodOutcomeRow[]> {
  requireTenantId(tenantId);
  const supabase = createClient();

  // Read all results for this batch
  const { data: batchResults, error: resErr } = await supabase
    .from('calculation_results')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('batch_id', batchId);
  if (resErr) throw resErr;

  // Read current batch lifecycle state
  const batch = await getCalculationBatch(tenantId, batchId);
  const batchLifecycleState = (batch?.lifecycle_state || 'DRAFT') as LifecycleState;

  // Group results by entity
  const entityMap = new Map<string, CalcResultRow[]>();
  for (const result of (batchResults || [])) {
    const existing = entityMap.get(result.entity_id) || [];
    existing.push(result as CalcResultRow);
    entityMap.set(result.entity_id, existing);
  }

  const outcomes: EntityPeriodOutcomeRow[] = [];

  for (const [entityId, results] of Array.from(entityMap.entries())) {
    // Aggregate total payout
    const totalPayout = results.reduce((sum, r) => sum + (r.total_payout || 0), 0);

    // Build per-rule-set breakdown
    const ruleSetBreakdown: Array<{ rule_set_id: string; total_payout: number; components: Json }> = [];
    const ruleSetMap = new Map<string, { total: number; components: Json[] }>();
    for (const r of results) {
      const rsId = r.rule_set_id || 'unknown';
      const existing = ruleSetMap.get(rsId) || { total: 0, components: [] };
      existing.total += r.total_payout || 0;
      existing.components.push(r.components);
      ruleSetMap.set(rsId, existing);
    }
    for (const [rsId, data] of Array.from(ruleSetMap.entries())) {
      ruleSetBreakdown.push({
        rule_set_id: rsId,
        total_payout: data.total,
        components: data.components as unknown as Json,
      });
    }

    // Build component breakdown (flatten all components)
    const allComponents = results.flatMap(r => {
      const comps = r.components;
      return Array.isArray(comps) ? comps : [];
    });

    const lowestLifecycleState = batchLifecycleState;

    const outcome: Omit<EntityPeriodOutcomeRow, 'id'> & { id?: string } = {
      tenant_id: tenantId,
      entity_id: entityId,
      period_id: periodId,
      total_payout: totalPayout,
      rule_set_breakdown: ruleSetBreakdown as unknown as Json,
      component_breakdown: allComponents as unknown as Json,
      lowest_lifecycle_state: lowestLifecycleState,
      attainment_summary: (results[0]?.attainment || {}) as Json,
      metadata: {} as Json,
      materialized_at: new Date().toISOString(),
    };
    outcomes.push(outcome as EntityPeriodOutcomeRow);
  }

  // Upsert: delete existing for this period, then insert new
  if (outcomes.length > 0) {
    await supabase
      .from('entity_period_outcomes')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('period_id', periodId);

    const insertRows = outcomes.map(o => ({
      tenant_id: o.tenant_id,
      entity_id: o.entity_id,
      period_id: o.period_id,
      total_payout: o.total_payout,
      rule_set_breakdown: o.rule_set_breakdown,
      component_breakdown: o.component_breakdown,
      lowest_lifecycle_state: o.lowest_lifecycle_state,
      attainment_summary: o.attainment_summary,
      metadata: o.metadata,
    }));

    // Batch insert
    const CHUNK_SIZE = 500;
    for (let i = 0; i < insertRows.length; i += CHUNK_SIZE) {
      const chunk = insertRows.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from('entity_period_outcomes').insert(chunk);
      if (error) throw error;
    }
  }

  return outcomes;
}

/**
 * Get entity period outcomes for a period.
 */
export async function getEntityPeriodOutcomes(
  tenantId: string,
  periodId: string,
  options?: { entityId?: string }
): Promise<EntityPeriodOutcomeRow[]> {
  requireTenantId(tenantId);
  const supabase = createClient();
  let query = supabase
    .from('entity_period_outcomes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId);
  if (options?.entityId) query = query.eq('entity_id', options.entityId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as EntityPeriodOutcomeRow[];
}

/**
 * Get the outcome for a specific entity in a period.
 */
export async function getEntityOutcome(
  tenantId: string,
  entityId: string,
  periodId: string
): Promise<EntityPeriodOutcomeRow | null> {
  requireTenantId(tenantId);
  const supabase = createClient();
  const { data, error } = await supabase
    .from('entity_period_outcomes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entityId)
    .eq('period_id', periodId)
    .single();
  if (error) return null;
  return data as EntityPeriodOutcomeRow;
}

// ──────────────────────────────────────────────
// Dashboard KPIs — single call, correct tables
// ──────────────────────────────────────────────

export interface DashboardKPIs {
  ytdOutcome: number;
  avgAttainment: number;
  individualCount: number;
  pendingOutcomeTotal: number;
  pendingOutcomeCount: number;
}

/**
 * Fetch all dashboard KPI data in parallel from the correct tables.
 * Queries: entity_period_outcomes, calculation_results, entities.
 */
export async function getDashboardKPIs(tenantId: string): Promise<DashboardKPIs> {
  requireTenantId(tenantId);
  const supabase = createClient();

  const [outcomesRes, pendingRes, entityRes, batchRes] = await Promise.all([
    // YTD: all outcomes for this tenant
    supabase
      .from('entity_period_outcomes')
      .select('total_payout')
      .eq('tenant_id', tenantId),
    // Pending: APPROVED but not yet paid
    supabase
      .from('entity_period_outcomes')
      .select('total_payout')
      .eq('tenant_id', tenantId)
      .eq('lowest_lifecycle_state', 'APPROVED'),
    // Individual entity count
    supabase
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('entity_type', 'individual'),
    // Latest batch (for attainment)
    supabase
      .from('calculation_batches')
      .select('id')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const ytdOutcome =
    outcomesRes.data?.reduce((s, o) => s + (o.total_payout || 0), 0) || 0;
  const pendingOutcomeTotal =
    pendingRes.data?.reduce((s, o) => s + (o.total_payout || 0), 0) || 0;
  const pendingOutcomeCount = pendingRes.data?.length || 0;
  const individualCount = entityRes.count || 0;

  // Average attainment from latest batch results
  let avgAttainment = 0;
  if (batchRes.data?.[0]) {
    const { data: results } = await supabase
      .from('calculation_results')
      .select('attainment')
      .eq('tenant_id', tenantId)
      .eq('batch_id', batchRes.data[0].id);

    if (results && results.length > 0) {
      const values = results
        .map(r => {
          const att = r.attainment as Record<string, unknown> | null;
          if (!att) return null;
          const v = typeof att.overall === 'number' ? att.overall : typeof att.store === 'number' ? att.store : null;
          return v;
        })
        .filter((a): a is number => a !== null && a > 0);

      if (values.length > 0) {
        avgAttainment = Math.round(
          (values.reduce((s, a) => s + a, 0) / values.length) * 100
        );
      }
    }
  }

  return { ytdOutcome, avgAttainment, individualCount, pendingOutcomeTotal, pendingOutcomeCount };
}

// ──────────────────────────────────────────────
// Pulse sidebar counts — lightweight queries
// ──────────────────────────────────────────────

export async function getProfileCount(tenantId: string): Promise<number> {
  requireTenantId(tenantId);
  const supabase = createClient();
  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  return count || 0;
}

export async function getBatchCountToday(tenantId: string): Promise<number> {
  requireTenantId(tenantId);
  const supabase = createClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('calculation_batches')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', todayStart.toISOString());
  return count || 0;
}

export async function getTenantCount(): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from('tenants')
    .select('*', { count: 'exact', head: true });
  return count || 0;
}
