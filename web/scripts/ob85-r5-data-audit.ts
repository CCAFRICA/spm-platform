/**
 * OB-85 R5 Phase 0: Audit committed_data to understand which sheets
 * have data per entity, and trace buildMetricsForComponent for the
 * three low-payout components.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

async function audit() {
  // Get Jan 2024 period
  const { data: periods } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', TENANT)
    .gte('start_date', '2024-01-01')
    .lt('start_date', '2024-02-01');
  const periodId = periods?.[0]?.id;
  console.log(`Period: ${periodId}\n`);

  // Fetch ALL committed_data for this period (paginated)
  const PAGE = 1000;
  const allRows: Array<{ entity_id: string | null; data_type: string; row_data: Record<string, unknown> }> = [];
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from('committed_data')
      .select('entity_id, data_type, row_data')
      .eq('tenant_id', TENANT)
      .eq('period_id', periodId!)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (!data || data.length === 0) break;
    allRows.push(...(data as typeof allRows));
    if (data.length < PAGE) break;
    page++;
  }
  console.log(`Total rows: ${allRows.length}\n`);

  // Count by sheet type + entity vs store
  const sheetStats = new Map<string, { entity: number; store: number }>();
  for (const row of allRows) {
    const s = sheetStats.get(row.data_type) ?? { entity: 0, store: 0 };
    if (row.entity_id) s.entity++; else s.store++;
    sheetStats.set(row.data_type, s);
  }
  console.log('=== SHEET DISTRIBUTION ===');
  for (const [sheet, stats] of Array.from(sheetStats.entries()).sort()) {
    console.log(`  ${sheet}: ${stats.entity} entity rows, ${stats.store} store rows`);
  }
  console.log();

  // Count unique entities per sheet
  console.log('=== UNIQUE ENTITIES PER SHEET ===');
  const sheetEntities = new Map<string, Set<string>>();
  for (const row of allRows) {
    if (!row.entity_id) continue;
    if (!sheetEntities.has(row.data_type)) sheetEntities.set(row.data_type, new Set());
    sheetEntities.get(row.data_type)!.add(row.entity_id);
  }
  for (const [sheet, entities] of Array.from(sheetEntities.entries()).sort()) {
    console.log(`  ${sheet}: ${entities.size} unique entities`);
  }
  console.log();

  // Check insurance/warranty data
  console.log('=== INSURANCE DATA (Base_Club_Proteccion) ===');
  const insuranceRows = allRows.filter(r => r.data_type === 'Base_Club_Proteccion' && r.entity_id);
  console.log(`Entity rows: ${insuranceRows.length}`);
  if (insuranceRows.length > 0) {
    console.log(`Sample fields: ${Object.keys(insuranceRows[0].row_data).join(', ')}`);
    console.log(`Sample row_data: ${JSON.stringify(insuranceRows[0].row_data, null, 2)}`);
    // Check what amount values they have
    const amounts = insuranceRows.map(r => Number(r.row_data?.['amount'] ?? r.row_data?.['Venta_Club'] ?? 0));
    console.log(`Amount values (first 10): ${amounts.slice(0, 10).join(', ')}`);
    console.log(`Non-zero amounts: ${amounts.filter(a => a > 0).length}/${amounts.length}`);
    console.log(`Total amount: ${amounts.reduce((s, a) => s + a, 0)}`);
  }
  console.log();

  console.log('=== WARRANTY DATA (Base_Garantia_Extendida) ===');
  const warrantyRows = allRows.filter(r => r.data_type === 'Base_Garantia_Extendida' && r.entity_id);
  console.log(`Entity rows: ${warrantyRows.length}`);
  if (warrantyRows.length > 0) {
    console.log(`Sample fields: ${Object.keys(warrantyRows[0].row_data).join(', ')}`);
    console.log(`Sample row_data: ${JSON.stringify(warrantyRows[0].row_data, null, 2)}`);
    const amounts = warrantyRows.map(r => Number(r.row_data?.['amount'] ?? r.row_data?.['Venta_Garantia'] ?? 0));
    console.log(`Amount values (first 10): ${amounts.slice(0, 10).join(', ')}`);
    console.log(`Non-zero amounts: ${amounts.filter(a => a > 0).length}/${amounts.length}`);
    console.log(`Total amount: ${amounts.reduce((s, a) => s + a, 0)}`);
  }
  console.log();

  // Trace findMatchingSheet for Insurance component against entity sheets
  console.log('=== SHEET MATCHING TRACE ===');
  // Take an entity that HAS insurance data
  if (insuranceRows.length > 0) {
    const testEntityId = insuranceRows[0].entity_id;
    const entitySheets = new Set<string>();
    for (const row of allRows) {
      if (row.entity_id === testEntityId) entitySheets.add(row.data_type);
    }
    console.log(`Entity ${testEntityId} has sheets: ${Array.from(entitySheets).join(', ')}`);

    // Check: does entity have Base_Club_Proteccion in its entitySheetData?
    const hasInsurance = entitySheets.has('Base_Club_Proteccion');
    console.log(`Has Base_Club_Proteccion: ${hasInsurance}`);

    // findMatchingSheet("Insurance Sales Incentive", entitySheets)
    // Direct name: "insurance_sales_incentive" vs sheet names
    for (const sheet of Array.from(entitySheets)) {
      const normComp = 'insurance_sales_incentive';
      const normSheet = sheet.toLowerCase().replace(/[-\s]/g, '_');
      console.log(`  Direct match: "${normComp}" includes "${normSheet}"? ${normComp.includes(normSheet)}`);
      console.log(`  Direct match: "${normSheet}" includes "${normComp}"? ${normSheet.includes(normComp)}`);
    }

    // SHEET_COMPONENT_PATTERNS for insurance:
    // sheetPatterns: [/club.*proteccion/i, /proteccion/i, /insurance/i, /seguro/i]
    // componentPatterns: [/insurance/i, /proteccion/i, /seguro/i]
    const insuranceSheetPatterns = [/club.*proteccion/i, /proteccion/i, /insurance/i, /seguro/i];
    const insuranceCompPatterns = [/insurance/i, /proteccion/i, /seguro/i];

    const compMatch = insuranceCompPatterns.some(p => p.test('Insurance Sales Incentive'));
    console.log(`\nComponent "Insurance Sales Incentive" matches insurance patterns: ${compMatch}`);

    for (const sheet of Array.from(entitySheets)) {
      const sheetMatch = insuranceSheetPatterns.some(p => p.test(sheet));
      console.log(`  Sheet "${sheet}" matches insurance sheet patterns: ${sheetMatch}`);
    }
  }
  console.log();

  // Check how many entity UUIDs in insurance/warranty are in the calculation entity set
  console.log('=== UUID CROSS-CHECK ===');
  // Get assigned entity IDs
  const { data: assignments } = await supabase
    .from('rule_set_assignments')
    .select('entity_id')
    .eq('tenant_id', TENANT)
    .eq('rule_set_id', '04edaaf0-7e44-4cf3-851b-bedfc6ec7e93')
    .limit(1000);
  const assignedIds = new Set((assignments ?? []).map(a => a.entity_id));
  console.log(`Assigned entities: ${assignedIds.size}`);

  const insuranceEntityIds = new Set(insuranceRows.map(r => r.entity_id!));
  const warrantyEntityIds = new Set(warrantyRows.map(r => r.entity_id!));

  const insuranceInAssigned = Array.from(insuranceEntityIds).filter(id => assignedIds.has(id));
  const warrantyInAssigned = Array.from(warrantyEntityIds).filter(id => assignedIds.has(id));
  const insuranceNotAssigned = Array.from(insuranceEntityIds).filter(id => !assignedIds.has(id));
  const warrantyNotAssigned = Array.from(warrantyEntityIds).filter(id => !assignedIds.has(id));

  console.log(`Insurance entities in assignments: ${insuranceInAssigned.length}/${insuranceEntityIds.size}`);
  console.log(`Insurance entities NOT assigned: ${insuranceNotAssigned.length}`);
  console.log(`Warranty entities in assignments: ${warrantyInAssigned.length}/${warrantyEntityIds.size}`);
  console.log(`Warranty entities NOT assigned: ${warrantyNotAssigned.length}`);

  // Check: are the insurance entity UUIDs the SAME as roster UUIDs?
  // Or are they different UUIDs for the same employee (fragmentation)?
  if (insuranceRows.length > 0) {
    console.log('\n=== INSURANCE UUID FRAGMENTATION CHECK ===');
    // Get employee numbers from insurance rows
    const insuranceEmpNums = new Map<string, string>();
    for (const row of insuranceRows) {
      const empNum = String(row.row_data?.['entityId'] ?? row.row_data?.['num_empleado'] ?? '');
      if (empNum && empNum !== 'undefined') {
        insuranceEmpNums.set(row.entity_id!, empNum);
      }
    }
    console.log(`Insurance rows with employee numbers: ${insuranceEmpNums.size}`);

    // Check if these employee numbers exist in roster (Datos Colaborador) under different UUIDs
    const rosterRows = allRows.filter(r => r.data_type === 'Datos Colaborador');
    const rosterEmpToUuid = new Map<string, string>();
    for (const row of rosterRows) {
      const empNum = String(row.row_data?.['entityId'] ?? row.row_data?.['num_empleado'] ?? '');
      if (empNum && row.entity_id) {
        rosterEmpToUuid.set(empNum, row.entity_id);
      }
    }

    let fragmented = 0;
    let matched = 0;
    for (const [insuranceUuid, empNum] of Array.from(insuranceEmpNums.entries())) {
      const rosterUuid = rosterEmpToUuid.get(empNum);
      if (rosterUuid && rosterUuid !== insuranceUuid) {
        fragmented++;
        if (fragmented <= 5) {
          console.log(`  Employee ${empNum}: insurance UUID=${insuranceUuid.slice(0,8)}, roster UUID=${rosterUuid.slice(0,8)} — FRAGMENTED`);
        }
      } else if (rosterUuid === insuranceUuid) {
        matched++;
      }
    }
    console.log(`\nMatched UUIDs: ${matched}, Fragmented UUIDs: ${fragmented}`);
    console.log('(Fragmented = insurance data under different UUID than roster)');
  }
}

audit().catch(console.error);
