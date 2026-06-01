# VP SESSION HANDOFF — 2026-05-19

**Session window:** 2026-05-18/19, approximately 20+ hours of continuous work across two calendar days.
**Primary outcome:** DIAG-050 closed (binding attrition/persistence-time narrowing). CRP Plans 1+3 PASS-RECONCILED ($364,457.84 exact). HF-237 regression identified — prompt-layer registry extension shipped to production when the session had already established the prime-level DAG architecture as the correct approach. Prime-level engine specification drafted.
**Reader orientation:** Read Section -1, then Section 0, then Section 19. Section 20 carries the forward path. This handoff is dense — the session spanned substrate amendments, three IRA invocations, four VP PRs, a full pipeline audit, two diagnostic cycles, and a design conversation that produced the prime-level DAG engine specification.

---

## SECTION -1 — CRITICAL PATH TO OBJECTIVE

### -1.1 What we are building

vialuce is a B2B Incentive Compensation Management (ICM) and Sales Performance Management (SPM) platform built on a multi-agent AI architecture. The platform reads plan documents, comprehends compensation structures through AI, ingests sales data through the Synaptic Content Ingestion (SCI) pipeline, and calculates commissions automatically — with every calculation auditable and explainable. The governing tagline is "Intelligence. Acceleration. Performance."

### -1.2 Why it matters

Complex compensation rules are centralized and automated, reducing errors and eliminating reprocessing. Reps and managers get transparency into every transaction and can submit structured disputes. Native handling of clawbacks, reversals, corrections, and retroactive adjustments — fully tracked and recalculated automatically. The platform replaces spreadsheet-driven commission calculation with an AI-native engine that comprehends plan intent rather than being manually programmed.

### -1.3 Current commercial gate / next user-facing milestone

**User-Ready** (per `VIALUCE_USER_READY_EXIT_CRITERIA_R1.md`): first user runs end-to-end through browser against production substrate. Three proof tenants (BCL, Meridian, CRP) must reconcile to the penny. BCL and Meridian were previously PASS-RECONCILED but require re-verification against the post-HF-236 production codebase. CRP is the third and most complex proof tenant — 4 plans, 32 entities, $561,317.05 pre-clawback GT.

### -1.4 Binding constraint

**The calculation engine's convenience-primitive architecture blocks Plan 4 and limits future plan structures.** The engine dispatches through an 11-case registry of named convenience types (`linear_function`, `piecewise_linear`, `conditional_gate`, `scalar_multiply`, etc.). Plan structures not matching an existing type require new engine code. HF-237 (merged to production) extended this registry at the prompt layer by adding `scope_aggregate` as another enumerated source type — the same registry/cherry-pick pattern closed at the SCI layer by DIAG-050.

The correct architecture was identified in this session: five irreducible primes (arithmetic, aggregation, filter, conditional, scope) composing as a DAG. The engine walks the DAG. Any compensation structure composes without new engine code. This is the binding constraint: until the prime-level DAG engine ships, Plan 4 produces $0 and every novel plan structure requires a new HF.

### -1.5 Frame of reference for next session

Every action filters through: "Does this advance the prime-level DAG engine, or is it local optimization?" CRP Plan 4 reconciliation depends on the DAG engine. CRP Plan 2's delta investigation is secondary — it may close as a side effect of the DAG refactor. BCL and Meridian re-verification is independent and can proceed in parallel. Substrate Wave 2 (A5 T2-E09, A6 T2-E30) is deferred until the engine architecture settles — substrate amendments should reflect the correct architecture, not the convenience architecture.

---

## SECTION 0 — CRITICAL ORIENTATION FACTS

1. **DIAG-050 CLOSED.** Binding attrition / persistence-time narrowing eliminated. HF-236 (PR #416) merged to production. CRP Plans 1+3 exact-match reconciliation ($364,457.84). Plans 2+4 remain open with separate root causes.

2. **HF-237 REGRESSION.** PR #419 merged to production. Changed `anthropic-adapter.ts:617-668` to add `scope_aggregate` as an enumerated source type in the plan interpretation prompt. This extends the registry pattern at the prompt layer — the same defect class DIAG-050 closed at the SCI layer. Needs to be replaced by the prime-level DAG approach.

3. **Wave 1 substrate locked.** VG commit `e2fbcc4`. Five amendments: T1-E902 v2 (Carry Everything: persistence/round-trip/hints-not-gates), T1-E906 v2 (Closed-Loop Intelligence: read-before-derive), T1-E910 v2 (Korean Test: four identification classes), T2-E06 v2 (HC Override Authority: automated projection prohibition), IGF-T2-E47 (content_unit_hash_sha256 supersession identity primitive). Wave 2 (A5 T2-E09, A6 T2-E30) pending.

4. **Prime-level DAG engine specification drafted.** Five primes: arithmetic, aggregation, filter, conditional, scope. DAG composition replaces 11-case dispatch table. Specification at `/mnt/user-data/outputs/PRIME_DAG_ENGINE_SPECIFICATION_20260519.md`. Not yet dispatched to CC. Requires architect review and disposition before implementation.

5. **CRP reference GT is $561,317.05 pre-clawback** (per `CRP_Resultados_Esperados.xlsx`). Previous memory value of $566,728.97 was stale and corrected this session.

---

## SECTION 1 — SESSION GOALS AND OUTCOMES

The session opened as a continuation of DIAG-050 diagnostic work from the prior session. The initial goal was to close the CRP binding attrition defect (11 source columns → 5 persisted), apply substrate amendments, and advance CRP toward full reconciliation.

The session accomplished: DIAG-050 closure (HF-236, three code changes across the SCI pipeline), substrate Wave 1 lock (5 amendments via 3 IRA invocations at $4.13 total budget), CRP Plans 1+3 reconciliation ($364,457.84 exact across 6 periods + 2 months), a full pipeline audit (AUD-010, 1053 lines tracing convergence → intent → execution), two diagnostic cycles (DIAG-050 PR #415, DIAG-051 PR #418), and a design conversation that identified the prime-level DAG engine as the correct calculation architecture.

The session also produced a regression: HF-237 (PR #419) extended the prompt-layer source type registry instead of implementing the DAG approach. This was recognized in-session after the merge when Plan 4 still produced $0. The architect correctly identified the drift — the session had already established the architectural principle but the implementation diverged from it.

---

## SECTION 2 — REPO STATE AT SESSION CLOSE

### VP (`CCAFRICA/spm-platform`)

**Branch:** `main`
**HEAD:** post-PR #419 merge (HF-237)
**Production:** Vercel deployment includes all four PRs (#416, #417, #418, #419)

### VG (`vialuce/vialuce-governance`)

**Branch:** `main`
**HEAD:** commit `e2fbcc4` (Wave 1 substrate migration) + completion reports
**Substrate state:** 5 entries amended/created this session (T1-E902 v2, T1-E906 v2, T1-E910 v2, T2-E06 v2, IGF-T2-E47)

---

## SECTION 3 — PR TIMELINE

| PR | Title | Base | Status | Scope |
|---|---|---|---|---|
| #416 | HF-236: DIAG-050 closure — persistence-time narrowing prohibition | main | **Merged** | Layer 1 (roleMap eliminated) + Layer 3 (filterFieldsForPartialClaim row_data passthrough) + CRP flywheel cache invalidation |
| #417 | AUD-010: Full pipeline trace (convergence → intent → execution) | main | **Merged** | 1053-line read-only audit. Five stages traced with verbatim code paste at production HEAD |
| #418 | DIAG-051: CRP Plan 2 + Plan 4 failure surface diagnostic | main | **Merged** | Six probes. Plan 2 filter confirmed applied. Plan 4 three compounding defects identified (D1/D2/D3) |
| #419 | HF-237: Plan interpretation prompt fix for scope_aggregate | main | **Merged (REGRESSION)** | Added `scope_aggregate` as enumerated source type in prompt. Extends registry instead of removing it. |

### VG Commits

| Hash | Scope |
|---|---|
| `1b37c61` | Substrate amendment proposal: consolidated A1-A7 |
| `ff0f6c9` | IRA invocation: Substrate Wave 1 coherence review (brief_only, $1.28) |
| `e2fbcc4` | Substrate Wave 1 locked: T1-E902 v2, T1-E906 v2, T1-E910 v2, T2-E06 v2, IGF-T2-E47 |
| `d79d5c3` | Completion reports for IRA invocations |

---

## SECTION 4 — DIAG-050 CLOSURE (MAIN WORK SURFACE)

### 4.1 Root cause (established prior session, verified this session)

Three-layer binding attrition in the SCI pipeline:
- **Layer 1:** `analyze/route.ts:174-182` hardcoded 8-entry `roleMap` — semanticRoles outside the registry fell to `columnRole: 'unknown'`. Korean Test violation.
- **Layer 2:** `analyzeSplit` sensitivity to columnRole degradation — incorrect PARTIAL classification on flywheel replay.
- **Layer 3:** `filterFieldsForPartialClaim` in `execute-bulk/route.ts:265-293` and `execute/route.ts:405-425` — projected both rows AND bindings to the agent's owned+shared subset. Carry Everything violation.

### 4.2 Fix (HF-236, PR #416)

- **Phase 1 (Layer 3):** `filterFieldsForPartialClaim` modified in both call sites. `rows` / `rawData` pass through unchanged. Only `confirmedBindings` narrow to owned+shared fields.
- **Phase 2 (Layer 1):** `roleMap` registry eliminated. `insufficientFlywheelCache` gate introduced — cached bindings lacking native `columnRole` trigger fresh-LLM re-emission. Flywheel write path enriched to cache native `columnRole` + `identifiesWhat`.
- **Phase 3:** CRP `structural_fingerprints` cache cleared (3 rows including poisoned 5-binding transaction cache).
- **Layer 2:** Closes structurally. With Layer 1 closed, flywheel-replay produces identical HC inputs as fresh-LLM, eliminating the Adjacent-Arm Drift.

### 4.3 Reconciliation result

CRP Plans 1+3: **$364,457.84 exact** across 6 periods (4 biweekly CE + 2 monthly XS). All 11 source columns present in `sampleRowKeys`. Pass 4 categorical filters firing correctly.

---

## SECTION 5 — SUBSTRATE WAVE 1

### 5.1 IRA invocations (3 total, $4.13 budget)

| Invocation | Hash | Cost | Verdict |
|---|---|---|---|
| DIAG-050 architectural disposition | `06513d0` | $1.58 | Option 6 (combined Layer 1 + Layer 3 closure) rank 1 |
| Substrate Wave 1 coherence review | `ff0f6c9` | $1.28 | All 5 amendments → extend, zero Korean Test violations |
| (Prior session DIAG-050 dispatch) | — | $1.28 | Captured in prior session |

### 5.2 Amendments locked

| ID | Entry | Version | Summary |
|---|---|---|---|
| A1 | T1-E910 | v1→v2 | Korean Test: four identification classes (field, operation, primitive, dispatch-surface) |
| A2 | T1-E902 | v1→v2 | Carry Everything: three operative scopes (persistence, round-trip closure, hints-not-gates) |
| A3 | T1-E906 | v1→v2 | Closed-Loop Intelligence: read-before-derive obligation |
| A4 | T2-E06 | v1→v2 | HC Override Authority: automated claim-type projection prohibition |
| A7 | IGF-T2-E47 | v1 (new) | content_unit_hash_sha256 supersession identity primitive |

### 5.3 Wave 2 pending

A5 (T2-E09 consolidated extension) and A6 (T2-E30 extension), both citing IGF-T2-E47. Deferred until engine architecture settles — the extensions should reflect the prime-level architecture, not the convenience architecture.

---

## SECTION 6 — CRP RECONCILIATION STATE

| Plan | Jan | Feb | Reference | Engine | Status |
|---|---|---|---|---|---|
| 1 Capital Equipment | 4 biweekly periods | — | $360,007.84 | $360,007.84 | **PASS** |
| 2 Consumables | monthly | monthly | $60,328.79 | $65,740.71 | **DELTA** (+$5,411.92) |
| 3 Cross-Sell Bonus | monthly | monthly | $4,450.00 | $4,450.00 | **PASS** |
| 4 District Override | monthly | monthly | $136,530.42 | $0.00 | **BLOCKED** (DAG engine) |
| **Total** | | | **$561,317.05** | **$430,198.55** | **3 plans open** |

### Plan 2 delta analysis

Filter is applied correctly. Derivation is correct. Quota values in committed_data match reference ($25K Senior Rep / $18K Rep). Piecewise segment boundary anomaly identified: executor ignores `maxInclusive` flag, creating narrow gaps (0.0001 width) between tiers. Unlikely to account for full $3,244.03 delta. Per-entity reconciliation needed to localize.

### Plan 4 failure chain (traced through AUD-010 + DIAG-051)

1. Pass 5 comprehends `equipment_revenue (scope: district)` but cannot express scope in derivation schema → returns gap
2. Cross-plan resolution finds 2 derivations from Plan 2 — no `equipment_revenue` match
3. Resolution falls to sheet-matching fallback → metrics = {} → $0
4. Scope aggregation machinery at `route.ts:2345-2397` exists and works but is unreachable without a scoped derivation

---

## SECTION 7 — HF-237 REGRESSION ANALYSIS

### 7.1 What happened

The session conversation established three architectural principles:

1. The LLM should emit compositions of primes, not pick from an enumerated source type list
2. The engine should walk a DAG of prime nodes, not dispatch through a convenience-type registry
3. The 11-case dispatch table becomes 5, permanently

Then HF-237 was drafted and dispatched. It added `scope_aggregate` as another entry in the prompt's source type list. The completion report confirmed: "replaced two aggregate-source examples with scope_aggregate-source examples, added 'WHEN TO USE' disambiguation block enumerating metric vs aggregate vs scope_aggregate."

This is the registry extension pattern — the same defect class that DIAG-050 closed at the SCI layer (Layer 1 roleMap). The architect identified the drift: "STEP BACK — isnt it obvious that it would be at the prime level rather than convenience" and "I am concerned you drifted and regressed against an issue that was previously correctly identified."

### 7.2 What needs to happen

HF-237's prompt changes (`anthropic-adapter.ts:617-668`) need to be replaced — not extended — by the prime-level approach:

- Remove the source type enumeration from the prompt
- Replace with five-primes composition instruction
- The LLM describes compensation structures as DAG compositions
- `convertComponent` parses DAGs, not named types
- The executor walks DAGs, not dispatch tables
- Derivation rules become DAG fragments, not flat records

The specification is drafted: `PRIME_DAG_ENGINE_SPECIFICATION_20260519.md`. It includes backward compatibility bridges so existing stored intents (BCL, Meridian, CRP Plans 1/2/3) evaluate correctly through the transition.

### 7.3 Impact of regression on production

HF-237's prompt change is in production but has limited blast radius:

- Existing plans (all three tenants) were interpreted BEFORE HF-237 and carry pre-HF-237 intents. They are not affected.
- Only NEW plan imports through the HF-237 prompt will emit `scope_aggregate` as a source type. CRP's District Override Plan was re-imported and DOES carry the HF-237 shape — but it still produces $0 because the downstream derivation and scope aggregation chain is broken (D3).
- The DAG engine replacement will re-import all plans through the corrected prompt, overwriting the HF-237 intent shapes.

---

## SECTION 8 — PRIME-LEVEL DAG ENGINE (ARCHITECTURAL CONCLUSION)

### 8.1 The five primes

| Prime | What it does | Example |
|---|---|---|
| Arithmetic | Scalar math on values | `revenue × 0.06 + 200` |
| Aggregation | Reduce rows to a value | `sum(total_amount)` |
| Filter | Select which rows participate | `product_category = 'Capital Equipment'` |
| Conditional | Boolean branching | `if attainment ≥ 120% then 8% else 5%` |
| Scope | Change whose data | `district` (all entities in the DM's district) |

### 8.2 How they compose

Every CRP plan decomposes:

- **Plan 1:** filter → aggregate → arithmetic (3 primes)
- **Plan 2:** filter → aggregate + aggregate → arithmetic → conditional → arithmetic (4 primes)
- **Plan 3:** filter → aggregate → conditional → filter → aggregate → arithmetic (3 primes)
- **Plan 4:** scope → filter → aggregate → arithmetic (4 primes)

### 8.3 What changes in the engine

- `intent-types.ts`: `PrimeNode` union type (7 node types) replaces `IntentSource` (8 types) and named ops
- `intent-executor.ts`: ~50-line recursive `evaluate()` replaces 11-case `executeOperation` + 8-case `resolveSource`
- `anthropic-adapter.ts`: five-primes composition instruction replaces source type registry
- `ai-plan-interpreter.ts`: `convertComponent` parses DAG, validates primes, structured failure on unrecognized
- `convergence-service.ts`: derivation rules become DAG fragments (scope is a node, not a field)
- `route.ts`: `applyMetricDerivations` calls DAG evaluator. Scope aggregation pre-computation absorbed into DAG walker.

### 8.4 Backward compatibility

Legacy stored intents translate to equivalent DAGs at read time. `linear_function` → `arithmetic(add, arithmetic(multiply, reference, constant), constant)`. Plans re-imported through the new prompt produce DAGs natively. No migration script needed.

Full specification: `PRIME_DAG_ENGINE_SPECIFICATION_20260519.md`

---

## SECTION 9 — AUD-010 PIPELINE TRACE FINDINGS

Five-stage read-only audit at HEAD `9c5147e4` (PR #417, 1053 lines):

1. **Convergence:** 5 passes. Filters produced exclusively in Pass 5. HF-222 distribution-distinct fallback at `convergence-service.ts:2360-2391` produces spurious `actual → unit_price` binding (proven harmless — executor reads by metric name).
2. **Intent transformation:** `transformFromMetadata` dispatches all primitives. No standalone `ScopeAggregateOp` interface — `scope_aggregate` is `IntentSource` only.
3. **Data resolution:** `usedConvergenceBindings` fork at `route.ts:1817`. Sheet-matching fallback retired (HF-220 R1). Scope aggregation at `route.ts:2345-2397` structurally sound.
4. **Primitive execution:** 11 dispatch cases. `resolveSource` handles 8 source types including `scope_aggregate`. `executePiecewiseLinear` carries OB-186 `targetValue` fallback.
5. **CRP traces:** Plan 2 delta consistent with piecewise evaluation issue. Plan 4 three failure surfaces identified.

---

## SECTION 10 — DEFECT CLASSES

### 10.1 Registry/cherry-pick at prompt layer (NEW instance of T1-E952 pattern)

HF-237's source type enumeration in the plan interpretation prompt. Same structural class as DIAG-050's Layer 1 roleMap and AUD-009's 19 pipeline functions. Closed by the prime-level DAG engine.

### 10.2 Convenience-primitive architecture (NEW class)

The engine's 11-case dispatch table of pre-composed convenience types. Every new plan pattern requires new engine code. The prime-level DAG engine closes this class permanently.

### 10.3 Procedural theater (recurring, this session)

Claude produced excessive governance scaffolding multiple times. Architect corrected: "TOO MUCH PROCEDURAL THEATER", "SOP VIOLATION - WHY DID WE EVEN SEND IT TO IRA ANYWAY", "ALL OF THE ITEMS THAT HAVE BEEN IDENTIFIED WERE CREATED BASED UPON MY DIRECTION." Self-correction: reduce governance ceremony, increase substance per word.

### 10.4 Schema-blind directive authoring (instance)

VG Wave 1 migration SQL targeted columns that don't exist (`content` on `entries`, `version` instead of `current_version`, etc.). CC halted correctly. Root cause: Claude drafted SQL from memory instead of reading `VG_SCHEMA_REFERENCE_LIVE.md` or querying `information_schema`.

---

## SECTION 11 — OPEN ITEMS CARRIED FORWARD

| Item | Type | Dependency | Priority |
|---|---|---|---|
| Prime-level DAG engine | HF (replaces HF-237 approach) | Architect dispositions spec | **BINDING** |
| CRP Plan 4 reconciliation | Reconciliation | DAG engine ships | Blocked |
| CRP Plan 2 per-entity delta investigation | Diagnostic | Independent | Medium |
| BCL + Meridian re-verification | Reconciliation | Independent | High |
| Substrate Wave 2 (A5 T2-E09, A6 T2-E30) | VG migration | DAG engine settles | Deferred |
| Piecewise segment boundary maxInclusive defect | HF candidate | Independent | Low |
| Plan 1/3/4 zero persistent metric_derivations | Investigation | May close with DAG engine | Medium |
| 21 uncommitted IRA prompt/response artifacts in VG | DD-12 debt | Independent | Low |
| BCL R3 fix shape | HF candidate | Architect disposition | Deferred |

---

## SECTION 12 — OPERATIONAL TOOLING

### IRA invocations

CC-executed per architect override of `IRA_CLI_Operating_Instructions.md` §1 (established precedent `06513d0`). Runner: `npm run ira -- "$QUESTION"`. Prompt at `prompts/`, response at `docs/IRA-responses/`. Atomic commit pair per DD-12.

### VG migrations

Schema: `igf.entries` (metadata only, no content column) + `igf.entry_versions` (content JSONB). Pattern: INSERT new `entry_versions` row at `version_number+1`, UPDATE `entries.current_version`. Runner: `npx tsx scripts/apply-migration.ts <file>`. NOT `psql` (not on PATH).

### VP CC directives

Include `CC_STANDING_ARCHITECTURE_RULES.md` at top. Completion report in `docs/completion-reports/` is MANDATORY per Rule 25 — bake into every directive as an explicit phase, not assumed. Branch protection requires PRs; direct push to main blocked.

---

## SECTION 18 — RISKS AND OPEN QUESTIONS

**R1:** The prime-level DAG engine is a significant refactor touching 6 files. Backward compatibility bridges must preserve BCL/Meridian/CRP Plans 1/3 exact reconciliation through the transition. Verification: re-calculate all three tenants post-merge and confirm no regression.

**R2:** Plan 2's $5,411.92 delta source is unknown. The filter, derivation, quota data, and merge order are all correct. The piecewise evaluation may compute differently under the DAG engine — the delta may close as a side effect of replacing `executePiecewiseLinear` with nested conditional + arithmetic primes, or it may require separate investigation.

**R3:** HF-237's prompt changes are live in production. Any new plan imported between now and the DAG engine shipping will carry HF-237's `scope_aggregate` source type shape. The backward compatibility bridge handles this, but the window should be minimized.

**Q1:** Should the DAG engine ship as a single vertical-slice HF, or phased (DAG evaluator first, then prompt, then derivation schema)? Single slice is cleaner but higher risk. Phased allows verification at each layer.

---

## SECTION 19 — NEXT SESSION START SCRIPT

### Turn 1 — Orientation confirmation

New-Conversation Claude reads Section -1 and confirms:

"The binding constraint is the convenience-primitive architecture in the calculation engine. HF-237 extended the registry instead of removing it. The prime-level DAG engine specification exists at `PRIME_DAG_ENGINE_SPECIFICATION_20260519.md`. The next action is architect disposition of the spec, then implementation as a single HF replacing the 11-case dispatch table with a 5-prime DAG walker. CRP Plan 4 reconciliation depends on this shipping. Plans 1+3 are PASS-RECONCILED and must not regress."

### Turn 2 — Path selection

Architect chooses:

**Path A (recommended):** Implement prime-level DAG engine. Single HF. Replace HF-237's prompt registry with five-primes composition. Replace executor dispatch with DAG walker. Backward compat bridges. Re-import CRP plans. Reconcile all four.

**Path B:** BCL + Meridian re-verification in parallel. Independent of DAG engine. Re-calculate all periods, confirm exact match against reference GTs.

**Path C:** Plan 2 per-entity delta investigation. Independent. Dump per-entity metric values and compare against reference spreadsheet line by line.

Paths B and C can run in parallel with Path A if CC capacity allows.

---

## SECTION 20 — FORWARD PATH DETAIL

### Path A — Prime-level DAG engine (binding constraint)

**Specification:** `PRIME_DAG_ENGINE_SPECIFICATION_20260519.md` (11 sections, code-justified)

**Implementation phases:**
1. Define `PrimeNode` type in `intent-types.ts`
2. Implement `evaluate()` DAG walker in `intent-executor.ts` (~50 lines)
3. Replace prompt source type registry with five-primes composition in `anthropic-adapter.ts`
4. Update `convertComponent` to parse DAG output from LLM
5. Convert derivation rules to DAG fragments in `convergence-service.ts`
6. Wire `applyMetricDerivations` to call DAG evaluator
7. Add backward compat bridges for legacy stored intents/derivations
8. Re-import all CRP plans through updated prompt
9. Reconcile CRP Plans 1-4 against reference
10. Re-verify BCL + Meridian (non-regression)

**Estimated touch points:** 6 files. Net code reduction (more deleted than added).

### Path B — BCL + Meridian re-verification

Re-calculate all periods for all plans on production. Compare against reference GTs ($312,033 BCL, MX$185,063 Meridian). No code changes — just verification that HF-236's pipeline modifications didn't regress existing tenants.

### Path C — Plan 2 per-entity investigation

Dump each CRP entity's resolved `consumable_revenue` and `monthly_quota` values from the engine's metric resolution step. Compare line-by-line against the reference spreadsheet's per-entity calculations. The delta source ($3,244.03 January, $2,167.89 February) will localize to specific entities and specific metric values.

---

## VOCABULARY APPENDIX

| Term | Definition |
|---|---|
| Prime | One of five irreducible calculation operations: arithmetic, aggregation, filter, conditional, scope |
| DAG | Directed acyclic graph of prime nodes composing a compensation calculation |
| Convenience type | Pre-composed named operation (LinearFunctionOp, PiecewiseLinearOp, etc.) in the current engine — being replaced by prime compositions |
| Registry | Enumerated list of recognized types that silently discards anything not on the list |
| Derivation rule | Specification of how to compute a metric value from committed_data rows. Currently a flat record; becoming a DAG fragment. |
| Scope | Whose data drives the calculation. Entity-level (default) or group-level (district, region) |
| Pass 5 | `generateAISemanticDerivations` in convergence-service.ts — where the AI produces filtered derivation rules |
| D1/D2/D3 | Three compounding defects in Plan 4 identified by DIAG-051. D1: wrong source type. D2: non-canonical sourceSpec keys. D3: zero persisted metric_derivations for Plans 1/3/4. |
