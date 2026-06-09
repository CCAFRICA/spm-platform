// HF-277 verification. Prefers REAL persisted intents (Meridian c0, BCL c1); falls back to
// synthetic when a tenant is mid re-import (rule_set absent). Proves: (Meridian) omitting
// meta.scale on an evaluator-side DAG ratio fixes the wrong-tier overpay; (DD-7) a value=1
// band is unchanged; and makes EXPLICIT the safety dependency — HF-277 is correct iff the
// evaluator-side ratio breaks are RATIO-space. Reconciliation-channel: calculated values only.

import { createClient } from '@supabase/supabase-js';
import { constructTree } from '@/lib/plan-intelligence/intent-constructor';
import { evaluate, buildEvalContext } from '@/lib/calculation/intent-executor';
import type { PrimeNode } from '@/lib/calculation/intent-types';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const MERIDIAN = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

let pass = 0, fail = 0;
const assert = (label: string, cond: boolean, detail: string) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label} — ${detail}`); cond ? pass++ : fail++; };

// Clone a DAG and inject meta.scale onto every ratio-keyed compare constant — simulates the
// PRE-HF-277 "attach" behaviour for OLD-vs-NEW comparison from the same NEW-constructed tree.
function withScaleMeta(node: any, scaleVal: number): any {
  if (!node || typeof node !== 'object') return node;
  const c = Array.isArray(node) ? node.map(n => withScaleMeta(n, scaleVal)) : { ...node };
  if (!Array.isArray(node) && node.prime === 'compare' && Array.isArray(node.inputs)) {
    const otherIsRatio = node.inputs.some((x: any) => x?.prime === 'arithmetic' && x?.op === 'divide');
    c.inputs = node.inputs.map((x: any) => {
      if (x?.prime === 'constant' && otherIsRatio) return { ...x, meta: { unit: 'percent', scale: scaleVal, confidence: 0.95 } };
      return withScaleMeta(x, scaleVal);
    });
    return c;
  }
  for (const k of ['inputs', 'then', 'else', 'condition', 'downstream']) if (node[k] !== undefined) c[k] = withScaleMeta(node[k], scaleVal);
  return c;
}
const hasRatioBreakMeta = (dag: any): boolean => {
  let found = false;
  const walk = (n: any) => { if (!n || typeof n !== 'object' || found) return;
    if (n.prime === 'compare' && n.inputs?.some((x: any) => x?.prime === 'arithmetic' && x?.op === 'divide')) {
      if (n.inputs.some((x: any) => x?.prime === 'constant' && x?.meta?.scale !== undefined)) { found = true; return; }
    }
    for (const k of ['inputs', 'then', 'else', 'condition', 'downstream']) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v) walk(v); }
  };
  walk(dag); return found;
};

// A synthetic single-dim evaluator-side ratio band. breaks + scale parameterised.
function band(breaks: number[], outputs: number[], scaleValue: number) {
  return {
    scale: { side: 'evaluator', unit: scaleValue === 1 ? 'ratio' : 'percent', value: scaleValue, confidence: 0.95, reference_field: 'attainment' },
    structure: { shape: 'banded_lookup', outputs, dimensions: [{ reference_field: 'attainment', reference_source: { type: 'ratio', numerator_field: 'a', denominator_field: 'b' }, breaks }] },
  };
}
const ev = (dag: PrimeNode, a: number, b: number) => Number(evaluate(dag, buildEvalContext({ entityId: 'v', metrics: { a, b }, attributes: {} })));

async function tryReal(tenant: string, predicate: (ci: any) => boolean) {
  const { data } = await sb.from('rule_sets').select('components').eq('tenant_id', tenant).eq('status', 'active').order('created_at', { ascending: false }).limit(1);
  if (!data?.[0]) return null;
  const variants = (data[0] as any).components.variants ?? [{ components: (data[0] as any).components.components ?? (data[0] as any).components }];
  for (const v of variants) for (const c of (v.components || [])) { const ci = c?.metadata?.compositional_intent; if (ci && predicate(ci)) return { name: c.name, variantId: v.variantId, ci }; }
  return null;
}

async function main() {
  // ── Meridian c0 (the fix) — real if present, else synthetic from the known config ──
  console.log('=== Meridian c0 Coordinador (evaluator + ratio, scale.value=100, ratio-space breaks) ===');
  const realMer = await tryReal(MERIDIAN, ci => ci?.scale?.side === 'evaluator' && ci?.structure?.dimensions?.[0]?.reference_source?.type === 'ratio' && ci?.scale?.value === 100);
  const merCi = realMer?.ci ?? band([0.8, 0.9, 1.0, 1.3], [0, 100, 200, 300, 400], 100);
  console.log(`  source: ${realMer ? `REAL (${realMer.variantId} "${realMer.name}")` : 'SYNTHETIC (real rule_set absent — tenant mid re-import; known config from prior read)'}`);
  const merNew = constructTree(merCi as any) as unknown as PrimeNode;       // HF-277: omits meta on evaluator+ratio
  const merOld = withScaleMeta(merNew, 100) as PrimeNode;                    // pre-HF-277: meta.scale=100 attached
  const oldVal = ev(merOld, 393346, 356580), newVal = ev(merNew, 393346, 356580); // 1.1031 ratio
  assert('Meridian: NEW DAG has NO meta.scale on the ratio break (HF-277 omits)', !hasRatioBreakMeta(merNew), `hasMeta=${hasRatioBreakMeta(merNew)}`);
  assert('Meridian: OLD (meta.scale=100) tiers HIGHER than NEW (defect corrected)', oldVal > newVal, `old=${oldVal} new=${newVal}`);

  // ── DD-7: value=1 evaluator-ratio band — omit is identical to ×1 no-op ──
  console.log('\n=== DD-7: evaluator + ratio, scale.value=1, ratio-space breaks ===');
  const v1New = constructTree(band([0.8, 0.9, 1.0, 1.3], [0, 100, 200, 300, 400], 1) as any) as unknown as PrimeNode;
  const v1Old = withScaleMeta(v1New, 1) as PrimeNode;
  assert('value=1: OLD (meta.scale=1) === NEW (no meta) — omitting a ×1 no-op is identical (DD-7)',
    ev(v1Old, 393346, 356580) === ev(v1New, 393346, 356580), `old=${ev(v1Old,393346,356580)} new=${ev(v1New,393346,356580)}`);

  // ── BCL c1 SAFETY GATE (Test 2) ──
  console.log('\n=== BCL c1 SAFETY GATE — HF-277 is safe iff evaluator-ratio breaks are RATIO-space ===');
  const realBcl = await tryReal(BCL, ci => ci?.scale?.side === 'evaluator' && ci?.structure?.dimensions?.[0]?.reference_source?.type === 'ratio');
  if (realBcl) {
    const bNew = constructTree(realBcl.ci as any) as unknown as PrimeNode;
    const bOld = withScaleMeta(bNew, realBcl.ci.scale.value) as PrimeNode;
    // sample a mid deposit attainment; use the real break magnitudes to pick a representative ratio
    const o = ev(bOld, 58, 100), n = ev(bNew, 58, 100);
    console.log(`  REAL BCL "${realBcl.name}" (${realBcl.variantId}) scale=${JSON.stringify(realBcl.ci.scale)} breaks=${JSON.stringify(realBcl.ci.structure?.dimensions?.[0]?.breaks)}`);
    assert('BCL Test 2: OLD === NEW (DD-7 — omitting scale does not change BCL)', o === n, `old=${o} new=${n}`);
  } else {
    console.log('  ⚠️  BCL has NO active rule_set (mid re-import) — the REAL Test 2 gate CANNOT run.');
    console.log('  Demonstrating the two hypotheses for BCL c1 (evaluator + ratio):');
    // Hypothesis A: ratio-space breaks, value=1 → omit is a no-op → SAFE
    const aNew = constructTree(band([0.5, 0.7, 0.9], [0, 100, 200, 300], 1) as any) as unknown as PrimeNode;
    const aOld = withScaleMeta(aNew, 1) as PrimeNode;
    console.log(`    A) ratio-space breaks [0.5,0.7,0.9], value=1: OLD=${ev(aOld,58,100)} NEW=${ev(aNew,58,100)} → ${ev(aOld,58,100)===ev(aNew,58,100)?'SAFE (no-op)':'CHANGED'}`);
    // Hypothesis B: percent-space breaks, value=100 → omit floors the ratio → REGRESSION
    const bNew = constructTree(band([50, 70, 90], [0, 100, 200, 300], 100) as any) as unknown as PrimeNode;
    const bOld = withScaleMeta(bNew, 100) as PrimeNode;
    console.log(`    B) percent-space breaks [50,70,90], value=100: OLD=${ev(bOld,58,100)} NEW=${ev(bNew,58,100)} → ${ev(bOld,58,100)===ev(bNew,58,100)?'safe':'⚠️ CHANGED — HF-277 would REGRESS this pattern'}`);
    console.log('  → CONCLUSION: BCL safety is UNVERIFIED. Test 2 must run against BCL\'s real persisted c1 before merge.');
  }

  console.log(`\nPROOF: ${pass}/${pass + fail} synthetic/real assertions pass, ${fail} fail.`);
  console.log(realBcl ? 'BCL Test 2 ran against real data.' : 'BCL Test 2 BLOCKED (tenant wiped) — DO NOT MERGE until it runs.');
  if (fail > 0) process.exit(1);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
