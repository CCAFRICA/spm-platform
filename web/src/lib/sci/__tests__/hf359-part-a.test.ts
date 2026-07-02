/**
 * HF-359 Part A — byte-budgeted dynamic pulse. Runner: node --test --import tsx.
 *   PG-A1: pulses are byte-bounded AND the pulse count ADAPTS to row width (wide → more, narrow → fewer).
 *   PG-A2: full coverage — Σ(pulse row counts) = total, no row in two pulses, none missing (Decision 158).
 *   PG-A3: the metadata refactor is byte-identical (shared buildUnitCsvMetadata == prior inline literal) + round-trip.
 *   PG-A4: the limit is discovered at runtime; the null/unreadable case uses the labeled fallback + surfaces.
 *   PG-A6: a mid-sequence pulse failure leaves prior pulses committed (no cross-pulse rollback).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { planPulses, shouldFlushBeforeAdd } from '../pulse-accumulator';
import { discoverUploadByteBudget, FALLBACK_LIMIT_BYTES, HEADROOM_FRACTION, MAX_PULSE_ROWS, estimatePulseTotal } from '../pulse-budget';
import { makeRowByteEstimator, buildUnitCsvMetadata, buildCommitSemanticRoles, type CommitContentUnitInput } from '../commit-content-unit';
import { committedRowToCsvLine, parseCommittedCsvLine, type CommittedRow } from '../committed-row-csv';

// A representative unit + the real estimator (the same serializer + metadata commitContentUnit commits).
const UNIT: CommitContentUnitInput = {
  contentUnitId: 'file::Exportar Hoja de Trabajo::0',
  confirmedBindings: [
    { sourceField: 'DNI', semanticRole: 'entity_identifier', confidence: 0.99, claimedBy: 'hc' },
    { sourceField: 'Monto', semanticRole: 'measure', confidence: 0.9, claimedBy: 'hc' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any,
  classificationTrace: { headerComprehension: { interpretations: { DNI: { data_nature: 'id' }, Monto: { data_nature: 'amount' } } } },
};
const estimator = makeRowByteEstimator(UNIT, 'transaction', 'DNI', { tenantId: '2d9979ba-5032-48a7-bccf-1928f3e6dadf', proposalId: 'p-1', tabName: 'Exportar Hoja de Trabajo', source: 'sci-bulk' });

function makeRows(n: number, cols: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const r: Record<string, unknown> = { DNI: `V-${i}`, Monto: i * 1.5 };
    for (let c = 0; c < cols; c++) r[`col_${c}`] = c % 2 === 0 ? `Almacén Mirasol ${i}-${c}` : i * c + 0.25;
    rows[i] = r;
  }
  return rows;
}

// ── PG-A1 ──────────────────────────────────────────────────────────────────────────────────────────
test('PG-A1: every pulse CSV ≤ budget, and the pulse count adapts to row width', () => {
  const BUDGET = 1_000_000; // 1MB test budget
  const narrow = makeRows(5000, 3);
  const wide = makeRows(5000, 87);
  const narrowBytes = narrow.map(estimator);
  const wideBytes = wide.map(estimator);

  const narrowPulses = planPulses(narrow.length, (i) => narrowBytes[i], BUDGET, MAX_PULSE_ROWS);
  const widePulses = planPulses(wide.length, (i) => wideBytes[i], BUDGET, MAX_PULSE_ROWS);

  // every pulse's bytes ≤ budget (a lone oversized row is the only exception — none here)
  for (const p of narrowPulses) assert.ok(p.bytes <= BUDGET, `narrow pulse ${p.bytes} > ${BUDGET}`);
  for (const p of widePulses) assert.ok(p.bytes <= BUDGET, `wide pulse ${p.bytes} > ${BUDGET}`);
  // ADAPTIVE: the same 5000 rows produce MORE pulses when wider (more bytes/row → fewer rows/pulse)
  assert.ok(widePulses.length > narrowPulses.length, `wide ${widePulses.length} should exceed narrow ${narrowPulses.length}`);
  console.log(`   [PG-A1] 5000 rows: narrow(3col)=${narrowPulses.length} pulses, wide(87col)=${widePulses.length} pulses; all ≤ 1MB`);
});

// ── PG-A2 ──────────────────────────────────────────────────────────────────────────────────────────
test('PG-A2: full coverage — Σ(pulse rows) = total, contiguous, no overlap, none missing', () => {
  const N = 86_607; // Casa Diaz row count
  const rows = makeRows(N, 87);
  const bytes = rows.map(estimator);
  const BUDGET = Math.floor(HEADROOM_FRACTION * FALLBACK_LIMIT_BYTES); // the real default budget (32MB)
  const pulses = planPulses(N, (i) => bytes[i], BUDGET, MAX_PULSE_ROWS);

  const sum = pulses.reduce((s, p) => s + p.rowCount, 0);
  assert.equal(sum, N, `Σ pulse rows ${sum} ≠ ${N}`);
  // contiguous + non-overlapping: pulse k starts exactly where pulse k-1 ended
  let expected = 0;
  for (const p of pulses) { assert.equal(p.startRow, expected, `gap/overlap at startRow ${p.startRow}`); expected += p.rowCount; }
  assert.equal(expected, N);
  for (const p of pulses) assert.ok(p.bytes <= BUDGET, `pulse ${p.bytes} > budget ${BUDGET}`);
  console.log(`   [PG-A2] ${N} rows × 87 cols → ${pulses.length} byte-budgeted pulses (budget ${(BUDGET/1048576).toFixed(0)}MB), Σ rows = ${sum} (exact), contiguous`);
});

// ── PG-A3 ──────────────────────────────────────────────────────────────────────────────────────────
test('PG-A3: the metadata refactor is byte-identical to the prior inline literal + round-trips', () => {
  const semanticRoles = buildCommitSemanticRoles(UNIT.confirmedBindings);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fieldIdentities = { DNI: { data_nature: 'id' }, Monto: { data_nature: 'amount' } } as any;
  const args = { source: 'sci-bulk', proposalId: 'p-1', semanticRoles, dataType: 'transaction', entityIdField: 'DNI', classification: 'transaction', fieldIdentities, agentsRun: ['normalizer'] };
  const base = buildUnitCsvMetadata(args);
  // the prior inline literal (commit-content-unit.ts pre-HF-359), reconstructed
  const priorInline = {
    source: args.source, proposalId: args.proposalId, semantic_roles: args.semanticRoles,
    resolved_data_type: args.dataType, entity_id_field: args.entityIdField, informational_label: args.classification,
    field_identities: args.fieldIdentities, remediation: { _stageRan: true, agents: args.agentsRun },
  };
  assert.equal(JSON.stringify(base), JSON.stringify(priorInline), 'no-change row metadata must be byte-identical');
  // with per-row changes: the merge keeps the exact key order (_stageRan, agents, changes)
  const rowChanges = { Estado: { original: 'Si', canonical: 'Sí', basis: 'variant', agent: 'normalizer' } };
  const merged = { ...base, remediation: { ...(base.remediation as Record<string, unknown>), changes: rowChanges } };
  const priorMerged = { ...priorInline, remediation: { ...priorInline.remediation, changes: rowChanges } };
  assert.equal(JSON.stringify(merged), JSON.stringify(priorMerged), 'changed-row metadata must be byte-identical');

  // round-trip a full committed line through the estimator's projection
  const proj: CommittedRow = { tenant_id: 'T', import_batch_id: 'B', entity_id: null, period_id: null, source_date: '2024-01-10', data_type: 'transaction', row_data: { DNI: 'V,"1"\n2', Monto: 9.5, ko: '한국' }, metadata: merged };
  const parsed = parseCommittedCsvLine(committedRowToCsvLine(proj));
  assert.deepEqual(parsed.row_data, proj.row_data);
  assert.deepEqual(parsed.metadata, merged);
  console.log('   [PG-A3] metadata byte-identical (no-change + changed-row) and round-trips');
});

// ── PG-A4 ──────────────────────────────────────────────────────────────────────────────────────────
function mockStorage(fileSizeLimit: number | null | 'error'): SupabaseClient {
  return { storage: { getBucket: async () => fileSizeLimit === 'error'
    ? { data: null, error: { message: 'boom' } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : { data: { id: 'ingestion-raw', file_size_limit: fileSizeLimit }, error: null } } } as any;
}
test('PG-A4 (amended by HF-373 D6): budget = headroom × min(bucket limit, global cap); null/error → labeled fallback (surfaced)', async () => {
  // HF-373 Phase E: a bucket limit ABOVE the project-global cap no longer raises the budget —
  // the 2026-07-02 failure was exactly this test's OLD contract (500MB bucket → 400MB parts →
  // rejected by the ~50MiB global cap the storage API cannot report).
  const real = await discoverUploadByteBudget(mockStorage(524288000)); // 500MB bucket limit
  assert.equal(real.limitSource, 'global-default');
  assert.equal(real.effectiveLimit, 50 * 1024 * 1024);
  assert.equal(real.byteBudget, Math.floor(HEADROOM_FRACTION * 50 * 1024 * 1024));

  // a bucket limit BELOW the global cap still governs (min composition, both directions)
  const small = await discoverUploadByteBudget(mockStorage(30 * 1024 * 1024));
  assert.equal(small.limitSource, 'bucket');
  assert.equal(small.effectiveLimit, 30 * 1024 * 1024);

  for (const lim of [null, 0, 'error'] as const) {
    const fb = await discoverUploadByteBudget(mockStorage(lim));
    assert.equal(fb.limitSource, 'fallback', `limit=${lim} should fall back`);
    assert.equal(fb.effectiveLimit, FALLBACK_LIMIT_BYTES);
    assert.equal(fb.byteBudget, Math.floor(HEADROOM_FRACTION * FALLBACK_LIMIT_BYTES));
  }
  // the 20K row count is NOT the boundary — it is only the safety cap
  assert.equal(MAX_PULSE_ROWS, 20000);
  console.log(`   [PG-A4] min(bucket, global)→${real.byteBudget} bytes; fallback→${Math.floor(HEADROOM_FRACTION*FALLBACK_LIMIT_BYTES)} bytes (surfaced); 20K is MAX_PULSE_ROWS cap, not the boundary`);
});

test('PG-A4b: estimatePulseTotal gives an honest "~Y" (est. total bytes / budget)', () => {
  assert.equal(estimatePulseTotal(0, 100, 1000), 1);
  assert.equal(estimatePulseTotal(100, 100, 1000), Math.ceil((100 * 100) / 1000)); // 10
});

// ── PG-A6 ──────────────────────────────────────────────────────────────────────────────────────────
test('PG-A6: a mid-sequence pulse failure leaves prior pulses committed (no cross-pulse rollback)', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/sci/windowed-commit.ts'), 'utf8');
  // The cross-pulse rollback is GONE.
  assert.ok(!/await rollbackBatches\(/.test(src), 'no cross-pulse rollback call may remain');
  assert.ok(/Part A, PG-A6\)?: prior pulses stay committed|PRIOR pulses stay committed|LEAVES ALL PRIOR PULSES COMMITTED/.test(src), 'failure paths document prior-pulses-committed');
  // The failure return preserves the prior pulses' batchIds (does not zero them) and reports !success.
  assert.ok(/success: false, entityIdField, batchIds, error/.test(src), 'failure returns batchIds intact');
  // shouldFlushBeforeAdd never flushes an empty buffer (a lone oversized row goes alone, never split).
  assert.equal(shouldFlushBeforeAdd(0, 0, 999_999_999, 10, 5), false);
  console.log('   [PG-A6] cross-pulse rollback removed; failure returns prior batchIds (resumable); lone oversized row not split');
});
