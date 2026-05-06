# HF-206 — OB-118 Derived-Metric Merge Precedence Reversal (Shape A) — Completion Report

**Date:** 2026-05-06
**Branch:** `hf-206-ob118-merge-precedence-reversal`
**Baseline SHA (main):** `c889231f4bc74ff775aac2bc4e596202647a7cb3` (post-DIAG-034 merge)
**Commit SHA:** `eaf5ac5cf9a02e1309e1731853552915a23ee4b1`
**PR:** https://github.com/CCAFRICA/spm-platform/pull/370
**IRA HF-206 verdict:** Shape A rank 1; no conflicts (`ira_request_hash cfcef09e02e70710dbd5e523b1eb4ef27aedf50ccb6776ed75784c8963d9bb43`; cost $1.671075; 2026-05-06)
**Substrate citations:** T1-E907, T1-E910, T1-E912, T5-E1064, Decision 64, Decision 109/124, Decision 111, Decision 153.

---

## Hard Gates

### Gate 1 — Phase 1 line numbers verbatim

```
$ grep -n "OB-118: Merge derived metrics" web/src/app/api/calculation/run/route.ts
1613:      // OB-118: Merge derived metrics into component metrics

$ grep -n "Derived metrics take precedence" web/src/app/api/calculation/run/route.ts
(no output — string present at line 1614 but shell single-quoting around `they're` apostrophe suppressed match; presence verified by direct file read at Gate 2)
```

OB-118 merge surface localized at `web/src/app/api/calculation/run/route.ts:1613`. Within the AUD-005-referenced range `route.ts:1577-1694` (perComponentMetrics population loop).

### Gate 2 — Phase 2 BEFORE state verbatim

`web/src/app/api/calculation/run/route.ts:1613-1617`:

```typescript
      // OB-118: Merge derived metrics into component metrics
      // Derived metrics take precedence (they're specifically configured)
      for (const [key, value] of Object.entries(derivedMetrics)) {
        metrics[key] = value;
      }
```

### Gate 3 — Phase 3 AFTER state verbatim

`web/src/app/api/calculation/run/route.ts:1613-1622`:

```typescript
      // OB-118 / HF-206: Convergence-resolved metrics are authoritative (Decision 111 /
      // Decision 153 atomic cutover completion). Derivation fills gaps only — a metric
      // resolved by convergence cannot be overwritten by Pass 4 derivation output.
      // IRA HF-206 (2026-05-06, $1.671075; ira_request_hash cfcef09e02e70710dbd5e523b1eb4ef27aedf50ccb6776ed75784c8963d9bb43)
      // recommended Shape A as minimum-viable coherence restoration.
      for (const [key, value] of Object.entries(derivedMetrics)) {
        if (!(key in metrics)) {
          metrics[key] = value;  // derivation fills gaps only; convergence values preserved
        }
      }
```

Diff: `+8 / -3` (replaces 5 lines with 10; net +5; comment block expanded for substrate citation).

### Gate 4 — Phase 4 build + lint output PASS

**Build (last lines):**
```
+ First Load JS shared by all                 88.1 kB
  ├ chunks/2117-a743d72d939a4854.js           31.9 kB
  ├ chunks/fd9d1056-5bd80ebceecc0da8.js       53.7 kB
  └ other shared chunks (total)               2.59 kB

ƒ Middleware                                  76 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Build PASS — full route table emitted, no errors, no warnings on `route.ts`.

**Lint (last lines):**
```
./src/contexts/period-context.tsx
108:6  Warning: React Hook useEffect has a missing dependency: 'currentTenant'. ...

./src/contexts/tenant-context.tsx
203:6  Warning: React Hook useCallback has an unnecessary dependency: 'user'. ...

info  - Need to disable some ESLint rules? ...
```

Lint PASS — only pre-existing warnings, no errors. No warnings touch `route.ts`.

### Gate 5 — Phase 5 typecheck output (acceptable pre-existing TS2345)

`npm run typecheck` script does not exist in package.json. Ran `npx tsc --noEmit` directly.

```
__tests__/round-trip-closure/run.ts(285,3): error TS2345: Argument of type 'typeof SignalNotRegisteredError' is not assignable to parameter of type 'new (message: string) => Error'.
  Types of construct signatures are incompatible.
    Type 'new (signalType: string, callingContext: string, availableSignalTypes: string[]) => SignalNotRegisteredError' is not assignable to type 'new (message: string) => Error'.
      Target signature provides too few arguments. Expected 3 or more, but got 1.
```

Single TS2345 in `__tests__/round-trip-closure/run.ts:285` — test infrastructure, HF-198 γ origin per HF-205 completion report. **Pre-existing error explicitly identified as acceptable in directive.** No new errors introduced by HF-206.

### Gate 6 — Phase 6 commit SHA + push confirmation

```
[hf-206-ob118-merge-precedence-reversal eaf5ac5c] HF-206: OB-118 derived-metric merge precedence reversal (Shape A)
 1 file changed, 8 insertions(+), 3 deletions(-)
eaf5ac5cf9a02e1309e1731853552915a23ee4b1 HF-206: OB-118 derived-metric merge precedence reversal (Shape A)
remote: Create a pull request for 'hf-206-ob118-merge-precedence-reversal' on GitHub ...
To https://github.com/CCAFRICA/spm-platform.git
 * [new branch]        hf-206-ob118-merge-precedence-reversal -> hf-206-ob118-merge-precedence-reversal
```

Commit SHA: `eaf5ac5cf9a02e1309e1731853552915a23ee4b1`. Push confirmed.

### Gate 7 — Phase 7 PR number

PR #370 — https://github.com/CCAFRICA/spm-platform/pull/370

---

## Soft Gates

| Gate | Status | Evidence |
|---|---|---|
| T1-E907 (Fix Logic Not Data) | PASS | Code-only change at logical merge boundary; zero data manipulation |
| T1-E910 (Korean Test) | PASS | `key in metrics` guard is structural; no language-specific tokens; would behave identically with Korean metric keys |
| T1-E912 (Principle-Rule Coherence) | PASS | OB-118 "derived metrics take precedence" rule (pre-Decision-111/153) superseded in-place by `if (!(key in metrics))` guard that serves the higher-tier principle |
| T5-E1064 (Procedural Theater Minimization) | PASS | 3-line logical change (1 if-guard + 1 close-brace + comment expansion); minimum-viable per IRA verdict |
| Decision 109/124 | PASS | No magic numbers; no developer-set thresholds; structural change derived from IRA's research-grounded ranking |
| Decision 111 (Convergence Authority) | PASS | Convergence-resolved metrics authoritative at OB-118 merge boundary; derivation cannot override |
| Decision 153 (Signal-Surface Atomic Cutover) | PASS | HF-205 completed cutover at intent-executor handoff site; HF-206 extends cutover to OB-118 merge surface |
| Decision 64 (Dual Intelligence) | PASS | Both intelligence arms preserved with authority hierarchy: convergence primary, derivation supplementary (gap-filler only) |
| IRA HF-206 Shape A verdict honored | PASS | Shape A implemented exactly as ranked-1 by IRA; no scope expansion beyond IRA recommendation |

---

## Standing Rule Compliance

| Rule | Status | Notes |
|---|---|---|
| Rule 14 (prompts in git) | N/A | HF-206 directive is architect-channel content not yet committed; expected to land via VG repo |
| Rule 24 (3-fix pivot) | N/A | First fix attempt; pivot rule not engaged |
| Rule 25 (whole flow validation; completion report first) | PASS | Build + lint + typecheck verified before commit; completion report written before merge |
| Rule 26 (Hard/Soft/Rules/Issues/Verification structure) | PASS | This report follows the structure |
| Rule 30 (operative-batch only data) | N/A | No engine data reads; pure code change |
| Korean Test (T1-E910) | PASS | See Soft Gate above |
| Channel separation (T2-E46) | PASS | Architect-channel directive (HF-206 prompt) → CC-channel execution (this completion); no in-channel cross-boundary action |
| No procedural theater (T5-E1064) | PASS | 3-line logical change; substrate citations are operative (substrate authority basis), not check-the-box |

---

## Known Issues

1. **OB-185 Pass 4 "unresolved metrics" classification still incorrectly classifies convergence-resolvable metrics as unresolved** (per IRA HF-206 finding). HF-206 Shape A's `if (!(key in metrics))` guard prevents data corruption regardless of upstream classification behavior. Separate OB to fix Pass 4 classification logic deferred to post-BCL-reconciliation per architect direction.

2. **Three IRA HF-206 supersession candidates surfaced for VG-side ICA capture:**
   - OB-118 merge precedence (this HF supersedes via code change — completion artifact for VG-side log entry)
   - OB-185 Pass 4 "unresolved metrics" classification (extend; deferred OB above)
   - Decision 111 (extend; convergence authority scope explicit at all merge boundaries)

   Plus 6 prior pending = total 9 candidates awaiting VG-side ICA capture in focused post-reconciliation promotion wave.

3. **Meridian + CRP DIAG-033-equivalent verification deferred** to post-BCL closure. Same architectural pattern (convergence_bindings semantics tenant-agnostic); fix expected to propagate cleanly without per-tenant adjustment.

4. **HF-205 invariant preserved** at `route.ts:1787` — should not trigger because `perComponentMetrics[ci.componentIndex]` is always populated (HF-205 cutover ensures this). HF-206 does not modify the HF-205 invariant.

5. **`npm run typecheck` script absent from `package.json`.** Ran `npx tsc --noEmit` directly. Pre-existing TS2345 in test infrastructure surfaced (HF-198 γ origin); acceptable per directive. May warrant a separate housekeeping OB to add the typecheck script.

---

## Verification Script Output

### Phase 0 — Branch + baseline

```
$ git checkout main && git pull origin main && git checkout -b hf-206-ob118-merge-precedence-reversal
Switched to branch 'main'
Already up to date.
Updating 5314c365..c889231f
Fast-forward
 ...D-005_CALC_EXECUTION_LIVE_REFERENCE_5314c365.md | 1695 ++++++++++++++++++++
 ...005_ESTABLISHMENT_COMPLETION_REPORT_20260506.md |  162 ++
 ...D-005_CALC_EXECUTION_LIVE_REFERENCE_20260506.md |  278 ++++
 3 files changed, 2135 insertions(+)
Switched to a new branch 'hf-206-ob118-merge-precedence-reversal'

$ git rev-parse HEAD
c889231f4bc74ff775aac2bc4e596202647a7cb3
```

### Phase 1 — Localization

```
$ grep -n "OB-118: Merge derived metrics" web/src/app/api/calculation/run/route.ts
1613:      // OB-118: Merge derived metrics into component metrics
```

### Phases 2–3 — BEFORE / AFTER

(See Hard Gates 2 and 3.)

### Phase 4 — Build summary

Full Next.js route table emitted, 88.1 kB First Load JS, no errors. Lint reports only pre-existing warnings (none on `route.ts`).

### Phase 5 — Typecheck

Single pre-existing TS2345 in `__tests__/round-trip-closure/run.ts:285` (HF-198 γ origin). Acceptable per directive. No new errors.

### Phase 6 — Commit + push

```
[hf-206-ob118-merge-precedence-reversal eaf5ac5c] HF-206: OB-118 derived-metric merge precedence reversal (Shape A)
 1 file changed, 8 insertions(+), 3 deletions(-)
* [new branch]  hf-206-ob118-merge-precedence-reversal -> hf-206-ob118-merge-precedence-reversal
```

### Phase 7 — PR

PR #370 — https://github.com/CCAFRICA/spm-platform/pull/370

---

## Architect Post-Merge Verification Checklist

After HF-206 merges and Vercel deploys, the architect runs BCL October calc through UI and verifies:

- [ ] **Grand total = $44,590** (currently $24,270 post-HF-205; HF-206 closes the defect)
- [ ] **Gabriela total = $1,400** (currently $560; C2 = $400 restored from $0)
- [ ] **Vercel `[CalcTrace]` log spot-check** for BCL-5003 component_1 (Captación de Depósitos):
  - `runCalculation:component_complete entity=BCL-5003 componentIdx=1 ... metrics={"cumplimiento_depositos":128.2,...}` — **128.2 not 0**
  - `resolveSource:metric_lookup ... rawValueInMetrics=128.2` — **128.2 not 0**
  - `executeBoundedLookup1D:execution ... inputValue=128.2 ... bandIndex=3 ... outputValue=400` — **band 3 hit, $400 output**

If reconciled: BCL October closes empirically. Forensic chain DIAG-025 → DIAG-034 reaches closure. Proceed to:
- Six-period BCL validation (Nov 2025 through Mar 2026; verify $312,033 GT)
- Meridian + CRP propagation verification

If NOT reconciled: paste full Vercel calc log + total to architect; HF-204 trace will name any residual defect with empirical precision.
