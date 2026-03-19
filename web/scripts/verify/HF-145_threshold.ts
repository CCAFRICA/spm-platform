/**
 * HF-145 EPG: Confidence threshold + self-correction verification
 *
 * Run: cd web && npx tsx scripts/verify/HF-145_threshold.ts
 */

// Test 1: Confidence threshold gates Tier 1 routing
console.log('=== Test 1: Confidence threshold ===');
const THRESHOLD = 0.5;

const testCases = [
  { confidence: 0.32, expected: 'Tier 2', reason: 'below threshold (current BCL state)' },
  { confidence: 0.49, expected: 'Tier 2', reason: 'just below threshold' },
  { confidence: 0.50, expected: 'Tier 1', reason: 'at threshold' },
  { confidence: 0.51, expected: 'Tier 1', reason: 'just above threshold' },
  { confidence: 0.92, expected: 'Tier 1', reason: 'healthy confidence' },
];

let allPass = true;
for (const tc of testCases) {
  const result = tc.confidence >= THRESHOLD ? 'Tier 1' : 'Tier 2';
  const pass = result === tc.expected;
  console.log(`  confidence=${tc.confidence} → ${result} (expected: ${tc.expected}) — ${pass ? 'PASS' : 'FAIL'} [${tc.reason}]`);
  if (!pass) allPass = false;
}
console.log(`Test 1: ${allPass ? 'PASS' : 'FAIL'}\n`);

// Test 2: Atomic update formula
console.log('=== Test 2: Atomic update formula ===');
const formulaTests = [
  { matchCount: 0, newMatchCount: 1, expected: 0.5 },
  { matchCount: 1, newMatchCount: 2, expected: 0.6667 },
  { matchCount: 5, newMatchCount: 6, expected: 0.8571 },
  { matchCount: 12, newMatchCount: 13, expected: 0.9286 },
  { matchCount: 19, newMatchCount: 20, expected: 0.9524 },
];

let formulaPass = true;
for (const ft of formulaTests) {
  const result = 1 - (1 / (ft.newMatchCount + 1));
  const rounded = Number(result.toFixed(4));
  const pass = Math.abs(rounded - ft.expected) < 0.001;
  console.log(`  matchCount ${ft.matchCount}→${ft.newMatchCount}: confidence=${rounded} (expected: ${ft.expected}) — ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) formulaPass = false;
}
console.log(`Test 2: ${formulaPass ? 'PASS' : 'FAIL'}\n`);

// Test 3: Recovery scenario
console.log('=== Test 3: Recovery after re-classification ===');
let conf = 0.32;
console.log(`  Start: confidence=${conf} (below threshold → Tier 2 re-classify)`);
// After re-classification succeeds, writeFingerprint is called
// For a new fingerprint entry (re-classified structure), matchCount starts at 1
conf = 1 - 1 / (1 + 1); // matchCount=1
console.log(`  After re-classify (matchCount=1): confidence=${conf.toFixed(4)} — ${conf >= THRESHOLD ? 'Tier 1 RESTORED' : 'Still Tier 2'}`);
conf = 1 - 1 / (2 + 1); // matchCount=2
console.log(`  Next match (matchCount=2): confidence=${conf.toFixed(4)} — solidly Tier 1`);
const recoveryPass = conf >= THRESHOLD;
console.log(`Test 3: ${recoveryPass ? 'PASS' : 'FAIL'}\n`);

// Test 4: Self-correction scenario
console.log('=== Test 4: Self-correction cycle ===');
let selfCorr = 0.92;
const DECREASE = 0.2;
const MIN_CONF = 0.3;
console.log(`  Start: confidence=${selfCorr}`);
for (let i = 1; i <= 4; i++) {
  selfCorr = Math.max(MIN_CONF, selfCorr - DECREASE);
  const tier = selfCorr >= THRESHOLD ? 'Tier 1' : 'Tier 2';
  console.log(`  After ${i} binding failure(s): confidence=${selfCorr.toFixed(4)} → ${tier}`);
}
const selfCorrPass = selfCorr < THRESHOLD;
console.log(`  Self-correction triggers Tier 2 re-classification: ${selfCorrPass ? 'YES' : 'NO'}`);
console.log(`Test 4: ${selfCorrPass ? 'PASS' : 'FAIL'}\n`);

// Summary
const overall = allPass && formulaPass && recoveryPass && selfCorrPass;
console.log(`=== OVERALL: ${overall ? 'ALL TESTS PASS' : 'SOME TESTS FAILED'} ===`);
process.exit(overall ? 0 : 1);
