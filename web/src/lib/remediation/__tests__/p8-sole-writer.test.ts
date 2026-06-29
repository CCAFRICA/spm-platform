/**
 * OB-249 — P8 regression guard (review MAJOR fix), updated for HF-356. Runner: node --test --import tsx.
 *
 * P8 ("clean cannot bypass / the stage output is what gets promoted") is a platform invariant about ALL
 * committed_data writers, not just the one the e2e exercises. This test enforces it as a BUILD gate: it
 * scans the source tree for every committed_data WRITE site and asserts the set has not grown. The ONE
 * sanctioned SCI writer is commitContentUnit, which runs runRemediationConstruct unconditionally (the
 * mandatory gate). HF-356 changed its TRANSPORT — it no longer does a PostgREST `.insert` into
 * committed_data; it serializes the GATED rows to a CSV in Storage and calls the SECURITY DEFINER RPC
 * `bulk_commit_from_storage` ONCE (the database bulk-loads from its own Storage via the S3 FDW). That RPC
 * is the new physical writer, but it is CALLED only from commitContentUnit, downstream of the remediation
 * gate — so the invariant is preserved, only the mechanism moved. Two PRE-EXISTING non-SCI PostgREST
 * inserters remain known/flagged. Any NEW committed_data write — a `.insert` OR a new caller of the
 * bulk-load RPC — fails this test.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if ((name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

// A committed_data WRITE is either a PostgREST `.from('committed_data') … .insert(` (the two pre-existing
// legacy writers) OR a call to the sanctioned HF-356 bulk-load RPC (commitContentUnit's new transport).
const INSERT_RE = /\.from\(\s*['"]committed_data['"]\s*\)[\s\S]{0,220}?\.insert\s*\(/;
const RPC_RE = /\.rpc\(\s*['"]bulk_commit_from_storage['"]/;
const writesCommittedData = (src: string): boolean => INSERT_RE.test(src) || RPC_RE.test(src);

test('P8 guard: every committed_data WRITE site is accounted for (no new bypass of the remediation gate)', () => {
  const root = join(process.cwd(), 'src');
  const writers = walk(root)
    .filter((f) => !f.includes('__tests__'))
    .filter((f) => writesCommittedData(readFileSync(f, 'utf8')))
    .map((f) => f.slice(root.length + 1).split('\\').join('/'))
    .sort();

  // The ONLY sanctioned committed_data writer is the SCI/membrane gate (commitContentUnit), which runs
  // the remediation stage then bulk-loads via the RPC. The other two are PRE-EXISTING,
  // product-orphaned/dead, non-SCI PostgREST inserters flagged for the architect:
  const KNOWN = [
    'app/api/import/commit/route.ts',   // pre-existing legacy field-mapper (product-orphaned; flagged)
    'lib/sci/commit-content-unit.ts',   // OB-249 gate / HF-356 transport — runRemediationConstruct → bulk_commit_from_storage
    'lib/supabase/data-service.ts',     // pre-existing generic helper (dead: zero callers; flagged)
  ].sort();

  const unexpected = writers.filter((f) => !KNOWN.includes(f));
  assert.deepEqual(
    unexpected, [],
    `New committed_data WRITE site(s) detected: ${JSON.stringify(unexpected)}. Any writer in the ` +
    `SCI/membrane path MUST route through commitContentUnit (the remediation gate, I7/P8). Add it to ` +
    `the gate, or justify + update this guard.`,
  );
  // also assert the gate itself is still present (catches an accidental removal of the sole writer)
  assert.ok(writers.includes('lib/sci/commit-content-unit.ts'), 'commitContentUnit must remain the committed_data gate');
});

test('P8 guard: within the SCI import pipeline, commitContentUnit is the SOLE committed_data writer', () => {
  const root = join(process.cwd(), 'src');
  const sciWriters = walk(root)
    .filter((f) => !f.includes('__tests__'))
    .filter((f) => f.includes('/lib/sci/') || f.includes('/app/api/import/sci/'))
    .filter((f) => writesCommittedData(readFileSync(f, 'utf8')))
    .map((f) => f.slice(root.length + 1).split('\\').join('/'))
    .sort();
  assert.deepEqual(sciWriters, ['lib/sci/commit-content-unit.ts'],
    `SCI-pipeline committed_data writers must be exactly [commit-content-unit.ts]; found ${JSON.stringify(sciWriters)}`);
});

test('P8 guard (HF-356): the SCI gate writes via the bulk-load RPC, not a PostgREST committed_data insert', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/sci/commit-content-unit.ts'), 'utf8');
  // The transport swap is complete: the gate calls the RPC and no longer carries a raw committed_data insert.
  assert.ok(RPC_RE.test(src), 'commitContentUnit must call bulk_commit_from_storage (the S3-FDW bulk load)');
  assert.ok(!INSERT_RE.test(src), 'commitContentUnit must NOT contain a PostgREST committed_data .insert (HF-356 removed the HTTP row transport)');
});
