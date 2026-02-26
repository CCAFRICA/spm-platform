# HF-069 Completion Report: PDR Sweep — Currency, Persona, Brand Cards, Amber Threshold

**Date**: 2026-02-26
**Branch**: dev
**Status**: COMPLETE — All 4 PDR items resolved or confirmed PASS

---

## Executive Summary

Platform-wide sweep of 4 persistent defect registry items. PDR-01 (currency formatting) required surgical fixes across 11 files / 30+ instances. PDR-05, PDR-06, and PDR-07 confirmed PASS from prior work (HF-060, HF-070, OB-99).

## Commits

| Phase | Commit | Description |
|-------|--------|-------------|
| Prompt | `a94df25` | Commit prompt — PDR sweep specification |
| 0 | `92467ed` | PDR sweep diagnostic — current state of all 4 items |
| 1 | `b616902` | PDR-01 Currency no cents — platform-wide sweep (11 files, 30+ instances) |
| 2 | — | PDR-05 already PASS — no code changes |
| 3 | — | PDR-06 already PASS — no code changes |
| 4 | — | PDR-07 already PASS — no code changes |

---

## Phase 0: Diagnostic (Pre-Fix Truth)

### PDR-01: Currency ≥ MX$10,000 Shows No Cents
- **Status before fix**: FAIL
- **Canonical formatter**: `formatTenantCurrency()` in `web/src/types/tenant.ts` (lines 134-149)
- **Threshold logic**: `Math.abs(amount) >= 10_000 ? 0 : 2` fraction digits — CORRECT
- **Hook wrapper**: `useCurrency()` in `tenant-context.tsx` returns `{ symbol, format }` — CORRECT
- **Violations found**: 30+ raw `toLocaleString(undefined, { maximumFractionDigits: 0 })` instances across 11 files
- **Pattern**: Components bypassed the canonical formatter, always stripping decimals regardless of amount

### PDR-05: effectivePersona Not user.role for Filtering
- **Status**: PASS (confirmed in diagnostic)
- **Evidence**: All 9 financial pages use `usePersona()` for scope filtering. DemoPersonaSwitcher correctly sets entity scope via `setPersonaOverride()`. 59 `user.role` references audited: 20 auth gates, 11 API auth gates, 3 persona derivation, 5 UI display, 4 table column filters — all correct usage.

### PDR-06: Brand Cards as Collapsible Section Headers
- **Status**: PASS (confirmed in diagnostic)
- **Evidence**: `pulse/page.tsx` has `expandedBrands` state, `toggleBrand()` function, ChevronDown/ChevronRight icons, brand headers above location cards with summary stats (revenue, avg check, tip rate).

### PDR-07: Amber Threshold ±5%
- **Status**: PASS (confirmed in diagnostic)
- **Evidence**: API (`financial/data/route.ts`) uses `ratio > 1.05 ? 'above' : ratio < 0.95 ? 'below' : 'within'`. Client legend reads "Within ±5%". Colors: green (above), red (below), amber (within).

---

## Phase 1: PDR-01 Fix — Currency No Cents Platform-Wide Sweep

### Approach
Two strategies based on component type:
1. **Page/context components** (can use hooks): Replace raw formatting with `useCurrency().format(value)`
2. **Design-system components** (receive `currency` as string prop): Add module-level `fmtAmt(v, sym)` helper replicating the 10K threshold

### Files Modified (11 total)

#### Dashboard Components (hook-based fix)
| File | Instances Fixed | Method |
|------|----------------|--------|
| `web/src/components/dashboards/RepDashboard.tsx` | 7 | `format()` from `useCurrency()` |
| `web/src/components/dashboards/ManagerDashboard.tsx` | 3 | `format()` from `useCurrency()` |
| `web/src/components/dashboards/AdminDashboard.tsx` | 3 | `format()` from `useCurrency()` |
| `web/src/components/intelligence/RepTrajectory.tsx` | 5 | `format()` from `useCurrency()` |

#### Page Components (hook-based fix)
| File | Instances Fixed | Method |
|------|----------------|--------|
| `web/src/app/operate/lifecycle/page.tsx` | 1 | Existing `formatCurrency` alias |
| `web/src/app/transactions/disputes/page.tsx` | 1 | Replaced local formatter with canonical |

#### Design-System Components (module-level helper)
| File | Instances Fixed | Method |
|------|----------------|--------|
| `web/src/components/design-system/BudgetGauge.tsx` | 4 | Module-level `fmtAmt(v, sym)` |
| `web/src/components/design-system/PeriodComparison.tsx` | 1 | Module-level `fmtAmt(v, sym)` |
| `web/src/components/design-system/CalculationWaterfall.tsx` | 1 | Module-level `fmtAmt(v, sym)` |
| `web/src/components/design-system/PayrollSummary.tsx` | 2 | Module-level `fmtCurrencyAmt(v, sym)` |
| `web/src/components/design-system/WhatIfSlider.tsx` | 2 | Inline `fmtAmt` helper |

### Module-Level Helper Pattern (Design-System)
```typescript
function fmtAmt(v: number, sym: string) {
  const fd = Math.abs(v) >= 10_000 ? 0 : 2;
  return `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: fd, maximumFractionDigits: fd })}`;
}
```
Replicates canonical threshold: ≥10,000 → 0 decimals, <10,000 → 2 decimals.

### Verification
```bash
# Zero remaining raw currency formatters
rg 'toLocaleString\(undefined.*maximumFractionDigits:\s*0' web/src/app/ web/src/components/
# Result: 0 matches
```

---

## Phases 2-4: PDR-05, PDR-06, PDR-07

All three items confirmed PASS during Phase 0 diagnostic. No code changes required.

- **PDR-05**: Fixed in HF-060 (persona scope derivation) and HF-070 Phase 5 (my-compensation filtering)
- **PDR-06**: Fixed in OB-99 Phase 3 (brand card restructure on pulse page)
- **PDR-07**: Fixed in HF-070 Phase 6 (amber threshold ±5% legend correction)

---

## Proof Gates

| # | Gate | Status |
|---|------|--------|
| PG-01 | `formatTenantCurrency()` threshold = 10,000 | PASS |
| PG-02 | RepDashboard uses `format()` not raw toLocaleString | PASS |
| PG-03 | ManagerDashboard uses `format()` not raw toLocaleString | PASS |
| PG-04 | AdminDashboard uses `format()` not raw toLocaleString | PASS |
| PG-05 | RepTrajectory uses `format()` not raw toLocaleString | PASS |
| PG-06 | Design-system components use fmtAmt with 10K threshold | PASS |
| PG-07 | Zero `maximumFractionDigits: 0` for currency in app/components | PASS |
| PG-08 | All financial pages use `usePersona()` for scope | PASS |
| PG-09 | DemoPersonaSwitcher sets entity scope correctly | PASS |
| PG-10 | Brand headers above locations with collapsible state | PASS |
| PG-11 | Brand cards show revenue/avg check/tip rate stats | PASS |
| PG-12 | API uses ratio > 1.05 / < 0.95 (±5%) | PASS |
| PG-13 | Client legend reads "Within ±5%" | PASS |
| PG-14 | `npm run build` exits 0 | PASS |
| PG-15 | Dev server responds at localhost:3000 | PASS |

---

## Files NOT Modified (Scope Boundaries Respected)

- Auth files (middleware.ts, auth-context.tsx, route handlers)
- Landing pages
- Observatory components
- Import pipeline
- Calculation engine
- Sidebar navigation
- No new features added

---

## Build Verification

```
npm run build → exit 0
npm run dev → localhost:3000 responds HTTP 307 (correct auth redirect)
```
