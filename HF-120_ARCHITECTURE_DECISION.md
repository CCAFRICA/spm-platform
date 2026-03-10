# HF-120 Phase 0: Architecture Decision Record
## Conditional Gate — Evaluate Condition, Not Multiply Base

### Problem
Gate evaluates `base * rate` instead of condition → constant.
- PASS case (0 incidents): `base=0`, HF-117 fix returns `rate` (correct by accident)
- FAIL case (>0 incidents): `base=incidents`, pays `incidents * rate` (WRONG — should be 0)

Delta: MX$8,000 across 12 employees with incidents > 0.

### Legacy Path (evaluateConditionalPercentage)
**File:** run-calculation.ts:300-330

Current logic:
```typescript
const base = metrics[config.appliedTo] ?? metrics['amount'] ?? 0;
// ...
const payout = base === 0 ? condition.rate : base * condition.rate;
```

The intent fallback (line 383) only triggers when `payout === 0`. For FAIL cases, payout is non-zero (e.g., 900), so the fallback never runs.

### Intent Path (executeConditionalGate)
**File:** intent-executor.ts:225-246

This path is CORRECT:
```typescript
const leftVal = resolveSource(op.condition.left, data, inputLog);
const rightVal = resolveSource(op.condition.right, data, inputLog);
let conditionMet = false;
switch (op.condition.operator) { /* =, !=, <, <=, >, >= */ }
const branch = conditionMet ? op.onTrue : op.onFalse;
return executeOperation(branch, data, inputLog, trace);
```

But runs only in the intent engine path (concordance), not the primary evaluation.

### Fix
In `evaluateComponent`, for `conditional_percentage` with a `calculationIntent` of `conditional_gate` operation: use the intent executor DIRECTLY as the primary path. This evaluates the plan's condition structure and returns onTrue/onFalse values.

The intent fallback at line 383 already has the pattern. The change: for `conditional_gate` intents, use intent as PRIMARY (not fallback), and accept $0 as a valid result.

- Korean Test: operator, values, and metric references from plan structure
- Scale: works for any condition operator, any threshold, any onTrue/onFalse value

---
*HF-120 Phase 0 | March 9, 2026*
