# DIAG-055 / HF-245 — Plan Interpretation Zero Components Diagnostic + Fix

**Branch:** `dev` (off `main @ 03dddb8d` via merge `de783e81`)
**Date:** 2026-05-21

---

## Diagnostic — what was actually wrong

The directive hypothesized that OB-200 Phase 1's `<<PRIME_GRAMMAR>>` replacement of the system prompt's calc-intent block removed instructions the LLM needs to extract components. Side-by-side diff of pre-OB-200 (`e252aa20~1:anthropic-adapter.ts`) vs current shows the replacement was a CLEAN swap of the calc-intent block (lines 428-654 in old → `<<PRIME_GRAMMAR>>` placeholder in new). The surrounding system-prompt sections — CRITICAL REQUIREMENTS, `<<COMPONENT_TYPE_LIST>>`, `<<STRUCTURAL_EXAMPLES>>`, WORKED EXAMPLES, TYPE SELECTION RULES, NUMERIC PARSING RULES, IMPORTANT GUIDELINES — are byte-identical. The user message that carries the JSON output schema (lines 878-931 in current, 1096-1149 in pre-OB-200) is also byte-identical.

So OB-200 did not remove instructions. But two latent problems combined to produce the zero-component regression:

1. **The user-message response schema never showed `calculationIntent`.** It only showed `type: "<one of the registered foundational primitives — see <<COMPONENT_TYPE_LIST>> enumeration above>"` and a `calculationMethod` shape. The system prompt's grammar block said "every component MUST carry both calculationMethod AND calculationIntent" — but the user message's example didn't show calculationIntent, so the LLM had no concrete shape to anchor on for the new field. Pre-OB-200 this same gap existed too, but the LLM had less elaborate grammar to satisfy, and there was historical inertia from cached prompt continuations.

2. **The WORKED EXAMPLES section emits legacy types the registry rejects.** Post-HF-238 the primitive registry has every legacy type flagged `deprecated: true`; only `prime_dag` is non-deprecated. `<<COMPONENT_TYPE_LIST>>` substitution shows the LLM "Allowed component type values (1 active foundational primitive):  - prime_dag". But the WORKED EXAMPLES section (~180 lines) shows `"type": "bounded_lookup_2d"`, `"type": "scalar_multiply"`, etc. The LLM sees a hard rule ("allowed: prime_dag") and six worked examples ("type: bounded_lookup_2d"). With HF-244 Phase 2 enlarging the grammar block (added rateTableCellCount), the contradiction tipped the LLM toward emitting an empty components array — the most defensive response to conflicting instructions.

Evidence that HF-244 is the proximate trigger (not OB-200):

```
69aec3d5 status=archived name="Banco …" created=2026-05-21T02:04:56  variants=1 components=4   ← post-OB-200, pre-HF-244
0c98b701 status=archived name="Unnamed Plan" created=2026-05-21T04:02:55  variants=1 components=0   ← post-HF-244
f5003390 status=active   name="Unnamed Plan" created=2026-05-21T04:03:55  variants=1 components=0   ← post-HF-244
```

HF-244 merged at 03:54:46. Both zero-component imports landed after HF-244. The pre-HF-244 import (69aec3d5) was successful.

---

## Pre-OB-200 prompt (relevant section — calc-intent block at lines 428-654)

The pre-OB-200 system prompt's CALCULATION INTENT block defined the nine primes inline and gave 8 composition illustrations (A through H). Closing instruction: "CRITICAL: Every component MUST include both 'calculationMethod' (existing free-form description) AND 'calculationIntent' (the PrimeNode tree)."

This text was preserved structurally — OB-200 moved it into `prime-grammar.ts:generatePromptGrammarSection()` and substituted via `<<PRIME_GRAMMAR>>`. Verbatim diff would show:
- 4 illustrations vs 8 (compact)
- Scale-metadata convention added on constants
- Rate-table cell declaration added (HF-244 Phase 2)
- Same closing CRITICAL on dual emission

No instruction lost.

---

## Post-OB-200 prompt (relevant section — system prompt, current)

System prompt (lines 218-431 in `anthropic-adapter.ts`):
- Lines 218-225: critical extraction requirements (unchanged from pre-OB-200)
- Lines 226-229: type must be a registered foundational primitive (unchanged)
- Line 231: `<<COMPONENT_TYPE_LIST>>` (substituted: only `prime_dag`)
- Line 233: `<<STRUCTURAL_EXAMPLES>>` (substituted: per-primitive structural examples)
- Lines 235-414: WORKED EXAMPLES for legacy types (unchanged from pre-OB-200 — emits `type: bounded_lookup_2d` etc.)
- Lines 416-427: type selection rules, numeric parsing, important guidelines (unchanged)
- Line 429: `<<PRIME_GRAMMAR>>` (substituted: ~8008 chars of prime-DAG grammar; pre-OB-200 had inline ~7000 chars)
- Line 431: "Return your analysis as valid JSON."

User message (lines 878-931 — pre-fix):

```
Analyze the following compensation plan document and extract its COMPLETE structure …

Return a JSON object with:
{
  "ruleSetName": "...",
  …
  "components": [
    {
      "id": "...",
      "name": "...",
      "type": "<one of the registered foundational primitives — see <<COMPONENT_TYPE_LIST>>>",
      "calculationMethod": { /* legacy keys per primitive */ },
      "confidence": 0-100,
      "reasoning": "..."
    }
  ],
  …
}
```

`calculationIntent` not mentioned in the user-message schema. `rateTableCellCount` not mentioned.

---

## Diff (what changed in this HF)

### 1. User-message JSON schema — adds `calculationIntent`, `rateTableCellCount`, anchors `type: "prime_dag"`

```
- "type": "<one of the registered foundational primitives — see <<COMPONENT_TYPE_LIST>> enumeration above>",
+ "type": "prime_dag",
+ "calculationIntent": {
+   "prime": "...", "...": "..."   // per the CALCULATION INTENT grammar in the system instructions
+ },
+ "rateTableCellCount": 30,   // omit when no rate table; integer total cells (1D: N, 2D: N×M)
```

Also: explicit "components MUST contain at least one entry when the document describes a compensation plan; emit one component per distinct payout structure." Closes the silent zero-component failure mode.

### 2. WORKED EXAMPLES — deprecation note prepended

```
- WORKED EXAMPLES (use these to populate calculationMethod payloads correctly):
+ WORKED EXAMPLES (HISTORICAL REFERENCE — the section below shows the LEGACY shapes the engine used before the prime-DAG migration. Post-HF-238 the only registered primitive is "prime_dag"; every component MUST be emitted with type="prime_dag" and a calculationIntent PrimeNode tree per the CALCULATION INTENT grammar below. The legacy shapes below are kept as semantic glossary so you can READ a legacy plan description and translate it into the prime-DAG composition. Do NOT emit type="bounded_lookup_2d", type="scalar_multiply", etc. — those are not registered primitives in the current platform):
```

The legacy worked examples remain as a SEMANTIC GLOSSARY — they help the LLM recognize what a legacy plan description means in order to translate it into prime-DAG. But the LLM is now told explicitly NOT to emit those types.

---

## Restored / improved post-fix prompt (relevant section)

The user message now reads:

```
Analyze the following compensation plan document and extract its COMPLETE structure INCLUDING ALL PAYOUT VALUES FROM EVERY TABLE.

DOCUMENT CONTENT:
---
<plan text>
---

CRITICAL: For each component, you MUST extract every numeric value the source document carries — every tier threshold, every payout amount, every cell of a rate table. Empty tiers/matrices will cause $0 payouts. The "calculationIntent" PrimeNode tree (defined in the system instructions) is the operative shape the engine consumes; "calculationMethod" is the free-form mirror the platform preserves alongside it.

REQUIRED RESPONSE SHAPE — return a JSON object with these top-level fields. The "components" array MUST contain at least one entry when the document describes a compensation plan; emit one component per distinct payout structure:

{
  "ruleSetName": "Name of the plan, verbatim from the document title or header",
  …
  "components": [
    {
      "id": "unique-id-1",
      "name": "Component name verbatim from the document",
      "type": "prime_dag",
      "calculationIntent": { "prime": "...", "...": "..." },
      "calculationMethod": { "type": "prime_dag" },
      "rateTableCellCount": 30,
      "confidence": 0-100,
      "reasoning": "How you extracted this component"
    }
  ],
  …
}

If the document does not contain a compensation plan, return components: [] and set ruleSetName / reasoning to explain why. Do NOT return an empty components array for a document that DOES describe a plan — extract whatever components are visible.
```

---

## Build verification

```
npx tsc --noEmit        → clean
rm -rf .next && npm run build → ✓ Compiled successfully
```

---

## Architect-manual verification

1. Wipe BCL bindings:
   ```sql
   UPDATE rule_sets SET input_bindings = '{}'
   WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' AND status = 'active';
   ```

2. Reimport BCL plan through the browser.

3. Capture verbatim the `[SCI plan-interp] Batched plan saved` line. Expected: `N components` where N > 0. The HF-244 supersession block will set the previous active rule_set (f5003390) to archived; the new import should land with status=active and components > 0.

4. If `rateTableCellCount` is emitted by the LLM, the validator can now enforce exhaustive emission per HF-244 Phase 2. If C0 (Credit Placement) still emits a truncated tree, expect `UnconvertibleComponentError` thrown from `convertComponent` with the `exhaustive_emission` violation message.

---

## Files changed

- `web/src/lib/ai/providers/anthropic-adapter.ts`
  - `buildUserMessage` plan_interpretation case: response schema now shows `type: "prime_dag"`, `calculationIntent`, `rateTableCellCount`, plus the "MUST contain at least one entry" instruction.
  - System prompt WORKED EXAMPLES section: deprecation note added explaining the legacy types are historical glossary, not emission targets.
- `docs/completion-reports/DIAG-055_HF-245_COMPLETION_REPORT.md` (this file)
