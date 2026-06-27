import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bindDistributionIntent,
  validateDistributionContract,
  extractDistributionIntents,
  type DistributionBindingContext,
} from '../convergence-service';
import type { DistributionIntent } from '@/lib/calculation/intent-types';

// OB-248 (P-V1/V2/V3) — convergence binding. Korean Test: arbitrary tokens.

const INTENT: DistributionIntent = {
  recipients: [
    { role: 'r0', edgeKind: 'self', hops: 0, inclusion: 'always' },
    { role: 'r1', edgeKind: '상향', hops: 1, inclusion: 'always' },
    { role: 'rS', edgeKind: '중첩', hops: 1, inclusion: 'attribute_conditioned', conditionAttribute: '범주' },
  ],
  factorModel: {
    transactionBasis: '거래액',
    factors: [{ recipientKeyed: true, referenceCategory: '기준율' }, { attribute: '범주', referenceCategory: '범주율' }],
  },
  modifiers: [
    { shape: 'cross_recipient_cap', capFraction: 0.12 },
    { shape: 'volume_cliff', threshold: 500000, multiplier: 1.25 },
    { shape: 'consecutive_streak', periodCount: 3, threshold: 80, bonus: 1000 },
  ],
};

const fullCtx: DistributionBindingContext = {
  transactionDataType: '거래',
  originatorColumn: '판매자',
  availableColumns: new Set(['거래액', '범주', '판매자']),
  availableDataTypes: new Set(['거래', '기준율', '범주율']),
};

test('P-V2: a fully resolvable intent binds to a complete derivation with no gaps', () => {
  const { derivation, gaps } = bindDistributionIntent(INTENT, fullCtx);
  assert.equal(gaps.length, 0);
  assert.ok(derivation);
  assert.equal(derivation!.originatorColumn, '판매자');
  assert.equal(derivation!.saleSourcePattern, '거래');
  assert.equal(derivation!.recipients.length, 3);
  // self → empty edge set; upline → carries the recognized edge kind as the edge type
  assert.deepEqual(derivation!.recipients[0].edgeTypes, []);
  assert.deepEqual(derivation!.recipients[1].edgeTypes, ['상향']);
  // overlay recipient bound to attribute_match on its condition column
  assert.equal(derivation!.recipients[2].inclusion.kind, 'attribute_match');
  // factor model: recipient-keyed base + one row-attribute factor
  assert.ok(derivation!.factorModel.baseRate?.keyedByRecipient);
  assert.equal(derivation!.factorModel.factors.length, 1);
  assert.equal(derivation!.factorModel.saleAmountColumn, '거래액');
  // modifiers carried structurally
  assert.deepEqual(derivation!.modifiers.map(m => m.kind), ['cross_recipient_cap', 'volume_cliff', 'consecutive_streak']);
});

test('P-V2 (C2): missing transaction amount column → gap + null derivation (never fabricated)', () => {
  const ctx = { ...fullCtx, availableColumns: new Set(['범주', '판매자']) }; // no 거래액
  const { derivation, gaps } = bindDistributionIntent(INTENT, ctx);
  assert.equal(derivation, null);
  assert.ok(gaps.some(g => g.includes('거래액')));
});

test('P-V2 (C2): an overlay condition attribute absent from data drops that recipient with a gap', () => {
  const ctx = { ...fullCtx, availableColumns: new Set(['거래액', '판매자']) }; // no 범주
  const { derivation, gaps } = bindDistributionIntent(INTENT, ctx);
  assert.ok(derivation); // core still resolves
  assert.equal(derivation!.recipients.length, 2); // overlay dropped
  assert.ok(gaps.some(g => g.includes('rS')));
  // its factor (keyed by 범주) also fails to resolve
  assert.ok(gaps.some(g => g.includes('범주율')));
});

test('P-V3 referential: a recipient edge type with no graph edge is a gap', () => {
  const { derivation } = bindDistributionIntent(INTENT, fullCtx);
  const gaps = validateDistributionContract(derivation!, new Set(['상향']) /* 중첩 absent — but rS overlay edge is 중첩 */, new Set(['기준율', '범주율']));
  assert.ok(gaps.some(g => g.includes('referential') && g.includes('중첩')));
});

test('P-V3 conservation: a factor/base reference table with no rows is a gap; full coverage → no gaps', () => {
  const { derivation } = bindDistributionIntent(INTENT, fullCtx);
  const missing = validateDistributionContract(derivation!, new Set(['상향', '중첩']), new Set(['기준율'])); // 범주율 absent
  assert.ok(missing.some(g => g.includes('conservation') && g.includes('범주율')));
  const clean = validateDistributionContract(derivation!, new Set(['상향', '중첩']), new Set(['기준율', '범주율']));
  assert.equal(clean.length, 0);
});

test('extractDistributionIntents walks variants → components → metadata.distribution', () => {
  const components = {
    variants: [{
      variantId: 'v1',
      components: [
        { id: 'c1', name: 'Base', metadata: { intent: { prime: 'reference', field: 'x' } } },
        { id: 'c2', name: 'Reparto', metadata: { distribution: INTENT } },
      ],
    }],
  };
  const found = extractDistributionIntents(components);
  assert.equal(found.length, 1);
  assert.equal(found[0].componentName, 'Reparto');
  assert.equal(found[0].intent.recipients.length, 3);
});
