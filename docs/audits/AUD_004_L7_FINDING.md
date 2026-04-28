# AUD-004 L7 Finding — Audit Consumer-Surface Widening

**Discovery date:** 2026-04-28 (during OB-196 Phase 1.5 verification grep)
**Originating audit:** AUD-004 (Phase 0 + Phase 0G)
**Limiting factor cited:** L7 (AUD-004 v3 §6)
**Closure work item:** OB-196 Phases 1.5, 1.6, 1.6.5, 1.7, 2
**Status:** OPEN (closes when Phase 1.7 verification grep returns zero hits platform-wide)

---

## Summary

AUD-004 catalogued F-005 ("six locations declaring six different counts of primitives") and F-007 ("`tier_lookup` ↔ `tiered_lookup` divergence") at the dispatch-surface level. The audit's §2 enumerated five files: `intent-types.ts`, `ai-plan-interpreter.ts`, `anthropic-adapter.ts`, `intent-executor.ts`, `run-calculation.ts`.

During OB-196 Phase 1.5 verification grep, the legacy-vocabulary footprint surfaced across ~75 hits in ~20+ files in consumer surfaces beyond the audit's twelve findings. F-005 platform-wide closure required four phases rather than one. This finding documents the discovery and the closure trajectory.

---

## Context

AUD-004 catalogued F-005 ("six locations declaring six different counts of primitives") and F-007 ("`tier_lookup` ↔ `tiered_lookup` divergence") at the dispatch-surface level. The audit's Section 2 enumerated five files: `intent-types.ts`, `ai-plan-interpreter.ts`, `anthropic-adapter.ts`, `intent-executor.ts`, `run-calculation.ts`. Limiting Factor L7 (AUD-004 v3 §6) explicitly named the risk that the audit's twelve findings would prove dispatch-surface-only and that downstream consumer surfaces might also reference the legacy vocabulary.

---

## Finding

During Phase 1.5 verification grep, the legacy-vocabulary footprint surfaced across ~75 hits in ~20+ files beyond AUD-004's twelve enumerated findings. Categorical breakdown:

**A. Type-union declarations (3 sites):**
- `web/src/types/compensation-plan.ts:55` — `ComponentType` union
- `web/src/lib/compensation/plan-interpreter.ts:40-43` — separate union (file deleted in Phase 1.6)
- `web/src/lib/compensation/ai-plan-interpreter.ts:46,63,75,82` — legacy interfaces retained transitionally

**B. plan-interpreter.ts heuristic detector (separate from ai-plan-interpreter.ts):**
- Lines 285, 357, 359, 363, 402, 442, 526, 605, 1233, 1236, 1345, 1357, 1381, 1394, 1438, 1441, 1476, 1479, 1490, 1494
- File DELETED in Phase 1.6 per architect Option (b) — structurally indefensible heuristic fallback emitting hardcoded skeleton bands/tiers/values regardless of document content (FP-66 pattern: seeding instead of importing)

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

---

## Disposition

The audit-finding closure scope expanded to include consumer surfaces. F-005 platform-wide closure required five phases instead of one:

- **Phase 1.5** — import boundary closure (committed `9ebc340e`, merged via PR #345).
- **Phase 1.6** — Trial/GPV/landing dead-code sweep (cluster surfaces).
- **Phase 1.6.5** — calc-side legacy consumers (calculation-engine, intent-transformer, trajectory-engine).
- **Phase 1.7** — validation + forensics + UI consumers.
- **Phase 2** — legacy engine arms in run-calculation.ts.

The structural invariant closing F-005 platform-wide: zero hits across all of `web/src/` (excluding `__tests__`, `.md` files, `primitive-registry.ts`, and audit-trail comments) for the legacy primitive identifier strings.

---

## Implication for AUD-004 closure scope

AUD-004 v3 §2's audit-finding closure map must be read as necessary but not sufficient. The map identifies the dispatch-surface boundaries that close each finding; it does not identify the consumer surfaces that must align with those boundaries. Future audits should explicitly enumerate consumer surfaces alongside dispatch surfaces.

---

## Implication for future audits

Recommendation: future audit specifications include a Phase L7 step that, after the dispatch-surface inventory completes, runs a substrate-wide grep for every primitive identifier in the audit's vocabulary and enumerates every consumer file where the identifier appears. This converts the consumer-surface enumeration from a derived discovery into a planned audit phase.

---

## Phase Closure Evidence

### Phase 1.5 (boundary closure)
- **Commit:** `9ebc340e`
- **PR:** https://github.com/CCAFRICA/spm-platform/pull/345 (merged)
- **Files:** `ai-plan-interpreter.ts` (importer refactor), `anthropic-adapter.ts` (MAPPING RULES deleted), `ob196-phase15-premigration-query.ts` (audit trail)
- **Closure:** F-005 closed at the import boundary. Plan-agent prompt teaches AI to emit foundational identifiers directly. Importer accepts foundational only.

### Phase 1.6 (Trial/GPV/landing dead-code sweep + L7 capture)
- **Commit:** [populated at commit time]
- **PR:** [populated at PR creation]
- **Deletions (~4,500+ lines, 6 directories):**
  - `GPVWizard.tsx` (792 lines)
  - `plan-interpreter.ts` (1521 lines, structurally indefensible heuristic per Option b)
  - `customer-launch-flow.ts` (919 lines, zero consumers)
  - `frmx-server-plan.ts` (267 lines, zero consumers, FP-66 skeleton)
  - `/api/interpret-plan/route.ts` (180 lines)
  - `/api/gpv/route.ts` (110 lines)
  - `useGPV.ts` (78 lines)
  - `useTrialStatus.ts` (42 lines)
  - `lib/trial.ts` (77 lines)
  - `TrialBadge.tsx` (31 lines, dead orphan)
  - `TrialGate.tsx` (69 lines)
  - `landing/page.tsx` + `layout.tsx` (414 lines)
  - Directories swept: `components/gpv`, `lib/launch`, `api/interpret-plan`, `api/gpv`, `components/trial`, `app/landing`
- **Refactors:** `page.tsx`, `middleware.ts`, `AdminDashboard.tsx`, `FeatureFlagsTab.tsx`, `milestones.ts`, `signup` route (cluster trial block only), `auth/callback` (gpv block only — `billing.*` PRESERVED), `signup` page (marketing copy), `/api/platform/flags` (SAFE_DEFAULTS), `compensation/index.ts` (barrel re-export removal)
- **Preserved (separate concern, Stripe billing infrastructure):**
  - `tenant.settings.billing.*` fields
  - `/api/billing/webhook` `trial_end` handling
  - `events/emitter` `billing.trial_*` event vocabulary
- **Closure:** Cluster surfaces F-005-clean. Calc-side, validation, forensics, UI deferred to subsequent phases.

### Phase 1.6.5 (calc-side legacy consumer disposition)
[To be populated when Phase 1.6.5 commits — must include per-engine disposition (a/b/c) and verification grep evidence]

### Phase 1.7 (validation + forensics + UI consumers)
[To be populated when Phase 1.7 commits — must include final platform-wide-zero-hit grep]

### Phase 2 (legacy engine arms)
[To be populated when Phase 2 commits]

---

## Closure marker

[FINDING CLOSED YYYY-MM-DD — Phase 1.7 verification grep returned zero hits across `web/src/`. F-005 platform-wide closure invariant holds.]
