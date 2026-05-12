# HF-220 Phase 0 — Discovery

**Date:** 2026-05-12
**Branch:** dev (fresh from main post-HF-219-merge)
**Scope:** Legacy derivation path footprint in `web/src/app/api/calculation/run/route.ts`; perComponentMetrics population dependency audit; test surface inventory.

---

## 1. Legacy block boundary

`grep -n "LEGACY ENGINE PATH\|concordance shadow" web/src/app/api/calculation/run/route.ts`:

```
1818:    // ── LEGACY ENGINE PATH (concordance shadow — HF-188) ──
1820:      addLog('HF-188: Intent executor is sole authority — legacy engine is concordance shadow');
2488:    // HF-188: Intent executor is authoritative — legacy is concordance shadow
```

**The legacy "block" is not contiguous.** Legacy operations are interleaved with HF-218 binding verification, HF-219 correction proposal, and band normalization (which serve the intent executor). HF-220 retirement is surgical excision of legacy-only operations within the per-component for-loop, not whole-block deletion.

---

## 2. `applyMetricDerivations` call site

`grep -n "applyMetricDerivations" web/src/app/api/calculation/run/route.ts`:

```
22:  applyMetricDerivations,
1815:      ? applyMetricDerivations(derivationInput, metricDerivations, entityPriorData)
```

Single invocation at line 1815. Result stored in `derivedMetrics` (line 1814–1816) which is consumed only by the OB-118 merge-guard block (lines 2222–2249). R1 + R2 retire both.

---

## 3. `buildMetricsForComponent` call sites

`grep -n "buildMetricsForComponent" web/src/app/api/calculation/run/route.ts`:

```
21:  buildMetricsForComponent,
1832:      // Old sheet-matching path (buildMetricsForComponent) is FALLBACK for pre-OB-162 data.
2036:        // per existing buildMetricsForComponent semantics for empty input (which is the
2196:          metrics = buildMetricsForComponent(    // convergence-null fallback
2206:        metrics = buildMetricsForComponent(      // no-convergence-bindings fallback
```

Two operative call sites:
- **Line 2196:** Fires when `compBindings` is present AND `dataByBatch.size > 0` AND `resolveMetricsFromConvergenceBindings` returned empty. Currently paired with `engine:exception` signal (HF-218 Component 4a observability, lines 2177–2192).
- **Line 2206:** Fires when `compBindings` is entirely absent for this component (the "old sheet-matching path"). Per Decision 153 atomic cutover, this branch is structurally dead in tenants with convergence_bindings; HF-220 closes it.

Per ADR Decision 2, both fallbacks retire. Signal observability at line 2196 is preserved (the signal remains; the `buildMetricsForComponent` callback is replaced with `metrics = {}` — component evaluates to zero per Decision 153 atomic cutover completion).

---

## 4. `legacyTotalDecimal`

`grep -n "legacyTotalDecimal" web/src/app/api/calculation/run/route.ts`:

```
1823:    let legacyTotalDecimal = ZERO;
2325:      legacyTotalDecimal = legacyTotalDecimal.plus(rounded);
2329:    const legacyTotal = toNumber(legacyTotalDecimal);
```

All three sites retire in R3.

---

## 5. OB-118 merge-guard sites

`grep -n "ob118MergeGuardFired\|HF-188" web/src/app/api/calculation/run/route.ts`:

```
104:  let ob118MergeGuardFiredCount = 0;
1818:    // ── LEGACY ENGINE PATH (concordance shadow — HF-188) ──
1820:      addLog('HF-188: Intent executor is sole authority — legacy engine is concordance shadow');
2226:          ob118MergeGuardFiredCount++;
2228:          addLog(`[CalcRecon-T3] EXCEPTION ... type=ob118MergeGuardFired ...`);
2229:          currentEntityFlags.push('ob118MergeGuardFired');
2238:              type: 'ob118MergeGuardFired',
2328:    // HF-188: Legacy total preserved for concordance comparison only
2488:    // HF-188: Intent executor is authoritative — legacy is concordance shadow
2959:  addLog(`[CalcRecon-T1] flags={... ob118MergeGuardFired:${ob118MergeGuardFiredCount}/...}`);
```

R2 retires the whole guard (counter init at line 104, the `if (key in metrics)` block at lines 2222–2249, and the T1 footer reference at line 2959 — though the T1 footer flag display may be preserved as zero given other flag categories continue to fire).

---

## 6. `perComponentMetrics` — load-bearing for intent executor

`grep -n "perComponentMetrics" web/src/app/api/calculation/run/route.ts`:

```
1824:    const perComponentMetrics: Record<string, number>[] = [];
2324:      perComponentMetrics.push(metrics);
2426:      const metrics = perComponentMetrics[ci.componentIndex];
```

**Critical finding:** the single push site (line 2324) is inside the legacy block's for-loop. The intent executor reads from this array at line 2426 (HF-205 Shape C invariant site, lines 2426–2434). Per ADR Decision 1, the per-component for-loop is preserved with legacy operations excised; `perComponentMetrics.push(metrics)` remains as the single populator. The loop's responsibility narrows from "produce legacy result + collect metrics for intent executor" to "resolve convergence bindings + produce metrics for intent executor + push placeholder ComponentResult".

---

## 7. Concordance comparison sites

`grep -n "intent=\|concordance" web/src/app/api/calculation/run/route.ts`:

```
1818, 1820:   LEGACY ENGINE PATH banner + startup log
2328, 2488:   HF-188 inline comments
2493–2497:    entityMatch comparison + intentMatchCount/intentMismatchCount accounting
2555:         legacyTotal in entityResults.metadata
2556:         intentMatch in entityResults.metadata
2583:         per-entity log: `intent=${intentTotal} ✓` / `✗`
2602–2603:    concordanceRate computation + OB-76 Dual-path log
2667–2695:    convergence:dual_path_concordance signal write
2766:         concordance in batch.summary
2800:         concordanceRate in calcSummary
2903:         avgConfidence = concordanceRate / 100
3020:         concordance in finalize-batch response payload
```

R3 retires the comparison logic, the per-entity log emit, the OB-76 Dual-path summary log, the `convergence:dual_path_concordance` signal, the metadata fields (`legacyTotal`, `intentMatch`), and the response-payload concordance references.

**Downstream consumers of `convergence:dual_path_concordance` signal:**

`grep -rn "convergence:dual_path_concordance" web/src --include="*.ts"`:
- `web/src/lib/intelligence/convergence-service.ts:251` — declared reader (HF-198 E3 / F-011 closure)
- `web/src/lib/intelligence/convergence-service.ts:1887–1913` — HF-218 tenant-adaptive boundary threshold derives from "average of recent-N (N=5) convergence:dual_path_concordance signals"

Post-HF-220, no new `convergence:dual_path_concordance` signals are emitted. The tenant-adaptive threshold logic at convergence-service.ts:1887+ continues to read historical signals (pre-HF-220 emissions remain in the table) and falls back to a default threshold when historical signals are insufficient. **HF-220 leaves convergence-service.ts unchanged** — the reader is pattern-matching against `signal_type` (AP-26 compliance); when no new signals arrive, the reader's fallback handles it. Per Disposition 2 single-PR retirement: convergence-service.ts is out-of-scope; substrate debt queue records the eventual reader cleanup as carry-forward.

Similarly `web/src/lib/agents/insight-agent.ts:181, 313–323` references `summary.concordanceRate` from CalculationSummary. Post-HF-220, the field is removed from the summary; insight-agent.ts gracefully handles absence (it's read via type-checked path; we adjust the field passing in route.ts so the summary no longer includes `concordanceRate`). **Insight-agent.ts itself is also left unchanged** per Disposition 2; the field becomes undefined at runtime and the existing `if (summary.concordanceRate < 100)` becomes `if (undefined < 100)` → false; the concordance insight is no longer surfaced.

---

## 8. Test surface

`find web/src -type d -name __tests__ -not -path "*/node_modules/*"`:

```
web/src/lib/intelligence/__tests__
web/src/lib/sci/__tests__
web/src/lib/ai/providers/__tests__
```

Contents:
- `web/src/lib/intelligence/__tests__/adaptive-emergence.test.ts` (HF-219 R4)
- `web/src/lib/intelligence/__tests__/canonical-signal-writer.test.ts` (HF-219 R3 refactor)
- `web/src/lib/sci/__tests__/content-unit-hash.test.ts` (HF-196)
- `web/src/lib/ai/providers/__tests__/anthropic-adapter-normalization.test.ts` (unrelated)

`grep -rln "applyMetricDerivations\|buildMetricsForComponent\|legacyTotal\|legacyEngine\|HF-188\|ob118MergeGuardFired\|concordance" web/src --include="*.test.ts" --include="*.spec.ts"`:

**Zero matches.** No concordance tests, no legacy-isolation tests, no OB-118 tests. R4 deletes nothing; R4b (preserved intent-executor tests) and R4c (deleted legacy-isolation tests) have empty file sets. R4 reduces to: run `node:test` on the 4 surviving test files to confirm none break.

---

## 9. Decisions arising from Phase 0

**ADR Decision 1 — perComponentMetrics population strategy:** Option A. The per-component for-loop is preserved with legacy operations excised; `perComponentMetrics.push(metrics)` at line 2324 remains the single populator. Convergence binding resolution (lines 1830–2210) is already inside this loop and already produces `metrics`; the only addition needed post-R1 is to push a placeholder `ComponentResult` (with componentId/componentName/componentType from the component def, payout=0) so intent executor's index-overwrite at line 2461 has a target slot.

**ADR Decision 2 — Fallback path when convergence-binding resolution returns null:** Option B (modified). When `cbMetrics === null || Object.keys(cbMetrics).length === 0`, the HF-218 Component 4a `engine:exception` signal at line 2177–2192 is preserved (observability retained); the `buildMetricsForComponent` callback at line 2196 is replaced with `metrics = {}`. When `compBindings` is absent entirely (line 2202 `else` branch), an `engine:exception` signal with `type: 'no_convergence_bindings_for_component'` is emitted and `metrics = {}`. Component evaluates to zero per Decision 153 atomic cutover completion; calculation proceeds for other slices.

**ADR Decision 3 — perComponentMetrics array reference site cleanup:** Option A. Live references (line 1824 declaration, line 2324 push, line 2426 consumer) are preserved unchanged. There are no dead references post-restructure.

---

## 10. Files in scope

- **Modified (single file):** `web/src/app/api/calculation/run/route.ts`
- **Out of scope per directive:** `web/src/lib/calculation/run-calculation.ts` (exports unchanged; internal `runCalculation()` function at line 806 remains as dead code; future cleanup), `web/src/lib/intelligence/convergence-service.ts` (declared reader unchanged per Disposition 2), `web/src/lib/agents/insight-agent.ts` (concordance insight gracefully degrades to "not surfaced" via undefined-field-check)
- **No new files created (Phase 1 ADR + Phase 6 completion report are documentation artifacts in `docs/`)**
- **No test files deleted (Phase 0 inventory: zero concordance/legacy-isolation tests exist)**
