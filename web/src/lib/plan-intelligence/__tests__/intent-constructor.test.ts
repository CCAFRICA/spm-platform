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
import { ConstructionError } from '../compositional-intent';
import type { CompositionalIntent, BandedLookupDescription } from '../compositional-intent';
import type { PrimeNode } from '../../calculation/intent-types';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function countConstantLeaves(node: PrimeNode): number {
  if (node.prime === 'constant') return 1;
  if (node.prime === 'conditional') {
    return countConstantLeaves(node.then) + countConstantLeaves(node.else) + countConstantLeaves(node.condition);
  }
  if (node.prime === 'arithmetic') {
    return countConstantLeaves(node.inputs[0]) + countConstantLeaves(node.inputs[1]);
  }
  if (node.prime === 'compare') {
    return countConstantLeaves(node.inputs[0]) + countConstantLeaves(node.inputs[1]);
  }
  if (node.prime === 'logical') {
    return node.inputs.reduce((acc, i) => acc + countConstantLeaves(i), 0);
  }
  if (node.prime === 'filter' || node.prime === 'scope' || node.prime === 'prior_period') {
    return countConstantLeaves(node.downstream);
  }
  return 0;
}

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
