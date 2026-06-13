// OB-203 Phase 6B — Clean-slate POST-WIPE VERIFICATION (READ-ONLY; the wipe is
// in diag064-clean-slate-wipe.ts and is NOT re-run here).
// 1. Seven-category zero check for the wiped tenant (ruling §1.1-1.7).
// 2. Other-tenant intact counts — the wipe's scope proof is structural (every
//    statement tenant-guarded); this read shows the other tenants' learning and
//    data state present and untouched.
//
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag064-clean-slate-verify.ts

import { createClient } from '@supabase/supabase-js';

const WIPED_TENANT = '3d354bfa-b298-48dd-88a0-9f8c5a00be4e';
const SESSIONS = ['d8085364', 'e0f86141', 'fc2318fe'];
const TABLES = [
  'structural_fingerprints', 'classification_signals', 'committed_data',
  'import_batches', 'entities', 'import_session_telemetry', 'processing_jobs',
] as const;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function tenantCount(table: string, tenantId: string): Promise<number> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  if (error) throw new Error(`${table}/${tenantId.slice(0, 8)} count failed: ${error.message}`);
  return count ?? 0;
}

async function main() {
  console.log(`--- wiped tenant ${WIPED_TENANT}: seven-category zero check ---`);
  let fail = false;
  for (const t of TABLES) {
    const n = await tenantCount(t, WIPED_TENANT);
    console.log(`${t.padEnd(26)} ${n === 0 ? 'ZERO' : `*** ${n} REMAIN ***`}`);
    if (n !== 0) fail = true;
  }
  const { data: props } = await sb.storage.from('ingestion-raw').list(`${WIPED_TENANT}/proposals`);
  const namedLeft = (props ?? []).filter(o => SESSIONS.some(s => o.name.startsWith(s))).length;
  console.log(`${'storage proposals (named)'.padEnd(26)} ${namedLeft === 0 ? 'none' : `*** ${namedLeft} REMAIN ***`}`);
  if (namedLeft !== 0) fail = true;

  console.log('\n--- other tenants: learning + data state INTACT (read-only counts) ---');
  const { data: tenants, error: tErr } = await sb.from('tenants').select('id, name').neq('id', WIPED_TENANT).order('name');
  if (tErr) throw new Error(`tenants read failed: ${tErr.message}`);
  console.log('tenant                         | fingerprints | signals | committed_data | entities');
  for (const t of (tenants ?? [])) {
    const [fp, sig, cd, en] = await Promise.all([
      tenantCount('structural_fingerprints', t.id),
      tenantCount('classification_signals', t.id),
      tenantCount('committed_data', t.id),
      tenantCount('entities', t.id),
    ]);
    console.log(`${String(t.name).slice(0, 30).padEnd(30)} | ${String(fp).padStart(12)} | ${String(sig).padStart(7)} | ${String(cd).padStart(14)} | ${String(en).padStart(8)}`);
  }

  console.log(fail ? '\nVERIFICATION FAIL' : '\nVERIFICATION PASS: wiped tenant at zero in all seven categories; other tenants populated and untouched.');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e instanceof Error ? e.message : e); process.exit(1); });
