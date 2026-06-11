/**
 * OB-203 Phase 4 — signal-spine vocabulary. Runner: node --test --import tsx.
 * Covers: vocabulary round-trip, EPG-4.3 (structural signal_type, no domain words),
 * SR-39 tenant isolation on every builder, and the DI-7 fire-and-forget safety contract.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  SIGNAL, safeWrite,
  buildAtomRecognitionSignal, buildCompositionSignal, buildTierResolutionSignal,
  buildSessionLifecycleSignal, buildResolutionSignal, buildLearningWriteBlockedSignal, buildInteractionSignal,
} from '../comprehension-signal-vocabulary';

const allBuilders = () => [
  buildAtomRecognitionSignal({ tenantId: 't', atomHash: 'h', role: 'measure', recognitionConfidence: 0.9, roleConfidence: 0.9 }),
  buildCompositionSignal({ tenantId: 't', unitId: 'u', compositionConfidence: 0.8, knownCount: 4, novelCount: 1 }),
  buildTierResolutionSignal({ tenantId: 't', unitId: 'u', tier: 3, resolver: 'llm' }),
  buildSessionLifecycleSignal({ tenantId: 't', importSessionId: 's', phase: 'open' }),
  buildResolutionSignal({ tenantId: 't', unitId: 'u', from: 'failed_interpretation', to: 'comprehended', source: 'sci_agent' }),
  buildLearningWriteBlockedSignal({ tenantId: 't', surface: 'fingerprint_write', reason: 'unknown_role' }),
  buildInteractionSignal({ tenantId: 't', surface: 'session_state_live', action: 'view' }),
];

test('vocabulary round-trip: each builder emits its ratified signal_type', () => {
  const [atom, comp, tier, life, res, block, inter] = allBuilders();
  assert.equal(atom.signalType, SIGNAL.atomRecognition);
  assert.equal(comp.signalType, SIGNAL.composition);
  assert.equal(tier.signalType, SIGNAL.tierResolution);
  assert.equal(life.signalType, SIGNAL.sessionLifecycle);
  assert.equal(res.signalType, SIGNAL.resolution);
  assert.equal(block.signalType, SIGNAL.learningWriteBlocked);
  assert.equal(inter.signalType, SIGNAL.interactionImport);
  // payload structure present
  assert.equal((comp.signalValue as Record<string, unknown>).compositionConfidence, 0.8);
  assert.equal((tier.signalValue as Record<string, unknown>).resolver, 'llm');
  assert.equal((block.signalValue as Record<string, unknown>).surface, 'fingerprint_write');
});

test('EPG-4.3: signal_type values are STRUCTURAL — family:term, no domain words', () => {
  const DOMAIN = ['salary', 'employee', 'revenue', 'quota', 'commission', 'sales', 'hub', 'region', 'empleado', 'ingreso'];
  for (const v of Object.values(SIGNAL)) {
    assert.match(v, /^[a-z]+:[a-z_]+$/, `${v} must be family:structural_term`);
    for (const d of DOMAIN) assert.ok(!v.includes(d), `${v} must not contain domain word '${d}'`);
  }
});

test('SR-39: every builder carries scope=tenant + a tenant_id (no anonymous/cross-tenant write)', () => {
  for (const s of allBuilders()) {
    assert.equal(s.scope, 'tenant');
    assert.equal(s.tenantId, 't');
  }
});

test('DI-7 fire-and-forget: a write failure NEVER throws to the caller (import unaffected) + logs', async () => {
  const origErr = console.error;
  let logged = '';
  console.error = (m?: unknown) => { logged += String(m); };
  try {
    // forced failure — safeWrite must resolve, not reject
    await assert.doesNotReject(() => safeWrite(async () => { throw new Error('db down'); }, SIGNAL.learningWriteBlocked));
    assert.ok(logged.includes(SIGNAL.learningWriteBlocked), 'failure surfaced loudly');
    assert.ok(logged.includes('non-blocking'));
    // success path also resolves
    let ran = false;
    await safeWrite(async () => { ran = true; }, SIGNAL.composition);
    assert.ok(ran);
  } finally {
    console.error = origErr;
  }
});

test('learning_write_blocked is DI-7-shaped (confidence 0, failed_interpretation decision)', () => {
  const b = buildLearningWriteBlockedSignal({ tenantId: 't', surface: 'tier1_read', reason: 'unknown_role', fingerprintHash: 'abc' });
  assert.equal(b.confidence, 0);
  assert.equal(b.decisionSource, 'failed_interpretation');
  assert.equal((b.context as Record<string, unknown>).di, 'DI-7');
});
