/**
 * HF-359 Part B — restored pulse progression. Runner: node --test --import tsx.
 *   PG-B1: the commit emits CUMULATIVE per-pulse telemetry (pulse index + rows) through the EXISTING
 *          accumulateUnitCommitFields counters — seed, per-pulse, and resolve.
 *   PG-B2: the import surface renders "Writing pulse X of ~Y" (honest estimate) from those counters.
 *   PG-B3: reuse — the panel reads the existing /session-state?telemetry=1 + t.pulses/t.rows; no new surface.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estimatePulseTotal } from '../pulse-budget';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

test('PG-B1: commitUnitStreamed/Windowed emit cumulative per-pulse telemetry through the existing counters', () => {
  const src = read('src/lib/sci/windowed-commit.ts');
  // reuse the existing emit function (no parallel telemetry surface)
  assert.ok(/import \{ accumulateUnitCommitFields \} from '\.\/session-telemetry-accumulator'/.test(src), 'reuses accumulateUnitCommitFields');
  // a running cumulative pulse counter in BOTH paths
  assert.ok((src.match(/pulsesLanded \+= 1;/g) ?? []).length >= 2, 'cumulative pulsesLanded in both paths');
  // per-pulse write of cumulative index + rows + the ~Y estimate
  assert.ok(/fields: \{ pulsesLanded, rowsCommitted: totalInserted, pulsesTotal: Math\.max\(estTotalPulses, pulsesLanded\) \}/.test(src), 'per-pulse cumulative write');
  // a seed (pulsesTotal estimate, nothing landed) and a resolve (batchCommitted: true) per path
  assert.ok((src.match(/pulsesLanded: 0, rowsCommitted: 0, batchCommitted: false/g) ?? []).length >= 2, 'seed per path');
  assert.ok((src.match(/batchCommitted: true/g) ?? []).length >= 2, 'resolve/complete per path');
  // the estimate is the honest "~Y" = est. total bytes / budget
  assert.ok(/estimatePulseTotal\(totalRows(Known)?, avgRowBytes, budget\.byteBudget\)/.test(src), 'pulsesTotal = estimatePulseTotal');
});

test('PG-B1b: estimatePulseTotal is the honest est-total-bytes / budget (refined upward by Math.max as pulses land)', () => {
  // 86,607 rows × ~2.4KB avg / 32MB budget → ~7 pulses estimate (a forward-looking ~Y)
  const est = estimatePulseTotal(86_607, 2400, Math.floor(0.8 * 40 * 1024 * 1024));
  assert.ok(est >= 6 && est <= 9, `estimate ${est} should be ~7`);
  assert.equal(estimatePulseTotal(0, 100, 1000), 1); // never zero
});

test('PG-B2: the import surface renders "Writing pulse X of ~Y" from the existing telemetry counters', () => {
  const panel = read('src/components/sci/ImportTelemetryPanel.tsx');
  assert.ok(/Writing pulse/.test(panel), 'renders "Writing pulse"');
  assert.ok(/of ~\$\{t\.pulses\.total\}/.test(panel), 'honest "~Y" (estimate marker) from t.pulses.total');
  assert.ok(/t\.rows\.committed.*t\.rows\.total/.test(panel), 'rows committed against the exact total');
});

test('PG-B3: reuse — the panel reads the existing session-state telemetry endpoint, not a new surface', () => {
  const panel = read('src/components/sci/ImportTelemetryPanel.tsx');
  assert.ok(/\/api\/import\/sci\/session-state\?.*telemetry=1/.test(panel), 'polls the existing session-state telemetry endpoint');
  assert.ok(/data\.telemetry/.test(panel), 'reads the existing ImportTelemetry projection');
  // no parallel pulse-progress component/endpoint introduced by HF-359
  const route = read('src/app/api/import/sci/session-state/route.ts');
  assert.ok(/projectImportTelemetry/.test(route), 'the telemetry projection is the one existing source');
});
