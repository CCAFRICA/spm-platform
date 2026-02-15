# OB-43B: GLOBAL RENAME — EMPLOYEE TO ENTITY, PLAN TO RULE SET

NEVER ask yes/no. NEVER say "shall I". Just act.

---

## CONTEXT

OB-43A Phase 0 documented the kill list. Phase 1 removed isSupabaseConfigured() dual-mode branches. Phase 2 (global rename) was started but not completed due to scope.

This OB completes the global rename. Nothing else. No page rewiring. No localStorage removal. Just rename.

**Kill list from Phase 0:**
- 735 `employeeId` / `employee_id` references
- 150 `CompensationPlan` references
- 167 `planId` / `plan_id` references
- 3 type aliases to delete

**Total: ~1,052 renames across the codebase.**

---

## FIRST PRINCIPLES

1. **RENAME, DON'T ALIAS.** Delete aliases. The new name IS the name.
2. **BUILD MUST PASS.** After every phase: `rm -rf .next && npm run build`. Zero TypeScript errors.
3. **ONE COMMIT PER PHASE.** Each phase is independently buildable.
4. **DISPLAY LABELS ARE NOT CODE.** UI strings shown to users (like "Employee Name" column headers) are driven by tenant configuration, not hardcoded. But variable names, type names, interface fields, function names — those get renamed.
5. **COMMENTS AND STRINGS.** Rename in comments too. But do NOT rename user-facing display strings that should be tenant-configurable. If unsure, rename the code reference, leave the display string.

---

## STANDING RULES

1. Always commit + push after changes.
2. After every commit: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`.
3. Git commit messages: ASCII only.
4. Completion reports at PROJECT ROOT.

---

## PHASE 1: TYPE DEFINITIONS — SOURCE OF TRUTH

Start with the type files. Everything downstream depends on these.

### 1A: `src/types/compensation-plan.ts`

This is the core type file. Rename:
- `CompensationPlanConfig` → `RuleSetConfig`
- `CompensationPlan` → `RuleSet`
- `PlanStatus` → `RuleSetStatus`
- `PlanComponent` → `RuleSetComponent`
- `PlanTier` → `RuleSetTier`
- Any other `Plan`-prefixed types → `RuleSet`-prefixed
- Any `plan` fields inside interfaces → `ruleSet`
- Delete ALL `export type X = Y` alias lines

Consider renaming the FILE itself: `compensation-plan.ts` → `rule-set.ts`. Update all imports.

### 1B: `src/types/calculation-engine.ts`

- `EmployeeMetrics` → `EntityMetrics`
- `EmployeeCalculationResult` → `EntityCalculationResult`
- `EmployeePayoutSummary` → `EntityPayoutSummary` (if exists)
- Every `employeeId` field → `entityId`
- Every `employee_id` field → `entity_id`
- Every `employeeName` → `entityName` or `displayName`
- Every `employee_count` → `entity_count`
- Remove any dual fields (if both `entityId` and `employeeId` exist, keep only `entityId`)

### 1C: `src/types/auth.ts`

- Any `employeeId` → `entityId`

### 1D: Any other type files with old names

```bash
grep -rn "employeeId\|employee_id\|CompensationPlan\|planId\|plan_id" src/types/ --include="*.ts"
```

Rename everything found.

### 1E: Verify

```bash
grep -rn "CompensationPlan\|EmployeeMetrics\|EmployeeCalculationResult\|employeeId\|employee_id" src/types/ --include="*.ts" | wc -l
# Must return 0

rm -rf .next && npm run build
# Must succeed — downstream consumers will have errors, that's expected for now
# Actually this will FAIL because consumers still use old names
# Skip build check for this phase — it will pass after all phases complete
```

**Commit:** `OB-43B Phase 1: Type definitions renamed — RuleSet, EntityMetrics, entityId`

---

## PHASE 2: CORE LIB — CALCULATION ENGINE AND ORCHESTRATOR

These are the heaviest files. Rename all references.

### 2A: `src/lib/compensation/calculation-engine.ts`

- All `employeeId` → `entityId`
- All `employee_id` → `entity_id`
- All `EmployeeMetrics` → `EntityMetrics`
- All `EmployeeCalculationResult` → `EntityCalculationResult`
- All `CompensationPlan` → `RuleSet`
- All `planId` → `ruleSetId`
- All `plan_id` → `rule_set_id`
- Function parameters, local variables, return types — everything

### 2B: `src/lib/orchestration/calculation-orchestrator.ts`

Same rename pattern. This file has 40 localStorage references (which OB-43C will address) — for now, just rename the type references and variable names.

### 2C: `src/lib/compensation/plan-storage.ts`

If this file still exists after OB-43A Phase 1, rename all references. If it's been marked for deletion, skip.

### 2D: `src/lib/calculation/` directory — all files

```bash
grep -rn "employeeId\|employee_id\|CompensationPlan\|planId\|plan_id" src/lib/calculation/ --include="*.ts"
```

Rename everything found in:
- `calculation-lifecycle-service.ts`
- `results-storage.ts`
- `calculation-summary-service.ts`
- `context-resolver.ts`
- `data-component-mapper.ts`
- Any other files in this directory

### 2E: Build check

```bash
rm -rf .next && npm run build
```

May still fail if page files haven't been updated yet. Document errors.

**Commit:** `OB-43B Phase 2: Core lib renamed — calculation engine, orchestrator, calculation services`

---

## PHASE 3: SUPABASE SERVICES

### 3A: Supabase service files

Check if any old names leaked into the Supabase services:

```bash
grep -rn "employeeId\|employee_id\|CompensationPlan\|planId\|plan_id" src/lib/supabase/ --include="*.ts"
```

Rename any found. These files should already use entity model naming from OB-42, but verify.

### 3B: Database types

```bash
grep -rn "employeeId\|employee_id\|CompensationPlan\|planId\|plan_id" src/lib/supabase/database.types.ts
```

If any old names exist in database.types.ts, rename them. The database columns are already `entity_id` and `rule_set_id` — the TypeScript types must match.

**Commit:** `OB-43B Phase 3: Supabase services verified — entity model naming confirmed`

---

## PHASE 4: SERVICE LAYER — ALL REMAINING LIB FILES

This is the bulk of the rename. Work through every directory under `src/lib/`:

### 4A: Data architecture

```bash
grep -rn "employeeId\|employee_id\|CompensationPlan\|planId\|plan_id" src/lib/data-architecture/ --include="*.ts"
```

Rename all. `data-layer-service.ts` has 64 localStorage references — ignore those for now, just rename type/variable names.

### 4B: Navigation services

```bash
grep -rn "employeeId\|employee_id\|CompensationPlan\|planId\|plan_id" src/lib/navigation/ --include="*.ts"
```

Rename in: `cycle-service.ts`, `pulse-service.ts`, `queue-service.ts`, `compensation-clock-service.ts`, `navigation-signals.ts`, `command-registry.ts`

### 4C: All other lib directories

Work through each alphabetically:

```bash
for dir in ai alerts analytics approval-routing approval-service audit-service bulk data-quality demo disputes financial forensics governance help import-pipeline intelligence launch normalization payroll payout-service permissions performance plan-approval rbac reconciliation scenarios search storage tenant test; do
  echo "=== $dir ==="
  grep -rn "employeeId\|employee_id\|CompensationPlan\|planId\|plan_id" "src/lib/$dir/" --include="*.ts" 2>/dev/null | wc -l
done
```

Rename everything found. For directories with zero matches, skip.

### 4D: Standalone lib files

```bash
grep -rn "employeeId\|employee_id\|CompensationPlan\|planId\|plan_id" src/lib/*.ts
```

Rename in: `tenant-data-service.ts`, `audit-service.ts`, `payout-service.ts`, `approval-service.ts`, etc.

**Commit:** `OB-43B Phase 4: All lib services renamed`

---

## PHASE 5: CONTEXTS

### 5A: Auth context, tenant context, navigation context, config context, locale context

```bash
grep -rn "employeeId\|employee_id\|CompensationPlan\|planId\|plan_id" src/contexts/ --include="*.tsx" --include="*.ts"
```

Rename all occurrences. These contexts propagate types to every page — getting them right cascades downstream.

**Commit:** `OB-43B Phase 5: Contexts renamed`

---

## PHASE 6: HOOKS AND COMPONENTS

### 6A: Hooks

```bash
grep -rn "employeeId\|employee_id\|CompensationPlan\|planId\|plan_id" src/hooks/ --include="*.ts" --include="*.tsx"
```

### 6B: Components

```bash
grep -rn "employeeId\|employee_id\|CompensationPlan\|planId\|plan_id" src/components/ --include="*.ts" --include="*.tsx"
```

Rename all. Props named `employeeId` become `entityId`. Component names like `EmployeeDetail` become `EntityDetail`.

**Commit:** `OB-43B Phase 6: Hooks and components renamed`

---

## PHASE 7: PAGE FILES (ALL 127 PAGES)

### 7A: Systematic rename across all pages

```bash
grep -rn "employeeId\|employee_id\|CompensationPlan\|planId\|plan_id" src/app/ --include="*.tsx" --include="*.ts"
```

Work through every result. This includes:
- Route parameters: `[employeeId]` directories → rename to `[entityId]`
- Query parameters in URL construction
- Import statements
- Variable names
- Props passed to components

### 7B: Dynamic route directories

If there are directories like `src/app/investigate/trace/[employeeId]/`, rename the directory:
```bash
mv src/app/investigate/trace/[employeeId] src/app/investigate/trace/[entityId]
```

Update the page.tsx inside to use `params.entityId` instead of `params.employeeId`.

### 7C: Any links/hrefs that reference old parameter names

```bash
grep -rn "employeeId=" src/app/ --include="*.tsx"
grep -rn "/trace/\${.*employeeId" src/app/ --include="*.tsx"
```

Update all URL construction.

**Commit:** `OB-43B Phase 7: All 127 pages renamed`

---

## PHASE 8: FINAL VERIFICATION AND BUILD

### 8A: Comprehensive grep

```bash
echo "=== employeeId/employee_id ==="
grep -rn "employeeId\|employee_id" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l

echo "=== CompensationPlan ==="
grep -rn "CompensationPlan" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l

echo "=== planId/plan_id ==="
grep -rn "\bplanId\b\|\bplan_id\b" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l

echo "=== Type aliases ==="
grep -rn "RuleSetConfig = \|RuleSetStatus = \|EntityMetrics = " src/ --include="*.ts" --include="*.tsx" | wc -l
```

ALL must return 0.

### 8B: Build

```bash
rm -rf .next
npm run build
```

Must succeed with zero TypeScript errors.

### 8C: Dev server

```bash
npm run dev
```

Open localhost:3000. Sign in. Basic navigation works.

### 8D: Completion report

Create `OB-43B_COMPLETION_REPORT.md` at PROJECT ROOT.

**Commit:** `OB-43B Phase 8: Final verification, build passes, completion report`

---

## HARD GATES

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| HG-1 | Type aliases deleted. No `X = Y` alias lines in type files. | | |
| HG-2 | `CompensationPlan` type → `RuleSet`. Grep returns 0 matches. | | |
| HG-3 | `EmployeeMetrics` → `EntityMetrics`. Grep returns 0. | | |
| HG-4 | `EmployeeCalculationResult` → `EntityCalculationResult`. Grep returns 0. | | |
| HG-5 | `employeeId` → `entityId` in all TypeScript. Grep returns 0. | | |
| HG-6 | `employee_id` → `entity_id` in all TypeScript. Grep returns 0. | | |
| HG-7 | `planId` → `ruleSetId` in all TypeScript. Grep returns 0. | | |
| HG-8 | `plan_id` → `rule_set_id` in all TypeScript. Grep returns 0. | | |
| HG-9 | `PlanStatus` → `RuleSetStatus`. Grep returns 0. | | |
| HG-10 | Dynamic route `[employeeId]` directories renamed to `[entityId]`. | | |
| HG-11 | `npm run build` succeeds with zero TypeScript errors. | | |
| HG-12 | localhost:3000 responds after build. | | |
| HG-13 | Completion report at PROJECT ROOT. | | |

---

## CRITICAL CC INSTRUCTION

**This OB is ONLY renaming.** Do NOT:
- Remove localStorage calls (that's OB-43C)
- Rewire pages to use Supabase services (that's OB-43C)
- Delete old service files (that's OB-43D)
- Change any logic or behavior
- Add new features

If a variable is renamed from `employeeId` to `entityId`, the logic around it stays IDENTICAL. This is a pure mechanical rename with zero behavior change.

The ONLY acceptable change to any line of code is: the old name becomes the new name. Nothing else changes on that line.

Exception: if renaming a field in an interface causes a type error because a consuming function passes the old field name, rename the consuming function's argument too. Follow the chain until it compiles.

---

*ViaLuce.ai — The Way of Light*
*OB-43B: Global Rename — The language of employees and plans is gone. The language of entities and rule sets is all that remains.*
