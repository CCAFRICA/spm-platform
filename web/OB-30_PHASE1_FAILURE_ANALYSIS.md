# OB-30 Phase 1: Failure Analysis

## Problem Statement

Employee 90198149 has role "OPTOMETRISTA NO CERTIFICADO" but ViaLuce calculates using the "Certified" variant instead of "Non-Certified" variant. This results in a +$10,009 warranty overpayment ($76,881 vs ground truth $66,872).

After 3+ fix attempts, the total remains $1,263,831 (should be ~$1,253,832).

---

## Fix Attempt 1: context-resolver.ts

### What I Changed

**File**: `src/lib/calculation/context-resolver.ts`
**Lines**: 356-384

**Before**:
```typescript
employees.push({
  id: employeeId.toLowerCase().replace(/\s+/g, '-'),
  tenantId,
  employeeNumber: employeeId,
  firstName,
  lastName,
  email: extractFieldValue(...),
  role: extractFieldValue(aiContext, content, sheetName, ['role', 'position', 'employeeType', 'jobTitle']) || 'sales_rep',
  // ... other fields
  status: 'active' as const,
  // NO isCertified field
});
```

**After**:
```typescript
const role = extractFieldValue(aiContext, content, sheetName, ['role', 'position', 'employeeType', 'jobTitle']) || 'sales_rep';

// HF-019: Derive isCertified from role string (normalize whitespace first)
const normalizedRole = role.toUpperCase().replace(/\s+/g, ' ').trim();
const hasNoCertificado = normalizedRole.includes('NO CERTIFICADO') ||
                         normalizedRole.includes('NO-CERTIFICADO') ||
                         normalizedRole.includes('NON-CERTIFICADO');
const hasCertificado = normalizedRole.includes('CERTIFICADO') || normalizedRole.includes('CERTIFIED');
const isCertified = hasCertificado && !hasNoCertificado;

employees.push({
  // ... same fields
  isCertified,  // NOW SET
});
```

### What I Expected
- `extractEmployeesFromCommittedData()` would set `isCertified: false` for "OPTOMETRISTA NO CERTIFICADO"
- `buildEmployeeMetrics()` would pass this to `findMatchingVariant()`
- Non-certified variant would be selected

### What Actually Happened
- Employee 90198149 still shows "Certified" variant
- Total unchanged at $1,263,831

---

## Fix Attempt 2: calculation-engine.ts

### What I Changed

**File**: `src/lib/compensation/calculation-engine.ts`
**Lines**: 197-198

**Before**:
```typescript
function findMatchingVariant(config: AdditiveLookupConfig, metrics: EmployeeMetrics) {
  return config.variants.find((variant) => {
```

**After**:
```typescript
function findMatchingVariant(config: AdditiveLookupConfig, metrics: EmployeeMetrics) {
  // HF-019: Treat undefined isCertified as false (non-certified default)
  const employeeIsCertified = metrics.isCertified ?? false;

  return config.variants.find((variant) => {
    // ... uses employeeIsCertified instead of metrics.isCertified
```

### What I Expected
- If `metrics.isCertified` is undefined, default to `false` (non-certified)
- Non-certified variant would be selected

### What Actually Happened
- No change in behavior
- This suggests `isCertified` is NOT undefined - it's explicitly `true`

---

## Fix Attempt 3: calculation-orchestrator.ts (zero-goal guard)

### What I Changed

**File**: `src/lib/orchestration/calculation-orchestrator.ts`
**Lines**: 757-763

Extended zero-goal guard to clear `amount` for ALL component types, not just percentage.

### What Actually Happened
- This was a separate fix for the warranty amount issue
- Did not address the variant selection problem

---

## Hypothesis: Why Fixes Did Not Work

### Most Likely Cause: Different Code Path

Looking at the grep output, there are **multiple places** where `isCertified` is determined:

1. **calculation-orchestrator.ts:550-577** - `deriveIsCertified()` method
   - Uses `employee.role` to derive
   - Has whitespace normalization

2. **calculation-orchestrator.ts:594, 611, 641** - Where `isCertified` is set on EmployeeMetrics
   - Always calls `this.deriveIsCertified(employee)`

3. **context-resolver.ts:362-384** - My new fix
   - Only runs in `extractEmployeesFromCommittedData()`

4. **employee-reconciliation-trace.ts:200-202** - DIFFERENT derivation!
   ```typescript
   const isCertified = roleStr.includes('CERTIFICADO') && !roleStr.includes('NO CERTIFICADO');
   ```
   - This is used for the UI trace display
   - **BUG**: This checks `!roleStr.includes('NO CERTIFICADO')` but the role may have extra whitespace

### The Real Problem

The orchestrator has **3 priority levels** for getting employee metrics:

```typescript
// PRIORITY 0: AI-driven metrics from aggregated data
const aiMetrics = this.extractMetricsWithAIMappings(employee);
if (aiMetrics) {
  return { ...isCertified: this.deriveIsCertified(employee)... };  // ← Uses deriveIsCertified
}

// PRIORITY 2: Calculation context (context-resolver.ts)
if (this.calculationContext) {
  const metrics = buildEmployeeMetrics(this.calculationContext, contextEmployee);
  if (metrics) return metrics;  // ← Uses employee.isCertified from context-resolver
}
```

**My fix in context-resolver.ts only affects PRIORITY 2.**

If PRIORITY 0 is being used (which it likely is for aggregated data), my fix never runs.

### Hypothesis: PRIORITY 0 is Dominant

The orchestrator logs: `"[Orchestrator] Using X employees from AGGREGATED data"`

This means `loadAggregatedEmployees()` is returning data, which means:
1. PRIORITY 0 in `getEmployeeMetrics()` is used
2. `isCertified` is set via `this.deriveIsCertified(employee)`
3. My context-resolver.ts fix is BYPASSED

### Remaining Question

If `deriveIsCertified()` in calculation-orchestrator.ts is correct (it normalizes whitespace), why is it returning `true` for "OPTOMETRISTA NO CERTIFICADO"?

**Possibilities**:
1. The `employee.role` field is empty or different than expected
2. There's a Unicode whitespace character that `\s+` doesn't match
3. The role data has a different string entirely (not "OPTOMETRISTA NO CERTIFICADO")
4. `employee.attributes?.isCertified` is explicitly set to `true` somewhere

---

## Full grep Output: All isCertified References

```
src/app/admin/reconciliation-test/page.tsx:46:        console.log('isCertified:', trace.isCertified);
src/app/admin/reconciliation-test/page.tsx:116:                <span className={`text-xs px-2 py-0.5 rounded ${trace.isCertified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
src/app/admin/reconciliation-test/page.tsx:117:                  {trace.isCertified ? 'Certified' : 'Non-Certified'}
src/components/reconciliation/ReconciliationTracePanel.tsx:121:            {trace.isCertified ? 'Certified' : 'Non-Certified'}
src/lib/reconciliation/employee-reconciliation-trace.ts:77:  isCertified: boolean;
src/lib/reconciliation/employee-reconciliation-trace.ts:200:  // Determine isCertified from role
src/lib/reconciliation/employee-reconciliation-trace.ts:202:  const isCertified = roleStr.includes('CERTIFICADO') && !roleStr.includes('NO CERTIFICADO');
src/lib/reconciliation/employee-reconciliation-trace.ts:204:  const variantSelection = traceVariantSelection(selectedPlan, isCertified);
src/lib/reconciliation/employee-reconciliation-trace.ts:279:    isCertified,
src/lib/reconciliation/employee-reconciliation-trace.ts:323:  isCertified: boolean
src/lib/reconciliation/employee-reconciliation-trace.ts:331:      employeeCriteria: { isCertified },
src/lib/reconciliation/employee-reconciliation-trace.ts:347:      if ('isCertified' in criteria) {
src/lib/reconciliation/employee-reconciliation-trace.ts:348:        if (criteria.isCertified === isCertified) {
src/lib/reconciliation/employee-reconciliation-trace.ts:349:          reason = `isCertified match: ${isCertified}`;
src/lib/reconciliation/employee-reconciliation-trace.ts:352:          reason = `isCertified mismatch: employee=${isCertified}, variant=${criteria.isCertified}`;
src/lib/reconciliation/employee-reconciliation-trace.ts:375:    employeeCriteria: { isCertified },
src/lib/reconciliation/employee-reconciliation-trace.ts:597:    isCertified: false,
src/lib/test/ob-15-calculation-test-cases.ts:26:  isCertified: true,
src/lib/test/ob-15-calculation-test-cases.ts:103:  isCertified: false,
src/lib/test/ob-15-calculation-test-cases.ts:168:  isCertified: true,
src/lib/test/ob-15-calculation-test-cases.ts:239:  isCertified: true,
src/lib/test/ob-15-calculation-test-cases.ts:310:  isCertified: false,
src/lib/compensation/retailcgmx-test.ts:38:  isCertified: true,
src/lib/compensation/retailcgmx-test.ts:58:  isCertified: false,
src/lib/compensation/calculation-engine.ts:29:  isCertified?: boolean;
src/lib/compensation/calculation-engine.ts:197:  // HF-019: Treat undefined isCertified as false (non-certified default)
src/lib/compensation/calculation-engine.ts:198:  const employeeIsCertified = metrics.isCertified ?? false;
src/lib/compensation/calculation-engine.ts:205:      'isCertified' in variant.eligibilityCriteria &&
src/lib/compensation/calculation-engine.ts:206:      variant.eligibilityCriteria.isCertified !== employeeIsCertified
src/lib/compensation/calculation-engine.ts:718:    isCertified: true,
src/lib/compensation/calculation-engine.ts:753:    isCertified: true,
src/lib/compensation/retailcgmx-validation.ts:34:    isCertified: true,
src/lib/compensation/retailcgmx-validation.ts:85:    isCertified: false,
src/lib/compensation/retailcgmx-plan.ts:353:          eligibilityCriteria: { isCertified: true },
src/lib/compensation/retailcgmx-plan.ts:388:          eligibilityCriteria: { isCertified: false },
src/lib/compensation/retailcgmx-plan.ts:427:          eligibilityCriteria: { isCertified: true },
src/lib/compensation/retailcgmx-plan.ts:434:          eligibilityCriteria: { isCertified: false },
src/lib/compensation/plan-storage.ts:514:          eligibilityCriteria: { isCertified: true },
src/lib/compensation/plan-storage.ts:686:          eligibilityCriteria: { isCertified: false },
src/lib/calculation/context-resolver.ts:42:  isCertified?: boolean;
src/lib/calculation/context-resolver.ts:142:      isCertified: employee.isCertified,
src/lib/calculation/context-resolver.ts:156:    isCertified: employee.isCertified,
src/lib/calculation/context-resolver.ts:362:      // HF-019: Derive isCertified from role string (normalize whitespace first)
src/lib/calculation/context-resolver.ts:368:      const isCertified = hasCertificado && !hasNoCertificado;
src/lib/calculation/context-resolver.ts:384:        isCertified,
src/lib/calculation/context-resolver.ts:589:        isCertified: true,
src/lib/calculation/context-resolver.ts:601:        isCertified: true,
src/lib/calculation/context-resolver.ts:613:        isCertified: false,
src/lib/calculation/context-resolver.ts:630:        isCertified: true,
src/lib/calculation/context-resolver.ts:642:        isCertified: true,
src/lib/orchestration/calculation-orchestrator.ts:550:   * OB-20 Phase 2: Derive isCertified from employee role
src/lib/orchestration/calculation-orchestrator.ts:556:    if (employee.attributes?.isCertified !== undefined) {
src/lib/orchestration/calculation-orchestrator.ts:557:      return Boolean(employee.attributes.isCertified);
src/lib/orchestration/calculation-orchestrator.ts:575:    const isCertified = hasCertificado && !hasNoCertificado;
src/lib/orchestration/calculation-orchestrator.ts:577:    return isCertified;
src/lib/orchestration/calculation-orchestrator.ts:594:        isCertified: this.deriveIsCertified(employee),
src/lib/orchestration/calculation-orchestrator.ts:611:        isCertified: this.deriveIsCertified(employee),
src/lib/orchestration/calculation-orchestrator.ts:641:        isCertified: this.deriveIsCertified(employee),
```

---

## Next Steps for Investigation

1. **Add logging to `deriveIsCertified()`** to see the actual `employee.role` value at runtime
2. **Check `employee.attributes?.isCertified`** - if explicitly set to `true`, it overrides role-based derivation
3. **Check the aggregated data** directly in localStorage to see what role string is stored for employee 90198149
4. **Trace which PRIORITY path** is actually being used for this employee

---

## Key Files to Investigate

| File | Line | Purpose |
|------|------|---------|
| `calculation-orchestrator.ts` | 550-577 | `deriveIsCertified()` - main derivation logic |
| `calculation-orchestrator.ts` | 556-557 | Checks `employee.attributes?.isCertified` FIRST |
| `calculation-orchestrator.ts` | 594, 611, 641 | Where isCertified is set on metrics |
| `context-resolver.ts` | 362-384 | My fix (may be bypassed) |
| `employee-reconciliation-trace.ts` | 200-202 | Different derivation for UI trace |

---

**Author**: Claude
**Date**: 2025-02-11
**Status**: FAILED - Root cause not yet identified
