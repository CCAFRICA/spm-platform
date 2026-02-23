/**
 * OB-78 Mission 2 Tests: Synaptic State Foundation
 *
 * Tests:
 * PG-9:  Surface creation and initial stats
 * PG-10: Write synapse to all three scopes
 * PG-11: Read synapses by type and scope
 * PG-12: Pattern signature generation (flat intents)
 * PG-13: Pattern signature generation (nested/composed intents)
 * PG-14: Execution mode from density thresholds
 * PG-15: Consolidation produces density updates
 * PG-16: Anomaly detector — boundary hit
 * PG-17: Anomaly detector — zero output, data missing, range exceeded
 * PG-18: Korean Test on all synaptic files
 */

import {
  createSynapticSurface,
  writeSynapse,
  readSynapses,
  getExecutionMode,
  consolidateSurface,
  initializePatternDensity,
} from '../src/lib/calculation/synaptic-surface';
import type { Synapse, PatternDensity, SynapticDensity } from '../src/lib/calculation/synaptic-types';
import { DENSITY_THRESHOLDS } from '../src/lib/calculation/synaptic-types';
import { generatePatternSignature } from '../src/lib/calculation/pattern-signature';
import type { ComponentIntent } from '../src/lib/calculation/intent-types';
import {
  checkBoundaryHit,
  checkZeroOutput,
  checkDataMissing,
  checkRangeExceeded,
  checkEntityResult,
} from '../src/lib/calculation/anomaly-detector';
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
  // PG-9: Surface creation and initial stats
  // ──────────────────────────────────────────────
  console.log('=== PG-9: Surface creation ===');

  const surface1 = createSynapticSurface();
  assert(surface1.runSynapses.size === 0, 'Empty run synapses');
  assert(surface1.componentSynapses.size === 0, 'Empty component synapses');
  assert(surface1.entitySynapses.size === 0, 'Empty entity synapses');
  assert(surface1.density.size === 0, 'Empty density without pre-load');
  assert(surface1.stats.totalSynapsesWritten === 0, 'Zero synapses written');
  assert(surface1.stats.anomalyCount === 0, 'Zero anomalies');
  assert(surface1.stats.startTime > 0, 'Start time is set');

  // With pre-loaded density
  const preloadedDensity: SynapticDensity = new Map();
  preloadedDensity.set('test_pattern', {
    signature: 'test_pattern',
    confidence: 0.85,
    totalExecutions: 100,
    lastAnomalyRate: 0.02,
    lastCorrectionCount: 1,
    executionMode: 'light_trace',
    learnedBehaviors: {},
  });
  const surface2 = createSynapticSurface(preloadedDensity);
  assert(surface2.density.size === 1, 'Pre-loaded density has 1 entry');
  assert(surface2.density.get('test_pattern')!.confidence === 0.85, 'Pre-loaded confidence = 0.85');

  // ──────────────────────────────────────────────
  // PG-10: Write synapse to all three scopes
  // ──────────────────────────────────────────────
  console.log('\n=== PG-10: Write synapses ===');

  const surface3 = createSynapticSurface();
  const synapse1: Synapse = {
    type: 'confidence',
    componentIndex: 0,
    entityId: 'entity-001',
    value: 0.95,
    detail: 'test confidence',
    timestamp: Date.now(),
  };

  writeSynapse(surface3, synapse1);
  assert(surface3.stats.totalSynapsesWritten === 1, 'Total written = 1');
  assert(surface3.runSynapses.has('confidence'), 'Run scope has confidence type');
  assert(surface3.componentSynapses.has(0), 'Component scope has index 0');
  assert(surface3.entitySynapses.has('entity-001'), 'Entity scope has entity-001');

  // Write an anomaly synapse
  const synapse2: Synapse = {
    type: 'anomaly',
    componentIndex: 0,
    entityId: 'entity-001',
    value: 0.3,
    detail: 'test anomaly',
    timestamp: Date.now(),
  };
  writeSynapse(surface3, synapse2);
  assert(surface3.stats.anomalyCount === 1, 'Anomaly count = 1');
  assert(surface3.stats.totalSynapsesWritten === 2, 'Total written = 2');

  // Write a correction synapse
  const synapse3: Synapse = {
    type: 'correction',
    componentIndex: 1,
    value: 0.1,
    detail: 'test correction',
    timestamp: Date.now(),
  };
  writeSynapse(surface3, synapse3);
  assert(surface3.stats.correctionCount === 1, 'Correction count = 1');
  assert(!surface3.entitySynapses.has(undefined as unknown as string), 'No entity scope for synapse without entityId');

  // ──────────────────────────────────────────────
  // PG-11: Read synapses by type and scope
  // ──────────────────────────────────────────────
  console.log('\n=== PG-11: Read synapses ===');

  // Run scope
  const runConf = readSynapses(surface3, 'confidence', 'run');
  assert(runConf.length === 1, 'Run scope: 1 confidence synapse');
  assert(runConf[0].value === 0.95, 'Confidence value = 0.95');

  const runAnom = readSynapses(surface3, 'anomaly', 'run');
  assert(runAnom.length === 1, 'Run scope: 1 anomaly synapse');

  // Component scope
  const comp0Conf = readSynapses(surface3, 'confidence', 'component', 0);
  assert(comp0Conf.length === 1, 'Component 0: 1 confidence synapse');

  const comp1Corr = readSynapses(surface3, 'correction', 'component', 1);
  assert(comp1Corr.length === 1, 'Component 1: 1 correction synapse');

  // Entity scope
  const entity001 = readSynapses(surface3, 'confidence', 'entity', 'entity-001');
  assert(entity001.length === 1, 'Entity entity-001: 1 confidence synapse');

  // Missing scope returns empty
  const missing = readSynapses(surface3, 'performance', 'run');
  assert(missing.length === 0, 'No performance synapses = empty array');

  const missingEntity = readSynapses(surface3, 'confidence', 'entity', 'nonexistent');
  assert(missingEntity.length === 0, 'Nonexistent entity = empty array');

  // ──────────────────────────────────────────────
  // PG-12: Pattern signature — flat intents
  // ──────────────────────────────────────────────
  console.log('\n=== PG-12: Pattern signatures (flat) ===');

  const sig1 = generatePatternSignature(makeIntent(0, 'Test', {
    operation: 'scalar_multiply',
    input: { source: 'metric', sourceSpec: { field: 'metric:amount' } },
    rate: 0.10,
  }));
  assert(sig1 === 'scalar_multiply:metric:rate_num:entity', `Flat scalar_multiply sig = "${sig1}"`);

  const sig2 = generatePatternSignature(makeIntent(1, 'Test', {
    operation: 'bounded_lookup_1d',
    input: { source: 'metric', sourceSpec: { field: 'metric:value' } },
    boundaries: [{ min: 0, max: 100 }, { min: 100, max: null }],
    outputs: [10, 20],
    noMatchBehavior: 'zero',
  }));
  assert(sig2 === 'bounded_lookup_1d:metric:b2:entity', `Flat bounded_lookup_1d sig = "${sig2}"`);

  const sig3 = generatePatternSignature(makeIntent(2, 'Test', {
    operation: 'bounded_lookup_2d',
    inputs: {
      row: { source: 'ratio', sourceSpec: { numerator: 'a', denominator: 'b' } },
      column: { source: 'metric', sourceSpec: { field: 'c' } },
    },
    rowBoundaries: [{ min: 0, max: 1 }, { min: 1, max: null }],
    columnBoundaries: [{ min: 0, max: 100 }, { min: 100, max: null }],
    outputGrid: [[0, 100], [500, 1000]],
    noMatchBehavior: 'zero',
  }));
  assert(sig3 === 'bounded_lookup_2d:ratio+metric:g2x2:entity', `Flat 2D sig = "${sig3}"`);

  const sig4 = generatePatternSignature(makeIntent(3, 'Test', {
    operation: 'constant',
    value: 500,
  }));
  assert(sig4 === 'constant:entity', `Constant sig = "${sig4}"`);

  // ──────────────────────────────────────────────
  // PG-13: Pattern signature — nested/composed
  // ──────────────────────────────────────────────
  console.log('\n=== PG-13: Pattern signatures (nested) ===');

  const sig5 = generatePatternSignature(makeIntent(0, 'Test', {
    operation: 'scalar_multiply',
    input: { source: 'metric', sourceSpec: { field: 'metric:amount' } },
    rate: {
      operation: 'bounded_lookup_1d',
      input: { source: 'metric', sourceSpec: { field: 'metric:amount' } },
      boundaries: [{ min: 0, max: 100 }],
      outputs: [0.05],
      noMatchBehavior: 'zero',
    },
  }));
  assert(
    sig5 === 'scalar_multiply:metric:rate_op(bounded_lookup_1d:metric:b1):entity',
    `Nested scalar_multiply sig = "${sig5}"`
  );

  const sig6 = generatePatternSignature(makeIntent(1, 'Test', {
    operation: 'bounded_lookup_1d',
    input: {
      operation: 'ratio',
      numerator: { source: 'metric', sourceSpec: { field: 'a' } },
      denominator: { source: 'metric', sourceSpec: { field: 'b' } },
      zeroDenominatorBehavior: 'zero',
    },
    boundaries: [{ min: 0, max: 1 }, { min: 1, max: null }],
    outputs: [0, 1000],
    noMatchBehavior: 'zero',
  }));
  assert(
    sig6 === 'bounded_lookup_1d:op(ratio:metric+metric):b2:entity',
    `Nested lookup with ratio input sig = "${sig6}"`
  );

  // Three-level deep
  const sig7 = generatePatternSignature(makeIntent(2, 'Test', {
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
      boundaries: [{ min: 0, max: 1 }],
      outputs: [0.05],
      noMatchBehavior: 'zero',
    },
  }));
  assert(
    sig7 === 'scalar_multiply:metric:rate_op(bounded_lookup_1d:op(ratio:metric+metric):b1):entity',
    `Three-level deep sig = "${sig7}"`
  );

  // ──────────────────────────────────────────────
  // PG-14: Execution mode from density thresholds
  // ──────────────────────────────────────────────
  console.log('\n=== PG-14: Execution mode ===');

  const densityMap: SynapticDensity = new Map();
  densityMap.set('low_conf', {
    signature: 'low_conf',
    confidence: 0.50,
    totalExecutions: 10,
    lastAnomalyRate: 0.1,
    lastCorrectionCount: 0,
    executionMode: 'full_trace',
    learnedBehaviors: {},
  });
  densityMap.set('med_conf', {
    signature: 'med_conf',
    confidence: 0.80,
    totalExecutions: 50,
    lastAnomalyRate: 0.02,
    lastCorrectionCount: 0,
    executionMode: 'light_trace',
    learnedBehaviors: {},
  });
  densityMap.set('high_conf', {
    signature: 'high_conf',
    confidence: 0.97,
    totalExecutions: 200,
    lastAnomalyRate: 0.001,
    lastCorrectionCount: 0,
    executionMode: 'silent',
    learnedBehaviors: {},
  });

  const surfaceWithDensity = createSynapticSurface(densityMap);
  assert(getExecutionMode(surfaceWithDensity, 'low_conf') === 'full_trace', 'Confidence 0.50 → full_trace');
  assert(getExecutionMode(surfaceWithDensity, 'med_conf') === 'light_trace', 'Confidence 0.80 → light_trace');
  assert(getExecutionMode(surfaceWithDensity, 'high_conf') === 'silent', 'Confidence 0.97 → silent');
  assert(getExecutionMode(surfaceWithDensity, 'unknown_pattern') === 'full_trace', 'Unknown pattern → full_trace');

  // Boundary values
  assert(DENSITY_THRESHOLDS.FULL_TRACE_MAX === 0.70, 'FULL_TRACE_MAX = 0.70');
  assert(DENSITY_THRESHOLDS.SILENT_MIN === 0.95, 'SILENT_MIN = 0.95');

  // ──────────────────────────────────────────────
  // PG-15: Consolidation produces density updates
  // ──────────────────────────────────────────────
  console.log('\n=== PG-15: Consolidation ===');

  const consolSurface = createSynapticSurface(densityMap);
  consolSurface.stats.entityCount = 100;

  // Initialize a pattern
  initializePatternDensity(consolSurface, 'low_conf', 0);

  // Write some confidence synapses
  for (let i = 0; i < 10; i++) {
    writeSynapse(consolSurface, {
      type: 'confidence',
      componentIndex: 0,
      entityId: `entity-${i}`,
      value: 0.90,
      timestamp: Date.now(),
    });
  }

  // Write an anomaly
  writeSynapse(consolSurface, {
    type: 'anomaly',
    componentIndex: 0,
    entityId: 'entity-5',
    value: 0.3,
    detail: 'test anomaly',
    timestamp: Date.now(),
  });

  const { densityUpdates, signalBatch } = consolidateSurface(consolSurface);
  assert(densityUpdates.length === 1, `Density updates = ${densityUpdates.length} (expected 1)`);
  assert(signalBatch.length === 1, `Signal batch = ${signalBatch.length} (expected 1)`);

  if (densityUpdates.length > 0) {
    const update = densityUpdates[0];
    assert(update.signature === 'low_conf', 'Update for low_conf pattern');
    assert(update.newConfidence > 0.50, `New confidence ${update.newConfidence} > 0.50 (was 0.50)`);
    assert(update.newConfidence < 1.0, `New confidence ${update.newConfidence} < 1.0`);
    assert(update.totalExecutions === 110, `Total executions = ${update.totalExecutions} (10 existing + 100 entities)`);
    assert(update.anomalyRate === 0.01, `Anomaly rate = ${update.anomalyRate} (1/100)`);
  }

  if (signalBatch.length > 0) {
    assert(signalBatch[0].signalType === 'training:synaptic_density', 'Signal type is training:synaptic_density');
  }

  // ──────────────────────────────────────────────
  // PG-16: Anomaly detector — boundary hit
  // ──────────────────────────────────────────────
  console.log('\n=== PG-16: Anomaly detector — boundary hit ===');

  const anomSurface = createSynapticSurface();

  const boundaries = [
    { min: 0, max: 99999 },
    { min: 100000, max: 249999 },
    { min: 250000, max: null as number | null },
  ];

  // Value on boundary edge
  const bHit1 = checkBoundaryHit(100000, boundaries, 0, 'e1', anomSurface);
  assert(bHit1.detected, 'Boundary hit detected for value=100000');
  assert(bHit1.type === 'boundary_hit', 'Type is boundary_hit');

  // Value NOT on boundary
  const bHit2 = checkBoundaryHit(150000, boundaries, 0, 'e2', anomSurface);
  assert(!bHit2.detected, 'No boundary hit for value=150000');

  // Boundary synapse written
  const bSynapses = readSynapses(anomSurface, 'boundary_behavior', 'entity', 'e1');
  assert(bSynapses.length === 1, 'Boundary synapse written to entity e1');

  // ──────────────────────────────────────────────
  // PG-17: Anomaly detector — zero output, data missing, range exceeded
  // ──────────────────────────────────────────────
  console.log('\n=== PG-17: Anomaly detector — other checks ===');

  // Zero output
  const zCheck1 = checkZeroOutput(50000, 0, 0, 'e3', anomSurface);
  assert(zCheck1.detected, 'Zero output detected (input=50000, output=0)');

  const zCheck2 = checkZeroOutput(0, 0, 0, 'e4', anomSurface);
  assert(!zCheck2.detected, 'No zero output anomaly when input is also 0');

  // Data missing
  const dCheck1 = checkDataMissing('metric:amount', undefined, 0, 'e5', anomSurface);
  assert(dCheck1.detected, 'Data missing detected for undefined');

  const dCheck2 = checkDataMissing('metric:amount', null, 0, 'e6', anomSurface);
  assert(dCheck2.detected, 'Data missing detected for null');

  const dCheck3 = checkDataMissing('metric:amount', NaN, 0, 'e7', anomSurface);
  assert(dCheck3.detected, 'Data missing detected for NaN');

  const dCheck4 = checkDataMissing('metric:amount', 50000, 0, 'e8');
  assert(!dCheck4.detected, 'No data missing for valid value');

  // Range exceeded
  const rCheck1 = checkRangeExceeded(6.0, 0, 5.0, 0, 'e9', anomSurface);
  assert(rCheck1.detected, 'Range exceeded for 6.0 outside [0, 5.0]');

  const rCheck2 = checkRangeExceeded(3.0, 0, 5.0, 0, 'e10', anomSurface);
  assert(!rCheck2.detected, 'No range exceeded for 3.0 within [0, 5.0]');

  // Batch entity check
  const entityCheck = checkEntityResult(
    'e11', 0, 100000, 0,
    [{ min: 0, max: 99999 }, { min: 100000, max: null }],
    anomSurface
  );
  assert(entityCheck.totalAnomalies === 2, `Entity check found ${entityCheck.totalAnomalies} anomalies (boundary + zero output)`);

  // ──────────────────────────────────────────────
  // PG-18: Korean Test on all synaptic files
  // ──────────────────────────────────────────────
  console.log('\n=== PG-18: Korean Test ===');

  const webRoot = path.resolve(__dirname, '..');
  const domainWords = /commission|compensation|attainment|payout|incentive|sales|quota|royalt/gi;

  const synapticFiles = [
    'synaptic-types.ts',
    'synaptic-surface.ts',
    'pattern-signature.ts',
    'anomaly-detector.ts',
    'synaptic-density.ts',
  ];

  for (const file of synapticFiles) {
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
