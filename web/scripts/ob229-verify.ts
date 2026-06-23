// OB-229 Phase 0 — READ-ONLY live verification (HALT-1 + HALT-2 + PG-1 baseline).
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob229-verify.ts
import { createClient } from '@supabase/supabase-js';

const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function count(table: string, build: (q: any) => any): Promise<number | string> {
  let q = sb.from(table).select('*', { count: 'exact', head: true });
  q = build(q);
  const { count, error } = await q;
  return error ? `ERR:${error.message}` : (count ?? 0);
}

async function main() {
  // HALT-1: does summary_artifacts exist?
  const sa = await sb.from('summary_artifacts').select('*', { count: 'exact', head: true });
  console.log('HALT-1 summary_artifacts exists:', sa.error ? `NO — ${sa.error.message}` : `YES (current rows: ${sa.count ?? 0})`);

  // tenants
  const { data: tenants } = await sb.from('tenants').select('id, name');
  console.log('\nTENANTS:'); (tenants ?? []).forEach((t: any) => console.log(`  ${t.id}  ${t.name}`));

  // data_type distribution per tenant (sample via committed_data)
  console.log('\nPG-1 BASELINE (committed_data):');
  for (const t of (tenants ?? [])) {
    const cd = await count('committed_data', (q) => q.eq('tenant_id', t.id));
    if (cd === 0) continue;
    const posC = await count('committed_data', (q) => q.eq('tenant_id', t.id).eq('data_type', 'pos_cheque'));
    const txn = await count('committed_data', (q) => q.eq('tenant_id', t.id).eq('data_type', 'transaction'));
    const ents = await count('entities', (q) => q.eq('tenant_id', t.id));
    console.log(`  ${t.name}: total=${cd}, pos_cheque=${posC}, transaction=${txn}, entities=${ents}`);
  }

  // HALT-2: BCL transaction rows with entity_id NULL
  console.log('\nHALT-2 (BCL transaction entity_id):');
  const bclTxn = await count('committed_data', (q) => q.eq('tenant_id', BCL).eq('data_type', 'transaction'));
  const bclNull = await count('committed_data', (q) => q.eq('tenant_id', BCL).eq('data_type', 'transaction').is('entity_id', null));
  const bclDateNull = await count('committed_data', (q) => q.eq('tenant_id', BCL).eq('data_type', 'transaction').is('source_date', null));
  console.log(`  BCL transaction total=${bclTxn}, entity_id NULL=${bclNull}, source_date NULL=${bclDateNull}`);

  // Residual 4: source_date nulls overall per tenant w/ data
  console.log('\nResidual-4 (source_date NULL counts):');
  for (const t of (tenants ?? [])) {
    const cd = await count('committed_data', (q) => q.eq('tenant_id', t.id));
    if (cd === 0) continue;
    const nullDate = await count('committed_data', (q) => q.eq('tenant_id', t.id).is('source_date', null));
    const nullEnt = await count('committed_data', (q) => q.eq('tenant_id', t.id).is('entity_id', null));
    console.log(`  ${t.name}: rows=${cd}, source_date NULL=${nullDate}, entity_id NULL=${nullEnt}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
