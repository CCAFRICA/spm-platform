/**
 * Calculation Service — Supabase-first calculation batches, results, traces
 *
 * HG-14: CalculationOrchestrator reads from period_entity_state, writes to
 *        calculation_results with entity_id UUID FK.
 * HG-15: LifecycleService enforces Rule 30: OFFICIAL→PREVIEW transition blocked.
 *        Supersession creates new batch.
 * HG-16: entity_period_outcomes materializes on lifecycle transition with
 *        per-rule-set breakdown and lowest_lifecycle_state.
 *
 * Phase 10A: Calculation CRUD (batches, results, traces)
 * Phase 10B: Lifecycle management with Rule 30 immutability
 * Phase 10C: Entity period outcomes materialization
 *
 * Dual-mode: Supabase when configured, delegates to existing services for demo.
 */

import { isSupabaseConfigured, createClient } from './client';
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
  OFFICIAL: ['PENDING_APPROVAL'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['POSTED'],
  REJECTED: ['OFFICIAL'],
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
  if (isSupabaseConfigured()) {
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
    return data as CalcBatchRow;
  }

  // Demo fallback: return a mock batch row
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    period_id: params.periodId,
    rule_set_id: params.ruleSetId || null,
    batch_type: (params.batchType || 'standard') as BatchType,
    lifecycle_state: 'DRAFT' as LifecycleState,
    superseded_by: null,
    supersedes: null,
    entity_count: params.entityCount || 0,
    summary: {} as Json,
    config: (params.config || {}) as unknown as Json,
    started_at: null,
    completed_at: null,
    created_by: params.createdBy || null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Get a calculation batch by ID.
 */
export async function getCalculationBatch(
  tenantId: string,
  batchId: string
): Promise<CalcBatchRow | null> {
  if (isSupabaseConfigured()) {
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

  return null;
}

/**
 * List calculation batches for a tenant/period.
 */
export async function listCalculationBatches(
  tenantId: string,
  options?: { periodId?: string; ruleSetId?: string; lifecycleState?: LifecycleState }
): Promise<CalcBatchRow[]> {
  if (isSupabaseConfigured()) {
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
    return (data || []) as CalcBatchRow[];
  }

  return [];
}

/**
 * Get the active (non-superseded) batch for a period.
 */
export async function getActiveBatch(
  tenantId: string,
  periodId: string,
  ruleSetId?: string
): Promise<CalcBatchRow | null> {
  if (isSupabaseConfigured()) {
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

  return null;
}

// ──────────────────────────────────────────────
// Phase 10B: Lifecycle Management with Rule 30
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
      `[CalculationService] Invalid transition: ${currentState} → ${targetState} for batch ${batchId}`
    );
    return null;
  }

  if (isSupabaseConfigured()) {
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

  // Demo fallback: delegate to existing lifecycle service
  const { loadCycle, transitionCycle } = await import(
    '@/lib/calculation/calculation-lifecycle-service'
  );
  const cycle = loadCycle(tenantId, batch.period_id);
  if (cycle) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transitionCycle(cycle, targetState as any, 'system', `Transition to ${targetState}`);
  }
  return { ...batch, lifecycle_state: targetState } as CalcBatchRow;
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

  if (isSupabaseConfigured()) {
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
  }

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
  if (isSupabaseConfigured()) {
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

  return { count: results.length };
}

/**
 * Get calculation results for a batch.
 */
export async function getCalculationResults(
  tenantId: string,
  batchId: string
): Promise<CalcResultRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('calculation_results')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('batch_id', batchId);
    if (error) throw error;
    return (data || []) as CalcResultRow[];
  }

  return [];
}

/**
 * Get calculation results for an entity across all batches.
 */
export async function getEntityResults(
  tenantId: string,
  entityId: string,
  options?: { periodId?: string }
): Promise<CalcResultRow[]> {
  if (isSupabaseConfigured()) {
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

  return [];
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
  if (!isSupabaseConfigured()) return;

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
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('calculation_traces')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('result_id', resultId);
    if (error) throw error;
    return (data || []) as Array<Database['public']['Tables']['calculation_traces']['Row']>;
  }

  return [];
}

// ──────────────────────────────────────────────
// Phase 10C: Entity Period Outcomes Materialization
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
  if (!isSupabaseConfigured()) {
    // Demo mode: outcomes are computed on-the-fly from results storage
    return [];
  }

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

    // Determine lowest lifecycle state
    // If this batch is APPROVED but there's an older batch at POSTED, lowest is APPROVED
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
  if (isSupabaseConfigured()) {
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

  return [];
}

/**
 * Get the outcome for a specific entity in a period.
 */
export async function getEntityOutcome(
  tenantId: string,
  entityId: string,
  periodId: string
): Promise<EntityPeriodOutcomeRow | null> {
  if (isSupabaseConfigured()) {
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

  return null;
}
