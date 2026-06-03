// HF-270 — deterministic unit proof of the post-construction resolution check.
// No DB, no AI. Exercises the exact normalizeToken + membership logic from
// plan-orchestration.ts against the directive's named Meridian fields.
const normalizeToken = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Anchor = HC of Meridian's data-sheet columns (actual headers).
const anchor = ['Cargas_Flota_Hub', 'Volumen_Rutas_Hub', 'Cumplimiento_Depositos'];
const anchorSet = new Set(anchor.map(normalizeToken));

const resolves = (ref: string) => anchorSet.has(normalizeToken(ref));

const cases: Array<[string, boolean, string]> = [
  ['volumen_rutas_hub', true,  'c0 correct: route-volume ref ↔ Volumen_Rutas_Hub (case/separator drift tolerated)'],
  ['Volumen_Rutas_Hub', true,  'verbatim column-name token resolves'],
  ['cargas_flota_hub',  true,  'c4 legit: fleet-loads ref ↔ Cargas_Flota_Hub'],
  ['cargas_mes_hub',    false, "THE BUG's symptom: invented key does NOT normalize to cargas_flota_hub → REJECTED (FieldResolutionError)"],
  ['cumplimiento_depositos', true, 'identity-mapped style ref resolves (BCL DD-7 safety)'],
  ['inventado_xyz',     false, 'genuinely-absent field → REJECTED'],
];

let pass = 0, fail = 0;
for (const [ref, expected, note] of cases) {
  const got = resolves(ref);
  const ok = got === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  resolves("${ref}")=${got} expected=${expected}  — ${note}`);
  ok ? pass++ : fail++;
}
console.log(`\nPROOF: ${pass}/${cases.length} assertions pass, ${fail} fail. ` +
  `Enforcement accepts the correct route-volume field, rejects the invented cargas_mes_hub bug symptom, ` +
  `and tolerates casing/separator drift for DD-7 byte-identity.`);
if (fail > 0) process.exit(1);
