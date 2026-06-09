// HF-276 Phase 3 verification — deterministic, on the REAL persisted c0 compositional_intent
// (rule_set a1b8684e, both variants) + a synthetic BCL-pattern guard. Runs the FIXED
// constructTree and evaluates OLD persisted DAG vs NEW DAG with sample metrics. Reconciliation-
// channel separation: calculated values reported verbatim; no ground-truth comparison.

import { createClient } from '@supabase/supabase-js';
import { constructTree } from '@/lib/plan-intelligence/intent-constructor';
import { evaluate, buildEvalContext } from '@/lib/calculation/intent-executor';
import type { PrimeNode } from '@/lib/calculation/intent-types';

const RSID = 'a1b8684e-272a-4d95-8a97-71b39e217d08';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// 110.3% income attainment, hub volume in the ≥1000/<2000 band.
const METRICS = { actual_income: 393346, income_goal: 356580, hub_loads_per_month: 1083 };

// the dim[0] (income attainment) breakpoint constants of the constructed DAG, in order.
function attainmentBreakConstants(dag: unknown): Array<{ value: number; scale?: number }> {
  const out: Array<{ value: number; scale?: number }> = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (n.prime === 'compare' && Array.isArray(n.inputs)) {
      const other = n.inputs.find((x: any) => x?.prime !== 'constant');
      const k = n.inputs.find((x: any) => x?.prime === 'constant');
      if (other?.prime === 'arithmetic' && other?.op === 'divide' && k) out.push({ value: k.value, scale: k.meta?.scale });
    }
    for (const key of ['inputs', 'then', 'else', 'condition', 'downstream']) {
      const v = n[key]; if (Array.isArray(v)) v.forEach(walk); else if (v) walk(v);
    }
  };
  walk(dag);
  return out;
}

let pass = 0, fail = 0;
const assert = (label: string, cond: boolean, detail: string) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label} — ${detail}`); cond ? pass++ : fail++; };

async function main() {
  const { data } = await sb.from('rule_sets').select('components').eq('id', RSID).single();
  const variants = (data as any).components.variants as any[];

  for (const v of variants) {
    const comp = (v.components || []).find((c: any) => c?.name === 'Rendimiento de Ingreso');
    if (!comp) continue;
    const ci = comp.metadata?.compositional_intent;
    const oldDag = (comp.metadata?.intent ?? comp.calculationIntent) as PrimeNode;
    const newDag = constructTree(ci) as unknown as PrimeNode;
    const ratio = METRICS.actual_income / METRICS.income_goal;
    const oldVal = Number(evaluate(oldDag, buildEvalContext({ entityId: 'v', metrics: METRICS, attributes: {} })));
    const newVal = Number(evaluate(newDag, buildEvalContext({ entityId: 'v', metrics: METRICS, attributes: {} })));
    const newBreaks = attainmentBreakConstants(newDag).map(b => b.value).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b);

    console.log(`\n==== variant "${v.variantId}" — scale ${JSON.stringify(ci?.scale)} ====`);
    console.log(`  income attainment ratio = ${ratio.toFixed(4)}`);
    console.log(`  OLD persisted DAG rawOutcome = ${oldVal}`);
    console.log(`  NEW constructed DAG rawOutcome = ${newVal}  | dim0 breakpoint constants now: [${newBreaks.join(', ')}]`);

    if (ci?.scale?.side === 'evaluator' && ci?.scale?.value === 100) {
      // The defective payee variant: ratio×100 (110.31) was compared against ratio-space breaks.
      assert(`${v.variantId}: NEW dim0 breakpoints are in percent space (80/90/100/130)`,
        newBreaks.join(',') === '80,90,100,130', `[${newBreaks.join(',')}]`);
      assert(`${v.variantId}: NEW tier differs from OLD top-tier (defect corrected)`,
        newVal !== oldVal, `old=${oldVal} new=${newVal}`);
    } else if (ci?.scale?.value === 1) {
      assert(`${v.variantId}: scale.value 1 → ×1 no-op (DD-7, OLD == NEW)`,
        newVal === oldVal, `old=${oldVal} new=${newVal}`);
      assert(`${v.variantId}: dim0 breakpoints unchanged (ratio space)`,
        newBreaks.join(',') === '0.8,0.9,1,1.3', `[${newBreaks.join(',')}]`);
    }
  }

  // ── BCL-pattern guard (§6A) ────────────────────────────────────────────────
  // A synthetic evaluator-side ratio-keyed band whose breakpoints are ALREADY in percent space
  // (85/90/95) with value 100. The pre-multiply would push them to 8500/9000/9500 — a
  // double-scale. This pattern does NOT occur in the Meridian recognition (evaluator-side breaks
  // are ratio-space). It is demonstrated here so the hazard is detectable; BCL must be re-checked
  // for this pattern at its first post-import calc.
  const bclPattern = {
    scale: { side: 'evaluator', unit: 'percent', value: 100, confidence: 0.9, reference_field: 'attainment' },
    structure: {
      shape: 'banded_lookup',
      outputs: [0, 100, 200, 300],
      dimensions: [{
        reference_field: 'attainment',
        reference_source: { type: 'ratio', numerator_field: 'a', denominator_field: 'b' },
        breaks: [85, 90, 95],
      }],
    },
  };
  const bclDag = constructTree(bclPattern as any) as unknown as PrimeNode;
  const bclBreaks = attainmentBreakConstants(bclDag).map(b => b.value).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b);
  console.log(`\n==== BCL-pattern guard (synthetic: evaluator-side ratio band, PERCENT breaks 85/90/95) ====`);
  console.log(`  pre-multiply result: [${bclBreaks.join(', ')}]`);
  const doubleScaled = bclBreaks.join(',') === '8500,9000,9500';
  console.log(`  ${doubleScaled ? '⚠️  DOUBLE-SCALED' : 'unchanged'} — this pattern is ABSENT from Meridian (evaluator breaks are ratio-space).`);
  console.log(`  ACTION: verify BCL's evaluator-side ratio bands emit ratio-space breaks at first post-import calc (BCL not yet re-imported).`);

  console.log(`\nPROOF: ${pass}/${pass + fail} assertions pass, ${fail} fail.`);
  if (fail > 0) process.exit(1);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
