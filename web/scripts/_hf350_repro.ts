/**
 * HF-350 — evidence gate. Reproduce the 87-column header-comprehension crash
 * against the REAL LLM (maxTokens overflow → truncated/malformed JSON), then
 * confirm a 25-column batch succeeds. Establishes the batch-size sweet spot.
 * Run: cd web && npx tsx scripts/_hf350_repro.ts
 */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { getAIService } from '@/lib/ai/ai-service';

// synthetic ERP-style columns (JDE/SAP shape): names + a sample row. No real tenant.
function makeColumns(n: number): string[] {
  const stems = ['EmpID', 'EmpName', 'CostCenter', 'GLAccount', 'Region', 'Branch', 'SalesAmt', 'Units', 'Margin', 'Quota',
    'Attainment', 'BonusRate', 'Commission', 'Currency', 'PostDate', 'EffDate', 'Status', 'Tier', 'Product', 'Channel'];
  const cols: string[] = [];
  for (let i = 0; i < n; i++) cols.push(`${stems[i % stems.length]}_${String(i).padStart(2, '0')}`);
  return cols;
}
function sampleRow(cols: string[]): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const c of cols) r[c] = /Amt|Margin|Commission|Quota|Units|Rate|Attainment/.test(c) ? 12345.67 : /Date/.test(c) ? '2025-06-15' : `${c}-val`;
  return r;
}
function buildDesc(sheetName: string, cols: string[]): string {
  const row = sampleRow(cols);
  const vals = cols.map(c => `${c}: ${JSON.stringify(row[c])}`).join(', ');
  return `Sheet "${sheetName}" (1000 rows, ${cols.length} columns):\n  Columns: ${cols.join(', ')}\n  Sample data:\n  Row 1: { ${vals} }`;
}

async function callHC(label: string, cols: string[]) {
  const t = Date.now();
  const sheetsDescription = buildDesc('ERP_Export', cols);
  try {
    const resp = await getAIService().execute({
      task: 'header_comprehension',
      input: { sheetsDescription },
      options: { maxTokens: 8192, responseFormat: 'json' },
    }, false);
    const dur = Date.now() - t;
    const r = resp.result as Record<string, unknown>;
    const parseFailed = !!r.parseError;
    const sheets = (r.sheets as Record<string, { columns?: Record<string, unknown> }> | undefined);
    const got = sheets?.['ERP_Export']?.columns ? Object.keys(sheets['ERP_Export'].columns!).length : 0;
    console.log(`${label}: cols=${cols.length} duration=${dur}ms parse_failed=${parseFailed} columns_returned=${got} ${parseFailed ? '✗ CRASH' : got === cols.length ? '✓ ALL comprehended' : `⚠ partial (${got}/${cols.length})`}`);
  } catch (e) {
    console.log(`${label}: cols=${cols.length} duration=${Date.now() - t}ms THREW ${e instanceof Error ? e.message : String(e)}`);
  }
}

(async () => {
  console.log('=== HF-350 reproduction: single-call header comprehension at scale ===');
  await callHC('25-col batch', makeColumns(25));
  await callHC('87-col single (production crash shape)', makeColumns(87));
})().catch(e => { console.error(e); process.exit(1); });
