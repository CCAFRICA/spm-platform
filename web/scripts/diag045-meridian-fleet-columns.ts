import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FLEET_PATTERN = /hub|fleet|load|capacity|utiliz/i;

async function main() {
  const tenantId = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

  const { data, error } = await supabase
    .from('committed_data')
    .select('id, data_type, import_batch_id, row_data')
    .eq('tenant_id', tenantId);

  if (error) { console.error('Error:', error); return; }
  if (!data) { console.log('No rows'); return; }
  console.log(`Total Meridian committed_data rows: ${data.length}\n`);

  // Aggregate column-name → {byDataType: {entity: N, transaction: N, reference: N}, sampleValues: [...]}
  const byColumn = new Map<string, { byDataType: Record<string, number>; sampleValues: unknown[]; matchesFleet: boolean }>();
  for (const r of data) {
    const rd = r.row_data as Record<string, unknown> | null;
    if (!rd) continue;
    for (const [colName, val] of Object.entries(rd)) {
      if (!byColumn.has(colName)) {
        byColumn.set(colName, { byDataType: {}, sampleValues: [], matchesFleet: FLEET_PATTERN.test(colName) });
      }
      const entry = byColumn.get(colName)!;
      entry.byDataType[r.data_type] = (entry.byDataType[r.data_type] ?? 0) + 1;
      if (entry.sampleValues.length < 3 && val !== null && val !== '' && val !== undefined) {
        entry.sampleValues.push(val);
      }
    }
  }

  console.log('=== ALL columns (sorted; fleet-pattern matches marked with >>>) ===');
  for (const colName of Array.from(byColumn.keys()).sort()) {
    const e = byColumn.get(colName)!;
    const marker = e.matchesFleet ? '>>> ' : '    ';
    const dts = Object.entries(e.byDataType).map(([k, v]) => `${k}:${v}`).join(', ');
    const samples = e.sampleValues.map(v => JSON.stringify(v)?.substring(0, 40)).join(' | ');
    console.log(`${marker}${colName.padEnd(28)}  rows={${dts}}  samples=[${samples}]`);
  }

  console.log('\n=== Fleet-pattern columns only ===');
  for (const colName of Array.from(byColumn.keys()).filter(k => byColumn.get(k)!.matchesFleet).sort()) {
    const e = byColumn.get(colName)!;
    const dts = Object.entries(e.byDataType).map(([k, v]) => `${k}:${v}`).join(', ');
    console.log(`  ${colName}: byDataType={${dts}}, samples=${JSON.stringify(e.sampleValues)}`);
  }
}

main();
