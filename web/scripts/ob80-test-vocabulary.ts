/**
 * OB-80 Mission 1: Vocabulary Extension Tests
 * weighted_blend + temporal_window
 *
 * 13 tests, 7 proof gates
 */

import { executeIntent, type EntityData } from '../src/lib/calculation/intent-executor';
import type {
  ComponentIntent,
  IntentOperation,
  WeightedBlendOp,
  TemporalWindowOp,
} from '../src/lib/calculation/intent-types';
import { validateIntent } from '../src/lib/calculation/intent-validator';
import { generatePatternSignature } from '../src/lib/calculation/pattern-signature';
import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function makeIntent(op: IntentOperation, idx = 0): ComponentIntent {
  return {
    componentIndex: idx,
    label: `Test Component ${idx}`,
    confidence: 0.9,
    dataSource: {
      sheetClassification: 'test',
      entityScope: 'entity',
      requiredMetrics: ['value'],
    },
    intent: op,
    modifiers: [],
    metadata: {},
  };
}

function makeEntity(metrics: Record<string, number>, history?: number[]): EntityData {
  return {
    entityId: 'e1',
    metrics,
    attributes: {},
    periodHistory: history,
  };
}

// ──────────────────────────────────────────────
// Test 1: weighted_blend with 2 inputs (50/50)
// ──────────────────────────────────────────────
console.log('\n=== Test 1: weighted_blend 2 inputs (50/50) ===');
{
  const op: WeightedBlendOp = {
    operation: 'weighted_blend',
    inputs: [
      { source: { source: 'metric', sourceSpec: { field: 'metric:a' } }, weight: 0.5 },
      { source: { source: 'metric', sourceSpec: { field: 'metric:b' } }, weight: 0.5 },
    ],
  };
  const intent = makeIntent(op);
  const entity = makeEntity({ a: 100, b: 200 });
  const result = executeIntent(intent, entity);
  assert(result.outcome === 150, 'PG-1a: 50% of 100 + 50% of 200 = 150', `got ${result.outcome}`);
}

// ──────────────────────────────────────────────
// Test 2: weighted_blend with 3 inputs (40/30/30)
// ──────────────────────────────────────────────
console.log('\n=== Test 2: weighted_blend 3 inputs (40/30/30) ===');
{
  const op: WeightedBlendOp = {
    operation: 'weighted_blend',
    inputs: [
      { source: { source: 'metric', sourceSpec: { field: 'metric:a' } }, weight: 0.4 },
      { source: { source: 'metric', sourceSpec: { field: 'metric:b' } }, weight: 0.3 },
      { source: { source: 'metric', sourceSpec: { field: 'metric:c' } }, weight: 0.3 },
    ],
  };
  const intent = makeIntent(op);
  const entity = makeEntity({ a: 100, b: 200, c: 300 });
  const result = executeIntent(intent, entity);
  // 0.4*100 + 0.3*200 + 0.3*300 = 40 + 60 + 90 = 190
  assert(result.outcome === 190, 'PG-1b: 40% of 100 + 30% of 200 + 30% of 300 = 190', `got ${result.outcome}`);
}

// ──────────────────────────────────────────────
// Test 3: weighted_blend with nested operations (composable)
// ──────────────────────────────────────────────
console.log('\n=== Test 3: weighted_blend with nested ops ===');
{
  const op: WeightedBlendOp = {
    operation: 'weighted_blend',
    inputs: [
      {
        source: {
          operation: 'bounded_lookup_1d',
          input: { source: 'metric', sourceSpec: { field: 'metric:ratio' } },
          boundaries: [
            { min: 0, max: 0.99, minInclusive: true, maxInclusive: true },
            { min: 1.0, max: null, minInclusive: true, maxInclusive: false },
          ],
          outputs: [0, 500],
          noMatchBehavior: 'zero' as const,
        },
        weight: 0.5,
      },
      {
        source: { source: 'constant', value: 1000 },
        weight: 0.5,
      },
    ],
  };
  const intent = makeIntent(op);
  const entity = makeEntity({ ratio: 1.2 });
  const result = executeIntent(intent, entity);
  // 0.5*500 + 0.5*1000 = 250 + 500 = 750
  assert(result.outcome === 750, 'PG-2: Nested lookup + constant blend = 750', `got ${result.outcome}`);
}

// ──────────────────────────────────────────────
// Test 4: weighted_blend weight validation
// ──────────────────────────────────────────────
console.log('\n=== Test 4: weighted_blend weight validation ===');
{
  const valid = validateIntent({
    operation: 'weighted_blend',
    inputs: [
      { source: { source: 'metric', sourceSpec: { field: 'a' } }, weight: 0.5 },
      { source: { source: 'metric', sourceSpec: { field: 'b' } }, weight: 0.5 },
    ],
  });
  assert(valid.valid, 'Valid blend accepted');

  const badWeights = validateIntent({
    operation: 'weighted_blend',
    inputs: [
      { source: { source: 'metric', sourceSpec: { field: 'a' } }, weight: 0.3 },
      { source: { source: 'metric', sourceSpec: { field: 'b' } }, weight: 0.3 },
    ],
  });
  assert(badWeights.warnings.length > 0, 'Weights not summing to 1.0 produces warning');

  const tooFew = validateIntent({
    operation: 'weighted_blend',
    inputs: [
      { source: { source: 'metric', sourceSpec: { field: 'a' } }, weight: 1.0 },
    ],
  });
  assert(!tooFew.valid, 'Less than 2 inputs rejected');
}

// ──────────────────────────────────────────────
// Test 5: weighted_blend with scope override
// ──────────────────────────────────────────────
console.log('\n=== Test 5: weighted_blend with scope override ===');
{
  const op: WeightedBlendOp = {
    operation: 'weighted_blend',
    inputs: [
      { source: { source: 'metric', sourceSpec: { field: 'metric:individual' } }, weight: 0.6, scope: 'entity' },
      { source: { source: 'aggregate', sourceSpec: { field: 'metric:group_total', scope: 'group', aggregation: 'sum' } }, weight: 0.4, scope: 'group' },
    ],
  };
  const intent = makeIntent(op);
  const entity: EntityData = {
    entityId: 'e1',
    metrics: { individual: 100 },
    attributes: {},
    groupMetrics: { group_total: 500 },
  };
  const result = executeIntent(intent, entity);
  // 0.6*100 + 0.4*500 = 60 + 200 = 260
  assert(result.outcome === 260, 'Scope override: entity + group blend = 260', `got ${result.outcome}`);
}

// ──────────────────────────────────────────────
// Test 6: temporal_window with sum aggregation
// ──────────────────────────────────────────────
console.log('\n=== Test 6: temporal_window sum ===');
{
  const op: TemporalWindowOp = {
    operation: 'temporal_window',
    input: { source: 'metric', sourceSpec: { field: 'metric:value' } },
    windowSize: 3,
    aggregation: 'sum',
    includeCurrentPeriod: true,
  };
  const intent = makeIntent(op);
  const entity = makeEntity({ value: 100 }, [50, 60, 70]); // history: [50, 60, 70], current: 100
  const result = executeIntent(intent, entity);
  // Last 3 from history = [50, 60, 70], then add current: [50, 60, 70, 100] → sum = 280
  // Wait: windowSize=3, history=[50,60,70], slice(-3) = [50,60,70], include current → [50,60,70,100], sum=280
  assert(result.outcome === 280, 'PG-3a: Sum of 3 history + current = 280', `got ${result.outcome}`);
}

// ──────────────────────────────────────────────
// Test 7: temporal_window with average aggregation
// ──────────────────────────────────────────────
console.log('\n=== Test 7: temporal_window average ===');
{
  const op: TemporalWindowOp = {
    operation: 'temporal_window',
    input: { source: 'metric', sourceSpec: { field: 'metric:value' } },
    windowSize: 3,
    aggregation: 'average',
    includeCurrentPeriod: false,
  };
  const intent = makeIntent(op);
  const entity = makeEntity({ value: 999 }, [100, 200, 300]); // history only, current excluded
  const result = executeIntent(intent, entity);
  // [100, 200, 300] → avg = 200
  assert(result.outcome === 200, 'PG-3b: Average of 3 history periods = 200', `got ${result.outcome}`);
}

// ──────────────────────────────────────────────
// Test 8: temporal_window with trend (slope)
// ──────────────────────────────────────────────
console.log('\n=== Test 8: temporal_window trend ===');
{
  const op: TemporalWindowOp = {
    operation: 'temporal_window',
    input: { source: 'metric', sourceSpec: { field: 'metric:value' } },
    windowSize: 4,
    aggregation: 'trend',
    includeCurrentPeriod: false,
  };
  const intent = makeIntent(op);
  const entity = makeEntity({ value: 999 }, [100, 200, 300, 400]); // linear increase of 100/period
  const result = executeIntent(intent, entity);
  // Linear regression slope: values [100,200,300,400] at x=[0,1,2,3]
  // slope = 100
  assert(Math.abs(result.outcome - 100) < 0.1, 'Trend slope = 100 for linear data', `got ${result.outcome}`);
}

// ──────────────────────────────────────────────
// Test 9: temporal_window graceful degradation (no history)
// ──────────────────────────────────────────────
console.log('\n=== Test 9: temporal_window no history ===');
{
  const op: TemporalWindowOp = {
    operation: 'temporal_window',
    input: { source: 'metric', sourceSpec: { field: 'metric:value' } },
    windowSize: 3,
    aggregation: 'average',
    includeCurrentPeriod: false,
  };
  const intent = makeIntent(op);
  const entity = makeEntity({ value: 500 }); // no history
  const result = executeIntent(intent, entity);
  // No history, includeCurrentPeriod=false → empty window → return current value
  assert(result.outcome === 500, 'PG-4: No history → returns current value', `got ${result.outcome}`);
}

// ──────────────────────────────────────────────
// Test 10: temporal_window with nested input
// ──────────────────────────────────────────────
console.log('\n=== Test 10: temporal_window with nested input ===');
{
  const op: TemporalWindowOp = {
    operation: 'temporal_window',
    input: {
      operation: 'ratio',
      numerator: { source: 'metric', sourceSpec: { field: 'metric:actual' } },
      denominator: { source: 'metric', sourceSpec: { field: 'metric:target' } },
      zeroDenominatorBehavior: 'zero' as const,
    },
    windowSize: 2,
    aggregation: 'average',
    includeCurrentPeriod: true,
  };
  const intent = makeIntent(op);
  const entity = makeEntity({ actual: 90, target: 100 }, [0.8, 0.85]); // current ratio = 0.9
  const result = executeIntent(intent, entity);
  // history = [0.8, 0.85], current = 0.9, include current → [0.8, 0.85, 0.9]
  // Wait: windowSize=2, slice(-2) = [0.8, 0.85], include current → [0.8, 0.85, 0.9]
  // avg = 0.85
  const expected = (0.8 + 0.85 + 0.9) / 3;
  assert(Math.abs(result.outcome - expected) < 0.01, 'Nested ratio in temporal window', `got ${result.outcome}, expected ${expected}`);
}

// ──────────────────────────────────────────────
// Test 11: Backward compatibility — existing operations
// ──────────────────────────────────────────────
console.log('\n=== Test 11: Backward compatibility ===');
{
  // bounded_lookup_1d still works
  const lookup1d = makeIntent({
    operation: 'bounded_lookup_1d',
    input: { source: 'metric', sourceSpec: { field: 'metric:value' } },
    boundaries: [
      { min: 0, max: 50, minInclusive: true, maxInclusive: true },
      { min: 51, max: null, minInclusive: true, maxInclusive: false },
    ],
    outputs: [100, 500],
    noMatchBehavior: 'zero',
  });
  const r1 = executeIntent(lookup1d, makeEntity({ value: 75 }));
  assert(r1.outcome === 500, 'PG-5a: bounded_lookup_1d still works', `got ${r1.outcome}`);

  // scalar_multiply still works
  const scalar = makeIntent({
    operation: 'scalar_multiply',
    input: { source: 'metric', sourceSpec: { field: 'metric:amount' } },
    rate: 0.04,
  });
  const r2 = executeIntent(scalar, makeEntity({ amount: 1000 }));
  assert(Math.abs(r2.outcome - 40) < 0.001, 'PG-5b: scalar_multiply still works', `got ${r2.outcome}`);

  // constant still works
  const constant = makeIntent({ operation: 'constant', value: 42 });
  const r3 = executeIntent(constant, makeEntity({}));
  assert(r3.outcome === 42, 'PG-5c: constant still works', `got ${r3.outcome}`);
}

// ──────────────────────────────────────────────
// Test 12: Pattern signatures for new primitives
// ──────────────────────────────────────────────
console.log('\n=== Test 12: Pattern signatures ===');
{
  const blendIntent = makeIntent({
    operation: 'weighted_blend',
    inputs: [
      { source: { source: 'metric', sourceSpec: { field: 'a' } }, weight: 0.5 },
      { source: { source: 'metric', sourceSpec: { field: 'b' } }, weight: 0.5 },
    ],
  });
  const blendSig = generatePatternSignature(blendIntent);
  assert(blendSig.includes('weighted_blend'), 'PG-6a: Blend signature contains weighted_blend', blendSig);
  assert(blendSig.includes('2inputs'), 'PG-6b: Blend signature contains input count', blendSig);

  const windowIntent = makeIntent({
    operation: 'temporal_window',
    input: { source: 'metric', sourceSpec: { field: 'value' } },
    windowSize: 3,
    aggregation: 'average',
    includeCurrentPeriod: true,
  });
  const windowSig = generatePatternSignature(windowIntent);
  assert(windowSig.includes('temporal_window'), 'PG-6c: Window signature contains temporal_window', windowSig);
  assert(windowSig.includes('average'), 'PG-6d: Window signature contains aggregation type', windowSig);
  assert(windowSig.includes('3periods'), 'PG-6e: Window signature contains period count', windowSig);
}

// ──────────────────────────────────────────────
// Test 13: Korean Test — zero domain words in updated files
// ──────────────────────────────────────────────
console.log('\n=== Test 13: Korean Test ===');
{
  const domainWords = /commission|compensation|attainment|payout|incentive|sales|quota|royalt|rebate|franchise/i;
  const files = [
    'intent-types.ts',
    'intent-executor.ts',
    'intent-validator.ts',
    'pattern-signature.ts',
  ];

  for (const file of files) {
    const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'calculation', file), 'utf-8');
    const lines = content.split('\n');
    let domainCount = 0;
    for (const line of lines) {
      if (domainWords.test(line)) domainCount++;
    }
    assert(domainCount === 0, `PG-7: ${file}: ${domainCount} domain words`, domainCount > 0 ? 'FAIL' : undefined);
  }
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`OB-80 Mission 1 Vocabulary Extension: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
