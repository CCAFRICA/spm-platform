// HF-274 Phase 2 verification — deterministic, on Meridian's REAL persisted
// compositional_intent. No re-import, no LLM. Runs the FIXED constructTree on the
// persisted c1/c0 compositional_intent and evaluates the resulting DAG with real
// sample metrics, proving the ratio-keyed band now scales (0 → non-zero) where the
// OLD persisted DAG floors to 0. Reconciliation-channel separation: calculated
// values reported verbatim; no ground-truth comparison.

import { createClient } from '@supabase/supabase-js';
import { constructTree } from '@/lib/plan-intelligence/intent-constructor';
import { evaluate, buildEvalContext } from '@/lib/calculation/intent-executor';
import type { PrimeNode } from '@/lib/calculation/intent-types';

const RS = '66282b16-cc33-4898-9a5d-70a512d684fd';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// Does any compare-constant in the constructed DAG carry meta.scale?
function hasScaledBreakpoint(node: unknown): { found: boolean; scale?: number } {
  let found = false, scale: number | undefined;
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (n.prime === 'constant' && n.meta && typeof n.meta.scale === 'number') { found = true; scale = n.meta.scale; }
    for (const k of ['inputs','then','else','condition','downstream']) {
      const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v) walk(v);
    }
  };
  walk(node);
  return { found, scale };
}

async function main() {
  const { data } = await sb.from('rule_sets').select('components').eq('id', RS).single();
  const flat = (data as any).components.variants.flatMap((v: any) => v.components ?? []);

  const cases = [
    { idx: 1, name: 'c1 Entrega a Tiempo', metrics: { on_time_deliveries: 55, total_deliveries: 57 } }, // 55/57 = 0.965
    { idx: 0, name: 'c0 Rendimiento de Ingreso', metrics: { ingreso_real: 313859, ingreso_meta: 407530, cargas_mes_hub: 1092 } }, // 0.770
  ];

  let pass = 0, fail = 0;
  const assert = (label: string, cond: boolean, detail: string) => { console.log(`${cond?'PASS':'FAIL'}  ${label} — ${detail}`); cond?pass++:fail++; };

  for (const c of cases) {
    const comp = flat[c.idx];
    const ci = comp?.metadata?.compositional_intent;
    const oldDag = (comp?.metadata?.intent ?? comp?.calculationIntent) as PrimeNode;
    console.log(`\n==== ${c.name} ====`);
    console.log('declared scale:', JSON.stringify(ci?.scale));

    // Evaluate the OLD persisted DAG (no scale meta) with the sample metrics.
    const ctx = buildEvalContext({ entityId: 'verify', metrics: c.metrics, attributes: {} });
    const oldVal = Number(evaluate(oldDag, ctx));

    // Construct the NEW DAG from the SAME persisted compositional_intent via the fixed constructTree.
    const newDag = constructTree(ci) as unknown as PrimeNode;
    const newScaled = hasScaledBreakpoint(newDag);
    const newVal = Number(evaluate(newDag, buildEvalContext({ entityId: 'verify', metrics: c.metrics, attributes: {} })));

    console.log(`OLD persisted DAG rawOutcome = ${oldVal}`);
    console.log(`NEW constructed DAG: breakpoint carries meta.scale=${newScaled.scale ?? '(none)'} → rawOutcome = ${newVal}`);

    if (ci?.scale?.side === 'convergence' && (ci?.structure?.dimensions?.[0]?.reference_source?.type === 'ratio')) {
      assert(`${c.name}: OLD DAG floors to 0 (the defect)`, oldVal === 0, `oldVal=${oldVal}`);
      assert(`${c.name}: NEW DAG breakpoint carries meta.scale (HF-274 fix applied)`, newScaled.found === true, `scale=${newScaled.scale}`);
      assert(`${c.name}: NEW DAG rawOutcome is NON-ZERO (fix flips the floor)`, newVal > 0, `newVal=${newVal}`);
    } else {
      console.log(`(c${c.idx} band key is not a convergence-scaled ratio; structural check only)`);
      assert(`${c.name}: NEW DAG constructs (DD-7 — no scale meta where not a ratio key)`, !!newDag, 'constructed');
    }
  }
  console.log(`\nPROOF: ${pass}/${pass+fail} assertions pass, ${fail} fail.`);
  if (fail > 0) process.exit(1);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
