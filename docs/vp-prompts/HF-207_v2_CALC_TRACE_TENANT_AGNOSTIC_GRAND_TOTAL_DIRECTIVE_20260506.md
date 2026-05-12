# HF-207 v2 — Calc Trace: Tenant-Agnostic Refactor + Grand-Total Emission

**Status:** DIRECTIVE — gates locked, ready for CC dispatch
**Date:** 2026-05-06
**Version:** v2 (supersedes v1; incorporates architect gate confirmations + staleness bundling)
**Originating concern:** Architect-channel directive violation (HF-204 trace coupled to BCL-specific entity names; lacks reconciliation-grade aggregation emission)
**Defect class:** Diagnostic substrate not tenant-agnostic; trace insufficient for empirical reconciliation without UI dependency
**Scope:** TRACE LAYER ONLY — no calc semantic changes
**Substrate bindings:** T1-E905 Prove Don't Describe, T1-E952 Adjacent-Arm Drift Discipline (substrate must transcend single-tenant context), T2-E46 Reconciliation-Channel Separation, T1-E953 Decision-Implementation Gap Pattern (failure mode being remediated)

---

## 1. Empirical evidence (from HF-204 live trace output, 2026-05-06)

### 1.1 Tenant coupling defect

The `[VARIANT-DIAG]` trace block emits hardcoded entity names. Observed across all six BCL period traces:

```
[VARIANT-DIAG] Gabriela Vascones Delgado: materializedState={"role":"Ejecutivo Senior"}
[VARIANT-DIAG] Gabriela Vascones Delgado: metadata.role="Ejecutivo Senior"
[VARIANT-DIAG] Gabriela Vascones Delgado: flatDataRows=2, sampleRowKeys=...
[VARIANT-DIAG] Carlos Mauricio Reyes Vega: ...
[VARIANT-DIAG] Mauricio Sebastián Ochoa Ibarra: ...
```

These three entity names are BCL-tenant-specific compile-time constants. For Meridian and CRP propagation diagnostic work, this trace produces zero output for the three hardcoded names (those entities don't exist in those tenants) and no output for actual Meridian/CRP entities of interest.

**Architectural violation:** A diagnostic substrate must be tenant-agnostic. T1-E952 (Adjacent-Arm Drift Discipline) requires diagnostic infrastructure to function uniformly across tenants without per-tenant code modification.

### 1.2 Reconciliation emission gap

The trace emits per-entity totals:
```
Gabriela Vascones Delgado: 1,505 | intent=1,505 ✓
Carlos Mauricio Reyes Vega: 1,025 | intent=1,025 ✓
```

But emits NO period-level grand total. Six-period verification therefore requires:
- Manual summation of 85 entity totals × 6 periods = 510 line items
- OR UI dependency for ground-truth reconciliation

For a calc system whose primary correctness gate is reconciliation against ground truth, this is a Prove Don't Describe (T1-E905) violation: the trace does not emit empirical evidence sufficient for the proof.

### 1.3 Cross-period batch defect

When multiple periods are calculated in succession (as in BCL six-period validation), each period emits independent traces with no batch-level aggregation. Multi-period grand total cannot be verified from log evidence alone.

---

## 2. Phase 0 — AUD-005 refresh (PRECEDES patch implementation)

**Rationale:** AUD-005 baseline at commit `5314c365` is stale relative to current main (`f6e3dca1`, post-HF-206 merge `eaf5ac5c`). HF-206 modified `route.ts:1613-1622` (OB-118 merge precedence reversal). Per DIAG-034 refresh discipline, AUD-005 must be regenerated before any patch grounds against its line references.

**Phase 0 deliverable:**

1. Regenerate `AUD-005_CALC_EXECUTION_LIVE_REFERENCE_f6e3dca1.md` from current HEAD using the same generation procedure as 5314c365
2. Verify regenerated file contains:
   - Updated line references for `route.ts` calc handler (post-HF-206 OB-118 merge guard at lines 1613-1622)
   - Current `intent-executor.ts` surface
   - Current `run-calculation.ts` surface
3. Mark `AUD-005_CALC_EXECUTION_LIVE_REFERENCE_5314c365.md` as superseded by adding header:
   ```markdown
   # ⚠️ DEPRECATED — superseded by AUD-005_CALC_EXECUTION_LIVE_REFERENCE_f6e3dca1.md
   # This snapshot is retained for historical reference only.
   # Refresh reason: HF-206 (OB-118 merge precedence reversal) modified calc-execution surface.
   ```
4. Phase 0 commit message: `DIAG-035: AUD-005 refresh f6e3dca1 (post-HF-206)`

**Phase 0 verification gate:** Architect or CC confirms regenerated AUD-005 contains the HF-206 guard pattern at expected line range. Upon confirmation, Phase 1 (patch) proceeds.

---

## 3. Phase 1 — Patch implementation directive

### 3.1 VARIANT-DIAG block: eliminate hardcoded names

**Current behavior (per trace evidence):** Hardcoded names "Gabriela Vascones Delgado", "Carlos Mauricio Reyes Vega", "Mauricio Sebastián Ochoa Ibarra" emit per-entity diagnostics. Implementation idiom unknown without AUD-005 refresh; CC must verify against Phase 0 deliverable.

**Required behavior:** Iterate over the materialized state and emit VARIANT-DIAG for the FIRST N entities encountered (N=3 by default, parameterizable). Names pulled dynamically from `materializedState` or equivalent state structure.

**Required constant (module scope):**
```typescript
// Number of entities for which to emit detailed VARIANT-DIAG sample blocks.
// Tenant-agnostic by design — adjust per noise budget without code change.
const VARIANT_DIAG_SAMPLE_SIZE = 3;
```

**Implementation pattern (verify exact site against refreshed AUD-005):**
```typescript
const sampleEntities = Array.from(materializedState.entries()).slice(0, VARIANT_DIAG_SAMPLE_SIZE);
for (const [entityId, state] of sampleEntities) {
  const entityName = state.entityName ?? state.metadata?.name ?? entityId;
  addLog(`[CalcAPI] [VARIANT-DIAG] ${entityName}: materializedState=${JSON.stringify(state.materializedState ?? state)}`);
  addLog(`[CalcAPI] [VARIANT-DIAG] ${entityName}: metadata.role="${state.metadata?.role ?? ""}"`);
  addLog(`[CalcAPI] [VARIANT-DIAG] ${entityName}: flatDataRows=${state.flatData?.length ?? 0}, sampleRowKeys=${...}`);
  addLog(`[CalcAPI] [VARIANT-DIAG] ${entityName}: generated tokens=[${...}]`);
  addLog(`[CalcAPI] [VARIANT-DIAG] ${entityName}: V0 disc=[${...}], V1 disc=[${...}]`);
}
addLog(`[CalcAPI] [VARIANT-DIAG] materializedState.size=${materializedState.size}, calculationEntityIds.length=${calculationEntityIds.length}`);
```

**Constraint:** Sample size must be small (3 default; parameterizable). Full-population emission already occurs via `runCalculation:component_complete` lines for all entities — no information is lost by sampling VARIANT-DIAG.

### 3.2 Period-complete emission

After all entities complete for a given period, emit a single summary line. **Format uses `JSON.stringify` for `perEntityTotals` to ensure grep-parseability:**

```typescript
const perEntityTotals: Record<string, number> = {};
let grandTotal = 0;
for (const [entityId, result] of perEntityResults.entries()) {
  perEntityTotals[entityId] = result.intentTotal;
  grandTotal += result.intentTotal;
}

addLog(
  `[CalcAPI] [CalcTrace] runCalculation:period_complete` +
  ` | period=${periodLabel}` +
  ` | tenantId=${tenantId}` +
  ` | entitiesCalculated=${perEntityResults.size}` +
  ` | grandTotal=${grandTotal}` +
  ` | perEntityTotals=${JSON.stringify(perEntityTotals)}`
);
```

**Rationale:** Single line at period boundary enables:
- Direct ground-truth comparison from log evidence alone (no UI dependency)
- Tenant-agnostic verification (same line format for BCL, Meridian, CRP)
- T2-E46 architect-channel reconciliation without browser/UI access
- Grep-parseable JSON breakdown for downstream tooling

**Note on entity key choice:** `perEntityTotals` keys SHOULD be entity external IDs (e.g., `BCL-5003`) rather than UUIDs, matching the convention at `runCalculation:entity_start entity=BCL-5003`. This makes log-to-ground-truth reconciliation direct.

### 3.3 Batch-complete emission (always emit, single-period or multi)

After all periods complete in a calc batch, **always emit batch_complete** regardless of period count (per architect Gate 3 confirmation: log-shape consistency over line economy):

```typescript
const perPeriodGrandTotals: Record<string, number> = {};
let crossPeriodGrandTotal = 0;
for (const [periodLabel, periodResult] of allPeriodResults.entries()) {
  perPeriodGrandTotals[periodLabel] = periodResult.grandTotal;
  crossPeriodGrandTotal += periodResult.grandTotal;
}

addLog(
  `[CalcAPI] [CalcTrace] runCalculation:batch_complete` +
  ` | batchId=${calcBatchId}` +
  ` | tenantId=${tenantId}` +
  ` | ruleSetId=${ruleSetId}` +
  ` | periodsCalculated=${allPeriodResults.size}` +
  ` | crossPeriodGrandTotal=${crossPeriodGrandTotal}` +
  ` | perPeriodGrandTotals=${JSON.stringify(perPeriodGrandTotals)}`
);
```

**Always-emit rationale:** A downstream parser/grep operator expects a uniform terminal line at every calc batch end. For single-period calls, `batch_complete` will be a near-duplicate of `period_complete` — that's acceptable redundancy in service of consistency. Single-period consumers can ignore one line; multi-period consumers need both.

**Site:** At calc API handler exit, before `NextResponse.json(...)` return. Co-located with the existing addLog COMPLETE line at `route.ts:2207` per AUD-005 (verify exact line against refreshed AUD-005).

### 3.4 Tenant context emission consistency

Confirm that `[CalcTrace] context` line at calc start emits all of:
- `tenantId`
- `tenantName` (add if missing — required for log-based diagnostics across multiple concurrent tenants)
- `periodId`
- `periodLabel`
- `ruleSetId`
- `ruleSetName`
- `calcBatchId`

Existing trace already emits most of these per evidence at `2026-05-06 18:01:19.917 [info] [CalcAPI] [CalcTrace] context tenantId=...`. CC must verify whether `tenantName` is currently emitted; add if missing.

---

## 4. Out of scope (defer or separate)

- **Pass 4 derivation efficiency** (deferred to OB-185 follow-on; HF-206 Shape A guard makes this non-urgent)
- **Trace verbosity controls** (HF-204 chose always-on; HF-207 preserves that decision)
- **Trace persistence beyond Vercel runtime logs** (separate substrate concern)
- **Calc semantics** (HF-207 modifies trace output only; no convergence/intent-executor changes)

---

## 5. Verification gate (5-item, expanded per architect Gate 4)

Before merging HF-207, CC must produce the following evidence:

### 5.1 Code-side scan (NEW — implementation gate per architect Gate 4)

CC runs the following greps over the modified files and includes raw output in completion report:

```bash
# Hardcoded BCL entity names (Spanish proper names from flat data)
grep -nE "Gabriela|Vascones|Carlos Mauricio|Reyes Vega|Mauricio Sebastián|Ochoa Ibarra|Laura Elena|Suárez|Marcela Alejandra|Andrade Quinde" \
  src/app/api/calc/run/route.ts \
  src/lib/intent-executor.ts \
  src/lib/run-calculation.ts

# Hardcoded BCL tenant UUID
grep -nE "b1c2d3e4-aaaa-bbbb-cccc-111111111111" \
  src/app/api/calc/run/route.ts \
  src/lib/intent-executor.ts \
  src/lib/run-calculation.ts

# Hardcoded role values when used as compile-time identifiers (not test data)
grep -nE "Ejecutivo Senior|\"Ejecutivo\"" \
  src/app/api/calc/run/route.ts \
  src/lib/intent-executor.ts \
  src/lib/run-calculation.ts
```

**Pass condition:** All three greps return ZERO matches in production code paths. Matches in `__tests__/` directories or fixture files are acceptable (test data is correctly tenant-coupled by design).

This gate converts §7 substrate-level lesson into an implementation enforcement: the substrate constraint "diagnostic infrastructure must not contain compile-time tenant identifiers" is verified at patch level, not just at runtime.

### 5.2 Tenant-agnosticism runtime gate

Run calc on Meridian or CRP tenant. VARIANT-DIAG lines must emit for actual entities present in that tenant, NOT for the three BCL names. Sample size 3.

**Evidence required:** Meridian (or CRP) calc trace excerpt showing `[VARIANT-DIAG] <Meridian-or-CRP-entity-name>: ...` lines for first 3 entities.

### 5.3 Period-complete emission gate

For any calc, single trace line emits at each period boundary showing grand total. Sum of per-entity totals visible in trace must equal `grandTotal`.

**Evidence required:** Trace excerpt showing `runCalculation:period_complete | ... | grandTotal=<X> | perEntityTotals={...}` and arithmetic confirmation that sum of `perEntityTotals` values equals `X`.

### 5.4 Batch-complete emission gate (multi-period)

For a multi-period calc, single trace line at batch end with cross-period total. Sum of per-period grand totals must equal `crossPeriodGrandTotal`.

**Evidence required:** Trace excerpt from a 2+ period calc showing `runCalculation:batch_complete | ... | crossPeriodGrandTotal=<Y> | perPeriodGrandTotals={...}` and arithmetic confirmation.

**Single-period gate:** For single-period calc, `batch_complete` MUST also emit (always-emit confirmation). Evidence: trace excerpt from any single-period calc showing both `period_complete` and `batch_complete` lines.

### 5.5 No regression gate

Existing per-entity per-component traces preserved; no removal of HF-204 diagnostic surface. Specifically:
- `[CalcTrace] resolveMetricsFromConvergenceBindings:*` lines still emit per component
- `[CalcTrace] resolveColumnFromBatch:exit` lines still emit per metric resolution
- `[CalcTrace] executeBoundedLookup1D:execution` and `executeBoundedLookup2D:execution` still emit
- `[CalcTrace] runCalculation:component_complete` still emits per component
- Per-entity total `<name>: <total> | intent=<total> ✓` still emits per entity

**Evidence required:** Diff comparison between pre-HF-207 and post-HF-207 trace output for the same calc. Only additions; no removals (except the BCL-hardcoded VARIANT-DIAG lines, which are replaced by tenant-agnostic equivalents).

---

## 6. Architect approval gates (LOCKED)

All four v1 gates confirmed by architect 2026-05-06:

| Gate | Decision |
|------|----------|
| 1. VARIANT-DIAG sample size N | **N=3** with `VARIANT_DIAG_SAMPLE_SIZE` constant for parameterization |
| 2. Period-complete format | Pipe-delimited matching existing style; `perEntityTotals` via `JSON.stringify` for grep-parseability |
| 3. Batch-complete location | Calc API handler exit before `NextResponse.json(...)`; **always emit** regardless of period count |
| 4. Verification gate | 5-item gate including code-side compile-time identifier scan (§5.1) as implementation enforcement of substrate constraint |

Plus staleness handling: **AUD-005 refresh bundled as Phase 0** (DIAG-035), preceding patch implementation.

---

## 7. Failure-mode acknowledgment

The HF-202 → HF-203 → HF-204 design chain failed to specify tenant-agnosticism as a substrate property. Claude (architect-channel) drafted those directives focused on toggle/persistence concerns and did not audit for tenant coupling. The empirical defect surfaced only when six-period BCL trace evidence was reviewed and the architect identified BCL-specific entity names hardcoded in VARIANT-DIAG.

This is a Decision-Implementation Gap (T1-E953) on the architect-channel side: a substrate property (tenant-agnosticism) was assumed but not specified, and CC implemented to literal directive without surfacing the gap.

HF-207 closes the immediate gap. The substrate-level lesson — diagnostic infrastructure directives must explicitly specify tenant-agnosticism as a constraint, AND verification gates must include compile-time identifier scans — is captured in §5.1 (implementation enforcement) and is candidate for VG-side ICA capture.

---

## 8. Substrate candidate (VG-side, deferred to promotion wave)

**Pattern: Diagnostic-Substrate Tenant-Agnosticism Constraint**

Diagnostic infrastructure that emits trace, log, or audit data MUST treat tenant-specific identifiers (names, IDs, labels) as inputs read from runtime state, never as compile-time constants.

**Verification gate for any new diagnostic capability:**
1. Code-side: grep modified files for known tenant-specific identifiers; pass condition is zero matches in production code paths
2. Runtime: produce evidence the diagnostic functions correctly across at least 2 tenants without code modification

**Anti-pattern:** Hardcoded entity/tenant identifiers in trace blocks for "convenience during initial debugging" — these become technical debt that breaks cross-tenant diagnostic work. Common manifestation: developer debugging tenant A hardcodes A's entity names; subsequent diagnostic work on tenant B silently produces no output.

**Substrate elevation rationale:** This pattern is general beyond calc-trace work. Any diagnostic surface (audit logs, debug traces, operational metrics) that treats tenant identifiers as constants violates substrate-agnosticism and creates cross-tenant blind spots.

---

## END OF v2 DIRECTIVE

**Awaiting architect confirmation to proceed to CC dispatch as single PR (Phase 0 + Phase 1).**
