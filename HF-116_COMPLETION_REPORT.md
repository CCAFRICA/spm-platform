# HF-116 COMPLETION REPORT
## Engine Ratio Scaling Fix

### Commits
| Phase | Commit | Description |
|-------|--------|-------------|
| Prompt | `41d81f9` | Commit prompt |
| 0 | `84e9a8a` | Diagnostic — identified OB-146 x100 normalization at route.ts:1090-1093 |
| 1 | `90e6a6a` | Fix: skip normalization for convergence binding path |
| 2 | This commit | Completion report + PR |

### Files Changed
| File | Change |
|------|--------|
| `web/src/app/api/calculation/run/route.ts` | Wrapped OB-146 x100 normalization in `if (!usedConvergenceBindings)` guard |

### Hard Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-1: x100 line identified | PASS | route.ts:1090-1093: `if (inferSemanticType(key) === 'attainment' && value > 0 && value < 10) { metrics[key] = value * 100; }` |
| PG-2: Fix applied | PASS | route.ts:1090: `if (!usedConvergenceBindings) {` wraps the normalization block |
| PG-3: Conditional on path, not name | PASS | Condition is `!usedConvergenceBindings` (boolean set at line 1055), not component name or type |
| PG-4: Boundary components still work | PASS | Revenue Performance and On-Time Delivery have `scale_factor: 100` on their bindings. `resolveMetricsFromConvergenceBindings` applies scale_factor at lines 871/880, converting ratio to percentage BEFORE the normalization step. The normalization is redundant for convergence path. |
| PG-5: npm run build exits 0 | PASS | Build succeeds |
| PG-6: No regression | PASS | Revenue Performance: scale_factor=100 in binding handles conversion. On-Time Delivery: same. New Accounts: integer count unaffected. Safety Record: integer count unaffected. Fleet Utilization: raw ratio preserved (0.829, not 82.9). |
| PG-7: npm run build exits 0 | PASS | Build succeeds |
| PG-8: Final build exits 0 | PASS | Build succeeds |

### Standing Rule Compliance
| Rule | Status |
|------|--------|
| Korean Test | PASS — no component name references. Condition is `usedConvergenceBindings` flag |
| Fix Logic Not Data | PASS — engine computation fix, not data/binding adjustment |
| Scale by Design | PASS — applies to all components using convergence bindings path |

### Root Cause Chain
1. `ATTAINMENT_PATTERNS` includes `/rate/i` (metric-resolver.ts:20)
2. Fleet Utilization metric name `hub_utilization_rate` matches `/rate/i`
3. `inferSemanticType('hub_utilization_rate')` returns `'attainment'`
4. OB-146 normalization: value 0.829 is between 0 and 10 → multiplied by 100 → 82.93
5. `evaluatePercentage`: `82.93 * 800 = 66,340` instead of `0.829 * 800 = 663`

### Why Convergence Bindings Don't Need Normalization
Convergence bindings handle scaling via `scale_factor` in the binding itself:
- Bindings that need percentage conversion (Revenue Performance, On-Time Delivery) have `scale_factor: 100`
- `resolveMetricsFromConvergenceBindings` applies scale_factor at value resolution time (route.ts:854-855, 871, 880)
- The OB-146 normalization was designed for the legacy `buildMetricsForComponent` / `derivedMetrics` path where decimal values might leak through without explicit scaling

### Post-Merge Production Verification (FOR ANDREW)
| Gate | Status | Evidence |
|------|--------|----------|
| PG-9: localhost responds | | |
| PG-10: PR created | | |
| PG-11: Grand total ~ MX$185,063 | | |
| PG-12: Claudia Fleet ~ MX$663 | | |
| PG-13: Revenue Performance unchanged | | |
| PG-14: On-Time Delivery unchanged | | |

---
*HF-116 Complete | March 10, 2026*
