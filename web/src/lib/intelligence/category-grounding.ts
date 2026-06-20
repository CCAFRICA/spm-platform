/**
 * OB-223 §1.7 — calc-time category value grounding (P1).
 *
 * A category-differentiated plan's DAG partitions an entity's transaction rows by a per-row attribute
 * (e.g. product Categoria) and applies a per-group rate. The interpreter emits this with PLAN-vocabulary
 * labels ("ALI", "BEB", "LIM", "CPE") — but the data stores the FULL values ("Alimentos", "Bebidas",
 * "Limpieza", "Cuidado Personal"). Filtering on "ALI" matches nothing → 0. Grounding maps the plan label
 * to the actual data value at CALC TIME (data guaranteed present; no file-sequence dependency), the same
 * class as column-name binding.
 *
 * This module is PURE + deterministic (unit-tested): the label→value matcher and the scope→filter DAG
 * rewrite. The DB distinct-value query + the per-tenant storage of the grounded DAG are wired by the
 * caller in convergence-service (architect-verified end-to-end on MIR re-import+calc, SR-44).
 *
 * Korean Test: the matcher takes (label, dataValues[]) and returns a value string — it knows nothing
 * about what the category means. No hardcoded category vocabulary.
 */

/** Normalize for comparison: lowercase, strip accents + non-alphanumerics. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}
/** Word-initials of a value, accent-stripped lowercase ("Cuidado Personal" → "cp"). */
function initials(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/).filter(Boolean).map(w => w[0]).join('');
}

/**
 * Map ONE plan label to ONE data value, deterministically. Ordered strategies, each requiring a UNIQUE
 * hit (ambiguous → fall through; nothing → null, never a guess — SR-34 structured non-match):
 *   1. exact / case-insensitive-exact
 *   2. label is a prefix of exactly one value ("ALI" → "Alimentos")
 *   3. label matches exactly one value's leading-letters ("CPE" ⊂ "cuidadopersonalespecial"… or
 *      label⊇ value-initials prefix, "CP"/"CPE" vs "Cuidado Personal")
 *   4. label is a substring of exactly one value
 */
export function matchPlanLabelToDataValue(label: string, dataValues: string[]): string | null {
  const nl = norm(label);
  if (!nl) return null;
  const uniq = (preds: (v: string) => boolean): string | null => {
    const hits = dataValues.filter(preds);
    return hits.length === 1 ? hits[0] : null;
  };
  // 1. exact (normalized)
  const exact = uniq(v => norm(v) === nl); if (exact) return exact;
  // 2. label is a prefix of the value
  const prefix = uniq(v => norm(v).startsWith(nl)); if (prefix) return prefix;
  // 3a. label equals the value's word-initials ("CP" === initials("Cuidado Personal"))
  const init = uniq(v => initials(v) === nl); if (init) return init;
  // 3b. the value's initials are a prefix of the label, or vice-versa ("CPE" vs "CP")
  const initPfx = uniq(v => { const iv = initials(v); return iv.length > 1 && (nl.startsWith(iv) || iv.startsWith(nl)); });
  if (initPfx) return initPfx;
  // 4. label is a substring of the value
  const sub = uniq(v => norm(v).includes(nl)); if (sub) return sub;
  return null;
}

/** Map every plan label to a data value; unmatched labels omitted (caller decides LLM fallback). */
export function groundCategoryLabels(labels: string[], dataValues: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const label of labels) {
    const v = matchPlanLabelToDataValue(label, dataValues);
    if (v !== null) out[label] = v;
  }
  return out;
}

type PrimeNode = Record<string, unknown>;
const isObj = (n: unknown): n is PrimeNode => !!n && typeof n === 'object';
const isConst = (n: unknown): n is { prime: 'constant'; value: number } =>
  isObj(n) && n.prime === 'constant' && typeof n.value === 'number';

/**
 * Rewrite `scope` prime nodes (the interpreter's misused per-row partition) to `filter→aggregate`,
 * grounding each branch's filter value. A category-differentiated DAG looks like:
 *   add( multiply(scope{boundary}→aggregate{op,field}, constant(rateA)),
 *        multiply(scope{boundary}→aggregate{op,field}, constant(rateB)), … )
 * Each branch's scope is identical (same boundary); the (category→rate) map in `categoryRates` pairs a
 * branch's rate constant to a plan label, which `labelToValue` grounds to a data value. The scope is
 * rewritten to `filter{field:boundary,operator:'eq',value:<grounded>}→<downstream aggregate>`.
 *
 * Returns the rewritten DAG (deep-cloned) + per-branch groundings. A scope whose rate has no matching
 * category, or whose label has no grounded value, is left UNCHANGED (never a wrong filter) and recorded
 * as ungrounded. Pure — no I/O.
 */
export function groundScopeDag(
  dag: unknown,
  categoryRates: Record<string, number>,
  labelToValue: Record<string, string>,
): { dag: unknown; groundings: Array<{ label: string; rate: number; value: string }>; ungrounded: number } {
  const groundings: Array<{ label: string; rate: number; value: string }> = [];
  let ungrounded = 0;
  // label whose rate ≈ r (first exact match); rates are plan constants, compared exactly.
  const labelForRate = (r: number): string | null => {
    const hit = Object.entries(categoryRates).find(([, v]) => v === r);
    return hit ? hit[0] : null;
  };
  const clone = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(clone);
    if (isObj(n)) { const o: PrimeNode = {}; for (const k of Object.keys(n)) o[k] = clone(n[k]); return o; }
    return n;
  };
  const out = clone(dag);

  // Find a scope node directly, OR the scope inside a multiply(scope, constant(rate)).
  const rewrite = (node: unknown, siblingRate: number | null): void => {
    if (Array.isArray(node)) { node.forEach(n => rewrite(n, siblingRate)); return; }
    if (!isObj(node)) return;

    // multiply(scope-bearing, constant(rate)) → recurse into the scope side carrying the rate.
    if (node.prime === 'arithmetic' && node.op === 'multiply' && Array.isArray(node.inputs) && node.inputs.length === 2) {
      const [a, b] = node.inputs as unknown[];
      const rate = isConst(a) ? a.value : isConst(b) ? b.value : null;
      rewrite(isConst(a) ? b : a, rate);
      // (the constant side has no scope; skip)
      return;
    }

    if (node.prime === 'scope' && typeof node.boundary === 'string' && isObj(node.downstream)) {
      const label = siblingRate !== null ? labelForRate(siblingRate) : null;
      const value = label !== null ? labelToValue[label] : undefined;
      if (label !== null && value !== undefined) {
        // Rewrite IN PLACE: this object becomes a filter wrapping its existing downstream.
        const downstream = node.downstream;
        const boundary = node.boundary;
        for (const k of Object.keys(node)) delete node[k];
        node.prime = 'filter';
        node.predicate = { field: boundary, operator: 'eq', value };
        node.downstream = downstream;
        groundings.push({ label, rate: siblingRate as number, value });
      } else {
        ungrounded += 1; // leave the scope node unchanged (no wrong filter)
      }
      return;
    }
    // recurse into children/inputs
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v) || isObj(v)) rewrite(v, null);
    }
  };
  rewrite(out, null);
  return { dag: out, groundings, ungrounded };
}

/** Collect the distinct `boundary` field names of every scope prime node in a DAG. Pure. */
export function extractScopeBoundaries(dag: unknown): string[] {
  const out = new Set<string>();
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!isObj(n)) return;
    if (n.prime === 'scope' && typeof n.boundary === 'string') out.add(n.boundary);
    for (const k of Object.keys(n)) walk(n[k]);
  };
  walk(dag);
  return Array.from(out);
}

/** Read a component's category→rate map from its metadata (a few known shapes). */
function readCategoryRates(component: Record<string, unknown>): Record<string, number> | null {
  const md = component.metadata as Record<string, unknown> | undefined;
  const ci = component.calculationIntent as Record<string, unknown> | undefined;
  const compIntent = md?.compositional_intent as Record<string, unknown> | undefined;
  const compIntentMeta = compIntent?.metadata as Record<string, unknown> | undefined;
  // Real MIR shape: metadata.compositional_intent.metadata.categoryRates. Also accept the shallower
  // variants for robustness across interpreter versions.
  const cand = (component.categoryRates ?? md?.categoryRates ?? ci?.categoryRates
    ?? compIntent?.categoryRates ?? compIntentMeta?.categoryRates) as unknown;
  if (cand && typeof cand === 'object' && !Array.isArray(cand)) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(cand as Record<string, unknown>)) if (typeof v === 'number') out[k] = v;
    return Object.keys(out).length > 0 ? out : null;
  }
  return null;
}

/**
 * OB-223 §1.7 integration: ground every component whose DAG contains `scope` nodes, IN PLACE (replaces
 * `calculationIntent` with the grounded filter→aggregate DAG). For each such component: read its boundary
 * field + categoryRates, fetch the data's distinct values via `distinctValuesFor` (caller supplies a
 * DB-backed or test fn), match plan labels→values, rewrite scope→filter. Components without scope nodes
 * are UNTOUCHED → BCL/Meridian byte-identical. `distinctValuesFor` decoupled from I/O → unit-testable.
 * Returns per-component grounding results. Calc-time path (data present); the grounded DAG is the value
 * the caller persists for reuse.
 */
export async function groundComponentDags(
  components: Array<Record<string, unknown>>,
  distinctValuesFor: (field: string) => Promise<string[]>,
): Promise<Array<{ name: string; grounded: number; ungrounded: number }>> {
  const results: Array<{ name: string; grounded: number; ungrounded: number }> = [];
  for (const component of components) {
    const dag = component.calculationIntent;
    if (!dagHasScopeNode(dag)) continue; // BCL/Meridian + already-filter DAGs: untouched
    const rates = readCategoryRates(component);
    const boundaries = extractScopeBoundaries(dag);
    if (!rates || boundaries.length === 0) { results.push({ name: String(component.name ?? '?'), grounded: 0, ungrounded: boundaries.length }); continue; }
    // Ground against each boundary's data values (typically one boundary, e.g. Categoria).
    let labelToValue: Record<string, string> = {};
    for (const field of boundaries) {
      const values = await distinctValuesFor(field);
      labelToValue = { ...labelToValue, ...groundCategoryLabels(Object.keys(rates), values) };
    }
    const { dag: groundedDag, groundings, ungrounded } = groundScopeDag(dag, rates, labelToValue);
    if (groundings.length > 0) component.calculationIntent = groundedDag; // persist grounded shape
    results.push({ name: String(component.name ?? '?'), grounded: groundings.length, ungrounded });
  }
  return results;
}

/** Does a DAG contain any `scope` prime node (the signal that grounding is needed)? Pure. */
export function dagHasScopeNode(dag: unknown): boolean {
  let found = false;
  const walk = (n: unknown): void => {
    if (found) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!isObj(n)) return;
    if (n.prime === 'scope') { found = true; return; }
    for (const k of Object.keys(n)) walk(n[k]);
  };
  walk(dag);
  return found;
}
