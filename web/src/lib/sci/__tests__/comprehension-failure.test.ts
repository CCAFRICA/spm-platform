/**
 * OB-203 Phase 1 (DI-4) — structured comprehension-failure surface.
 *
 * Runner: node --test --import tsx.
 * Covers: (1) failure-signal payload shape (canonical surface, named state, confidence 0);
 * (2) exactly the fallback-signature units are marked failed; (3) success-path units are
 * byte-identical (preservation witness); (4) thrown-error structural classification.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  buildFailedInterpretationSignalInput,
  markFailedInterpretationUnits,
} from '../classification-signal-service';
import { classifyThrownFailure } from '../header-comprehension';
import type { ContentUnitProposal } from '../sci-types';

// ── (1) failure-signal payload shape ──
test('failed_interpretation signal lands on the canonical surface as a named state', () => {
  const sig = buildFailedInterpretationSignalInput({
    tenantId: 't1',
    sourceFileName: 'book.xlsx',
    sheetName: 'Empleados',
    fingerprintHash: 'afb789d55ae5',
    failureClass: 'parse_failure',
    durationMs: 67300,
    attemptedTier: 3,
  });
  assert.equal(sig.signalType, 'comprehension:failed_interpretation');
  assert.equal(sig.decisionSource, 'failed_interpretation');
  assert.equal(sig.confidence, 0); // a failed unit is not comprehended
  assert.equal(sig.sourceFileName, 'book.xlsx');
  assert.equal(sig.sheetName, 'Empleados');
  assert.equal(sig.classification, null); // no classification — it failed
  assert.deepEqual(sig.structuralFingerprint, { fingerprintHash: 'afb789d55ae5' });
  assert.equal((sig.signalValue as Record<string, unknown>).failureClass, 'parse_failure');
  assert.equal((sig.signalValue as Record<string, unknown>).durationMs, 67300);
  assert.equal((sig.signalValue as Record<string, unknown>).attemptedTier, 3);
  assert.equal(sig.scope, 'tenant');
});

test('failed_interpretation signal tolerates a null fingerprint', () => {
  const sig = buildFailedInterpretationSignalInput({
    tenantId: 't1', sourceFileName: 'b.xlsx', sheetName: 'S', fingerprintHash: null,
    failureClass: 'timeout', durationMs: null, attemptedTier: null,
  });
  assert.equal(sig.structuralFingerprint, null);
  assert.equal((sig.signalValue as Record<string, unknown>).failureClass, 'timeout');
});

// ── (2)+(3) marking: exactly the failed sheets; others byte-identical ──
function unit(tab: string): ContentUnitProposal {
  return {
    contentUnitId: `book::${tab}::0`, sourceFile: 'book.xlsx', tabName: tab,
    classification: 'transaction', confidence: 0.7, reasoning: 'r', action: 'a',
    fieldBindings: [], allScores: [], warnings: [], observations: [],
    verdictSummary: 'v', whatChangesMyMind: [],
  } as ContentUnitProposal;
}

test('marks EXACTLY the fallback-signature units; comprehended units untouched', () => {
  const empleados = unit('Empleados');
  const ventas = unit('Ventas_Transaccional');
  const portada = unit('Portada');
  const ventasSnapshot = JSON.stringify(ventas);
  const portadaSnapshot = JSON.stringify(portada);

  const failedSheets = new Set(['Empleados']); // only this sheet's comprehension failed
  markFailedInterpretationUnits([empleados, ventas, portada], failedSheets, {
    failureClass: 'parse_failure', durationMs: 67300,
  });

  // failed unit marked
  assert.deepEqual(empleados.failedInterpretation, { failureClass: 'parse_failure', durationMs: 67300 });
  // non-failed units byte-identical to pre-OB (preservation witness)
  assert.equal(ventas.failedInterpretation, undefined);
  assert.equal(portada.failedInterpretation, undefined);
  assert.equal(JSON.stringify(ventas), ventasSnapshot);
  assert.equal(JSON.stringify(portada), portadaSnapshot);
});

test('no failure -> nothing marked (success-path payload byte-identical)', () => {
  const u = unit('Empleados');
  const snap = JSON.stringify(u);
  markFailedInterpretationUnits([u], new Set(['Empleados']), null); // failure null
  assert.equal(JSON.stringify(u), snap);
  assert.equal(u.failedInterpretation, undefined);
});

// ── (4) thrown-error structural classification ──
test('classifyThrownFailure maps timeout signatures, else unclassified', () => {
  assert.equal(classifyThrownFailure(new Error('Request timeout after 60000ms')), 'timeout');
  assert.equal(classifyThrownFailure(new Error('The operation was aborted')), 'timeout');
  assert.equal(classifyThrownFailure(new Error('ETIMEDOUT')), 'timeout');
  assert.equal(classifyThrownFailure(new Error('socket hang up')), 'unclassified_failure');
  assert.equal(classifyThrownFailure('weird non-error'), 'unclassified_failure');
});
