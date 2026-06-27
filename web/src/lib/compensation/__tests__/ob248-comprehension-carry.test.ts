/**
 * OB-248 (P-C1/C2/C3) — comprehension carry. Deterministic proof that a
 * RECOGNIZED distribution intent (`distributesTo`) flows structurally through the
 * interpreter into the persisted component's `metadata.distribution`, the way
 * `composesInto` (HF-341 R7) flows — a structural EXTENSION of the per-component
 * output, not a parallel class. Neutrality: a component WITHOUT distributesTo is
 * byte-identical (no `distribution` key). The LLM RECOGNITION itself is
 * architect-channel (live LLM + the Robles plan); this proves the carry.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  validateAndNormalizePlanInterpretation,
  interpretationToPlanConfig,
  type InterpretedComponent,
} from '@/lib/compensation/ai-plan-interpreter';
import type { DistributionIntent } from '@/lib/calculation/intent-types';

type Any = Record<string, unknown>;

// A recognized distribution intent — arbitrary/structural tokens (Korean Test:
// no English/Spanish role or product word; placeholder edge kinds and attributes).
const DISTRIBUTES_TO: DistributionIntent = {
  recipients: [
    { role: 'r0', edgeKind: 'self', hops: 0, inclusion: 'always' },
    { role: 'r1', edgeKind: '상향', hops: 1, inclusion: 'always' },
    { role: 'rS', edgeKind: '중첩', hops: 1, inclusion: 'attribute_conditioned', conditionAttribute: '범주' },
  ],
  factorModel: {
    transactionBasis: '거래액',
    factors: [{ recipientKeyed: true }, { attribute: '범주', referenceCategory: '범주율' }],
  },
  modifiers: [{ shape: 'cross_recipient_cap', capFraction: 0.12 }],
};

// A minimal prime_dag component (the factor-model skeleton) carrying distributesTo.
const distComponentRaw = (): Any => ({
  id: 'c-dist', name: 'Reparto', type: 'prime_dag',
  appliesToEmployeeTypes: ['all'],
  calculationMethod: { type: 'prime_dag' },
  calculationIntent: { prime: 'arithmetic', op: 'multiply', inputs: [{ prime: 'reference', field: '거래액' }, { prime: 'constant', value: 1 }] },
  confidence: 0.9, reasoning: '',
  distributesTo: DISTRIBUTES_TO,
});

const plainComponentRaw = (): Any => ({
  id: 'c-plain', name: 'Base', type: 'prime_dag',
  appliesToEmployeeTypes: ['all'],
  calculationMethod: { type: 'prime_dag' },
  calculationIntent: { prime: 'arithmetic', op: 'multiply', inputs: [{ prime: 'reference', field: 'x' }, { prime: 'constant', value: 0.05 }] },
  confidence: 0.9, reasoning: '',
});

test('P-C1: normalizeComponents carries a recognized distributesTo onto the InterpretedComponent', () => {
  const interp = validateAndNormalizePlanInterpretation({ ruleSetName: 'P', components: [distComponentRaw(), plainComponentRaw()] });
  const dist = interp.components.find(c => c.id === 'c-dist') as InterpretedComponent;
  const plain = interp.components.find(c => c.id === 'c-plain') as InterpretedComponent;
  assert.ok(dist.distributesTo, 'distribution component carries distributesTo');
  assert.equal(dist.distributesTo!.recipients.length, 3);
  assert.equal(dist.distributesTo!.modifiers[0].shape, 'cross_recipient_cap');
  assert.equal(plain.distributesTo, undefined, 'plain component has no distributesTo (neutrality)');
});

test('P-C2/C3: a malformed distributesTo (no recipients) is DROPPED, not coerced (fail-quiet at recognition)', () => {
  const bad = { ...distComponentRaw(), distributesTo: { recipients: [], factorModel: {} } };
  const interp = validateAndNormalizePlanInterpretation({ ruleSetName: 'P', components: [bad] });
  assert.equal(interp.components[0].distributesTo, undefined);
});

test('P-C1: interpretationToPlanConfig lands distributesTo in the persisted component metadata.distribution', () => {
  const interp = validateAndNormalizePlanInterpretation({ ruleSetName: 'P', components: [distComponentRaw(), plainComponentRaw()] });
  const config = interpretationToPlanConfig(interp, 'tenant-x', 'user-y');
  const variant = (config.configuration as unknown as Any).variants as Any[];
  const components = variant[0].components as Any[];
  const distComp = components.find(c => (c as Any).id === 'c-dist') as Any;
  const plainComp = components.find(c => (c as Any).id === 'c-plain') as Any;

  const distMeta = (distComp.metadata as Any).distribution as DistributionIntent;
  assert.ok(distMeta, 'persisted distribution component carries metadata.distribution');
  assert.equal(distMeta.recipients.length, 3);
  assert.equal(distMeta.factorModel.transactionBasis, '거래액');

  // Neutrality: the plain component's metadata has NO distribution key.
  assert.equal((plainComp.metadata as Any).distribution, undefined);
});
