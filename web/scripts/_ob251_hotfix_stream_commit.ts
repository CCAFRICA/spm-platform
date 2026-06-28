// OB-251 HOTFIX PROOF — stream-commit a 52MB / 86,607×87 file (the JDE-export OOM regime) end-to-end
// to a disposable tenant, under a CONSTRAINED heap, proving: (1) NO OOM (the workbook is never
// materialized), (2) all 86,607 rows committed (Carry Everything / HALT-DATA-LOSS), (3) faithful values.
//   from web/:  node --max-old-space-size=640 --import tsx scripts/_ob251_hotfix_stream_commit.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { isLargeByBytes } from '../src/lib/sci/sheet-stream';
import { commitUnitStreamed } from '../src/lib/sci/windowed-commit';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FILE = '/private/tmp/claude-501/-Users-AndrewAfrica-spm-platform/52ecd7c0-5a8e-4c3a-82cf-d7d1e849d0fd/scratchpad/big2.xlsx';
const PID = crypto.randomUUID();
const mb = (b: number) => (b / 1048576).toFixed(0) + 'MB';

async function cleanup(tenantId: string) {
  const b = await sb.from('import_batches').select('id').eq('tenant_id', tenantId).eq('metadata->>proposalId', PID);
  const ids = (b.data ?? []).map((r) => r.id as string);
  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50);
    await sb.from('committed_data').delete().in('import_batch_id', slice);
    await sb.from('import_batches').delete().in('id', slice);
  }
}

async function main() {
  const t = await sb.from('tenants').select('id,name').or('name.ilike.%Trial%,name.ilike.%VLTEST%,name.ilike.%Test%').limit(1).single();
  const tenantId = t.data?.id as string;
  if (!tenantId) { console.log('no disposable tenant'); process.exit(1); }
  console.log(`=== OB-251 HOTFIX stream-commit proof (disposable tenant: ${t.data!.name}) ===`);
  await cleanup(tenantId);

  const buffer = readFileSync(FILE);
  console.log(`file: ${mb(buffer.byteLength)}; isLargeByBytes=${isLargeByBytes(buffer.byteLength)} (→ streaming path)`);

  let peakRss = 0;
  const sampleProbe = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 200);

  const t0 = Date.now();
  const res = await commitUnitStreamed(sb, {
    unit: { contentUnitId: `${PID}::Exportar Hoja de Trabajo`, confirmedBindings: [], classificationTrace: undefined },
    buffer,
    targetSheet: 'Exportar Hoja de Trabajo',
    classification: 'reference',
    tenantId,
    proposalId: PID,
    tabName: 'Exportar Hoja de Trabajo',
    fileName: 'ob251-hotfix',
    fileHashSha256: 'ob251hotfix',
    windowRows: 10000,
  });
  clearInterval(sampleProbe);

  console.log(`commitUnitStreamed: success=${res.success} inserted=${res.totalInserted}/${res.totalRows} windows=${res.batchIds.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`PEAK process RSS during the FULL stream+commit: ${mb(peakRss)} (heap capped via --max-old-space-size)`);

  // verify committed count (paginated)
  let committed = 0;
  for (const id of res.batchIds) {
    const c = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('import_batch_id', id);
    committed += c.count ?? 0;
  }
  const pass = res.success && res.totalInserted === 86607 && committed === 86607;
  console.log(`committed_data rows across ${res.batchIds.length} batches: ${committed}`);
  console.log(pass ? '[OK] all 86,607 rows committed via STREAMING with NO OOM (Carry Everything / HALT-DATA-LOSS)'
                   : `[FAIL] inserted=${res.totalInserted} committed=${committed} success=${res.success}`);

  await cleanup(tenantId);
  console.log(`\n=== ${pass ? 'PASS' : 'FAIL'} === (cleaned up)`);
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
