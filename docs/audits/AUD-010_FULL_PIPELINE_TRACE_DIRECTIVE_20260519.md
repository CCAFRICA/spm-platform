# AUD-010 — Full Pipeline Trace: Convergence → Intent → Execution

**Date:** 2026-05-19
**Type:** Read-only code audit against production HEAD (post-HF-236 PR #416 merge)
**Locus:** CCAFRICA/spm-platform, branch main
**Purpose:** Trace the complete calculation pipeline as it exists NOW. No assumptions from prior sessions, prior audits, or prior OBs. Every stage read from live code. The audit determines what the pipeline actually does today — not what it was designed to do in March.

---

## §0 — Standing Rules

`CC_STANDING_ARCHITECTURE_RULES.md` binds. Rule 27 (evidence = paste). This is a read-only audit — no code modifications, no PRs. Output is a single trace document at `docs/audits/AUD-010_FULL_PIPELINE_TRACE_<SHA>.md` where `<SHA>` is the short HEAD commit hash at audit time.

---

## §1 — Phase 0: Establish HEAD

```bash
cd ~/spm-platform
git fetch origin && git checkout main && git pull origin main
git log --oneline -5
git rev-parse --short HEAD
```

Paste all. The short SHA becomes the document suffix.

---

## §2 — Stage 1: Convergence Pipeline

Read the full convergence service. This is where metrics get bound to columns and derivation rules (including filters) get produced.

```bash
wc -l web/src/lib/intelligence/convergence-service.ts
```

Read the file in sections. For each section, paste the relevant code. Report:

**1A. Entry point.** What function does the calc route call to run convergence? What arguments does it receive? Paste the function signature and the call site in the calc route.

**1B. Pass sequence.** How many passes exist? For each pass:
- Function name and line range
- What it attempts to resolve
- What it produces (column mappings? derivation rules? filters?)
- Under what condition it fires (always? only for unresolved metrics?)

**1C. Filter production.** Which pass produces `filters` on derivation rules? Paste the code that constructs the filter object. Does the filter come from AI output or from hardcoded logic?

**1D. Role binding.** How do roles (actual, numerator, denominator, period, entity_identifier) get bound? Is there role-specific logic or is it uniform? Paste the binding code.

**1E. Output shape.** What does convergence return? Paste the return statement and the TypeScript type (if any). What exactly gets written to `input_bindings` on the rule_set?

**1F. The spurious `actual` binding.** Find the code path that produces `actual → unit_price` for CRP Plan 2. The convergence log shows `HF-222 Consumables Commission:actual → unit_price (distribution-distinct, top=0.1000)`. Find the HF-222 distribution-distinct fallback code. Paste it. What triggers it? When does it fire vs not fire?

---

## §3 — Stage 2: Intent Transformation

This is where convergence output becomes calculation intents the executor can dispatch.

```bash
wc -l web/src/lib/calculation/intent-transformer.ts
wc -l web/src/lib/compensation/ai-plan-interpreter.ts
```

Read both files. Report:

**2A. transformFromMetadata.** Paste the function signature and the top-level dispatch logic. How does it decide what primitive to produce (LinearFunctionOp, PiecewiseLinearOp, ConditionalGateOp, etc.)?

**2B. PiecewiseLinearOp shape.** Paste the complete code path that produces a PiecewiseLinearOp intent. What fields does it set? Does it carry `targetValue`? Does it carry `ratioInput` with numerator/denominator? Does it carry `baseInput`? Show the actual TypeScript type for PiecewiseLinearOp.

**2C. ConditionalGateOp shape.** Same: paste the code path that produces a ConditionalGateOp. Does it reference cross-plan data? How?

**2D. ScopeAggregateOp.** Does this type exist in the current codebase? Search:
```bash
grep -rn "scope_aggregate\|ScopeAggregate\|scopeAggregate" web/src/lib/calculation/ web/src/lib/compensation/
```
Paste results. If it exists, paste the production path. If it doesn't exist, say so.

**2E. convertComponent.** Paste the function. This is the bridge between AI plan interpretation output and executor input. What primitives does it handle? Does it handle piecewise_linear with ratio/numerator/denominator?

---

## §4 — Stage 3: Data Resolution at Calculation Time

This is where entity data gets assembled for the executor.

Read `web/src/app/api/calculate/run/route.ts`. Report:

**3A. The convergence_bindings vs sheet-matching fork.** Find the `usedConvergenceBindings` flag. Paste the code that sets it and the code that branches on it. What path does CRP follow?

**3B. buildMetricsForEntity (convergence path).** Find the function that assembles entity metrics from convergence_bindings. Paste it. How does it apply metric_derivation rules? How does it apply filters (rowMatchesFilters)? How does it aggregate?

**3C. Scope aggregate resolution.** Is there code that computes district-level or region-level aggregates from sibling entity data? Search:
```bash
grep -rn "scope.*aggregate\|district.*sum\|region.*sum\|cross.*entity.*aggregate\|scopeAgg" web/src/app/api/calculate/ web/src/lib/calculation/
```
Paste results. If OB-186's Phase 4 scope aggregate capability exists, paste the function. If it's been removed or refactored, say so.

**3D. Cross-plan metric resolution.** OB-186 Phase 4 added: "when current plan has 0 derivations, searches other tenant plans' input_bindings." Search:
```bash
grep -rn "cross.*plan\|other.*plan.*binding\|OB-186\|crossPlan" web/src/app/api/calculate/ web/src/lib/calculation/ web/src/lib/intelligence/
```
Paste results. Does this capability exist in current code? Where does it fire?

---

## §5 — Stage 4: Primitive Execution

Read `web/src/lib/calculation/intent-executor.ts`. Report:

**4A. Dispatch table.** How does the executor select which primitive to evaluate? Paste the switch/if chain or dispatch map. What primitives are handled?

**4B. resolveSource / resolveValue.** Paste these functions. How does each source type dispatch? Is `"ratio"` a handled source type? (HF-187 was supposed to add this.) What about `"aggregate"`, `"scope_aggregate"`, `"cross_data"`?

**4C. PiecewiseLinear evaluation.** Paste the complete piecewise_linear evaluation code path. Specifically:
- How does it compute the evaluation value (attainment)?
- Does it use `ratioInput`? Does it use `targetValue`? Does it use the `actual` role?
- How does it select the segment (tier)?
- How does it compute the final commission?
- Where is the `boundaryFallback` flag set?

**4D. ConditionalGate evaluation.** Paste the complete conditional_gate evaluation code path. How does it evaluate the gate condition? How does it read cross-plan data (equipment deals from Plan 1 for Plan 3's gate)?

**4E. LinearFunction evaluation.** Paste the linear_function evaluation code path (y = mx + b). This is Plan 1 — it reconciles, so this is the known-good reference primitive.

---

## §6 — Stage 5: CRP-Specific Trace

Using the code paths identified in Stages 1-4, trace what ACTUALLY happens for CRP Plan 2 (Consumables, piecewise_linear) and CRP Plan 4 (District Override, scope_aggregate).

**5A. Plan 2 trace.** Given the convergence output `numerator=total_amount, denominator=monthly_quota, actual=unit_price` and the derivation `consumable_revenue → sum(total_amount) filters=[product_category=Consumables]`, trace through:
- Intent transformation: what PiecewiseLinearOp shape gets produced?
- Data resolution: what metrics does the entity get?
- Primitive execution: what value does the executor use for attainment? Does it use numerator/denominator, or actual, or targetValue?
- Where does the $3,244.03 January delta come from?

**5B. Plan 4 trace.** Given that convergence produced 0 derivations and OB-186's cross-plan resolution found 5 derivations from other plans, trace through:
- What do those 5 cross-plan derivations look like?
- How does the executor evaluate the District Manager Override component?
- Why does every entity produce $0?
- Is there code that aggregates across entities within a district scope?

---

## §7 — Output

Single document: `docs/audits/AUD-010_FULL_PIPELINE_TRACE_<SHA>.md`

Structure:
- Stage 1 findings (convergence) with pasted code for each sub-question
- Stage 2 findings (intent transformation) with pasted code
- Stage 3 findings (data resolution) with pasted code
- Stage 4 findings (primitive execution) with pasted code
- Stage 5 findings (CRP-specific traces)
- Summary: for each CRP plan, the complete data flow from convergence to result, identifying where the calculation diverges from reference

Commit the trace document:
```bash
git add docs/audits/AUD-010_FULL_PIPELINE_TRACE_<SHA>.md
git commit -m "AUD-010: Full pipeline trace (convergence → intent → execution) at <SHA>"
git push origin main
```

Report back with commit hash and the full document content pasted verbatim.
