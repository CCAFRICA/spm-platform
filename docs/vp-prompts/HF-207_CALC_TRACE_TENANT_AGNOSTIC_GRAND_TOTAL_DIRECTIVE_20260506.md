# HF-207 — Calc Trace: Tenant-Agnostic Refactor + Grand-Total Emission

**Status:** DIRECTIVE — pending architect review
**Date:** 2026-05-06
**Originating concern:** Architect-channel directive violation (HF-204 trace coupled to BCL-specific entity names; lacks reconciliation-grade aggregation emission)
**Defect class:** Diagnostic substrate not tenant-agnostic; trace insufficient for empirical reconciliation without UI dependency
**Scope:** TRACE LAYER ONLY — no calc semantic changes
**Substrate bindings:** T1-E905 Prove Don't Describe, T1-E952 Adjacent-Arm Drift Discipline (substrate must transcend single-tenant context), T2-E46 Reconciliation-Channel Separation

---

## 1. Empirical evidence (from HF-204 live trace output, 2026-05-06)

### 1.1 Tenant coupling defect

The `[VARIANT-DIAG]` trace block emits hardcoded entity names. Observed in trace output across all six period traces:

```
[VARIANT-DIAG] Gabriela Vascones Delgado: materializedState={"role":"Ejecutivo Senior"}
[VARIANT-DIAG] Gabriela Vascones Delgado: metadata.role="Ejecutivo Senior"
[VARIANT-DIAG] Gabriela Vascones Delgado: flatDataRows=2, sampleRowKeys=...
[VARIANT-DIAG] Carlos Mauricio Reyes Vega: ...
[VARIANT-DIAG] Mauricio Sebastián Ochoa Ibarra: ...
```

These three entity names are **BCL-tenant-specific values**, not dynamic references. For Meridian and CRP propagation diagnostic work, this trace produces zero output for the three hardcoded names (those entities don't exist in those tenants) and no output for actual Meridian/CRP entities of interest.

**Architectural violation:** A diagnostic substrate must be tenant-agnostic. T1-E952 (Adjacent-Arm Drift Discipline) requires diagnostic infrastructure to function uniformly across tenants without per-tenant code modification.

### 1.2 Reconciliation emission gap

The trace emits per-entity totals:
```
Gabriela Vascones Delgado: 1,505 | intent=1,505 ✓
Carlos Mauricio Reyes Vega: 1,025 | intent=1,025 ✓
Mauricio Sebastián Ochoa Ibarra: 594 | intent=594 ✓
```

But emits NO period-level grand total. Six-period verification therefore requires:
- Manual summation of 85 entity totals × 6 periods = 510 line items
- OR UI dependency for ground-truth reconciliation

For a calc system whose primary correctness gate is reconciliation against ground truth, this is a Prove Don't Describe (T1-E905) violation: the trace does not emit empirical evidence sufficient for the proof.

### 1.3 Cross-period batch defect

When multiple periods are calculated in succession (as in BCL six-period validation), each period emits independent traces with no batch-level aggregation. Multi-period grand total cannot be verified from log evidence alone.

---

## 2. Directive — required behavior

### 2.1 VARIANT-DIAG block: eliminate hardcoded names

**Current behavior:** Hardcoded names "Gabriela Vascones Delgado", "Carlos Mauricio Reyes Vega", "Mauricio Sebastián Ochoa Ibarra" emit per-entity diagnostics.

**Required behavior:** Iterate over the materialized state and emit VARIANT-DIAG for the FIRST N entities encountered (N=3 by default, parameterizable). Names are pulled dynamically from `materializedState` or equivalent state structure.

**Implementation pattern:**
```typescript
// Replace hardcoded named blocks with first-N iteration
const VARIANT_DIAG_SAMPLE_SIZE = 3;
const sampleEntities = Array.from(materializedState.entries()).slice(0, VARIANT_DIAG_SAMPLE_SIZE);
for (const [entityId, state] of sampleEntities) {
  const entityName = state.entityName ?? state.metadata?.name ?? entityId;
  addLog(`[VARIANT-DIAG] ${entityName}: materializedState=${JSON.stringify(...)}`);
  addLog(`[VARIANT-DIAG] ${entityName}: metadata.role=${...}`);
  // ... existing diag fields, all using dynamic entityName
}
```

**Constraint:** Sample size must be small (3-5) to keep traces readable. Full-population emission already occurs via `runCalculation:component_complete` lines for all entities.

### 2.2 Period-complete emission

After all entities complete for a given period, emit a single summary line:

```
[CalcAPI] [CalcTrace] runCalculation:period_complete
  | period=<periodLabel>
  | tenantId=<tenantId>
  | entitiesCalculated=<count>
  | grandTotal=<sum>
  | perEntityTotals={<entityId1>:<total1>, <entityId2>:<total2>, ...}
```

`grandTotal` is the sum of all per-entity intent totals for the period. `perEntityTotals` provides the full breakdown for reconciliation.

**Rationale:** Single line at period boundary enables:
- Direct ground-truth comparison from log evidence alone (no UI dependency)
- Tenant-agnostic verification (same line format for BCL, Meridian, CRP)
- T2-E46 architect-channel reconciliation without browser/UI access

### 2.3 Batch-complete emission (multi-period)

After all periods complete in a calc batch, emit:

```
[CalcAPI] [CalcTrace] runCalculation:batch_complete
  | batchId=<calcBatchId>
  | tenantId=<tenantId>
  | ruleSetId=<ruleSetId>
  | periodsCalculated=<count>
  | crossPeriodGrandTotal=<sum>
  | perPeriodGrandTotals={<period1>:<total1>, <period2>:<total2>, ...}
```

**Rationale:** Six-period BCL ground truth ($312,033) verifiable in single log line. Same for any multi-period calc on any tenant.

### 2.4 Tenant context emission consistency

Confirm that `[CalcTrace] context` line at calc start always emits:
- `tenantId`
- `tenantName` (if available; otherwise `tenantId` only is acceptable)
- `periodLabel`
- `ruleSetId`
- `ruleSetName`
- `calcBatchId`

Existing trace already emits most of these. Add `tenantName` if missing — required for log-based diagnostics across multiple concurrent tenants.

---

## 3. Out of scope (defer or separate)

- **Pass 4 derivation efficiency** (deferred to OB-185 follow-on; HF-206 Shape A guard makes this non-urgent)
- **Trace verbosity controls** (HF-204 chose always-on; HF-207 preserves that decision)
- **Trace persistence beyond Vercel runtime logs** (separate substrate concern)
- **Calc semantics** (HF-207 modifies trace output only; no convergence/intent-executor changes)

---

## 4. Implementation surface (per current code structure inferred from trace output)

The following functions/sites are involved per HF-204 implementation pattern:

1. **VARIANT-DIAG block** — wherever the three hardcoded `[VARIANT-DIAG] <name>:` lines emit (likely a switch or sequential block targeting specific names). Replace with first-N iteration over materialized state.
2. **Per-entity total emission** — currently emits `<name>: <total> | intent=<total> ✓` after each entity. No change required; this is the data source for period-complete aggregation.
3. **Period-complete site** — after the final entity of a period completes (where `Period: <label>` was logged at start). Add aggregation and emission.
4. **Batch-complete site** — at the end of the calc API handler, after all periods processed. Add cross-period aggregation.

**PCD discipline note:** CC must verify the actual code surface against AUD-005 (or refresh AUD-005 if stale relative to current main commit) before drafting the patch. The VARIANT-DIAG hardcoded names site, in particular, must be verified — the trace evidence shows hardcoding but does not specify the implementation idiom (switch statement, if-chain, or iterator with name-filter).

---

## 5. Verification gate

Before merging HF-207, CC must produce trace output from a test calc demonstrating:

1. **VARIANT-DIAG dynamic:** Run calc on Meridian or CRP tenant. VARIANT-DIAG lines must emit for actual entities present in that tenant, NOT for the three BCL names. Sample size 3.
2. **Period-complete:** Single trace line at each period boundary showing grand total. Sum of per-entity totals visible in trace must equal grand total.
3. **Batch-complete (multi-period):** For a multi-period calc, single trace line at batch end with cross-period total. Sum of per-period grand totals must equal cross-period grand total.
4. **No regression:** Existing per-entity per-component traces preserved; no removal of HF-204 diagnostic surface.

---

## 6. Architect approval gate

This directive does NOT proceed to implementation until architect confirms:

1. Three-entity VARIANT-DIAG sample size acceptable (vs. 5 or different N)
2. Period-complete emission format acceptable (key=value pipe-delimited matches existing trace style)
3. Batch-complete location acceptable (at calc API handler exit, before response)
4. Verification gate sufficient

---

## 7. Failure-mode acknowledgment

The HF-202 → HF-203 → HF-204 design chain failed to specify tenant-agnosticism as a substrate property. Claude (architect-channel) drafted HF-202/203/204 directives focused on toggle/persistence concerns and did not audit for tenant coupling. The empirical defect surfaced only when six-period BCL trace evidence was reviewed and the architect identified the BCL-specific entity names.

This is a Decision-Implementation Gap (T1-E953) on the architect-channel side: a substrate property (tenant-agnosticism) was assumed but not specified, and CC implemented to literal directive without surfacing the gap.

HF-207 closes the immediate gap. The substrate-level lesson — diagnostic infrastructure directives must explicitly specify tenant-agnosticism as a constraint — is candidate for VG-side ICA capture.

---

## 8. Substrate candidate (VG-side, deferred)

Pattern to capture: **Diagnostic-Substrate Tenant-Agnosticism Constraint**
- Diagnostic infrastructure that emits trace, log, or audit data MUST treat tenant-specific identifiers (names, IDs, labels) as inputs read from runtime state, never as compile-time constants
- Verification gate for any new diagnostic capability: produce evidence the diagnostic functions correctly across at least 2 tenants without code modification
- Anti-pattern: hardcoded entity/tenant identifiers in trace blocks for "convenience during initial debugging" — these become technical debt that breaks cross-tenant diagnostic work

---

## END OF DIRECTIVE
