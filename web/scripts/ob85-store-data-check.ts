/**
 * Quick check: What fields are in store-level data (Base_Venta_Tienda)?
 * + What variant should entity 93515855 use?
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

async function check() {
  // Get Jan 2024 period
  const { data: periods } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', TENANT)
    .gte('start_date', '2024-01-01')
    .lt('start_date', '2024-02-01');
  const periodId = periods?.[0]?.id;

  // Get store data (entity_id IS NULL)
  console.log('=== STORE-LEVEL DATA (entity_id=NULL) ===\n');
  const { data: storeRows } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .is('entity_id', null)
    .limit(5);

  console.log(`Total store rows fetched: ${storeRows?.length}`);
  for (const r of storeRows ?? []) {
    console.log(`\nSheet: ${r.data_type}`);
    console.log(`Fields: ${Object.keys(r.row_data as Record<string, unknown>).join(', ')}`);
    console.log(`Full row_data: ${JSON.stringify(r.row_data, null, 2)}`);
  }

  // Check how many store rows have store 388
  const { data: allStoreRows } = await supabase
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .is('entity_id', null);

  console.log(`\nTotal store rows (all): ${allStoreRows?.length}`);

  // Group by data_type
  const byType = new Map<string, number>();
  for (const r of allStoreRows ?? []) {
    byType.set(r.data_type, (byType.get(r.data_type) ?? 0) + 1);
  }
  for (const [type, count] of Array.from(byType.entries())) {
    console.log(`  ${type}: ${count} rows`);
  }

  // Find store 388 data
  const store388 = (allStoreRows ?? []).filter(r => {
    const rd = r.row_data as Record<string, unknown>;
    const sk = rd?.['storeId'] ?? rd?.['num_tienda'] ?? rd?.['No_Tienda'] ?? rd?.['Tienda'];
    return String(sk) === '388';
  });
  console.log(`\nStore 388 rows: ${store388.length}`);
  for (const r of store388) {
    console.log(`  Sheet: ${r.data_type}`);
    console.log(`  row_data: ${JSON.stringify(r.row_data, null, 2)}`);
  }

  // Check variant selection: what roles do entities have?
  console.log('\n=== ROLE DISTRIBUTION ===\n');
  const { data: rosterRows } = await supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .eq('data_type', 'Datos Colaborador')
    .limit(1000);

  const roleCounts = new Map<string, number>();
  for (const r of rosterRows ?? []) {
    const rd = r.row_data as Record<string, unknown>;
    const role = String(rd?.['role'] ?? rd?.['Puesto'] ?? 'unknown');
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }
  for (const [role, count] of Array.from(roleCounts.entries())) {
    console.log(`  ${role}: ${count}`);
  }

  // Manual calculation for entity 93515855 using NON-CERTIFIED variant
  console.log('\n=== MANUAL CALCULATION: Entity 93515855 ===\n');
  console.log('Role: OPTOMETRISTA NO CERTIFICADO → variant: non_certified');
  console.log('attainment = 116.5% (row: "100% a menos de 150%", index 3)');
  console.log('store_optical_sales = ? (need store 388 data)');

  if (store388.length > 0) {
    const rd = store388[0].row_data as Record<string, unknown>;
    const storeAmount = rd['amount'] ?? rd['Venta_Optica'] ?? rd['Venta'];
    console.log(`store amount (from Base_Venta_Tienda): ${storeAmount}`);
    console.log(`column band: ${Number(storeAmount) >= 180000 ? '$180K o mas (index 4)' : 'check manually'}`);
    console.log(`Non-certified matrix[3][4] = 1250 (vs certified matrix[3][4] = 2500)`);
  }

  // What should insurance/warranty be for entity 93515855?
  console.log('\nInsurance data (Base_Club_Proteccion) for 93515855:');
  const { data: insuranceRows } = await supabase
    .from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .eq('data_type', 'Base_Club_Proteccion')
    .limit(5);

  const entityInsurance = (insuranceRows ?? []).filter(r => {
    const rd = r.row_data as Record<string, unknown>;
    return String(rd?.entityId ?? rd?.num_empleado) === '93515855';
  });
  console.log(`  Found: ${entityInsurance.length} rows`);
  for (const r of entityInsurance) {
    console.log(`  row_data: ${JSON.stringify(r.row_data)}`);
  }

  console.log('\nWarranty data (Base_Garantia_Extendida) for 93515855:');
  const { data: warrantyRows } = await supabase
    .from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .eq('data_type', 'Base_Garantia_Extendida')
    .limit(5);

  const entityWarranty = (warrantyRows ?? []).filter(r => {
    const rd = r.row_data as Record<string, unknown>;
    return String(rd?.entityId ?? rd?.num_empleado) === '93515855';
  });
  console.log(`  Found: ${entityWarranty.length} rows`);
  for (const r of entityWarranty) {
    console.log(`  row_data: ${JSON.stringify(r.row_data)}`);
  }

  // Count how many entities have insurance/warranty data
  console.log('\n=== COVERAGE: Insurance + Warranty ===');
  const { count: insuranceCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .eq('data_type', 'Base_Club_Proteccion');
  const { count: warrantyCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .eq('data_type', 'Base_Garantia_Extendida');
  console.log(`  Base_Club_Proteccion rows: ${insuranceCount}`);
  console.log(`  Base_Garantia_Extendida rows: ${warrantyCount}`);

  // Check all sheet types
  console.log('\n=== ALL SHEET TYPES (data_type) ===');
  const { data: allData } = await supabase
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!);

  const sheetCounts = new Map<string, number>();
  for (const r of allData ?? []) {
    sheetCounts.set(r.data_type, (sheetCounts.get(r.data_type) ?? 0) + 1);
  }
  for (const [type, count] of Array.from(sheetCounts.entries())) {
    console.log(`  ${type}: ${count}`);
  }
}

check().catch(console.error);
