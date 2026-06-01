# DIAG-056: Plan Interpretation LLM Response Capture

**§0 CC Standing Rules**

Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.
Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.

---

## §1 Problem

Plan import produces 0 components post-HF-245. The LLM runs for ~64 seconds and returns SOMETHING, but `interpretationToPlanConfig` extracts 0 components. Nobody has seen the actual LLM response.

---

## §2 Steps

### Step 1 — Read the interpretation pipeline

Read these files in full:

1. `web/src/lib/ai/providers/anthropic-adapter.ts` — the function that calls the LLM for plan interpretation. Find where the LLM response is received.
2. `web/src/lib/compensation/ai-plan-interpreter.ts` — find `interpretationToPlanConfig` or equivalent. Find where components are extracted from the LLM response. Find where the count "0 components" gets determined.

Paste the verbatim code at both sites.

### Step 2 — Trace the gap

The LLM returns a response. That response goes through parsing/normalization. Components come out the other side as 0. Somewhere in between, the response is either:
- (A) Not parseable as JSON
- (B) Parseable but the components field is empty or missing
- (C) Parseable, components present, but `convertComponent` throws on every one and they're all caught/discarded
- (D) The response is valid but `interpretationToPlanConfig` looks for components in the wrong location

Determine which case it is by reading the code. If there are try/catch blocks that swallow errors silently, that's likely the answer.

### Step 3 — Add a log line

In the function that receives the LLM response for plan interpretation, add ONE log line BEFORE any parsing:

```typescript
console.log('[DIAG-LLM-RAW] Plan interpretation response:', JSON.stringify(rawResponse).substring(0, 3000));
```

This captures the first 3000 chars of whatever the LLM returned. Enough to see the structure.

Commit and push:
```
git add -A && git commit -m "DIAG-056: diagnostic log for raw LLM plan interpretation response" && git push origin dev
```

### Step 4 — Report

Paste the verbatim code for:
1. Where the LLM response is received
2. Where components are extracted
3. Any try/catch blocks that might swallow component conversion errors
4. The log line you added

