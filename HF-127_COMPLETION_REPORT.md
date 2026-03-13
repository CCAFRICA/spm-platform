# HF-127 Completion Report — Calculate Button Fix

## Phase 0: Diagnostic

- **Button gate condition**: `disabled={isCalculating || !periodId || !isReady}` where `isReady = entityCount > 0 && hasBindings && dataRowCount > 0`
- **Entity count source**: `/api/plan-readiness` queries `rule_set_assignments` count per plan
- **onClick handler**: `handleCalculate` calls `POST /api/calculation/run` — no client-side entity validation
- **Root cause**: Button disabled when entityCount=0. BCL has 0 assignments. Self-healing API never called.

## Phase 1: Button Fixed

- **Gate removed**: `disabled={isCalculating || !periodId}` — removed `!isReady`
- **Visual styling preserved**: `isReady` still controls badge (Ready/Partial), opacity, button color
- **Button fires**: When period is selected and not calculating, button is always clickable

## Phase 2: Calculation Result

- **Self-healing code**: HF-126 in `/api/calculation/run` (lines 185-226)
- **Expected flow**: Button click → API call → 0 assignments found → auto-create 85 → calculate → results
- **Test**: Requires production verification — Patricia clicks Calculate on vialuce.ai
- **Vercel log to watch**: `[SCI Execute] HF-126: Created N rule_set_assignments`

## CLT Registry Updates

| Finding | Previous | New | Evidence |
|---------|----------|-----|----------|
| CLT166-F24 (button dead) | OPEN | FIXED | disabled prop no longer gates on isReady |
| CLT111-F43 (no assignments) | PARTIALLY | UNBLOCKED | Self-healing API now reachable via button |
| CLT122-F77 (no plan assignments) | PARTIALLY | UNBLOCKED | Same |

## Build

```
npm run build — exit 0
No TypeScript errors
1 file changed, 1 insertion(+), 1 deletion(-)
```
