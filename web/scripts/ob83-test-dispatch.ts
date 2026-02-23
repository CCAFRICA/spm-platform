/**
 * OB-83 Mission 1 Tests — ICM Domain Agent Runtime Dispatch
 *
 * Verifies:
 * - PG-1: ICM Domain Agent invoked during calculation dispatch
 * - PG-2: NegotiationRequest created with correct metadata
 * - PG-3: IAP score included in calculation response
 * - PG-4: Terminology mapping translates structural → domain terms
 * - PG-5: Existing calculation results unchanged (dispatch is additive)
 * - PG-6: Fallback works when no domain registered
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    failed++;
  }
}

// ──────────────────────────────────────────────
// Test Setup: Import domain-dispatcher and dependencies
// ──────────────────────────────────────────────

import { createCalculationRequest, scoreCalculationResult, buildNegotiationResponse } from '../src/lib/domain/domain-dispatcher';
import { getDomain, clearRegistry } from '../src/lib/domain/domain-registry';
import { scoreIAP, DEFAULT_IAP_WEIGHTS } from '../src/lib/domain/negotiation-protocol';

// ──────────────────────────────────────────────
// PG-1: ICM Domain Agent invoked during calculation dispatch
// ──────────────────────────────────────────────

console.log('\nPG-1: ICM Domain Agent invoked during calculation dispatch');

// Import ICM to trigger registration
import '../src/lib/domain/domains/icm';

const icmDomain = getDomain('icm');
assert(icmDomain !== undefined, 'ICM domain registered after import');
assert(icmDomain?.domainId === 'icm', 'ICM domainId is "icm"');
assert(icmDomain?.version === '1.0.0', 'ICM version is 1.0.0');
assert(icmDomain?.displayName === 'Incentive Compensation Management', 'ICM has correct display name');

// ──────────────────────────────────────────────
// PG-2: NegotiationRequest created with correct metadata
// ──────────────────────────────────────────────

console.log('\nPG-2: NegotiationRequest created with correct metadata');

const context = { tenantId: 'test-tenant', domainId: 'icm' };
const request = createCalculationRequest(context, 'batch-001', 'period-001');

assert(request.requestId === 'batch-001', 'Request ID matches batch ID');
assert(request.domainId === 'icm', 'Request domainId is icm');
assert(request.requestType === 'calculate_outcomes', 'Request type is calculate_outcomes');
assert(request.urgency === 'immediate', 'Urgency is immediate');

const payload = request.payload as Record<string, unknown>;
assert(payload.tenantId === 'test-tenant', 'Payload contains tenantId');
assert(payload.periodId === 'period-001', 'Payload contains periodId');
assert(payload.batchId === 'batch-001', 'Payload contains batchId');
assert(typeof payload.interpretationContext === 'string', 'Payload contains interpretationContext');
assert(Array.isArray(payload.requiredPrimitives), 'Payload contains requiredPrimitives array');
assert((payload.requiredPrimitives as string[]).length === 8, 'ICM requires 8 primitives');

// ──────────────────────────────────────────────
// PG-3: IAP score included in calculation response
// ──────────────────────────────────────────────

console.log('\nPG-3: IAP score included in calculation response');

const result = scoreCalculationResult(context, 'batch-001', { some: 'results' }, 0.95, true);

assert(result.negotiation !== undefined, 'Result includes negotiation metadata');
assert(result.negotiation.domainId === 'icm', 'Negotiation domainId is icm');
assert(result.negotiation.domainVersion === '1.0.0', 'Negotiation domainVersion matches');
assert(typeof result.negotiation.iapScore.intelligence === 'number', 'IAP intelligence is number');
assert(typeof result.negotiation.iapScore.acceleration === 'number', 'IAP acceleration is number');
assert(typeof result.negotiation.iapScore.performance === 'number', 'IAP performance is number');
assert(typeof result.negotiation.iapScore.composite === 'number', 'IAP composite is number');
assert(result.negotiation.iapScore.intelligence === 1.0, 'Learning → intelligence = 1.0');
assert(result.negotiation.iapScore.acceleration === 1.0, 'Automated → acceleration = 1.0');
assert(result.negotiation.iapScore.performance === 0.95, 'Confidence 0.95 → performance = 0.95');

// Verify composite calculation: 0.4*1 + 0.3*1 + 0.3*0.95 = 0.985
const expectedComposite = 0.4 * 1.0 + 0.3 * 1.0 + 0.3 * 0.95;
assert(Math.abs(result.negotiation.iapScore.composite - expectedComposite) < 0.001, `Composite = ${expectedComposite.toFixed(3)}`);

// ──────────────────────────────────────────────
// PG-4: Terminology mapping translates structural → domain terms
// ──────────────────────────────────────────────

console.log('\nPG-4: Terminology mapping translates structural → domain terms');

const terminology = result.negotiation.terminology;
assert(terminology.entity === 'employee', 'entity → employee');
assert(terminology.entityGroup === 'store', 'entityGroup → store');
assert(terminology.outcome === 'payout', 'outcome → payout');
assert(terminology.outcomeVerb === 'earned', 'outcomeVerb → earned');
assert(terminology.ruleset === 'compensation plan', 'ruleset → compensation plan');
assert(terminology.period === 'pay period', 'period → pay period');
assert(terminology.performance === 'attainment', 'performance → attainment');
assert(terminology.target === 'quota', 'target → quota');

// ──────────────────────────────────────────────
// PG-5: Existing calculation results unchanged (dispatch is additive)
// ──────────────────────────────────────────────

console.log('\nPG-5: Existing calculation results unchanged (dispatch is additive)');

const originalResults = { entityCount: 100, totalPayout: 50000 };
const wrapped = scoreCalculationResult(context, 'batch-002', originalResults, 0.8, false);

assert(wrapped.results === originalResults, 'Results object is identity (same reference)');
assert((wrapped.results as Record<string, unknown>).entityCount === 100, 'Entity count unchanged');
assert((wrapped.results as Record<string, unknown>).totalPayout === 50000, 'Total payout unchanged');
assert(wrapped.negotiation !== undefined, 'Negotiation metadata added without modifying results');

// No learning → intelligence = 0
assert(wrapped.negotiation.iapScore.intelligence === 0.0, 'No learning → intelligence = 0');

// ──────────────────────────────────────────────
// PG-6: Fallback works when no domain registered
// ──────────────────────────────────────────────

console.log('\nPG-6: Fallback works when no domain registered');

const unknownContext = { tenantId: 'test-tenant', domainId: 'unknown-domain' };
const fallbackRequest = createCalculationRequest(unknownContext, 'batch-003', 'period-003');

assert(fallbackRequest.domainId === 'unknown-domain', 'Fallback preserves domainId');
assert(fallbackRequest.requestType === 'calculate_outcomes', 'Fallback still uses calculate_outcomes');
assert(fallbackRequest.requestId === 'batch-003', 'Fallback preserves batchId');
assert(fallbackRequest.urgency === 'immediate', 'Fallback urgency is immediate');
assert(fallbackRequest.iapPreference === undefined, 'Fallback has no IAP preference');

// Score with unknown domain
const fallbackResult = scoreCalculationResult(unknownContext, 'batch-003', { test: true }, 0.5, false);
assert(fallbackResult.negotiation.domainVersion === 'unknown', 'Unknown domain → version "unknown"');
assert(Object.keys(fallbackResult.negotiation.terminology).length === 0, 'Unknown domain → empty terminology');
assert(typeof fallbackResult.negotiation.iapScore.composite === 'number', 'IAP score still computed');

// ──────────────────────────────────────────────
// Additional: buildNegotiationResponse
// ──────────────────────────────────────────────

console.log('\nAdditional: buildNegotiationResponse');

const iapScore = scoreIAP({ producesLearning: true, automatesStep: true, confidence: 0.9 });
const response = buildNegotiationResponse('batch-004', 0.9, iapScore, { signal: 'test' });

assert(response.requestId === 'batch-004', 'Response requestId matches');
assert(response.status === 'completed', 'Response status is completed');
assert(response.confidence === 0.9, 'Response confidence matches');
assert(response.iapScore === iapScore, 'Response iapScore is same reference');
assert(response.trainingSignal?.signal === 'test', 'Training signal passed through');

// ──────────────────────────────────────────────
// Additional: Calculation route wiring verification
// ──────────────────────────────────────────────

console.log('\nRoute wiring verification');

const routeFile = fs.readFileSync(
  path.join(ROOT, 'src/app/api/calculation/run/route.ts'),
  'utf-8'
);

assert(routeFile.includes('import { createCalculationRequest, scoreCalculationResult }'), 'Route imports domain-dispatcher functions');
assert(routeFile.includes("import '@/lib/domain/domains/icm'"), 'Route imports ICM for registration');
assert(routeFile.includes('const dispatchContext'), 'Route creates dispatch context');
assert(routeFile.includes('createCalculationRequest(dispatchContext'), 'Route calls createCalculationRequest');
assert(routeFile.includes('scoreCalculationResult('), 'Route calls scoreCalculationResult');
assert(routeFile.includes('negotiation: dispatchResult.negotiation'), 'Route includes negotiation in response');

// ──────────────────────────────────────────────
// Additional: Korean Test — domain-dispatcher.ts
// ──────────────────────────────────────────────

console.log('\nKorean Test — domain-dispatcher.ts');

const dispatcherFile = fs.readFileSync(
  path.join(ROOT, 'src/lib/domain/domain-dispatcher.ts'),
  'utf-8'
);

// Remove comments and string literals before checking for domain words
const codeOnly = dispatcherFile
  .replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
  .replace(/\/\/.*/g, '')             // line comments
  .replace(/'[^']*'/g, '')            // single-quoted strings
  .replace(/"[^"]*"/g, '');           // double-quoted strings

const domainWords = ['commission', 'compensation', 'attainment', 'payout', 'incentive', 'sales', 'quota', 'royalt', 'rebate', 'franchise'];
let violations = 0;
for (const word of domainWords) {
  const regex = new RegExp(word, 'i');
  if (regex.test(codeOnly)) {
    console.log(`    VIOLATION: "${word}" found in domain-dispatcher.ts logic`);
    violations++;
  }
}
assert(violations === 0, `Korean Test: 0 domain words in domain-dispatcher.ts logic (${violations} found)`);

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────

console.log(`\n${'='.repeat(60)}`);
console.log(`OB-83 Mission 1: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log(`${'='.repeat(60)}`);

if (failed > 0) {
  process.exit(1);
}
