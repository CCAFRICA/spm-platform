/**
 * OB-155: Engine Contract verification — current state of Óptica tenant
 */
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  console.log('=== OB-155 ENGINE CONTRACT STATE ===\n');

  const tables = [
    'rule_sets', 'entities', 'periods', 'committed_data',
    'rule_set_assignments', 'calculation_results', 'calculation_batches',
    'entity_period_outcomes', 'import_batches', 'classification_signals',
  ];

  for (const table of tables) {
    const { count } = await sb.from(table)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', T);
    console.log(`  ${table}: ${count}`);
  }

  // Rule set details
  const { data: rs } = await sb.from('rule_sets')
    .select('id, name, status, components')
    .eq('tenant_id', T);
  if (rs?.length) {
    for (const r of rs) {
      const comps = r.components as Record<string, unknown>;
      const variants = (comps?.variants || []) as Array<{ variantId: string; components: unknown[] }>;
      console.log(`\n  Rule set: ${r.name} (${r.status})`);
      for (const v of variants) {
        console.log(`    Variant: ${v.variantId} — ${v.components?.length} components`);
      }
      // Check componentType on first component
      const first = (variants[0]?.components?.[0] || {}) as Record<string, unknown>;
      console.log(`    First component: componentType=${first.componentType}, name=${first.name}`);
    }
  }

  // Entity details
  const { count: entityCount } = await sb.from('entities')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', T);

  // Entity dedup check
  const extIds = new Map<string, number>();
  let offset = 0;
  while (true) {
    const { data } = await sb.from('entities')
      .select('external_id')
      .eq('tenant_id', T)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const e of data) {
      const eid = e.external_id || '';
      extIds.set(eid, (extIds.get(eid) || 0) + 1);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
  const dupes = Array.from(extIds.entries()).filter(([, c]) => c > 1);
  console.log(`\n  Entities: ${entityCount} (unique external_ids: ${extIds.size}, duplicates: ${dupes.length})`);

  // Committed data by data_type
  console.log('\n  Committed data by data_type:');
  const typeCounts = new Map<string, number>();
  offset = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('data_type')
      .eq('tenant_id', T)
      .range(offset, offset + 4999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const dt = r.data_type || 'unknown';
      typeCounts.set(dt, (typeCounts.get(dt) || 0) + 1);
    }
    offset += data.length;
    if (data.length < 5000) break;
  }
  let cdTotal = 0;
  for (const [dt, count] of Array.from(typeCounts.entries()).sort()) {
    console.log(`    ${dt}: ${count}`);
    cdTotal += count;
  }
  console.log(`    TOTAL: ${cdTotal}`);

  // Source date coverage
  const { count: sdCount } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .not('source_date', 'is', null);
  console.log(`\n  Source_date coverage: ${sdCount}/${cdTotal}`);

  // Entity binding coverage
  const { count: boundCount } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .not('entity_id', 'is', null);
  console.log(`  Entity-bound rows: ${boundCount}/${cdTotal}`);

  // Assignments
  const { count: assignCount } = await sb.from('rule_set_assignments')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', T);
  console.log(`  Assignments: ${assignCount}`);

  // Periods
  const { data: periods } = await sb.from('periods')
    .select('id, label, status, start_date, end_date')
    .eq('tenant_id', T);
  console.log(`\n  Periods: ${periods?.length || 0}`);
  for (const p of periods || []) {
    console.log(`    ${p.label}: ${p.status} (${p.start_date} to ${p.end_date})`);
  }

  // Import batches
  const { data: batches } = await sb.from('import_batches')
    .select('id, status, row_count, metadata')
    .eq('tenant_id', T)
    .order('created_at');
  console.log(`\n  Import batches: ${batches?.length || 0}`);
  for (const b of batches || []) {
    const meta = b.metadata as Record<string, unknown>;
    console.log(`    ${b.id.substring(0, 8)}: status=${b.status}, rows=${b.row_count}, type=${meta?.resolved_data_type || meta?.data_type || 'unknown'}`);
  }
}

run().catch(console.error);
