/**
 * OB-85 R5: Trace the entity consolidation merge for insurance/warranty data.
 * WHY do only 8 of 719 roster entities get insurance/warranty data merged?
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

async function trace() {
  const { data: periods } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', TENANT)
    .gte('start_date', '2024-01-01')
    .lt('start_date', '2024-02-01');
  const periodId = periods?.[0]?.id;

  // Fetch ALL committed_data (paginated)
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

  // Build employee number sets per sheet
  const rosterEmpNums = new Map<string, string>(); // empNum → UUID
  const insuranceEmpNums = new Map<string, string[]>(); // empNum → [UUID, ...]
  const warrantyEmpNums = new Map<string, string[]>(); // empNum → [UUID, ...]
  const ventaIndEmpNums = new Map<string, string>(); // empNum → UUID

  for (const row of allRows) {
    if (!row.entity_id) continue;
    const rd = row.row_data;
    const empNum = String(rd?.entityId ?? rd?.num_empleado ?? rd?.Vendedor ?? '');
    if (!empNum || empNum === 'undefined' || empNum === 'null') continue;

    switch (row.data_type) {
      case 'Datos Colaborador':
        rosterEmpNums.set(empNum, row.entity_id);
        break;
      case 'Base_Club_Proteccion':
        if (!insuranceEmpNums.has(empNum)) insuranceEmpNums.set(empNum, []);
        insuranceEmpNums.get(empNum)!.push(row.entity_id);
        break;
      case 'Base_Garantia_Extendida':
        if (!warrantyEmpNums.has(empNum)) warrantyEmpNums.set(empNum, []);
        warrantyEmpNums.get(empNum)!.push(row.entity_id);
        break;
      case 'Base_Venta_Individual':
        ventaIndEmpNums.set(empNum, row.entity_id);
        break;
    }
  }

  console.log('=== EMPLOYEE NUMBER OVERLAP ===');
  console.log(`Roster employees: ${rosterEmpNums.size}`);
  console.log(`Insurance employees: ${insuranceEmpNums.size}`);
  console.log(`Warranty employees: ${warrantyEmpNums.size}`);
  console.log(`Venta Individual employees: ${ventaIndEmpNums.size}`);

  // Cross-check roster vs insurance
  let rosterWithInsurance = 0;
  let rosterWithWarranty = 0;
  let sameUuid = 0;
  let diffUuid = 0;

  for (const [empNum, rosterUuid] of Array.from(rosterEmpNums.entries())) {
    const insUuids = insuranceEmpNums.get(empNum);
    if (insUuids) {
      rosterWithInsurance++;
      if (insUuids.includes(rosterUuid)) sameUuid++;
      else diffUuid++;
    }
  }
  console.log(`\nRoster employees WITH insurance data: ${rosterWithInsurance}/${rosterEmpNums.size}`);
  console.log(`  Same UUID (no merge needed): ${sameUuid}`);
  console.log(`  Different UUID (merge needed): ${diffUuid}`);

  sameUuid = 0; diffUuid = 0;
  for (const [empNum, rosterUuid] of Array.from(rosterEmpNums.entries())) {
    const warUuids = warrantyEmpNums.get(empNum);
    if (warUuids) {
      rosterWithWarranty++;
      if (warUuids.includes(rosterUuid)) sameUuid++;
      else diffUuid++;
    }
  }
  console.log(`\nRoster employees WITH warranty data: ${rosterWithWarranty}/${rosterEmpNums.size}`);
  console.log(`  Same UUID (no merge needed): ${sameUuid}`);
  console.log(`  Different UUID (merge needed): ${diffUuid}`);

  // Now simulate the consolidation from route.ts
  console.log('\n=== CONSOLIDATION SIMULATION ===');
  // Step 1: Build employeeToEntityIds (same as route.ts)
  const employeeToEntityIds = new Map<string, Set<string>>();
  for (const row of allRows) {
    if (!row.entity_id) continue;
    const rd = row.row_data;
    const empNum = String(rd?.entityId ?? rd?.num_empleado ?? '');
    if (empNum && empNum !== 'undefined' && empNum !== 'null') {
      if (!employeeToEntityIds.has(empNum)) employeeToEntityIds.set(empNum, new Set());
      employeeToEntityIds.get(empNum)!.add(row.entity_id);
    }
  }

  let multiUuidEmployees = 0;
  let mergeableEmployees = 0;
  for (const [empNum, uuids] of Array.from(employeeToEntityIds.entries())) {
    if (uuids.size > 1) {
      multiUuidEmployees++;
      // Check if this employee is on the roster
      if (rosterEmpNums.has(empNum)) mergeableEmployees++;
    }
  }
  console.log(`Employees with multiple UUIDs: ${multiUuidEmployees}`);
  console.log(`Of those, on roster (mergeable): ${mergeableEmployees}`);

  // Check specific employee 93515855
  console.log('\n=== ENTITY 93515855 TRACE ===');
  const emp93515855 = employeeToEntityIds.get('93515855');
  console.log(`UUIDs for employee 93515855: ${emp93515855 ? Array.from(emp93515855).join(', ') : 'NONE'}`);
  const rosterUuid93515855 = rosterEmpNums.get('93515855');
  console.log(`Roster UUID: ${rosterUuid93515855}`);
  const insUuids = insuranceEmpNums.get('93515855');
  console.log(`Insurance UUIDs: ${insUuids ? insUuids.join(', ') : 'NONE'}`);
  const warUuids = warrantyEmpNums.get('93515855');
  console.log(`Warranty UUIDs: ${warUuids ? warUuids.join(', ') : 'NONE'}`);

  // Check an employee who HAS insurance data
  let exampleEmp: string | null = null;
  for (const [empNum] of Array.from(rosterEmpNums.entries())) {
    if (insuranceEmpNums.has(empNum)) {
      exampleEmp = empNum;
      break;
    }
  }
  if (exampleEmp) {
    console.log(`\n=== EXAMPLE: Employee ${exampleEmp} (has insurance) ===`);
    const allUuids = employeeToEntityIds.get(exampleEmp);
    console.log(`All UUIDs: ${allUuids ? Array.from(allUuids).join(', ') : 'NONE'}`);
    console.log(`Roster UUID: ${rosterEmpNums.get(exampleEmp)}`);
    console.log(`Insurance UUIDs: ${insuranceEmpNums.get(exampleEmp)?.join(', ')}`);
    console.log(`Warranty UUIDs: ${warrantyEmpNums.get(exampleEmp)?.join(', ')}`);

    // Check what sheets the primary UUID sees after consolidation would run
    const primaryUuid = rosterEmpNums.get(exampleEmp)!;
    const sheetsForPrimary = new Set<string>();
    const sheetsForAllUuids = new Set<string>();
    for (const row of allRows) {
      if (row.entity_id === primaryUuid) sheetsForPrimary.add(row.data_type);
      if (allUuids?.has(row.entity_id!)) sheetsForAllUuids.add(row.data_type);
    }
    console.log(`Sheets under primary UUID only: ${Array.from(sheetsForPrimary).join(', ')}`);
    console.log(`Sheets across all UUIDs: ${Array.from(sheetsForAllUuids).join(', ')}`);
  }

  // KEY QUESTION: Why does the consolidation not pick up insurance/warranty?
  // The consolidation matches on row_data.entityId || row_data.num_empleado.
  // But warranty rows use "Vendedor" as employee field - does the consolidation miss it?
  console.log('\n=== WARRANTY FIELD CHECK ===');
  const warSample = allRows.find(r => r.data_type === 'Base_Garantia_Extendida');
  if (warSample) {
    const rd = warSample.row_data;
    console.log(`entityId field: ${rd?.entityId}`);
    console.log(`num_empleado field: ${rd?.num_empleado}`);
    console.log(`Vendedor field: ${rd?.Vendedor}`);
    console.log(`Fields present: ${Object.keys(rd).join(', ')}`);
    // The consolidation code uses: rd?.['entityId'] ?? rd?.['num_empleado']
    // If entityId exists, it uses that. Check if it's correct.
    console.log(`Consolidation would use: ${String(rd?.entityId ?? rd?.num_empleado ?? 'NOTHING')}`);
  }

  // How many warranty rows have entityId set?
  const warWithEntityId = allRows.filter(r => r.data_type === 'Base_Garantia_Extendida' && r.row_data?.entityId).length;
  const warWithVendedor = allRows.filter(r => r.data_type === 'Base_Garantia_Extendida' && r.row_data?.Vendedor).length;
  console.log(`Warranty rows with entityId: ${warWithEntityId}/11695`);
  console.log(`Warranty rows with Vendedor: ${warWithVendedor}/11695`);
}

trace().catch(console.error);
