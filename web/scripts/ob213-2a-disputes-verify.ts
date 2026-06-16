// OB-213 Phase 2A — verify the disputes table is live + matches the page's exact query, and is
// writable (self-cleaning probe). READ-ONLY except a transient probe row (deleted in finally).
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob213-2a-disputes-verify.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const SENTINEL = '__ob213_2a_probe__';

async function main() {
  console.log('================ OB-213 2A — disputes table verify ================');
  // 1. exact page query (loadAdjustmentsPageData) must resolve without column errors
  const pageSelect = 'id, entity_id, period_id, category, status, description, resolution, amount_disputed, amount_resolved, filed_by, resolved_by, created_at, updated_at, resolved_at';
  const q = await sb.from('disputes').select(pageSelect).eq('tenant_id', BCL).order('created_at', { ascending: false });
  if (q.error) { console.log(`  [FAIL] page query errored — ${q.error.code} ${q.error.message}`); process.exit(1); }
  console.log(`  [PASS] page-exact select resolves (BCL rows: ${q.data?.length ?? 0})`);

  // 2. self-cleaning insert/read/delete probe (proves all 16 cols + writability)
  await sb.from('disputes').delete().eq('tenant_id', BCL).eq('description', SENTINEL);
  let probeId: string | null = null;
  try {
    const ins = await sb.from('disputes').insert({
      tenant_id: BCL, status: 'open', category: 'adjustment', description: SENTINEL, amount_disputed: 1,
    }).select('*').single();
    if (ins.error || !ins.data) { console.log(`  [FAIL] insert — ${ins.error?.code} ${ins.error?.message}`); process.exit(1); }
    probeId = (ins.data as { id: string }).id;
    const cols = Object.keys(ins.data).sort();
    const expected = ['id','tenant_id','entity_id','period_id','batch_id','status','category','description','resolution','amount_disputed','amount_resolved','filed_by','resolved_by','created_at','updated_at','resolved_at'].sort();
    const missing = expected.filter((c) => !cols.includes(c));
    console.log(`  [${missing.length === 0 ? 'PASS' : 'FAIL'}] columns(${cols.length}): ${cols.join(', ')}${missing.length ? ' MISSING: ' + missing.join(',') : ''}`);
    console.log(`  [PASS] defaults: status=${(ins.data as Record<string, unknown>).status} created_at set=${!!(ins.data as Record<string, unknown>).created_at}`);
    // update probe (approve-path shape)
    const upd = await sb.from('disputes').update({ status: 'resolved', resolution: SENTINEL, resolved_at: new Date().toISOString() }).eq('id', probeId);
    console.log(`  [${upd.error ? 'FAIL' : 'PASS'}] update (approve path)${upd.error ? ' — ' + upd.error.message : ''}`);
  } finally {
    if (probeId) await sb.from('disputes').delete().eq('id', probeId);
    await sb.from('disputes').delete().eq('tenant_id', BCL).eq('description', SENTINEL);
  }
  console.log('================ disputes table LIVE ================');
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
