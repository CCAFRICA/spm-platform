// HF-271 — deterministic unit proof of the structural-coherence proofread.
// No DB, no AI. Exercises the exact collectDeclaredRatios + collectTwoFieldDivides
// + assertion logic from plan-orchestration.ts against c4's correct vs collapsed shapes.
function collectDeclaredRatios(node: unknown, out: Array<{ num: string; denom: string }>): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (obj.type === 'ratio') {
    out.push({
      num: typeof obj.numerator_field === 'string' ? obj.numerator_field : '',
      denom: typeof obj.denominator_field === 'string' ? obj.denominator_field : '',
    });
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) { for (const c of v) collectDeclaredRatios(c, out); }
    else if (v && typeof v === 'object') collectDeclaredRatios(v, out);
  }
}
function collectTwoFieldDivides(node: unknown, out: Array<[string, string]>): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (obj.prime === 'arithmetic' && obj.op === 'divide' && Array.isArray(obj.inputs) && obj.inputs.length === 2) {
    const a = obj.inputs[0] as Record<string, unknown> | undefined;
    const b = obj.inputs[1] as Record<string, unknown> | undefined;
    const af = a && a.prime === 'reference' && typeof a.field === 'string' ? a.field : null;
    const bf = b && b.prime === 'reference' && typeof b.field === 'string' ? b.field : null;
    if (af && bf) out.push([af, bf]);
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) { for (const c of v) collectTwoFieldDivides(c, out); }
    else if (v && typeof v === 'object') collectTwoFieldDivides(v, out);
  }
}
// The proofread predicate: returns the incoherence string, or null if coherent.
function proofread(ci: unknown, dag: unknown): string | null {
  const ratios: Array<{ num: string; denom: string }> = [];
  collectDeclaredRatios(ci, ratios);
  if (ratios.length === 0) return null;
  const deg = ratios.find(r => !r.num || !r.denom || r.num === r.denom);
  if (deg) return `degenerate ratio num="${deg.num}" denom="${deg.denom}"`;
  const divs: Array<[string, string]> = [];
  collectTwoFieldDivides(dag, divs);
  const coherent = divs.filter(([a, b]) => a !== b);
  if (coherent.length < ratios.length) return `${ratios.length} ratio(s) declared, ${coherent.length} two-field divide(s) built — collapse`;
  return null;
}

const ratioSrc = { type: 'ratio', numerator_field: 'Cargas_Totales_Hub', denominator_field: 'Capacidad_Total_Hub' };
// CORRECT c4: intent declares ratio; DAG = multiply[ conditional(divide(loads,cap)...), constant(800) ]
const ciCorrect = { structure: { shape: 'arithmetic', operation: 'multiply', operands: [
  { kind: 'structure', structure: { shape: 'conditional', condition: { reference: ratioSrc, operator: 'gte', threshold: 1.5 }, then: { kind: 'constant', value: 1.5 }, else: { kind: 'reference', source: ratioSrc } } },
  { kind: 'constant', value: 800 } ] } };
const dagCorrect = { prime: 'arithmetic', op: 'multiply', inputs: [
  { prime: 'conditional', condition: { prime: 'compare', op: 'gte', inputs: [ { prime: 'arithmetic', op: 'divide', inputs: [ { prime: 'reference', field: 'Cargas_Totales_Hub' }, { prime: 'reference', field: 'Capacidad_Total_Hub' } ] }, { prime: 'constant', value: 1.5 } ] }, then: { prime: 'constant', value: 1.5 }, else: { prime: 'arithmetic', op: 'divide', inputs: [ { prime: 'reference', field: 'Cargas_Totales_Hub' }, { prime: 'reference', field: 'Capacidad_Total_Hub' } ] } },
  { prime: 'constant', value: 800 } ] };
// COLLAPSED c4 (the defect): intent still declares a ratio, but DAG collapsed to a single rate reference.
const dagCollapsed = { prime: 'reference', field: 'Tasa_Utilizacion_Hub' };
// DEGENERATE: ratio with numerator == denominator.
const ciDegenerate = { structure: { shape: 'arithmetic', operation: 'multiply', operands: [ { kind: 'reference', source: { type: 'ratio', numerator_field: 'X', denominator_field: 'X' } }, { kind: 'constant', value: 800 } ] } };
// NO-RATIO: a banded_lookup intent (no ratio declared) → proofread skips.
const ciBanded = { structure: { shape: 'banded_lookup', dimensions: [ { reference_source: { type: 'metric', field: 'attainment' }, breaks: [80, 100] } ], outputs: [0, 100, 200] } };
const dagBanded = { prime: 'reference', field: 'attainment' };

const cases: Array<[string, unknown, unknown, boolean, string]> = [
  ['c4 CORRECT (ratio→two-field divide × base)', ciCorrect, dagCorrect, true,  'declared ratio surfaces as divide(Cargas_Totales_Hub, Capacidad_Total_Hub) — coherent'],
  ['c4 COLLAPSED (THE DEFECT: ratio→single rate field)', ciCorrect, dagCollapsed, false, 'declared ratio did NOT surface as a two-field divide → REJECTED'],
  ['DEGENERATE (numerator==denominator)', ciDegenerate, dagCollapsed, false, 'identical numerator/denominator → REJECTED'],
  ['NO-RATIO (banded_lookup)', ciBanded, dagBanded, true, 'no ratio declared → proofread skips, coherent (DD-7: untouched)'],
];
let pass = 0, fail = 0;
for (const [label, ci, dag, expectCoherent, note] of cases) {
  const r = proofread(ci, dag);
  const coherent = r === null;
  const ok = coherent === expectCoherent;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: coherent=${coherent}${r ? ` (${r})` : ''}  — ${note}`);
  ok ? pass++ : fail++;
}
console.log(`\nPROOF: ${pass}/${cases.length} assertions pass, ${fail} fail. The proofread accepts the correct ratio×base composition, REJECTS the c4 ratio→single-field collapse and the degenerate ratio, and leaves ratio-free components untouched (DD-7).`);
if (fail > 0) process.exit(1);
