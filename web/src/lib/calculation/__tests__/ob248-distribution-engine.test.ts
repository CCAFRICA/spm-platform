import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDistributionRecipients,
  evaluateRecipientAmount,
  applyCrossRecipientCap,
  applyVolumeCliff,
  applyComponentFloor,
  computeConsecutiveStreak,
  reverseCascade,
  recomputeCascadeDelta,
  type FactorResolver,
} from '../intent-executor';
import {
  isDistributionDerivation,
  type DistributionDerivation,
  type DistributionRecipientSpec,
  type DistributionFactorModel,
} from '../intent-types';

// OB-248 — structural proof of the distribution fan-out core (P-E1..E4).
//
// KOREAN TEST embodied: every edge type, column, reference table, and role
// below is an ARBITRARY token (Hangul / nonsense). The helpers carry zero
// domain knowledge — they work for any tenant/plan/domain. If any helper
// depended on a specific role/product/channel literal, these tests would fail.

const T = {           // arbitrary contract tokens (no English domain words)
  edgeUp: '상향',      // the vertical-chain edge type
  edgeOverlay: '중첩',  // the overlay edge type
  saleCol: '거래액',    // sale-amount column
  prodCol: '범주',      // product/category column
  baseTable: '기준율',  // per-recipient base-rate reference table
  prodTable: '범주율',  // category factor reference table
};

// A 3-level upline + one overlay, oriented originator→up (outbound edges).
//   originator(O) → mgr1(M1) → mgr2(M2) → top(M3);  O → spec(S) via overlay
function adjacencyFixture(): Map<string, Array<{ target: string; type: string }>> {
  return new Map([
    ['O',  [{ target: 'M1', type: T.edgeUp }, { target: 'S', type: T.edgeOverlay }]],
    ['M1', [{ target: 'M2', type: T.edgeUp }]],
    ['M2', [{ target: 'M3', type: T.edgeUp }]],
  ]);
}

const RECIPIENTS: DistributionRecipientSpec[] = [
  { role: 'r0', edgeTypes: [], hops: 0, inclusion: { kind: 'always' } },                  // originator (self)
  { role: 'r1', edgeTypes: [T.edgeUp], hops: 1, inclusion: { kind: 'always' } },           // direct manager
  { role: 'r2', edgeTypes: [T.edgeUp], hops: 2, inclusion: { kind: 'always' } },           // 2 up
  { role: 'r3', edgeTypes: [T.edgeUp], hops: 3, inclusion: { kind: 'always' } },           // 3 up (top)
  { role: 'rS', edgeTypes: [T.edgeOverlay], hops: 1,
    inclusion: { kind: 'attribute_match', rowAttributeColumn: T.prodCol, matchValues: ['가'] } }, // overlay, conditional
];

// ── P-E1: recipient resolution ───────────────────────────────────────────

test('P-E1: full chain resolves originator + 3 uplines; overlay included when row attribute matches', () => {
  const { resolved, unresolved } = resolveDistributionRecipients(
    adjacencyFixture(), 'O', RECIPIENTS, { [T.prodCol]: '가' });
  assert.equal(unresolved.length, 0);
  assert.deepEqual(resolved.map(r => r.entityExternalId), ['O', 'M1', 'M2', 'M3', 'S']);
  // originator is self (no edge); uplines record the edge type they traversed
  assert.equal(resolved[0].viaEdgeType, null);
  assert.equal(resolved[1].viaEdgeType, T.edgeUp);
  assert.equal(resolved[4].viaEdgeType, T.edgeOverlay);
});

test('P-E1: overlay recipient EXCLUDED when the row attribute does not match (per-row recipient set)', () => {
  const { resolved } = resolveDistributionRecipients(
    adjacencyFixture(), 'O', RECIPIENTS, { [T.prodCol]: '나' }); // not in matchValues
  assert.deepEqual(resolved.map(r => r.role), ['r0', 'r1', 'r2', 'r3']); // rS absent
});

test('P-E1 (C2): an unreachable role is REPORTED in unresolved, never fabricated, never silently dropped', () => {
  // A shorter chain: remove M2→M3 so hops:3 cannot reach.
  const adj = adjacencyFixture(); adj.set('M2', []);
  const { resolved, unresolved } = resolveDistributionRecipients(adj, 'O', RECIPIENTS, { [T.prodCol]: '가' });
  assert.deepEqual(resolved.map(r => r.role), ['r0', 'r1', 'r2', 'rS']); // r3 not present
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].role, 'r3');
});

test('P-E1: traversal is deterministic regardless of edge insertion order', () => {
  const adj1 = new Map([['O', [{ target: 'B', type: T.edgeUp }, { target: 'A', type: T.edgeUp }]]]);
  const adj2 = new Map([['O', [{ target: 'A', type: T.edgeUp }, { target: 'B', type: T.edgeUp }]]]);
  const spec: DistributionRecipientSpec[] = [{ role: 'x', edgeTypes: [T.edgeUp], hops: 1, inclusion: { kind: 'always' } }];
  const r1 = resolveDistributionRecipients(adj1, 'O', spec, {}).resolved[0].entityExternalId;
  const r2 = resolveDistributionRecipients(adj2, 'O', spec, {}).resolved[0].entityExternalId;
  assert.equal(r1, r2); // 'A' both times (sorted by target)
  assert.equal(r1, 'A');
});

// ── P-E1 / P-C2: factor model (sale × base × Πfactors) via evaluate() ──────

const FACTOR_MODEL: DistributionFactorModel = {
  saleAmountColumn: T.saleCol,
  baseRate: { referenceTable: T.baseTable, factorColumn: 'rate', keyedByRecipient: true },
  factors: [{ referenceTable: T.prodTable, factorColumn: 'mult', rowAttributeColumn: T.prodCol }],
};

// recipient base rates (keyed by recipient identity) + category multipliers (keyed by row attr)
const baseByRecipient: Record<string, number> = { O: 0.10, M1: 0.02, M2: 0.01, M3: 0.005, S: 0.03 };
const multByCategory: Record<string, number> = { '가': 1.5, '나': 1.0 };

const resolver: FactorResolver = (ref, recipientId, row) => {
  if (ref.referenceTable === T.baseTable) return baseByRecipient[recipientId] ?? null;
  if (ref.referenceTable === T.prodTable) return multByCategory[String(row[T.prodCol] ?? '')] ?? null;
  return null;
};

test('P-E1/P-C2: amount = sale × base(recipient) × factor(category) computed through evaluate()', () => {
  const row = { [T.saleCol]: 1000, [T.prodCol]: '가' };
  const o = evaluateRecipientAmount(FACTOR_MODEL, 'O', row, resolver);
  // 1000 × 0.10 × 1.5 = 150
  assert.equal(o.amount, 150);
  const m1 = evaluateRecipientAmount(FACTOR_MODEL, 'M1', row, resolver);
  // 1000 × 0.02 × 1.5 = 30
  assert.equal(m1.amount, 30);
});

test('P-E1 (C2): a missing base rate / factor reference returns amount:null with the table named — NEVER silent 0', () => {
  const row = { [T.saleCol]: 1000, [T.prodCol]: '가' };
  const unknownRecipient = evaluateRecipientAmount(FACTOR_MODEL, 'GHOST', row, resolver);
  assert.equal(unknownRecipient.amount, null);
  assert.deepEqual(unknownRecipient.missing, [T.baseTable]);

  const unknownCategory = evaluateRecipientAmount(FACTOR_MODEL, 'O', { [T.saleCol]: 1000, [T.prodCol]: '???' }, resolver);
  assert.equal(unknownCategory.amount, null);
  assert.deepEqual(unknownCategory.missing, [T.prodTable]);
});

test('P-E1: a factor model with no base and no factors = the sale amount itself', () => {
  const fm: DistributionFactorModel = { saleAmountColumn: T.saleCol, factors: [] };
  const r = evaluateRecipientAmount(fm, 'O', { [T.saleCol]: 777 }, resolver);
  assert.equal(r.amount, 777);
});

// ── P-E2: cross-recipient cap (tope) ──────────────────────────────────────

test('P-E2: cascade under the cap is unchanged', () => {
  const r = applyCrossRecipientCap([10, 20, 30], 100);
  assert.equal(r.applied, false);
  assert.deepEqual(r.amounts, [10, 20, 30]);
});

test('P-E2: cascade over the cap is proportionally reduced; the sum equals the cap (conservation)', () => {
  const r = applyCrossRecipientCap([60, 30, 30], 60); // rawSum 120, cap 60 → ×0.5
  assert.equal(r.applied, true);
  assert.deepEqual(r.amounts, [30, 15, 15]);
  const sum = r.amounts.reduce((s, a) => s + a, 0);
  assert.equal(Math.round(sum * 1e6) / 1e6, 60);
  // proportions preserved
  assert.equal(r.amounts[0] / r.amounts[1], 2);
});

test('P-E2: empty cascade is a structural no-op (the zero-recipient C2 guard lives at the call site)', () => {
  const r = applyCrossRecipientCap([], 100);
  assert.equal(r.applied, false);
  assert.deepEqual(r.amounts, []);
});

// ── P-E3: temporal modifiers ──────────────────────────────────────────────

test('P-E3 volume cliff: own-period aggregate ≥ threshold multiplies the rate; below leaves it', () => {
  assert.equal(applyVolumeCliff(0.02, 500_000, { threshold: 400_000, multiplier: 1.25 }), 0.025);
  assert.equal(applyVolumeCliff(0.02, 100_000, { threshold: 400_000, multiplier: 1.25 }), 0.02);
  // exactly at threshold → applies (gte)
  assert.equal(applyVolumeCliff(0.02, 400_000, { threshold: 400_000, multiplier: 1.25 }), 0.025);
});

test('P-E3 component floor: max(amount, floor)', () => {
  assert.equal(applyComponentFloor(120, 500), 500);
  assert.equal(applyComponentFloor(900, 500), 900);
});

test('P-E3 streak: N consecutive periods meeting threshold → bonus; one miss resets to 0', () => {
  // most-recent-first
  const met = computeConsecutiveStreak([100, 100, 100, 50], 3, 80, 1000);
  assert.equal(met.metConsecutively, true);
  assert.equal(met.streakLength, 3);
  assert.equal(met.bonus, 1000);

  const reset = computeConsecutiveStreak([100, 50, 100, 100], 3, 80, 1000); // 2nd most-recent misses
  assert.equal(reset.metConsecutively, false);
  assert.equal(reset.streakLength, 1);
  assert.equal(reset.bonus, 0);
});

// ── P-E4: cascade reversal + retro recompute ──────────────────────────────

const ORIGINAL = [
  { role: 'r0', entityExternalId: 'O', amount: 150 },
  { role: 'r1', entityExternalId: 'M1', amount: 30 },
  { role: 'r2', entityExternalId: 'M2', amount: 15 },
];

test('P-E4 reversal: every recipient payout is negated (atomic devolución)', () => {
  const rev = reverseCascade(ORIGINAL);
  assert.deepEqual(rev.map(r => r.amount), [-150, -30, -15]);
  assert.deepEqual(rev.map(r => r.entityExternalId), ['O', 'M1', 'M2']);
});

test('P-E4 retro: delta = recomputed − original per recipient; a vanished recipient is reversed fully', () => {
  // corrected net halves O & M1; M2 drops out; a new recipient M3 appears
  const recomputed = [
    { role: 'r0', entityExternalId: 'O', amount: 75 },
    { role: 'r1', entityExternalId: 'M1', amount: 15 },
    { role: 'r3', entityExternalId: 'M3', amount: 10 },
  ];
  const delta = recomputeCascadeDelta(ORIGINAL, recomputed);
  const byEnt = Object.fromEntries(delta.map(d => [d.entityExternalId, d.amount]));
  assert.equal(byEnt.O, -75);   // 75 − 150
  assert.equal(byEnt.M1, -15);  // 15 − 30
  assert.equal(byEnt.M3, 10);   // 10 − 0 (new)
  assert.equal(byEnt.M2, -15);  // absent in recompute → fully reversed
});

// ── End-to-end: contract → recipients → amounts → tope ─────────────────────

test('end-to-end: one sale fans out to N recipient rows, then tope conserves to the cap', () => {
  const derivation: DistributionDerivation = {
    originatorColumn: '판매자',
    saleSourcePattern: '거래',
    recipients: RECIPIENTS,
    factorModel: FACTOR_MODEL,
    modifiers: [{ kind: 'cross_recipient_cap', capFraction: 0.12 }],
  };
  assert.equal(isDistributionDerivation(derivation), true);

  const row = { [T.saleCol]: 1000, [T.prodCol]: '가', '판매자': 'O' };
  const { resolved } = resolveDistributionRecipients(adjacencyFixture(), 'O', derivation.recipients, row);
  assert.equal(resolved.length, 5); // O, M1, M2, M3, S

  const amounts = resolved.map(r => {
    const res = evaluateRecipientAmount(derivation.factorModel, r.entityExternalId, row, resolver);
    assert.notEqual(res.amount, null); // all resolve
    return res.amount as number;
  });
  // base×1.5×1000: O150 M130 M215 M37.5 S45  → rawSum 247.5
  assert.equal(Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100, 247.5);

  const capAmount = 0.12 * (row[T.saleCol] as number); // 120
  const capped = applyCrossRecipientCap(amounts, capAmount);
  assert.equal(capped.applied, true);
  assert.equal(Math.round(capped.amounts.reduce((s, a) => s + a, 0) * 1e6) / 1e6, 120);
  // grand total non-zero (PG-4)
  assert.ok(capped.amounts.reduce((s, a) => s + a, 0) > 0);
});

test('isDistributionDerivation rejects a per-entity derivation shape', () => {
  assert.equal(isDistributionDerivation({ metric: 'x', operation: 'sum', source_pattern: 'y', filters: [] }), false);
});
