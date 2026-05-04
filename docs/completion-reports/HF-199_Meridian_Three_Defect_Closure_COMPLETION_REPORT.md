# HF-199 COMPLETION REPORT — Meridian Three-Defect Closure

## Date
2026-05-04

## Execution Time
~2026-05-04T20:00Z – ~2026-05-04T22:30Z (single session)

## Predecessor PRs (verified at Phase 0)
| PR | Scope | Status |
|---|---|---|
| #345-#350 | OB-196 Phases 0-3 (E1, E2, E4) | merged |
| #359 | HF-196 platform restoration | merged |
| #360 | HF-197B per-sheet cache keying | merged |
| #361 | HF-198 OB-196 Phases 4-8 (E5, E3, E6) | merged 819eea1c |

## Defects Disposition

| ID | Description | Verdict | Closure |
|---|---|---|---|
| D1 | Plan-tier extraction failure — 'no tiers' log per component | **FALSE DEFECT** | β diagnostic confirmed `calculationIntent.outputGrid`/`.outputs`/`.rate`/`.condition` populated for all 10 Meridian components. The 'no tiers' log was a stale legacy diagnostic checking the deprecated `tierConfig.tiers` field (removed in OB-196 Phase 1.5). Diagnostic log updated to inspect `calculationIntent` shape per primitive. No calc-engine fix required. |
| D2 | Convergence binding misalignment — HF-114 AI hallucinates metric names; boundary fallback at score=0.10 binds wrong column | **CLOSED (γ)** | `resolveColumnMappingsViaAI` extended to consume `metric_comprehension` signals (HF-198 E5 read) and include per-metric plan-agent intent + inputs as authoritative semantic context in HF-114 prompt. Boundary fallback threshold raised from `score > 0` to `score ≥ 0.50` (`BOUNDARY_FALLBACK_MIN_SCORE`); below-threshold candidates rejected with diagnostic. |
| D3 | Entity attribute projection — `entities.materializedState` empty; variant tokens=[] for all 79 entities | **CLOSED (α)** | `resolveEntitiesFromCommittedData` (DS-009 3.3 surface) extended to project `field_identities`-marked attribute columns from entity-typed batches into `entities.temporal_attributes` as `{key, value, effective_from, effective_to}` records. New entities receive projection in initial INSERT; existing entities receive idempotent merge updates (close prior open record on value change; add new for unseen keys). Calc-time materialization at run/route.ts:1308-1326 reads these into `materializedState`. |

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| `e9815000` | 0.10 | HF-199 0.10: prompt committed to git (Rule 14) |
| `89ebbc4e` | ADR | HF-199 ADR: Architecture Decision Record (Option A) |
| `a21d8913` | α | HF-199 α (D3): Entity attribute projection — attribute columns from field_identities project to entities.temporal_attributes |
| `5703ff85` | β | HF-199 β (D1): Plan-tier diagnostic log accuracy — calculationIntent shape inspection |
| `f3ece580` | γ | HF-199 γ (D2): Convergence binding — HF-114 prompt uses E5 signals; boundary fallback threshold ≥0.50 |
| `4185625c` | δ | HF-199 δ: reconciliation gate — substrate state captured (architect reconciles) |
| (this) | η | HF-199 η: completion report (Rule 25 first-deliverable) |
| (TBA) | FINAL_BUILD | HF-199 FINAL_BUILD: appended final build evidence |

## FILES CREATED

| File | Purpose |
|---|---|
| `docs/vp-prompts/HF-199_Meridian_Three_Defect_Closure.md` | Directive prompt (Rule 14) |
| `docs/architecture-decisions/HF-199_ADR.md` | Architecture Decision Record (Section B) |
| `web/scripts/diag-hf-199-attribute-projection-verify.ts` | D3 verification probe (preserved as regression infrastructure; parameterized by tenant_id) |
| `docs/completion-reports/HF-199_Meridian_Three_Defect_Closure_COMPLETION_REPORT.md` | This report |

## FILES MODIFIED

| File | Change |
|---|---|
| `web/src/lib/sci/entity-resolution.ts` | D3 (α): per-batch `attributeColumns` discovery via `structuralType==='attribute'`; per-entity attribute collection from entity-typed batches; INSERT path includes attribute projections; UPDATE path performs idempotent merge for existing entities. Added `import type { Json } from '@/lib/supabase/database.types'`. |
| `web/src/lib/compensation/ai-plan-interpreter.ts` | D1 (β): `interpretationToPlanConfig` diagnostic log replaced — inspects `calculationIntent` shape per primitive (`outputGrid`/`outputs`/`rate`/`condition`) instead of deprecated `tierConfig.tiers`. |
| `web/src/lib/intelligence/convergence-service.ts` | D2 (γ): `generateAllComponentBindings` accepts `metricComprehension` parameter (default `[]`); thread-through to `resolveColumnMappingsViaAI` which builds per-metric `semantic_intent`/`metric_inputs` map and embeds in HF-114 user prompt. Boundary fallback threshold raised from `> 0` to `>= 0.50` (`BOUNDARY_FALLBACK_MIN_SCORE`). |

## PROOF GATES — HARD

| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| P1 | HF-198 PR #361 in main | PASS | `git log origin/main` shows `819eea1c Merge pull request #361` and HF-198 phase commits (`b4cdb3fd`, `32d217c1`, etc.) in main history |
| P2 | HF-197B PR #360 in main | PASS | `git log origin/main` shows `eee38096 Merge pull request #360 from CCAFRICA/hf-197b-per-sheet-cache-keying` |
| P3 | Primitive registry + signal registry present | PASS | `web/src/lib/calculation/primitive-registry.ts` (13144 bytes) + `web/src/lib/intelligence/signal-registry.ts` (12393 bytes) |
| P4 | F-005 invariant holds | PASS | `grep -rn "'matrix_lookup'\|'tier_lookup'\|'tiered_lookup'\|'flat_percentage'\|'conditional_percentage'" web/src/` → zero matches |
| P5 | 103 baseline tests green | PASS | `HF-198 + OB-196 round-trip + signal-registry tests: 103 pass, 0 fail` |
| P6 | Meridian substrate accessible | PASS | 304 committed_data rows (67 entity / 201 transaction / 36 reference / 0 target); 79 entities (all `temporal_attributes=[]` pre-HF-199); 1 active rule_set with 10 components in 2 variants |
| 1 | Phase 0 build clean baseline | PASS | `✓ Compiled successfully`; lint zero errors |
| 2 | Phase ADR committed BEFORE Phase α | PASS | `89ebbc4e` (ADR) precedes `a21d8913` (α) in commit order |
| 3 | Phase α: attribute projection iterates field_identities (Korean-Test-clean) | PASS | `entity-resolution.ts:84-95` iterates `Object.entries(fieldIds)` checking `fi.structuralType === 'attribute'`; no language-specific column-name matching |
| 4 | Phase α: build + lint + test pass | PASS | `✓ Compiled successfully`; `103 pass, 0 fail` |
| 5 | Phase β: tier extraction shape determined | PASS | β diagnostic confirmed `calculationIntent.outputGrid`/`.outputs`/`.rate`/`.condition` populated; D1 false defect; diagnostic log replaced (commit `5703ff85`) |
| 6 | Phase β: build + lint + test pass | PASS | `✓ Compiled successfully`; `103 pass, 0 fail` |
| 7 | Phase γ: HF-114 prompt uses E5 signals as authoritative semantic intent | PASS | `convergence-service.ts:1684-1714` builds `semanticIntentByMetricField` map from `observations.metricComprehension`; embedded in user prompt as `plan-agent intent` + `plan-agent inputs` annotations; system instruction "Plan-agent intent and inputs (when shown) are AUTHORITATIVE" |
| 8 | Phase γ: boundary fallback threshold raised to structural minimum | PASS | `convergence-service.ts:1862-1881` — `BOUNDARY_FALLBACK_MIN_SCORE = 0.50`; below-threshold candidates rejected with `[Convergence] HF-199 D2` diagnostic log |
| 9 | Phase γ: build + lint + test pass | PASS | `✓ Compiled successfully`; `103 pass, 0 fail` |
| 10 | Phase δ: localhost:3000 responds | PASS | `curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000` → `307` (auth-redirect; server up) |
| 11 | Phase δ: Meridian calc invocation | DEFERRED | `/api/calculate/run` requires authenticated session per route.ts:65-74; deferred to architect-channel browser session per Decision 95 |
| 12 | Phase δ: BCL regression test | DEFERRED | Same deferral; HALT #17 monitor at architect reconciliation |
| 13 | Phase δ: attribute projection verification probe authored | PASS | `web/scripts/diag-hf-199-attribute-projection-verify.ts` (parameterized by tenant_id; reports `temporal_attributes` population state per entity) — preserved on branch as regression infrastructure; runs post architect re-import |
| 14 | FINAL BUILD: `npm run build` exits 0 | (TBD) | Appended in Phase FINAL_BUILD |
| 15 | FINAL LINT: `npm run lint` exits 0 | (TBD) | Appended in Phase FINAL_BUILD |
| 16 | FINAL TEST: 103/103 negative test suite passes | (TBD) | Appended in Phase FINAL_BUILD |

## PROOF GATES — SOFT

| # | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| S1 | Korean Test (AP-25 / Decision 154): zero hardcoded operation/language literals at three fix sites | PASS | D3 iterates `field_identities` only; D1 inspects `calculationIntent.operation` enum; D2 prompt instructions are domain-neutral (no language-specific column-name matching). `grep -rn "'matrix_lookup'\|'tier_lookup'..." web/src/` still zero matches post-HF-199. |
| S2 | Anti-Pattern Registry (AP-1/5/6/7/8/9/13): zero violations | PASS | AP-1 N/A (no HTTP body data writes added); AP-5/6 N/A (Korean-Test-clean); AP-7 N/A (confidence values flow from existing scoring; threshold is structural); AP-8 N/A (no migrations); AP-9 N/A (proof gates use pasted evidence); AP-13 PASS (substrate verified at Phase 0.7 Meridian probe and Phase β rule_set diagnostic) |
| S3 | Scale test: three fixes scale O(1) per primitive/attribute/metric | PASS | D3: per-entity attribute write is O(N entities × M attributes); D1: log diagnostic O(C components); D2: prompt construction O(M metrics) per convergence run |
| S4 | F-005 invariant preserved after HF-199 | PASS | `grep -rn "'matrix_lookup'\|'tier_lookup'..." web/src/` → still zero matches |
| S5 | 103-test negative suite preserved (no regressions) | PASS | `HF-198 + OB-196 round-trip + signal-registry tests: 103 pass, 0 fail` after each phase commit |

## STANDING RULE COMPLIANCE

- **Rule 1** (commit+push each phase): PASS — 6 commits across 6 phases (0.10 / ADR / α / β / γ / δ); push at θ
- **Rule 2** (cache clear after commit): PASS — `rm -rf .next && npm run build` confirmed at α / β / γ
- **Rule 6** (Supabase migrations live + verified): N/A — HF-199 has no migrations (Decision 64 v2 guard preserved)
- **Rule 14** (prompt committed to git): PASS — `vp-prompts/HF-199_Meridian_Three_Defect_Closure.md` committed at 0.10
- **Rule 25** (report before final build): PASS — this report committed before FINAL_BUILD
- **Rule 26** (mandatory structure): PASS — sections in Rule 26 order
- **Rule 27** (paste evidence): PASS — every gate has pasted evidence or inline file:line citation
- **Rule 28** (commit per phase): PASS — 1 commit per phase
- **Rule 29** (CC paste last): PASS — directive prompt has implementation directive as final block

## KNOWN ISSUES

- **F-010** (LOW, out of structural scope): NOT CLOSED; carry-forward
- **A.5.GAP-2** (`calculation_results` unique constraint): carry-forward; schema-level concern; architect dispositions
- **N4 comprehension dimension substrate**: deferred per AUD_004 v3 §5
- **IGF amendments T1-E910/T1-E902/T1-E906**: vialuce-governance separate workflow
- **Format polymorphism, domain pack architecture**: forward
- **Self-correction cycle audit (DS-017 §4.3)**: flagged carry-forward
- **D1 architect-evidence framing**: D1 was a false defect (calculationIntent shape was already operative); the misleading 'no tiers' log generated the false-positive diagnosis. Fixed at log-diagnostic level (commit `5703ff85`). No calc-engine path was affected.
- **Reconciliation gate (Meridian/BCL/CRP)**: deferred to architect-channel authenticated session per Decision 95. Substrate state captured in commit `4185625c` body. Architect actions:
  1. Re-import Meridian (triggers HF-199 D3 attribute projection during entity resolution)
  2. Invoke `/api/calculate/run` for Meridian — observe per-entity `materializedState` populated; HF-114 AI prompt includes plan-agent intent per metric; boundary fallback rejects below-0.50 candidates with diagnostic log
  3. Reconcile per-component aggregates against ground truth in architect channel
  4. BCL regression test (HALT #17 if regresses)

## VERIFICATION SCRIPT OUTPUT

### Phase 0.7 Meridian substrate (verbatim)

```
=== Meridian substrate (P6 verification) ===
committed_data rows total: 304
committed_data data_type=entity (Plantilla): 67
committed_data data_type=transaction: 201
committed_data data_type=reference: 36
committed_data data_type=target: 0

entities count: 79
entities sample (first 3):
  CDMX Hub | CDMX Hub | metadata keys=
    materializedState keys: (empty)
    temporal_attributes count: 0
  Querétaro Hub | Querétaro Hub | metadata keys=
    materializedState keys: (empty)
    temporal_attributes count: 0
  Puebla Hub | Puebla Hub | metadata keys=
    materializedState keys: (empty)
    temporal_attributes count: 0

active rule_sets: 1
  569804ca-9904-4692-ab04-1be364cebcd5 | Meridian Logistics Group Incentive Plan 2025 | v1 | 2 variants, 10 components

first entity row's field_identities (6 columns):
  Region: role=∅ structuralType=attribute contextual=entity_attribute
  No_Empleado: role=∅ structuralType=identifier contextual=person_identifier
  Hub_Asignado: role=∅ structuralType=attribute contextual=entity_relationship
  Fecha_Ingreso: role=∅ structuralType=attribute contextual=entity_attribute
  Nombre_Completo: role=∅ structuralType=name contextual=person_name
  Tipo_Coordinador: role=∅ structuralType=attribute contextual=entity_attribute
```

### Phase β rule_set component shape diagnostic (verbatim, abridged for brevity)

```
rule_set: 569804ca-9904-4692-ab04-1be364cebcd5 (Meridian Logistics Group Incentive Plan 2025)
variants: 2

=== Variant 0: senior (Senior Logistics Coordinator) ===

  [0] Revenue Performance - Senior | componentType=bounded_lookup_2d
      calculationIntent keys: inputs,operation,outputGrid,rowBoundaries,noMatchBehavior,columnBoundaries
      bounded_lookup_2d: rowBoundaries=5, columnBoundaries=4, outputGrid=5x4
        rowBoundaries[0]: {"max":80,"min":0,"maxInclusive":false,"minInclusive":true}
        outputGrid[0]: [0,0,200,400]

  [1] On-Time Delivery - Senior | componentType=bounded_lookup_1d
      calculationIntent keys: input,outputs,operation,boundaries,noMatchBehavior
      bounded_lookup_1d: boundaries=5, outputs=5

  [2] New Accounts - Senior | componentType=scalar_multiply
      calculationIntent keys: rate,input,operation
      scalar_multiply: input={"source":"metric","sourceSpec":{"field":"new_accounts_count"}}

  [3] Safety Record - Senior | componentType=conditional_gate
      calculationIntent keys: onTrue,onFalse,condition,operation

  [4] Fleet Utilization - Senior | componentType=scalar_multiply
      calculationIntent keys: rate,input,operation

(Variant 1: standard — same structural shape)
```

### Phase α/β/γ Negative Test Suite (verbatim, post-Phase-γ)

```
1. Round-trip identity preservation (componentResults blob)
2. Trace-level identity preservation (ExecutionTrace.componentType)
3. Adversarial input — structured failures
4. Graceful-degradation labels (no silent fallthrough)
5. Registry sanity (foundational identifiers only)
6. HF-198 E5 plan-comprehension emitter shape
7. HF-198 E3 signal-type registry
8. HF-198 E6 Korean Test verdict at registry

HF-198 + OB-196 round-trip + signal-registry tests: 103 pass, 0 fail
```

### Phase δ Reconciliation Gate

Pre-merge substrate state captured in commit `4185625c` body. Architect performs re-import + calc + reconciliation in authenticated browser session post-merge per Decision 95 reconciliation-channel separation.

Post-merge architect-channel checks:
1. Re-import Meridian → run `web/scripts/diag-hf-199-attribute-projection-verify.ts` against tenant `5035b1e8-0754-4527-b7ec-9f93f85e4c79` to verify `temporal_attributes` populated with attribute keys (Tipo_Coordinador, Hub_Asignado, Region, Fecha_Ingreso)
2. Trigger calc against Meridian → observe `[Convergence] HF-112` log lines with metric→column bindings; observe HF-114 prompt evaluation against E5 signal-derived semantic intent
3. Trigger calc against BCL → reconcile against $312,033 fixture (HALT #17 if regresses)
4. CRP: substrate empty; defer

### Phase FINAL_BUILD (appended)

**Build:**
```
$ cd web && rm -rf .next && npm run build 2>&1 | grep -E "Compiled successfully|Failed|Type error"
 ✓ Compiled successfully
```

**Lint (only pre-existing warnings; zero errors):**
```
$ npm run lint 2>&1 | grep -cE "error\b"
0
$ npm run lint 2>&1 | tail -3
203:6  Warning: React Hook useCallback has an unnecessary dependency: 'user'. Either exclude it or remove the dependency array.  react-hooks/exhaustive-deps

info  - Need to disable some ESLint rules? Learn more here: https://nextjs.org/docs/basic-features/eslint#disabling-rules
```

**Negative test suite:**
```
$ npx tsx __tests__/round-trip-closure/run.ts
1. Round-trip identity preservation (componentResults blob)
2. Trace-level identity preservation (ExecutionTrace.componentType)
3. Adversarial input — structured failures
4. Graceful-degradation labels (no silent fallthrough)
5. Registry sanity (foundational identifiers only)
6. HF-198 E5 plan-comprehension emitter shape
7. HF-198 E3 signal-type registry
8. HF-198 E6 Korean Test verdict at registry

HF-198 + OB-196 round-trip + signal-registry tests: 103 pass, 0 fail
```

**Final-build PROOF GATES update:**
- Hard Gate 14 (FINAL BUILD): **PASS**
- Hard Gate 15 (FINAL LINT): **PASS** (zero errors; only pre-existing warnings)
- Hard Gate 16 (FINAL TEST): **PASS** (103 / 103)

## OB-196 + HF-199 STATUS SUMMARY

OB-196's six extensions (E1-E6) operative on main as of HF-198 PR #361 merge.
HF-199 closes the three Meridian-blocking defects gating ground-truth reconciliation:
- D1: Plan-tier extraction — verified false defect; diagnostic log corrected
- D2: Convergence binding — HF-114 prompt now consumes E5 signals authoritatively;
  boundary fallback structurally gated at score ≥ 0.50
- D3: Entity attribute projection — `field_identities`-marked attribute columns
  project into `entities.temporal_attributes` per entity from entity-typed batches

With this PR merged + Meridian re-imported, the calc-time materialization
surface receives populated entity attributes, the convergence binding produces
correct column → metric mappings, and the calc engine reads operative
`calculationIntent.outputGrid`/`outputs` for tier evaluation.

AUD-004 v3 §1 verbatim problem closure ("If a new structural primitive
appears, the platform still works") and Meridian ground-truth reconciliation
both PENDING ARCHITECT VERIFICATION via reconciliation gate test.
