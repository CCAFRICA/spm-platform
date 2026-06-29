/**
 * OB-253 Phase 2 — read adapter (co-present signal surface). Runner: node --test.
 * Proves: the adapter composes the 3 physical tables into one logical surface (sheet/atom split,
 * signals-by-type co-presence index, density bridged) and derives exposure structurally. Injected
 * mock client (no DB) — the live composition is proven separately by the PG-2 read-only query.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readCoPresentSurface, exposureFromSurface, type CoPresentSurface } from '../signal-surface';

type Row = Record<string, unknown>;
function mockClient(fixtures: Record<string, Row[]>) {
  const make = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain, eq: chain, is: chain, in: chain, order: chain, limit: chain,
      then: (resolve: (v: { data: Row[]; error: null }) => void) => resolve({ data: fixtures[table] ?? [], error: null }),
    });
    return b;
  };
  return { from: (t: string) => make(t) } as unknown as Parameters<typeof readCoPresentSurface>[0];
}

test('readCoPresentSurface composes the three tables into one co-present surface', async () => {
  const sb = mockClient({
    structural_fingerprints: [
      { granularity: 'sheet', fingerprint_hash: 'h1', classification_result: { classification: 'entity' }, column_roles: { a: 'id' }, confidence: 0.9, match_count: 7, tenant_id: 'T', updated_at: '2026-06-20' },
      { granularity: 'atom', fingerprint_hash: 'a1', atom_features: { dataType: 'numeric' }, classification_result: {}, confidence: 0.6, match_count: 2, tenant_id: 'T', updated_at: '2026-06-21' },
    ],
    classification_signals: [
      { signal_type: 'remediation:normalization', signal_value: { v: 1 }, confidence: 0.8, decision_source: 'normalizer', created_at: '2026-06-21' },
      { signal_type: 'remediation:anomaly', signal_value: { v: 2 }, confidence: 0.4, decision_source: 'anomaly', created_at: '2026-06-22' },
    ],
    synaptic_density: [
      { signature: 'sig1', confidence: 0.97, execution_mode: 'silent', total_executions: 12, last_anomaly_rate: 0.01, last_correction_count: 0, learned_behaviors: {} },
    ],
  });

  const surface = await readCoPresentSurface(sb, { tenantId: 'T', signalTypes: ['remediation:normalization', 'remediation:anomaly'] });

  assert.equal(surface.fingerprints.sheet.length, 1, 'one sheet fingerprint');
  assert.equal(surface.fingerprints.atom.length, 1, 'one atom fingerprint');
  assert.equal(surface.fingerprints.sheet[0].matchCount, 7);
  assert.equal(surface.signals.length, 2, 'both signals present');
  // co-presence index: a facet can read every other facet's claim by type
  assert.ok(surface.signalsByType['remediation:normalization']);
  assert.ok(surface.signalsByType['remediation:anomaly']);
  assert.equal(surface.density.length, 1, 'density bridged (calc-keyed, read-only)');
  assert.equal(surface.density[0].executionMode, 'silent');
});

test('exposureFromSurface: high executions/matches → NOT thin (the model has genuinely seen this)', async () => {
  const surface: CoPresentSurface = {
    tenantId: 'T',
    fingerprints: { sheet: [{ granularity: 'sheet', fingerprintHash: 'h', classificationResult: null, columnRoles: null, atomFeatures: null, confidence: 0.9, matchCount: 7, scope: 'tenant', tenantId: 'T', updatedAt: '2026-06-20' }], atom: [] },
    signals: [], signalsByType: {},
    density: [{ signature: 's', confidence: 0.97, executionMode: 'silent', totalExecutions: 12, lastAnomalyRate: null, lastCorrectionCount: null, learnedBehaviors: null }],
  };
  const e = exposureFromSurface(surface);
  assert.equal(e.totalExecutions, 12);
  assert.equal(e.matchCount, 7);
  assert.equal(e.thin, false, 'genuine exposure → not thin');
});

test('exposureFromSurface: few executions AND few matches → THIN (brittle confidence — Phase 4 trigger zone)', async () => {
  const surface: CoPresentSurface = {
    tenantId: 'T',
    fingerprints: { sheet: [{ granularity: 'sheet', fingerprintHash: 'h', classificationResult: null, columnRoles: null, atomFeatures: null, confidence: 0.98, matchCount: 1, scope: 'tenant', tenantId: 'T', updatedAt: '2026-06-20' }], atom: [] },
    signals: [], signalsByType: {},
    density: [{ signature: 's', confidence: 0.98, executionMode: 'silent', totalExecutions: 2, lastAnomalyRate: null, lastCorrectionCount: null, learnedBehaviors: null }],
  };
  const e = exposureFromSurface(surface);
  assert.equal(e.thin, true, 'high confidence on thin exposure → thin=true (where a model hallucinates)');
});
