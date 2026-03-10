# HF-114 Phase 0: Architecture Decision Record

## Code Inspection Summary

### Problem: Three-Layer System Prompt Override

The convergence AI call in `resolveColumnMappingsViaAI()` (convergence-service.ts:995-1003) uses:
```typescript
aiService.execute({
  task: 'field_mapping',
  input: { system: customSystemPrompt, userMessage: customUserPrompt },
  options: { maxTokens: 500, responseFormat: 'json' },
}, false);
```

This fails because of three independent overrides in `anthropic-adapter.ts`:

1. **System prompt override** (line 616): `SYSTEM_PROMPTS['field_mapping']` replaces the custom system prompt. The `field_mapping` system prompt (lines 52-62) instructs AI to return `{suggestedField, alternativeFields, transformationNeeded, confidence, reasoning}` — NOT a flat metric-to-column mapping.

2. **User prompt override** (lines 752-760): `buildUserPrompt('field_mapping')` constructs a completely different user message from `input.columnName` and `input.sampleValues` — fields that don't exist in the convergence call's input object.

3. **Request body construction** (lines 648-659): The adapter puts `SYSTEM_PROMPTS[task]` in the `system` field and `buildUserPrompt()` output in `messages[0].content`. The custom `system` and `userMessage` fields in `input` are NEVER read for `field_mapping`.

### Result
The AI receives:
- System: "You are an expert at mapping data columns to platform fields... Return {suggestedField, alternativeFields, ...}"
- User: "Map the following column to a platform field: Column Name: undefined Sample Values: undefined..."

The custom prompts from convergence are completely discarded.

### Why `narration` Worked (Partially) in HF-112
The `narration` case in `buildUserPrompt` (lines 912-917) is the ONLY task type that reads `input.system` and `input.userMessage`:
```typescript
case 'narration':
  return `${input.system || '...'}\n\n${input.userMessage || '...'}`;
```
But the `narration` system prompt (lines 528-543) still wraps the response as `{narrative, confidence}`.

### HC's Proven Pattern
`header_comprehension` (lines 545-576, 919-920):
- System prompt: complete JSON schema with explicit example output
- `buildUserPrompt`: `return input.sheetsDescription as string;` — passes raw input through unchanged
- Callers provide the full description in `input.sheetsDescription`

## Options Evaluated

### Option A: Register new `column_mapping` task type
- Add system prompt to `SYSTEM_PROMPTS` in anthropic-adapter.ts with flat JSON schema
- Add `buildUserPrompt` case that passes `input.userMessage` through unchanged
- Add to `AITaskType` union in types.ts
- **Pro:** Clean separation, purpose-built system prompt
- **Con:** 3 files touched, new type pollutes the task registry for a single-caller use case

### Option B: Use `header_comprehension` task type
- The HC system prompt is unrelated to column mapping
- Would need to override the system prompt somehow
- **Con:** Semantic mismatch — HC analyzes sheet headers, not column mapping

### Option C: Use `narration` with custom prompts (current HF-112 approach)
- `narration` passes `input.system` and `input.userMessage` to the user message
- But `SYSTEM_PROMPTS['narration']` still overrides the system slot with narrative instructions
- **Con:** The system prompt says "write a narrative" — conflicts with "return flat JSON"

### Option D: Mirror HC exactly — register `convergence_mapping` task type
- New system prompt: flat JSON schema, explicit example, "no markdown, no explanation"
- `buildUserPrompt`: pass `input.userMessage` straight through (like HC)
- Convergence caller provides all context in `input.userMessage`
- **Pro:** Follows the proven HC pattern exactly. Clean. One system prompt per purpose.
- **Con:** 3 files (types.ts, anthropic-adapter.ts, convergence-service.ts)

## Decision: Option D — `convergence_mapping` task type

Rationale:
1. **HC pattern is proven.** Header comprehension works perfectly for JSON output because its system prompt defines the schema and its `buildUserPrompt` passes raw input through.
2. **Clean separation.** A `convergence_mapping` system prompt can demand exactly the output format convergence needs: `{"metric_field": "column_name", ...}`.
3. **No prompt conflicts.** The system prompt and user prompt are both purpose-built for this task. No override, no repurposing.
4. **Korean Test compliant.** System prompt defines the mapping task in English. User prompt provides metric names (English, from plan interpretation) and column profiles (English contextual identities from HC). No hardcoded field names.

## Implementation Plan

### Phase 1: Register `convergence_mapping` task type
1. `web/src/lib/ai/types.ts` — add `'convergence_mapping'` to `AITaskType` union
2. `web/src/lib/ai/providers/anthropic-adapter.ts`:
   - Add `convergence_mapping` system prompt to `SYSTEM_PROMPTS` with flat JSON schema
   - Add `buildUserPrompt` case: `return input.userMessage as string;`
3. `web/src/lib/intelligence/convergence-service.ts`:
   - Change `task: 'field_mapping'` to `task: 'convergence_mapping'`
   - Pass column/metric context in `input.userMessage` (not `input.system`)
   - Remove retry logic (correct system prompt eliminates format errors)

---
*HF-114 Phase 0 | March 9, 2026*
