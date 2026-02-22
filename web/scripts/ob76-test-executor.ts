/**
 * OB-76 Unit Tests — Intent Executor
 * Tests all 7 primitives + variant routing + modifiers
 */

import { executeIntent, type EntityData } from '../src/lib/calculation/intent-executor';
import type { ComponentIntent } from '../src/lib/calculation/intent-types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}${details ? ` — ${details}` : ''}`);
    failed++;
  }
}

function assertClose(actual: number, expected: number, tolerance: number, name: string) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, name, `expected=${expected}, actual=${actual}, diff=${diff}`);
}

// ──────────────────────────────────────────────
// Test 1: bounded_lookup_1d
// ──────────────────────────────────────────────
console.log('\n=== Test 1: bounded_lookup_1d ===');

const tier1D: ComponentIntent = {
  componentIndex: 0,
  label: 'Test 1D',
  confidence: 1.0,
  dataSource: { sheetClassification: 'test', entityScope: 'entity', requiredMetrics: ['value'] },
  intent: {
    operation: 'bounded_lookup_1d',
    input: { source: 'metric', sourceSpec: { field: 'metric:value' } },
    boundaries: [
      { min: 0, max: 100 },
      { min: 100, max: 105 },
      { min: 105, max: 110 },
      { min: 110, max: null },
    ],
    outputs: [0, 150, 300, 500],
    noMatchBehavior: 'zero',
  },
  modifiers: [],
  metadata: {},
};

// Below first tier
let result = executeIntent(tier1D, { entityId: 'e1', metrics: { value: 50 }, attributes: {} });
assert(result.outcome === 0, '1D: value=50 → 0 (first tier)');

// In second tier
result = executeIntent(tier1D, { entityId: 'e2', metrics: { value: 102 }, attributes: {} });
assert(result.outcome === 150, '1D: value=102 → 150 (second tier)');

// In third tier
result = executeIntent(tier1D, { entityId: 'e3', metrics: { value: 107 }, attributes: {} });
assert(result.outcome === 300, '1D: value=107 → 300 (third tier)');

// In open-ended tier
result = executeIntent(tier1D, { entityId: 'e4', metrics: { value: 999 }, attributes: {} });
assert(result.outcome === 500, '1D: value=999 → 500 (top tier)');

// Boundary edge: exactly 100 (min inclusive by default)
result = executeIntent(tier1D, { entityId: 'e5', metrics: { value: 100 }, attributes: {} });
assert(result.outcome === 150, '1D: value=100 → 150 (boundary edge, min inclusive)');

// Trace verification
assert(result.trace.lookupResolution !== undefined, '1D: trace has lookupResolution');
assert(result.trace.lookupResolution?.rowBoundaryMatched?.index === 1, '1D: trace shows boundary index 1');

// ──────────────────────────────────────────────
// Test 2: bounded_lookup_2d
// ──────────────────────────────────────────────
console.log('\n=== Test 2: bounded_lookup_2d ===');

const matrix2D: ComponentIntent = {
  componentIndex: 1,
  label: 'Test 2D',
  confidence: 0.95,
  dataSource: { sheetClassification: 'test', entityScope: 'entity', requiredMetrics: ['row_val', 'col_val'] },
  intent: {
    operation: 'bounded_lookup_2d',
    inputs: {
      row: { source: 'metric', sourceSpec: { field: 'metric:row_val' } },
      column: { source: 'metric', sourceSpec: { field: 'metric:col_val' } },
    },
    rowBoundaries: [
      { min: 0, max: 90 },
      { min: 90, max: 100 },
      { min: 100, max: null },
    ],
    columnBoundaries: [
      { min: 0, max: 50000 },
      { min: 50000, max: 100000 },
      { min: 100000, max: null },
    ],
    outputGrid: [
      [0,   100, 200],
      [100, 300, 500],
      [200, 500, 1000],
    ],
    noMatchBehavior: 'zero',
  },
  modifiers: [],
  metadata: {},
};

result = executeIntent(matrix2D, { entityId: 'e1', metrics: { row_val: 95, col_val: 75000 }, attributes: {} });
assert(result.outcome === 300, '2D: row=95, col=75000 → 300 (row[1], col[1])');

result = executeIntent(matrix2D, { entityId: 'e2', metrics: { row_val: 105, col_val: 150000 }, attributes: {} });
assert(result.outcome === 1000, '2D: row=105, col=150000 → 1000 (row[2], col[2])');

result = executeIntent(matrix2D, { entityId: 'e3', metrics: { row_val: 50, col_val: 30000 }, attributes: {} });
assert(result.outcome === 0, '2D: row=50, col=30000 → 0 (row[0], col[0])');

assert(result.trace.lookupResolution?.rowBoundaryMatched?.index === 0, '2D: trace shows row index 0');
assert(result.trace.lookupResolution?.columnBoundaryMatched?.index === 0, '2D: trace shows col index 0');

// ──────────────────────────────────────────────
// Test 3: scalar_multiply
// ──────────────────────────────────────────────
console.log('\n=== Test 3: scalar_multiply ===');

const scalar: ComponentIntent = {
  componentIndex: 2,
  label: 'Test Scalar',
  confidence: 1.0,
  dataSource: { sheetClassification: 'test', entityScope: 'entity', requiredMetrics: ['amount'] },
  intent: {
    operation: 'scalar_multiply',
    input: { source: 'metric', sourceSpec: { field: 'metric:amount' } },
    rate: 0.04,
  },
  modifiers: [],
  metadata: {},
};

result = executeIntent(scalar, { entityId: 'e1', metrics: { amount: 10000 }, attributes: {} });
assertClose(result.outcome, 400, 0.01, 'Scalar: 10000 × 0.04 = 400');

result = executeIntent(scalar, { entityId: 'e2', metrics: { amount: 0 }, attributes: {} });
assert(result.outcome === 0, 'Scalar: 0 × 0.04 = 0');

// ──────────────────────────────────────────────
// Test 4: conditional_gate
// ──────────────────────────────────────────────
console.log('\n=== Test 4: conditional_gate ===');

const conditional: ComponentIntent = {
  componentIndex: 3,
  label: 'Test Conditional',
  confidence: 0.9,
  dataSource: { sheetClassification: 'test', entityScope: 'entity', requiredMetrics: ['base', 'threshold'] },
  intent: {
    operation: 'conditional_gate',
    condition: {
      left: { source: 'metric', sourceSpec: { field: 'metric:threshold' } },
      operator: '>=',
      right: { source: 'constant', value: 100 },
    },
    onTrue: {
      operation: 'scalar_multiply',
      input: { source: 'metric', sourceSpec: { field: 'metric:base' } },
      rate: 0.05,
    },
    onFalse: {
      operation: 'scalar_multiply',
      input: { source: 'metric', sourceSpec: { field: 'metric:base' } },
      rate: 0.03,
    },
  },
  modifiers: [],
  metadata: {},
};

result = executeIntent(conditional, { entityId: 'e1', metrics: { base: 1000, threshold: 120 }, attributes: {} });
assertClose(result.outcome, 50, 0.01, 'Conditional: threshold=120 >= 100 → 1000 × 0.05 = 50');

result = executeIntent(conditional, { entityId: 'e2', metrics: { base: 1000, threshold: 80 }, attributes: {} });
assertClose(result.outcome, 30, 0.01, 'Conditional: threshold=80 < 100 → 1000 × 0.03 = 30');

// ──────────────────────────────────────────────
// Test 5: ratio
// ──────────────────────────────────────────────
console.log('\n=== Test 5: ratio ===');

const ratioIntent: ComponentIntent = {
  componentIndex: 4,
  label: 'Test Ratio',
  confidence: 1.0,
  dataSource: { sheetClassification: 'test', entityScope: 'entity', requiredMetrics: ['actual', 'target'] },
  intent: {
    operation: 'ratio',
    numerator: { source: 'metric', sourceSpec: { field: 'metric:actual' } },
    denominator: { source: 'metric', sourceSpec: { field: 'metric:target' } },
    zeroDenominatorBehavior: 'zero',
  },
  modifiers: [],
  metadata: {},
};

result = executeIntent(ratioIntent, { entityId: 'e1', metrics: { actual: 105, target: 100 }, attributes: {} });
assertClose(result.outcome, 1.05, 0.001, 'Ratio: 105/100 = 1.05');

result = executeIntent(ratioIntent, { entityId: 'e2', metrics: { actual: 50, target: 0 }, attributes: {} });
assert(result.outcome === 0, 'Ratio: 50/0 = 0 (zero denominator)');

// ──────────────────────────────────────────────
// Test 6: aggregate
// ──────────────────────────────────────────────
console.log('\n=== Test 6: aggregate ===');

const aggIntent: ComponentIntent = {
  componentIndex: 5,
  label: 'Test Aggregate',
  confidence: 1.0,
  dataSource: { sheetClassification: 'test', entityScope: 'group', requiredMetrics: ['group_total'] },
  intent: {
    operation: 'aggregate',
    source: { source: 'aggregate', sourceSpec: { field: 'metric:group_total', scope: 'group', aggregation: 'sum' } },
  },
  modifiers: [],
  metadata: {},
};

result = executeIntent(aggIntent, { entityId: 'e1', metrics: {}, attributes: {}, groupMetrics: { group_total: 500000 } });
assert(result.outcome === 500000, 'Aggregate: group total = 500000');

result = executeIntent(aggIntent, { entityId: 'e2', metrics: {}, attributes: {} });
assert(result.outcome === 0, 'Aggregate: no group metrics = 0');

// ──────────────────────────────────────────────
// Test 7: constant
// ──────────────────────────────────────────────
console.log('\n=== Test 7: constant ===');

const constIntent: ComponentIntent = {
  componentIndex: 6,
  label: 'Test Constant',
  confidence: 1.0,
  dataSource: { sheetClassification: 'test', entityScope: 'entity', requiredMetrics: [] },
  intent: { operation: 'constant', value: 42 },
  modifiers: [],
  metadata: {},
};

result = executeIntent(constIntent, { entityId: 'e1', metrics: {}, attributes: {} });
assert(result.outcome === 42, 'Constant: 42');

// ──────────────────────────────────────────────
// Test 8: ratio as input to bounded_lookup_1d
// ──────────────────────────────────────────────
console.log('\n=== Test 8: ratio input to 1D lookup ===');

const ratioLookup: ComponentIntent = {
  componentIndex: 7,
  label: 'Test Ratio→Lookup',
  confidence: 0.95,
  dataSource: { sheetClassification: 'test', entityScope: 'entity', requiredMetrics: ['actual', 'target'] },
  intent: {
    operation: 'bounded_lookup_1d',
    input: { source: 'ratio', sourceSpec: { numerator: 'metric:actual', denominator: 'metric:target' } },
    boundaries: [
      { min: 0, max: 1.0 },
      { min: 1.0, max: 1.05 },
      { min: 1.05, max: 1.10 },
      { min: 1.10, max: null },
    ],
    outputs: [0, 150, 300, 500],
    noMatchBehavior: 'zero',
  },
  modifiers: [],
  metadata: {},
};

result = executeIntent(ratioLookup, { entityId: 'e1', metrics: { actual: 105000, target: 100000 }, attributes: {} });
assert(result.outcome === 300, 'Ratio→1D: 105000/100000=1.05 → 300 (tier 2)');

result = executeIntent(ratioLookup, { entityId: 'e2', metrics: { actual: 120000, target: 100000 }, attributes: {} });
assert(result.outcome === 500, 'Ratio→1D: 120000/100000=1.20 → 500 (top tier)');

// ──────────────────────────────────────────────
// Test 9: variant routing
// ──────────────────────────────────────────────
console.log('\n=== Test 9: variant routing ===');

const variantIntent: ComponentIntent = {
  componentIndex: 8,
  label: 'Test Variant',
  confidence: 0.97,
  dataSource: { sheetClassification: 'test', entityScope: 'entity', requiredMetrics: ['amount'] },
  variants: {
    routingAttribute: { source: 'entity_attribute', sourceSpec: { attribute: 'level' } },
    routes: [
      {
        matchValue: 'A',
        intent: { operation: 'scalar_multiply', input: { source: 'metric', sourceSpec: { field: 'metric:amount' } }, rate: 0.10 },
      },
      {
        matchValue: 'B',
        intent: { operation: 'scalar_multiply', input: { source: 'metric', sourceSpec: { field: 'metric:amount' } }, rate: 0.05 },
      },
    ],
    noMatchBehavior: 'skip',
  },
  modifiers: [],
  metadata: {},
};

result = executeIntent(variantIntent, { entityId: 'e1', metrics: { amount: 1000 }, attributes: { level: 'A' } });
assertClose(result.outcome, 100, 0.01, 'Variant: level=A → 1000 × 0.10 = 100');

result = executeIntent(variantIntent, { entityId: 'e2', metrics: { amount: 1000 }, attributes: { level: 'B' } });
assertClose(result.outcome, 50, 0.01, 'Variant: level=B → 1000 × 0.05 = 50');

result = executeIntent(variantIntent, { entityId: 'e3', metrics: { amount: 1000 }, attributes: { level: 'C' } });
assert(result.outcome === 0, 'Variant: level=C → skip = 0');

assert(result.trace.variantRoute === undefined || result.trace.variantRoute?.matched === undefined,
  'Variant: no match → no route in trace');

// ──────────────────────────────────────────────
// Test 10: modifiers (cap + floor)
// ──────────────────────────────────────────────
console.log('\n=== Test 10: modifiers ===');

const modIntent: ComponentIntent = {
  componentIndex: 9,
  label: 'Test Modifiers',
  confidence: 1.0,
  dataSource: { sheetClassification: 'test', entityScope: 'entity', requiredMetrics: ['amount'] },
  intent: { operation: 'scalar_multiply', input: { source: 'metric', sourceSpec: { field: 'metric:amount' } }, rate: 0.10 },
  modifiers: [
    { modifier: 'cap', maxValue: 500, scope: 'per_entity' },
    { modifier: 'floor', minValue: 10, scope: 'per_entity' },
  ],
  metadata: {},
};

result = executeIntent(modIntent, { entityId: 'e1', metrics: { amount: 10000 }, attributes: {} });
assert(result.outcome === 500, 'Modifier: 10000 × 0.10 = 1000, capped at 500');

result = executeIntent(modIntent, { entityId: 'e2', metrics: { amount: 50 }, attributes: {} });
assert(result.outcome === 10, 'Modifier: 50 × 0.10 = 5, floored at 10');

assert(result.trace.modifiers.length === 2, 'Modifier: trace has 2 modifier entries');

// ──────────────────────────────────────────────
// Test 11: prior_component input
// ──────────────────────────────────────────────
console.log('\n=== Test 11: prior_component ===');

const priorIntent: ComponentIntent = {
  componentIndex: 10,
  label: 'Test Prior',
  confidence: 1.0,
  dataSource: { sheetClassification: 'test', entityScope: 'entity', requiredMetrics: [] },
  intent: {
    operation: 'scalar_multiply',
    input: { source: 'prior_component', sourceSpec: { componentIndex: 0 } },
    rate: 2.0,
  },
  modifiers: [],
  metadata: {},
};

result = executeIntent(priorIntent, { entityId: 'e1', metrics: {}, attributes: {}, priorResults: [250] });
assert(result.outcome === 500, 'Prior: prior[0]=250 × 2.0 = 500');

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
