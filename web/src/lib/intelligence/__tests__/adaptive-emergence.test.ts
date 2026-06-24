// HF-219 Component R4 — Adaptive-Emergence Regression Test.
//
// Purpose: verify the platform's open-vocabulary signal contract operatively.
// Per Disposition 5 + AP-26: signal_types are open-vocabulary strings; emitters
// produce signal_types freely without prior registration; consumers subscribe
// via pattern-matching predicates against classification_signals directly.
//
// If this test fails in any future HF, the registry-as-gate pattern has recurred
// and must be eradicated again. The test sits as a permanent regression gate.
//
// Test 1: Novel signal_type emits to canonical writer without prior registration
// Test 2: Pattern-matching consumer receives novel signal_type matching prefix
// Test 3: No signal-registry file exists
// Test 4: No code path references signal-registry imports

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { SupabaseClient } from '@supabase/supabase-js';
import { writeSignalWithClient, type CanonicalSignalInput } from '../canonical-signal-writer';

// Reusable mock supabase client (matches canonical-signal-writer.test.ts pattern).
type Recorded = { table: string; payload: unknown };
function makeMockClient() {
  const calls: Recorded[] = [];
  const client = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, payload });
          // OB-235 P1: writeSignalWithClient's single-write path chains .select('id').single(); the mock is
          // a thenable ({ error }) that also exposes .select().single() → { data:{id}, error }.
          const result = { data: { id: 'mock-id' }, error: null };
          return {
            select() { return { single() { return Promise.resolve(result); } }; },
            then(onF: (v: { error: unknown }) => unknown, onR?: (e: unknown) => unknown) {
              return Promise.resolve({ error: null }).then(onF, onR);
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test('HF-219 R4 Test 1 — Novel signal_type emits to canonical writer without prior registration', async () => {
  const { client, calls } = makeMockClient();
  const novelType = `convergence:test_novel_pattern_${Date.now()}`;
  const signal: CanonicalSignalInput = {
    tenantId: 'test-tenant',
    signalType: novelType,
    signalValue: { test: true },
    source: 'ai_prediction',
    confidence: 0.5,
  };
  const result = await writeSignalWithClient(signal, client);
  assert.strictEqual(result.success, true, 'novel signal_type must succeed without registration');
  // Verify the row landed with the novel type intact
  assert.strictEqual(calls.length, 1, 'one insert');
  const row = calls[0].payload as Record<string, unknown>;
  assert.strictEqual(row.signal_type, novelType, 'novel signal_type persisted verbatim');
});

test('HF-219 R4 Test 2 — Pattern-matching subscriber receives novel signal_type matching prefix', async () => {
  // Simulate the pattern-based subscription contract: emit a novel signal_type
  // with a known prefix, then verify a consumer querying by prefix LIKE pattern
  // would match. The test uses an in-memory mock; real consumers use SQL.
  const { client, calls } = makeMockClient();
  const novelType = `convergence:test_emergent_${Date.now()}`;
  const signal: CanonicalSignalInput = {
    tenantId: 'test-tenant',
    signalType: novelType,
    signalValue: { test: true },
    confidence: 0.7,
  };
  await writeSignalWithClient(signal, client);
  // Consumer simulation: filter by prefix
  const emitted = calls[0].payload as Record<string, unknown>;
  const matchesPrefix = typeof emitted.signal_type === 'string'
    && (emitted.signal_type as string).startsWith('convergence:');
  assert.ok(matchesPrefix, 'novel signal_type matches "convergence:%" prefix subscription');
});

test('HF-219 R4 Test 3 — No signal-registry file in lib/intelligence', () => {
  const registryPath = path.join(__dirname, '..', 'signal-registry.ts');
  assert.strictEqual(
    fs.existsSync(registryPath),
    false,
    `signal-registry.ts must NOT exist at ${registryPath} (closed-vocabulary registries violate AP-26)`,
  );
});

test('HF-219 R4 Test 4 — No signal-registry imports in any web/src/ file', () => {
  // Search for import statements only (not comments referencing the prior file).
  // The grep pattern targets active import-from-signal-registry references.
  let result = '';
  try {
    result = execSync(
      "grep -rln \"from .*signal-registry\\|from '.*signal-registry\" web/src/ --include=\"*.ts\" || true",
      { encoding: 'utf-8', cwd: path.join(__dirname, '../../../..') },
    );
  } catch {
    result = '';
  }
  assert.strictEqual(
    result.trim(),
    '',
    `Zero files may import from signal-registry. Active imports detected:\n${result}`,
  );
});
