# HF-208 — Calc Log Reconciliation Repair Directive

**Date:** 2026-05-06
**Architect:** Andrew
**Channel:** Architect → CC dispatch
**Baseline SHA:** `2c4c0c32` (post-HF-207 merge)
**Branch:** `hf-208-calc-log-reconciliation-repair`
**Substrate citations:** T1-E905 (Prove Don't Describe), T2-E46 (Reconciliation-Channel Separation), T5-E1064 (Procedural Theater Minimization), Decision 153 LOCKED

---

## CC STANDING ARCHITECTURE RULES

(Include `CC_STANDING_ARCHITECTURE_RULES.md` v2.1+ verbatim at execution time. Required.)

---

## 1 — INTENT

The current calc log emits exhaustive per-metric trace ("the blizzard") but no readable reconciliation summary. HF-207 attempted to add summary emissions but did not deliver visible aggregation in production logs.

HF-208 repairs the log surface so that an architect reading Vercel logs can:

1. See the period grand total per invocation, on one line, near the end of the log
2. See per-entity totals as a single contiguous block, not interleaved with per-metric trace
3. See exception flags (diag003Fallback engagement, boundary fallback, OB-118 merge guard fires) summarized per period

HF-208 does NOT add expectedGT comparison, does NOT add API surface changes, does NOT add multi-period batch aggregation, does NOT touch the per-metric trace emissions (the blizzard is preserved as forensic backup).

This is a **log-emission-only patch**. No engine semantics change. No data flow change. No schema change.

---

## 2 — WHY THIS WORKS WITHOUT API CHANGES

The handler already has these values in scope at handler-exit time:

- `entityResults` array — each element has `entity_id`, `total_payout`, `metadata` (with externalId)
- `grandTotal` — already computed
- `tenantId`, `tenantName` (from HF-207), `period.canonical_key`, `batch.id`, `ruleSetId`, `ruleSet.name`
- Per-component metrics inside each entityResult — accessible via existing structures

What's needed beyond what's in scope: **counters** for the three exception flags. Those counters get incremented at the points where the exceptions already fire (and already emit to the trace), then summarized at handler-exit.

Three counters added. Three new log lines emitted. That's the entire diff scope.

---

## 3 — PATCH SCOPE

Single file: `web/src/app/api/calculation/run/route.ts`

### 3.1 — Add three counters at the top of the calc handler (after `tenantId` is established, before the entity loop)

```typescript
// HF-208: Reconciliation summary counters
let diag003FallbackCount = 0;
let boundaryFallbackCount = 0;
let ob118MergeGuardFiredCount = 0;
```

### 3.2 — Increment counters at existing emission sites

**`diag003FallbackCount`:** wherever the existing trace emits `diag003Fallback=true` (inside `resolveColumnFromBatch` or wherever that flag is currently observed in the handler scope), increment the counter. If the flag is observed in a function called by the handler rather than directly in handler scope, add an out-parameter or a returned counter object. Architect-channel preference: simplest implementation that doesn't restructure the call graph. If counters cannot be incremented from inside the resolver functions cleanly, count by post-hoc parsing of `entityResults` metadata if those resolvers leave breadcrumbs, OR emit the count as `(unavailable - see per-metric trace)` and surface that limitation honestly in the summary line. Do NOT fabricate the count.

**`boundaryFallbackCount`:** same pattern. Wherever HF-199 γ boundary fallback engages and currently emits trace, increment. Same fallback-to-honest-unavailable rule applies.

**`ob118MergeGuardFiredCount`:** wherever the HF-206 `if (!(key in metrics))` guard at lines 1613-1622 (per AUD-005 f6e3dca1) is the path where the inner block does NOT execute (i.e., the guard rejected a Pass 4 derivation because convergence already resolved the metric), increment. The current code path is silent on this — no existing trace line. Add a single increment, no new trace line per occurrence. The counter shows up in the summary.

If any of the three counters cannot be wired without surgery beyond log-emission scope, that counter's value emits as `(unavailable)` in the summary line and architect-channel disposition follows.

### 3.3 — Replace the existing handler-exit logging with a structured reconciliation block

After the entityResults loop completes, immediately before any existing terminal `addLog` calls, emit:

```typescript
// HF-208: Reconciliation summary block
const periodLabel = period?.canonical_key ?? 'n/a';
const totalLookups = entityResults.length * (ruleSet?.components?.length ?? 0);

addLog(`[CalcRecon] === RECONCILIATION SUMMARY ===`);
addLog(`[CalcRecon] tenant=${tenantName} period=${periodLabel} ruleSet="${ruleSet?.name ?? 'n/a'}" batchId=${batch.id}`);
addLog(`[CalcRecon] entitiesCalculated=${entityResults.length} grandTotal=${grandTotal}`);
addLog(`[CalcRecon] flags: diag003Fallback=${diag003FallbackCount}/${totalLookups} boundaryFallback=${boundaryFallbackCount}/${totalLookups} ob118MergeGuardFired=${ob118MergeGuardFiredCount}/${totalLookups}`);
addLog(`[CalcRecon] === PER-ENTITY TOTALS ===`);
for (const r of entityResults) {
  const externalId = ((r.metadata as Record<string, unknown>)?.externalId as string) || (r.entity_id as string);
  const entityName = ((r.metadata as Record<string, unknown>)?.displayName as string) || externalId;
  addLog(`[CalcRecon] ${externalId} | ${entityName} | total=${r.total_payout}`);
}
addLog(`[CalcRecon] === END SUMMARY ===`);
```

Total emissions per period: 4 + N entity lines + 1 = N+5 lines. For BCL: 90 lines per period, six periods = 540 reconciliation summary lines across the full run. Each line is short. All grepable by `[CalcRecon]`.

Architect-channel reconciliation workflow becomes: `grep CalcRecon` to extract the summary surface from any period's log, ignore the blizzard above it.

### 3.4 — DO NOT remove or modify any existing log emissions

The blizzard stays intact. HF-207's tenantName addition stays. Existing `[CalcAPI]`, `[CalcTrace]`, `[VARIANT-DIAG]`, `[VARIANT]` emissions stay untouched.

This is purely additive at the handler-exit point, plus three counter increments at existing emission sites. Zero subtraction.

### 3.5 — DO NOT touch HF-207's existing `period_complete` or `batch_complete` emissions

If they exist in the code, leave them. They are unverified at runtime but they don't conflict with `[CalcRecon]` block. HF-208 supersedes their intent in practice; cleanup of dead-code emissions is a separate-OB matter.

---

## 4 — HARD GATES

### Gate 1 — Patch landed at correct handler-exit location

Show the diff. Confirm placement is at handler-exit in route.ts, after the entityResults loop, before any `NextResponse.json` return.

### Gate 2 — Build PASS

`npm run build` exits 0. Paste last 20 lines.

### Gate 3 — Lint PASS

`npm run lint` exits 0 or matches pre-existing warning baseline. Paste any new warnings.

### Gate 4 — Typecheck PASS

`npx tsc --noEmit` exits 0 or matches pre-existing TS2345 in `__tests__/round-trip-closure/run.ts:285`. No new errors.

### Gate 5 — Counter wiring evidence

For each of the three counters, paste the exact code site where the increment happens and the exact code site where the existing trace emits the corresponding flag. Confirm they are the same site or one is reachable from the other in handler scope. If any counter is wired as `(unavailable)`, paste the reason and the wiring site that was attempted.

---

## 5 — POST-MERGE ARCHITECT VERIFICATION

After merge and Vercel deploy, architect runs BCL recalc one period (e.g., 2025-10), pulls Vercel log, runs `grep CalcRecon` on the output. Expected:

- ~90 lines emitted with `[CalcRecon]` prefix
- One `=== RECONCILIATION SUMMARY ===` opener
- One tenant/period/ruleSet/batch line
- One entitiesCalculated/grandTotal line — grandTotal value visible
- One flags line with three counters
- 85 per-entity total lines (sortable, summable)
- One `=== END SUMMARY ===` closer

If grandTotal in the flags line equals the sum of the 85 per-entity totals: internal consistency confirmed. If grandTotal matches BCL_Resultados_Esperados.xlsx for that period: reconciliation confirmed.

Six-period BCL reconciliation: run six periods, `grep CalcRecon | grep grandTotal` extracts six numbers, sum them, compare to $312,033.

No UI dependency. No expectedGT injection. Architect compares against GT spreadsheet manually (which is what was happening anyway, just buried under 2,720 trace lines).

---

## 6 — OUT OF SCOPE (explicit refusals)

The following are NOT in HF-208 scope and any expansion attempts during execution should HALT and surface to architect:

- expectedGT comparison machinery
- API surface changes (no `expectedResults` parameter)
- Cross-period batch aggregation (no batch_complete-equivalent at multi-period scope)
- topVariances sorting
- variantDistribution rollup
- VL-1/VL-2/VL-3/VL-4/VL-5 altitude structure (that's the design discussion architecture; HF-208 implements only the minimum to make the log readable)
- Removing or restructuring the per-metric blizzard
- Verbosity flags
- Schema changes
- Anything touching engine semantics

If during execution it becomes apparent that a counter cannot be wired without restructuring the call graph beyond log-emission-additive scope, HALT, surface the wiring problem, and emit that counter as `(unavailable)` in the summary block. Do not expand scope to fix it.

---

## 7 — KNOWN CONSTRAINTS

- The `[CalcRecon]` summary block emits at the END of the calc handler. If Vercel log truncation cuts before reaching it, the summary won't be visible. Architect-channel mitigation: tail the log with sufficient depth, OR if truncation is systematic, surface as a separate finding (this would mean HF-207's emissions never appeared for the same reason).

- The three counters are best-effort. If wiring the increments cleanly is not possible from handler scope (because the flag-emission sites live in resolver functions called from inside intent-executor and CC cannot pass counters down without restructuring), the counters emit `(unavailable)` and the summary still provides grandTotal + per-entity totals — which is the primary reconciliation requirement. Counters are the secondary nice-to-have.

- Per-entity total lines are emitted in entityResults order (calc-execution order). Not sorted. Architect can pipe through `sort -t'|' -k3 -n` if needed for variance review.

---

## 8 — SUBSTRATE CITATIONS (Implementation-Level)

- T1-E905 Prove Don't Describe: counters provide structured numerical evidence at handler-exit, not narrative
- T2-E46 Reconciliation-Channel Separation: log surface emits raw values; comparison happens architect-channel
- T5-E1064 Procedural Theater Minimization: zero new infrastructure, zero new API surface, zero new schema; just three counters and one summary block at the place where data already lives
- Decision 153 LOCKED: signal-surface architecture preserved; no new private state created

---

## 9 — VERSION HISTORY

- v1 (2026-05-06): initial draft, dispatched to CC

---

## 10 — DISPATCH FOOTER

CC may begin execution upon receipt of this directive. PR title: `HF-208: calc log reconciliation summary repair`. PR body: link to this directive plus the completion report when finished.
