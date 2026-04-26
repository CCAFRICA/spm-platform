# DIAG-020 FINDINGS REPORT
## Date: 2026-04-25
## CC Session HEAD SHA at execution: 445fcb00 (branch hf-193-signal-surface; main HEAD = 6a8d7794)

## 1. ANCHOR COMMITS

| Anchor       | SHA       | Date                       | Description |
|--------------|-----------|----------------------------|-------------|
| MARCH_19_SHA | 48f1708d  | 2026-03-18 14:26 PDT       | OB-177 Phase 6: Build verification and completion report (last commit before OB-185 Pass 4 arrived 4 days later; nearest plausible BCL "March 19" anchor) |
| HEAD_SHA     | 445fcb00  | 2026-04-24                 | HF-193 Phase 4: completion report (current branch tip on `hf-193-signal-surface`) |

Sanity check: `git show <sha>:web/src/lib/intelligence/convergence-service.ts | head -10` returned the same OB-120/OB-162 file header for both anchors. File present in both.

Note: A literal commit named "BCL March 19 third proof ($312,033)" was not found in the git log. The closest March-19-window anchor on `main` is OB-177 Phase 6 (PDT 14:26 = UTC March 19 21:26). DIAG-020 uses `48f1708d` as MARCH_19_SHA; if the architect intends a different anchor, the findings below scale linearly because the matcher functions are byte-identical across the broader 4-week window.

## 2. MATCHER FUNCTION CHANGES (Phase 2-3)

| Function                      | March 19 LOC | HEAD LOC | Change Class |
|-------------------------------|--------------|----------|--------------|
| extractComponents             | 83           | 127      | LOGIC (additive) — adds piecewise_linear `ratioInput`/`baseInput` extraction and conditional_gate `walkNested(onTrue/onFalse/condition)` walker (OB-185 Pass 4 / OB-191). Increases `expectedMetrics` per component; does not remove or rewrite existing extraction. |
| inventoryData                 | 200          | 200      | NONE — body byte-identical (`diff` exits 0). |
| matchComponentsToData         | 116          | 116      | NONE — body byte-identical (`diff` exits 0). |
| generateAllComponentBindings  | 172          | 172      | NONE — body byte-identical (`diff` exits 0). |

Methodology: Function ranges located via `grep -nE "^(export\s+)?(async\s+)?function\s+\w+"` on both anchors; bodies extracted via `sed` on the corresponding line ranges; `diff <head_range> <march19_range>` run for each. First 30 lines of each function are identical between anchors. Three of four matcher functions are byte-identical end-to-end. The extracted diff for `extractComponents` is a +44-line additive block inside a single `if (intent)` branch — pasted in Phase 3 evidence.

## 3. COMMIT-LEVEL CLASSIFICATION

20 unique commits touched the three in-scope files (`convergence-service.ts`, `ai-plan-interpreter.ts`, `anthropic-adapter.ts` at `web/src/lib/ai/providers/`) between MARCH_19_SHA and HEAD_SHA. Below H3 threshold (50). Total additive line count: ~573 in convergence, ~284 in adapter prompt, ~104 in interpreter.

| SHA       | HF/OB             | Message                                                                 | Function(s) Touched                          | Input-Shape Impact |
|-----------|-------------------|-------------------------------------------------------------------------|----------------------------------------------|--------------------|
| d838ca9f  | HF-156            | Plan converter -- connect AI intelligence to calculation engine         | interpreter (bridgeAIToEngineFormat path)    | NONE — interpreter glue, no matcher input touched |
| 9d7a4242  | HF-157            | Remove unused imports + fix all build errors                            | interpreter imports                          | NONE — cleanup |
| 32b81247  | HF-158            | calcType reads calculationIntent.operation as fallback (line 552)       | interpreter normalizeCalculationMethod       | NONE — interpreter only |
| 03ed3795  | HF-159            | normalizeCalculationMethod passes through new primitive types           | interpreter normalizeCalculationMethod       | NONE — interpreter only |
| ed6b1946  | HF-160            | AI prompt vocabulary + priority inversion — root cause fix              | adapter prompt (+88) + interpreter (+4)      | NONE — prompt content; doesn't change matcher input shape |
| 5361c94d  | HF-162 Phase 1    | Add 5 TYPE SELECTION RULES to plan_interpretation prompt                | adapter prompt                               | NONE — prompt content |
| 8af813ff  | HF-162 Phase 2    | Add 6 missing calculationIntent examples (10/10 types covered)          | adapter prompt                               | NONE — prompt content |
| 6991f101  | HF-162 Phase 3    | Update MAPPING RULES with piecewise_linear IMPORTANT note               | adapter prompt                               | NONE — prompt content |
| 4a4e1447  | HF-162 Phase 4    | Remove Korean Test violations from AI prompts                           | adapter prompt                               | NONE — prompt content |
| a69cf62f  | HF-161 Phase 3    | Remove hardcoded eligibleRoles — Korean Test cleanup                    | interpreter eligibleRoles default            | NONE — population_config default; not consumed by matcher |
| 43c07ac8  | HF-171            | LLM-primary identifier classification — use HC identifiesWhat           | adapter prompt                               | NONE — prompt content |
| c165ddea  | OB-186 Phase 2    | Cadence-aware calculate page                                            | adapter prompt                               | NONE — prompt content |
| c19a042c  | OB-185 Phase 1    | AI semantic derivation — Pass 4 implementation                          | convergeBindings (+ Pass 4 block); adds `generateAISemanticDerivations`, `MetricContext` | LOGIC (additive) — adds Pass 4 AI semantic-derivation phase BETWEEN target-pair detection (OB-128) and gap detection. Does NOT alter the matcher functions; new code path runs on metrics still unresolved after Passes 1-3. |
| c6f13105  | OB-185 Phase 2    | Fix build — use natural_language_query task, handle response parsing    | OB-185 Pass 4 task plumbing                  | NONE — bug fix on Pass 4 |
| fc6422fe  | OB-191            | Convergence Pass 4 — calculationIntent metrics + scope_aggregate        | extractComponents (+44 walker block); MetricContext enrichment | LOGIC (additive) — extractComponents now extracts metrics from `ratioInput`, `baseInput`, and recursively walked `condition.left`/`onTrue`/`onFalse`. For BCL: previously the conditional_gate component (regulatory) had `expectedMetrics = []`; HEAD extracts `regulatory_infractions`. Net effect: more required metrics per component, more chances for matchers to find or miss them. |
| 70aba6bc  | HF-191 Phase A    | Plan agent outputs metricSemantics, stored as plan_agent_seeds          | adapter prompt (+51 metricSemantics section); interpreter (+15 plan_agent_seeds write) | WRITES — adds new write path: AI emits `metricSemantics`; interpreter persists as `rule_set.input_bindings.plan_agent_seeds`. Does not affect existing matcher inputs. |
| 3a31bdea  | HF-191 Phase B    | Convergence reads and validates plan agent seeds                        | convergeBindings (+92 seed-validation block before matchers) | READS + LOGIC — adds Decision-147 seed-validation block at line ~159. Reads seeds, validates filter fields against capabilities.categoricalFields, validates source_field against columnStats. Validation-passing seeds become `MetricDerivationRule[]` entries (NOT componentBindings). The block runs BEFORE `matchComponentsToData` and does not modify capabilities or components passed downstream. Failed seeds emit `[Convergence] Decision 147: Seed "X" FAILED: ...`. |
| 3c628702  | HF-193-A 2.2b     | bridge return-shape extension                                            | interpreter return shape                     | CONTRACT (REVERTED next commit) — added new return fields; reverted before merge to main. |
| 37111ab7  | (revert)          | Revert "HF-193-A Phase 2.2b: bridge return-shape extension"             | interpreter return shape                     | NONE — restores prior contract. |
| 95efc14d  | HF-193 Phase 2    | delete plan_agent_seeds; bridge writes metric_comprehension signals; convergence reads signals | interpreter (+19) bridges to SignalData; convergeBindings (+36) reads from `classification_signals` instead of `rule_set.input_bindings.plan_agent_seeds` | READS + WRITES — seed source migration. Persistence target moved from `rule_sets.input_bindings.plan_agent_seeds` (jsonb on rule_set) to `classification_signals` rows where `signal_type='metric_comprehension'`. Read site moved correspondingly. Validation logic in convergeBindings unchanged from HF-191 Phase B. |

Soft gate: total non-NONE commit count = 4 (OB-185 Phase 1, OB-191, HF-191 Phase B, HF-193 Phase 2). Three of the four are ADDITIVE (Pass 4 AI, conditional_gate walker, seed-source migration); one (HF-191 Phase B) introduced the seed-validation block but the validated seeds populate `derivations` (not `componentBindings`), so the new path cannot directly suppress component-binding production.

## 4. TYPE-SHAPE CHANGES

`interface DataCapability` and `interface PlanComponent` defined at lines 26 and 61 of `web/src/lib/intelligence/convergence-service.ts` at HEAD; lines 26 and 44 at MARCH_19_SHA. Bodies BYTE-IDENTICAL between anchors (verified via direct line-range comparison).

| Type           | Field Added | Field Removed | Field Renamed | Constructor Changed |
|----------------|-------------|---------------|---------------|---------------------|
| DataCapability | none        | none          | none          | none — `inventoryData` byte-identical |
| PlanComponent  | none        | none          | none          | `extractComponents` body diverges by +44 additive lines (piecewise_linear ratio/baseInput extraction + conditional_gate walker). Output-shape unchanged; only `expectedMetrics` array can grow. |

A second `PlanComponent` symbol exists at `web/src/types/compensation-plan.ts:58` (exported); this is a different, structurally richer interface used by the engine, not the local `PlanComponent` consumed by `convergeBindings` matchers. The local interface is the relevant one for matcher input-shape drift.

## 5. LIVE STATE OBSERVATIONS

| Observation | Evidence Source |
|-------------|-----------------|
| BCL has exactly one `rule_sets` row (`98fbc260-d1ab-485e-b337-0f534bcb06a5`, status `active`, created `2026-04-25T21:37:49Z`). | Phase 5.1 |
| `input_bindings` on that rule_set contains `metric_derivations` (3 entries — credit_placement_attainment, portfolio_quality_ratio, deposit_capture_attainment, all `ratio` operation, `source_pattern: ".*"`, empty `filters`). | Phase 5.1 |
| `input_bindings` does NOT contain `convergence_bindings` (`has_cb=false`) — the Decision-111 primary format is absent. | Phase 5.1 |
| `input_bindings` does NOT contain `plan_agent_seeds` (`has_seeds_residue=false`) — HF-193's purge step held. | Phase 5.1 |
| `committed_data` for BCL: 595 rows across 7 distinct `data_type` values. 85 rows labeled `entity` (personnel sheet); 510 rows with `metadata.informational_label = NULL/∅` (Datos sheets — NOT labeled `transaction`). | Phase 5.2 |
| The 13-column Datos row_data does NOT contain `product_type` or `infraction_type` — the two filter fields the AI's metricSemantics references for `cross_products_sold` and `regulatory_infractions`. | Phase 5.2 |
| BCL committed_data rows do NOT carry `metadata.field_identities`. (The Phase 5.2 grouping ranges over `row_data` keys; an earlier full row dump in this session, Section 6 of prior diagnostic, confirmed metadata only contains `source`, `proposalId`, `semantic_roles`, `entity_id_field`, `resolved_data_type`, `informational_label`. No `field_identities` key.) | Phase 5.2 + prior session evidence |
| 5 `metric_comprehension` signal rows exist for `rule_set_id = 98fbc260...`, with `component_index` 0–4 and the same metricSemantics shapes the AI emitted (3 ratios + 2 counts; the 2 counts carry filter fields `product_type=cross_sell` and `infraction_type=regulatory`). | Phase 5.3 |
| 85 `entities` rows for BCL each carry `temporal_attributes` as an array with keys `cargo, nivel_cargo, fecha_ingreso, region`. The OB-177 Phase 1 living-layer enrichment is functioning. | Phase 5.4 |

## 6. DRIFT ATTRIBUTION

**Classification: INDETERMINATE — confidence MEDIUM.**

Within the in-scope files (matcher + interpreter + AI prompt), the matcher logic and matcher input types are unchanged. `inventoryData`, `matchComponentsToData`, and `generateAllComponentBindings` are byte-identical between MARCH_19_SHA and HEAD_SHA; `extractComponents` is additively enhanced (more `expectedMetrics` extracted, never fewer). `DataCapability` and `PlanComponent` interfaces are byte-identical. Live state shows BCL's current rule_set produces `metric_derivations` only and zero `convergence_bindings` — consistent with `matchComponentsToData` returning zero matches at the structural-FI tier and zero usable matches at the token-overlap tier. The structural-FI tier requires `metadata.field_identities` on committed_data rows; that field is absent on every BCL row. The token-overlap tier requires lexical overlap between component names (English + Spanish: "Credit Placement", "Cross Products", etc.) and `data_type` values (hash-prefixed: `0_72d70dac_bcl_plantilla_personal__personal`); no overlap exists.

The reason the in-scope diagnostic cannot resolve this to CONCENTRATED or DISTRIBUTED is that the absent `metadata.field_identities` is written by the import pipeline (`web/src/app/api/import/sci/execute/route.ts` and `execute-bulk/route.ts`), which is outside DIAG-020's scope. Whether the March 19 BCL import wrote that field — or wrote a `data_type` value with sufficient lexical signal for token-overlap — cannot be determined by reading current code and current data alone. Both possibilities are consistent with the static evidence.

## 7. HYPOTHESIS

**Hypothesis (NOT a fix proposal).** The most likely root cause is that BCL's committed_data was imported after a change in the SCI import pipeline that no longer stamps `metadata.field_identities` (or stamps it under a different shape that `inventoryData` does not recognize). With `field_identities` absent on every row, `inventoryData` produces `DataCapability` entries with `fieldIdentities: {}`; `matchComponentsToData`'s primary structural-FI path is skipped (`capsWithFI.length === 0`); the Pass-3 token-overlap fallback finds no overlap because `data_type` values are opaque hash-prefixed strings rather than human-readable tokens; matches end empty; `generateAllComponentBindings` therefore writes zero `componentBindings`. The matcher itself is functioning as designed against degraded inputs. A secondary contributing factor — visible in Phase 5.3 — is that the AI's `metricSemantics` for `cross_products_sold` and `regulatory_infractions` references categorical filter fields (`product_type`, `infraction_type`) that do not exist in the actual `row_data`; the seed-validation block correctly fails those two seeds, but this affects `derivations`, not `componentBindings`. These two issues are independent and could have arrived at different commits, which is why the disposition is INDETERMINATE rather than CONCENTRATED.

## 8. ARCHITECT DISPOSES

End of report. CC does not propose fixes. CC does not draft HFs.

## 9. DIAG-020-A FOLLOW-UP — FIELD_IDENTITIES CONFIRMATION
### Date: 2026-04-25

### Phase 1: BCL metadata top-level keys (sample 50 of 595 total rows)

| metadata_key            | rows_containing_key |
|-------------------------|---------------------|
| source                  | 50                  |
| proposalId              | 50                  |
| semantic_roles          | 50                  |
| entity_id_field         | 50                  |
| resolved_data_type      | 50                  |
| informational_label     | 50                  |

`field_identities` present in: **0 of 50** sampled rows.
Keys starting with `field_` or `identity_`: (none).

### Phase 2: Per-batch field_identities probe (10 rows per distinct batch × data_type)

| import_batch_id                       | data_type                                              | sampled | with_field_identities |
|---------------------------------------|--------------------------------------------------------|---------|-----------------------|
| 40a4dc96-dbbb-4af5-8ab9-d72622ba4dc5  | 0_72d70dac_bcl_plantilla_personal__personal            | 10      | 0                     |
| ec021124-7ced-48d1-a280-52435c4fb74f  | 0_8622c8a6_bcl_datos_dic__datos                        | 10      | 0                     |
| 0a3a8013-7a50-44c5-923b-215d0c40de76  | 1_f2c29611_bcl_datos_ene__datos                        | 10      | 0                     |
| 42cf02ee-0571-469a-8bf9-c2084cff25e4  | 2_3aedc4fe_bcl_datos__datos                            | 10      | 0                     |
| 08e2dc90-cbdb-4657-93e5-db9857747973  | 3_3ca68905_bcl_datos__datos                            | 10      | 0                     |
| 54891b4d-9ae2-43d4-816b-0004a59e45a5  | 4_332f6cfb_bcl_datos__datos                            | 10      | 0                     |
| 706dd552-b417-47ea-8fc0-cf29be219209  | 5_8328fbff_bcl_datos__datos                            | 10      | 0                     |

Total: **70 rows sampled across 7 distinct (import_batch, data_type) pairs — 0 with `field_identities`**. Absence is universal at the BCL tenant, not batch-specific. PARTIAL is ruled out.

### Phase 3: Cross-tenant comparative probe

| tenant   | total_rows | rows_sampled | rows_with_field_identities | other_metadata_keys (sampled)                                                                |
|----------|------------|--------------|----------------------------|-----------------------------------------------------------------------------------------------|
| BCL      | 595        | 20           | 0                          | entity_id_field, informational_label, proposalId, resolved_data_type, semantic_roles, source |
| CRP      | 0          | 0            | 0                          | (no rows — H3 fired; cross-tenant comparison limited)                                         |
| Meridian | 0          | 0            | 0                          | (no rows — H3 fired; cross-tenant comparison limited)                                         |

CRP and Meridian have zero `committed_data` rows (consistent with the recent Nuclear-Clear scope intent for those tenants). Universal-absence-across-tenants (CROSS-TENANT classification) cannot be determined from this probe alone.

### Confirmation status:

**CONFIRMED — field_identities absent on BCL rows.**

### Hypothesis confidence after DIAG-020-A:

Promoted from MEDIUM to: **HIGH**.

DIAG-020-A directly demonstrates what DIAG-020 inferred: every BCL `committed_data` row sampled (70 rows from 7 distinct batches, plus the broader 50-row Phase 1 sample) lacks `metadata.field_identities`. With `field_identities` absent on every row, `inventoryData` (line 800 of `convergence-service.ts`) produces `DataCapability` entries with `fieldIdentities: {}`. `matchComponentsToData`'s primary structural-FI gate at line 930 (`const capsWithFI = capabilities.filter(c => Object.keys(c.fieldIdentities).length > 0); if (capsWithFI.length > 0) {...}`) is therefore skipped entirely. The Pass-3 token-overlap fallback at lines 1001–1031 cannot recover because BCL `data_type` values are opaque hash-prefixed identifiers (`0_72d70dac_bcl_plantilla_personal__personal`, `0_8622c8a6_bcl_datos_dic__datos`, etc.) that share no tokens with component names ("Credit Placement - Senior Executive", "Cross Products - Senior Executive", etc.). Result: `matches.length === 0`, and `generateAllComponentBindings` writes zero `componentBindings`. The matcher functions themselves are byte-identical between MARCH_19_SHA and HEAD (per DIAG-020 Phase 3); the regression is entirely on the `committed_data.metadata` write side. The writer lives in the SCI import pipeline (`web/src/app/api/import/sci/execute/route.ts` and `execute-bulk/route.ts`), which is outside DIAG-020's scope and was not inspected here. The cross-tenant question (whether the absence is BCL-specific or universal) remains unresolved because CRP and Meridian have no current `committed_data` rows; resolving it requires a fresh CRP or Meridian import to compare metadata shapes.

### ARCHITECT DISPOSES

End of DIAG-020-A. CC does not propose fixes.
