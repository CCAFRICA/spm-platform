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

## 10. DIAG-021 R1 — CALLER-WRITER DRIFT, MATCHER PATH, DATA_TYPE TRACE
### Date: 2026-04-25

### Anchor SHAs (all resolved)
```
MARCH_19_SHA = 48f1708d
APR_17_SHA   = 9ad419d2
HEAD_SHA     = 882bc94c
```

### Phase 1: Emission point inventory at MARCH_19_SHA

| Log Tag | File @ MARCH_19_SHA | Line | Function |
|---------|---------------------|------|----------|
| L1 (HF-108 Using convergence_bindings) | web/src/app/api/calculation/run/route.ts | 141 | POST (line 59-end) |
| L2 (OB-160G: Convergence complete) | web/src/app/api/import/sci/execute/route.ts | 266 | POST (line 94-440) |
| L3 (Convergence component bindings emitter) | web/src/lib/intelligence/convergence-service.ts | 409 | convergeBindings (line 102-416) |
| L4 (DS-009 3.3) | web/src/lib/sci/entity-resolution.ts | 294 | resolveEntitiesFromCommittedData (line 26-end) |
| L5 (HF-109 Entity resolution:) | web/src/app/api/import/sci/execute/route.ts | 276 | POST |
| L6 (HF-109: Entity data written) | web/src/app/api/import/sci/execute/route.ts | 894 | executeEntityPipeline (line 796-915) |
| L7 (OB-185 Pass 4) | (no match — absent at MARCH_19) | — | (added 2026-03-22 by OB-185 Phase 1, post-MARCH_19) |

### Phase 2: Cross-anchor emission table

| Log Tag | MARCH_19 file:line | APR_17 file:line | HEAD file:line | Same File All 3? | Same Function All 3? | Body Identical (function-level)? | Body Identical (local block)? |
|---------|---|---|---|---|---|---|---|
| L1 | calc/run/route.ts:141 | calc/run/route.ts:232 | calc/run/route.ts:227 | YES | YES (POST) | NO (M19→A17 = 548 line diff; A17→HEAD = 6 line diff) | YES (block byte-identical) |
| L2 | sci/execute/route.ts:266 | sci/execute/route.ts:272 | sci/execute/route.ts:269 | YES | YES (POST) | NO (M19→A17 = 35 lines; A17→HEAD = 5) | (not separately diffed; immediate context unchanged in spot-check) |
| L3 | convergence-service.ts:409 | convergence-service.ts:576 | convergence-service.ts:586 | YES | YES (convergeBindings) | NO (M19→A17 = 203 lines; A17→HEAD = 38) | YES (block byte-identical) |
| L4 | entity-resolution.ts:294 | entity-resolution.ts:294 | entity-resolution.ts:294 | YES | YES (resolveEntitiesFromCommittedData) | YES (whole-file diff exits 0 across all 3 anchors) | YES |
| L5 | sci/execute/route.ts:276 | sci/execute/route.ts:282 | sci/execute/route.ts:279 | YES | YES (POST) | (same as L2) | (not separately diffed) |
| L6 | sci/execute/route.ts:894 | sci/execute/route.ts:938 | sci/execute/route.ts:935 | YES | YES (executeEntityPipeline) | M19→A17 = 15 lines; A17→HEAD = 0 (byte-identical) | YES |
| L7 | (absent) | convergence-service.ts:503/522 | convergence-service.ts:513/532 | YES (where present) | YES (convergeBindings) | A17→HEAD = (same 38-line span as L3) | (not diffed) |

**Emission drift candidates flagged:** Function-body NO at L1, L2/L5, L3, L6 (all between MARCH_19 and APR_17). All are due to ADDITIVE growth (OB-185 Pass 4, HF-191 Phase B seed validation, HF-188 intent-executor refactor) inserted before/around the emission, not local-block rewrites. Local block byte-identical at L1 and L3 confirmed by direct ±10-line comparison; matcher and emit local code unchanged. **No PATH_CHANGED_FILE / PATH_CHANGED_FUNC.**

### Phase 3: Writer evolution table

| Writer (stable identifier) | MARCH_19? | APR_17? | HEAD? | Writes field_identities? | Other metadata keys (at HEAD) |
|----------------------------|-----------|---------|-------|--------------------------|--------------------------------|
| `web/src/app/api/import/sci/execute-bulk/route.ts:613/680/682 — transaction insert (processDataUnit)` | YES (line 613) | YES (line 682) | YES (line 680) | **NO at all anchors** | source: 'sci-bulk', proposalId, semantic_roles, resolved_data_type, entity_id_field |
| `execute-bulk/route.ts:552 — entity insert` | **NO** (only target/transaction at MARCH_19) | YES (line 552) | YES (line 552) | **NO** | source: 'sci-bulk', proposalId, semantic_roles, resolved_data_type, entity_id_field, informational_label: 'entity' |
| `execute-bulk/route.ts:836/832 — reference insert` | **NO** | YES (line 836) | YES (line 832) | **NO** | source: 'sci-bulk', proposalId, semantic_roles, resolved_data_type, entity_id_field, informational_label: 'reference' |
| `execute-bulk/route.ts entity_id update (entity_id-only update)` | YES (line 958) | YES (line 998) | YES (line 992) | (n/a — only updates entity_id) | (no metadata write) |
| `execute/route.ts — target pipeline insert` | YES (line 591 `field_identities: tgtFieldIdentities`) | YES (line 626) | YES (line 623) | **YES** | informational_label: 'target', field_identities |
| `execute/route.ts — transaction pipeline insert` | YES (line 739) | YES (line 774) | YES (line 771) | **YES** | informational_label: 'transaction', field_identities |
| `execute/route.ts — entity pipeline insert (executeEntityPipeline)` | YES (line 865) | YES (line 908) | YES (line 905) | **YES** | informational_label: 'entity', field_identities |
| `execute/route.ts — reference pipeline insert` | YES (line 987) | YES (line 1039) | YES (line 1036) | **YES** | informational_label: 'reference', field_identities |
| `execute/route.ts entity_id update` | YES (line 1648) | YES (line 1703) | YES (line 1724) | (n/a) | (no metadata write) |
| `web/src/lib/supabase/data-service.ts:167 — insertCommittedData helper (passthrough)` | YES (byte-identical body) | YES | YES | (caller-supplied; passes through) | passthrough |

**NEW writers post-APR_17 (i.e., post-MARCH_19, present at APR_17 and HEAD):**
- `execute-bulk/route.ts:552 — entity insert` (introduced by HF-184 / Unified committed_data writes, 2026-03-31, commit 2203fc93)
- `execute-bulk/route.ts:836/832 — reference insert` (introduced by OB-195 Layer 1 — Reference pipeline → committed_data, 2026-03-30, commit 261bd9d0)
- (Both writers PRESENT at APR_17_SHA already; no further new writers between APR_17 and HEAD.)

**REMOVED writers since MARCH_19:** None observed.

**MOVED writers:** None — all pre-existing writers still in original files; only line numbers drifted within those files.

**Writer-content evolution:** the *pre-existing* execute-bulk transaction writer at MARCH_19 (line 613) ALREADY omitted `field_identities`. Its metadata payload at MARCH_19 was `{ source: 'sci-bulk', proposalId, semantic_roles, resolved_data_type }`. The new entity + reference bulk writers added later inherited this same omission and added `informational_label` and `entity_id_field`.

**BCL data attribution:** Live BCL committed_data carries `metadata.source: 'sci-bulk'` and `metadata.informational_label` set (per DIAG-020-A). The `'sci-bulk'` literal appears ONLY in `execute-bulk/route.ts`. Therefore current BCL committed_data was written by `execute-bulk/route.ts`, NOT `execute/route.ts`. The `execute-bulk` writer never includes `field_identities`.

### Phase 4: data_type construction trace

| Anchor | Construction logic at writer call sites | Hash-prefixed? |
|--------|-----------------------------------------|----------------|
| MARCH_19 (48f1708d) | `normalizeFileNameToDataType(fileName)` then ``${normalized}__${tabName.toLowerCase().replace(/[\s\-]+/g, '_')}`` (when tab is non-generic) | Hash prefix is part of `fileName` itself (upstream content-unit-id format like `0_72d70dac_BCL_Plantilla_Personal.xlsx`); the normalizer strips file-extension and date suffixes but preserves the hash. |
| APR_17 (9ad419d2) | Identical to MARCH_19 — `normalizeFileNameToDataType` body byte-identical, `${normalized}__${tabName...}` byte-identical | Same — hash present. |
| HEAD (882bc94c) | Identical to APR_17 — byte-identical | Same — hash present. |

**Hash-prefixing first appears at:** all three anchors equally — the construction logic is byte-identical. Hash-prefix originates in the upstream content-unit-id format (file naming step), not in the data_type normalizer; the normalizer preserves the hash because it only strips file-extension/date-suffix tokens.

**Commit that introduced hash-prefixing:** Not within the DIAG-021 window. The hash-prefix predates MARCH_19_SHA. **Verdict: HASH_PRESENT_ALL_ANCHORS** — not a regression vector.

### Caller-Writer Drift Verdict

**NEW_WRITER_OMITS_FI** — new writer call sites for the entity and reference pipelines were added in `execute-bulk/route.ts` between MARCH_19 (where they did not exist) and APR_17 (where they exist with the same omission as today). These new writers omit `field_identities`. The pre-existing transaction-pipeline writer in `execute-bulk/route.ts` also omits `field_identities` and has done so at all three anchors; the new writers extend the same omission to additional pipelines.

### Multi-Pass Matcher Path Verdict

**PATH_UNCHANGED** — All three matcher functions (`inventoryData`, `matchComponentsToData`, `generateAllComponentBindings`) and the convergence helper layout are byte-identical or additively enhanced (`extractComponents`) between MARCH_19 and HEAD per DIAG-020. The local code blocks around L1 and L3 emissions are byte-identical text across all three anchors. Function-body sizes grew because of additive blocks inserted ELSEWHERE in the enclosing functions (Pass 4, seed validation, HF-188 intent executor, HF-165 calc-time convergence) — not because the matcher's invocation arguments, call site, or local logic changed.

### Data_Type Normalization Verdict

**HASH_PRESENT_ALL_ANCHORS** — `normalizeFileNameToDataType` and the `${normalized}__${tabName}` composition are byte-identical at all three anchors. The hash-prefix on BCL data_type values originates from the upstream content-unit-id format (file naming convention), which existed at MARCH_19. Not the regression vector.

### Combined disposition (per DIAG-021 R1 matrix)

`NEW_WRITER_OMITS_FI` × `PATH_UNCHANGED` × `HASH_PRESENT_ALL_ANCHORS` → **HF-194 narrow: restore `field_identities` write in `execute-bulk/route.ts`'s three insert call sites** (entity at line 552, transaction at line 680, reference at line 832 of HEAD). Reuse the `buildFieldIdentitiesFromBindings` helper that already exists in `execute/route.ts` line 38 (HEAD); the helper signature and shape are stable across all three anchors.

Single-target forward-fix. Verification gate: re-import BCL through the bulk path; confirm `committed_data.metadata.field_identities` is populated; recalculate; expect 4 component bindings produced; verify $312,033 BCL total at calc time.

### Hypothesis confidence after DIAG-021 R1

**Held at HIGH.** DIAG-020-A's hypothesis (regression vector is `field_identities` absence on `committed_data.metadata`) was already HIGH after the live-data confirmation (70/70 BCL rows, 0 with `field_identities`). DIAG-021 R1 promotes the precision: the absence is attributable to `execute-bulk/route.ts`'s three insert call sites, all of which omit `field_identities` from their metadata construction. Two of those call sites (entity, reference) are NEW post-MARCH_19 (HF-184 and OB-195 Layer 1). The third (transaction) pre-existed at MARCH_19 with the same omission, but was likely not the path BCL took for personnel rows on March 19 (entity rows could not have gone through execute-bulk at MARCH_19 because the bulk entity-write call site did not exist there — they went through `execute/route.ts`'s entity pipeline, which DOES write `field_identities`). Therefore for BCL specifically, the regression vector is "BCL entity + datos imports now route through execute-bulk where on March 19 they routed through execute". Whether the routing-side change is in the UI proposal flow or in the SCI orchestration (analyze → execute-bulk vs analyze → execute) is the next narrowing question, but is not required to draft HF-194 — restoring `field_identities` write in execute-bulk closes the gap regardless of which UI flow invokes it.

### ARCHITECT DISPOSES

End of DIAG-021 R1. CC does not propose fixes.

## 11. DIAG-022 — PIPELINE ARCHITECTURE READ
### Date: 2026-04-25

### Phase 0: File inventory + introducing commits

- `web/src/app/api/import/sci/execute/route.ts` — 1,839 lines (72,299 bytes); first commit `c0fcf055` 2026-03-01 ("OB-127 Phase 6: SCI execute API — routing + target pipeline + convergence re-wire").
- `web/src/app/api/import/sci/execute-bulk/route.ts` — 1,089 lines (40,609 bytes); first commit `07639bb4` 2026-03-04 ("OB-156 Phase 1+2: File storage transport + server-side bulk processing"). execute predates execute-bulk by 3 days.
- HF-184 commit (`2203fc93`, 2026-03-31): "HF-184: Unified committed_data writes — import sequence independence. All SCI pipelines now write committed_data rows with source_date and entity_id_field…" — this is the commit that added the entity insert in execute-bulk (line 552 at HEAD).
- OB-195 Layer 1 commit (`261bd9d0`, 2026-03-30): "OB-195 Layer 1: Reference pipeline → committed_data (Decision 111). Rewrite processReferenceUnit to follow processDataUnit pattern. Previously wrote to reference_data + reference_items (deprecated per Decision 111)." — this is the commit that added the reference insert in execute-bulk (line 832 at HEAD).

### Phase 1: Handler summaries

```
=== execute/route.ts handler summary ===
Entry point: POST /api/import/sci/execute (line 97)
Triggered when: SCI proposal is confirmed and the request payload contains
                contentUnits with rawData (browser-parsed) — and/or contains
                storagePath for plan-document AI interpretation.
High-level flow:
  1. Authenticate + load tenant settings (lines 98-138)
  2. Sort contentUnits by classification (reference < entity = target =
     transaction < plan)  — HF-109 ordering
  3. If any plan units AND storagePath present, batch all plan units into
     ONE call to executeBatchedPlanInterpretation (HF-130) → AI plan
     interpretation, rule_set upsert, persist metric_comprehension signals
  4. For each non-plan content unit: dispatch to executeContentUnit →
     dispatches to executeTargetPipeline / executeTransactionPipeline /
     executeEntityPipeline / executeReferencePipeline based on
     confirmedClassification
  5. Each pipeline writes committed_data rows with metadata containing
     field_identities (built via extractFieldIdentitiesFromTrace OR fallback
     to buildFieldIdentitiesFromBindings) + informational_label
  6. Post-import: HF-109 entity resolution (resolveEntitiesFromCommittedData,
     DS-009 3.3) + OB-160G convergence call (when applicable; runs across
     all rule_sets to populate input_bindings)
  7. Capture sci:classification_outcome_v2 and sci:convergence_outcome
     classification_signals
Returns: SCIExecutionResult { results: ContentUnitResult[]; convergence: {...} }

=== execute-bulk/route.ts handler summary ===
Entry point: POST /api/import/sci/execute-bulk (line 68)
Triggered when: SCI proposal is confirmed for bulk DATA processing —
                request carries storagePath + contentUnits but NO rawData.
                The browser uploaded the file to Supabase Storage; this
                handler downloads + parses server-side.
High-level flow:
  1. Authenticate + verify tenant (lines 73-105)
  2. Download file from Storage bucket 'ingestion-raw' (lines 110-117)
  3. Parse XLSX server-side via xlsx library; build sheetDataMap (lines
     124-145)
  4. Sort contentUnits by PROCESSING_ORDER (plan=0, entity=1, target=2,
     transaction=3, reference=4)
  5. For each unit: resolve sheet data, then dispatch to a per-classification
     processor (processEntityUnit / processDataUnit for transaction +
     target / processReferenceUnit). NOTE: 'plan' classification is in
     PROCESSING_ORDER but NOT actually handled by this route — see Phase 2
     below.
  6. Each processor builds committed_data rows with metadata containing
     source: 'sci-bulk', proposalId, semantic_roles, resolved_data_type,
     entity_id_field, and (for entity/reference) informational_label.
     **DOES NOT include field_identities at any of the three sites**
     (per DIAG-021 R1).
  7. Inserts to committed_data in 2,000-row chunks with retry logic
     (OB-174 Phase 5 nanobatch commitment)
  8. Updates import_batches.status='completed' on success
  9. Note: convergence is NOT called here — explicitly removed by OB-182
     ("convergeBindings removed from import — runs at calc time")
Returns: SCIExecutionResult { results: ContentUnitResult[] }
```

### Phase 2: Upstream router

**CALLER FILE:** `web/src/components/sci/SCIExecution.tsx`
**BRANCHING CONDITION:** Whether the content unit's classification is `'plan'` AND, secondarily, whether `storagePath` is present.
- For **non-plan units** (entity, transaction, target, reference): if `storagePath` is non-empty, route batch goes to **`/api/import/sci/execute-bulk`** (lines 167–198: `executeUnits` → `bulkUnits` payload).
- For **plan units**: routed to **`/api/import/sci/execute`** in a single batch call (lines 285–335).
- For **non-plan units when `storagePath` is missing**: `executeLegacyUnit` falls back to **`/api/import/sci/execute`** (lines 237–283, comment: "Legacy execution — used for plan units (document-based) and fallback when no storagePath").

Quote line: `// OB-156: Split units into plan (legacy) and data (bulk) groups` at line 286, with `planUnits` filtered by `classification === 'plan'` and `dataUnits` taking the rest.

So the data path is:
- (plan) → execute (plan-interpretation handler invoked via batch)
- (non-plan + storagePath) → execute-bulk
- (non-plan + no storagePath) → execute (legacy/fallback path)

The data-pipeline implementations in execute (target/transaction/entity/reference) are therefore live as a **fallback path**, not dead code.

### Phase 3: Metadata contract comparison

| Pipeline | Insert Site (file:line) | Data Type | metadata keys | field_identities | source value |
|----------|-------------------------|-----------|---------------|------------------|--------------|
| execute  | execute/route.ts:584-602 (target pipeline)         | target      | informational_label, field_identities, classification, sourceFile, tabName (and supporting keys from helpers) | **YES** (line 591) | (no `source: 'sci-bulk'` literal — execute does not stamp this) |
| execute  | execute/route.ts:730-744 (transaction pipeline)    | transaction | informational_label, field_identities, classification, sourceFile, tabName | **YES** (line 739) | — |
| execute  | execute/route.ts:874-880 (entity pipeline)         | entity      | informational_label, field_identities, classification, sourceFile, tabName | **YES** (line 865) | — |
| execute  | execute/route.ts:1003-1015 (reference pipeline)    | reference   | informational_label, field_identities, classification, sourceFile, tabName | **YES** (line 987) | — |
| execute-bulk | execute-bulk/route.ts:525-548 (entity insert)  | entity      | source: 'sci-bulk', proposalId, semantic_roles, resolved_data_type, entity_id_field, informational_label: 'entity' | **NO**  | `'sci-bulk'` |
| execute-bulk | execute-bulk/route.ts:645-665 (transaction)    | transaction | source: 'sci-bulk', proposalId, semantic_roles, resolved_data_type, entity_id_field | **NO**  | `'sci-bulk'` |
| execute-bulk | execute-bulk/route.ts:805-822 (reference)      | reference   | source: 'sci-bulk', proposalId, semantic_roles, resolved_data_type, entity_id_field, informational_label: 'reference' | **NO**  | `'sci-bulk'` |

**Metadata diff statement:**
- Common to both: `informational_label` (entity/transaction/target/reference per pipeline)
- Unique to `execute-bulk`: `source: 'sci-bulk'`, `proposalId`, `semantic_roles`, `resolved_data_type`, `entity_id_field`
- Unique to `execute`: `field_identities`, `classification`, `sourceFile`, `tabName`, and additional execute-only keys

The two writers produce DIFFERENT metadata shapes. `field_identities` is the most consequential difference because the convergence matcher's structural-FI Pass keys on it (per DIAG-020 / DIAG-020-A / DIAG-021 R1). `execute`-written rows feed the matcher's primary path; `execute-bulk`-written rows fall through to Pass 3 token overlap, which fails on hash-prefixed `data_type` values.

### Phase 4: buildFieldIdentitiesFromBindings analysis

Located at `web/src/app/api/import/sci/execute/route.ts:38–81`.

**Helper full body** (40 lines):

```ts
// HF-110: Build field_identities from confirmedBindings when HC trace is unavailable (DS-009 1.3)
// Maps SemanticRole → ColumnRole + contextualIdentity — guaranteed write, never null
function buildFieldIdentitiesFromBindings(
  bindings: SemanticBinding[],
): Record<string, FieldIdentity> {
  const ROLE_MAP: Record<string, { structuralType: ColumnRole; contextualIdentity: string }> = {
    entity_identifier: { structuralType: 'identifier', contextualIdentity: 'person_identifier' },
    entity_name: { structuralType: 'name', contextualIdentity: 'person_name' },
    entity_attribute: { structuralType: 'attribute', contextualIdentity: 'entity_attribute' },
    entity_relationship: { structuralType: 'attribute', contextualIdentity: 'entity_relationship' },
    entity_license: { structuralType: 'attribute', contextualIdentity: 'entity_license' },
    performance_target: { structuralType: 'measure', contextualIdentity: 'performance_target' },
    baseline_value: { structuralType: 'measure', contextualIdentity: 'baseline_value' },
    transaction_amount: { structuralType: 'measure', contextualIdentity: 'currency_amount' },
    transaction_count: { structuralType: 'measure', contextualIdentity: 'count' },
    transaction_date: { structuralType: 'temporal', contextualIdentity: 'date' },
    transaction_identifier: { structuralType: 'identifier', contextualIdentity: 'transaction_identifier' },
    period_marker: { structuralType: 'temporal', contextualIdentity: 'period' },
    category_code: { structuralType: 'attribute', contextualIdentity: 'category' },
    rate_value: { structuralType: 'measure', contextualIdentity: 'percentage' },
    tier_boundary: { structuralType: 'measure', contextualIdentity: 'threshold' },
    payout_amount: { structuralType: 'measure', contextualIdentity: 'currency_amount' },
    descriptive_label: { structuralType: 'attribute', contextualIdentity: 'label' },
  };
  const identities: Record<string, FieldIdentity> = {};
  for (const binding of bindings) {
    const mapped = ROLE_MAP[binding.semanticRole];
    if (mapped) {
      identities[binding.sourceField] = {
        structuralType: mapped.structuralType,
        contextualIdentity: mapped.contextualIdentity,
        confidence: binding.confidence,
      };
    } else {
      identities[binding.sourceField] = {
        structuralType: 'unknown',
        contextualIdentity: binding.semanticRole || 'unknown',
        confidence: binding.confidence,
      };
    }
  }
  return identities;
}
```

**Required inputs:**
- `bindings: SemanticBinding[]` — array of `{ sourceField: string; semanticRole: string; confidence: number; ... }`. The helper iterates the array and builds `Record<columnName, FieldIdentity>` per binding. Output is always non-null and non-empty when bindings is non-empty.

**Calls in execute/route.ts:** four call sites (line 586 target, 734 transaction, 880 entity, 1011 reference), all using `extractFieldIdentitiesFromTrace(...) || buildFieldIdentitiesFromBindings(unit.confirmedBindings)` — the helper is the fallback when the SCI HC trace is missing.

**Availability in execute-bulk context:** **YES, fully available.**
- `BulkContentUnit.confirmedBindings: SemanticBinding[]` is declared at execute-bulk/route.ts:53 and is part of the `BulkRequest` payload posted by `SCIExecution.tsx:173` (`confirmedBindings: proposalUnit.fieldBindings`).
- `unit.confirmedBindings` is referenced 20+ times throughout execute-bulk/route.ts (e.g., lines 271, 329-352, 514, 624-640, 788-802) — already in active use for `findDateColumnFromBindings`, `buildSemanticRolesMap`, identifier extraction, etc.
- `SemanticBinding` and `ColumnRole`/`FieldIdentity` are imported from the same `@/lib/sci/sci-types` module that execute/route.ts uses.
- The helper is pure (no DB/IO/AI calls); moving or sharing it is mechanical.

execute-bulk DOES NOT have access to:
- `convergeBindings` invocation (deliberately removed by OB-182)
- AI plan interpretation (handles only data, not plans)
- HC trace (only available in `execute` via `classificationTrace`/`structuralFingerprint` fields, which the bulk request payload also forwards per `SCIExecution.tsx:180-182`, but `extractFieldIdentitiesFromTrace` is not currently imported in execute-bulk)

### Phase 5: Responsibility-division analysis

**Question A — same workload class?** NO.
- Evidence: `execute/route.ts` handles plan documents (PDF/PPTX/DOCX/XLSX) via AI interpretation (`executeBatchedPlanInterpretation`, line 1093, calls `aiService.interpretPlan`); writes `rule_sets` rows; emits `cost_event` and `metric_comprehension` signals.
- `execute-bulk/route.ts` handles only data files (entity/transaction/reference); explicitly does NOT handle plans (the `plan: 0` entry in `PROCESSING_ORDER` is unused — there is no `processPlanUnit` in this file; `git grep -n "processPlanUnit\|plan-interpretation" execute-bulk/route.ts` returns no matches).

**Question B — same upstream context?** SAME caller, DIFFERENT branching.
- Both invoked from `web/src/components/sci/SCIExecution.tsx`.
- Branching: `classification === 'plan'` → execute; otherwise (with storagePath) → execute-bulk; otherwise (without storagePath) → execute fallback.

**Question C — same downstream artifacts?** OVERLAP, NOT EQUAL.
- Both write `committed_data` and `import_batches`.
- execute additionally writes: `rule_sets` (plans only), `classification_signals` (sci:classification_outcome_v2 for sheet classification, sci:convergence_outcome on convergence completion, metric_comprehension on plan interpretation), invokes `convergeBindings` and updates `rule_sets.input_bindings`, calls `resolveEntitiesFromCommittedData`.
- execute-bulk: writes only `committed_data` + `import_batches`. Convergence deferred to calc time per OB-182. Entity backfill is a separate post-import step in execute (not visible from execute-bulk).

**Question D — superset relationship?** NEITHER is a strict superset.
- execute-bulk requires `storagePath` (file in Storage); execute does not require it (browser parses + sends rawData in body).
- execute handles plan documents; execute-bulk does not.
- Each has a structural reason to exist that the other cannot fulfill.

**Question E — structural reason for both?** YES.
- execute-bulk's reason: bypass HTTP body size limits (AP-1 / AP-2 — "no row data in HTTP bodies", "no sequential chunks from browser" — comment at the top of the file). For files large enough to require Storage transport.
- execute's reason: AI plan interpretation requires document content the browser can't pre-parse, AND the legacy/fallback path for small data files where Storage transport is unnecessary.

### Responsibility-Division Verdict

**PARALLEL_SPECIALIZED.** The two routes have legitimately different responsibilities:
- execute = (a) plan documents + AI interpretation, (b) fallback for data when no storagePath.
- execute-bulk = bulk data files via Storage transport (server-side parse).

Their parallelism at the data-pipeline level (entity/transaction/reference) is a smaller AP-17 surface — both routes implement these pipelines, but the implementations diverge in metadata-construction (execute writes `field_identities`, execute-bulk does not). The metadata-contract drift is implementation-only; the structural specialization (Storage transport vs browser-rawData; plan-AI vs no-plan-AI) is real.

### Indicated HF-194 Framing

**B (narrow patch + tech-debt registration).** Per the matrix, PARALLEL_SPECIALIZED maps to A or B. The drift is sufficiently consequential (it gates Decision-111 component bindings on the bulk path) that registering it as debt is warranted. Specifically:
- Narrow patch: at the three execute-bulk insert sites (entity 525-548, transaction 645-665, reference 805-822), add `field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings)` to the metadata payload. Helper is pure and trivially shareable; either import it from execute/route.ts or extract to `@/lib/sci/field-identities` (preferred for clarity).
- Tech debt: register that the metadata-construction surface is parallel between the two routes and should be extracted to a shared helper (`buildCommittedDataMetadata(unit, label, classification)`) to prevent future drift. Optionally: register that `extractFieldIdentitiesFromTrace`-when-available should also be wired into execute-bulk for parity (currently execute-bulk uses only the bindings fallback).

C-Consolidate (full unification) is NOT indicated because the two routes' specialization (Storage download + AI plan interpretation) is structural, not implementation-only. C-Complete-Standard or C-Complete-Bulk would lose either the bulk-transport optimization or the plan-AI capability.

### Hypothesis (NOT a fix proposal)

**Hypothesis (most consistent with evidence):** HF-194 should be drafted as Option B. The narrow code change is small (≈3 lines per insert site, plus an import or helper extraction) and surgically closes the field_identities omission for BCL and any other tenant whose data routes through `execute-bulk`. The tech-debt entry preserves the architect's awareness of the AP-17 metadata-contract surface — execute and execute-bulk's parallel data-pipeline implementations are an architectural smell that should be cleaned up in a future structural pass, but consolidating now would either eliminate the bulk-transport path (regressing AP-1/AP-2) or fold plan-AI into bulk (significantly larger surface). The narrow patch closes the regression; the structural cleanup is a separate, larger effort that should not gate the BCL fix.

### ARCHITECT DISPOSES

End of DIAG-022. CC does not draft HF-194.
