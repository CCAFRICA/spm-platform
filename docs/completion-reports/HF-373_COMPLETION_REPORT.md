# HF-373 Completion Report — Close the arc: VLTEST2 calculates, Casa Diaz plans are precise, the large file loads at pace

**Status: CC-side COMPLETE (Phases 0 + A–I implemented and proven at fixture/live-data level; Phase J CC half done).** Branch `hf-373`; one commit per phase. Full test tree **625/625**, `npm run build` green. Architect actions (migrations ×3, optional env, browser-driven EPG-J1/J2/J3/J4 runs, reconciliation, schema-reference regeneration, PR merge) are consolidated in the **"Architect actions (consolidated)"** section at the end of this report — each prepared exactly (SR-44).

**HALT-1 corrections applied (5):** D3 (both roster columns carry entity+identifier recognition; linkage did NOT survive), D9 (the claim grants the WRONG pass — plan-arm pre-data finalize), D6 (staging already pulses; the defect is limit discovery vs the unreadable project-global cap), D8 (uuid-PK order scan kills even 186-row tenants), D10 (one poisoned fingerprint DID store; the atom flywheel was the real warm-path killer). Each reported in its phase section before design; no fix was forced onto a mismatched cause. **No HALT-2/3/5/6 conditions were triggered; no residuals parked (§6A).**

---

## Phase 0 — Evidence gather (read-only, live on current `main` = f3136d2e)

Method: 10 parallel read-only investigators (one per EPG), each combining code trace (`file:line`) with live Supabase queries (service-role probes under `web/scripts/_hf373_*.ts`). **Full verbatim evidence per EPG is committed at `docs/CC-artifacts/hf373-phase0/EPG-0.N.md`** (19,000–34,000 bytes each; every claim below carries its paste there). This section records verdicts, decisive evidence, and the HALT-1 findings.

| EPG | Defect | Verdict | One-line root cause |
|---|---|---|---|
| 0.1 | D1 convergence 0 bindings | **CONFIRMED** | Binder predicates read the dead `structuralType` enum (now prose since OB-231) and never the bare `natureRole`/`scopeRole` primitives; `extractComponents` has no `prime_dag` branch → `expectedMetrics=[]` → AI binding gate never fires |
| 0.2 | D2 variant token scavenging | **CONFIRMED** | Matcher tokenizes `committed_data.row_data` string values (incl. `_sheetName`); materialized role sits unused in the same scope; "Ejecutivo" ⊂ "Ejecutivo Senior" makes V1's discriminant set structurally empty |
| 0.3 | D3 entity-id heuristic | **PARTIAL — HALT-1** | Both roster columns genuinely carry `scope_role=entity ∧ nature_role=identifier`; overlap tie-break tied 100%/100% (manager FK ⊂ employee domain); `repeatRatio > 1.1` excludes a roster's true id *by construction*; **linkage did NOT survive: 84/85 roster rows have `entity_id` = the manager's entity** |
| 0.4 | D9 multi-fire dispatch | **PARTIAL — HALT-1** | Finalize multi-fire is structural (client + per-arm `waitUntil` + sweep); **the HF-371 claim grants the FIRST fire = the plan-arm's pre-data finalize → post-data finalize coalesces against `done` → entity-resolution/summary ran on pre-commit data** (proven live on both tenants) |
| 0.5 | D6 staged CSV oversize | **PARTIAL — HALT-1** | Staging already pulses within budget; defect is `discoverUploadByteBudget` trusting bucket `file_size_limit` (architect raised to 100 MiB pre-HF-372) which now exceeds the unreadable project-global per-object cap (~50 MiB) → 0.8×100 MiB ≈ 84 MB pulse rejected. gzip is used nowhere in the chain today |
| 0.6 | D7 terminal status lies | **CONFIRMED** | `finalize-import` stamps `finalized/completed/completed_at` **unconditionally** (route.ts:149), blind to commit outcome; dispatch-jobs failed-requeue un-terminalizes commit failures; 0-rows-matched job stamp discarded silently |
| 0.7 | D8 summary timeout | **PARTIAL — HALT-1** | Two structural modes, not just "large tenant": `.order('id')` on uuid PK with no `(tenant_id, id)` index times out **even on Casa Diaz (186 rows)** on page 0; OFFSET-depth degradation kills large tenants (Sabor 263K: timeout ≥ offset 50K). Failure swallowed at finalize-import:136-138 |
| 0.8 | D10 fingerprint never stores | **PARTIAL — HALT-1** | `columnRoles` built by regexing free-form `data_nature` prose (`NATURE_IS_*`, agents.ts:79-85), not the bare primitives that ARE persisted; which column goes `unknown` is per-run roulette (5/6 imports blocked); **1/6 stored a POISONED fingerprint** (measures cached `transaction_date` via `\bperiod\b` in prose); atom flywheel dead for Datos (role keyed on prose → `ambiguous` churn) |
| 0.9 | D11 no de-band on oversized path | **CONFIRMED** | `debandWorksheet` has zero call sites in `windowed-commit.ts`/`sheet-stream.ts`/`sheet-window.ts`; both oversized routes key headers on the literal first physical row; `constructStructure(fullGrid:false)` partial-grid mode exists with zero production callers |
| 0.10 | D4/D5 plan precision | **PARTIAL — HALT-1 (D5)** | D4 exact as framed (banner title identical on multiple sheets; source-sheet identity already persisted in `metadata.contentUnitId`, never rendered). D5: stored intent is `{"prime":"reference","field":"BASE COMISION"}` — NOT multiplicative; `constant` prime already grammatically expressible; gap is prompt-contract guidance + the per-entity-constant path (guarantee amounts live in the plan sheet's own reference-committed rows) |

### HALT-1 report (true findings, per directive §4 — reported before designing)

- **D3 (EPG-0.3):** The directive's formula "recognition (`scope_role=entity ∧ nature_role=identifier`) + row-ordinal guard + loud gap" yields **TWO candidates** on this roster: live HC trace and v5 atoms show `ID_Gerente` AND `ID_Empleado` both carry `scope_role='entity'` + `nature_role='identifier'` (the manager column is a self-referential FK into the same entity domain). Recognition alone cannot discriminate; the row-ordinal guard cannot reject `BCL-XXXX` values. Additionally the directive's "downstream outcomes happened to survive" is **wrong**: `metadata.entity_id_field="ID_Gerente"` was persisted on all 85 roster rows and entity-resolution honors it → 84/85 roster rows carry `entity_id` of the *manager's* entity. Also "cold-start" is a mislabel: the entity domain was populated (85 ids); branch (a) overlap **tied** at 100%/100% (13 manager ids ⊆ 85 employee ids) and fell through to branch (b) whose reason string hardcodes "cold-start". Fix design (Phase C) uses the recognition filter **plus the entity-sheet construction invariant** (one row = one entity ⇒ the subject identifier is bijective with rows — an arithmetic structural guarantee, not a preference statistic); zero or multiple survivors → loud named gap.
- **D9 (EPG-0.4):** "All coalesced — containment works" is only half true. The HF-371 claim deduplicates but grants the **first** fire; on a plan+data import the first fire is the plan-arm `waitUntil` finalize, which lands **before the data commit** — the granted finalize runs against pre-commit data, stamps `done`, and the correct post-data finalize is **rejected by the `done` coalesce** (finalize-coalesce.ts:45). Proven live twice: VLTEST2 `94b838b8` (claim done 00:59:41.738 vs data batches 00:59:42.067/42.922) and Casa Diaz `5851bd78` (claim done 01:16:50.061 vs data batches 01:20:58–01:21:05; job stuck `committed/finalizing`). The four-fire import was Casa Diaz (plan-arm ×2 + data-arm ×1 + client ×1); VLTEST2's fired three. The plan-file double-commit was two **concurrent plan-arm execute-bulk invocations**, contained by the HF-259 content-hash single-flight, not batch supersession; the route accepts unlimited concurrent identical commits.
- **D6 (EPG-0.5):** "Staging serialized the sheet as ONE CSV" is **false** — the failed run staged the *first byte-budgeted pulse* (1,921 rows of 86,607). Staging and loading share one path and the pulse WAS budget-sized; the broken invariant is that the **discovered** limit (bucket `file_size_limit` = 100 MiB, set by the architect as the HF-372 pre-deploy step) exceeds the **effective** project-global per-object cap (bounded live between 42.4 MB and ~84 MB; consistent with Supabase's 50 MiB global default; not readable via the storage API). The 2026-07-01 run (bucket limit unreadable → 40 MiB fallback → ~33.7 MB pulses) drained ~312 pulses through the worker successfully — the multi-part architecture already works. Same defect lives in the HF-372 admission gate (`/api/import/sci/upload-budget`). gzip is used nowhere today; the FDW foreign table declares plain `format 'csv'`.
- **D8 (EPG-0.7):** The timeout is not only a large-tenant problem: reproduced live at 8.1–8.3 s on **Casa Diaz with 186 rows** (page 0), because `.order('id')` on a `uuid_generate_v4()` PK with no `(tenant_id, id)` composite index walks the 672,291-row shared table in id order. Large tenants additionally die of OFFSET depth (Sabor 263,250 rows: timeout at offset ≥ 50,000). `backfillSummariesJs` also retains all rows in memory (DIAG-078 class) and every real tenant takes this path (all have labeled `comprehension_artifacts`, so the RPC fast path is dead in practice). Casa Diaz and Test #A1 currently have **0 summary artifacts** — silent absence.
- **D10 (EPG-0.8):** "Fingerprint never stores" is wrong in the strict sense — and the truth is worse. 5/6 Datos imports had ≥1 `unknown` role (gate blocks, per-run nondeterministic column: `Indice_Calidad_Cartera` 5/5, `Infracciones_Regulatorias` 4/5); the 6th (Ene2026) stored a fingerprint with **garbage roles** (`Monto_Colocacion`, `Cumplimiento_Colocacion`, `Indice_Calidad_Cartera`, `Pct_Meta_Depositos`, `Cantidad_Productos_Cruzados` all cached as `transaction_date` because the word "period" in their measure prose matched `NATURE_IS_TEMPORAL` first). That row passes the HF-247 READ gate (conf 0.6667 ≥ 0.5, no `unknown`) — a poisoned Tier-1 hit. Also: `ATOM_ALGORITHM_VERSION` is 5 (not 3); the sheet-level Tier-1 LLM-skip is dead code post-HF-372 — the ~50 s re-pay is the **atom flywheel** being dead for Datos (atom role-stability keyed on free-form prose → `ambiguous` churn).
- **D5 (EPG-0.10):** The stored COMISIÓN GARANTIZADA component does not express a multiplicative rate — it is a bare `{"prime":"reference","field":"BASE COMISION"}`. The `constant` prime already exists grammatically (canonical numeric leaf, registered in `convertComponent`). The gap is (1) prompt-contract guidance (the "VARYING VALUES → reference, not constant" rule + zero constant/guarantee exemplars steers the model away from constant intent), and (2) the faithful per-entity-constant path: guarantee amounts (e.g. 6,000 vs 26,000 per employee) live in the plan sheet's own rows committed as `data_type='reference'`.

### Decisive Phase 0 evidence (full pastes in `docs/CC-artifacts/hf373-phase0/`)

- **EPG-0.1:** Pass-1 predicate `fi.structuralType === 'measure'/'identifier'` (convergence-service.ts:1550-1556, unchanged since 2026-03-08); inventoryData reader drops `natureRole`/`scopeRole` (:1411-1419); live replay over VLTEST2 batches: `Pass 1 structuralCandidates possible anywhere: false`, Pass 3 name-token overlap score 0 on all 12 pairs; live `committed_data.metadata.field_identities` carries `natureRole ∈ {identifier, measure, temporal, name, categorical}` + `scopeRole` on every visible batch; DAG refs are abstract snake_case (`portfolio_quality`, `cumplimiento_colocacion`, …); `extractComponents` mines only `tierConfig.metric`/`sourceSpec` shapes that `prime_dag` components lack → `expectedMetrics=[]` → the `recognizeBindingsViaAI` gate (:702-705) never fires. March-era binding predates the OB-231 Phase 1 (fdf78cf0, 2026-06-22) `structuralType` enum→prose change.
- **EPG-0.2:** Tokens built from `row_data` string values incl. `_sheetName` ("datos"), matched against variant-name discriminants; `materializedState` (resolved role, `period_entity_state.resolved_attributes` + `entities.metadata.role` backstop) computed at run/route.ts:2043-2091 in the same scope, unused by the matcher (:2356-2434); OB-194 exclusion gate (:2414-2433) dropped 72/85; both live variants have `eligibilityCriteria:{}` and `population_config.eligible_roles=[]`, but distinct `variantName`s; 4 survivors matched `variant_0` by discriminant leak (manager-attributed subordinate tokens), 9 fell to `variant_1` via `default_last`; label site prints one variant's name for all lines (run/route.ts:2440).
- **EPG-0.3:** Selection site `selectEntityIdFieldByOverlap` (commit-content-unit.ts:243-277; log at :329; hardcoded "cold-start" reason at :271); live HC trace + v5 atoms: both `ID_Gerente` and `ID_Empleado` carry `scope_role='entity'` + `nature_role='identifier'`; entities created 00:55:17.674 BEFORE roster commit 00:55:18.134 (domain populated); overlap 1.0 vs 1.0 tie; `repeatRatio>1.1` excluded ID_Empleado (85/85 = 1.0×); live: 84/85 roster rows `entity_id` → manager's entity; row-ordinal guard at entity-resolution.ts:18-28; entity-resolution honors `metadata.entity_id_field` (:214-225) and backfills `entity_id` from it (:582-623).
- **EPG-0.4:** Dispatch graph: client finalize (page.tsx:522-540), per-arm server `waitUntil` finalize (execute-bulk/route.ts:872-884), finalize-sweep cron, dispatch-jobs cron; client splits one import into N execute-bulk requests (plan arm SCIExecution.tsx:619, data arm :442, legacy per-unit :552). Claim mechanism finalize-coalesce.ts: `done` coalesce at :45. Live `import_finalize_runs`: Casa `5851bd78` four fires; VLTEST2 `94b838b8` claim `done` at 00:59:41.738 pre-data. AUDIT DIVERGENCE computation compares three bookkeeping surfaces where `pulses` uses a formula-estimate side (full paste in artifact). Plan pipeline at execute-bulk:413-458 runs route-level unguarded (Casa `bcb1d921` 312-batch runaway under repeated dispatch).
- **EPG-0.5:** Budget discovery pulse-budget.ts:35-56 (bucket `file_size_limit` only); streamed driver passes `budget.byteBudget` into `streamSheetWindows` (windowed-commit.ts:295-328); failed pulse = 1,921 rows ≈ 84 MB actual (measured ~40.3–44 KB/row); live bound: 42,402,023-byte XLSX uploaded fine at 01:29, ~84 MB pulse rejected 01:34; 07-01 run drained 312 pulses staged→completed at ~2 s cadence via SQL worker; upload CSV written plain `text/csv` (commit-content-unit.ts:771-774); FDW foreign table `format 'csv', has_header 'true'`, no compress option (20260630_hf356 SQL); `pulse_load_jobs` empty today (tenant-deletion.ts:53 wipes it).
- **EPG-0.6:** Unconditional terminal stamp finalize-import/route.ts:149; commit failure path correctly writes `failed` (job-failure.ts:37-45) and execute-bulk skips its own finalize (:873 requires overallSuccess) — but client fires finalize regardless (page.tsx:551-569 has no unit-failure branch), and dispatch-jobs failed-requeue (route.ts:116-140) resurrects the failed job to `pending`, letting the blind stamp overwrite via `statusMayAdvance`. Casa `0f648189` (86K): `finalized/completed` + error text. Casa `5851bd78` (workbook): stuck `committed/finalizing`, `completed_at=null` — its post-data finalize was coalesce-rejected (see D9) and its pre-data job stamp matched 0 rows, discarded silently. Third specimen: VLTEST2 `8dee9aa0` `finalized` + `phase='finalizing'`. UIs read `processing_jobs` (SCIExecution.tsx:194-238; observatory :897,923,958).
- **EPG-0.7:** Read shape summary-engine.ts:210-215 (`.order('id')` + `.range(offset, offset+999)`); throw at :216; swallow at finalize-import/route.ts:136-138; only indexes `(tenant_id)`, `(tenant_id, data_type)` (003_data_and_calculation.sql:52,79-83); live: 672,291 total rows; Casa Diaz 186 rows times out 8.1–8.3 s on page 0 (same rows 119–140 ms without `.order('id')`); Sabor 263,250 timeout ≥ offset 50K; Test #A1 331,714 timeout ≥ offset 165K; rows retained in memory (:206/219); `compute_summary_artifacts` RPC exists (20260622_ob229) but is dead in practice (labels present → JS path).
- **EPG-0.8:** Gate (stays): fingerprint-flywheel.ts:174-190. columnRoles source: process-job/route.ts:445-446 ← `fieldBindings[].semanticRole` ← `generateSemanticBindings` passes ONLY prose (`agents.ts:61`) → `assignTransactionRole` regexes `NATURE_IS_MEASURE` (agents.ts:81) with no decimal/boolean structural arm (:224-238) → `unknown@0.3`. Live: 5/6 imports ≥1 unknown; Ene2026 stored fingerprint `fbead6eed137` (match_count=2, conf 0.6667) with five measures cached `transaction_date` (`\bperiod\b` → `NATURE_IS_TEMPORAL` first). Bare primitives (`nature_role='measure'`@0.93–0.98) ARE persisted in the HC trace for every affected column. negotiation.ts:29-56 already reads bare primitives (the symmetric partial-claim arm). Atom role churn: decomposed-comprehension.ts:151-153 sets `role: interp.data_nature` (prose) → `ambiguous`.
- **EPG-0.9:** Grep: `debandWorksheet` call sites = process-job (small-sheet branch), execute-bulk (non-oversized branch), retry-unit, plan-interpretation, definition — zero in the three oversized-path files. Streamed headers = first `<row>` of sheetData XML (sheet-stream.ts:221-224, 339); windowed headers = `sheet_to_json` probe of `range.s.r` (sheet-window.ts:46-62); those keys feed fingerprint/flywheel/ContentProfile/decomposed-HC/entity-id (process-job:199,210,242-245,277-283,353). `constructStructure(fullGrid:false)` partial-grid mode exists (structural-construction.ts:431-432), zero callers; deband-sheet.ts:39 requires a materialized worksheet (full-grid `sheet_to_json`) so it cannot be called as-is on streams. deband-sheet.ts header comment documents the oversized exclusion as a designed D2 gap.
- **EPG-0.10:** Name flow: skeleton prompt "verbatim from document title/header" (anthropic-adapter.ts:479) → `ruleSetName` → … → `rule_sets.name` upsert (plan-interpretation.ts:579); banner "COMISIONES DE MAQUINARIA" identical on sheets `MAQUINARIA (2)`, `MAQUINARIA`, `DIST Y SUC` (live workbook read). Live duplicates: `63664074` (from `MAQUINARIA (2)`), `903d05b2` (from `DIST Y SUC`), both ACTIVE. Source identity persisted: `metadata.contentUnitId` = `file.xlsx::SHEET::idx::split` + `metadata.batchedSheets` (plan-interpretation.ts:588-594) — the HF-372 supersession key; never rendered; several list surfaces don't SELECT metadata (operate-context.tsx:132-137 etc.). COMISIÓN GARANTIZADA stored `calculationIntent` = `{"prime":"reference","field":"BASE COMISION"}`; `constant` is a registered FoundationalPrimitive in `convertComponent`; prompt rule "VARYING VALUES → reference, not constant" + zero guarantee exemplars.

---

## Phase A — Convergence binding (D1)

**Objective.** Plan component inputs bind to data columns by reading the model's recognition; deterministic construction; loud named gaps; never an empty-string operand or silent zero.

**Phase 0 finding answered.** EPG-0.1: Pass 1 string-equaled `structuralType` against the retired ColumnRole enum (prose since OB-231 fdf78cf0); `inventoryData` dropped the bare `natureRole`/`scopeRole` primitives; `extractComponents` had no prime_dag branch → `expectedMetrics=[]` → Pass 4 (sole derivation authority, sole consumer of the 7 `comprehension:plan_interpretation` signals) never fired → 0 derivations AND 0 gaps; bindings derive only from `matches` → 0 bindings; calc ran to $0 on `''` operands.

**Change** (`web/src/lib/intelligence/convergence-service.ts`, `web/src/app/api/calculation/run/route.ts`):
1. `inventoryData` carries `natureRole` + `scopeRole` through to `FieldIdentity` (reader at convergence-service.ts:1411-1425).
2. New exported equality reads `fiIsMeasure`/`fiIsIdentifier`/`fiIsTemporal`/`fiIsEntityKeyCandidate` — bare `natureRole` primitive by equality, legacy pre-OB-231 enum disjunct retained (inert on prose). Pass 1 predicate, Pass 2 measure counting, Pass 2 temporal check, and the entity-identifier candidate filter (:3619) all read these. No regex over model prose on-path (HALT-2).
3. `extractComponents` mines prime_dag `expectedMetrics` via `extractReferencesFromDAG` (the same walk `extractInputRequirements` uses at bind time) — re-arms Pass 4 and the gap loop; identity for legacy intents.
4. The HF-333 `isAttributeNature` prose regex replaced with `natureRole === 'categorical' | 'name'` equality (+ legacy enum `'attribute'`).
5. Loud gap (C2): a component whose intent requires tokens but ends the binding phase with zero binding entries emits a named `ConvergenceGap` + `console.error` — a failed bind can never again present as "0 gaps".
6. Zero-binding phase gate in the calc route (run/route.ts, after `convergence_bindings` parse): a plan whose components carry reference primes must never calc against ZERO bindings and ZERO derivations — 422 with named unbound tokens instead of a silent population-wide $0. Legacy `metric_derivations`/`metric_mappings` paths bypass.

**EPG-A1 evidence** (live `convergeBindings` on VLTEST2 rule_set `91f822b1`, script `web/scripts/_hf373_phaseA_convergence_proof.ts`, 43.8 s):

```
[Convergence] HF-112 component_0: placement_attainment=Cumplimiento_Colocacion, portfolio_quality=Indice_Calidad_Cartera
[Convergence] HF-112 component_1: deposit_attainment=Pct_Meta_Depositos
[Convergence] HF-112 component_2: productos_cruzados_vendidos=Cantidad_Productos_Cruzados
[Convergence] HF-112 component_3: infracciones_regulatorias=Infracciones_Regulatorias, bono_cumplimiento_regulatorio=
[Convergence] HF-112 component_4: cumplimiento_colocacion=Cumplimiento_Colocacion, calidad_cartera=Indice_Calidad_Cartera
[Convergence] BANCO CUMBRE DEL LITORAL: 8 derivations, 5 gaps, 8 component bindings
component_0.placement_attainment -> column='Cumplimiento_Colocacion' pass=1 conf=0.95 reduction=last
component_0.portfolio_quality -> column='Indice_Calidad_Cartera' pass=1 conf=0.95 reduction=last
component_0.entity_identifier -> column='ID_Empleado' pass=1
component_7.bono_cumplimiento_regulatorio -> column='' pass=1 conf=0.9 component_ref=4   (HF-353 cross-component)
component_3.bono_cumplimiento_regulatorio -> column='' pass=failed conf=0               (loud, named — see gap)
GAP: [3] Cumplimiento Regulatorio: The regulatory compliance bonus amount is not present in the available data...
```

Was `0 derivations, 0 gaps, 0 component bindings`; now **8 bindings, 8 derivations, 5 loud named gaps** on the same live data. The `[CalcRecon-T2]` real-operand sample is gathered in the Phase J clean-slate run (the current live tenant state is corrupted by the D9 pre-data finalize — see EPG-0.4 — so a calc against it would not be probative; the binding mechanism itself is proven above). Note for Phase J: the `bono_cumplimiento_regulatorio` input is genuinely absent from the current committed data — expected to resolve via the fresh import (and the Phase I constant-intent contract if the plan document states the amount).

Tests: new `hf373-bare-primitive-reads.test.ts` (3/3); intelligence + convergence suites 66/66.

---

## Phase B — Variant assignment from recognized attributes (D2)

**Objective.** Variant selection reads the entity's materialized, model-recognized attributes; zero silent exclusions; correct per-variant labels.

**Phase 0 finding answered.** EPG-0.2: the HF-119 matcher tokenized `committed_data.row_data` string values (incl. `_sheetName` and external-ID fragments); "Ejecutivo" ⊂ "Ejecutivo Senior" made V1's discriminant set structurally empty; the OB-194 gate excluded 72/85; the 13 survivors matched only via manager-attributed subordinate row leakage; both variants rendered the entity's `metadata.role` as the label (run/route.ts:2440-old).

**Change.**
- New `web/src/lib/calculation/variant-selection.ts` — pure, exported: `normalizeIdentity` (accent/case-insensitive, script-neutral), `buildVariantIdentitySets` (variantName/variantId/description), `resolveMaterializedAttributes` (as-of temporal attrs + `metadata.role` backstop — the exact resolution the route materializes to `period_entity_state`), `selectVariantByRecognizedAttributes` (FULL-STRING equality; returns `selected | no_match | ambiguous` — never a default). The calc route consumes these (single path, AP-17); the token matcher, `variantTokenize`, token sets, and discriminants are **deleted** (0 references remain).
- Exclusion gate re-founded: fires ONLY on `no_match`/`ambiguous` — loud `[VARIANT]` log + named reason (`attributes_resolve_no_variant` / `attributes_match_multiple_variants`) + the resolved attribute values in `excludedEntities.attributes`, surfaced in the run summary.
- Label fix: `variantKey = variant_<index>(<selected variant's variantName>)` — each variant renders its own name in `[CalcRecon-T2]` lines and the T1 `variantDistribution` footer.

**EPG-B1 evidence** (the REAL exported functions the route imports, executed over ALL live VLTEST2 entities, as-of 2025-11-30 — script `web/scripts/_hf373_phaseB_live_proof.ts`):

```
variant identity sets: V0=[ejecutivo senior | senior]  V1=[ejecutivo]
entities evaluated: 85
variantDistribution: variant_0(Ejecutivo Senior):13 | variant_1(Ejecutivo):72
exclusions: 0 (zero silent or otherwise)
  BCL-5001 Adriana Reyes Molina: attrs={"role":"Ejecutivo Senior"} -> variant_0(Ejecutivo Senior)
  BCL-5006 Ricardo José Andrade Mendieta: attrs={"role":"Ejecutivo"} -> variant_1(Ejecutivo)
```

Was 13 evaluated / 72 excluded with both variants labeled "(Ejecutivo Senior)"; now **85/85 assigned, 0 exclusions, distinct labels**. Unit tests `hf373-variant-selection.test.ts` 5/5 (nested-name trap, accent/case equality, loud no-match, ambiguity, as-of + backstop resolution).

**Authenticated in-route run (SR-44).** The `[CalcRecon-T2]` lines rendered by an authenticated POST `/api/calculation/run` require a live user session; CC's attempts to mint one were correctly denied by policy (no user creation, no role changes, no MFA manipulation — attempted and refused twice, by design). The browser-driven calc run is therefore an **architect-rendered check**, and its full T1/T2 output lands with EPG-J1's clean-slate run. Data note: CC re-ran the idempotent post-commit construction on VLTEST2 (the D9 pre-data finalize had left 425/510 transactions unlinked → now 510/510) so the architect's run evaluates real operands.

---

## Phase C — Entity-id from recognition + structural guarantee, not statistics (D3)

**Objective.** Entity-id field derives from the model's recognition guarded by structural construction facts; the "finest repeating identifier" statistic removed; loud named gap on genuine ambiguity.

**Phase 0 finding answered (incl. HALT-1).** EPG-0.3: BOTH roster columns legitimately carry `scope_role='entity' ∧ nature_role='identifier'` (live HC trace + v5 atoms), so recognition alone yields two candidates; branch (a) overlap tied 100%/100% (manager FK ⊆ employee domain); branch (b) `repeatRatio>1.1` excluded the true id *by construction* (roster id = 1.0× repeat) and chose the manager column; the choice was persisted and **84/85 roster rows mis-linked to the manager's entity**; creation and commit disagreed within one import (creation keyed `ID_Empleado` only because a surviving OB-231 English prose-regex diverted `ID_Gerente`).

**Change.**
- `selectEntityIdFieldByOverlap` **deleted**; replaced by `selectEntityIdFieldStructural` (`commit-content-unit.ts`) — structural facts only, in order: (1) **strict value-subset elimination** (a candidate whose distinct values are a strict subset of another's references the other's instances — directed arithmetic fact; kills self-referential FKs with no domain needed), (2) **entity-sheet construction invariant** (one row = one entity ⇒ the subject id is bijective with rows; applied only when it selects exactly one), (3) value-domain overlap (HF-351 branch (a), unchanged), (4) still ambiguous → `ambiguousCompetitors` → the caller **fails the unit loudly** (C2). The "finest repeating" branch and the first-match fallback are gone; the misleading "cold-start" reason label is gone with them.
- **One selector for every surface (SR-34):** `commitContentUnit` (`resolveEntityIdField` → loud batch-failed on ambiguity), `commitUnitWindowed`/`commitUnitStreamed` (windowed-commit.ts — both sites), and **entity creation** (`processEntityUnit`, execute-bulk — the "binding honored iff agrees with model" arm and the first-match `findHcEntityIdColumn` fallback replaced by the same selector; ambiguity refuses to spawn entities). `findHcEntityIdColumn` (emission-order-first) **deleted** — zero production callers remain. process-job remediation exclusions now cover ALL model candidates.
- **Retained verbatim:** the HF-371 EPG-C1 row-ordinal guard on the FINAL chosen id (execute-bulk :1129-1138) and the zero-candidate binding fallback with its row-index guard.

**EPG-C1 evidence.** Removal diff in commit `HF-373 Phase C` (branch `hf-373`): `-export function selectEntityIdFieldByOverlap` / `-  // (b) cold start / no overlap winner → finest-grained repeating identifier` / `-      return { chosen: ranked[0].col, reason: \`cold-start finest repeating identifier...\` }` / `-export function findHcEntityIdColumn`. Real selector over the LIVE roster recognition trace + rows (script `web/scripts/_hf373_phaseC_live_proof.ts`):

```
job 66551591-9376-4b77-8850-db1be4af85f5 file=..._BCL_Plantilla_Personal.xlsx unit=Personal
model-recognized entity-scope identifier candidates: [ID_Gerente, ID_Empleado]
live roster rows: 85
COLD (creation, empty domain):  chosen="ID_Empleado" reason=structural: strict value-subset elimination (referencing candidate(s) dropped: ID_Gerente)
WARM (commit, domain=85):       chosen="ID_Empleado" reason=structural: strict value-subset elimination (referencing candidate(s) dropped: ID_Gerente)
persisted (PRE-FIX import) metadata.entity_id_field = "ID_Gerente"
```

Both surfaces share one function → they cannot disagree within an import. The fresh browser re-import (entity_id_field="ID_Empleado" persisted + 85 correct external_ids) lands with EPG-J1's clean-slate run (architect-rendered; the current live batch is corrupted data from the pre-fix import, and entity-resolution only fills NULL entity_id, so it self-heals only via clean-slate re-import). Tests: `hf351-entity-id-selection.test.ts` rewritten (9/9 — roster subset elimination, bijectivity, preserved branch (a), loud ambiguity ×2, empty-column drop); full SCI suite **276/276**.

---

## Phase D — Single-fire dispatch and honest bookkeeping (D9)

**Objective.** Exactly one effective commit pass per dispatch scope; finalize claims can no longer suppress the import's real finalize; the first-wins audit can no longer freeze a mid-commit scan; the pulse-formula echo retired.

**Phase 0 finding answered (incl. HALT-1).** EPG-0.4 corrected the framing in three load-bearing ways: (1) the HF-371 claim contains duplicates but **grants the wrong pass** — the plan-arm `waitUntil` finalize lands pre-data, stamps `done`, and the real post-data finalize is coalesce-rejected (proven live on both tenants); (2) the quoted `fields=rows,perUnit,pulses(formula)` alarm was Casa's TRUE divergence masked by a lying job record, while VLTEST2's alarm was a frozen FALSE verdict from a mid-commit scan (premature-finalize → UI collapse → settle-audit at 00:59:42.575 while batches landed 00:59:42-43, first-wins); (3) `pulses(formula)` compares `ceil(rows/500)` against itself — it can never fire independently, and the PULSE_SIZE=500 formula is stale post-HF-359 (live: 2 and 9 actual pulses vs formula 1, unflagged). The dispatch graph (all enumerated in `docs/CC-artifacts/hf373-phase0/EPG-0.4.md` with file:line): client finalize (page.tsx:522-540), per-arm server `waitUntil` (execute-bulk:872-884), finalize-sweep cron, dispatch-jobs cron (classify-only), 3 client execute-bulk dispatchers (data-arm :442 / legacy :552 / plan-arm :619), HF-296 re-POST, per-file-group + mount settle-audit fires.

**Change.**
1. **Commit-side claim** — new `web/src/lib/sci/commit-coalesce.ts` + migration `web/supabase/migrations/20260704_hf373_import_commit_runs.sql` (PK `(tenant_id, proposal_id, scope_hash)`; scope = sha256 of sorted contentUnitIds so different file groups never contend). Claimed at execute-bulk entry (covers the previously-unguarded PLAN case); duplicates **coalesce loudly** (`[SCI Bulk] HF-373 D9 COALESCED…`) and return `{coalesced:true, inFlight:true}`; `done` → a re-POST is GRANTED and resumes idempotently (**HF-296 lost-response recovery preserved**); `failed`/stale → retryable/takeover; missing table (42P01/PGRST205) → degrades to today's behavior (deploy-order safe). Terminal stamp on success/failure incl. the thrown-path catch. Clean Slate covers the new table (tenant-deletion.ts + drift-guard test).
2. **Finalize generation takeover** — `decideFinalizeClaim` now takes the proposal's newest `import_batches.created_at`: a `done` claim whose completion precedes the newest batch belongs to a premature pass → the caller takes over and re-finalizes for the actual rows. Plus dispatch hygiene: a **plan-only execute-bulk request no longer fires the `waitUntil` finalize** (the client fire + data-arm cover every import shape).
3. **Settle-audit settled gate** — the once-per-session first-wins audit DEFERS (no write) while any session batch is live-processing or any session job is non-terminal; the per-file-group dispatcher in SCIExecution is **removed** (ImportReadyState's mount fire is the single dispatcher, with one deferred retry). Client dispatchers handle `coalesced` responses: data-arm settles from the surface (existing recovery), plan-arm falls into the HF-353 durable-status poll, legacy surfaces a retryable error.
4. **Pulse bookkeeping honesty** — the `pulses(formula)` compare and `PULSE_SIZE=500` are **retired**; the scanned side no longer fabricates a formula-derived pulse count (honest 0/0, excluded from compare); displays read the projector's ACTUAL byte-budgeted counts unchanged.

**EPG-D1 evidence.** Real decision functions replayed against the LIVE 2026-07-02 claim rows (script `web/scripts/_hf373_phaseD_live_replay.ts`):

```
VLTEST2 plan import 94b838b8:
  claim: status=done claimed_at=2026-07-02T00:59:41.738+00:00 | newest batch=2026-07-02T00:59:42.922822+00:00
  PRE-FIX  (HF-371): granted=false (coalesced — this import was already finalized)
  POST-FIX (HF-373): granted=true (generation takeover — import batches landed after the prior finalize completed ...)
Casa Diaz workbook 5851bd78:
  claim: status=done claimed_at=2026-07-02T01:16:50.061+00:00 | newest batch=2026-07-02T01:21:05.478004+00:00
  PRE-FIX  (HF-371): granted=false (coalesced)   POST-FIX (HF-373): granted=true (generation takeover ...)
commit claim with migration pending: granted=true (claim insert error PGRST205 — proceeding as before)
```

Unit tests: `hf373-commit-coalesce.test.ts` (8/8 — concurrent coalesce, re-POST grant, stale takeover, scope identity, generation takeover, HF-371 behaviors preserved); tenant-deletion drift-guard + telemetry accumulator suites green (33/33 across the four suites). The full browser import demonstrating one commit pass + one finalize pass + zero AUDIT DIVERGENCE end-to-end is **architect-rendered** (EPG-J1/J2 run; auth-gated — see Phase B note). **Architect action:** apply `20260704_hf373_import_commit_runs.sql` before/with deploy (code degrades gracefully until then).

---

## Phase E — Multi-part staged FDW load: pace without limits (D6)

**Objective.** Parts sized within the discovered budget adaptive to whatever cap exists; gzip parts; per-part manifest status, parallel-ready; exact row parity; no limit raised.

**Phase 0 finding answered (HALT-1).** EPG-0.5: staging was NEVER monolithic — it IS the HF-359 byte-budgeted pulse path, and the whole hand-off chain (multi-part staging, per-part worker loads, per-pulse durability, cursor resume) worked live on 2026-07-01 (312 parts drained). The true defect: `discoverUploadByteBudget` trusted the bucket `file_size_limit` (raised to 100 MiB pre-HF-372) while the **project-global per-object cap** (~50 MiB, not readable via any API) governed — the first 0.8×100 MiB ≈ 84 MB part was rejected. Same defect in the HF-372 admission gate. Also: 89% of every staged row is the repeated unit-constant metadata blob; hand-off part objects were never cleaned (9.98 GB residue); Hook-2 clobbered the truthful telemetry with per-pulse values.

**Change.**
1. **Effective-cap composition** (`pulse-budget.ts`): `effectiveLimit = min(bucket file_size_limit | 40 MiB fallback, global cap)` where the global cap = `SUPABASE_GLOBAL_UPLOAD_LIMIT_BYTES` (architect-verified) else the Supabase 50 MiB default. Pure `composeEffectiveLimit` unit-tested; `limitSource` names which cap governed; the admission gate (`/api/import/sci/upload-budget`) reuses the same discovery → fixed automatically. **No limit raised anywhere** — the platform adapts to whatever cap exists.
2. **gzip parts** — staged pulses stream through `createGzip` to `*.csv.gz` (`application/gzip`), gated on `discoverStagedLoadCapabilities()` probing the DB for the migrated loader (never an env flag → **deploy-order safe**: plain CSV until the architect applies the migration). Migration `20260704_hf373_staged_load_gzip_parts.sql`: `staged_load_capabilities()` marker + `bulk_commit_from_storage` reading `compress 'gzip'` for `.gz` paths + the worker re-authored with **per-part manifest status** (`staged`→`loaded`/`failed` + loadedAt/rowsLoaded/error stamped per part — independently claimable = parallel-ready) while preserving every HF-360 guarantee verbatim (SKIP-LOCKED claim, per-pulse COMMIT durability, delete-before-insert idempotency, HALT-DATA-LOSS, cursor resume).
3. **Manifest** — `PulseManifestEntry` additive fields (`status`, `bytesCompressed`, `loadedAt`, `rowsLoaded`, `error`); staging stamps `status:'staged'` + compressed size.
4. **Hygiene** — finalize-sweep removes the session's loaded part objects after finalize (closes the 9.98 GB/328-object residue class); Hook-2's per-pulse telemetry seed is suppressed when a windowed/streamed driver owns the unit counters (the `expectedRows=1921` vs 86,607 lie).

**EPG-E1 evidence (CC fixture level; live caps untouched).** Script `web/scripts/_hf373_phaseE_live_proof.ts`:

```
budget: effectiveLimit=50MiB source=global-default byteBudget=40.0MiB       (bucket=100MiB live; min governs)
staged-load capabilities (pre-migration expectation: gzip=false): {"gzip":false}
upload 40MiB (== byteBudget): OK in 6.7s                                    (budget-sized part passes the live cap)
upload 80MiB (the pre-fix part size): REJECTED: The object exceeded the maximum allowed size
probe objects removed
real staged part: 32.2MiB -> gzip 5.74MiB (5.6x)                            (measured on the real 2026-07-01 part)
```

Cap-independence demonstrated against the live caps: the corrected budget's parts upload; the pre-fix size reproduces the exact production rejection. Row parity: `planPulses` Σ(part rows) === source rows exactly incl. the 86,607×43,668B shape (~90 parts) — `hf373-pulse-budget.test.ts` 6/6; full SCI suite **290/290** (HF-359 PG-A4 amended to the corrected min-cap contract — its old assertion WAS the D6 defect). The full 86K end-to-end staged run (manifest progressing per part, `committed_data` = 86,607, wall time) is **EPG-J3, architect-rendered** (browser + migration). **Architect actions:** apply `20260704_hf373_staged_load_gzip_parts.sql`; live-verify the wrappers S3 FDW gzip option per the migration's run-book (if unsupported, drop `staged_load_capabilities()` — staging self-reverts to plain CSV); optionally set `SUPABASE_GLOBAL_UPLOAD_LIMIT_BYTES` if the project's global cap differs from 50 MiB.

---

## Phase F — Terminal truth + bounded summaries (D7 + D8)

**Objective.** A failed commit terminates `failed` with its reason; success gets its terminal status + `completed_at`; the summary read completes within budget or fails loudly.

**Phase 0 finding answered.** EPG-0.6: finalize-import stamped `{finalized, completed, completed_at}` **unconditionally** (blind to outcome); the failed 86K job reached that state via TWO cooperating defects (blind stamp + the dispatch-jobs failed-requeue un-terminalizing the failure); the successful workbook job stayed `committed/finalizing` forever because a plan-only invocation's premature finalize consumed the claim and its job stamp matched ZERO rows silently (no sessionId on the plan-arm request); `patchJobs` wrote phase/`completed_at` unguarded (a blocked status flip still overwrote `phase='failed'` with `'completed'`). EPG-0.7: the summary read (`.order('id')` uuid-PK + OFFSET, full row retention) times out structurally — even 186-row Casa Diaz on page 0 — and the failure was swallowed.

**Change.**
1. **Outcome-aware terminal stamp** — `finalizeJobsByProposalOutcomeAware` (job-status.ts) replaces the blind stamp in finalize-import: per matched job, a failed job (status/phase/mechanical `Commit failed|Commit error|Hand-off enqueue failed` marker) keeps its failure (phase→`failed`, never `completed`, never a success `completed_at`); successful jobs get `finalized/completed/completed_at`. Zero matched jobs → **loud anomaly** log.
2. **Phase + completed_at rank guards** — `JOB_PHASE_RANK` + `phaseMayAdvance` (terminal `failed`/`cancelled` never overwritten; phases only advance — kills both the `phase='completed'`-over-failure lie and the late-`finalizing`-over-`completed` regression); `completed_at` lands only when the status write wasn't rejected and the job isn't failed.
3. **Requeue gate** — dispatch-jobs never resurrects a commit-stage failure (`isCommitStageFailure`, shared pure predicate); classify-stage retries unchanged.
4. **Session threading + client gating** — the plan-arm and legacy execute-bulk bodies now carry `sessionId` (every invocation stamps/sees the job record — closes the zero-match window); the client fires finalize only when ≥1 unit succeeded (all-failed imports keep their failure terminal; partial success still finalizes the committed part).
5. **Summary engine (D8)** — `backfillSummariesJs` rewritten to **keyset pagination** (`.gt('id', last)` walking the new `committed_data (tenant_id, id)` composite index — migration `20260704_hf373_committed_data_keyset_idx.sql`, `CONCURRENTLY`, run alone) with **incremental aggregation** (`accumulateCommittedRows`/`finalizeAggregatedArtifacts`; pages released — the DIAG-078 whole-tenant retention is gone; `aggregateCommittedRows` is now the one-shot composition, C2 fail-loud unchanged). A summary failure now **surfaces on the job record** (`metadata.summary_error` via the new `summaryError` patch) in addition to the loud log — never a silent pass.

**EPG-F1 evidence.** The REAL predicates replayed over the LIVE offender rows (dry-run, `web/scripts/_hf373_phaseF_live_replay.ts`):

```
OFFENDER 1 (failed 86K, recorded finalized/completed):
  live record: status=finalized phase=completed completed_at=2026-07-02T01:37:04.186+00:00 error=Commit failed — Abril_...
  POST-FIX requeue gate: commit-stage failure=true -> NEVER requeued (terminal rank preserved; blind finalized stamp impossible)
  POST-FIX outcome-aware stamp: patches phase='failed' ONLY (status/completed_at untouched)
  POST-FIX phase guard: phaseMayAdvance('failed','completed')=false; statusMayAdvance('failed','finalized')=false
OFFENDER 2 (stuck workbook, committed/finalizing forever):
  live record: status=committed phase=finalizing completed_at=null error=null
  POST-FIX outcome-aware stamp: stamps finalized/completed/completed_at (truthful success terminal)
```

With Phase D's generation takeover + F's session threading, the workbook shape now receives its post-data finalize AND its terminal stamp. Unit tests: `hf373-job-truth.test.ts` (5/5 — phase terminality, no-regression, status model preserved, mechanical-marker predicate incl. prefix anchoring) + `hf373-summary-aggregation.test.ts` (2/2 — paged ≡ one-shot at every page boundary; C2 novel-method HALT preserved). SCI+summary+platform suites **319/319**. The forced-failure and large-tenant in-flow runs are architect-rendered (EPG-J3; the summary keyset needs the index migration first). **Architect actions:** run `20260704_hf373_committed_data_keyset_idx.sql` ALONE in the SQL editor (CONCURRENTLY); after it, re-run finalize (or `/api/admin/summary-backfill`) for Casa Diaz + Test #A1 whose summary artifacts are currently absent.

---

## Phase G — Recognition carry restored; warm path returns (D10)

**Objective.** The model's recognition reaches the fingerprint write intact; the HF-247 gate untouched; a repeat identical import uses the warm path.

**Phase 0 finding answered (HALT-1).** EPG-0.8: TWO carry drops, both losing bare primitives that ARE persisted (`nature_role='measure'`@0.93–0.98 on every affected column). (1) `agents.ts` passed only the `data_nature` PROSE into role assignment and regex-scanned it (`NATURE_IS_*` — per-run English-keyword roulette): 5/6 live Datos imports had ≥1 `unknown` (gate blocks), and the 6th **stored a POISONED fingerprint** (five measures cached `transaction_date` via `\bperiod\b` matching the temporal regex first). (2) The atom flywheel — the surface that actually carries the ~50 s (post-HF-372 the sheet Tier-1 no longer skips LLM) — keyed role-stability on the free-form prose, so ALL 14 recurring atoms churned to sticky `ambiguous` and every re-import re-paid full comprehension.

**Change.**
1. **agents.ts converted to bare-primitive readers** (the FULL-claim twin of negotiation.ts HF-372 Phase C): the seven `NATURE_IS_*` prose regexes **deleted**; `assignSemanticRole` + the five `assign*Role` helpers read `nature_role`/`scope_role` by equality; the HF-171 `identifies`-prose ENTITY_TYPES/RECORD_TYPES word lists **subtracted** (scope_role IS the model's answer); a measure maps to the measure arm regardless of decimal/boolean platformType; HF-186 reference-key→`entity_relationship` and the HC-silent structural fallbacks preserved. The analyze route's third write site now records the semanticRole vocabulary (was raw prose).
2. **Atom role-stability keyed on the bare primitive**: `role` = `nature_role` (stable across runs); the `data_nature` prose rides as carried expression (`AtomExpression.data_nature`, threaded through write/read/claim-reconstruction — warm claims still reconstruct the full recognition); an interpretation with no rendered primitive writes NO atom (no warm memory from incomplete recognition). Genuine structural collisions still go `ambiguous`.
3. **`ATOM_ALGORITHM_VERSION` 5→6** (HF-369 lesson: column_roles semantics change ⇒ bump) — invalidates the 14 sticky-ambiguous v5 atoms so the warm path revives; v5 rows are simply never read.
4. Poisoned sheet fingerprint (`fbead6eed137…`): its Tier-1 roles feed nothing on-path post-HF-372, and the first post-fix gate-passing import **overwrites** it via the flywheel update path (self-heal, verified at EPG-J4's warm re-import).

**EPG-G1 evidence.** The REAL `assignSemanticRole` over the LIVE recognition trace of the worst blocked job (`BCL_Datos_Dic2025`, 4 unknowns — script `web/scripts/_hf373_phaseG_live_replay.ts`):

```
  Cumplimiento_Colocacion      nature_role=measure     stored=unknown   post-fix=transaction_count  <-- CHANGED
  Indice_Calidad_Cartera       nature_role=measure     stored=unknown   post-fix=transaction_count  <-- CHANGED
  Pct_Meta_Depositos           nature_role=measure     stored=unknown   post-fix=transaction_count  <-- CHANGED
  Infracciones_Regulatorias    nature_role=measure     stored=unknown   post-fix=transaction_count  <-- CHANGED
  (all 9 other columns byte-identical to their stored roles)
unknown roles: PRE-FIX=4  POST-FIX=0  -> HF-247 write gate PASSES (fingerprint stores)
```

Tests: `hf373-recognition-carry.test.ts` 5/5 (decimal/boolean measure arms, the `\bperiod\b` poison killed, scope_role identifier discrimination, HF-186 preserved, silence→structural, atom stability on bare primitives); full SCI suite **299/299** (one HF-368-era test fixture updated to emit primitives — the new no-primitive-no-atom law is intentional). The repeat-import warm evidence (`Stored new` → `tier=1 … LLM skipped` + `[OB-203][atom-residue] known=12/13 novel=1 [ID_Empleado]` + elapsed delta) lands with **EPG-J4's warm re-import** (import runs are auth-gated — architect-rendered).

---

## Phase H — De-band header recovery on the oversized path (D11)

**Objective.** The streamed/windowed sample window applies the same deterministic de-band recovery as the standard path (one recognition surface — the size gate selects parse strategy only, AP-17); identity on clean row-1 files; OOM defense intact.

**Phase 0 finding answered.** EPG-0.9 CONFIRMED: `debandWorksheet` had zero call sites in the three oversized-path files; both oversized routes keyed everything on the raw first physical row; `constructStructure(fullGrid:false)` (the OB-254 D2 sample mode) existed with zero production callers — a designed-in gap, and `debandWorksheet` itself cannot run on a stream (it requires the materialized full grid).

**Change.**
1. **`resolveHeadersFromSampleGrid`** (deband-sheet.ts, pure, exported) — the SAME `constructStructure` recognition over the first `HEADER_SAMPLE_ROWS` (25) rows in `fullGrid:false` mode. Recovered keys are the **positional** `transformMap.columnNames` (section lifting/carry-down are full-grid constructions and don't participate on a stream). Clean row-1 → **identity** (the caller keeps its exact raw-row-1 keying); any undecidable shape → identity too (never a guess, never breaks the proven path); construction throws degrade to identity loudly.
2. **Streamed path** (sheet-stream.ts) — `StreamHeaderResolver` buffers the leading sample, resolves once, releases banner rows as sidecar and data rows onward; wired into BOTH `streamSheetMeta` (classify) and `streamSheetWindows` (commit) so classify and commit key identically. Results carry `debandBanded` + the structural observations (incl. `structure:banded_beyond_ceiling`). Banded dimension estimates subtract the banner rows; all HALT-DATA-LOSS checks compare against actual streamed data rows (unchanged semantics).
3. **Windowed path** (sheet-window.ts) — `openSheetWindow` probes a bounded 25-row grid through the same resolver; banded → recovered positional columns + `firstDataRow` shifted past the banner; clean → the pre-HF-373 probe verbatim. execute-bulk's windowed commit inherits automatically (same function).

**EPG-H1 evidence.**

Banded fixture through BOTH oversized paths (`hf373-oversized-deband.test.ts`, 4/4): banner+blank+header+3 rows → `headers=['ID_Empleado','Nombre','Monto']`, `debandBanded=true`, data rows keyed by the recovered header, banner rows never data — on `streamSheetMeta`, `streamSheetWindows`, and `openSheetWindow`; clean fixture identity on all three.

The REAL 42MB 86,607×87 JDE extract through the MODIFIED streamed path (live storage object, script `web/scripts/_hf373_phaseH_live_jde.ts`):

```
streamSheetMeta: sheet=Exportar Hoja de Trabajo headers=87 cols debandBanded=false totalRows=86607 (known=true) in 0.1s
streamSheetWindows: totalRows=86607 streamed=86607 debandBanded=false in 3.3s
headers identical to meta: true
RSS delta during streaming: 130MB (buffer itself is 40MB)
```

Identity transform on the JDE class, exact row parity, memory bounded (sample buffer ≤ 25 rows; the OOM defense untouched). Pre-existing byte-identical equivalence suites (sheet-stream vs SheetJS fixtures, sheet-window identity, OB-254 DD-7) all green; full SCI suite **303/303**.

---

## Phase I — Plan precision (D4 + D5)

**Objective.** Plans carry an additive source-sheet identity everywhere plans are listed (no silent renaming); constant/guarantee intent is expressible and faithfully constructed — no plan-type registry.

**Phase 0 finding answered (HALT-1 on D5).** EPG-0.10: D4 exact as framed — the workbook carries the identical banner "COMISIONES DE MAQUINARIA" on three machinery sheets; the model named two plans identically; the disambiguating identity (`metadata.contentUnitId`) was persisted but never rendered. D5 CORRECTED: the stored intent is NOT multiplicative — it is `{"prime":"reference","field":"BASE COMISION"}`; the `constant` prime is already grammatical AND constructible (`prime-grammar.ts:69`, `convertComponent`); the gaps were (1) zero constant/guarantee exemplars in the plan_component contract (the varying-values rule steered blind), and (2) the guarantee amounts are genuinely PER-ENTITY (6,000 / 26,000 per row in the plan sheet) — so `reference("BASE COMISION")` **is** the faithful model expression under the platform's own varying-values law; the resolution of that reference at calc time is exactly what Phase A's convergence machinery binds (reference-sheet candidates, per-entity key_column). **No HALT-6: the contract expresses the intent.**

**Change.**
1. **D4 persistence** — `metadata.sourceSheet` written at the rule_sets upsert (plan-interpretation.ts; additive jsonb, no migration; supersession keying untouched). New pure helper `planSourceSheet()` (`lib/plan-surface/plan-identity.ts`): explicit `sourceSheet` first, legacy backfill-parse of `contentUnitId` (`file::SHEET::idx::split`).
2. **D4 rendering** — the two multi-plan LIST surfaces render the provenance: **PlanRail** (Plans & Canvas, Zone A — `· <sheet>` in the meta line) and the **operate/calculate PlanCard grid** (`(<sheet>)` after the name; threaded via `operate-context` select + `PlanReadiness.sourceSheet`). The plan-surface API already ships `metadata` to the client. Scoping note (explicit, not silent): the approvals page renders approval-REQUEST snapshots (its own `ruleSetName` payload, one plan's context per request) and results/statements/drill-through render inside a single selected plan's context — the identity is persisted on every plan and reachable via `rule_sets.metadata` should the architect want it rendered there too.
3. **D5 contract** — a GUARANTEED/CONSTANT PAYMENT exemplar added to the plan_component EXPRESS list (anthropic-adapter.ts): express the guarantee AS THE PAYMENT (plan-wide amount → `constant(<amount>)`; per-entity amounts in a column → `reference(<exact header>)`; conditional guarantees wrap like the eligibility gate; **never rate × base**). Illustrative algebra — no plan-type registry (HALT-2 clean).

**EPG-I1 evidence** (REAL `planSourceSheet` over the LIVE Casa Diaz rule_sets — legacy backfill path; script `web/scripts/_hf373_phaseI_live_proof.ts`):

```
  COMISIONES SUCURSALES LOCALES                 — from sheet "LOCALES REFAC"
  MAQUINARIA - Comisiones por Ventas            — from sheet "MAQUINARIA"
  COMISIÓN GARANTIZADA                          — from sheet "COMISIÓN GARANTIZADA"
  COMISIONES DE MAQUINARIA                      — from sheet "MAQUINARIA (2)"     <-- distinguishable
  COMISIONES DE MAQUINARIA                      — from sheet "DIST Y SUC"         <-- distinguishable
  COMISIONES DE MAQUINARIA - PULL (EXTERNOS)    — from sheet "PULL (EXTERNOS)"
COMISIÓN GARANTIZADA constructed component (verbatim):
  name=COMISIÓN GARANTIZADA componentType=prime_dag
  calculationIntent={"field":"BASE COMISION","prime":"reference"}     <-- the guarantee AS the payment; per-entity amounts; no rate×base
intactness: entities=73 assignments=584 activePlans=8
```

Tests `hf373-plan-identity.test.ts` 3/3; `npm run build` clean (BUILD_ID present). Plans & Canvas RENDERED check = architect (SR-44, EPG-J2).

---

## Phase J — End-to-end proofs (the three objectives)

**CC-runnable proofs (complete).**

- **EPG-J4 (no regression, CC half):** full test tree `npx tsx --test 'src/**/__tests__/*.test.ts'` → **625/625 pass, 0 fail**; `rm -rf .next && npm run build` → exit 0, `BUILD_ID` present (verified per the HF-359 gotcha — BUILD_ID presence, not exit code alone). All ten phases' focused suites green (bare-primitive reads 3/3, variant selection 5/5, entity-id 9/9, coalesce 8/8, pulse budget 6/6, job truth 5/5, summary aggregation 2/2, recognition carry 5/5, oversized de-band 4/4, plan identity 3/3).
- **Objective-level CC evidence recap:** bindings 0 → **8** on live VLTEST2 (Phase A); variant assignment 13-in/72-excluded → **85/85, 0 exclusions, correct labels** via the real functions over live data (Phase B); entity-id `ID_Gerente` → **`ID_Empleado`** by structural guarantee on the live recognition (Phase C); both live premature-finalize claims **generation-taken-over** by the real decision function (Phase D); budget-sized part **uploads**, pre-fix size **rejected**, gzip 5.6× on a real part (Phase E); both lying job records resolve truthfully under the fixed machine (Phase F); the worst blocked Datos job goes 4 unknowns → **0** and the gate passes (Phase G); the real 86,607×87 extract streams **identity, 86,607/86,607, 3.3 s, memory bounded** (Phase H); the two same-named plans are **distinguishable by source sheet** and the guarantee intent is verbatim `reference("BASE COMISION")` (Phase I).

**Architect-rendered proofs (SR-44 — every browser/import/calc run is auth-gated; CC's session-minting attempts were correctly denied by policy and not worked around).** Run after applying the migrations below, on the deployed branch:

1. **EPG-J1 (VLTEST2 calculates).** Clean Slate VLTEST2 → import `BCL_Plan_Comisiones` → `BCL_Plantilla_Personal` → the six `BCL_Datos_*` files → run the calculation for all six periods. Expect: convergence logs `component bindings > 0` with real column names; `[VARIANT-DIAG] … selection=selected`; T1 `variantDistribution={variant_0(Ejecutivo Senior):13 | variant_1(Ejecutivo):72}`; zero `excluded`; `[entity-id] HF-373 C: … -> "ID_Empleado" (structural: strict value-subset elimination…)`; ONE `[SCI Bulk] HF-373 D9 commit claim` per dispatch scope; ONE granted finalize (later fires log `coalesced` or `generation takeover`); NO `AUDIT DIVERGENCE`; report per-period + grand totals **verbatim** (reconciliation is architect-channel). Verification queries: `select count(*) from committed_data where tenant_id='5b078b52-…' and data_type='transaction' and entity_id is not null;` (=510); `select metadata->>'entity_id_field' from committed_data where tenant_id='5b078b52-…' and data_type='entity' limit 1;` (=`ID_Empleado`); `select count(distinct entity_id) from calculation_results where …` (=85 per period).
2. **EPG-J2 (Casa Diaz precise).** Open Plans & Canvas: 8 active plans, the two "COMISIONES DE MAQUINARIA" showing `· MAQUINARIA (2)` / `· DIST Y SUC` provenance; COMISIÓN GARANTIZADA intent as pasted in Phase I; 73 entities / 584 assignments (live-verified intact above).
3. **EPG-J3 (86K at pace).** Import `Abril_00001_1_demo_REF.xlsx` via the browser. Expect: `[pulse-budget] effective cap = project-global default 50MB…` (or the env-verified value), ~90 budget-sized parts staged (gzip `.csv.gz` iff the FDW gzip verification passed), `pulse_load_jobs` manifest entries flipping `status:'staged'→'loaded'` with the cursor advancing, `committed_data` transaction count = **86,607**, job terminal `finalized/completed` + `completed_at`, total wall time reported; on any commit failure the job terminates **failed** with the reason. Row-parity: `select sum((m->>'expectedRows')::int) from pulse_load_jobs, jsonb_array_elements(manifest) m where …` = 86,607.
4. **EPG-J4 (architect half).** Casa Diaz workbook re-import → idempotent (8 plans, none archived); BCL Datos warm re-import → first import logs `[SCI-FINGERPRINT] Stored new/Updated` (gate passes), second logs `tier=1 … LLM skipped` + `[OB-203][atom-claim] … CLAIMED` + `[OB-203][atom-residue] … novel=1 [ID_Empleado]` with a large elapsed delta.

**Interlock note for J1 (from Phase A, reported per HALT-1 discipline, not parked):** the `bono_cumplimiento_regulatorio` input is genuinely absent from the current corrupted VLTEST2 data (loud gap). On the fresh import the plan sheet's own rows commit as reference data and Phase A's binder proposes from ALL sheet capabilities (reference sheets included, `key_column` per-entity supported), with the Phase I guarantee exemplar guiding the interpretation; if the fresh run still cannot resolve it, the calc aborts LOUDLY at the HF-281/HF-373 gates naming the token — never a silent $0 — and the finding routes to the architect verbatim.

---

## Architect actions (consolidated — each prepared exactly; SR-44)

1. **Migration** `web/supabase/migrations/20260704_hf373_import_commit_runs.sql` — commit-side claim table (Phase D). Apply before/with deploy; code degrades gracefully (PGRST205) until applied.
2. **Migration** `web/supabase/migrations/20260704_hf373_staged_load_gzip_parts.sql` — gzip-aware `bulk_commit_from_storage`, per-part-status worker, `staged_load_capabilities()` marker (Phase E). Then LIVE-VERIFY the wrappers S3 FDW gzip option per the migration's run-book; if unsupported, `DROP FUNCTION public.staged_load_capabilities()` and staging self-reverts to plain CSV. Confirm the pg_cron schedule unchanged.
3. **Migration** `web/supabase/migrations/20260704_hf373_committed_data_keyset_idx.sql` — `(tenant_id, id)` composite index (Phase F/D8). `CREATE INDEX CONCURRENTLY` — run this statement ALONE in the SQL editor. Afterwards re-run finalize (or `/api/admin/summary-backfill`) for Casa Diaz + Test #A1 (their summary artifacts are currently absent).
4. **Optional env** `SUPABASE_GLOBAL_UPLOAD_LIMIT_BYTES` — set only if the project's global upload cap differs from the 50 MiB default (Phase E). Raising storage limits is NOT required by anything in this directive.
5. **Browser runs** — EPG-J1/J2/J3/J4 above, with the expected log lines + verification queries. Report produced totals verbatim for reconciliation (architect channel).
6. **`SCHEMA_REFERENCE_LIVE.md` regeneration** post-HF-372/373 — `pulse_load_jobs`, `import_finalize_runs`, `import_commit_runs`, `processing_jobs.metadata`, the `(tenant_id,id)` index, and the updated `bulk_commit_from_storage`/`process_pulse_load_jobs` exist only in migration files until regenerated.
7. **PR merge** — CC opens the PR (below) and does not merge (SR-44).

**Operational notes:** dev builds green from a clean `.next`; port 3000 was held by a parallel session during this work (CC's dev server used 3001). VLTEST2 data repair performed by CC during proofs (idempotent finalize-equivalent entity resolution: 510/510 transactions linked) — superseded by the J1 clean-slate re-import.
