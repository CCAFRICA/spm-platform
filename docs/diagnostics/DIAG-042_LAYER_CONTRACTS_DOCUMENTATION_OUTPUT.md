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

