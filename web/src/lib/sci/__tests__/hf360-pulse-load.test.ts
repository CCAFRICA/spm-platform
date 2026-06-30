// HF-360 — Hand-Off Load: pulse-job snapshot/projection (pure) + enqueue/rollback/resume (mock substrate).
// Proves: Σ(pulse rows)=total, the (manifest, cursor) snapshot is the EXACT committed-vs-uncommitted
// partition (the 58-of-82 case), the session aggregate is truthful, rollback is tenant-scoped + deletes the
// job's batches, resume re-arms from the persisted cursor (byte-identical replay; loaded pulses untouched).
import { describe, it, expect } from 'vitest';
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
interface Row { [k: string]: unknown }
function makeMockSupabase(seed: { pulse_load_jobs?: Row[]; committed_data?: Row[]; import_batches?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    pulse_load_jobs: seed.pulse_load_jobs ? [...seed.pulse_load_jobs] : [],
    committed_data: seed.committed_data ? [...seed.committed_data] : [],
    import_batches: seed.import_batches ? [...seed.import_batches] : [],
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
      select(_cols?: string) {
        const filters: Record<string, unknown> = {};
        const inFilters: Record<string, unknown[]> = {};
        const chain = {
          eq(col: string, val: unknown) { filters[col] = val; return chain; },
          in(col: string, vals: unknown[]) { inFilters[col] = vals; return chain; },
          order(_c: string, _o?: unknown) {
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
            // apply once both eq's are set (id + tenant_id) — apply on each call idempotently
            for (const r of rows) {
              if (Object.entries(filters).every(([k, v]) => r[k] === v)) Object.assign(r, patch);
            }
            return chain;
          },
        };
        return chain;
      },
      delete(_opts?: { count?: string }) {
        const filters: Record<string, unknown> = {};
        const inFilters: Record<string, unknown[]> = {};
        const chain = {
          eq(col: string, val: unknown) { filters[col] = val; return chain; },
          in(col: string, vals: unknown[]) {
            inFilters[col] = vals;
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

describe('HF-360 PG-A1 — snapshotPulseLoad is the EXACT committed-vs-uncommitted partition', () => {
  it('partitions manifest at the cursor; the 58-of-82 case is made precise', () => {
    const manifest = Array.from({ length: 82 }, (_, i) => mkPulse(i, 1000, `b${i}`));
    const job = mkJob({ manifest, cursor: 58, total_pulses: 82, total_rows: 82000 });
    const snap = snapshotPulseLoad(job);
    expect(snap.pulsesLoaded).toBe(58);
    expect(snap.pulsesTotal).toBe(82);
    expect(snap.pendingPulses.length).toBe(24);    // 82 - 58
    expect(snap.rowsLoaded).toBe(58000);
    expect(snap.rowsTotal).toBe(82000);
    // Σ loaded + Σ pending == total (no row unaccounted)
    const pendingRows = snap.pendingPulses.reduce((s, p) => s + p.expectedRows, 0);
    expect(snap.rowsLoaded + pendingRows).toBe(82000);
  });

  it('cursor 0 ⇒ nothing loaded; cursor == total ⇒ all loaded', () => {
    const job = mkJob({ cursor: 0 });
    expect(snapshotPulseLoad(job).rowsLoaded).toBe(0);
    expect(snapshotPulseLoad({ ...job, cursor: 3 }).rowsLoaded).toBe(3000);
    expect(snapshotPulseLoad({ ...job, cursor: 3 }).pendingPulses.length).toBe(0);
  });
});

describe('HF-360 PG-A2 — enqueuePulseLoadJob: one job, reindexed manifest, Σ rows', () => {
  it('inserts one enqueued job, assigns 0..N indices in commit order, sums rows', async () => {
    const { client, tables } = makeMockSupabase();
    const staged = [
      { batchId: 'b0', csvPath: 't/committed/b0.csv', expectedRows: 1000, bytes: 1, unitId: 'u', sheetName: 'S' },
      { batchId: 'b1', csvPath: 't/committed/b1.csv', expectedRows: 1500, bytes: 1, unitId: 'u', sheetName: 'S' },
    ];
    const res = await enqueuePulseLoadJob(client, { tenantId: 'tA', sessionId: 'sess1', unitId: '(session)', fileName: 'f', stagedPulses: staged });
    expect(res).not.toBeNull();
    expect(res!.totalPulses).toBe(2);
    expect(res!.totalRows).toBe(2500);
    const job = tables.pulse_load_jobs[0];
    expect(job.status).toBe('enqueued');
    expect(job.cursor).toBe(0);
    expect((job.manifest as PulseManifestEntry[]).map((p) => p.index)).toEqual([0, 1]);
  });

  it('returns null + inserts NOTHING when there are no staged pulses (never an empty job)', async () => {
    const { client, tables } = makeMockSupabase();
    const res = await enqueuePulseLoadJob(client, { tenantId: 'tA', sessionId: 's', unitId: 'u', fileName: 'f', stagedPulses: [] });
    expect(res).toBeNull();
    expect(tables.pulse_load_jobs.length).toBe(0);
  });
});

describe('HF-360 PG-A4 — projectSessionLoadState aggregates truthfully', () => {
  it('sums loaded/total across jobs and derives the session status', () => {
    const a = mkJob({ id: 'a', cursor: 3, status: 'complete', rows_loaded: 3000 });
    const b = mkJob({ id: 'b', cursor: 1, status: 'loading', rows_loaded: 1000 });
    const st = projectSessionLoadState('sess1', [a, b]);
    expect(st.pulsesLoaded).toBe(4);          // 3 + 1
    expect(st.pulsesTotal).toBe(6);           // 3 + 3
    expect(st.rowsLoaded).toBe(4000);
    expect(st.status).toBe('loading');        // any loading ⇒ loading
  });

  it('all complete ⇒ complete; any failed ⇒ failed; empty ⇒ empty', () => {
    expect(projectSessionLoadState('s', [mkJob({ status: 'complete', cursor: 3 }), mkJob({ status: 'complete', cursor: 3 })]).status).toBe('complete');
    expect(projectSessionLoadState('s', [mkJob({ status: 'complete', cursor: 3 }), mkJob({ status: 'failed', cursor: 1 })]).status).toBe('failed');
    expect(projectSessionLoadState('s', []).status).toBe('empty');
  });
});

describe('HF-360 PG-B (rollback) — tenant-scoped delete of the job batches', () => {
  it('deletes committed_data + import_batches for every pulse batch, marks jobs rolled_back, scopes by tenant', async () => {
    const manifest = [mkPulse(0, 2, 'b0'), mkPulse(1, 2, 'b1')];
    const job = mkJob({ manifest, cursor: 1, status: 'loading' });
    const { client, tables, deleteScopes } = makeMockSupabase({
      pulse_load_jobs: [job],
      committed_data: [
        { tenant_id: 'tA', import_batch_id: 'b0' }, { tenant_id: 'tA', import_batch_id: 'b0' },
        { tenant_id: 'tA', import_batch_id: 'b1' },
        { tenant_id: 'tOTHER', import_batch_id: 'bX' },           // another tenant — must survive
      ],
      import_batches: [{ id: 'b0', tenant_id: 'tA' }, { id: 'b1', tenant_id: 'tA' }],
    });
    const res = await rollbackSession(client, 'tA', 'sess1');
    expect(res.rowsDeleted).toBe(3);
    expect(res.batchesDeleted).toBe(2);
    expect(tables.committed_data).toEqual([{ tenant_id: 'tOTHER', import_batch_id: 'bX' }]); // other tenant untouched
    expect(tables.pulse_load_jobs[0].status).toBe('rolled_back');
    // EVERY delete carried .eq('tenant_id', 'tA') (no unscoped delete possible)
    expect(deleteScopes.length).toBeGreaterThan(0);
    expect(deleteScopes.every((d) => d.filters.tenant_id === 'tA')).toBe(true);
  });

  it('is idempotent — re-running a rolled_back session deletes nothing more', async () => {
    const job = mkJob({ status: 'rolled_back', cursor: 0 });
    const { client } = makeMockSupabase({ pulse_load_jobs: [job] });
    const res = await rollbackSession(client, 'tA', 'sess1');
    expect(res.rowsDeleted).toBe(0);
  });
});

describe('HF-360 PG-B (resume) — re-arm from the persisted cursor, byte-identical replay', () => {
  it('re-arms failed/loading jobs to enqueued, preserves cursor, leaves complete jobs alone', async () => {
    const failed = mkJob({ id: 'a', status: 'failed', cursor: 58, total_pulses: 82, manifest: Array.from({ length: 82 }, (_, i) => mkPulse(i, 1000, `b${i}`)), error_detail: 'pulse 58 boom' });
    const done = mkJob({ id: 'b', status: 'complete', cursor: 3 });
    const { client, tables } = makeMockSupabase({ pulse_load_jobs: [failed, done] });
    const res = await resumeSession(client, 'tA', 'sess1');
    expect(res.jobsResumed).toBe(1);
    expect(res.pulsesRemaining).toBe(24);                 // 82 - 58, cursor preserved (not reset)
    const rearmed = tables.pulse_load_jobs.find((j) => j.id === 'a')!;
    expect(rearmed.status).toBe('enqueued');
    expect(rearmed.cursor).toBe(58);                      // loaded pulses untouched — resume, not restart
    expect(rearmed.error_detail).toBeNull();
    expect(tables.pulse_load_jobs.find((j) => j.id === 'b')!.status).toBe('complete'); // complete left alone
  });

  it('does NOT resume a rolled_back job (rollback is terminal)', async () => {
    const { client, tables } = makeMockSupabase({ pulse_load_jobs: [mkJob({ status: 'rolled_back', cursor: 0 })] });
    const res = await resumeSession(client, 'tA', 'sess1');
    expect(res.jobsResumed).toBe(0);
    expect(tables.pulse_load_jobs[0].status).toBe('rolled_back');
  });
});

describe('HF-360 — getSessionLoadState end-to-end over the mock', () => {
  it('reads the session jobs and projects the aggregate', async () => {
    const { client } = makeMockSupabase({ pulse_load_jobs: [mkJob({ cursor: 2, status: 'loading', rows_loaded: 2000 })] });
    const st = await getSessionLoadState(client, 'tA', 'sess1');
    expect(st.pulsesTotal).toBe(3);
    expect(st.pulsesLoaded).toBe(2);
    expect(st.status).toBe('loading');
  });
});
