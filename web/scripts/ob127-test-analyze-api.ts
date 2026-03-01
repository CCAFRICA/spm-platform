/**
 * OB-127 Test: SCI Analyze API — 5 test cases
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob127-test-analyze-api.ts
 * Requires: dev server running on localhost:3000
 */
const LAB = "a630404c-0777-4f6d-b760-b8a190ecd63c";

let passed = 0, failed = 0;
function assert(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

async function callAnalyze(body: unknown) {
  const res = await fetch("http://localhost:3000/api/import/sci/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  OB-127: SCI ANALYZE API TESTS                      ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Test 1: DG plan file (2 tabs)
  console.log("=== Test 1: DG plan file (2 tabs) ===");
  const tab1Cols = ['CARIBE FINANCIAL GROUP', 'attainment', '__EMPTY', '__EMPTY_1', 'amount', 'text'];
  const tab1Rows = Array.from({ length: 17 }, (_, i) => ({
    'CARIBE FINANCIAL GROUP': i < 3 ? 'ATTAINMENT TIERS' : null,
    'attainment': i >= 3 ? `${60 + i * 5}%` : null,
    '__EMPTY': i >= 3 ? `${60 + i * 5}%` : null,
    '__EMPTY_1': i >= 3 ? (i * 5000) : null,
    'amount': i >= 3 ? (i * 5000) : null,
    'text': i >= 3 ? `Level ${i}` : 'Header text',
  }));

  const tab2Cols = ['Officer ID', 'Name', 'Target Amount', 'Region'];
  const tab2Rows = Array.from({ length: 12 }, (_, i) => ({
    'Officer ID': 1001 + i,
    'Name': `Person ${i}`,
    'Target Amount': 50000 + i * 5000,
    'Region': ['North', 'South', 'East'][i % 3],
  }));

  const { status: s1, data: d1 } = await callAnalyze({
    tenantId: LAB,
    files: [{
      fileName: 'CFG_Deposit_Growth_Incentive_Q1_2024.xlsx',
      sheets: [
        { sheetName: 'Plan Rules', columns: tab1Cols, rows: tab1Rows, totalRowCount: 17 },
        { sheetName: 'Growth Targets', columns: tab2Cols, rows: tab2Rows, totalRowCount: 12 },
      ],
    }],
  });

  assert('Status 200', s1 === 200, `got ${s1}`);
  assert('2 content units', d1.contentUnits?.length === 2, `got ${d1.contentUnits?.length}`);

  const tab1Unit = d1.contentUnits?.find((u: { tabName: string }) => u.tabName === 'Plan Rules');
  const tab2Unit = d1.contentUnits?.find((u: { tabName: string }) => u.tabName === 'Growth Targets');
  assert('Tab 1 = plan', tab1Unit?.classification === 'plan', `got ${tab1Unit?.classification}`);
  assert('Tab 2 = target', tab2Unit?.classification === 'target', `got ${tab2Unit?.classification}`);
  assert('Has proposalId', typeof d1.proposalId === 'string' && d1.proposalId.length > 0);
  assert('Has processing order', Array.isArray(d1.processingOrder) && d1.processingOrder.length === 2);

  // Test 2: Single CSV transaction file
  console.log("\n=== Test 2: Transaction CSV ===");
  const txCols = ['Transaction ID', 'Date', 'Amount', 'Entity Code', 'Category'];
  const txRows = Array.from({ length: 600 }, (_, i) => ({
    'Transaction ID': 10000 + i,
    'Date': `2024-0${(i % 3) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
    'Amount': (Math.random() * 10000).toFixed(2),
    'Entity Code': 1001 + (i % 25),
    'Category': ['A', 'B', 'C'][i % 3],
  }));

  const { status: s2, data: d2 } = await callAnalyze({
    tenantId: LAB,
    files: [{
      fileName: 'transactions.csv',
      sheets: [{ sheetName: 'Sheet1', columns: txCols, rows: txRows, totalRowCount: 600 }],
    }],
  });

  assert('Transaction classified', d2.contentUnits?.[0]?.classification === 'transaction',
    `got ${d2.contentUnits?.[0]?.classification}`);

  // Test 3: Processing order = plan → target
  console.log("\n=== Test 3: Processing order ===");
  const order = d1.processingOrder || [];
  const planIdx = order.indexOf(tab1Unit?.contentUnitId);
  const targetIdx = order.indexOf(tab2Unit?.contentUnitId);
  assert('Plan before target in processing order', planIdx < targetIdx,
    `plan@${planIdx}, target@${targetIdx}`);

  // Test 4: Low confidence → requiresHumanReview
  console.log("\n=== Test 4: Ambiguous data → human review ===");
  const ambigCols = ['A', 'B', 'C'];
  const ambigRows = Array.from({ length: 5 }, (_, i) => ({
    'A': i, 'B': `val${i}`, 'C': i * 10,
  }));

  const { data: d4 } = await callAnalyze({
    tenantId: LAB,
    files: [{
      fileName: 'ambiguous.csv',
      sheets: [{ sheetName: 'Data', columns: ambigCols, rows: ambigRows, totalRowCount: 5 }],
    }],
  });

  // With minimal signals, some agents should score close
  assert('Has requiresHumanReview field', typeof d4.requiresHumanReview === 'boolean');
  console.log(`  requiresHumanReview: ${d4.requiresHumanReview}, confidence: ${d4.overallConfidence?.toFixed(2)}`);

  // Test 5: Empty file → error
  console.log("\n=== Test 5: Missing data → error ===");
  const { status: s5 } = await callAnalyze({ tenantId: LAB });
  assert('Missing files → 400', s5 === 400, `got ${s5}`);

  // Summary
  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
