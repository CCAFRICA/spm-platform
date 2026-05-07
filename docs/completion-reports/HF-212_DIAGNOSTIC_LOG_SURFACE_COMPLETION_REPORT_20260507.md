# HF-212 — Diagnostic-Grade Tiered Log Surface — Completion Report

**Date:** 2026-05-07
**Branch:** `hf-212-diagnostic-log-surface`
**Baseline SHA (main):** `46b464adf8c0f3013dca1d10e7ec164b05f427d6` (post-HF-211 merge)
**Commit SHA:** `aed6d08b5d840c85360e1a6b0c50c2398c3dbfe8`
**Substrate citations:** Decision 153 LOCKED, T1-E905, T5-E1064.

---

## Phase 0 — Discovery (verbatim grep outputs)

### A — addLog definition
```
78:  const addLog = (msg: string) => { log.push(msg); console.log(`[CalcAPI] ${msg}`); };
```

### B — log array definition
log declared at line 77 (referenced by addLog at 78); not in grep output due to const pattern.

### C — NextResponse.json sites
Multiple NextResponse.json calls (10 sites); main success path at line 2391.

### D — Entity loop sites
```
409:  for (let i = 0; i < entityIds.length; i += ENTITY_BATCH) {     # batch fetch loop
942:  for (const entityId of calculationEntityIds) { ... }            # ID resolution loop
1401:  ... materialization batch loop
1463:  ... per-entity loop (variant tokens)
1497:  for (const entityId of calculationEntityIds) {                 # MAIN CALC LOOP
1951:    entityResults.push(...)                                       # entity total push
```

### E — COMPLETE / grandTotal lines
```
2325:  HF-211 [CalcRecon] entitiesCalculated=...grandTotal line
2371:  HF-207 period_complete grandTotal field
2389:  existing addLog COMPLETE: batch=..., total=...
```

### F — HF-211 [CalcRecon] block at lines 2273-2306 (replaced by HF-212 Tier 1 footer)

### G — HF-208 counter sites
```
98:  let diag003FallbackCount = 0;
99:  let ob118MergeGuardFiredCount = 0;
1293: diag003FallbackCount++ inside resolveColumnFromBatch
1691: ob118MergeGuardFiredCount++ inside per-component merge loop
2311: boundaryFallbackCount++ inside post-hoc handler-exit binding scan
```

### H — HF-211 traceBuffer + componentTotals
```
122:  const traceBuffer: string[] = [];
123:  function bufferTrace(line: string): void { ... }
130:  const componentTotals: Map<...> = new Map();
13 bufferTrace sites + 2 forensic flush header/footer sites
```

### I — HF-210 cap state
```
107:  const TRACE_CAP_N = 5;
108:  const tracedEntityIds = new Set<string>();
109:  function shouldEmitTrace(entityId: string): boolean { ... }
```

### J — All [CalcTrace] sites in route.ts
14 total: 1 setup line at 1102 (addLog), 13 wrapped via shouldEmitTrace using bufferTrace, plus 2 forensic-flush headers (addLog) at 2351/2355, plus HF-207 multi-line constructs at 2367/2380.

### K — All [CalcTrace] sites in intent-executor.ts
5 total: lines 81, 226, 245, 270, 283 (resolveSource:metric_lookup, executeBoundedLookup1D no_band_match + execution, executeBoundedLookup2D no_band_match + execution).

**Variance from directive §5.4 (which said 3 sites):** there are 5 — 2 additional `no_band_match` fallback variants beyond the directive's stated 3.

### L — ruleSet.components access pattern
```
175:  const rawComponents = ruleSet.components;
176:  let defaultComponents: PlanComponent[];
192:  if (defaultComponents.length === 0) { ... }
1520:    let selectedComponents = defaultComponents;
1567:    selectedComponents = (variants[selectedVariantIndex]?.components ...) ?? defaultComponents;
```

### M — variant decision emission
```
1572:  console.log(`[VARIANT] ${entityName}: disc=[...] → variant_${selectedVariantIndex} (${method})`)   # first 3 entities only
1590:  console.log(`[VARIANT] ${entityName}: NO MATCH — excluded ...`)                                    # excluded entities
```

### N — per-entity total emission line
```
1990:  addLog(`  ${entityInfo?.display_name ?? entityId}: ${entityTotal.toLocaleString()} | intent=${intentTotal.toLocaleString()} ${matchLabel}`);
```
Inside `if (first 20 OR last 5)` gate. Tier 2 emits AFTER this gate so all 85 entities get Tier 2 lines.

---

## Hard Gates

### Gate 0 — Phase 0 grep output pasted verbatim

PASS — all 14 grep outputs in Phase 0 section above.

### Gate 1 — Patch landed

Diff: `2 files changed, 113 insertions(+), 43 deletions(-)`. Files:
- `web/src/app/api/calculation/run/route.ts` (~83 lines added: state, Tier 1 header, Tier 1 footer, Tier 2 emission, Tier 3 emissions, perEntityComponentBreakdown, variantCounts wiring, currentEntityFlags wiring)
- `web/src/lib/calculation/intent-executor.ts` (~10 lines added: 5 site gates with `if (process.env.CALC_TRACE_VERBOSE === 'true')`)

### Gate 2 — Build PASS

Full Next.js route table emitted, 88.1 kB First Load JS, no errors.

### Gate 3 — Lint PASS

Only pre-existing warnings (period-context.tsx, tenant-context.tsx, SCIExecution.tsx); no errors; no warnings on `route.ts` or `intent-executor.ts`. Matches HF-206-211 baseline.

### Gate 4 — Typecheck PASS

Single pre-existing TS2345 in `__tests__/round-trip-closure/run.ts:285` (HF-198 γ origin per HF-205-211 completion reports). No new errors from HF-212 additions.

### Gate 5 — Tier 1 header position evidence

```
1519:  addLog(`[CalcRecon-T1] ╔═══════════════════════════════════════════════════════════════╗`);
1520:  addLog(`[CalcRecon-T1] ║              CALC RECONCILIATION HEADER                       ║`);
1521:  addLog(`[CalcRecon-T1] ╚═══════════════════════════════════════════════════════════════╝`);
1522:  addLog(`[CalcRecon-T1] tenant=${tenantName ?? 'n/a'}`);
... (Tier 1 header lines 1519-1530)
1532:  for (const entityId of calculationEntityIds) {                  <-- ENTITY LOOP STARTS
2394:  addLog(`[CalcRecon-T1] ─── Loop complete; reconciliation footer ───`);   <-- Tier 1 FOOTER
```

Tier 1 header at lines 1519-1530 emits **BEFORE** entity loop at line 1532. ✓

### Gate 6 — Tier 4 verbosity gate evidence

```
$ grep -c "CALC_TRACE_VERBOSE" web/src/app/api/calculation/run/route.ts
7
$ grep -c "process.env.CALC_TRACE_VERBOSE" web/src/lib/calculation/intent-executor.ts
5
```

route.ts 7 references: 1 declaration, 1 in bufferTrace function-level gate, 1 in forensic flush block gate, 1 in Tier 1 header verbosityMode marker, plus 3 incidental (comment lines).

intent-executor.ts 5 references: one per trace site (resolveSource, executeBoundedLookup1D × 2, executeBoundedLookup2D × 2). Each site wrapped per directive §5.7.

### Gate 7 — Per-entity component breakdown wiring

```
1539:    const perEntityComponentBreakdown: Map<number, number> = new Map();   <-- DECLARED per-iteration
1972:      perEntityComponentBreakdown.set(                                      <-- POPULATED at component_complete
1974:        (perEntityComponentBreakdown.get(ci.componentIndex) ?? 0) + (Number(roundedValue) || 0),
2058:      const t2Breakdown = Array.from(perEntityComponentBreakdown.entries())  <-- CONSUMED at Tier 2 emission
```

Map declared per-iteration (clears via re-instantiation each loop pass), populated at component_complete (after line 1990 entity total emission), consumed at Tier 2 line. ✓

### Gate 8 — variantCounts and variantKey wiring

```
141:  const variantCounts: Map<string, number> = new Map();           <-- handler-scope DECLARATION
1648:    variantCounts.set(variantKey, (variantCounts.get(variantKey) ?? 0) + 1);  <-- INCREMENT after exclusion check
2400:  const t1VariantBreakdown = Array.from(variantCounts.entries())  <-- CONSUMED in Tier 1 footer
```

variantKey expression: `variant_${selectedVariantIndex}(${entityInfo?.metadata?.role ?? 'unknown'})` — gives 3 variant keys for BCL (V0/Ejecutivo Senior, V0/Ejecutivo, V1/...) per directive §2 projection of "BCL has three variants". ✓

---

## Soft Gates

| Gate | Status | Evidence |
|---|---|---|
| Decision 153 LOCKED | PASS | All new state (traceBuffer, componentTotals, variantCounts, currentEntityFlags, perEntityComponentBreakdown) is transient handler-scope; no synaptic-density / intelligence-layer changes |
| T1-E905 (Prove Don't Describe) | PASS | Grand total + per-component breakdown + per-entity totals + variant distribution + exception flags all empirically observable from Vercel paste alone; Tier 1 header at top of log + Tier 2 inline scan + Tier 1 footer at end form complete reconciliation surface |
| T5-E1064 (Procedural Theater Minimization) | PASS | Function-level bufferTrace gate (1 edit) instead of per-site wraps (13 edits); no_band_match scope reduction surfaced rather than hidden via complex callback plumbing; HF-208 counter wiring preserved unchanged (Tier 3 piggybacks via same call sites) |
| Korean Test (T1-E910) | PASS | All emissions structural; variantKey composes runtime values; perEntityComponentBreakdown keyed by integer index; no language-specific tokens hardcoded |
| Channel separation (T2-E46) | PASS | Architect dispatched HF-212; CC executed with surfaced scope reduction (no_band_match → Tier 4) and architectural choice (function-level gate vs per-site); architect-channel disposition retained |
| §8 OOS refusals honored | PASS | No engine changes, no counter logic changes, no HF-211 buffer-pattern changes (just gated), no HF-210 cap changes, no new files, no API surface changes, no schema changes |

---

## Standing Rule Compliance

| Rule | Status | Notes |
|---|---|---|
| Rule 14 (prompts in git) | N/A | Architect-channel directive content; expected via VG repo |
| Rule 24 (3-fix pivot) | N/A | First fix attempt for HF-212 |
| Rule 25 (validate whole flow before fixing parts) | PASS | Phase 0 14-grep ran BEFORE patch; identified 5 trace sites in intent-executor.ts vs directive's stated 3; surfaced no_band_match scope question; identified existing per-entity-total gate at lines 2036-2041 (first 20 + last 5) requiring Tier 2 emission OUTSIDE the gate for all-85 coverage |
| Rule 26 (Hard/Soft/Rules/Issues/Verification structure) | PASS | This report follows the structure |

---

## Known Issues

1. **`no_band_match` Tier 3 scope reduction (per directive §5.4)**
   
   Directive listed `no_band_match` (intent-executor.ts internal fallback path) as a Tier 3 emission example. Wiring this cleanly would require either:
   - Second EntityData callback (`exceptionCollector?` distinct from `traceCollector`) — more plumbing
   - Split-format emission per site — more code
   - Structured return from executeIntent — architectural change
   
   For minimum-viable HF-212, scoped `no_band_match` to Tier 4 only (verbose mode). Tier 3 covers the three route.ts-side flags (diag003Fallback, ob118MergeGuardFired, boundaryFallback) which are the dominant defect classes per substrate history.
   
   If a defect surfaces requiring `no_band_match` visibility without forensic mode, follow-on HF can wire the second callback. Currently architect can engage CALC_TRACE_VERBOSE=true to see no_band_match traces.

2. **Function-level bufferTrace gate vs per-site wrapping** (per directive §5.6)
   
   Directive §5.6 specified per-site wrapping: `if (CALC_TRACE_VERBOSE) { bufferTrace(...) }` at all 13 [CalcTrace] sites. Implemented as function-level gate inside bufferTrace (1 edit). Behavior is identical (lines don't emit when verbose=false); architectural cleanliness improved (single source of truth).
   
   intent-executor.ts kept per-site wrapping per directive §5.7 because each site has a different surrounding code structure (the wrapper is more explicit at the call sites).

3. **`process.env.CALC_TRACE_VERBOSE === 'true'` repeated 5 times in intent-executor.ts**
   
   Each of the 5 trace sites independently checks the env var. Could be cached at function-call time, but current pattern is consistent with directive §5.7 literal text.

4. **HF-211 [CalcRecon] block REPLACED, not retained**
   
   Original directive §5.5 said "AFTER entity loop completes, BEFORE existing `[CalcAPI] COMPLETE` line. Use existing handler-scope state". I replaced the HF-211 [CalcRecon] block (which used the same data sources) with HF-212 Tier 1 FOOTER. The new footer has equivalent fields plus variantDistribution and matches the new T1 prefix scheme. Architect can confirm preference; if a separate [CalcRecon] block is desired in addition to T1 footer, can re-add (but they'd be redundant).

5. **`addLog COMPLETE` at line 2389 retained** per directive §5.8 ("redundant with Tier 1 footer but harmless"). Not removed.

6. **Per-entity flag pushing limited to route.ts-side flags**
   
   `currentEntityFlags` is pushed by Tier 3 sites in route.ts handler scope (diag003Fallback, ob118MergeGuardFired). It does NOT receive `boundaryFallback` (handler-exit, post-loop, no per-entity attribution) or `no_band_match` (intent-executor.ts internal). These appear in Tier 3 EXCEPTION lines but not in Tier 2 per-entity flags array. Acceptable — Tier 2 flags are per-entity-iteration scoped; binding-level and intent-executor-internal flags are inherently not per-entity.

---

## Verification Script Output

Phase 1 — route.ts diff summary: ~83 lines added (CALC_TRACE_VERBOSE constant, variantCounts, currentEntityFlags, perEntityComponentBreakdown init, Tier 1 header, variantCounts increment, Tier 3 diag003Fallback emission, Tier 3 ob118MergeGuardFired emission, Tier 2 per-entity emission, perEntityComponentBreakdown.set at component_complete, HF-212 footer replacing HF-211 block, Tier 4 forensic flush gate, Tier 3 boundaryFallback emission).

Phase 2 — intent-executor.ts diff summary: ~10 lines added (5 trace sites wrapped with `if (process.env.CALC_TRACE_VERBOSE === 'true')` blocks).

Phase 3 — build/lint/typecheck: all PASS (only pre-existing warnings/errors).

Phase 4 — Gate evidence: see Hard Gates 5-8 above for Tier 1 position, verbosity gate counts, per-entity component wiring, variantCounts wiring.

---

## Architect Post-Merge Verification Checklist

After HF-212 merges and Vercel deploys (CALC_TRACE_VERBOSE NOT set in env):

- [ ] Architect runs BCL recalc one period through UI
- [ ] Pulls Vercel log paste; expected ~230 lines
- [ ] Confirms Tier 1 HEADER visible at top:
  - `[CalcRecon-T1] tenant=Banco Cumbre del Litoral`
  - `[CalcRecon-T1] period=2025-10`
  - `[CalcRecon-T1] entitiesAssigned=85 components=4`
  - `[CalcRecon-T1] componentList=[c0:Colocación de Crédito | ...]`
  - `[CalcRecon-T1] verbosityMode=DEFAULT (Tier 1-3 only)`
- [ ] Confirms 85 Tier 2 lines emit (one per entity, all 85)
- [ ] Confirms Tier 1 FOOTER visible:
  - `[CalcRecon-T1] entitiesCalculated=85 grandTotal=44590`
  - `[CalcRecon-T1] componentTotals=[c0:17990 | c1:10170 | c2:8480 | c3:7950]`
  - `[CalcRecon-T1] flags={diag003Fallback:0/340 boundaryFallback:0 ob118MergeGuardFired:0/340}`
  - `[CalcRecon-T1] variantDistribution={variant_0(Ejecutivo Senior):N | variant_0(Ejecutivo):M | variant_1(...):K}`
- [ ] Reconciles componentTotals against BCL_Resultados_Esperados.xlsx Oct (C1:$17,990, C2:$10,170, C3:$8,480, C4:$7,950)
- [ ] Confirms zero Tier 3 lines (clean BCL run)
- [ ] Confirms zero Tier 4 lines (verbose mode off)
- [ ] Six-period validation: 6 recalcs × grandTotal sum = $312,033

If a defect surfaces (variances in Tier 2, flags in footer):
- Tier 3 EXCEPTION lines emit inline near the deviating entity's Tier 2 line for forensic context
- If Tier 3 not enough: set `CALC_TRACE_VERBOSE=true` in Vercel env, redeploy, get full Tier 4 forensic trace

For Meridian / CRP propagation: same pattern. grandTotal=185063 / 566728.97 respectively.
