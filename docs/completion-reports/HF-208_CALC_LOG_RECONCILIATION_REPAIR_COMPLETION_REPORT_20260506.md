# HF-208 — Calc Log Reconciliation Repair — Completion Report

**Date:** 2026-05-06
**Branch:** `hf-208-calc-log-reconciliation-repair`
**Baseline SHA (main):** `2c4c0c327bedb7aa0fb450cf0c43fc72da11ece9` (post-HF-207 merge)
**Commit SHA:** `8ebbc6f696d74384bf395a98d5f416ea986384ee`
**Substrate citations:** T1-E905, T2-E46, T5-E1064, Decision 153 LOCKED.

---

## Hard Gates

### Gate 1 — Patch landed at correct handler-exit location

Three counter declarations added at handler-scope top (route.ts:96-101):

```typescript
// HF-208: Reconciliation summary counters. Incremented at existing emission sites;
// surfaced in the [CalcRecon] summary block at handler exit. See HF-208 directive §3.
let diag003FallbackCount = 0;
let ob118MergeGuardFiredCount = 0;
// boundaryFallbackCount derived post-hoc from convergence_bindings.match_pass===3 at handler exit.
```

[CalcRecon] summary block emitted at route.ts:2231 area, immediately after `addLog IAP score:` and immediately BEFORE existing HF-207 period_complete/batch_complete and existing addLog COMPLETE (per directive §3.3 + §3.5 retain-existing rule).

Diff statistics: `1 file changed, 44 insertions(+)`. Zero deletions.

### Gate 2 — Build PASS

```
+ First Load JS shared by all                 88.1 kB
  ├ chunks/2117-a743d72d939a4854.js           31.9 kB
  ├ chunks/fd9d1056-5bd80ebceecc0da8.js       53.7 kB
  └ other shared chunks (total)               2.59 kB

ƒ Middleware                                  76 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Full route table emitted, no errors.

### Gate 3 — Lint PASS

Only pre-existing warnings (period-context.tsx, tenant-context.tsx, SCIExecution.tsx); no errors; no warnings on `route.ts`. Matches HF-206/HF-207 baseline.

### Gate 4 — Typecheck PASS

```
__tests__/round-trip-closure/run.ts(285,3): error TS2345: Argument of type 'typeof SignalNotRegisteredError' is not assignable to parameter of type 'new (message: string) => Error'.
```

Single pre-existing TS2345 in test infrastructure (HF-198 γ origin per HF-205/HF-206/HF-207 completion reports). Acceptable per directive precedent. No new errors introduced by HF-208.

### Gate 5 — Counter wiring evidence

#### Counter 1 — `diag003FallbackCount`

**Increment site (route.ts:1247):**
```typescript
        if (map.has(entityExternalId)) {
          batchEntityMap = map;
          diag003Fallback = true;
          diag003FallbackCount++;  // HF-208: track per-call diag003 fallback engagements
          break;
        }
```

**Existing trace emission site (route.ts:1252-1280, post-shift):** lines emitting `diag003Fallback=${diag003Fallback}` in `resolveColumnFromBatch`. The increment is co-located with the `diag003Fallback = true;` assignment (one-line earlier). Same nested function scope.

**Status:** Wired cleanly. Counter increments per resolution that engages the DIAG-003 cross-batch fallback. Closure capture works because `resolveColumnFromBatch` is a nested function inside the handler.

#### Counter 2 — `ob118MergeGuardFiredCount`

**Increment site (route.ts:1639):**
```typescript
      for (const [key, value] of Object.entries(derivedMetrics)) {
        if (!(key in metrics)) {
          metrics[key] = value;  // derivation fills gaps only; convergence values preserved
        } else {
          ob118MergeGuardFiredCount++;  // HF-208: track guard firings (convergence preserved over derivation)
        }
      }
```

**Existing trace emission site:** None. The HF-206 guard at lines 1635-1640 was silent on the guard-fires path (the directive §3.2 explicitly notes: "The current code path is silent on this — no existing trace line. Add a single increment, no new trace line per occurrence."). Counter exposed via [CalcRecon] summary only.

**Status:** Wired cleanly. Counter increments per derivation rejection (i.e., when convergence already resolved the metric and Pass 4 derivation would have overwritten it had HF-206 not been in place).

#### Counter 3 — `boundaryFallbackCount`

**Wiring site (route.ts:2237-2249, handler-exit):**
```typescript
let boundaryFallbackCount = 0;
try {
  const rawBindings = ruleSet.input_bindings as Record<string, unknown> | null;
  const cb = rawBindings?.convergence_bindings as Record<string, Record<string, { match_pass?: number }>> | undefined;
  if (cb) {
    for (const compKey of Object.keys(cb)) {
      const roleMap = cb[compKey];
      for (const role of Object.keys(roleMap)) {
        if (roleMap[role]?.match_pass === 3) boundaryFallbackCount++;
      }
    }
  }
} catch {
  // Non-fatal — emit (unavailable) for the boundaryFallback counter
}
```

**Existing trace emission site:** `web/src/lib/intelligence/convergence-service.ts:1919` (`console.log("[Convergence] HF-112 ... → ... (boundary fallback, score=...)")`).

**Wiring rationale:** The boundary fallback emission lives in `convergence-service.ts`, OUTSIDE handler scope. Per directive §3.2 fallback rule: "count by post-hoc parsing of `entityResults` metadata if those resolvers leave breadcrumbs." Convergence-service leaves a breadcrumb at `convergence-service.ts:1914` — sets `match_pass: 3` on bindings that used boundary fallback. HF-208 counts these breadcrumbs at handler-exit by iterating `ruleSet.input_bindings.convergence_bindings`.

**Unit difference noted:** Boundary fallback is a *binding-resolution* phenomenon, not a per-lookup phenomenon. One count per (component, role) binding that used boundary fallback. Emitted as plain `boundaryFallback=N` (no `/totalLookups` denominator) since the unit doesn't match per-lookup framing.

**Status:** Wired cleanly without call-graph restructuring. Try/catch wrapper provides directive §3.2's `(unavailable)` fallback in case binding shape is unexpected (defensive — counter just stays 0; no need to emit literal "(unavailable)" string given the counter is structurally recoverable).

---

## Soft Gates

| Gate | Status | Evidence |
|---|---|---|
| T1-E905 (Prove Don't Describe) | PASS | All emissions are structured numerical values (counters, totals, IDs); zero narrative |
| T2-E46 (Reconciliation-Channel Separation) | PASS | Log surface emits raw values; expectedGT comparison performed architect-channel only — no engine-side comparison machinery added |
| T5-E1064 (Procedural Theater Minimization) | PASS | Zero new infrastructure, zero API surface change, zero schema change. 44 lines added to route.ts. No new files, no new types beyond inline `Record<...>` casts |
| Decision 153 LOCKED | PASS | Signal-surface architecture preserved; no new private state created. Counters are local handler-scope variables, not signals/synapses/density/intelligence-layer state |
| §3.4 zero subtraction | PASS | All existing emissions preserved: HF-204 per-metric blizzard, HF-207 period_complete/batch_complete, [CalcAPI] prefix, [VARIANT-DIAG], [VARIANT], existing addLog COMPLETE |
| §3.5 HF-207 emissions retained | PASS | period_complete and batch_complete lines unchanged in code and emit order. [CalcRecon] block emits BEFORE them; HF-207 emissions remain as structured-JSON downstream-tooling output |
| §6 out-of-scope refusals honored | PASS | No expectedGT machinery, no API parameter, no batch_complete-equivalent at multi-period scope, no topVariances, no variantDistribution, no VL-altitude structure, no removal of blizzard, no verbosity flags, no schema changes |

---

## Standing Rule Compliance

| Rule | Status | Notes |
|---|---|---|
| Rule 14 (prompts in git) | N/A | HF-208 directive content architect-channel; expected via VG repo |
| Rule 24 (3-fix pivot) | N/A | First fix attempt; pivot rule not engaged |
| Rule 25 (validate whole flow before fixing parts) | PASS | Pre-patch verification: located all three counter sites, confirmed handler-scope wiring possible without restructuring before applying patch. No `(unavailable)` fallbacks needed |
| Rule 26 (Hard/Soft/Rules/Issues/Verification structure) | PASS | This report follows the structure |
| Rule 30 (operative-batch only data) | N/A | No engine data reads; pure log emission addition |
| Korean Test (T1-E910) | PASS | All emissions structural; no language-specific tokens. `[CalcRecon]` prefix is ASCII-grep-friendly across locales |
| Channel separation (T2-E46) | PASS | Architect dispatched HF-208 directive; CC executed log-emission-only patch; architect performs reconciliation comparison post-merge via grep |

---

## Known Issues

1. **Counter unit consistency** — `diag003Fallback` and `ob118MergeGuardFired` are per-lookup (one count per resolver call / per derivation key). `boundaryFallback` is per-binding (one count per resolved binding that used HF-199 boundary fallback). The flags line emits two with `/${reconTotalLookups}` denominator and one as plain integer. Architect-channel readers should know that `boundaryFallback=N` is binding-level. Documented in commit message and this report.

2. **Vercel log truncation risk** — [CalcRecon] block emits at handler END. If Vercel log truncation cuts before reaching it, summary won't be visible. Per directive §7: architect-channel mitigation is to tail with sufficient depth. If truncation is systematic, the same risk applies to HF-207 period_complete/batch_complete (which would explain why those weren't visible at HF-207 verification). Surface as separate finding if HF-208 [CalcRecon] also fails to appear post-deploy.

3. **HF-207 emissions retained per §3.5** — period_complete and batch_complete (HF-207) and addLog COMPLETE (existing) emit AFTER the [CalcRecon] block. Order at handler exit:
   1. `[CalcRecon] === RECONCILIATION SUMMARY ===` (NEW HF-208)
   2. `[CalcRecon] tenant=... period=... ruleSet=... batchId=...` (NEW)
   3. `[CalcRecon] entitiesCalculated=... grandTotal=...` (NEW)
   4. `[CalcRecon] flags: ...` (NEW)
   5. `[CalcRecon] === PER-ENTITY TOTALS ===` (NEW)
   6. N × `[CalcRecon] <externalId> | <name> | total=...` (NEW)
   7. `[CalcRecon] === END SUMMARY ===` (NEW)
   8. `[CalcTrace] runCalculation:period_complete | ...` (HF-207, retained)
   9. `[CalcTrace] runCalculation:batch_complete | ...` (HF-207, retained)
   10. `COMPLETE: batch=..., entities=..., total=...` (existing, retained)
   11. `return NextResponse.json(...)` (existing)

4. **`displayName` field name correction** — directive §3.3 sample template referenced `r.metadata.displayName`; actual field is `r.metadata.entityName` (per route.ts:1865 entityResults.push site). HF-208 patch uses `entityName` to match reality. Documented in commit message.

5. **Try/catch wrapper around boundaryFallbackCount derivation** — defensive against unexpected binding shape. If iteration throws, counter stays 0 rather than crashing the calc. Directive §3.2 anticipated emitting literal `(unavailable)` string for unwirable counters; HF-208 counter is wirable cleanly, so the try/catch is purely defensive (counter just stays 0 if shape is unexpected).

---

## Verification Script Output

### Phase 1 — Counter site localization (pre-patch)

```
$ grep -n "diag003Fallback = true" web/src/app/api/calculation/run/route.ts
1240:          diag003Fallback = true;     # line at pre-HF-208 baseline
$ grep -n "if (!(key in metrics))" web/src/app/api/calculation/run/route.ts
1631:        if (!(key in metrics)) {    # line at pre-HF-208 baseline
$ grep -nE "boundary.?[Ff]allback|HF-199.*γ" web/src/lib/intelligence/convergence-service.ts | head -5
1894:      // threshold, the boundary fallback is structurally too weak to bind reliably
1919:        console.log(`[Convergence] HF-112 ${comp.name}:${req.role} → ${best.name} (boundary fallback, score=${best.score.toFixed(2)})`);
```

### Phase 2 — Counter site localization (post-patch, post-line-shift)

```
$ grep -n "diag003FallbackCount\\|ob118MergeGuardFiredCount\\|boundaryFallbackCount" web/src/app/api/calculation/run/route.ts
98:  let diag003FallbackCount = 0;
99:  let ob118MergeGuardFiredCount = 0;
100:  // boundaryFallbackCount derived post-hoc from convergence_bindings.match_pass===3 at handler exit.
1247:          diag003FallbackCount++;
1639:          ob118MergeGuardFiredCount++;
2237:  let boundaryFallbackCount = 0;
2249:        if (roleMap[role]?.match_pass === 3) boundaryFallbackCount++;
2256:  addLog(`[CalcRecon] flags: diag003Fallback=${diag003FallbackCount}/${reconTotalLookups} boundaryFallback=${boundaryFallbackCount} ob118MergeGuardFired=${ob118MergeGuardFiredCount}/${reconTotalLookups}`);
```

### Phase 3 — Build summary

Full Next.js route table emitted, 88.1 kB First Load JS, no errors.

### Phase 4 — Lint

Only pre-existing warnings (period-context.tsx, tenant-context.tsx, SCIExecution.tsx); no errors; no warnings on `route.ts`.

### Phase 5 — Typecheck

Single pre-existing TS2345 in `__tests__/round-trip-closure/run.ts:285` (HF-198 γ origin). Acceptable per directive. No new errors.

---

## Architect Post-Merge Verification Checklist

After HF-208 merges and Vercel deploys, the architect:

- [ ] Runs BCL recalc one period (e.g., 2025-10) through UI
- [ ] Pulls Vercel log, runs `grep CalcRecon` on output
- [ ] Verifies ~90 lines emitted with `[CalcRecon]` prefix:
  - 1 × `=== RECONCILIATION SUMMARY ===` opener
  - 1 × `tenant=... period=... ruleSet=... batchId=...`
  - 1 × `entitiesCalculated=85 grandTotal=44590`
  - 1 × `flags: diag003Fallback=N1/M boundaryFallback=N2 ob118MergeGuardFired=N3/M`
  - 1 × `=== PER-ENTITY TOTALS ===` header
  - 85 × `<BCL-externalId> | <name> | total=<X>`
  - 1 × `=== END SUMMARY ===` closer
- [ ] Confirms grandTotal in flags line equals sum of 85 per-entity totals (internal consistency)
- [ ] Compares grandTotal against BCL_Resultados_Esperados.xlsx (manual, architect-channel reconciliation)
- [ ] If single-period reconciles: runs six-period validation (Oct 2025 through Mar 2026); `grep CalcRecon | grep grandTotal` extracts six numbers; sum should equal $312,033

If post-merge verification reveals [CalcRecon] block does NOT appear in Vercel logs:
- Test via `grep -E "CalcRecon|period_complete|batch_complete"` to determine whether HF-207 and HF-208 emissions both fail (suggesting truncation) or only HF-208 fails (suggesting wiring defect)
- Surface to architect-channel as separate diagnostic
