/**
 * HF-251 Phase 1.3 — Constructor unit tests
 *
 * 7 test cases covering:
 *   1. 1D banded lookup, 4 bands
 *   2. 2D banded lookup, 6×5 = 30 cells (BCL C0 shape)
 *   3. Arithmetic (linear rate)
 *   4. Conditional gate
 *   5. Composed (sum of sub-structures)
 *   6. Validation failure (mismatched output count throws)
 *   7. Scale metadata placement (evaluator side)
 *
 * Runner: node --test --import tsx (per package.json "test" script).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { constructTree } from '../intent-constructor';
import {
  ConstructionError,
  StructuralCoherenceError,
  assertRatioBandScaleCoherence,
} from '../compositional-intent';
import type { CompositionalIntent, BandedLookupDescription } from '../compositional-intent';
import type { PrimeNode } from '../../calculation/intent-types';

// HF-279: find every `arithmetic`/`divide` node and report its two reference
// fields (numerator, denominator) — the constructed shape of a ratio source.
function findDivides(node: PrimeNode): Array<[string | null, string | null]> {
  const out: Array<[string | null, string | null]> = [];
  function fieldOf(n: PrimeNode | undefined): string | null {
    return n && n.prime === 'reference' && typeof n.field === 'string' ? n.field : null;
  }
  function walk(n: PrimeNode): void {
    if (!n || typeof n !== 'object') return;
    if (n.prime === 'arithmetic') {
      if (n.op === 'divide') out.push([fieldOf(n.inputs[0]), fieldOf(n.inputs[1])]);
      walk(n.inputs[0]); walk(n.inputs[1]); return;
    }
    if (n.prime === 'compare') { walk(n.inputs[0]); walk(n.inputs[1]); return; }
    if (n.prime === 'conditional') { walk(n.condition); walk(n.then); walk(n.else); return; }
    if (n.prime === 'logical') { n.inputs.forEach(walk); return; }
    if (n.prime === 'filter' || n.prime === 'scope' || n.prime === 'prior_period') { walk(n.downstream); return; }
  }
  walk(node);
  return out;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// Count constant leaves that appear in OUTPUT positions (then/else terminals),
// excluding constants that appear inside compare conditions.
function countOutputLeaves(node: PrimeNode): number {
  if (node.prime === 'constant') return 1;
  if (node.prime === 'conditional') {
    return countOutputLeaves(node.then) + countOutputLeaves(node.else);
  }
  if (node.prime === 'arithmetic') {
    return countOutputLeaves(node.inputs[0]) + countOutputLeaves(node.inputs[1]);
  }
  return 0;
}

function getConditionalDepth(node: PrimeNode): number {
  if (node.prime !== 'conditional') return 0;
  return 1 + Math.max(getConditionalDepth(node.then), getConditionalDepth(node.else));
}

function findAllConstants(node: PrimeNode): Array<{ value: number; meta?: unknown }> {
  const result: Array<{ value: number; meta?: unknown }> = [];
  function walk(n: PrimeNode): void {
    if (n.prime === 'constant') {
      result.push({ value: n.value, meta: n.meta });
      return;
    }
    if (n.prime === 'conditional') {
      walk(n.condition); walk(n.then); walk(n.else); return;
    }
    if (n.prime === 'arithmetic' || n.prime === 'compare') {
      walk(n.inputs[0]); walk(n.inputs[1]); return;
    }
    if (n.prime === 'logical') {
      n.inputs.forEach(walk); return;
    }
    if (n.prime === 'filter' || n.prime === 'scope' || n.prime === 'prior_period') {
      walk(n.downstream); return;
    }
  }
  walk(node);
  return result;
}

// ─────────────────────────────────────────────
// Test 1 — 1D banded lookup, 4 bands
// ─────────────────────────────────────────────

test('1D banded lookup, 4 bands', () => {
  const intent: CompositionalIntent = {
    component_id: 'c1',
    component_name: 'Test 1D Band',
    structure: {
      shape: 'banded_lookup',
      dimensions: [
        {
          reference_field: 'attainment',
          reference_source: { type: 'metric', field: 'attainment' },
          breaks: [100, 110, 130],
        },
      ],
      outputs: [0, 150, 300, 500],
    },
    scale: null,
    output_precision: 0,
  };
  const tree = constructTree(intent);
  // 3 nested conditionals (3 breaks → 4 bands → 3 conditional gates)
  assert.equal(getConditionalDepth(tree), 3, 'should have 3 nested conditionals');
  // 4 output constant leaves: 0, 150, 300, 500
  assert.equal(countOutputLeaves(tree), 4, 'should have 4 output leaves');
  // The output values themselves should all appear among constants
  const constants = findAllConstants(tree);
  const constantValues = constants.map(c => c.value).sort((a, b) => a - b);
  assert.ok(constantValues.includes(0), '0 (terminal/no-match) appears');
  assert.ok(constantValues.includes(150), '150 appears');
  assert.ok(constantValues.includes(300), '300 appears');
  assert.ok(constantValues.includes(500), '500 appears');
  // Half-open intervals: every conditional uses gte
  function checkGte(n: PrimeNode): void {
    if (n.prime === 'conditional') {
      assert.equal(n.condition.prime, 'compare');
      if (n.condition.prime === 'compare') {
        assert.equal(n.condition.op, 'gte', `conditional uses gte (D127 half-open), got ${n.condition.op}`);
      }
      checkGte(n.then); checkGte(n.else);
    }
  }
  checkGte(tree);
});

// ─────────────────────────────────────────────
// Test 2 — 2D banded lookup, 6×5 = 30 cells (BCL C0 shape)
// ─────────────────────────────────────────────

test('2D banded lookup 6x5 (BCL C0 shape) — 30 cells, all reachable', () => {
  // 6 row bands → 5 row breaks. 5 col bands → 4 col breaks. 30 outputs.
  const outputs: number[] = [];
  for (let i = 0; i < 30; i++) outputs.push(i * 100 + 1); // unique non-zero values
  const intent: CompositionalIntent = {
    component_id: 'bcl-c0',
    component_name: 'Colocación de Crédito',
    structure: {
      shape: 'banded_lookup',
      dimensions: [
        {
          reference_field: 'cumplimiento_colocacion',
          reference_source: { type: 'metric', field: 'cumplimiento_colocacion' },
          breaks: [70, 80, 90, 100, 120],
        },
        {
          reference_field: 'calidad_cartera',
          reference_source: { type: 'metric', field: 'calidad_cartera' },
          breaks: [0.7, 0.85, 0.9, 0.95],
        },
      ],
      outputs,
    },
    scale: null,
    output_precision: 0,
  };
  const tree = constructTree(intent);
  // 30 distinct output leaves expected; plus the terminal constant(0) — leaves
  // counted on output positions should equal at LEAST 30. The constructor's
  // terminal else is constant(0) at every inner band, so total output leaves
  // exceed 30 (there are no-match terminators at each row band's column chain).
  const outputLeaves = countOutputLeaves(tree);
  assert.ok(outputLeaves >= 30, `should have at least 30 output leaves (got ${outputLeaves})`);
  // Every unique non-zero output value should appear among the constants
  const constants = findAllConstants(tree);
  const constantValues = new Set(constants.map(c => c.value));
  for (const v of outputs) {
    assert.ok(constantValues.has(v), `output value ${v} appears in tree`);
  }
  // Half-open intervals on both dimensions
  function checkGte(n: PrimeNode): void {
    if (n.prime === 'conditional') {
      assert.equal(n.condition.prime, 'compare');
      if (n.condition.prime === 'compare') {
        assert.equal(n.condition.op, 'gte');
      }
      checkGte(n.then); checkGte(n.else);
    }
  }
  checkGte(tree);
});

// ─────────────────────────────────────────────
// Test 3 — Arithmetic (linear rate)
// ─────────────────────────────────────────────

test('arithmetic linear rate (multiply reference by constant)', () => {
  const intent: CompositionalIntent = {
    component_id: 'c3',
    component_name: 'Linear Rate',
    structure: {
      shape: 'arithmetic',
      operation: 'multiply',
      operands: [
        { kind: 'reference', source: { type: 'metric', field: 'revenue' } },
        { kind: 'constant', value: 0.05 },
      ],
    },
    scale: null,
    output_precision: 2,
  };
  const tree = constructTree(intent);
  assert.equal(tree.prime, 'arithmetic');
  if (tree.prime === 'arithmetic') {
    assert.equal(tree.op, 'multiply');
    assert.equal(tree.inputs[0].prime, 'reference');
    assert.equal(tree.inputs[1].prime, 'constant');
    if (tree.inputs[0].prime === 'reference') {
      assert.equal(tree.inputs[0].field, 'revenue');
    }
    if (tree.inputs[1].prime === 'constant') {
      assert.equal(tree.inputs[1].value, 0.05);
    }
  }
});

// ─────────────────────────────────────────────
// Test 4 — Conditional gate
// ─────────────────────────────────────────────

test('conditional gate (if reference >= threshold then arithmetic else constant)', () => {
  const intent: CompositionalIntent = {
    component_id: 'c4',
    component_name: 'Conditional Gate',
    structure: {
      shape: 'conditional',
      condition: {
        reference: { type: 'metric', field: 'attainment' },
        operator: 'gte',
        threshold: 100,
      },
      then: {
        shape: 'arithmetic',
        operation: 'multiply',
        operands: [
          { kind: 'reference', source: { type: 'metric', field: 'revenue' } },
          { kind: 'constant', value: 0.05 },
        ],
      },
      else: { kind: 'constant', value: 0 },
    },
    scale: null,
    output_precision: 2,
  };
  const tree = constructTree(intent);
  assert.equal(tree.prime, 'conditional');
  if (tree.prime === 'conditional') {
    assert.equal(tree.condition.prime, 'compare');
    if (tree.condition.prime === 'compare') {
      assert.equal(tree.condition.op, 'gte');
    }
    assert.equal(tree.then.prime, 'arithmetic');
    assert.equal(tree.else.prime, 'constant');
    if (tree.else.prime === 'constant') {
      assert.equal(tree.else.value, 0);
    }
  }
});

// ─────────────────────────────────────────────
// Test 5 — Composed (sum of two banded lookups)
// ─────────────────────────────────────────────

test('composed: sum of two banded lookups', () => {
  const subBand: BandedLookupDescription = {
    shape: 'banded_lookup',
    dimensions: [
      {
        reference_field: 'x',
        reference_source: { type: 'metric', field: 'x' },
        breaks: [10],
      },
    ],
    outputs: [0, 100],
  };
  const intent: CompositionalIntent = {
    component_id: 'c5',
    component_name: 'Composed Sum',
    structure: {
      shape: 'composed',
      composition: 'sum',
      children: [subBand, subBand],
    },
    scale: null,
    output_precision: 0,
  };
  const tree = constructTree(intent);
  // sum reduction with 2 children → arithmetic(add, child[0], child[1])
  assert.equal(tree.prime, 'arithmetic');
  if (tree.prime === 'arithmetic') {
    assert.equal(tree.op, 'add');
    // Both children are conditional chains (banded lookups)
    assert.equal(tree.inputs[0].prime, 'conditional');
    assert.equal(tree.inputs[1].prime, 'conditional');
  }
});

// ─────────────────────────────────────────────
// Test 6 — Validation failure: mismatched output count throws
// ─────────────────────────────────────────────

test('banded lookup with mismatched output count throws ConstructionError', () => {
  const intent: CompositionalIntent = {
    component_id: 'c6',
    component_name: 'Bad Band',
    structure: {
      shape: 'banded_lookup',
      dimensions: [
        {
          reference_field: 'x',
          reference_source: { type: 'metric', field: 'x' },
          breaks: [10, 20, 30], // 4 bands expected
        },
      ],
      outputs: [1, 2, 3], // only 3 outputs — mismatch
    },
    scale: null,
    output_precision: 0,
  };
  assert.throws(
    () => constructTree(intent),
    (err: unknown) => {
      assert.ok(err instanceof ConstructionError, 'should throw ConstructionError');
      const ce = err as ConstructionError;
      assert.ok(ce.message.includes('output count'), `error message mentions output count: ${ce.message}`);
      return true;
    },
  );
});

// ─────────────────────────────────────────────
// Test 7 — Scale metadata placement (evaluator side)
// ─────────────────────────────────────────────

test('scale metadata placed on compare-position constants when evaluator side', () => {
  const intent: CompositionalIntent = {
    component_id: 'c7',
    component_name: 'Scaled Band',
    structure: {
      shape: 'banded_lookup',
      dimensions: [
        {
          reference_field: 'attainment',
          reference_source: { type: 'metric', field: 'attainment' },
          breaks: [80, 100, 120],
        },
      ],
      outputs: [0, 100, 200, 300],
    },
    scale: {
      side: 'evaluator',
      unit: 'percent',
      value: 100,
      confidence: 0.95,
      reference_field: 'attainment',
    },
    output_precision: 0,
  };
  const tree = constructTree(intent);
  const constants = findAllConstants(tree);
  // The break-threshold constants (80, 100, 120) sit in compare positions
  // and SHOULD carry meta. Output constants (0, 100, 200, 300) sit in
  // then/else positions and SHOULD NOT carry meta — they're payout values,
  // not threshold values for ratio→percent normalization.
  //
  // Note: value=100 appears both as a break threshold AND as an output value,
  // so we expect to see BOTH meta-bearing and meta-less constants of 100.
  const breakValues = [80, 120]; // values that appear ONLY as breaks
  for (const v of breakValues) {
    const found = constants.find(c => c.value === v);
    assert.ok(found, `break value ${v} appears`);
    assert.ok(found?.meta, `break value ${v} carries meta`);
    if (found?.meta) {
      const m = found.meta as { unit: string; scale: number; confidence: number };
      assert.equal(m.unit, 'percent');
      assert.equal(m.scale, 100);
    }
  }
  // Output values 0, 200, 300 appear ONLY as outputs — should have no meta
  const outputOnly = [0, 200, 300];
  for (const v of outputOnly) {
    const found = constants.filter(c => c.value === v);
    assert.ok(found.length > 0, `output ${v} appears`);
    // At least one occurrence of v should be meta-less (the output position)
    const hasUnscaled = found.some(c => !c.meta);
    assert.ok(hasUnscaled, `output ${v} has at least one meta-less occurrence`);
  }
});

// ─────────────────────────────────────────────
// HF-279 — DAG-divide band coherence (construction)
// ─────────────────────────────────────────────

// A coherent ratio-source band: breaks in the quotient's own space, NO scale.
// The constructed DAG must contain the divide over the two raw fields, and NO
// constant (break OR output) may carry meta.scale — the quotient is compared raw
// against the raw break, so a 0.85..0.98-space band tiers a 0–1 quotient correctly.
function ratioBandIntent(scale: CompositionalIntent['scale']): CompositionalIntent {
  return {
    component_id: 'c-ratio',
    component_name: 'Ratio Band',
    structure: {
      shape: 'banded_lookup',
      dimensions: [
        {
          reference_field: 'on_time_ratio',
          reference_source: { type: 'ratio', numerator_field: 'on_time_deliveries', denominator_field: 'total_deliveries' },
          breaks: [0.85, 0.9, 0.95, 0.98],
        },
      ],
      outputs: [0, 100, 200, 300, 420],
    },
    scale,
    output_precision: 0,
  };
}

test('HF-279: coherent ratio band (quotient-space breaks, no scale) -> divide built, no meta on any constant', () => {
  const tree = constructTree(ratioBandIntent(null));
  const divides = findDivides(tree);
  assert.ok(
    divides.some(([n, d]) => n === 'on_time_deliveries' && d === 'total_deliveries'),
    'a divide over the two raw reference fields is constructed',
  );
  const constants = findAllConstants(tree);
  // every break (0.85..0.98) and every output appears raw — no scale meta anywhere
  for (const c of constants) {
    assert.ok(!c.meta, `constant ${c.value} carries NO meta`);
  }
  // the quotient-space breaks survive as raw compare constants
  for (const b of [0.85, 0.9, 0.95, 0.98]) {
    assert.ok(constants.some(c => c.value === b && !c.meta), `break ${b} present, raw`);
  }
});

test('HF-279: construction backstop — ratio band WITH an evaluator scale still omits meta (generalizes HF-277)', () => {
  // Even if a non-conforming intent slips a scale past recognition, construction
  // omits meta for the DAG-divide operand — the belt to recognition's suspenders.
  const tree = constructTree(ratioBandIntent({
    side: 'evaluator', unit: 'percent', value: 100, confidence: 0.9, reference_field: 'on_time_ratio',
  }));
  const constants = findAllConstants(tree);
  for (const c of constants) {
    assert.ok(!c.meta, `constant ${c.value} carries NO meta despite evaluator scale (ratio operand)`);
  }
});

test('HF-279: construction backstop — ratio band WITH a convergence scale still omits meta (retires HF-274 attach)', () => {
  const tree = constructTree(ratioBandIntent({
    side: 'convergence', unit: 'percent', value: 100, confidence: 0.9, reference_field: 'on_time_ratio',
  }));
  const constants = findAllConstants(tree);
  for (const c of constants) {
    assert.ok(!c.meta, `constant ${c.value} carries NO meta despite convergence scale (ratio operand)`);
  }
});

test('HF-339/HF-279: convergence-side NON-ratio band carries nature with identity scale (no evaluator rescale -> no double-scale)', () => {
  const intent: CompositionalIntent = {
    component_id: 'c-conv',
    component_name: 'Convergence Metric Band',
    structure: {
      shape: 'banded_lookup',
      dimensions: [
        { reference_field: 'attainment', reference_source: { type: 'metric', field: 'attainment' }, breaks: [80, 100, 120] },
      ],
      outputs: [0, 100, 200, 300],
    },
    scale: { side: 'convergence', unit: 'percent', value: 100, confidence: 0.9, reference_field: 'attainment' },
    output_precision: 0,
  };
  const tree = constructTree(intent);
  const constants = findAllConstants(tree);
  // HF-339 carry-not-strip: the breaks carry the model's self-describing nature so
  // the compare node is self-description-sufficient (no more bare-scalar strip).
  // HF-279 no-double-scale PRESERVED: scale === 1 (identity) — the convergence
  // binding's scale_factor normalizes the column, the evaluator must NOT rescale,
  // and x1 is a no-op so the calc stays byte-identical to the prior bare emission.
  for (const v of [80, 120]) {
    const found = constants.find(c => c.value === v) as { value: number; meta?: { unit: string; scale: number } } | undefined;
    assert.ok(found?.meta, `convergence-side break ${v} carries the model's nature (HF-339)`);
    assert.equal(found!.meta!.scale, 1, `convergence-side break ${v} carries identity scale (no evaluator rescale)`);
    assert.equal(found!.meta!.unit, 'percent', `convergence-side break ${v} carries the model's nature verbatim`);
  }
});

test('HF-279 / DD-7: evaluator-side NON-ratio (single pre-computed metric) band KEEPS meta (OLD === NEW)', () => {
  const intent: CompositionalIntent = {
    component_id: 'c-dd7',
    component_name: 'Evaluator Metric Band',
    structure: {
      shape: 'banded_lookup',
      dimensions: [
        { reference_field: 'attainment', reference_source: { type: 'metric', field: 'attainment' }, breaks: [80, 100, 120] },
      ],
      outputs: [0, 100, 200, 300],
    },
    scale: { side: 'evaluator', unit: 'percent', value: 100, confidence: 0.95, reference_field: 'attainment' },
    output_precision: 0,
  };
  const constants = findAllConstants(constructTree(intent));
  for (const v of [80, 120]) {
    const found = constants.find(c => c.value === v);
    assert.ok(found?.meta, `DD-7 break ${v} KEEPS meta (evaluator, pre-computed column)`);
    const m = found!.meta as { unit: string; scale: number };
    assert.equal(m.scale, 100);
  }
});

// ─────────────────────────────────────────────
// HF-279 — recognition-output invariant (loud-failure guard)
// ─────────────────────────────────────────────

test('HF-279 invariant: incoherent intent (ratio band + ambient scale) raises StructuralCoherenceError', () => {
  const incoherent = ratioBandIntent({ side: 'evaluator', unit: 'percent', value: 100, confidence: 0.9 }); // ambient (no reference_field)
  assert.throws(
    () => assertRatioBandScaleCoherence(incoherent, 'c-ratio'),
    (err: unknown) => err instanceof StructuralCoherenceError && /quotient's own space/.test((err as Error).message),
    'ambient scale on a ratio band fails loud',
  );
});

test('HF-279 invariant: incoherent intent (ratio band + named scale matching the band field) raises StructuralCoherenceError', () => {
  const incoherent = ratioBandIntent({ side: 'evaluator', unit: 'percent', value: 100, confidence: 0.9, reference_field: 'on_time_ratio' });
  assert.throws(
    () => assertRatioBandScaleCoherence(incoherent, 'c-ratio'),
    (err: unknown) => err instanceof StructuralCoherenceError,
    'named scale binding the ratio band fails loud',
  );
});

test('HF-279 invariant: coherent intent (ratio band + scale null) does NOT throw', () => {
  assert.doesNotThrow(() => assertRatioBandScaleCoherence(ratioBandIntent(null), 'c-ratio'));
});

test('HF-279 invariant: DD-7 (evaluator metric band + scale) does NOT throw — only ratio bands are guarded', () => {
  const dd7: CompositionalIntent = {
    component_id: 'c-dd7',
    component_name: 'Evaluator Metric Band',
    structure: {
      shape: 'banded_lookup',
      dimensions: [
        { reference_field: 'attainment', reference_source: { type: 'metric', field: 'attainment' }, breaks: [80, 100, 120] },
      ],
      outputs: [0, 100, 200, 300],
    },
    scale: { side: 'evaluator', unit: 'percent', value: 100, confidence: 0.95, reference_field: 'attainment' },
    output_precision: 0,
  };
  assert.doesNotThrow(() => assertRatioBandScaleCoherence(dd7, 'c-dd7'));
});

test('HF-279 invariant: a named scale that binds a NON-ratio axis of a mixed matrix does NOT throw (precision)', () => {
  // 2D matrix: dim0 a pre-computed percent metric (scaled), dim1 a ratio (quotient space).
  // The scale names dim0's field -> it binds the metric axis, not the ratio axis -> coherent.
  const mixed: CompositionalIntent = {
    component_id: 'c-mixed',
    component_name: 'Mixed Matrix',
    structure: {
      shape: 'banded_lookup',
      dimensions: [
        { reference_field: 'pct_metric', reference_source: { type: 'metric', field: 'pct_metric' }, breaks: [80, 100] },
        { reference_field: 'ratio_axis', reference_source: { type: 'ratio', numerator_field: 'a', denominator_field: 'b' }, breaks: [0.9, 1.1] },
      ],
      outputs: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    },
    scale: { side: 'evaluator', unit: 'percent', value: 100, confidence: 0.9, reference_field: 'pct_metric' },
    output_precision: 0,
  };
  assert.doesNotThrow(() => assertRatioBandScaleCoherence(mixed, 'c-mixed'));
});
