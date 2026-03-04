/**
 * OB-154 Phase 2: Import data XLSX programmatically
 * Parses XLSX, calls SCI analyze for classification, then SCI execute in chunks.
 * Run from: spm-platform/web
 * Requires: dev server running on localhost:3000
 */
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const OPTICA = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const DATA_FILE = '/Users/AndrewAfrica/Desktop/ViaLuce AI/ENTB TEST/BacktTest_Optometrista_mar2025_Proveedores.xlsx';
const BASE_URL = 'http://localhost:3000';
const EMAIL = 'admin@opticaluminar.mx';
const PASSWORD = 'demo-password-OL1';
const MAX_ROWS_PER_CHUNK = 5000;

async function getAuthCookie(): Promise<string> {
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`Auth failed: ${error.message}`);
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1] || '';
  const sessionJson = JSON.stringify({
    access_token: data.session!.access_token,
    refresh_token: data.session!.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  return `sb-${projectRef}-auth-token=${encodeURIComponent(sessionJson)}`;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 300000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface SheetData {
  sheetName: string;
  columns: string[];
  rows: Record<string, unknown>[];
  totalRowCount: number;
}

function parseXlsx(filePath: string): SheetData[] {
  const wb = XLSX.readFile(filePath);
  const sheets: SheetData[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    sheets.push({
      sheetName: name,
      columns,
      rows,
      totalRowCount: rows.length,
    });
  }

  return sheets;
}

async function run() {
  console.log('=== OB-154 PHASE 2: IMPORT DATA ===\n');

  // Parse XLSX
  console.log('Step 1: Parsing XLSX...');
  const sheets = parseXlsx(DATA_FILE);
  let totalRows = 0;
  for (const s of sheets) {
    console.log(`  ${s.sheetName}: ${s.rows.length} rows, ${s.columns.length} cols`);
    totalRows += s.rows.length;
  }
  console.log(`  Total: ${totalRows} rows across ${sheets.length} sheets`);

  // Auth
  const cookie = await getAuthCookie();
  console.log('\nAuthenticated as', EMAIL);

  // Step 2: SCI Analyze — send sample rows (50 per sheet)
  console.log('\nStep 2: SCI Analyze...');
  const sampleSheets = sheets.map(s => ({
    sheetName: s.sheetName,
    columns: s.columns,
    rows: s.rows.slice(0, 50),
    totalRowCount: s.totalRowCount,
  }));

  const analyzeRes = await fetchWithTimeout(`${BASE_URL}/api/import/sci/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      tenantId: OPTICA,
      files: [{
        fileName: 'BacktTest_Optometrista_mar2025_Proveedores.xlsx',
        sheets: sampleSheets,
      }],
    }),
  });

  if (!analyzeRes.ok) {
    const text = await analyzeRes.text();
    console.error(`Analyze failed (${analyzeRes.status}): ${text.substring(0, 500)}`);
    process.exit(1);
  }

  const proposal = await analyzeRes.json();
  console.log(`Proposal ID: ${proposal.proposalId}`);
  console.log(`Content units: ${proposal.contentUnits?.length}`);

  for (const cu of proposal.contentUnits || []) {
    console.log(`  - ${cu.tabName || cu.contentUnitId}: ${cu.classification} (${(cu.confidence * 100).toFixed(0)}%)`);
    const idBinding = cu.fieldBindings?.find((b: Record<string, unknown>) => b.semanticRole === 'entity_identifier');
    if (idBinding) {
      console.log(`    entity_identifier: ${idBinding.sourceField}`);
    }
  }

  // Step 3: Execute — process each content unit with full data, chunked
  console.log('\nStep 3: SCI Execute (chunked)...');

  // Map sheet data by tab name
  const sheetMap = new Map<string, Record<string, unknown>[]>();
  for (const s of sheets) {
    sheetMap.set(s.sheetName, s.rows);
  }

  for (const cu of proposal.contentUnits || []) {
    const tabName = cu.tabName || '';
    const fullRows = sheetMap.get(tabName) || [];
    console.log(`\n  Processing: ${tabName} (${cu.classification}, ${fullRows.length} rows)`);

    const execUnit = {
      contentUnitId: cu.contentUnitId,
      confirmedClassification: cu.classification,
      confirmedBindings: cu.fieldBindings || [],
      rawData: [] as Record<string, unknown>[],
      claimType: cu.claimType,
      ownedFields: cu.ownedFields,
      sharedFields: cu.sharedFields,
      originalClassification: cu.classification,
      originalConfidence: cu.confidence,
    };

    if (fullRows.length <= MAX_ROWS_PER_CHUNK) {
      // Single chunk
      execUnit.rawData = fullRows;
      const res = await fetchWithTimeout(`${BASE_URL}/api/import/sci/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          proposalId: proposal.proposalId,
          tenantId: OPTICA,
          contentUnits: [execUnit],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`    FAIL (${res.status}): ${text.substring(0, 200)}`);
        continue;
      }

      const result = await res.json();
      const r = result.results?.[0];
      console.log(`    ${r?.success ? 'OK' : 'FAIL'}: ${r?.rowsProcessed} rows (${r?.pipeline})`);
      if (r?.error) console.log(`    Error: ${r.error}`);
    } else {
      // Chunked
      let totalProcessed = 0;
      for (let ci = 0; ci < fullRows.length; ci += MAX_ROWS_PER_CHUNK) {
        const chunk = fullRows.slice(ci, ci + MAX_ROWS_PER_CHUNK);
        const chunkUnit = { ...execUnit, rawData: chunk };
        const chunkNum = Math.floor(ci / MAX_ROWS_PER_CHUNK) + 1;
        const totalChunks = Math.ceil(fullRows.length / MAX_ROWS_PER_CHUNK);

        const res = await fetchWithTimeout(`${BASE_URL}/api/import/sci/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie },
          body: JSON.stringify({
            proposalId: proposal.proposalId,
            tenantId: OPTICA,
            contentUnits: [chunkUnit],
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          console.error(`    Chunk ${chunkNum}/${totalChunks} FAIL (${res.status}): ${text.substring(0, 200)}`);
          break;
        }

        const result = await res.json();
        const r = result.results?.[0];
        totalProcessed += r?.rowsProcessed || 0;

        if (!r?.success) {
          console.error(`    Chunk ${chunkNum}/${totalChunks} FAIL: ${r?.error}`);
          break;
        }

        if (chunkNum % 3 === 0 || chunkNum === totalChunks) {
          console.log(`    Chunk ${chunkNum}/${totalChunks}: ${totalProcessed} rows processed`);
        }
      }
      console.log(`    Total: ${totalProcessed} rows`);
    }
  }

  // Step 4: Verify
  console.log('\n\n--- VERIFICATION ---');
  const BATCH = 200;

  // Entities
  const { count: entityCount } = await sb.from('entities')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA);

  // Distinct external_ids
  const extIds = new Set<string>();
  let offset = 0;
  while (true) {
    const { data } = await sb.from('entities')
      .select('external_id')
      .eq('tenant_id', OPTICA)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const e of data) {
      if (e.external_id) extIds.add(e.external_id);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }

  console.log(`Entities: ${entityCount} (unique external_ids: ${extIds.size})`);
  console.log(`PG-3: Entities ~ 719: ${entityCount !== null && entityCount >= 600 && entityCount <= 800 ? 'PASS' : 'FAIL'} (actual: ${entityCount})`);

  // Committed data
  const { count: cdTotal } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA);
  const { count: cdBound } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA).not('entity_id', 'is', null);
  const { count: cdSourceDate } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA).not('source_date', 'is', null);

  console.log(`Committed data: ${cdTotal} total, ${cdBound} entity-bound, ${cdSourceDate} with source_date`);
  console.log(`PG-4: Committed data ~ 119K: ${cdTotal !== null && cdTotal >= 100000 && cdTotal <= 130000 ? 'PASS' : 'CHECK'} (actual: ${cdTotal})`);
  console.log(`PG-5: Source_date populated: ${cdSourceDate !== null && cdSourceDate > 0 ? 'PASS' : 'FAIL'} (${cdSourceDate} rows)`);

  // Assignments
  const { count: assignCount } = await sb.from('rule_set_assignments')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA);
  console.log(`Assignments: ${assignCount}`);
  console.log(`PG-6: Assignments created: ${assignCount !== null && assignCount > 0 ? 'PASS' : 'FAIL'}`);

  // Entity binding
  console.log(`PG-7: Entity binding: ${cdBound !== null && cdBound > 0 ? 'PASS' : 'FAIL'} (${cdBound} bound)`);

  // Source date range
  const { data: sdRange } = await sb.from('committed_data')
    .select('source_date')
    .eq('tenant_id', OPTICA)
    .not('source_date', 'is', null)
    .order('source_date', { ascending: true })
    .limit(1);
  const { data: sdRangeMax } = await sb.from('committed_data')
    .select('source_date')
    .eq('tenant_id', OPTICA)
    .not('source_date', 'is', null)
    .order('source_date', { ascending: false })
    .limit(1);
  if (sdRange?.length && sdRangeMax?.length) {
    console.log(`Source date range: ${sdRange[0].source_date} to ${sdRangeMax[0].source_date}`);
  }

  // Periods
  const { count: periodCount } = await sb.from('periods')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA);
  console.log(`Periods: ${periodCount}`);

  // Duplicate entities check
  const dupCheck = new Map<string, number>();
  offset = 0;
  while (true) {
    const { data } = await sb.from('entities')
      .select('external_id')
      .eq('tenant_id', OPTICA)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const e of data) {
      const eid = e.external_id || '';
      dupCheck.set(eid, (dupCheck.get(eid) || 0) + 1);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
  const dups = Array.from(dupCheck.entries()).filter(([, count]) => count > 1);
  console.log(`Duplicate external_ids: ${dups.length}`);
  if (dups.length > 0) {
    console.log(`  First 5: ${dups.slice(0, 5).map(([id, c]) => `${id}(×${c})`).join(', ')}`);
  }

  console.log('\n=== Phase 2 Complete ===');
}

run().catch(console.error);
