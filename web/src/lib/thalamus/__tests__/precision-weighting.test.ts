/**
 * OB-253 Phase 4 — precision-weighting. Runner: node --test.
 * PG-4 falsifiable proof: a value the model "expects" (silent confidence) but SHOULD surface
 * (high consequence, thin exposure) is overridden to surfacing; the same value with GENUINE
 * exposure is NOT overridden; operator feedback shifts the learning calibration. Deterministic.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { precisionWeight, refineCalibration, consequence, DEFAULT_CALIBRATION } from '../precision-weighting';
import type { CoPresentSurface } from '../signal-surface';
import type { JointResolution } from '../joint-recognition';

function surface(opts: { totalExecutions: number; matchCount: number; priorForColumn?: number; column?: string }): CoPresentSurface {
  const col = opts.column ?? 'amount';
  const signals = Array.from({ length: opts.priorForColumn ?? 0 }, () => ({
    signalType: 'thalamus:recognition', signalValue: { column: col }, confidence: 0.5, decisionSource: null, structuralFingerprint: null, scope: 'tenant', source: 'thalamus', context: null, createdAt: '2026-06-28',
  }));
  return {
    tenantId: 'T',
    fingerprints: { sheet: [{ granularity: 'sheet', fingerprintHash: 'h', classificationResult: null, columnRoles: null, atomFeatures: null, confidence: 0.97, matchCount: opts.matchCount, scope: 'tenant', tenantId: 'T', updatedAt: '2026-06-28' }], atom: [] },
    signals, signalsByType: { 'thalamus:recognition': signals },
    density: opts.totalExecutions > 0 ? [{ signature: 's', confidence: 0.97, executionMode: 'silent', totalExecutions: opts.totalExecutions, lastAnomalyRate: null, lastCorrectionCount: null, learnedBehaviors: null }] : [],
  };
}

const anomalyRes: JointResolution = {
  value: '1000000', column: 'amount', resolvedFacet: 'anomaly', action: 'surface_anomaly',
  confidence: 0.8, rounds: 2, apexUsed: false, reasoning: 'outlier', assessments: [],
};

test('PG-4 #1 — silent-confidence value WITH high consequence + thin exposure is OVERRIDDEN to surfacing', () => {
  const v = precisionWeight({ baselineConfidence: 0.97, resolution: anomalyRes, surface: surface({ totalExecutions: 0, matchCount: 1 }) });
  assert.equal(v.baselineMode, 'silent', 'density alone would predict it away (silent)');
  assert.equal(v.surfaced, true, 'precision-weighting surfaces it');
  assert.equal(v.overriddenMode, 'light_trace', 'overridden away from silent');
  assert.ok(v.consequence.score >= DEFAULT_CALIBRATION.consequenceThreshold, 'high consequence');
  assert.equal(v.exposure.thin, true, 'thin exposure (where a model hallucinates)');
});

test('PG-4 #2 — same value WITH GENUINE (high) exposure is NOT overridden (the model truly learned it)', () => {
  const v = precisionWeight({ baselineConfidence: 0.97, resolution: anomalyRes, surface: surface({ totalExecutions: 50, matchCount: 20 }) });
  assert.equal(v.baselineMode, 'silent');
  assert.equal(v.surfaced, false, 'not surfaced — genuine exposure');
  assert.equal(v.overriddenMode, 'silent', 'stays silent (efficiency preserved where the model has truly learned)');
  assert.equal(v.exposure.thin, false);
});

test('PG-4 #3 — the learning surface: operator feedback shifts the calibration (not a hardcoded threshold)', () => {
  // a borderline value: consequence just below the default threshold → not surfaced at default
  const lowConsRes: JointResolution = { ...anomalyRes, value: 'Acme', column: 'vendor', resolvedFacet: 'normalization', action: 'collapse' };
  const s = surface({ totalExecutions: 0, matchCount: 1, column: 'vendor' });
  const cons = consequence(lowConsRes, s);
  assert.ok(cons.score < DEFAULT_CALIBRATION.consequenceThreshold, 'borderline: below default threshold');
  const atDefault = precisionWeight({ baselineConfidence: 0.97, resolution: lowConsRes, surface: s });
  assert.equal(atDefault.surfaced, false, 'at default calibration: not surfaced');

  // operator CORRECTED a prior surfaced item → the surface learns to surface MORE (lower threshold)
  let cal = DEFAULT_CALIBRATION;
  for (let i = 0; i < 3; i++) cal = refineCalibration(cal, 'corrected');
  assert.ok(cal.consequenceThreshold < DEFAULT_CALIBRATION.consequenceThreshold, 'threshold lowered by corrections');
  const afterLearning = precisionWeight({ baselineConfidence: 0.97, resolution: lowConsRes, surface: s, calibration: cal });
  assert.equal(afterLearning.surfaced, cons.score >= cal.consequenceThreshold, 'behavior follows the learned calibration');

  // CONFIRMATIONS push the other way (surface less)
  const confirmed = refineCalibration(DEFAULT_CALIBRATION, 'confirmed');
  assert.ok(confirmed.consequenceThreshold > DEFAULT_CALIBRATION.consequenceThreshold, 'confirmations raise the threshold');
});

test('consequence is structural (factors are positions, not a field-name list)', () => {
  const c = consequence(anomalyRes, surface({ totalExecutions: 0, matchCount: 6, priorForColumn: 4 }));
  assert.ok(c.factors.includes('genuine_anomaly'));
  assert.ok(c.factors.includes('feeds_calculation')); // numeric value
  assert.ok(c.factors.some((f) => f.startsWith('historically_corrected')));
  assert.ok(c.factors.includes('scale'));
});
