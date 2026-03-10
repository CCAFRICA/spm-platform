# HF-121 Phase 0: Architecture Decision Record
## Conditional Gate Diagnostic and Fix

### Problem
HF-120 installed `calculationIntent` as the primary evaluation path for `conditional_gate` components. The guard fires correctly (`component.calculationIntent.operation === 'conditional_gate'`). But `executeConditionalGate` doesn't handle the `"="` operator — only `"=="` has a case in the switch.

### Evidence (local test)
```
PASS (0 incidents): payout=0 (expected 500)
  conditionMet stays false → onFalse = constant(0)

FAIL (3 incidents): payout=0 (expected 0) ← correct by accident
  conditionMet stays false → onFalse = constant(0)
```

Both branches return `onFalse`. The FAIL case is coincidentally correct (should be 0), but the PASS case is wrong (should be 500).

### Root Cause
**intent-executor.ts line 235-242**: The switch handles `>=, >, <=, <, ==, !=` but NOT `=`. The AI plan interpreter produces `"operator": "="` (single equals) in `calculationIntent`. The single-equals never matches any case → `conditionMet` always false → always returns `onFalse`.

### Secondary Issue (pre-HF-120)
Before HF-120, the legacy `evaluateConditionalPercentage` was the primary path. It has TWO bugs for gate components:
1. `conditionalConfig.conditions[0].max = null` → `Number.isFinite(null) = false` → treated as Infinity → condition `[0, ∞)` matches ALL non-negative values
2. `base * rate` semantics wrong for gates (should return constant, not multiply)

HF-120's guard correctly bypasses the legacy evaluator. The only remaining issue is the `=` operator handling.

### Fix
Add `case '=':` to `executeConditionalGate`'s operator switch. This is the minimal change — the AI produces `"="` and the executor should treat it as equality.

- Korean Test: no hardcoded values, operator handling is structural
- Scale: works for any operator the AI may produce
- One-line change in intent-executor.ts

---
*HF-121 Phase 0 | March 10, 2026*
