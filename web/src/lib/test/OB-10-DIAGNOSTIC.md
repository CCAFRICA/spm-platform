# OB-10 Phase 1: Code Path Diagnostic

## Call Chain: Button Click to Employee List

```
Button click "Run Preview" (page.tsx:470)
  -> setRunType('preview') + handleRunCalculation() (page.tsx:468-470)
  -> handleRunCalculation() (page.tsx:249)
  -> previewPeriodCalculation(currentTenant.id, selectedPeriod, user.name) (page.tsx:265)
  -> getOrchestrator(tenantId) (orchestrator.ts:907)
  -> new CalculationOrchestrator(tenantId) or cached (orchestrator.ts:871)
  -> orchestrator.executeRun({...runType:'preview'...}) (orchestrator.ts:909)
  -> this.getEmployeesForRun(config) (orchestrator.ts:158)
  -> this.getEmployees() (orchestrator.ts:270)
```

## Critical Decision Point: getEmployees() (orchestrator.ts:544-569)

```typescript
private getEmployees(): EmployeeData[] {
  if (typeof window === 'undefined') return [];

  // CHECK 1: Stored employee data (LINE 548)
  const stored = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_DATA); // 'clearcomp_employee_data'
  if (stored) {
    try {
      const employees: EmployeeData[] = JSON.parse(stored);
      const filtered = employees.filter((e) => e.tenantId === this.tenantId);
      if (filtered.length > 0) {
        return filtered;  // <-- RETURNS HERE IF ANY MATCH
      }
    } catch {
      // Continue to next source
    }
  }

  // CHECK 2: Committed import data (LINE 562)
  const committedEmployees = this.extractEmployeesFromCommittedData();
  if (committedEmployees.length > 0) {
    return committedEmployees;
  }

  // CHECK 3: Demo fallback (LINE 568)
  return this.getDemoEmployees();
}
```

## Root Cause Identified

**The priority order is wrong.**

1. `clearcomp_employee_data` is checked FIRST (line 548)
2. If ANY employees exist in localStorage with matching tenantId, they are returned IMMEDIATELY
3. `extractEmployeesFromCommittedData()` is NEVER reached if Check 1 succeeds
4. Demo employees (`getDemoEmployees()` line 568) use `tenantId: this.tenantId` dynamically

**The Scenario:**
1. First calculation run: localStorage is empty → extractEmployeesFromCommittedData() returns empty (no batches yet) → getDemoEmployees() returns 3 demo employees with current tenantId
2. Sometime later: `saveEmployees()` is called (customer-launch-flow.ts:462), or employees get stored another way
3. Or: Demo employees were never cleared after initial runs
4. On subsequent runs: Check 1 finds employees (demo or mixed), returns them immediately
5. Real committed data from import (which DOES exist) is never consulted

**Why OB-09 Pipeline Test Passed:**
- The test ran in Node.js with a CLEAN mock localStorage
- It manually seeded committed data to the mock
- No demo employees in storage
- So Check 1 failed, Check 2 succeeded with real employees

**Why UI Calculation Fails:**
- Browser localStorage has persistent state from previous sessions
- May have demo employees stored with `tenantId: 'restaurantmx'`
- Check 1 succeeds with demo employees
- Check 2 (extractEmployeesFromCommittedData) is never reached

## The Fix

**Change priority: Check committed data FIRST, before stored employee data.**

New order:
1. First try extracting from committed import data
2. Then try stored employee data (for backward compatibility)
3. Only fall back to demo if both are empty

This ensures that when a data import is committed, those employees are used for calculations.

## STORAGE_KEYS Reference

```typescript
// orchestrator.ts line 22-27
const STORAGE_KEYS = {
  CALCULATION_RUNS: 'clearcomp_calculation_runs',
  CALCULATIONS: 'clearcomp_calculations',
  EMPLOYEE_DATA: 'clearcomp_employee_data',      // <-- THE PROBLEM KEY
  DATA_LAYER_COMMITTED: 'data_layer_committed',
  DATA_LAYER_BATCHES: 'data_layer_batches',
  // ...
};
```

## Demo Employee Definition (orchestrator.ts:818-860)

```typescript
private getDemoEmployees(): EmployeeData[] {
  return [
    {
      id: 'maria-rodriguez',
      tenantId: this.tenantId,  // <-- DYNAMIC: matches current tenant
      employeeNumber: 'EMP-001',
      firstName: 'Maria',
      lastName: 'Rodriguez',
      // ...
    },
    {
      id: 'james-wilson',
      tenantId: this.tenantId,  // <-- DYNAMIC
      // ...
    },
    {
      id: 'sarah-chen',
      tenantId: this.tenantId,  // <-- DYNAMIC
      // ...
    },
  ];
}
```

## Evidence Summary

| Check | Key/Function | Line | What It Does |
|-------|-------------|------|--------------|
| 1 | `clearcomp_employee_data` | 548 | Returns stored employees if any match tenant |
| 2 | `extractEmployeesFromCommittedData()` | 562 | Extracts employees from committed import data |
| 3 | `getDemoEmployees()` | 568 | Returns 3 demo employees with dynamic tenantId |

**The bug:** Check 1 takes precedence over Check 2. Demo employees in storage block real imported data.
