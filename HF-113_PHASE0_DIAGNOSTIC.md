# HF-113 Phase 0: AI Prompt Diagnostic

## Root Cause
`resolveColumnMappingsViaAI` at convergence-service.ts:984 uses:
```typescript
aiService.execute({
  task: 'narration',           // ← WRONG: triggers narration system prompt
  input: { system: ..., userMessage: ... },
  options: { maxTokens: 500 }, // ← MISSING: responseFormat: 'json'
}, false);
```

The `task: 'narration'` triggers the Anthropic adapter's narration system prompt, which instructs Claude to write a narrative analysis. The user prompt's "Respond ONLY with valid JSON" is overridden by the system prompt saying "write a narrative."

## Fix
1. Change `responseFormat: 'json'` to force JSON mode
2. Rewrite system prompt with explicit JSON schema + example output
3. Add validation: check that returned keys are metric field names and values are column names
4. Retry with stripped-down prompt on failure

## AIService JSON Pattern (from other callers)
All reliable JSON callers use:
```typescript
options: { responseFormat: 'json', maxTokens: N }
```
Plus explicit JSON schema in system prompt.

---
*HF-113 Phase 0 | March 9, 2026*
