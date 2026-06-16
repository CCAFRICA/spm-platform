// OB-212 N4 end-to-end proof — drives the REAL route handler (POST) directly (tsx resolves @/),
// bypassing only the auth middleware (N9 covers the browser/auth path). Proves: harness multi-turn
// run over the keystone deltas → agent_invocations (running→completed, turn_count>1, populated
// tool_calls) → identical second call returns cache_hit + cost_usd=0 (Progressive Performance).
// Real paid LLM call. Run: set -a && source .env.local && set +a && npx tsx scripts/ob212-n4-e2e-route.ts
import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { POST } from '../src/app/api/ai/agent/reconcile-diagnose/route';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const BODY = {
  tenantId: BCL,
  reconciliationSessionId: '120b50ad-063f-4729-8def-bd9944e139c2',
  entityId: 'BCL-5027',
  component: 'Productos Cruzados',
};
const mkReq = (b: unknown) =>
  new NextRequest('http://localhost/api/ai/agent/reconcile-diagnose', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(b),
  });

async function showRows(fp: string) {
  const { data } = await sb
    .from('agent_invocations')
    .select('id, status, turn_count, cache_hit, cost_usd, latency_ms, provider, model, token_usage, tool_calls, result, confidence, created_at')
    .eq('request_fingerprint', fp)
    .order('created_at', { ascending: true });
  (data ?? []).forEach((r: any, i: number) => {
    const tc = Array.isArray(r.tool_calls) ? r.tool_calls : [];
    console.log(`  row ${i + 1}: status=${r.status} cache_hit=${r.cache_hit} turn_count=${r.turn_count} tool_calls=${tc.length} cost_usd=${r.cost_usd} latency_ms=${r.latency_ms} model=${r.model} tokens=${JSON.stringify(r.token_usage)}`);
    if (tc.length) console.log(`         trajectory tools: ${tc.map((t: any) => t.tool).join(' → ')}`);
  });
  return data ?? [];
}

async function main() {
  console.log('================ OB-212 N4 END-TO-END (real route handler) ================');
  // deterministic fingerprint (must match route: {agent, tenantId, ...subjectRef})
  const fp = createHash('sha256')
    .update(JSON.stringify({ agent: 'reconciliation_diagnosis', tenantId: BCL, reconciliation_session_id: BODY.reconciliationSessionId, entity_id: BODY.entityId, component: BODY.component }))
    .digest('hex');
  await sb.from('agent_invocations').delete().eq('request_fingerprint', fp); // clean slate for a clean miss→hit
  console.log(`fingerprint=${fp.slice(0, 16)}… · subject=${BODY.entityId}/${BODY.component}`);

  console.log('\n--- CALL 1 (expect MISS → real multi-turn agent run) ---');
  const t1 = Date.now();
  const r1 = await POST(mkReq(BODY));
  const j1: any = await r1.json();
  console.log(`http=${r1.status} cached=${j1.cached} turnCount=${j1.turnCount} cost_usd=${j1.cost_usd} wall=${Date.now() - t1}ms`);
  console.log('DIAGNOSIS:\n' + String(j1.result?.diagnosis ?? j1.error ?? '').slice(0, 1600));

  console.log('\n--- CALL 2 (expect CACHE HIT, cost_usd=0) ---');
  const r2 = await POST(mkReq(BODY));
  const j2: any = await r2.json();
  console.log(`http=${r2.status} cached=${j2.cached} cache_hit=${j2.cache_hit} cost_usd=${j2.cost_usd}`);

  console.log('\n--- agent_invocations rows for this fingerprint ---');
  const rows = await showRows(fp);

  const completed = rows.find((r: any) => r.status === 'completed');
  const cached = rows.find((r: any) => r.status === 'cached');
  const ok =
    !!completed && (completed as any).turn_count > 1 && Array.isArray((completed as any).tool_calls) && (completed as any).tool_calls.length > 0 &&
    !!cached && (cached as any).cache_hit === true && Number((cached as any).cost_usd) === 0;
  console.log(`\n================ ${ok ? 'PASS — running→completed (turns>1, tool_calls populated) + cached(cost 0)' : 'CHECK FAILED — inspect rows above'} ================`);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
