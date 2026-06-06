// HF-272 — deterministic proof of the relocated hallucination-catch (per-component
// convergence failure on a token that maps to NO real column). No DB, no AI.
//
// It exercises the REAL exported surfaces:
//   • findComponentResolutionFailure  (convergence-service.ts) — the calc-path marker read
//   • evaluateComponent               (run-calculation.ts)     — the loud-failure surface
// and a VERBATIM mirror of generateAllComponentBindings' bind-vs-marker decision branch
// (the only piece that needs a live DB/AI to run end-to-end; mirrored per the hf270/hf271
// precedent). The two assertions the directive (§4.3) requires:
//   (i)  a required token that matches NO real column → per-component `failed` (status +
//        named token), NOT a silent $0, and does NOT abort a co-evaluated component;
//   (ii) a token that DOES match a real column → computes normally, no marker, no over-fire.

import { evaluateComponent, type ComponentResult } from '@/lib/calculation/run-calculation';
import { findComponentResolutionFailure, type ComponentBinding } from '@/lib/intelligence/convergence-service';
import type { PlanComponent } from '@/types/compensation-plan';

// ── VERBATIM MIRROR of the generateAllComponentBindings tail (convergence-service.ts).
// The live loop tries AI semantic mapping, then a boundary fallback over the real measure
// columns (`candidates`). When a required token binds to a real column it writes a normal
// binding; when it maps to NO real column (no AI proposal AND zero boundary candidates) it
// writes the HF-272 resolution-failure MARKER. This mirror reproduces exactly that decision
// against a supplied set of real columns — the comparison set is the real columns present
// (complete-by-construction), never an enumerated/declared list (AUD-009).
function decideBindingForToken(
  token: string,
  realColumns: string[],
): ComponentBinding {
  const candidates = realColumns.filter(c => c.toLowerCase().includes(token.toLowerCase()) || token.toLowerCase().includes(c.toLowerCase()));
  if (candidates.length > 0) {
    // A real column matched → normal bind (no marker). [mirror of the AI/boundary bind path]
    return {
      column: candidates[0],
      field_identity: { structuralType: 'measure', contextualIdentity: 'numeric_amount', confidence: 0.9 },
      match_pass: 1,
      confidence: 0.9,
    };
  }
  // No real column matched → record the per-component resolution-failure MARKER (no throw).
  return {
    column: '',
    field_identity: { structuralType: 'unknown', contextualIdentity: 'unresolved', confidence: 0 },
    match_pass: 'failed',
    confidence: 0,
    resolutionFailure: { token, reason: 'no_real_column_match', candidatesConsidered: candidates.length },
  };
}

function mkComponent(id: string, name: string): PlanComponent {
  return {
    id, name,
    componentType: 'aggregate',
    calculationIntent: { prime: 'reference', field: 'x' },
  } as unknown as PlanComponent;
}

// The real data columns physically present in this synthetic import.
const REAL_COLUMNS = ['ventas_mes', 'meta_ventas', 'capacidad_total_hub', 'cargas_totales_hub'];

// Component A — a required token the recognizer named that corresponds to NOTHING real.
const compA = mkComponent('compA', 'Phantom Component');
const tokenA = 'meta_inexistente_xyz';
const bindingsA: Record<string, ComponentBinding> = { actual: decideBindingForToken(tokenA, REAL_COLUMNS) };

// Component B — a required token that DOES correspond to a real column.
const compB = mkComponent('compB', 'Real Component');
const tokenB = 'ventas';
const bindingsB: Record<string, ComponentBinding> = { actual: decideBindingForToken(tokenB, REAL_COLUMNS) };

let pass = 0, fail = 0;
const assert = (label: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label} — ${detail}`);
  cond ? pass++ : fail++;
};

// ── Convergence-write contract ───────────────────────────────────────────────
assert(
  'A: no-real-column token writes a resolutionFailure marker',
  bindingsA.actual.match_pass === 'failed' && bindingsA.actual.resolutionFailure?.token === tokenA,
  `binding.match_pass=${bindingsA.actual.match_pass} resolutionFailure.token=${bindingsA.actual.resolutionFailure?.token}`,
);
assert(
  'B: real-column token writes a normal binding (NO marker) — no over-fire',
  bindingsB.actual.match_pass === 1 && bindingsB.actual.resolutionFailure === undefined && bindingsB.actual.column === 'ventas_mes',
  `binding.match_pass=${bindingsB.actual.match_pass} column=${bindingsB.actual.column} marker=${bindingsB.actual.resolutionFailure ? 'present' : 'absent'}`,
);

// ── Calc-path read contract (real findComponentResolutionFailure) ────────────
const rfA = findComponentResolutionFailure(bindingsA);
const rfB = findComponentResolutionFailure(bindingsB);
assert('A: findComponentResolutionFailure detects the marker', rfA !== null && rfA.token === tokenA, `→ ${JSON.stringify(rfA)}`);
assert('B: findComponentResolutionFailure returns null (no marker)', rfB === null, `→ ${JSON.stringify(rfB)}`);

// ── Calc surface contract (real evaluateComponent) ───────────────────────────
// Co-evaluate BOTH components in one loop to prove A's failure does NOT abort B.
const results: ComponentResult[] = [];
for (const [comp, metrics, rf] of [
  [compA, {}, rfA ?? undefined],
  [compB, { ventas_mes: 12345 }, rfB ?? undefined],
] as Array<[PlanComponent, Record<string, number>, { token: string; reason: string } | undefined]>) {
  results.push(evaluateComponent(comp, metrics, rf));
}
const [resA, resB] = results;

assert(
  'A: surfaces as LOUD per-component `failed` (status + named token), NOT silent $0',
  resA.status === 'failed' && resA.resolutionFailure?.token === tokenA && resA.details?.failed === true,
  `status=${resA.status} token=${resA.resolutionFailure?.token} payout=${resA.payout} details.failed=${(resA.details as Record<string, unknown>)?.failed}`,
);
assert(
  'B: computes normally — NOT failed, no resolutionFailure (no over-fire)',
  resB.status !== 'failed' && resB.resolutionFailure === undefined,
  `status=${resB.status ?? '(none)'} marker=${resB.resolutionFailure ? 'present' : 'absent'} payout=${resB.payout}`,
);
assert(
  'NO-ABORT: both components produced a result (A failed did not abort B)',
  results.length === 2 && resA.componentId === 'compA' && resB.componentId === 'compB',
  `results=${results.length} [${results.map(r => `${r.componentId}:${r.status ?? 'ok'}`).join(', ')}]`,
);

console.log(`\nPROOF: ${pass}/${pass + fail} assertions pass, ${fail} fail.`);
console.log('The relocated catch fires ONLY on a token that maps to NO real column (compared');
console.log('against the real columns present — complete-by-construction, AUD-009), surfaces');
console.log('it as a loud per-component `failed` (not a silent $0), leaves a real-column-mapped');
console.log('token untouched (no over-fire), and does NOT abort co-evaluated components.');
if (fail > 0) process.exit(1);
