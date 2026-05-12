# DIAG-041 — Comprehensive Code Audit Output

**Date:** 2026-05-12
**Branch:** `dev`
**Base commit:** `979546f8` (post HF-217 PR #388 merge)
**Probe scope:** HC contextualIdentity emission, convergence binding-selection, intent modifier execution, intent-transformer normalization, plan-interpreter cap emission

CC pastes verbatim evidence at every section. No interpretation. No PASS/FAIL. Architect dispositions in architect channel.

## Phase 0 — Orientation

Convergence-path symbol grep within `web/src/app/api/calculation/run/route.ts` (orientation only — full bodies pasted in Phase 2.6 and elsewhere):

```
22:  applyMetricDerivations,
1179:  function resolveMetricsFromConvergenceBindings(
```

`resolveMetricsFromConvergenceBindings` is at line 1179 of route.ts (post-HF-217 file state). `applyMetricDerivations` is imported at line 22 from `@/lib/calculation/run-calculation`.

---

## Phase 1 — HC contextualIdentity emission

### Phase 1.1 — contextualIdentity string-literal emission sites

```
grep -rn "'person_identifier'|'location_code'|'currency_amount'|'percentage'|'count'|'date'|'reference_key'|'attribute'" \
  web/src/lib/sci/ web/src/lib/intelligence/ --include="*.ts"
```

Output (61 matches; verbatim):

```
web/src/lib/sci/field-identities.ts:21:    entity_identifier: { structuralType: 'identifier', contextualIdentity: 'person_identifier' },
web/src/lib/sci/field-identities.ts:23:    entity_attribute: { structuralType: 'attribute', contextualIdentity: 'entity_attribute' },
web/src/lib/sci/field-identities.ts:24:    entity_relationship: { structuralType: 'attribute', contextualIdentity: 'entity_relationship' },
web/src/lib/sci/field-identities.ts:25:    entity_license: { structuralType: 'attribute', contextualIdentity: 'entity_license' },
web/src/lib/sci/field-identities.ts:28:    transaction_amount: { structuralType: 'measure', contextualIdentity: 'currency_amount' },
web/src/lib/sci/field-identities.ts:29:    transaction_count: { structuralType: 'measure', contextualIdentity: 'count' },
web/src/lib/sci/field-identities.ts:30:    transaction_date: { structuralType: 'temporal', contextualIdentity: 'date' },
web/src/lib/sci/field-identities.ts:33:    category_code: { structuralType: 'attribute', contextualIdentity: 'category' },
web/src/lib/sci/field-identities.ts:34:    rate_value: { structuralType: 'measure', contextualIdentity: 'percentage' },
web/src/lib/sci/field-identities.ts:36:    payout_amount: { structuralType: 'measure', contextualIdentity: 'currency_amount' },
web/src/lib/sci/field-identities.ts:37:    descriptive_label: { structuralType: 'attribute', contextualIdentity: 'label' },
web/src/lib/sci/source-date-extraction.ts:27:// platformType='date' fallback in findDateColumnFromBindings. The whitelist closes
web/src/lib/sci/source-date-extraction.ts:31:  'date',
web/src/lib/sci/source-date-extraction.ts:50:  // platformType='date' fallback when the column is structurally a relationship
web/src/lib/sci/source-date-extraction.ts:150:    'transaction_date', 'period_marker', 'event_timestamp', 'date',
web/src/lib/sci/source-date-extraction.ts:158:  // OB-183: Fallback — if any binding has platformType 'date', use it
web/src/lib/sci/source-date-extraction.ts:162:    if (b.platformType === 'date') {
web/src/lib/sci/negotiation.ts:47:    test: (f, hcRole) => hcRole === 'temporal' || f.dataType === 'date',
web/src/lib/sci/negotiation.ts:57:    test: (_f, hcRole) => hcRole === 'reference_key',
web/src/lib/sci/negotiation.ts:62:    test: (f) => f.dataType === 'percentage',
web/src/lib/sci/negotiation.ts:72:    test: (_f, hcRole) => hcRole === 'attribute',
web/src/lib/sci/negotiation.ts:342:  if (hcRole === 'reference_key') {
web/src/lib/sci/negotiation.ts:370:      if (hcRole === 'attribute') return { role: 'entity_attribute', context: `${field.fieldName} — attribute`, confidence: 0.75 };
web/src/lib/sci/negotiation.ts:381:      if (hcRole === 'temporal' || field.dataType === 'date') return { role: 'transaction_date', context: `${field.fieldName} — event timestamp`, confidence: 0.90 };
web/src/lib/sci/negotiation.ts:389:      if (field.dataType === 'percentage') return { role: 'rate_value', context: `${field.fieldName} — rate/threshold`, confidence: 0.80 };
web/src/lib/sci/header-comprehension.ts:196:  'identifier', 'name', 'temporal', 'measure', 'attribute', 'reference_key', 'unknown',
web/src/lib/sci/header-comprehension.ts:482:  // If HC identifies a column as 'identifier' or 'reference_key' with high confidence,
web/src/lib/sci/header-comprehension.ts:484:  const hcIdentifierCol = findHCColumnByRole(hc, ['identifier', 'reference_key'], HC_OVERRIDE_THRESHOLD);
web/src/lib/sci/header-comprehension.ts:515:  // (e.g., 'attribute' or 'measure'), suppress the temporal detection for those columns.
web/src/lib/sci/header-comprehension.ts:520:      const hasGenuineDateColumn = profile.fields.some(f => f.dataType === 'date');
web/src/lib/sci/header-comprehension.ts:608:    // HC says this column is NOT temporal (e.g., 'attribute', 'measure', 'reference_key')
web/src/lib/sci/content-profile.ts:57:const DATE_SIGNALS = ['date', 'period', 'month', 'year', 'fecha', '날짜', 'time', 'day'];
web/src/lib/sci/content-profile.ts:59:const RATE_SIGNALS = ['rate', '%', 'percentage', 'tasa', '비율', 'percent', 'ratio'];
web/src/lib/sci/content-profile.ts:259:  // 'measure', 'attribute', etc. — none of those should be overridden by
web/src/lib/sci/content-profile.ts:266:  if (field.dataType === 'date' || field.dataType === 'boolean') return false;
web/src/lib/sci/content-profile.ts:291:    if (field.dataType === 'date') {
web/src/lib/sci/content-profile.ts:470:    if (['integer', 'decimal', 'currency', 'percentage'].includes(dataType)) {
web/src/lib/sci/content-profile.ts:629:  const hasDateColumn = fields.some(f => f.dataType === 'date' || f.nameSignals.containsDate) || temporal.hasTemporalColumns;
web/src/lib/sci/content-profile.ts:631:  const hasPercentageValues = fields.some(f => f.dataType === 'percentage' || f.nameSignals.containsRate);
web/src/lib/sci/content-profile.ts:647:  const numericTypes = ['integer', 'decimal', 'currency', 'percentage'] as const;
web/src/lib/sci/agents.ts:214:      case 'attribute': attributeCount++; break;
web/src/lib/sci/agents.ts:215:      case 'reference_key': referenceKeyCount++; break;
web/src/lib/sci/agents.ts:508:  // HF-186: hcRole === 'reference_key' — agent-aware mapping.
web/src/lib/sci/agents.ts:516:  if (hcRole === 'reference_key') {
web/src/lib/sci/agents.ts:557:  if (field.dataType === 'percentage')
web/src/lib/sci/agents.ts:578:  if (hcRole === 'attribute')
web/src/lib/sci/agents.ts:598:  if (hcRole === 'temporal' || field.dataType === 'date')
web/src/lib/sci/signatures.ts:33:        case 'attribute': hcAttributeCount++; break;
web/src/lib/sci/signatures.ts:34:        case 'reference_key': hcReferenceKeyCount++; break;
web/src/lib/sci/entity-resolution.ts:144:            if (fi.structuralType === 'attribute') {
web/src/lib/sci/entity-resolution.ts:202:        // For each attribute column flagged by HC (structuralType==='attribute'),
web/src/lib/sci/hc-pattern-classifier.ts:51:      case 'reference_key': hasReferenceKey = true; break;
web/src/lib/sci/proposal-intelligence.ts:75:    const dateField = fields.find(f => f.nameSignals.containsDate || f.dataType === 'date');
web/src/lib/sci/sci-types.ts:73:  | 'attribute'          // categorical property (department, region, role, type)
web/src/lib/sci/sci-types.ts:74:  | 'reference_key'      // lookup key for reference data (hub ID, location code)
web/src/lib/sci/sci-types.ts:148:  dataType: 'integer' | 'decimal' | 'currency' | 'percentage' | 'date' | 'text' | 'boolean' | 'mixed';
web/src/lib/intelligence/convergence-service.ts:286:        semanticType: d.operation === 'sum' ? 'amount' : 'count',
web/src/lib/intelligence/convergence-service.ts:1171:        operation: 'count',
web/src/lib/intelligence/convergence-service.ts:2037:      operation: 'count',
web/src/lib/intelligence/convergence-service.ts:2196:        const validOps = ['sum', 'count', 'ratio', 'delta'];
web/src/lib/intelligence/convergence-service.ts:2319:    case 'count':
```

### Phase 1.2 — contextualIdentity references across SCI and intelligence

```
grep -rn "contextualIdentity" web/src/lib/sci/ web/src/lib/intelligence/ --include="*.ts"
```

Output (34 matches; verbatim):

```
web/src/lib/sci/field-identities.ts:16:// Maps SemanticRole → ColumnRole + contextualIdentity — guaranteed write, never null
web/src/lib/sci/field-identities.ts:20:  const ROLE_MAP: Record<string, { structuralType: ColumnRole; contextualIdentity: string }> = {
web/src/lib/sci/field-identities.ts:21:    entity_identifier: { structuralType: 'identifier', contextualIdentity: 'person_identifier' },
web/src/lib/sci/field-identities.ts:22:    entity_name: { structuralType: 'name', contextualIdentity: 'person_name' },
web/src/lib/sci/field-identities.ts:23:    entity_attribute: { structuralType: 'attribute', contextualIdentity: 'entity_attribute' },
web/src/lib/sci/field-identities.ts:24:    entity_relationship: { structuralType: 'attribute', contextualIdentity: 'entity_relationship' },
web/src/lib/sci/field-identities.ts:25:    entity_license: { structuralType: 'attribute', contextualIdentity: 'entity_license' },
web/src/lib/sci/field-identities.ts:26:    performance_target: { structuralType: 'measure', contextualIdentity: 'performance_target' },
web/src/lib/sci/field-identities.ts:27:    baseline_value: { structuralType: 'measure', contextualIdentity: 'baseline_value' },
web/src/lib/sci/field-identities.ts:28:    transaction_amount: { structuralType: 'measure', contextualIdentity: 'currency_amount' },
web/src/lib/sci/field-identities.ts:29:    transaction_count: { structuralType: 'measure', contextualIdentity: 'count' },
web/src/lib/sci/field-identities.ts:30:    transaction_date: { structuralType: 'temporal', contextualIdentity: 'date' },
web/src/lib/sci/field-identities.ts:31:    transaction_identifier: { structuralType: 'identifier', contextualIdentity: 'transaction_identifier' },
web/src/lib/sci/field-identities.ts:32:    period_marker: { structuralType: 'temporal', contextualIdentity: 'period' },
web/src/lib/sci/field-identities.ts:33:    category_code: { structuralType: 'attribute', contextualIdentity: 'category' },
web/src/lib/sci/field-identities.ts:34:    rate_value: { structuralType: 'measure', contextualIdentity: 'percentage' },
web/src/lib/sci/field-identities.ts:35:    tier_boundary: { structuralType: 'measure', contextualIdentity: 'threshold' },
web/src/lib/sci/field-identities.ts:36:    payout_amount: { structuralType: 'measure', contextualIdentity: 'currency_amount' },
web/src/lib/sci/field-identities.ts:37:    descriptive_label: { structuralType: 'attribute', contextualIdentity: 'label' },
web/src/lib/sci/field-identities.ts:46:        contextualIdentity: mapped.contextualIdentity,
web/src/lib/sci/field-identities.ts:52:        contextualIdentity: binding.semanticRole || 'unknown',
web/src/lib/sci/header-comprehension.ts:374:      contextualIdentity: interp.semanticMeaning,
web/src/lib/sci/header-comprehension.ts:401:      contextualIdentity: interp.semanticMeaning || 'unknown',
web/src/lib/sci/entity-resolution.ts:83:        contextualIdentity?: string;
web/src/lib/sci/entity-resolution.ts:91:                fi.contextualIdentity?.toLowerCase().includes('person')) {
web/src/lib/sci/entity-resolution.ts:99:              fi.contextualIdentity?.toLowerCase().includes('person')) {
web/src/lib/sci/sci-types.ts:86:  contextualIdentity: string;         // what kind of identifier/measure/etc (e.g., person_identifier, currency_amount)
web/src/lib/sci/sci-types.ts:148:  dataType: 'integer' | 'decimal' | 'currency' | 'percentage' | 'date' | 'text' | 'boolean' | 'mixed';
web/src/lib/intelligence/convergence-service.ts:13: *   Pass 2: Contextual match — use contextualIdentity to disambiguate
web/src/lib/intelligence/convergence-service.ts:502:          field_identity: targetFI || { structuralType: 'measure', contextualIdentity: 'performance_target', confidence: 0.7 },
web/src/lib/intelligence/convergence-service.ts:881:      const fieldIds = meta?.field_identities as Record<string, { structuralType?: string; contextualIdentity?: string; confidence?: number }> | undefined;
web/src/lib/intelligence/convergence-service.ts:887:            contextualIdentity: fi.contextualIdentity || 'unknown',
web/src/lib/intelligence/convergence-service.ts:1058:          const contextualTypes = new Set(measureFIs.map(([, fi]) => fi.contextualIdentity));
web/src/lib/intelligence/convergence-service.ts:1739:    `${i + 1}. "${c.name}" (${c.fi.contextualIdentity})`
web/src/lib/intelligence/convergence-service.ts:1841:          fi: { structuralType: 'measure', contextualIdentity: 'inferred_numeric', confidence: 0.5 },
```

### Phase 1.3 — SCI directory inventory

```
$ ls -la web/src/lib/sci/header-comprehension/  →  No such file or directory
$ ls -la web/src/lib/sci/agents/                →  No such file or directory
$ ls -la web/src/lib/sci/field-identity/        →  No such file or directory
$ ls -la web/src/lib/sci/                       →  individual files (no subdirs for these)
```

`web/src/lib/sci/` is flat (no subdirectories for `header-comprehension`, `agents`, or `field-identity`). Relevant files identified in Phase 1.1/1.2 grep:

- `web/src/lib/sci/field-identities.ts` (3034 bytes)
- `web/src/lib/sci/header-comprehension.ts` (26110 bytes)
- `web/src/lib/sci/entity-resolution.ts` (16567 bytes)
- `web/src/lib/sci/sci-types.ts` (16563 bytes — type definitions)
- `web/src/lib/intelligence/convergence-service.ts` — multiple references, treated in Phase 2

### Phase 1.4 — contextualIdentity emission function bodies

#### File: `web/src/lib/sci/field-identities.ts` | Function: `buildFieldIdentitiesFromBindings` | Lines: 17–58

```typescript
// HF-110: Build field_identities from confirmedBindings when HC trace is unavailable (DS-009 1.3)
// Maps SemanticRole → ColumnRole + contextualIdentity — guaranteed write, never null
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

CC note (verbatim, not classification): every binding whose `semanticRole === 'entity_identifier'` is mapped to `contextualIdentity: 'person_identifier'` regardless of column name, structural cardinality, or value-set content.

#### File: `web/src/lib/sci/header-comprehension.ts` | Function: `extractFieldIdentities` | Lines: 361–380

```typescript
export function extractFieldIdentities(
  comprehensions: Map<string, HeaderComprehension> | null,
  sheetName: string,
): Record<string, FieldIdentity> | null {
  if (!comprehensions) return null;

  const hc = comprehensions.get(sheetName);
  if (!hc) return null;

  const identities: Record<string, FieldIdentity> = {};
  for (const [colName, interp] of Array.from(hc.interpretations.entries())) {
    identities[colName] = {
      structuralType: interp.columnRole,
      contextualIdentity: interp.semanticMeaning,
      confidence: interp.confidence,
    };
  }

  return Object.keys(identities).length > 0 ? identities : null;
}
```

#### File: `web/src/lib/sci/header-comprehension.ts` | Function: `extractFieldIdentitiesFromTrace` | Lines: 386–407

```typescript
export function extractFieldIdentitiesFromTrace(
  classificationTrace: Record<string, unknown> | undefined,
): Record<string, FieldIdentity> | null {
  if (!classificationTrace) return null;

  const hcData = classificationTrace.headerComprehension as
    { interpretations?: Record<string, { columnRole?: string; semanticMeaning?: string; confidence?: number }> } | null;

  if (!hcData?.interpretations) return null;

  const identities: Record<string, FieldIdentity> = {};
  for (const [colName, interp] of Object.entries(hcData.interpretations)) {
    const role = interp.columnRole || 'unknown';
    identities[colName] = {
      structuralType: role as ColumnRole,
      contextualIdentity: interp.semanticMeaning || 'unknown',
      confidence: typeof interp.confidence === 'number' ? interp.confidence : 0.5,
    };
  }

  return Object.keys(identities).length > 0 ? identities : null;
}
```

CC note (verbatim, not classification): both functions pass `interp.semanticMeaning` (string from LLM output) directly to `contextualIdentity` without normalization to a canonical set.

### Phase 1.5 — LLM prompt construction for contextualIdentity

The `semanticMeaning` and `columnRole` values flow from an LLM prompt at `web/src/lib/ai/providers/anthropic-adapter.ts:799–832`.

```typescript
header_comprehension: `You are analyzing a data file with multiple sheets. For each column in each sheet, identify WHAT the column IS — not how it is used in this particular sheet.

For each column, provide:
- semanticMeaning: what this column IS (e.g., "person_identifier", "location_code", "currency_amount", "delivery_percentage", "month_indicator", "hub_name", "safety_incident_count")
- dataExpectation: what values should look like (e.g., "integer_1_to_12", "unique_numeric_id", "decimal_0_to_1")
- columnRole: one of: identifier, name, temporal, measure, attribute, reference_key, unknown
  - identifier: uniquely identifies something (person, location, transaction)
  - name: human-readable label
  - temporal: date, period, timestamp
  - measure: numeric value representing a quantity
  - attribute: categorical or descriptive property
  - reference_key: links to another dataset
- identifiesWhat: (ONLY for identifier and reference_key columns) what kind of thing this column identifies. Must be one of: person, transaction, location, product, organization, account, other. This tells downstream systems whether this identifier links to an entity (person, organization, account) or to a record (transaction, order, invoice). For non-identifier columns, omit this field or set to null.
- confidence: 0.0 to 1.0

Also provide crossSheetInsights: observations about relationships between sheets (e.g., "Sheet A and Sheet B share the same employee identifier column", "Sheet C appears to be hub-level reference data while Sheet B has employee-level performance data").

Respond ONLY with valid JSON, no preamble, no markdown:
{
  "sheets": {
    "<sheetName>": {
      "columns": {
        "<columnName>": {
          "semanticMeaning": "...",
          "dataExpectation": "...",
          "columnRole": "...",
          "identifiesWhat": "person|transaction|location|product|organization|account|other|null",
          "confidence": 0.00
        }
      }
    }
  },
  "crossSheetInsights": ["...", "..."]
}`,
```

CC note (verbatim, not classification): `semanticMeaning` is free-form string. `columnRole` is constrained to a 7-value enum. `identifiesWhat` is constrained to an 8-value enum. The examples shown in the prompt include `"person_identifier"`, `"location_code"`, `"hub_name"` as distinct categories, but the LLM is not enum-constrained for `semanticMeaning`.

### Phase 1.6 — Upstream callers of contextualIdentity emission

```
grep -rn "extractFieldIdentities|extractFieldIdentitiesFromTrace|buildFieldIdentitiesFromBindings" \
  web/src/ --include="*.ts"
```

Output (verbatim, 18 matches):

```
web/src/app/api/import/sci/execute-bulk/route.ts:26:import { buildFieldIdentitiesFromBindings } from '@/lib/sci/field-identities';
web/src/app/api/import/sci/execute-bulk/route.ts:577:        field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings),
web/src/app/api/import/sci/execute-bulk/route.ts:703:        field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings),
web/src/app/api/import/sci/execute-bulk/route.ts:870:        field_identities: buildFieldIdentitiesFromBindings(unit.confirmedBindings),
web/src/app/api/import/sci/execute/route.ts:40:import { extractFieldIdentitiesFromTrace } from '@/lib/sci/header-comprehension';
web/src/app/api/import/sci/execute/route.ts:42:import { buildFieldIdentitiesFromBindings } from '@/lib/sci/field-identities';
web/src/app/api/import/sci/execute/route.ts:582:  const tgtFieldIdentities = extractFieldIdentitiesFromTrace(
web/src/app/api/import/sci/execute/route.ts:584:  ) || buildFieldIdentitiesFromBindings(unit.confirmedBindings);
web/src/app/api/import/sci/execute/route.ts:738:  const txnFieldIdentities = extractFieldIdentitiesFromTrace(
web/src/app/api/import/sci/execute/route.ts:740:  ) || buildFieldIdentitiesFromBindings(unit.confirmedBindings);
web/src/app/api/import/sci/execute/route.ts:889:  const entityFieldIdentities = extractFieldIdentitiesFromTrace(
web/src/app/api/import/sci/execute/route.ts:891:  ) || buildFieldIdentitiesFromBindings(unit.confirmedBindings);
web/src/app/api/import/sci/execute/route.ts:1025:  const refFieldIdentities = extractFieldIdentitiesFromTrace(
web/src/app/api/import/sci/execute/route.ts:1027:  ) || buildFieldIdentitiesFromBindings(unit.confirmedBindings);
web/src/lib/sci/header-comprehension.ts:361:export function extractFieldIdentities(
web/src/lib/sci/header-comprehension.ts:386:export function extractFieldIdentitiesFromTrace(
web/src/lib/sci/field-identities.ts:10: * Predecessor: buildFieldIdentitiesFromBindings (execute/route.ts:38–80).
web/src/lib/sci/field-identities.ts:17:export function buildFieldIdentitiesFromBindings(
```

CC note (verbatim, not classification): `extractFieldIdentitiesFromTrace || buildFieldIdentitiesFromBindings` — HC trace is the primary path; bindings-based ROLE_MAP is the fallback. The `||` short-circuits to the fallback only when HC trace path returns null (no comprehensions or no interpretations).

### Phase 1.7 — Downstream consumers of contextualIdentity

```
grep -rn "field_identity.contextualIdentity|fieldIdentity.contextualIdentity|\.contextualIdentity" \
  web/src/ --include="*.ts"
```

Output (verbatim, 6 matches):

```
web/src/lib/intelligence/convergence-service.ts:887:            contextualIdentity: fi.contextualIdentity || 'unknown',
web/src/lib/intelligence/convergence-service.ts:1058:          const contextualTypes = new Set(measureFIs.map(([, fi]) => fi.contextualIdentity));
web/src/lib/intelligence/convergence-service.ts:1739:    `${i + 1}. "${c.name}" (${c.fi.contextualIdentity})`
web/src/lib/sci/entity-resolution.ts:91:                fi.contextualIdentity?.toLowerCase().includes('person')) {
web/src/lib/sci/entity-resolution.ts:99:              fi.contextualIdentity?.toLowerCase().includes('person')) {
web/src/lib/sci/field-identities.ts:46:        contextualIdentity: mapped.contextualIdentity,
```

#### Downstream consumer detail: `web/src/lib/sci/entity-resolution.ts` lines 80–112

```typescript
      // Primary fallback: field_identities (DS-009)
      const fieldIds = meta.field_identities as Record<string, {
        structuralType?: string;
        contextualIdentity?: string;
      }> | undefined;

      if (fieldIds && Object.keys(fieldIds).length > 0) {
        // Korean Test: match on structuralType, not column names
        if (!idColumn) {
          for (const [colName, fi] of Object.entries(fieldIds)) {
            if (fi.structuralType === 'identifier' &&
                fi.contextualIdentity?.toLowerCase().includes('person')) {
              idColumn = colName;
              break; // HF-196 Phase 1B: first-match-wins (was: last-match-wins, source of regression)
            }
          }
        }
        for (const [colName, fi] of Object.entries(fieldIds)) {
          if (fi.structuralType === 'name' &&
              fi.contextualIdentity?.toLowerCase().includes('person')) {
            nameColumn = colName;
            break;
          }
        }
```

CC note (verbatim, not classification): downstream consumer test is `fi.contextualIdentity?.toLowerCase().includes('person')`. Any contextualIdentity string containing the substring `"person"` (case-insensitive) matches.

### Phase 1.8 — Halt check

No halt triggered. Phase 1.4 surfaced **3 emission functions** (one in `field-identities.ts`, two in `header-comprehension.ts`). Phase 1.5 surfaced **1 LLM prompt** at `anthropic-adapter.ts:799–832`. The emission is dual-path (LLM-derived primary + bindings-derived fallback).

---

## Phase 2 — Convergence binding-selection logic

### Phase 2.1 — File + function inventory

```
$ wc -l web/src/lib/intelligence/convergence-service.ts
2345 web/src/lib/intelligence/convergence-service.ts
```

Top-level function inventory (verbatim grep):

```
53:function humanizeMetricName(name: string): string {
86:export interface ComponentBinding {
105:export interface ConvergenceGap {
118:export interface ConvergenceSignalObservation {
128:export interface ConvergenceResult {
156:export interface MetricComprehensionSignal {
166:export async function convergeBindings(
299:  await generateAllComponentBindings(...)   ← single call site
631:function extractComponents(componentsJson: unknown): PlanComponent[] {
1002:function matchComponentsToData(
1118:function generateDerivationsForMatch(
1192:function extractInputRequirements(component: PlanComponent): ComponentInputRequirement[] {
1269:function extractRangeFromBoundaries(
1286:function scoreColumnForRequirement(
1339:export interface ColumnDistribution {
1352:export function profileColumnDistribution(
1409:function inferScale(stats: ColumnValueStats): ColumnDistribution['scaleInference'] {
1444:function estimateSampleResult(
1574:function checkCalculationPlausibility(
1666:function hasCompleteBindings(
1681:function isValidColumnMapping(
1796:async function generateAllComponentBindings(...)   ← binding-selection function
1942:      bindings[compKey]['entity_identifier'] = {   ← entity_identifier emission site
1969:      .filter(([role]) => role !== 'entity_identifier' && role !== 'period')
1979:function generateFilteredCountDerivations(
2279:function detectBoundaryScale(componentsJson: unknown, componentIndex: number): number {
2313:function getRequiredMeasureCount(operation: string): number {
2333:function tokenize(name: string): string[] {
```

`entity_identifier` is assigned at exactly one site in the entire convergence-service.ts: **line 1942** inside `generateAllComponentBindings` (lines 1796–1974).

### Phase 2.2 — `generateAllComponentBindings` function body (verbatim)

Full function body, lines 1796–1974:

```typescript
async function generateAllComponentBindings(
  components: PlanComponent[],
  matches: BindingMatch[],
  capabilities: DataCapability[],
  bindings: Record<string, Record<string, ComponentBinding>>,
  existingConvergenceBindings: Record<string, Record<string, unknown>> | undefined,
  metricComprehension: MetricComprehensionSignal[] = [], // HF-199 D2: E5 signals threaded through
): Promise<void> {
  // HF-112: Reuse existing bindings if complete (zero AI cost)
  if (hasCompleteBindings(existingConvergenceBindings, components.length)) {
    console.log('[Convergence] HF-112 Existing bindings complete — reusing (zero AI cost)');
    for (const [compKey, compBindings] of Object.entries(existingConvergenceBindings!)) {
      bindings[compKey] = compBindings as Record<string, ComponentBinding>;
    }
    return;
  }

  // Collect all measure columns across matched capabilities
  const measureColumns: Array<{
    name: string;
    fi: FieldIdentity;
    stats: ColumnValueStats;
    batchId: string;
  }> = [];
  let primaryCap: DataCapability | undefined;

  for (const match of matches) {
    const cap = capabilities.find(c => c.dataType === match.dataType);
    if (!cap) continue;
    if (!primaryCap) {
      primaryCap = cap;
    }

    for (const [colName, fi] of Object.entries(cap.fieldIdentities)) {
      if (fi.structuralType === 'measure' && cap.columnStats[colName]) {
        if (!measureColumns.some(mc => mc.name === colName)) {
          measureColumns.push({ name: colName, fi, stats: cap.columnStats[colName], batchId: cap.batchIds[0] || '' });
        }
      }
    }
    // Also include numeric columns with stats but no field identity
    for (const nf of cap.numericFields) {
      if (!measureColumns.some(mc => mc.name === nf.field) && cap.columnStats[nf.field]) {
        measureColumns.push({
          name: nf.field,
          fi: { structuralType: 'measure', contextualIdentity: 'inferred_numeric', confidence: 0.5 },
          stats: cap.columnStats[nf.field],
          batchId: cap.batchIds[0] || '',
        });
      }
    }
  }

  if (measureColumns.length === 0 || !primaryCap) return;

  // Collect all input requirements across all matched components
  const allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }> = [];
  for (const match of matches) {
    const reqs = extractInputRequirements(match.component);
    for (const req of reqs) {
      allRequirements.push({ compIndex: match.component.index, compName: match.component.name, req });
    }
  }

  // HF-112 / HF-199 D2: AI-assisted column mapping (ONE call) with metric_comprehension
  // signals as authoritative semantic intent.
  console.log('[Convergence] HF-112 Requesting AI column mapping');
  const aiMapping = await resolveColumnMappingsViaAI(components, allRequirements, measureColumns, metricComprehension);
  console.log(`[Convergence] HF-112 AI proposed ${Object.keys(aiMapping).length} mappings`);

  // Build bindings using AI mapping + boundary validation
  const boundColumns = new Set<string>();

  for (const match of matches) {
    const comp = match.component;
    const cap = capabilities.find(c => c.dataType === match.dataType);
    if (!cap) continue;

    const compKey = `component_${comp.index}`;
    if (!bindings[compKey]) bindings[compKey] = {};

    const batchId = cap.batchIds[0] || '';
    const requirements = extractInputRequirements(comp);

    for (const req of requirements) {
      const proposedColumnName = aiMapping[req.metricField];

      if (proposedColumnName) {
        const mc = measureColumns.find(c => c.name === proposedColumnName);
        if (mc && !boundColumns.has(proposedColumnName)) {
          // Boundary validation of AI proposal
          const { score: boundaryScore, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
          const isValidated = !req.expectedRange || boundaryScore > 0.1;

          bindings[compKey][req.role] = {
            source_batch_id: mc.batchId,
            column: proposedColumnName,
            field_identity: mc.fi,
            match_pass: isValidated ? 1 : 2,  // 1=AI+validated, 2=AI-only
            confidence: isValidated ? 0.9 : 0.6,
            scale_factor: scaleFactor !== 1 ? scaleFactor : undefined,
          };
          boundColumns.add(proposedColumnName);
          console.log(`[Convergence] HF-112 ${comp.name}:${req.role} → ${proposedColumnName} (AI${isValidated ? '+validated' : ''}, scale=${scaleFactor})`);
          continue;
        }
      }

      // Fallback: boundary matching for unmapped requirements (HF-111 logic)
      const BOUNDARY_FALLBACK_MIN_SCORE = 0.50;
      const candidates = measureColumns
        .filter(mc => !boundColumns.has(mc.name))
        .map(mc => {
          const { score, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
          return { ...mc, score, scaleFactor };
        })
        .sort((a, b) => b.score - a.score);

      if (candidates.length > 0 && candidates[0].score >= BOUNDARY_FALLBACK_MIN_SCORE) {
        const best = candidates[0];
        bindings[compKey][req.role] = {
          source_batch_id: best.batchId,
          column: best.name,
          field_identity: best.fi,
          match_pass: 3,  // Boundary-only fallback
          confidence: Math.min(0.7, match.matchConfidence * (0.3 + best.score * 0.4)),
          scale_factor: best.scaleFactor !== 1 ? best.scaleFactor : undefined,
        };
        boundColumns.add(best.name);
        console.log(`[Convergence] HF-112 ${comp.name}:${req.role} → ${best.name} (boundary fallback, score=${best.score.toFixed(2)})`);
      } else if (candidates.length > 0) {
        console.log(`[Convergence] HF-199 D2: ${comp.name}:${req.role} boundary candidate "${candidates[0].name}" rejected (score=${candidates[0].score.toFixed(2)} < ${BOUNDARY_FALLBACK_MIN_SCORE} threshold). Requirement left unbound; gap will be recorded.`);
      }
    }

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

    // Find temporal column
    const temporalEntries = Object.entries(cap.fieldIdentities)
      .filter(([, fi]) => fi.structuralType === 'temporal');
    if (temporalEntries.length > 0) {
      const [colName, fi] = temporalEntries[0];
      bindings[compKey]['period'] = {
        source_batch_id: batchId,
        column: colName,
        field_identity: fi,
        match_pass: 1,
        confidence: match.matchConfidence,
      };
    }
  }

  // Log complete binding map
  for (const [compKey, cb] of Object.entries(bindings)) {
    const roles = Object.entries(cb)
      .filter(([role]) => role !== 'entity_identifier' && role !== 'period')
      .map(([role, b]) => `${role}=${b.column}`)
      .join(', ');
    if (roles) console.log(`[Convergence] HF-112 ${compKey}: ${roles}`);
  }
}
```

### Phase 2.3 — Selection criteria as written in code

Within `generateAllComponentBindings`, the **entity_identifier selection block** (lines 1937–1949) reads:

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

Criteria as written:
- Line 1939: `.filter(([, fi]) => fi.structuralType === 'identifier')` — selects any column whose `structuralType === 'identifier'` (no value-content check, no cardinality check, no contextualIdentity check)
- Line 1941: `const [colName, fi] = idEntries[0]` — takes the **first** entry from filtered results (no scoring, no tie-break)
- Iteration order is `Object.entries(cap.fieldIdentities)` (insertion order of the source map)

No check is performed against:
- Tenant entity external_id value-set
- Column-name string content (Korean Test compliant in this respect)
- Cardinality / uniqueness ratio of the column values
- `contextualIdentity` substring (no `'person'` substring filter at this site, unlike `entity-resolution.ts:91`)

### Phase 2.4 — Upstream — what feeds binding selection

Single caller of `generateAllComponentBindings` (verbatim grep):

```
web/src/lib/intelligence/convergence-service.ts:299:  await generateAllComponentBindings(components, matches, capabilities, componentBindings, existingConvergenceBindings, observations.metricComprehension);
```

Caller passes six inputs: `components` (plan components from rule_set), `matches` (component-to-dataType matches), `capabilities` (data capabilities including `fieldIdentities` and `columnStats`), `componentBindings` (mutable output map), `existingConvergenceBindings` (cache reuse), `metricComprehension` (HF-199 E5 signals).

**No `entities` or tenant `external_id` set is passed to convergence binding selection.**

Tenant-entity value-set match exists elsewhere (verbatim grep for "external_id.*intersect"):

```
web/src/app/api/import/commit/route.ts:518:          // If ≥50% of values match existing entities, treat as entity column
web/src/lib/sci/tenant-context.ts:221:      evidence: `${Math.round(overlap.overlapPercentage * 100)}% of identifier values (${overlap.matchingEntityIds.size}/${overlap.sheetUniqueValues.size}) match existing entity external_ids`,
```

These signals run in the SCI agent / import-commit pipeline (before convergence), not within convergence binding-selection.

### Phase 2.5 — Downstream consumers of `entity_identifier` binding

```
$ grep -n "compBindings.entity_identifier|entity_identifier.column|entityIdentifier.column" \
    web/src/ -r --include="*.ts"
web/src/app/api/calculation/run/route.ts:669:  // Key is the VALUE of row_data[entity_identifier_column], NOT the entity_id FK UUID
web/src/app/api/calculation/run/route.ts:672:    // Step 1: Collect entity_identifier columns per batch from convergence bindings
web/src/app/api/calculation/run/route.ts:693:    // DIAG-003: The entity_identifier column name is the SAME across batches (e.g., "ID_Empleado").
```

The downstream consumer is `dataByBatch` cache construction in `route.ts:670–719`. The binding's `entity_identifier.column` value is read at lines 676–678 and used as the cache key field (line 711).

### Phase 2.6 — `dataByBatch` indexing using `entity_identifier.column` (verbatim)

`web/src/app/api/calculation/run/route.ts:667–720`:

```typescript
  // HF-109: Build batch-indexed data cache keyed by external_id via convergence binding column (DS-009 5.1)
  // Maps batchId → entity_external_id_value → [row_data, ...] for O(1) lookup during calculation
  // Key is the VALUE of row_data[entity_identifier_column], NOT the entity_id FK UUID
  const dataByBatch = new Map<string, Map<string, Array<Record<string, unknown>>>>();
  if (convergenceBindings && Object.keys(convergenceBindings).length > 0) {
    // Step 1: Collect entity_identifier columns per batch from convergence bindings
    const entityColsByBatch = new Map<string, string>();
    for (const compBindings of Object.values(convergenceBindings)) {
      const cb = compBindings as Record<string, { source_batch_id?: string; column?: string }>;
      const entityIdBinding = cb.entity_identifier;
      if (entityIdBinding?.source_batch_id && entityIdBinding?.column) {
        entityColsByBatch.set(entityIdBinding.source_batch_id, entityIdBinding.column);
      }
      // HF-111: Index ALL binding role batches (actual, target, row, column, numerator, denominator)
      const bindingRoles = ['actual', 'target', 'row', 'column', 'numerator', 'denominator'];
      for (const role of bindingRoles) {
        const binding = cb[role];
        if (binding?.source_batch_id && !entityColsByBatch.has(binding.source_batch_id)) {
          if (entityIdBinding?.column) {
            entityColsByBatch.set(binding.source_batch_id, entityIdBinding.column);
          }
        }
      }
    }

    // Step 2: Index committed_data by row_data[entity_column] value (DS-009 pattern)
    const knownEntityCols = Array.from(new Set(Array.from(entityColsByBatch.values())));
    for (const row of committedData) {
      const batchId = row.import_batch_id;
      if (!batchId) continue;

      // Try the batch-specific entity column first, then any known entity column
      let entityCol = entityColsByBatch.get(batchId);
      if (!entityCol && knownEntityCols.length > 0) {
        entityCol = knownEntityCols[0]; // Same column name applies across batches
      }
      if (!entityCol) continue;

      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
        ? row.row_data as Record<string, unknown> : {};
      const entityKey = String(rd[entityCol] ?? '').trim();
      if (!entityKey) continue;

      if (!dataByBatch.has(batchId)) dataByBatch.set(batchId, new Map());
      const entityMap = dataByBatch.get(batchId)!;
      if (!entityMap.has(entityKey)) entityMap.set(entityKey, []);
      entityMap.get(entityKey)!.push(rd);
    }
    addLog(`HF-109 Batch cache: ${dataByBatch.size} batches indexed by external_id (DS-009 5.1)`);
  }
```

### Phase 2.7 — Existing self-verification logic (if any)

```
grep -rn "external_id.*intersect|values.*match.*entity|verifyBinding|validateBinding|outcome.*validation" \
  web/src/ --include="*.ts"
```

Two hits (verbatim):

```
web/src/app/api/import/commit/route.ts:518:          // If ≥50% of values match existing entities, treat as entity column
web/src/lib/sci/tenant-context.ts:221:      evidence: `${Math.round(overlap.overlapPercentage * 100)}% of identifier values (${overlap.matchingEntityIds.size}/${overlap.sheetUniqueValues.size}) match existing entity external_ids`,
```

`tenant-context.ts:221` is inside `computeTenantContextAdjustments` (verbatim context lines 208–234):

```typescript
export function computeTenantContextAdjustments(
  tenantContext: TenantContext,
  overlap: EntityIdOverlap | null,
  profile: ContentProfile,
): TenantContextAdjustment[] {
  const adjustments: TenantContextAdjustment[] = [];

  // --- SIGNAL 1: Entity ID Overlap (most powerful) ---
  if (overlap && overlap.overlapSignal === 'high') {
    adjustments.push({
      agent: 'transaction',
      adjustment: +0.15,
      signal: 'entity_id_overlap_high',
      evidence: `${Math.round(overlap.overlapPercentage * 100)}% of identifier values (${overlap.matchingEntityIds.size}/${overlap.sheetUniqueValues.size}) match existing entity external_ids`,
    });
    adjustments.push({
      agent: 'target',
      adjustment: +0.15,
      signal: 'entity_id_overlap_high',
      evidence: `${Math.round(overlap.overlapPercentage * 100)}% of identifier values (${overlap.matchingEntityIds.size}/${overlap.sheetUniqueValues.size}) match existing entities — references existing roster`,
    });
    adjustments.push({
      agent: 'entity',
      adjustment: -0.10,
      signal: 'entity_id_overlap_high',
      evidence: `Entities already exist — ${overlap.matchingEntityIds.size} matching. This sheet is data ABOUT them, not a new roster`,
    });
```

CC note (verbatim, not classification): this surface lives in the SCI agent classification pipeline (consumed by `computeTenantContextAdjustments`, not by `generateAllComponentBindings`). It adjusts SCI agent confidence scores via `TenantContextAdjustment[]`. It does not gate or filter the convergence binding-selection function's choice of `entity_identifier.column`. No code path connects this signal to convergence binding selection.

`import/commit/route.ts:518` — single-file site, also in pre-convergence ingestion. Not consumed by convergence binding-selection.

