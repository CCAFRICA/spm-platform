// HF-355 — post-application verification of 20260629_hf355_platform_data_operations.sql.
// Run AFTER the architect applies the migration in the Supabase SQL Editor (SR-44).
//   from web/:  npx tsx scripts/_hf355_verify_migration.ts
// Asserts: (a) every role='platform' profile holds platform.data_operations; (b) the new write policy
// exists (best-effort — pg_policies is not exposed via PostgREST, so a definitive check is the
// architect's `\d processing_jobs` / pg_policies query in SQL Editor); (c) a service-role probe insert
// for a tenant succeeds and is cleaned up (PG-9 — async path open); (d) capabilities are still arrays.
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CAP = 'platform.data_operations';

async function main() {
  console.log('=== HF-355 MIGRATION VERIFICATION ===\n');
  let pass = true;

  // (a) capability grant
  const { data: plats, error: pErr } = await sb.from('profiles').select('id, email, role, capabilities').eq('role', 'platform');
  if (pErr) { console.log(`  [FAIL] read platform profiles: ${pErr.message}`); pass = false; }
  else {
    console.log(`(a) platform profiles: ${plats!.length}`);
    for (const p of plats!) {
      const caps = Array.isArray(p.capabilities) ? p.capabilities as string[] : null;
      const has = !!caps && caps.includes(CAP);
      const isArray = Array.isArray(p.capabilities);
      console.log(`    ${(p.email ?? p.id).padEnd(24)} has ${CAP}: ${has} | array: ${isArray} (${caps?.length ?? '?'} caps)`);
      if (!has) pass = false;       // (a)
      if (!isArray) pass = false;   // (d)
    }
    console.log(`  ${plats!.every(p => Array.isArray(p.capabilities) && (p.capabilities as string[]).includes(CAP)) ? '[OK]' : '[FAIL]'} (a) grant + (d) array shape`);
  }

  // (b) policy existence — best-effort (pg_policies is not PostgREST-exposed; architect confirms in SQL Editor)
  const pol = await sb.from('pg_policies').select('policyname').eq('tablename', 'processing_jobs');
  if (pol.error) console.log(`\n(b) policy check: pg_policies not queryable via PostgREST (${pol.error.code}) — architect confirms via SQL Editor: SELECT policyname FROM pg_policies WHERE tablename='processing_jobs';`);
  else console.log(`\n(b) processing_jobs policies: ${(pol.data ?? []).map(r => r.policyname).join(' | ')}`);

  // (c) service-role probe insert for a tenant succeeds (async path open) — then cleaned up
  const tenant = (await sb.from('tenants').select('id,name').limit(1).single()).data;
  if (!tenant) { console.log('\n(c) [SKIP] no tenant to probe'); }
  else {
    const ins = await sb.from('processing_jobs').insert({
      tenant_id: tenant.id, status: 'pending', file_storage_path: 'hf355-verify/probe.xlsx', file_name: 'probe.xlsx',
    }).select('id').single();
    if (ins.error) { console.log(`\n(c) [FAIL] service-role probe insert: ${ins.error.message}`); pass = false; }
    else {
      console.log(`\n(c) [OK] service-role probe insert for tenant ${tenant.name} succeeded (job ${String(ins.data.id).slice(0, 8)}) — async enqueue path is open`);
      await sb.from('processing_jobs').delete().eq('id', ins.data.id);
      console.log('    [cleanup] probe row removed');
    }
  }

  console.log(`\n=== ${pass ? 'PASS' : 'FAIL'} ===`);
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
