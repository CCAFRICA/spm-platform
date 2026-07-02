// OB-258 P0.6 — Materialization precedent probe (read-only, service-role).
// Confirms summary_artifacts + summary_artifacts_fine exist live (column list via select limit 1),
// row counts per tenant, plus entity_period_outcomes / period_entity_state secondary precedent counts.
// Pastes the full tenant list (id, name, slug) to identify VLTEST2.
// No writes. Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/_ob258_p06_msp_probe.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function describe(table: string): Promise<boolean> {
  const { data, error } = await supabase.from(table).select('*').limit(1);
  if (error) { console.log(`  ${table}: MISSING/ERROR -> ${error.message}`); return false; }
  const cols = data && data.length ? Object.keys(data[0]) : null;
  console.log(`  ${table}: EXISTS${cols ? ` (${cols.length} cols)` : ' (empty - no sample row)'}`);
  if (cols) console.log(`    cols: ${cols.join(', ')}`);
  return true;
}

async function countFor(table: string, tenantId: string): Promise<number | string> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) return `ERR: ${error.message}`;
  return count ?? 0;
}

async function main() {
  console.log('=== OB-258 P0.6 MSP materialization probe ===\n');

  console.log('TENANTS (full list):');
  const { data: tenants, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .order('name');
  if (tErr) { console.log(`  tenants: ERROR -> ${tErr.message}`); process.exit(1); }
  for (const t of tenants ?? []) console.log(`  ${t.id}  ${t.name}  (slug=${t.slug})`);

  console.log('\nMSP TABLES (existence + column list):');
  await describe('summary_artifacts');
  await describe('summary_artifacts_fine');
  await describe('summary_rollups'); // OB-257 MSP-family sibling (migration may be architect-pending)
  await describe('entity_period_outcomes');
  await describe('period_entity_state');

  console.log('\nROW COUNTS PER TENANT:');
  const tables = ['summary_artifacts', 'summary_artifacts_fine', 'entity_period_outcomes', 'period_entity_state'];
  for (const t of tenants ?? []) {
    const parts: string[] = [];
    for (const tbl of tables) parts.push(`${tbl}=${await countFor(tbl, t.id)}`);
    console.log(`  ${t.name} (${t.id}): ${parts.join('  ')}`);
  }

  console.log('\nSENTINEL / NAMESPACE CHECK — summary_artifacts data_type values per tenant:');
  for (const t of tenants ?? []) {
    const { data } = await supabase
      .from('summary_artifacts')
      .select('data_type')
      .eq('tenant_id', t.id)
      .limit(2000);
    const types = new Map<string, number>();
    for (const r of (data ?? []) as { data_type: string }[]) types.set(r.data_type, (types.get(r.data_type) ?? 0) + 1);
    if (types.size) console.log(`  ${t.name}: ${[...types.entries()].map(([k, v]) => `${k}(${v >= 2000 ? '2000+' : v})`).join(', ')}`);
  }

  console.log('\nconvergence_hash population check (summary_artifacts, first 5 non-null):');
  const { data: ch, error: chErr } = await supabase
    .from('summary_artifacts')
    .select('tenant_id, data_type, convergence_hash')
    .not('convergence_hash', 'is', null)
    .limit(5);
  if (chErr) console.log(`  ERR: ${chErr.message}`);
  else if (!ch || ch.length === 0) console.log('  (no rows with non-null convergence_hash)');
  else for (const r of ch) console.log(`  tenant=${r.tenant_id} data_type=${r.data_type} convergence_hash=${r.convergence_hash}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
