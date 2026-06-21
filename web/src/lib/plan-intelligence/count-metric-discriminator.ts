/**
 * HF-322 — Construction-layer count-vs-metric discriminator.
 *
 * Decision 158 boundary: the LLM RECOGNIZES ("$25 per cross-sold product" → an
 * aggregate over a field) but cannot CONSTRUCT the structural distinction between
 * "count the rows" and "read the field's value". This deterministic pre-pass applies
 * that distinction using DATA PROPERTIES of the tenant's committed_data — never field
 * names, compensation patterns, or plan language (C1 / C7 / Korean Test).
 *
 * THE STRUCTURAL SIGNAL (token-free, language-free):
 *   A counting aggregate is overridden to a metric reference when, in the tenant's
 *   committed_data, `count` is STRUCTURALLY DEGENERATE — the transactional rows form a
 *   one-row-per-(entity, period) grid (rowCount === entityCount × periodCount), so a
 *   `count` over any entity-period group is invariably 1 and can NEVER express a varying
 *   per-period payout — AND the data contains at least one varying-numeric MEASURE column
 *   (so reading a value is meaningful). In that regime the LLM's count-of-rows is a
 *   mis-constructed read-the-value; we flip it to `metric` (a reference prime), preserving
 *   the field token so the calc-time convergence binding still resolves it to the real
 *   column and sums it (HF-322 R3: a prime_dag reference reads the per-entity binding-summed
 *   scalar → varies by period; `metric` is the correct target, NOT aggregate/sum, because a
 *   sum prime reads the raw row_data key which the LLM token does not match).
 *
 * WHY NOT "query the named field directly" (the directive's literal wording): the intent's
 * field is an LLM-invented SEMANTIC TOKEN (e.g. `cross_sold_products`) that appears in ZERO
 * committed_data column keys — the physical column (`Cantidad_Productos_Cruzados`) is linked
 * only by a free-text `field_identities.contextualIdentity` string (Korean-Test-forbidden)
 * or by the calc-time convergence LLM. There is no deterministic, language-free token→column
 * map at construction time (bridgeAIToEngineFormat persists inputBindings:{}). So the
 * discriminator decides WHETHER to flip using a token-free data property (count degeneracy)
 * and lets convergence — which already resolves the token at calc time — do the resolution.
 * This naturally spares legitimate multi-row counts (e.g. MIR P4 count-of-verified-clients):
 * a multi-row tenant is NOT a one-row grid, so the override never fires there.
 *
 * Constraints honored: C2 (construction-time, queries committed_data; additive-only when no
 * data context), C3 (no prompt change), C4 (engine/resolver untouched — only the intent is
 * mutated upstream of constructTree), C5 (additive — constructTree + buildReferenceNode + the
 * banded_lookup/arithmetic/conditional/composed paths are unchanged), C7 (no enumerated
 * "metric fields" list — the test is complete-by-construction against the actual data).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CompositionalIntent } from './compositional-intent';

export interface TenantDataShape {
  /** transactional committed_data row count (excludes data_type='entity') */
  rowCount: number;
  entityCount: number;
  periodCount: number;
  /** rowCount === entityCount × periodCount (all > 0) → count is degenerate (always 1 per group) */
  oneRowPerEntityPeriodGrid: boolean;
  /** ≥1 committed_data column holds varying numeric values (distinct>2, span>1, not a 0/1 flag) */
  hasVaryingNumericMeasure: boolean;
}

export interface DiscriminatorResult {
  applied: boolean;
  /** field tokens whose count→metric override fired (for logging / PG evidence) */
  overriddenFields: string[];
  shape: TenantDataShape | null;
  skippedReason?: string;
}

// Per-tenant memo: the data shape is invariant across a plan's components + retries, and
// callPlanComponentWithRetry runs once per component under bounded concurrency + a retry loop,
// so without this the committed_data scan would fire N(components)×M(attempts)×parallel times.
const shapeCache = new Map<string, TenantDataShape | null>();

/** Clear the memo (tests / long-lived processes where committed_data may change between imports). */
export function _clearDataShapeCache(): void {
  shapeCache.clear();
}

const NUMERIC_PROFILE_SAMPLE = 1000;

function isVaryingNumericMeasure(values: unknown[]): boolean {
  let numericCount = 0;
  let min = Infinity;
  let max = -Infinity;
  const distinct = new Set<number>();
  for (const v of values) {
    if (v === '' || v === null || v === undefined) continue;
    const num = Number(v);
    if (Number.isNaN(num)) continue;
    numericCount++;
    distinct.add(num);
    if (num < min) min = num;
    if (num > max) max = num;
  }
  if (numericCount < values.length * 0.8) return false; // predominantly numeric column
  if (distinct.size <= 2) return false;                 // constant or binary → not a varying measure
  if (max - min <= 1) return false;                     // degenerate spread
  if (min === 0 && max === 1) return false;             // 0/1 flag
  return true;
}

async function profileTenantDataShape(
  tenantId: string,
  supabase: SupabaseClient,
): Promise<TenantDataShape | null> {
  const [{ count: entityCount }, { count: periodCount }, { count: rowCount }] = await Promise.all([
    supabase.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('periods').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('committed_data').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).neq('data_type', 'entity'),
  ]);

  const ec = entityCount ?? 0;
  const pc = periodCount ?? 0;
  const rc = rowCount ?? 0;

  const oneRowPerEntityPeriodGrid = ec > 0 && pc > 0 && rc > 0 && rc === ec * pc;

  // Profile numeric columns over a sample to confirm a varying measure exists.
  let hasVaryingNumericMeasure = false;
  const { data: sample } = await supabase.from('committed_data')
    .select('row_data').eq('tenant_id', tenantId).neq('data_type', 'entity')
    .limit(NUMERIC_PROFILE_SAMPLE);
  if (sample && sample.length > 0) {
    const columns = new Map<string, unknown[]>();
    for (const r of sample) {
      const rd = (r.row_data ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(rd)) {
        if (k.startsWith('_')) continue; // skip structural keys (_sheetName, etc.)
        let arr = columns.get(k);
        if (!arr) { arr = []; columns.set(k, arr); }
        arr.push(v);
      }
    }
    for (const values of Array.from(columns.values())) {
      if (isVaryingNumericMeasure(values)) { hasVaryingNumericMeasure = true; break; }
    }
  }

  return { rowCount: rc, entityCount: ec, periodCount: pc, oneRowPerEntityPeriodGrid, hasVaryingNumericMeasure };
}

async function getTenantDataShape(
  tenantId: string,
  supabase: SupabaseClient,
): Promise<TenantDataShape | null> {
  if (shapeCache.has(tenantId)) return shapeCache.get(tenantId)!;
  const shape = await profileTenantDataShape(tenantId, supabase);
  shapeCache.set(tenantId, shape);
  return shape;
}

/**
 * Recursively flip every counting-aggregate reference source to a metric reference.
 * Matches a ReferenceSource of shape {type:'aggregate', op:'count', field:<named>} wherever
 * it sits in the intent (operands, banded_lookup dims, conditional references, nested
 * structures) — purely structurally, never by the field's name/value.
 */
function overrideDegenerateCounts(node: unknown, overridden: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) overrideDegenerateCounts(child, overridden);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;

  if (
    obj.type === 'aggregate' &&
    obj.op === 'count' &&
    typeof obj.field === 'string' &&
    obj.field !== '' &&
    obj.field !== '*'
  ) {
    // Flip count-of-rows → read-the-value. Preserve `field` (the convergence binding resolves
    // the token at calc time); a metric ReferenceSource is exactly {type:'metric', field}.
    overridden.push(obj.field);
    obj.type = 'metric';
    delete obj.op;
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') overrideDegenerateCounts(value, overridden);
  }
}

/**
 * Apply the count-vs-metric discriminator to a CompositionalIntent IN PLACE, before
 * constructTree. Never throws — any error / missing data context leaves `intent` byte-identical
 * (additive-only). Returns a small report for logging / proof-gate evidence.
 *
 * @param intent   the LLM's CompositionalIntent (mutated in place on override)
 * @param tenantId the importing tenant (from signalContext.tenantId at the call site)
 * @param supabase optional injected client (tests); a service-role client is built otherwise
 */
export async function applyCountMetricDiscriminator(
  intent: CompositionalIntent,
  tenantId: string,
  supabase?: SupabaseClient,
): Promise<DiscriminatorResult> {
  try {
    if (!tenantId) return { applied: false, overriddenFields: [], shape: null, skippedReason: 'no tenantId' };

    const client = supabase
      ?? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false },
      });

    const shape = await getTenantDataShape(tenantId, client);

    // Additive-only: no committed_data context, or count is NOT degenerate, or no varying
    // measure to read → leave the LLM emission unchanged.
    if (!shape) return { applied: false, overriddenFields: [], shape: null, skippedReason: 'no data shape' };
    if (!shape.oneRowPerEntityPeriodGrid) {
      return { applied: false, overriddenFields: [], shape, skippedReason: 'count not degenerate (not a one-row grid)' };
    }
    if (!shape.hasVaryingNumericMeasure) {
      return { applied: false, overriddenFields: [], shape, skippedReason: 'no varying-numeric measure column' };
    }

    const overriddenFields: string[] = [];
    overrideDegenerateCounts(intent, overriddenFields);
    return { applied: overriddenFields.length > 0, overriddenFields, shape };
  } catch (err) {
    // Construction must never abort on a discriminator/DB error. Leave the intent unchanged.
    console.warn('[count-metric-discriminator] no-op on error:', err instanceof Error ? err.message : err);
    return { applied: false, overriddenFields: [], shape: null, skippedReason: 'error (no-op)' };
  }
}
