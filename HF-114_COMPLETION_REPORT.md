# HF-114 Completion Report: AI Column Mapping Format Fix

## Root Cause
HF-112/113 used `task: 'field_mapping'` which has a hardcoded system prompt in `anthropic-adapter.ts` instructing AI to return `{suggestedField, alternativeFields, transformationNeeded, confidence, reasoning}`. The adapter's `buildUserPrompt()` also reformats input as a single-column mapping request from `input.columnName`/`input.sampleValues` — fields that don't exist in the convergence call. The custom system and user prompts were completely discarded.

## Fix: New `convergence_mapping` Task Type (HC Pattern)

Mirrors the proven `header_comprehension` pattern:
1. **System prompt** (SYSTEM_PROMPTS in anthropic-adapter.ts): defines the flat JSON schema `{"metric_field": "column_name"}`
2. **buildUserPrompt**: `return input.userMessage as string` — passes convergence caller's prompt through unchanged
3. **Convergence caller**: uses `task: 'convergence_mapping'` with full metric/column context in `input.userMessage`

No retry logic needed — correct system prompt eliminates format errors.

## Files Changed

| File | Change |
|------|--------|
| `web/src/lib/ai/types.ts` | Added `convergence_mapping` to AITaskType |
| `web/src/lib/ai/providers/anthropic-adapter.ts` | Added system prompt + buildUserPrompt case |
| `web/src/lib/intelligence/convergence-service.ts` | Changed task type, removed retry, simplified |

## Verification SQL

### Reset (Before Re-convergence)
```sql
UPDATE rule_sets SET input_bindings = '{}'::jsonb
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

### V1: Each component binds to correct column
```sql
SELECT
  key as component,
  value->'actual'->>'column' as actual_col,
  value->'row'->>'column' as row_col,
  value->'column'->>'column' as col_col,
  value->'numerator'->>'column' as num_col,
  value->'denominator'->>'column' as den_col
FROM rule_sets,
  jsonb_each(input_bindings->'convergence_bindings')
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

## Phases
| Phase | Commit | Description |
|-------|--------|-------------|
| 0 | `436b95e` | Code inspection + architecture decision (Option D: HC pattern) |
| 1 | `98bc0f5` | Register convergence_mapping task type + fix AI call |
| 2 | This commit | Completion report + PR |

## Ground Truth
**MX$185,063** — Meridian Logistics Group, January 2025
Pending production verification after merge + re-import + convergence.

---
*HF-114 Complete | March 9, 2026*
