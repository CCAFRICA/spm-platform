# HF-373 Phase 0 — EPG-0.10

**Verdict:** PARTIAL

**Root cause:** D4: rule_sets.name = the plan_skeleton LLM call's ruleSetName, which the prompt instructs to take "verbatim from document title/header" (anthropic-adapter.ts:479). The Casa Diaz workbook carries the IDENTICAL banner title "COMISIONES DE MAQUINARIA" in row 2 of three different machinery sheets (MAQUINARIA (2), MAQUINARIA, DIST Y SUC — verified from the live stored workbook). Under OB-255 per-sheet interpretation (plan-interpretation.ts:131-137, one interpretPlanGroup call per self-contained sheet), each sheet's skeleton reads the same banner, so two sheets emit the same ruleSetName; it flows skeleton → orchestration.interpretation.ruleSetName (plan-orchestration.ts:375) → validateAndNormalizePlanInterpretation (ai-plan-interpreter.ts:314) → bridgeAIToEngineFormat .name (ai-plan-interpreter.ts:724) → planName (plan-interpretation.ts:496) → rule_sets.name (upsert at plan-interpretation.ts:579). The source-sheet identity IS already persisted at write time — metadata.contentUnitId and metadata.batchedSheets (plan-interpretation.ts:588-594) — and is what HF-372's supersession keys on (plan-interpretation.ts:516-543), but no UI list surface renders it, and the operate/calculate + plan-readiness payloads select only id/name/status/cadence_config. D5: for COMISIÓN GARANTIZADA (2-row sheet: "% AUTORIZADO"="NA", "BASE COMISION"="6,000"/"26,000" text, POLITICA "siempre se le pagan 6,000/26,000", per-employee names in OBSERVACIONES) the model emitted calculationIntent {"prime":"reference","field":"BASE COMISION"} — the only expression the contract permits for per-row-varying amounts, because the plan_component prompt mandates "VARYING VALUES → reference, not constant … Use a constant ONLY when the value is identical on every row" (anthropic-adapter.ts:539) and its EXPRESS-THE-COMMON-COMPUTATIONS list (anthropic-adapter.ts:520-531) has category-cascade / factor-stack / eligibility-gate / tiers / count exemplars but NO constant/guarantee-payment exemplar; the only deterministic-construction channel (rateMatrixRecognition, anthropic-adapter.ts:541-566 + rate-matrix-construction.ts) is exclusively for band/matrix lookup grids keyed on a numeric input metric, inapplicable to a constant payment. The referenced column's committed twins are data_type='reference' rows with entity_id=null/period_id=null and comma-formatted TEXT values, so the guarantee cannot faithfully evaluate. The grammar itself already has `constant` (prime-grammar.ts:69-75) and convertComponent passes any grammar-valid prime_dag through unchanged (ai-plan-interpreter.ts:516-567) with 'constant' also a registered legacy primitive (ai-plan-interpreter.ts:628) — the gap is the prompt contract + the per-entity constant binding path, not a missing plan-type registry entry.

**HALT-1 notes:** D4 is CONFIRMED exactly as framed: two ACTIVE Casa Diaz rule_sets both named "COMISIONES DE MAQUINARIA" (63664074-fa4e-49fc-8f45-89b23dd8ae36 from sheet MAQUINARIA (2); 903d05b2-a4a4-4915-95ee-315a5aefc9d4 from sheet DIST Y SUC), HF-372's contentUnitId-scoped supersession correctly kept both, and the disambiguating source-sheet identity is ALREADY persisted additively (rule_sets.metadata.contentUnitId = "COMISIONES___AUTORIZADOS_-_copia.xlsx::<SHEET>::<idx>::split" + metadata.batchedSheets) — it is just never rendered, and several list surfaces do not even SELECT metadata. D5 is PARTIAL: the directive's implication that the stored component expresses a multiplicative rate intent is CONTRADICTED — the live stored calculationIntent is a bare {"prime":"reference","field":"BASE COMISION"} (no multiply, no rate, no constant). Also, a CONSTANT is already grammatically expressible today (the `constant` prime is a canonical numeric leaf, and `constant` is a registered FoundationalPrimitive in convertComponent) — what is missing is NOT a grammar prime but (1) prompt-contract guidance: the plan_component prompt's "VARYING VALUES → reference, not constant" rule plus zero constant/guarantee exemplars in its EXPRESS list steer the model away from constant emission whenever amounts differ per row (here 6,000 vs 26,000 per employee), and (2) a faithful per-entity-constant path: the guarantee amounts live only in the plan sheet's own rows, which were committed as data_type='reference' rows with entity_id=null, period_id=null and TEXT values "6,000"/"26,000" — the emitted reference cannot compute a per-entity guaranteed payment from them. The model plainly RECOGNIZED the constant intent (its persisted description: "employees are always paid a fixed guaranteed monthly amount regardless of the calculated sales commission") but had no contract channel to express it faithfully.

**Fix implications:** D4 (display precision, additive): the true title must stay in rule_sets.name (no silent rename). The source sheet name is already available at write time (planUnits[0].tabName in interpretPlanGroup, plan-interpretation.ts:155-167; also derivable by parsing the persisted metadata.contentUnitId "file.xlsx::SHEET::idx::split"). Fix should (1) persist an explicit, additive metadata.sourceSheet (jsonb — NO migration needed; rule_sets has no source_sheet column, confirmed live) at the upsert (plan-interpretation.ts:588-594), and backfill-parse legacy rows from metadata.contentUnitId at read time; (2) render it as a secondary identity line wherever plans are LISTED: PlanRail.tsx:46 already receives PlanStructure.metadata (structure.ts:55 — zero API change needed there); PlanCard on /operate/calculate requires widening operate-context.tsx:132-137 select ('id, name, status, cadence_config' → + metadata) and/or the plan-readiness payload; approvals page (request.ruleSetName), results headers (PlanResults/ResultsHero), drill-through, statements, ImportReadyState, AdminBriefing per the file:line list in evidence. Disambiguation should render only when needed or always as provenance ("from sheet DIST Y SUC") — display data, never a predicate. Do NOT touch the HF-372 supersession keying (metadata.contentUnitId) — it is the mechanism that keeps both plans alive. D5 (constant-intent expressibility, model expression, NO plan-type registry): the grammar already has the `constant` prime (prime-grammar.ts:69-75) and convertComponent/validateComponentIntent pass any valid DAG through — no new constructor branch is required for a plan-wide constant. What must change: (1) plan_component prompt (anthropic-adapter.ts:510-590) needs a CONSTANT/GUARANTEED-PAYMENT exemplar in the EXPRESS list — "a fixed amount always paid" → constant(<amount>), optionally gated conditional(...) — and the VARYING VALUES rule (:539) needs a carve-out for per-entity fixed amounts: when the plan states each row's amount IS the payout (not a rate applied to a metric), express per-entity constants via the string-equality cascade the prompt already blesses (conditional(compare(eq, reference(<entity-identifying column>), constant("<id>")), constant(6000), ...) — :521-524 "string constants are compared as values") or bind the amount column with explicit intent; (2) faithfulness constraint discovered live: the guarantee sheet's rows were committed as data_type='reference' with entity_id=null/period_id=null and TEXT amounts "6,000"/"26,000", so the current bare reference("BASE COMISION") emission cannot evaluate per-entity — any fix that keeps a reference-based expression must address entity linkage/numeric coercion, whereas the constant-cascade expression avoids the committed-row dependency entirely (amounts read from the plan grid at interpretation time, like rateMatrixRecognition does for grids — a deterministic per-entity-constant construction from the de-banded grid, mirroring plan-orchestration.ts:524-583, is the registry-free structural option if the model is to recognize rather than enumerate); (3) verify the exhaustive_emission oracle stays inapplicable (no rateTableCellCount for constant components — skeleton prompt :472 already omits it for non-grid components). Tables/files to touch: web/src/lib/ai/providers/anthropic-adapter.ts (plan_skeleton + plan_component prompts), web/src/lib/sci/plan-interpretation.ts (metadata.sourceSheet), possibly web/src/lib/sci/plan-orchestration.ts + a small deterministic constructor if the recognition-mode route is chosen, plus the UI/select sites listed; rule_sets data itself needs no migration.

## Evidence

### web/src/lib/sci/plan-interpretation.ts:494-496 (plan display-name origin)

```
const ruleSetId = crypto.randomUUID();
  const filenameFallback = primaryContentUnitId.split('::')[0]?.replace(/\.[^.]+$/, '') || '';
  const planName = engineFormat.name || filenameFallback || 'Untitled Plan';
```

### web/src/lib/sci/plan-interpretation.ts:574-596 (rule_sets.name write path + sheet identity ALREADY persisted in metadata)

```
const { error: upsertError } = await supabase
    .from('rule_sets')
    .upsert({
      id: ruleSetId,
      tenant_id: tenantId,
      name: planName,
      ...
      metadata: {
        plan_type: 'additive_lookup',
        source: 'sci',
        contentUnitId: primaryContentUnitId,
        batchedSheets: planUnits.map(u => u.contentUnitId),
        aiConfidence: orchestration.interpretation.confidence,
      } as unknown as Json,
```

### web/src/lib/sci/plan-interpretation.ts:516-534 (HF-372 name-collision handling: supersession scoped by metadata.contentUnitId — where two sheets collide into identical names)

```
// HF-372 (Casa Diaz live finding): under PER-SHEET interpretation the LLM can give two DIFFERENT
  // sheets the same plan name ("COMISIONES DE MAQUINARIA" from both MAQUINARIA (2) and DIST Y SUC) —
  // name-only supersession then silently ARCHIVED the other sheet's plan. Supersession is now scoped
  // to the same plan SOURCE identity (metadata.contentUnitId — file::sheet) ...
  const victims = (sameNameRows ?? []).filter((r...) => {
      const priorCu = r.metadata?.contentUnitId;
      return !priorCu || priorCu === primaryContentUnitId;
    });
```

### web/src/lib/sci/plan-interpretation.ts:131-137 (per-sheet interpretation — each machinery sheet becomes its own rule_set)

```
if (allSelfContained) {
          console.log(`[SCI plan-interp] OB-255: ${planUnits.length} structurally-independent plan sheets (each self-contained) — interpreting PER-SHEET, one rule_set each`);
          const results: ContentUnitResult[] = [];
          for (const u of planUnits) {
            results.push(...await interpretPlanGroup(supabase, tenantId, [u], userId, storagePath, comprehendedFields));
          }
```

### web/src/lib/ai/providers/anthropic-adapter.ts:479 (plan_skeleton prompt — the name instruction that collides)

```
"ruleSetName": "Name of the plan, verbatim from document title/header",
```

### web/src/lib/sci/plan-orchestration.ts:375 + web/src/lib/compensation/ai-plan-interpreter.ts:314,724 (name flow skeleton→engineFormat.name)

```
plan-orchestration.ts:375:      ruleSetName: String(skeletonRaw.ruleSetName ?? 'Unnamed Plan'),
ai-plan-interpreter.ts:314:    ruleSetName: String(parsed.ruleSetName || 'Unnamed Plan'),
ai-plan-interpreter.ts:724:    name: normalized.ruleSetName,
```

### probe _hf373_epg010_sheets.ts — live workbook (ingestion-raw 2d9979ba.../1782954670826_0_bcfba244_COMISIONES___AUTORIZADOS_-_copia.xlsx): identical banner title on the two colliding sheets

```
===== SHEET "MAQUINARIA (2)" — raw first 8 rows =====
["",...]
["COMISIONES DE MAQUINARIA","",...]
...
===== SHEET "DIST Y SUC" — raw first 8 rows =====
["",...]
["COMISIONES DE MAQUINARIA","",...]
(sheet "MAQUINARIA" row 2 is ALSO ["COMISIONES DE MAQUINARIA",...] but the model named that plan "MAQUINARIA - Comisiones por Ventas")
```

### probe _hf373_epg010_rulesets.ts — live Casa Diaz rule_sets (ALL 8, id/name/status/created_at/metadata verbatim; FP-49 keys: ["id","tenant_id","name","description","status","version","effective_from","effective_to","population_config","input_bindings","components","cadence_config","outcome_config","metadata","created_by","approved_by","created_at","updated_at"] — no source_sheet column; sheet identity only inside metadata jsonb)

```
6f44b73e name="COMISIONES SUCURSALES LOCALES" active 01:15:00 metadata.contentUnitId="COMISIONES___AUTORIZADOS_-_copia.xlsx::LOCALES REFAC::0::split"
7ac847f2 name="FORANEAS REFAC" active 01:15:14 ...::FORANEAS REFAC::1::split
c3ff7087 name="MAQUINARIA - Comisiones por Ventas" active 01:15:37 ...::MAQUINARIA::3::split
f0b22bc3 name="COMISIÓN GARANTIZADA" active 01:15:54 ...::COMISIÓN GARANTIZADA::4::split
2b57de8f name="PAGO COMISIÓN DISTRIBUIDORES" active 01:16:22 ...::DISTRIBUIDORES::5::split
63664074-fa4e-49fc-8f45-89b23dd8ae36 name="COMISIONES DE MAQUINARIA" active 01:16:44 aiConfidence=0.8 metadata.contentUnitId="COMISIONES___AUTORIZADOS_-_copia.xlsx::MAQUINARIA (2)::2::split"
903d05b2-a4a4-4915-95ee-315a5aefc9d4 name="COMISIONES DE MAQUINARIA" active 01:16:48 aiConfidence=0.87 metadata.contentUnitId="COMISIONES___AUTORIZADOS_-_copia.xlsx::DIST Y SUC::6::split"
82f8352f name="COMISIONES DE MAQUINARIA - PULL (EXTERNOS)" active 01:17:08 ...::PULL (EXTERNOS)::7::split
=> the ONLY thing distinguishing the two duplicates today is metadata.contentUnitId/batchedSheets (+4s created_at, aiConfidence).
```

### probe _hf373_epg010_rulesets.ts — COMISIÓN GARANTIZADA (f0b22bc3-5058-4641-a038-6b4d06bf62a1) stored components VERBATIM — current intent is a BARE per-row reference (not rate×base, not constant)

```
description="Guaranteed commission plan for serigraphy (screen printing) sales at Sucursal Tijuana, where employees are always paid a fixed guaranteed monthly amount regardless of the calculated sales commission."
components={"variants":[{"variantId":"all","components":[{"id":"comision-garantizada","name":"COMISIÓN GARANTIZADA","order":1,"enabled":true,"metadata":{"intent":{"field":"BASE COMISION","prime":"reference"},"applies_to":["all"],"construction_method":"prime_dag"},"description":"COMISIÓN GARANTIZADA","componentType":"prime_dag","measurementLevel":"store","calculationIntent":{"field":"BASE COMISION","prime":"reference"}}],"description":"Calle Serigrafia - Tijuana","variantName":"Calle Serigrafia - Tijuana","eligibilityCriteria":{}}]}
input_bindings={}
```

### probe _hf373_epg010_sheets.ts — the COMISIÓN GARANTIZADA source sheet expresses a per-employee CONSTANT guarantee (no rate: % AUTORIZADO = NA)

```
===== SHEET "COMISIÓN GARANTIZADA" =====
header: ["DEPARTAMENTO","SUCURSAL","% AUTORIZADO","POLITICA DE PAGO","BASE COMISION","FORMULA BASE COMISION","PAGO MENSUAL","AUTORIZA","OBSERVACIONES"]
row1: {"% AUTORIZADO":"NA","POLITICA DE PAGO":"Se calcula la comisión x ventas de serigrafia de Suc. Tijuana siempre se le pagan 6,000","BASE COMISION":"6,000",...,"OBSERVACIONES":"4943 VARGAS SERRANO JESUEL AARON"}
row2: {"% AUTORIZADO":"NA","POLITICA DE PAGO":"...siempre se le pagan 26,000","BASE COMISION":"26,000",...,"OBSERVACIONES":"4354 HERRERA SHIMAMOTO LUIS ALONSO"}
```

### probe _hf373_epg010_garrows.ts — the committed twins of that sheet: reference rows, UNLINKED (entity_id/period_id null), amounts as comma TEXT — reference("BASE COMISION") cannot faithfully compute the guarantee

```
rows with _sheetName=COMISIÓN GARANTIZADA: 2
{"id":"ce4f8a33-...","data_type":"reference","entity_id":null,"period_id":null,"row_data":{...,"BASE COMISION":"6,000","OBSERVACIONES":"4943 VARGAS SERRANO JESUEL AARON",...}}
{"id":"44f3f81e-...","data_type":"reference","entity_id":null,"period_id":null,"row_data":{...,"BASE COMISION":"26,000",...}}
(also live: committed_data for Casa Diaz has transaction count=0, entity=67, reference=119; 186 rows total carry a "BASE COMISION" key)
```

### web/src/lib/ai/providers/anthropic-adapter.ts:539 (plan_component prompt — the rule that FORCES reference over constant for per-row-varying guarantee amounts)

```
• VARYING VALUES → \`reference\`, not \`constant\`: when a column's values DIFFER across the shown data rows (each entity/row carries its own rate ...), the component MUST \`reference\` that column. ... Use a \`constant\` ONLY when the value is identical on every row, or the plan states a single plan-wide number in prose. Never hardcode one row's value as a constant for a column that varies.
```

### web/src/lib/ai/providers/anthropic-adapter.ts:520-531 (plan_component EXPRESS list — NO constant/guarantee-payment exemplar exists)

```
EXPRESS THE COMMON COMPUTATIONS IN THE ALGEBRA (illustrative ...):
  • A CATEGORY/CODE selects a value ...: a cascade of equality matches — conditional(compare(eq, reference(<categoria field>), constant("<ALI>")), constant(0.025), ...) (string constants are compared as values; the final else is constant(0).)
  • A FACTOR MODEL / multiplicative stack (amount × rate × accelerator, N factors) ...
  • An ELIGIBILITY GATE ...
  • NUMERIC TIERS ...
  • A COUNT of qualifying rows ...
(no CONSTANT PAYMENT / GUARANTEE exemplar anywhere in the prompt)
```

### web/src/lib/calculation/prime-grammar.ts:69-75 (constant IS a canonical prime — grammar-level constant intent is expressible today)

```
constant: {
    type: 'constant',
    output: 'numeric',
    arity: { kind: 'leaf' },
    description: 'Literal numeric value. Carries optional meta={unit,scale,confidence} ...',
  },
```

### web/src/lib/compensation/ai-plan-interpreter.ts:516-567 + :621-642 (constructor mapping: any grammar-valid prime_dag passes through unchanged; 'constant' also a registered legacy FoundationalPrimitive — NO constructor branch is missing for a plan-wide constant)

```
:514 const isPrimeDag = !!intentNode && typeof intentNode.prime === 'string';
:516 if (isPrimeDag) { ... validateComponentIntent(intentNode, { componentLabel: base.name, expectedCellCount }); ... return { ...base, componentType: 'prime_dag' as FoundationalPrimitive, metadata: { ...intent... } }; }
:621-634 switch (calcType as FoundationalPrimitive) { case 'bounded_lookup_1d': ... case 'constant': ... case 'prime_dag': return {...} }
```

### web/src/lib/sci/plan-orchestration.ts:524-583 + web/src/lib/sci/rate-matrix-construction.ts:158,243-269 (the ONLY deterministic-construction channel is rateMatrixRecognition — band/matrix lookups keyed on a numeric inputField; inapplicable to a constant/guarantee payment)

```
plan-orchestration.ts:524 } else if (result.rateMatrixRecognition != null) { ... const built = constructRateMatrixIntent(rec, grid); ...
rate-matrix-construction.ts:255 throw ... `rowAxis.gridColumn "..." is not a grid column`; :252 `no grid rows carry __section ...` (contract requires rowAxis bands with gte/lt numeric edges + inputField metric — a flat constant payment has no axis to recognize)
```

### web/src/lib/ai/providers/anthropic-adapter.ts:472 + :573-585 (skeleton componentIndex + plan_component response shape — the only structure channels are rateTableCellCount / composesInto / distributesTo; no payment-nature/constant-intent channel)

```
skeleton :472: "4. For each component declare rateTableCellCount (integer) when the component is backed by a rate table ... OMIT rateTableCellCount (the per-component call will `reference` that column ...)"
plan_component response :573-585: { "id", "name", "type": "prime_dag", "calculationIntent": {...}, "rateMatrixRecognition": {...}, "applies_to": [...], "calculationMethod", "rateTableCellCount", "confidence", "reasoning" }
```

### UI plan-list render sites (where the disambiguating identity must render) — file:line list

```
1) web/src/components/plan-surface/PlanRail.tsx:46 — `{p.name}` (Zone A plan rail; mounted by /configure/plans page.tsx:8 via PlanSurfaceShell and /configure/plans/[ruleSetId] — the 'Plans & Canvas' / Living Plan Surface list)
2) web/src/components/plan-surface/PlanSurfaceShell.tsx:133 — `Open "{plans[0].name}"` empty-state; :123 planName into ConsequenceTray draft
3) web/src/contexts/operate-context.tsx:132-150 — loads plans select('id, name, status, cadence_config') [NO metadata] → web/src/app/operate/calculate/page.tsx:735 planName: plan.name → web/src/components/calculate/PlanCard.tsx:158 `{plan.planName}` (Calculate plan-card grid)
4) web/src/components/calculate/PlanResults.tsx:202 and :461 — `{planName}` results header
5) web/src/components/results/ResultsHero.tsx:86 and :167 — `{planName}`
6) web/src/components/drill-through/ComponentCards.tsx:105 and :164 — `{c.planName}`
7) web/src/components/compensation/CommissionStatementView.tsx:144 — `{component.planName}` (statements)
8) web/src/app/performance/approvals/plans/page.tsx:280 and :338 — `{request.ruleSetName}` (approvals list)
9) web/src/components/sci/ImportReadyState.tsx:198 and :398 — `{planName}` (import verdict)
10) web/src/components/briefing/AdminBriefing.tsx:276 and :377 — `{data.planName}`
```

### web/src/lib/plan-surface/structure.ts:24,55 + web/src/app/api/plan-surface/plans/route.ts:58-73 (plan-surface payload ALREADY carries rule_sets.metadata — contentUnitId reaches PlanRail today, unrendered)

```
structure.ts:24 .select('id, name, status, version, effective_from, effective_to, components, metadata')
structure.ts:55   metadata: metadata as Record<string, unknown>,  // inside buildPlanStructure → PlanStructure shipped to the client
```

