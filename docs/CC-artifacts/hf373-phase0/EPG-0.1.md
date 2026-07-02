# HF-373 Phase 0 — EPG-0.1

**Verdict:** CONFIRMED

**Root cause:**  

**HALT-1 notes:** Directive framing confirmed with two refinements: (1) The schema break that killed the binding predicate is OB-231 Phase 1 (fdf78cf0, 2026-06-22, structuralType enum→prose), which HF-368/369/372 then extended by adding the bare natureRole/scopeRole primitives that convergence never reads — the directive's "post-HF-368/369 schema changes" hypothesis is directionally right but the decisive commit predates HF-368. (2) The DAG input references are abstract snake_case metric names (cumplimiento_colocacion, calidad_cartera, portfolio_quality, deposit_attainment...), NOT the exact committed column headers (Cumplimiento_Colocacion, Indice_Calidad_Cartera) — the columns exist and the LLM binding step (recognizeBindingsViaAI) exists to map ref→column, but it sits inside the matches loop that never ran.

**Fix implications:** The fix is entirely in web/src/lib/intelligence/convergence-service.ts (no migration, no import-path change needed — the live committed_data already carries the bare primitives the binder needs; VLTEST2 field_identities have natureRole ∈ {identifier, measure, temporal, name, categorical} and scopeRole on every visible batch).

(1) inventoryData reader (:1411-1419): carry natureRole and scopeRole through into the DataCapability.fieldIdentities entries (FieldIdentity type already declares both, sci-types.ts:99-100). Currently the reader silently drops them.

(2) matchComponentsToData: replace every `fi.structuralType === '<enum>'` equality with the bare-primitive read (fi.natureRole === 'measure' / 'identifier' / 'temporal'): Pass 1 predicate :1551-1552, measure counting :1569-1571, temporal check :1580-1581. Same defect class exists in generateAllComponentBindings' isAttributeNature regex (:3379, reads prose — HF-333 style) and anywhere else structuralType is equality/regex-matched on-path. Per the HF-368/369 precedent, a pre-HF-368 legacy batch (field_identities present but NO natureRole) should fail loud or trigger re-comprehension, not silently produce 0 matches (entity-resolution.ts:48-54 already has this loud-legacy pattern to copy).

(3) extractComponents (:1103-1249): add the prime_dag branch — when calculationIntent carries a `prime` discriminator, mine expectedMetrics from the DAG's `reference` nodes (the walker already exists: extractReferenceFields :2497-2510, and extractInputRequirements' HF-242 path :2611-2632). This re-arms Pass 4 (the sole derivation authority and the only consumer of the 7 comprehension:plan_interpretation signals) and re-arms the gap loop so a failed bind can never again present as 0 gaps.

(4) Structural fragility to consider (design-level): generateAllComponentBindings only binds components that appear in `matches` (:3407-3415) — a component with no data_type match silently gets NO binding attempt and NO gap. Decoupling the per-component LLM binding (recognizeBindingsViaAI over labeledCandidates, which is already all-capability-scoped per OB-216 §2-S3) from the match gate, or emitting a gap for unmatched components, closes the silent-zero hole that let this run log 0 gaps.

Constraints observed: DAG reference fields are abstract snake_case metric names (cumplimiento_colocacion, portfolio_quality...), not exact column headers — ref→column mapping is recognizeBindingsViaAI's job (it receives metricComprehension signals + labeledCandidates), so the fix only needs to get execution TO that call, not replace it. HF-281's incomplete-binding gate only fires when bindingCount>0 (run/route.ts:284-286), so any partial fix that produces SOME bindings will be completeness-checked, but an all-zero outcome still calc-runs to $0 — consider gating calc on bindingCount>0 for plans whose components carry reference primes. Tables involved (read-only for the fix's inputs): rule_sets.components/input_bindings, committed_data.metadata.field_identities, classification_signals (comprehension:plan_interpretation, engine:exception). Tests: convergence tests live in web/src/lib/intelligence/__tests__/ (ob248-convergence-binding.test.ts, binding-completeness.test.ts) and web/src/lib/calculation/__tests__/convergence-authoritative.test.ts.

## Evidence

### web/src/lib/intelligence/convergence-service.ts:961 (the quoted log site)

```
console.log(`[Convergence] ${ruleSet.name}: ${derivations.length} derivations, ${gaps.length} gaps, ${Object.keys(componentBindings).length} component bindings`);
```

### web/src/lib/intelligence/convergence-service.ts:308-311 (7-signal load site)

```
const metricComprehensionSignals = await loadMetricComprehensionSignals(tenantId, ruleSetId, supabase);
  observations.metricComprehension = metricComprehensionSignals;
  if (metricComprehensionSignals.length > 0) {
    console.log(`[Convergence] HF-196 D153 cutover: ${metricComprehensionSignals.length} metric_comprehension signals loaded as operative input (rule_set=${ruleSetId})`);
```

### _hf373_epg01_refs_and_data_probe.ts — live classification_signals query (tenant=VLTEST2, signal_type='comprehension:plan_interpretation')

```
[signals] comprehension:plan_interpretation count(limit20): 7
 - id=a20f07fd-7b21-4709-b5fd-973a1c7ada3b rule_set_id=91f822b1-186e-419b-9627-64d801fe323f conf=0.9 created=2026-07-02T00:59:40.23716+00:00
   signal_value: {"id":"c1-senior","name":"Colocación de Crédito","type":"prime_dag","nameEs":"Colocación de Crédito","metric_op":"prime_dag","reasoning":"...This is a 2D fixed grid (6 attainment rows × 5 quality columns = 30 cells)..." (7 rows total: c1-senior, c1-ejecutivo, c2-senior, c2-ejecutivo, c3-senior, c3-ejecutivo, c4)
```

### web/src/lib/intelligence/convergence-service.ts:1550-1556 (Pass 1 — the failed predicate; git blame 18f3de3a 2026-03-08 OB-162 Phase 2, unchanged since March)

```
const structuralCandidates = capsWithFI.filter(cap => {
        const hasMeasure = Object.values(cap.fieldIdentities).some(fi => fi.structuralType === 'measure');
        const hasIdentifier = Object.values(cap.fieldIdentities).some(fi => fi.structuralType === 'identifier');
        return hasMeasure && hasIdentifier;
      });

      if (structuralCandidates.length === 0) continue;
```

### web/src/lib/intelligence/convergence-service.ts:1411-1419 (inventoryData reader — DROPS natureRole/scopeRole)

```
const fieldIds = meta?.field_identities as Record<string, { structuralType?: string; contextualIdentity?: string; confidence?: number }> | undefined;
      if (fieldIds && Object.keys(fieldIds).length > 0) {
        const identities: Record<string, FieldIdentity> = {};
        for (const [colName, fi] of Object.entries(fieldIds)) {
          identities[colName] = {
            structuralType: (fi.structuralType || 'unknown') as FieldIdentity['structuralType'],
            contextualIdentity: fi.contextualIdentity || 'unknown',
            confidence: typeof fi.confidence === 'number' ? fi.confidence : 0.5,
          };
```

### _hf373_epg01_committed_probe.ts — live committed_data row (batch 9b54b645, VLTEST2 Datos, data_type=transaction)

```
row_data keys: Periodo, Sucursal, _rowIndex, _sheetName, ID_Empleado, Meta_Depositos, Meta_Colocacion, Nombre_Completo, Monto_Colocacion, Pct_Meta_Depositos, Depositos_Nuevos_Netos, Indice_Calidad_Cartera, Cumplimiento_Colocacion, Infracciones_Regulatorias, Cantidad_Productos_Cruzados
metadata keys: source, proposalId, remediation, semantic_roles, entity_id_field, field_identities, resolved_data_type, informational_label
metadata.field_identities: {"Periodo":{"scopeRole":"none","confidence":0.97,"natureRole":"temporal","structuralType":"A temporal value representing the reporting month, expressed as the start date of that month.","contextualIdentity":"The calendar period (month)..."},...} — structuralType is PROSE; the bare primitive lives in natureRole
```

### _hf373_epg01_matcher_replay.ts — deterministic replay of Pass 1 + Pass 3 over live VLTEST2 data (10 visible of 39 batches, 5 partitions)

```
[partition] data_type=transaction cols=13
  Pass1: hasMeasure(structuralType==='measure')=false hasIdentifier(structuralType==='identifier')=false -> candidate=false
  natureRole values (bare primitives, DROPPED by reader): temporal, categorical, identifier, measure, name
>>> Pass 1 structuralCandidates possible anywhere: false
Pass3 "Colocación de Crédito" [colocaci,dito] vs "transaction" [transaction] -> overlap=[] score=0 (all 12 componentName×dataType pairs score=0; data_types present: transaction, reference, entity)
```

### web/src/lib/intelligence/convergence-service.ts:3407-3415 (bindings derive ONLY from matches)

```
const variantGroups = new Map<string | undefined, BindingMatch[]>();
  for (const match of matches) {
    const key = match.component.variantId;
    if (!variantGroups.has(key)) variantGroups.set(key, []);
    variantGroups.get(key)!.push(match);
  }
  console.log(`[Convergence] HF-253 binding ${variantGroups.size} variant group(s): ...`);

  for (const [variantId, groupMatches] of Array.from(variantGroups.entries())) {  // ← never iterates when matches=[]
```

### _hf373_epg01_ruleset_probe.ts + _hf373_epg01_components_probe.ts — live rule_sets (VLTEST2)

```
rule_sets count: 1 | RULE_SET 91f822b1-186e-419b-9627-64d801fe323f | name: BANCO CUMBRE DEL LITORAL | status: active | created_at: 2026-07-02T00:59:40 | input_bindings: {}
variants: 2 (senior, ejecutivo) × 4 components each, ALL componentType: prime_dag; calculationIntent top keys: {else,then,prime,condition} (c1/c2/c4) or {op,prime,inputs} (c3)
components JSON contains sourceSpec: false | tierConfig: false | calculationMethod: false | "operation": false | onTrue: false | onFalse: false | "prime": true | "condition": true
```

### _hf373_epg01_refs_and_data_probe.ts — DAG reference fields per component (walked live components JSON)

```
[refs] senior/Colocación de Crédito -> portfolio_quality, placement_attainment | senior/Captación de Depósitos -> deposit_attainment | senior/Productos Cruzados -> productos_cruzados_vendidos | senior/Cumplimiento Regulatorio -> bono_cumplimiento_regulatorio, infracciones_regulatorias | ejecutivo/Colocación de Crédito -> calidad_cartera, cumplimiento_colocacion | (abstract snake_case names — NOT the committed column headers Cumplimiento_Colocacion / Indice_Calidad_Cartera)
```

### web/src/lib/intelligence/convergence-service.ts:1157-1230 (extractComponents metric mining — no prime_dag path) + :702-705 (Pass 4 gate)

```
const metrics: string[] = [];
    if (tierConfig?.metric) metrics.push(...)  // mines ONLY tierConfig.metric, intent.input/inputs.sourceSpec.field, ratioInput/baseInput.sourceSpec, onTrue/onFalse walk (walkNested reads obj.input.sourceSpec + condition.left.sourceSpec — PrimeNode trees have neither), calcMethod.metric
...
  const allRequiredMetrics = Array.from(new Set(components.flatMap(c => c.expectedMetrics)));
  const unresolvedForAI = allRequiredMetrics;
  if (unresolvedForAI.length > 0 && capabilities.length > 0) {  // ← never true: expectedMetrics=[] for all 8 prime_dag components → Pass 4 (sole derivation authority + sole consumer of the 7 signals at :727) skipped → 0 derivations AND 0 gaps (gap loop :788 filters comp.expectedMetrics)
```

### web/src/app/api/calculation/run/route.ts:2941-2961 (empty metrics origin when no bindings)

```
} else {
        // HF-220 R1 / ADR Decision 2: no convergence_bindings for this component.
        // Emit engine:exception signal ... metrics = {} → component evaluates to zero per Decision 153 atomic cutover
        // completion. Legacy sheet-matching path retired.
        writeSignal({ ... signalType: 'engine:exception', signalValue: { ... type: 'no_convergence_bindings_for_component', ... } ...
        metrics = {};
```

### web/src/lib/calculation/intent-executor.ts:165-172 + :217-228 (where '' originates)

```
function rawOperand(node: PrimeNode, context: EvalContext): string | number | null {
  if (node.prime === 'constant') return node.value;
  if (node.prime === 'reference') {
    const raw = context.metrics[node.field];
    return raw === undefined || raw === null ? null : raw;
  }
...
      const lRaw = rawOperand(node.inputs[0], context);
      const rRaw = rawOperand(node.inputs[1], context);
      if (!isNumericRaw(lRaw) || !isNumericRaw(rRaw)) {
        const ls = lRaw === null || lRaw === undefined ? '' : String(lRaw);
        const rs = rRaw === null || rRaw === undefined ? '' : String(rRaw);
        switch (node.op) {
          case 'eq':  return ls === rs ? toDecimal(1) : ZERO;
          case 'neq': return ls !== rs ? toDecimal(1) : ZERO;
          default:
            console.warn(`[PrimeDAG] OB-220: ordering operator '${node.op}' on non-numeric operands ('${ls}' vs '${rs}') — returning false`);
            return ZERO;
```

### _hf373_epg01_signals_probe.ts — live engine:exception + calculation_results (VLTEST2, since 2026-06-30)

```
[engine:exception] total since 2026-06-30T00:00:00Z = 156; sampled type distribution: {"no_convergence_bindings_for_component":10/10}; first: {"signal_value":{"type":"no_convergence_bindings_for_component","component_name":"Captación de Depósitos","component_index":1,"entity_external_id":"BCL-5003"},"created_at":"2026-07-02T01:05:04","calculation_run_id":"c5f04eac-003c-4ae7-a85a-4da7fe7b1b7c"}
[calculation_results] total_payout:0 on sampled rows, every component payout:0, componentType prime_dag, rule_set 91f822b1, batch_id c5f04eac-003c-4ae7-a85a-4da7fe7b1b7c
```

### git: fdf78cf0 (2026-06-22) OB-231 Phase 1 diff on header-comprehension.ts extractFieldIdentities

```
-      structuralType: interp.columnRole,
-      contextualIdentity: interp.semanticMeaning,
+      structuralType: interp.data_nature,
+      contextualIdentity: interp.characterization,
(pre-OB-231 sci-types.ts:71-78: export type ColumnRole = 'identifier' | 'name' | 'temporal' | 'measure' | 'attribute' | 'reference_key' | 'unknown' — the exact enum values Pass 1 still string-equals)
```

### git dates (d)

```
18f3de3a 2026-03-08 OB-162 Phase 2: field identity convergence + input_bindings generation (Pass-1 predicate authored — March-era working binding)
fdf78cf0 2026-06-22 OB-231 Phase 1: HC emits structured characterization, ColumnRole retired at source (structuralType enum→prose — the break)
4c55cd92 2026-06-30 HF-368: model names the structural primitive (natureRole added to field_identities — but convergence reader never consumes it)
2bd8db2b 2026-07-01 HF-372: Restore the import process end-to-end (scopeRole added)
Recent convergence-service.ts commits (f3777ebb HF-353, dbfdd856 OB-248, 2fb0f81d HF-341...) — none touched Pass 1/inventoryData reader
```

### web/src/app/api/import/sci/finalize-import/route.ts:97-99 (why the March-era binding cache could not rescue)

```
delete ib.convergence_bindings;
        delete ib.metric_derivations;
        delete ib.convergence_version;
```

### web/src/lib/intelligence/convergence-service.ts:3336-3341 (the 'zero AI cost' March log = HF-112 reuse path)

```
if (hasCompleteBindings(existingConvergenceBindings, components.length)) {
    console.log('[Convergence] HF-112 Existing bindings complete — reusing (zero AI cost)');
```

### web/src/lib/sci/sci-types.ts:95-101 (current FieldIdentity — bare primitives EXIST in the type)

```
export interface FieldIdentity {
  structuralType: string;             // OB-231: free-form data-nature prose (was ColumnRole) — kept for display/audit
  contextualIdentity: string;
  confidence: number;
  natureRole?: string;                // HF-368: the model's bare nature primitive (∈ 5 natures)
  scopeRole?: string;                 // HF-372 Phase C: the model's bare scope primitive (∈ 4 scopes)
}
```

