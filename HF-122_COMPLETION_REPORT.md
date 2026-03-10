# HF-122 COMPLETION REPORT
## Calculation Precision Architecture (Decision 122 — DS-010)

### Commits
| Phase | Commit | Description |
|-------|--------|-------------|
| 0 | `5b47f09` | Architecture decision — decimal.js in intent executor with Banker's Rounding |
| 1 | `32e2d09` | decimal.js + OutputPrecision types + decimal-precision utility module |
| 2 | `e00e45b` | Refactor intent executor to Decimal arithmetic |
| 3 | `b258014` | Per-component rounding with trace in calculation results |
| 4 | This commit | Completion report + PR |

### Files Changed
| File | Change |
|------|--------|
| `web/package.json` | Added `decimal.js ^10.6.0` |
| `web/src/lib/calculation/intent-types.ts` | Added `OutputPrecision`, `RoundingTrace` interfaces, `DEFAULT_OUTPUT_PRECISION` |
| `web/src/lib/calculation/decimal-precision.ts` | **NEW** — Decimal config (ROUND_HALF_EVEN), `toDecimal`, `toNumber`, `roundComponentOutput`, `inferOutputPrecision` |
| `web/src/lib/calculation/intent-executor.ts` | All 9 primitives refactored to Decimal arithmetic. `executeOperation` returns `Decimal`. `executeIntent` converts to number at boundary. |
| `web/src/lib/calculation/run-calculation.ts` | Per-component rounding via `roundComponentOutput`. `executeOperation` callers convert Decimal→number. |
| `web/src/app/api/calculation/run/route.ts` | Per-component rounding + rounding trace in `calculation_results.metadata`. Entity total = sum of rounded components. |

### Phase 1: Library + Types
- `decimal.js: "^10.6.0"` in package.json
- `OutputPrecision` interface: `{ decimalPlaces, roundingMethod, source }`
- `RoundingTrace` interface: `{ componentIndex, label, rawValue, roundedValue, roundingAdjustment, precision }`
- `decimal-precision.ts`: Decimal.set({ precision: 20, rounding: ROUND_HALF_EVEN })
- Build exits 0

### Phase 2: Intent Executor Refactor
All primitives converted to Decimal:
- `resolveSource` → returns Decimal
- `resolveValue` → returns Decimal
- `executeBoundedLookup1D` → Decimal (boundary comparison still native number — plan values are exact)
- `executeBoundedLookup2D` → Decimal
- `executeScalarMultiply` → `.mul()` instead of `*`
- `executeConditionalGate` → `.gte()`, `.lt()`, `.eq()` etc instead of `>=`, `<`, `===`
- `executeAggregateOp` → Decimal
- `executeRatioOp` → `.div()` instead of `/`
- `executeConstantOp` → Decimal
- `executeWeightedBlend` → `.plus()`, `.mul()` instead of `+`, `*`
- `executeTemporalWindow` → all aggregation operations use Decimal
- `applyModifiers` → cap/floor/proration use Decimal
- HF-121 `=` operator fix preserved
- Build exits 0

### Phase 3: Per-Component Rounding
- `inferOutputPrecision()` walks intent/config tree, collects output values, returns decimalPlaces=0 if all integers
- `roundComponentOutput()` applied after every `evaluateComponent` call
- Entity total = sum of rounded component payouts (GAAP line-item presentation)
- Rounding trace stored in `calculation_results.metadata.roundingTrace`
- Build exits 0

### Phase 4: GT Verification (localhost)

| Component | GT Total | Engine Total | Delta |
|---|---|---|---|
| C1 Revenue Performance | MX$44,000 | MX$44,000 | 0 |
| C2 On-Time Delivery | MX$15,550 | MX$15,450 | **-100** |
| C3 New Accounts | MX$69,900 | MX$69,900 | 0 |
| C4 Safety Record | MX$20,700 | MX$20,700 | 0 |
| C5 Fleet Utilization | MX$34,913 | MX$34,913 | 0 |
| **Grand Total** | **MX$185,063** | **MX$184,963** | **-100** |

**C2 delta analysis:** The MX$100 shortfall in C2 On-Time Delivery is a pre-existing structural issue in the tier_lookup legacy evaluator, NOT a precision issue. The spec stated the MX$100.38 delta was "entirely attributable to floating-point imprecision in C5." In reality: MX$0.38 was C5 floating-point (FIXED by Decimal + rounding), MX$100 is C2 structural (requires separate HF).

**Anchor Entities:**
| Employee | Expected Total | Actual Total | C4 |
|---|---|---|---|
| Claudia (70001) | 1,573 | **1,573** | 300 |
| Antonio (70010) | 6,263 | **6,263** | 500 |
| Alma (70129) | 2,050 | **2,050** | **0** |

**Gate branches (FP-64):**
- PASS: 55 employees with 0 incidents → C4 = 300 (Standard) or 500 (Senior) ✓
- FAIL: 12 employees with >0 incidents → C4 = 0 ✓

**Rounding trace sample (Claudia Cruz Ramírez):**
```
rawTotal: 1573.162 → roundedTotal: 1573
  Revenue Performance - Standard: raw=800 → rounded=800 (adj=0)
  On-Time Delivery - Standard: raw=100 → rounded=100 (adj=0)
  New Accounts - Standard: raw=0 → rounded=0 (adj=0)
  Safety Record - Standard: raw=300 → rounded=300 (adj=0)
  Fleet Utilization - Standard: raw=373.162 → rounded=373 (adj=-0.162)
```

**Banker's Rounding verification:**
- 0.5 → 0 (rounds to even) ✓
- 1.5 → 2 (rounds to even) ✓

### Standing Rule Compliance
| Rule | Status |
|------|--------|
| Decision 122 | PASS — Banker's Rounding, decimal.js, per-component precision, rounding trace |
| AP-25 | PASS — No native number arithmetic in any intent executor primitive |
| Korean Test | PASS — `inferOutputPrecision` examines numeric VALUES, not currency codes |
| Fix Logic Not Data | PASS — Engine logic change, not plan/data adjustment |
| FP-64 | PASS — Both gate branches verified |

### Post-Merge Production Verification (FOR ANDREW)
| Gate | Status | Evidence |
|------|--------|----------|
| PG-1: PR created | | |
| PG-2: Grand total = MX$184,963 (MX$100 C2 structural delta remains) | | |
| PG-3: Claudia (70001) = MX$1,573 | | |
| PG-4: Antonio (70010) = MX$6,263 | | |
| PG-5: Alma (70129) C4=0, Total=2,050 | | |
| PG-6: Rounding trace in metadata | | |
| PG-7: C5 Fleet Utilization total = MX$34,913 (floating-point eliminated) | | |

### Next Steps
The remaining MX$100 delta in C2 On-Time Delivery is a structural issue in the tier_lookup legacy evaluator (payout distribution includes values 350, 600, 1200 not in GT output set). This requires a separate investigation HF to diagnose whether the tier config, metric resolution, or variant routing is producing incorrect C2 payouts.

---
*HF-122 Complete | March 10, 2026*
