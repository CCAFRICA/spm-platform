/**
 * OB-78 Mission 6: Korean Test + Integration CLT
 *
 * Tests:
 * PG-31: Korean Test — zero domain words in ALL foundational files
 * PG-32: Integration CLT — full composability + synaptic pipeline
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  createSynapticSurface,
  writeSynapse,
  readSynapses,
  getExecutionMode,
  consolidateSurface,
  initializePatternDensity,
} from '../src/lib/calculation/synaptic-surface';
import { generatePatternSignature } from '../src/lib/calculation/pattern-signature';
import { executeIntent, type EntityData } from '../src/lib/calculation/intent-executor';
import { validateIntent } from '../src/lib/calculation/intent-validator';
import {
  checkBoundaryHit,
  checkZeroOutput,
  checkDataMissing,
} from '../src/lib/calculation/anomaly-detector';
import type { ComponentIntent } from '../src/lib/calculation/intent-types';
import type { SynapticDensity } from '../src/lib/calculation/synaptic-types';

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

function main() {
  // ──────────────────────────────────────────────
  // PG-31: Korean Test — ALL foundational files
  // ──────────────────────────────────────────────
  console.log('=== PG-31: Korean Test ===');

  const webRoot = path.resolve(__dirname, '..');
  const domainWords = /commission|compensation|attainment|payout|incentive|sales|quota|royalt/gi;

  const foundationalFiles = [
    // Intent layer (OB-76/78)
    'src/lib/calculation/intent-types.ts',
    'src/lib/calculation/intent-executor.ts',
    'src/lib/calculation/intent-validator.ts',
    // Synaptic layer (OB-78)
    'src/lib/calculation/synaptic-types.ts',
    'src/lib/calculation/synaptic-surface.ts',
    'src/lib/calculation/synaptic-density.ts',
    'src/lib/calculation/pattern-signature.ts',
    'src/lib/calculation/anomaly-detector.ts',
  ];

  for (const file of foundationalFiles) {
    const fullPath = path.join(webRoot, file);
    if (!fs.existsSync(fullPath)) {
      console.log(`  SKIP: ${file} (not found)`);
      continue;
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    const matches = content.match(domainWords) || [];
    assert(matches.length === 0, `${file}: ${matches.length} domain words (${matches.join(', ') || 'none'})`);
  }

  // ──────────────────────────────────────────────
  // PG-32: Integration CLT — Full Pipeline
  // ──────────────────────────────────────────────
  console.log('\n=== PG-32: Integration CLT ===');

  // Step 1: Create a complex nested intent
  const complexIntent: ComponentIntent = {
    componentIndex: 0,
    label: 'Integration Test',
    confidence: 1.0,
    dataSource: { sheetClassification: 'test', entityScope: 'entity', requiredMetrics: [] },
    intent: {
      operation: 'scalar_multiply',
      input: { source: 'metric', sourceSpec: { field: 'metric:amount' } },
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
          { min: 1.0, max: 1.0499 },
          { min: 1.05, max: null },
        ],
        outputs: [0.05, 0.08, 0.10],
        noMatchBehavior: 'zero' as const,
      },
    },
    modifiers: [],
    metadata: {},
  };

  // Step 2: Validate the intent
  const validation = validateIntent(complexIntent.intent);
  assert(validation.valid, `Complex nested intent validates: ${validation.errors.join(', ') || 'no errors'}`);

  // Step 3: Generate pattern signature
  const signature = generatePatternSignature(complexIntent);
  assert(
    signature === 'scalar_multiply:metric:rate_op(bounded_lookup_1d:op(ratio:metric+metric):b3):entity',
    `Pattern signature: ${signature}`
  );

  // Step 4: Create synaptic surface with existing density
  const density: SynapticDensity = new Map();
  density.set(signature, {
    signature,
    confidence: 0.80,
    totalExecutions: 50,
    lastAnomalyRate: 0.01,
    lastCorrectionCount: 0,
    executionMode: 'light_trace',
    learnedBehaviors: {},
  });

  const surface = createSynapticSurface(density);
  surface.stats.entityCount = 3;
  surface.stats.componentCount = 1;
  initializePatternDensity(surface, signature, 0);

  // Step 5: Check execution mode
  const mode = getExecutionMode(surface, signature);
  assert(mode === 'light_trace', `Execution mode for existing pattern: ${mode}`);

  // Step 6: Execute intent for multiple entities
  const entities: EntityData[] = [
    { entityId: 'e1', metrics: { amount: 100000, actual: 110000, target: 100000 }, attributes: {} },
    { entityId: 'e2', metrics: { amount: 80000, actual: 75000, target: 100000 }, attributes: {} },
    { entityId: 'e3', metrics: { amount: 200000, actual: 105000, target: 100000 }, attributes: {} },
  ];

  const results: number[] = [];
  for (const entity of entities) {
    const result = executeIntent(complexIntent, entity);
    results.push(result.outcome);

    // Write confidence synapse
    writeSynapse(surface, {
      type: 'confidence',
      componentIndex: 0,
      entityId: entity.entityId,
      value: 1.0,
      timestamp: performance.now(),
    });

    // Run anomaly checks
    checkZeroOutput(
      entity.metrics['amount'],
      result.outcome,
      0,
      entity.entityId,
      surface
    );
  }

  // e1: ratio=1.1, tier 3 (1.05+), rate=0.10, amount=100000 → 10000
  assert(results[0] === 10000, `Entity 1: amount=100000, ratio=1.1 → rate=0.10 → ${results[0]} (expected 10000)`);

  // e2: ratio=0.75, tier 1 (<1.0), rate=0.05, amount=80000 → 4000
  assert(results[1] === 4000, `Entity 2: amount=80000, ratio=0.75 → rate=0.05 → ${results[1]} (expected 4000)`);

  // e3: ratio=1.05, tier 3 (1.05+), rate=0.10, amount=200000 → 20000
  assert(results[2] === 20000, `Entity 3: amount=200000, ratio=1.05 → rate=0.10 → ${results[2]} (expected 20000)`);

  // Step 7: Check anomaly detection ran
  const anomalySynapses = readSynapses(surface, 'anomaly', 'run');
  // e2 has non-zero input but the output is not zero (4000), so no zero-output anomaly
  assert(anomalySynapses.length === 0, `No zero-output anomalies (all outputs non-zero): ${anomalySynapses.length}`);

  // Step 8: Check boundary hit for exact boundary value
  const bCheck = checkBoundaryHit(
    1.05, // exactly on tier 3 min
    [{ min: 0, max: 0.9999 }, { min: 1.0, max: 1.0499 }, { min: 1.05, max: null }],
    0, 'e3', surface
  );
  assert(bCheck.detected, 'Boundary hit detected for ratio=1.05 (exact tier boundary)');

  // Step 9: Check data missing
  const dCheck = checkDataMissing('metric:missing_field', undefined, 0, 'e1', surface);
  assert(dCheck.detected, 'Data missing detected for undefined field');

  // Step 10: Consolidate and verify density updates
  const { densityUpdates, signalBatch } = consolidateSurface(surface);
  assert(densityUpdates.length === 1, `Consolidation produced ${densityUpdates.length} density update`);

  if (densityUpdates.length > 0) {
    const update = densityUpdates[0];
    assert(update.signature === signature, `Update for correct pattern`);
    assert(update.newConfidence > 0.80, `Confidence increased: ${update.newConfidence.toFixed(3)} > 0.80`);
  }

  assert(signalBatch.length > 0, `Signal batch produced: ${signalBatch.length} signals`);

  // Step 11: Verify total synapse count
  const totalSynapses = surface.stats.totalSynapsesWritten;
  // 1 pattern synapse (from initializePatternDensity) + 3 confidence + 1 boundary_behavior + 1 data_quality
  assert(totalSynapses >= 5, `Total synapses written: ${totalSynapses} (≥5 expected)`);

  console.log('\n--- Integration Pipeline Summary ---');
  console.log(`  Intent: 3-level nested (scalar_multiply → bounded_lookup_1d → ratio)`);
  console.log(`  Pattern: ${signature}`);
  console.log(`  Execution mode: ${mode}`);
  console.log(`  Results: [${results.join(', ')}]`);
  console.log(`  Synapses: ${totalSynapses}`);
  console.log(`  Density updates: ${densityUpdates.length}`);
  console.log(`  Anomalies: ${surface.stats.anomalyCount}`);

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
