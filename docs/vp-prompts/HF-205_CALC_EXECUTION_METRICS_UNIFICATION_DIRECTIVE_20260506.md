# HF-205 — Calc-Execution Metrics-Map Unification (Shape C)

**Class:** HF (architectural completion of Decision 153 atomic cutover at calc-execution boundary)
**Repo:** `~/spm-platform`
**Branch:** `hf-205-calc-execution-metrics-unification` (create from main HEAD post-HF-204 merge)
**Type:** Eradicate seeds-era pre-convergence metrics path; convergence becomes sole metrics authority for calc execution
**Substrate authority:**
- **IRA HF-205 verdict (2026-05-06, $1.32609; ira_request_hash e4e1d17b):** Shape C rank 1; no conflicts; "direct structural completion of Decision 153's intent — the pre-convergence metrics path is the seeds-era parallel structure that HF-193 was supposed to eradicate"
- **DIAG-033 verification gate (2026-05-06):** PASSED. All 5 metric keys consumed by intent-executor are convergence-resolvable. Set difference = ∅
- **HF-204 trace empirical evidence (2026-05-06 13:22:42):** convergence produces correct scale_factor-applied values; intent-executor reads from parallel `data.metrics` map populated outside convergence and gets `rawValueInMetrics=0` for percentage columns
- **Decision 153 (Seeds Eradication — Signal-Surface Architecture Atomic Cutover):** LOCKED; HF-193 implementation incomplete at calc-execution boundary; HF-205 completes
- **Decision 111 (Convergence Authority):** convergence is the authoritative resolution path
- **Decision 64 (Dual Intelligence Specification):** convergence resolves intelligence to data; calc-execution consumes
- **T1-E907 (Fix Logic Not Data):** code-only change; no data manipulation
- **T1-E910 (Korean Test):** generic operations; no language-specific logic
- **T1-E952 (Adjacent-Arm Drift Discipline):** closes "scale_factor application target ≠ consumption target" defect class

## ARCHITECT INTENT

The HF-204 trace empirically demonstrated that two parallel `metrics` maps coexist in calc execution:
1. **Convergence map** (signal-surface; correct scale_factor-applied values; written by `resolveMetricsFromConvergenceBindings` via convergence_bindings)
2. **Pre-convergence map** (seeds-era; raw row values from `aggregateMetrics(entityRowsFlat)`; no scale_factor application)

Intent-executor's `resolveSource` reads `data.metrics[key]` and gets values from the SECOND map. The first map's correct values are written but never consumed for the metric keys that scale_factor was applied to.

Decision 153 mandates eradication of seeds-era parallel structures. HF-193 was the atomic cutover implementation. **HF-205 completes Decision 153 at the calc-execution metrics-map boundary by removing the pre-convergence path entirely. Convergence becomes the sole metrics authority.**

DIAG-033 verified all 5 metric keys consumed by intent-executor for BCL are convergence-resolvable. Set difference is empty. **No exception keys exist; no documented preservation path needed; clean Shape C.**

## ARCHITECTURAL SHAPE

The change closes the convergence-output-to-intent-executor wiring gap by ensuring the metrics object intent-executor consumes IS the metrics object convergence produces.

**Before (HF-204 empirical):**
- Pre-convergence: `allEntityMetrics = aggregateMetrics(entityRowsFlat)` builds raw-row-value map
- Per-component loop: `cbMetrics = resolveMetricsFromConvergenceBindings(...)` builds correct map
- `perComponentMetrics.push(metrics)` pushes EITHER cbMetrics OR fallback-built metrics (with OB-167 normalization for fallback only)
- Intent-executor handoff: `const metrics = perComponentMetrics[ci.componentIndex] ?? allEntityMetrics` uses per-component map IF available, else falls back to `allEntityMetrics` (the seeds-era raw-row-value map)
- HF-204 trace evidence shows intent-executor sees raw values (`rawValueInMetrics=0` for percentage columns) — implying `allEntityMetrics` is being consumed despite `perComponentMetrics[ci.componentIndex]` being populated

**After (HF-205 Shape C):**
- Pre-convergence path: `allEntityMetrics = aggregateMetrics(entityRowsFlat)` is removed (or kept for non-metrics use only — never consumed by calc execution)
- Per-component loop: convergence binding resolution unchanged; `cbMetrics` is the canonical map
- `perComponentMetrics` holds the convergence-produced map per component
- Intent-executor handoff: `const metrics = perComponentMetrics[ci.componentIndex]` (no `?? allEntityMetrics` fallback; convergence is required path)
- If `perComponentMetrics[ci.componentIndex]` is undefined or empty for any reason, calc fails fast with structural error (rather than silently falling back to wrong data)

The fallback `?? allEntityMetrics` IS the architectural defect. Removing it forces convergence to be the sole authority. DIAG-033 confirmed convergence resolves all consumed keys, so the fallback is provably unnecessary for BCL.

## SCOPE

**Files modified:**
- `web/src/app/api/calculation/run/route.ts` — primary change at calc-execution metrics-handoff boundary

**Functions modified:**
- Per-entity calc loop entity-data construction (currently around line 34910)

**Functions / paths NOT modified (out of scope for HF-205):**
- `aggregateMetrics()` — utility kept; usage scope changes
- `buildMetricsForComponent()` — fallback path kept for legacy data without convergence_bindings; not the surface this HF addresses
- `resolveMetricsFromConvergenceBindings()` — already correct; no change
- `intent-executor.ts` — already correct; no change
- OB-167 band-aware normalization — guarded on `!usedConvergenceBindings`; remains in place for fallback path
- HF-116 commented assumption — empirically resolved by HF-205 making convergence path the authoritative metrics source

## RISK ASSESSMENT

**Risk 1 — non-convergence data dependencies:**
DIAG-033 verified: zero. All BCL metric keys consumed by intent-executor are convergence-resolvable. Set difference = ∅.

**Risk 2 — Meridian / CRP regression:**
Pattern propagation expected. If Meridian or CRP have keys NOT in their convergence_bindings, they'd hit fail-fast. Architect dispositions Meridian + CRP DIAG-033 verification post-BCL closure. If those tenants ALSO have set difference = ∅ (likely), HF-205 ships clean. If they have non-empty set difference, those keys are Decision 153 completion items requiring separate work.

**Risk 3 — fallback path regression for tenants without convergence_bindings (pre-OB-162 data):**
Mitigated. HF-205 removes the `?? allEntityMetrics` fallback ONLY at the convergence-binding consumption surface. The fallback path (`buildMetricsForComponent`) for components WITHOUT convergence_bindings remains intact. Effect: components with bindings use convergence-only; components without bindings continue to use sheet-matching. No regression for legacy data flows.

**Risk 4 — HF-122 entity-total-from-rounded-components (Decision 122):**
Out of scope. Per-component rounding via `roundComponentOutput` happens AFTER metrics resolution. HF-205 changes only the metrics map source; rounding logic untouched.

## EXECUTION

### Phase 0 — Branch + baseline

```bash
cd ~/spm-platform
git checkout main
git pull origin main
git checkout -b hf-205-calc-execution-metrics-unification
git rev-parse HEAD
```

PASTE output. Baseline SHA captured for completion report.

### Phase 1 — Locate the metrics-handoff site

```bash
grep -n "perComponentMetrics\[ci.componentIndex\] ?? allEntityMetrics" web/src/app/api/calculation/run/route.ts
grep -n "perComponentMetrics" web/src/app/api/calculation/run/route.ts
grep -n "allEntityMetrics" web/src/app/api/calculation/run/route.ts
```

PASTE output. Confirms exact line numbers (line numbers in AUD-001 reference may have shifted).

### Phase 2 — Read the metrics-handoff code

Read 30 lines surrounding the `perComponentMetrics[ci.componentIndex] ?? allEntityMetrics` site. PASTE the BEFORE state verbatim. This becomes the `BEFORE state` reference in completion report.

### Phase 3 — Apply Shape C modification

The change has two parts:

**Part 1 — Remove the seeds-era fallback at the intent-executor metrics-handoff site:**

Find the line:
```typescript
const metrics = perComponentMetrics[ci.componentIndex] ?? allEntityMetrics;
```

Replace with:
```typescript
// HF-205 Shape C: convergence is sole metrics authority (Decision 153 atomic
// cutover completion). Per-component metrics map MUST be populated; fail fast
// if not (rather than silently falling back to seeds-era raw-row-value map).
// DIAG-033 verified: all metric keys consumed by intent-executor are
// convergence-resolvable for tenants with convergence_bindings.
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

**Part 2 — Verify `aggregateMetrics(entityRowsFlat)` and `allEntityMetrics` usage:**

Search for any remaining consumer of `allEntityMetrics` after Part 1. If any consumers exist (e.g., legacy concordance shadow path, attainment computation outside per-component loop), DOCUMENT them but do not remove `allEntityMetrics` initialization. Out of scope for HF-205.

If the only consumer was the removed fallback at Part 1, leave the initialization in place anyway (low cost; preserves any indirect consumers in tests or telemetry). The architectural intent is "convergence is sole metrics authority for calc execution" — incidental computation of `allEntityMetrics` for non-execution purposes is fine.

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

PASTE output. Must PASS.

### Phase 6 — Commit + push

```bash
cd ~/spm-platform
git add web/src/app/api/calculation/run/route.ts
git commit -m "HF-205: calc-execution metrics-map unification (Shape C)

Eradicates seeds-era pre-convergence metrics fallback at intent-executor
handoff. Convergence becomes the sole metrics authority for calc execution.
Completes Decision 153 atomic cutover at calc-execution boundary.

Empirical motivation (HF-204 trace, 2026-05-06 13:22:42):
- Convergence produces cumplimiento_depositos=128.2 (scale_factor=100 applied
  to 1.282) for BCL-5003 component_1.
- Intent-executor reads rawValueInMetrics=0 for cumplimiento_depositos.
- Pattern uniform across 85 entities for components with scale_factor=100;
  components with scale_factor=undefined flow correctly.
- Two parallel metrics maps coexist; convergence's correct values written to
  one; intent-executor reads from the other.

IRA HF-205 verdict (2026-05-06, \$1.32609; ira_request_hash e4e1d17b):
Shape C rank 1; no conflicts; 'direct structural completion of Decision
153's intent — the pre-convergence metrics path is the seeds-era parallel
structure that HF-193 was supposed to eradicate.'

DIAG-033 verification gate (2026-05-06): PASSED. All 5 metric keys
consumed by intent-executor (cumplimiento_colocacion, calidad_cartera,
cumplimiento_depositos, productos_cruzados_vendidos, infracciones_regulatorias)
are convergence-resolvable. Set difference = empty. Clean Shape C.

Change at calc/run/route.ts metrics-handoff site:
- Before: const metrics = perComponentMetrics[ci.componentIndex] ?? allEntityMetrics;
- After:  const metrics = perComponentMetrics[ci.componentIndex];
          if (!metrics) throw new Error('HF-205 invariant: ...');

The '?? allEntityMetrics' fallback IS the seeds-era parallel structure.
Removing it forces convergence to be sole authority. DIAG-033 verified
this is safe for BCL. Meridian + CRP verification deferred to post-BCL
closure (same pattern expected to propagate cleanly).

Substrate: T1-E907 (logic not data); T1-E910 (Korean Test); T1-E952
(closes 'scale_factor target != consumption target' defect class);
Decision 109/124 (no thresholds; structural fix); Decision 153 (atomic
cutover completion at calc-execution boundary); Decision 111 (Convergence
Authority); Decision 64 (Dual Intelligence)."
git push origin hf-205-calc-execution-metrics-unification
```

PASTE output including commit SHA.

### Phase 7 — Open PR

```bash
gh pr create --title "HF-205: calc-execution metrics-map unification (Shape C)" \
  --body "Eradicates seeds-era pre-convergence metrics fallback at intent-executor handoff. Convergence becomes sole metrics authority. Completes Decision 153 atomic cutover at calc-execution boundary. IRA HF-205 verdict (2026-05-06): Shape C rank 1, no conflicts. DIAG-033 verification gate PASSED (all 5 BCL metric keys convergence-resolvable; set difference = empty). See commit message for full substrate citations and empirical motivation."
```

PASTE PR number.

### Phase 8 — Completion report

Write `docs/completion-reports/HF-205_CALC_EXECUTION_METRICS_UNIFICATION_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26.

Hard Gates:
- Phase 1 line numbers verbatim
- Phase 2 BEFORE state verbatim
- Phase 3 AFTER state verbatim
- Phase 4 build + lint output PASS
- Phase 5 typecheck output PASS
- Phase 6 commit SHA + push confirmation
- Phase 7 PR number

Soft Gates:
- T1-E907 PASS
- T1-E910 PASS
- T1-E952 PASS — defect class closed
- Decision 109/124 PASS
- Decision 153 atomic cutover completion at this surface PASS
- Decision 111 (Convergence Authority) honored PASS
- Decision 64 (Dual Intelligence) honored PASS
- IRA HF-205 Shape C verdict honored PASS
- DIAG-033 verification gate honored PASS

Known Issues:
- Meridian + CRP DIAG-033 equivalents deferred to post-BCL reconciliation closure
- Supersession candidates (T2-E08 / T2-E10 / T2-E01 extensions) deferred to VG-side post-reconciliation focused promotion wave
- HF-122 entity-total-from-rounded-components untouched; orthogonal architecture
- OB-167 band-aware normalization untouched; remains gated on !usedConvergenceBindings

Verification (post-merge):
- Architect runs BCL October calc through UI
- Expected total: \$44,590 (matches GT)
- Expected Gabriela total: \$1,400 (with C2 = \$400, restored from \$0)
- Expected uniform improvement across all 85 entities
- HF-204 trace remains intact (inline addLog calls); architect can verify per-entity metric flow if desired

PASTE completion report content in chat.

## HALT CONDITIONS

HALT if:
- Phase 1 cannot find `perComponentMetrics[ci.componentIndex] ?? allEntityMetrics` in the codebase (line numbers shifted; surface to architect)
- Phase 4 build fails after Phase 3 (likely TypeScript inference issue with the conditional type narrowing)
- Phase 5 typecheck fails (similar)

Otherwise: execute continuously through Phases 0-8.

## NO FURTHER SCOPE

Single architectural change: remove `?? allEntityMetrics` fallback at the intent-executor metrics-handoff site. No other modifications. No data migration. No schema change. No new endpoints. No removal of `aggregateMetrics()` or `allEntityMetrics` initialization (preserved for any indirect consumers; orthogonal cleanup).

END OF DIRECTIVE.

## ARCHITECT POST-MERGE WORKFLOW

After HF-205 merges and Vercel deploys:

1. **Run BCL October calc through UI**
2. **Verify grand total = \$44,590** (currently produces \$24,270; defect closes structurally)
3. **Verify Gabriela = \$1,400** (currently produces \$560; C2 = \$400 restored)
4. **Spot-check Vercel logs** for `[CalcTrace]` lines — should show:
   - `resolveSource:metric_lookup ... rawValueInMetrics=128.2` (instead of `=0`) for `cumplimiento_depositos`
   - `executeBoundedLookup1D:execution ... inputValue=128.2 ... bandIndex=3 ... outputValue=400`
5. **Confirm BCL October is reconciled** to ground truth $44,590

If reconciled: proceed to Meridian + CRP verification (likely same Shape C propagates cleanly).
If NOT reconciled: paste full Vercel calc log + total here; defect propagation to be re-localized via HF-204 trace.
