# OB-162 Phase 0: Diagnostic Baseline

## 0.1: committed_data Schema (from SCHEMA_REFERENCE_LIVE.md)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| tenant_id | uuid | NO | |
| import_batch_id | uuid | YES | |
| entity_id | uuid | YES | |
| period_id | uuid | YES | |
| data_type | text | NO | |
| row_data | jsonb | NO | |
| metadata | jsonb | NO | |
| created_at | timestamp with time zone | NO | now() |
| source_date | date | YES | |

**metadata column: JSONB, NOT NULL** — suitable for storing field_identities.

## 0.2: Engine Contract 7-value query

**SQL for Andrew to verify:**
```sql
SELECT
  (SELECT count(*) FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as rule_sets,
  (SELECT count(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as entities,
  (SELECT count(*) FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as committed_data,
  (SELECT count(*) FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_data,
  (SELECT count(*) FROM reference_items WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_items,
  (SELECT count(*) FROM periods WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as periods,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as assignments;
```

Expected: rule_sets=1, entities=50, committed_data=86, reference_data=0, reference_items=0, periods=0.

## 0.3: input_bindings state

```sql
SELECT input_bindings FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

Expected: empty `{}` or `{"metric_derivations": []}`.

## 0.4: HC Prompt Location

**File:** `web/src/lib/ai/providers/anthropic-adapter.ts:545-570`
**Current prompt text:**
```
You are analyzing a data file with multiple sheets. For each column in each sheet, determine what the column represents based on its header name and sample values.

For each column, provide:
- semanticMeaning: what this column represents
- dataExpectation: what values should look like
- columnRole: one of: identifier, name, temporal, measure, attribute, reference_key, unknown
- confidence: 0.0 to 1.0
```

**HC output structure** (LLMHeaderResponse, header-comprehension.ts:54-62):
```typescript
interface LLMHeaderResponse {
  sheets: Record<string, { columns: Record<string, {
    semanticMeaning: string;
    dataExpectation: string;
    columnRole: string;
    confidence: number;
  }> }>;
  crossSheetInsights: string[];
}
```

## 0.5: SCI Execute Routing Logic

**File:** `web/src/app/api/import/sci/execute/route.ts:270-281`
```typescript
switch (effectiveUnit.confirmedClassification) {
  case 'target':     return executeTargetPipeline(...);
  case 'transaction': return executeTransactionPipeline(...);
  case 'entity':     return executeEntityPipeline(...);
  case 'plan':       return executePlanPipeline(...);
  case 'reference':  return executeReferencePipeline(...);
}
```

- Entity pipeline: lines 683-832 — creates entities table rows
- Transaction pipeline: lines 508-677 — inserts committed_data
- Target pipeline: lines 320-502 — inserts committed_data
- Reference pipeline: lines 838-1020 — inserts reference_data + reference_items
- Plan pipeline: lines 1027-1203 — AI interpretation → rule_sets

## 0.6: Convergence Service Location

**File:** `web/src/lib/intelligence/convergence-service.ts:68-305`
- `convergeBindings()` — main entry point
- Token overlap matching: lines 524-559
- Writes to input_bindings: via SCI execute route lines 151-154

**Input_bindings write location:** `web/src/app/api/import/sci/execute/route.ts:151-154`
```typescript
await supabase
  .from('rule_sets')
  .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
  .eq('id', rs.id);
```

## Proof Gate 0

- [x] committed_data schema pasted (columns, types, nullability) — Section 0.1
- [x] Engine Contract 7-value query pasted — Section 0.2
- [x] input_bindings content identified (metric_derivations format) — Section 0.3
- [x] HC prompt location identified — anthropic-adapter.ts:545
- [x] HC output structure identified — LLMHeaderResponse in header-comprehension.ts:54-62
- [x] SCI execute routing logic identified — route.ts:270-281
- [x] Convergence service location identified — convergence-service.ts:68
- [x] Convergence input_bindings write location identified — route.ts:151-154
