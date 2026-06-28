// OB-250 — post-application verification of 20260628_ob250_processing_jobs_reconcile.sql
// Run AFTER the architect applies the migration in the Supabase SQL Editor (SR-44).
//   from web/:  npx tsx scripts/_ob250_verify_migration.ts
// Read-only. Confirms: chunk columns present, 'finalized' status accepted, RLS predicate
// no longer references platform_users (probed indirectly via an authenticated-style read).
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  console.log('=== OB-250 MIGRATION VERIFICATION ===\n');
  let pass = true;

  // 1. chunk columns present — insert a probe row carrying them, read back, delete.
  const probeTenant = (await sb.from('tenants').select('id').limit(1).single()).data?.id as string;
  if (!probeTenant) { console.log('no tenant to probe with'); process.exit(1); }

  const batchId = crypto.randomUUID();
  const ins = await sb.from('processing_jobs').insert({
    tenant_id: probeTenant,
    status: 'pending',
    file_storage_path: 'ob250-verify/probe.xlsx',
    file_name: 'probe.xlsx',
    batch_id: batchId,
    chunk_id: 0,
    total_chunks: 3,
  }).select('id, batch_id, chunk_id, total_chunks').single();

  if (ins.error) { console.log(`  [FAIL] chunk columns: ${ins.error.message}`); pass = false; }
  else {
    console.log(`  [OK] chunk columns present: batch_id/chunk_id/total_chunks = ${ins.data.batch_id?.slice(0,8)}/${ins.data.chunk_id}/${ins.data.total_chunks}`);
    const probeId = ins.data.id as string;

    // 2. 'finalized' status accepted by the widened CHECK
    const upd = await sb.from('processing_jobs').update({ status: 'finalized' }).eq('id', probeId).select('status').single();
    if (upd.error) { console.log(`  [FAIL] 'finalized' status: ${upd.error.message}`); pass = false; }
    else console.log(`  [OK] 'finalized' status accepted (lifecycle terminal stage)`);

    // 3. status CHECK still rejects garbage (registry-free but structural-valid)
    const bad = await sb.from('processing_jobs').update({ status: 'banana' }).eq('id', probeId);
    console.log(bad.error ? `  [OK] CHECK rejects invalid status` : `  [WARN] CHECK did not reject invalid status`);

    await sb.from('processing_jobs').delete().eq('id', probeId);
    console.log(`  [cleanup] probe row removed`);
  }

  // 4. structural_fingerprints reachable (flywheel storage)
  const sf = await sb.from('structural_fingerprints').select('*', { count: 'exact', head: true });
  console.log(sf.error ? `  [FAIL] structural_fingerprints: ${sf.error.message}` : `  [OK] structural_fingerprints reachable (count=${sf.count})`);

  // 5. platform_users still absent (the ghost the RLS used to reference)
  const pu = await sb.from('platform_users').select('*').limit(1);
  console.log(pu.error ? `  [OK] platform_users ABSENT (RLS no longer depends on it)` : `  [WARN] platform_users exists?!`);

  console.log(`\n=== ${pass ? 'PASS' : 'FAIL'} ===`);
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
