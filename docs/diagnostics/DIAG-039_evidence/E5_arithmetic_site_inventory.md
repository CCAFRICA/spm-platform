# E5 — Arithmetic site inventory (reformatted from E1.5)

Per directive: "Every arithmetic site touching c4-relevant variables on the execution path. Architect compares against E4 to determine which sites are on the actual c4 path and which are dormant."

The complete verbatim grep output (218 lines) is in `E1_5_arithmetic_sites.md`. Below is the same content re-rendered as the directive's tabular form for the **subset that the E4 boundary table identifies as on-path for c4** (steps 9, 10, 12, 13). The remaining 200+ rows from E1.5 are off-path or peripheral — architect reads the full E1.5 for the dormant inventory.

## On-path arithmetic sites for c4

| File:line | Variables | Operator | Verbatim line |
|---|---|---|---|
| `web/src/lib/calculation/intent-executor.ts:354` | `num`, `den` | `.div` | `return num.div(den);` (executeRatioOp) |
| `web/src/lib/calculation/intent-executor.ts:309` | `inputValue`, `rateValue` | `.mul` | `return inputValue.mul(rateValue);` (executeScalarMultiply) |
| `web/src/lib/calculation/intent-executor.ts:586` | `result`, `cap` | `.gt`, ternary | `result = result.gt(cap) ? cap : result;` (case 'cap' inside applyModifiers) |
| `web/src/lib/calculation/intent-executor.ts:606` | `result`, `before` | `toNumber` | `modifierLog.push({ modifier: mod.modifier, before, after: toNumber(result) });` (modifier log entry; the `{ before: 800, after: 1.5, modifier: 'cap' }` entry in E3.4a is from this line) |
| `web/src/lib/calculation/decimal-precision.ts:144` | rawValue, precision | (case body) | `case 'scalar_multiply': { … }` (full body in `E1_4_5_decimal-precision.md`; rounding logic) |
| `web/src/lib/calculation/intent-executor.ts:352` | `den` | `.isZero()` | `if (den.isZero()) { return ZERO; }` (zero-denominator guard — did not fire for c4 because den=116 not 0) |

## CC observation (verbatim, not classification)

The c4 boundary trace at step 12 (line 586) is where the **cap modifier transformed the value 800 into 1.5**. The line `result = result.gt(cap) ? cap : result;` is the literal site of that transformation. The full applyModifiers function (E1.4.4 lines 572-610) provides surrounding context.

The full 218-line `E1_5_arithmetic_sites.md` inventory contains arithmetic sites in:
- `web/src/app/api/calculation/run/route.ts` (the orchestrator; many sites involving `metric`, `result`, `value`, `component`)
- `web/src/lib/calculation/run-calculation.ts` (the engine; `evaluateComponent`, `buildMetricsForComponent`, etc.)
- `web/src/lib/calculation/intent-executor.ts` (the intent runtime; `executeRatioOp`, `executeScalarMultiply`, `applyModifiers`)
- `web/src/lib/calculation/decimal-precision.ts` (rounding + scaling)
- `web/src/lib/calculation/intent-transformer.ts` (AI-shape → ComponentIntent)

Architect reads E1.5 for the full inventory and E4 for the on-path subset.
