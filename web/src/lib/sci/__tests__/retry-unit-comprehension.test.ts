/**
 * OB-203 Phase 3 — retry-without-reimport routes through the SAME decomposed dispatch.
 * Runner: node --test --import tsx. The dispatch is injected so we can PROVE the retry calls
 * the identical contract the analyze route uses (atoms claim, residue comprehends).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  retryUnitComprehension,
  type DecomposedDispatch,
  type RetryDeps,
  type RetryUnitInput,
} from '../retry-unit-comprehension';
import type { UnitStateSignalParams } from '../comprehension-state-service';

const input: RetryUnitInput = {
  tenantId: 't1', importSessionId: 'sess-1', unitId: 'f.xlsx::Datos::1',
  sheetName: 'Datos', tabIndex: 1, sourceFileName: 'f.xlsx',
  columns: ['No_Empleado', 'Ingreso_Real', 'Mes'],
  rows: [
    { No_Empleado: '1001', Ingreso_Real: '5000', Mes: '2025-01' },
    { No_Empleado: '1002', Ingreso_Real: '7000', Mes: '2025-01' },
  ],
  rowCount: 2,
};

function spyDeps(dispatch: DecomposedDispatch) {
  const emitted: UnitStateSignalParams[] = [];
  const calls: Array<{ sheets: string[]; tenantId: string }> = [];
  const wrapped: DecomposedDispatch = async (pm, sheets, tenantId, url, key) => {
    calls.push({ sheets: sheets.map(s => s.sheetName), tenantId });
    return dispatch(pm, sheets, tenantId, url, key);
  };
  const deps: RetryDeps = { comprehend: wrapped, emit: async (p) => { emitted.push(...p); } };
  return { deps, emitted, calls };
}

test('retry re-runs the SAME decomposed dispatch for exactly the one unit', async () => {
  const dispatch: DecomposedDispatch = async () => ({
    provenance: new Map([['Datos', { recognizedFraction: 0.8, novelCount: 1, llmCalled: true }]]),
    perSheetFailure: new Map(),
  });
  const { deps, emitted, calls } = spyDeps(dispatch);
  const res = await retryUnitComprehension(input, deps, 'url', 'key');

  assert.equal(calls.length, 1);                       // dispatch invoked once
  assert.deepEqual(calls[0].sheets, ['Datos']);        // exactly the one unit (no re-ingest of others)
  assert.equal(calls[0].tenantId, 't1');
  assert.equal(res.state, 'comprehended');
  assert.equal(res.novelCount, 1);                     // residue size from the same dispatch's provenance
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].state, 'comprehended');
  assert.equal((emitted[0] as UnitStateSignalParams).unitId, 'f.xlsx::Datos::1');
});

test('retry that fails again emits failed_interpretation (supersedes via fresh timestamp)', async () => {
  const dispatch: DecomposedDispatch = async () => ({
    provenance: new Map(),
    perSheetFailure: new Map([['Datos', 'llm_parse_error']]),
  });
  const { deps, emitted } = spyDeps(dispatch);
  const res = await retryUnitComprehension(input, deps, 'url', 'key');
  assert.equal(res.state, 'failed_interpretation');
  assert.equal(res.failureClass, 'llm_parse_error');
  assert.equal(emitted[0].state, 'failed_interpretation');
  assert.equal(emitted[0].failureClass, 'llm_parse_error');
});
