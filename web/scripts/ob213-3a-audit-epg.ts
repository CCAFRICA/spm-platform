// OB-213 Phase 3A EPG — prove audit events persist to audit_logs + the page's read query surfaces
// them. Inserts a calc-run + a login audit row for BCL (the route's INSERT shape), then runs the
// admin/audit page read query (mapped). Idempotent (clears its sentinel rows first).
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob213-3a-audit-epg.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const TAG = 'ob213-3a-epg';

async function main() {
  console.log('================ OB-213 3A EPG — audit_logs persistence ================');
  await sb.from('audit_logs').delete().eq('tenant_id', BCL).contains('metadata', { tag: TAG });
  const { data: aBatch } = await sb.from('calculation_batches').select('id').eq('tenant_id', BCL).limit(1).maybeSingle();
  const batchId = (aBatch as { id?: string } | null)?.id ?? null; // resource_id is uuid-typed
  const ins = await sb.from('audit_logs').insert([
    { tenant_id: BCL, action: 'calculate', resource_type: 'calculation_batch', resource_id: batchId, metadata: { tag: TAG, entityCount: 85 } },
    { tenant_id: BCL, action: 'login', resource_type: 'user', resource_id: null, metadata: { tag: TAG, email: 'admin@bcl' } },
  ]).select('id');
  if (ins.error) { console.log(`  [FAIL] insert — ${ins.error.message}`); process.exit(1); }
  console.log(`  [PASS] inserted ${ins.data?.length} audit rows (calc-run + login emit shapes)`);

  // page read query (admin/audit/page.tsx loadLogs)
  const { data, error } = await sb.from('audit_logs')
    .select('id, action, resource_type, resource_id, changes, metadata, profile_id, ip_address, created_at')
    .eq('tenant_id', BCL).order('created_at', { ascending: false }).limit(500);
  if (error) { console.log(`  [FAIL] page read — ${error.message}`); process.exit(1); }
  const mapped = (data ?? []).map((r: Record<string, unknown>) => ({ action: r.action, entityType: r.resource_type, entityId: r.resource_id, when: r.created_at }));
  console.log(`  [PASS] page read returns ${mapped.length} BCL audit rows; sample:`);
  mapped.slice(0, 3).forEach((m) => console.log(`     · ${m.action} ${m.entityType} ${m.entityId ?? ''}`));
  const hasBoth = mapped.some((m) => m.action === 'calculate') && mapped.some((m) => m.action === 'login');
  console.log(`================ ${hasBoth ? '3A EPG PASS — calc-run + login persist + surface' : 'CHECK — missing an emit'} ================`);
  process.exit(hasBoth ? 0 : 1);
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
