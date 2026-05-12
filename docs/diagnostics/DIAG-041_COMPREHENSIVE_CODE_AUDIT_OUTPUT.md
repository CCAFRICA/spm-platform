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

