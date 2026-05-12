# DIAG-042 — Convergence and Comprehension Layer Contracts: Operative-State Documentation

**Date:** 2026-05-12
**Branch:** `dev`
**Base commit:** `eb592c6e` (post DIAG-041 Phase 7)
**Predecessors:** DIAG-039, DIAG-040, DIAG-041
**Probe scope:** Layer contracts (HC, convergence, engine), flywheel wiring (signal emission and consumption), cold-start vs steady-state operative behaviors, order-independence operative guarantees, open/closed-set operative reality.

CC pastes verbatim evidence at every section. No interpretation beyond what is structurally evident from code. No PASS/FAIL. No design proposals. Architect routes forward-design work via IRA invocation per Decision 153.

## Phase 0 — Orientation

Predecessor diagnostic output: `docs/diagnostics/DIAG-041_COMPREHENSIVE_CODE_AUDIT_OUTPUT.md` (1645 lines; post-HF-217 code-archeology covering HC contextualIdentity emission, convergence binding-selection, intent modifier execution, intent-transformer normalization, plan-interpreter cap emission). Used for orientation only; not re-pasted here.

`INF_GOVERNANCE_INDEX_20260406.md`, `INF_DECISION_REGISTRY_20260406.md`, and `Decision_153_LOCKED_20260420.md`: searched in repo, not present. CC notes the orientation-only nature of these references and proceeds with code-based evidence per directive Phase 0 ("orientation only; do not re-paste content"). Decision 153 governance over forward design is operative as a substrate citation; DIAG-042 produces documentation only.

`CC_STANDING_ARCHITECTURE_RULES.md`: read in full (308 lines). Section A Principle 1 (AI-first), Principle 5 (Closed-Loop Learning), Principle 7 (Prove, don't describe), Principle 8 (Domain-agnostic), Section 0 GP-1 (Compliance is architecture), and SR-34/42/44 govern this DIAG's discipline.

---

## Section 1 — HC Layer Contract (operative documentation)

### Section 1.1 — HC operative inputs

**Primary entry function** (`web/src/lib/sci/header-comprehension.ts:277-283`, verbatim signature):

```typescript
export async function comprehendHeaders(
  input: HeaderComprehensionInput,
  tenantId: string,
): Promise<{
  comprehensions: Map<string, HeaderComprehension> | null;
  metrics: HeaderComprehensionMetrics;
}> {
```

**Input type** (`web/src/lib/sci/header-comprehension.ts:24-31`):

```typescript
export interface HeaderComprehensionInput {
  sheets: Array<{
    sheetName: string;
    columns: string[];
    sampleRows: Record<string, unknown>[];  // 3-5 rows per sheet
    rowCount: number;
  }>;
}
```

**Entry-function head (verbatim, lines 277-326):**

```typescript
export async function comprehendHeaders(
  input: HeaderComprehensionInput,
  tenantId: string,
): Promise<{
  comprehensions: Map<string, HeaderComprehension> | null;
  metrics: HeaderComprehensionMetrics;
}> {
  const allColumns = input.sheets.flatMap(s => s.columns);

  // Step 1: Check vocabulary bindings (Phase E will populate these)
  const existingBindings = await lookupVocabularyBindings(tenantId, allColumns, {
    columnCount: input.sheets[0]?.columns.length ?? 0,
    rowCountBucket: 'medium',
  });
  // Step 2: If ALL columns have confirmed bindings with high confidence, skip LLM
  const allBound = allColumns.length > 0 && allColumns.every(col => {
    const binding = existingBindings.get(col);
    return binding && binding.confirmationCount >= 2 && binding.interpretation.confidence >= 0.85;
  });

  if (allBound) {
    const comprehensions = buildComprehensionFromBindings(input, existingBindings);
    …
    return { comprehensions, metrics };
  }

  // Step 3: Call LLM via AIService for all headers
  const llmResponse = await callLLMForHeaders(input);
```

CC note (verbatim, not classification): HC receives sheet name, columns, sample rows (3-5 per sheet), and total row count; PLUS `tenantId`. It does NOT receive tenant entity external_id set, prior rule_set, or prior calculation result history.

**Caller surfaces** (extraction functions are called downstream of `comprehendHeaders`; the relevant pipeline call to `extractFieldIdentitiesFromTrace || buildFieldIdentitiesFromBindings` lives at `web/src/app/api/import/sci/execute/route.ts:582-584`, verbatim):

```typescript
  // HF-110: Extract field identities — HC trace primary, confirmedBindings fallback (DS-009 1.3)
  const tgtFieldIdentities = extractFieldIdentitiesFromTrace(
    unit.classificationTrace as Record<string, unknown> | undefined
  ) || buildFieldIdentitiesFromBindings(unit.confirmedBindings);
```

This pattern repeats 4× in `execute/route.ts` (lines 582, 738, 889, 1025) for different sheet types (target / transaction / entity / reference). `execute-bulk/route.ts` passes through `buildFieldIdentitiesFromBindings` only (3 sites).

### Section 1.2 — HC operative outputs

**`HeaderComprehension` type** (`web/src/lib/sci/sci-types.ts:101-107`):

```typescript
export interface HeaderComprehension {
  interpretations: Map<string, HeaderInterpretation>;  // columnName -> interpretation
  crossSheetInsights: string[];    // observations about relationships between sheets
  llmCallDuration: number;         // milliseconds
  llmModel: string;                // which model was used
  fromVocabularyBinding: boolean;  // true if recalled from stored bindings (Phase E), false if fresh LLM call
}
```

**`HeaderInterpretation` type** (`sci-types.ts:91-98`):

```typescript
export interface HeaderInterpretation {
  columnName: string;              // original header as customer wrote it
  semanticMeaning: string;         // what it means: 'month_indicator', 'employee_identifier', etc.
  dataExpectation: string;         // what values should look like: 'integer_1_to_12', 'unique_numeric_id'
  columnRole: ColumnRole;          // structural role in the dataset
  identifiesWhat?: string;         // HF-171: person, transaction, location, product, organization, account, other
  confidence: number;              // LLM's confidence in this interpretation
}
```

**`FieldIdentity` type — the persisted contract** (`sci-types.ts:82-88`):

```typescript
// Field identity = what a column IS (stable, context-independent)
// Stored in committed_data.metadata.field_identities
export interface FieldIdentity {
  structuralType: ColumnRole;         // what structural role this column plays
  contextualIdentity: string;         // what kind of identifier/measure/etc (e.g., person_identifier, currency_amount)
  confidence: number;                 // 0.0-1.0
}
```

**Persistence write sites** (verbatim grep):

```
web/src/app/api/import/sci/execute/route.ts:621:        field_identities: tgtFieldIdentities,
web/src/app/api/import/sci/execute/route.ts:777:        field_identities: txnFieldIdentities,
web/src/app/api/import/sci/execute/route.ts:916:      field_identities: entityFieldIdentities,
web/src/app/api/import/sci/execute/route.ts:1052:      field_identities: refFieldIdentities,
web/src/app/api/import/sci/execute-bulk/route.ts:577:        field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings),
web/src/app/api/import/sci/execute-bulk/route.ts:703:        field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings),
web/src/app/api/import/sci/execute-bulk/route.ts:870:        field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings),
```

`field_identities` is persisted as a nested object inside `committed_data.metadata` (per Decision 111). Storage shape: `Record<string, FieldIdentity>` keyed by column name.

### Section 1.3 — contextualIdentity operative value-set (open vs closed)

Per DIAG-041 Phase 1.5, the LLM prompt at `anthropic-adapter.ts:799-832` specifies `semanticMeaning` as free-form string with examples. Re-pasted here for self-containment:

```
- semanticMeaning: what this column IS (e.g., "person_identifier", "location_code", "currency_amount", "delivery_percentage", "month_indicator", "hub_name", "safety_incident_count")
- columnRole: one of: identifier, name, temporal, measure, attribute, reference_key, unknown
```

`columnRole` is enum-constrained (7 values). `semanticMeaning` is NOT enum-constrained — examples shown but LLM may return any string.

**Closed-set (operative) — `ROLE_MAP` at `field-identities.ts:17-38`:**

```typescript
export function buildFieldIdentitiesFromBindings(
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
```

17 keys mapped. Closed set. Extension requires code change.

**Reconciliation chain (verbatim, `execute/route.ts:582-584`):**

```typescript
  const tgtFieldIdentities = extractFieldIdentitiesFromTrace(
    unit.classificationTrace as Record<string, unknown> | undefined
  ) || buildFieldIdentitiesFromBindings(unit.confirmedBindings);
```

Per JavaScript `||` short-circuit: if `extractFieldIdentitiesFromTrace` returns null (no HC trace or empty interpretations), `buildFieldIdentitiesFromBindings(unit.confirmedBindings)` fires. Operative reality: LLM path produces open-set `contextualIdentity` strings; bindings fallback produces closed-set ROLE_MAP values.

### Section 1.4 — HC 'unknown' emission paths and downstream handling

**Code-level `'unknown'` emission sites** (verbatim grep of `header-comprehension.ts` + `field-identities.ts`):

```
web/src/lib/sci/field-identities.ts:51:        structuralType: 'unknown',
web/src/lib/sci/field-identities.ts:52:        contextualIdentity: binding.semanticRole || 'unknown',
web/src/lib/sci/header-comprehension.ts:132:          columnRole: 'unknown' as ColumnRole,
web/src/lib/sci/header-comprehension.ts:139:          dataType: 'unknown',
web/src/lib/sci/header-comprehension.ts:179:          dataType: field?.dataType ?? 'unknown',
web/src/lib/sci/header-comprehension.ts:196:  'identifier', 'name', 'temporal', 'measure', 'attribute', 'reference_key', 'unknown',
web/src/lib/sci/header-comprehension.ts:201:  return 'unknown';
web/src/lib/sci/header-comprehension.ts:221:        semanticMeaning: interp.semanticMeaning || 'unknown',
web/src/lib/sci/header-comprehension.ts:222:        dataExpectation: interp.dataExpectation || 'unknown',
web/src/lib/sci/header-comprehension.ts:398:    const role = interp.columnRole || 'unknown';
```

**Path 1 — `field-identities.ts:50-54`** (bindings-fallback case when `semanticRole` is unmapped):

```typescript
    } else {
      identities[binding.sourceField] = {
        structuralType: 'unknown',
        contextualIdentity: binding.semanticRole || 'unknown',
        confidence: binding.confidence,
      };
```

Triggered when `binding.semanticRole` is not a key in `ROLE_MAP` (e.g., a custom or unrecognized semantic_role).

**Path 2 — `header-comprehension.ts:131-140`** (LLM-fallback case when bindings recall path produces no interpretation):

Read verbatim: `'unknown' as ColumnRole` + `dataType: 'unknown'` are written into the interpretation when the bindings-recall path constructs a default interpretation for an unbound column.

**Path 3 — `header-comprehension.ts:217-222`** (LLM-path nullish coalescing):

```typescript
        semanticMeaning: interp.semanticMeaning || 'unknown',
        dataExpectation: interp.dataExpectation || 'unknown',
```

When the LLM returns a column but `semanticMeaning` is falsy.

**Path 4 — `header-comprehension.ts:397-401`** (`extractFieldIdentitiesFromTrace`):

```typescript
    const role = interp.columnRole || 'unknown';
    identities[colName] = {
      structuralType: role as ColumnRole,
      contextualIdentity: interp.semanticMeaning || 'unknown',
      confidence: typeof interp.confidence === 'number' ? interp.confidence : 0.5,
    };
```

When `columnRole` or `semanticMeaning` from a stored classification trace is falsy.

**Downstream handling of `'unknown'`** (per DIAG-041 Phase 1.7, consumers of `contextualIdentity`):

- `convergence-service.ts:887` reads `fi.contextualIdentity || 'unknown'` — passes `'unknown'` through verbatim into the FieldIdentity object used by binding selection.
- `convergence-service.ts:1058` builds `Set(measureFIs.map(([, fi]) => fi.contextualIdentity))` — `'unknown'` becomes a set member.
- `entity-resolution.ts:91, 99`: `fi.contextualIdentity?.toLowerCase().includes('person')` — `'unknown'` does NOT contain `'person'` substring, so the identifier-selection branch SKIPS columns whose `contextualIdentity === 'unknown'` for the person-identifier check.

CC note (verbatim, not classification): no code path treats `'unknown'` as a refusal/halt condition. `'unknown'` flows through the pipeline as a string value and may pass through to convergence binding selection without triggering exclusion.

### Section 1.5 — HC contract operative summary

```
HC operative inputs:
  - sheets[]: sheetName + columns + sampleRows (3-5) + rowCount per sheet
  - tenantId
  - (vocabulary bindings looked up internally by tenantId)
  - NOT passed: tenant entity external_id set, prior rule_set, prior calculation results

HC operative outputs:
  - Map<sheetName, HeaderComprehension> with interpretations Map<columnName, HeaderInterpretation>
  - HeaderComprehensionMetrics (llmCalled, duration, model, confidence averages)
  - Persisted to committed_data.metadata.field_identities (Record<columnName, FieldIdentity>)
  - FieldIdentity.structuralType: ColumnRole (closed enum, 7 values)
  - FieldIdentity.contextualIdentity: string (open OR closed depending on path)

contextualIdentity open-set:
  - YES, when HC LLM path executes (semanticMeaning is free-form per anthropic-adapter.ts:802)
  - extractFieldIdentitiesFromTrace passes LLM output through verbatim

contextualIdentity closed-set:
  - YES, when bindings-fallback path executes (ROLE_MAP at field-identities.ts:20-37, 17 keys)
  - buildFieldIdentitiesFromBindings ROLE_MAP fallback

'unknown' emission cases:
  1. field-identities.ts:51-52 — unmapped semantic_role in ROLE_MAP fallback
  2. header-comprehension.ts:131-140 — bindings-recall constructs default for unbound column
  3. header-comprehension.ts:221-222 — LLM returned falsy semanticMeaning
  4. header-comprehension.ts:397-401 — stored trace has falsy columnRole or semanticMeaning

'unknown' downstream handling:
  - convergence-service.ts:887 — passed through verbatim
  - convergence-service.ts:1058 — becomes a Set member (no exclusion)
  - entity-resolution.ts:91,99 — substring 'person' check fails for 'unknown' (column skipped from identifier selection there only)
  - No code path treats 'unknown' as a refusal or halt
```

---

## Section 2 — Convergence Layer Contract (operative documentation)

### Section 2.1 — Convergence operative inputs

**`convergeBindings` signature** (`web/src/lib/intelligence/convergence-service.ts:166-171`, verbatim):

```typescript
export async function convergeBindings(
  tenantId: string,
  ruleSetId: string,
  supabase: SupabaseClient,
  calculationRunId?: string,  // OB-197 G11: scope signals emitted by this convergence to a calculation run
): Promise<ConvergenceResult> {
```

**Caller surfaces (verbatim grep, 6 sites):**

```
web/src/app/api/intelligence/converge/route.ts:51:      const result = await convergeBindings(tenantId, rsId, supabase);
web/src/app/api/intelligence/wire/route.ts:361:        const result = await convergeBindings(tenantId, rs.id, supabase);
web/src/app/api/calculation/run/route.ts:230:        const convResult = await convergeBindings(tenantId, ruleSetId, supabase, calculationRunId);
web/src/app/api/import/commit/route.ts:998:        const result = await convergeBindings(tenantId, rs.id, supabase);
web/src/app/api/import/sci/execute/route.ts:192:          const result = await convergeBindings(tenantId, rs.id, supabase);
```

All callers pass `tenantId`, `ruleSetId`, `supabase` client. Only `calculation/run/route.ts:230` passes the optional `calculationRunId` for signal scoping (OB-197 G11).

**Internally fetched inputs (function body, lines 184-208):**

```typescript
  // 1. Fetch rule set
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('id', ruleSetId)
    .single();
  …
  // 2. Extract plan requirements
  const components = extractComponents(ruleSet.components);
  …
  // HF-196 Phase 3: D153 B-E4 atomic cutover — read metric_comprehension signals
  const metricComprehensionSignals = await loadMetricComprehensionSignals(tenantId, ruleSetId, supabase);
  observations.metricComprehension = metricComprehensionSignals;
  …
  // 3. Inventory data capabilities (OB-162: includes field identities)
  const capabilities = await inventoryData(tenantId, supabase);
```

**Tenant-entity scan inside convergence-service.ts (verbatim grep):**

```
$ grep -n "tenant.entities|tenantEntityExternalIds|registeredEntities|external_id" \
    web/src/lib/intelligence/convergence-service.ts
(empty — zero matches)
```

CC note (verbatim, not classification): per DIAG-041 Phase 2.4, convergence does NOT read tenant entity external_id values. The function fetches `rule_sets`, `components`, `metric_comprehension` signals (from `classification_signals`), and `capabilities` (from `inventoryData` — committed_data + field_identities). No entity-table read inside convergence.

### Section 2.2 — Convergence operative outputs

**`ComponentBinding` type** (`convergence-service.ts:85-96`):

```typescript
// OB-162: Per-component convergence binding (Decision 111)
export interface ComponentBinding {
  source_batch_id: string;
  column: string;
  field_identity: FieldIdentity;
  match_pass: number | 'failed';  // 1=structural/boundary, 2=contextual/AI, 3=token, 'failed'=HF-203 binding rejection
  confidence: number;
  // HF-111: Scale factor for percentage columns (e.g., 100 when column is 0-1 ratio but boundary is 0-100)
  scale_factor?: number;
  // HF-196 Phase 1G Path α (HF-203): rejection metadata when binding misalignment detected (ratio>10 vs peer median)
  failure_reason?: string;
}
```

**`ConvergenceResult` type** (`convergence-service.ts:128-150`):

```typescript
export interface ConvergenceResult {
  derivations: MetricDerivationRule[];
  matchReport: Array<{ component: string; dataType: string; confidence: number; reason: string }>;
  signals: Array<{ domain: string; fieldName: string; semanticType: string; confidence: number }>;
  gaps: ConvergenceGap[];
  // OB-162: Per-component input bindings (Decision 111)
  componentBindings: Record<string, Record<string, ComponentBinding>>;
  // OB-197 G11: signal-surface observations (within-run + cross-run).
  observations: {
    withinRun: ConvergenceSignalObservation[];
    crossRun: ConvergenceSignalObservation[];
    metricComprehension: MetricComprehensionSignal[];
  };
}
```

**`ConvergenceGap` type** (`convergence-service.ts:105-113`):

```typescript
export interface ConvergenceGap {
  component: string;
  componentIndex: number;
  requiredMetrics: string[];
  calculationOp: string;
  reason: string;
  resolution: string;
  referenceDataAvailable?: boolean;
}
```

**Persistence** (per DIAG-041 Phase 6.2; calculation/run/route.ts:241-252, verbatim):

```typescript
          if (bindingCount > 0) {
            // Decision 111: convergence_bindings is the primary output
            updatedBindings.convergence_bindings = convResult.componentBindings;
          }

          if (derivationCount > 0) {
            updatedBindings.metric_derivations = convResult.derivations;
          }

          // Persist to rule_set for reuse on subsequent calculations
          await supabase
            .from('rule_sets')
            .update({ input_bindings: updatedBindings as unknown as Json })
            .eq('id', ruleSetId);
```

`componentBindings` is persisted to `rule_sets.input_bindings.convergence_bindings`. `gaps` are NOT persisted — they live in the function's return value only and are surfaced via log lines (`addLog(...)` in callers).

### Section 2.3 — Convergence operative invariants

`generateAllComponentBindings` is the function that emits bindings (per DIAG-041 Phase 2.2). Checks and failure-handling sites within the function body (verbatim, with explanatory locator):

**Check 1 — Reuse short-circuit (line 1805-1810):**

```typescript
  // HF-112: Reuse existing bindings if complete (zero AI cost)
  if (hasCompleteBindings(existingConvergenceBindings, components.length)) {
    console.log('[Convergence] HF-112 Existing bindings complete — reusing (zero AI cost)');
    …
    return;
  }
```

Action on completeness: full short-circuit — re-bind not attempted; existing bindings are passed through verbatim. The reuse path skips ALL invariant checks for already-bound components.

**Check 2 — Measure columns must exist (line 1849):**

```typescript
  if (measureColumns.length === 0 || !primaryCap) return;
```

Action: silent return with empty bindings.

**Check 3 — AI proposal validation (line 1887-1888):**

```typescript
          // Boundary validation of AI proposal
          const { score: boundaryScore, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
          const isValidated = !req.expectedRange || boundaryScore > 0.1;
```

Action: validation result tagged on the binding as `match_pass: isValidated ? 1 : 2` and `confidence: isValidated ? 0.9 : 0.6`. Binding is written either way.

**Check 4 — Already-bound exclusion (line 1885):**

```typescript
        if (mc && !boundColumns.has(proposedColumnName)) {
```

Action: skip the AI proposal if its target column is already bound to another requirement. Falls through to boundary-fallback.

**Check 5 — Boundary fallback minimum threshold (line 1911, 1920):**

```typescript
      const BOUNDARY_FALLBACK_MIN_SCORE = 0.50;
      …
      if (candidates.length > 0 && candidates[0].score >= BOUNDARY_FALLBACK_MIN_SCORE) {
        const best = candidates[0];
        bindings[compKey][req.role] = {
          …
          match_pass: 3,  // Boundary-only fallback
          …
        };
```

Action: bind if boundary score ≥ 0.50, else leave requirement unbound (line 1932-1934):

```typescript
      } else if (candidates.length > 0) {
        console.log(`[Convergence] HF-199 D2: ${comp.name}:${req.role} boundary candidate "${candidates[0].name}" rejected (score=${candidates[0].score.toFixed(2)} < ${BOUNDARY_FALLBACK_MIN_SCORE} threshold). Requirement left unbound; gap will be recorded.`);
      }
```

**Check 6 — entity_identifier selection (lines 1937-1949):**

```typescript
    // Find entity identifier column
    const idEntries = Object.entries(cap.fieldIdentities)
      .filter(([, fi]) => fi.structuralType === 'identifier');
    if (idEntries.length > 0) {
      const [colName, fi] = idEntries[0];
      bindings[compKey]['entity_identifier'] = {
        source_batch_id: batchId,
        column: colName,
        field_identity: fi,
        match_pass: 1,
        confidence: match.matchConfidence,
      };
    }
```

Action: pick `idEntries[0]` (first identifier column by insertion order in `cap.fieldIdentities`). No value-content check. No cardinality check. No tenant-entity overlap gate. No `contextualIdentity` filter at this site (the `'person'`-substring filter is in `entity-resolution.ts:91,99`, separate surface).

**Invariants NOT currently enforced at convergence binding-write time** (CC notes structurally evident from code, not classification):

- entity_identifier column-value distinct-count vs tenant entity count
- entity_identifier column-value-set intersection with tenant entity external_ids
- entity_identifier `contextualIdentity === 'person_identifier'` (or any other contextualIdentity restriction)
- No measure/identifier ambiguity check (a column tagged `identifier` AND simultaneously satisfying `measure` criteria — there's no rejection path)
- No two-pass verification (run binding, run sample calc, verify outcome plausibility)

### Section 2.4 — Convergence operative gap-handling

**Gap creation sites (verbatim grep):**

```
web/src/lib/intelligence/convergence-service.ts:175:  const gaps: ConvergenceGap[] = [];
web/src/lib/intelligence/convergence-service.ts:564:      for (const g of aiResult.gaps) {
web/src/lib/intelligence/convergence-service.ts:574:  console.log(`[Convergence] OB-185 Pass 4: ${aiResult.derivations.length} derivations, ${aiResult.gaps.length} gaps`);
web/src/lib/intelligence/convergence-service.ts:2187:    const aiGaps = (parsedResult?.gaps as Array<Record<string, unknown>>) ?? [];
web/src/lib/intelligence/convergence-service.ts:2249:      ...gaps.map(g => g.metric),
```

**Gap creation when `capabilities.length === 0` (lines 209-220):**

```typescript
  if (capabilities.length === 0) {
    for (const comp of components) {
      gaps.push({
        component: comp.name,
        componentIndex: comp.index,
        requiredMetrics: comp.expectedMetrics,
        calculationOp: comp.calculationOp,
        reason: 'No committed data found for this tenant',
        resolution: `Import data for this plan's components`,
      });
    }
    return { derivations, matchReport, signals, gaps, componentBindings, observations };
  }
```

**Gap consumer surfaces (verbatim grep):**

```
web/src/app/api/intelligence/converge/route.ts:129:      for (const gap of result.gaps) {
web/src/app/api/calculation/run/route.ts:233:        const gapCount = convResult.gaps.length;
web/src/app/api/calculation/run/route.ts:268:          for (const gap of convResult.gaps) {
web/src/app/api/import/sci/execute/route.ts:248:            gaps: result.gaps.map(g => ({
```

`calculation/run/route.ts:265-270` (verbatim, gap consumption):

```typescript
          addLog(`HF-165: Convergence complete — ${derivationCount} derivations, ${bindingCount} component bindings, ${gapCount} gaps`);
        } else {
          addLog(`HF-165: Convergence produced 0 derivations and 0 bindings (${gapCount} gaps)`);
          for (const gap of convResult.gaps) {
            addLog(`HF-165 Gap: ${gap.component} — ${gap.reason}`);
          }
        }
```

CC note (verbatim, not classification): gaps are consumed only as log lines (`addLog`). They are not persisted to a table, not surfaced as user-facing notifications, not used to gate downstream calculation, and not written to `classification_signals`. Calculation proceeds whether gaps exist or not (line 272-275 catches convergence failures as non-blocking).

### Section 2.5 — Convergence contract operative summary

```
Convergence operative inputs:
  - tenantId, ruleSetId, supabase, calculationRunId?
  - Fetched internally: rule_sets row (components + input_bindings), metric_comprehension signals from classification_signals (HF-196 Phase 3 D153 cutover), capabilities (committed_data + field_identities) via inventoryData
  - NOT passed/fetched: tenant entities table content, prior calculation_results, user override history

Convergence operative outputs:
  - ConvergenceResult { derivations, matchReport, signals, gaps, componentBindings, observations }
  - componentBindings persisted to rule_sets.input_bindings.convergence_bindings on calc-time generation
  - gaps NOT persisted; surfaced only via log lines

Invariants currently enforced (with code citations):
  - Measure columns must exist (line 1849): silent return with empty bindings if none
  - AI proposal boundary validation (line 1887-1888): tagged on binding via match_pass + confidence; binding written either way
  - Already-bound column exclusion (line 1885): one column per binding role, first-come-first-served
  - Boundary fallback minimum threshold ≥ 0.50 (line 1911, 1920): rejected if below
  - HF-203 binding misalignment via failure_reason — code referenced in type def line 95 but not paste-traced in this DIAG (further detail in convergence-service.ts:1666+ hasCompleteBindings logic — out of Phase 2 scope here)

Invariants NOT currently enforced (gaps DIAG-041 + DIAG-042 surfaced):
  - entity_identifier column value-set ∩ tenant.entities.external_id (no check site)
  - entity_identifier cardinality matching tenant entity count (no check site)
  - entity_identifier contextualIdentity restriction (no filter at line 1937-1949 site)
  - measure/identifier disambiguation (no rejection path for columns satisfying both)
  - Sample-calc plausibility two-pass verification (no two-pass logic)

Failure handling when invariants violated:
  - Boundary score < 0.50: requirement left unbound; gap recorded; calculation proceeds without that requirement
  - capabilities.length === 0: all components get a gap; convergence returns; calculation may proceed via fallback paths
  - Convergence throws (e.g., AI call failure): caught at calculation/run/route.ts:272-274, logged as non-blocking, calculation proceeds with whatever bindings exist (possibly none)

Gap consumer surfaces (operative):
  - calculation/run/route.ts:265-270 — addLog
  - intelligence/converge/route.ts:129 — handler response body
  - import/sci/execute/route.ts:248 — response body
  - NOT persisted to any table
  - NOT written to classification_signals
  - NOT user-notification-triggering
```

