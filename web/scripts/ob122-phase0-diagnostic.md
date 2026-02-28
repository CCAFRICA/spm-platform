# OB-122 Phase 0: Diagnostic

## SHEET_COMPONENT_PATTERNS References (15 total)

| File | Line | Category |
|------|------|----------|
| metric-resolver.ts | 253-308 | Definition (10 pattern entries) |
| metric-resolver.ts | 350 | Usage in findSheetForComponent() |
| convergence-service.ts | 16 | Import |
| convergence-service.ts | 354-366 | Fast path (Tier 1 before semantic matching) |
| run-calculation.ts | 27 | Import |
| run-calculation.ts | 509-510 | Fallback in findMatchingSheet() |
| run-calculation.ts | 676 | Usage in buildMetricsForComponent() store metrics |
| import/commit/route.ts | 55, 768 | Comments only |

Also: findSheetForComponent() in employee-reconciliation-trace.ts:393

## Input Bindings Status

| Tenant | Plan | Derivations |
|--------|------|-------------|
| mexican-bank-co | Consumer Lending | 1 |
| mexican-bank-co | Insurance Referral | 5 |
| mexican-bank-co | Mortgage | 1 |
| mexican-bank-co | Deposit Growth | 3 |
| All other tenants | All plans | 0 |

## Architecture Decision

CHOSEN: Option B — input_bindings as PRIMARY path.

- Remove SHEET_COMPONENT_PATTERNS definition entirely
- Remove convergence Tier 1 fast path (rely on semantic matching only)
- Simplify findMatchingSheet(): keep AI context + direct name matching, remove pattern fallback
- Simplify buildMetricsForComponent(): store metric resolution uses semantic type fallback, not patterns
- findSheetForComponent(): remove STRATEGY 2 (pattern-based), keep STRATEGY 1 (AI context)
- Tenants without input_bindings: buildMetricsForComponent still works via direct name matching + semantic type resolution. Only pattern-based cross-language matching is lost.

REJECTED: Option C — perpetuates Pattern 20.
REJECTED: Option A — too aggressive, no graceful degradation.
