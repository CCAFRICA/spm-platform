// OB-199 Phase 3 — canonical-signal-writer.ts coverage assertions.
//
// Tests the §5.2 four-outcome validation, §5.3 identifier-derivation
// enforcement, the dedicated/JSONB column collapse, and the §5.5 clamp
// removal. Uses an in-memory Supabase mock that records insert payloads
// per call so the verification surface is the row that lands in the
// "database" rather than a real Supabase round-trip.

import { test } from 'node:test';
import assert from 'node:assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  writeSignalWithClient,
  writeSignalBatchWithClient,
  CanonicalWriteError,
  type CanonicalSignalInput,
} from '../canonical-signal-writer';

// Importing signal-registry triggers all register() calls; required because
// the canonical writer reads from the registry at validation time.
import '../signal-registry';

// ============================================
// Mock Supabase client
// ============================================
// Records every `.from('classification_signals').insert(rowOrRows)` call.
// `error` mode lets a single test simulate Postgres error returns.

type Recorded = { table: string; payload: unknown };

function makeMockClient(opts: { errorOnNthCall?: number; errorMessage?: string } = {}) {
  const calls: Recorded[] = [];
  let callIdx = 0;
  const client = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, payload });
          const thisCall = callIdx++;
          if (opts.errorOnNthCall !== undefined && thisCall === opts.errorOnNthCall) {
            return Promise.resolve({ error: { message: opts.errorMessage ?? 'mock insert error' } });
          }
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

// Helpers to flatten the recorded inserts into individual rows so a test can
// assert across rows regardless of whether they arrived in a single batch.
function flattenRows(calls: Recorded[]): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const c of calls) {
    if (Array.isArray(c.payload)) {
      for (const r of c.payload) rows.push(r as Record<string, unknown>);
    } else {
      rows.push(c.payload as Record<string, unknown>);
    }
  }
  return rows;
}

// ============================================
// TESTS
// ============================================

test('OB-199 §5.2 in-range — confidence in [0.0, 1.0] persists as asserted', async () => {
  const { client, calls } = makeMockClient();
  const signal: CanonicalSignalInput = {
    tenantId: 't1',
    signalType: 'comprehension:plan_interpretation',
    signalValue: { metric_label: 'test' },
    confidence: 0.95,
  };
  const result = await writeSignalWithClient(signal, client);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.observabilitySignalEmitted, false);
  const rows = flattenRows(calls);
  assert.strictEqual(rows.length, 1, 'one insert call for in-range value');
  assert.strictEqual(rows[0].confidence, 0.95, 'confidence persisted as asserted');
  assert.strictEqual(rows[0].signal_type, 'comprehension:plan_interpretation');
});

test('OB-199 §5.2 in-range — confidence = exact 1.0 admissible (Decision 30 v2 inclusive)', async () => {
  // IRA Q3 disposition: confidence = 1.0 is in-range, not a contract violation.
  const { client, calls } = makeMockClient();
  const signal: CanonicalSignalInput = {
    tenantId: 't1',
    signalType: 'comprehension:plan_interpretation',
    confidence: 1.0,
  };
  const result = await writeSignalWithClient(signal, client);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.observabilitySignalEmitted, false);
  const rows = flattenRows(calls);
  assert.strictEqual(rows[0].confidence, 1.0, '1.0 admissible per Decision 30 v2 inclusive bound');
});

test('OB-199 §5.2 in-range — confidence = exact 0.0 admissible', async () => {
  const { client, calls } = makeMockClient();
  const signal: CanonicalSignalInput = {
    tenantId: 't1',
    signalType: 'comprehension:plan_interpretation',
    confidence: 0.0,
  };
  const result = await writeSignalWithClient(signal, client);
  assert.strictEqual(result.success, true);
  assert.strictEqual(rows0(calls).confidence, 0.0);
});

function rows0(calls: Recorded[]): Record<string, unknown> {
  return flattenRows(calls)[0];
}

test('OB-199 §5.2 out_of_range — confidence > 1 persists null + emits observability signal', async () => {
  const { client, calls } = makeMockClient();
  const signal: CanonicalSignalInput = {
    tenantId: 't1',
    signalType: 'comprehension:plan_interpretation',
    confidence: 1.5,
  };
  const result = await writeSignalWithClient(signal, client);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.observabilitySignalEmitted, true);
  const rows = flattenRows(calls);
  assert.strictEqual(rows.length, 2, 'two inserts: original row + observability signal');
  assert.strictEqual(rows[0].confidence, null, 'original confidence persisted as null');
  assert.strictEqual(rows[1].signal_type, 'observability:write_failure');
  const obsValue = rows[1].signal_value as Record<string, unknown>;
  assert.strictEqual(obsValue.offending_field, 'confidence');
  assert.strictEqual(obsValue.actual_value, 1.5);
  assert.strictEqual(obsValue.source_signal_type, 'comprehension:plan_interpretation');
  assert.strictEqual(obsValue.outcome_kind, 'out_of_range');
});

test('OB-199 §5.2 out_of_range — negative confidence persists null + observability', async () => {
  const { client, calls } = makeMockClient();
  const signal: CanonicalSignalInput = {
    tenantId: 't1',
    signalType: 'comprehension:plan_interpretation',
    confidence: -0.5,
  };
  const result = await writeSignalWithClient(signal, client);
  assert.strictEqual(result.observabilitySignalEmitted, true);
  const rows = flattenRows(calls);
  assert.strictEqual(rows[0].confidence, null);
  const obsValue = rows[1].signal_value as Record<string, unknown>;
  assert.strictEqual(obsValue.actual_value, -0.5);
});

test('OB-199 §5.2 out_of_range — NaN persists null + observability with stringified actual_value', async () => {
  const { client, calls } = makeMockClient();
  const signal: CanonicalSignalInput = {
    tenantId: 't1',
    signalType: 'comprehension:plan_interpretation',
    confidence: NaN,
  };
  const result = await writeSignalWithClient(signal, client);
  assert.strictEqual(result.observabilitySignalEmitted, true);
  const rows = flattenRows(calls);
  assert.strictEqual(rows[0].confidence, null);
  // NaN/Infinity are string-coerced for JSON observability per §5.2 emission
  const obsValue = rows[1].signal_value as Record<string, unknown>;
  assert.strictEqual(obsValue.actual_value, 'NaN');
});

test('OB-199 §5.2 missing_required — confidence omitted on required-type persists null + observability', async () => {
  const { client, calls } = makeMockClient();
  const signal: CanonicalSignalInput = {
    tenantId: 't1',
    signalType: 'comprehension:plan_interpretation', // confidence_required:true in registry
    // confidence omitted intentionally
  };
  const result = await writeSignalWithClient(signal, client);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.observabilitySignalEmitted, true);
  const rows = flattenRows(calls);
  assert.strictEqual(rows[0].confidence, null);
  const obsValue = rows[1].signal_value as Record<string, unknown>;
  assert.strictEqual(obsValue.outcome_kind, 'missing_required');
});

test('OB-199 §5.2 missing_optional — confidence omitted on optional-type persists null + NO observability', async () => {
  const { client, calls } = makeMockClient();
  const signal: CanonicalSignalInput = {
    tenantId: 't1',
    signalType: 'lifecycle:briefing', // confidence_required:false in registry
    // confidence omitted intentionally
  };
  const result = await writeSignalWithClient(signal, client);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.observabilitySignalEmitted, false);
  const rows = flattenRows(calls);
  assert.strictEqual(rows.length, 1, 'one insert: original row only; no observability for missing-optional');
  assert.strictEqual(rows[0].confidence, null);
});

test('OB-199 §5.3 unregistered_signal_type — throws CanonicalWriteError', async () => {
  const { client } = makeMockClient();
  const signal: CanonicalSignalInput = {
    tenantId: 't1',
    signalType: 'invalid:not_in_registry',
    confidence: 0.5,
  };
  await assert.rejects(
    () => writeSignalWithClient(signal, client),
    (err: unknown) => {
      assert.ok(err instanceof CanonicalWriteError);
      assert.strictEqual((err as CanonicalWriteError).cause, 'unregistered_signal_type');
      return true;
    },
  );
});

test('OB-199 §5.5 no writer-side clamp — confidence > 1 produces null, never 0.9999', async () => {
  // HF-214 Phase 2 A clamp behavior verification: clamp is removed; out-of-range
  // values produce null persist + observability emission, NEVER persist as 0.9999.
  const { client, calls } = makeMockClient();
  const signal: CanonicalSignalInput = {
    tenantId: 't1',
    signalType: 'comprehension:plan_interpretation',
    confidence: 95, // pre-OB-199 this would clamp to 0.9999; post-OB-199 surfaces as out_of_range
  };
  await writeSignalWithClient(signal, client);
  const rows = flattenRows(calls);
  assert.notStrictEqual(rows[0].confidence, 0.9999, 'clamp is removed; value MUST NOT persist as 0.9999');
  assert.strictEqual(rows[0].confidence, null, 'out-of-range value persists as null');
});

test('OB-199 §5.2 batch — 10 rows, 1 out-of-range; all 10 persist + 1 observability', async () => {
  const { client, calls } = makeMockClient();
  const signals: CanonicalSignalInput[] = [];
  for (let i = 0; i < 10; i++) {
    signals.push({
      tenantId: 't1',
      signalType: 'comprehension:plan_interpretation',
      confidence: i === 5 ? 1.5 : 0.9, // row at index 5 is out-of-range
    });
  }
  const result = await writeSignalBatchWithClient(signals, client);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.count, 10, 'all 10 rows persist (T1-E902 Carry Everything)');
  assert.strictEqual(result.observabilitySignalsEmitted, 1, 'exactly 1 observability signal for the out-of-range row');

  // Two insert calls: one for the 10 originals, one for the 1 observability
  assert.strictEqual(calls.length, 2, 'batch path uses two round-trips (originals + observability)');

  // Originals batch
  const originals = calls[0].payload as Array<Record<string, unknown>>;
  assert.strictEqual(originals.length, 10);
  assert.strictEqual(originals[5].confidence, null, 'OOR row persisted with null');
  // Indices other than 5 unchanged at 0.9
  for (let i = 0; i < 10; i++) {
    if (i !== 5) assert.strictEqual(originals[i].confidence, 0.9, `row ${i} confidence unchanged`);
  }

  // Observability batch
  const observability = calls[1].payload as Array<Record<string, unknown>>;
  assert.strictEqual(observability.length, 1);
  assert.strictEqual(observability[0].signal_type, 'observability:write_failure');
  const obsValue = observability[0].signal_value as Record<string, unknown>;
  assert.strictEqual(obsValue.actual_value, 1.5);
});

test('OB-199 §5.3 batch — unregistered signal_type in batch throws synchronously (atomic)', async () => {
  const { client, calls } = makeMockClient();
  const signals: CanonicalSignalInput[] = [
    { tenantId: 't1', signalType: 'comprehension:plan_interpretation', confidence: 0.9 },
    { tenantId: 't1', signalType: 'invalid:not_in_registry', confidence: 0.9 },
    { tenantId: 't1', signalType: 'comprehension:plan_interpretation', confidence: 0.9 },
  ];
  await assert.rejects(
    () => writeSignalBatchWithClient(signals, client),
    (err: unknown) => {
      assert.ok(err instanceof CanonicalWriteError);
      assert.strictEqual((err as CanonicalWriteError).cause, 'unregistered_signal_type');
      return true;
    },
  );
  // Atomic: zero rows persisted
  assert.strictEqual(calls.length, 0, 'unregistered identifier prevents any writes (atomic batch)');
});

test('OB-199 §5.1 column collapse — dedicated columns and JSONB columns both persisted', async () => {
  // Verifies the AUD-001 F-002 closure: canonical insert shape includes
  // dedicated columns (source_file_name, structural_fingerprint, classification,
  // etc.) as nullable fields alongside the JSONB columns.
  const { client, calls } = makeMockClient();
  const signal: CanonicalSignalInput = {
    tenantId: 't1',
    signalType: 'classification:outcome',
    confidence: 0.85,
    sourceFileName: 'test.xlsx',
    sheetName: 'Sheet1',
    structuralFingerprint: { rows: 100 } as Record<string, unknown>,
    classification: 'plan',
    decisionSource: 'human_override',
    scope: 'tenant',
  };
  await writeSignalWithClient(signal, client);
  const row = flattenRows(calls)[0];
  // JSONB-path fields
  assert.strictEqual(row.tenant_id, 't1');
  assert.strictEqual(row.signal_type, 'classification:outcome');
  assert.strictEqual(row.confidence, 0.85);
  // Dedicated-column-path fields
  assert.strictEqual(row.source_file_name, 'test.xlsx');
  assert.strictEqual(row.sheet_name, 'Sheet1');
  assert.deepStrictEqual(row.structural_fingerprint, { rows: 100 });
  assert.strictEqual(row.classification, 'plan');
  assert.strictEqual(row.decision_source, 'human_override');
  assert.strictEqual(row.scope, 'tenant');
});

test('OB-199 §5.2 batch — reader-assertion analogue: zero persisted rows violate Decision 30 v2', async () => {
  // After a batch write where some rows are OOR, the original-row inserts must
  // never carry confidence > 1.0 or < 0.0. (Direct DB reader assertion in
  // production tests via SQL; here we verify the row payloads the writer emits.)
  const { client, calls } = makeMockClient();
  const signals: CanonicalSignalInput[] = [
    { tenantId: 't1', signalType: 'comprehension:plan_interpretation', confidence: 1.5 },
    { tenantId: 't1', signalType: 'comprehension:plan_interpretation', confidence: -0.2 },
    { tenantId: 't1', signalType: 'comprehension:plan_interpretation', confidence: 0.7 },
    { tenantId: 't1', signalType: 'comprehension:plan_interpretation', confidence: NaN },
    { tenantId: 't1', signalType: 'comprehension:plan_interpretation', confidence: Infinity },
  ];
  await writeSignalBatchWithClient(signals, client);
  const originals = calls[0].payload as Array<Record<string, unknown>>;
  for (const r of originals) {
    const c = r.confidence;
    const inRangeOrNull = c === null || (typeof c === 'number' && c >= 0.0 && c <= 1.0);
    assert.ok(inRangeOrNull, `no persisted row may violate Decision 30 v2 inclusive bound (got ${c})`);
  }
});

test('OB-199 Phase 4 supplement B — batch insert failure emits one console.error per row before CanonicalWriteError', async () => {
  // Row 6 disposition: when the batch insert fails for a reason other than
  // confidence-range (e.g. unique constraint violation), the writer must
  // surface per-row forensic detail before the single CanonicalWriteError so
  // the producer can isolate the offending row. HF-214 Phase 1 granularity.
  const { client } = makeMockClient({ errorOnNthCall: 0, errorMessage: 'unique constraint violation' });
  const originalConsoleError = console.error;
  const captured: string[] = [];
  console.error = (msg: unknown) => { captured.push(String(msg)); };
  try {
    const signals: CanonicalSignalInput[] = [
      { tenantId: 't1', signalType: 'comprehension:plan_interpretation', confidence: 0.5, signalValue: { metric_name: 'revenue', component_index: 0 } },
      { tenantId: 't1', signalType: 'comprehension:plan_interpretation', confidence: 0.7, signalValue: { metric_name: 'profit',  component_index: 1 } },
      { tenantId: 't1', signalType: 'comprehension:plan_interpretation', confidence: 0.9, signalValue: { metric_name: 'margin',  component_index: 2 } },
    ];
    await assert.rejects(
      writeSignalBatchWithClient(signals, client),
      (err: unknown) => err instanceof CanonicalWriteError && err.cause === 'insert_failed',
      'batch insert failure throws CanonicalWriteError(insert_failed)',
    );
  } finally {
    console.error = originalConsoleError;
  }
  const perRowLines = captured.filter(line => line.startsWith('[CanonicalWriter] batch row='));
  assert.strictEqual(perRowLines.length, 3, 'one per-row diagnostic per signal in the batch');
  assert.ok(perRowLines[0].includes('row=0'), 'row index 0 surfaced');
  assert.ok(perRowLines[0].includes("signal_type=comprehension:plan_interpretation"));
  assert.ok(perRowLines[0].includes('confidence=0.5'));
  assert.ok(perRowLines[0].includes('metric_name=revenue'));
  assert.ok(perRowLines[0].includes('component_index=0'));
  assert.ok(perRowLines[0].includes('signal_value_truncated='));
  assert.ok(perRowLines[1].includes('row=1') && perRowLines[1].includes('metric_name=profit'));
  assert.ok(perRowLines[2].includes('row=2') && perRowLines[2].includes('metric_name=margin'));
});
