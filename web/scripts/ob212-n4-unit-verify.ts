// OB-212 N3/N4 handler unit-verify (READ-ONLY, no LLM). Exercises every tool through the assembled
// agent definition against real data: keystone session 120b50ad, BCL batch 8f9bf397, rule_set 54fe1094.
// Run: set -a && source .env.local && set +a && npx tsx scripts/ob212-n4-unit-verify.ts
import { createClient } from '@supabase/supabase-js';
import { createReconciliationDiagnosisAgent } from '../src/lib/ai/agent/reconciliation-diagnosis-agent';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const SESSION = '120b50ad-063f-4729-8def-bd9944e139c2';
const BATCH_B = '8f9bf397-d024-484f-ac75-a7db5410f5b1';
const RULESET = '54fe1094-89fc-4ea9-a439-14ce44af3911';
const j = (v: unknown, n = 700) => { const s = JSON.stringify(v, null, 0); return s && s.length > n ? s.slice(0, n) + '…' : s; };

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { (ok ? pass++ : fail++); console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`); };

async function main() {
  console.log('================ OB-212 N3/N4 HANDLER UNIT-VERIFY ================');
  const agent = createReconciliationDiagnosisAgent({ supabase: sb as any, tenantId: BCL });
  console.log(`agent="${agent.name}" maxTurns=${agent.maxTurns} tools=${agent.tools.map((t) => t.name).join(', ')}`);
  check('agent exposes all 6 tools', agent.tools.length === 6);
  check('every tool has a handler', agent.tools.every((t) => typeof agent.handlers[t.name] === 'function'));
  const H = agent.handlers;

  console.log('\n=== get_benchmark_value (BCL-5027) ===');
  const bv: any = await H.get_benchmark_value({ reconciliation_session_id: SESSION, entity_id: 'BCL-5027' });
  console.log('  ', j(bv));
  check('benchmark has component deltas', Array.isArray(bv.components) && bv.components.length >= 3 && bv.components.some((c: any) => Math.abs(c.delta) > 0));
  check('fileValue != vlValue on ≥1 component (real delta)', bv.components.some((c: any) => c.fileValue !== c.vlValue));

  console.log('\n=== get_benchmark_value (single component filter) ===');
  const bvc: any = await H.get_benchmark_value({ reconciliation_session_id: SESSION, entity_id: 'BCL-5027', component_name: 'Colocación de Crédito' });
  check('component filter returns exactly 1', bvc.components?.length === 1, j(bvc.components));

  console.log('\n=== get_entity_calculation_trace (BCL-5027 @ batch B) ===');
  const tr: any = await H.get_entity_calculation_trace({ entity_id: 'BCL-5027', batch_id: BATCH_B });
  console.log('  rule_set_id=', tr.rule_set_id, 'engine_version=', tr.engine_version, 'total=', tr.total_payout);
  console.log('  components[0]=', j(tr.components?.[0], 600));
  check('trace returns components with payout', Array.isArray(tr.components) && tr.components.length >= 4 && tr.components[0].payout != null);
  check('trace surfaces rule_set_id (for intent lookup)', tr.rule_set_id === RULESET);
  check('binding forensic present (per-comp bindings OR full slot map)', !!(tr.components?.[0]?.bindings) || Object.keys(tr.binding_snapshot?.all_binding_slots ?? {}).length > 0);
  check('roundingTrace fields present', tr.components?.[0]?.rawValue != null && tr.components?.[0]?.precision != null);

  console.log('\n=== get_component_intent_structure (rule_set, component 0) ===');
  const ci: any = await H.get_component_intent_structure({ rule_set_id: RULESET, component_index: 0 });
  console.log('  variants=', (ci.variants ?? []).map((v: any) => `${v.variantId}:${v.component?.name}(intent=${v.component?.intent ? 'yes' : 'no'})`).join(' · '));
  check('intent structure returns variant components with intent', (ci.variants ?? []).length >= 1 && ci.variants.some((v: any) => v.component?.intent));

  console.log('\n=== find_entities_with_similar_delta (total ∈ [-50,50]) ===');
  const fe: any = await H.find_entities_with_similar_delta({ reconciliation_session_id: SESSION, component_index_or_name: 'total', delta_range_min: -50, delta_range_max: 50 });
  console.log('  count=', fe.count, 'sample=', j(fe.entities?.slice(0, 5)));
  check('similar-delta scan returns a bounded list', typeof fe.count === 'number' && Array.isArray(fe.entities) && fe.entities.length <= 50);

  console.log('\n=== get_entity_committed_data (BCL-5027) ===');
  const cd: any = await H.get_entity_committed_data({ entity_id: 'BCL-5027' });
  check('committed_data returns rows', typeof cd.count === 'number', `count=${cd.count} types=${j((cd.rows ?? []).map((r: any) => r.data_type))}`);

  console.log('\n=== check_boundary_resolution (pure) ===');
  const br1: any = await H.check_boundary_resolution({ value: 100, boundaries: [60, 100, 120] });
  const br2: any = await H.check_boundary_resolution({ value: 82.52, boundaries: [60, 100, 120] });
  console.log('  value=100→', j(br1), '\n  value=82.52→', j(br2));
  check('boundary: on-edge detected at 100', br1.onEdge === true);
  check('boundary: 82.52 lands in band & not on edge', br2.onEdge === false && typeof br2.bandIndex === 'number');

  console.log('\n=== error handling (unknown entity) ===');
  const err: any = await H.get_benchmark_value({ reconciliation_session_id: SESSION, entity_id: 'BCL-DOESNOTEXIST' });
  check('unknown entity returns structured error (not throw)', !!err.error);

  console.log(`\n================ RESULT: ${fail === 0 ? 'ALL ' + pass + ' CHECKS PASS' : pass + ' pass / ' + fail + ' FAIL'} ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
