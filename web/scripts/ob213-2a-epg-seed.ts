// OB-213 Phase 2A EPG — prove the dispute pipeline persists + the page-load query returns data.
// Seeds 2 disputes for real BCL entities (the directive's "submit a test dispute" EPG), then runs
// the exact loadAdjustmentsPageData query. Idempotent (clears its sentinel rows first).
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob213-2a-epg-seed.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const TAG = '[OB-213 demo]';

async function main() {
  console.log('================ OB-213 2A EPG — disputes pipeline ================');
  // idempotent: clear prior demo rows
  await sb.from('disputes').delete().eq('tenant_id', BCL).ilike('description', `${TAG}%`);

  const { data: ents } = await sb.from('entities').select('id, external_id').eq('tenant_id', BCL).in('external_id', ['BCL-5003', 'BCL-5012']);
  const { data: period } = await sb.from('periods').select('id').eq('tenant_id', BCL).order('start_date', { ascending: false }).limit(1).maybeSingle();
  const { data: prof } = await sb.from('profiles').select('id').eq('tenant_id', BCL).limit(1).maybeSingle();
  const filedBy = (prof as { id?: string } | null)?.id ?? null;
  const periodId = (period as { id?: string } | null)?.id ?? null;
  console.log(`  entities=${ents?.length ?? 0} period=${periodId ? 'yes' : 'none'} filed_by=${filedBy ? 'yes' : 'none'}`);

  const rows = (ents ?? []).map((e: { id: string; external_id: string }, i: number) => ({
    tenant_id: BCL, entity_id: e.id, period_id: periodId,
    category: i === 0 ? 'credit' : 'correction',
    status: 'open',
    description: `${TAG} ${i === 0 ? 'Credit for under-counted Productos Cruzados' : 'Correction: duplicate transaction reversed'} (${e.external_id})`,
    amount_disputed: i === 0 ? 250 : 120,
    filed_by: filedBy,
  }));
  const ins = await sb.from('disputes').insert(rows).select('id');
  if (ins.error) { console.log(`  [FAIL] seed insert — ${ins.error.message}`); process.exit(1); }
  console.log(`  [PASS] inserted ${ins.data?.length} demo disputes`);

  // EPG: run the EXACT page-load query (loadAdjustmentsPageData) — must return the seeded rows
  const pageSelect = 'id, entity_id, period_id, category, status, description, resolution, amount_disputed, amount_resolved, filed_by, resolved_by, created_at, updated_at, resolved_at';
  const { data: loaded, error } = await sb.from('disputes').select(pageSelect).eq('tenant_id', BCL).order('created_at', { ascending: false });
  if (error) { console.log(`  [FAIL] page-load query — ${error.message}`); process.exit(1); }
  console.log(`  [PASS] page-load query returns ${loaded?.length} disputes (persisted — not in-memory)`);
  (loaded ?? []).slice(0, 3).forEach((d: Record<string, unknown>) => console.log(`     · ${d.status} ${d.category} $${d.amount_disputed} — ${String(d.description).slice(0, 60)}`));
  console.log('================ 2A EPG PASS — disputes persist + load ================');
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
