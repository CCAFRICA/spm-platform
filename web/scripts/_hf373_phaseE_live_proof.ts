/** HF-373 EPG-E1 (CC fixture level) — live budget discovery, cap-independence upload proof,
 * and gzip ratio on a REAL staged part. Cleans up its probe objects. */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { gzipSync } from 'zlib';
import { discoverUploadByteBudget, discoverStagedLoadCapabilities } from '../src/lib/sci/pulse-budget';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  // 1. Budget discovery with the min-cap fix, against the LIVE bucket config (100MiB set by architect).
  const budget = await discoverUploadByteBudget(sb as never);
  console.log(`budget: effectiveLimit=${(budget.effectiveLimit / 1048576).toFixed(0)}MiB source=${budget.limitSource} byteBudget=${(budget.byteBudget / 1048576).toFixed(1)}MiB`);
  const caps = await discoverStagedLoadCapabilities(sb as never);
  console.log(`staged-load capabilities (pre-migration expectation: gzip=false): ${JSON.stringify(caps)}`);

  // 2. Cap-independence: a budget-sized object uploads; a pre-fix-sized (~84MB) object is rejected.
  const line = 'x'.repeat(1024 * 1024); // 1MiB chunk
  const mk = (mb: number) => Buffer.alloc(mb * 1024 * 1024, 120);
  const probePathOk = '_hf373_probe/budget_sized.bin';
  const okBody = mk(Math.floor(budget.byteBudget / 1048576)); // = budget (40MiB)
  let t0 = Date.now();
  const { error: okErr } = await sb.storage.from('ingestion-raw').upload(probePathOk, okBody, { upsert: true, contentType: 'application/octet-stream' });
  console.log(`upload ${(okBody.length / 1048576).toFixed(0)}MiB (== byteBudget): ${okErr ? 'REJECTED: ' + okErr.message : 'OK'} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const probePathBig = '_hf373_probe/prefix_sized.bin';
  const bigBody = mk(80); // the pre-fix ~84MB shape
  t0 = Date.now();
  const { error: bigErr } = await sb.storage.from('ingestion-raw').upload(probePathBig, bigBody, { upsert: true, contentType: 'application/octet-stream' });
  console.log(`upload 80MiB (the pre-fix part size): ${bigErr ? 'REJECTED: ' + bigErr.message : 'UNEXPECTEDLY OK'} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await sb.storage.from('ingestion-raw').remove([probePathOk, probePathBig]);
  console.log('probe objects removed');
  void line;

  // 3. gzip leverage on a REAL staged part from the 2026-07-01 working run.
  const realPart = '2d9979ba-5032-48a7-bccf-1928f3e6dadf/committed/2065cb12-c118-454a-956e-878970312206.csv';
  const { data: blob, error: dlErr } = await sb.storage.from('ingestion-raw').download(realPart);
  if (dlErr || !blob) { console.log(`real part download failed: ${dlErr?.message}`); return; }
  const buf = Buffer.from(await blob.arrayBuffer());
  const gz = gzipSync(buf);
  console.log(`real staged part: ${(buf.length / 1048576).toFixed(1)}MiB -> gzip ${(gz.length / 1048576).toFixed(2)}MiB (${(buf.length / gz.length).toFixed(1)}x)`);
})().catch(e => { console.log('threw:', e instanceof Error ? e.stack : String(e)); process.exit(1); });
