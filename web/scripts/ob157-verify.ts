/**
 * OB-157 Phase 4: Vertical Slice Proof
 * Tests entity scope, source date extraction, and component-to-data matching.
 *
 * Proof gates:
 * PG-1: Entity count matches entity sheet only (no inflation from target/transaction)
 * PG-2: No store entities (store IDs not created as entity records)
 * PG-3: Source dates from period markers (Mes/Año), not hire dates
 * PG-4: All source dates in expected period (2024-01-01)
 * PG-5: Entity-data binding (entity_id populated)
 * PG-6: Committed data count matches target rows
 * PG-7: No numeric-as-date misinterpretation (no random dates from financial values)
 * PG-8: Semantic metric matching works (component finds data despite name mismatch)
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const BASE_URL = 'http://localhost:3000';
const EMAIL = 'admin@opticaluminar.mx';
const PASSWORD = 'demo-password-OL1';

async function getAuthCookie(): Promise<string> {
  // Use a separate client for auth to avoid session pollution
  const authSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await authSb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`Auth failed: ${error.message}`);
  const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([^.]+)/)?.[1] || '';
  const sessionJson = JSON.stringify({
    access_token: data.session!.access_token,
    refresh_token: data.session!.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  return `sb-${projectRef}-auth-token=${encodeURIComponent(sessionJson)}`;
}

async function run() {
  console.log('=== OB-157 PHASE 4: VERTICAL SLICE PROOF ===\n');

  const cookie = await getAuthCookie();

  // Step 0: Nuclear clear
  console.log('--- Step 0: Nuclear Clear ---');
  const tables = [
    'calculation_results', 'entity_period_outcomes', 'calculation_batches',
    'rule_set_assignments', 'committed_data', 'import_batches',
    'classification_signals', 'entities', 'periods', 'rule_sets',
  ];
  for (const table of tables) {
    await sb.from(table).delete().eq('tenant_id', T);
    console.log(`  Cleared: ${table}`);
  }

  // Step 1: Generate synthetic XLSX with entity + target sheets
  console.log('\n--- Step 1: Generate + Upload Test File ---');
  const XLSX = await import('xlsx');

  const NUM_EMPLOYEES = 100;
  const NUM_STORES = 20;

  // Entity sheet: employees with store IDs and hire dates
  const entityRows: Record<string, unknown>[] = [];
  for (let i = 1; i <= NUM_EMPLOYEES; i++) {
    entityRows.push({
      num_empleado: `EMP${String(i).padStart(4, '0')}`,
      nombre: `Employee ${i}`,
      puesto: i % 5 === 0 ? 'Gerente' : 'Asesor',
      No_Tienda: `T${String((i % NUM_STORES) + 1).padStart(3, '0')}`,
      fecha_ingreso: '2023-01-15', // Hire date — should NOT be source_date
    });
  }

  // Target sheet: with Mes/Año period markers (the source_date fix target)
  const targetRows: Record<string, unknown>[] = [];
  for (let i = 0; i < 1000; i++) {
    const empIdx = (i % NUM_EMPLOYEES) + 1;
    targetRows.push({
      num_empleado: `EMP${String(empIdx).padStart(4, '0')}`,
      Mes: 1,   // Month = January (should compose with Año for source_date)
      Año: 2024, // Year (should compose with Mes for source_date)
      Meta_Individual: 50000 + Math.floor(Math.random() * 100000),
      Real: 30000 + Math.floor(Math.random() * 120000),
      Cumplimiento: (0.4 + Math.random() * 0.8).toFixed(4),
      Venta_Individual: 20000 + Math.floor(Math.random() * 80000),
    });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entityRows), 'Datos_Colaborador');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(targetRows), 'Base_Venta_Individual');

  const xlsxRaw = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fileBuffer = new Uint8Array(xlsxRaw instanceof ArrayBuffer ? xlsxRaw : xlsxRaw.buffer);
  const storagePath = `${T}/${Date.now()}_OB157_Verify.xlsx`;

  // Upload with fresh client (avoid auth session pollution)
  const storageSb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { error: uploadErr } = await storageSb.storage
    .from('ingestion-raw')
    .upload(storagePath, fileBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      cacheControl: '3600',
      upsert: true,
    });

  if (uploadErr) {
    console.error(`  Upload FAILED: ${uploadErr.message}`);
    process.exit(1);
  }
  console.log(`  Uploaded ${(fileBuffer.length / 1024).toFixed(0)}KB to Storage`);

  // Step 2: Run SCI analysis (sample-based)
  console.log('\n--- Step 2: Run Analysis ---');
  const analysisFiles = [{
    fileName: 'OB157_Verify.xlsx',
    sheets: wb.SheetNames.map(name => {
      const ws = wb.Sheets[name];
      if (!ws) return null;
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      return {
        sheetName: name,
        columns: data.length > 0 ? Object.keys(data[0]) : [],
        rows: data.slice(0, 50),
        totalRowCount: data.length,
      };
    }).filter(Boolean),
  }];

  const analyzeRes = await fetch(`${BASE_URL}/api/import/sci/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ tenantId: T, files: analysisFiles }),
  });

  if (!analyzeRes.ok) {
    console.error(`  Analysis FAILED (${analyzeRes.status}): ${await analyzeRes.text()}`);
    process.exit(1);
  }

  const proposal = await analyzeRes.json();
  console.log(`  ${proposal.contentUnits?.length || 0} content units:`);
  for (const cu of proposal.contentUnits || []) {
    console.log(`    ${cu.tabName}: ${cu.classification} (${cu.fieldBindings?.length || 0} bindings)`);
  }

  // Step 3: Execute via bulk endpoint
  console.log('\n--- Step 3: Execute Bulk ---');
  const contentUnits = (proposal.contentUnits || [])
    .filter((cu: { classification: string }) => cu.classification !== 'plan')
    .map((cu: Record<string, unknown>) => ({
      contentUnitId: cu.contentUnitId,
      confirmedClassification: cu.classification,
      confirmedBindings: cu.fieldBindings || [],
      originalClassification: cu.classification,
      originalConfidence: cu.confidence || 0,
    }));

  const bulkStart = Date.now();
  const bulkRes = await fetch(`${BASE_URL}/api/import/sci/execute-bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      proposalId: proposal.proposalId,
      tenantId: T,
      storagePath,
      contentUnits,
    }),
    signal: AbortSignal.timeout(300000),
  });

  const bulkMs = Date.now() - bulkStart;
  if (!bulkRes.ok) {
    console.error(`  Bulk execute FAILED (${bulkRes.status}): ${(await bulkRes.text()).substring(0, 500)}`);
    process.exit(1);
  }

  const bulkResult = await bulkRes.json();
  console.log(`  Completed in ${(bulkMs / 1000).toFixed(1)}s`);
  for (const r of bulkResult.results || []) {
    console.log(`    ${r.contentUnitId?.split('::')[1] || r.contentUnitId}: ${r.rowsProcessed} rows (${r.success ? 'OK' : r.error})`);
  }

  // Step 4: Verify proof gates
  console.log('\n--- Step 4: Proof Gate Verification ---');
  let passed = 0;
  let failed = 0;

  // PG-1: Entity count — should match entity sheet (NUM_EMPLOYEES), NOT inflated
  const { count: entityCount } = await sb.from('entities')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T);
  const pg1 = entityCount === NUM_EMPLOYEES;
  console.log(`  PG-1: Entity count: ${entityCount} (expected: ${NUM_EMPLOYEES}) — ${pg1 ? 'PASS' : 'FAIL'}`);
  pg1 ? passed++ : failed++;

  // PG-2: No store entities — store IDs (T001-T020) should NOT be entities
  const { data: storeEntities } = await sb.from('entities')
    .select('external_id')
    .eq('tenant_id', T)
    .like('external_id', 'T%');
  const pg2 = !storeEntities || storeEntities.length === 0;
  console.log(`  PG-2: Store entities: ${storeEntities?.length || 0} (expected: 0) — ${pg2 ? 'PASS' : 'FAIL'}`);
  pg2 ? passed++ : failed++;

  // PG-3 & PG-4: Source dates from period markers
  const { data: dateSample } = await sb.from('committed_data')
    .select('source_date')
    .eq('tenant_id', T)
    .not('source_date', 'is', null)
    .limit(100);

  const uniqueDates = new Set((dateSample || []).map(r => r.source_date));
  const pg3 = uniqueDates.has('2024-01-01');
  console.log(`  PG-3: Source date = 2024-01-01: ${pg3 ? 'PASS' : 'FAIL'} (found: ${Array.from(uniqueDates).join(', ')})`);
  pg3 ? passed++ : failed++;

  // All dates should be 2024-01-01 (from Mes=1, Año=2024)
  const pg4 = uniqueDates.size === 1 && uniqueDates.has('2024-01-01');
  console.log(`  PG-4: All dates = 2024-01-01: ${pg4 ? 'PASS' : 'FAIL'} (${uniqueDates.size} unique dates)`);
  pg4 ? passed++ : failed++;

  // PG-5: Entity-data binding
  const { count: boundCount } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .not('entity_id', 'is', null);
  const { count: cdCount } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T);
  const bindPct = cdCount ? ((boundCount || 0) / cdCount * 100) : 0;
  const pg5 = bindPct > 50;
  console.log(`  PG-5: Entity-bound: ${boundCount}/${cdCount} (${bindPct.toFixed(1)}%) — ${pg5 ? 'PASS' : 'FAIL'}`);
  pg5 ? passed++ : failed++;

  // PG-6: Committed data count
  const pg6 = cdCount === 1000;
  console.log(`  PG-6: Committed data: ${cdCount} (expected: 1000 target rows) — ${pg6 ? 'PASS' : 'FAIL'}`);
  pg6 ? passed++ : failed++;

  // PG-7: No numeric-as-date misinterpretation
  // Check that no source_dates correspond to Excel serial date conversions of financial values
  const { count: sdCount } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .not('source_date', 'is', null);
  // With period marker composition, all 1000 target rows should have source_date = 2024-01-01
  // Financial values (50K, 30K, etc.) should NOT produce dates
  const sdPct = cdCount ? ((sdCount || 0) / cdCount * 100) : 0;
  const pg7 = sdPct === 100 && uniqueDates.size === 1;
  console.log(`  PG-7: Source date coverage: ${sdPct.toFixed(0)}%, unique dates: ${uniqueDates.size} — ${pg7 ? 'PASS' : 'FAIL'}`);
  pg7 ? passed++ : failed++;

  // PG-8: Semantic metric matching (requires running calculation)
  // For now, verify that inferSemanticType would match the data
  // The actual calculation proof would require a plan to be imported first
  console.log(`  PG-8: Semantic metric matching — SKIPPED (requires plan import + calculation)`);

  // Summary
  console.log('\n\n=========================================');
  console.log('OB-157 PROOF GATE SUMMARY');
  console.log('=========================================');
  console.log(`PG-1: Entity count = ${NUM_EMPLOYEES} (not inflated): ${pg1 ? 'PASS' : 'FAIL'}`);
  console.log(`PG-2: No store entities: ${pg2 ? 'PASS' : 'FAIL'}`);
  console.log(`PG-3: Source date from period markers: ${pg3 ? 'PASS' : 'FAIL'}`);
  console.log(`PG-4: All dates consistent (2024-01-01): ${pg4 ? 'PASS' : 'FAIL'}`);
  console.log(`PG-5: Entity-data binding > 50%: ${pg5 ? 'PASS' : 'FAIL'}`);
  console.log(`PG-6: Committed data = 1000 rows: ${pg6 ? 'PASS' : 'FAIL'}`);
  console.log(`PG-7: No numeric-as-date misinterpretation: ${pg7 ? 'PASS' : 'FAIL'}`);
  console.log(`PG-8: Semantic metric matching: SKIPPED`);
  console.log(`=========================================`);
  console.log(`PASSED: ${passed}/${passed + failed}  FAILED: ${failed}`);
  console.log(`=========================================`);

  // Cleanup
  await sb.storage.from('ingestion-raw').remove([storagePath]);
  console.log('\nStorage cleanup: removed test file');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
