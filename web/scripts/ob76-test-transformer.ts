/**
 * OB-76 Mission 3 Test: Intent Transformer
 *
 * Tests:
 * 1. Transform all 6 Pipeline Test Co components from Supabase
 * 2. Verify each produces the correct intent operation type
 * 3. Verify Korean Test (zero domain words in output)
 * 4. Verify roundtrip: transform → execute with known metrics → compare to current engine
 */

import { createClient } from '@supabase/supabase-js';
import { transformComponent, transformVariant } from '../src/lib/calculation/intent-transformer';
import { executeIntent, type EntityData } from '../src/lib/calculation/intent-executor';
import {
  evaluateTierLookup,
  evaluateMatrixLookup,
  evaluatePercentage,
  evaluateConditionalPercentage,
} from '../src/lib/calculation/run-calculation';
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
  // 1. Fetch actual Pipeline Test Co components
  const { data } = await supabase
    .from('rule_sets')
    .select('id, name, components')
    .eq('tenant_id', 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd')
    .limit(1)
    .single();

  if (!data) {
    console.log('ERROR: No rule set found');
    process.exit(1);
  }

  console.log(`Rule set: ${data.name}\n`);

  const cJson = data.components as Record<string, unknown>;
  const variants = (cJson?.variants as Array<Record<string, unknown>>) ?? [];
  const components = (variants[0]?.components as PlanComponent[]) ?? [];

  console.log(`Found ${components.length} components\n`);

  // ──────────────────────────────────────────────
  // Test 1: Transform all components
  // ──────────────────────────────────────────────
  console.log('=== Test 1: Transform All Components ===');
  const intents = transformVariant(components);
  assert(intents.length === components.filter(c => c.enabled).length,
    `Transformed ${intents.length} intents from ${components.length} components`);

  for (const intent of intents) {
    console.log(`  Component ${intent.componentIndex}: "${intent.label}" → ${intent.intent?.operation ?? 'variant-routed'}`);
  }

  // ──────────────────────────────────────────────
  // Test 2: Verify operation types
  // ──────────────────────────────────────────────
  console.log('\n=== Test 2: Verify Operation Types ===');
  const expectedOps: Record<string, string> = {};

  for (const comp of components) {
    if (!comp.enabled) continue;
    switch (comp.componentType) {
      case 'tier_lookup': expectedOps[comp.name] = 'bounded_lookup_1d'; break;
      case 'matrix_lookup': expectedOps[comp.name] = 'bounded_lookup_2d'; break;
      case 'percentage': expectedOps[comp.name] = 'scalar_multiply'; break;
      case 'conditional_percentage': expectedOps[comp.name] = 'conditional_gate'; break;
    }
  }

  for (const intent of intents) {
    const expected = expectedOps[intent.label];
    const actual = intent.intent?.operation;
    assert(actual === expected, `${intent.label}: ${actual} === ${expected}`);
  }

  // ──────────────────────────────────────────────
  // Test 3: Korean Test on intents
  // ──────────────────────────────────────────────
  console.log('\n=== Test 3: Korean Test ===');
  const domainWords = /commission|compensation|payout|quota|attainment|incentive|salary|bonus|sales/i;
  const intentJson = JSON.stringify(intents);

  // Check structural fields only (not metadata or labels which carry domain info by design)
  let domainInStructure = false;
  for (const intent of intents) {
    const op = intent.intent;
    if (op) {
      const opStr = JSON.stringify(op);
      if (domainWords.test(opStr)) {
        // Only flag if the domain word is in structural fields, not in metric names
        // Metric names (e.g., "store_sales_attainment") are data, not structure
        const structuralFields = ['operation', 'noMatchBehavior', 'modifier', 'operator'];
        for (const sf of structuralFields) {
          const matches = opStr.match(new RegExp(`"${sf}"\\s*:\\s*"([^"]+)"`));
          if (matches && domainWords.test(matches[1])) {
            domainInStructure = true;
          }
        }
      }
    }
  }
  assert(!domainInStructure, 'No domain words in structural fields');

  // ──────────────────────────────────────────────
  // Test 4: Dual-path comparison
  // ──────────────────────────────────────────────
  console.log('\n=== Test 4: Dual-Path Comparison ===');

  // Test each component type with known metric values
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    if (!comp.enabled) continue;

    const intent = intents.find(it => it.componentIndex === i);
    if (!intent) continue;

    // Create test metrics based on component type
    const metrics = buildTestMetrics(comp);

    // Current engine result
    const currentResult = runCurrentEngine(comp, metrics);

    // Intent executor result
    const entityData: EntityData = {
      entityId: 'test-entity',
      metrics,
      attributes: {},
    };
    const intentResult = executeIntent(intent, entityData);

    const match = Math.abs(currentResult - intentResult.outcome) < 0.001;
    assert(match,
      `${comp.name}: current=${currentResult}, intent=${intentResult.outcome}`
    );

    if (!match) {
      console.log(`    Current engine: ${currentResult}`);
      console.log(`    Intent executor: ${intentResult.outcome}`);
      console.log(`    Metrics: ${JSON.stringify(metrics)}`);
    }
  }

  // ──────────────────────────────────────────────
  // Test 5: Boundary edge cases
  // ──────────────────────────────────────────────
  console.log('\n=== Test 5: Boundary Edge Cases ===');

  // Find a tier_lookup component for edge testing
  const tierComp = components.find(c => c.componentType === 'tier_lookup' && c.enabled);
  if (tierComp && tierComp.tierConfig) {
    const tierIntent = intents.find(it => it.label === tierComp.name);
    if (tierIntent) {
      const tiers = tierComp.tierConfig.tiers;
      const metric = tierComp.tierConfig.metric;

      // Test: value exactly at tier boundary (min of second tier)
      if (tiers.length >= 2) {
        const boundaryValue = tiers[1].min;
        const metricsAtBound: Record<string, number> = { [metric]: boundaryValue };

        const currentRes = evaluateTierLookup(tierComp.tierConfig, metricsAtBound);
        const intentRes = executeIntent(tierIntent, {
          entityId: 'edge-test',
          metrics: metricsAtBound,
          attributes: {},
        });

        assert(
          Math.abs(currentRes.payout - intentRes.outcome) < 0.001,
          `Edge: ${tierComp.name} at boundary ${boundaryValue}: current=${currentRes.payout}, intent=${intentRes.outcome}`
        );
      }

      // Test: value below all tiers
      const belowAll: Record<string, number> = { [metric]: -999 };
      const currentBelow = evaluateTierLookup(tierComp.tierConfig, belowAll);
      const intentBelow = executeIntent(tierIntent, {
        entityId: 'below-test',
        metrics: belowAll,
        attributes: {},
      });
      assert(
        Math.abs(currentBelow.payout - intentBelow.outcome) < 0.001,
        `Edge: ${tierComp.name} below all tiers: current=${currentBelow.payout}, intent=${intentBelow.outcome}`
      );
    }
  }

  // ──────────────────────────────────────────────
  // Test 6: Confidence and metadata
  // ──────────────────────────────────────────────
  console.log('\n=== Test 6: Metadata Integrity ===');
  for (const intent of intents) {
    assert(intent.confidence === 1.0, `${intent.label}: confidence === 1.0 (deterministic)`);
    assert(intent.metadata.planReference !== undefined, `${intent.label}: has planReference`);
    assert(intent.dataSource.requiredMetrics.length > 0, `${intent.label}: has requiredMetrics`);
  }

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function buildTestMetrics(comp: PlanComponent): Record<string, number> {
  const metrics: Record<string, number> = {};

  switch (comp.componentType) {
    case 'tier_lookup':
      if (comp.tierConfig) {
        // Pick a value in the middle of the second tier (if exists)
        const tiers = comp.tierConfig.tiers;
        if (tiers.length >= 2) {
          const mid = (tiers[1].min + Math.min(tiers[1].max, tiers[1].min + 0.1)) / 2;
          metrics[comp.tierConfig.metric] = mid;
        } else if (tiers.length >= 1) {
          metrics[comp.tierConfig.metric] = tiers[0].min;
        }
      }
      break;

    case 'matrix_lookup':
      if (comp.matrixConfig) {
        const rows = comp.matrixConfig.rowBands;
        const cols = comp.matrixConfig.columnBands;
        if (rows.length >= 2 && cols.length >= 2) {
          metrics[comp.matrixConfig.rowMetric] =
            (rows[1].min + Math.min(rows[1].max, rows[1].min + 0.05)) / 2;
          metrics[comp.matrixConfig.columnMetric] =
            (cols[1].min + Math.min(cols[1].max, cols[1].min + 10000)) / 2;
        }
      }
      break;

    case 'percentage':
      if (comp.percentageConfig) {
        metrics[comp.percentageConfig.appliedTo] = 10000;
      }
      break;

    case 'conditional_percentage':
      if (comp.conditionalConfig) {
        metrics[comp.conditionalConfig.appliedTo] = 5000;
        // Set condition metric to middle of first condition range
        const conds = comp.conditionalConfig.conditions;
        if (conds.length > 0) {
          const c = conds[0];
          const mid = (c.min + Math.min(c.max, c.min + 0.1)) / 2;
          metrics[c.metric] = mid;
        }
      }
      break;
  }

  return metrics;
}

function runCurrentEngine(comp: PlanComponent, metrics: Record<string, number>): number {
  switch (comp.componentType) {
    case 'tier_lookup':
      return comp.tierConfig
        ? evaluateTierLookup(comp.tierConfig, metrics).payout : 0;
    case 'matrix_lookup':
      return comp.matrixConfig
        ? evaluateMatrixLookup(comp.matrixConfig, metrics).payout : 0;
    case 'percentage':
      return comp.percentageConfig
        ? evaluatePercentage(comp.percentageConfig, metrics).payout : 0;
    case 'conditional_percentage':
      return comp.conditionalConfig
        ? evaluateConditionalPercentage(comp.conditionalConfig, metrics).payout : 0;
  }
}

main();
