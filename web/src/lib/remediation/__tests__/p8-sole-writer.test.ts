/**
 * OB-249 — P8 regression guard (review MAJOR fix). Runner: node --test --import tsx.
 *
 * P8 ("clean cannot bypass / the stage output is what gets promoted") is a platform invariant about
 * ALL committed_data writers, not just the one the e2e exercises. This test enforces it as a BUILD
 * gate: it scans the source tree for every committed_data INSERT site and asserts the set has not
 * grown. The ONE sanctioned writer is commitContentUnit (which runs runRemediationConstruct
 * unconditionally — the mandatory gate). Two PRE-EXISTING non-SCI writers are known and documented;
 * OB-249 does not modify routes it did not author (out of scope), so they are flagged for the
 * architect to 410/route-through. Any NEW committed_data INSERT anywhere fails this test.
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

// `.from('committed_data') … .insert(` within a short window (handles the multiline builder chain).
const INSERT_RE = /\.from\(\s*['"]committed_data['"]\s*\)[\s\S]{0,220}?\.insert\s*\(/;

test('P8 guard: every committed_data INSERT site is accounted for (no new bypass of the remediation gate)', () => {
  const root = join(process.cwd(), 'src');
  const inserters = walk(root)
    .filter((f) => !f.includes('__tests__'))
    .filter((f) => INSERT_RE.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(root.length + 1).split('\\').join('/'))
    .sort();

  // The ONLY sanctioned committed_data writer is the SCI/membrane gate (commitContentUnit), which
  // runs the remediation stage. The other two are PRE-EXISTING, product-orphaned/dead, non-SCI
  // writers flagged for the architect (OB-249 scope excludes modifying them):
  const KNOWN = [
    'app/api/import/commit/route.ts',   // pre-existing legacy field-mapper (product-orphaned; flagged)
    'lib/sci/commit-content-unit.ts',   // OB-249 mandatory gate — runs runRemediationConstruct
    'lib/supabase/data-service.ts',     // pre-existing generic helper (dead: zero callers; flagged)
  ].sort();

  const unexpected = inserters.filter((f) => !KNOWN.includes(f));
  assert.deepEqual(
    unexpected, [],
    `New committed_data INSERT site(s) detected: ${JSON.stringify(unexpected)}. Any writer in the ` +
    `SCI/membrane path MUST route through commitContentUnit (the remediation gate, I7/P8). Add it to ` +
    `the gate, or justify + update this guard.`,
  );
  // also assert the gate itself is still present (catches an accidental removal of the sole writer)
  assert.ok(inserters.includes('lib/sci/commit-content-unit.ts'), 'commitContentUnit must remain the committed_data gate');
});

test('P8 guard: within the SCI import pipeline, commitContentUnit is the SOLE committed_data writer', () => {
  const root = join(process.cwd(), 'src');
  const sciInserters = walk(root)
    .filter((f) => !f.includes('__tests__'))
    .filter((f) => f.includes('/lib/sci/') || f.includes('/app/api/import/sci/'))
    .filter((f) => INSERT_RE.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(root.length + 1).split('\\').join('/'))
    .sort();
  assert.deepEqual(sciInserters, ['lib/sci/commit-content-unit.ts'],
    `SCI-pipeline committed_data writers must be exactly [commit-content-unit.ts]; found ${JSON.stringify(sciInserters)}`);
});
