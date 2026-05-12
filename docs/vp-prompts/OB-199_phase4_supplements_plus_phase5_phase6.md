# OB-199 Phase 4 Supplements + Phase 5 + Phase 6

**Branch:** `ob-199-canonical-signal-write-implementation`
**Predecessor:** Phase 4 close `93d6e793`, deletion-intent verification `8807c82c`, AUD-007 evidence `df838536`.

Architect-dispositioned four ARCHITECT VERIFY rows from `docs/CC-artifacts/OB-199_phase4_deletion_intent_verification.md`:
- Row 3: accept as written
- Row 4-sub: add compile-time exhaustiveness test
- Row 6: restore per-row diagnostic for non-range batch failures
- Row 8-sub-A: restore `writeClassificationSignal` as thin facade

Three code commits + Phase 5 production wipe + Phase 6 PR.

---

## Commit 1 — Restore `writeClassificationSignal` as thin facade (Row 8-sub-A)

Restore the function in `web/src/lib/sci/classification-signal-service.ts`. The facade hardcodes the four SCI structural commitments (`signalType: 'classification:outcome'`, `scope: 'tenant'`, `source: payload.humanCorrectionFrom ? 'user_corrected' : 'sci_agent'`, `context: { sciVersion: '2.0', phase: 'E', schema: 'HF-092' }`), maps `ClassificationSignalPayload` fields to `CanonicalSignalInput`, and delegates to `writeSignal` from `@/lib/intelligence/canonical-signal-writer`. Propagates `CanonicalWriteError` to caller; returns `Promise<void>` (callers only consume `.catch`).

Migrate the 5 SCI call sites back from inline `writeSignal({...})` to `writeClassificationSignal(payload, supabaseUrl, supabaseServiceKey)`:
- `api/import/sci/execute/route.ts:377`
- `api/intelligence/converge/route.ts:95`
- `api/intelligence/converge/route.ts:122`
- `api/import/sci/process-job/route.ts:343`
- `api/import/sci/analyze/route.ts:464`

Preserve each site's existing `.catch` handler verbatim (per-module tag + CanonicalWriteError cause discriminator).

**Verify:**
- Tests green
- `grep -rn "sciVersion: '2.0'" web/src/` returns 1 match (facade definition) + 2 in signal-capture-service.ts (sciVersion 1.0 — different)
- `grep -rnE "\.from\(['\"]classification_signals['\"]?\)\.insert" web/src/` returns only canonical-signal-writer.ts + test mock

Commit message: `OB-199 Phase 4 supplement A: restore writeClassificationSignal as thin facade per Row 8-sub-A disposition. Function-level SCI marker commitment restored; DS-023 §5.1 single-entry-point preserved.`

---

## Commit 2 — Per-row diagnostic in `writeSignalBatchWithClient` (Row 6)

Inside the `try { ... await supabase.from('classification_signals').insert(rows) ... }` block at `canonical-signal-writer.ts:417`, before `throw new CanonicalWriteError(...)` at line 420, iterate the batch on insert error and emit per-row `console.error`:

```typescript
for (let i = 0; i < signals.length; i++) {
  const s = signals[i];
  const sv = (s.signalValue ?? {}) as Record<string, unknown>;
  const metricName = sv['metric_name'] ?? null;
  const componentIndex = sv['component_index'] ?? null;
  const svJson = JSON.stringify(s.signalValue ?? null);
  const svTruncated = svJson.length > 200 ? svJson.slice(0, 200) + '…' : svJson;
  console.error(
    `[CanonicalWriter] batch row=${i} signal_type=${s.signalType} ` +
    `confidence=${String(s.confidence)} ` +
    `metric_name=${String(metricName)} ` +
    `component_index=${String(componentIndex)} ` +
    `signal_value_truncated=${svTruncated}`,
  );
}
```

Add one test: mock supabase to return `{ error: { message: 'unique constraint violation' } }`; call `writeSignalBatchWithClient` with 3 mock signals; spy on `console.error`; assert 3 per-row lines + 1 `CanonicalWriteError` throw.

Commit message: `OB-199 Phase 4 supplement B: per-row diagnostic for non-range batch failures (Row 6). HF-214 Phase 1 forensic granularity restored.`

---

## Commit 3 — AITaskType exhaustiveness compile-time test (Row 4-sub)

Add `web/src/lib/intelligence/__tests__/ai-task-type-exhaustiveness.test.ts`. Read the actual `AITaskType` declaration from source (likely in `lib/ai/types.ts` or similar — locate via grep). Populate `ALL_AI_TASK_TYPES` with every enum member.

```typescript
import type { AITaskType } from '<actual path>';
import { lookupAITaskSignalType } from '@/lib/intelligence/signal-registry';

const ALL_AI_TASK_TYPES = [/* every AITaskType member */] as const satisfies readonly AITaskType[];

type Missing = Exclude<AITaskType, (typeof ALL_AI_TASK_TYPES)[number]>;
const _exhaustivenessCheck: Missing extends never ? true : never = true;
void _exhaustivenessCheck;

describe('AITaskType registry exhaustiveness', () => {
  it('every AITaskType resolves via lookupAITaskSignalType', () => {
    for (const t of ALL_AI_TASK_TYPES) {
      expect(lookupAITaskSignalType(t)).not.toBeNull();
    }
  });
});
```

The `Exclude` + `_exhaustivenessCheck` pattern produces a TypeScript compile error if a new `AITaskType` member is added without extending `ALL_AI_TASK_TYPES`. The runtime `it` block fails if a member is extended but the registry mapping is missing.

Commit message: `OB-199 Phase 4 supplement C: compile-time AITaskType exhaustiveness test (Row 4-sub). Structural-typing parity restored for the deleted Record<AITaskType, string> exhaustiveness.`

---

## Halt conditions (apply to all three commits)

- Any test failure: halt, surface
- TypeScript compile failure: halt, surface
- Coverage-trust grep returns any new match outside canonical-signal-writer.ts: halt, surface
- Cannot locate `AITaskType` declaration for commit 3: halt, surface

---

## Phase 6 — PR open + completion report

After commits 1–3 land green:

1. Author `docs/CC-artifacts/OB-199_phase6_completion_report.md` covering:
   - Phases 0–4 + supplements A/B/C summary
   - AUD-006 finding closure status (8 of 10 in-scope CLOSED; F-AUD-006-006 deferred to Phase 5 architect-execution)
   - AUD-001 F-002 + F-003 closure verification (verbatim grep result, error-handling pattern comparison)
   - AUD-004 v3 E1–E6 status post-OB-199
   - DS-021 G1–G11 verification at signal-write surface
   - SCI structural preservation per AUD-007 evidence
   - Four ARCHITECT VERIFY dispositions recorded
   - Out-of-scope: c4 magnitude defect at `route.ts:1793/1798` (HF-216 successor); AUD-004 v3 cluster B Korean Test concerns; HF-198 campaign continuation
   - Commit lineage on branch

2. Open PR:
```bash
gh pr create --base main --head ob-199-canonical-signal-write-implementation \
  --title "OB-199: Canonical Signal Write Surface implementation (DS-023)" \
  --body-file docs/CC-artifacts/OB-199_phase6_completion_report.md
```

---

## Phase 5 — Production wipe (architect-executed post-merge)

After PR merges and production deploys, architect runs in Supabase SQL Editor:

**Pre-wipe** (for record):
```sql
SELECT count(*) FROM classification_signals;
SELECT signal_type, count(*) FROM classification_signals GROUP BY signal_type ORDER BY count(*) DESC;
SELECT signal_type, count(*) FROM classification_signals WHERE confidence = 1.0 GROUP BY signal_type;
SELECT signal_type, count(*) FROM classification_signals WHERE confidence = 0.9999 GROUP BY signal_type;
```

**Wipe:**
```sql
TRUNCATE TABLE classification_signals;
```

**Post-wipe** (verify):
```sql
SELECT count(*) FROM classification_signals;  -- expected 0
```

Post-wipe first SCI execute writes a fresh `classification:outcome` row through the canonical writer + facade; verify `confidence` is the producer's asserted ratio (not 0.9999), `context` contains the SCI markers, dedicated columns populated.

DS-023 §5.6 closure on F-AUD-006-006 completes when post-wipe SELECT returns 0.
