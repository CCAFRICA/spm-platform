import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runDistributionFanOut,
  type FactorResolver,
  type DistributionSaleRow,
} from '../intent-executor';
import type { DistributionDerivation } from '../intent-types';

// OB-248 — orchestration proof for runDistributionFanOut (P-E1/E2/E3 composed).
// Korean Test: all tokens arbitrary/Hangul. The fan-out carries no domain words.

const T = { up: '상향', overlay: '중첩', sale: '거래액', cat: '범주', origin: '판매자', base: '기준율', catTable: '범주율' };

const adjacency = () => new Map<string, Array<{ target: string; type: string }>>([
  ['O', [{ target: 'M1', type: T.up }, { target: 'S', type: T.overlay }]],
  ['M1', [{ target: 'M2', type: T.up }]],
]);

const baseByRecipient: Record<string, number> = { O: 0.10, M1: 0.02, M2: 0.01, S: 0.03 };
const multByCat: Record<string, number> = { '가': 1.5, '나': 1.0 };
const resolver: FactorResolver = (ref, recipientId, row) => {
  if (ref.referenceTable === T.base) return baseByRecipient[recipientId] ?? null;
  if (ref.referenceTable === T.catTable) return multByCat[String(row[T.cat] ?? '')] ?? null;
  return null;
};

const baseDerivation = (modifiers: DistributionDerivation['modifiers'] = []): DistributionDerivation => ({
  originatorColumn: T.origin,
  saleSourcePattern: 'sale',
  recipients: [
    { role: 'r0', edgeTypes: [], hops: 0, inclusion: { kind: 'always' } },
    { role: 'r1', edgeTypes: [T.up], hops: 1, inclusion: { kind: 'always' } },
    { role: 'r2', edgeTypes: [T.up], hops: 2, inclusion: { kind: 'always' } },
    { role: 'rS', edgeTypes: [T.overlay], hops: 1, inclusion: { kind: 'attribute_match', rowAttributeColumn: T.cat, matchValues: ['가'] } },
  ],
  factorModel: {
    saleAmountColumn: T.sale,
    baseRate: { referenceTable: T.base, factorColumn: 'rate', keyedByRecipient: true },
    factors: [{ referenceTable: T.catTable, factorColumn: 'mult', rowAttributeColumn: T.cat }],
  },
  modifiers,
});

const sale = (id: string, originator: string, amount: number, cat: string): DistributionSaleRow =>
  ({ committedDataId: id, rowData: { [T.origin]: originator, [T.sale]: amount, [T.cat]: cat }, transactionRef: id });

test('P-E1: fan-out emits one payout row per (recipient, sale); per-recipient period totals aggregate across sales', () => {
  const res = runDistributionFanOut({
    derivation: baseDerivation(),
    saleRows: [sale('s1', 'O', 1000, '가'), sale('s2', 'O', 2000, '나')],
    adjacency: adjacency(), resolveFactor: resolver,
  });
  // s1 (1000, 가→×1.5): O 150, M1 30, M2 15, S 45  (4 rows incl. overlay)
  // s2 (2000, 나→×1.0, overlay excluded): O 200, M1 40, M2 20       (3 rows)
  assert.equal(res.payoutRows.length, 7);
  assert.equal(res.payoutRows.filter(r => r.saleCommittedDataId === 's1').length, 4);
  assert.equal(res.payoutRows.filter(r => r.saleCommittedDataId === 's2').length, 3);
  // O total = 150 + 200 = 350 ; M1 = 30 + 40 = 70 ; S only on s1 = 45
  assert.equal(res.perRecipientPeriodTotal.get('O'), 350);
  assert.equal(res.perRecipientPeriodTotal.get('M1'), 70);
  assert.equal(res.perRecipientPeriodTotal.get('S'), 45);
  assert.equal(res.diagnostics.length, 0);
  // grand total non-zero (PG-4)
  const grand = Array.from(res.perRecipientPeriodTotal.values()).reduce((s, a) => s + a, 0);
  assert.ok(grand > 0);
});

test('P-E2: tope reduces a single sale cascade so its sum equals the cap', () => {
  const res = runDistributionFanOut({
    derivation: baseDerivation([{ kind: 'cross_recipient_cap', capFraction: 0.12 }]),
    saleRows: [sale('s1', 'O', 1000, '가')],
    adjacency: adjacency(), resolveFactor: resolver,
  });
  // rawSum 240 (150+30+15+45) > cap 120 → scaled ×0.5
  const total = res.payoutRows.reduce((s, r) => s + r.amount, 0);
  assert.equal(Math.round(total * 1e6) / 1e6, 120);
  assert.ok(res.payoutRows.every(r => r.capped));
});

test('P-E3 cliff: originator own-period aggregate ≥ threshold scales the originator (hops:0) amount only', () => {
  const res = runDistributionFanOut({
    derivation: baseDerivation([{ kind: 'volume_cliff', aggregateColumn: T.sale, threshold: 500_000, multiplier: 1.5 }]),
    saleRows: [sale('s1', 'O', 1000, '나')], // 나→×1.0
    adjacency: adjacency(), resolveFactor: resolver,
    ownPeriodAggregate: new Map([['O', 600_000]]), // above threshold
  });
  const O = res.payoutRows.find(r => r.recipientExternalId === 'O')!;
  const M1 = res.payoutRows.find(r => r.recipientExternalId === 'M1')!;
  assert.equal(O.amount, 150);  // 100 base (1000×0.10) × 1.5 cliff
  assert.equal(M1.amount, 20);  // unaffected (1000×0.02)
});

test('P-E3 cliff: below threshold leaves the originator amount unscaled', () => {
  const res = runDistributionFanOut({
    derivation: baseDerivation([{ kind: 'volume_cliff', aggregateColumn: T.sale, threshold: 500_000, multiplier: 1.5 }]),
    saleRows: [sale('s1', 'O', 1000, '나')],
    adjacency: adjacency(), resolveFactor: resolver,
    ownPeriodAggregate: new Map([['O', 100_000]]),
  });
  assert.equal(res.payoutRows.find(r => r.recipientExternalId === 'O')!.amount, 100);
});

test('P-E3 floor: an originator whose own-component period total is below the floor gets a top-up row', () => {
  const res = runDistributionFanOut({
    derivation: baseDerivation([{ kind: 'component_floor', floorValue: 500 }]),
    saleRows: [sale('s1', 'O', 1000, '나')], // O own = 100
    adjacency: adjacency(), resolveFactor: resolver,
  });
  const floorRow = res.payoutRows.find(r => r.role === '__floor__');
  assert.ok(floorRow, 'floor top-up row added');
  assert.equal(floorRow!.amount, 400); // 500 − 100
  assert.equal(res.perRecipientPeriodTotal.get('O'), 500); // own 100 + topUp 400
});

test('P-E3 streak: a qualifying period history adds a bonus row to the originator', () => {
  const res = runDistributionFanOut({
    derivation: baseDerivation([{ kind: 'consecutive_streak', periodCount: 3, threshold: 80, bonus: 1000 }]),
    saleRows: [sale('s1', 'O', 1000, '나')],
    adjacency: adjacency(), resolveFactor: resolver,
    periodHistory: new Map([['O', [100, 100, 100]]]), // 3 consecutive ≥ 80
  });
  const streakRow = res.payoutRows.find(r => r.role === '__streak__');
  assert.ok(streakRow);
  assert.equal(streakRow!.amount, 1000);
});

test('P-E3 streak: a broken streak adds no bonus', () => {
  const res = runDistributionFanOut({
    derivation: baseDerivation([{ kind: 'consecutive_streak', periodCount: 3, threshold: 80, bonus: 1000 }]),
    saleRows: [sale('s1', 'O', 1000, '나')],
    adjacency: adjacency(), resolveFactor: resolver,
    periodHistory: new Map([['O', [100, 50, 100]]]),
  });
  assert.equal(res.payoutRows.find(r => r.role === '__streak__'), undefined);
});

test('C2: a missing reference is reported and the recipient is skipped — never a silent 0', () => {
  const res = runDistributionFanOut({
    derivation: baseDerivation(),
    // a sale by an originator with no base rate in the reference table
    saleRows: [{ committedDataId: 's1', rowData: { [T.origin]: 'GHOST', [T.sale]: 1000, [T.cat]: '가' }, transactionRef: 's1' }],
    adjacency: new Map([['GHOST', [{ target: 'M1', type: T.up }]]]),
    resolveFactor: resolver,
  });
  // GHOST base missing → diagnostic; M1/M2 resolve where present
  assert.ok(res.diagnostics.some(d => d.kind === 'missing_reference' && d.detail.includes('GHOST')));
  assert.ok(!res.payoutRows.some(r => r.recipientExternalId === 'GHOST')); // not fabricated
});

test('C2: a shorter chain reports the unreachable role but still pays the reachable ones', () => {
  const adj = new Map<string, Array<{ target: string; type: string }>>([['O', [{ target: 'M1', type: T.up }]]]); // no M1→M2
  const res = runDistributionFanOut({
    derivation: baseDerivation(),
    saleRows: [sale('s1', 'O', 1000, '나')],
    adjacency: adj, resolveFactor: resolver,
  });
  assert.ok(res.diagnostics.some(d => d.kind === 'unresolved_recipient' && d.detail.startsWith('r2')));
  assert.ok(res.payoutRows.some(r => r.recipientExternalId === 'O'));
  assert.ok(res.payoutRows.some(r => r.recipientExternalId === 'M1'));
  assert.ok(!res.payoutRows.some(r => r.recipientExternalId === 'M2'));
});
