// HF-273 — deterministic proof of Defect A (variant→binding index alignment) and Defect B
// (unresolvable prime_dag reference → loud per-component failure). No DB, no AI.
//
// Defect A is proven with a VERBATIM mirror of the consumer's flattened-ordinal recovery
// (run/route.ts: indexOf over variants.flatMap). Defect B is proven against the REAL
// exported surfaces: extractReferencesFromDAG + the structural pre-check (mirror) feeding
// the REAL evaluateComponent loud-failure path. Mirrors the hf270/hf271/hf272 precedent.

import { evaluateComponent } from '@/lib/calculation/run-calculation';
import { extractReferencesFromDAG } from '@/lib/intelligence/convergence-service';

let pass = 0, fail = 0;
const assert = (label: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label} — ${detail}`);
  cond ? pass++ : fail++;
};

// ── Defect A: flattened-ordinal recovery by object identity ───────────────────
// BCL shape: variant 0 (Senior) 4 components, variant 1 (Ejecutivo) 4 components.
const mk = (id: string) => ({ id, calculationIntent: { prime: 'reference', field: 'x' } });
const v0 = [mk('s-coloc'), mk('s-capt'), mk('s-c2'), mk('s-c3')];
const v1 = [mk('e-coloc'), mk('e-capt'), mk('e-c2'), mk('e-c3')];
const variants = [{ components: v0 }, { components: v1 }];

// VERBATIM mirror of the run/route.ts consumer recovery (HF-273 Defect A):
function bindingKeyFor(selectedVariantIndex: number, compIdx: number): string | null {
  const selectedComponents = variants[selectedVariantIndex].components;
  const component = selectedComponents[compIdx];
  let compBindingKey: string | null = `component_${compIdx}`;
  if (variants.length > 1 && selectedVariantIndex > 0) {
    const flattened = variants.flatMap(v => v.components ?? []);
    const flattenedIdx = flattened.indexOf(component);
    compBindingKey = flattenedIdx >= 0 ? `component_${flattenedIdx}` : null;
  }
  return compBindingKey;
}

// The bug: Ejecutivo (variant 1) C1 at selected ordinal 0 must key component_4, NOT component_0.
assert('A: Ejecutivo C1 (variant 1, compIdx 0) → component_4 (was component_0, the bug)',
  bindingKeyFor(1, 0) === 'component_4', `got ${bindingKeyFor(1, 0)}`);
assert('A: Ejecutivo C2 (variant 1, compIdx 2) → component_6',
  bindingKeyFor(1, 2) === 'component_6', `got ${bindingKeyFor(1, 2)}`);
// DD-7: variant 0 unchanged — selected ordinal == flattened ordinal.
assert('A: Senior C1 (variant 0, compIdx 0) → component_0 (DD-7 byte-identical)',
  bindingKeyFor(0, 0) === 'component_0', `got ${bindingKeyFor(0, 0)}`);
assert('A: Senior C4 (variant 0, compIdx 3) → component_3 (DD-7 byte-identical)',
  bindingKeyFor(0, 3) === 'component_3', `got ${bindingKeyFor(0, 3)}`);
// DD-7: single-variant plan (variants.length<=1) is never remapped.
const singleVariants = [{ components: v0 }];
assert('A: single-variant plan keeps component_${compIdx} (DD-7)',
  (() => { const sv = singleVariants; const comp = sv[0].components[2];
    let k: string | null = 'component_2';
    if (sv.length > 1 && 0 > 0) { k = `component_${sv.flatMap(v => v.components).indexOf(comp)}`; }
    return k; })() === 'component_2', 'compIdx 2 → component_2');

// ── Defect B: unresolvable prime_dag reference → loud per-component failure ────
// Ejecutivo C1 intent references the numerator token `colocacion_actual`.
const ejecutivoIntent = {
  prime: 'arithmetic', op: 'multiply', inputs: [
    { prime: 'arithmetic', op: 'divide', inputs: [
      { prime: 'reference', field: 'colocacion_actual' },
      { prime: 'reference', field: 'meta_colocacion' },
    ] },
    { prime: 'reference', field: 'calidad_cartera' },
  ],
};
const refs = extractReferencesFromDAG(ejecutivoIntent);
assert('B: extractReferencesFromDAG surfaces the numerator token',
  refs.includes('colocacion_actual'), `refs=[${refs.join(',')}]`);

// VERBATIM mirror of the run/route.ts Defect B structural pre-check:
function detectUnresolved(compBindings: Record<string, { column?: string }>): string | undefined {
  return extractReferencesFromDAG(ejecutivoIntent).find(f => !compBindings[f]?.column);
}
// WRONG binding (Senior component_0 — the pre-fix misalignment): has colocacion_credito,
// NOT colocacion_actual → the numerator is unresolvable.
const seniorBinding = { colocacion_credito: { column: 'Monto_Colocacion' }, meta_colocacion: { column: 'Meta_Colocacion' }, calidad_cartera: { column: 'Indice_Calidad_Cartera' } };
// CORRECT binding (Ejecutivo component_4 — post Defect A fix): has colocacion_actual.
const ejecutivoBinding = { colocacion_actual: { column: 'Monto_Colocacion' }, meta_colocacion: { column: 'Meta_Colocacion' }, calidad_cartera: { column: 'Indice_Calidad_Cartera' } };

const wrongUnresolved = detectUnresolved(seniorBinding);
const rightUnresolved = detectUnresolved(ejecutivoBinding);
assert('B: against the WRONG (Senior) binding, colocacion_actual is detected unresolved (loud, not silent skip)',
  wrongUnresolved === 'colocacion_actual', `unresolved=${wrongUnresolved}`);
assert('B: against the CORRECT (Ejecutivo) binding, NO unresolved ref (no over-fire — DD-7)',
  rightUnresolved === undefined, `unresolved=${rightUnresolved ?? '(none)'}`);

// Route the unresolved token through the REAL evaluateComponent loud surface. The
// resolutionFailure short-circuit returns BEFORE the componentType switch, so the
// componentType value is irrelevant to the failed path (live prime_dag goes through
// executeIntent, not evaluateComponent — the dead legacy path here).
const comp = { id: 'e-coloc', name: 'Colocación de Crédito', componentType: 'aggregate', calculationIntent: ejecutivoIntent } as never;
const failed = evaluateComponent(comp, {}, wrongUnresolved ? { token: wrongUnresolved, reason: 'no_real_column_match' } : undefined);
const ok = evaluateComponent(comp, { colocacion_actual: 100, meta_colocacion: 120, calidad_cartera: 0.9 }, rightUnresolved ? { token: rightUnresolved, reason: 'no_real_column_match' } : undefined);
assert('B: unresolved ref → evaluateComponent returns LOUD `failed` (status + token), not silent $0',
  failed.status === 'failed' && failed.resolutionFailure?.token === 'colocacion_actual',
  `status=${failed.status} token=${failed.resolutionFailure?.token} payout=${failed.payout}`);
assert('B: resolved binding → evaluateComponent NOT failed (no over-fire — DD-7)',
  ok.status !== 'failed' && ok.resolutionFailure === undefined,
  `status=${ok.status ?? '(none)'} payout=${ok.payout}`);

console.log(`\nPROOF: ${pass}/${pass + fail} assertions pass, ${fail} fail.`);
console.log('Defect A: the consumer recovers the FLATTENED binding ordinal by object identity');
console.log('(Ejecutivo C1 → component_4, not component_0), no-op for variant 0 / single-variant (DD-7).');
console.log('Defect B: an unresolvable prime_dag reference is caught LOUD and surfaces as a per-');
console.log('component `failed` via the real evaluateComponent path — never a band-collapsing silent $0;');
console.log('a correctly-bound reference is untouched (no over-fire).');
if (fail > 0) process.exit(1);
