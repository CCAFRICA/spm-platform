# HF-207 — Calc Trace Period/Batch Aggregation + Tenant Context Completion — Completion Report

**Date:** 2026-05-06
**Branch:** `hf-207-trace-tenant-agnostic-grand-totals`
**Baseline SHA (main):** `f6e3dca1b412bdeac834b50a593160adcc062e0a` (post-HF-206 merge)
**Phase 0 commit (DIAG-035):** `144a8a8f0abd262e4c2f94b00d746505d0c78f4d`
**Phase 1 commit (HF-207):** `bc922ade08d0d71270aee8d0e924077fd89188ab`
**Directive:** v4 (premise corrected at Phase 0 grep; §3.1 VARIANT-DIAG refactor dropped)
**Substrate citations:** T1-E905, T2-E46, T1-E953, T5-E1064.

---

## Hard Gates

### Gate 1 — Phase 0 AUD-005 refresh complete

```
$ ls -la docs/code-references/
total ...
AUD-005_CALC_EXECUTION_LIVE_REFERENCE_5314c365.md  (DEPRECATED header added)
AUD-005_CALC_EXECUTION_LIVE_REFERENCE_f6e3dca1.md  (new; 1779 lines)
```

DIAG-035 commit `144a8a8f`. Surface line shifts captured (post-HF-206 +5 propagation): HF-205 Shape C handoff 1786→1791, entityResults.push 1860→1865, addLog COMPLETE 2207→2212. New surface extracts added: VARIANT-DIAG block (route.ts:1391-1422) and handler-exit `NextResponse.json` block (route.ts:2214-2260).

Prior AUD-005 (`5314c365`) marked DEPRECATED with reference to f6e3dca1 successor.

### Gate 2 — Phase 1 §3.1 period_complete emission

Inserted at `web/src/app/api/calculation/run/route.ts` immediately before existing addLog COMPLETE line. New emission:

```typescript
const perEntityTotals: Record<string, number> = {};
for (const r of entityResults) {
  const externalId = ((r.metadata as Record<string, unknown>)?.externalId as string) || (r.entity_id as string);
  perEntityTotals[externalId] = r.total_payout;
}
const periodLabel = period?.canonical_key ?? 'n/a';
addLog(
  `[CalcTrace] runCalculation:period_complete` +
  ` | period=${periodLabel}` +
  ` | tenantId=${tenantId}` +
  ` | entitiesCalculated=${entityResults.length}` +
  ` | grandTotal=${grandTotal}` +
  ` | perEntityTotals=${JSON.stringify(perEntityTotals)}`
);
```

Per directive note: keys are entity external IDs (e.g., `BCL-5003`); falls back to UUID if external_id unavailable.

### Gate 3 — Phase 1 §3.2 batch_complete emission

Inserted immediately after period_complete, before existing addLog COMPLETE. New emission:

```typescript
addLog(
  `[CalcTrace] runCalculation:batch_complete` +
  ` | batchId=${batch.id}` +
  ` | tenantId=${tenantId}` +
  ` | ruleSetId=${ruleSetId}` +
  ` | periodsCalculated=1` +
  ` | crossPeriodGrandTotal=${grandTotal}` +
  ` | perPeriodGrandTotals=${JSON.stringify({ [periodLabel]: grandTotal })}`
);
```

Always-emit policy: single-period-per-call architecture means `periodsCalculated=1` and `crossPeriodGrandTotal === grandTotal`. Forward-compatible: if a future architectural change introduces in-handler multi-period iteration, only the `perPeriodGrandTotals` payload changes.

### Gate 4 — Phase 1 §3.3 tenantName context completion

Verified pre-patch: existing `[CalcTrace] context` emission at `route.ts:1056` did NOT include `tenantName`. Added:

```typescript
// HF-207: Fetch tenant name for trace context (best-effort; non-blocking).
const { data: tenantRow } = await supabase
  .from('tenants')
  .select('name')
  .eq('id', tenantId)
  .single();
const tenantName = tenantRow?.name ?? '(unknown)';

addLog(`[CalcTrace] context tenantId=${tenantId} tenantName=${tenantName} periodId=${periodId} periodLabel=${period?.canonical_key ?? 'n/a'} ruleSetId=${ruleSetId} ruleSetName=${ruleSet?.name ?? 'n/a'} calcBatchId=${batch.id}`);
```

Best-effort fetch with `(unknown)` fallback if Supabase query fails — non-blocking by design (calc completes even if tenant table is unavailable).

### Gate 5 — Build + lint + typecheck PASS

**Build (last lines):**
```
+ First Load JS shared by all                 88.1 kB
  ├ chunks/2117-a743d72d939a4854.js           31.9 kB
  ├ chunks/fd9d1056-5bd80ebceecc0da8.js       53.7 kB
  └ other shared chunks (total)               2.59 kB

ƒ Middleware                                  76 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```
Build PASS — full route table emitted, no errors.

**Lint (last lines):** Only pre-existing warnings (period-context.tsx, tenant-context.tsx, SCIExecution.tsx); no errors; no warnings on `route.ts`.

**Typecheck (`npx tsc --noEmit`):** Single pre-existing TS2345 in `__tests__/round-trip-closure/run.ts:285` (HF-198 γ origin per HF-205/HF-206 completion reports). Acceptable per HF-206 / HF-207 directive precedent. No new errors introduced by HF-207.

---

## Soft Gates

| Gate | Status | Evidence |
|---|---|---|
| §5.1 code-side scan (post-patch regression check) | PASS | All 3 greps return ZERO matches in production code paths (Spanish proper names, BCL tenant UUID, role identifiers). Matches baseline established at v3 review. |
| §5.2 tenant-agnosticism runtime gate | DEFERRED | Requires UI test on Meridian/CRP tenant. VARIANT-DIAG block unchanged — already first-3 dynamic via `entityMap.get(eid).display_name`. Architect post-merge verification confirms emission for whichever tenant runs calc. |
| §5.3 period_complete emission gate | PASS (code) / DEFERRED (runtime) | Code emits structured line with grandTotal and perEntityTotals. Runtime arithmetic confirmation deferred to post-merge UI test. |
| §5.4 batch_complete emission gate | PASS (code) / DEFERRED (runtime) | Code emits structured line. For single-period invocations (current architecture), `crossPeriodGrandTotal === grandTotal` and `perPeriodGrandTotals === { [periodLabel]: grandTotal }`. Runtime confirmation deferred. |
| §5.5 no regression gate | PASS | All existing trace surfaces preserved: `resolveMetricsFromConvergenceBindings:*`, `resolveColumnFromBatch:exit`, `executeBoundedLookup1D/2D:execution`, `runCalculation:component_complete`, per-entity totals. VARIANT-DIAG block emits exactly as before (no code change to that block). Only additions: period_complete, batch_complete, tenantName in context. |
| T1-E905 (Prove Don't Describe) | PASS | period_complete + batch_complete emit grandTotal in structured form, sufficient for log-based reconciliation evidence chain |
| T2-E46 (Reconciliation-Channel Separation) | PASS | Log-based reconciliation no longer requires UI dependency; architect-channel can verify grand totals from Vercel logs alone |
| T1-E953 (Decision-Implementation Gap) | PASS | HF-202/203/204 trace chain's reconciliation-aggregation gap closed |
| T5-E1064 (Procedural Theater Minimization) | PASS | §3.1 VARIANT-DIAG refactor dropped at Phase 0 grep finding; only the three valid emission additions remain (period_complete, batch_complete, tenantName) |

---

## Standing Rule Compliance

| Rule | Status | Notes |
|---|---|---|
| Rule 14 (prompts in git) | N/A | Architect-channel directive content not yet committed; expected via VG repo |
| Rule 24 (3-fix pivot) | N/A | First fix attempt; pivot rule not engaged |
| Rule 25 (validate whole flow before fixing parts) | **PASS — exemplary** | Phase 0 grep verification BEFORE patch caught directive premise §1.1 (VARIANT-DIAG hardcoded names) as empirically false. CC HALTed, surfaced finding to architect, awaited disposition. v4 directive removed §3.1 entirely. Procedural theater patch averted. |
| Rule 26 (Hard/Soft/Rules/Issues/Verification structure) | PASS | This report follows the structure |
| Rule 30 (operative-batch only data) | N/A | No engine data reads; pure code change |
| Korean Test (T1-E910) | PASS | All emissions structural; entity keys are external IDs read at runtime; no language-specific tokens |
| Channel separation (T2-E46) | PASS | Architect dispatches → CC executes (with pre-patch verification) → architect dispositions; v4 directive incorporated CC's empirical finding |

---

## Known Issues

1. **§5.2/§5.3/§5.4 runtime evidence deferred to post-merge UI test.** CC environment cannot run BCL/Meridian/CRP calc through UI. Architect verifies post-deploy by running calc and inspecting Vercel logs for:
   - `[CalcTrace] runCalculation:period_complete | ... | grandTotal=<X> | perEntityTotals={...}` — confirm sum of perEntityTotals values equals X
   - `[CalcTrace] runCalculation:batch_complete | ... | crossPeriodGrandTotal=<Y>` — confirm Y equals single period's grandTotal
   - `[CalcTrace] context tenantId=... tenantName=Banca Comercial Latinoamericana ...` — confirm tenantName populated correctly
   - VARIANT-DIAG lines emit for whichever tenant runs the calc (e.g., Meridian entity names if Meridian calc)

2. **`tenantName` fetch adds one Supabase query per calc invocation.** Cost: single-row select on `tenants` table by primary key — negligible. Non-blocking with fallback.

3. **Three architect-channel discipline failures captured across v1→v4** (per v4 §7):
   - Failure 1: Substrate-property assumption gap (HF-202/203/204 chain)
   - Failure 2: Path assertion without verification (v1/v2)
   - Failure 3: Code-state claim from runtime evidence (v1/v2/v3) — caught by CC §5.1 Phase 0 grep
   
   Substrate elevation candidates: (a) Diagnostic-Substrate Tenant-Agnosticism Constraint, (b) Architect-Channel Path-Assertion Discipline, (c) Architect-Channel Code-State-Claim Evidence Discipline, (d) Pre-Patch Verification Gate Discipline. All deferred to VG-side promotion wave per v4 §8.

4. **Existing addLog COMPLETE line retained for backward compatibility.** Order: `period_complete` → `batch_complete` → `COMPLETE` (existing). The `[CalcTrace]` sentinel is `batch_complete`; the `COMPLETE` line is human-readable summary in different format. Future cleanup OB could remove `COMPLETE` if log consumers are confirmed migrated, but out of HF-207 scope.

---

## Verification Script Output

### Phase 0 — DIAG-035 AUD-005 refresh (commit `144a8a8f`)

```
$ git log --oneline | head -3
bc922ade HF-207: calc trace period/batch aggregation + tenant context completion
144a8a8f DIAG-035: AUD-005 refresh f6e3dca1 (post-HF-206)
f6e3dca1 Merge pull request #370 from CCAFRICA/hf-206-ob118-merge-precedence-reversal
```

### Phase 1 — §5.1 code-side scan (post-patch regression check)

```
$ grep -nE "Gabriela|Vascones|Carlos Mauricio|Reyes Vega|Mauricio Sebastián|Ochoa Ibarra|Laura Elena|Suárez|Marcela Alejandra|Andrade Quinde" web/src/app/api/calculation/run/route.ts web/src/lib/calculation/intent-executor.ts web/src/lib/calculation/run-calculation.ts; echo $?
1
$ grep -nE "b1c2d3e4-aaaa-bbbb-cccc-111111111111" web/src/app/api/calculation/run/route.ts web/src/lib/calculation/intent-executor.ts web/src/lib/calculation/run-calculation.ts; echo $?
1
$ grep -nE "Ejecutivo Senior|\"Ejecutivo\"" web/src/app/api/calculation/run/route.ts web/src/lib/calculation/intent-executor.ts web/src/lib/calculation/run-calculation.ts; echo $?
1
```

All three greps exit 1 (no matches). PASS — no compile-time tenant identifiers in production calc-execution surface trio. Matches pre-patch baseline.

### Phase 1 — Build summary

Full Next.js route table emitted, 88.1 kB First Load JS, no errors. Lint reports only pre-existing warnings (none on `route.ts`).

### Phase 1 — Typecheck

Single pre-existing TS2345 in `__tests__/round-trip-closure/run.ts:285` (HF-198 γ origin). Acceptable per directive. No new errors.

### Diff against pre-patch (route.ts only):

- `[CalcTrace] context` extended with `tenantName=${tenantName}` field (1 line modified, plus 9 added for tenant fetch + comments)
- `runCalculation:period_complete` block added (16 lines)
- `runCalculation:batch_complete` block added (12 lines)
- `addLog COMPLETE` line unchanged (preserved for backward compat)

Total: 1 file changed, 43 insertions(+), 1 deletion(-).

---

## Architect Post-Merge Verification Checklist

After HF-207 merges and Vercel deploys, the architect runs calc through UI on any tenant and verifies:

- [ ] **`[CalcTrace] context` line includes `tenantName=...`** (e.g., `tenantName=Banca Comercial Latinoamericana` for BCL)
- [ ] **`runCalculation:period_complete` line emits** with structured fields:
  - `period=2025-10` (or current period)
  - `tenantId=...`
  - `entitiesCalculated=85` (BCL has 85 entities)
  - `grandTotal=<X>` (post-HF-206 BCL October expected: $44,590)
  - `perEntityTotals={"BCL-5003": 1400, "BCL-5004": ..., ...}` — sum equals X
- [ ] **`runCalculation:batch_complete` line emits** with:
  - `crossPeriodGrandTotal=<Y>` where Y === grandTotal
  - `perPeriodGrandTotals={"2025-10": <Y>}`
  - `periodsCalculated=1`
- [ ] **VARIANT-DIAG lines emit dynamically** for whichever tenant runs calc (e.g., BCL names for BCL, Meridian names if Meridian calc)
- [ ] **Two-invocation verification:** run Oct 2025 + Nov 2025 calc separately; each invocation emits well-formed `period_complete` + `batch_complete` pair
- [ ] **No regression:** all HF-204 trace surfaces still emit (resolveMetricsFromConvergenceBindings, resolveColumnFromBatch, executeBoundedLookup, runCalculation:component_complete, per-entity totals)

If verification PASSES: HF-207 closes the calc-trace reconciliation gap. Six-period BCL validation can proceed using log evidence alone (no UI dependency for grand-total reconciliation against ground truth).

If verification FAILS: paste full Vercel calc log + observed deviation here; architect-channel disposition follows.
