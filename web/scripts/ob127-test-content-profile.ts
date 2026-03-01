/**
 * OB-127 Test: Content Profile Generator — 6 test cases
 * Usage: cd web && npx tsx scripts/ob127-test-content-profile.ts
 */
import { generateContentProfile } from '../src/lib/sci/content-profile';

let passed = 0, failed = 0;
function assert(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

// Test 1: Clean tabular data
console.log('\n=== Test 1: Clean tabular data ===');
const cleanCols = ['Officer ID', 'Name', 'Target Amount', 'Region', 'Status'];
const cleanRows = Array.from({ length: 12 }, (_, i) => ({
  'Officer ID': 1001 + i,
  'Name': `Person ${i}`,
  'Target Amount': 50000 + i * 1000,
  'Region': i % 3 === 0 ? 'North' : i % 3 === 1 ? 'South' : 'East',
  'Status': i % 2 === 0 ? 'Active' : 'Pending',
}));
const p1 = generateContentProfile('Growth Targets', 1, 'test.xlsx', cleanCols, cleanRows);
assert('headerQuality = clean', p1.structure.headerQuality === 'clean');
assert('rowCount = 12', p1.structure.rowCount === 12);
assert('columnCount = 5', p1.structure.columnCount === 5);
assert('hasEntityIdentifier', p1.patterns.hasEntityIdentifier === true);
assert('hasCurrencyColumns > 0', p1.patterns.hasCurrencyColumns > 0);
assert('rowCountCategory = reference', p1.patterns.rowCountCategory === 'reference');
assert('field[0] type = integer', p1.fields[0].dataType === 'integer');
assert('field[1] type = text', p1.fields[1].dataType === 'text', `got ${p1.fields[1].dataType} for "${p1.fields[1].fieldName}"`);

// Test 2: Plan rules data (__EMPTY columns, sparse)
console.log('\n=== Test 2: Plan rules (__EMPTY headers, sparse) ===');
const planCols = ['CARIBE FINANCIAL GROUP', 'attainment', '__EMPTY', '__EMPTY_1', '__EMPTY_2', 'amount', 'text'];
const planRows = Array.from({ length: 17 }, (_, i) => ({
  'CARIBE FINANCIAL GROUP': i < 3 ? 'ATTAINMENT TIERS' : null,
  'attainment': i >= 3 ? `${60 + i * 5}%` : null,
  '__EMPTY': i >= 3 ? `${60 + i * 5}%` : null,
  '__EMPTY_1': i >= 3 ? (i * 5000) : null,
  '__EMPTY_2': i >= 3 ? 'Description text' : null,
  'amount': i >= 3 ? (i * 5000) : null,
  'text': i >= 3 ? `Level ${i}` : 'No value',
}));
const p2 = generateContentProfile('Plan Rules', 0, 'plan.xlsx', planCols, planRows);
assert('headerQuality = auto_generated', p2.structure.headerQuality === 'auto_generated');
assert('sparsity > 0.2', p2.structure.sparsity > 0.2, `got ${p2.structure.sparsity.toFixed(2)}`);
assert('hasDescriptiveLabels', p2.patterns.hasDescriptiveLabels === true);
assert('rowCountCategory = reference', p2.patterns.rowCountCategory === 'reference');

// Test 3: Transaction data (dates, amounts, high row count)
console.log('\n=== Test 3: Transaction data (dates, amounts, 600 rows) ===');
const txCols = ['Transaction ID', 'Date', 'Amount', 'Entity Code', 'Category'];
const txRows = Array.from({ length: 600 }, (_, i) => ({
  'Transaction ID': 10000 + i,
  'Date': `2024-0${(i % 3) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
  'Amount': (Math.random() * 10000).toFixed(2),
  'Entity Code': 1001 + (i % 25),
  'Category': ['A', 'B', 'C'][i % 3],
}));
const p3 = generateContentProfile('Transactions', 0, 'tx.csv', txCols, txRows);
assert('hasDateColumn', p3.patterns.hasDateColumn === true);
assert('rowCountCategory = transactional', p3.patterns.rowCountCategory === 'transactional');
assert('hasCurrencyColumns > 0', p3.patterns.hasCurrencyColumns > 0);
assert('hasEntityIdentifier', p3.patterns.hasEntityIdentifier === true);

// Test 4: Korean column headers
console.log('\n=== Test 4: Korean column headers ===');
const krCols = ['직원번호', '이름', '목표금액', '날짜', '비율'];
const krRows = Array.from({ length: 5 }, (_, i) => ({
  '직원번호': 100 + i,
  '이름': `사원${i}`,
  '목표금액': 50000 + i * 10000,
  '날짜': `2024-01-0${i + 1}`,
  '비율': (0.5 + i * 0.1).toFixed(2),
}));
const p4 = generateContentProfile('Sheet1', 0, 'kr.xlsx', krCols, krRows);
assert('containsId (번호)', p4.fields[0].nameSignals.containsId === true);
assert('containsName (이름)', p4.fields[1].nameSignals.containsName === true);
assert('containsTarget (목표)', p4.fields[2].nameSignals.containsTarget === true);
assert('containsDate (날짜)', p4.fields[3].nameSignals.containsDate === true);
assert('containsRate (비율)', p4.fields[4].nameSignals.containsRate === true);

// Test 5: Empty/null handling
console.log('\n=== Test 5: Sparsity calculation ===');
const sparseCols = ['A', 'B', 'C'];
const sparseRows = [
  { A: 1, B: null, C: null },
  { A: null, B: 2, C: null },
  { A: null, B: null, C: 3 },
  { A: null, B: null, C: null },
];
const p5 = generateContentProfile('Sparse', 0, 'sparse.csv', sparseCols, sparseRows);
assert('sparsity = 0.75', Math.abs(p5.structure.sparsity - 0.75) < 0.01, `got ${p5.structure.sparsity}`);

// Test 6: Currency vs decimal
console.log('\n=== Test 6: Currency vs decimal detection ===');
const curCols = ['ID', 'Balance Amount', 'Small Decimal'];
const curRows = Array.from({ length: 20 }, (_, i) => ({
  'ID': i + 1,
  'Balance Amount': (10000 + i * 500.50).toFixed(2),
  'Small Decimal': (0.1 + i * 0.01).toFixed(4),
}));
const p6 = generateContentProfile('Balances', 0, 'cur.csv', curCols, curRows);
const balanceField = p6.fields.find(f => f.fieldName === 'Balance Amount');
const smallField = p6.fields.find(f => f.fieldName === 'Small Decimal');
assert('Balance Amount = currency', balanceField?.dataType === 'currency', `got ${balanceField?.dataType}`);
assert('Small Decimal != currency', smallField?.dataType !== 'currency', `got ${smallField?.dataType}`);

// Summary
console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
