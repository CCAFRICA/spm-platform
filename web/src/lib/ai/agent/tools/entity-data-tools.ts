/**
 * OB-212 N3 — shared, read-only entity-data tools for the agent runtime.
 *
 * Above the Deterministic Calculation Boundary (Decision 158): every handler only
 * SELECTs facts and returns them; none writes a calculation table. Tool names, params
 * and the metadata keys referenced are structural (Korean Test) — no domain literals.
 *
 * Read store is calculation_results.metadata, per OB-212_RECON_RESPEC.md (NOT the empty
 * calculation_traces): binding_snapshot.convergence_bindings_used (lookup/column/scale),
 * roundingTrace.components (name + raw/rounded + precision), intentTraces.finalOutcome
 * (the rest of intentTraces is hollow — do not use). SQL-Verify gate (FP-49): the read
 * shapes below were confirmed against real BCL + Meridian rows before authoring.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentToolDefinition } from '../../types';

export interface ToolContext {
  /** service-role client (RLS-bypassing); the route owns it and scopes every query by tenantId. */
  supabase: SupabaseClient;
  tenantId: string;
}
export type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;
export interface ToolBundle {
  definitions: AgentToolDefinition[];
  handlers: Record<string, ToolHandler>;
}

/** Dynamic-JSONB helpers — keep the handlers `any`-free (lint: no-explicit-any). */
export type Rec = Record<string, unknown>;
export const asRec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
export const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const str = (v: unknown): string => (v == null ? '' : String(v)).trim();
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve an entity reference (external id like 'BCL-5027' OR a uuid) to {id, external_id, name}. */
export async function resolveEntity(
  ctx: ToolContext,
  ref: string,
): Promise<{ id: string; external_id: string; name: string } | null> {
  const r = str(ref);
  if (!r) return null;
  let q = await ctx.supabase
    .from('entities')
    .select('id, external_id, display_name')
    .eq('tenant_id', ctx.tenantId)
    .eq('external_id', r)
    .limit(1);
  if (!q.data?.length && UUID_RE.test(r)) {
    q = await ctx.supabase
      .from('entities')
      .select('id, external_id, display_name')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', r)
      .limit(1);
  }
  const e = q.data?.[0] as { id: string; external_id: string | null; display_name: string | null } | undefined;
  return e ? { id: e.id, external_id: e.external_id ?? e.id, name: e.display_name ?? '' } : null;
}

// ---------------- get_entity_calculation_trace ----------------
async function getEntityCalculationTrace(ctx: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const entityRef = str(input.entity_id);
  const batchId = str(input.batch_id);
  const componentIndex = input.component_index == null || input.component_index === '' ? null : Number(input.component_index);
  if (!entityRef || !batchId) return { error: 'entity_id and batch_id are required' };

  const ent = await resolveEntity(ctx, entityRef);
  if (!ent) return { error: `entity not found in tenant: ${entityRef}` };

  const { data, error } = await ctx.supabase
    .from('calculation_results')
    .select('total_payout, components, metrics, attainment, metadata')
    .eq('tenant_id', ctx.tenantId)
    .eq('batch_id', batchId)
    .eq('entity_id', ent.id)
    .limit(1);
  if (error) return { error: `calculation_results read failed: ${error.message}` };
  const row = asRec(data?.[0]);
  if (!data?.length) return { error: `no calculation_results for entity ${ent.external_id} in batch ${batchId}` };

  // rule_set_id + period_id from the batch so the agent can call get_component_intent_structure next.
  const { data: batchRows } = await ctx.supabase
    .from('calculation_batches')
    .select('rule_set_id, period_id')
    .eq('id', batchId)
    .limit(1);
  const batch = asRec(batchRows?.[0]);

  const md = asRec(row.metadata);
  const bs = asRec(md.binding_snapshot);
  const bindings = asRec(bs.convergence_bindings_used);
  const vconf = asRec(bs.verification_confidences);
  const roundComps = asArr(asRec(md.roundingTrace).components).map(asRec);
  const intentTraces = asArr(md.intentTraces).map(asRec);
  const topComps = asArr(row.components).map(asRec);

  const buildComp = (i: number) => {
    const rc: Rec = roundComps.find((c) => Number(c.componentIndex) === i) ?? roundComps[i] ?? {};
    const tc: Rec = topComps[i] ?? {};
    const it: Rec = intentTraces.find((c) => Number(c.componentIndex) === i) ?? intentTraces[i] ?? {};
    const slot = `component_${i}`;
    return {
      componentIndex: i,
      componentId: tc.componentId ?? tc.id ?? null,
      name: rc.label ?? tc.componentName ?? tc.name ?? null,
      payout: tc.payout ?? tc.outputValue ?? it.finalOutcome ?? null,
      finalOutcome: it.finalOutcome ?? null, // intentTraces hollow except finalOutcome (RECON_RESPEC §1c)
      rawValue: rc.rawValue ?? null,
      roundedValue: rc.roundedValue ?? null,
      roundingAdjustment: rc.roundingAdjustment ?? null,
      precision: rc.precision ?? null,
      bindings: bindings[slot] ?? null, // best-effort: binding slot component_<index>
      verification_confidence: vconf[slot] ?? null,
    };
  };

  const n = Math.max(roundComps.length, topComps.length);
  const components = componentIndex != null && !Number.isNaN(componentIndex)
    ? [buildComp(componentIndex)]
    : Array.from({ length: n }, (_, i) => buildComp(i));

  return {
    entity: { entity_id: ent.id, external_id: ent.external_id, name: ent.name },
    batch_id: batchId,
    rule_set_id: batch.rule_set_id ?? null,
    period_id: batch.period_id ?? null,
    total_payout: row.total_payout ?? null,
    attainment: row.attainment ?? null,
    metrics: row.metrics ?? null,
    engine_version: bs.engine_version ?? null,
    calculation_run_id: bs.calculation_run_id ?? null,
    components,
    binding_snapshot: {
      // full map kept so the agent can correlate when per-index attach is ambiguous (variant tenants
      // can have more binding slots than emitted components — e.g. BCL: 8 slots, 4 emitted).
      all_binding_slots: bindings,
      verification_confidences: vconf,
      corrections_in_this_run: bs.corrections_in_this_run ?? [],
      structural_exceptions_in_this_run: bs.structural_exceptions_in_this_run ?? [],
    },
    note: 'intentTraces are hollow except finalOutcome; per-component bindings attach slot component_<index> best-effort — see binding_snapshot.all_binding_slots for the full map.',
  };
}

// ---------------- get_entity_committed_data ----------------
async function getEntityCommittedData(ctx: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const entityRef = str(input.entity_id);
  if (!entityRef) return { error: 'entity_id is required' };
  const ent = await resolveEntity(ctx, entityRef);
  if (!ent) return { error: `entity not found in tenant: ${entityRef}` };

  let q = ctx.supabase
    .from('committed_data')
    .select('data_type, period_id, row_data')
    .eq('tenant_id', ctx.tenantId)
    .eq('entity_id', ent.id);
  if (input.period_id) q = q.eq('period_id', str(input.period_id));
  if (input.data_type) q = q.eq('data_type', str(input.data_type));
  const { data, error } = await q.limit(25);
  if (error) return { error: `committed_data read failed: ${error.message}` };
  return { entity: { external_id: ent.external_id }, count: data?.length ?? 0, rows: data ?? [] };
}

const definitions: AgentToolDefinition[] = [
  {
    name: 'get_entity_calculation_trace',
    description:
      'Read the engine calculation trace for ONE entity in ONE calculation batch: per-component payout, raw vs rounded value, rounding adjustment and precision, the convergence binding forensic (which source column / lookup / scale fed each component) and its verification confidence. Also returns the batch rule_set_id and period_id. Read-only.',
    input_schema: {
      type: 'object',
      properties: {
        entity_id: { type: 'string', description: 'entity reference — external id (e.g. an entity code) or uuid' },
        batch_id: { type: 'string', description: 'calculation batch id (the platform batch being reconciled)' },
        component_index: { type: 'number', description: 'optional: restrict the trace to a single component index' },
      },
      required: ['entity_id', 'batch_id'],
    },
  },
  {
    name: 'get_entity_committed_data',
    description:
      'Read bounded committed source rows for an entity (optionally filtered by period and data type) — the underlying imported facts behind a calculation. Read-only.',
    input_schema: {
      type: 'object',
      properties: {
        entity_id: { type: 'string', description: 'entity reference — external id or uuid' },
        period_id: { type: 'string', description: 'optional period id filter' },
        data_type: { type: 'string', description: 'optional data_type filter' },
      },
      required: ['entity_id'],
    },
  },
];

/** Build the shared entity-data tool bundle bound to a tenant-scoped context. */
export function createEntityDataTools(ctx: ToolContext): ToolBundle {
  return {
    definitions,
    handlers: {
      get_entity_calculation_trace: (i) => getEntityCalculationTrace(ctx, i),
      get_entity_committed_data: (i) => getEntityCommittedData(ctx, i),
    },
  };
}
