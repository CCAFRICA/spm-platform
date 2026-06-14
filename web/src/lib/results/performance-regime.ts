/**
 * OB-207 Inc2 Pass2 — Per-component performance-regime classifier (Decision 158, Korean Test).
 *
 * The regime is a property of the component's payout DAG grammar
 * (`rule_sets.components[…].metadata.intent`). It is READ structurally, never assumed:
 *
 *   - A `divide` node computes a ratio. Its `inputs` positionally carry the {actual, target} field
 *     identities when each operand is a reference/aggregate (inputs[0] = numerator, inputs[1] = denom).
 *   - If that ratio sits inside a `condition` subtree (a gate / tier / accelerator test), it is a
 *     PAYOUT FACTOR → Regime 3 (paying target).
 *   - A ratio present but never gating payout → Regime 2 (non-paying / tracked target).
 *   - No ratio anywhere → Regime 1 (volume / activity / gate; no target).
 *
 * ZERO component-name or tenant matching — the regime comes from grammar shape only (AP-25).
 *
 * STRUCTURAL LIMITATION (HALT-1-adjacent, documented): the DAG grammar does NOT carry an explicit
 * "target role" marker on a denominator. So a ratio-gated payout is the best available *structural
 * proxy* for target-driven — a payout that gates on a ratio of two plain volume metrics (no target
 * semantics) would also classify Regime 3. The grammar cannot distinguish the two; certainty requires
 * an upstream grammar enhancement (mark the target operand). Verified correct on BCL (the real
 * denominators are meta_colocacion / deposit_target); the false-positive is a hypothetical edge.
 */

export type Regime = 1 | 2 | 3;

export interface RegimeClassification {
  regime: Regime;
  /** Regime 2/3 only: the attainment-ratio field identities, read structurally from the divide node.
   *  The surface reads these fields from the persisted `metrics` to compute the attainment value. */
  attainmentFields: { actual: string; target: string } | null;
}

interface DivideHit { actual: string | null; target: string | null; underCondition: boolean; }

/** A divide operand's field, if it carries one positionally (reference OR aggregate/scope both expose `field`).
 *  Composed operands (nested arithmetic/aggregate without a top-level field) yield null — the ratio is still
 *  detected for regime purposes, but the {actual,target} identities are then unknown (attainmentFields stays null). */
function operandField(input: unknown): string | null {
  const node = input as Record<string, unknown> | null;
  return node && typeof node.field === 'string' ? node.field : null;
}

/** Walk the DAG collecting `divide` nodes, tracking whether each sits within a `condition` (gate) subtree.
 *  Depth-capped against cyclic / shared-node back-edges. */
function collectDivides(node: unknown, underCondition: boolean, out: DivideHit[], depth = 0): void {
  if (depth > 200 || !node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  if (n.op === 'divide') {
    const inputs = Array.isArray(n.inputs) ? n.inputs : [];
    // Positional: inputs[0] = numerator (actual), inputs[1] = denominator (target). Extract each operand's
    // field if present; do NOT filter out non-reference operands (that would mis-shift the pairing).
    out.push({ actual: operandField(inputs[0]), target: operandField(inputs[1]), underCondition });
  }
  for (const [key, value] of Object.entries(n)) {
    const childUnder = underCondition || key === 'condition';
    if (Array.isArray(value)) value.forEach(v => collectDivides(v, childUnder, out, depth + 1));
    else if (value && typeof value === 'object') collectDivides(value, childUnder, out, depth + 1);
  }
}

/** Classify a single component definition (`rule_sets.components[…]`) by its payout grammar. */
export function classifyComponentRegime(componentDef: unknown): RegimeClassification {
  const intent = (componentDef as { metadata?: { intent?: unknown } } | null)?.metadata?.intent;
  if (!intent || typeof intent !== 'object') return { regime: 1, attainmentFields: null };
  const divides: DivideHit[] = [];
  collectDivides(intent, false, divides);
  if (divides.length === 0) return { regime: 1, attainmentFields: null };
  const gating = divides.find(d => d.underCondition && d.actual && d.target);
  if (gating) return { regime: 3, attainmentFields: { actual: gating.actual!, target: gating.target! } };
  const tracked = divides.find(d => d.actual && d.target);
  return { regime: 2, attainmentFields: tracked ? { actual: tracked.actual!, target: tracked.target! } : null };
}

/**
 * Classify every component in a rule_set's `components` jsonb. Handles the variant-nested shape
 * (`{ variants: [{ components: [...] }] }`) and the flat shape (`{ components: [...] }`). Dedupes by name.
 */
export function classifyRuleSetRegimes(ruleSetComponents: unknown): Map<string, RegimeClassification> {
  const out = new Map<string, RegimeClassification>();
  const lists: unknown[][] = [];
  // Three shapes the engine recognizes: bare top-level array, variant-nested, and flat `{ components }`.
  if (Array.isArray(ruleSetComponents)) {
    lists.push(ruleSetComponents);
  } else {
    const root = ruleSetComponents as { variants?: Array<{ components?: unknown[] }>; components?: unknown[] } | null;
    if (root?.variants) for (const v of root.variants) if (Array.isArray(v.components)) lists.push(v.components);
    if (Array.isArray(root?.components)) lists.push(root.components);
  }
  for (const list of lists) {
    for (const comp of list) {
      const name = (comp as { name?: string } | null)?.name;
      if (typeof name !== 'string' || out.has(name)) continue;
      out.set(name, classifyComponentRegime(comp));
    }
  }
  return out;
}

// ── Representation mapping (pure: regime → what the surface renders) ──

export interface RegimeRepresentation {
  regime: Regime;
  /** Panel/annotation label derived from the regime — NOT a hardcoded "attainment" assumption. */
  label: string;
  primary: 'attainment' | 'relative';
  show: { trend: boolean; rank: boolean; distribution: boolean; attainment: boolean; tierStructure: boolean };
  targetShown: boolean;
}

export function representationForRegime(regime: Regime): RegimeRepresentation {
  switch (regime) {
    case 3:
      return { regime, label: 'Attainment', primary: 'attainment', show: { trend: true, rank: true, distribution: true, attainment: true, tierStructure: true }, targetShown: true };
    case 2:
      return { regime, label: 'Performance (target tracked)', primary: 'relative', show: { trend: true, rank: true, distribution: true, attainment: true, tierStructure: false }, targetShown: true };
    case 1:
    default:
      return { regime: 1, label: 'Performance', primary: 'relative', show: { trend: true, rank: true, distribution: true, attainment: false, tierStructure: false }, targetShown: false };
  }
}
