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

---

## Phase 3 — Intent modifier execution (cap-slot mechanics)

### Phase 3.1 — File inventory

```
$ find web/src/lib/ -name "intent-executor*.ts" -o -name "intent-execution*.ts"
web/src/lib/calculation/intent-executor.ts

$ wc -l web/src/lib/calculation/intent-executor.ts
707
```

Top-level function inventory (verbatim grep):

```
68:function resolveSource(
159:function resolveValue(
186:export function findBoundaryIndex(boundaries: Boundary[], value: number): number {
215:function executeBoundedLookup1D(
257:function executeBoundedLookup2D(
299:function executeScalarMultiply(
312:function executeConditionalGate(
336:function executeAggregateOp(
344:function executeRatioOp(
357:function executeConstantOp(op: ConstantOp): Decimal {
365:function executeWeightedBlend(
399:function executeTemporalWindow(
486:export function executeOperation(
520:function executeLinearFunction(
535:function executePiecewiseLinear(
572:function applyModifiers(
584:      case 'cap': {
617:export function executeIntent(
683:  outcome = applyModifiers(outcome, intent.modifiers, entityData, modifierLog);
```

### Phase 3.2 — `executeIntent` function body (verbatim, lines 617–686)

```typescript
export function executeIntent(
  intent: ComponentIntent,
  entityData: EntityData
): ExecutionResult {
  const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
  const modifierLog: Array<{ modifier: string; before: number; after: number }> = [];
  // OB-196 Phase 3 (E4): trace carries foundational primitive identifier directly.
  // Top-level operation is intent.intent.operation; variant-routed primitives carry
  // identifier on the matched route's intent.operation, but the outer-shape op is
  // the foundational primitive that defines the component.
  const outerOp =
    (intent.intent && (intent.intent as { operation?: string }).operation) ||
    (intent.variants?.routes?.[0]?.intent && (intent.variants.routes[0].intent as { operation?: string }).operation) ||
    'unknown';
  const trace: Partial<ExecutionTrace> = {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    componentType: outerOp,
    confidence: intent.confidence,
  };

  let outcome = ZERO;

  // 1. Resolve variant routing (if present)
  if (intent.variants) {
    const routing = intent.variants;
    const attrSrc = routing.routingAttribute;

    // For entity_attribute source, resolve as string for matching
    let attrValue: string | number | boolean = '';
    if (attrSrc.source === 'entity_attribute') {
      attrValue = entityData.attributes[attrSrc.sourceSpec.attribute] ?? '';
    } else {
      attrValue = toNumber(resolveSource(attrSrc, entityData, inputLog));
    }

    const matchedRoute = routing.routes.find(r => String(r.matchValue) === String(attrValue));

    if (matchedRoute) {
      trace.variantRoute = {
        attribute: attrSrc.source === 'entity_attribute' ? attrSrc.sourceSpec.attribute : 'resolved',
        value: attrValue,
        matched: String(matchedRoute.matchValue),
      };
      outcome = executeOperation(matchedRoute.intent, entityData, inputLog, trace);
    } else {
      switch (routing.noMatchBehavior) {
        case 'first':
          if (routing.routes.length > 0) {
            outcome = executeOperation(routing.routes[0].intent, entityData, inputLog, trace);
          }
          break;
        case 'skip':
          outcome = ZERO;
          break;
        case 'error':
          outcome = ZERO;
          break;
      }
    }
  } else if (intent.intent) {
    // 2. Execute single operation (no variants)
    outcome = executeOperation(intent.intent, entityData, inputLog, trace);
  }

  // 3. Apply modifiers
  outcome = applyModifiers(outcome, intent.modifiers, entityData, modifierLog);

  // 4. Convert to native number at output boundary (Decision 122)
```

CC note (verbatim, not classification): `applyModifiers` at line 683 is called on the **outcome** of executeOperation (line 661, 666, or 679). The argument passed is the post-multiply Decimal value. No code path applies modifiers to operation inputs.

### Phase 3.3 — `applyModifiers` function body (verbatim, lines 572–610)

```typescript
function applyModifiers(
  value: Decimal,
  modifiers: IntentModifier[],
  data: EntityData,
  modifierLog: Array<{ modifier: string; before: number; after: number }>
): Decimal {
  let result = value;

  for (const mod of modifiers) {
    const before = toNumber(result);

    switch (mod.modifier) {
      case 'cap': {
        const cap = toDecimal(mod.maxValue);
        result = result.gt(cap) ? cap : result;
        break;
      }
      case 'floor': {
        const floor = toDecimal(mod.minValue);
        result = result.lt(floor) ? floor : result;
        break;
      }
      case 'proration': {
        const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
        const num = resolveSource(mod.numerator, data, inputLog);
        const den = resolveSource(mod.denominator, data, inputLog);
        result = den.isZero() ? ZERO : result.mul(num.div(den));
        break;
      }
      case 'temporal_adjustment':
        // Temporal adjustment requires historical data — not applied in single-period execution
        break;
    }

    modifierLog.push({ modifier: mod.modifier, before, after: toNumber(result) });
  }

  return result;
}
```

CC note (verbatim, not classification): the dispatch switch tests `mod.modifier` (not `mod.type`). Four cases: `cap`, `floor`, `proration`, `temporal_adjustment`. No `applyTo` field tested. The function signature accepts a single `value: Decimal` (one scalar in), one Decimal out.

### Phase 3.4 — Cap modifier dispatch (verbatim, lines 583–588)

```typescript
switch (mod.modifier) {
  case 'cap': {
    const cap = toDecimal(mod.maxValue);
    result = result.gt(cap) ? cap : result;
    break;
  }
```

Cap is a strictly post-execute clamp: if `result > maxValue`, set `result = maxValue`. No conditional, no scope distinction, no input-pre-multiply application.

### Phase 3.5 — Modifier application sequence (input vs outcome)

`executeIntent` step-3 (verbatim, line 682–683):

```typescript
  // 3. Apply modifiers
  outcome = applyModifiers(outcome, intent.modifiers, entityData, modifierLog);
```

The `outcome` variable holds the executeOperation return value (scalar Decimal). For Meridian c4 Senior:
- `executeScalarMultiply` (line 299–310) computes `inputValue.mul(rateValue)` where `inputValue` is the ratio result (`executeRatioOp` numerator/denominator) and `rateValue` is `800`. Output: ratio × 800.
- The output is then passed to `applyModifiers`, which dispatches `cap` at line 584 against the post-multiply value.

No code path calls `applyModifiers` on operation inputs.

### Phase 3.6 — Existing input-scoped modifier path scan

```
grep -rn "applyTo.*input|applyTo.*outcome|input.*modifier|modifier.*input" web/src/lib/ --include="*.ts"
```

Output (verbatim — 1 match, unrelated):

```
web/src/lib/calculation/primitive-registry.ts:195:    allowedKeys: ['operation', 'input', 'slope', 'intercept', 'modifiers'],
```

This is a primitive-registry `allowedKeys` declaration for a `linear_function` primitive (input + modifiers are sibling keys). No `applyTo` field exists. No input-scoped modifier path exists.

### Phase 3.7 — Existing conditional / min primitives

```
grep -n "conditional_gate|conditional.*operation|min\(|Math.min" web/src/lib/calculation/intent-executor.ts
496:    case 'conditional_gate':  return executeConditionalGate(op, data, inputLog, trace);
```

`conditional_gate` exists as a top-level primitive (function `executeConditionalGate` at line 312, verbatim):

```typescript
function executeConditionalGate(
  op: ConditionalGate,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const leftVal = resolveSource(op.condition.left, data, inputLog);
  const rightVal = resolveSource(op.condition.right, data, inputLog);

  let conditionMet = false;
  switch (op.condition.operator) {
    case '>=': conditionMet = leftVal.gte(rightVal); break;
    case '>':  conditionMet = leftVal.gt(rightVal);  break;
    case '<=': conditionMet = leftVal.lte(rightVal); break;
    case '<':  conditionMet = leftVal.lt(rightVal);  break;
    case '=':  // AI plan interpreter produces single-equals for equality
    case '==': conditionMet = leftVal.eq(rightVal);  break;
    case '!=': conditionMet = !leftVal.eq(rightVal); break;
  }

  const branch = conditionMet ? op.onTrue : op.onFalse;
  return executeOperation(branch, data, inputLog, trace);
}
```

`conditional_gate` supports `>=`, `>`, `<=`, `<`, `=`, `==`, `!=` operators with arbitrary left/right sources, and branches between two sub-operations. No `Math.min` or `min(` site found in intent-executor.ts.

`executeRatioOp` (line 344–355):

```typescript
function executeRatioOp(
  op: RatioOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): Decimal {
  const num = resolveSource(op.numerator, data, inputLog);
  const den = resolveSource(op.denominator, data, inputLog);
  if (den.isZero()) {
    return ZERO;
  }
  return num.div(den);
}
```

`executeScalarMultiply` (line 299–310):

```typescript
function executeScalarMultiply(
  op: ScalarMultiply,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const inputValue = resolveValue(op.input, data, inputLog, trace);
  const rateValue = typeof op.rate === 'number'
    ? toDecimal(op.rate)
    : resolveValue(op.rate, data, inputLog, trace);
  return inputValue.mul(rateValue);
}
```

CC note (verbatim, not classification): `op.input` is resolved via `resolveValue` which (per Phase 3.5 declared inputs) accepts a source spec OR a nested `IntentOperation`. So `op.input` can itself be a `conditional_gate` or any other primitive operation. This means a transformation that rewrites `{input: ratio, modifiers: [{cap, maxValue: 1.5}]}` into `{input: conditional_gate{ratio < 1.5 → ratio, ELSE 1.5}}` is structurally expressible using existing primitives.

---

## Phase 4 — Intent-transformer normalization surface

### Phase 4.1 — File inventory

```
$ find web/src/lib/ -name "intent-transformer*.ts" -o -name "intent-transformation*.ts"
web/src/lib/calculation/intent-transformer.ts

$ wc -l web/src/lib/calculation/intent-transformer.ts
222
```

Public API symbols (verbatim):
```
web/src/lib/calculation/intent-transformer.ts:52:export function transformVariant(
web/src/lib/calculation/intent-transformer.ts:86:function normalizeIntentInput(raw: unknown): IntentSource | IntentOperation {
```

`transformComponent` is exported per line 28 (single internal name with the `export` keyword removed in grep — actually visible at line 28 in the file). The full file is pasted in Phase 4.2.

### Phase 4.2 — Intent-transformer full file content (verbatim)

`web/src/lib/calculation/intent-transformer.ts` (222 lines, full):

```typescript
/**
 * Intent Transformer — Bridge from PlanComponent to ComponentIntent
 *
 * Deterministic transformation. No AI. No heuristics.
 * Reads the existing plan component and produces a structural intent
 * that the domain-agnostic executor can process.
 *
 * Foundational primitives only — legacy vocabulary case arms removed in OB-196 Phase 1.6.5.
 */

import type { PlanComponent } from '../../types/compensation-plan';

import type {
  ComponentIntent,
  IntentOperation,
  IntentSource,
  IntentModifier,
} from './intent-types';

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Transform a PlanComponent into a ComponentIntent.
 * Returns null if the component is disabled or has no valid intent.
 */
export function transformComponent(
  component: PlanComponent,
  componentIndex: number
): ComponentIntent | null {
  if (!component.enabled) return null;

  switch (component.componentType) {
    case 'linear_function':
    case 'piecewise_linear':
    case 'scope_aggregate':
    case 'scalar_multiply':
    case 'conditional_gate':
      return transformFromMetadata(component, componentIndex);
    default:
      // Default path: any component with calculationIntent or metadata.intent
      // routes through metadata-driven construction. Components lacking either
      // produce null (no transform).
      return transformFromMetadata(component, componentIndex);
  }
}

/**
 * Transform all components in a variant into ComponentIntents.
 */
export function transformVariant(
  components: PlanComponent[]
): ComponentIntent[] {
  const results: ComponentIntent[] = [];
  for (let i = 0; i < components.length; i++) {
    const intent = transformComponent(components[i], i);
    if (intent) results.push(intent);
  }
  return results;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function entityScope(level: string): 'entity' | 'group' {
  return level === 'individual' ? 'entity' : 'group';
}

// ──────────────────────────────────────────────
// Metadata-driven intent construction (OB-182)
// The AI plan interpreter stores the intent structure in component.metadata.intent
// or component.calculationIntent.
// ──────────────────────────────────────────────

/**
 * HF-187: Normalize an AI-produced source reference into a valid IntentSource or IntentOperation.
 *
 * AI format for metrics:  { source: "metric", sourceSpec: { field: "X" } }  → pass through
 * AI format for ratios:   { source: "ratio", sourceSpec: { numerator: "X", denominator: "Y" } }
 *                         → { operation: "ratio", numerator: IntentSource, denominator: IntentSource }
 * AI format for constants: { source: "constant", value: N } → pass through
 * String shorthand:       "field_name" → { source: "metric", sourceSpec: { field: "field_name" } }
 */
function normalizeIntentInput(raw: unknown): IntentSource | IntentOperation {
  if (raw == null) return { source: 'constant', value: 0 };

  if (typeof raw === 'string') {
    return { source: 'metric', sourceSpec: { field: raw } };
  }

  if (typeof raw === 'number') {
    return { source: 'constant', value: raw };
  }

  const obj = raw as Record<string, unknown>;

  if ('operation' in obj && typeof obj.operation === 'string') {
    if (obj.operation === 'ratio') {
      const spec = (obj.sourceSpec || {}) as Record<string, unknown>;
      return {
        operation: 'ratio',
        numerator: normalizeIntentInput(obj.numerator || spec.numerator),
        denominator: normalizeIntentInput(obj.denominator || spec.denominator),
        zeroDenominatorBehavior: (obj.zeroDenominatorBehavior as string) || 'zero',
      } as IntentOperation;
    }
    return obj as unknown as IntentOperation;
  }

  if (obj.source === 'ratio') {
    const spec = (obj.sourceSpec || {}) as Record<string, unknown>;
    return {
      operation: 'ratio',
      numerator: normalizeIntentInput(spec.numerator),
      denominator: normalizeIntentInput(spec.denominator),
      zeroDenominatorBehavior: 'zero',
    } as IntentOperation;
  }

  if (obj.source === 'metric' || obj.source === 'constant' || obj.source === 'entity_attribute'
    || obj.source === 'prior_component' || obj.source === 'cross_data'
    || obj.source === 'scope_aggregate' || obj.source === 'aggregate') {
    return obj as unknown as IntentSource;
  }

  return { source: 'constant', value: 0 };
}

function transformFromMetadata(
  component: PlanComponent,
  componentIndex: number
): ComponentIntent | null {
  const meta = (component.metadata || {}) as Record<string, unknown>;
  const rawIntent = (meta?.intent || (component as unknown as Record<string, unknown>).calculationIntent) as Record<string, unknown> | undefined;
  if (!rawIntent) return null;

  let operation: IntentOperation;
  if (rawIntent.additionalConstant != null && rawIntent.rate != null) {
    operation = {
      operation: 'linear_function',
      input: normalizeIntentInput(rawIntent.input),
      slope: Number(rawIntent.rate),
      intercept: Number(rawIntent.additionalConstant),
    } as IntentOperation;
  } else if (rawIntent.operation === 'scalar_multiply' && rawIntent.rate != null) {
    operation = {
      operation: 'scalar_multiply',
      input: normalizeIntentInput(rawIntent.input),
      rate: Number(rawIntent.rate),
    } as IntentOperation;
  } else if (rawIntent.operation === 'piecewise_linear') {
    const calcMethod = (component as unknown as Record<string, unknown>).calculationMethod as Record<string, unknown> | undefined;
    const tv = rawIntent.targetValue ?? calcMethod?.targetValue ?? meta?.targetValue;
    operation = {
      operation: 'piecewise_linear',
      ratioInput: normalizeIntentInput(rawIntent.ratioInput),
      baseInput: normalizeIntentInput(rawIntent.baseInput),
      ...(tv != null && Number(tv) > 0 ? { targetValue: Number(tv) } : {}),
      segments: Array.isArray(rawIntent.segments) ? rawIntent.segments.map((seg: Record<string, unknown>) => ({
        min: Number(seg.min ?? 0),
        max: seg.max != null ? Number(seg.max) : null,
        rate: Number(seg.rate ?? 0),
      })) : [],
    } as IntentOperation;
  } else if (rawIntent.operation === 'conditional_gate') {
    const cond = (rawIntent.condition || {}) as Record<string, unknown>;
    operation = {
      operation: 'conditional_gate',
      condition: {
        left: normalizeIntentInput(cond.left),
        operator: String(cond.operator || '>='),
        right: normalizeIntentInput(cond.right),
      },
      onTrue: normalizeIntentInput(rawIntent.onTrue) as IntentOperation,
      onFalse: normalizeIntentInput(rawIntent.onFalse) as IntentOperation,
    } as IntentOperation;
  } else {
    operation = rawIntent as unknown as IntentOperation;
  }

  const modifiers: IntentModifier[] = [];

  if (Array.isArray(rawIntent.modifiers)) {
    for (const mod of rawIntent.modifiers) {
      const m = mod as Record<string, unknown>;
      if (m.modifier === 'cap' && m.maxValue != null) {
        modifiers.push({ modifier: 'cap', maxValue: Number(m.maxValue), scope: 'per_period' });
      }
      if (m.modifier === 'floor' && m.minValue != null) {
        modifiers.push({ modifier: 'floor', minValue: Number(m.minValue), scope: 'per_period' });
      }
    }
  }

  if (meta.cap != null && Number(meta.cap) > 0) {
    modifiers.push({ modifier: 'cap', maxValue: Number(meta.cap), scope: 'per_period' });
  }
  if (meta.floor != null && Number(meta.floor) > 0) {
    modifiers.push({ modifier: 'floor', minValue: Number(meta.floor), scope: 'per_period' });
  }

  return {
    componentIndex,
    label: component.name,
    confidence: typeof meta.confidence === 'number' ? meta.confidence : 0.5,
    dataSource: {
      sheetClassification: 'transaction',
      entityScope: entityScope(component.measurementLevel),
      requiredMetrics: [],
    },
    intent: operation,
    modifiers,
    metadata: {
      domainLabel: component.name,
      planReference: component.id,
      aiConfidence: typeof meta.confidence === 'number' ? meta.confidence : 0.5,
      interpretationNotes: `AI-interpreted ${component.componentType} via calculationIntent`,
    },
  };
}
```

### Phase 4.3 — Existing transformations enumerated

| # | Site | Input shape | Output shape | Trigger |
|---|---|---|---|---|
| 1 | `transformFromMetadata` line 140–146 | `rawIntent.additionalConstant != null && rawIntent.rate != null` | `{operation: 'linear_function', input, slope: rate, intercept: additionalConstant}` | both `additionalConstant` and `rate` present |
| 2 | `transformFromMetadata` line 147–152 | `rawIntent.operation === 'scalar_multiply' && rawIntent.rate != null` | `{operation: 'scalar_multiply', input, rate}` | `operation==='scalar_multiply'` + `rate` present |
| 3 | `transformFromMetadata` line 153–166 | `rawIntent.operation === 'piecewise_linear'` | `{operation: 'piecewise_linear', ratioInput, baseInput, segments[]}` | `operation==='piecewise_linear'` |
| 4 | `transformFromMetadata` line 167–178 | `rawIntent.operation === 'conditional_gate'` | `{operation: 'conditional_gate', condition{left,operator,right}, onTrue, onFalse}` | `operation==='conditional_gate'` |
| 5 | `transformFromMetadata` line 179–181 | none of the above | passthrough: `rawIntent` cast as `IntentOperation` | else branch |
| 6 | `transformFromMetadata` line 185–195 | `Array.isArray(rawIntent.modifiers)` | append `{modifier: 'cap', maxValue, scope: 'per_period'}` or `{modifier: 'floor', minValue, scope: 'per_period'}` to modifiers[] | per-modifier check `m.modifier === 'cap' && m.maxValue != null` OR `m.modifier === 'floor' && m.minValue != null` |
| 7 | `transformFromMetadata` line 197–202 | `meta.cap != null && Number(meta.cap) > 0` (top-level shortcut) | append cap modifier with `scope: 'per_period'` | `meta.cap` numeric > 0 (legacy shortcut) |
| 8 | `transformFromMetadata` line 200–202 | `meta.floor != null && Number(meta.floor) > 0` (top-level shortcut) | append floor modifier with `scope: 'per_period'` | `meta.floor` numeric > 0 (legacy shortcut) |

Additional `normalizeIntentInput` rewrites (line 86–129):

| # | Input shape | Output shape | Trigger |
|---|---|---|---|
| N1 | `null` | `{source: 'constant', value: 0}` | input null/undefined |
| N2 | `typeof raw === 'string'` | `{source: 'metric', sourceSpec: {field: raw}}` | string shorthand |
| N3 | `typeof raw === 'number'` | `{source: 'constant', value: raw}` | number shorthand |
| N4 | `obj.operation === 'ratio'` (operation-shape) | `{operation: 'ratio', numerator: normalize(...), denominator: normalize(...), zeroDenominatorBehavior}` | object has `operation: 'ratio'` |
| N5 | `obj.source === 'ratio'` (source-shape) | `{operation: 'ratio', numerator: normalize(sourceSpec.numerator), denominator: normalize(sourceSpec.denominator), zeroDenominatorBehavior: 'zero'}` | object has `source: 'ratio'` |
| N6 | `obj.source ∈ {metric, constant, entity_attribute, prior_component, cross_data, scope_aggregate, aggregate}` | passthrough as `IntentSource` | source is one of 7 allowed values |
| N7 | else | `{source: 'constant', value: 0}` | fallback for unknown shape |

CC note (verbatim, not classification): the transformer dispatches on operation-shape via switch-like sequential if/else. Modifier handling at lines 185–202 has TWO paths: per-entry `rawIntent.modifiers[]` array (line 185–195) and top-level `meta.cap`/`meta.floor` shortcut (line 197–202). No transformation exists for `applyTo` field or input-scoped cap.

### Phase 4.4 — Transformer call sites (verbatim grep)

```
web/src/app/api/calculation/run/route.ts:30:import { transformVariant } from '@/lib/calculation/intent-transformer';
web/src/app/api/calculation/run/route.ts:335:  const componentIntents: ComponentIntent[] = transformVariant(defaultComponents);
web/src/app/api/calculation/run/route.ts:1852:      : transformVariant(selectedComponents);
```

Call site 1 (line 335, pre-entity-loop, verbatim):

```typescript
  // ── OB-76: Transform components to intents (once, before entity loop) ──
  const componentIntents: ComponentIntent[] = transformVariant(defaultComponents);
  addLog(`OB-76 Intent layer: ${componentIntents.length} components transformed to intents`);
```

Call site 2 (line 1852, inside entity loop for variant-routed entities, verbatim):

```typescript
    // ── HF-188 INTENT ENGINE PATH (authoritative) ──
    // HF-119: Use selected variant's intents, not always defaultComponents
    const entityIntents = selectedVariantIndex === 0
      ? componentIntents
      : transformVariant(selectedComponents);
```

CC note (verbatim, not classification): transformer is called at **calculation time** (every POST to `/api/calculation/run`), not at binding-write time. `defaultComponents` is transformed once before the entity loop; variant-specific `selectedComponents` is re-transformed per non-default-variant entity.

### Phase 4.5 — Transformer output consumption

```
$ grep -n "intent|calculationIntent" web/src/lib/calculation/intent-executor.ts | head -10
```

`executeIntent` (Phase 3.2) consumes the transformer output via `intent: ComponentIntent` parameter at line 618. `intent.intent` (the inner IntentOperation) is dispatched via `executeOperation` (line 661/666/679); `intent.modifiers` is passed to `applyModifiers` (line 683).

---

## Phase 5 — Plan-interpreter cap modifier emission

### Phase 5.1 — File inventory

```
$ find web/src/lib/ -iname "*plan-interpret*" -o -iname "*planinterp*"
web/src/lib/compensation/ai-plan-interpreter.ts

$ wc -l web/src/lib/compensation/ai-plan-interpreter.ts
534
```

### Phase 5.2 — Cap modifier emission sites

```
grep -rn "modifier.*cap|'cap'|\"cap\"|maxValue" web/src/lib/compensation/ web/src/lib/sci/ web/src/lib/intelligence/ web/src/lib/ai/ --include="*.ts"
```

Output (verbatim, 1 match):

```
web/src/lib/ai/providers/anthropic-adapter.ts:608:      { "modifier": "cap", "maxValue": 5000 }
```

The single emission site is **inside the LLM prompt template** (the `plan_interpretation` prompt), as an EXAMPLE. There is no deterministic code that constructs `{modifier: 'cap', maxValue: N}` in the plan interpreter; the cap blob is produced by the LLM responding to the prompt and carried verbatim through the persistence layer.

Within `web/src/lib/compensation/ai-plan-interpreter.ts` (534 lines) — zero matches for `'cap'`, `"cap"`, `maxValue`, or `modifier`. The plan interpreter does not construct or transform cap modifiers in code; it forwards whatever the LLM returns.

### Phase 5.3 — Cap emission function bodies

The plan interpreter does not synthesize cap modifiers in code. The cap blob is produced by the LLM via the `plan_interpretation` prompt template in `anthropic-adapter.ts`. The interpreter loads the raw LLM response and persists `calculationIntent` (including `modifiers[]`) into `rule_sets.components[].metadata.intent` / `rule_sets.components[].calculationIntent`.

### Phase 5.4 — LLM prompt construction for cap emission (verbatim)

Excerpt from `web/src/lib/ai/providers/anthropic-adapter.ts:600–613` (within the `plan_interpretation` prompt):

```
EXAMPLE calculationIntent for a linear_function with cap modifier:
{
  "calculationIntent": {
    "operation": "linear_function",
    "input": { "source": "metric", "sourceSpec": { "field": "revenue" } },
    "slope": 0.06,
    "intercept": 200,
    "modifiers": [
      { "modifier": "cap", "maxValue": 5000 }
    ]
  }
}

CRITICAL: Every component MUST include both "calculationMethod" (existing format) AND "calculationIntent" (structural vocabulary). The calculationIntent must be valid against the 7 primitives above.
```

Excerpt from the surrounding `plan_interpretation` prompt header (line 207):

```
plan_interpretation: `You are an expert at analyzing compensation and commission plan documents. Your task is to extract the COMPLETE structure of a compensation plan from the provided document content, INCLUDING ALL PAYOUT VALUES.
```

CC note (verbatim, not classification): the cap example in the prompt shows `modifier: 'cap', maxValue: 5000` attached to a `linear_function` operation whose `input` is a metric field. The example uses `5000` (a payout-currency-magnitude value). The example does not show the modifier attached to a `scalar_multiply` whose input is a ratio, nor does it show pre-multiply ratio clamping.

### Phase 5.5 — `IntentModifier` type definition (verbatim)

`web/src/lib/calculation/intent-types.ts:203–207`:

```typescript
export type IntentModifier =
  | { modifier: 'cap'; maxValue: number; scope: 'per_period' | 'per_entity' | 'total' }
  | { modifier: 'floor'; minValue: number; scope: 'per_period' | 'per_entity' | 'total' }
  | { modifier: 'proration'; numerator: IntentSource; denominator: IntentSource }
  | { modifier: 'temporal_adjustment'; lookbackPeriods: number; triggerCondition: IntentSource; adjustmentType: 'full_reversal' | 'partial' | 'prorated' };
```

CC note (verbatim, not classification): the `cap` discriminant has 3 fields: `modifier`, `maxValue`, `scope`. The `scope` field is an enum of `'per_period' | 'per_entity' | 'total'` — temporal/aggregation scope, not input-vs-output scope. There is **no `applyTo` field**. There is **no input-scoped (pre-multiply) cap discriminant** in the type union.

---

## Phase 6 — Cross-surface integration

### Phase 6.1 — HC → Convergence pipeline

`web/src/lib/intelligence/convergence-service.ts:880–892` (verbatim):

```typescript
      // OB-162: Extract field_identities from metadata (Decision 111)
      const fieldIds = meta?.field_identities as Record<string, { structuralType?: string; contextualIdentity?: string; confidence?: number }> | undefined;
      if (fieldIds && Object.keys(fieldIds).length > 0) {
        const identities: Record<string, FieldIdentity> = {};
        for (const [colName, fi] of Object.entries(fieldIds)) {
          identities[colName] = {
            structuralType: (fi.structuralType || 'unknown') as FieldIdentity['structuralType'],
            contextualIdentity: fi.contextualIdentity || 'unknown',
            confidence: typeof fi.confidence === 'number' ? fi.confidence : 0.5,
          };
        }
        fieldIdentitiesByType.set(dt, identities);
      }
```

CC note (verbatim, not classification): convergence reads `committed_data.metadata.field_identities` (written by `extractFieldIdentitiesFromTrace` || `buildFieldIdentitiesFromBindings` at the SCI execute pipeline per Phase 1.6). Convergence passes through `structuralType` and `contextualIdentity` verbatim (line 886–887) — no normalization, no validation, no override at convergence layer. The convergence binding-selection function (`generateAllComponentBindings`) then filters on `fi.structuralType === 'identifier'` (Phase 2.2 line 1939), which means whatever HC tagged as identifier is what convergence sees.

### Phase 6.2 — Convergence → Engine pipeline

`web/src/app/api/calculation/run/route.ts:177` + `223–262` (verbatim grep, condensed):

```
177:    .select('id, name, components, input_bindings, population_config, metadata')
221:  // If input_bindings is empty, run convergence now to generate derivation rules.
223:    const rawBindings = ruleSet.input_bindings as Record<string, unknown> | null;
225:    const hasConvergenceBindings = rawBindings?.convergence_bindings && Object.keys(rawBindings.convergence_bindings as Record<string, unknown>).length > 0;
228:      addLog('HF-165: input_bindings empty — running calc-time convergence');
240:            // Decision 111: convergence_bindings is the primary output
241:            updatedBindings.convergence_bindings = convResult.componentBindings;
251:            .update({ input_bindings: updatedBindings as unknown as Json })
257:            .select('input_bindings')
262:            (ruleSet as Record<string, unknown>).input_bindings = updatedRS.input_bindings;
277:      addLog('HF-165: input_bindings already populated — skipping convergence')
282:  const inputBindings = ruleSet.input_bindings as Record<string, unknown> | null;
286:    addLog(`OB-118 Metric derivations: ${metricDerivations.length} rules from input_bindings`);
```

The engine reads `rule_sets.input_bindings.convergence_bindings` directly. If empty, the engine triggers `convergeBindings` and writes the result back to `rule_sets.input_bindings.convergence_bindings` via `.update()` at line 251.

### Phase 6.3 — Plan-Interpreter → Intent-Transformer → Executor pipeline

Sites where `rule_sets.components` is written (verbatim grep):

```
web/src/lib/supabase/rule-set-service.ts:208:  const updateRow: Database['public']['Tables']['rule_sets']['Update'] = {
web/src/lib/supabase/rule-set-service.ts:232:  const updateRow: Database['public']['Tables']['rule_sets']['Update'] = {
web/src/lib/supabase/rule-set-service.ts:255:  const updateRow: Database['public']['Tables']['rule_sets']['Update'] = {
web/src/lib/supabase/rule-set-service.ts:280:    .update({ status: 'archived' } as Database['public']['Tables']['rule_sets']['Update'])
web/src/lib/supabase/rule-set-service.ts:284:  const updateRow: Database['public']['Tables']['rule_sets']['Update'] = {
web/src/lib/supabase/rule-set-service.ts:307:  const updateRow: Database['public']['Tables']['rule_sets']['Update'] = {
```

Sites where `rule_sets.input_bindings` is updated (verbatim grep):

```
web/src/app/api/intelligence/converge/route.ts:81:          .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
web/src/app/api/intelligence/wire/route.ts:390:            .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
web/src/app/api/calculation/run/route.ts:251:            .update({ input_bindings: updatedBindings as unknown as Json })
web/src/app/api/import/sci/execute-bulk/route.ts:605:      .update({ input_bindings: {} })
web/src/app/api/import/sci/execute-bulk/route.ts:758:      .update({ input_bindings: {} })
web/src/app/api/import/sci/execute-bulk/route.ts:899:      .update({ input_bindings: {} })
web/src/app/api/import/sci/execute/route.ts:237:              .update({ input_bindings: updatedBindings as unknown as Json })
web/src/app/api/import/commit/route.ts:1010:            .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
```

Sites where `rule_sets.components[].calculationIntent` is consumed at calc time (verbatim grep):

```
web/src/app/api/calculation/run/route.ts:30:import { transformVariant } from '@/lib/calculation/intent-transformer';
web/src/app/api/calculation/run/route.ts:335:  const componentIntents: ComponentIntent[] = transformVariant(defaultComponents);
web/src/app/api/calculation/run/route.ts:1852:      : transformVariant(selectedComponents);
```

Pipeline: plan-interpreter (LLM via anthropic-adapter.ts plan_interpretation prompt) → `rule_sets.components[]` (written by rule-set-service.ts) → `transformVariant` (calc-time, intent-transformer.ts) → `executeIntent` (intent-executor.ts) → `applyModifiers`.

### Phase 6.4 — Fingerprint flywheel cache interaction

`web/src/lib/sci/fingerprint-flywheel.ts:1–82` (verbatim, condensed to Tier 1 mechanics):

```typescript
/**
 * Fingerprint Flywheel — DS-017 §3-4
 *
 * Three Tiers of Recognition:
 *   Tier 1: Exact tenant-specific fingerprint match → skip LLM entirely
 *   Tier 2: Foundational (cross-tenant) match → targeted LLM prompt
 *   Tier 3: Novel structure → full LLM classification
 */

export async function lookupFingerprint(
  tenantId: string,
  columns: string[],
  sampleRows: Record<string, unknown>[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<FlywheelLookupResult> {
  const fingerprintHash = computeFingerprintHashSync(columns, sampleRows);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

CC note (verbatim, not classification): the flywheel caches `classification_result` and `column_roles` (table: `structural_fingerprints`). On Tier 1 match (confidence ≥ 0.5) the LLM is skipped and cached data is replayed. The cache write happens after every successful classification (per the file's docstring); this caches the HC's output. Self-correction at OB-177 (referenced in comment line 54) decreases confidence on binding failures — the comment cites the 0.92 → 0.32 sequence that triggers Tier 2 re-classification at 3 failures. CC has not paste-traced OB-177 self-correction's full body in this DIAG; the reference is surfaced. No site found that writes `convergence_bindings` directly to the flywheel cache — convergence bindings are stored on `rule_sets.input_bindings`, not on `structural_fingerprints`.

### Phase 6.5 — Korean Test scan

```
grep -rn "['\"]No_Empleado['\"]|['\"]Hub['\"]|['\"]Cumplimiento['\"]|['\"]ID_Empleado['\"]" \
  web/src/lib/sci/ web/src/lib/intelligence/ web/src/lib/compensation/ \
  --include="*.ts"
```

Output: (empty — zero matches)

```
grep -rn "/employee/i|/empleado/i|/hub/i" web/src/lib/ --include="*.ts"
```

Output: (empty — zero matches)

CC note (verbatim, not classification): **0 Korean Test violations across HC, convergence, compensation, and intelligence directories.** No source code in these surfaces hardcodes Meridian-specific column names or language-specific string-match patterns.

