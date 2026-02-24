/**
 * OB-88 Mission 2 FIX: Re-import data with corrected field mappings
 *
 * Fixes:
 * 1. Store-level sheets (Base_Venta_Tienda, Base_Clientes_Nuevos, Base_Cobranza)
 *    should have entity_id = NULL (store data), not mapped to entity UUIDs
 * 2. Parse Fecha Corte / FechaCorte Excel serial dates for period resolution
 * 3. Only employee-level sheets map to entity_ids
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as XLSX from 'xlsx';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PROFILE_ID = '824dfd85-de72-469c-aebc-4fe069481573';
const RULE_SET_ID = '180d1ecb-56c3-410d-87ba-892150010505';
const DATA_FILE = '/Users/AndrewAfrica/Desktop/ViaLuce AI/ENTB TEST/BacktTest_Optometrista_mar2025_Proveedores.xlsx';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Sheet classification: which sheets are employee-level vs store-level
const EMPLOYEE_SHEETS = ['Datos Colaborador', 'Base_Venta_Individual', 'Base_Club_Proteccion', 'Base_Garantia_Extendida'];
const STORE_SHEETS = ['Base_Venta_Tienda', 'Base_Clientes_Nuevos', 'Base_Cobranza'];

// Entity ID columns per sheet type
const EMPLOYEE_ID_COLS: Record<string, string> = {
  'Datos Colaborador': 'num_empleado',
  'Base_Venta_Individual': 'num_empleado',
  'Base_Club_Proteccion': 'num_empleado',
  'Base_Garantia_Extendida': 'Vendedor',
};

// Store ID columns for store-level sheets
const STORE_ID_COLS: Record<string, string> = {
  'Base_Venta_Tienda': 'Tienda',
  'Base_Clientes_Nuevos': 'No_Tienda',
  'Base_Cobranza': 'No_Tienda',
};

// Date columns for period resolution (Excel serial dates)
const DATE_COLS: Record<string, string> = {
  'Base_Venta_Tienda': 'Fecha Corte',
  'Base_Clientes_Nuevos': 'Fecha Corte',
  'Base_Cobranza': 'Fecha Corte',
  'Base_Garantia_Extendida': 'FechaCorte',
  'Datos Colaborador': 'Fecha Corte',
};

// Year/Month columns
const YEAR_COLS: Record<string, string> = {
  'Datos Colaborador': 'Año',
  'Base_Venta_Individual': 'Año',
  'Base_Club_Proteccion': 'Año',
};
const MONTH_COLS: Record<string, string> = {
  'Datos Colaborador': 'Mes',
  'Base_Venta_Individual': 'Mes',
  'Base_Club_Proteccion': 'Mes',
};

interface SheetData {
  sheetName: string;
  rows: Record<string, unknown>[];
  headers: string[];
  isStoreLevel: boolean;
}

// Parse Excel serial date to year/month
function excelDateToYearMonth(serial: number): { year: number; month: number } | null {
  if (typeof serial !== 'number' || serial < 25000 || serial > 100000) return null;
  const d = new Date((serial - 25569) * 86400 * 1000);
  if (isNaN(d.getTime())) return null;
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function resolvePeriodFromRow(row: Record<string, unknown>, sheetName: string): { year: number; month: number } | null {
  // Strategy 1: Explicit year/month columns
  const yearCol = YEAR_COLS[sheetName];
  const monthCol = MONTH_COLS[sheetName];
  if (yearCol && monthCol) {
    const yearVal = row[yearCol];
    const monthVal = row[monthCol];
    if (yearVal != null && monthVal != null) {
      const year = typeof yearVal === 'number' ? yearVal : parseInt(String(yearVal), 10);
      const month = typeof monthVal === 'number' ? monthVal : parseInt(String(monthVal), 10);
      if (year >= 2020 && year <= 2030 && month >= 1 && month <= 12) {
        return { year, month };
      }
    }
  }

  // Strategy 2: Date column (Excel serial date)
  const dateCol = DATE_COLS[sheetName];
  if (dateCol) {
    const dateVal = row[dateCol];
    if (typeof dateVal === 'number') {
      return excelDateToYearMonth(dateVal);
    }
  }

  return null;
}

async function main() {
  const startTime = Date.now();
  console.log('=== OB-88 Mission 2 FIX: Re-import with corrected mappings ===\n');

  // Step 0: Clean existing data
  console.log('Step 0: Cleaning existing data...');

  // Delete committed_data
  let deleted = 0;
  while (true) {
    const { data: batch } = await sb
      .from('committed_data')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .limit(5000);
    if (!batch || batch.length === 0) break;
    const ids = batch.map(r => r.id);
    await sb.from('committed_data').delete().in('id', ids);
    deleted += ids.length;
    process.stdout.write(`\r  committed_data deleted: ${deleted}`);
  }
  console.log(`\n  committed_data deleted: ${deleted}`);

  // Delete rule_set_assignments
  const { error: raErr } = await sb
    .from('rule_set_assignments')
    .delete()
    .eq('tenant_id', TENANT_ID);
  console.log(`  rule_set_assignments cleared${raErr ? ': ' + raErr.message : ''}`);

  // Delete entities
  let entDeleted = 0;
  while (true) {
    const { data: batch } = await sb
      .from('entities')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .limit(5000);
    if (!batch || batch.length === 0) break;
    const ids = batch.map(r => r.id);
    await sb.from('entities').delete().in('id', ids);
    entDeleted += ids.length;
    process.stdout.write(`\r  entities deleted: ${entDeleted}`);
  }
  console.log(`\n  entities deleted: ${entDeleted}`);

  // Delete periods
  const { error: pErr } = await sb.from('periods').delete().eq('tenant_id', TENANT_ID);
  console.log(`  periods cleared${pErr ? ': ' + pErr.message : ''}`);

  // Delete import batches
  const { error: ibErr } = await sb.from('import_batches').delete().eq('tenant_id', TENANT_ID);
  console.log(`  import_batches cleared${ibErr ? ': ' + ibErr.message : ''}`);

  // Delete calculation batches and results
  const { data: calcBatches } = await sb.from('calculation_batches').select('id').eq('tenant_id', TENANT_ID);
  if (calcBatches && calcBatches.length > 0) {
    for (const cb of calcBatches) {
      await sb.from('calculation_results').delete().eq('batch_id', cb.id);
    }
    await sb.from('calculation_batches').delete().eq('tenant_id', TENANT_ID);
    console.log(`  calculation data cleared (${calcBatches.length} batches)`);
  }

  // Step 1: Parse Excel
  console.log('\nStep 1: Parsing Excel file...');
  const buffer = fs.readFileSync(DATA_FILE);
  const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellNF: false, cellStyles: false });

  const sheets: SheetData[] = [];
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null, raw: true });
    if (rows.length === 0) continue;
    const headers = Object.keys(rows[0]);
    const isStoreLevel = STORE_SHEETS.includes(sheetName);
    sheets.push({ sheetName, rows, headers, isStoreLevel });
    console.log(`  "${sheetName}": ${rows.length} rows (${isStoreLevel ? 'STORE' : 'EMPLOYEE'}-level)`);
  }

  // Step 2: Period creation
  console.log('\nStep 2: Period creation...');
  const uniquePeriods = new Map<string, { year: number; month: number }>();

  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      const period = resolvePeriodFromRow(row, sheet.sheetName);
      if (period) {
        const key = `${period.year}-${String(period.month).padStart(2, '0')}`;
        if (!uniquePeriods.has(key)) uniquePeriods.set(key, period);
      }
    }
  }

  console.log(`  Periods found: ${Array.from(uniquePeriods.keys()).join(', ')}`);

  const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const periodKeyMap = new Map<string, string>();
  const newPeriods = Array.from(uniquePeriods.entries()).map(([key, { year, month }]) => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return {
      tenant_id: TENANT_ID,
      canonical_key: key,
      label: `${MONTH_NAMES[month]} ${year}`,
      period_type: 'monthly' as const,
      start_date: startDate,
      end_date: endDate,
      status: 'open' as const,
      metadata: { year, month },
    };
  });

  if (newPeriods.length > 0) {
    const { data: inserted, error: pInsErr } = await sb
      .from('periods')
      .insert(newPeriods)
      .select('id, canonical_key');
    if (pInsErr) throw new Error(`Period creation failed: ${pInsErr.message}`);
    if (inserted) {
      for (const p of inserted) {
        if (p.canonical_key) periodKeyMap.set(p.canonical_key, p.id);
      }
    }
    console.log(`  Created ${newPeriods.length} periods`);
  }
  console.log(`  Period map: ${Array.from(periodKeyMap.entries()).map(([k, v]) => `${k}=${v.substring(0, 8)}`).join(', ')}`);

  // Step 3: Entity resolution (ONLY from employee-level sheets)
  console.log('\nStep 3: Entity resolution (employee-level only)...');
  const externalIds = new Set<string>();

  for (const sheet of sheets) {
    if (sheet.isStoreLevel) continue; // Skip store-level sheets
    const entityCol = EMPLOYEE_ID_COLS[sheet.sheetName];
    if (!entityCol) continue;

    for (const row of sheet.rows) {
      const val = row[entityCol];
      if (val != null && String(val).trim()) {
        externalIds.add(String(val).trim());
      }
    }
  }

  console.log(`  Unique employee IDs: ${externalIds.size}`);

  const entityIdMap = new Map<string, string>();
  const allExternalIds = Array.from(externalIds);

  // Create entities
  const newEntities = allExternalIds.map(eid => ({
    tenant_id: TENANT_ID,
    external_id: eid,
    display_name: eid,
    entity_type: 'individual' as const,
    status: 'active' as const,
    temporal_attributes: [] as unknown[],
    metadata: {},
  }));

  const INSERT_BATCH = 5000;
  for (let i = 0; i < newEntities.length; i += INSERT_BATCH) {
    const slice = newEntities.slice(i, i + INSERT_BATCH);
    const { data: inserted, error: entErr } = await sb
      .from('entities')
      .insert(slice)
      .select('id, external_id');
    if (entErr) throw new Error(`Entity creation failed: ${entErr.message}`);
    if (inserted) {
      for (const e of inserted) {
        if (e.external_id) entityIdMap.set(e.external_id, e.id);
      }
    }
  }
  console.log(`  Created ${entityIdMap.size} employee entities`);

  // Step 4: Create import batch
  console.log('\nStep 4: Creating import batch...');
  const { data: batch, error: batchErr } = await sb
    .from('import_batches')
    .insert({
      tenant_id: TENANT_ID,
      file_name: 'BacktTest_Optometrista_mar2025_Proveedores.xlsx',
      file_type: 'xlsx',
      uploaded_by: PROFILE_ID,
      status: 'processing',
      row_count: 0,
      metadata: { source: 'ob88-mission2-reimport' },
    })
    .select('id')
    .single();

  if (batchErr || !batch) throw new Error(`Batch creation failed: ${batchErr?.message}`);
  const batchId = batch.id;
  console.log(`  Batch ID: ${batchId}`);

  // Step 5: Insert committed_data
  console.log('\nStep 5: Inserting committed_data...');
  let totalRecords = 0;

  for (const sheet of sheets) {
    const entityCol = EMPLOYEE_ID_COLS[sheet.sheetName];
    const storeCol = STORE_ID_COLS[sheet.sheetName];

    const insertRows = sheet.rows.map((row, i) => {
      // Build mapped row_data
      const mapped: Record<string, unknown> = { ...row };

      // Add semantic keys
      if (entityCol && row[entityCol] != null) {
        mapped['entityid'] = row[entityCol];
        mapped['entityId'] = row[entityCol];
      }
      if (storeCol && row[storeCol] != null) {
        mapped['storeId'] = row[storeCol];
        mapped['store_id'] = row[storeCol];
      }

      // Add period info
      const period = resolvePeriodFromRow(row, sheet.sheetName);
      if (period) {
        mapped['year'] = period.year;
        mapped['month'] = period.month;
      }

      // Resolve entity_id (ONLY for employee-level sheets)
      let entityId: string | null = null;
      if (!sheet.isStoreLevel && entityCol && row[entityCol] != null) {
        entityId = entityIdMap.get(String(row[entityCol]).trim()) || null;
      }
      // Store-level sheets: entity_id stays NULL

      // Resolve period_id
      let periodId: string | null = null;
      if (period) {
        const key = `${period.year}-${String(period.month).padStart(2, '0')}`;
        periodId = periodKeyMap.get(key) || null;
      }

      mapped['_sheetName'] = sheet.sheetName;
      mapped['_rowIndex'] = i;

      return {
        tenant_id: TENANT_ID,
        import_batch_id: batchId,
        entity_id: entityId,
        period_id: periodId,
        data_type: sheet.sheetName,
        row_data: mapped,
        metadata: { source_sheet: sheet.sheetName },
      };
    });

    const CHUNK = 5000;
    for (let i = 0; i < insertRows.length; i += CHUNK) {
      const slice = insertRows.slice(i, i + CHUNK);
      const { error: insertErr } = await sb.from('committed_data').insert(slice);
      if (insertErr) throw new Error(`Insert failed (${sheet.sheetName}): ${insertErr.message}`);
      totalRecords += slice.length;
    }

    // Count per-period distribution
    const periodDist = new Map<string, number>();
    for (const row of sheet.rows) {
      const period = resolvePeriodFromRow(row, sheet.sheetName);
      const key = period ? `${period.year}-${String(period.month).padStart(2, '0')}` : 'NONE';
      periodDist.set(key, (periodDist.get(key) || 0) + 1);
    }

    console.log(`  "${sheet.sheetName}": ${insertRows.length} rows (${sheet.isStoreLevel ? 'store' : 'entity'})`);
    for (const [k, v] of Array.from(periodDist.entries()).sort()) {
      console.log(`    ${k}: ${v} rows`);
    }
  }

  console.log(`  Total: ${totalRecords}`);

  // Step 6: Rule set assignments (employee entities only)
  console.log('\nStep 6: Rule set assignments...');
  const entityUuids = Array.from(new Set(Array.from(entityIdMap.values())));

  const ASSIGN_BATCH = 5000;
  const assignments = entityUuids.map(entityId => ({
    tenant_id: TENANT_ID,
    entity_id: entityId,
    rule_set_id: RULE_SET_ID,
    effective_from: new Date().toISOString().split('T')[0],
  }));

  for (let i = 0; i < assignments.length; i += ASSIGN_BATCH) {
    const slice = assignments.slice(i, i + ASSIGN_BATCH);
    const { error: assignErr } = await sb.from('rule_set_assignments').insert(slice);
    if (assignErr) console.error('  Assignment error:', assignErr);
  }
  console.log(`  Created ${assignments.length} assignments`);

  // Step 7: Update batch
  await sb.from('import_batches').update({
    status: 'completed',
    row_count: totalRecords,
    completed_at: new Date().toISOString(),
  }).eq('id', batchId);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // VERIFICATION
  console.log('\n=== VERIFICATION ===');
  const { count: entityCount } = await sb.from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`  Entities: ${entityCount}`);

  const jan2024PeriodId = periodKeyMap.get('2024-01');
  if (jan2024PeriodId) {
    const { count: janWithEntity } = await sb.from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', jan2024PeriodId)
      .not('entity_id', 'is', null);

    const { count: janWithoutEntity } = await sb.from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', jan2024PeriodId)
      .is('entity_id', null);

    console.log(`  Jan 2024 rows with entity_id: ${janWithEntity}`);
    console.log(`  Jan 2024 rows WITHOUT entity_id (store-level): ${janWithoutEntity}`);
  }

  const { data: periods } = await sb.from('periods')
    .select('canonical_key')
    .eq('tenant_id', TENANT_ID);
  console.log(`  Periods: ${periods?.map(p => p.canonical_key).join(', ')}`);

  console.log(`\n  Elapsed: ${elapsed}s`);
  console.log('\n=== Mission 2 FIX COMPLETE ===');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
