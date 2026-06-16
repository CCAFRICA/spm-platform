// OB-212 N7/N8b data-path verify (READ-ONLY). Replicates the observatory route's computeAgentOps (N7)
// + the agent-surface half of computeAISubstrate (N8b) against the real agent_invocations rows, to
// confirm they populate. The UI render + the auth-gated route are proven at N9 (browser).
// Run: set -a && source .env.local && set +a && npx tsx scripts/ob212-n7-n8b-verify.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const round4 = (n: number) => Math.round(n * 10000) / 10000;

async function main() {
  console.log('================ OB-212 N7/N8b DATA-PATH VERIFY ================');
  const { data: rows, error } = await sb
    .from('agent_invocations')
    .select('agent_name, invocation_type, status, turn_count, latency_ms, cost_usd, cache_hit, provider, model, created_at')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) { console.log('agent_invocations read error:', error.message); process.exit(1); }
  const all = rows ?? [];
  console.log(`agent_invocations rows: ${all.length}`);

  // ---- N7: computeAgentOps replica ----
  const statusCounts: Record<string, number> = {};
  let totalCost = 0, cacheHits = 0;
  const ag = new Map<string, any>();
  for (const r of all) {
    const status = String(r.status ?? 'unknown');
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    totalCost += Number(r.cost_usd) || 0;
    if (r.cache_hit) cacheHits++;
    const name = String(r.agent_name ?? 'unknown');
    const cur = ag.get(name) ?? { agentName: name, runs: 0, completed: 0, failed: 0, cached: 0, cost: 0, latencySum: 0, latencyN: 0, cacheHits: 0, lastRunAt: null };
    cur.runs++;
    if (status === 'completed') cur.completed++; else if (status === 'failed') cur.failed++; else if (status === 'cached') cur.cached++;
    cur.cost += Number(r.cost_usd) || 0;
    if (!r.cache_hit && r.latency_ms != null) { cur.latencySum += Number(r.latency_ms); cur.latencyN++; }
    if (r.cache_hit) cur.cacheHits++;
    if (r.created_at && (!cur.lastRunAt || r.created_at > cur.lastRunAt)) cur.lastRunAt = r.created_at;
    ag.set(name, cur);
  }
  const agents = Array.from(ag.values()).map((a) => ({ agentName: a.agentName, runs: a.runs, completed: a.completed, failed: a.failed, cached: a.cached, totalCostUSD: round4(a.cost), avgLatencyMs: a.latencyN ? Math.round(a.latencySum / a.latencyN) : 0, cacheHitRate: a.runs ? a.cacheHits / a.runs : 0, lastRunAt: a.lastRunAt }));
  console.log('\n=== N7 Agent Operations ===');
  console.log(`  totalRuns=${all.length} statusCounts=${JSON.stringify(statusCounts)} totalCostUSD=${round4(totalCost)} cacheHitRate=${all.length ? (cacheHits / all.length).toFixed(2) : 0}`);
  agents.forEach((a) => console.log(`  agent "${a.agentName}": runs=${a.runs} ok=${a.completed} fail=${a.failed} cached=${a.cached} cost=$${a.totalCostUSD} avgLatency=${a.avgLatencyMs}ms cache=${Math.round(a.cacheHitRate * 100)}% last=${a.lastRunAt}`));

  // ---- N8b: agent surfaces (computeAISubstrate agent half) ----
  const surf = new Map<string, any>();
  for (const r of all) {
    const key = `${r.agent_name}|${r.provider}|${r.model}`;
    const cur = surf.get(key) ?? { surface: r.agent_name, provider: r.provider, model: r.model, calls: 0, cost: 0, cacheHits: 0 };
    cur.calls++; cur.cost += Number(r.cost_usd) || 0; if (r.cache_hit) cur.cacheHits++;
    surf.set(key, cur);
  }
  console.log('\n=== N8b AI Substrate — agent rows ===');
  Array.from(surf.values()).forEach((d) => console.log(`  surface="${d.surface}" kind=agent ${d.provider}/${d.model} calls=${d.calls} cost=$${round4(d.cost)} cache=${Math.round((d.cacheHits / d.calls) * 100)}%`));

  const ok = all.length > 0 && agents.some((a) => a.agentName === 'reconciliation_diagnosis') && surf.size > 0;
  console.log(`\n================ ${ok ? 'PASS — agentOps + agent surfaces populate from real rows' : 'FAIL — no agent rows'} ================`);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
