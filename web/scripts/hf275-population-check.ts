// HF-275 Phase 3 verification — deterministic, no live tenant data (Meridian is mid
// re-import). Tests the REAL computeIndividualNullRates against a mock committed_data client
// with synthetic rows matching the Meridian shape (hub rows: entity_id NULL, Cargas_Totales
// set; individual rows: entity_id set, Cargas_Flota_Hub set), then mirrors the binding
// decision (AI-reject at 100% null + boundary score × (1 - null_rate)) to prove the
// individual-row fleet column wins over the name-similar hub-only column. Korean Test: the
// proof references column names only as synthetic fixture data, not in the algorithm.

import { computeIndividualNullRates } from '@/lib/intelligence/convergence-service';

// ── Synthetic committed_data (Meridian shape) ───────────────────────────────
// One batch. 4 hub rows (entity_id null) carry Cargas_Totales/Capacidad_Total only.
// 6 individual rows (entity_id set) carry Cargas_Flota_Hub/Capacidad_Flota_Hub only.
const BATCH = 'batch-meridian-perf';
type Row = { entity_id: string | null; import_batch_id: string; row_data: Record<string, unknown> };
const rows: Row[] = [
  ...[0,1,2,3].map(i => ({ entity_id: null, import_batch_id: BATCH, row_data: { Cargas_Totales: 1000+i, Capacidad_Total: 1200+i } })),
  ...[0,1,2,3,4,5].map(i => ({ entity_id: `ent-${i}`, import_batch_id: BATCH, row_data: { Cargas_Flota_Hub: 1090+i, Capacidad_Flota_Hub: 1100+i } })),
];

// Minimal chainable mock of the supabase client surface computeIndividualNullRates uses:
//   .from('committed_data').select('row_data').eq('import_batch_id', b).not('entity_id','is',null).range(from,to)
function mockClient() {
  return {
    from(_t: string) {
      const q: any = { _batch: undefined as string | undefined, _indivOnly: false };
      q.select = () => q;
      q.eq = (_c: string, v: string) => { q._batch = v; return q; };
      q.not = (c: string, _op: string, _v: unknown) => { if (c === 'entity_id') q._indivOnly = true; return q; };
      q.range = (from: number, to: number) => {
        let pool = rows.filter(r => r.import_batch_id === q._batch);
        if (q._indivOnly) pool = pool.filter(r => r.entity_id !== null);
        return Promise.resolve({ data: pool.slice(from, to + 1).map(r => ({ row_data: r.row_data })), error: null });
      };
      return q;
    },
  } as any;
}

let pass = 0, fail = 0;
const assert = (label: string, cond: boolean, detail: string) => { console.log(`${cond?'PASS':'FAIL'}  ${label} — ${detail}`); cond?pass++:fail++; };

async function main() {
  const cols = [
    { name: 'Cargas_Totales', batchId: BATCH },
    { name: 'Capacidad_Total', batchId: BATCH },
    { name: 'Cargas_Flota_Hub', batchId: BATCH },
    { name: 'Capacidad_Flota_Hub', batchId: BATCH },
  ];
  const rates = await computeIndividualNullRates(mockClient(), cols);
  console.log('=== individual-population null rates (REAL computeIndividualNullRates) ===');
  for (const c of cols) console.log(`  ${c.name}: ${rates.get(c.name)?.toFixed(2)}`);

  assert('hub-only Cargas_Totales null_rate = 1.00 (never on a payee row)', rates.get('Cargas_Totales') === 1, `${rates.get('Cargas_Totales')}`);
  assert('hub-only Capacidad_Total null_rate = 1.00', rates.get('Capacidad_Total') === 1, `${rates.get('Capacidad_Total')}`);
  assert('individual Cargas_Flota_Hub null_rate = 0.00 (on every payee row)', rates.get('Cargas_Flota_Hub') === 0, `${rates.get('Cargas_Flota_Hub')}`);
  assert('individual Capacidad_Flota_Hub null_rate = 0.00', rates.get('Capacidad_Flota_Hub') === 0, `${rates.get('Capacidad_Flota_Hub')}`);

  // ── Mirror of the binding decision (generateAllComponentBindings) ──────────
  console.log('\n=== binding decision: AI proposes the name-similar hub column ===');
  for (const [slot, aiPick, alt] of [
    ['cargas_totales_hub', 'Cargas_Totales', 'Cargas_Flota_Hub'],
    ['capacidad_total_hub', 'Capacidad_Total', 'Capacidad_Flota_Hub'],
  ] as Array<[string,string,string]>) {
    const aiNullRate = rates.get(aiPick) ?? 0;
    // AI-proposal path: reject when 100% null on the population → fall to boundary.
    const aiRejected = aiNullRate >= 1;
    // Boundary path: score × (1 - null_rate). Give both a nominal base score 1.
    const candidates = [aiPick, alt].map(name => ({ name, score: 1 * (1 - (rates.get(name) ?? 0)) }))
      .sort((a, b) => b.score - a.score);
    const winner = candidates[0].name;
    console.log(`  slot ${slot}: AI proposed "${aiPick}" (null_rate ${aiNullRate.toFixed(2)}) → ${aiRejected ? 'REJECTED (100% null)' : 'kept'}; boundary winner: ${winner} (scores ${candidates.map(c=>c.name+':'+c.score.toFixed(2)).join(', ')})`);
    assert(`slot ${slot}: AI hub pick rejected and ${alt} wins`, aiRejected && winner === alt, `winner=${winner}`);
  }

  // DD-7: a column with values on the population (rate 0) is unaffected (factor 1).
  assert('DD-7: a 0%-null column keeps factor 1 (score unchanged)', (1 - (rates.get('Cargas_Flota_Hub') ?? 0)) === 1, 'factor=1');

  console.log(`\nPROOF: ${pass}/${pass+fail} assertions pass, ${fail} fail.`);
  if (fail > 0) process.exit(1);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
