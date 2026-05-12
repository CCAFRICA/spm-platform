# HF-206 — OB-118 Derived-Metric Merge Precedence Reversal (Shape A)

**Class:** HF (architectural completion of Decision 153 atomic cutover at the OB-118 merge boundary)
**Repo:** `~/spm-platform`
**Branch:** `hf-206-ob118-merge-precedence-reversal` (create from main HEAD post-HF-205 merge)
**Type:** 3-line code change reversing derived-metric merge precedence so convergence-resolved metrics are authoritative; derivation fills gaps only
**Substrate authority:**
- **IRA HF-206 verdict (2026-05-06, $1.671075; ira_request_hash `cfcef09e02e70710dbd5e523b1eb4ef27aedf50ccb6776ed75784c8963d9bb43`):** Shape A rank 1 with no conflicts; identified as "the minimum-viable coherence restoration"
- **HF-204 trace empirical evidence (2026-05-06 14:23:47):** convergence resolves `cumplimiento_depositos=128.2` correctly; Pass 4 derivation produces `0`; OB-118 merge writes derivation value over convergence value because "derived metrics take precedence" (AUD-005:503-504 comment)
- **AUD-005 live code reference (commit `5314c365`):** OB-118 merge surface at `web/src/app/api/calculation/run/route.ts:1577-1694` (extraction; modification site within `perComponentMetrics` population loop)
- **Decision 111 (Convergence Authority):** convergence is the authoritative resolution path
- **Decision 153 (Seeds Eradication / Signal-Surface Architecture Atomic Cutover):** LOCKED; this HF completes the atomic cutover at the OB-118 merge surface
- **Decision 64 (Dual Intelligence):** convergence and derivation are dual arms with defined roles, not competing paths for the same metric keys
- **T1-E912 (Principle-Rule Coherence):** OB-118 comment "derived metrics take precedence" was authored before Decision 111/153 elevated convergence; lower-tier rule no longer serves higher-tier principle
- **T1-E907 (Fix Logic Not Data):** code change only; no data manipulation
- **T1-E910 (Korean Test):** `key in metrics` guard is structural; no language-specific tokens
- **T5-E1064 (Procedural Theater Minimization):** 3-line change; minimum-viable

## ARCHITECT INTENT

The HF-204 trace empirically demonstrated that convergence correctly resolves `cumplimiento_depositos=128.2` for BCL-5003 component_1 (Captación de Depósitos), but the calc engine reads `cumplimiento_depositos=0` at intent-executor consumption. HF-205 closed the metrics-handoff site as Decision 153 cleanup but did NOT resolve the BCL defect — calc still produces $24,270 instead of $44,590.

Re-localization via AUD-005 live code identified the actual defect surface: the OB-118 merge at AUD-005:503-507 writes Pass 4 derivation output to `metrics` AFTER convergence has populated it, with derivation values taking precedence per the comment "Derived metrics take precedence (they're specifically configured)." When Pass 4 derivation produces `cumplimiento_depositos=0` (via `ratio()` returning 0), it OVERWRITES convergence's correct `128.2`.

IRA HF-206 verdict (2026-05-06, $1.671075): Shape A rank 1 with no conflicts. **"Convergence-resolved metrics are not subject to derivation override"** — convergence wins; derivation fills gaps only. The 3-line code change is the structural completion of Decision 153 atomic cutover at the OB-118 merge boundary.

## ARCHITECTURAL SHAPE

The change reverses OB-118 merge precedence at AUD-005:503-507 (within `perComponentMetrics` population loop, route.ts:1577-1694).

**Before (current code):**
```typescript
// OB-118: Merge derived metrics into component metrics
// Derived metrics take precedence (they're specifically configured)
for (const [key, value] of Object.entries(derivedMetrics)) {
  metrics[key] = value;
}
```

**After (Shape A):**
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

The `if (!(key in metrics))` guard preserves convergence-resolved values while preserving derivation's role for metrics convergence does not resolve. Decision 64 Dual Intelligence preserved with explicit authority hierarchy.

## SCOPE

**Files modified:**
- `web/src/app/api/calculation/run/route.ts` — single 3-line modification at the OB-118 merge surface within `perComponentMetrics` population loop

**Functions modified:**
- The OB-118 merge block within the `perComponentMetrics` population loop (per AUD-005 reference: file lines 1577-1694; the merge code is within that range)

**Functions / paths NOT modified (out of scope for HF-206):**
- `resolveMetricsFromConvergenceBindings` — already correct
- `resolveColumnFromBatch` — already correct
- `OB-185 Pass 4 derivation invocation` — Pass 4 still operates; only the merge precedence changes
- HF-205 invariant (line 1787) — preserved
- intent-executor.ts — already correct
- OB-167 band-aware normalization — guarded on `!usedConvergenceBindings`; remains in place

**Pass 4 classification follow-on (deferred per architect direction):** OB-185 Pass 4's "unresolved metrics" classification incorrectly classifies convergence-resolvable metrics as unresolved (per IRA finding). HF-206 Shape A's guard prevents data corruption regardless of classification behavior. Separate OB to address upstream classification logic deferred until post-BCL-reconciliation.

## RISK ASSESSMENT

**Risk 1 — convergence does not resolve a metric, but derivation does:**
This is the intended Pass 4 derivation use case. Shape A's `!(key in metrics)` guard preserves this — derivation writes to keys convergence did not populate. Functionality preserved.

**Risk 2 — convergence resolves a metric incorrectly, derivation has the correct value:**
Per IRA verdict: "Decision 111 (Convergence Authority) is a locked decision." If convergence resolves incorrectly, the fix is at convergence (binding correction or Pass 4 → convergence_binding promotion), not at the merge boundary. Shape A defers to convergence authority per the locked decision.

**Risk 3 — performance regression:**
Negligible. `key in metrics` is O(1) hash lookup. Loop iteration count unchanged.

**Risk 4 — Meridian / CRP propagation:**
Same architectural pattern expected. Fix propagates with no per-tenant adjustment because convergence_bindings semantics are tenant-agnostic. Architect dispositions Meridian + CRP verification post-BCL closure.

## EXECUTION

### Phase 0 — Branch + baseline

```bash
cd ~/spm-platform
git checkout main
git pull origin main
git checkout -b hf-206-ob118-merge-precedence-reversal
git rev-parse HEAD
```

PASTE output. Baseline SHA captured for completion report.

### Phase 1 — Locate the OB-118 merge surface

```bash
grep -n "OB-118: Merge derived metrics" web/src/app/api/calculation/run/route.ts
grep -n "Derived metrics take precedence" web/src/app/api/calculation/run/route.ts
```

PASTE output. Confirms current line number in live code (AUD-005 reference shows surface within lines 1577-1694; live line numbers expected near 1620-1640 based on AUD-005:503-507 offset within the section).

### Phase 2 — Read the OB-118 merge code (BEFORE state)

Read 10 lines surrounding the OB-118 merge site. PASTE the BEFORE state verbatim. This becomes the `BEFORE state` reference in completion report.

### Phase 3 — Apply Shape A modification

Replace the 4-line OB-118 merge block (2 comment lines + `for` loop + assignment) with the new 6-line version (4 comment lines + `for` loop + `if` guard + assignment).

Specifically replace:

```typescript
// OB-118: Merge derived metrics into component metrics
// Derived metrics take precedence (they're specifically configured)
for (const [key, value] of Object.entries(derivedMetrics)) {
  metrics[key] = value;
}
```

with:

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

PASTE the AFTER state verbatim.

### Phase 4 — Build + lint

```bash
cd web && npm run build 2>&1 | tail -20
npm run lint 2>&1 | tail -10
```

PASTE output. Both must PASS.

### Phase 5 — Type-check

```bash
npm run typecheck 2>&1 | tail -10
```

PASTE output. Pre-existing TS2345 in test infrastructure (HF-198 γ origin per HF-205 completion report) acceptable; no new errors introduced.

### Phase 6 — Commit + push

```bash
cd ~/spm-platform
git add web/src/app/api/calculation/run/route.ts
git commit -m "HF-206: OB-118 derived-metric merge precedence reversal (Shape A)

Reverses OB-118 merge precedence so convergence-resolved metrics are
authoritative; Pass 4 derivation fills gaps only. Completes Decision 153
atomic cutover at the OB-118 merge boundary.

Empirical motivation (HF-204 trace, 2026-05-06 14:23:47, post-HF-205):
- Convergence resolves cumplimiento_depositos=128.2 (1.282 x scale=100)
  for BCL-5003 component_1.
- Pass 4 derivation produces ratio() rule for cumplimiento_depositos
  returning 0 (likely no source columns matched).
- OB-118 merge ('Derived metrics take precedence') overwrites convergence
  value with derivation value: 128.2 -> 0.
- Intent-executor reads cumplimiento_depositos=0; bounded_lookup_1d
  returns band[0] output 0; C2 = \$0 instead of \$400.
- Pattern uniform across 85 entities for components with scale_factor=100.

IRA HF-206 verdict (2026-05-06, \$1.671075; ira_request_hash
cfcef09e02e70710dbd5e523b1eb4ef27aedf50ccb6776ed75784c8963d9bb43):
Shape A rank 1, no conflicts; identified as minimum-viable coherence
restoration. T1-E912 principle-rule coherence gap: OB-118 comment
'derived metrics take precedence' authored before Decision 111/153
elevated convergence to sole authority.

Three supersession candidates surfaced for VG-side promotion:
- OB-118 merge precedence (this HF supersedes via code change)
- OB-185 Pass 4 'unresolved metrics' classification (extend; deferred OB)
- Decision 111 (extend; explicit convergence authority scope)

Code change at calc/run/route.ts OB-118 merge site (AUD-005:503-507
within route.ts:1577-1694 perComponentMetrics population loop):
- Before: for-of loop assigning derivedMetrics[key] -> metrics[key]
  unconditionally (derivation precedence).
- After:  for-of loop with if (!(key in metrics)) guard so derivation
  fills gaps only (convergence precedence).

Substrate: T1-E907 (logic not data); T1-E910 (Korean Test);
T1-E912 (principle-rule coherence restoration); T5-E1064 (minimum
viable change); Decision 109/124 (no thresholds; structural fix);
Decision 111 (Convergence Authority); Decision 153 (Signal-Surface
Architecture Atomic Cutover at OB-118 merge boundary); Decision 64
(Dual Intelligence with authority hierarchy)."
git push origin hf-206-ob118-merge-precedence-reversal
```

PASTE output including commit SHA.

### Phase 7 — Open PR

```bash
gh pr create --title "HF-206: OB-118 derived-metric merge precedence reversal (Shape A)" \
  --body "Reverses OB-118 merge precedence so convergence-resolved metrics are authoritative; derivation fills gaps only. Completes Decision 153 atomic cutover at OB-118 merge boundary. IRA HF-206 verdict (2026-05-06, \$1.671075): Shape A rank 1, no conflicts. T1-E912 principle-rule coherence gap closure. See commit message for full substrate citations and empirical motivation."
```

PASTE PR number.

### Phase 8 — Completion report

Write `docs/completion-reports/HF-206_OB118_MERGE_PRECEDENCE_REVERSAL_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26.

Hard Gates:
- Phase 1 line numbers verbatim
- Phase 2 BEFORE state verbatim
- Phase 3 AFTER state verbatim
- Phase 4 build + lint output PASS
- Phase 5 typecheck output PASS (pre-existing TS2345 acceptable)
- Phase 6 commit SHA + push confirmation
- Phase 7 PR number

Soft Gates:
- T1-E907 PASS
- T1-E910 PASS
- T1-E912 PASS — principle-rule coherence gap closed at OB-118 merge surface
- T5-E1064 PASS — minimum-viable change
- Decision 109/124 PASS
- Decision 111 (Convergence Authority) honored at merge boundary PASS
- Decision 153 (atomic cutover) extended to OB-118 surface PASS
- Decision 64 (Dual Intelligence) preserved with authority hierarchy PASS
- IRA HF-206 Shape A verdict honored PASS

Known Issues:
- Pass 4 classification logic (OB-185) still classifies convergence-resolvable metrics as 'unresolved'. Shape A's guard prevents data corruption regardless. Separate OB to fix upstream classification deferred to post-BCL-reconciliation per architect direction.
- Three supersession candidates from IRA HF-206 (plus 6 prior pending) total 9 candidates awaiting VG-side ICA capture in focused post-reconciliation promotion wave.
- Meridian + CRP DIAG-033-equivalent verification deferred to post-BCL closure; same structural fix expected to propagate cleanly.
- HF-205 invariant (calc/run/route.ts:1787) preserved; should not trigger because perComponentMetrics[ci.componentIndex] always populated.

Verification (post-merge):
- Architect runs BCL October calc through UI
- Expected total: \$44,590 (matches BCL GT; currently \$24,270)
- Expected Gabriela total: \$1,400 (with C2 = \$400, restored from \$0)
- Expected uniform improvement across all 85 entities
- HF-204 trace remains intact; architect can verify per-entity that:
  - resolveMetricsFromConvergenceBindings:exit metrics={cumplimiento_depositos: 128.2}
  - runCalculation:component_complete metrics still includes 128.2 (no longer overwritten)
  - resolveSource:metric_lookup rawValueInMetrics=128.2 (instead of 0)
  - executeBoundedLookup1D:execution inputValue=128.2 -> bandIndex=3 -> outputValue=400

PASTE completion report content in chat.

## HALT CONDITIONS

HALT if:
- Phase 1 cannot find "OB-118: Merge derived metrics" comment in the codebase (unlikely given AUD-005 reference; if happens, surface to architect — line numbers may have shifted post-HF-205 merge)
- Phase 4 build fails after Phase 3 (likely TypeScript inference issue with the conditional)
- Phase 5 typecheck reveals NEW errors beyond the pre-existing HF-198 γ TS2345

Otherwise: execute continuously through Phases 0-8.

## NO FURTHER SCOPE

Single architectural change: replace OB-118 merge `metrics[key] = value` with `if (!(key in metrics)) metrics[key] = value`. No other modifications. No data migration. No schema change. No new endpoints. No Pass 4 classification fix (deferred OB).

END OF DIRECTIVE.

## ARCHITECT POST-MERGE WORKFLOW

After HF-206 merges and Vercel deploys:

1. **Run BCL October calc through UI**
2. **Verify grand total = \$44,590** (currently \$24,270 post-HF-205; HF-206 closes the defect)
3. **Verify Gabriela = \$1,400** (currently \$560; C2 = \$400 restored)
4. **Spot-check Vercel logs** for `[CalcTrace]` lines — should show:
   - `runCalculation:component_complete entity=BCL-5003 componentIdx=1 ... metrics={"cumplimiento_depositos":128.2,...}` (instead of 0)
   - `resolveSource:metric_lookup ... rawValueInMetrics=128.2` (instead of 0)
   - `executeBoundedLookup1D:execution ... inputValue=128.2 ... bandIndex=3 ... outputValue=400`
5. **Confirm BCL October is reconciled** to ground truth $44,590

If reconciled: BCL October closes empirically. Forensic chain DIAG-025 → DIAG-034 reaches closure. Proceed to:
- Six-period BCL validation (add Nov 2025 through Mar 2026; verify $312,033 GT)
- Meridian + CRP propagation verification

If NOT reconciled: paste full Vercel calc log + total here. HF-204 trace will name any residual defect with empirical precision.
