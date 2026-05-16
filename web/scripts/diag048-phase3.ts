import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  console.log('=== 3.1 import_batches ===');
  const { data: batches } = await sb
    .from('import_batches')
    .select('id, file_name, data_type, status, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  for (const b of batches ?? []) {
    console.log(`  ${b.file_name} | data_type=${b.data_type} | status=${b.status} | id=${b.id}`);
  }

  console.log('\n=== 3.1 committed_data per-data_type column inventory ===');
  const { data: allRows } = await sb
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', tenantId)
    .limit(500);
  const byType = new Map<string, Array<Record<string, unknown>>>();
  for (const r of allRows ?? []) {
    if (!byType.has(r.data_type as string)) byType.set(r.data_type as string, []);
    byType.get(r.data_type as string)!.push(r.row_data as Record<string, unknown>);
  }
  for (const [dt, rows] of byType.entries()) {
    console.log(`\ndata_type=${JSON.stringify(dt)} (${rows.length} sampled rows):`);
    const allCols = new Set<string>();
    for (const rd of rows) {
      if (rd && typeof rd === 'object') for (const k of Object.keys(rd)) allCols.add(k);
    }
    console.log(`  columns: ${Array.from(allCols).sort().join(', ')}`);

    if (allCols.has('monthly_quota')) {
      const vals = rows.map(r => r?.monthly_quota).filter(v => v != null);
      console.log(`  monthly_quota first 5: ${JSON.stringify(vals.slice(0, 5))}`);
    }

    const catFields: Array<{ field: string; distinctValues: unknown[] }> = [];
    for (const col of allCols) {
      if (col.startsWith('_')) continue;
      const vals = rows.map(r => r?.[col]).filter(v => typeof v === 'string') as string[];
      const distinct = Array.from(new Set(vals));
      if (distinct.length > 0 && distinct.length <= 20) {
        catFields.push({ field: col, distinctValues: distinct });
      }
    }
    if (catFields.length > 0) {
      console.log('  categorical fields:');
      for (const cf of catFields) console.log(`    ${cf.field}: ${JSON.stringify(cf.distinctValues)}`);
    }

    const numFields: string[] = [];
    for (const col of allCols) {
      if (col.startsWith('_')) continue;
      const vals = rows.map(r => r?.[col]).filter(v => typeof v === 'number');
      if (vals.length > rows.length * 0.3) numFields.push(col);
    }
    if (numFields.length > 0) console.log(`  numeric fields: ${numFields.join(', ')}`);
  }
}

main();
