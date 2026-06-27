/**
 * OB-249 — the Normalizer agent. Runner: node --test --import tsx.
 *
 * Proof gates exercised here with an INJECTED expresser (no live Anthropic needed):
 *   P2  construct is deterministic; the committed canonical is an OBSERVED value, never LLM text.
 *   P3  identify keys on STRUCTURE (works on Korean), never on a field name.
 *   P6  the 2nd encounter of the same value set costs ZERO LLM (read-before-express).
 *   I1  the LLM proposes only the GROUPING; the canonical is selected by code from the data.
 *   I3  the original is retained in every change; no fabricated value is ever committed.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createNormalizer, type VariantExpresser, type NormalizationProposal } from '../agents/normalizer';
import type { RemediationInput, RemediationRecall } from '../remediation-types';
import type { Json } from '@/lib/supabase/database.types';

// A deterministic test-double for the LLM express step, with a call counter. It groups the
// distinct values it is given by a brand stem — exactly the SEMANTIC judgement the real LLM
// makes (structure alone cannot: "Coca-Cola 600ml" and "Coke 600" share no structural key).
function countingExpresser(): VariantExpresser & { calls: number } {
  const fn = (async ({ values }: { values: string[] }) => {
    fn.calls += 1;
    const buckets: Record<string, string[]> = {};
    for (const v of values) {
      const key = /coca|coke/i.test(v) ? 'A' : /pepsi/i.test(v) ? 'B' : null;
      if (key) (buckets[key] ??= []).push(v);
    }
    return { groups: Object.values(buckets).filter((g) => g.length >= 2) };
  }) as VariantExpresser & { calls: number };
  fn.calls = 0;
  return fn;
}

// rows: a "producto" column with SEMANTIC variants of two real products + a clean "categoria".
function makeRows(): Record<string, unknown>[] {
  const producto = [
    ...Array(6).fill('Coca-Cola 600ml'),
    ...Array(3).fill('Coke 600'),
    ...Array(2).fill('CocaCola .6L'),
    ...Array(4).fill('Pepsi 600'),
    ...Array(2).fill('Pepsi-Cola 600ml'),
    ...Array(3).fill('Agua 1L'),
  ];
  const categoria = producto.map((p) => (/agua/i.test(p) ? 'Bebidas' : 'Bebidas'));
  return producto.map((p, i) => ({ producto: p, categoria: categoria[i], importe: String(100 + i) }));
}

function inputFor(rows: Record<string, unknown>[], recall?: RemediationRecall): RemediationInput {
  return {
    tenantId: 'test-tenant',
    rows,
    columns: ['producto', 'categoria', 'importe'],
    allowedColumns: ['producto', 'categoria'], // importe excluded by the stage (measure nature)
    recall,
  };
}

// Build a recall surface from a prior proposal exactly as readPriorNormalizationSignals would
// return it (signal_value = { agent, key, expresser, proposal: <columnProposal> }).
function recallFromProposal(proposal: NormalizationProposal | null): RemediationRecall {
  const payloads: Json[] = (proposal?.columns ?? []).map((c) => ({
    agent: 'normalizer', key: c.column, expresser: c.expresser, proposal: c,
  })) as unknown as Json[];
  return { priorSignals: async () => payloads };
}

test('identify selects variant-clustered / categorical text columns, structurally (P3)', () => {
  const agent = createNormalizer({ expresser: countingExpresser() });
  const targets = agent.identify(inputFor(makeRows()));
  assert.ok(targets.includes('producto'), 'producto is a categorical variant column');
  // importe is not in allowedColumns at all (stage excluded the measure) so it can never appear
  assert.ok(!targets.includes('importe'));
});

test('identify is language-agnostic (Korean Test): selects a Korean variant column with NO literals', () => {
  const agent = createNormalizer({ expresser: countingExpresser() });
  const rows = [
    ...Array(5).fill({ ciudad: '서울특별시' }),
    ...Array(2).fill({ ciudad: '서울특별시 ' }), // whitespace variant of the same city
    ...Array(3).fill({ ciudad: '부산' }),
  ];
  const targets = agent.identify({ tenantId: 't', rows, columns: ['ciudad'], allowedColumns: ['ciudad'] });
  assert.deepEqual(targets, ['ciudad']);
});

test('propose: the LLM groups variants; construct SELECTS canonical from observed values (I1/P2/P4)', async () => {
  const expresser = countingExpresser();
  const agent = createNormalizer({ expresser });
  const rows = makeRows();
  const input = inputFor(rows);
  const targets = agent.identify(input);
  const proposal = await agent.propose(targets, input);

  assert.ok(proposal, 'a proposal is produced');
  assert.ok(expresser.calls >= 1, 'the LLM (expresser) was consulted for the residue');

  const producto = proposal!.columns.find((c) => c.column === 'producto');
  assert.ok(producto, 'producto has a proposal');
  const cocaGroup = producto!.groups.find((g) => g.variants.some((v) => /coca|coke/i.test(v)));
  assert.ok(cocaGroup, 'the Coca/Coke surface forms were grouped');
  assert.equal(cocaGroup!.basis, 'llm', 'a semantic merge is attributed to the LLM');
  // CRITICAL (I1/P2): the proposal carries only the GROUPING — there is no `canonical` field.
  assert.equal('canonical' in (cocaGroup as object), false, 'the LLM never authors a canonical value');

  // construct (deterministic) selects the canonical from OBSERVED values.
  const { correctedRows, changes } = agent.construct(proposal!, input);
  const observed = new Set(rows.map((r) => r.producto));
  for (const ch of changes) {
    assert.equal(ch.agent, 'normalizer');
    assert.ok(observed.has(ch.canonical), 'every committed canonical is an OBSERVED value (no fabrication, I3/P2)');
    assert.notEqual(ch.original, ch.canonical);
  }
  // all Coca/Coke rows collapse to the most-frequent observed form ("Coca-Cola 600ml", freq 6).
  for (let i = 0; i < correctedRows.length; i++) {
    if (/coca|coke/i.test(String(rows[i].producto))) {
      assert.equal(correctedRows[i].producto, 'Coca-Cola 600ml');
    }
  }
  // a row that was NOT a variant is untouched.
  const aguaIdx = rows.findIndex((r) => r.producto === 'Agua 1L');
  assert.equal(correctedRows[aguaIdx].producto, 'Agua 1L');
});

test('P6 progressive performance: the SAME value set on the 2nd encounter costs ZERO LLM', async () => {
  const expresser = countingExpresser();
  const agent = createNormalizer({ expresser });
  const rows = makeRows();

  // run 1 — cold: the LLM is consulted.
  const run1 = await agent.propose(agent.identify(inputFor(rows)), inputFor(rows));
  const cold = expresser.calls;
  assert.ok(cold >= 1, 'run 1 consulted the LLM');

  // run 2 — warm: prior signals (incl. the negative cache for clean columns) are read first.
  expresser.calls = 0;
  const recall = recallFromProposal(run1);
  const run2 = await agent.propose(agent.identify(inputFor(rows, recall)), inputFor(rows, recall));
  assert.equal(expresser.calls, 0, 'run 2 made ZERO LLM calls (read-before-express) — not cold-start-every-time');
  // run 2 produced no NEW expressions to persist (everything was already cached).
  assert.equal(run2, null);
});

test('construct NEVER commits a value the data does not carry (I3 no-fabrication guard)', () => {
  const agent = createNormalizer();
  const rows = [{ c: 'real-a' }, { c: 'real-a' }, { c: 'real-b' }];
  const input: RemediationInput = { tenantId: 't', rows, columns: ['c'], allowedColumns: ['c'] };
  // a proposal whose group variants are NOT present in these rows (a stale signal) must be ignored.
  const stale: NormalizationProposal = { columns: [{ column: 'c', fingerprint: 'x', expresser: 'llm', groups: [{ variants: ['ghost-1', 'ghost-2'], basis: 'llm' }] }] };
  const { correctedRows, changes } = agent.construct(stale, input);
  assert.equal(changes.length, 0, 'no change is made from a group with no observed variants');
  assert.deepEqual(correctedRows.map((r) => r.c), ['real-a', 'real-a', 'real-b']);
});

test('construct refuses to touch an excluded column (defense-in-depth calc-join protection)', () => {
  const agent = createNormalizer();
  const rows = [{ id: 'E1 ' }, { id: 'E1' }, { id: 'E2' }];
  // the proposal names `id`, but the stage did NOT allow it (it is the entity key).
  const proposal: NormalizationProposal = { columns: [{ column: 'id', fingerprint: 'x', expresser: 'llm', groups: [{ variants: ['E1 ', 'E1'], basis: 'structural' }] }] };
  const input: RemediationInput = { tenantId: 't', rows, columns: ['id'], allowedColumns: [] };
  const { changes } = agent.construct(proposal, input);
  assert.equal(changes.length, 0, 'an excluded column is never rewritten');
});

test('degrade-not-fail: when the LLM throws, propose still returns structural groups (no throw)', async () => {
  const throwing: VariantExpresser = async () => { throw new Error('Anthropic down'); };
  const agent = createNormalizer({ expresser: throwing });
  // whitespace variants → structural clustering still collapses them WITHOUT the LLM.
  const rows = [
    ...Array(5).fill({ nombre: 'ALFREDO CORDOVA' }),
    ...Array(2).fill({ nombre: 'ALFREDO CORDOVA ' }),
    ...Array(3).fill({ nombre: 'ERIKA VAZQUEZ' }),
  ];
  const input: RemediationInput = { tenantId: 't', rows, columns: ['nombre'], allowedColumns: ['nombre'] };
  const proposal = await agent.propose(agent.identify(input), input);
  assert.ok(proposal, 'propose did not throw and produced a proposal');
  const nombre = proposal!.columns.find((c) => c.column === 'nombre');
  assert.ok(nombre, 'nombre column present');
  assert.equal(nombre!.expresser, 'structural-only', 'degraded to structural-only when the LLM is down');
  const { correctedRows } = agent.construct(proposal!, input);
  // the whitespace variant collapses to the most-frequent observed form deterministically.
  assert.equal(correctedRows.filter((r) => r.nombre === 'ALFREDO CORDOVA').length, 7);
});
