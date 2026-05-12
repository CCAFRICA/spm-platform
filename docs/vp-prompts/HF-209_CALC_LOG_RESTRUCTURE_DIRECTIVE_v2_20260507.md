# HF-209 v2 — Calc Log Restructure: Summary-First, Per-Variant Trace Cap

**Date:** 2026-05-07
**Architect:** Andrew
**Channel:** Architect → CC dispatch
**Baseline SHA:** post-HF-208 merge
**Branch:** `hf-209-calc-log-restructure`
**Substrate citations:** T1-E905 (Prove Don't Describe), T2-E46 (Reconciliation-Channel Separation), T5-E1064 (Procedural Theater Minimization), Decision 153 LOCKED

---

## CC STANDING ARCHITECTURE RULES

(Include `CC_STANDING_ARCHITECTURE_RULES.md` v2.1+ verbatim at execution time. Required.)

---

## 1 — INTENT

Restructure the calc log so that:

1. **Reconciliation summary emits FIRST** (after setup), not at handler-exit. Architect's first-screen view is the totals.
2. **Per-entity trace forensics emit LAST**, capped at N=5 entities per variant (not per period).

Current state: ~2,720 trace lines per period drown the [CalcRecon] summary at the bottom (HF-208) and HF-207's period_complete/batch_complete emissions. Both are invisible in practice.

Target state: setup → [CalcRecon] summary block (visible at top of any log paste) → per-entity total summary lines → forensic trace for first N=5 entities of each variant → handler-exit lines (HF-207, COMPLETE).

This is a single-file restructure. No engine semantics change. No counter changes (HF-208 counters still increment for ALL 85 entities). No API changes. No schema changes.

---

## 2 — RATIONALE FOR PER-VARIANT CAP

BCL has three variants per the rule set: `variant_0(senior)`, `variant_0(ejecutivo)` (default), `variant_1(default_last)`. Five entities per variant = 15 traced entities total for BCL. This guarantees forensic coverage of every variant path the calc engine exercises, regardless of the variant distribution across the 85 entities.

Generalizes cleanly: tenant with V variants × 5 entities = 5V traced entities. For BCL: 15. For a hypothetical tenant with 5 variants: 25. Total log volume per period stays bounded.

The cap is per-variant because variant selection determines which rule path executes, and forensic visibility requires at least one example of each path. Five gives margin for verifying band coverage and edge cases within each variant.

---

## 3 — PATCH SCOPE

Single file: `web/src/app/api/calculation/run/route.ts`

### 3.1 — Add trace buffer and per-variant cap state at top of handler

```typescript
// HF-209: Trace buffer — collect during calc, flush after summary
const traceBuffer: string[] = [];

// HF-209: Per-variant trace cap state
const TRACE_CAP_PER_VARIANT = 5;
const variantTraceCounts = new Map<string, number>();  // variant key → count admitted
const tracedEntityIds = new Set<string>();              // entities admitted for tracing
```

### 3.2 — Add helper functions in handler scope

```typescript
function shouldEmitTrace(entityExternalId: string, variantKey: string): boolean {
  // Entity already admitted: always emit (internal consistency)
  if (tracedEntityIds.has(entityExternalId)) return true;
  
  // Variant cap not reached: admit this entity
  const currentCount = variantTraceCounts.get(variantKey) ?? 0;
  if (currentCount < TRACE_CAP_PER_VARIANT) {
    variantTraceCounts.set(variantKey, currentCount + 1);
    tracedEntityIds.add(entityExternalId);
    return true;
  }
  return false;
}

function bufferTrace(line: string): void {
  traceBuffer.push(line);
}
```

`variantKey` should be derived from the variant decision per entity. Use whatever string identifies a variant uniquely in the existing code — likely `variantSelected` (0/1) plus `discriminantToken` (senior/ejecutivo/etc.) concatenated. CC: read AUD-005 to identify the canonical variant identifier in scope at trace-emission time, use that. If unclear, ask architect.

### 3.3 — Replace direct addLog calls for forensic trace with bufferTrace, behind cap

For each of these emission sites, replace `addLog(...)` with the conditional buffer pattern:

**Sites to redirect to buffer:**
- `[CalcTrace] resolveMetricsFromConvergenceBindings:entry`
- `[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied`
- `[CalcTrace] resolveMetricsFromConvergenceBindings:exit`
- `[CalcTrace] resolveColumnFromBatch:exit`
- `[CalcTrace] resolveSource:metric_lookup`
- `[CalcTrace] executeBoundedLookup1D:execution`
- `[CalcTrace] executeBoundedLookup2D:execution`
- `[CalcTrace] runCalculation:entity_start`
- `[CalcTrace] runCalculation:component_complete`

Pattern at each site:
```typescript
if (shouldEmitTrace(entityExternalId, variantKey)) {
  bufferTrace(`[CalcTrace] resolveColumnFromBatch:exit entity=${entityExternalId} | ...`);
}
```

### 3.4 — Restructure handler-exit emission order

After the entity loop completes, emit in this exact order:

```typescript
// 1. [CalcRecon] reconciliation summary (HF-208 block)
addLog(`[CalcRecon] === RECONCILIATION SUMMARY ===`);
addLog(`[CalcRecon] tenant=${tenantName} period=${periodLabel} ruleSet="${ruleSet?.name ?? 'n/a'}" batchId=${batch.id}`);
addLog(`[CalcRecon] entitiesCalculated=${entityResults.length} grandTotal=${grandTotal}`);
addLog(`[CalcRecon] flags: diag003Fallback=${diag003FallbackCount}/${reconTotalLookups} boundaryFallback=${boundaryFallbackCount} ob118MergeGuardFired=${ob118MergeGuardFiredCount}/${reconTotalLookups}`);
addLog(`[CalcRecon] variantsTraced: ${Array.from(variantTraceCounts.entries()).map(([v, n]) => `${v}=${n}`).join(' ')}`);
addLog(`[CalcRecon] === PER-ENTITY TOTALS ===`);
for (const r of entityResults) {
  const externalId = ((r.metadata as Record<string, unknown>)?.externalId as string) || (r.entity_id as string);
  const entityName = ((r.metadata as Record<string, unknown>)?.entityName as string) || externalId;
  addLog(`[CalcRecon] ${externalId} | ${entityName} | total=${r.total_payout}`);
}
addLog(`[CalcRecon] === END SUMMARY ===`);

// 2. Forensic trace dump (buffered during calc, flush now)
addLog(`[CalcTrace] === FORENSIC TRACE (capped: ${TRACE_CAP_PER_VARIANT} entities per variant) ===`);
for (const line of traceBuffer) {
  addLog(line);
}
addLog(`[CalcTrace] === END FORENSIC TRACE ===`);

// 3. Existing handler-exit emissions (HF-207 period_complete, batch_complete, COMPLETE) stay where they are
```

Architect reading log gets, in order: setup → summary → per-entity totals → flag counts → variant trace coverage → forensic trace block. First-screen visibility for everything that matters.

### 3.5 — DO NOT redirect these (stay direct addLog, all 85 entities)

- `[VARIANT]` selection line per entity (low volume, ~85 lines, useful for variant distribution audit)
- `EntityName: total | intent=total ✓` per-entity total summary line (~85 lines, used by existing HF-207 emissions and serves as cross-check against [CalcRecon] block)
- `[VARIANT-DIAG]` block (already capped to first 3 by existing code; leave as-is)
- All `[CalcAPI]` setup lines
- HF-207 `period_complete` / `batch_complete` lines (stay at handler-exit per HF-207 placement)

These are emitted in real-time order during calc, not buffered.

### 3.6 — Counter wiring is unaffected

HF-208 counters increment at sites OUTSIDE the trace emission blocks (in resolver function bodies, in the merge logic). They count ALL events for ALL 85 entities regardless of whether the corresponding trace line was buffered or suppressed. The [CalcRecon] flags line continues to report accurate totals.

---

## 4 — HARD GATES

### Gate 1 — Patch landed

Show diff. Confirm:
- `traceBuffer`, `TRACE_CAP_PER_VARIANT`, `variantTraceCounts`, `tracedEntityIds` declarations
- `shouldEmitTrace` and `bufferTrace` helpers
- ~9 emission sites converted to `if (shouldEmitTrace(...)) bufferTrace(...)` pattern
- Handler-exit reordered: [CalcRecon] block → forensic trace dump → HF-207 emissions

### Gate 2 — Build PASS

`npm run build` exits 0.

### Gate 3 — Lint PASS

`npm run lint` exits 0 or matches pre-existing baseline.

### Gate 4 — Typecheck PASS

`npx tsc --noEmit` exits 0 or matches pre-existing TS2345 in `__tests__/round-trip-closure/run.ts:285`.

### Gate 5 — Wrapping evidence

```
grep -nE "\[CalcTrace\]" web/src/app/api/calculation/run/route.ts
```

For each match, show whether it's wrapped in `shouldEmitTrace`/`bufferTrace` pattern or in the §3.5 exclusion list.

### Gate 6 — Variant key identification

Paste the variantKey expression used at trace sites. Confirm it captures variant_0/variant_1 + discriminant token combination per AUD-005 reading.

---

## 5 — POST-MERGE ARCHITECT VERIFICATION

After merge and Vercel deploy, architect runs BCL recalc one period. Pulls Vercel log via standard paste mechanism.

Expected log structure (top to bottom):

1. ~25 lines of `[CalcAPI]` setup
2. 1 `[CalcTrace] context` line
3. ~12 lines `[VARIANT-DIAG]` (first 3 entities only, existing cap)
4. ~85 `[VARIANT]` selection lines + ~85 `EntityName: total | intent=total ✓` lines (interleaved per entity)
5. **`[CalcRecon]` summary block** — visible at top of paste:
   - `=== RECONCILIATION SUMMARY ===`
   - tenant/period/ruleSet/batch
   - entitiesCalculated/grandTotal
   - flags (diag003/boundary/ob118)
   - variantsTraced summary
   - `=== PER-ENTITY TOTALS ===` followed by 85 entity recon lines
   - `=== END SUMMARY ===`
6. **`[CalcTrace] === FORENSIC TRACE ===`** opener
7. ~480 forensic trace lines (15 entities × ~32 lines each, for 3 BCL variants × 5 each)
8. `[CalcTrace] === END FORENSIC TRACE ===` closer
9. HF-207 period_complete + batch_complete + existing COMPLETE

Total: ~700 lines per period. [CalcRecon] block lands at ~line 200 of the paste, well within first-screen visibility.

If [CalcRecon] block is visible: BCL October reconciliation is direct-paste readable. Six-period BCL = six pastes, sum the grandTotals.

If [CalcRecon] block still not visible: truncation is at a sub-line-count layer; separate diagnostic required.

---

## 6 — OUT OF SCOPE

- No env-var verbosity flag
- No removal of trace code
- No counter changes
- No [CalcRecon] format changes
- No engine semantics changes
- No new files

---

## 7 — KNOWN CONSTRAINTS

- TRACE_CAP_PER_VARIANT = 5 is a constant. Edit constant to change.
- First N entities of each variant to enter the calc loop are traced. Order is calc-execution order.
- `tracedEntityIds` Set guarantees per-entity internal consistency (no half-traced entities).
- If a variant has fewer than N=5 entities in the period, all of that variant's entities are traced (counter just stops at the actual count).
- Buffer holds trace lines in memory for the duration of the handler. For 15 entities × ~32 lines × ~200 chars/line ≈ 100KB. Negligible memory cost.
- variantKey identification depends on what variable is in scope at trace-emission time. CC reads AUD-005 to identify the canonical variant identifier; if not obvious from code, surface to architect with the candidate expressions before patching.

---

## 8 — DISPATCH FOOTER

CC may begin execution upon receipt. PR title: `HF-209: calc log restructure — summary-first, per-variant trace cap`. PR body: link to this directive plus completion report.
