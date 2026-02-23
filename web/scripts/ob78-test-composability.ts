/**
 * OB-78 Mission 1 Tests: Intent Composability
 *
 * Tests:
 * 1. Nested scalar_multiply(bounded_lookup_1d()) — rate from lookup
 * 2. Nested bounded_lookup_1d(ratio()) — input from computed ratio
 * 3. Nested bounded_lookup_2d with computed row input
 * 4. Backward compatibility — flat (non-nested) intents still work
 * 5. Three-level deep composition
 * 6. Validator accepts nested operations
 * 7. Validator rejects malformed nested operations
 * 8. Korean Test — zero domain words in intent-types.ts and intent-executor.ts
 */

import { executeIntent, type EntityData } from '../src/lib/calculation/intent-executor';
import { validateIntent } from '../src/lib/calculation/intent-validator';
import type { ComponentIntent } from '../src/lib/calculation/intent-types';
import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}`);
    failed++;
  }
}

function makeIntent(index: number, label: string, intent: unknown): ComponentIntent {
  return {
    componentIndex: index,
    label,
    confidence: 1.0,
    dataSource: { sheetClassification: 'test', entityScope: 'entity', requiredMetrics: [] },
    intent: intent as ComponentIntent['intent'],
    modifiers: [],
    metadata: {},
  };
}

function main() {
  // ──────────────────────────────────────────────
  // Test 1: Nested scalar_multiply(bounded_lookup_1d())
  // ──────────────────────────────────────────────
  console.log('=== Test 1: scalar_multiply with lookup rate ===');

  const composed1 = makeIntent(0, 'Composed Test 1', {
    operation: 'scalar_multiply',
    input: { source: 'metric', sourceSpec: { field: 'metric:amount' } },
    rate: {
      operation: 'bounded_lookup_1d',
      input: { source: 'metric', sourceSpec: { field: 'metric:amount' } },
      boundaries: [
        { min: 0, max: 99999 },
        { min: 100000, max: 249999 },
        { min: 250000, max: null },
      ],
      outputs: [0.06, 0.055, 0.05],
      noMatchBehavior: 'zero',
    },
  });

  const entity1: EntityData = { entityId: 'test-1', metrics: { amount: 325000 }, attributes: {} };
  const result1 = executeIntent(composed1, entity1);
  // 325000 matches third tier (250000+), rate=0.05, 325000*0.05=16250
  assert(result1.outcome === 16250, `Expected 16250, got ${result1.outcome}`);

  // Also test first tier
  const entity1b: EntityData = { entityId: 'test-1b', metrics: { amount: 50000 }, attributes: {} };
  const result1b = executeIntent(composed1, entity1b);
  // 50000 matches first tier, rate=0.06, 50000*0.06=3000
  assert(result1b.outcome === 3000, `Expected 3000, got ${result1b.outcome}`);

  // ──────────────────────────────────────────────
  // Test 2: Nested bounded_lookup_1d(ratio())
  // ──────────────────────────────────────────────
  console.log('\n=== Test 2: bounded_lookup_1d with ratio input ===');

  const composed2 = makeIntent(1, 'Composed Test 2', {
    operation: 'bounded_lookup_1d',
    input: {
      operation: 'ratio',
      numerator: { source: 'metric', sourceSpec: { field: 'metric:actual' } },
      denominator: { source: 'metric', sourceSpec: { field: 'metric:target' } },
      zeroDenominatorBehavior: 'zero',
    },
    boundaries: [
      { min: 0, max: 0.9999 },
      { min: 1.0, max: 1.0499 },
      { min: 1.05, max: null },
    ],
    outputs: [0, 500, 1000],
    noMatchBehavior: 'zero',
  });

  const entity2: EntityData = { entityId: 'test-2', metrics: { actual: 105000, target: 100000 }, attributes: {} };
  const result2 = executeIntent(composed2, entity2);
  // ratio = 1.05, matches third tier (1.05+), output = 1000
  assert(result2.outcome === 1000, `Expected 1000, got ${result2.outcome}`);

  // Below threshold
  const entity2b: EntityData = { entityId: 'test-2b', metrics: { actual: 90000, target: 100000 }, attributes: {} };
  const result2b = executeIntent(composed2, entity2b);
  // ratio = 0.9, matches first tier, output = 0
  assert(result2b.outcome === 0, `Expected 0, got ${result2b.outcome}`);

  // ──────────────────────────────────────────────
  // Test 3: Nested bounded_lookup_2d with computed row input
  // ──────────────────────────────────────────────
  console.log('\n=== Test 3: bounded_lookup_2d with computed row ===');

  const composed3 = makeIntent(2, 'Composed Test 3', {
    operation: 'bounded_lookup_2d',
    inputs: {
      row: {
        operation: 'ratio',
        numerator: { source: 'metric', sourceSpec: { field: 'metric:actual' } },
        denominator: { source: 'metric', sourceSpec: { field: 'metric:target' } },
        zeroDenominatorBehavior: 'zero',
      },
      column: { source: 'metric', sourceSpec: { field: 'metric:group_total' } },
    },
    rowBoundaries: [
      { min: 0, max: 0.9999 },
      { min: 1.0, max: null },
    ],
    columnBoundaries: [
      { min: 0, max: 149999 },
      { min: 150000, max: null },
    ],
    outputGrid: [
      [0, 100],
      [500, 1000],
    ],
    noMatchBehavior: 'zero',
  });

  const entity3: EntityData = {
    entityId: 'test-3',
    metrics: { actual: 110000, target: 100000, group_total: 200000 },
    attributes: {},
  };
  const result3 = executeIntent(composed3, entity3);
  // ratio = 1.1 → row 1, group_total = 200000 → col 1, grid[1][1] = 1000
  assert(result3.outcome === 1000, `Expected 1000, got ${result3.outcome}`);

  // ──────────────────────────────────────────────
  // Test 4: Backward compatibility — flat intents
  // ──────────────────────────────────────────────
  console.log('\n=== Test 4: Backward compatibility ===');

  const flat1 = makeIntent(3, 'Flat scalar_multiply', {
    operation: 'scalar_multiply',
    input: { source: 'metric', sourceSpec: { field: 'metric:amount' } },
    rate: 0.10,
  });
  const entity4: EntityData = { entityId: 'test-4', metrics: { amount: 50000 }, attributes: {} };
  const result4 = executeIntent(flat1, entity4);
  assert(result4.outcome === 5000, `Expected 5000, got ${result4.outcome}`);

  const flat2 = makeIntent(4, 'Flat bounded_lookup_1d', {
    operation: 'bounded_lookup_1d',
    input: { source: 'metric', sourceSpec: { field: 'metric:value' } },
    boundaries: [{ min: 0, max: 100 }, { min: 100, max: null }],
    outputs: [10, 20],
    noMatchBehavior: 'zero',
  });
  const entity4b: EntityData = { entityId: 'test-4b', metrics: { value: 150 }, attributes: {} };
  const result4b = executeIntent(flat2, entity4b);
  assert(result4b.outcome === 20, `Expected 20, got ${result4b.outcome}`);

  // ──────────────────────────────────────────────
  // Test 5: Three-level deep composition
  // ──────────────────────────────────────────────
  console.log('\n=== Test 5: Three-level deep ===');

  const threeDeep = makeIntent(5, 'Three-Deep', {
    operation: 'scalar_multiply',
    input: { source: 'metric', sourceSpec: { field: 'metric:actual' } },
    rate: {
      operation: 'bounded_lookup_1d',
      input: {
        operation: 'ratio',
        numerator: { source: 'metric', sourceSpec: { field: 'metric:actual' } },
        denominator: { source: 'metric', sourceSpec: { field: 'metric:target' } },
        zeroDenominatorBehavior: 'zero',
      },
      boundaries: [
        { min: 0, max: 0.9999 },
        { min: 1.0, max: null },
      ],
      outputs: [0.05, 0.10],
      noMatchBehavior: 'zero',
    },
  });

  const entity5: EntityData = { entityId: 'test-5', metrics: { actual: 120000, target: 100000 }, attributes: {} };
  const result5 = executeIntent(threeDeep, entity5);
  // ratio = 1.2 → second tier → rate = 0.10, 120000 * 0.10 = 12000
  assert(result5.outcome === 12000, `Expected 12000, got ${result5.outcome}`);

  // Below threshold — three-level
  const entity5b: EntityData = { entityId: 'test-5b', metrics: { actual: 80000, target: 100000 }, attributes: {} };
  const result5b = executeIntent(threeDeep, entity5b);
  // ratio = 0.8 → first tier → rate = 0.05, 80000 * 0.05 = 4000
  assert(result5b.outcome === 4000, `Expected 4000, got ${result5b.outcome}`);

  // ──────────────────────────────────────────────
  // Test 6: Validator accepts nested operations
  // ──────────────────────────────────────────────
  console.log('\n=== Test 6: Validator accepts nested ops ===');

  const v1 = validateIntent({
    operation: 'scalar_multiply',
    input: { source: 'metric', sourceSpec: { field: 'test' } },
    rate: {
      operation: 'bounded_lookup_1d',
      input: { source: 'metric', sourceSpec: { field: 'test' } },
      boundaries: [{ min: 0, max: 100 }],
      outputs: [0.05],
      noMatchBehavior: 'zero',
    },
  });
  assert(v1.valid, 'Validator accepts scalar_multiply with nested rate');

  const v2 = validateIntent({
    operation: 'bounded_lookup_1d',
    input: {
      operation: 'ratio',
      numerator: { source: 'metric', sourceSpec: { field: 'a' } },
      denominator: { source: 'metric', sourceSpec: { field: 'b' } },
      zeroDenominatorBehavior: 'zero',
    },
    boundaries: [{ min: 0, max: 100 }],
    outputs: [10],
    noMatchBehavior: 'zero',
  });
  assert(v2.valid, 'Validator accepts bounded_lookup_1d with nested input');

  const v3 = validateIntent({
    operation: 'bounded_lookup_2d',
    inputs: {
      row: {
        operation: 'ratio',
        numerator: { source: 'metric', sourceSpec: { field: 'a' } },
        denominator: { source: 'metric', sourceSpec: { field: 'b' } },
        zeroDenominatorBehavior: 'zero',
      },
      column: { source: 'metric', sourceSpec: { field: 'c' } },
    },
    rowBoundaries: [{ min: 0, max: 100 }],
    columnBoundaries: [{ min: 0, max: 100 }],
    outputGrid: [[10]],
    noMatchBehavior: 'zero',
  });
  assert(v3.valid, 'Validator accepts bounded_lookup_2d with nested row');

  // ──────────────────────────────────────────────
  // Test 7: Validator rejects malformed nested ops
  // ──────────────────────────────────────────────
  console.log('\n=== Test 7: Validator rejects malformed nested ops ===');

  const v4 = validateIntent({
    operation: 'scalar_multiply',
    input: { source: 'metric', sourceSpec: { field: 'test' } },
    rate: {
      operation: 'bounded_lookup_1d',
      // missing input, boundaries, outputs
    },
  });
  assert(!v4.valid, 'Rejects nested operation missing fields');

  const v5 = validateIntent({
    operation: 'scalar_multiply',
    input: { source: 'metric', sourceSpec: { field: 'test' } },
    rate: { operation: 'invalid_op' },
  });
  assert(!v5.valid, 'Rejects nested operation with invalid operation type');

  const v6 = validateIntent({
    operation: 'bounded_lookup_1d',
    input: { operation: 'ratio' }, // ratio missing numerator/denominator
    boundaries: [{ min: 0, max: 100 }],
    outputs: [10],
    noMatchBehavior: 'zero',
  });
  assert(!v6.valid, 'Rejects nested ratio missing numerator/denominator');

  // ──────────────────────────────────────────────
  // Test 8: Korean Test
  // ──────────────────────────────────────────────
  console.log('\n=== Test 8: Korean Test ===');

  const webRoot = path.resolve(__dirname, '..');
  const domainWords = /commission|compensation|attainment|payout|incentive|sales|quota|royalt/gi;

  for (const file of ['intent-types.ts', 'intent-executor.ts']) {
    const content = fs.readFileSync(path.join(webRoot, 'src/lib/calculation', file), 'utf-8');
    const matches = content.match(domainWords) || [];
    assert(matches.length === 0, `${file}: ${matches.length} domain words (${matches.join(', ') || 'none'})`);
  }

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
