// HF-362 (§3 FP-49) — does the hand-off batch INSERT with status='staged' actually succeed? The merged
// HF-360 code inserts import_batches with status=(handOff?'staged':'processing') but does NOT check the
// error. If 'staged' violates a status CHECK constraint, the insert fails silently → no batch row → the
// worker's committed_data FK fails. This probe proves the real root cause by ATTEMPTING the insert.
// Disposable: it inserts test rows under a real tenant and DELETES them. Read-only otherwise. SR-44.
//   from web/:  npx tsx scripts/_hf362_fp49_probe.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(URL, KEY, { auth: { persistSession: false } });

async function main() {
  console.log('=== HF-362 FP-49 PROBE (batch-creation root cause) ===\n');

  // 1. Existing import_batches: what status values are actually in use + a real tenant_id for the test.
  const { data: existing, error: exErr } = await sb
    .from('import_batches')
    .select('tenant_id, status')
    .order('created_at', { ascending: false })
    .limit(200);
  if (exErr) { console.log('import_batches read ERR:', exErr.message); }
  const statuses = new Set<string>();
  let tenant: string | null = null;
  for (const r of existing ?? []) { statuses.add(r.status); if (!tenant) tenant = r.tenant_id; }
  console.log('import_batches DISTINCT status (recent 200):', [...statuses].join(', ') || '(none)');
  console.log('a real tenant_id for the test insert:', tenant ?? '(none found)');
  if (!tenant) { console.log('No tenant — cannot run the insert test.'); return; }

  // common columns (provide the NOT NULL file_hash_sha256 so only the STATUS varies between the two inserts).
  const common = { tenant_id: tenant, file_name: '__hf362_probe__', file_type: 'sci', row_count: 0, file_hash_sha256: 'hf362probe'.padEnd(64, '0'), content_unit_hash_sha256: 'hf362cu'.padEnd(64, '0') };

  // 2. ATTEMPT the hand-off insert: status='staged'. THIS is the line the worker's FK depends on.
  const stagedId = crypto.randomUUID();
  const { error: stagedErr } = await sb.from('import_batches').insert({ id: stagedId, status: 'staged', ...common });
  console.log(`\nINSERT status='staged'  → ${stagedErr ? 'ERR ' + (stagedErr.code ?? '') + ' ' + stagedErr.message : 'OK (row created)'}`);

  // 3. Control: status='processing' (the synchronous path's value — known good).
  const procId = crypto.randomUUID();
  const { error: procErr } = await sb.from('import_batches').insert({ id: procId, status: 'processing', ...common });
  console.log(`INSERT status='processing' → ${procErr ? 'ERR ' + (procErr.code ?? '') + ' ' + procErr.message : 'OK (row created)'}`);

  // 3b. Also try a couple of plausible already-allowed statuses to learn the constraint's vocabulary.
  for (const s of ['completed', 'failed', 'pending']) {
    const id = crypto.randomUUID();
    const { error } = await sb.from('import_batches').insert({ id, status: s, ...common });
    console.log(`INSERT status='${s}'`.padEnd(28) + ` → ${error ? 'ERR ' + (error.code ?? '') + ' ' + String(error.message).slice(0, 60) : 'OK'}`);
    if (!error) await sb.from('import_batches').delete().eq('id', id);
  }

  // 4. Verify whether the staged row actually exists (the FK target the worker needs).
  const { data: check } = await sb.from('import_batches').select('id, status').eq('id', stagedId).maybeSingle();
  console.log(`\nSELECT WHERE id=staged-test → ${check ? 'EXISTS status=' + check.status : 'EMPTY (no FK target — this is the live bug)'}`);

  // 5. pulse_load_jobs: the failed jobs + the FK error_detail (confirm the live symptom).
  const { data: jobs, error: jErr } = await sb
    .from('pulse_load_jobs')
    .select('id, status, error_detail, total_rows, rows_loaded')
    .order('created_at', { ascending: false })
    .limit(10);
  if (jErr) console.log('\npulse_load_jobs read ERR:', jErr.message);
  else {
    console.log('\nrecent pulse_load_jobs:');
    for (const j of jobs ?? []) console.log(`  ${j.status.padEnd(10)} loaded=${j.rows_loaded}/${j.total_rows}  err=${(j.error_detail ?? '').slice(0, 90)}`);
  }

  // 6. Cleanup the disposable test rows.
  await sb.from('import_batches').delete().in('id', [stagedId, procId]);
  console.log('\n(cleaned up test rows)');
  console.log('\n=== INTERPRET: if staged=ERR + processing=OK + staged-test EMPTY → the FK bug is the unchecked');
  console.log("    failing INSERT of status='staged' (CHECK constraint), NOT a missing insert. ===");
}
main().catch((e) => { console.error('[FATAL]', e instanceof Error ? e.message : e); process.exit(1); });
