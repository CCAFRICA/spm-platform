/**
 * HF-360 — Hand-Off Load: pulse-job snapshot/projection (pure) + enqueue/rollback/resume (mock substrate).
 * Runner: node --test --import tsx.
 *   PG-A1: snapshotPulseLoad is the EXACT committed-vs-uncommitted partition (the 58-of-82 case).
 *   PG-A2: enqueuePulseLoadJob — ONE job, reindexed manifest, Σ rows; null + no insert when nothing staged.
 *   PG-A4: projectSessionLoadState aggregates loaded/total + derives the session status truthfully.
 *   PG-B (rollback): tenant-scoped delete of the job batches; idempotent; other tenants untouched.
 *   PG-B (resume): re-arm from the PERSISTED cursor (byte-identical replay); loaded pulses untouched;
 *                  rolled_back is terminal.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  snapshotPulseLoad,
  type PulseLoadJob,
  type PulseManifestEntry,
} from '../pulse-load-types';
import {
  enqueuePulseLoadJob,
  projectSessionLoadState,
  rollbackSession,
  resumeSession,
  getSessionLoadState,
} from '../pulse-load-enqueue';

// ── a minimal in-memory Supabase the pulse-load surface uses (insert / select-eq-order / delete-eq-in /
// update-eq). Records every delete's tenant scope so the tenant-scoping invariant is assertable. ──
type Row = Record<string, unknown>;
function makeMockSupabase(seed: { pulse_load_jobs?: unknown[]; committed_data?: unknown[]; import_batches?: unknown[] } = {}) {
  const tables: Record<string, Row[]> = {
    pulse_load_jobs: (seed.pulse_load_jobs ?? []).map((r) => ({ ...(r as Row) })),
    committed_data: (seed.committed_data ?? []).map((r) => ({ ...(r as Row) })),
    import_batches: (seed.import_batches ?? []).map((r) => ({ ...(r as Row) })),
  };
  const deleteScopes: Array<{ table: string; filters: Record<string, unknown> }> = [];

  function from(table: string) {
    const rows = tables[table] ?? (tables[table] = []);
    return {
      insert(payload: Row | Row[]) {
        const arr = Array.isArray(payload) ? payload : [payload];
        rows.push(...arr.map((r) => ({ ...r })));
        return Promise.resolve({ error: null });
      },
      select() {
        const filters: Record<string, unknown> = {};
        const inFilters: Record<string, unknown[]> = {};
        const chain = {
          eq(col: string, val: unknown) { filters[col] = val; return chain; },
          in(col: string, vals: unknown[]) { inFilters[col] = vals; return chain; },
          order() {
            const out = rows.filter((r) =>
              Object.entries(filters).every(([k, v]) => r[k] === v) &&
              Object.entries(inFilters).every(([k, vs]) => vs.includes(r[k])));
            return Promise.resolve({ data: out.map((r) => ({ ...r })), error: null });
          },
        };
        return chain;
      },
      update(patch: Row) {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq(col: string, val: unknown) {
            filters[col] = val;
            for (const r of rows) {
              if (Object.entries(filters).every(([k, v]) => r[k] === v)) Object.assign(r, patch);
            }
            return chain;
          },
        };
        return chain;
      },
      delete() {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq(col: string, val: unknown) { filters[col] = val; return chain; },
          in(col: string, vals: unknown[]) {
            deleteScopes.push({ table, filters: { ...filters, [`${col}__in`]: vals } });
            const before = rows.length;
            const kept = rows.filter((r) => !(
              Object.entries(filters).every(([k, v]) => r[k] === v) &&
              vals.includes(r[col])));
            const removed = before - kept.length;
            rows.length = 0; rows.push(...kept);
            return Promise.resolve({ count: removed, error: null });
          },
        };
        return chain;
      },
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from } as any, tables, deleteScopes };
}

function mkPulse(i: number, rows: number, batchId: string): PulseManifestEntry {
  return { index: i, batchId, csvPath: `t/committed/${batchId}.csv`, expectedRows: rows, bytes: rows * 100, unitId: 'u1', sheetName: 'Sheet1' };
}

function mkJob(over: Partial<PulseLoadJob> = {}): PulseLoadJob {
  const manifest = over.manifest ?? [mkPulse(0, 1000, 'b0'), mkPulse(1, 1000, 'b1'), mkPulse(2, 1000, 'b2')];
  return {
    id: 'job1', tenant_id: 'tA', session_id: 'sess1', unit_id: '(session)', file_name: 'f.xlsx',
    status: 'loading', manifest, cursor: over.cursor ?? 1, total_pulses: manifest.length,
    total_rows: manifest.reduce((s, p) => s + p.expectedRows, 0),
    rows_loaded: 0, error_detail: null, audit: [], created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    ...over,
  };
}

test('PG-A1: snapshotPulseLoad is the EXACT committed-vs-uncommitted partition (the 58-of-82 case)', () => {
  const manifest = Array.from({ length: 82 }, (_, i) => mkPulse(i, 1000, `b${i}`));
  const job = mkJob({ manifest, cursor: 58, total_pulses: 82, total_rows: 82000 });
  const snap = snapshotPulseLoad(job);
  assert.equal(snap.pulsesLoaded, 58);
  assert.equal(snap.pulsesTotal, 82);
  assert.equal(snap.pendingPulses.length, 24);
  assert.equal(snap.rowsLoaded, 58000);
  assert.equal(snap.rowsTotal, 82000);
  const pendingRows = snap.pendingPulses.reduce((s, p) => s + p.expectedRows, 0);
  assert.equal(snap.rowsLoaded + pendingRows, 82000); // no row unaccounted
});

test('PG-A1: cursor 0 ⇒ nothing loaded; cursor == total ⇒ all loaded, nothing pending', () => {
  const job = mkJob({ cursor: 0 });
  assert.equal(snapshotPulseLoad(job).rowsLoaded, 0);
  assert.equal(snapshotPulseLoad({ ...job, cursor: 3 }).rowsLoaded, 3000);
  assert.equal(snapshotPulseLoad({ ...job, cursor: 3 }).pendingPulses.length, 0);
});

test('PG-A2: enqueuePulseLoadJob inserts ONE enqueued job, reindexes 0..N in commit order, sums rows', async () => {
  const { client, tables } = makeMockSupabase();
  const staged = [
    { batchId: 'b0', csvPath: 't/committed/b0.csv', expectedRows: 1000, bytes: 1, unitId: 'u', sheetName: 'S' },
    { batchId: 'b1', csvPath: 't/committed/b1.csv', expectedRows: 1500, bytes: 1, unitId: 'u', sheetName: 'S' },
  ];
  const res = await enqueuePulseLoadJob(client, { tenantId: 'tA', sessionId: 'sess1', unitId: '(session)', fileName: 'f', stagedPulses: staged });
  assert.ok(res);
  assert.equal(res!.totalPulses, 2);
  assert.equal(res!.totalRows, 2500);
  const job = tables.pulse_load_jobs[0];
  assert.equal(job.status, 'enqueued');
  assert.equal(job.cursor, 0);
  assert.deepEqual((job.manifest as PulseManifestEntry[]).map((p) => p.index), [0, 1]);
});

test('PG-A2: enqueue returns null + inserts NOTHING when nothing staged (never an empty job)', async () => {
  const { client, tables } = makeMockSupabase();
  const res = await enqueuePulseLoadJob(client, { tenantId: 'tA', sessionId: 's', unitId: 'u', fileName: 'f', stagedPulses: [] });
  assert.equal(res, null);
  assert.equal(tables.pulse_load_jobs.length, 0);
});

test('PG-A4: projectSessionLoadState sums loaded/total across jobs + derives status', () => {
  const a = mkJob({ id: 'a', cursor: 3, status: 'complete', rows_loaded: 3000 });
  const b = mkJob({ id: 'b', cursor: 1, status: 'loading', rows_loaded: 1000 });
  const st = projectSessionLoadState('sess1', [a, b]);
  assert.equal(st.pulsesLoaded, 4);
  assert.equal(st.pulsesTotal, 6);
  assert.equal(st.rowsLoaded, 4000);
  assert.equal(st.status, 'loading');
});

test('PG-A4: all complete ⇒ complete; any failed ⇒ failed; empty ⇒ empty', () => {
  assert.equal(projectSessionLoadState('s', [mkJob({ status: 'complete', cursor: 3 }), mkJob({ status: 'complete', cursor: 3 })]).status, 'complete');
  assert.equal(projectSessionLoadState('s', [mkJob({ status: 'complete', cursor: 3 }), mkJob({ status: 'failed', cursor: 1 })]).status, 'failed');
  assert.equal(projectSessionLoadState('s', []).status, 'empty');
});

test('PG-B rollback: tenant-scoped delete of the job batches; other tenants untouched; jobs rolled_back', async () => {
  const manifest = [mkPulse(0, 2, 'b0'), mkPulse(1, 2, 'b1')];
  const job = mkJob({ manifest, cursor: 1, status: 'loading' });
  const { client, tables, deleteScopes } = makeMockSupabase({
    pulse_load_jobs: [job],
    committed_data: [
      { tenant_id: 'tA', import_batch_id: 'b0' }, { tenant_id: 'tA', import_batch_id: 'b0' },
      { tenant_id: 'tA', import_batch_id: 'b1' },
      { tenant_id: 'tOTHER', import_batch_id: 'bX' },
    ],
    import_batches: [{ id: 'b0', tenant_id: 'tA' }, { id: 'b1', tenant_id: 'tA' }],
  });
  const res = await rollbackSession(client, 'tA', 'sess1');
  assert.equal(res.rowsDeleted, 3);
  assert.equal(res.batchesDeleted, 2);
  assert.deepEqual(tables.committed_data, [{ tenant_id: 'tOTHER', import_batch_id: 'bX' }]);
  assert.equal(tables.pulse_load_jobs[0].status, 'rolled_back');
  assert.ok(deleteScopes.length > 0);
  assert.ok(deleteScopes.every((d) => d.filters.tenant_id === 'tA')); // no unscoped delete
});

test('PG-B rollback: idempotent — re-running a rolled_back session deletes nothing more', async () => {
  const job = mkJob({ status: 'rolled_back', cursor: 0 });
  const { client } = makeMockSupabase({ pulse_load_jobs: [job] });
  const res = await rollbackSession(client, 'tA', 'sess1');
  assert.equal(res.rowsDeleted, 0);
});

test('PG-B resume: re-arm failed/loading from the PERSISTED cursor; loaded pulses untouched; complete left alone', async () => {
  const failed = mkJob({ id: 'a', status: 'failed', cursor: 58, total_pulses: 82, manifest: Array.from({ length: 82 }, (_, i) => mkPulse(i, 1000, `b${i}`)), error_detail: 'pulse 58 boom' });
  const done = mkJob({ id: 'b', status: 'complete', cursor: 3 });
  const { client, tables } = makeMockSupabase({ pulse_load_jobs: [failed, done] });
  const res = await resumeSession(client, 'tA', 'sess1');
  assert.equal(res.jobsResumed, 1);
  assert.equal(res.pulsesRemaining, 24); // 82 - 58, cursor preserved
  const rearmed = tables.pulse_load_jobs.find((j) => j.id === 'a')!;
  assert.equal(rearmed.status, 'enqueued');
  assert.equal(rearmed.cursor, 58); // resume, not restart
  assert.equal(rearmed.error_detail, null);
  assert.equal(tables.pulse_load_jobs.find((j) => j.id === 'b')!.status, 'complete');
});

test('PG-B resume: does NOT resume a rolled_back job (rollback is terminal)', async () => {
  const { client, tables } = makeMockSupabase({ pulse_load_jobs: [mkJob({ status: 'rolled_back', cursor: 0 })] });
  const res = await resumeSession(client, 'tA', 'sess1');
  assert.equal(res.jobsResumed, 0);
  assert.equal(tables.pulse_load_jobs[0].status, 'rolled_back');
});

test('getSessionLoadState reads the session jobs and projects the aggregate', async () => {
  const { client } = makeMockSupabase({ pulse_load_jobs: [mkJob({ cursor: 2, status: 'loading', rows_loaded: 2000 })] });
  const st = await getSessionLoadState(client, 'tA', 'sess1');
  assert.equal(st.pulsesTotal, 3);
  assert.equal(st.pulsesLoaded, 2);
  assert.equal(st.status, 'loading');
});
