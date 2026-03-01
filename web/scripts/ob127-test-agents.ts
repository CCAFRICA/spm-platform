/**
 * OB-127 Test: Agent Scoring Models — 8 test cases
 * Usage: cd web && npx tsx scripts/ob127-test-agents.ts
 */
import { generateContentProfile } from '../src/lib/sci/content-profile';
import { scoreContentUnit, resolveClaimsPhase1, requiresHumanReview } from '../src/lib/sci/agents';

let passed = 0, failed = 0;
function assert(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

// Test 1: DG Tab 1 (plan rules) → Plan Agent wins
console.log('\n=== Test 1: DG Tab 1 (plan rules) → Plan Agent ===');
const planCols = ['CARIBE FINANCIAL GROUP', 'attainment', '__EMPTY', '__EMPTY_1', '__EMPTY_2', 'amount', 'text'];
const planRows = Array.from({ length: 17 }, (_, i) => ({
  'CARIBE FINANCIAL GROUP': i < 3 ? 'ATTAINMENT TIERS' : null,
  'attainment': i >= 3 ? `${60 + i * 5}%` : null,
  '__EMPTY': i >= 3 ? `${60 + i * 5}%` : null,
  '__EMPTY_1': i >= 3 ? (i * 5000) : null,
  '__EMPTY_2': i >= 3 ? 'Description text' : null,
  'amount': i >= 3 ? (i * 5000) : null,
  'text': i >= 3 ? `Level ${i}` : 'Header text',
}));
const planProfile = generateContentProfile('Plan Rules', 0, 'DG_Plan.xlsx', planCols, planRows);
const planScores = scoreContentUnit(planProfile);
assert('Plan Agent wins', planScores[0].agent === 'plan', `winner: ${planScores[0].agent} (${planScores[0].confidence.toFixed(2)})`);
assert('Plan confidence > 0.60', planScores[0].confidence > 0.60, `got ${planScores[0].confidence.toFixed(2)}`);
console.log(`  Scores: ${planScores.map(s => `${s.agent}:${s.confidence.toFixed(2)}`).join(', ')}`);

// Test 2: DG Tab 2 (targets) → Target Agent wins
console.log('\n=== Test 2: DG Tab 2 (targets) → Target Agent ===');
const targetCols = ['Officer ID', 'Name', 'Target Amount', 'Region'];
const targetRows = Array.from({ length: 12 }, (_, i) => ({
  'Officer ID': 1001 + i,
  'Name': `Person ${i}`,
  'Target Amount': 50000 + i * 5000,
  'Region': ['North', 'South', 'East'][i % 3],
}));
const targetProfile = generateContentProfile('Growth Targets', 1, 'DG_Plan.xlsx', targetCols, targetRows);
const targetScores = scoreContentUnit(targetProfile);
assert('Target Agent wins', targetScores[0].agent === 'target', `winner: ${targetScores[0].agent} (${targetScores[0].confidence.toFixed(2)})`);
assert('Target confidence > 0.60', targetScores[0].confidence > 0.60, `got ${targetScores[0].confidence.toFixed(2)}`);
console.log(`  Scores: ${targetScores.map(s => `${s.agent}:${s.confidence.toFixed(2)}`).join(', ')}`);

// Test 3: Loan disbursements → Transaction Agent wins
console.log('\n=== Test 3: Transaction data → Transaction Agent ===');
const txCols = ['Transaction ID', 'Date', 'Amount', 'Entity Code', 'Category'];
const txRows = Array.from({ length: 600 }, (_, i) => ({
  'Transaction ID': 10000 + i,
  'Date': `2024-0${(i % 3) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
  'Amount': (Math.random() * 10000).toFixed(2),
  'Entity Code': 1001 + (i % 25),
  'Category': ['A', 'B', 'C'][i % 3],
}));
const txProfile = generateContentProfile('Disbursements', 0, 'transactions.csv', txCols, txRows);
const txScores = scoreContentUnit(txProfile);
assert('Transaction Agent wins', txScores[0].agent === 'transaction', `winner: ${txScores[0].agent} (${txScores[0].confidence.toFixed(2)})`);
assert('Transaction confidence > 0.60', txScores[0].confidence > 0.60, `got ${txScores[0].confidence.toFixed(2)}`);
console.log(`  Scores: ${txScores.map(s => `${s.agent}:${s.confidence.toFixed(2)}`).join(', ')}`);

// Test 4: Personnel roster → Entity Agent wins
console.log('\n=== Test 4: Roster → Entity Agent ===');
const rosterCols = ['Employee ID', 'Name', 'Role', 'Product Licenses', 'Status'];
const rosterRows = Array.from({ length: 25 }, (_, i) => ({
  'Employee ID': 1001 + i,
  'Name': `Employee ${i}`,
  'Role': ['Manager', 'Associate', 'Senior'][i % 3],
  'Product Licenses': ['CL,IR', 'MO,DG', 'CL,MO,IR'][i % 3],
  'Status': 'Active',
}));
const rosterProfile = generateContentProfile('Personnel', 0, 'roster.xlsx', rosterCols, rosterRows);
const rosterScores = scoreContentUnit(rosterProfile);
assert('Entity Agent wins', rosterScores[0].agent === 'entity', `winner: ${rosterScores[0].agent} (${rosterScores[0].confidence.toFixed(2)})`);
assert('Entity confidence > 0.60', rosterScores[0].confidence > 0.60, `got ${rosterScores[0].confidence.toFixed(2)}`);
console.log(`  Scores: ${rosterScores.map(s => `${s.agent}:${s.confidence.toFixed(2)}`).join(', ')}`);

// Test 5: Signal weight verification
console.log('\n=== Test 5: Signal weight verification ===');
const planScore = planScores.find(s => s.agent === 'plan')!;
const manualSum = planScore.signals.reduce((sum, s) => sum + s.weight, 0);
const clamped = Math.max(0, Math.min(1, manualSum));
assert('Signal weights sum correctly', Math.abs(clamped - planScore.confidence) < 0.001,
  `manual: ${clamped.toFixed(3)}, reported: ${planScore.confidence.toFixed(3)}`);

// Test 6: Claim resolution picks highest score
console.log('\n=== Test 6: Claim resolution ===');
const claim = resolveClaimsPhase1(planProfile, planScores);
assert('Claim agent matches highest score', claim.agent === planScores[0].agent);
assert('Claim type is FULL', claim.claimType === 'FULL');
assert('Semantic bindings generated', claim.semanticBindings.length > 0,
  `got ${claim.semanticBindings.length} bindings`);

// Test 7: Close scores → requiresHumanReview
console.log('\n=== Test 7: Close scores → human review ===');
const closeScores = [
  { agent: 'target' as const, confidence: 0.45, signals: [], reasoning: 'close' },
  { agent: 'entity' as const, confidence: 0.42, signals: [], reasoning: 'close' },
];
assert('Close gap + low confidence → human review', requiresHumanReview(closeScores) === true);

const clearScores = [
  { agent: 'transaction' as const, confidence: 0.80, signals: [], reasoning: 'clear' },
  { agent: 'entity' as const, confidence: 0.30, signals: [], reasoning: 'clear' },
];
assert('Clear gap + high confidence → no human review', requiresHumanReview(clearScores) === false);

// Test 8: Korean Test — zero domain words in agents.ts
console.log('\n=== Test 8: Korean Test ===');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
const agentsCode = fs.readFileSync('src/lib/sci/agents.ts', 'utf-8');
const domainWords = ['compensation', 'commission', 'loan', 'officer', 'mortgage', 'insurance', 'deposit', 'referral', 'salary', 'payroll', 'bonus'];
let domainMatches = 0;
for (const word of domainWords) {
  const re = new RegExp(`\\b${word}\\b`, 'gi');
  const matches = agentsCode.match(re);
  if (matches) {
    domainMatches += matches.length;
    console.log(`  FOUND: "${word}" × ${matches.length}`);
  }
}
assert('Zero domain vocabulary in agents.ts', domainMatches === 0, `found ${domainMatches} matches`);

// Summary
console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
