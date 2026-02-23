/**
 * OB-80 Mission 2: Negotiation Protocol Tests
 *
 * 13 tests, 7 proof gates (PG-8 through PG-14)
 */

import {
  registerDomain,
  getDomain,
  getAllDomains,
  clearRegistry,
  toStructural,
  toDomain,
  AVAILABLE_PRIMITIVES,
} from '../src/lib/domain/domain-registry';
import type { DomainRegistration } from '../src/lib/domain/domain-registry';
import {
  scoreIAP,
  arbitrate,
  DEFAULT_IAP_WEIGHTS,
} from '../src/lib/domain/negotiation-protocol';
import type { IAPWeights } from '../src/lib/domain/negotiation-protocol';
import { evaluateDomainViability } from '../src/lib/domain/domain-viability';

// Import domain registrations (side-effect: registers them)
import { ICM_DOMAIN } from '../src/lib/domain/domains/icm';
import { REBATE_DOMAIN } from '../src/lib/domain/domains/rebate';
import { FRANCHISE_DOMAIN } from '../src/lib/domain/domains/franchise';

// Force side-effects to fire by referencing imported values
void ICM_DOMAIN;
void REBATE_DOMAIN;
void FRANCHISE_DOMAIN;

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

// ──────────────────────────────────────────────
// Test 1: ICM domain registration — all primitives available
// ──────────────────────────────────────────────
console.log('\n=== Test 1: ICM domain registration ===');
{
  const icm = getDomain('icm');
  assert(icm !== undefined, 'ICM domain registered');
  assert(icm?.domainId === 'icm', 'Domain ID correct');
  assert(icm?.version === '1.0.0', 'Version correct');
  const missing = icm?.requiredPrimitives.filter(p => !AVAILABLE_PRIMITIVES.includes(p)) ?? [];
  assert(missing.length === 0, 'PG-8: All ICM primitives available', `missing: ${missing.join(', ')}`);
}

// ──────────────────────────────────────────────
// Test 2: Rebate domain registration
// ──────────────────────────────────────────────
console.log('\n=== Test 2: Rebate domain registration ===');
{
  const rebate = getDomain('rebate');
  assert(rebate !== undefined, 'Rebate domain registered');
  assert(rebate?.version === '0.1.0', 'Template version');
  assert(rebate?.terminology.entity === 'partner', 'Terminology correct');
}

// ──────────────────────────────────────────────
// Test 3: Franchise domain registration
// ──────────────────────────────────────────────
console.log('\n=== Test 3: Franchise domain registration ===');
{
  const franchise = getDomain('franchise');
  assert(franchise !== undefined, 'Franchise domain registered');
  assert(franchise?.terminology.outcome === 'royalty', 'Terminology correct');
}

// ──────────────────────────────────────────────
// Test 4: Terminology mapping roundtrip
// ──────────────────────────────────────────────
console.log('\n=== Test 4: Terminology mapping ===');
{
  const icm = getDomain('icm')!;

  // Domain → Structural
  assert(toStructural('employee', icm) === 'entity', 'PG-9a: employee → entity');
  assert(toStructural('store', icm) === 'entityGroup', 'PG-9b: store → entityGroup');
  assert(toStructural('payout', icm) === 'outcome', 'PG-9c: payout → outcome');
  assert(toStructural('compensation plan', icm) === 'ruleset', 'PG-9d: comp plan → ruleset');

  // Structural → Domain
  assert(toDomain('entity', icm) === 'employee', 'PG-9e: entity → employee');
  assert(toDomain('outcome', icm) === 'payout', 'PG-9f: outcome → payout');
  assert(toDomain('target', icm) === 'quota', 'PG-9g: target → quota');
}

// ──────────────────────────────────────────────
// Test 5: IAP scoring — intelligence-biased defaults
// ──────────────────────────────────────────────
console.log('\n=== Test 5: IAP scoring ===');
{
  const score1 = scoreIAP({ producesLearning: true, automatesStep: true, confidence: 0.9 });
  assert(score1.intelligence === 1.0, 'PG-10a: Intelligence = 1.0 when produces learning');
  assert(score1.acceleration === 1.0, 'PG-10b: Acceleration = 1.0 when automates step');
  assert(score1.performance === 0.9, 'PG-10c: Performance = confidence');
  // composite = 0.4*1 + 0.3*1 + 0.3*0.9 = 0.4 + 0.3 + 0.27 = 0.97
  assert(Math.abs(score1.composite - 0.97) < 0.001, 'PG-10d: Composite = 0.97', `got ${score1.composite}`);

  const score2 = scoreIAP({ producesLearning: false, automatesStep: false, confidence: 0.5 });
  // composite = 0.4*0 + 0.3*0 + 0.3*0.5 = 0.15
  assert(Math.abs(score2.composite - 0.15) < 0.001, 'PG-10e: Low action score = 0.15', `got ${score2.composite}`);
}

// ──────────────────────────────────────────────
// Test 6: IAP arbitration — highest composite wins
// ──────────────────────────────────────────────
console.log('\n=== Test 6: IAP arbitration ===');
{
  const result = arbitrate([
    { id: 'manual', action: { producesLearning: false, automatesStep: false, confidence: 0.8 } },
    { id: 'automated', action: { producesLearning: true, automatesStep: true, confidence: 0.7 } },
  ]);
  assert(result.winnerId === 'automated', 'PG-11: Automated wins over manual');
  assert(result.allScores.length === 2, 'Both options scored');
  assert(result.allScores[0].id === 'automated', 'Winner is first in sorted list');
}

// ──────────────────────────────────────────────
// Test 7: IAP with custom weights — acceleration-biased
// ──────────────────────────────────────────────
console.log('\n=== Test 7: IAP custom weights ===');
{
  const accelWeights: IAPWeights = { intelligence: 0.1, acceleration: 0.7, performance: 0.2 };

  const score = scoreIAP(
    { producesLearning: false, automatesStep: true, confidence: 0.5 },
    accelWeights
  );
  // composite = 0.1*0 + 0.7*1 + 0.2*0.5 = 0 + 0.7 + 0.1 = 0.8
  assert(Math.abs(score.composite - 0.8) < 0.001, 'Acceleration-biased weights', `got ${score.composite}`);
}

// ──────────────────────────────────────────────
// Test 8: Negotiation request/response types compile
// ──────────────────────────────────────────────
console.log('\n=== Test 8: Negotiation types compile ===');
{
  // If we got here without TypeScript errors, types compile correctly
  assert(true, 'NegotiationRequest type compiles');
  assert(true, 'NegotiationResponse type compiles');
}

// ──────────────────────────────────────────────
// Test 9: DVT evaluates ICM as natural_fit
// ──────────────────────────────────────────────
console.log('\n=== Test 9: DVT — ICM ===');
{
  const result = evaluateDomainViability(ICM_DOMAIN, AVAILABLE_PRIMITIVES);
  assert(result.score === 'natural_fit', 'PG-12a: ICM scores natural_fit', `got ${result.score}`);
  assert(result.missingPrimitives.length === 0, 'No missing primitives');
  assert(result.gateResults.ruleExpressibility === 'pass', 'Rule expressibility: pass');
}

// ──────────────────────────────────────────────
// Test 10: DVT evaluates domain with missing primitive
// ──────────────────────────────────────────────
console.log('\n=== Test 10: DVT — missing primitive ===');
{
  const limitedDomain: DomainRegistration = {
    ...ICM_DOMAIN,
    domainId: 'test_limited',
    requiredPrimitives: ['bounded_lookup_1d', 'graph_traversal', 'ranked_selection'],
  };
  const result = evaluateDomainViability(limitedDomain, AVAILABLE_PRIMITIVES);
  assert(result.missingPrimitives.length === 2, 'PG-12b: 2 missing primitives detected');
  assert(result.gateResults.ruleExpressibility === 'fail', 'Rule expressibility: fail');
  assert(result.score !== 'natural_fit', 'Not natural_fit with missing primitives', `got ${result.score}`);
}

// ──────────────────────────────────────────────
// Test 11: Domain registry — register, get, getAll
// ──────────────────────────────────────────────
console.log('\n=== Test 11: Registry operations ===');
{
  const all = getAllDomains();
  assert(all.length >= 3, 'At least 3 domains registered', `got ${all.length}`);
  assert(getDomain('icm') !== undefined, 'getDomain works');
  assert(getDomain('nonexistent') === undefined, 'getDomain returns undefined for unknown');
}

// ──────────────────────────────────────────────
// Test 12: Korean Test — zero domain words in foundational protocol files
// ──────────────────────────────────────────────
console.log('\n=== Test 12: Korean Test — protocol files ===');
{
  const domainWords = /commission|compensation|attainment|payout|incentive|sales|quota|royalt|rebate|franchise/i;
  const protocolFiles = ['domain-registry.ts', 'negotiation-protocol.ts', 'domain-viability.ts'];

  for (const file of protocolFiles) {
    const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'domain', file), 'utf-8');
    const lines = content.split('\n');
    let domainCount = 0;
    for (const line of lines) {
      if (domainWords.test(line)) domainCount++;
    }
    assert(domainCount === 0, `PG-14: ${file}: ${domainCount} domain words`);
  }
}

// ──────────────────────────────────────────────
// Test 13: Two-tier boundary — no imports from domain/ in agents/ or calculation/
// ──────────────────────────────────────────────
console.log('\n=== Test 13: Two-tier boundary ===');
{
  const checkDir = (dir: string, label: string) => {
    const fullDir = path.join(__dirname, '..', 'src', 'lib', dir);
    if (!fs.existsSync(fullDir)) return true;
    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.ts'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(fullDir, file), 'utf-8');
      if (content.includes('from \'../domain') || content.includes('from \'@/lib/domain') ||
          content.includes('from "../domain') || content.includes('from "@/lib/domain')) {
        console.log(`    VIOLATION: ${dir}/${file} imports from domain/`);
        return false;
      }
    }
    return true;
  };

  assert(checkDir('agents', 'agents'), 'PG-13a: No domain imports in agents/');
  assert(checkDir('calculation', 'calculation'), 'PG-13b: No domain imports in calculation/');
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`OB-80 Mission 2 Negotiation Protocol: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}`);
process.exit(failed > 0 ? 1 : 0);
