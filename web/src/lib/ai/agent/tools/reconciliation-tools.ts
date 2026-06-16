/**
 * OB-212 N4 — reconciliation-specific, read-only tools for the diagnosis agent.
 *
 * Above the Deterministic Calculation Boundary: read-only. Structural names only (Korean Test).
 * Reads reconciliation_sessions.results.employees (the user-uploaded benchmark deltas) and
 * rule_sets.components (the component intent structure). check_boundary_resolution is a PURE
 * function (no DB). SQL-Verify gate (FP-49): shapes confirmed against session 120b50ad and the
 * BCL rule_set (variant-nested {variants:[{variantId, components:[{id,name,metadata.intent}]}]}).
 */
import type { AgentToolDefinition } from '../../types';
import {
  type ToolContext,
  type ToolBundle,
  type Rec,
  asRec,
  asArr,
  str,
  UUID_RE,
  resolveEntity,
} from './entity-data-tools';

// ---------------- get_benchmark_value ----------------
async function getBenchmarkValue(ctx: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const sessionId = str(input.reconciliation_session_id);
  const entityRef = str(input.entity_id);
  const componentName = input.component_name ? str(input.component_name) : null;
  if (!sessionId || !entityRef) return { error: 'reconciliation_session_id and entity_id are required' };

  const { data, error } = await ctx.supabase
    .from('reconciliation_sessions')
    .select('results, batch_id, period_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', sessionId)
    .limit(1);
  if (error) return { error: `reconciliation_sessions read failed: ${error.message}` };
  const sessionRow = asRec(data?.[0]);
  const employees = asArr(asRec(sessionRow.results).employees).map(asRec);

  let emp = employees.find((e) => str(e.entityId) === entityRef);
  if (!emp && UUID_RE.test(entityRef)) {
    const ent = await resolveEntity(ctx, entityRef);
    if (ent) emp = employees.find((e) => str(e.entityId) === ent.external_id);
  }
  if (!emp) return { error: `entity ${entityRef} not found in reconciliation session ${sessionId}` };

  let comps = asArr(emp.components).map(asRec).map((c) => ({
    componentId: c.componentId,
    componentName: c.componentName,
    fileValue: c.fileValue,
    vlValue: c.vlValue,
    delta: c.delta,
    deltaPercent: c.deltaPercent,
    flag: c.flag,
  }));
  if (componentName) comps = comps.filter((c) => str(c.componentName).toLowerCase() === componentName.toLowerCase());

  return {
    entityId: emp.entityId,
    batch_id: sessionRow.batch_id ?? null, // the platform batch — pass to get_entity_calculation_trace
    period_id: sessionRow.period_id ?? null,
    population: emp.population,
    fileTotal: emp.fileTotal,
    vlTotal: emp.vlTotal,
    totalDelta: emp.totalDelta,
    totalDeltaPercent: emp.totalDeltaPercent,
    totalFlag: emp.totalFlag,
    components: comps,
    note: 'fileValue = uploaded expected/benchmark; vlValue = engine (platform) calculation. Use batch_id with get_entity_calculation_trace to drill into the engine forensic.',
  };
}

// ---------------- get_component_intent_structure ----------------
async function getComponentIntentStructure(ctx: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const ruleSetId = str(input.rule_set_id);
  const idx = Number(input.component_index);
  const variantId = input.variant_id ? str(input.variant_id) : null;
  if (!ruleSetId || Number.isNaN(idx)) return { error: 'rule_set_id and component_index (number) are required' };

  const { data, error } = await ctx.supabase
    .from('rule_sets')
    .select('components, name')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', ruleSetId)
    .limit(1);
  if (error) return { error: `rule_sets read failed: ${error.message}` };
  if (!data?.length) return { error: `rule_set ${ruleSetId} not found` };
  const rsRow = asRec(data[0]);
  const comps = rsRow.components;

  const variants: Rec[] = Array.isArray(comps)
    ? [{ variantId: '(flat)', components: comps }]
    : asArr(asRec(comps).variants).map(asRec);
  const out = variants
    .filter((v) => !variantId || str(v.variantId) === variantId)
    .map((v) => {
      const cp = asRec(asArr(v.components)[idx]);
      return asArr(v.components)[idx]
        ? { variantId: v.variantId, component: { id: cp.id, name: cp.name, order: cp.order, enabled: cp.enabled, intent: asRec(cp.metadata).intent ?? null } }
        : { variantId: v.variantId, component: null };
    });
  return { rule_set_id: ruleSetId, rule_set_name: rsRow.name ?? null, component_index: idx, variants: out };
}

// ---------------- find_entities_with_similar_delta ----------------
async function findEntitiesWithSimilarDelta(ctx: ToolContext, input: Record<string, unknown>): Promise<unknown> {
  const sessionId = str(input.reconciliation_session_id);
  const which = str(input.component_index_or_name); // '', 'total', a component name, or a numeric index
  const min = Number(input.delta_range_min);
  const max = Number(input.delta_range_max);
  if (!sessionId || Number.isNaN(min) || Number.isNaN(max)) {
    return { error: 'reconciliation_session_id, delta_range_min and delta_range_max (numbers) are required' };
  }

  const { data, error } = await ctx.supabase
    .from('reconciliation_sessions')
    .select('results')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', sessionId)
    .limit(1);
  if (error) return { error: `reconciliation_sessions read failed: ${error.message}` };
  const employees = asArr(asRec(asRec(data?.[0]).results).employees).map(asRec).slice(0, 100);

  const deltaOf = (e: Rec): number | null => {
    if (which === '' || which.toLowerCase() === 'total') {
      return typeof e.totalDelta === 'number' ? e.totalDelta : null;
    }
    const cs = asArr(e.components).map(asRec);
    const byName = cs.find((c) => str(c.componentName).toLowerCase() === which.toLowerCase());
    if (byName) return typeof byName.delta === 'number' ? byName.delta : null;
    const i = Number(which);
    if (!Number.isNaN(i) && cs[i]) return typeof cs[i].delta === 'number' ? (cs[i].delta as number) : null;
    return null;
  };

  const hits = employees
    .filter((e) => e.population === 'matched')
    .map((e) => ({ entityId: e.entityId, delta: deltaOf(e) }))
    .filter((h) => h.delta != null && h.delta >= min && h.delta <= max);

  return {
    reconciliation_session_id: sessionId,
    criterion: which || 'total',
    delta_range: [min, max],
    count: hits.length,
    entities: hits.slice(0, 50),
  };
}

// ---------------- check_boundary_resolution (PURE — no DB) ----------------
function checkBoundaryResolution(input: Record<string, unknown>): unknown {
  const value = Number(input.value);
  const boundaries = asArr(input.boundaries)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  if (Number.isNaN(value)) return { error: 'value (number) is required' };
  if (!boundaries.length) return { error: 'boundaries (array of numbers) is required' };

  let bandIndex = 0;
  while (bandIndex < boundaries.length && value >= boundaries[bandIndex]) bandIndex++;
  let nearest = Infinity;
  let onEdge = false;
  for (const b of boundaries) {
    const d = Math.abs(value - b);
    if (d < nearest) nearest = d;
    if (d === 0) onEdge = true;
  }
  const nearBand = nearest <= Math.max(Math.abs(value) * 0.01, 1e-9);
  return {
    value,
    boundaries,
    bandIndex, // 0 = below first boundary; k = at/above boundary[k-1]
    onEdge,
    distanceToNearestEdge: nearest,
    decisiveness: onEdge
      ? 'on_boundary — inclusive/exclusive edge handling decides the band'
      : nearBand
        ? 'near_boundary — small input change could flip the band'
        : 'clear — value sits well inside a band',
  };
}

const definitions: AgentToolDefinition[] = [
  {
    name: 'get_benchmark_value',
    description:
      'Read the uploaded expected/benchmark values vs the engine values for ONE entity in a reconciliation session: total and per-component fileValue (expected), vlValue (engine), delta and flag. Optionally filter to one component. Read-only.',
    input_schema: {
      type: 'object',
      properties: {
        entity_id: { type: 'string', description: 'entity reference — external id (as stored in the session) or uuid' },
        reconciliation_session_id: { type: 'string', description: 'the reconciliation session id' },
        component_name: { type: 'string', description: 'optional: restrict to a single component by name' },
      },
      required: ['entity_id', 'reconciliation_session_id'],
    },
  },
  {
    name: 'get_component_intent_structure',
    description:
      'Read the intent structure (conditional / band / tier tree) for one component of a rule set, per variant. Use to understand how a component is supposed to resolve. Read-only.',
    input_schema: {
      type: 'object',
      properties: {
        rule_set_id: { type: 'string', description: 'rule set id (from get_entity_calculation_trace)' },
        component_index: { type: 'number', description: 'zero-based component index' },
        variant_id: { type: 'string', description: 'optional: restrict to one variant' },
      },
      required: ['rule_set_id', 'component_index'],
    },
  },
  {
    name: 'find_entities_with_similar_delta',
    description:
      'Scan the reconciliation session for matched entities whose delta (total, or a named/indexed component) falls in a range. Use to judge whether a discrepancy is isolated or systemic. Read-only.',
    input_schema: {
      type: 'object',
      properties: {
        reconciliation_session_id: { type: 'string' },
        component_index_or_name: { type: 'string', description: "'total', a component name, or a numeric index" },
        delta_range_min: { type: 'number' },
        delta_range_max: { type: 'number' },
      },
      required: ['reconciliation_session_id', 'component_index_or_name', 'delta_range_min', 'delta_range_max'],
    },
  },
  {
    name: 'check_boundary_resolution',
    description:
      'Pure helper: given a value and a set of band boundaries, return which band the value lands in and whether it sits on or near a boundary edge (edge-decisiveness). No data access.',
    input_schema: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        boundaries: { type: 'array', items: { type: 'number' }, description: 'band edges (any order)' },
      },
      required: ['value', 'boundaries'],
    },
  },
];

/** Build the reconciliation-specific tool bundle bound to a tenant-scoped context. */
export function createReconciliationTools(ctx: ToolContext): ToolBundle {
  return {
    definitions,
    handlers: {
      get_benchmark_value: (i) => getBenchmarkValue(ctx, i),
      get_component_intent_structure: (i) => getComponentIntentStructure(ctx, i),
      find_entities_with_similar_delta: (i) => findEntitiesWithSimilarDelta(ctx, i),
      check_boundary_resolution: async (i) => checkBoundaryResolution(i),
    },
  };
}
