/**
 * OB-207 Inc2 Pass2 — Per-component performance-regime classifier (Decision 158, Korean Test).
 *
 * The regime is a property of the component's payout DAG grammar
 * (`rule_sets.components[…].metadata.intent`). It is READ structurally, never assumed:
 *
 *   - A `divide` node computes an actual÷target ratio (attainment). Its `inputs` structurally
 *     NAME the {actual, target} fields (inputs[0] = actual, inputs[1] = target).
 *   - If that ratio sits inside a `condition` subtree (a gate / tier / accelerator test), it is a
 *     PAYOUT FACTOR → Regime 3 (paying target).
 *   - A ratio present but never gating payout → Regime 2 (non-paying / tracked target).
 *   - No ratio anywhere → Regime 1 (volume / activity / gate; no target).
 *
 * ZERO component-name or tenant matching — the regime comes from grammar shape only (AP-25).
 */

export type Regime = 1 | 2 | 3;

export interface RegimeClassification {
  regime: Regime;
  /** Regime 2/3 only: the attainment-ratio field identities, read structurally from the divide node.
   *  The surface reads these fields from the persisted `metrics` to compute the attainment value. */
  attainmentFields: { actual: string; target: string } | null;
}

interface DivideHit { actual: string | null; target: string | null; underCondition: boolean; }

/** Walk the DAG collecting `divide` nodes, tracking whether each sits within a `condition` (gate) subtree. */
function collectDivides(node: unknown, underCondition: boolean, out: DivideHit[]): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  if (n.op === 'divide') {
    const inputs = Array.isArray(n.inputs) ? (n.inputs as Array<Record<string, unknown>>) : [];
    const refs = inputs
      .filter(i => i && i.prime === 'reference' && typeof i.field === 'string')
      .map(i => i.field as string);
    out.push({ actual: refs[0] ?? null, target: refs[1] ?? null, underCondition });
  }
  for (const [key, value] of Object.entries(n)) {
    const childUnder = underCondition || key === 'condition';
    if (Array.isArray(value)) value.forEach(v => collectDivides(v, childUnder, out));
    else if (value && typeof value === 'object') collectDivides(value, childUnder, out);
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
  const root = ruleSetComponents as { variants?: Array<{ components?: unknown[] }>; components?: unknown[] } | null;
  const lists: unknown[][] = [];
  if (root?.variants) for (const v of root.variants) if (Array.isArray(v.components)) lists.push(v.components);
  if (Array.isArray(root?.components)) lists.push(root.components);
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
