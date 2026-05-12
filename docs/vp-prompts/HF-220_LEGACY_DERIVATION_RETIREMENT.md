## HF-220: LEGACY DERIVATION PATH RETIREMENT — Concordance Shadow Removal

**Autonomy Directive (Rule 11):** NEVER ask yes/no. NEVER say "shall I". Just act.

**Status of this HF:** Retirement of the legacy derivation path (HF-188 "concordance shadow"). Decision 151 designates intent executor as sole calculation authority; the shadow's transition-validation purpose is complete; architect-channel verification across all three proof tenants confirms intent executor produces ground-truth-exact totals without legacy contribution. HF-220 aligns operative code with substrate-declared truth.

**Predecessors:** HF-188 (intent executor sole authority); HF-218 (layer-contract observability); HF-219 (engine self-correction + flywheel demotion + signal-registry eradication); Decision 151 (legacy demoted to shadow); Decision 25 (SUPERSEDED-PENDING VERIFICATION per April 2026 governance handoff — HF-220 closes the pending verification).

**Branch:** `dev` (created fresh from updated main post-HF-219-merge). PR to `main` at final step.

---

## CC STANDING RULES (READ FIRST)

CC reads `CC_STANDING_ARCHITECTURE_RULES.md` in full before any work.

- **Section A Principle 1** — AI-First, Never Hardcoded.
- **Section A Principle 7** — Prove, Don't Describe. Evidentiary gates: paste code/grep/output, never self-attestation.
- **Section A Principle 8** — Domain-Agnostic Always.
- **Section 0 (v3.0) GP-1** — Compliance is Architecture. Removing the legacy shadow aligns operative truth with substrate-declared authority.
- **Section B** — Architecture Decision Gate mandatory before implementation (Phase 1).
- **Section C** — Anti-Pattern Registry, including AP-26 (closed-vocabulary signal registries) — HF-220 must not introduce any new closed-vocabulary surface.
- **Section D Rules 1-24** — operational discipline.
- **Section E** — scale reference. Removal reduces per-calculation cost and signal-table write amplification proportionally to entity count × component count.
- **Section F** — quick checklist before completion.
- **Rules 25-28** — completion report discipline.

**SR-34** — No bypass. Structural retirement only.
**SR-42** — Locked-rule halt.
**SR-44** — Architect-only production verification.
**Rule 29** — CC paste block LAST; nothing after.

**Completion report location:** `docs/completion-reports/HF-220_COMPLETION_REPORT.md` per architect-confirmed operative convention.

---

## CONTEXT — WHY THIS HF EXISTS

### Substrate authority

Per HF-188 inline comment at `web/src/app/api/calculation/run/route.ts` (verbatim from AUD-005):

> "// ── LEGACY ENGINE PATH (concordance shadow — HF-188) ──
>  if (entityResults.length === 0) {
>    addLog('HF-188: Intent executor is sole authority — legacy engine is concordance shadow');
>  }"

Decision 151 (April 6, HF-188 PR #335) designated intent executor as sole calculation authority. The legacy engine was demoted to "concordance shadow" — a parallel execution path producing values used only to verify intent executor produces identical totals during the transition.

Decision 25 (Feb 22) required dual-path validation before legacy retirement. Marked SUPERSEDED-PENDING VERIFICATION by April 2026 governance handoff per HANDOFF §4.4 C-07: "Verification needed: (a) Was every primitive that Intent Executor now handles previously validated against the legacy engine, or were some never dual-path tested... (b) For primitives that the legacy engine could express, did the dual-path concordance reach 100% before legacy was demoted to shadow? (c) Are there any calculation patterns where the legacy engine produced a result that the Intent Executor cannot reproduce?"

**HF-220's three-tenant clean-slate verification IS the dual-path validation Decision 25 required.** The architect has clean-slate-and-reimported BCL, CRP, and Meridian. Intent executor produced ground-truth-exact totals across all three. Decision 25's verification is closed; legacy retirement is now substrate-aligned.

### Observable symptom in operative code

The Meridian January 2026-05-12 calculation run showed the symptom concretely:

- Every entity, every component fired `[CalcRecon-T3] EXCEPTION ob118MergeGuardFired existingKey=<key> preserved=convergence`
- 79 entities × 6 keys = 474 exception emissions per calc run
- HF-218 Component 4a wrote 474 paired `engine:exception` signals to classification_signals per calc run
- Calculation results were correct because OB-118 merge-guard preserved convergence-derived values; legacy-derived values were discarded by design
- `intent=X ✓` concordance comparison showed legacy and intent producing identical totals across all 79 entities

The shadow is doing work whose results are discarded by design, on every entity, every component. The OB-118 merge-guard exists solely to prevent legacy from overwriting convergence. The concordance comparison code (`intent=X ✓`) exists solely to verify what is now substrate-decided.

### Substantive cost

- **Computational waste:** ~395 legacy derivations per Meridian calc run discarded; scales linearly with entity × component count
- **Signal table write amplification:** 474 `engine:exception` signals per Meridian run from discarded-shadow merge-guard fires (not actual structural anomalies)
- **Code surface tax:** legacy derivation functions, OB-118 guard, concordance comparison, dual-path tests — all maintenance overhead for a verification discipline already complete
- **Architectural truth gap:** HF-188's substrate text declares intent executor as "sole authority"; operative code runs two authorities in parallel. Decision 151 retires the shadow; operative code retains it.

### Architect verification status

The architect has clean-slate-and-reimported all three proof tenants prior to HF-220 drafting:

- **Meridian:** 2026-05-12 run confirmed in conversation. Norma Rodríguez Rivera (entity 70209, January 2025): total = $2,210, components [c0:900, c1:200, c2:0, c3:500, c4:610]. Matches ground-truth from `Meridian_Resultados_Esperados.xlsx`. Full tenant total verification per architect-channel reconciliation.
- **BCL:** Architect-channel verification. Expected total $312,033 exact across 2,040 cells (6 periods × 4 components × 85 entities × 2 variants).
- **CRP Plan 1:** Architect-channel verification. Expected total $4,219,229 post-HF-213.

CC verifies on dev/localhost via service-role only per SR-44. Architect-channel ground-truth comparison is the proof gate; CC's role is to remove the shadow code and verify dev/localhost behavior is unchanged for the intent executor path.

---

## ARCHITECT DISPOSITIONS GOVERNING THIS HF

**Disposition 1:** Three-tenant clean-slate verification is COMPLETE before HF-220 begins (architect-channel). HF-220's proof gate is intent-executor-only operation across BCL + CRP + Meridian. The verification preceded the directive; CC does not re-verify ground truth.

**Disposition 2:** Legacy derivation, OB-118 merge-guard, and concordance comparison are retired in a single PR. No phased retirement; no "deprecate then remove" pattern. The substrate authority is in place; the verification is complete; the code follows.

**Disposition 3:** Intent executor remains sole authority post-HF-220. HF-220 does not modify intent executor behavior. HF-220 only removes the shadow that runs alongside it.

**Disposition 4:** The Decision-Implementation Gap discipline applies. The directive specifies removal scope; CC implements via the Architecture Decision Gate at mechanism level (which functions to delete, which call sites to remove, which tests to retire). CC does NOT scope-contract via ADR.

These dispositions are binding. The ADR is for implementation mechanism only.

---

## SCOPE — FOUR COMPONENTS

Single PR. All four ship together.

**Component R1 — Legacy derivation execution path removed.**

Delete the legacy engine block at `web/src/app/api/calculation/run/route.ts`. Per AUD-005 verbatim, the block begins:

```typescript
// ── LEGACY ENGINE PATH (concordance shadow — HF-188) ──
```

The block extends through the per-component loop that populates `componentResults`, `legacyTotalDecimal`, and `perComponentMetrics` via the legacy derivation calls. CC identifies the exact line range in Phase 0 via grep.

Removed from the engine flow:
- `applyMetricDerivations(...)` invocation at the legacy block
- `buildMetricsForComponent(...)` call in the convergence-binding-fallback branch (per AUD-005, this is the legacy fallback when `cbMetrics === null`; per HF-205 Shape C invariant, this fallback is no longer reachable — the invariant throws if convergence doesn't populate metrics)
- The `componentResults.push(result)` from the legacy loop
- The `legacyTotalDecimal.plus(rounded)` accumulator
- The `perComponentMetrics.push(metrics)` legacy population (intent-executor consumes `perComponentMetrics` per HF-205 Shape C; CC verifies that convergence-binding resolution is the sole populator of this array post-removal — if not, HF-220 ALSO restructures the population path)

**Critical CC discipline:** the `perComponentMetrics` array is consumed by intent executor at the HF-205 invariant site (verbatim from AUD-005):

```typescript
const metrics = perComponentMetrics[ci.componentIndex];
if (!metrics) {
  throw new Error(`HF-205 invariant: per-component metrics missing for component ${ci.componentIndex}...`);
}
```

After R1 removal, `perComponentMetrics` MUST still be populated for every component before intent-executor handoff. The convergence-binding resolution path at `route.ts:1577-1694` (per AUD-005) populates `metrics` from `resolveMetricsFromConvergenceBindings`; CC verifies in Phase 0 that this path populates `perComponentMetrics` even without the legacy block running, OR adjusts the population site to ensure invariant continuity.

If the legacy block was the sole `perComponentMetrics.push(...)` site, R1 includes promoting the convergence-binding resolution path to populate the array directly. This is the load-bearing structural detail; CC's Phase 0 discovery determines exact shape.

Files modified: `web/src/app/api/calculation/run/route.ts`

**Component R2 — OB-118 merge-guard removed.**

With only one path populating `metrics[key]`, the merge guard becomes vestigial.

Removed:
- The `if (key in metrics)` guard check at the metric-key population sites (CC identifies via grep in Phase 0)
- The `[CalcRecon-T3] EXCEPTION ... type=ob118MergeGuardFired` emit at the guard's fire site
- The paired `engine:exception` signal write at the same site (per HF-218 Component 4a, every T3 EXCEPTION addLog had a paired writeSignal; that pair is retired here)
- The `flags=[ob118MergeGuardFired,...]` accumulation in entity Tier-2 reconciliation output

`engine:exception` signals continue to fire from OTHER sites per HF-218 Component 4a (diag003Fallback, boundaryFallback). HF-220 only retires the merge-guard-specific emit.

Files modified: `web/src/app/api/calculation/run/route.ts`

**Component R3 — Concordance comparison removed.**

The `intent=X ✓` per-entity concordance verification code that compares intent executor output against legacy total.

Removed:
- The `legacyTotalDecimal` accumulator entirely (no longer populated, no longer referenced)
- The `intent=X ✓` comparison emit and any conditional log line that branches on intent-vs-legacy mismatch
- The HF-188 startup `addLog('HF-188: Intent executor is sole authority — legacy engine is concordance shadow')` log line at `entityResults.length === 0`
- Any helper functions that exist solely to format the concordance comparison output (CC identifies in Phase 0)

`intent=X ✓` is the visible artifact in Meridian's log; CC verifies via Phase 0 grep what code emits the `intent=` substring and removes those sites.

Files modified: `web/src/app/api/calculation/run/route.ts`

**Component R4 — Test refactor.**

Two test categories:

**R4a — Concordance tests retired.** Any test asserting `intent_total === legacy_total` or comparing per-component intent output against legacy output. These verify a relationship that no longer exists post-removal.

CC's Phase 0 grep:

```bash
grep -rn "concordance\|legacyTotal\|legacyEngine\|intent.*legacy" web/__tests__/ web/src/ --include="*.ts"
```

Each result CC reviews; concordance-comparison-tests are deleted.

**R4b — Tests asserting intent executor behavior against ground truth: PRESERVED unchanged.** These verify the operative path. They continue to run; they continue to pass; they continue to provide regression coverage for intent executor correctness.

**R4c — Tests exercising the legacy block directly: deleted.** If any test imports `applyMetricDerivations` or `buildMetricsForComponent` from the calculation path and asserts their outputs in isolation, those tests are dead post-R1; CC deletes them.

Files modified/deleted: as Phase 0 grep surfaces.

---

## OUT-OF-SCOPE — DO NOT EXPAND

CC does NOT in HF-220:

- Modify intent executor logic (intent executor is operative post-HF-220 unchanged from HF-219 state)
- Modify convergence-binding resolution (`resolveMetricsFromConvergenceBindings` and its callers remain operative unchanged)
- Modify HF-218 binding-snapshot persistence (Component 5 surface continues to write binding_snapshot to calculation_results.metadata)
- Modify HF-219 engine correction branch or fingerprint decrement caller (both remain operative)
- Modify classification_signals emission paths OTHER than the OB-118-specific T3 EXCEPTION pair retired in R2
- Touch substrate (VG repo) — substrate debt queue from prior HFs remains as-is
- Touch CC_STANDING_ARCHITECTURE_RULES.md — no new AP entry needed; HF-220 is a removal, not a new pattern
- Touch UI surfaces

If CC discovers scope creep, surface in Known Issues. Do not expand.

---

## ARCHITECTURE DECISION GATE (Section B)

CC commits the following ADR as the FIRST commit, BEFORE any implementation. File: `docs/architecture-decisions/HF-220_ARCHITECTURE_DECISION_RECORD.md`.

```
ARCHITECTURE DECISION RECORD — HF-220
======================================
Problem: Legacy derivation path (HF-188 concordance shadow) runs alongside intent executor on
every calc run, producing values discarded by OB-118 merge-guard. Decision 151 substrate
authority + three-tenant clean-slate verification confirm intent executor is operative sole
authority. Shadow is dead weight producing signal pollution and computational waste.

Decisions are IMPLEMENTATION-MECHANISM only. Removal scope is dispositioned. ADR is NOT for
scope re-evaluation.

Decision 1 — perComponentMetrics population strategy post-R1
  Options:
    A. Restructure convergence-binding resolution at route.ts:1577-1694 to push into perComponentMetrics directly (single populator post-removal)
    B. Introduce a slim shim that wraps cbMetrics resolution + perComponentMetrics population at the same site (structurally equivalent to A but isolated as a named function)
    C. Other (CC justifies)
  Constraints:
    - HF-205 Shape C invariant must continue to fire when perComponentMetrics[componentIndex] is missing (intent executor handoff fail-fast preserved)
    - Korean Test: no domain-specific population logic; structural population only
    - Atomicity: array population must succeed for every component before intent-executor reads it
  CHOSEN: ___ because ___
  REJECTED: ___ because ___

Decision 2 — Fallback path when convergence-binding resolution returns null
  Per AUD-005 verbatim, the current fallback when `cbMetrics === null || Object.keys(cbMetrics).length === 0` is `buildMetricsForComponent` (legacy). Post-HF-218 + HF-219, this fallback is reachable only when convergence has not produced bindings. HF-218 Component 2 emits engine:structural_exception at this site; HF-219 R2 invokes flywheel decrement.

  Options:
    A. Remove the fallback entirely; if convergence-binding resolution returns null, HF-205 Shape C invariant fires (throws) — this aligns with Decision 153 atomic cutover completion
    B. Replace the legacy fallback with an explicit structural_exception emit + skip-this-entity-component (HF-218 Component 2 path; engine refuses to calculate this slice; calculation continues for other slices)
    C. Other (CC justifies)
  Constraints:
    - Per Disposition 3, intent executor remains sole authority; no third path introduced
    - Per HF-218 Component 2, engine emits structural_exception on missing bindings; this is the operative path post-HF-218
    - Per HF-219 R2, structural_exception path invokes flywheel decrement when binding traces to fingerprint
  CHOSEN: ___ because ___
  REJECTED: ___ because ___

Decision 3 — perComponentMetrics array reference site cleanup
  After R1 removal, references to `perComponentMetrics` in legacy-context locations may become dead code. CC scans for references; dead references removed; live references (intent executor consumption at HF-205 Shape C site) preserved.

  Options:
    A. Delete dead references identified via grep
    B. Comment dead references with `// HF-220: legacy path removed` rather than delete
  Constraints:
    - Korean Test: no domain-specific naming added in comments
    - SR-34: no bypass; if a reference is unreachable, delete it; do not leave it as a "safety placeholder"
  CHOSEN: ___ because ___
  REJECTED: ___ because ___

For all decisions:
- Scale test: Works at 10x? Works at "Large" (500K-5M)? ___
- AI-first: No hardcoding introduced? ___
- Transport: No new HTTP body row data? ___
- Atomicity: Removal doesn't leave partial state? ___
- G1-G6 evaluation per Section 0 governing principles? ___
```

---

## PHASES — IMPLEMENTATION SEQUENCE

CC executes 7 phases. Each phase: commit + push. Final: `gh pr create`.

### Phase 0 — Discovery: Legacy footprint + perComponentMetrics population audit

CC executes:

```bash
# Legacy block boundary identification
grep -n "LEGACY ENGINE PATH\|concordance shadow" web/src/app/api/calculation/run/route.ts
grep -n "applyMetricDerivations\|buildMetricsForComponent" web/src/app/api/calculation/run/route.ts
grep -n "legacyTotalDecimal" web/src/app/api/calculation/run/route.ts

# OB-118 merge-guard sites
grep -n "ob118MergeGuardFired\|key in metrics\|HF-188" web/src/app/api/calculation/run/route.ts

# perComponentMetrics population sites (load-bearing for R1)
grep -n "perComponentMetrics" web/src/app/api/calculation/run/route.ts
grep -n "perComponentMetrics.push\|perComponentMetrics\[" web/src/app/api/calculation/run/route.ts

# Concordance comparison code
grep -n "intent=.*✓\|intent=.*legacy\|concordance" web/src/app/api/calculation/run/route.ts

# Test surface
grep -rln "applyMetricDerivations\|buildMetricsForComponent\|legacyTotal\|legacyEngine\|HF-188.*shadow" web/__tests__/ web/src/ --include="*.ts"
```

Paste verbatim output. CC determines:
1. Exact line range of the legacy block for R1 removal
2. Whether convergence-binding resolution already populates `perComponentMetrics` independently OR R1 must restructure population
3. Complete list of test files requiring R4 refactor

Commit message: `HF-220 Phase 0: Legacy footprint + perComponentMetrics population audit`

### Phase 1 — Architecture Decision Record

CC fills in the 3 architectural decisions. Each references AUD-005 + Decision 151 + Phase 0 output verbatim.

File: `docs/architecture-decisions/HF-220_ARCHITECTURE_DECISION_RECORD.md`

Commit message: `HF-220 Phase 1: Architecture Decision Record committed`

### Phase 2 — Component R1: Legacy derivation execution path removed

Per R1 specification + ADR Decisions 1 and 2.

File modified: `web/src/app/api/calculation/run/route.ts`

CC removes the legacy engine block, the legacy fallback at convergence-binding-null path (replaced per ADR Decision 2), and restructures `perComponentMetrics` population per ADR Decision 1 if Phase 0 determined restructuring is needed.

Test: `npx tsc --noEmit` shows zero TypeScript errors.

Commit message: `HF-220 Phase 2: Component R1 — Legacy derivation execution path removed`

### Phase 3 — Component R2: OB-118 merge-guard removed

Per R2 specification.

File modified: `web/src/app/api/calculation/run/route.ts`

CC removes the `if (key in metrics)` guard, the T3 EXCEPTION emit at the guard fire site, the paired engine:exception signal at the guard site, and the `flags=[ob118MergeGuardFired,...]` accumulation in Tier-2 reconciliation output.

Test: TypeScript clean.

Commit message: `HF-220 Phase 3: Component R2 — OB-118 merge-guard removed`

### Phase 4 — Component R3: Concordance comparison removed

Per R3 specification.

File modified: `web/src/app/api/calculation/run/route.ts`

CC removes the `legacyTotalDecimal` accumulator, the `intent=X ✓` comparison emit, the HF-188 startup log, and any helper functions exclusively serving concordance output.

Test: TypeScript clean.

Commit message: `HF-220 Phase 4: Component R3 — Concordance comparison removed`

### Phase 5 — Component R4: Test refactor

Per R4 specification + Phase 0 test surface output.

CC deletes:
- R4a concordance tests
- R4c isolation tests of legacy-only functions

CC preserves R4b intent-executor + ground-truth tests unchanged.

Test: full `npm test` run; all preserved tests pass.

Commit message: `HF-220 Phase 5: Component R4 — Concordance + legacy-isolation tests retired`

### Phase 6 — Verification + Completion Report

CC runs:

```bash
# Dead-reference verification
grep -rn "applyMetricDerivations\|buildMetricsForComponent\|legacyTotalDecimal\|ob118MergeGuardFired\|concordance shadow" \
    web/src/ --include="*.ts"
# Should be zero or only documentation comments

# Korean Test
grep -rnE "'No_Empleado'|'ID_Empleado'|'Hub'|'Cumplimiento'|'Mérida'" \
    web/src/lib/intelligence/ web/src/lib/sci/ web/src/lib/calculation/ \
    web/src/app/api/calculation/ --include="*.ts"
grep -rnE "/empleado/i|/empresa/i|/hub/i" \
    web/src/lib/intelligence/ web/src/lib/sci/ web/src/lib/calculation/ \
    web/src/app/api/calculation/ --include="*.ts"

# TypeScript + build + dev server
cd web && npx tsc --noEmit
rm -rf web/.next && cd web && npm run build && cd ..
cd web && (npm run dev &) && sleep 10 && curl -sf http://localhost:3000/login > /dev/null && echo "DEV-OK"
```

Each must show zero hits / clean output / DEV-OK.

Completion report at `docs/completion-reports/HF-220_COMPLETION_REPORT.md` per Rule 26 structure.

Commit message: `HF-220 Phase 6: Verification + completion report`

### Phase 7 — PR Creation

```bash
gh pr create --base main --head dev --title "HF-220: Legacy Derivation Path Retirement (Concordance Shadow Removal)" --body "<paste HF-220 summary + three-tenant verification evidence + Decision 151 + Decision 25 closure + signal volume reduction projection>"
```

---

## PROOF GATES — HARD

**Hard Gate 1:** Architecture Decision Record committed before any implementation phase. Three decisions filled with rationale citing AUD-005 + Decision 151 + Phase 0 output.
- Evidence: paste commit SHA and file path

**Hard Gate 2:** Legacy block removed at `web/src/app/api/calculation/run/route.ts`. Grep returns zero hits for the block's identifying comment ("LEGACY ENGINE PATH" / "concordance shadow") in operative code.
- Evidence: paste before-line-range + grep output post-removal

**Hard Gate 3:** `applyMetricDerivations` no longer called from the calculation engine path. `buildMetricsForComponent` removed from the fallback. Grep returns zero hits in `web/src/app/api/calculation/run/route.ts`.
- Evidence: paste grep output

**Hard Gate 4:** `perComponentMetrics` array continues to be populated for every component before intent-executor handoff. HF-205 Shape C invariant continues to fire on missing population.
- Evidence: paste the population code post-restructuring + paste the HF-205 invariant code unchanged

**Hard Gate 5:** OB-118 merge-guard removed. `ob118MergeGuardFired` literal returns zero hits in the calculation engine path.
- Evidence: paste grep output

**Hard Gate 6:** Paired `engine:exception` signal at OB-118 site removed. Other `engine:exception` writes (diag003Fallback, boundaryFallback) preserved unchanged per HF-218 Component 4a.
- Evidence: paste the signal-write sites before/after; verify only the OB-118-paired site removed

**Hard Gate 7:** `legacyTotalDecimal` accumulator removed entirely. No remaining references.
- Evidence: paste grep output

**Hard Gate 8:** Concordance comparison code removed. `intent=` substring grep returns only intent-executor-internal references, no concordance-comparison emits.
- Evidence: paste grep output and review remaining hits

**Hard Gate 9:** Concordance tests deleted. Intent-executor tests preserved.
- Evidence: paste deleted test file list + paste preserved test run output (PASS)

**Hard Gate 10:** Korean Test grep returns ZERO hits across calculation engine path.
- Evidence: paste both grep commands and output

**Hard Gate 11:** Anti-Pattern Registry check returns ZERO violations. HF-220 introduces no new dictionary/enum-gate/registry/closed-vocabulary surface.
- Evidence: paste per-AP verification, including AP-26 verification

**Hard Gate 12:** Final build passes; localhost:3000 responds; TypeScript clean.
- Evidence: paste build exit code + curl response + tsc output

**Hard Gate 13:** All 7 phases committed as separate commits (Rule 28).
- Evidence: paste `git log --oneline | grep HF-220`

**Hard Gate 14:** PR created with full HF-220 summary.
- Evidence: paste `gh pr view --json url,title,body | jq`

---

## PROOF GATES — SOFT

**Soft Gate 1:** Localhost calc run produces same totals as architect's pre-HF-220 clean-slate verification for any one proof tenant (CC selects Meridian for least token cost on architect-channel comparison).
- Evidence: paste CC's localhost calc output for Meridian January (entity 70209 Norma Rodríguez Rivera + 2-3 other entities); architect compares to prior verification offline

**Soft Gate 2:** Signal volume reduction confirmed: `[CalcRecon-T3] EXCEPTION` lines and `engine:exception` signal writes per calc run drop materially (target: zero ob118MergeGuardFired emissions; only true structural anomalies remain).
- Evidence: paste log line count or signal-table query showing reduction

**Soft Gate 3:** No regressions surfaced in dev/localhost across calc runs of representative entities from each proof tenant.
- Evidence: paste calc results for 2-3 entities per tenant; architect confirms unchanged from pre-HF-220 baseline

---

## CC OUTPUT DISCIPLINE

CC's completion response contains:

1. Final commit count + SHAs
2. PR URL
3. Completion report file path
4. ADR file path
5. Phase 0 outputs (legacy block line range, perComponentMetrics population path, test surface count)
6. Hard gates summary with line pointers
7. Soft gates summary
8. Known Issues count
9. Substrate state (no new debt introduced; existing debt queue per HF-218 + HF-219 unchanged)

CC does NOT interpret findings, recommend next steps, or propose follow-on HFs.

---

## COMPLETION REPORT ENFORCEMENT (Rules 25-28)

File: `docs/completion-reports/HF-220_COMPLETION_REPORT.md`. Per architect-confirmed convention (NOT project root).

Structure per Rule 26 mandatory order. Created BEFORE final build. Verbatim proof gate criteria with PASTE evidence per Rule 27. One commit per phase per Rule 28.

---

**End of HF-220 prompt. Paste verbatim to CC.**
