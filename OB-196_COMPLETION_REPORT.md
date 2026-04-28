# OB-196 — Completion Report (in-flight)

**Substrate:** `CCAFRICA/spm-platform` `origin/main` HEAD (post-Phase-1.6 = TBD; pre-Phase-1.6 = `5ee967c1`)
**Branch:** `dev`
**Status:** IN FLIGHT — Phase 1.6 committing; Phases 1.6.5, 1.7, 2 remaining.

---

## Phase progression

| Phase | Status | Commit | PR |
|---|---|---|---|
| Phase 0 — Substrate sync + ADR | ✅ COMPLETE | `15fb3827` | merged via #345 |
| Phase 1 — E1 primitive registry | ✅ COMPLETE | `ec0eceb9` + `7058ac40` | merged via #345 |
| Phase 1.5 — Legacy alias elimination at import boundary | ✅ COMPLETE | `9ebc340e` | #345 (merged `5ee967c1`) |
| Phase 1.6 — Trial/GPV/landing dead-code sweep + L7 capture | 🟡 COMMITTING | TBD | TBD |
| Phase 1.6.5 — Calc-side legacy consumer disposition | ⏳ PENDING | — | — |
| Phase 1.7 — Validation + forensics + UI consumers | ⏳ PENDING | — | — |
| Phase 2 — E2 dispatch errors (legacy engine arms in run-calculation.ts) | ⏳ PENDING | — | — |
| Phase 3 — E4 round-trip closure | ⏳ PENDING | — | — |
| Phase 4 — E5 plan-agent comprehension flow | ⏳ PENDING | — | — |
| Phase 5 — E3 signal-surface migration | ⏳ PENDING | — | — |
| Phase 6 — E6 Korean Test verdict + negative tests | ⏳ PENDING | — | — |
| Phase 7 — Compliance gates | ⏳ PENDING | — | — |
| Phase 8 — Completion report finalization + final PR | ⏳ PENDING | — | — |

---

## L7 WIDENING FINDING

### Context

AUD-004 catalogued F-005 ("six locations declaring six different counts of primitives") and F-007 ("`tier_lookup` ↔ `tiered_lookup` divergence") at the dispatch-surface level. The audit's Section 2 enumerated five files: `intent-types.ts`, `ai-plan-interpreter.ts`, `anthropic-adapter.ts`, `intent-executor.ts`, `run-calculation.ts`. Limiting Factor L7 (AUD-004 v3 §6) explicitly named the risk that the audit's twelve findings would prove dispatch-surface-only and that downstream consumer surfaces might also reference the legacy vocabulary.

### Finding

During Phase 1.5 verification grep, the legacy-vocabulary footprint surfaced across ~75 hits in ~20+ files beyond AUD-004's twelve enumerated findings. Categorical breakdown:

**A. Type-union declarations (3 sites):**
- `web/src/types/compensation-plan.ts:55` — `ComponentType` union
- `web/src/lib/compensation/plan-interpreter.ts:40-43` — separate union (file deleted in Phase 1.6)
- `web/src/lib/compensation/ai-plan-interpreter.ts:46,63,75,82` — legacy interfaces retained transitionally

**B. plan-interpreter.ts heuristic detector (separate from ai-plan-interpreter.ts):**
- 20+ legacy emission lines across the file (285, 357, 359, 363, 402, 442, 526, 605, 1233, 1236, 1345, 1357, 1381, 1394, 1438, 1441, 1476, 1479, 1490, 1494)
- File DELETED in Phase 1.6 per architect Option (b) — structurally indefensible heuristic fallback emitting hardcoded skeleton bands/tiers/values regardless of document content (FP-66 pattern)

**C. Calc-side consumers (Phase 1.6.5):**
- `web/src/lib/compensation/calculation-engine.ts` (lines 257-562)
- `web/src/lib/calculation/intent-transformer.ts` (lines 47-72)
- `web/src/lib/intelligence/trajectory-engine.ts` (lines 122-255)
- `web/src/lib/compensation/frmx-server-plan.ts` — DELETED in Phase 1.6 (zero consumers, FP-66 skeleton)

**D. Validation/forensics/orchestration (Phase 1.7):**
- `web/src/lib/validation/plan-anomaly-registry.ts` (~30 hits)
- `web/src/lib/forensics/trace-builder.ts` (4 hits)
- `web/src/lib/reconciliation/employee-reconciliation-trace.ts` (3 hits)
- `web/src/lib/calculation/results-formatter.ts:520`
- `web/src/lib/orchestration/metric-resolver.ts:164`

**E. UI consumers (Phase 1.7):**
- `perform/statements`, `performance/plans/[id]`, `data/import/enhanced`, `investigate/trace`
- `components/forensics/PlanValidation`, `components/compensation/CalculationBreakdown`, `LookupTableVisualization`, `ScenarioBuilder`
- `components/results/NarrativeSpine`

**F. Legacy engine (Phase 2):**
- `web/src/lib/calculation/run-calculation.ts:362-408`

### Disposition

The audit-finding closure scope expanded to include consumer surfaces. F-005 platform-wide closure required five phases instead of one:

- **Phase 1.5 (committed `9ebc340e`, merged via PR #345)** — import boundary closure.
- **Phase 1.6 (this commit)** — Trial/GPV/landing dead-code sweep + L7 finding capture.
- **Phase 1.6.5 (next)** — calc-side legacy consumers (calculation-engine, intent-transformer, trajectory-engine).
- **Phase 1.7 (after 1.6.5)** — validation + forensics + UI consumers.
- **Phase 2 (after 1.7)** — legacy engine arms in run-calculation.ts.

The structural invariant closing F-005 platform-wide: zero hits across all of `web/src/` (excluding `__tests__`, `.md` files, `primitive-registry.ts`, and audit-trail comments) for the legacy primitive identifier strings.

### Implication for AUD-004 closure scope

AUD-004 v3 §2's audit-finding closure map must be read as necessary but not sufficient. The map identifies the dispatch-surface boundaries that close each finding; it does not identify the consumer surfaces that must align with those boundaries. Future audits should explicitly enumerate consumer surfaces alongside dispatch surfaces.

### Implication for future audits

Recommendation: future audit specifications include a Phase L7 step that, after the dispatch-surface inventory completes, runs a substrate-wide grep for every primitive identifier in the audit's vocabulary and enumerates every consumer file where the identifier appears. This converts the consumer-surface enumeration from a derived discovery into a planned audit phase.

### Phase Closure Evidence

Detailed phase-by-phase evidence is captured in the discrete artifact `docs/audits/AUD_004_L7_FINDING.md` (created in Phase 1.6 commit; updated in subsequent phases).

| Phase | Closure note |
|---|---|
| Phase 1.5 | F-005 closed at import boundary. Plan-agent prompt teaches AI to emit foundational identifiers directly. Importer accepts foundational only. Commit `9ebc340e`, PR #345 merged. |
| Phase 1.6 | Trial/GPV/landing cluster deleted (~4,500+ lines, 6 directories). Cluster surfaces F-005-clean. Calc-side, validation, forensics, UI deferred to subsequent phases. |
| Phase 1.6.5 | [populated when commits] |
| Phase 1.7 | [populated when commits — final platform-wide-zero-hit grep] |
| Phase 2 | [populated when commits] |
