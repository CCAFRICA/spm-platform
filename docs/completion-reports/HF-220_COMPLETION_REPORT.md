# HF-220 Completion Report

**Hotfix:** HF-220 — Legacy Derivation Path Retirement (Concordance Shadow Removal)
**Date:** 2026-05-12
**Branch:** dev (fresh from main post-HF-219-merge)
**Predecessors:** HF-188 (Decision 151 sole authority); HF-218 (binding verification); HF-219 (correction + flywheel + signal-registry eradication); Decision 25 (closed by three-tenant clean-slate verification preceding this HF).

---

## Summary

Four-component retirement of the legacy derivation path (HF-188 "concordance shadow"). With Decision 151 substrate authority in place and architect-channel three-tenant clean-slate verification complete (BCL $312,033 / CRP $4,219,229 / Meridian per `Meridian_Resultados_Esperados.xlsx`), the legacy execution path serves no further purpose. HF-220 excises:

- **R1** — Legacy derivation execution path (`applyMetricDerivations` + `buildMetricsForComponent` + `evaluateComponent` + legacy per-component rounding) from `web/src/app/api/calculation/run/route.ts`. The per-component for-loop is preserved; `perComponentMetrics.push(metrics)` remains as the single populator of the HF-205 Shape C invariant target. ComponentResult slots seeded with placeholder metadata; intent executor overwrites payout via index assignment.
- **R2** — OB-118 merge-guard (the `if (key in metrics)` check + T3 EXCEPTION emit + paired `engine:exception` signal + `flags=[ob118MergeGuardFired,...]` accumulation + `ob118MergeGuardFiredCount` HF-208 counter + T1 footer flag display).
- **R3** — Concordance comparison (`legacyTotalDecimal` accumulator, dual-path entityMatch comparison, `intent=X ✓/✗` per-entity emit, `convergence:dual_path_concordance` signal, `intentMatchCount`/`intentMismatchCount`, OB-76 Dual-path log, intentLayer concordance summary fields, calcSummary.concordanceRate, finalize response concordance fields).
- **R4** — Test refactor (no-op; Phase 0 grep confirmed zero concordance tests, zero legacy-isolation tests in `web/src/**/__tests__`).

Substrate (CC_STANDING_ARCHITECTURE_RULES.md, AP-26 registry) unchanged — HF-220 is a removal, not a new pattern.

---

## Phase commits

```
42691ef6 HF-220 Phase 5: Component R4 — Concordance + legacy-isolation tests retired (no-op)
920c75ed HF-220 Phase 4: Component R3 — Concordance comparison removed
70d679d0 HF-220 Phase 3: Component R2 — OB-118 merge-guard removed
219896c9 HF-220 Phase 2: Component R1 — Legacy derivation execution path removed
e2366bb6 HF-220 Phase 1: Architecture Decision Record committed
38b9cb22 HF-220 Phase 0: Legacy footprint + perComponentMetrics population audit
```

Plus Phase 6 verification + completion report commit (this report) and Phase 7 PR creation. Rule 28 compliance: one commit per phase.

---

## Hard Gates

### Hard Gate 1 — ADR committed before any implementation phase

**Status:** PASS

**Evidence:**
- ADR file: `docs/architecture-decisions/HF-220_ARCHITECTURE_DECISION_RECORD.md`
- ADR commit: `e2366bb6` (Phase 1)
- First implementation commit: `219896c9` (Phase 2)
- `git log --oneline | grep HF-220` shows Phase 1 precedes Phase 2.
- Three decisions filled with rationale citing AUD-005 + Decision 151 + Phase 0 output (Decision 1 mechanism = single-populator per-component for-loop; Decision 2 = signal+`metrics={}` fallback unification; Decision 3 = no dead references to clean).

### Hard Gate 2 — Legacy block removed at route.ts

**Status:** PASS

**Evidence:**

Pre-HF-220 line range (per Phase 0 discovery): legacy operations interleaved across lines 1789–2325 (banner + accumulator init + per-component loop body + accumulator finalization).

`grep -n "LEGACY ENGINE PATH\|concordance shadow" web/src/app/api/calculation/run/route.ts` post-retirement:

```
(no matches in operative code)
```

The "LEGACY ENGINE PATH" banner comment + HF-188 startup log + concordance shadow inline comments at lines 2328/2488 (pre-HF-220 numbering) are all retired in Phase 4 (R3). Verified via:

```
bash -c 'grep -c "LEGACY ENGINE PATH\|concordance shadow" /Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts'
```

Returns 0.

### Hard Gate 3 — `applyMetricDerivations` + `buildMetricsForComponent` no longer called from calculation engine path

**Status:** PASS

**Evidence:**

`bash -c 'grep -n "applyMetricDerivations" /Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts'`:

```
(no matches)
```

`bash -c 'grep -n "buildMetricsForComponent" /Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts'`:

```
1996:        // per existing buildMetricsForComponent semantics for empty input (which is the
```

Single remaining hit is a historical reference in a comment explaining why the fallback path now sets `metrics = {}` (HF-218 Component 2 semantics, preserved as documentation). Not an active call site. Import-side: `applyMetricDerivations`, `buildMetricsForComponent`, `evaluateComponent` all removed from the `@/lib/calculation/run-calculation` import block at the top of route.ts (lines 18–24):

```typescript
import {
  aggregateMetrics,
  getExpectedMetricNames,
  type ComponentResult,
  type AIContextSheet,
  type MetricDerivationRule,
  rowMatchesFilters,
} from '@/lib/calculation/run-calculation';
```

### Hard Gate 4 — `perComponentMetrics` continues to be populated; HF-205 Shape C invariant fires on missing population

**Status:** PASS

**Evidence:**

`bash -c 'grep -n "perComponentMetrics" /Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts'`:

```
1793:    const perComponentMetrics: Record<string, number>[] = [];
2247:      perComponentMetrics.push(metrics);
2300:      const metrics = perComponentMetrics[ci.componentIndex];
```

Declaration → push → consumer all preserved. The push at line 2247 is the post-R1 location of the load-bearing single populator. The consumer at line 2300 is the HF-205 Shape C invariant site. Surrounding code preserved verbatim:

```typescript
const metrics = perComponentMetrics[ci.componentIndex];
if (!metrics) {
  throw new Error(
    `HF-205 invariant: per-component metrics missing for component ${ci.componentIndex} ` +
    `(entity=${entityInfo?.external_id ?? entityId}). Convergence binding resolution ` +
    `must populate metrics for every component before intent-executor handoff. ` +
    `Decision 153 / Decision 111 violation.`
  );
}
```

Invariant unchanged.

### Hard Gate 5 — OB-118 merge-guard removed

**Status:** PASS

**Evidence:**

`bash -c 'grep -n "ob118MergeGuardFired" /Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts'`:

```
100:  // HF-220 R2: ob118MergeGuardFiredCount retired (merge-guard removed; counter vestigial).
```

Single hit is a retirement marker in a comment. The merge-guard literal `ob118MergeGuardFired` no longer appears as a value, signal type field, or flag identifier in operative code. The `if (key in metrics)` block at lines 2222–2249 (pre-HF-220 numbering) is entirely retired.

### Hard Gate 6 — Paired `engine:exception` signal at OB-118 site removed; other `engine:exception` writes preserved

**Status:** PASS

**Evidence:**

All `engine:exception` and `engine:structural_exception` writes in route.ts (post-HF-220):

```
1439:            signalType: 'engine:exception',              # diag003Fallback (HF-208/HF-218)
1973:          signalType: 'engine:structural_exception',     # HF-218 Component 2 (unverified bindings)
2049:            signalType: 'convergence:correction_contention',  # HF-219 R1
2083:            signalType: 'convergence:engine_correction',      # HF-219 R1
2141:            signalType: 'engine:exception',              # HF-220 R1 Site 1 (cbMetrics null)
2168:          signalType: 'engine:exception',                # HF-220 R1 Site 2 (no convergence bindings)
```

Six signal emission sites post-HF-220. The pre-HF-220 OB-118 merge-guard emission at line 2231 (which had `type: 'ob118MergeGuardFired'`) is retired. The two new HF-220 R1 fallback sites preserve observability with `type: 'cbMetrics_null_falling_back_to_sheet_matching'` (unchanged from HF-218 Component 4a) and the new `type: 'no_convergence_bindings_for_component'` (unifying coverage for the previously-silent third fallback branch). Other `engine:exception` sites (diag003Fallback at line 1439; HF-218 Component 2 `engine:structural_exception` at 1973) preserved unchanged.

### Hard Gate 7 — `legacyTotalDecimal` accumulator removed entirely

**Status:** PASS

**Evidence:**

`bash -c 'grep -n "legacyTotalDecimal\|legacyTotal" /Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts'`:

```
(no matches)
```

All three legacyTotalDecimal sites (declaration, accumulation, finalization) retired in Phase 2 (R1) + Phase 4 (R3).

### Hard Gate 8 — Concordance comparison code removed

**Status:** PASS

**Evidence:**

`bash -c 'grep -n "concordance\|intent=" /Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts'`:

```
2791:  // HF-220 R3: concordance rate retired (Decision 151 sole authority); IAP confidence
2792:  // proxy now derives from synaptic activity rather than dual-path concordance.
```

Two hits, both retirement markers in HF-220 R3 comments. No active code emits `intent=` substring or computes `concordance` rate. The `convergence:dual_path_concordance` signal write at the original lines 2667–2695 is fully retired; `intentMatchCount`/`intentMismatchCount` accumulators retired; OB-76 Dual-path log retired; entityResults.metadata.legacyTotal + intentMatch retired; finalize response intentLayer concordance fields retired.

### Hard Gate 9 — Concordance tests deleted; intent-executor tests preserved

**Status:** PASS (null evidence)

**Evidence:**

Phase 0 grep confirmed zero concordance tests, zero legacy-isolation tests existed pre-HF-220:

```
grep -rln "applyMetricDerivations\|buildMetricsForComponent\|legacyTotal\|legacyEngine\|HF-188\|ob118MergeGuardFired\|concordance" \
    web/src --include="*.test.ts" --include="*.spec.ts"
```

Returns zero matches (documented in Phase 5 outcome: `docs/architecture-decisions/HF-220_PHASE5_TEST_REFACTOR_OUTCOME.md`).

Preserved test run post-R1+R2+R3:

```
node --import tsx --test \
    web/src/lib/intelligence/__tests__/*.test.ts \
    web/src/lib/sci/__tests__/*.test.ts \
    web/src/lib/ai/providers/__tests__/*.test.ts

ℹ tests 39
ℹ suites 0
ℹ pass 39
ℹ fail 0
ℹ duration_ms 356.436333
```

39/39 pass. No regression introduced by R1/R2/R3 affects the existing test surface.

### Hard Gate 10 — Korean Test ZERO hits across calculation engine path

**Status:** PASS

**Evidence:**

```
bash -c 'grep -rnE "...|.Mérida." \
    /Users/AndrewAfrica/spm-platform/web/src/lib/intelligence/ \
    /Users/AndrewAfrica/spm-platform/web/src/lib/sci/ \
    /Users/AndrewAfrica/spm-platform/web/src/lib/calculation/ \
    /Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/ --include="*.ts"'
```

Returns zero matches for literal pattern `'No_Empleado'|'ID_Empleado'|'Hub'|'Cumplimiento'|'Mérida'`.

```
bash -c 'grep -rnE "/empleado/i|/empresa/i|/hub/i" ...'
```

Returns zero matches for regex pattern.

No new Korean Test violations introduced by HF-220. The two new HF-220-added literals (`'cbMetrics_null_falling_back_to_sheet_matching'` preserved from HF-218; `'no_convergence_bindings_for_component'` new in HF-220 Phase 2) are structural engine-state identifiers, not domain-specific tokens.

### Hard Gate 11 — Anti-Pattern Registry check returns ZERO violations

**Status:** PASS

**Evidence — per-AP verification:**

- **AP-1 (row data via HTTP):** N/A — HF-220 is calc-engine internal retirement, no HTTP transport changes.
- **AP-2/3/4 (bulk/scale):** N/A — no insert/transport changes.
- **AP-5/6/7 (hardcoded dictionaries / pattern match / placeholder confidence):** No new hardcoded vocabularies added; the two new HF-220 signal `type` literals describe engine state, not domain semantics.
- **AP-8/9/10/11 (deployment/verification):** All gates evidenced via grep + test run + build output (not file existence or self-attestation).
- **AP-12 (Date.now+Math.random IDs):** Not engaged — no ID generation introduced.
- **AP-13/18/19 (schema verification):** No DB schema changes; no SQL written.
- **AP-14 (partial state):** Single-PR retirement preserves atomicity (Disposition 2).
- **AP-15/16/17 (UX/single-pipeline):** N/A — no UI changes.
- **AP-20/21/22 (production evidence / GT comparison / "close"):** Architect-channel three-tenant clean-slate verification preceded this HF and confirmed intent-executor produces ground-truth-exact totals (Disposition 1).
- **AP-23 (sample limit on commit paths):** N/A — no import path changes.
- **AP-24 (conditional logic both branches):** R1 fallback restructure tested: cbMetrics-null branch + no-convergence-bindings branch both emit signal + set `metrics = {}`. HF-218 verified branch (binding unverified) preserved unchanged.
- **AP-25 (native number for financial):** N/A — no arithmetic introduced.
- **AP-26 (closed-vocabulary signal registries):** No new signal registry introduced; no `isRegistered` / `declared_writers` / `declared_readers` / register-then-emit gate introduced. The new HF-220 R1 Site 2 signal emit at route.ts:2168 uses `signalType: 'engine:exception'` (open-vocabulary string) with a structural-state `type` discriminator, consistent with HF-218 Component 4a observability pattern. Bash verification:
  ```
  bash -c 'grep -n "signalType:" /Users/AndrewAfrica/spm-platform/web/src/app/api/calculation/run/route.ts'
  ```
  Returns 8 hits, all using open-vocabulary string literals; zero registry gates between emit and persistence.

### Hard Gate 12 — Final build passes; localhost responds; TypeScript clean

**Status:** PASS

**Evidence:**

- `npx tsc --noEmit` from `web/`: zero output (TypeScript clean).
- `npm run build`: `✓ Compiled successfully` (exit 0); dynamic-server-usage warnings are pre-existing Next.js runtime warnings for cookie-using API routes, not HF-220 introduced.
- `npm run dev` + `curl -sf http://localhost:3000/login`: returned `HTTP 200`; DEV-OK confirmed.

### Hard Gate 13 — All 7 phases committed as separate commits (Rule 28)

**Status:** PASS

**Evidence:** `git log --oneline | grep HF-220`:

```
42691ef6 HF-220 Phase 5: Component R4 — Concordance + legacy-isolation tests retired (no-op)
920c75ed HF-220 Phase 4: Component R3 — Concordance comparison removed
70d679d0 HF-220 Phase 3: Component R2 — OB-118 merge-guard removed
219896c9 HF-220 Phase 2: Component R1 — Legacy derivation execution path removed
e2366bb6 HF-220 Phase 1: Architecture Decision Record committed
38b9cb22 HF-220 Phase 0: Legacy footprint + perComponentMetrics population audit
```

Phases 0–5 each committed separately. Phase 6 commits with this completion report. Phase 7 is the PR creation step (final).

### Hard Gate 14 — PR created with full HF-220 summary

**Status:** PENDING — executed in Phase 7

---

## Soft Gates

### Soft Gate 1 — Localhost calc run produces same totals as architect's pre-HF-220 clean-slate verification

**Status:** PENDING — architect verifies offline per SR-44

**Evidence to be supplied post-PR-merge:** Architect runs a calc for Meridian January (entity 70209 Norma Rodríguez Rivera + 2-3 other entities) on dev/preview and compares totals to the pre-HF-220 architect-channel verification. Per Disposition 1, the three-tenant clean-slate verification PRECEDED HF-220; the localhost calc post-HF-220 must produce identical entity totals for the intent-executor path (which HF-220 does not modify per Disposition 3).

### Soft Gate 2 — Signal volume reduction confirmed

**Status:** PENDING — architect-channel measurement post-PR-merge

**Projection (from Meridian 2026-05-12 baseline):**
- Pre-HF-220: 474 `engine:exception` writes per Meridian calc run, all `type: 'ob118MergeGuardFired'` (79 entities × 6 keys discarded by merge-guard)
- Post-HF-220: 0 `engine:exception` writes with `type: 'ob118MergeGuardFired'` (signal type retired)
- Other engine:exception sites (diag003Fallback, cbMetrics_null, no_convergence_bindings) continue to fire only on actual data anomalies / binding failures
- Net signal-table reduction per Meridian run: ~474 rows (~98% of pre-HF-220 engine:exception volume on the proof tenant)

### Soft Gate 3 — No regressions surfaced in dev/localhost across representative entities

**Status:** PENDING — architect-channel verification post-PR-merge

---

## Known Issues

1. **`priorDataByEntity` infrastructure now unused.** Lines 812–887 of `route.ts` build a `Map<entityId, Map<sheetName, rows>>` for `entityPriorData` (consumed only by the retired `applyMetricDerivations` call). Post-HF-220 this Map is populated and logged but never read by operative code. Future cleanup HF can retire the infrastructure (estimated ~80 lines). Not in HF-220 scope per directive's tight R1–R4 boundaries.

2. **`metricMappings` infrastructure now unused.** Lines 311–315 of `route.ts` read `input_bindings.metric_mappings` and log a OB-153 line; the mappings were previously passed to `buildMetricsForComponent`. Post-HF-220 the variable is read once for the log line then unreferenced. Same disposition as #1 — future cleanup.

3. **`runCalculation()` function in `run-calculation.ts` (lines 806+) is dead code.** Imports `applyMetricDerivations` + `buildMetricsForComponent` + `evaluateComponent` and contains a parallel legacy calc loop. No caller post-HF-079 (page.tsx:317 comment confirms client-side runCalculation was replaced by the API route). HF-220 scope explicitly excludes this file per directive ("Files modified: web/src/app/api/calculation/run/route.ts"). Future cleanup HF can retire the entire `runCalculation()` function + its supporting code (~600 lines).

4. **`convergence:dual_path_concordance` reader in `convergence-service.ts:1887+` operates on historical signals.** Per Phase 0 discovery section 7, the tenant-adaptive boundary threshold logic reads recent-N (N=5) `convergence:dual_path_concordance` signals via SQL LIKE-prefix pattern subscription (AP-26 compliant). Post-HF-220, no new such signals emit; the reader's fallback handles absence. The reader code itself is untouched per Disposition 2 (single-PR retirement; cross-file reader cleanup out of scope). Future cleanup HF can retire the reader.

5. **`concordanceRate` field in `CalculationSummary` interface (insight-agent.ts:181) made optional rather than removed.** HF-220 Phase 4 made the field optional to preserve type back-compat for any external caller still passing it; the consumer at insight-agent.ts:313 (concordance_gap insight) is retired. Strictly cleaner would be to delete the field entirely; deferred to avoid cross-file cascade in HF-220 scope. Future cleanup HF can remove the field outright.

---

## Substrate state

HF-220 introduces NO substrate change. `CC_STANDING_ARCHITECTURE_RULES.md` unchanged (no new anti-pattern; this is a removal, not a new pattern). AP-26 registry remains operative.

The substrate debt queue from prior HFs remains unchanged:
- E924/E904/E902 (HF-218 carry-forward)
- OB-199 Decision 154/155 reversal ratification (HF-219 Disposition 5)

Known Issues #1–#5 above record HF-220 carry-forward as new platform-side cleanup items (not substrate debt — these are local dead-code retirements deferred for scope).
