/**
 * OB-90: Examine GT file structure in detail to find the column metric value
 * Also check ALL committed_data types and the original upload files
 */
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as path from 'path';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PERIOD_ID = '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // Read GT file with ALL headers
  const xlsxPath = path.join(__dirname, 'CLT14B_Reconciliation_Detail.xlsx');
  const workbook = XLSX.readFile(xlsxPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const gtRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  console.log('=== GT File Headers ===');
  const headers = gtRows[0] as string[];
  for (let i = 0; i < headers.length; i++) {
    console.log(`  Col ${i}: "${headers[i]}"`);
  }

  console.log('\n=== First 3 GT rows (all columns) ===');
  for (let i = 1; i <= 3; i++) {
    console.log(`Row ${i}:`);
    for (let j = 0; j < headers.length; j++) {
      console.log(`  ${headers[j]}: ${JSON.stringify(gtRows[i]?.[j])}`);
    }
  }

  // Show store 10 employees from GT
  console.log('\n=== Store 10 employees in GT (all columns) ===');
  for (let i = 1; i < gtRows.length; i++) {
    if (String(gtRows[i]?.[1]) === '10') {
      console.log(`Employee ${gtRows[i]?.[0]}:`);
      for (let j = 0; j < headers.length; j++) {
        console.log(`  ${headers[j]}: ${JSON.stringify(gtRows[i]?.[j])}`);
      }
    }
  }

  // Show store 387 employees from GT
  console.log('\n=== Store 387 employees in GT (all columns) ===');
  for (let i = 1; i < gtRows.length; i++) {
    if (String(gtRows[i]?.[1]) === '387') {
      console.log(`Employee ${gtRows[i]?.[0]}:`);
      for (let j = 0; j < headers.length; j++) {
        console.log(`  ${headers[j]}: ${JSON.stringify(gtRows[i]?.[j])}`);
      }
    }
  }

  // Check ALL data types comprehensively
  console.log('\n\n=== ALL data types in committed_data ===');
  const { data: allTypes, error } = await sb.rpc('get_distinct_data_types', {
    p_tenant_id: TENANT_ID,
    p_period_id: PERIOD_ID,
  }).select('*');

  if (error) {
    // RPC doesn't exist, do manual scan
    console.log('RPC not available, scanning manually...');
    const allDTs = new Set<string>();
    let page = 0;
    let scanned = 0;
    while (scanned < 200000) {
      const { data } = await sb.from('committed_data')
        .select('data_type')
        .eq('tenant_id', TENANT_ID)
        .eq('period_id', PERIOD_ID)
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (!data || data.length === 0) break;
      for (const r of data) allDTs.add(r.data_type);
      scanned += data.length;
      if (data.length < 1000) break;
      page++;
    }
    console.log(`Scanned ${scanned} rows, found ${allDTs.size} data types:`);
    for (const dt of Array.from(allDTs).sort()) {
      // Count this type
      const { count } = await sb.from('committed_data')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', TENANT_ID)
        .eq('period_id', PERIOD_ID)
        .eq('data_type', dt);
      console.log(`  ${dt}: ${count} rows`);
    }
  } else {
    console.log(allTypes);
  }

  // Check data_uploads table for this tenant/period
  console.log('\n\n=== Data uploads ===');
  const { data: uploads } = await sb.from('data_uploads')
    .select('id, filename, status, upload_type, created_at, metadata')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', PERIOD_ID)
    .order('created_at', { ascending: false })
    .limit(20);
  if (uploads) {
    for (const u of uploads) {
      console.log(`  ${u.filename} (${u.upload_type}, ${u.status})`);
      if (u.metadata) {
        const meta = u.metadata as Record<string, unknown>;
        if (meta.sheetNames) console.log(`    Sheets: ${JSON.stringify(meta.sheetNames)}`);
        if (meta.sheet_names) console.log(`    Sheets: ${JSON.stringify(meta.sheet_names)}`);
      }
    }
  }

  // Check if there's an optical-specific upload or data type
  console.log('\n\n=== Search for optical-related data ===');
  const opticalTypes = ['Venta_Optica', 'Base_Venta_Optica', 'Optical_Sales', 'optical', 'optica'];
  for (const dt of opticalTypes) {
    const { count } = await sb.from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', PERIOD_ID)
      .ilike('data_type', `%${dt}%`);
    if (count && count > 0) {
      console.log(`  Found: ${dt} = ${count} rows`);
    }
  }

  // Check the enrichment code: how is optical_sales_amount computed?
  // Look at the "suma nivel tienda" field more carefully
  // For store 10: suma nivel tienda = 145500, individual values are 74500 and 71000
  // suma nivel tienda = META_Individual SUM! Not Venta_Individual SUM
  console.log('\n\n=== Checking "suma nivel tienda" pattern ===');
  console.log('Store 10:');
  console.log('  Employee 1: Meta=74500, Venta=87570');
  console.log('  Employee 2: Meta=71000, Venta=83723');
  console.log('  Sum Meta: 145500');
  console.log('  suma nivel tienda: 145500 ← MATCHES SUM OF META!');
  console.log('  Sum Venta: 171293');
  console.log('  optical_sales_amount: 171293 ← MATCHES SUM OF VENTA');
  console.log('  BUT GT col=0 (<$60K) — neither sum works');

  // What if the column metric is the individual META?
  // Store 10, emp 1: Meta=74500 → band 1 (not 0)
  // Still doesn't work!

  // What if there's a DIFFERENT set of thresholds?
  // GT col=0 for store 10. What threshold set would put 87570 in col 0?
  // If thresholds were: <$100K, $100-150K, etc → store 10 emps at $87K would be col 0
  // But GT rango says "Menos de $60k" — so thresholds ARE <$60K

  // UNLESS: the column metric value for store 10 is actually DIFFERENT from what we think
  // What if Venta_Individual in the ORIGINAL data was different from what's in committed_data?
  // Maybe enrichment CHANGED the values?
}

main().catch(console.error);
