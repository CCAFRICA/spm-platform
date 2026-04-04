# AUD-002: PROMPT DISAMBIGUATION ANALYSIS
## Generated: 2026-03-22
## Source: AUD-001 Code Extraction — anthropic-adapter.ts plan_interpretation prompt
## Trigger: Plan 2 (Consumables) interpreted as conditional_gate instead of piecewise_linear on second import

---

## WHY AUD-001 MISSED THIS

AUD-001 was a **code integrity audit** with 10 dimensions: Korean Test, domain-agnostic, tenant isolation, error handling, etc. It verified the prompt *contained* all 10 type descriptions and confirmed executor functions existed for each.

What AUD-001 did NOT do: evaluate the **semantic quality of the prompt as a specification that an AI agent must interpret unambiguously.** It treated the prompt as code ("is the vocabulary present?") rather than as architecture ("could the AI reasonably produce the wrong type given these instructions?").

This is the audit gap. The AI prompt IS architecture — this session's central lesson — and AUD-001 didn't fully internalize it. A new audit dimension is required: **Prompt Disambiguation Analysis.**

---

## METHODOLOGY

For every type pair in the prompt's 10-type vocabulary, ask:

1. **Description overlap:** Could a real plan document match both descriptions?
2. **Example overlap:** Do the examples have structural similarities that could confuse the AI?
3. **Mapping rule conflict:** Does the calculationIntent mapping for one type produce a structure that looks like another type?
4. **Disambiguation present:** Does the prompt contain an explicit rule that tells the AI when NOT to use this type?

---

## THE 10 TYPES IN THE PROMPT

| # | Type (calculationMethod) | calculationIntent operation | Core concept |
|---|-------------------------|---------------------------|--------------|
| 1 | matrix_lookup | bounded_lookup_2d | 2D grid: two inputs → output |
| 2 | tiered_lookup | bounded_lookup_1d | 1D threshold table: one input → output |
| 3 | flat_percentage | scalar_multiply | rate × base, no conditions |
| 4 | percentage | scalar_multiply | (legacy alias of flat_percentage) |
| 5 | conditional_percentage | nested conditional_gate | conditions select which rate to apply |
| 6 | linear_function | linear_function | y = slope × x + intercept |
| 7 | piecewise_linear | piecewise_linear | rate curve: attainment ratio selects rate, applied to base |
| 8 | scope_aggregate | scope_aggregate | manager % of team aggregate |
| 9 | scalar_multiply | scalar_multiply | rate × base (same as flat_percentage intent) |
| 10 | conditional_gate | conditional_gate | binary prerequisite: meet condition or no payout |

---

## OVERLAP ANALYSIS — ALL CRITICAL PAIRS

### PAIR 1: piecewise_linear vs conditional_percentage → CRITICAL OVERLAP ⚠️

**This is the pair that caused the Plan 2 failure.**

| Dimension | piecewise_linear | conditional_percentage |
|-----------|-----------------|----------------------|
| Description | "rate INCREASES as attainment exceeds quota thresholds" | "different rates based on conditions" |
| Example | segments: [{min:0, max:1.0, rate:0.03}, {min:1.0, max:1.2, rate:0.05}, {min:1.2, max:null, rate:0.08}] | conditions: [{threshold:100, operator:"<", rate:0.03}, {threshold:100, operator:">=", rate:0.05}] |
| Intent mapping | `piecewise_linear` with ratioInput, baseInput, segments | `nested conditional_gate chain` (check conditions in order, scalar_multiply with rate on match) |
| Input type | RATIO (actual / quota) — requires two metrics | DIRECT metric — single threshold check |
| Structural differentiator | Has a **denominator** (quota). Rate applies to a **different base** than the ratio input. | No denominator. Condition checks a single value. Rate applies to the **same metric** or a related one. |

**Why the AI confuses them:** A plan that says "3% below quota, 5% at quota, 8% above 120%" can be read either way:
- As a piecewise curve over attainment ratio (correct for Plan 2)
- As a chain of conditions: "if attainment >= 120%, use 8%; else if >= 100%, use 5%; else 3%" (how the AI read it on the second import)

**What the prompt is missing:** A disambiguation rule that says: *"When rates change based on quota attainment (a ratio of actual performance / target), ALWAYS use `piecewise_linear`. Use `conditional_percentage` only when conditions check a direct metric value (not a ratio against a target)."*

**Impact of incorrect choice:** The calculationIntent mapping rule for `conditional_percentage` produces `nested conditional_gate chain`. The executor for `conditional_gate` evaluates a single condition and branches — it does NOT have the segments/boundaries/rate structure that `piecewise_linear` executor expects. The engine will compute the wrong result.

---

### PAIR 2: tiered_lookup vs piecewise_linear → MODERATE OVERLAP ⚠️

| Dimension | tiered_lookup | piecewise_linear |
|-----------|--------------|-----------------|
| Description | (legacy — attainment tiers with fixed payout amounts) | "rate INCREASES as attainment exceeds quota thresholds" |
| Intent mapping | bounded_lookup_1d → boundaries + fixed outputs | piecewise_linear → ratioInput + baseInput + segments with rates |
| Key difference | **Fixed payout values** at each tier ($0, $150, $300, $500) | **Rates** at each tier (3%, 5%, 8%) applied to a base amount |

**Overlap risk:** A plan with "at 100% attainment, earn $500; at 110%, earn $800" — is this a tiered lookup with fixed payouts, or a piecewise function where the "rate" produces those dollar amounts? The AI could go either way.

**What the prompt is missing:** *"Use `tiered_lookup` when tiers produce FIXED DOLLAR AMOUNTS. Use `piecewise_linear` when tiers produce RATES (percentages) that multiply a revenue base."*

---

### PAIR 3: flat_percentage vs scalar_multiply → REDUNDANCY (not ambiguity)

| Dimension | flat_percentage | scalar_multiply |
|-----------|----------------|-----------------|
| Description | "simple rate applied to a base" | "simple rate × base amount, no tiers or conditions" |
| Intent mapping | Both → scalar_multiply | Same |

**Issue:** These are the same thing. The prompt has two names for one operation. This isn't an ambiguity (the AI won't produce a wrong result) but it's a redundancy that adds prompt tokens and could confuse the AI about whether to pick `flat_percentage` or `scalar_multiply` as the type string.

**Recommendation:** Deprecate `flat_percentage` as a legacy alias. Document it as such in the prompt: *"`flat_percentage` is a legacy alias for `scalar_multiply`. Always prefer `scalar_multiply`."*

---

### PAIR 4: conditional_gate vs conditional_percentage → MODERATE OVERLAP ⚠️

| Dimension | conditional_gate | conditional_percentage |
|-----------|-----------------|----------------------|
| Description | "eligibility gate that depends on meeting a prerequisite" | "different rates based on conditions" |
| Intent mapping | conditional_gate with onTrue/onFalse | nested conditional_gate chain |
| Key difference | BINARY — one condition, qualify or don't | MULTI-RATE — multiple conditions select different rates |

**Overlap risk:** The intent mapping for `conditional_percentage` produces `nested conditional_gate`. So at the calculationIntent level, they look structurally identical. The AI might use `conditional_gate` type with a nested chain for what should be `conditional_percentage`, or vice versa.

**Impact:** If the AI returns type=`conditional_gate` but the calculationIntent is a nested chain with rates, the priority inversion (HF-160) will use the intent, which IS a conditional_gate operation. So the executor will handle it. But the semantics may be wrong if the nesting depth doesn't match.

**What the prompt is missing:** *"Use `conditional_gate` for a single binary prerequisite (one condition, one gate). Use `conditional_percentage` when multiple thresholds select different rates (a rate table expressed as conditions)."*

---

### PAIR 5: linear_function vs scalar_multiply → LOW OVERLAP

| Dimension | linear_function | scalar_multiply |
|-----------|----------------|-----------------|
| Description | "y = slope × input + intercept" | "rate × base amount" |
| Key difference | Has an **intercept** (constant added) | No intercept |

**Overlap risk:** Low. If the plan has a base draw + commission rate, the AI should use `linear_function`. If there's no base draw, `scalar_multiply`. The intercept is the differentiator.

**Edge case:** A plan that says "4% commission" (no base draw) — the AI could return `linear_function` with intercept=0, which is mathematically equivalent to `scalar_multiply` with rate=0.04. Not harmful to the calculation, but adds unnecessary complexity.

**Recommendation:** Add to prompt: *"If there is no base draw or fixed amount added, use `scalar_multiply`, not `linear_function` with intercept=0."*

---

### PAIR 6: scope_aggregate vs everything else → NO OVERLAP ✅

`scope_aggregate` is structurally unique — it requires a scope level (district, region) and aggregates across a team. No other type describes management overrides on team totals. No disambiguation needed.

---

### PAIR 7: matrix_lookup vs tiered_lookup → LOW OVERLAP

| Dimension | matrix_lookup | tiered_lookup |
|-----------|--------------|--------------|
| Key difference | TWO input dimensions (2D grid) | ONE input dimension (1D table) |

**Overlap risk:** Low. If the plan has a matrix (attainment × volume → payout), it's clearly 2D. If it's a single column of tiers, it's 1D. The structural difference is strong.

**Edge case:** A plan with a matrix where one dimension has only 1 band — effectively a 1D lookup. The AI might use matrix_lookup with a degenerate second dimension. Not harmful, just suboptimal.

---

## SUMMARY OF OVERLAPS

| Pair | Overlap Risk | Impact | Disambiguation Needed |
|------|-------------|--------|----------------------|
| piecewise_linear ↔ conditional_percentage | **CRITICAL** | Wrong calculation result | YES — ratio vs direct metric |
| tiered_lookup ↔ piecewise_linear | **MODERATE** | Wrong calculation result | YES — fixed amounts vs rates |
| conditional_gate ↔ conditional_percentage | **MODERATE** | Possibly correct via intent | YES — binary vs multi-rate |
| flat_percentage ↔ scalar_multiply | Redundancy | No impact on calculation | Deprecate one |
| linear_function ↔ scalar_multiply | Low | No impact (intercept=0 is valid) | Minor clarification |
| matrix_lookup ↔ tiered_lookup | Low | Degenerate case only | Not needed |
| scope_aggregate ↔ all others | None | N/A | Not needed |

---

## PROPOSED DISAMBIGUATION RULES

Add these to the plan_interpretation system prompt, immediately after the type descriptions and before the NUMERIC PARSING RULES section:

```
TYPE SELECTION RULES (MANDATORY — resolve ambiguity between similar types):

RULE 1: QUOTA ATTAINMENT RATE CURVES → ALWAYS piecewise_linear
When a plan describes rates (percentages) that change based on quota attainment 
(actual performance divided by a target/quota), ALWAYS use "piecewise_linear".
NEVER use "conditional_percentage" or nested "conditional_gate" for quota-attainment 
rate curves. The structural signal is: there is a DENOMINATOR (quota/target) that 
creates a RATIO, and the rate applies to a BASE AMOUNT (usually revenue).
Examples that MUST be piecewise_linear:
- "3% if below quota, 5% if at/above quota, 8% if above 120% of quota"
- "Commission rate increases with quota attainment"
- Any structure with a quota/target that creates attainment tiers

RULE 2: FIXED DOLLAR PAYOUTS → tiered_lookup, RATE PERCENTAGES → piecewise_linear
When tiers produce FIXED DOLLAR AMOUNTS ($0, $150, $300), use "tiered_lookup".
When tiers produce RATES (3%, 5%, 8%) applied to a revenue base, use "piecewise_linear".

RULE 3: BINARY PREREQUISITE → conditional_gate, RATE SELECTION → conditional_percentage
Use "conditional_gate" when there is ONE condition that gates ALL payout (must qualify).
Use "conditional_percentage" when MULTIPLE conditions select DIFFERENT RATES on the 
same metric. If you are building a nested chain of conditions to select a rate, 
ask: is this really a piecewise_linear? (See Rule 1.)

RULE 4: NO INTERCEPT → scalar_multiply, HAS INTERCEPT → linear_function
If the plan has a fixed base draw plus a commission rate, use "linear_function".
If there is only a commission rate with no base draw, use "scalar_multiply".
Do NOT use "linear_function" with intercept=0 — use "scalar_multiply" instead.

RULE 5: flat_percentage is a LEGACY ALIAS for scalar_multiply
Always prefer "scalar_multiply". If you would have used "flat_percentage", 
use "scalar_multiply" instead.
```

---

## OTHER ISSUES A BETTER AUDIT WOULD UNCOVER

### Issue 1: calculationMethod / calculationIntent Mapping Contradictions

The mapping rules say: `conditional_percentage → nested conditional_gate chain`

But Rule 1 above says quota-attainment rate curves should be `piecewise_linear`, not conditional chains. This means the mapping rules themselves could mislead the AI. If the AI correctly identifies the type as `conditional_percentage` but follows the mapping rule, it produces `conditional_gate` intent — which is what happened.

**Fix:** The mapping rules should include: `piecewise_linear → piecewise_linear (NOT conditional_gate chain, even if the plan language uses conditional phrasing)`

### Issue 2: No calculationIntent Example for piecewise_linear

The prompt has calculationIntent examples for:
- tiered_lookup → bounded_lookup_1d ✅
- matrix_lookup → bounded_lookup_2d ✅
- flat_percentage → scalar_multiply ✅
- conditional_percentage → conditional_gate chain ✅

But there is NO calculationIntent example for:
- piecewise_linear ❌
- linear_function ❌
- scope_aggregate ❌
- conditional_gate (standalone) ❌

The AI has detailed intent examples for 4 types but must infer the intent structure for the other 6. This explains why the earlier import produced `bounded_lookup_1d` as the intent operation (closest example available) and the second import produced `conditional_gate` (another available example pattern).

**Fix:** Add explicit calculationIntent examples for ALL 10 types, not just 4.

### Issue 3: Temperature / Sampling Not Controlled

The Anthropic adapter does not set `temperature: 0` for plan interpretation calls. Claude's default temperature allows non-deterministic sampling, which means the same input can produce different outputs. For classification tasks where we need deterministic type selection, this is a reliability gap.

**Fix:** Set `temperature: 0` for plan_interpretation and any other classification task where determinism matters. Note: this reduces variability but doesn't eliminate it (quantization noise). The disambiguation rules are the primary fix; temperature control is defense-in-depth.

### Issue 4: No Prompt Regression Test

When the prompt is modified (HF-160, and now this fix), there is no automated way to verify that existing plans (BCL, Meridian) still interpret correctly. Proposed Standing Rule 43 addresses this but isn't implemented.

**Fix:** Create a prompt test harness — a set of known plan documents with expected type outputs. Run after every prompt change. This is strategic backlog item S-NEW-3 from the handoff.

### Issue 5: COMMON SPANISH TERMS Section is a Korean Test Violation

The prompt includes a section mapping Spanish terms to English equivalents. This is language-specific guidance that biases the AI toward Spanish/English plans. A Korean or Japanese plan would get no such assistance.

**Fix:** Remove the COMMON SPANISH TERMS section. The AI (Claude) already understands multiple languages without explicit term mappings. If domain-specific vocabulary is needed, it should come from the Domain agent's tenant context, not hardcoded in the foundational prompt.

---

## RECOMMENDED ACTION

Draft HF-162 to implement:
1. The 5 disambiguation rules above
2. calculationIntent examples for ALL 10 types (not just 4)
3. Remove COMMON SPANISH TERMS section (Korean Test violation)
4. Set temperature: 0 for plan_interpretation calls
5. Add piecewise_linear → piecewise_linear mapping rule explicitly

Do NOT include prompt regression testing in HF-162 — that's a separate infrastructure capability (S-NEW-3).

After HF-162, clean-slate CRP and reimport Plan 2. The AI should deterministically produce piecewise_linear.

---

*"The audit gap was treating the prompt as code (is the vocabulary present?) instead of as architecture (can the AI produce the wrong answer?). The AI prompt IS architecture — and architecture must be unambiguous."*
