/**
 * OB-245 end-to-end membrane verification (service-role) — run AFTER the HALT-A
 * migration is applied. Proves proof gates 1,2,3,4,7 against the REAL table,
 * bucket, and ClamAV engine.
 *
 * Run: npx tsx --env-file=.env.local scripts/ob245_verify.ts   (clamd on 3310)
 *
 * It uses the REAL lib/prism scan-provider + mime-detect (the gate's brain), and
 * replicates the scan-worker's storage/DB orchestration with a direct service-role
 * client (the worker module imports next/headers + @/ aliases, which tsx scripts
 * don't resolve). The real worker + routes are exercised in-browser (HALT-C); this
 * asserts the recorded-state truth the membrane must produce.
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { detectMimeFromBytes } from '../src/lib/prism/mime-detect';
import { createScanProvider } from '../src/lib/prism/scan-provider';
import { QUARANTINE_BUCKET, CLEAN_BUCKET } from '../src/lib/prism/types';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EICAR = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
const CSV = Buffer.from('vendedor,monto,fecha\nA,100,2026-01-01\nB,200,2026-01-02\n');

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

async function writeAudit(tenantId: string, action: string, fileId: string, changes: object) {
  await sb.from('audit_logs').insert({
    tenant_id: tenantId, profile_id: null, action, resource_type: 'file_object', resource_id: fileId, changes, metadata: {},
  });
}

/** Mirror of commit + scan-worker, using the REAL provider + mime-detect. */
async function runThroughMembrane(tenantId: string, ownerId: string, bytes: Buffer, filename: string) {
  const ts = Date.now() + Math.floor(performance.now());
  const qPath = `${tenantId}/${ownerId}/${ts}_${filename}`;
  const up = await sb.storage.from(QUARANTINE_BUCKET).upload(qPath, bytes, { upsert: false });
  if (up.error) throw new Error(`quarantine upload failed: ${up.error.message}`);

  const sha = createHash('sha256').update(bytes).digest('hex');
  const mime = detectMimeFromBytes(bytes);
  const ins = await sb.from('file_objects').insert({
    tenant_id: tenantId, owner_id: ownerId, content_sha256: sha, original_filename: filename,
    mime_detected: mime, byte_size: bytes.byteLength, state: 'received', quarantine_path: qPath, metadata: {},
  }).select('*').single();
  if (ins.error || !ins.data) throw new Error(`insert failed: ${ins.error?.message}`);
  const id = ins.data.id as string;
  await writeAudit(tenantId, 'file.received', id, { state: 'received', sha256: sha });
  await sb.from('file_objects').update({ state: 'quarantined' }).eq('id', id);
  await writeAudit(tenantId, 'file.quarantined', id, { to: 'quarantined' });

  // ── the gate ──
  await sb.from('file_objects').update({ state: 'scanning' }).eq('id', id);
  await writeAudit(tenantId, 'file.scan_started', id, {});
  const provider = createScanProvider(async () => bytes);
  const verdict = await provider.scan(qPath);

  if (verdict.verdict === 'clean') {
    const cleanPath = `${tenantId}/prism/${id}_${filename}`;
    const u2 = await sb.storage.from(CLEAN_BUCKET).upload(cleanPath, bytes, { contentType: mime, upsert: false });
    if (u2.error) throw new Error(`promote upload failed: ${u2.error.message}`);
    await sb.from('file_objects').update({ state: 'promoted', clean_path: cleanPath, scan_verdict: 'clean', scanned_at: new Date().toISOString(), promoted_at: new Date().toISOString() }).eq('id', id);
    await writeAudit(tenantId, 'file.scan_passed', id, { verdict: 'clean' });
    await writeAudit(tenantId, 'file.promoted', id, { clean_path: cleanPath });
    return { id, qPath, cleanPath, mime, finalState: 'promoted' as const };
  }
  await sb.from('file_objects').update({ state: 'infected_held', scan_verdict: verdict.verdict, scanned_at: new Date().toISOString() }).eq('id', id);
  await writeAudit(tenantId, 'file.scan_failed', id, { verdict: verdict.verdict, detail: verdict.detail });
  await writeAudit(tenantId, 'file.held', id, { reason: verdict.verdict });
  return { id, qPath, cleanPath: null, mime, finalState: 'infected_held' as const };
}

async function actionsFor(id: string): Promise<string[]> {
  const { data } = await sb.from('audit_logs').select('action').eq('resource_type', 'file_object').eq('resource_id', id);
  return (data ?? []).map((r: { action: string }) => r.action);
}

async function objectExists(bucket: string, path: string): Promise<boolean> {
  const dir = path.split('/').slice(0, -1).join('/');
  const name = path.split('/').pop()!;
  const { data } = await sb.storage.from(bucket).list(dir);
  return (data ?? []).some((o) => o.name === name);
}

async function main() {
  const { data: prof, error: pErr } = await sb.from('profiles').select('tenant_id, auth_user_id, role').not('tenant_id', 'is', null).limit(1).maybeSingle();
  if (pErr || !prof) throw new Error(`no profile found to use as owner: ${pErr?.message}`);
  const tenantId = prof.tenant_id as string;
  const ownerId = prof.auth_user_id as string;
  console.log(`Using tenant=${tenantId} owner=${ownerId} role=${prof.role}\n`);

  console.log('=== Gate 1+4: EICAR is HELD, never promoted, bytes RETAINED ===');
  const eicar = await runThroughMembrane(tenantId, ownerId, EICAR, 'invoice.csv');
  check('EICAR final state = infected_held', eicar.finalState === 'infected_held');
  check('EICAR NOT in ingestion-raw', !(await objectExists(CLEAN_BUCKET, `${tenantId}/prism/${eicar.id}_invoice.csv`)));
  check('EICAR bytes RETAINED in quarantine (Carry Everything)', await objectExists(QUARANTINE_BUCKET, eicar.qPath));
  const eicarActions = await actionsFor(eicar.id);
  check('file.held recorded', eicarActions.includes('file.held'), eicarActions.join(','));

  console.log('\n=== Gate 2+3: clean file PROMOTED, present in ingestion-raw, audit chain ===');
  const clean = await runThroughMembrane(tenantId, ownerId, CSV, 'sales.csv');
  check('clean final state = promoted', clean.finalState === 'promoted');
  check('clean present in ingestion-raw', clean.cleanPath ? await objectExists(CLEAN_BUCKET, clean.cleanPath) : false);
  const cleanActions = await actionsFor(clean.id);
  check('file.scan_passed + file.promoted recorded', cleanActions.includes('file.scan_passed') && cleanActions.includes('file.promoted'), cleanActions.join(','));

  console.log('\n=== Gate 5 (DB): mime follows CONTENT despite .xlsx extension ===');
  const korean = await runThroughMembrane(tenantId, ownerId, CSV, 'renamed_to.xlsx');
  check('CSV-bytes-named-.xlsx → mime_detected text/csv', korean.mime === 'text/csv', korean.mime);

  console.log(`\n${failures === 0 ? '✅ ALL E2E GATES PASS' : `❌ ${failures} FAILURE(S)`}`);
  console.log('\n(Gate 6 RLS: verify in SQL Editor / browser per HALT-C — see completion report SQL block.)');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('verify crashed (is the migration applied?):', e);
  process.exit(1);
});
