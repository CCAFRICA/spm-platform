/**
 * OB-85 R6: Examine Base_Venta_Individual fields to find store optical sales
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TENANT = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

async function check() {
  const { data: periods } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', TENANT)
    .gte('start_date', '2024-01-01')
    .lt('start_date', '2024-02-01');
  const periodId = periods?.[0]?.id;

  // Get sample Base_Venta_Individual rows
  const { data: viRows } = await supabase
    .from('committed_data')
    .select('entity_id, row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .eq('data_type', 'Base_Venta_Individual')
    .limit(5);

  console.log('=== BASE_VENTA_INDIVIDUAL SAMPLE ===');
  for (const row of viRows ?? []) {
    console.log(`\nEntity: ${row.entity_id?.slice(0, 8)}`);
    const rd = row.row_data as Record<string, unknown>;
    console.log(`All fields: ${JSON.stringify(rd, null, 2)}`);
  }

  // Check if there's a Rango_Tienda or similar field anywhere
  console.log('\n=== SEARCHING FOR STORE RANGE FIELD ===');

  // Check all sheets for "rango" or "range" or "band" fields
  const PAGE = 1000;
  const fieldSearch = new Map<string, Set<string>>();
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', TENANT)
      .eq('period_id', periodId!)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const rd = row.row_data as Record<string, unknown>;
      for (const key of Object.keys(rd)) {
        const lk = key.toLowerCase();
        if (lk.includes('rango') || lk.includes('range') || lk.includes('band') ||
            lk.includes('nivel') || lk.includes('level') || lk.includes('tier') ||
            lk.includes('categoria') || lk.includes('category') || lk.includes('grupo') ||
            lk.includes('venta_tienda') || lk.includes('store_sales') || lk.includes('optica')) {
          if (!fieldSearch.has(row.data_type)) fieldSearch.set(row.data_type, new Set());
          fieldSearch.get(row.data_type)!.add(key);
        }
      }
    }
    if (data.length < PAGE) break;
    page++;
  }

  for (const [sheet, fields] of Array.from(fieldSearch.entries()).sort()) {
    console.log(`  ${sheet}: ${Array.from(fields).join(', ')}`);
  }

  // Specifically check Datos Colaborador for ALL fields (some may have been missed)
  const { data: rosterSample } = await supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .eq('data_type', 'Datos Colaborador')
    .limit(3);

  console.log('\n=== DATOS COLABORADOR — ALL UNIQUE FIELDS ===');
  const allFields = new Set<string>();
  for (const row of rosterSample ?? []) {
    const rd = row.row_data as Record<string, unknown>;
    for (const key of Object.keys(rd)) {
      allFields.add(key);
    }
  }
  console.log(Array.from(allFields).sort().join('\n'));

  // Check if Base_Venta_Tienda has any optical-specific fields
  console.log('\n=== BASE_VENTA_TIENDA — ALL UNIQUE FIELDS ===');
  const vtFields = new Set<string>();
  const { data: vtSample } = await supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .eq('data_type', 'Base_Venta_Tienda')
    .limit(3);
  for (const row of vtSample ?? []) {
    const rd = row.row_data as Record<string, unknown>;
    for (const key of Object.keys(rd)) {
      vtFields.add(key);
    }
  }
  console.log(Array.from(vtFields).sort().join('\n'));

  // What does entity 92686541's store (298) look like?
  console.log('\n=== ENTITY 92686541 TRACE ===');
  const { data: e92Data } = await supabase
    .from('committed_data')
    .select('entity_id, data_type, row_data')
    .eq('tenant_id', TENANT)
    .eq('period_id', periodId!)
    .limit(200);

  // Actually need the UUID — find it via employee number
  page = 0;
  let e92Uuid: string | null = null;
  while (!e92Uuid) {
    const { data } = await supabase
      .from('committed_data')
      .select('entity_id, row_data')
      .eq('tenant_id', TENANT)
      .eq('period_id', periodId!)
      .eq('data_type', 'Datos Colaborador')
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const rd = row.row_data as Record<string, unknown>;
      if (String(rd?.entityId ?? rd?.num_empleado) === '92686541') {
        e92Uuid = row.entity_id;
        break;
      }
    }
    if (data.length < PAGE) break;
    page++;
  }

  if (e92Uuid) {
    console.log(`UUID: ${e92Uuid}`);
    // Get all data for this entity
    const { data: entityData } = await supabase
      .from('committed_data')
      .select('data_type, row_data')
      .eq('tenant_id', TENANT)
      .eq('period_id', periodId!)
      .eq('entity_id', e92Uuid);

    for (const row of entityData ?? []) {
      console.log(`\n  Sheet: ${row.data_type}`);
      console.log(`  ${JSON.stringify(row.row_data)}`);
    }

    // Find sibling UUIDs
    const empUuids: string[] = [];
    page = 0;
    while (true) {
      const { data } = await supabase
        .from('committed_data')
        .select('entity_id, data_type, row_data')
        .eq('tenant_id', TENANT)
        .eq('period_id', periodId!)
        .range(page * PAGE, (page + 1) * PAGE - 1);
      if (!data || data.length === 0) break;
      for (const row of data) {
        const rd = row.row_data as Record<string, unknown>;
        if (String(rd?.entityId ?? rd?.num_empleado) === '92686541' && row.entity_id) {
          if (!empUuids.includes(row.entity_id)) empUuids.push(row.entity_id);
        }
      }
      if (data.length < PAGE) break;
      page++;
    }
    console.log(`\nAll UUIDs for employee 92686541: ${empUuids.join(', ')}`);

    // Get Venta Individual for sibling UUIDs
    for (const uuid of empUuids) {
      if (uuid === e92Uuid) continue;
      const { data: sibData } = await supabase
        .from('committed_data')
        .select('data_type, row_data')
        .eq('tenant_id', TENANT)
        .eq('period_id', periodId!)
        .eq('entity_id', uuid);
      for (const row of sibData ?? []) {
        if (row.data_type === 'Base_Venta_Individual') {
          console.log(`\n  Sibling ${uuid.slice(0,8)} Venta Individual:`);
          console.log(`  ${JSON.stringify(row.row_data)}`);
        }
      }
    }
  }
}

check().catch(console.error);
