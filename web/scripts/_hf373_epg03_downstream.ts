import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';

async function main() {
  // 1. entities for VLTEST2
  const { data: ents, count } = await sb.from('entities')
    .select('id, external_id, display_name, entity_type', { count: 'exact' })
    .eq('tenant_id', VLTEST2)
    .order('external_id')
    .limit(2000);
  console.log('entities count:', count);
  const byType = new Map<string, number>();
  for (const e of ents ?? []) byType.set(e.entity_type, (byType.get(e.entity_type) ?? 0) + 1);
  console.log('by entity_type:', JSON.stringify(Object.fromEntries(byType)));
  const extIds = (ents ?? []).map(e => e.external_id);
  console.log('first 10 external_ids:', JSON.stringify(extIds.slice(0, 10)));
  console.log('last 5 external_ids:', JSON.stringify(extIds.slice(-5)));
  const entById = new Map((ents ?? []).map(e => [e.id, e]));

  // 2. roster committed_data: data_type=entity rows
  const { data: rows, count: rcount } = await sb.from('committed_data')
    .select('id, data_type, entity_id, row_data, metadata, import_batch_id', { count: 'exact' })
    .eq('tenant_id', VLTEST2)
    .eq('data_type', 'entity')
    .limit(200);
  console.log('\ncommitted_data data_type=entity count:', rcount);
  if (rows && rows.length) {
    const m = rows[0].metadata as Record<string, unknown>;
    console.log('metadata keys:', JSON.stringify(Object.keys(m)));
    console.log('metadata.entity_id_field:', JSON.stringify((m as any).entity_id_field));
    // distinct entity_id_field across roster rows
    const eifs = new Set(rows.map(r => (r.metadata as any)?.entity_id_field));
    console.log('distinct entity_id_field values on roster rows:', JSON.stringify(Array.from(eifs)));
    // linkage check: does entity_id point at the row's ID_Empleado or ID_Gerente?
    let matchEmp = 0, matchGer = 0, nullEid = 0, other = 0;
    for (const r of rows) {
      const rd = r.row_data as Record<string, unknown>;
      if (!r.entity_id) { nullEid++; continue; }
      const ent = entById.get(r.entity_id);
      if (!ent) { other++; continue; }
      if (ent.external_id === String(rd.ID_Empleado ?? '').trim()) matchEmp++;
      else if (ent.external_id === String(rd.ID_Gerente ?? '').trim()) matchGer++;
      else other++;
    }
    console.log(`linkage: entity_id matches ID_Empleado=${matchEmp}, matches ID_Gerente=${matchGer}, null=${nullEid}, other=${other} (of ${rows.length} sampled)`);
    // show 3 sample rows
    for (const r of rows.slice(0, 3)) {
      const rd = r.row_data as Record<string, unknown>;
      const ent = r.entity_id ? entById.get(r.entity_id) : null;
      console.log(`  ROW ID_Empleado=${rd.ID_Empleado} ID_Gerente=${rd.ID_Gerente} -> entity_id=${r.entity_id} (external_id=${ent?.external_id ?? 'N/A'})`);
    }
  }

  // 3. also check distinct ID_Gerente count on roster to confirm 13 / repeat 6.5x
  const { data: allRoster } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', VLTEST2)
    .eq('data_type', 'entity')
    .limit(500);
  const empSet = new Set<string>(); const gerSet = new Set<string>();
  for (const r of allRoster ?? []) {
    const rd = r.row_data as Record<string, unknown>;
    if (rd.ID_Empleado != null && String(rd.ID_Empleado).trim()) empSet.add(String(rd.ID_Empleado).trim());
    if (rd.ID_Gerente != null && String(rd.ID_Gerente).trim()) gerSet.add(String(rd.ID_Gerente).trim());
  }
  console.log(`\nroster rows=${allRoster?.length}; distinct ID_Empleado=${empSet.size}; distinct ID_Gerente=${gerSet.size}`);
  const gerInEmp = Array.from(gerSet).filter(g => empSet.has(g)).length;
  console.log(`ID_Gerente values that are also ID_Empleado values: ${gerInEmp}/${gerSet.size} (self-referential FK check)`);
}
main().catch(e => { console.error(e); process.exit(1); });
