/**
 * HF-358 Part B — no silent failure. Runner: node --test --import tsx.
 *   PG-B1: recordCommitFailureOnJob writes error_detail + terminal status (and is non-throwing / no-op safe).
 *   PG-B2: the reclaim retry cap converges a repeatedly-crashing job to terminal 'failed' (no infinite loop).
 *   PG-B3: the failed-requeue kill-switch guard (.lt('retry_count', MAX_RETRIES)) is intact in dispatch-jobs.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordCommitFailureOnJob } from '../job-failure';
import { reclaimPatch, RECLAIM_STAGE_TARGET } from '../reclaim-policy';

// ── PG-B1 ────────────────────────────────────────────────────────────────────────────────────────
// Minimal chainable mock of the processing_jobs update used by recordCommitFailureOnJob.
function mockClient(opts: { rows?: number; error?: string } = {}) {
  const calls: { table?: string; patch?: Record<string, unknown>; eq: [string, unknown][]; neq: [string, unknown][] } = { eq: [], neq: [] };
  const chain = {
    update(p: Record<string, unknown>) { calls.patch = p; return chain; },
    eq(c: string, v: unknown) { calls.eq.push([c, v]); return chain; },
    neq(c: string, v: unknown) { calls.neq.push([c, v]); return chain; },
    select() { return Promise.resolve(opts.error ? { data: null, error: { message: opts.error } } : { data: Array.from({ length: opts.rows ?? 1 }, (_, i) => ({ id: `j${i}` })), error: null }); },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = { from(t: string) { calls.table = t; return chain; } } as any;
  return { client, calls };
}

test('PG-B1: an upload-error commit failure records error_detail + terminal status on the job', async () => {
  const { client, calls } = mockClient({ rows: 1 });
  const n = await recordCommitFailureOnJob(client, 'TENANT', 'SESSION', 'commit CSV upload failed for "Hoja": network');
  assert.equal(n, 1);
  assert.equal(calls.table, 'processing_jobs');
  assert.equal(calls.patch?.status, 'failed');                                  // terminal status
  assert.match(String(calls.patch?.error_detail), /upload failed/);             // human-readable mechanical reason
  assert.ok(calls.patch?.completed_at, 'completed_at set');
  assert.deepEqual(calls.eq, [['tenant_id', 'TENANT'], ['session_id', 'SESSION']]); // tenant- AND session-scoped
  assert.deepEqual(calls.neq, [['status', 'committed']]);                       // never flip a committed job
});

test('PG-B1: an RPC-error commit failure also records error_detail + terminal status', async () => {
  const { client, calls } = mockClient({ rows: 1 });
  const n = await recordCommitFailureOnJob(client, 'T', 'S', 'bulk_commit_from_storage failed for "Hoja": timeout');
  assert.equal(n, 1);
  assert.equal(calls.patch?.status, 'failed');
  assert.match(String(calls.patch?.error_detail), /bulk_commit_from_storage failed/);
});

test('PG-B1: no-op on the synchronous path (no session) and non-throwing on a DB error', async () => {
  const a = mockClient();
  assert.equal(await recordCommitFailureOnJob(a.client, 'T', null, 'x'), 0);    // null session → no write
  assert.equal(a.calls.table, undefined);
  const b = mockClient({ error: 'db exploded' });
  assert.equal(await recordCommitFailureOnJob(b.client, 'T', 'S', 'x'), 0);     // error → 0, did not throw
});

// ── PG-B2 ────────────────────────────────────────────────────────────────────────────────────────
const MAX_RETRIES = 3; // matches dispatch-jobs/route.ts (asserted by PG-B3)

test('PG-B2: a repeatedly-crashing committing job converges to terminal failed at MAX_RETRIES', () => {
  // Each tick models one crash→reclaim cycle: the worker crashed again (so the job is stuck 'committing'),
  // the sweep reclaims it. retry_count is the durable counter carried across cycles. The loop STOPS when
  // the job goes terminal 'failed' — once 'failed' the sweep's .eq('status','committing') no longer
  // selects it, so it is never re-dispatched (the DIAG-078 infinite loop is closed).
  let retry = 0;
  const seen: string[] = [];
  for (let tick = 1; tick <= 10; tick++) {
    const patch = reclaimPatch('committing', retry, MAX_RETRIES, '2026-06-29T00:00:00Z');
    retry = patch.retry_count;
    seen.push(`${patch.status}@${retry}`);
    if (patch.status === 'failed') break; // terminal — converged
  }
  // First MAX_RETRIES-1 reclaims reset to the stage target ('classified') with an incrementing counter;
  // the MAX_RETRIES-th marks terminal 'failed' with a reason, then the loop stops (no further dispatch).
  assert.deepEqual(seen, ['classified@1', 'classified@2', 'failed@3']);
  const final = reclaimPatch('committing', 2, MAX_RETRIES, '2026-06-29T00:00:00Z');
  assert.equal(final.status, 'failed');
  assert.match(String(final.error_detail), /Reclaimed 3 times without completing/);
  assert.ok(final.completed_at);
});

test('PG-B2: below the cap, a classifying job reclaims to pending and a committing job to classified', () => {
  assert.equal(reclaimPatch('classifying', 0, MAX_RETRIES, 'now').status, RECLAIM_STAGE_TARGET.classifying);
  assert.equal(reclaimPatch('committing', 0, MAX_RETRIES, 'now').status, RECLAIM_STAGE_TARGET.committing);
  assert.equal(reclaimPatch('committing', 0, MAX_RETRIES, 'now').status, 'classified');
  assert.equal(reclaimPatch('classifying', 0, MAX_RETRIES, 'now').retry_count, 1);
});

// ── PG-B3 ────────────────────────────────────────────────────────────────────────────────────────
test('PG-B3: the failed-requeue kill-switch guard (lt retry_count, MAX_RETRIES) is intact', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/api/import/sci/dispatch-jobs/route.ts'), 'utf8');
  assert.ok(/const MAX_RETRIES = 3;/.test(src), 'MAX_RETRIES defined');
  // the requeue selects status='failed' AND retry_count < MAX_RETRIES — so a kill-switched job
  // (retry_count >= MAX_RETRIES) is never resurrected. (HF-356 kill switch sets retry_count = 99.)
  assert.ok(/\.eq\('status',\s*'failed'\)/.test(src), "requeue keys on status='failed'");
  assert.ok(/\.lt\('retry_count',\s*MAX_RETRIES\)/.test(src), 'requeue caps on retry_count < MAX_RETRIES');
});
