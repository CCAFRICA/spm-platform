/**
 * OB-79 Mission 2 Tests: Insight Agent
 *
 * Proof Gates PG-9 through PG-16:
 * PG-9: Inline insights — anomaly rate exceeding threshold fires insight
 * PG-10: Inline insights — confidence drop fires insight
 * PG-11: Full analysis — zero outcome cluster detected
 * PG-12: Full analysis — high anomaly rate generates alert
 * PG-13: Full analysis — concentration risk detected
 * PG-14: Full analysis — concordance gap detection
 * PG-15: Persona routing — admin sees governance, manager sees coaching, rep sees growth
 * PG-16: AP-18 — no insights without dataSource
 */

import { createSynapticSurface, writeSynapse, readSynapses } from '../src/lib/calculation/synaptic-surface';
import {
  checkInlineInsights,
  generateFullAnalysis,
  routeToPersona,
  DEFAULT_INSIGHT_CONFIG,
  type InsightConfig,
  type CalculationSummary,
} from '../src/lib/agents/insight-agent';

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

function makeSummary(overrides: Partial<CalculationSummary> = {}): CalculationSummary {
  return {
    entityCount: 100,
    componentCount: 3,
    totalOutcome: 500000,
    avgOutcome: 5000,
    medianOutcome: 4500,
    zeroOutcomeCount: 0,
    concordanceRate: 100,
    topEntities: [],
    bottomEntities: [],
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// PG-9: Inline insights — anomaly rate alert
// ──────────────────────────────────────────────

console.log('\n=== PG-9: Inline anomaly rate alert ===');
{
  const surface = createSynapticSurface();
  // Write 10 anomaly synapses for 100 entities = 10% > 5% threshold
  for (let i = 0; i < 10; i++) {
    writeSynapse(surface, {
      type: 'anomaly',
      componentIndex: 0,
      entityId: `entity-${i}`,
      value: 0.5,
      detail: 'boundary_hit',
      timestamp: Date.now(),
    });
  }

  const insights = checkInlineInsights(surface, DEFAULT_INSIGHT_CONFIG, 100);

  assert(insights.length >= 1, 'PG-9a: At least one inline insight fired');
  assert(insights.some(i => i.type === 'anomaly_rate_high'), 'PG-9b: anomaly_rate_high insight present');
  assert(insights[0].currentValue === 0.1, 'PG-9c: Current value = 0.10 (10%)');
  assert(insights[0].threshold === 0.05, 'PG-9d: Threshold = 0.05');

  // No insights for 0 entities
  const empty = checkInlineInsights(surface, DEFAULT_INSIGHT_CONFIG, 0);
  assert(empty.length === 0, 'PG-9e: No insights for 0 entities');
}

// ──────────────────────────────────────────────
// PG-10: Inline insights — confidence drop
// ──────────────────────────────────────────────

console.log('\n=== PG-10: Inline confidence drop alert ===');
{
  const surface = createSynapticSurface();
  // Write low confidence synapses at run level
  for (let i = 0; i < 10; i++) {
    writeSynapse(surface, {
      type: 'confidence',
      componentIndex: 0,
      value: 0.6, // avg = 0.6, drop = 0.4 >> 0.10 threshold
      timestamp: Date.now(),
    });
  }

  const insights = checkInlineInsights(surface, DEFAULT_INSIGHT_CONFIG, 100);

  assert(insights.some(i => i.type === 'confidence_dropping'), 'PG-10a: confidence_dropping insight present');
  const confInsight = insights.find(i => i.type === 'confidence_dropping')!;
  assert(Math.abs(confInsight.currentValue - 0.6) < 0.001, 'PG-10b: Current avg confidence ≈ 0.6');
}

// ──────────────────────────────────────────────
// PG-11: Full analysis — zero outcome cluster
// ──────────────────────────────────────────────

console.log('\n=== PG-11: Zero outcome cluster ===');
{
  const surface = createSynapticSurface();
  const summary = makeSummary({ zeroOutcomeCount: 26, entityCount: 100 });

  const analysis = generateFullAnalysis('batch-11', surface, summary);

  assert(analysis.insights.some(i => i.id === 'zero_outcome_cluster'), 'PG-11a: Zero outcome cluster detected');
  const zeroInsight = analysis.insights.find(i => i.id === 'zero_outcome_cluster')!;
  assert(zeroInsight.severity === 'critical', 'PG-11b: 26% zero outcomes = critical');
  assert(zeroInsight.dataSource.length > 0, 'PG-11c: dataSource is non-empty');

  assert(analysis.governanceFlags.some(f => f.id === 'gov_zero_outcomes'), 'PG-11d: Governance flag created');
}

// ──────────────────────────────────────────────
// PG-12: Full analysis — high anomaly rate alert
// ──────────────────────────────────────────────

console.log('\n=== PG-12: High anomaly rate generates alert ===');
{
  const surface = createSynapticSurface();
  for (let i = 0; i < 20; i++) {
    writeSynapse(surface, {
      type: 'anomaly',
      componentIndex: 0,
      entityId: `entity-${i}`,
      value: 0.5,
      timestamp: Date.now(),
    });
  }

  const summary = makeSummary({ entityCount: 100 });
  const analysis = generateFullAnalysis('batch-12', surface, summary);

  assert(analysis.insights.some(i => i.id === 'high_anomaly_rate'), 'PG-12a: High anomaly rate insight');
  assert(analysis.alerts.some(a => a.id === 'alert_anomaly_rate'), 'PG-12b: Alert created');

  const alert = analysis.alerts.find(a => a.id === 'alert_anomaly_rate')!;
  assert(alert.severity === 'critical', 'PG-12c: 20% anomaly rate = critical');
  assert(alert.dataSource.length > 0, 'PG-12d: Alert has dataSource');
}

// ──────────────────────────────────────────────
// PG-13: Full analysis — concentration risk
// ──────────────────────────────────────────────

console.log('\n=== PG-13: Concentration risk ===');
{
  const surface = createSynapticSurface();
  const summary = makeSummary({
    totalOutcome: 100000,
    topEntities: [
      { entityId: 'top-1', outcome: 30000 },
      { entityId: 'top-2', outcome: 25000 },
    ],
  });

  const analysis = generateFullAnalysis('batch-13', surface, summary);

  assert(analysis.insights.some(i => i.id === 'concentration_risk'), 'PG-13a: Concentration risk detected');
  const concInsight = analysis.insights.find(i => i.id === 'concentration_risk')!;
  assert(concInsight.category === 'risk', 'PG-13b: Category = risk');
  assert(concInsight.dataSource.length > 0, 'PG-13c: Has dataSource');
}

// ──────────────────────────────────────────────
// PG-14: Full analysis — concordance gap
// ──────────────────────────────────────────────

console.log('\n=== PG-14: Concordance gap detection ===');
{
  const surface = createSynapticSurface();
  const summary = makeSummary({ concordanceRate: 93 });

  const analysis = generateFullAnalysis('batch-14', surface, summary);

  assert(analysis.insights.some(i => i.id === 'concordance_gap'), 'PG-14a: Concordance gap detected');
  const concInsight = analysis.insights.find(i => i.id === 'concordance_gap')!;
  assert(concInsight.severity === 'critical', 'PG-14b: <95% concordance = critical');
  assert(concInsight.category === 'process', 'PG-14c: Category = process');

  // Minor gap
  const summary2 = makeSummary({ concordanceRate: 98 });
  const analysis2 = generateFullAnalysis('batch-14b', surface, summary2);
  const gap2 = analysis2.insights.find(i => i.id === 'concordance_gap')!;
  assert(gap2.severity === 'info', 'PG-14d: 98% concordance = info');
}

// ──────────────────────────────────────────────
// PG-15: Persona routing
// ──────────────────────────────────────────────

console.log('\n=== PG-15: Persona routing ===');
{
  const surface = createSynapticSurface();

  // Create a rich analysis with multiple categories
  for (let i = 0; i < 15; i++) {
    writeSynapse(surface, {
      type: 'anomaly',
      componentIndex: 0,
      entityId: `entity-${i}`,
      value: 0.5,
      timestamp: Date.now(),
    });
  }

  const summary = makeSummary({
    entityCount: 100,
    zeroOutcomeCount: 15,
    concordanceRate: 93,
    bottomEntities: [{ entityId: 'bottom-1', outcome: 100 }],
    avgOutcome: 5000,
  });

  const analysis = generateFullAnalysis('batch-15', surface, summary);

  // Admin: process + risk + governance
  const admin = routeToPersona(analysis, 'admin');
  assert(admin.insights.every(i => i.category === 'process' || i.category === 'risk'), 'PG-15a: Admin sees process + risk');
  assert(admin.governance !== undefined, 'PG-15b: Admin sees governance flags');
  assert(admin.alerts !== undefined, 'PG-15c: Admin sees alerts');

  // Manager: performance + coaching
  const manager = routeToPersona(analysis, 'manager');
  assert(manager.insights.every(i => i.category === 'performance' || i.category === 'data_quality'), 'PG-15d: Manager sees performance + data_quality');
  assert(manager.coaching !== undefined, 'PG-15e: Manager sees coaching actions');

  // Rep: performance info + growth
  const rep = routeToPersona(analysis, 'rep');
  assert(rep.growth !== undefined, 'PG-15f: Rep sees growth signals');
  assert(rep.insights.every(i => i.category === 'performance' && i.severity === 'info'), 'PG-15g: Rep sees only info-level performance');
}

// ──────────────────────────────────────────────
// PG-16: AP-18 — no insights without dataSource
// ──────────────────────────────────────────────

console.log('\n=== PG-16: AP-18 compliance ===');
{
  const surface = createSynapticSurface();

  // Generate with various issues
  for (let i = 0; i < 10; i++) {
    writeSynapse(surface, {
      type: 'anomaly',
      componentIndex: 0,
      entityId: `e-${i}`,
      value: 0.5,
      timestamp: Date.now(),
    });
  }

  const summary = makeSummary({
    entityCount: 100,
    zeroOutcomeCount: 20,
    concordanceRate: 90,
    topEntities: [{ entityId: 'top', outcome: 60000 }],
    totalOutcome: 100000,
    bottomEntities: [{ entityId: 'bottom', outcome: 50 }],
    avgOutcome: 1000,
  });

  const analysis = generateFullAnalysis('batch-16', surface, summary);

  // Every insight must have non-empty dataSource
  assert(
    analysis.insights.every(i => i.dataSource.length > 0),
    'PG-16a: All insights have non-empty dataSource'
  );

  // Every alert must have dataSource
  assert(
    analysis.alerts.every(a => a.dataSource.length > 0),
    'PG-16b: All alerts have non-empty dataSource'
  );

  // Coaching, governance, growth all have dataSource
  assert(
    analysis.coachingActions.every(c => c.dataSource.length > 0),
    'PG-16c: All coaching actions have dataSource'
  );
  assert(
    analysis.governanceFlags.every(g => g.dataSource.length > 0),
    'PG-16d: All governance flags have dataSource'
  );
  assert(
    analysis.growthSignals.every(g => g.dataSource.length > 0),
    'PG-16e: All growth signals have dataSource'
  );

  // Run summary structure
  assert(typeof analysis.runSummary.entityCount === 'number', 'PG-16f: runSummary.entityCount present');
  assert(typeof analysis.runSummary.avgConfidence === 'number', 'PG-16g: runSummary.avgConfidence present');
  assert(typeof analysis.runSummary.anomalyCount === 'number', 'PG-16h: runSummary.anomalyCount present');
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`OB-79 Mission 2 (Insight Agent): ${passed}/${passed + failed} tests passed`);
console.log('='.repeat(50));

if (failed > 0) process.exit(1);
