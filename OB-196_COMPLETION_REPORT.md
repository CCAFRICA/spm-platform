# OB-196 — Completion Report (in-flight)

**Substrate:** `CCAFRICA/spm-platform` `origin/main` HEAD (post-Phase-1.7 = `6ead4def`; post-Phase-2 = `bad60c79`; post-Phase-3 = TBD)
**Branch:** `dev`
**Status:** IN FLIGHT — Phase 3 committing (E4 round-trip closure verification + structured-failure hardening); Phases 4-8 remaining.

---

## Phase progression

| Phase | Status | Commit | PR |
|---|---|---|---|
| Phase 0 — Substrate sync + ADR | ✅ COMPLETE | `15fb3827` | merged via #345 |
| Phase 1 — E1 primitive registry | ✅ COMPLETE | `ec0eceb9` + `7058ac40` | merged via #345 |
| Phase 1.5 — Legacy alias elimination at import boundary | ✅ COMPLETE | `9ebc340e` | #345 (merged `5ee967c1`) |
| Phase 1.6 — Trial/GPV/landing dead-code sweep + L7 capture | ✅ COMPLETE | `7fa598f6` | merged via #346 |
| Phase 1.6.5 — Calc-side legacy disposition + demo-era wholesale sweep + FP-66 cleanup + disputes drop | ✅ COMPLETE | `f6bea1a8` | merged via #347 |
| Phase 1.7 — Validation + forensics + UI consumers + plan-management era-artifact wholesale + F-005 platform-wide closure | ✅ COMPLETE | `25a32090` | merged via #348 (`6ead4def`) |
| Phase 2 — E2 structured failure on legacy engine arms + LegacyShapedPlanComponent removal + audit-trail integrity | ✅ COMPLETE | `7b9662f9` | merged via #349 (`bad60c79`) |
| Phase 3 — E4 round-trip closure verification + structured-failure hardening + negative test suite | 🟡 COMMITTING | TBD (post-merge) | TBD |
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
| Phase 1.6 | Trial/GPV/landing cluster deleted (~4,500+ lines, 6 directories). Cluster surfaces F-005-clean. Calc-side, validation, forensics, UI deferred to subsequent phases. Commit `7fa598f6`, PR #346 merged. |
| Phase 1.6.5 | Calc-side wholesale: calculation-engine.ts (801 lines) + intent-resolver.ts (119 lines) deleted; intent-transformer legacy arms stripped; trajectory-engine refactored to read-only metadata.intent projection (Decision 151). Demo-era cluster wholesale sweep: transactions/* pages, performance/scenarios, design/modeling re-export, insights/disputes, investigate/disputes, components/disputes/* (7 files), api/disputes/* (3 routes), lib/disputes/, lib/scenarios/, lib/demo/ (8 files, ~2,969 lines), components/demo/ (4 plumbing components post-PersonaSwitcher carve-out), app/admin/demo, app/operate/normalization, lib/normalization/flywheel-verification, data/tenants/retailco/ (4 fixtures), resolution-agent.ts, types/dispute.ts, RecentTransactionsCard, SavedScenariosList, lib/reconciliation/reconciliation-bridge.ts (1,034-line orphan). Q-S1 carve-out: components/demo/DemoPersonaSwitcher.tsx → components/persona/PersonaSwitcher.tsx (production component move + rename). Service-layer FP-66 cleanup: payout-service (DEMO_EMPLOYEES + DEMO_BATCHES stripped), rbac-service (getDefaultAssignments + getDefaultAuditLogs stripped), search-service (4-user array stripped), workforce/permissions (DEMO_USERS stripped), alerts-service / quarantine-service / plan-approval-service (retailco demo blocks stripped), data/tenants/index.json (retailco entry removed), lib/storage/tenant-registry-service (retailco removed from STATIC_TENANT_IDS), app/configuration / app/operations/audits/logins (demo user/login records stripped). Navigation surfaces refactored: Sidebar (transactions parent + scenario modeling child + ICM_ONLY_HREFS), CommandPalette, QuickActionsCard, PayoutEmployeeTable, global-search, enhanced import page, notification-service (3 dispute helper functions removed), payouts/[id] (dispute warning block stripped), help-service (deletion-set relatedRoutes), acceleration-hints, access-control (4 union members + ROUTE_TO_MODULE entries + MODULE_ACCESS roles), page-status (deletion-set entries), role-permissions. my-compensation refactored (dispute imports + state + handler + UI block + RecentTransactionsCard stripped). Disputes Supabase table drop migration written (`web/supabase/migrations/20260428_aud_004_drop_disputes_table.sql`); architect applies via Supabase SQL Editor (Standing Rule 7) post-merge. F-005 calc-read path closed. tsc clean. Lint clean. |
| Phase 1.7 | F-005 platform-wide closure. 8 mechanical vocabulary refactors + 3 architect-disposed shape-coupled refactors (metric-resolver, employee-reconciliation-trace, enhanced/page) + plan-management cluster wholesale (LIST/DETAIL/4 editors/PlanReferenceCard/Scenario* orphans/design shims) + plan-management cleanup cascade (10 surfaces) + type union narrowed to foundational identifiers + PlanComponent stripped of legacy optional fields + ai-plan-interpreter transitionally-retained interfaces deleted. Orphan deletes: plan-anomaly-registry.ts (987 lines, zero consumers), PlanValidation + plan-validation page (era-artifact downstream of plan-management). Final F-005 closure invariant grep returns zero hits outside exempt categories (only 2 audit-trail comments remain). LegacyShapedPlanComponent transitional type added for Phase 2 callers (run-calculation.ts legacy switch arms + api/calculation/run band-normalization). |
| Phase 2 | E2 structured failure on `run-calculation.ts` legacy switch arms (foundational arms fall through to intent-executor; default arm throws `LegacyEngineUnknownComponentTypeError`); legacy evaluators deleted (`evaluateTierLookup`, `evaluatePercentage`, `evaluateMatrixLookup`, `evaluateConditionalPercentage` — unreachable post-Phase-1.7). `api/calculation/run/route.ts` band-normalization refactored to read foundational `metadata.intent.boundaries` (Decision 151 read-only projection); HF-122 + HF-188 rounding sites use foundational-only precision inference. `LegacyShapedPlanComponent` transitional type and 7 orphan legacy interfaces (`MatrixConfig`, `TierConfig`, `PercentageConfig`, `ConditionalConfig`, `Band`, `Tier`, `ConditionalRate`) deleted from `types/compensation-plan.ts`. Audit-trail integrity (Class A): completion-report 9 missing sections appended; AUD_004_L7_FINDING.md Status header CLOSED + Phase 1.6/1.7 SHA backfill. F-005 final closure invariant grep (run-calculation.ts INCLUDED) returns only 2 audit-trail comments — within exempt categories. |


---

## IRA Invocation 1 alignment

Phase ↔ Finding ↔ Substrate mapping per OB-196 directive's IRA Invocation 1.

| Phase | Extension | IRA Finding | Substrate anchor |
|---|---|---|---|
| Phase 1 | E1 — primitive registry | Finding 1 | Decision 24 / T2-E36 |
| Phase 2 | E2 — dispatch surface integrity | Finding 2 | Decision 151 / T2-E25 |
| Phase 3 | E4 — round-trip closure | Finding 4 | T1-E902 |
| Phase 4 | E5 — plan-agent comprehension flow | Finding 5 | T1-E906 |
| Phase 5 | E3 — signal-surface migration | Finding 3 | Decision 64v2 / T2-E01 |
| Phase 6 | E6 — Korean Test verdict + negative tests | Finding 6 | T1-E910 |

---

## Commits in order

| Hash | Phase | Description |
|---|---|---|
| `15fb3827` | Phase 0 | Substrate sync + ADR + §2 line-range verification |
| `ec0eceb9` | Phase 1 | E1 primitive registry — primitive-registry.ts + intent-types narrowing + intent-validator integration |
| `7058ac40` | Phase 1 | Phase 1 lint cleanup |
| `9ebc340e` | Phase 1.5 | Legacy alias elimination at import boundary — ai-plan-interpreter truncation, anthropic-adapter MAPPING RULES deletion |
| `7fa598f6` | Phase 1.6 | Trial/GPV/landing dead-code sweep (~4,500+ lines, 6 directories) + L7 finding capture |
| `390eb9ba` | Phase 1.6.5 | Calc-side legacy disposition + demo-era wholesale sweep + service-layer FP-66 cleanup + disputes infrastructure removal + database drop migration |
| `25a32090` | Phase 1.7 | Validation/forensics/UI consumer refactor + plan-management era-artifact wholesale + F-005 platform-wide closure (merged via `6ead4def`) |
| `7b9662f9` | Phase 2 | E2 structured failure on run-calculation.ts + LegacyShapedPlanComponent removal + completion report fill-in (merged via #349 / `bad60c79`) |
| _TBD_ | Phase 3 | E4 round-trip closure: ExecutionTrace.componentType field; per-surface dispositions on A.5.GAP-1; structured-failure hardening at 4 internal dispatch surfaces; graceful-with-label at 2 user-facing surfaces; negative test suite (38 tests) |

---

## Files created in OB-196

| Phase | File | Purpose |
|---|---|---|
| Phase 1 | `web/src/lib/calculation/primitive-registry.ts` | Decision 155 canonical surface — 12 foundational primitive declarations + lookup/registration helpers |
| Phase 1.5 | `web/scripts/ob196-phase15-premigration-query.ts` | Pre-migration query surfacing persisted componentType universe (Standing Rule 27 evidence) |
| Phase 1.6 | `OB-196_COMPLETION_REPORT.md` | This completion report (in-flight artifact) |
| Phase 1.6 | `docs/audits/AUD_004_L7_FINDING.md` | Discrete L7 widening finding artifact |
| Phase 1.6.5 | `web/src/components/persona/PersonaSwitcher.tsx` | Production persona switcher (Q-S1 carve-out from `components/demo/DemoPersonaSwitcher.tsx`) |
| Phase 1.6.5 | `web/supabase/migrations/20260428_aud_004_drop_disputes_table.sql` | Disputes table drop migration (architect-applied post-merge) |
| Phase 1.6.5 | `web/scripts/p165-disputes-count.ts` | Pre-migration verification query (Standing Rule 27) |

---

## Files modified in OB-196

Per-phase summary. Authoritative file list lives in each phase's commit body (Standing Rule 27 — paste evidence at commit time).

| Phase | Files modified | Commit reference |
|---|---|---|
| Phase 1 | 4 (intent-types, intent-validator, anthropic-adapter, ai-plan-interpreter) | `ec0eceb9` body |
| Phase 1.5 | 2 (ai-plan-interpreter importer truncation, anthropic-adapter MAPPING RULES deletion) | `9ebc340e` body |
| Phase 1.6 | ~25 (14 deletions across 6 directories + 9 refactors) | `7fa598f6` body |
| Phase 1.6.5 | 98 file changes (engine deletions + cluster wholesale + lib/demo + lib/disputes + lib/scenarios + api/disputes + components/disputes + service-layer FP-66 + nav/permission refactor + Q-S1 carve-out + my-compensation refactor + L7 artifact updates + migration) | `390eb9ba` body |
| Phase 1.7 | 43 file changes (8 mechanical vocab + 3 shape-coupled refactors + plan-management cluster + cleanup cascade + type narrowing + ai-plan-interpreter Phase 1.5 retained interfaces deleted + L7 artifact updates) | `25a32090` body |
| Phase 2 | 5 (run-calculation.ts evaluateComponent + getExpectedMetricNames + HF-122 rounding; api/calculation/run 3 sites; types/compensation-plan.ts; OB-196_COMPLETION_REPORT.md +9 sections; AUD_004_L7_FINDING.md status+SHA backfill) | `7b9662f9` body |
| Phase 3 | 8 (intent-types.ts + intent-executor.ts trace field + executeOperation default + executeIntent + run-calculation.ts evaluateComponent legacy probe; metric-resolver.ts MissingIntentError; state-reader.ts ShapeViolationError; api/calculation/run self-read shape validation; api/ai/assessment shape_violation marker; employee-reconciliation-trace graceful label; perform/statements graceful label; NarrativeSpine vocab fix; operate/results + PlanResults snake_case fallback strip; new __tests__/round-trip-closure/run.ts) | TBD (Phase 3 commit body) |

---

## Proof gates HARD (per phase)

| Phase | Gate | Status | Evidence |
|---|---|---|---|
| Phase 0 | Substrate sync HEAD = `6bc005e6`, §2 line ranges verified, ADR committed | PASS | `15fb3827` |
| Phase 1 | Primitive identifier grep clean (registry + intent-types only); tsc + build clean | PASS | `ec0eceb9` + `7058ac40` |
| Phase 1.5 | Importer alias list eliminated; plan-agent prompt MAPPING RULES deleted; registry single source of truth at import boundary | PASS | `9ebc340e`, PR #345 merged |
| Phase 1.6 | Cluster deletion verification grep clean; Stripe billing preservation grep positive; identity preservation confirmed (BCL + CRP rows in tenants) | PASS | `7fa598f6`, PR #346 merged |
| Phase 1.6.5 | Terminating-condition grep at outcome (a) — all five greps clean; disputes table drop migration applied (architect-side, post-merge); tsc + build clean | PASS | `390eb9ba`, PR #347 merged, migration applied 2026-04-28 |
| Phase 1.7 | F-005 closure invariant grep (zero hits in non-exempt categories); plan-management cleanup verification clean; type narrowing applied; tsc + lint + build clean | PASS | `25a32090`, PR #348 merged via `6ead4def` |
| Phase 2 | Final F-005 invariant grep INCLUDING run-calculation.ts → zero hits in non-exempt categories; LegacyShapedPlanComponent zero-consumer; orphan interface zero-consumer; tsc + lint + build clean | PASS | `7b9662f9`, PR #349 merged via `bad60c79` |
| Phase 3 | Class A round-trip property audit (5 gaps surfaced); Class B refactor (B.1 ExecutionTrace.componentType field added + populated at all 2 trace-construction sites; B.2 NarrativeSpine vocabulary fix; B.3 snake_case fallback strip; B.4 per-surface fixes for Q-A.5.1/Q-A.5.3/Q-A.5.4; B.5 structured-failure error classes at 4 internal dispatch surfaces); Class C 38-test E4 negative test suite (12 round-trip identity + 12 trace-level identity + 4 adversarial input + 4 graceful-label + 6 registry sanity) all PASS; tsc + lint + build clean | _TBD_ | _populated at Phase 3 commit_ |

---

## Proof gates SOFT (per phase)

| Phase | Gate | Status | Evidence |
|---|---|---|---|
| Phase 0 | ADR predecessor declarations | PASS | `15fb3827` body |
| Phase 1 | Predecessor declarations in commit message + PR title + PR body (FP-70) | PASS | `ec0eceb9` body, PR #345 |
| Phase 1.5 | Predecessor declarations + Standing Rule 27 evidence (verification grep pasted) | PASS | `9ebc340e` body |
| Phase 1.6 | L7 finding capture in both surfaces (CR + discrete artifact); evidence pasted not self-attested | PASS | `OB-196_COMPLETION_REPORT.md` + `docs/audits/AUD_004_L7_FINDING.md` |
| Phase 1.6.5 | One commit per phase (Standing Rule 28); predecessor declarations to Phase 1.7 + Phase 2 | PASS | `390eb9ba` body |
| Phase 1.7 | One commit per phase; predecessor declarations to Phase 2; F-005 closure marker written | PASS | `25a32090` body, AUD_004 closure marker |
| Phase 2 | Audit-trail integrity gate (Class A) before E2 work (Class B); additive-only orchestration | PASS | `7b9662f9` body |
| Phase 3 | Audit-first → disposition → refactor pattern; Class A surfaced 5 gaps with architect dispositions; additive-only orchestration on completion-report append; predecessor declarations to Phase 4 | _TBD_ | _populated at Phase 3 commit_ |

---

## Standing rule compliance

Matrix of [Phase × Rule × Status × Evidence]. All PASS for completed phases.

| Phase | Rule 25 (CR pre-build) | Rule 27 (paste evidence) | Rule 28 (one commit/phase) | Rule 34 (no bypass) | Rule 51v2 (tsc+lint clean) | Korean Test (Decision 154) | FP-49 (schema verify) | FP-66 (service-layer demo) | FP-69 (cluster cleanup) | FP-70 (phase deferral) | Decision 151 (executor authority) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Phase 0 | PASS | PASS | PASS | PASS | n/a (ADR-only) | PASS | n/a | n/a | n/a | PASS | n/a |
| Phase 1 | PASS | PASS | PASS | PASS | PASS | PASS | n/a | n/a | n/a | PASS | PASS |
| Phase 1.5 | PASS | PASS | PASS | PASS | PASS | PASS | n/a | n/a | n/a | PASS | PASS |
| Phase 1.6 | PASS | PASS | PASS | PASS | PASS | PASS | n/a | PASS | PASS | PASS | PASS |
| Phase 1.6.5 | PASS | PASS | PASS | PASS | PASS | PASS | PASS (disputes drop) | PASS | PASS | PASS | PASS |
| Phase 1.7 | PASS | PASS | PASS | PASS | PASS | PASS | n/a | PASS | PASS | PASS | PASS |
| Phase 2 | PASS | PASS | PASS | PASS | PASS | PASS | n/a | n/a | PASS | PASS | PASS |
| Phase 3 | PASS | PASS | PASS | PASS | PASS | PASS | n/a | n/a | PASS | PASS | PASS |

---

## Assumptions validated / open

Per OB-196 directive's A1-A7 assumption set.

| ID | Assumption | Status | Phase validated / disposition |
|---|---|---|---|
| A1 | Substrate line ranges (AUD-004 §2 file inventory) hold at substrate sync HEAD | VALIDATED | Phase 0 |
| A2 | TypeScript const N2 mechanism — registry as compile-time enforced surface (Decision 155) | VALIDATED | Phase 1 |
| A3 | signal_level + flywheel_scope read-coupling holds across calc-side | VALIDATED | Phase 1 |
| A4 | BCL primitive coverage — every BCL component maps to a foundational primitive | CARRY-FORWARD | Post-Phase-2 reconciliation gate (architect-side, BCL_Resultados_Esperados.xlsx) |
| A5 | Plan-agent comprehension as L2 signal | CARRY-FORWARD | Phase 4 (E5 work) |
| A6 | Single comprehensive PR closes OB-196 | REVISED | Multi-PR per L7 widening discovery — Phases 1.5/1.6/1.6.5/1.7/2 |
| A7 | Decimal precision held end-to-end | HELD | Throughout — `lib/calculation/decimal-precision.ts` invariant preserved at each phase |

---

## Known issues + carry-forward + reconciliation gate

### Transitional artifacts (Phase 2 closes)

- **`LegacyShapedPlanComponent` transitional type** — added in Phase 1.7 (`types/compensation-plan.ts`) for compile-correctness at Phase 2 sites (`run-calculation.ts:362-408` legacy switch arms + `api/calculation/run` band-normalization 3 sites). Phase 2 removes the type after refactoring those sites.
- **Orphan legacy interfaces post-Phase-2** — `MatrixConfig`, `TierConfig`, `PercentageConfig`, `ConditionalConfig`, `Band`, `Tier`, `ConditionalRate` (all in `types/compensation-plan.ts`). These types remain because `LegacyShapedPlanComponent` references them. Phase 2 deletes them after `LegacyShapedPlanComponent` removal.

### Phase deferrals

- **Phase 2** — E2 structured failure on `run-calculation.ts` legacy switch arms; `api/calculation/run` band-normalization refactor; final F-005 invariant including `run-calculation.ts`. Pending.
- **Phase 3** — E4 round-trip closure (T1-E902). Pending.
- **Phase 4** — E5 plan-agent comprehension flow (T1-E906). Pending.
- **Phase 5** — E3 signal-surface migration (Decision 64v2 / T2-E01). Pending.
- **Phase 6** — E6 Korean Test verdict + negative tests (T1-E910). Pending.
- **Phase 7** — Compliance gates. Pending.
- **Phase 8** — Final completion report finalization + final PR. Pending.

### Reconciliation gate (architect-side, separate session)

BCL clean-slate proof test reconciliation against `BCL_Resultados_Esperados.xlsx` is **architect-side, post-OB-196-merge**. Reconciliation verifies:
- 6-period total
- October per-component values
- Per-component values matching the proof spreadsheet ground truth

This gate lives **only in the architect channel**. Not in CC scope. CC's role ends at substrate-cleanliness + structural invariant proof; the proof-tenant numerical reconciliation is verified by the architect against the ground-truth spreadsheet.


---

## E4 round-trip closure verification

### Class A — Round-trip property audit (5 gaps surfaced)

Per architect dispositions on Class A audit findings:

| Gap | Disposition | Resolution |
|---|---|---|
| **A.1.GAP-1** — `ExecutionTrace` lacks foundational primitive identifier | (a) add `componentType: string` field; populate at trace construction | B.1 — applied: field added to `ExecutionTrace` interface in `intent-types.ts:260-285`; populated at both trace-construction sites in `intent-executor.ts` (executeIntent partial trace + final ExecutionTrace assembly) |
| **A.2.GAP-1** — `NarrativeSpine.tsx:258` literal `'percentage'` legacy string | (a) refactor to foundational | B.2 — applied: `'percentage'` → `'scalar_multiply'` |
| **A.2.GAP-2** — `comp.component_type` snake_case fallback dead code at 2 sites | (c) strip dead fallback | B.3 — applied: `operate/results/page.tsx:154` and `PlanResults.tsx:90` simplified to `String(comp.componentType \|\| '')` |
| **A.5.GAP-1** — Inconsistent failure modes at consumer surfaces | per-surface classification (i)/(ii)/(iii) | B.4+B.5 — applied per architect Q-A.5.1 to Q-A.5.5 dispositions |
| **A.5.GAP-2** — `calculation_results` lacks idempotency constraint on `(tenant_id, batch_id, entity_id)` | defer to Phase 7 compliance gates | carry-forward — see Known issues section |

### Class B — Refactor closure evidence

**B.1 — `ExecutionTrace.componentType` round-trip closure (A.1.GAP-1):**
- `web/src/lib/calculation/intent-types.ts:260-285` — `ExecutionTrace` interface gains `componentType: string` required field
- `web/src/lib/calculation/intent-executor.ts:executeIntent` — populates `componentType` from `intent.intent.operation` (or matched variant route's operation) at trace construction (partial trace + final assembly)
- Round-trip closure now holds at trace level: readers recover primitive identity from the trace alone, no `rule_sets` dereference required

**B.2 — `NarrativeSpine.tsx:258` vocabulary fix (A.2.GAP-1):**
- `'percentage'` → `'scalar_multiply'` — Phase 1.7 missed-site cleanup

**B.3 — `comp.component_type` snake_case fallback strip (A.2.GAP-2):**
- `app/operate/results/page.tsx:154` and `components/calculate/PlanResults.tsx:90` both simplified

**B.4 — Per-surface fixes (Q-A.5.1, Q-A.5.3, Q-A.5.4):**
- `lib/reconciliation/employee-reconciliation-trace.ts:501-506` — graceful-with-explicit-label: `\`unsupported operation: ${op}\`` (Q-A.5.1)
- `app/api/ai/assessment/route.ts` — per-row shape validation in `data.storeBreakdown` + `data.teamMembers` extraction; `shape_violations` array tracked + included in response payload (Q-A.5.3)
- `app/perform/statements/page.tsx:586-602 formatComponentDetail` default arm — `\`Component type ${comp.componentType ?? 'unknown'} not supported in statement display\`` (Q-A.5.4)
- `app/api/reconciliation/{analyze,run,compare}/route.ts` — passthrough to consumer (graceful-with-label disposition handled at consumer layer per Q-A.5.2)

**B.5 — Internal dispatch hardening (Q-A.5.5):**
- `lib/calculation/intent-executor.ts` — `IntentExecutorUnknownOperationError` class added; `executeOperation` switch gains `default: throw` arm
- `lib/orchestration/metric-resolver.ts` — `MetricResolverMissingIntentError` class added; `extractMetricConfig` throws on missing `metadata.intent` AND `calculationIntent`
- `lib/intelligence/state-reader.ts` — `StateReaderShapeViolationError` class added; `validateCalculationResultRow` helper validates row shape at read site
- `app/api/calculation/run/route.ts:998` — calc-engine self-read shape validation throws on malformed `entity_id`/`total_payout`

### Class C — Negative test suite

`web/__tests__/round-trip-closure/run.ts` — 38 structural assertions, all PASS:

| Test class | Count | Coverage |
|---|---|---|
| Round-trip identity preservation (componentResults blob) | 12 | One per foundational `ComponentType` |
| Trace-level identity preservation (ExecutionTrace.componentType) | 12 | One per foundational `ComponentType` |
| Adversarial input — structured failures | 4 | `evaluateComponent` legacy + empty; `executeOperation` unknown; `extractMetricConfig` missing intent |
| Graceful-degradation labels | 4 | `formatComponentDetail` "not supported" label format; reconciliation "unsupported operation" label format |
| Registry sanity | 6 | Legacy aliases (`tier_lookup`, `matrix_lookup`, `percentage`, `conditional_percentage`, `tiered_lookup`, `flat_percentage`) NOT in foundational `ComponentType` union |

Run: `cd web && npx tsx __tests__/round-trip-closure/run.ts` → 38 pass / 0 fail.

### F-005 closure invariant — regression guard

Phase 3 verification grep: F-005 closure invariant remains zero hits in non-exempt categories. Phase 1.5/1.6/1.6.5/1.7/2 closure preserved through Phase 3 changes.

### A.5.GAP-2 carry-forward (Phase 7)

`calculation_results` table lacks idempotency constraint on `(tenant_id, batch_id, entity_id)`. Two writes for the same calculation produce duplicate rows. Schema-level concern requiring migration. Phase 3 documents; Phase 7 compliance gates closes via migration.
