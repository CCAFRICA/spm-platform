import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  // Find Tyler Morrison entity
  const { data: entities, error: entErr } = await supabase
    .from('entities')
    .select('id, external_id, display_name')
    .eq('tenant_id', tenantId)
    .or('external_id.eq.CRP-6007,display_name.ilike.%Tyler Morrison%')
    .limit(5);

  if (entErr || !entities?.length) { console.error('Entity not found:', entErr); return; }

  const entity = entities[0];
  console.log('=== ENTITY ===');
  console.log(`${entity.display_name} (${entity.external_id}, id=${entity.id})`);

  // All committed_data rows for this entity in Jan 1-15
  const { data: rows, error: rowErr } = await supabase
    .from('committed_data')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entity.id)
    .gte('source_date', '2026-01-01')
    .lte('source_date', '2026-01-15');

  if (rowErr) { console.error('Data error:', rowErr); return; }

  console.log(`\n=== COMMITTED_DATA for Jan 1-15 (${rows?.length} rows) ===`);

  if (rows && rows.length > 0) {
    // Schema-inspect-first: list all top-level keys and ALL object-valued keys with their sub-keys
    const r0 = rows[0];
    console.log('Row top-level keys:', Object.keys(r0));

    for (const [key, value] of Object.entries(r0)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        console.log(`  JSONB field "${key}" sub-keys:`, Object.keys(value as object));
      }
    }

    // After inspection: pin to row_data (the committed_data column that holds source-row payload).
    // This is the column schema for committed_data in spm-platform; the inspection above confirms
    // the keys we read here (total_amount, product_category, order_type, product_name, date).
    const dataFieldName = 'row_data';
    console.log(`\nReading payload from JSONB column: "${dataFieldName}"`);

    // Dump first row's row_data verbatim so the architect can see the raw shape
    console.log('\n=== ROW 0 row_data verbatim ===');
    console.log(JSON.stringify((r0 as Record<string, unknown>)[dataFieldName], null, 2));

    let totalAll = 0;
    let totalEquipment = 0;
    let totalConsumables = 0;
    let totalOther = 0;
    const categoryCounts = new Map<string, { count: number; sum: number }>();

    console.log('\n=== PER-ROW DETAIL ===');
    for (const r of rows) {
      const data = (r as Record<string, unknown>)[dataFieldName] as Record<string, unknown> | undefined;
      const amt = Number(data?.total_amount ?? 0);
      const cat = String(data?.product_category ?? data?.productCategory ?? 'MISSING');
      const orderType = String(data?.order_type ?? data?.orderType ?? 'MISSING');
      const productName = String(data?.product_name ?? data?.productName ?? 'MISSING');

      totalAll += amt;
      if (cat.toLowerCase().includes('capital') || cat.toLowerCase().includes('equipment')) {
        totalEquipment += amt;
      } else if (cat.toLowerCase().includes('consumab')) {
        totalConsumables += amt;
      } else {
        totalOther += amt;
      }

      const existing = categoryCounts.get(cat) ?? { count: 0, sum: 0 };
      existing.count += 1;
      existing.sum += amt;
      categoryCounts.set(cat, existing);

      console.log(`  date=${r.source_date} | amt=${amt} | cat="${cat}" | order="${orderType}" | product="${productName}"`);
    }

    console.log('\n=== TOTALS ===');
    console.log(`All categories: ${totalAll}`);
    console.log(`Capital Equipment only: ${totalEquipment}`);
    console.log(`Consumables only: ${totalConsumables}`);
    console.log(`Other/Missing: ${totalOther}`);

    console.log('\n=== BY CATEGORY ===');
    for (const [cat, agg] of categoryCounts) {
      console.log(`  "${cat}": count=${agg.count}, sum=${agg.sum}`);
    }

    console.log('\n=== REFERENCE VALUES ===');
    console.log(`GT Equipment Revenue for Tyler Jan 1-15: 179527`);
    console.log(`GT Commission: 0.06 * 179527 + 200 = ${0.06 * 179527 + 200}`);
    console.log(`Engine output for Tyler Jan 1-15: 12352.52`);
  }

  // Also check: does Tyler have rows WITHOUT source_date (period-agnostic)?
  const { data: agnosticRows } = await supabase
    .from('committed_data')
    .select('id, source_date, data_type')
    .eq('tenant_id', tenantId)
    .eq('entity_id', entity.id)
    .is('source_date', null);

  console.log(`\n=== PERIOD-AGNOSTIC ROWS (source_date IS NULL): ${agnosticRows?.length} ===`);
  for (const r of agnosticRows || []) {
    console.log(`  id=${r.id}, data_type=${r.data_type}`);
  }
}

main();
