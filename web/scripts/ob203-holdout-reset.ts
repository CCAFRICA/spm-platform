// OB-203 Phase 6 — targeted reset of the holdout tenant's run-1 learning (cold exit witness).
// Clears structural_fingerprints (sheet + atom), comprehension signals, committed_data, entities,
// import_batches for the tenant. Prints before/after. Preserves tenants/profiles/rule_sets/periods.
import { createClient } from '@supabase/supabase-js';
const T = process.argv[2] || '3d354bfa';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const count = async (tbl: string, extra?: (q: any) => any) => {
  let q = sb.from(tbl).select('*', { count: 'exact', head: true }).eq('tenant_id', T);
  if (extra) q = extra(q);
  const { count: c } = await q; return c ?? 0;
};
(async () => {
  // resolve full tenant id if a prefix was passed
  let tenantId = T;
  if (T.length < 36) {
    const { data } = await sb.from('tenants').select('id, name').ilike('id', `${T}%`).limit(1);
    if (!data || data.length === 0) { console.error(`No tenant matching ${T}%`); process.exit(1); }
    tenantId = data[0].id as string;
    console.log(`Resolved tenant ${T}% -> ${tenantId} ("${data[0].name}")\n`);
  }
  const tcount = async (tbl: string) => { const { count: c } = await sb.from(tbl).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId); return c ?? 0; };
  console.log('=== BEFORE ===');
  for (const t of ['structural_fingerprints', 'classification_signals', 'committed_data', 'entities', 'import_batches'])
    console.log(`  ${t}: ${await tcount(t)}`);
  const { count: atomBefore } = await sb.from('structural_fingerprints').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('granularity', 'atom');
  console.log(`  (of which atoms: ${atomBefore ?? 0})`);

  console.log('\n=== DELETE (learning + run state; tenants/profiles/rule_sets/periods preserved) ===');
  for (const t of ['structural_fingerprints', 'classification_signals', 'committed_data', 'entities', 'import_batches']) {
    const { error } = await sb.from(t).delete().eq('tenant_id', tenantId);
    console.log(`  ${t}: ${error ? 'ERROR ' + error.message : 'cleared'}`);
  }

  console.log('\n=== AFTER (verify cold) ===');
  for (const t of ['structural_fingerprints', 'classification_signals', 'committed_data', 'entities', 'import_batches'])
    console.log(`  ${t}: ${await tcount(t)}`);
  console.log('\nHoldout tenant is COLD. Ready for the cold exit-witness import.');
})();
