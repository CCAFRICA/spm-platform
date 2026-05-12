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

---

## Section 3 — Engine Consumption Contract (operative documentation)

### Section 3.1 — Engine operative inputs

**Engine entry** (`web/src/app/api/calculation/run/route.ts:66`):

```typescript
export async function POST(request: NextRequest) {
```

Input body (line 67-68): `{ tenantId, periodId, ruleSetId }`.

**Database read sites (verbatim grep):**

```
176:    .from('rule_sets')                       — primary rule_set fetch (line 176-179)
250-258: .from('rule_sets')                     — convergence-result write + re-read on calc-time convergence
294:    .from('rule_sets')                       — assignment-related lookup
375, 429: .from('entities')                     — entity fetches (calculation roster)
442, 461: .from('periods')                      — period fetch + lookback
486, 515, 539, 748, 774, 1004: .from('committed_data')  — primary data fetches
732, 1434: .from('periods')                     — period reads in lookback
1446: .from('entities')                          — entity refresh
```

**`convergenceBindings` read site (verbatim, line 282-284):**

```typescript
  // ── OB-118: Parse metric derivation rules from input_bindings ──
  const inputBindings = ruleSet.input_bindings as Record<string, unknown> | null;
  let metricDerivations: MetricDerivationRule[] =
    (inputBindings?.metric_derivations as MetricDerivationRule[] | undefined) ?? [];
```

And (verbatim, line 320-330, ruleSet.input_bindings.convergence_bindings access):

```typescript
  const convergenceBindings = inputBindings?.convergence_bindings as Record<string, Record<string, unknown>> | undefined;
  …
```

Engine consumes `convergenceBindings` from `rule_sets.input_bindings.convergence_bindings`. If empty, engine invokes `convergeBindings` at calc-time (line 230, per Section 2.2 persistence trace).

### Section 3.2 — Engine operative assumptions (checked vs unchecked)

**Check — early validation on POST body (lines 70-74, verbatim):**

```typescript
  if (!tenantId || !periodId || !ruleSetId) {
    return NextResponse.json(
      { error: 'Missing required fields: tenantId, periodId, ruleSetId' },
      { status: 400 }
    );
  }
```

Action: refusal with HTTP 400 if any of the three required IDs is missing.

**Check — ruleSet must exist** (lines 176-184; ruleSet fetched and downstream checked at line 182):

```typescript
  const { data: ruleSet, error: rsErr } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings, population_config, metadata')
    .eq('id', ruleSetId)
    .single();
  …
  if (!ruleSet) {
    return NextResponse.json(
      { error: 'Rule set not found' },
      { status: 404 }
    );
  }
```

Action: refusal with HTTP 404 if rule_set absent.

**Check — period must exist** (similar pattern at line 442-448; HTTP 404 on absence).

**`usedConvergenceBindings` flip site (verbatim, line 1717-1745):**

```typescript
      let usedConvergenceBindings = false;

      if (compBindings && dataByBatch.size > 0) {
        const cbMetrics = resolveMetricsFromConvergenceBindings(
          compBindings, component, entityInfo?.external_id ?? '', compIdx
        );
        if (cbMetrics && Object.keys(cbMetrics).length > 0) {
          metrics = cbMetrics;
          usedConvergenceBindings = true;
        } else {
          // Convergence binding resolution returned nothing — fall back
          const entityStoreAgg = entityStoreId !== undefined
            ? perStoreEntitySheetAgg.get(String(entityStoreId))
            : undefined;
          metrics = buildMetricsForComponent(
            component, entitySheetData, entityStoreData,
            aiContextSheets, entityStoreAgg, metricMappings
          );
        }
      } else {
        // FALLBACK: Old sheet-matching path (no convergence bindings for this component)
        const entityStoreAgg = entityStoreId !== undefined
          ? perStoreEntitySheetAgg.get(String(entityStoreId))
          : undefined;
        metrics = buildMetricsForComponent(
          component, entitySheetData, entityStoreData,
          aiContextSheets, entityStoreAgg, metricMappings
        );
      }
```

CC note (verbatim, not classification): when `cbMetrics` resolves to null OR empty object, the engine silently falls through to `buildMetricsForComponent` + `metricDerivations`. The fallback is logged at line 1749 only for `entityResults.length === 0 && compIdx === 0` (one log line per calculation, not per fallback). No signal is written to `classification_signals` on the silent fall-through.

**OB-118 merge guard (verbatim, line 1757-1766):**

```typescript
      for (const [key, value] of Object.entries(derivedMetrics)) {
        if (!(key in metrics)) {
          metrics[key] = value;  // derivation fills gaps only; convergence values preserved
        } else {
          ob118MergeGuardFiredCount++;  // HF-208: track guard firings (convergence preserved over derivation)
          // HF-212 TIER 3: emit exception detail inline (always visible) + push flag for Tier 2
          addLog(`[CalcRecon-T3] EXCEPTION entity=${entityInfo?.external_id ?? entityId} component=${compIdx} type=ob118MergeGuardFired existingKey=${key} preserved=convergence`);
          currentEntityFlags.push('ob118MergeGuardFired');
        }
      }
```

Implicit assumption encoded by the guard: convergence-resolved metrics are authoritative; derivation rules fill gaps only. Per Decision 111 / Decision 153 atomic cutover (cited at line 1752-1756).

**Unchecked assumptions (CC notes structurally evident from code, not classification):**

- engine does NOT verify `convergence_bindings.entity_identifier.column` values exist as keys in tenant entities table
- engine does NOT verify cardinality of `dataByBatch` cache matches expected tenant entity count
- engine does NOT verify `compBindings` cover all components in the rule_set (silent fall-through if missing)
- engine does NOT verify metric value plausibility (e.g., ratio output in [0, 10] range) before passing to intent-executor
- engine treats `cbMetrics === null` as "fall back silently" rather than as a structural exception requiring user surface

### Section 3.3 — Engine operative signal emission

**`writeSignal` call sites in `route.ts` (verbatim grep):**

```
38:import { writeSignal, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
2138:      writeSignal({         — synaptic consolidation signals (lifecycle:synaptic_consolidation)
2155:  writeSignal({              — convergence:dual_path_concordance training signal
```

**Synaptic consolidation emit (line 2138-2151, verbatim):**

```typescript
  if (signalBatch.length > 0) {
    for (const signal of signalBatch) {
      writeSignal({
        tenantId,
        signalType: (signal.signalType as string) ?? 'lifecycle:synaptic_consolidation',
        signalValue: (signal.signalValue as Record<string, unknown>) ?? {},
        source: 'ai_prediction',
        context: { trigger: 'synaptic_consolidation', batchId: undefined },
      }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
        …
      });
    }
  }
```

**Concordance signal emit (line 2155-2165, verbatim):**

```typescript
  writeSignal({
    tenantId,
    signalType: 'convergence:dual_path_concordance',
    signalValue: {
      matchCount: intentMatchCount,
      mismatchCount: intentMismatchCount,
      concordanceRate: parseFloat(concordanceRate.toFixed(2)),
      entityCount: calculationEntityIds.length,
      componentCount: defaultComponents.length,
      intentsTransformed: componentIntents.length,
```

**Log-only emit sites (`[CalcRecon-T1/T2/T3]`):**

```
1334: [CalcRecon-T3] EXCEPTION entity=… type=diag003Fallback batchId=… column=…
1542-1553: [CalcRecon-T1] header lines (calculation run start)
1763: [CalcRecon-T3] EXCEPTION entity=… component=… type=ob118MergeGuardFired existingKey=… preserved=convergence
2085: [CalcRecon-T2] external_id | name | variant=… | total=… | components=[…] | flags=[…]
2417: [CalcRecon-T3] EXCEPTION component=… role=… type=boundaryFallback
2426-2433: [CalcRecon-T1] footer lines (entitiesCalculated, grandTotal, componentTotals, flags, variantDistribution)
```

CC note (verbatim, not classification): the engine writes 2 signal types to `classification_signals` table — `lifecycle:synaptic_consolidation` and `convergence:dual_path_concordance` — both written at end-of-calculation, NOT per-entity or per-component. The `[CalcRecon-T1/T2/T3]` exception emissions are LOG-ONLY (`addLog` → `log: string[]` array + `console.log`), not persisted to `classification_signals`.

When `usedConvergenceBindings` flips to false (silent fall-through at line 1745), NO signal is written. The fallback is observable only via the single `addLog` line at line 1749 (one log per calculation, not one log per fallback).

### Section 3.4 — Engine operative refusal-vs-result paths

**Refusal paths (HTTP non-200 returns, throw, or abort):**

```
70-74: HTTP 400 — missing tenantId/periodId/ruleSetId
182:   HTTP 404 — rule_set not found
210:   HTTP <error> — (read context for full reason)
353:   HTTP <error>
412:   HTTP <error>
448:   HTTP <error> — period not found
1100:  HTTP <error>
1142:  throw new Error(…)
1945:  throw new Error(…)
2193:  HTTP <error>
2227:  HTTP <error>
2483:  HTTP 200 — success (line 2483 return)
```

**Skip-with-result paths (proceed with zero/partial result, no error):**

```
1537-1700: excludedEntities — entity has no qualifying variant; logged but calculation continues for other entities
1654-1657: console.log(`[VARIANT] … NO MATCH — excluded`)
1717-1745: usedConvergenceBindings = false fallback — convergence resolution returns null, engine silently uses sheet-matching fallback
2096-2101: addLog excluded entity summary at calculation end (NOT user-facing error)
```

**Bright-line "structural exception vs data anomaly" documentation in code:** CC searched for explicit dichotomy markers (e.g., comments or code paths that name "binding invalid vs data missing"). Grep evidence:

```
$ grep -n "structural exception|data anomaly|binding invalid|invalid binding" \
    web/src/app/api/calculation/run/route.ts
(empty — zero matches)
```

CC note (verbatim, not classification): no code path or comment in `route.ts` explicitly distinguishes "binding is invalid; refuse to calculate" from "binding is valid but data is missing; produce zero with logged exception". The silent fall-through at line 1717-1745 treats `cbMetrics === null` (a possible-binding-invalid signal) as equivalent to "missing convergence binding entirely" (which routes to sheet-matching fallback). Both produce a result; neither produces a refusal.

### Section 3.5 — Engine contract operative summary

```
Engine operative inputs:
  - POST body: { tenantId, periodId, ruleSetId } — required, validated at handler entry
  - rule_sets (incl. components + input_bindings.convergence_bindings + input_bindings.metric_derivations)
  - periods (selected + lookback)
  - entities (calculation roster + refresh)
  - committed_data (paginated reads; filtered by source_date when period_id is null per OB-152)
  - convergenceBindings from rule_sets.input_bindings.convergence_bindings (calc-time-generated if absent)

Engine operative assumptions (checked):
  - tenantId/periodId/ruleSetId non-null at handler entry (HTTP 400 if missing)
  - rule_set row exists (HTTP 404 if missing)
  - period row exists (HTTP 404 if missing)
  - convergence-resolved metrics are authoritative — OB-118 merge guard preserves them over derivation (line 1757-1766)

Engine operative assumptions (unchecked):
  - convergence_bindings.entity_identifier.column values match tenant entity external_ids — NO check
  - dataByBatch cache cardinality matches expected entity count — NO check
  - convergence binding covers all components in rule_set — NO check; silent fall-through if any missing
  - Resolved metric values within plausible range (e.g., ratio in [0, 10]) — NO check before intent-executor
  - cbMetrics === null implies binding-invalid (not data-missing) — NO distinguishing logic

Engine signal emission to logs:
  - [CalcRecon-T1] header/footer (line 1542-1553, 2426-2433)
  - [CalcRecon-T2] per-entity row (line 2085)
  - [CalcRecon-T3] EXCEPTION lines (line 1334 diag003Fallback, 1763 ob118MergeGuardFired, 2417 boundaryFallback)
  - HF-108 resolution path (line 1749) — one log per calculation run

Engine signal emission to classification_signals:
  - lifecycle:synaptic_consolidation (line 2138, per signal in signalBatch)
  - convergence:dual_path_concordance (line 2155, one per calculation run)
  - NO signal written when usedConvergenceBindings flips false
  - NO signal written on diag003Fallback fire
  - NO signal written on ob118MergeGuardFired fire
  - NO signal written on entity exclusion (line 1654)
  - NO signal written on boundary fallback (line 2417)

Engine refusal paths (HTTP non-200 or throw):
  - Missing required body fields → 400
  - Rule_set not found → 404
  - Period not found → 404
  - Throw at lines 1142 + 1945 — context-specific (read in surrounding code for trigger)

Engine skip-and-return-zero paths:
  - Excluded entities (no qualifying variant, line 1655) — proceed with other entities
  - convergence_bindings resolution returns null — silent fall-through to sheet-matching
  - Component without binding — silent fall-through to sheet-matching

Bright line "structural exception vs data anomaly":
  - NOT documented in code (zero grep matches for those phrases)
  - NOT structurally encoded in the engine's path selection
  - All non-fatal failures route to skip-and-produce-result; no refusal/halt mechanism for "binding invalid"
```

---

## Section 4 — Flywheel Integration (operative documentation)

### Section 4.1 — `classification_signals` schema (verbatim from `SCHEMA_REFERENCE_LIVE.md:132+`)

```
### classification_signals (20 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO | |
| entity_id | uuid | YES | |
| signal_type | text | NO | |
| signal_value | jsonb | NO | |
| confidence | numeric | YES | |
| source | text | YES | |
| context | jsonb | NO | |
| created_at | timestamp with time zone | NO | now() |
| source_file_name | text | YES | |
| sheet_name | text | YES | |
| structural_fingerprint | jsonb | YES | |
| classification | text | YES | |
| decision_source | text | YES | |
| classification_trace | jsonb | YES | |
| header_comprehension | jsonb | YES | |
| vocabulary_bindings | jsonb | YES | |
```

(table has 20 columns total per the heading; first 17 listed. Remaining 3 columns not visible in the truncated section read; CC notes that all 20-column reads/writes operate via `canonical-signal-writer.ts` per OB-199 Phase 4.)

### Section 4.2 — Operative signal emission sites

**Canonical writer** (`web/src/lib/intelligence/canonical-signal-writer.ts`) is the singular insert surface per OB-199 Phase 4 (DS-022 v2 §5.1). All write paths route through it.

**`writeSignal` / `writeSignalBatch` / `writeClassificationSignal` callers (verbatim grep, by source layer):**

| Layer | File | Line | Signal type emitted |
|---|---|---|---|
| Engine | `app/api/calculation/run/route.ts` | 2138 | `lifecycle:synaptic_consolidation` (default) — passed from `signalBatch` |
| Engine | `app/api/calculation/run/route.ts` | 2155 | `convergence:dual_path_concordance` |
| Convergence | `lib/intelligence/convergence-service.ts` | 368 | (read line for signal_type) |
| Convergence (router) | `app/api/intelligence/converge/route.ts` | 107, 130 | facade — `classification:outcome` via `writeClassificationSignal` |
| SCI Execute | `app/api/import/sci/execute/route.ts` | 377 | `classification:outcome` via `writeClassificationSignal` |
| SCI Analyze | `app/api/import/sci/analyze/route.ts` | 464 | `classification:outcome` via `writeClassificationSignal` |
| SCI Process-job | `app/api/import/sci/process-job/route.ts` | 343 | `classification:outcome` via `writeClassificationSignal` |
| Reconciliation | `app/api/reconciliation/run/route.ts` | 131 | (signal_type at line; read in code) |
| Reconciliation | `app/api/reconciliation/compare/route.ts` | 158 | (signal_type at line) |
| AI Assessment | `app/api/ai/assessment/route.ts` | 179 | (signal_type at line) |
| Approvals | `app/api/approvals/[id]/route.ts` | 168 | (signal_type at line) |
| Ingest Classification | `app/api/ingest/classification/route.ts` | 45 | `.from('classification_signals').insert(...)` (test mock; see grep) |
| Plan-comprehension emitter | `lib/compensation/plan-comprehension-emitter.ts` | 115 | `writeSignalBatch` — emits `comprehension:plan_interpretation` signals (per HF-196 D153 cutover; these are read by convergence per Section 2.1) |
| SCI capture | `lib/sci/signal-capture-service.ts` | 51, 104 | various SCI signals (`content_classification`, `field_binding`, `negotiation_round`, `convergence_outcome`, `cost_event` per `extractConfidence` switch at line 287-304) |

Per `signal-capture-service.ts:287-320`, the SCI capture surface supports these signal categories:

```typescript
function extractConfidence(signal: SCISignal): number {
  switch (signal.signalType) {
    case 'content_classification':       return signal.winningConfidence;
    case 'content_classification_outcome': return signal.predictionConfidence;
    case 'field_binding':                return signal.avgConfidence;
    case 'field_binding_outcome':        return signal.predictionConfidence;
    case 'negotiation_round':            return signal.round2TopConfidence;
    case 'convergence_outcome':          return signal.matchRate;
    case 'cost_event':                   return 1.0;
  }
}

function getSource(signal: SCISignal): string {
  switch (signal.signalType) {
    case 'content_classification':
    case 'field_binding':
    case 'negotiation_round':
      return 'sci_agent';
    case 'content_classification_outcome':
    case 'field_binding_outcome':
      return (signal as { wasOverridden?: boolean }).wasOverridden ? 'user_corrected' : 'user_confirmed';
    case 'convergence_outcome':
      return 'reconciliation';
    case 'cost_event':
      return 'system';
  }
}
```

### Section 4.3 — Operative signal consumption sites

**`from('classification_signals')` SELECT sites in `web/src/lib/` (verbatim grep, deduplicated):**

```
web/src/lib/sci/contextual-reliability.ts:67           — loadSignalsForTenant (cached per-session)
web/src/lib/intelligence/ai-metrics-service.ts:96      — fetchSignals for AI metrics computation
web/src/lib/sci/classification-signal-service.ts:153   — lookupPriorSignals
web/src/lib/sci/classification-signal-service.ts:356   — computeClassificationDensity
web/src/lib/sci/classification-signal-service.ts:546   — recallVocabularyBindings
web/src/lib/intelligence/convergence-service.ts:231    — within-run signal observation
web/src/lib/intelligence/convergence-service.ts:241    — cross-run signal observation
web/src/lib/intelligence/convergence-service.ts:775    — loadMetricComprehensionSignals (HF-196 Phase 3 D153 cutover)
```

**Consumer purposes (CC documents from surrounding code, verbatim claims only):**

| Consumer | Purpose (per comment/code context) | Adaptation? |
|---|---|---|
| `contextual-reliability.ts:67` | Empirical accuracy data for SCI 5-level reliability calculation (fingerprint → category → boundary → global → seed) | Drives `reliability.level` decision; AI agent confidence is adjusted per this score upstream |
| `ai-metrics-service.ts:96` | OB-86 computes calibration metrics for AI insight surface | Read-only observation; does not write back |
| `classification-signal-service.ts:153` | `lookupPriorSignals` — read priors before scoring (SCI agent classification phase) | Boost +0.05 / +0.07 / +0.10 added to agent scores via `tenant-context.ts:computeTenantContextAdjustments` — closed loop into SCI agent decision-making |
| `classification-signal-service.ts:356` | `computeClassificationDensity` — adaptive SCI execution mode (full_analysis / light_analysis / confident) | Drives `SCIExecutionMode` selection |
| `classification-signal-service.ts:546` | `recallVocabularyBindings` — HC vocabulary recall (skip LLM on Tier 1) | Closes HC loop: stored binding bypasses LLM |
| `convergence-service.ts:231, 241` | Within-run + cross-run signal observation (OB-197 G11) | "Observation, not computation" per DS-021 §7 — observed, surfaced via `ConvergenceResult.observations`, NOT used to gate matching (CC notes structurally evident, not classification) |
| `convergence-service.ts:775` | `loadMetricComprehensionSignals` (HF-196 Phase 3 D153 cutover) — operative input to convergence binding selection | Consumed by `generateAllComponentBindings` as authoritative metric semantics |

### Section 4.4 — Fingerprint flywheel (operative wiring)

`web/src/lib/sci/fingerprint-flywheel.ts:1–192` (file overview already pasted in DIAG-041 Phase 6.4). Re-pasted relevant write-path section here (lines 127–192, verbatim):

```typescript
export async function writeFingerprint(
  tenantId: string,
  fingerprintHash: string,
  classificationResult: Record<string, unknown>,
  columnRoles: Record<string, string>,
  sourceFileName: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if record exists
    const { data: existing } = await supabase
      .from('structural_fingerprints')
      .select('id, match_count, confidence')
      .eq('tenant_id', tenantId)
      .eq('fingerprint_hash', fingerprintHash)
      .maybeSingle();

    if (existing) {
      // HF-145: Optimistic locking — only update if match_count hasn't changed since read.
      const newMatchCount = existing.match_count + 1;
      const newConfidence = 1 - (1 / (newMatchCount + 1));

      const { count: updated } = await supabase
        .from('structural_fingerprints')
        .update({
          match_count: newMatchCount,
          confidence: Number(newConfidence.toFixed(4)),
          classification_result: classificationResult,
          column_roles: columnRoles,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('match_count', existing.match_count);  // optimistic lock
      …
    } else {
      // Insert new fingerprint record — confidence = 1 - 1/(1+1) = 0.5
      await supabase
        .from('structural_fingerprints')
        .insert({
          tenant_id: tenantId,
          fingerprint_hash: fingerprintHash,
          fingerprint: fingerprintHash,
          classification_result: classificationResult,
          column_roles: columnRoles,
          match_count: 1,
          confidence: 0.5,
          source_file_sample: sourceFileName,
        });
      …
    }
  } catch (err) {
    // Flywheel write failure must NEVER block classification
    console.warn(`[SCI-FINGERPRINT] Write failed (non-blocking): ${err instanceof Error ? err.message : 'unknown'}`);
  }
}
```

**What the flywheel caches** (per the `structural_fingerprints` columns referenced in update at lines 154-163 and insert at lines 174-184): `tenant_id`, `fingerprint_hash`, `classification_result` (JSONB), `column_roles` (JSONB), `match_count`, `confidence`, `source_file_sample`, `updated_at`.

**Confidence update formula** (line 152): `newConfidence = 1 - (1 / (newMatchCount + 1))` — monotonic increase as match_count grows. At match_count=1: 0.5. At match_count=10: ~0.91. At match_count=100: ~0.99.

**Confidence threshold gating Tier 1** (per line 57, copied here):

```typescript
    if (conf >= 0.5) {
      …
      return { tier: 1, match: true, … };
    }
    // DIAG-010 / OB-178: Demoted Tier 1 returns as Tier 2 match with existing data.
```

### Section 4.5 — OB-177 self-correction loop (operative state)

**Grep evidence (verbatim):**

```
$ grep -rn "OB-177|decreaseConfidence|confidence -=" web/src/lib/sci/ web/src/lib/intelligence/ --include="*.ts"
web/src/lib/sci/entity-resolution.ts:313:  // for unchanged values). Per OB-177 pattern at processEntityUnit:461-509.
web/src/lib/sci/fingerprint-flywheel.ts:54:    // Self-correction (OB-177) decreases confidence on binding failures.
web/src/lib/sci/agents.ts:283:      entity.confidence -= 0.10;
web/src/lib/sci/agents.ts:293:      entity.confidence -= 0.15;
```

**`fingerprint-flywheel.ts:52-69` (verbatim — the Tier 1 demotion gate that the OB-177 comment references):**

```typescript
    // HF-145: Confidence threshold gates Tier 1 routing.
    // Below 0.5 → demote to Tier 2 (re-classify with minimal LLM).
    // Self-correction (OB-177) decreases confidence on binding failures.
    // 3 failures: 0.92 → 0.72 → 0.52 → 0.32 → Tier 2 re-classification triggered.
    const conf = Number(tier1.confidence);
    if (conf >= 0.5) {
      …
      return {
        tier: 1,
        match: true,
        …
      };
    }
    // DIAG-010 / OB-178: Demoted Tier 1 returns as Tier 2 match with existing data.
```

CC searched for the actual code site that DECREMENTS `structural_fingerprints.confidence` on binding failure:

```
$ grep -rn "structural_fingerprints.*update.*confidence|update.*confidence.*structural_fingerprints" \
    web/src/ --include="*.ts"
(empty — zero matches for decrement-on-failure pattern targeting structural_fingerprints.confidence)
```

CC note (verbatim, not classification): the comment at `fingerprint-flywheel.ts:54-55` describes a self-correction loop that decreases `structural_fingerprints.confidence` on binding failures, with an arithmetic example (`0.92 → 0.72 → 0.52 → 0.32`). The only `structural_fingerprints.confidence` update site in `fingerprint-flywheel.ts:154-163` is the `writeFingerprint` Bayesian INCREMENT (`newConfidence = 1 - 1/(newMatchCount+1)`). CC did not locate a corresponding decrement implementation in the searched files.

`agents.ts:283, 293` decrement entity-level confidence (`entity.confidence -= 0.10` / `0.15`), not fingerprint-cache confidence. Different surface.

`entity-resolution.ts:313` references the OB-177 pattern in a comment ("Per OB-177 pattern at processEntityUnit:461-509") — CC did not paste-trace that processEntityUnit reference in this DIAG.

### Section 4.6 — Closed-Loop Learning operative state evaluation

Per **Section A Principle 5** (verbatim from `CC_STANDING_ARCHITECTURE_RULES.md:76-79`):

> **5. Closed-Loop Learning ← GP-2**
> Platform activity generates training signals for continuous improvement. AI mappings that get manually corrected inform future AI interpretation. The platform gets smarter with use.

**Operative state per DIAG-042 evidence:**

```
Layers emitting classification_signals:
  - Engine (calculation/run/route.ts):
      lifecycle:synaptic_consolidation (line 2138)
      convergence:dual_path_concordance (line 2155)
  - Convergence (convergence-service.ts:368): (signal_type at line; read in code for trigger)
  - Convergence-router (intelligence/converge/route.ts:107, 130): classification:outcome
  - SCI Execute / Analyze / Process-job: classification:outcome (5 sites)
  - Reconciliation (compare + run): (signal_types at line)
  - AI Assessment + Approvals: (signal_types at line)
  - SCI capture (signal-capture-service.ts): 7 signal categories (content_classification, content_classification_outcome, field_binding, field_binding_outcome, negotiation_round, convergence_outcome, cost_event)
  - Plan-comprehension emitter (plan-comprehension-emitter.ts:115): comprehension:plan_interpretation

Layers consuming classification_signals:
  - SCI contextual-reliability (5-level reliability) → adjusts agent confidence upstream
  - SCI classification-signal-service.lookupPriorSignals → boost SCI agent scores (+0.05/+0.07/+0.10)
  - SCI classification-signal-service.computeClassificationDensity → SCIExecutionMode selection
  - SCI classification-signal-service.recallVocabularyBindings → HC vocabulary recall (skip LLM on Tier 1)
  - Convergence loadMetricComprehensionSignals (HF-196 Phase 3) → operative input to binding selection
  - Convergence withinRun/crossRun observations (OB-197 G11) → surfaced as observations, NOT consumed by binding-selection matching
  - AI metrics service (OB-86) → calibration metrics for AI insight surface (read-only)

Closed loops (emit → consume → adapt):
  1. Plan-comprehension emitter → loadMetricComprehensionSignals → convergence binding selection (HF-196 Phase 3 D153 cutover)
  2. classification:outcome emission (SCI Execute) → SCI prior lookup → next SCI run's agent confidence boost
  3. Fingerprint write (structural_fingerprints table, separate from classification_signals) → Tier 1 lookup → HC bypass on next import (closed via Bayesian confidence INCREMENT)
  4. SCI content_classification_outcome (user_corrected source) → contextual-reliability empirical accuracy data → agent confidence adjustment

Open loops (emit but no consumer adapting downstream):
  1. lifecycle:synaptic_consolidation (engine line 2138) — no consumer that adapts engine behavior next run
  2. convergence:dual_path_concordance (engine line 2155) — no consumer that adapts engine path selection next run
  3. [CalcRecon-T3] EXCEPTION lines (diag003Fallback, ob118MergeGuardFired, boundaryFallback) — log-only, not written to classification_signals, no consumer

Special-cased loops:
  - OB-177 self-correction loop on fingerprint confidence: COMMENT references it (fingerprint-flywheel.ts:54-55), arithmetic example given (0.92 → 0.32 over 3 failures), but CC did not locate the decrement-on-binding-failure write site in the surveyed code. Increment path is structurally present (writeFingerprint line 152); decrement path may live elsewhere or may be aspirational. CC notes structurally evident gap, not classification.

Aspirational vs structural:
  - "AI mappings that get manually corrected inform future AI interpretation" (Principle 5 statement):
    - STRUCTURAL for SCI agent scoring (lookupPriorSignals → +confidence boost; content_classification_outcome with source='user_corrected' captures correction)
    - STRUCTURAL for HC vocabulary (recallVocabularyBindings replays user-confirmed bindings)
    - STRUCTURAL for fingerprint-cache Bayesian increment on repeat success
    - DOCUMENTED-AS-INTENT but CC could not locate the implementation site for fingerprint-cache decrement on binding failure (OB-177 self-correction): comment present in fingerprint-flywheel.ts:54-55, decrement write site not surfaced
    - NOT WIRED at engine layer: when usedConvergenceBindings flips false (silent fall-through line 1717-1745), no signal is emitted and no consumer adjusts convergence binding selection on next calculation
    - NOT WIRED at engine→convergence learning: convergence:dual_path_concordance is emitted (line 2155) but CC did not locate a convergence-binding-selection consumer that reads it
```

---

## Section 5 — Cold-Start vs Steady-State Behaviors (operative documentation)

### Section 5.1 — Cold-start operative behavior

**Tier 3 path (no fingerprint match) — `fingerprint-flywheel.ts:106-117` (verbatim):**

```typescript
  // Tier 3: No match — novel structure
  console.log(`[SCI-FINGERPRINT] tier=3 match=false hash=${fingerprintHash.substring(0, 12)} — novel structure`);
  console.log(`[SCI-FINGERPRINT] LLM called — Tier 3 novel structure, fingerprint stored for future recognition`);
  return {
    tier: 3,
    match: false,
    fingerprintHash,
    classificationResult: null,
    columnRoles: null,
    confidence: 0,
    matchCount: 0,
  };
```

Tier 3 returns `confidence: 0`, `match: false`. Caller (in `app/api/import/sci/process-job/route.ts` or similar SCI pipeline entry) interprets `tier === 3` as "no prior; perform full LLM classification" — HC runs in full via `comprehendHeaders` → `callLLMForHeaders`.

**Cold-start fingerprint INSERT** (`fingerprint-flywheel.ts:171-187`, verbatim):

```typescript
    } else {
      // Insert new fingerprint record — confidence = 1 - 1/(1+1) = 0.5
      await supabase
        .from('structural_fingerprints')
        .insert({
          tenant_id: tenantId,
          fingerprint_hash: fingerprintHash,
          fingerprint: fingerprintHash,
          classification_result: classificationResult,
          column_roles: columnRoles,
          match_count: 1,
          confidence: 0.5,
          source_file_sample: sourceFileName,
        });
```

Initial confidence: **0.5** at `match_count: 1`. Per the gating at line 57 (`if (conf >= 0.5)`), the threshold for Tier 1 routing is exactly 0.5 — a freshly-inserted fingerprint will satisfy the threshold on subsequent imports (no demotion at first repeat).

**SCI negotiation cold-start branch (`negotiation.ts:105`, verbatim context grep):**

```
web/src/lib/sci/negotiation.ts:105:  if (matchCount === 0) {
```

Branches on `matchCount === 0` (no prior; cold start). CC did not paste-trace the surrounding logic in this Phase 5 surface (file is `negotiation.ts`; behavior is per-SCI-agent cold-start adjustment, separate scope from this DIAG).

**HC cold-start path** (per Phase 1.1 Section 1: `comprehendHeaders` line 277-326): if vocabulary bindings are absent or low-confidence, the LLM is called (`callLLMForHeaders`). On cold start, `existingBindings` is empty Map, `allBound === false`, LLM fires.

### Section 5.2 — Steady-state operative behavior

**Tier 1 match path** (`fingerprint-flywheel.ts:43-69`, verbatim):

```typescript
  // Tier 1: Exact tenant-specific match
  const { data: tier1 } = await supabase
    .from('structural_fingerprints')
    .select('classification_result, column_roles, match_count, confidence')
    .eq('tenant_id', tenantId)
    .eq('fingerprint_hash', fingerprintHash)
    .maybeSingle();

  if (tier1 && tier1.classification_result && Object.keys(tier1.classification_result as object).length > 0) {
    // HF-145: Confidence threshold gates Tier 1 routing.
    // Below 0.5 → demote to Tier 2 (re-classify with minimal LLM).
    // Self-correction (OB-177) decreases confidence on binding failures.
    // 3 failures: 0.92 → 0.72 → 0.52 → 0.32 → Tier 2 re-classification triggered.
    const conf = Number(tier1.confidence);
    if (conf >= 0.5) {
      console.log(`[SCI-FINGERPRINT] tier=1 match=true hash=${fingerprintHash.substring(0, 12)} confidence=${conf} matchCount=${tier1.match_count}`);
      console.log(`[SCI-FINGERPRINT] LLM skipped — Tier 1 match from ${tier1.match_count} prior imports`);
      return {
        tier: 1,
        match: true,
        fingerprintHash,
        classificationResult: tier1.classification_result as Record<string, unknown>,
        columnRoles: tier1.column_roles as Record<string, string>,
        confidence: conf,
        matchCount: tier1.match_count,
      };
    }
    // DIAG-010 / OB-178: Demoted Tier 1 returns as Tier 2 match with existing data.
```

**Reused on Tier 1 match:**
- `classification_result` (JSONB) — the cached LLM classification output
- `column_roles` (Record<string, string>) — the cached structural role assignments per column

**What still fires** (per the caller's downstream handling; the Tier 1 return signals "skip LLM" but downstream processing — convergence, calc-time — still runs unchanged).

**HC vocabulary recall steady-state** (`header-comprehension.ts:283-310`, verbatim partial):

```typescript
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
```

HC skips LLM when ALL columns have `confirmationCount >= 2` AND `confidence >= 0.85`. The thresholds (2, 0.85) are hardcoded constants, not tenant-adaptive.

### Section 5.3 — Progressive automation operative state

**Tenant-adaptive thresholds (verbatim grep):**

```
$ grep -rn "tenant.*threshold|adaptiveThreshold|tenant.*confidence|perTenant" \
    web/src/ --include="*.ts"
web/src/app/api/signals/route.ts:13: …  (column listing in signals route)
web/src/app/api/signals/route.ts:38: …
web/src/app/api/platform/observatory/route.ts:390: …
web/src/app/api/platform/observatory/route.ts:394: …
web/src/app/api/platform/observatory/route.ts:399: …
web/src/app/api/platform/observatory/route.ts:458: …
web/src/app/api/platform/observatory/route.ts:785: …
web/src/lib/normalization/dictionary-seeder.ts:75-107: seedEntry (3 sites, dictionary normalization)
```

CC notes: matches found are not tenant-adaptive thresholds in the binding/classification/decision surfaces — they are (a) signal observatory aggregation reads (`perTenant` is a result key, not a threshold variable), or (b) dictionary-seeder calls (different scope).

**Hardcoded constants observed in code** (illustrative grep, not exhaustive):

- `0.5` Tier 1 confidence gate (fingerprint-flywheel.ts:57)
- `2` HC confirmationCount minimum (header-comprehension.ts:294)
- `0.85` HC interpretation confidence minimum (header-comprehension.ts:294)
- `0.50` BOUNDARY_FALLBACK_MIN_SCORE (convergence-service.ts:1911)
- `0.10` SCI agent confidence decrement on misclassification (agents.ts:283)
- `0.15` SCI agent confidence decrement on misclassification (agents.ts:293)

All are hardcoded constants. No tenant-adaptive variant observed.

**Learned canonical enums (verbatim grep):**

```
$ grep -rn "learned.*enum|tenantScopedEnum|extendedEnum" web/src/ --include="*.ts"
(empty — zero matches)
```

CC notes: no tenant-scoped extensible enum mechanism observed in code. The contextualIdentity vocabulary is fixed-by-code-or-LLM-free-form (per Section 1.3). The ColumnRole enum is closed (7 values, code-defined).

**Evaluate surface → flywheel writeback (verbatim grep for `user_corrected` propagation):**

```
web/src/lib/intelligence/classification-signal-service.ts:14: * - user_corrected: 0.99 (user provided explicit correction)
web/src/lib/intelligence/classification-signal-service.ts:27: export type SignalSource = 'ai' | 'user_confirmed' | 'user_corrected';
web/src/lib/intelligence/classification-signal-service.ts:181: source: 'user_corrected',
web/src/lib/intelligence/classification-signal-service.ts:245-249: Priority: user_corrected > user_confirmed > ai (sort logic)
web/src/lib/intelligence/ai-metrics-service.ts:131: if (src === 'user_corrected') return 'corrected';
web/src/lib/sci/synaptic-ingestion-state.ts:235: boost = bestPrior.source === 'human_override' || bestPrior.source === 'user_corrected'
web/src/lib/sci/classification-signal-service.ts:120: source: payload.humanCorrectionFrom ? 'user_corrected' : 'sci_agent'
web/src/lib/ai/training-signal-service.ts:111: source: action === 'corrected' ? 'user_corrected' : action === 'accepted' ? 'user_confirmed' : 'ai_prediction'
```

**Operative reality:** `source: 'user_corrected'` is a structural marker on signal writes. SCI agent priors (lookup at `classification-signal-service.ts:153`) sort and boost by source — `user_corrected` is prioritized (priority weight `3` at line 249). Per `synaptic-ingestion-state.ts:235`, a `user_corrected` prior triggers a higher boost than an `ai_prediction` prior.

CC note (verbatim, not classification): the writeback loop exists for SCI agent classification decisions (closed loop: user corrects → signal written with source='user_corrected' → next SCI run picks up via lookupPriorSignals → boost applied). It does NOT exist for convergence binding-selection (no consumer of user-corrected signals at convergence binding-selection function `generateAllComponentBindings`). It also does NOT exist for engine fallback decisions (no consumer at the `usedConvergenceBindings` flip site).

---

## Section 6 — Order-Independence Guarantees (operative documentation)

### Section 6.1 — Operative prior-state assumptions by layer

**HC layer (`web/src/lib/sci/header-comprehension.ts`):**

```
$ grep -rn "previousImport|priorClassification|priorEntities" web/src/lib/sci/header-comprehension.ts
(empty — zero matches)
```

HC reads vocabulary bindings via `lookupVocabularyBindings(tenantId, allColumns, …)` (line 287). If empty, LLM runs. If non-empty AND all columns satisfy thresholds, LLM is skipped. No assumption about prior imports having created vocabulary bindings.

**Convergence layer (`web/src/lib/intelligence/convergence-service.ts`):**

```
$ grep -n "entities.*populated|entities.*exists|tenant.entities" \
    web/src/lib/intelligence/convergence-service.ts
(empty — zero matches)
```

Convergence reads `rule_sets`, `metric_comprehension_signals`, and `capabilities` (committed_data + field_identities). Per Section 2.1, no tenant entity dependency. No assumption about prior entities table population.

**Engine layer (`web/src/app/api/calculation/run/route.ts`):**

```
$ grep -n "entities.*required|rule_set_assignments|priorImport" \
    web/src/app/api/calculation/run/route.ts
346:      .from('rule_set_assignments')
400:          await supabase.from('rule_set_assignments').insert(slice);
```

Engine fetches `rule_set_assignments` (assignments linking entities to rule_sets). If empty, engine creates default assignments via INSERT at line 400 (read context for trigger conditions).

**Entity-empty check across codebase (verbatim grep):**

```
$ grep -rn "entities.size === 0|entities.length === 0" web/src/ --include="*.ts"
web/src/app/api/financial/data/route.ts:90:  if (!entities || entities.length === 0) return null;
```

One hit only — in `financial/data/route.ts` (separate scope, financial module). HC/convergence/engine do not check `entities.length === 0` as a precondition.

### Section 6.2 — Operative order-dependencies

**Decision 92 — calc-time entity resolution as substrate guarantee:**

Verbatim from `web/src/lib/sci/calc-time-entity-resolution.ts:1-25`:

```typescript
/**
 * HF-196 Phase 2: Calc-time entity resolution.
 *
 * Implements the calc-time entity binding architecture per Decision 92
 * (Calculation Sovereignty / IGF-T1-E904) and OB-182's stated intent:
 * "engine resolves at calc time." The calc-side replacement for the
 * post-import back-link work that OB-182 removed.
 *
 * Engineering decision (architect-pre-authorized, HF-196 directive Phase 2):
 *   Durable update at calc time. Engine reads `committed_data.entity_id`
 *   directly (no engine refactor needed). Resolver UPDATEs the column for
 *   rows where entity_id IS NULL and an entities-table match exists.
 *
 * Coexists with HF-196 Phase 1 import-time back-link (defense in depth):
 *   Import-time path populates entity_id immediately for typical imports.
 *   Calc-time path catches any rows the import-time path missed (late-arriving
 *   data, prior tenant state, etc.). The two paths are mutually idempotent.
 *
 * Korean Test (IGF-T1-E910) compliance:
 *   - Tenant-agnostic: tenant_id is a runtime parameter
 *   - Entity matching delegates to resolveEntitiesFromCommittedData which
 *     uses structural identifiers from `field_identities` metadata, not
 *     hardcoded field names
 *   - Zero domain-specific string literals
 */
```

**Substrate citation (verbatim from `docs/audits/AUD-007_evidence/E5_1_DS-021_full.md:211`):**

> P6 — Sequence Independence. Imports do not require any prior import to have happened first. The substrate accepts any content unit in any order at any time. Operations that create implicit ordering (entity binding requires prior roster import; convergence requires prior plan import) violate sequence independence and are deferred to calculation time per Decision 92.

**Operative behavior — transaction file imported BEFORE roster file:**

- Import-time entity_id back-link (`HF-196 Phase 1`): if a transaction row's identifier value (`No_Empleado` etc.) does not match any existing entity at import time, `committed_data.entity_id` is left NULL.
- Calc-time entity resolution (`resolveEntitiesAtCalcTime`, `route.ts:154`): runs at calculation entry; UPDATEs `committed_data.entity_id` where NULL and a match now exists in the entities table.
- Net effect: transaction-before-roster ordering produces NULL `entity_id` at first import; calc-time resolution fills the back-link when the roster has been imported by then. If the roster has NOT been imported by calc time, the rows remain unresolved and surface as data-quality signals per the calc-time resolver docstring.

**Operative behavior — plan file imported AFTER data files:**

- Convergence runs at calc time per Section 2.1 (calc-time convergence triggers at `route.ts:228` when `input_bindings` is empty).
- Convergence consumes `capabilities` from `inventoryData(tenantId)` — reads committed_data + field_identities.
- Plan-before-data and data-before-plan both work: convergence at calc time reads whatever is present.

**Operative behavior — all-at-once combined import:**

- Each file processed independently through SCI pipeline (per `process-job/route.ts` parallel-lambda invocation per file).
- Cross-sheet relationships surfaced via HC `crossSheetInsights` (per `sci-types.ts:103`).
- Convergence runs once at calc time, consuming the unified capabilities snapshot.

**Code citations enabling order-independence:**

- `committed_data.period_id` nullable + period attribution via `source_date` (verified DIAG-039 E3.1) — periods can be created post-import without re-import
- `committed_data.entity_id` nullable + calc-time back-link UPDATE — entities can be created post-import without re-import
- `rule_sets.input_bindings` populated lazily at calc time via convergence — plan can be imported in any order

**Verification of HF-196 Phase 1G claim:** The substrate citation in `DS-021 §P6` (line 211 above) states "operations that create implicit ordering … are deferred to calculation time per Decision 92." CC documents the operative mechanism: Decision 92's calc-time deferral is structurally realized via `resolveEntitiesAtCalcTime` (entity back-link), calc-time `convergeBindings` invocation (binding selection deferred), and `source_date`-based period attribution (period binding deferred). The claim holds at the surfaces CC paste-traced.

