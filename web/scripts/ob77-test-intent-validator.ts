/**
 * OB-77 Mission 1 Tests: AI-Native Intent Production
 *
 * Tests:
 * 1. Validator catches malformed intents
 * 2. Validator passes well-formed intents
 * 3. Intent resolver uses transformer fallback when AI intent is invalid
 * 4. Intent resolver prefers AI intent when valid
 * 5. System prompt includes structural vocabulary
 * 6. Compare AI intents from DB (if present) vs transformer intents
 */

import { createClient } from '@supabase/supabase-js';
import { validateIntent, validateComponentIntent } from '../src/lib/calculation/intent-validator';
import { resolveIntent, resolveVariantIntents } from '../src/lib/calculation/intent-resolver';
import { transformComponent } from '../src/lib/calculation/intent-transformer';
import type { PlanComponent } from '../src/types/compensation-plan';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

async function main() {
  // ──────────────────────────────────────────────
  // Test 1: Validator catches malformed intents
  // ──────────────────────────────────────────────
  console.log('=== Test 1: Malformed Intent Detection ===');

  const r1 = validateIntent(null);
  assert(!r1.valid, 'null intent → invalid');

  const r2 = validateIntent({});
  assert(!r2.valid, 'empty object → invalid (no operation)');

  const r3 = validateIntent({ operation: 'invalid_op' });
  assert(!r3.valid, 'unknown operation → invalid');

  const r4 = validateIntent({
    operation: 'bounded_lookup_1d',
    // missing input, boundaries, outputs
  });
  assert(!r4.valid, 'bounded_lookup_1d missing fields → invalid');

  const r5 = validateIntent({
    operation: 'bounded_lookup_1d',
    input: { source: 'metric', sourceSpec: { field: 'test' } },
    boundaries: [{ min: 0, max: 100 }],
    outputs: [100, 200], // length mismatch
  });
  assert(!r5.valid, 'boundaries/outputs length mismatch → invalid');

  const r6 = validateIntent({
    operation: 'scalar_multiply',
    input: { source: 'metric', sourceSpec: { field: 'test' } },
    // missing rate
  });
  assert(!r6.valid, 'scalar_multiply missing rate → invalid');

  const r7 = validateIntent({
    operation: 'conditional_gate',
    condition: {
      left: { source: 'metric', sourceSpec: { field: 'x' } },
      operator: '>=',
      right: { source: 'constant', value: 100 },
    },
    // missing onTrue and onFalse
  });
  assert(!r7.valid, 'conditional_gate missing branches → invalid');

  // ──────────────────────────────────────────────
  // Test 2: Validator passes well-formed intents
  // ──────────────────────────────────────────────
  console.log('\n=== Test 2: Well-formed Intent Validation ===');

  const g1 = validateIntent({
    operation: 'bounded_lookup_1d',
    input: { source: 'metric', sourceSpec: { field: 'attainment' } },
    boundaries: [
      { min: 0, max: 99.99, minInclusive: true, maxInclusive: true },
      { min: 100, max: null, minInclusive: true, maxInclusive: true },
    ],
    outputs: [0, 500],
    noMatchBehavior: 'zero',
  });
  assert(g1.valid, 'valid bounded_lookup_1d');

  const g2 = validateIntent({
    operation: 'scalar_multiply',
    input: { source: 'metric', sourceSpec: { field: 'sales' } },
    rate: 0.04,
  });
  assert(g2.valid, 'valid scalar_multiply');

  const g3 = validateIntent({
    operation: 'constant',
    value: 42,
  });
  assert(g3.valid, 'valid constant');

  const g4 = validateIntent({
    operation: 'conditional_gate',
    condition: {
      left: { source: 'metric', sourceSpec: { field: 'x' } },
      operator: '>=',
      right: { source: 'constant', value: 100 },
    },
    onTrue: { operation: 'constant', value: 500 },
    onFalse: { operation: 'constant', value: 0 },
  });
  assert(g4.valid, 'valid conditional_gate');

  const g5 = validateIntent({
    operation: 'bounded_lookup_2d',
    inputs: {
      row: { source: 'metric', sourceSpec: { field: 'att' } },
      column: { source: 'metric', sourceSpec: { field: 'vol' } },
    },
    rowBoundaries: [{ min: 0, max: 100 }],
    columnBoundaries: [{ min: 0, max: 50000 }],
    outputGrid: [[300]],
    noMatchBehavior: 'zero',
  });
  assert(g5.valid, 'valid bounded_lookup_2d');

  // ──────────────────────────────────────────────
  // Test 3: Resolver uses transformer fallback
  // ──────────────────────────────────────────────
  console.log('\n=== Test 3: Resolver Fallback ===');

  // Component with invalid AI intent → should fallback to transformer
  const compWithBadAI: PlanComponent = {
    id: 'test-comp',
    name: 'Test Component',
    description: '',
    order: 1,
    enabled: true,
    componentType: 'tier_lookup',
    measurementLevel: 'store',
    tierConfig: {
      metric: 'test_attainment',
      metricLabel: 'Test',
      tiers: [
        { min: 0, max: 100, label: '<100%', value: 0 },
        { min: 100, max: 999999, label: '>=100%', value: 500 },
      ],
      currency: 'MXN',
    },
    calculationIntent: { operation: 'invalid_garbage' }, // Bad AI intent
  };

  const resolved1 = resolveIntent(compWithBadAI, 0);
  assert(resolved1 !== null, 'Fallback: resolved to something');
  assert(resolved1?.source === 'transformer', 'Fallback: source is transformer');
  assert((resolved1?.validationErrors?.length ?? 0) > 0, 'Fallback: has validation errors');

  // ──────────────────────────────────────────────
  // Test 4: Resolver prefers valid AI intent
  // ──────────────────────────────────────────────
  console.log('\n=== Test 4: Resolver Prefers AI ===');

  const compWithGoodAI: PlanComponent = {
    id: 'test-comp-2',
    name: 'Test Component 2',
    description: '',
    order: 1,
    enabled: true,
    componentType: 'tier_lookup',
    measurementLevel: 'store',
    tierConfig: {
      metric: 'test_attainment',
      metricLabel: 'Test',
      tiers: [
        { min: 0, max: 100, label: '<100%', value: 0 },
        { min: 100, max: 999999, label: '>=100%', value: 500 },
      ],
      currency: 'MXN',
    },
    calculationIntent: {
      operation: 'bounded_lookup_1d',
      input: { source: 'metric', sourceSpec: { field: 'test_attainment' } },
      boundaries: [
        { min: 0, max: 100, minInclusive: true, maxInclusive: true },
        { min: 100, max: 999999, minInclusive: true, maxInclusive: true },
      ],
      outputs: [0, 500],
      noMatchBehavior: 'zero',
    },
  };

  const resolved2 = resolveIntent(compWithGoodAI, 0);
  assert(resolved2 !== null, 'AI preferred: resolved to something');
  assert(resolved2?.source === 'ai', 'AI preferred: source is ai');

  // ──────────────────────────────────────────────
  // Test 5: System prompt includes structural vocabulary
  // ──────────────────────────────────────────────
  console.log('\n=== Test 5: System Prompt Check ===');

  // Read the anthropic adapter to verify prompt changes
  const fs = await import('fs');
  const adapterPath = require.resolve('../src/lib/ai/providers/anthropic-adapter');
  const adapterContent = fs.readFileSync(adapterPath, 'utf-8');

  assert(adapterContent.includes('calculationIntent'), 'Prompt mentions calculationIntent');
  assert(adapterContent.includes('bounded_lookup_1d'), 'Prompt mentions bounded_lookup_1d');
  assert(adapterContent.includes('bounded_lookup_2d'), 'Prompt mentions bounded_lookup_2d');
  assert(adapterContent.includes('scalar_multiply'), 'Prompt mentions scalar_multiply');
  assert(adapterContent.includes('conditional_gate'), 'Prompt mentions conditional_gate');
  assert(adapterContent.includes('noMatchBehavior'), 'Prompt mentions noMatchBehavior');
  assert(adapterContent.includes('7 PRIMITIVE OPERATIONS'), 'Prompt has vocabulary section');

  // ──────────────────────────────────────────────
  // Test 6: Check existing DB components for AI intents
  // ──────────────────────────────────────────────
  console.log('\n=== Test 6: DB Component Check ===');

  const { data } = await supabase
    .from('rule_sets')
    .select('id, name, components')
    .eq('tenant_id', 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (data) {
    const cJson = data.components as Record<string, unknown>;
    const variants = (cJson?.variants as Array<Record<string, unknown>>) ?? [];
    const components = (variants[0]?.components as PlanComponent[]) ?? [];

    const hasAIIntents = components.some(c => c.calculationIntent);
    console.log(`  INFO: ${components.length} components, ${hasAIIntents ? 'HAS' : 'NO'} AI intents`);

    // Resolve all intents (will use transformer since no AI intents in existing data)
    const { intents, aiCount, transformerCount } = resolveVariantIntents(components);
    assert(intents.length === components.filter(c => c.enabled).length,
      `Resolved ${intents.length} intents`);
    console.log(`  AI: ${aiCount}, Transformer: ${transformerCount}`);

    // If AI intents exist, compare with transformer
    if (hasAIIntents) {
      let matches = 0;
      for (const comp of components) {
        if (comp.calculationIntent && comp.enabled) {
          const aiValidation = validateIntent(comp.calculationIntent);
          const txIntent = transformComponent(comp, 0);

          if (aiValidation.valid && txIntent) {
            const aiOp = (comp.calculationIntent as Record<string, unknown>).operation;
            const txOp = txIntent.intent?.operation;
            if (aiOp === txOp) matches++;
            console.log(`  ${comp.name}: AI=${aiOp} TX=${txOp} ${aiOp === txOp ? 'MATCH' : 'MISMATCH'}`);
          }
        }
      }
    }
  }

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
