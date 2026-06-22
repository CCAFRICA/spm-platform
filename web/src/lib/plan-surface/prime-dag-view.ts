/**
 * OB-228 — Structural component analyzer (the Korean-Test render + distribution core).
 *
 * Walks a component's `calculationIntent` (a PrimeNode tree) and its
 * `metadata.compositional_intent.structure` (the high-level shape MIR's interpreter
 * emits) to produce a `ComponentView`: a readable logic outline + the inputs the
 * distribution overlay needs. PURELY STRUCTURAL — it dispatches on prime node TYPES
 * and shape strings, never on field-name or value literals (D154 Korean Test). A
 * Korean tenant's Hangul fields flow through as opaque strings.
 *
 * Prime vocabulary (intent-types.ts): arithmetic | aggregate | filter | conditional |
 * scope | compare | logical | constant | reference | prior_period.
 */
import type { ComponentView, ComponentViewStep, CanonicalComponent } from './types';
import { collectFieldRefs, findScope, findFirstAggregate } from './binding-extract';

type Node = Record<string, any>;

const isNode = (v: unknown): v is Node => !!v && typeof v === 'object';

function findFirstFilter(node: unknown): { field: string; operator: string; value: unknown } | null {
  if (!isNode(node)) return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findFirstFilter(n); if (r) return r; } return null; }
  if (node.prime === 'filter' && node.predicate?.field) return { field: node.predicate.field, operator: node.predicate.operator, value: node.predicate.value };
  for (const v of Object.values(node)) { if (isNode(v)) { const r = findFirstFilter(v); if (r) return r; } }
  return null;
}

/** Collect every compare threshold {field, op, value} where one operand is a constant. */
function collectThresholds(node: unknown, out: { field: string | null; op: string; value: number }[] = []): { field: string | null; op: string; value: number }[] {
  if (!isNode(node)) return out;
  if (Array.isArray(node)) { for (const n of node) collectThresholds(n, out); return out; }
  if (node.prime === 'compare' && Array.isArray(node.inputs) && node.inputs.length === 2) {
    const [a, b] = node.inputs;
    const constNode = a?.prime === 'constant' ? a : b?.prime === 'constant' ? b : null;
    const otherNode = constNode === a ? b : a;
    if (constNode && typeof constNode.value === 'number') {
      const field = fieldOf(otherNode);
      out.push({ field, op: node.op, value: constNode.value });
    }
  }
  for (const [k, v] of Object.entries(node)) { if (k !== 'predicate' && isNode(v)) collectThresholds(v, out); }
  return out;
}

/** Best-effort field name a sub-tree reads (for labeling). */
function fieldOf(node: unknown): string | null {
  if (!isNode(node)) return null;
  if (node.prime === 'reference' && node.field) return node.field;
  if (node.prime === 'aggregate' && node.field) return node.field;
  if (node.prime === 'scope' && node.boundary) {
    const agg = findFirstAggregate(node.downstream);
    return agg?.field ?? node.boundary;
  }
  for (const v of Object.values(node)) { if (isNode(v)) { const f = fieldOf(v); if (f) return f; } }
  return null;
}

/** Is the top of the tree a sign-flip (× -1) → clawback / reversal? */
function detectClawback(node: unknown): boolean {
  if (!isNode(node)) return false;
  if (node.prime === 'arithmetic' && node.op === 'multiply' && Array.isArray(node.inputs)) {
    return node.inputs.some((i: Node) => i?.prime === 'constant' && typeof i.value === 'number' && i.value < 0);
  }
  return false;
}

/** Extract a band ladder from a nested conditional chain that compares ONE reference
 *  field against ascending constants (the prime-DAG form of a tier/banded lookup). */
function extractConditionalBands(node: unknown): { field: string; bands: { lowerLabel: string; output: number | string }[] } | null {
  if (!isNode(node) || node.prime !== 'conditional') return null;
  const bands: { lowerLabel: string; output: number | string }[] = [];
  let field: string | null = null;
  let cur: Node | null = node as Node;
  let guard = 0;
  while (cur && cur.prime === 'conditional' && guard++ < 32) {
    const cond = cur.condition;
    if (isNode(cond) && cond.prime === 'compare' && Array.isArray(cond.inputs)) {
      const [a, b] = cond.inputs;
      const constNode = a?.prime === 'constant' ? a : b?.prime === 'constant' ? b : null;
      const otherNode = constNode === a ? b : a;
      const f = fieldOf(otherNode);
      if (f) field = f;
      const thr = constNode && typeof constNode.value === 'number' ? constNode.value : null;
      const thenVal = leafValue(cur.then);
      bands.push({ lowerLabel: thr !== null ? `${cond.op} ${thr}` : 'match', output: thenVal ?? '—' });
    }
    cur = isNode(cur.else) ? cur.else : null;
  }
  if (cur) { const ev = leafValue(cur); if (ev !== null) bands.push({ lowerLabel: 'otherwise', output: ev }); }
  // Only a genuine band ladder if ≥2 branches resolve to FLAT numeric outputs.
  // A conditional whose `then` is a computed expression (e.g. sum × rate) is NOT a
  // band table — it falls through to the condition+rate path (Korean Test: structure,
  // not coercion).
  const numericOutputs = bands.filter((b) => typeof b.output === 'number');
  if (!field || numericOutputs.length < 2) return null;
  return { field, bands };
}

/** The "amount" operand of a top-level multiply: the plain reference field that is
 *  multiplied by a rate/band structure (so the summary reads "Amount × rate ..."). */
function findAmountOperand(node: unknown): string | null {
  if (!isNode(node)) return null;
  if (node.prime === 'arithmetic' && node.op === 'multiply' && Array.isArray(node.inputs)) {
    for (const inp of node.inputs) {
      if (isNode(inp) && inp.prime === 'reference' && inp.field) return inp.field;
      if (isNode(inp) && inp.prime === 'aggregate' && inp.field) return inp.field;
    }
  }
  for (const v of Object.values(node)) { if (isNode(v)) { const r = findAmountOperand(v); if (r) return r; } }
  return null;
}

/** An inner per-match rate: a small multiplier constant inside a conditional's `then`. */
function findInnerRate(node: unknown): number | null {
  if (!isNode(node)) return null;
  if (node.prime === 'arithmetic' && node.op === 'multiply' && Array.isArray(node.inputs)) {
    const c = node.inputs.find((i: Node) => i?.prime === 'constant' && typeof i.value === 'number' && Math.abs(i.value) < 1 && i.value !== 0);
    if (c) return c.value;
  }
  for (const v of Object.values(node)) { if (isNode(v)) { const r = findInnerRate(v); if (r !== null) return r; } }
  return null;
}

function leafValue(node: unknown): number | string | null {
  if (!isNode(node)) return null;
  if (node.prime === 'constant') return node.value;
  if (node.prime === 'arithmetic') return null; // computed leaf — not a flat band output
  return null;
}

/** The compositional_intent.structure (MIR's high-level interpreter view), if present. */
function readCompositional(component: CanonicalComponent): Node | null {
  const ci = (component.config?.compositionalIntent ?? (component.metadata as any)?.compositional_intent) as Node | undefined;
  return ci && isNode(ci.structure) ? (ci.structure as Node) : null;
}

/** Pull a banded_lookup {breaks, outputs, reference_field} from a compositional structure. */
function findBandedLookup(struct: unknown): { breaks: number[]; outputs: number[]; referenceField: string | null } | null {
  if (!isNode(struct)) return null;
  if (struct.shape === 'banded_lookup' && Array.isArray(struct.outputs)) {
    const dim = Array.isArray(struct.dimensions) ? struct.dimensions[0] : null;
    return {
      breaks: Array.isArray(dim?.breaks) ? dim.breaks : [],
      outputs: struct.outputs,
      referenceField: dim?.reference_field ?? dim?.reference_source?.field ?? null,
    };
  }
  if (Array.isArray(struct.operands)) {
    for (const op of struct.operands) {
      const r = findBandedLookup(op?.structure ?? op);
      if (r) return r;
    }
  }
  return null;
}

const r2 = (n: number) => Math.round(n * 1000) / 1000;
const pct = (n: number) => (Math.abs(n) <= 1 ? `${r2(n * 100)}%` : String(r2(n)));

/**
 * Analyze a normalized component into a renderable + bucketable ComponentView.
 * Korean-Test clean: every label is composed from field names found in the data
 * plus structural keywords; no hardcoded field/value dictionary.
 */
export function analyzeComponent(component: CanonicalComponent): ComponentView {
  const intent = component.calculationIntent ?? (component.config?.raw as any)?.calculationIntent;
  const fieldRefs = collectFieldRefs(intent);
  const scope = findScope(intent);
  const agg = findFirstAggregate(intent);
  const filter = findFirstFilter(intent);
  const thresholds = collectThresholds(intent);
  const isClawback = detectClawback(intent);

  const struct = readCompositional(component);
  const banded = struct ? findBandedLookup(struct) : null;
  const condBands = banded ? null : extractConditionalBands(intent) ?? extractConditionalBandsDeep(intent);
  const amountField = findAmountOperand(intent);   // the reference multiplied by a rate
  const innerRate = findInnerRate(intent);          // a per-match / conditional rate constant

  // ── distribution inputs ──
  let measureField: string | null = null;
  let measureVia: string | null = null;
  const scopeBoundary = scope?.boundary ?? null;
  let breaks: number[] | null = null;
  let bandReferenceField: string | null = null;
  let bandOutputs: number[] | null = null;

  if (banded) {
    breaks = banded.breaks.length ? banded.breaks : null;
    bandReferenceField = banded.referenceField;
    bandOutputs = banded.outputs;
  } else if (condBands) {
    bandReferenceField = condBands.field;
    bandOutputs = condBands.bands.map((b) => (typeof b.output === 'number' ? b.output : 0));
  }

  // measureField: the numeric amount the component acts on (for the summary + numeric
  // distributions). Distribution prefers scopeBoundary then bandReferenceField (§4a/§4b),
  // so measureField here is the "amount", not the band key.
  if (scope && scope.aggField) { measureField = scope.aggField; measureVia = `aggregate:${scope.aggOp}`; }
  else if ((banded || condBands) && amountField) { measureField = amountField; measureVia = 'reference'; }
  else if (agg) { measureField = agg.field; measureVia = `aggregate:${agg.op}`; }
  else if (filter) { measureField = filter.field; measureVia = 'filter:count'; }
  else if (bandReferenceField) { measureField = bandReferenceField; measureVia = 'reference'; }
  else if (fieldRefs[0]) { measureField = fieldRefs[0].field; measureVia = fieldRefs[0].via; }

  // threshold breaks (accelerator) if no band breaks
  if (!breaks && thresholds.length) breaks = thresholds.map((t) => t.value);

  // ── shape + summary + steps ──
  const steps: ComponentViewStep[] = [];
  let shape = 'prime_dag';

  if (isClawback) {
    shape = 'reversal';
    const f = fieldRefs.find((r) => r.via === 'reference')?.field ?? measureField;
    steps.push({ kind: 'reversal', label: 'Clawback (reversal)', detail: f ? `Reverses prior payout from ${f}` : 'Sign-flipped reversal of a prior payout', field: f ?? undefined });
    for (const r of fieldRefs) steps.push({ kind: 'reference', label: r.field, field: r.field });
  }

  if (banded || condBands) {
    shape = banded ? 'banded_lookup' : 'banded_conditional';
    const refField = bandReferenceField ?? '—';
    const bands = banded
      ? buildBandsFromBreaks(banded.breaks, banded.outputs)
      : (condBands!.bands.map((b) => ({ lowerLabel: b.lowerLabel, output: typeof b.output === 'number' ? b.output : b.output })));
    steps.push({ kind: 'band', label: `Rate banded by ${refField}`, field: refField, bands });
  }

  if (scope) {
    steps.push({ kind: 'rollup', label: `Roll up ${scope.aggOp ?? 'sum'} of ${scope.aggField ?? '—'} per ${scope.boundary}`, field: scope.aggField ?? scope.boundary });
  }

  for (const t of thresholds) {
    const accel = nearbyMultiplier(intent, t.value);
    steps.push({
      kind: accel !== null ? 'accelerator' : 'condition',
      label: accel !== null
        ? `Accelerator ${accel}× when ${t.field ?? 'value'} ${t.op} ${t.value}`
        : `When ${t.field ?? 'value'} ${t.op} ${t.value}`,
      field: t.field ?? undefined,
      value: accel ?? t.value,
    });
  }

  // conditional rate (not a band ladder): a threshold gates a per-unit rate on a summed field
  if (innerRate !== null && !banded && !condBands && !filter) {
    if (shape === 'prime_dag') shape = 'conditional';
    const sf = agg?.field ?? amountField ?? measureField;
    steps.push({ kind: 'rate', label: `Pay ${pct(innerRate)} of ${sf ?? 'amount'} when met`, value: innerRate, field: sf ?? undefined });
  }

  if (filter) {
    shape = banded || condBands ? shape : 'filtered_count';
    steps.push({ kind: 'count', label: `Count where ${filter.field} ${filter.operator} ${String(filter.value)}`, field: filter.field });
    const flat = topFlatMultiplier(intent);
    if (flat !== null) steps.push({ kind: 'rate', label: `× ${flat} per match`, value: flat });
  }

  if (!steps.length) {
    // generic structural outline
    if (agg) steps.push({ kind: 'rollup', label: `${agg.op} of ${agg.field}`, field: agg.field });
    for (const r of fieldRefs.slice(0, 6)) steps.push({ kind: 'reference', label: r.field, field: r.field, detail: r.via });
    if (!steps.length) steps.push({ kind: 'unknown', label: 'Custom logic', detail: 'Rendered from raw structure' });
  }

  const summary = buildSummary({ shape, isClawback, banded, condBands, scope, thresholds, filter, measureField, amountField, innerRate, agg, bandReferenceField, bandOutputs });

  return { shape, summary, steps, measureField, measureVia, scopeBoundary, breaks, bandReferenceField, bandOutputs, thresholds, isClawback, fieldRefs };
}

// nested conditional ladder may sit below the top arithmetic — search for it
function extractConditionalBandsDeep(node: unknown): { field: string; bands: { lowerLabel: string; output: number | string }[] } | null {
  if (!isNode(node)) return null;
  if (Array.isArray(node)) { for (const n of node) { const r = extractConditionalBandsDeep(n); if (r) return r; } return null; }
  const direct = node.prime === 'conditional' ? extractConditionalBands(node) : null;
  if (direct) return direct;
  for (const v of Object.values(node)) { if (isNode(v)) { const r = extractConditionalBandsDeep(v); if (r) return r; } }
  return null;
}

function buildBandsFromBreaks(breaks: number[], outputs: (number | string)[]): { lowerLabel: string; output: number | string; rangeMin?: number; rangeMax?: number }[] {
  const rows: { lowerLabel: string; output: number | string; rangeMin?: number; rangeMax?: number }[] = [];
  for (let i = 0; i < outputs.length; i++) {
    const lo = i === 0 ? null : breaks[i - 1];
    const hi = i < breaks.length ? breaks[i] : null;
    const label = lo === null ? `< ${hi}` : hi === null ? `≥ ${lo}` : `${lo}–${hi}`;
    rows.push({ lowerLabel: label, output: outputs[i], rangeMin: lo ?? undefined, rangeMax: hi ?? undefined });
  }
  return rows;
}

/** When a compare threshold gates a conditional whose `then` is a constant multiplier. */
function nearbyMultiplier(node: unknown, thresholdValue: number): number | null {
  if (!isNode(node)) return null;
  if (Array.isArray(node)) { for (const n of node) { const r = nearbyMultiplier(n, thresholdValue); if (r !== null) return r; } return null; }
  if (node.prime === 'conditional' && isNode(node.condition) && node.condition.prime === 'compare') {
    const ins = node.condition.inputs ?? [];
    const hit = ins.some((i: Node) => i?.prime === 'constant' && i.value === thresholdValue);
    if (hit && isNode(node.then) && node.then.prime === 'constant' && typeof node.then.value === 'number') {
      // only treat as accelerator if it's a multiplier (≠ 0/1 base patterns still fine to show)
      return node.then.value;
    }
  }
  for (const v of Object.values(node)) { if (isNode(v)) { const r = nearbyMultiplier(v, thresholdValue); if (r !== null) return r; } }
  return null;
}

/** Top-level flat multiplier constant (e.g. 150 per verified client). */
function topFlatMultiplier(node: unknown): number | null {
  if (!isNode(node)) return null;
  if (node.prime === 'arithmetic' && node.op === 'multiply' && Array.isArray(node.inputs)) {
    const c = node.inputs.find((i: Node) => i?.prime === 'constant' && typeof i.value === 'number' && Math.abs(i.value) !== 1);
    if (c) return c.value;
  }
  return null;
}

function buildSummary(x: any): string {
  if (x.isClawback) return 'Reverses a prior payout (clawback)';
  if (x.banded || x.condBands) {
    const outs = (x.bandOutputs ?? []).filter((o: number) => typeof o === 'number' && o !== 0);
    const range = outs.length ? `${pct(Math.min(...outs))}–${pct(Math.max(...outs))}` : 'a rate';
    const base = x.measureField ? `${x.measureField} × ` : '';
    return `${base}rate ${range} banded by ${x.bandReferenceField ?? 'a field'}`;
  }
  if (x.scope && x.thresholds.length) {
    const t = x.thresholds[0];
    return `Accelerator when ${t.field ?? 'rolled value'} ${t.op} ${t.value} per ${x.scope.boundary}`;
  }
  if (x.filter) return `Counts ${x.filter.field} ${x.filter.operator} ${String(x.filter.value)}, paid per match`;
  if (x.innerRate !== null && x.innerRate !== undefined && x.thresholds.length) {
    const t = x.thresholds[0];
    const sf = x.agg?.field ?? x.amountField ?? x.measureField ?? 'amount';
    return `Pays ${pct(x.innerRate)} of ${sf} when ${t.field ?? 'value'} ${t.op} ${t.value}`;
  }
  if (x.measureField) return `Computed from ${x.measureField}`;
  return 'Custom component logic';
}
