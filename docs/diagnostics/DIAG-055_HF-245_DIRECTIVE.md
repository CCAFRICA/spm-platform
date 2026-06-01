# DIAG-055: Plan Interpretation Zero Components — Prompt Regression Diagnostic

**§0 CC Standing Rules**

Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.
Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.

---

## §1 Problem

Post-OB-200, plan import produces 0 components. Pre-OB-200, the same plan file produced 4 components with DAG trees.

Evidence:
- Pre-OB-200 rule_set `69aec3d5`: 4 components per variant, DAG trees with constants carrying `meta`.
- Post-OB-200 rule_set `f5003390`: `{"variants": [{"variantId": "default", "components": [], ...}]}`. Zero components. Plan named "Unnamed Plan" instead of the actual plan name.
- The LLM received 2,106 chars of plan text from 3 sheets.
- `interpretationToPlanConfig` produced 1 variant, 0 components.
- No `[PrimeValidator]` or `UnconvertibleComponentError` in logs — the validator never fired because no components reached it.

Root cause hypothesis: OB-200 Phase 1 replaced ~226 lines of hand-written prompt in `anthropic-adapter.ts` with `generatePromptGrammarSection()`. The replacement may have removed the instructions that tell the LLM to extract components from the plan document and produce the expected JSON output format.

---

## §2 Diagnostic Steps

### Step 1 — Read the current plan interpretation prompt

Open `web/src/lib/ai/providers/anthropic-adapter.ts`. Find the function that builds the plan interpretation prompt (the one that calls `generatePromptGrammarSection()`). Paste the COMPLETE prompt template — every string literal, every template variable, the full system message and user message that gets sent to the LLM for plan interpretation.

This is the most important step. Paste the ENTIRE prompt. Do not summarize.

### Step 2 — Read the generated grammar section

Open `web/src/lib/calculation/prime-grammar.ts`. Call or read `generatePromptGrammarSection()`. Paste the FULL output — every line that this function produces.

### Step 3 — Read the pre-OB-200 prompt from git history

```bash
git log --oneline --all | head -20
git show main~5:web/src/lib/ai/providers/anthropic-adapter.ts > /tmp/pre-ob200-adapter.ts 2>/dev/null || \
git show HEAD~5:web/src/lib/ai/providers/anthropic-adapter.ts > /tmp/pre-ob200-adapter.ts
```

Find the SHA before OB-200's Phase 1 commit (`e252aa20`). Then:

```bash
git show e252aa20~1:web/src/lib/ai/providers/anthropic-adapter.ts > /tmp/pre-ob200-adapter.ts
```

From the pre-OB-200 file, find the same plan interpretation prompt section. Paste the complete prompt template that was replaced.

### Step 4 — Diff

Compare the two prompts. Identify:
1. What instructions exist in the pre-OB-200 prompt that are ABSENT from the post-OB-200 prompt.
2. What output format instructions (JSON schema for components, variant structure, calculationIntent shape) were in the old prompt.
3. Whether the `<<PRIME_GRAMMAR>>` placeholder replacement preserved the surrounding context (the instructions before and after the grammar block).

### Step 5 — Fix

Restore any missing instructions. The grammar section REPLACES the composition examples and prime definitions ONLY. It does NOT replace:
- Instructions telling the LLM to analyze the plan document
- Instructions telling the LLM to produce components with specific fields
- The JSON output format schema
- The variant extraction logic
- The plan name extraction

If these were part of the replaced block, they must be restored alongside the grammar section.

After fixing, verify by reading the complete prompt again and confirming it contains: (1) plan analysis instructions, (2) output format schema, (3) grammar section from `generatePromptGrammarSection()`, (4) variant/component extraction instructions.

### Step 6 — Test

Wipe BCL bindings:
```sql
-- Architect will run via SQL Editor:
-- UPDATE rule_sets SET input_bindings = '{}' WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' AND status = 'active';
```

The architect will reimport the BCL plan through the browser. The log should show `Batched plan saved: ... N components` where N > 0.

Report verbatim: the `[SCI plan-interp] Batched plan saved` line showing the component count.

---

## §3 Commit and Report

```bash
git add -A && git commit -m "DIAG-055/HF-245: restore plan interpretation prompt instructions lost in OB-200 grammar replacement" && git push origin dev
```

Completion report: `docs/completion-reports/DIAG-055_HF-245_COMPLETION_REPORT.md`

Required evidence:
- Full pre-OB-200 prompt (relevant section)
- Full post-OB-200 prompt (relevant section)
- Diff showing what was lost
- Full restored prompt (relevant section)
- Build verification

---

## BUILD AND DEPLOY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — zero errors
4. `npm run dev` — `localhost:3000` responds
5. Git from repo root (`spm-platform`) NOT `web/`
6. `gh pr create --base main --head dev` with title: "DIAG-055/HF-245: Restore plan interpretation instructions lost in OB-200 prompt replacement"
