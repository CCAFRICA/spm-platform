// OB-258 P0.1 Target-data-path probe (READ-ONLY, service-role).
// 1. Full tenant list (id, name, slug).
// 2. Per-tenant committed_data counts grouped by data_type (distinct via skip-scan + exact head counts).
// 3. Two sample rows WHERE data_type='target' (any tenant) — row_data/metadata/entity_id/period_id.
// 4. Live committed_data column set (one sampled row's keys) vs SCHEMA_REFERENCE_LIVE.md.
// No writes. Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/_ob258_p01_target_probe.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function distinctDataTypes(tenantId: string): Promise<string[]> {
  // Skip-scan distinct: repeatedly take the smallest data_type strictly greater than the last seen.
  const out: string[] = [];
  let last: string | null = null;
  for (let i = 0; i < 200; i++) {
    let q = supabase
      .from('committed_data')
      .select('data_type')
      .eq('tenant_id', tenantId)
      .order('data_type', { ascending: true })
      .limit(1);
    if (last !== null) q = q.gt('data_type', last);
    const { data, error } = await q;
    if (error) { console.log(`  distinct scan error: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    last = (data[0] as { data_type: string }).data_type;
    out.push(last);
  }
  return out;
}

async function main() {
  console.log('=== OB-258 P0.1 target-data-path probe ===\n');

  // 1. Full tenant list
  const { data: tenants, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .order('name', { ascending: true });
  if (tErr) { console.log(`tenants error: ${tErr.message}`); process.exit(1); }
  console.log(`TENANTS (${tenants!.length}):`);
  for (const t of tenants!) console.log(`  ${t.id}  slug=${t.slug}  name=${t.name}`);

  // 2. Per-tenant committed_data counts grouped by data_type
  console.log('\nCOMMITTED_DATA COUNTS BY tenant × data_type:');
  let globalTarget = 0;
  for (const t of tenants!) {
    const types = await distinctDataTypes(t.id);
    if (types.length === 0) { console.log(`  [${t.slug ?? t.name}] (no committed_data rows)`); continue; }
    console.log(`  [${t.slug ?? t.name}] ${t.id}:`);
    for (const dt of types) {
      const { count, error } = await supabase
        .from('committed_data')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', t.id)
        .eq('data_type', dt);
      if (error) { console.log(`    ${dt}: count error ${error.message}`); continue; }
      console.log(`    ${dt}: ${count}`);
      if (dt === 'target') globalTarget += count ?? 0;
    }
  }
  console.log(`\nGLOBAL data_type='target' row total (across all tenants above): ${globalTarget}`);

  // 3. Two sample rows WHERE data_type='target' (any tenant)
  console.log(`\nSAMPLE ROWS data_type='target' (up to 2, any tenant):`);
  const { data: samples, error: sErr } = await supabase
    .from('committed_data')
    .select('id, tenant_id, import_batch_id, entity_id, period_id, source_date, data_type, row_data, metadata, created_at')
    .eq('data_type', 'target')
    .limit(2);
  if (sErr) console.log(`  sample error: ${sErr.message}`);
  else if (!samples || samples.length === 0) console.log('  NONE — zero rows with data_type=target platform-wide.');
  else for (const s of samples) console.log(JSON.stringify(s, null, 2));

  // 4. Live column set of committed_data
  console.log('\nLIVE committed_data COLUMN SET (keys of one sampled row):');
  const { data: one, error: oErr } = await supabase.from('committed_data').select('*').limit(1);
  if (oErr) console.log(`  error: ${oErr.message}`);
  else if (!one || one.length === 0) console.log('  table empty — no row to sample');
  else console.log(`  ${Object.keys(one[0]).sort().join(', ')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
