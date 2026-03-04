// OB-152 Phase 4: Reference Agent regression test
// Verifies all 5 agents score correctly with synthetic ContentProfile objects

import { scoreContentUnit } from '../src/lib/sci/agents';
import type { ContentProfile } from '../src/lib/sci/sci-types';

function makeProfile(overrides: Partial<ContentProfile> & {
  structure?: Partial<ContentProfile['structure']>;
  patterns?: Partial<ContentProfile['patterns']>;
}): ContentProfile {
  return {
    contentUnitId: 'test::Sheet1::0',
    sourceFile: 'test.xlsx',
    tabName: 'Sheet1',
    tabIndex: 0,
    structure: {
      rowCount: 100,
      columnCount: 5,
      sparsity: 0.05,
      headerQuality: 'clean',
      ...overrides.structure,
    },
    fields: overrides.fields || [
      { fieldName: 'col1', fieldIndex: 0, dataType: 'text', nullRate: 0, distinctCount: 50, distribution: {}, nameSignals: { containsId: false, containsName: false, containsTarget: false, containsDate: false, containsAmount: false, containsRate: false } },
    ],
    patterns: {
      hasEntityIdentifier: false,
      hasDateColumn: false,
      hasCurrencyColumns: 0,
      hasPercentageValues: false,
      hasDescriptiveLabels: false,
      rowCountCategory: 'moderate',
      ...overrides.patterns,
    },
  };
}

let pass = 0;
let fail = 0;

function assert(name: string, condition: boolean, detail: string) {
  if (condition) {
    console.log(`  PASS: ${name} — ${detail}`);
    pass++;
  } else {
    console.log(`  FAIL: ${name} — ${detail}`);
    fail++;
  }
}

// Test 1: Catalog shape → Reference Agent wins
console.log('\nTest 1: Catalog shape (high uniqueness, low rows, no dates, descriptive)');
const catalogProfile = makeProfile({
  structure: { rowCount: 30, columnCount: 4, sparsity: 0.02, headerQuality: 'clean' },
  patterns: {
    hasEntityIdentifier: false,
    hasDateColumn: false,
    hasCurrencyColumns: 0,
    hasPercentageValues: false,
    hasDescriptiveLabels: true,
    rowCountCategory: 'reference',
  },
  fields: [
    { fieldName: 'code', fieldIndex: 0, dataType: 'text', nullRate: 0, distinctCount: 28, distribution: {}, nameSignals: { containsId: true, containsName: false, containsTarget: false, containsDate: false, containsAmount: false, containsRate: false } },
    { fieldName: 'label', fieldIndex: 1, dataType: 'text', nullRate: 0, distinctCount: 28, distribution: {}, nameSignals: { containsId: false, containsName: true, containsTarget: false, containsDate: false, containsAmount: false, containsRate: false } },
    { fieldName: 'category', fieldIndex: 2, dataType: 'text', nullRate: 0, distinctCount: 5, distribution: { categoricalValues: ['A', 'B', 'C', 'D', 'E'] }, nameSignals: { containsId: false, containsName: false, containsTarget: false, containsDate: false, containsAmount: false, containsRate: false } },
  ],
});
const catalogScores = scoreContentUnit(catalogProfile);
assert('Reference wins', catalogScores[0].agent === 'reference', `winner: ${catalogScores[0].agent} (${catalogScores[0].confidence.toFixed(2)})`);

// Test 2: Roster shape → Entity Agent wins
console.log('\nTest 2: Roster shape (entity ID, names, moderate rows)');
const rosterProfile = makeProfile({
  structure: { rowCount: 150, columnCount: 5, sparsity: 0.03, headerQuality: 'clean' },
  patterns: {
    hasEntityIdentifier: true,
    hasDateColumn: false,
    hasCurrencyColumns: 0,
    hasPercentageValues: false,
    hasDescriptiveLabels: true,
    rowCountCategory: 'moderate',
  },
  fields: [
    { fieldName: 'emp_id', fieldIndex: 0, dataType: 'integer', nullRate: 0, distinctCount: 150, distribution: { isSequential: true }, nameSignals: { containsId: true, containsName: false, containsTarget: false, containsDate: false, containsAmount: false, containsRate: false } },
    { fieldName: 'full_name', fieldIndex: 1, dataType: 'text', nullRate: 0, distinctCount: 148, distribution: {}, nameSignals: { containsId: false, containsName: true, containsTarget: false, containsDate: false, containsAmount: false, containsRate: false } },
    { fieldName: 'department', fieldIndex: 2, dataType: 'text', nullRate: 0, distinctCount: 8, distribution: { categoricalValues: ['Sales', 'Ops', 'HR'] }, nameSignals: { containsId: false, containsName: false, containsTarget: false, containsDate: false, containsAmount: false, containsRate: false } },
    { fieldName: 'region', fieldIndex: 3, dataType: 'text', nullRate: 0, distinctCount: 4, distribution: { categoricalValues: ['N', 'S', 'E', 'W'] }, nameSignals: { containsId: false, containsName: false, containsTarget: false, containsDate: false, containsAmount: false, containsRate: false } },
  ],
});
const rosterScores = scoreContentUnit(rosterProfile);
assert('Entity wins', rosterScores[0].agent === 'entity', `winner: ${rosterScores[0].agent} (${rosterScores[0].confidence.toFixed(2)})`);

// Test 3: Transaction shape → Transaction Agent wins
console.log('\nTest 3: Transaction shape (dates, currency, high rows)');
const txnProfile = makeProfile({
  structure: { rowCount: 5000, columnCount: 6, sparsity: 0.01, headerQuality: 'clean' },
  patterns: {
    hasEntityIdentifier: true,
    hasDateColumn: true,
    hasCurrencyColumns: 2,
    hasPercentageValues: false,
    hasDescriptiveLabels: false,
    rowCountCategory: 'transactional',
  },
  fields: [
    { fieldName: 'id', fieldIndex: 0, dataType: 'integer', nullRate: 0, distinctCount: 5000, distribution: {}, nameSignals: { containsId: true, containsName: false, containsTarget: false, containsDate: false, containsAmount: false, containsRate: false } },
    { fieldName: 'txn_date', fieldIndex: 1, dataType: 'date', nullRate: 0, distinctCount: 90, distribution: {}, nameSignals: { containsId: false, containsName: false, containsTarget: false, containsDate: true, containsAmount: false, containsRate: false } },
    { fieldName: 'amount', fieldIndex: 2, dataType: 'currency', nullRate: 0, distinctCount: 3000, distribution: {}, nameSignals: { containsId: false, containsName: false, containsTarget: false, containsDate: false, containsAmount: true, containsRate: false } },
  ],
});
const txnScores = scoreContentUnit(txnProfile);
assert('Transaction wins', txnScores[0].agent === 'transaction', `winner: ${txnScores[0].agent} (${txnScores[0].confidence.toFixed(2)})`);

// Test 4: Plan shape → Plan Agent wins
console.log('\nTest 4: Plan shape (auto headers, sparse, percentages, low rows)');
const planProfile = makeProfile({
  structure: { rowCount: 15, columnCount: 8, sparsity: 0.45, headerQuality: 'auto_generated' },
  patterns: {
    hasEntityIdentifier: false,
    hasDateColumn: false,
    hasCurrencyColumns: 0,
    hasPercentageValues: true,
    hasDescriptiveLabels: true,
    rowCountCategory: 'reference',
  },
});
const planScores = scoreContentUnit(planProfile);
assert('Plan wins', planScores[0].agent === 'plan', `winner: ${planScores[0].agent} (${planScores[0].confidence.toFixed(2)})`);

// Test 5: Target shape → Target Agent wins
console.log('\nTest 5: Target shape (entity ID, target field, reference rows, currency)');
const targetProfile = makeProfile({
  structure: { rowCount: 40, columnCount: 4, sparsity: 0.02, headerQuality: 'clean' },
  patterns: {
    hasEntityIdentifier: true,
    hasDateColumn: false,
    hasCurrencyColumns: 1,
    hasPercentageValues: false,
    hasDescriptiveLabels: false,
    rowCountCategory: 'reference',
  },
  fields: [
    { fieldName: 'emp_id', fieldIndex: 0, dataType: 'integer', nullRate: 0, distinctCount: 40, distribution: {}, nameSignals: { containsId: true, containsName: false, containsTarget: false, containsDate: false, containsAmount: false, containsRate: false } },
    { fieldName: 'target_value', fieldIndex: 1, dataType: 'currency', nullRate: 0, distinctCount: 15, distribution: {}, nameSignals: { containsId: false, containsName: false, containsTarget: true, containsDate: false, containsAmount: false, containsRate: false } },
  ],
});
const targetScores = scoreContentUnit(targetProfile);
assert('Target wins', targetScores[0].agent === 'target', `winner: ${targetScores[0].agent} (${targetScores[0].confidence.toFixed(2)})`);

// Summary
console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
