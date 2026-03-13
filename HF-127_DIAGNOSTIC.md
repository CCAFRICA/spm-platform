# HF-127 Phase 0: Diagnostic

## 0A: Calculate Button Gate
`web/src/components/calculate/PlanCard.tsx` line 55:
```typescript
const isReady = plan.entityCount > 0 && plan.hasBindings && plan.dataRowCount > 0;
```
Line 174:
```typescript
disabled={isCalculating || !periodId || !isReady}
```
Button is disabled when `entityCount === 0`.

## 0B: Entity Count Source
`entityCount` comes from `/api/plan-readiness` (line 103):
```typescript
entityCount: assignCountByPlan.get(rs.id) || 0
```
Which queries `rule_set_assignments` count per plan.
BCL has 0 assignments → entityCount = 0 → isReady = false → button disabled.

## 0C: Calculate All Button
`web/src/app/operate/calculate/page.tsx` line 292:
```typescript
{activePlans.length > 1 && selectedPeriodId && (
```
BCL has 1 active plan → "Calculate All" never shows.

## 0D: handleCalculate
PlanCard.tsx line 57-91: `handleCalculate` calls `/api/calculation/run` with POST.
No client-side entity count validation in the handler itself.
The gate is purely the `disabled` prop on the Button.

## Root Cause
Button `disabled` when `isReady` is false. `isReady` requires `entityCount > 0`.
BCL has 0 rule_set_assignments → entityCount = 0 → button disabled.
HF-126 self-healing in the API never fires because the API is never called.

## Fix
Remove `!isReady` from the disabled condition. Let the API handle validation.
Keep `isReady` for visual styling (Partial badge, opacity) but not for disabling.
