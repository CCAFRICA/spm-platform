/**
 * OB-79 Mission 3 Tests: Resolution Agent
 *
 * Proof Gates PG-17 through PG-24:
 * PG-17: Root cause — data_quality synapses → data_error classification
 * PG-18: Root cause — correction synapses → data_error with adjustment
 * PG-19: Root cause — boundary anomaly + boundary trace → boundary_edge
 * PG-20: Root cause — anomaly without boundary → logic_error
 * PG-21: Root cause — low confidence → interpretation_ambiguity
 * PG-22: Root cause — no synapses, traces only → no_error_found
 * PG-23: Recommendation generation — each classification maps to correct action
 * PG-24: Resolution pattern detection — 3+ same classification → pattern
 */

import { createSynapticSurface, writeSynapse, readSynapses } from '../src/lib/calculation/synaptic-surface';
import {
  analyzeRootCause,
  generateRecommendation,
  investigate,
  detectResolutionPatterns,
  type DisputeContext,
  type ResolutionInvestigation,
} from '../src/lib/agents/resolution-agent';
import type { ExecutionTrace } from '../src/lib/calculation/intent-types';
import type { Synapse } from '../src/lib/calculation/synaptic-types';

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

function makeContext(overrides: Partial<DisputeContext> = {}): DisputeContext {
  return {
    disputeId: 'dispute-1',
    tenantId: 'test-tenant',
    entityId: 'entity-1',
    entityExternalId: 'E001',
    periodId: 'period-1',
    batchId: 'batch-1',
    category: 'other',
    description: 'Test dispute',
    amountDisputed: 500,
    ...overrides,
  };
}

function makeSynapse(type: Synapse['type'], overrides: Partial<Synapse> = {}): Synapse {
  return {
    type,
    componentIndex: 0,
    value: 0.5,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// PG-17: data_quality → data_error
// ──────────────────────────────────────────────

console.log('\n=== PG-17: Data quality → data_error ===');
{
  const context = makeContext();
  const traces: ExecutionTrace[] = [];
  const synapses = {
    confidence: [] as Synapse[],
    anomaly: [] as Synapse[],
    correction: [] as Synapse[],
    dataQuality: [
      makeSynapse('data_quality', { entityId: 'entity-1', detail: 'missing_field' }),
      makeSynapse('data_quality', { entityId: 'entity-1', detail: 'invalid_value', componentIndex: 1 }),
    ],
  };

  const rootCause = analyzeRootCause(traces, synapses, context);

  assert(rootCause.classification === 'data_error', 'PG-17a: Classification = data_error');
  assert(rootCause.confidence === 0.8, 'PG-17b: Confidence = 0.8');
  assert(rootCause.evidence.length === 2, 'PG-17c: 2 evidence items');
  assert(rootCause.evidence.every(e => e.type === 'synapse'), 'PG-17d: All evidence type = synapse');
  assert(rootCause.affectedComponents.length >= 1, 'PG-17e: At least 1 affected component');
}

// ──────────────────────────────────────────────
// PG-18: Correction synapses → data_error with adjustment
// ──────────────────────────────────────────────

console.log('\n=== PG-18: Corrections → data_error with adjustment ===');
{
  const context = makeContext();
  const synapses = {
    confidence: [] as Synapse[],
    anomaly: [] as Synapse[],
    correction: [
      makeSynapse('correction', { entityId: 'entity-1', detail: 'data_divergence:delta=150.00', value: 0.3 }),
      makeSynapse('correction', { entityId: 'entity-1', detail: 'data_divergence:delta=50.00', value: 0.3, componentIndex: 1 }),
    ],
    dataQuality: [] as Synapse[],
  };

  const rootCause = analyzeRootCause([], synapses, context);

  assert(rootCause.classification === 'data_error', 'PG-18a: Classification = data_error');
  assert(rootCause.confidence === 0.85, 'PG-18b: Confidence = 0.85');
  assert(rootCause.suggestedAdjustment === -200, 'PG-18c: Suggested adjustment = -200 (sum of deltas)');
  assert(rootCause.evidence.length === 2, 'PG-18d: 2 evidence items from corrections');
}

// ──────────────────────────────────────────────
// PG-19: Boundary anomaly + boundary trace → boundary_edge
// ──────────────────────────────────────────────

console.log('\n=== PG-19: Boundary anomaly → boundary_edge ===');
{
  const context = makeContext();
  const traces: ExecutionTrace[] = [{
    entityId: 'entity-1',
    componentIndex: 0,
    inputs: { metric: { source: 'metric', resolvedValue: 100000 } },
    lookupResolution: {
      rowBoundaryMatched: { index: 2, min: 80000, max: 120000, value: 0.05 },
      columnBoundaryMatched: null,
      interpolated: false,
    },
    modifiers: [],
    finalOutcome: 5000,
    confidence: 0.75,
  }];

  const synapses = {
    confidence: [] as Synapse[],
    anomaly: [
      makeSynapse('anomaly', { entityId: 'entity-1', detail: 'boundary_hit: near edge' }),
    ],
    correction: [] as Synapse[],
    dataQuality: [] as Synapse[],
  };

  const rootCause = analyzeRootCause(traces, synapses, context);

  assert(rootCause.classification === 'boundary_edge', 'PG-19a: Classification = boundary_edge');
  assert(rootCause.confidence === 0.75, 'PG-19b: Confidence = 0.75');
  assert(rootCause.evidence.some(e => e.type === 'synapse'), 'PG-19c: Synapse evidence present');
  assert(rootCause.evidence.some(e => e.type === 'trace'), 'PG-19d: Trace evidence present');
}

// ──────────────────────────────────────────────
// PG-20: Anomaly without boundary → logic_error
// ──────────────────────────────────────────────

console.log('\n=== PG-20: Anomaly without boundary → logic_error ===');
{
  const context = makeContext();
  const synapses = {
    confidence: [] as Synapse[],
    anomaly: [
      makeSynapse('anomaly', { entityId: 'entity-1', detail: 'unexpected_result_pattern' }),
    ],
    correction: [] as Synapse[],
    dataQuality: [] as Synapse[],
  };

  const rootCause = analyzeRootCause([], synapses, context);

  assert(rootCause.classification === 'logic_error', 'PG-20a: Classification = logic_error');
  assert(rootCause.confidence === 0.6, 'PG-20b: Confidence = 0.6');
  assert(rootCause.affectedComponents.length >= 1, 'PG-20c: Affected components identified');
}

// ──────────────────────────────────────────────
// PG-21: Low confidence → interpretation_ambiguity
// ──────────────────────────────────────────────

console.log('\n=== PG-21: Low confidence → interpretation_ambiguity ===');
{
  const context = makeContext();
  const synapses = {
    confidence: [
      makeSynapse('confidence', { entityId: 'entity-1', value: 0.5, componentIndex: 0 }),
      makeSynapse('confidence', { entityId: 'entity-1', value: 0.6, componentIndex: 1 }),
    ],
    anomaly: [] as Synapse[],
    correction: [] as Synapse[],
    dataQuality: [] as Synapse[],
  };

  const rootCause = analyzeRootCause([], synapses, context);

  assert(rootCause.classification === 'interpretation_ambiguity', 'PG-21a: Classification = interpretation_ambiguity');
  assert(rootCause.confidence === 0.6, 'PG-21b: Confidence = 0.6');
  assert(rootCause.evidence.length === 2, 'PG-21c: 2 low confidence evidence items');
}

// ──────────────────────────────────────────────
// PG-22: No synapses, traces only → no_error_found
// ──────────────────────────────────────────────

console.log('\n=== PG-22: No synapses → no_error_found ===');
{
  const context = makeContext();
  const traces: ExecutionTrace[] = [{
    entityId: 'entity-1',
    componentIndex: 0,
    inputs: { metric: { source: 'metric', resolvedValue: 50000 } },
    modifiers: [],
    finalOutcome: 2500,
    confidence: 0.95,
  }];

  const emptySynapses = {
    confidence: [] as Synapse[],
    anomaly: [] as Synapse[],
    correction: [] as Synapse[],
    dataQuality: [] as Synapse[],
  };

  const rootCause = analyzeRootCause(traces, emptySynapses, context);
  assert(rootCause.classification === 'no_error_found', 'PG-22a: Classification = no_error_found');
  assert(rootCause.confidence === 0.5, 'PG-22b: Confidence = 0.5 (traces but no synapse evidence)');
  assert(rootCause.evidence.length > 0, 'PG-22c: Trace evidence provided');

  // No traces AND no synapses
  const noData = analyzeRootCause([], emptySynapses, context);
  assert(noData.classification === 'no_error_found', 'PG-22d: No evidence = no_error_found');
  assert(noData.confidence === 0.3, 'PG-22e: Lowest confidence (0.3) when no evidence');
}

// ──────────────────────────────────────────────
// PG-23: Recommendation generation
// ──────────────────────────────────────────────

console.log('\n=== PG-23: Recommendation generation ===');
{
  const context = makeContext();

  // data_error with adjustment → approve_adjustment
  const rec1 = generateRecommendation(
    { classification: 'data_error', confidence: 0.85, evidence: [], affectedComponents: [0], suggestedAdjustment: -200 },
    context
  );
  assert(rec1.action === 'approve_adjustment', 'PG-23a: data_error + adjustment → approve_adjustment');
  assert(rec1.adjustmentAmount === -200, 'PG-23b: Adjustment amount = -200');

  // data_error without adjustment → request_data
  const rec2 = generateRecommendation(
    { classification: 'data_error', confidence: 0.8, evidence: [], affectedComponents: [0], suggestedAdjustment: null },
    context
  );
  assert(rec2.action === 'request_data', 'PG-23c: data_error + no adjustment → request_data');

  // boundary_edge → escalate_to_human
  const rec3 = generateRecommendation(
    { classification: 'boundary_edge', confidence: 0.75, evidence: [], affectedComponents: [0], suggestedAdjustment: null },
    context
  );
  assert(rec3.action === 'escalate_to_human', 'PG-23d: boundary_edge → escalate_to_human');

  // logic_error → escalate_to_human
  const rec4 = generateRecommendation(
    { classification: 'logic_error', confidence: 0.6, evidence: [], affectedComponents: [0], suggestedAdjustment: null },
    context
  );
  assert(rec4.action === 'escalate_to_human', 'PG-23e: logic_error → escalate_to_human');

  // no_error_found → reject_with_evidence
  const rec5 = generateRecommendation(
    { classification: 'no_error_found', confidence: 0.5, evidence: [], affectedComponents: [], suggestedAdjustment: null },
    context
  );
  assert(rec5.action === 'reject_with_evidence', 'PG-23f: no_error_found → reject_with_evidence');

  // All recommendations have reasoning and dataSource
  const allRecs = [rec1, rec2, rec3, rec4, rec5];
  assert(allRecs.every(r => r.reasoning.length > 0), 'PG-23g: All have reasoning');
  assert(allRecs.every(r => r.dataSource.length > 0), 'PG-23h: All have dataSource');
}

// ──────────────────────────────────────────────
// PG-24: Resolution pattern detection
// ──────────────────────────────────────────────

console.log('\n=== PG-24: Resolution pattern detection ===');
{
  const surface = createSynapticSurface();

  // Create 4 investigations with data_error, 2 with logic_error
  const investigations: ResolutionInvestigation[] = [];

  for (let i = 0; i < 4; i++) {
    const ctx = makeContext({ entityId: `entity-${i}`, disputeId: `dispute-${i}` });

    // Write data quality synapses for each entity
    writeSynapse(surface, {
      type: 'data_quality',
      componentIndex: 0,
      entityId: `entity-${i}`,
      value: 0.5,
      detail: 'missing_input',
      timestamp: Date.now(),
    });

    const inv = investigate(ctx, [], surface);
    investigations.push(inv);
  }

  // Add 2 with logic_error (anomaly synapses, no boundary)
  for (let i = 4; i < 6; i++) {
    const ctx = makeContext({ entityId: `entity-${i}`, disputeId: `dispute-${i}` });

    writeSynapse(surface, {
      type: 'anomaly',
      componentIndex: 0,
      entityId: `entity-${i}`,
      value: 0.5,
      detail: 'unexpected_pattern',
      timestamp: Date.now(),
    });

    const inv = investigate(ctx, [], surface);
    investigations.push(inv);
  }

  const patterns = detectResolutionPatterns(investigations);

  assert(patterns.length >= 1, 'PG-24a: At least 1 pattern detected');

  const dataErrorPattern = patterns.find(p => p.classification === 'data_error');
  assert(dataErrorPattern !== undefined, 'PG-24b: data_error pattern found');
  assert(dataErrorPattern!.occurrences >= 3, 'PG-24c: data_error pattern has 3+ occurrences');
  assert(dataErrorPattern!.affectedEntities.length >= 3, 'PG-24d: Pattern lists affected entities');
  assert(dataErrorPattern!.recommendation.length > 0, 'PG-24e: Pattern has recommendation');

  // Logic error has only 2 occurrences → no pattern
  const logicPattern = patterns.find(p => p.classification === 'logic_error');
  assert(logicPattern === undefined, 'PG-24f: logic_error (2 occurrences) does NOT form pattern');
}

// ──────────────────────────────────────────────
// Bonus: investigate() writes resolution synapse
// ──────────────────────────────────────────────

console.log('\n=== Bonus: investigate() integration ===');
{
  const surface = createSynapticSurface();
  const context = makeContext({ entityId: 'bonus-entity' });

  // Write a data quality synapse so rootCause != no_error_found
  writeSynapse(surface, {
    type: 'data_quality',
    componentIndex: 0,
    entityId: 'bonus-entity',
    value: 0.5,
    detail: 'test_issue',
    timestamp: Date.now(),
  });

  const traces: ExecutionTrace[] = [{
    entityId: 'bonus-entity',
    componentIndex: 0,
    inputs: { metric: { source: 'metric', resolvedValue: 100 } },
    modifiers: [],
    finalOutcome: 50,
    confidence: 0.7,
  }];

  const inv = investigate(context, traces, surface);

  assert(inv.disputeId === 'dispute-1', 'Bonus-a: disputeId preserved');
  assert(inv.entityId === 'bonus-entity', 'Bonus-b: entityId preserved');
  assert(inv.rootCause.classification !== 'no_error_found', 'Bonus-c: Root cause found');
  assert(inv.resolutionSynapseWritten === true, 'Bonus-d: Resolution synapse written');

  // Check resolution_hint synapse on surface
  const resHints = readSynapses(surface, 'resolution_hint', 'entity', 'bonus-entity');
  assert(resHints.length > 0, 'Bonus-e: resolution_hint synapse readable');
  assert(resHints[0].detail?.includes('data_error'), 'Bonus-f: Detail includes classification');
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`OB-79 Mission 3 (Resolution Agent): ${passed}/${passed + failed} tests passed`);
console.log('='.repeat(50));

if (failed > 0) process.exit(1);
