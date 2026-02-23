/**
 * OB-80 Mission 5: Full Integration Proof
 *
 * End-to-end test proving complete Tier 3 architecture:
 *   PART 1: VOCABULARY — weighted_blend + temporal_window execute correctly
 *   PART 2: NEGOTIATION PROTOCOL — multi-domain DVT, IAP arbitration
 *   PART 3: FLYWHEEL PIPELINES — cold start priors, density population
 *   PART 4: AGENT MEMORY — priors loaded for multiple agent types
 *   PART 5: TWO-TIER BOUNDARY — no imports across the boundary, expanded Korean Test
 *
 * 4 proof gates (PG-28 through PG-31)
 */

import type {
  ComponentIntent,
  WeightedBlendOp,
  TemporalWindowOp,
} from '../src/lib/calculation/intent-types';
import { executeIntent, type EntityData } from '../src/lib/calculation/intent-executor';
import { generatePatternSignature } from '../src/lib/calculation/pattern-signature';
import { validateIntent, validateComponentIntent } from '../src/lib/calculation/intent-validator';

import {
  clearRegistry,
  getDomain,
  getAllDomains,
  toStructural,
  toDomain,
  AVAILABLE_PRIMITIVES,
} from '../src/lib/domain/domain-registry';
import { ICM_DOMAIN } from '../src/lib/domain/domains/icm';
import { REBATE_DOMAIN } from '../src/lib/domain/domains/rebate';
import { FRANCHISE_DOMAIN } from '../src/lib/domain/domains/franchise';
// Force side-effect imports
void ICM_DOMAIN;
void REBATE_DOMAIN;
void FRANCHISE_DOMAIN;

import { evaluateDomainViability } from '../src/lib/domain/domain-viability';
import {
  scoreIAP,
  arbitrate,
  DEFAULT_IAP_WEIGHTS,
  type NegotiationRequest,
  type NegotiationResponse,
} from '../src/lib/domain/negotiation-protocol';

import {
  applyPriorsToEmptyDensity,
  COLD_START_DISCOUNT,
  type ColdStartPrior,
} from '../src/lib/calculation/flywheel-pipeline';

import {
  emptyPriors,
  type AgentPriors,
} from '../src/lib/agents/agent-memory';

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

// ══════════════════════════════════════════════
// PART 1: VOCABULARY — End-to-End Execution
// ══════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════╗');
console.log('║  PART 1: VOCABULARY — Structural Primitives  ║');
console.log('╚══════════════════════════════════════════════╝');

// Test 1: Build and execute a weighted_blend ComponentIntent
console.log('\n=== Test 1: Execute weighted_blend ComponentIntent ===');
{
  const blendOp: WeightedBlendOp = {
    operation: 'weighted_blend',
    inputs: [
      { source: { source: 'metric', sourceSpec: { field: 'individual_metric' } }, weight: 0.6 },
      { source: { source: 'metric', sourceSpec: { field: 'team_metric' } }, weight: 0.4 },
    ],
  };

  const intent: ComponentIntent = {
    componentIndex: 0,
    label: 'blended outcome',
    confidence: 0.9,
    dataSource: {
      sheetClassification: 'sheet_metrics',
      entityScope: 'entity',
      requiredMetrics: ['individual_metric', 'team_metric'],
    },
    intent: blendOp,
    modifiers: [],
    metadata: {},
  };

  const entity: EntityData = {
    entityId: 'entity-001',
    metrics: { individual_metric: 100, team_metric: 80 },
    attributes: {},
  };

  const result = executeIntent(intent, entity);
  // 100 × 0.6 + 80 × 0.4 = 60 + 32 = 92
  assert(result.outcome === 92, 'Weighted blend produces correct outcome (92)', `got ${result.outcome}`);
  assert(result.trace.finalOutcome === 92, 'Trace records final outcome');

  // Validate (validateComponentIntent for full wrapper, validateIntent for operation only)
  const validation = validateComponentIntent(intent);
  assert(validation.valid, 'Weighted blend validates successfully');
  const opValidation = validateIntent(blendOp);
  assert(opValidation.valid, 'Weighted blend operation validates');

  // Pattern signature
  const sig = generatePatternSignature(intent);
  assert(sig.includes('weighted_blend'), 'Signature includes weighted_blend');
  assert(sig.includes('2inputs'), 'Signature includes input count');
}

// Test 2: Build and execute temporal_window with history
console.log('\n=== Test 2: Execute temporal_window ComponentIntent ===');
{
  const temporalOp: TemporalWindowOp = {
    operation: 'temporal_window',
    input: { source: 'metric', sourceSpec: { field: 'current_value' } },
    windowSize: 3,
    aggregation: 'average',
    includeCurrentPeriod: true,
  };

  const intent: ComponentIntent = {
    componentIndex: 1,
    label: 'rolling average',
    confidence: 0.85,
    dataSource: {
      sheetClassification: 'sheet_history',
      entityScope: 'entity',
      requiredMetrics: ['current_value'],
    },
    intent: temporalOp,
    modifiers: [],
    metadata: {},
  };

  const entity: EntityData = {
    entityId: 'entity-002',
    metrics: { current_value: 100 },
    attributes: {},
    periodHistory: [80, 90, 95],
  };

  const result = executeIntent(intent, entity);
  // Window: last 3 from history [80, 90, 95] + current 100 = [80, 90, 95, 100]
  // But windowSize=3, so from history: [80, 90, 95], plus current → [80, 90, 95, 100]
  // Average: (80 + 90 + 95 + 100) / 4 = 91.25
  assert(Math.abs(result.outcome - 91.25) < 0.01, 'Temporal window average correct (91.25)', `got ${result.outcome}`);

  const sig = generatePatternSignature(intent);
  assert(sig.includes('temporal_window'), 'Signature includes temporal_window');
  assert(sig.includes('average'), 'Signature includes aggregation type');
}

// Test 3: Compose weighted_blend with nested temporal_window
console.log('\n=== Test 3: Compose weighted_blend + temporal_window ===');
{
  const composedOp: WeightedBlendOp = {
    operation: 'weighted_blend',
    inputs: [
      {
        source: { source: 'metric', sourceSpec: { field: 'current_perf' } },
        weight: 0.7,
      },
      {
        source: {
          operation: 'temporal_window',
          input: { source: 'metric', sourceSpec: { field: 'current_perf' } },
          windowSize: 3,
          aggregation: 'average',
          includeCurrentPeriod: false,
        } as TemporalWindowOp,
        weight: 0.3,
      },
    ],
  };

  const intent: ComponentIntent = {
    componentIndex: 2,
    label: 'blended with history',
    confidence: 0.88,
    dataSource: {
      sheetClassification: 'sheet_data',
      entityScope: 'entity',
      requiredMetrics: ['current_perf'],
    },
    intent: composedOp,
    modifiers: [],
    metadata: {},
  };

  const entity: EntityData = {
    entityId: 'entity-003',
    metrics: { current_perf: 100 },
    attributes: {},
    periodHistory: [70, 80, 90],
  };

  const result = executeIntent(intent, entity);
  // Current: 100 × 0.7 = 70
  // Historical avg: (70+80+90)/3 = 80, × 0.3 = 24
  // Total: 94
  assert(Math.abs(result.outcome - 94) < 0.01, 'Composed blend+temporal correct (94)', `got ${result.outcome}`);
}

// Test 4: All 9 primitives are registered
console.log('\n=== Test 4: All 9 primitives available ===');
{
  assert(AVAILABLE_PRIMITIVES.length === 9, 'Exactly 9 primitives', `got ${AVAILABLE_PRIMITIVES.length}`);
  assert(AVAILABLE_PRIMITIVES.includes('weighted_blend'), 'weighted_blend registered');
  assert(AVAILABLE_PRIMITIVES.includes('temporal_window'), 'temporal_window registered');
  assert(AVAILABLE_PRIMITIVES.includes('bounded_lookup_1d'), 'bounded_lookup_1d registered');
  assert(AVAILABLE_PRIMITIVES.includes('bounded_lookup_2d'), 'bounded_lookup_2d registered');
  assert(AVAILABLE_PRIMITIVES.includes('scalar_multiply'), 'scalar_multiply registered');
  assert(AVAILABLE_PRIMITIVES.includes('conditional_gate'), 'conditional_gate registered');
  assert(AVAILABLE_PRIMITIVES.includes('aggregate'), 'aggregate registered');
  assert(AVAILABLE_PRIMITIVES.includes('ratio'), 'ratio registered');
  assert(AVAILABLE_PRIMITIVES.includes('constant'), 'constant registered');
}


// ══════════════════════════════════════════════
// PART 2: NEGOTIATION PROTOCOL — Multi-Domain
// ══════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════╗');
console.log('║  PART 2: NEGOTIATION — Multi-Domain DVT      ║');
console.log('╚══════════════════════════════════════════════╝');

// Test 5: All three domains registered
console.log('\n=== Test 5: Multi-domain registration ===');
{
  const domains = getAllDomains();
  assert(domains.length >= 3, 'PG-28a: At least 3 domains registered', `got ${domains.length}`);

  const icm = getDomain('icm');
  const rebate = getDomain('rebate');
  const franchise = getDomain('franchise');
  assert(icm !== undefined, 'ICM domain registered');
  assert(rebate !== undefined, 'Rebate domain registered');
  assert(franchise !== undefined, 'Franchise domain registered');
}

// Test 6: DVT on all three domains
console.log('\n=== Test 6: Domain Viability Test — all three ===');
{
  const icm = getDomain('icm')!;
  const rebate = getDomain('rebate')!;
  const franchise = getDomain('franchise')!;

  const icmDvt = evaluateDomainViability(icm, AVAILABLE_PRIMITIVES);
  const rebateDvt = evaluateDomainViability(rebate, AVAILABLE_PRIMITIVES);
  const franchiseDvt = evaluateDomainViability(franchise, AVAILABLE_PRIMITIVES);

  assert(icmDvt.score === 'natural_fit', 'PG-28b: ICM = natural_fit', `got ${icmDvt.score}`);
  assert(rebateDvt.score === 'natural_fit', 'PG-28c: Rebate = natural_fit', `got ${rebateDvt.score}`);
  assert(franchiseDvt.score === 'natural_fit', 'PG-28d: Franchise = natural_fit', `got ${franchiseDvt.score}`);

  // Zero missing primitives for all
  assert(icmDvt.missingPrimitives.length === 0, 'ICM: no missing primitives');
  assert(rebateDvt.missingPrimitives.length === 0, 'Rebate: no missing primitives');
  assert(franchiseDvt.missingPrimitives.length === 0, 'Franchise: no missing primitives');
}

// Test 7: Terminology translation round-trip
console.log('\n=== Test 7: Terminology translation ===');
{
  const icm = getDomain('icm')!;
  const rebate = getDomain('rebate')!;

  // ICM: employee → entity → employee
  assert(toStructural('employee', icm) === 'entity', 'ICM: employee → entity');
  assert(toDomain('entity', icm) === 'employee', 'ICM: entity → employee');

  // Rebate: partner → entity → partner
  assert(toStructural('partner', rebate) === 'entity', 'Rebate: partner → entity');
  assert(toDomain('entity', rebate) === 'partner', 'Rebate: entity → partner');

  // Cross-domain: same structural key, different domain terms
  assert(toDomain('outcome', icm) === 'payout', 'ICM outcome → payout');
  assert(toDomain('outcome', rebate) === 'rebate', 'Rebate outcome → rebate');
}

// Test 8: IAP scoring + arbitration
console.log('\n=== Test 8: IAP arbitration ===');
{
  const result = arbitrate([
    { id: 'approach_a', action: { producesLearning: true, automatesStep: true, confidence: 0.9 } },
    { id: 'approach_b', action: { producesLearning: false, automatesStep: true, confidence: 0.95 } },
    { id: 'approach_c', action: { producesLearning: true, automatesStep: false, confidence: 0.7 } },
  ]);

  assert(result.winnerId === 'approach_a', 'Best IAP option wins', `got ${result.winnerId}`);
  assert(result.allScores.length === 3, 'All options scored');
  assert(result.score.composite > 0.5, 'Winner has substantial composite score');
}

// Test 9: Negotiation request/response structure
console.log('\n=== Test 9: Negotiation request structure ===');
{
  const request: NegotiationRequest = {
    requestId: 'req-001',
    domainId: 'icm',
    requestType: 'calculate_outcomes',
    payload: { tenantId: 'test-tenant', periodId: 'period-001' },
    urgency: 'batch',
  };

  assert(request.requestType === 'calculate_outcomes', 'Request type valid');
  assert(request.urgency === 'batch', 'Urgency set');

  const response: NegotiationResponse = {
    requestId: request.requestId,
    status: 'completed',
    result: { entitiesProcessed: 1000 },
    confidence: 0.95,
    iapScore: scoreIAP({ producesLearning: true, automatesStep: true, confidence: 0.95 }),
  };

  assert(response.status === 'completed', 'Response status valid');
  assert(response.iapScore.composite > 0, 'IAP score computed');
}


// ══════════════════════════════════════════════
// PART 3: FLYWHEEL PIPELINES
// ══════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════╗');
console.log('║  PART 3: FLYWHEEL — Cold Start + Density      ║');
console.log('╚══════════════════════════════════════════════╝');

// Test 10: Cold start priors → density population
console.log('\n=== Test 10: Cold start priors to density ===');
{
  const priors = new Map<string, ColdStartPrior>();
  priors.set('bounded_lookup_1d:metric:b5:entity', { confidence: 0.85, learnedBehaviors: { boundaryBehavior: 'inclusive' } });
  priors.set('scalar_multiply:metric:rate_num:entity', { confidence: 0.92, learnedBehaviors: {} });
  priors.set('weighted_blend:2inputs:metric+metric:entity', { confidence: 0.78, learnedBehaviors: {} });

  const density = applyPriorsToEmptyDensity(priors);

  assert(density.size === 3, 'PG-29a: 3 patterns populated from cold start');

  const lookup = density.get('bounded_lookup_1d:metric:b5:entity');
  assert(lookup !== undefined, 'Lookup pattern present');
  assert(lookup!.confidence === 0.85 * COLD_START_DISCOUNT, 'PG-29b: Confidence discounted by 0.6', `got ${lookup!.confidence}`);
  assert(lookup!.totalExecutions === 0, 'Zero executions (new tenant)');
  assert(lookup!.executionMode === 'full_trace', 'PG-29c: 0.51 < 0.7 → full_trace', `got ${lookup!.executionMode}`);

  // Check learned behaviors carry through
  assert(
    (lookup!.learnedBehaviors as Record<string, unknown>).boundaryBehavior === 'inclusive',
    'PG-29d: Learned behaviors preserved'
  );

  // New weighted_blend pattern also populated
  const blend = density.get('weighted_blend:2inputs:metric+metric:entity');
  assert(blend !== undefined, 'Weighted blend pattern from cold start');
  assert(blend!.confidence === 0.78 * COLD_START_DISCOUNT, 'Blend confidence discounted');
}

// Test 11: Cold start discount validation
console.log('\n=== Test 11: Cold start discount factor ===');
{
  assert(COLD_START_DISCOUNT === 0.6, 'Discount factor is 0.6');

  // At 0.6 discount, a 0.9 prior becomes 0.54 → full_trace
  const priors = new Map<string, ColdStartPrior>();
  priors.set('high_conf', { confidence: 0.9, learnedBehaviors: {} });
  priors.set('low_conf', { confidence: 0.4, learnedBehaviors: {} });

  const density = applyPriorsToEmptyDensity(priors);
  assert(density.get('high_conf')!.confidence === 0.54, '0.9 × 0.6 = 0.54');
  assert(density.get('high_conf')!.executionMode === 'full_trace', '0.54 < 0.7 → full_trace');
  assert(density.get('low_conf')!.confidence === 0.24, '0.4 × 0.6 = 0.24');
}

// Test 12: Migration structure
console.log('\n=== Test 12: Flywheel migration structure ===');
{
  const migration = fs.readFileSync(
    path.join(__dirname, '..', '..', 'supabase', 'migrations', '016_flywheel_tables.sql'), 'utf-8'
  );
  assert(migration.includes('foundational_patterns'), 'Migration: foundational_patterns');
  assert(migration.includes('domain_patterns'), 'Migration: domain_patterns');
  assert(migration.includes('ROW LEVEL SECURITY'), 'Migration: RLS');

  // Privacy firewall: no tenant_id in either table's CREATE
  const fpSection = migration.split('CREATE TABLE IF NOT EXISTS foundational_patterns')[1]?.split(');')[0] ?? '';
  const dpSection = migration.split('CREATE TABLE IF NOT EXISTS domain_patterns')[1]?.split(');')[0] ?? '';
  assert(!fpSection.includes('tenant_id'), 'No tenant_id in foundational_patterns');
  assert(!dpSection.includes('tenant_id'), 'No tenant_id in domain_patterns');
  assert(!dpSection.includes('entity_id'), 'No entity_id in domain_patterns');
}


// ══════════════════════════════════════════════
// PART 4: AGENT MEMORY
// ══════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════╗');
console.log('║  PART 4: AGENT MEMORY — Priors Interface      ║');
console.log('╚══════════════════════════════════════════════╝');

// Test 13: Empty priors structure
console.log('\n=== Test 13: Agent priors structure ===');
{
  const priors = emptyPriors();
  assert(priors.tenantDensity instanceof Map, 'tenantDensity is Map');
  assert(priors.foundationalPriors instanceof Map, 'foundationalPriors is Map');
  assert(priors.domainPriors instanceof Map, 'domainPriors is Map');
  assert(typeof priors.signalHistory === 'object', 'signalHistory is object');
  assert(Array.isArray(priors.signalHistory.fieldMappingSignals), 'fieldMappingSignals is array');
  assert(Array.isArray(priors.signalHistory.reconciliationSignals), 'reconciliationSignals is array');
  assert(Array.isArray(priors.signalHistory.resolutionSignals), 'resolutionSignals is array');
  assert(Array.isArray(priors.signalHistory.interpretationSignals), 'interpretationSignals is array');
}

// Test 14: Agent priors populated from three flywheels
console.log('\n=== Test 14: Three-flywheel priors ===');
{
  const priors = emptyPriors();

  // Flywheel 1: tenant density
  priors.tenantDensity.set('bounded_lookup_1d:metric:b5:entity', {
    signature: 'bounded_lookup_1d:metric:b5:entity',
    confidence: 0.92,
    totalExecutions: 5000,
    lastAnomalyRate: 0.01,
    lastCorrectionCount: 2,
    executionMode: 'light_trace',
    learnedBehaviors: {},
  });

  // Flywheel 2: foundational priors
  priors.foundationalPriors.set('scalar_multiply:metric:rate_num:entity', {
    confidence: 0.88,
    learnedBehaviors: { rateNormalization: true },
  });

  // Flywheel 3: domain priors
  priors.domainPriors.set('bounded_lookup_2d:ratio+metric:g5x5:entity', {
    confidence: 0.85,
    learnedBehaviors: {},
  });

  assert(priors.tenantDensity.size === 1, 'Flywheel 1: tenant density loaded');
  assert(priors.foundationalPriors.size === 1, 'Flywheel 2: foundational loaded');
  assert(priors.domainPriors.size === 1, 'Flywheel 3: domain loaded');

  // Cold start: combine F2 + F3
  const coldStartPriors = new Map<string, ColdStartPrior>([
    ...Array.from(priors.foundationalPriors.entries()),
    ...Array.from(priors.domainPriors.entries()),
  ]);
  assert(coldStartPriors.size === 2, 'Cold start combines F2 + F3');
}

// Test 15: Signal history for different agent types
console.log('\n=== Test 15: Agent-specific signal usage ===');
{
  const priors = emptyPriors();

  priors.signalHistory.fieldMappingSignals.push(
    { sourceColumn: 'Revenue', mappedField: 'actual', confidence: 0.95, occurrences: 50 },
  );
  priors.signalHistory.reconciliationSignals.push(
    { discrepancyClass: 'rounding', count: 100, lastSeen: '2026-02-22' },
    { discrepancyClass: 'data_divergence', count: 3, lastSeen: '2026-02-20' },
  );
  priors.signalHistory.resolutionSignals.push(
    { rootCause: 'data_error', count: 25, lastSeen: '2026-02-22' },
  );

  // Reconciliation agent: filter high-frequency discrepancies
  const knownPatterns = priors.signalHistory.reconciliationSignals
    .filter(s => s.count >= 10)
    .map(s => s.discrepancyClass);
  assert(knownPatterns.length === 1, 'Reconciliation agent: 1 known pattern');
  assert(knownPatterns[0] === 'rounding', 'Known pattern: rounding');

  // Resolution agent: filter frequent root causes
  const frequentCauses = priors.signalHistory.resolutionSignals
    .filter(s => s.count >= 5)
    .map(s => s.rootCause);
  assert(frequentCauses.length === 1, 'Resolution agent: 1 frequent cause');
  assert(frequentCauses[0] === 'data_error', 'Frequent cause: data_error');

  // Ingestion agent: field mapping confidence
  assert(priors.signalHistory.fieldMappingSignals[0].confidence === 0.95, 'Ingestion agent: high confidence mapping');
}


// ══════════════════════════════════════════════
// PART 5: TWO-TIER BOUNDARY
// ══════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════╗');
console.log('║  PART 5: TWO-TIER BOUNDARY — Import Firewall  ║');
console.log('╚══════════════════════════════════════════════╝');

// Test 16: No imports from src/lib/domain/ in agents
console.log('\n=== Test 16: Agent files — no domain imports ===');
{
  const agentDir = path.join(__dirname, '..', 'src', 'lib', 'agents');
  const agentFiles = fs.readdirSync(agentDir).filter(f => f.endsWith('.ts'));

  let violations = 0;
  for (const file of agentFiles) {
    const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('from') && lines[i].includes('/domain/') && !lines[i].startsWith('//')) {
        console.log(`    VIOLATION: ${file}:${i + 1} → ${lines[i].trim()}`);
        violations++;
      }
    }
  }
  assert(violations === 0, 'PG-30a: Zero domain imports in agents/', `${violations} violations`);
}

// Test 17: No imports from src/lib/domain/ in calculation
console.log('\n=== Test 17: Calculation files — no domain imports ===');
{
  const calcDir = path.join(__dirname, '..', 'src', 'lib', 'calculation');
  const calcFiles = fs.readdirSync(calcDir).filter(f => f.endsWith('.ts'));

  let violations = 0;
  for (const file of calcFiles) {
    const content = fs.readFileSync(path.join(calcDir, file), 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('from') && lines[i].includes('/domain/') && !lines[i].startsWith('//')) {
        console.log(`    VIOLATION: ${file}:${i + 1} → ${lines[i].trim()}`);
        violations++;
      }
    }
  }
  assert(violations === 0, 'PG-30b: Zero domain imports in calculation/', `${violations} violations`);
}

// Test 18: Expanded Korean Test — OB-76+ foundational files (intent layer, synaptic, agents)
console.log('\n=== Test 18: Korean Test — OB-76+ foundational files ===');
{
  const domainWords = /commission|compensation|attainment|payout|incentive|sales|quota|royalt|rebate|franchise/i;

  // Only OB-76+ foundational files — not legacy engine code (run-calculation.ts, registry.ts, etc.)
  const koreanTestFiles = [
    // Intent layer (OB-76)
    path.join(__dirname, '..', 'src', 'lib', 'calculation', 'intent-types.ts'),
    path.join(__dirname, '..', 'src', 'lib', 'calculation', 'intent-executor.ts'),
    path.join(__dirname, '..', 'src', 'lib', 'calculation', 'intent-validator.ts'),
    path.join(__dirname, '..', 'src', 'lib', 'calculation', 'pattern-signature.ts'),
    // intent-resolver.ts excluded — OB-77 bridge file that references legacy domain types by design
    // Synaptic (OB-78)
    path.join(__dirname, '..', 'src', 'lib', 'calculation', 'synaptic-types.ts'),
    path.join(__dirname, '..', 'src', 'lib', 'calculation', 'synaptic-density.ts'),
    path.join(__dirname, '..', 'src', 'lib', 'calculation', 'synaptic-surface.ts'),
    path.join(__dirname, '..', 'src', 'lib', 'calculation', 'anomaly-detector.ts'),
    // Flywheel (OB-80)
    path.join(__dirname, '..', 'src', 'lib', 'calculation', 'flywheel-pipeline.ts'),
    // Agents (OB-79+)
    path.join(__dirname, '..', 'src', 'lib', 'agents', 'reconciliation-agent.ts'),
    path.join(__dirname, '..', 'src', 'lib', 'agents', 'insight-agent.ts'),
    path.join(__dirname, '..', 'src', 'lib', 'agents', 'resolution-agent.ts'),
    path.join(__dirname, '..', 'src', 'lib', 'agents', 'agent-memory.ts'),
    // Domain infrastructure (OB-80) — registry/protocol/viability are foundational
    path.join(__dirname, '..', 'src', 'lib', 'domain', 'domain-registry.ts'),
    path.join(__dirname, '..', 'src', 'lib', 'domain', 'negotiation-protocol.ts'),
    path.join(__dirname, '..', 'src', 'lib', 'domain', 'domain-viability.ts'),
  ];

  let totalViolations = 0;
  const violationDetails: string[] = [];

  for (const filePath of koreanTestFiles) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (domainWords.test(lines[i])) {
        totalViolations++;
        violationDetails.push(`${fileName}:${i + 1}: ${lines[i].trim().substring(0, 80)}`);
      }
    }
  }

  if (totalViolations > 0) {
    for (const v of violationDetails) {
      console.log(`    KOREAN VIOLATION: ${v}`);
    }
  }
  assert(totalViolations === 0, 'PG-30c: Korean Test — zero domain words in OB-76+ foundational code', `${totalViolations} violations`);
}

// Test 19: Domain files CAN have domain words (two-tier boundary is one-way)
console.log('\n=== Test 19: Domain files allow domain language ===');
{
  const domainWords = /commission|compensation|attainment|payout|incentive|sales|quota|royalt|rebate|franchise/i;
  const domainDir = path.join(__dirname, '..', 'src', 'lib', 'domain', 'domains');
  const domainFiles = fs.readdirSync(domainDir).filter(f => f.endsWith('.ts'));

  let domainWordCount = 0;
  for (const file of domainFiles) {
    const content = fs.readFileSync(path.join(domainDir, file), 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (domainWords.test(line)) domainWordCount++;
    }
  }
  assert(domainWordCount > 0, 'Domain files contain domain language (expected)', `${domainWordCount} lines`);
}


// ══════════════════════════════════════════════
// PG-31: END-TO-END — Full Pipeline Proof
// ══════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════╗');
console.log('║  PG-31: END-TO-END INTEGRATION PROOF          ║');
console.log('╚══════════════════════════════════════════════╝');

// Test 20: Complete pipeline: Domain registers → DVT → Vocabulary executes → Flywheel priors → Memory
console.log('\n=== Test 20: End-to-end pipeline ===');
{
  // Step 1: Domain registration verified
  const icm = getDomain('icm')!;
  assert(icm.domainId === 'icm', 'Step 1: ICM registered');

  // Step 2: DVT passes
  const dvt = evaluateDomainViability(icm, AVAILABLE_PRIMITIVES);
  assert(dvt.score === 'natural_fit', 'Step 2: DVT passes');

  // Step 3: Vocabulary executes (weighted_blend for blended outcomes)
  const blendIntent: ComponentIntent = {
    componentIndex: 0,
    label: 'blended calculation',
    confidence: dvt.gateResults.ruleExpressibility === 'pass' ? 0.95 : 0.5,
    dataSource: {
      sheetClassification: 'sheet_data',
      entityScope: 'entity',
      requiredMetrics: ['metric_a', 'metric_b'],
    },
    intent: {
      operation: 'weighted_blend',
      inputs: [
        { source: { source: 'metric', sourceSpec: { field: 'metric_a' } }, weight: 0.5 },
        { source: { source: 'metric', sourceSpec: { field: 'metric_b' } }, weight: 0.5 },
      ],
    } as WeightedBlendOp,
    modifiers: [],
    metadata: {},
  };

  const entity: EntityData = {
    entityId: 'e2e-entity',
    metrics: { metric_a: 200, metric_b: 300 },
    attributes: {},
  };

  const result = executeIntent(blendIntent, entity);
  assert(result.outcome === 250, 'Step 3: Vocabulary executes correctly (250)', `got ${result.outcome}`);

  // Step 4: Generate pattern signature for density tracking
  const sig = generatePatternSignature(blendIntent);
  assert(sig.length > 0, 'Step 4: Pattern signature generated');

  // Step 5: Flywheel cold start priors
  const coldPriors = new Map<string, ColdStartPrior>();
  coldPriors.set(sig, { confidence: 0.9, learnedBehaviors: {} });
  const density = applyPriorsToEmptyDensity(coldPriors);
  assert(density.size === 1, 'Step 5: Cold start density populated');
  assert(density.get(sig)!.confidence === 0.54, 'Step 5: Discounted to 0.54');

  // Step 6: Agent memory structure
  const agentPriors = emptyPriors();
  agentPriors.foundationalPriors.set(sig, { confidence: 0.9, learnedBehaviors: {} });
  assert(agentPriors.foundationalPriors.size === 1, 'Step 6: Agent memory loaded');

  // Step 7: IAP scoring on the action
  const score = scoreIAP({ producesLearning: true, automatesStep: true, confidence: 0.95 });
  assert(score.composite > 0.8, 'Step 7: High IAP score for learning+automation');

  // Step 8: Terminology translation works
  const domainTerm = toDomain('entity', icm);
  assert(domainTerm === 'employee', 'PG-31: Full pipeline — domain translation works');
}

// Test 21: Multi-domain parallel viability
console.log('\n=== Test 21: Multi-domain parallel viability ===');
{
  const domains = getAllDomains();
  const results = domains.map(d => evaluateDomainViability(d, AVAILABLE_PRIMITIVES));

  const allViable = results.every(r => r.score === 'natural_fit' || r.score === 'strong_fit');
  assert(allViable, 'PG-31a: All registered domains are viable');

  const allZeroMissing = results.every(r => r.missingPrimitives.length === 0);
  assert(allZeroMissing, 'PG-31b: No missing primitives across any domain');
}

// Test 22: File structure verification
console.log('\n=== Test 22: File structure ===');
{
  const requiredFiles = [
    'src/lib/calculation/intent-types.ts',
    'src/lib/calculation/intent-executor.ts',
    'src/lib/calculation/intent-validator.ts',
    'src/lib/calculation/pattern-signature.ts',
    'src/lib/calculation/flywheel-pipeline.ts',
    'src/lib/domain/domain-registry.ts',
    'src/lib/domain/negotiation-protocol.ts',
    'src/lib/domain/domain-viability.ts',
    'src/lib/domain/domains/icm.ts',
    'src/lib/domain/domains/rebate.ts',
    'src/lib/domain/domains/franchise.ts',
    'src/lib/agents/agent-memory.ts',
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join(__dirname, '..', file);
    assert(fs.existsSync(fullPath), `File exists: ${file}`);
  }
}


// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
console.log(`OB-80 Mission 5 Integration: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
