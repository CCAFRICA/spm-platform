import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

(async () => {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  // Replicate what inventoryData does (without supersession filtering)
  const { data: allRows } = await sb
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', tenantId)
    .not('row_data', 'is', null)
    .limit(500);

  const byType = new Map<string, Record<string, unknown>[]>();
  for (const r of allRows || []) {
    const dt = r.data_type as string;
    if (!byType.has(dt)) byType.set(dt, []);
    byType.get(dt)!.push(r.row_data as Record<string, unknown>);
  }

  for (const [dt, rows] of byType.entries()) {
    console.log('\ndata_type=' + JSON.stringify(dt) + ' (' + rows.length + ' rows):');

    const allCols = new Set<string>();
    for (const rd of rows) {
      if (rd && typeof rd === 'object') {
        for (const k of Object.keys(rd)) allCols.add(k);
      }
    }

    // Categorical
    const catFields: Array<{ field: string; distinctCount: number; values: string[] }> = [];
    for (const col of allCols) {
      if (col.startsWith('_')) continue;
      const vals = rows
        .map(r => r[col])
        .filter((v): v is string => typeof v === 'string');
      const distinct = Array.from(new Set(vals));
      if (distinct.length > 0 && distinct.length <= 20) {
        catFields.push({ field: col, distinctCount: distinct.length, values: distinct });
      }
    }

    if (catFields.length > 0) {
      console.log('  categorical fields (' + catFields.length + '):');
      for (const cf of catFields) {
        console.log('    ' + cf.field + ' (' + cf.distinctCount + ' values): ' + JSON.stringify(cf.values));
      }
    } else {
      console.log('  categorical fields: NONE');
    }

    // Numeric
    const numFields: string[] = [];
    for (const col of allCols) {
      if (col.startsWith('_')) continue;
      const vals = rows.map(r => r[col]).filter(v => typeof v === 'number');
      if (vals.length > rows.length * 0.3) {
        numFields.push(col);
      }
    }
    console.log('  numeric fields: ' + (numFields.length > 0 ? numFields.join(', ') : 'NONE'));
  }
})();
