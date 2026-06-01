# HF-243 — DAG Scale Inference + Variant Binding Coverage

**Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.**

---

## PROBLEM STATEMENT

DIAG-054 identified two failures blocking BCL reconciliation ($16,430 vs $44,590 reference for October):

**Failure 1 — Scale mismatch (c0 = $0, c1 = $0).** Data stores attainment as ratio (1.1354 = 113.54%). DAG compare nodes carry percentage constants (120 = 120%). `compare(gte, 1.1354, 120) → 0`. Every tier check fails. Root cause: HF-242's `extractInputRequirements` prime_dag case sets `expectedRange: null`. The existing scale-factor inference in `scoreColumnForRequirement` — which detects ratio-vs-percentage mismatch and applies scale_factor — is disabled because it has no `expectedRange` to compare against.

**Failure 2 — Variant binding gap (components 4-7 = $0 for all Executive entities).** Convergence produced bindings for components 0-3 (Senior Executive variant) but zero bindings for components 4-7 (Executive variant). Executive entities are routed to components 4-7 by variant dispatch, find no bindings, get no metrics, produce $0 for c0/c1 and only flat c3 payouts.

Both failures block BCL reconciliation. Both fixed in this HF.

---

## FIX 1 — Scale inference for prime_dag

### Root cause (precise)

The existing scale inference works for legacy components because `extractInputRequirements` returns `expectedRange: { min, max }` from the stored `boundaries` array. `scoreColumnForRequirement` tries the column's value distribution against the expected range at ×1 and ×100 scales, picks the better match.

For prime_dag components, the boundary values are embedded as constants inside compare nodes. HF-242 set `expectedRange: null` because there's no `boundaries` array to read. The inference function receives null → skips scale detection → scale_factor defaults to 1 → ratio-scale data compared against percentage-scale constants → 0.

### Fix

In `extractInputRequirements` (convergence-service.ts), after the prime_dag case extracts reference fields via `extractReferencesFromDAG`, also extract compare constants for each reference field.

Add a function `extractExpectedRangeFromDAG(node: unknown, fieldName: string): { min: number; max: number } | null`:

Walk the DAG tree. For every `compare` node whose inputs include a `reference` to `fieldName` and a `constant`, collect the constant value. After walking, if any constants were found, return `{ min: Math.min(...constants), max: Math.max(...constants) }`. This is the range of values the DAG expects the field to carry.

For BCL c0: `cumplimiento_colocacion` appears in compare nodes against constants 120 and 120. Expected range = { min: 120, max: 120 }. The column `Cumplimiento_Colocacion` has values 0.8-1.7 (ratio scale). `scoreColumnForRequirement` tries ×100 → 80-170, which overlaps [120, 120]. Scale_factor = 100. At calc time, raw 1.1354 × 100 = 113.54, compared against 120 → correct evaluation.

For BCL c1: `cumplimiento_depositos` against constants 60, 80, 100, 130. Expected range = { min: 60, max: 130 }. Column `Pct_Meta_Depositos` has values 0.5-1.5. ×100 → 50-150, overlaps [60, 130]. Scale_factor = 100.

Update the prime_dag case in `extractInputRequirements`:

```typescript
if (isPrimeDag) {
  const refs = extractReferencesFromDAG(intent);
  if (refs.length === 0) {
    return [{ role: 'actual', metricField: 'unknown', expectedRange: null }];
  }
  return refs.map(field => ({
    role: field,
    metricField: field,
    expectedRange: extractExpectedRangeFromDAG(intent, field),
  }));
}
```

No new code path. No new registry. The same `scoreColumnForRequirement` function that runs for legacy components runs for prime_dag — it just receives a non-null `expectedRange` now.

### Verification gate

After this fix, convergence bindings for c0 should show `scale_factor=100` on `cumplimiento_colocacion` and `calidad_cartera`. c1 should show `scale_factor=100` on `cumplimiento_depositos`.

---

## FIX 2 — Variant binding coverage

### Root cause (precise)

Convergence's `generateAllComponentBindings` iterates over `matches` (component-to-data-capability matches). The matching is driven by `components` from the rule_set. BCL has 8 components (4 per variant). But components 4-7 (Executive variant) are structurally identical to 0-3 (Senior Executive variant) — same reference fields, same column needs. Convergence bound 0-3 and stopped.

Read the code to determine WHY 4-7 weren't bound. Possible causes:

**A.** The `matches` array only contains 4 entries because the matching loop de-duplicates by component name or reference field set.

**B.** The column exclusion logic (`boundColumns` set) prevents binding the same column to multiple components. After c0 binds `Cumplimiento_Colocacion`, c4 (which needs the same column) can't bind it because it's already in `boundColumns`.

**C.** The component-to-capability matching only matches components from the first variant.

### Fix

Read the `generateAllComponentBindings` code at HEAD. Identify which of A/B/C applies.

If **B** (column exclusion): the `boundColumns` exclusion makes sense for DIFFERENT components needing DIFFERENT columns (prevents the same column being bound to two different metric roles). It does NOT make sense for VARIANT duplicates that need the SAME column for the SAME metric. The fix: scope `boundColumns` per component, not globally across all components. Each component gets its own binding set. Two components reading the same column is correct when they represent the same calculation for different entity populations.

If **A** or **C**: fix the matching/iteration to include all components, not just the first variant's.

### Verification gate

After this fix, convergence bindings should show entries for components 0-7 (not just 0-3). Components 4-7 should have the same column bindings as 0-3 (same data, different variant routing).

---

## VERIFICATION

After both fixes:

1. Wipe BCL's stored bindings:
```sql
UPDATE rule_sets SET input_bindings = '{}' WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
```

2. Trigger BCL October calculation through the browser.

3. Check convergence log for:
   - `scale_factor=100` on cumplimiento_colocacion, calidad_cartera, cumplimiento_depositos bindings
   - Bindings for components 0-7 (not just 0-3)
   - Non-zero c0 and c1 values

4. Report per-component totals and grand total for October.

5. Calculate all 6 periods. Report per-period grand totals.

Do NOT interpret the results. Report the numbers.

---

## COMPLETION REPORT

Save to `docs/completion-reports/HF-243_COMPLETION_REPORT.md` and commit.

Must include:
1. `extractExpectedRangeFromDAG` function as implemented
2. Updated `extractInputRequirements` prime_dag case
3. Variant binding fix with before/after evidence
4. Convergence log showing scale_factor applied + all 8 components bound
5. BCL October per-component totals and grand total
6. All 6 periods grand totals
7. Build verification

---

## BUILD AND DEPLOY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — zero errors
4. `npm run dev` — `localhost:3000` responds
5. Git from repo root (`spm-platform`)
6. Branch: `hf-243-scale-inference-variant-binding` off `main`
7. `gh pr create --base main --head hf-243-scale-inference-variant-binding` with title: "HF-243: DAG scale inference + variant binding coverage — close BCL c0/c1 zero-payout and variant gap"
8. PR body: "Extracts compare constants from PrimeNode DAG trees to feed existing scale-factor inference. Fixes variant binding exclusion so all variant components get column bindings. Same inference pathway as legacy components — no new code path."
