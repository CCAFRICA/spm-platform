# OB-255 — Phase 1: Surface Discovery + Consumer Map (EPG-1) + Insertion-Point Decision

Branch `ob-255-tabular-plan-construction` @ `0b34e77b`. Date 2026-06-29. Evidence: 4 parallel subsystem maps + first-hand reads of the decisive sites + live DB queries (proven rule_set shape, Casa Diaz current state). **Conclusion: the existing pipeline can be extended without a fork, but the realization revives the deliberately-inert PARTIAL-claims mechanism (HF-106) — a Phase-1 architect-decision gate, surfaced below, exactly as OB-254 surfaced its HALT-1.**

---

## §0 — Live state correction (since the directive was written)

The directive §1 describes "186 rows in committed_data, 42 entities" for Casa Diaz. **That state is gone** — `tenant 2d9979ba` now has **0 committed_data, 0 entities, 0 rule_sets** (the architect's HF-356 cleanup ran). This is fine — it means the EPG harnesses re-run the import from the file (`COMISIONES___AUTORIZADOS_-_copia.xlsx` in `ingestion-raw`) on a clean slate rather than reading stale rows.

---

## §1 — The decisive finding: the file is DUAL-NATURED, and the pipeline picks ONE nature

Every Casa Diaz sheet carries BOTH entity-scope fields (person / role / branch — Nòmin, NOMBRE VENDEDOR, PUESTO, SUCURSAL) AND plan-scope fields (`% AUTORIZADO`, `BASE COMISION`, `FORMULA BASE COMISION`, `POLITICA DE PAGO`, `PAGO MENSUAL`). The platform produces only the entities because **the classification is binary per sheet and entity wins**, and **the one mechanism designed to split a dual sheet (PARTIAL claims) is inert**.

### Why entity wins (first-hand, `analyze/route.ts:561`)
```
matchesPlanSignature =
  !hasTransaction          // ✓ Casa Diaz (no temporal columns)
  && totalRows < 1000      // ✓ (≈186)
  && hasRateTableSignal    // ✓ (% AUTORIZADO → hasPercentageValues)
  && !anyHasEntityIdentifier  // ✗ FAILS — Casa Diaz HAS person identifiers (Nòmin, NOMBRE)
```
The HF-267 P1 guard `!anyHasEntityIdentifier` was added precisely so a roster/quota with a bonus column is NOT force-routed to plan. It does its job — but it also means a **genuinely dual** file (people *and* commission rules) can never trip the plan signature. The whole file stays `entity`.

### Why PARTIAL claims don't save it (first-hand, `analyze/route.ts:627` + `process-job/route.ts:370`)
The split machinery EXISTS and computes per-field winners:
- `negotiation.ts:analyzeSplit` (198–296): if top−runnerUp gap ≤ 0.25 AND runner-up owns ≥30% of fields → `shouldSplit=true`, assigning each field to its winning agent (`fieldAffinities`), with identifier columns marked `sharedFields`.
- `synaptic-ingestion-state.ts:buildProposalFromState` (235–299): emits TWO `ContentUnitProposal`s — primary (`contentUnitId`) + secondary (`contentUnitId + '::split'`), both `claimType:'PARTIAL'` with `ownedFields`/`sharedFields`/`partnerContentUnitId`.

…but the secondary is then **filtered out**:
```js
// analyze/route.ts:629  AND  process-job/route.ts:370
buildProposalFromState(...).filter(cu => !cu.contentUnitId.includes('::split'))
// HF-106: "one sheet = one content unit, always. Split claims caused unique-constraint
//          violations on import because two CUs map to the same sheet/committed_data rows."
```
**The HF-106 hazard is specifically two committed_data-WRITING CUs colliding on `(tenant, batch, sheet, row)`.** It does not apply when one half is a `plan` CU — because a plan CU writes `rule_sets`, NOT `committed_data` (confirmed below). So HF-106 over-broadly disables the *entity+plan* split, which is the exact case OB-255 needs.

`filterFieldsForPartialClaim` (`execute-bulk:822`) exists to narrow bindings for a PARTIAL claim, but is unreachable because PARTIAL CUs never survive analysis.

---

## §2 — The two branches of the existing pipeline (both real, both needed)

### Branch A — entity/data → `committed_data` (writes rows)
`process-job` classify → `commitContentUnit` (`commit-content-unit.ts:347`). data_type set at `:379` via `resolveDataTypeFromClassification`. **Type guard `:85` `classification: Exclude<AgentType,'plan'>`** — a `plan` unit can never reach commit. Carry Everything keeps every column (incl. rate/base/formula) in `row_data`.

### Branch B — plan → `rule_sets` (writes no committed_data)
`execute-bulk:389` groups plan units by storage path → `executeBatchedPlanInterpretation` (`plan-interpretation.ts:76`, the SOLE plan pipeline per HF-257). It:
1. Downloads the file by `storagePath`; for `.xlsx` **flattens each sheet to TSV text** (`:119-156`); `.csv/.tsv` are hard-REJECTED (HF-267, `:187-203`). XLSX is accepted.
2. Two-phase LLM interpretation (`plan-orchestration.ts`): `interpretPlanSkeleton` → component index, then per-component `interpretPlanComponent` → a **PrimeNode-DAG `calculationIntent`** per component.
3. `bridgeAIToEngineFormat` (`ai-plan-interpreter.ts:705`) → `{name, components:{variants:[…]}, inputBindings:{}}`.
4. Upsert `rule_sets` (`plan-interpretation.ts:407`): `status:'active'` (HF-132), `population_config:{eligible_roles:[]}`, `input_bindings:{}`, `cadence_config`, `metadata{plan_type,source:'sci',…}`. Idempotency by content-hash + single-flight (`plan-idempotency.ts`).

**Plan units write no committed_data** (confirmed `execute-bulk:430` comment + the commit type guard). So a sheet can be entity-committed AND plan-interpreted with **no `committed_data` collision**.

### Consumer table
| Surface | File:entry | In | Out |
|---|---|---|---|
| Per-sheet classify | `expression-classifier.ts:deriveClassificationFromExpression` (97) | HC interpretations | entity/transaction/target/reference (NO plan branch) |
| Plan reclassify (workbook) | `analyze/route.ts:561` `matchesPlanSignature` | per-file resolutions | all sheets→plan, IFF `!anyHasEntityIdentifier` |
| Field split | `negotiation.ts:analyzeSplit` (198) | fieldAffinities + scores | `SplitAnalysis{shouldSplit, primary/secondaryFields, sharedFields}` |
| Proposal w/ split | `synaptic-ingestion-state.ts:buildProposalFromState` (235) | state | primary CU + `::split` secondary CU (both PARTIAL) |
| **::split filter (HF-106)** | `analyze:629` / `process-job:370` | proposals | **drops every `::split` CU** |
| Entity commit | `commit-content-unit.ts:347` (guard `:85` excludes plan) | content unit | `committed_data` rows, data_type |
| Plan interpret | `plan-interpretation.ts:76` ← `execute-bulk:396` | storagePath + plan units | `rule_sets` (LLM→PrimeNode DAG→bridge→upsert) |
| Plans & Canvas | `api/plan-surface/plans/route.ts:23` + `plan-surface/normalize.ts` | rule_sets | list + component render (3 dialects) |
| Engine | `calculation/run-calculation.ts:873` | rule_sets.components + input_bindings | per-component evaluation via intent-executor |
| Normalizer | `process-job:508` `if (classification==='plan') continue` | non-plan units | canonicalized values (entity/target/etc only) |

---

## §3 — The proven plan shape (clone target, from live DB)

Live active rule_set `e07e5aba` (tenant 972c8eb0, "PLAN DE COMISIONES POR VENTA MAYORISTA") — a category-rate commission plan, the closest structural analog to Casa Diaz:
```json
components = { "variants": [ { "variantId":"vendedor", "components":[ {
  "id":"comision-categoria", "name":"…", "order":1, "enabled":true,
  "metadata": { "intent": { "op":"add","prime":"arithmetic","inputs":[
    { "op":"multiply","prime":"arithmetic","inputs":[
      { "prime":"filter","predicate":{"field":"Categoria","value":"ALI","operator":"eq"},
        "downstream":{"op":"sum","field":"Monto_Total","prime":"aggregate"} },
      { "prime":"constant","value":0.025 } ] }, … ] } },
  "componentType":"prime_dag", "calculationIntent":{…same tree…} } ] } ],
  "construction_method":"prime_dag" }
input_bindings = { "convergence_version":"HF-234", "convergence_bindings": {
  "component_0": { "Monto_Total": {"column":"Monto_Total","field_identity":{…}}, "Fecha_Cobro": {…} } } }
population_config = { "eligible_roles": [] }
```
Engine requirements (`run-calculation.ts:900`): each component needs `id`, `name`, `enabled`, a `componentType` in the **foundational primitives** (legacy types throw `LegacyEngineUnknownComponentTypeError`), and a `calculationIntent` (Decision 151 — sole authority; intent-executor is the sole executor). `input_bindings.convergence_bindings`/`metric_derivations` resolve intent fields → committed_data columns. Plans & Canvas (`plan-surface/normalize.ts`) accepts 3 component dialects and renders any variant-with-components; missing fields → GenericComponentRenderer, not a crash. Forensics reads `calculation_results` (engine output), not `rule_sets` directly.

**Implication for Casa Diaz:** the rate column (`% AUTORIZADO`=0.01) → a `constant` prime; the base (`BASE COMISION`="Ventas Facturadas") → an `aggregate sum` over the (future) sales column; intent = `multiply(sum(<base>), constant(rate))`. With NO transaction data yet, `convergence_bindings` stay UNRESOLVED — resolved later by the convergence flywheel when sales data arrives. Per §6 (calc verification out of scope), a structurally-correct plan with intent + unresolved bindings is the acceptance target.

---

## §4 — Normalizer (HALT-5): solved by routing
`process-job:508` `if (unit.classification === 'plan') continue;` skips the EXPRESS (canonicalization) phase for plan content; plan never reaches CONSTRUCT (`commit-content-unit:85` type guard). So **plan-classified content is never normalized** — policy text arrives verbatim. The CLT finding (policy qualifiers stripped) happened because the dual sheet was classified **entity**, so its policy text went through the normalizer. **Routing the plan-bearing fields to the plan branch fixes HALT-5 at the root** — no exclusion code is needed inside the remediation stage (OB-249's `computeRemediationExclusions` already protects identifier/measure/temporal natures by regex, but text policy columns are not excluded — they must not reach the normalizer in the first place, which the plan routing guarantees).

---

## §5 — Insertion-point decision + the Phase-1 architect gate

**The objective requires a dual-natured sheet to flow through BOTH Branch A (entities) and Branch B (plan), from one import.** The existing pipeline has both branches; what is missing is the routing of ONE sheet to BOTH. This is an extension, **not a fork** (no parallel pipeline, no `if(tabular){}else{}` at a consumer — both branches already exist and run).

Two realizations, both within the existing path (CC's recommendation: **Option A**):

- **Option A — revive PARTIAL claims for the entity+plan split (the IP-017 intended vehicle).** Let `analyzeSplit`'s split survive when the secondary agent is `plan`: relax the HF-106 `::split` filter from `drop all ::split` to `drop ::split UNLESS its classification is 'plan'` (a plan `::split` CU writes `rule_sets`, not `committed_data`, so HF-106's unique-constraint hazard cannot occur). The entity CU commits the person/role/branch fields; the plan `::split` CU routes through `executeBatchedPlanInterpretation`. This uses the existing PARTIAL machinery (`ownedFields`/`sharedFields`) the directive names as designed-for-this.

- **Option B — dual-list inclusion.** Keep the sheet `entity` (commits entities) AND add it to the `planUnits` list `execute-bulk` feeds to `executeBatchedPlanInterpretation`, gated by a deterministic dual-nature detector (≥N entity-identifier fields AND ≥M plan-rule fields, from the already-computed `fieldAffinities`). Lighter touch; does not re-enable `::split`.

**Two cross-cutting items either option must handle (Phase 2):**
1. **The plan pipeline does NOT de-band.** `plan-interpretation.ts:119-156` flattens the RAW sheet to TSV — it never calls OB-254's `debandWorksheet`. To feed the LLM the clean recovered header + `__section` (not the banded `__EMPTY` mess), the plan pipeline's XLSX extraction must reuse `debandWorksheet` (a Korean-clean reuse of merged code, no new logic). Without this, the LLM interprets banded garbage.
2. **Granularity.** Each sheet = one commission program → one `rule_set` (8 sheets → up to 8 rule_sets, batched by file). The per-row rates within a sheet become the component's rate constants / a rate dimension — NOT one rule_set per person (the engine evaluates one intent per variant for all entities; per-person rates are data the intent reads, or variants keyed by role).

### The gate (why this is surfaced, not silently built)
Both options change a real invariant: **dual-natured roster-with-rates files will now produce plans.** Option A additionally **re-enables a deliberately-disabled mechanism (HF-106)**, scoped to plan splits. Per directive §2/§3.1 this insertion point is *within* the expected path (extend, no fork) — so it is **not a hard HALT-1** — but its weight (reviving HF-106; broadly changing what produces plans) matches the Phase-1 gate the directive defines ("commit the map before Phase 2"). CC recommends **Option A** (it is the IP-017 vehicle the directive names, and the HF-106 hazard provably does not apply to a plan split). **Requesting architect disposition before Phase 2: confirm Option A (PARTIAL revival, scoped) vs Option B (dual-list) vs another vehicle.** No HALT-2/3/4/5 triggered; HALT-5 is solved by the routing itself (§4).

---

## §6 — Status
Phase 1 complete; surface map committed. Phase 2 (extend classification + plan construction) begins on the architect's disposition of §5. No code changed yet (discovery only). EPG-2..EPG-4 + DD-7 + PR follow Phase 2–4.
