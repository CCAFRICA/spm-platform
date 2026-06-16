// OB-212 §C de-risk — does BCL calculation_results.metadata carry the forensic substrate the N3/N4
// recon tools read (binding_snapshot, roundingTrace)? RECON_RESPEC verified the shape on a Meridian row.
// The keystone session is BCL (batch 8f9bf397). READ-ONLY.
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob212-bcl-metadata-shape.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const MER = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
const j = (v: unknown, n = 420) => { const s = JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; };

async function shape(label: string, tenant: string, batchId?: string) {
  let q = sb.from('calculation_results').select('entity_id, total_payout, components, metadata').eq('tenant_id', tenant).limit(1);
  if (batchId) q = sb.from('calculation_results').select('entity_id, total_payout, components, metadata').eq('tenant_id', tenant).eq('batch_id', batchId).limit(1);
  const { data } = await q;
  const r: any = data?.[0];
  if (!r) { console.log(`\n=== ${label}: NO ROW ===`); return; }
  const md = r.metadata ?? {};
  console.log(`\n=== ${label} (entity ${String(r.entity_id).slice(0,8)}) ===`);
  console.log(`  metadata keys: ${j(Object.keys(md))}`);
  const bs = md.binding_snapshot, rt = md.roundingTrace, it = md.intentTraces;
  console.log(`  binding_snapshot: ${bs ? 'PRESENT keys=' + j(Object.keys(bs)) : 'ABSENT'}`);
  if (bs?.convergence_bindings_used) console.log(`    convergence_bindings_used keys: ${j(Object.keys(bs.convergence_bindings_used))}`);
  console.log(`  roundingTrace: ${rt ? 'PRESENT keys=' + j(Object.keys(rt)) : 'ABSENT'}${rt?.components ? ' components[' + rt.components.length + '] sample=' + j(rt.components[0], 240) : ''}`);
  console.log(`  intentTraces: ${Array.isArray(it) ? 'array[' + it.length + '] sample=' + j(it[0], 220) : (it ? 'present (non-array)' : 'ABSENT')}`);
  console.log(`  top-level components[0]: ${j((r.components || [])[0], 200)}`);
}

async function main() {
  console.log('================ BCL vs MERIDIAN metadata shape (read-only) ================');
  await shape('BCL keystone batch 8f9bf397', BCL, '8f9bf397-d024-484f-ac75-a7db5410f5b1');
  await shape('Meridian (RECON_RESPEC reference)', MER);
  console.log('\n================ END ================');
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
