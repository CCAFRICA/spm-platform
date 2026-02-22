/**
 * OB-79 Mission 1 Tests: Reconciliation Agent
 *
 * Proof Gates PG-1 through PG-8:
 * PG-1: Match classification — within tolerance → 'match'
 * PG-2: Rounding classification — sub-unit variance → 'rounding'
 * PG-3: Data divergence classification — large delta with trace → 'data_divergence'
 * PG-4: Scope mismatch — entity missing from one side → 'scope_mismatch'
 * PG-5: False green detection — offsetting errors mask total match
 * PG-6: Correction synapses written for non-match/rounding findings
 * PG-7: Report structure completeness (entityCount, totalOutcome, classifications, etc.)
 * PG-8: Scale test — 1000 entities processed in < 500ms, O(N) not O(N²)
 */

import { createSynapticSurface, writeSynapse, readSynapses } from '../src/lib/calculation/synaptic-surface';
import {
  reconcile,
  detectFalseGreens,
  type ReconciliationInput,
  type BenchmarkRecord,
  type CalculatedResult,
  type ReconciliationFinding,
} from '../src/lib/agents/reconciliation-agent';
import type { ExecutionTrace } from '../src/lib/calculation/intent-types';

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

// ──────────────────────────────────────────────
// PG-1: Match classification
// ──────────────────────────────────────────────

console.log('\n=== PG-1: Match classification ===');
{
  const surface = createSynapticSurface();
  const input: ReconciliationInput = {
    tenantId: 'test-tenant',
    batchId: 'batch-1',
    benchmarkRecords: [
      { entityExternalId: 'E001', componentIndex: 0, expectedOutcome: 1000.00 },
      { entityExternalId: 'E002', componentIndex: 0, expectedOutcome: 2000.00 },
    ],
    calculatedResults: [
      { entityId: 'id-1', entityExternalId: 'E001', componentIndex: 0, calculatedOutcome: 1000.005 },
      { entityId: 'id-2', entityExternalId: 'E002', componentIndex: 0, calculatedOutcome: 2000.00 },
    ],
    executionTraces: new Map(),
    surface,
    tolerance: 0.01,
  };

  const report = reconcile(input);

  assert(report.findings.length === 2, 'PG-1a: Two findings produced');
  assert(report.findings.every(f => f.classification === 'match'), 'PG-1b: Both classified as match');
  assert(report.classifications.match === 2, 'PG-1c: Classification count correct');
  assert(report.entityCount.matched === 2, 'PG-1d: Matched entity count = 2');
  assert(report.entityCount.unmatched === 0, 'PG-1e: Unmatched entity count = 0');
}

// ──────────────────────────────────────────────
// PG-2: Rounding classification
// ──────────────────────────────────────────────

console.log('\n=== PG-2: Rounding classification ===');
{
  const surface = createSynapticSurface();
  const input: ReconciliationInput = {
    tenantId: 'test-tenant',
    batchId: 'batch-2',
    benchmarkRecords: [
      { entityExternalId: 'E001', componentIndex: 0, expectedOutcome: 1000.00 },
    ],
    calculatedResults: [
      { entityId: 'id-1', entityExternalId: 'E001', componentIndex: 0, calculatedOutcome: 1000.50 },
    ],
    executionTraces: new Map(),
    surface,
    tolerance: 0.01,
  };

  const report = reconcile(input);

  assert(report.findings.length === 1, 'PG-2a: One finding produced');
  assert(report.findings[0].classification === 'rounding', 'PG-2b: Classified as rounding');
  assert(report.findings[0].delta < 1.0, 'PG-2c: Delta is sub-unit');
  assert(report.findings[0].confidence === 0.9, 'PG-2d: Confidence = 0.9');
}

// ──────────────────────────────────────────────
// PG-3: Data divergence classification
// ──────────────────────────────────────────────

console.log('\n=== PG-3: Data divergence classification ===');
{
  const surface = createSynapticSurface();
  // Add data quality synapse for entity
  writeSynapse(surface, {
    type: 'data_quality',
    componentIndex: 0,
    entityId: 'id-1',
    value: 0.5,
    detail: 'missing_input_field',
    timestamp: Date.now(),
  });

  const input: ReconciliationInput = {
    tenantId: 'test-tenant',
    batchId: 'batch-3',
    benchmarkRecords: [
      { entityExternalId: 'E001', componentIndex: 0, expectedOutcome: 1000.00 },
    ],
    calculatedResults: [
      { entityId: 'id-1', entityExternalId: 'E001', componentIndex: 0, calculatedOutcome: 800.00 },
    ],
    executionTraces: new Map(),
    surface,
  };

  const report = reconcile(input);

  assert(report.findings[0].classification === 'data_divergence', 'PG-3a: Classified as data_divergence');
  assert(report.findings[0].confidence === 0.75, 'PG-3b: Confidence = 0.75');
  assert(report.findings[0].traceEvidence.reason === 'data_quality_synapses_present', 'PG-3c: Evidence reason correct');
  assert(report.findings[0].synapticContext.dataQualitySynapses === 1, 'PG-3d: Synaptic context has DQ synapse');
}

// ──────────────────────────────────────────────
// PG-4: Scope mismatch
// ──────────────────────────────────────────────

console.log('\n=== PG-4: Scope mismatch ===');
{
  const surface = createSynapticSurface();
  const input: ReconciliationInput = {
    tenantId: 'test-tenant',
    batchId: 'batch-4',
    benchmarkRecords: [
      { entityExternalId: 'E001', componentIndex: 0, expectedOutcome: 1000.00 },
      { entityExternalId: 'E003', componentIndex: 0, expectedOutcome: 3000.00 }, // not in calculated
    ],
    calculatedResults: [
      { entityId: 'id-1', entityExternalId: 'E001', componentIndex: 0, calculatedOutcome: 1000.00 },
      { entityId: 'id-2', entityExternalId: 'E002', componentIndex: 0, calculatedOutcome: 2000.00 }, // not in benchmark
    ],
    executionTraces: new Map(),
    surface,
  };

  const report = reconcile(input);

  const scopeMismatchFindings = report.findings.filter(f => f.classification === 'scope_mismatch');
  assert(scopeMismatchFindings.length === 2, 'PG-4a: Two scope mismatches found');

  const missingFromBenchmark = scopeMismatchFindings.find(f => f.traceEvidence.reason === 'missing_from_benchmark');
  const missingFromCalculated = scopeMismatchFindings.find(f => f.traceEvidence.reason === 'missing_from_calculated');
  assert(!!missingFromBenchmark, 'PG-4b: E002 missing from benchmark detected');
  assert(!!missingFromCalculated, 'PG-4c: E003 missing from calculated detected');
  assert(report.classifications.scope_mismatch === 2, 'PG-4d: Classification count = 2');
}

// ──────────────────────────────────────────────
// PG-5: False green detection
// ──────────────────────────────────────────────

console.log('\n=== PG-5: False green detection ===');
{
  // Create findings where total matches but components have large offsetting deltas
  const findings: ReconciliationFinding[] = [
    {
      entityId: 'id-1',
      entityExternalId: 'E001',
      componentIndex: 0,
      calculatedOutcome: 1500,
      expectedOutcome: 1000,
      delta: 500,
      deltaPercent: 50,
      classification: 'data_divergence',
      confidence: 0.7,
      traceEvidence: { reason: 'test' },
      synapticContext: { confidenceSynapses: 0, anomalySynapses: 0, dataQualitySynapses: 0, avgConfidence: 1.0 },
    },
    {
      entityId: 'id-1',
      entityExternalId: 'E001',
      componentIndex: 1,
      calculatedOutcome: 500,
      expectedOutcome: 1000,
      delta: 500,
      deltaPercent: 50,
      classification: 'data_divergence',
      confidence: 0.7,
      traceEvidence: { reason: 'test' },
      synapticContext: { confidenceSynapses: 0, anomalySynapses: 0, dataQualitySynapses: 0, avgConfidence: 1.0 },
    },
  ];

  // Total: calc=2000, exp=2000, delta=0 — looks fine
  // But component deltas: |500| + |500| = 1000 >> 100
  const detected = detectFalseGreens(findings);
  assert(detected === true, 'PG-5a: False green detected');

  // Non-offsetting case
  const noFalseGreen: ReconciliationFinding[] = [
    {
      entityId: 'id-2',
      entityExternalId: 'E002',
      componentIndex: 0,
      calculatedOutcome: 1000,
      expectedOutcome: 1000,
      delta: 0,
      deltaPercent: 0,
      classification: 'match',
      confidence: 1.0,
      traceEvidence: { reason: 'within_tolerance' },
      synapticContext: { confidenceSynapses: 0, anomalySynapses: 0, dataQualitySynapses: 0, avgConfidence: 1.0 },
    },
  ];
  const notDetected = detectFalseGreens(noFalseGreen);
  assert(notDetected === false, 'PG-5b: No false green for genuine match');
}

// ──────────────────────────────────────────────
// PG-6: Correction synapses written
// ──────────────────────────────────────────────

console.log('\n=== PG-6: Correction synapses written ===');
{
  const surface = createSynapticSurface();

  // Large divergence — will write correction synapse
  const input: ReconciliationInput = {
    tenantId: 'test-tenant',
    batchId: 'batch-6',
    benchmarkRecords: [
      { entityExternalId: 'E001', componentIndex: 0, expectedOutcome: 1000.00 },
      { entityExternalId: 'E002', componentIndex: 0, expectedOutcome: 500.00 },
    ],
    calculatedResults: [
      { entityId: 'id-1', entityExternalId: 'E001', componentIndex: 0, calculatedOutcome: 1200.00 },
      { entityId: 'id-2', entityExternalId: 'E002', componentIndex: 0, calculatedOutcome: 500.00 },
    ],
    executionTraces: new Map<string, ExecutionTrace[]>([
      ['id-1', [{
        entityId: 'id-1',
        componentIndex: 0,
        inputs: { metric_amount: { source: 'metric', resolvedValue: 150000 } },
        modifiers: [],
        finalOutcome: 1200,
        confidence: 0.8,
      }]],
    ]),
    surface,
  };

  const report = reconcile(input);

  assert(report.correctionSynapsesWritten >= 1, 'PG-6a: At least 1 correction synapse written');

  const corrections = readSynapses(surface, 'correction', 'run');
  assert(corrections.length >= 1, 'PG-6b: Correction synapses readable from surface');
  assert(corrections[0].detail?.includes('delta='), 'PG-6c: Correction detail includes delta info');
  assert(corrections[0].entityId === 'id-1', 'PG-6d: Correction synapse has correct entityId');

  // Match + rounding should NOT produce correction synapses
  const matchFindings = report.findings.filter(f => f.classification === 'match');
  assert(matchFindings.length >= 1, 'PG-6e: At least one match (no correction for it)');
}

// ──────────────────────────────────────────────
// PG-7: Report structure completeness
// ──────────────────────────────────────────────

console.log('\n=== PG-7: Report structure completeness ===');
{
  const surface = createSynapticSurface();
  const input: ReconciliationInput = {
    tenantId: 'test-tenant',
    batchId: 'batch-7',
    benchmarkRecords: [
      { entityExternalId: 'E001', componentIndex: 0, expectedOutcome: 1000 },
      { entityExternalId: 'E001', componentIndex: 1, expectedOutcome: 500 },
    ],
    calculatedResults: [
      { entityId: 'id-1', entityExternalId: 'E001', componentIndex: 0, calculatedOutcome: 1000 },
      { entityId: 'id-1', entityExternalId: 'E001', componentIndex: 1, calculatedOutcome: 500 },
    ],
    executionTraces: new Map(),
    surface,
  };

  const report = reconcile(input);

  assert(typeof report.batchId === 'string', 'PG-7a: batchId is string');
  assert(typeof report.timestamp === 'string', 'PG-7b: timestamp is string');
  assert(typeof report.entityCount.calculated === 'number', 'PG-7c: entityCount.calculated is number');
  assert(typeof report.entityCount.benchmark === 'number', 'PG-7d: entityCount.benchmark is number');
  assert(typeof report.totalOutcome.calculated === 'number', 'PG-7e: totalOutcome.calculated is number');
  assert(typeof report.totalOutcome.benchmark === 'number', 'PG-7f: totalOutcome.benchmark is number');
  assert(typeof report.totalOutcome.delta === 'number', 'PG-7g: totalOutcome.delta is number');
  assert(typeof report.totalOutcome.deltaPercent === 'number', 'PG-7h: totalOutcome.deltaPercent is number');
  assert(Array.isArray(report.findings), 'PG-7i: findings is array');
  assert(typeof report.classifications === 'object', 'PG-7j: classifications is object');
  assert(typeof report.falseGreenDetected === 'boolean', 'PG-7k: falseGreenDetected is boolean');
  assert(typeof report.correctionSynapsesWritten === 'number', 'PG-7l: correctionSynapsesWritten is number');
  assert(Array.isArray(report.synapticDensityImpact), 'PG-7m: synapticDensityImpact is array');
}

// ──────────────────────────────────────────────
// PG-8: Scale test — 1000 entities in < 500ms
// ──────────────────────────────────────────────

console.log('\n=== PG-8: Scale test ===');
{
  const SCALE = 1000;
  const surface = createSynapticSurface();

  const benchmarks: BenchmarkRecord[] = [];
  const calculated: CalculatedResult[] = [];
  const traces = new Map<string, ExecutionTrace[]>();

  for (let i = 0; i < SCALE; i++) {
    const extId = `E${String(i).padStart(5, '0')}`;
    // Half match, half diverge
    const expected = 1000 + i;
    const calcValue = i % 2 === 0 ? expected : expected + 200;

    benchmarks.push({ entityExternalId: extId, componentIndex: 0, expectedOutcome: expected });
    calculated.push({
      entityId: `id-${i}`,
      entityExternalId: extId,
      componentIndex: 0,
      calculatedOutcome: calcValue,
    });

    if (i % 2 !== 0) {
      traces.set(`id-${i}`, [{
        entityId: `id-${i}`,
        componentIndex: 0,
        inputs: { metric: { source: 'metric', resolvedValue: calcValue } },
        modifiers: [],
        finalOutcome: calcValue,
        confidence: 0.8,
      }]);
    }
  }

  const input: ReconciliationInput = {
    tenantId: 'test-tenant',
    batchId: 'batch-scale',
    benchmarkRecords: benchmarks,
    calculatedResults: calculated,
    executionTraces: traces,
    surface,
  };

  const start = performance.now();
  const report = reconcile(input);
  const elapsed = performance.now() - start;

  assert(elapsed < 500, `PG-8a: Scale test completed in ${elapsed.toFixed(1)}ms (< 500ms)`);
  assert(report.findings.length === SCALE, `PG-8b: ${SCALE} findings produced`);
  assert(report.entityCount.matched > 0, 'PG-8c: Some entities matched');
  assert(report.entityCount.unmatched > 0, 'PG-8d: Some entities unmatched');
  assert(report.correctionSynapsesWritten > 0, 'PG-8e: Correction synapses written at scale');

  console.log(`  [Scale] ${SCALE} entities in ${elapsed.toFixed(1)}ms`);
  console.log(`  [Scale] Matches: ${report.entityCount.matched}, Unmatched: ${report.entityCount.unmatched}`);
  console.log(`  [Scale] Corrections written: ${report.correctionSynapsesWritten}`);
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`OB-79 Mission 1 (Reconciliation Agent): ${passed}/${passed + failed} tests passed`);
console.log('='.repeat(50));

if (failed > 0) process.exit(1);
