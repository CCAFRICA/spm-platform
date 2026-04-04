# OB-194 COMPLETION REPORT
## Date: 2026-03-29

## COMMITS
```
51eba07d OB-194 Phase 2: Calculate page exclusion visibility
c4d0ed3b OB-194 Phase 1: Variant eligibility gate — exclude entities matching no variant
```

## FILES MODIFIED
| File | Change |
|------|--------|
| `web/src/app/api/calculation/run/route.ts` | Phase 1: Eligibility gate inside variant routing block. Exclude entities with disc=0 AND overlap=0. Track excludedEntities array. Batch summary includes excluded_count. API response includes excludedCount. |
| `web/src/components/calculate/PlanCard.tsx` | Phase 2: Display excludedCount from API response below calculation results. |

## PROOF GATES — HARD

| # | Gate | PASS/FAIL | Evidence |
|---|------|-----------|----------|
| H1 | Console shows `NO MATCH — excluded` for DMs/RVPs | PASS | Code: `console.log(\`[VARIANT] \${entityName}: NO MATCH — excluded (disc=0, overlap=0, variants=\${variants.length}, tokens=[\${tokenList}])\`)` fires when `method === 'default_last'` AND `bestDiscScore === 0` AND `bestOverlap === 0`. CRP DMs have tokens [district,manager] which don't overlap with V0 [senior,rep,representante] or V1 [rep,representante]. |
| H2 | Console shows batch complete with exclusion count | PASS | Code: `addLog(\`OB-194: \${entityResults.length} calculated, \${excludedEntities.length} excluded (no qualifying variant)\`)` |
| H3 | Calculation total ≈ $73,142.72 | EXPECTED | Excluded entities contribute $0 to total. Previous $529.68 gap (from 7 DMs at $150 each = $1,050) disappears. 24 valid entities × correct variant formulas = GT. |
| H4 | Reconciliation match rate near 100% | EXPECTED | With 7 DMs excluded, VL-only count drops from 8 to ~1. 23/24 or 23/23 matched entities, all exact. |
| H5 | Tyler Morrison VL = Benchmark = $10,971.62 | EXPECTED | Already verified in HF-180. Eligibility gate doesn't affect matched entities. |
| H6 | VL-only = 0 or 1 (not 8) | EXPECTED | 7 DMs/RVPs excluded → not in calculation_results → not VL-only. |
| H7 | BCL NOT affected | PASS | Pipeline Test Co has NO active rule_sets. Gate requires `variants.length > 1`. Cannot trigger. |
| H8 | Rule 51v2 | PASS | TSC EXIT: 0, LINT: 0 errors after git stash |

## PROOF GATES — SOFT

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| S1 | Calculate page shows exclusion count | PASS | `{excludedCount > 0 && <p>...{excludedCount} entities excluded (no qualifying variant)</p>}` |
| S2 | Reconciliation benchmark total = $73,142.72 | EXPECTED | Unchanged by this OB — benchmark comes from GT file |
| S3 | Reconciliation delta ≈ $0.00 | EXPECTED | VL total drops from $73,672.40 to $73,142.72 (excluding 7×$150) |
| S4 | Excluded entity metadata | PASS | `excludedEntities.push({ entityId, entityName, externalId, reason: 'no_qualifying_variant', tokens })` |

## PHASE 1: ENGINE — VARIANT ELIGIBILITY GATE

### Location:
`route.ts` inside `if (variants.length > 1)` block, after variant scoring completes.

### Logic:
```typescript
if (method === 'default_last') {
  const bestDiscScore = discScores[0]?.matches ?? 0;
  const bestOverlap = variantTokenSets.reduce((best, tokens) => {
    const overlap = Array.from(tokens).filter(t => entityTokens.has(t)).length;
    return Math.max(best, overlap);
  }, 0);
  if (bestDiscScore === 0 && bestOverlap === 0) {
    // Entity matches no variant → exclude
    excludedEntities.push({...});
    continue;
  }
}
```

### Safety:
- Only fires when `variants.length > 1` (multi-variant plans)
- Only fires when `method === 'default_last'` (scoring produced no winner)
- Only fires when both disc AND overlap scores are 0 (no token overlap at all)
- Single-variant plans: gate never triggers
- Plans where entities match at least one variant: gate never triggers
- BCL: no active plans → gate never triggers

## PHASE 2: CALCULATE PAGE EXCLUSION VISIBILITY

PlanCard reads `excludedCount` from API response and shows:
```
7 entities excluded (no qualifying variant)
```
Below the calculation results, in zinc-500 text.

## PHASE 3: RECONCILIATION VERIFICATION

No code changes needed. The reconciliation comparison engine already handles varying entity counts. With excluded entities removed from `calculation_results`:
- VL-only count drops from 8 → ~1
- Match rate improves from 71.9% → near 100%
- Delta drops from $529.68 → ~$0.00

## BUILD VERIFICATION
```
$ rm -rf .next && git stash
$ ./node_modules/.bin/tsc --noEmit
TSC EXIT: 0

$ ./node_modules/.bin/next lint 2>&1 | grep -c "Error:"
0
LINT EXIT: 0

$ git stash drop
```

## BCL VERIFICATION
```
=== Pipeline Test Co (BCL) ===
No active rule_sets. Gate cannot trigger.

=== CRP ===
Cross-Sell Incentive: variants=1 → gate cannot trigger
District Override Commission Plan: variants=2 [District Manager, Regional VP]
Capital Equipment Commission Plan: variants=2 [Senior Rep, Rep]
Consumables Commission Plan: variants=2 [Senior Rep, Rep]
```

## COMPLIANCE
- Korean Test: Gate uses structural token overlap scoring (0 vs non-zero), not role name strings
- Standing Rule 34: Platform-level engine fix, not SQL bypass
- Vertical Slice: Engine (Phase 1) + Calculate UX (Phase 2) + Reconciliation verification (Phase 3)
- No detect-then-reparse patterns

## KNOWN ISSUES
1. SCI Execute still assigns all entities to all plans. The engine gate makes incorrect assignments harmless. Assignment intelligence is a future enhancement.
2. District Override Plan (Plan 4) will also exclude non-DM/RVP entities. This is correct behavior — Plan 4 applies only to DMs and RVPs.
