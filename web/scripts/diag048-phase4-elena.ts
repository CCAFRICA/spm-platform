import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  const { data: entities, error: entErr } = await sb
    .from('entities')
    .select('id, external_id, display_name, attributes')
    .eq('tenant_id', tenantId)
    .ilike('display_name', '%Marchetti%');
  if (entErr) { console.error(entErr); return; }
  console.log('Entities matching Marchetti:');
  console.log(JSON.stringify(entities, null, 2));

  for (const e of entities ?? []) {
    const { data: rows } = await sb
      .from('committed_data')
      .select('data_type, source_date, row_data')
      .eq('tenant_id', tenantId)
      .eq('entity_id', e.id)
      .limit(15);
    console.log(`\nCommitted data for ${e.display_name} (entity_id=${e.id}, external_id=${e.external_id}): ${(rows ?? []).length} rows`);
    for (const r of rows ?? []) {
      const rd = (r.row_data ?? {}) as Record<string, unknown>;
      const keys = Object.keys(rd).sort().join(',');
      console.log(`  data_type=${JSON.stringify(r.data_type)} source_date=${r.source_date} keys=${keys}`);
    }
  }
}

main();
