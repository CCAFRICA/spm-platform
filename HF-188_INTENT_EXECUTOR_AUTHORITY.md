# HF-188: Intent Executor as Sole Calculation Authority

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit and push after each phase.

---

## CC STANDING ARCHITECTURE RULES (MANDATORY)

### SECTION A: DESIGN PRINCIPLES
1. **AI-First, Never Hardcoded** — NEVER hardcode field names, column patterns, or language-specific strings. Korean Test applies.
2. **Scale by Design** — Every decision works at 10x current volume.
3. **Fix Logic, Not Data** — Never provide answer values. Fix the logic.
4. **Domain-Agnostic Always** — Platform works across any domain.

### CC OPERATIONAL RULES
- After EVERY commit: `git push origin dev`
- After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
- Final step: `gh pr create --base main --head dev` with descriptive title and body
- Git from repo root (`spm-platform`), NOT `web/`

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build verification
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### ADDITIONAL STANDING RULES
- **Rule 35:** EPG mandatory for mathematical/formula phases.
- **Rule 36:** No unauthorized behavioral changes. Scope is exactly what this prompt specifies.
- **Rule 38:** Mathematical review gate — verify rounding applies to intent executor results.
- **Rule 48:** This is a numbered item (HF-188) with its own completion report.
- **Rule 51v2:** `npx tsc --noEmit` AND `npx next lint` run after `git stash` on committed code only.

---

## PROBLEM STATEMENT

The calculation route runs a dual-path architecture where the legacy engine (`evaluateComponent`) is ALWAYS authoritative and the intent executor (`executeIntent`) runs in shadow mode for concordance comparison. This was designed as a transition: the intent executor shadows → concordance reaches 100% → intent executor becomes authoritative → legacy engine is removed.

**The transition criteria has been met.** BCL proved 100% concordance across 85 entities, 6 months, 6 components. CRP Plan 1 proved concordance for linear_function. The intent executor produces identical results for all legacy primitive types.

**But the switch was never made.** The legacy engine remained authoritative. When new primitive types arrived (piecewise_linear, scope_aggregate, conditional_gate) that the legacy engine was never designed to handle, it produced wrong results. HF-187 fixed the intent executor's transformation layer, but its results are discarded because the wrong engine is authoritative.

**The deeper problem:** A per-type authority set (like `INTENT_AUTHORITATIVE_TYPES`) is a bolt-on that requires manual maintenance for each new primitive and makes the dual-path permanent rather than transitional. The correct fix is to complete the planned transition.

### The Fix

Make the intent executor the sole calculation authority. The legacy engine is demoted to a concordance shadow — it still runs for observability logging but its results have zero authority over what gets written to the database.

### Why This Is Safe

1. **BCL concordance: 100%** — the intent executor produces identical results for legacy types
2. **Decision 122 compliance** — the intent executor uses Decimal.js throughout; the legacy engine uses native JavaScript numbers — the intent executor is MORE precise
3. **All component types handled** — `transformComponent` has explicit cases for all 4 legacy types AND routes new primitives through `transformFromMetadata`
4. **No "next primitive" problem** — any future primitive automatically works through the intent executor
5. **Concordance preserved as observability** — the legacy engine still runs; mismatches are logged; the safety net remains as observer, not authority

---

## PHASE 0: DIAGNOSTIC — READ ACTUAL CODE

### 0A: Confirm the legacy engine loop and authority
```bash
grep -n 'CURRENT ENGINE PATH\|entityTotalDecimal\|evaluateComponent\|entityTotal.*toNumber' web/src/app/api/calculation/run/route.ts | head -15
```
Paste output. Identify:
- Where `entityTotalDecimal` accumulates legacy results
- Where `entityTotal = toNumber(entityTotalDecimal)` is set
- Where `entityTotal` is used for `total_payout` and `grandTotal`

### 0B: Confirm the intent executor shadow loop
```bash
grep -n 'INTENT ENGINE PATH\|intentTotal\|intentResult\|priorResults\[' web/src/app/api/calculation/run/route.ts | head -15
```
Paste output. Identify:
- Where `intentTotal` accumulates intent results
- Where `priorResults[ci.componentIndex]` stores per-component intent results
- Where `intentTotal` is stored (should be metadata only, not total_payout)

### 0C: Confirm where results are written
```bash
grep -n 'total_payout.*entityTotal\|grandTotal.*entityTotal\|entityResults.push' web/src/app/api/calculation/run/route.ts | head -10
```
Paste output. Confirm `entityTotal` (legacy) is what gets written.

### 0D: Confirm rounding is applied to legacy results only
```bash
grep -n 'roundComponentOutput\|inferOutputPrecision' web/src/app/api/calculation/run/route.ts | head -10
```
Paste output. We must apply the same rounding to intent executor results.

### 0E: Confirm `componentIntents` includes all components
```bash
grep -n 'transformVariant\|componentIntents' web/src/app/api/calculation/run/route.ts | head -10
```
Paste output. Confirm `transformVariant(defaultComponents)` runs once before the entity loop.

**DO NOT proceed to Phase 1 until all 5 reads are pasted with evidence.**

**Commit:** `git add -A && git commit -m "HF-188 Phase 0: Diagnostic — dual-path authority code read" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: The legacy engine is authoritative but cannot handle new primitive
types. The intent executor can handle ALL types but runs in shadow mode.
The transition from legacy to intent authority was planned but never executed.
BCL concordance (100%) proves the intent executor is production-ready.

Option A: Intent executor as sole authority — legacy demoted to shadow
  - Make intent executor results authoritative for ALL components
  - Legacy engine still runs for concordance observability
  - No "new primitive types" set to maintain
  - Scale test: YES — same entity loop, just different authority
  - AI-first: YES — intent executor is the AI-native engine
  - Decision 122: YES — intent executor uses Decimal.js
  - PRO: Completes the planned architectural transition
  - PRO: One authority path — no conditional switching
  - PRO: Future primitives automatically authoritative
  - PRO: Simpler code — fewer branches, fewer bugs

Option B: Remove legacy engine entirely
  - Delete evaluateComponent call and all legacy path code
  - PRO: Simplest code
  - CON: Loses concordance observability forever
  - CON: Too aggressive for one HF — should be a follow-up OB

CHOSEN: Option A — completes the transition with safety net preserved.
The concordance comparison still runs and logs mismatches — we just don't
use the legacy result as authority anymore. Option B is the correct
follow-up OB once we have several more proof runs confirming intent-only
authority.

REJECTED: Option B — too aggressive, loses safety net prematurely
```

**Commit:** `git add -A && git commit -m "HF-188 Phase 1: Architecture decision — intent executor sole authority" && git push origin dev`

---

## PHASE 2: IMPLEMENTATION

### File: `web/src/app/api/calculation/run/route.ts`

### Overview

The entity loop currently has two sections. We are SWAPPING their roles:

**BEFORE HF-188:**
```
LEGACY ENGINE (authoritative)  →  entityTotal  →  total_payout, grandTotal
INTENT ENGINE (shadow)         →  intentTotal  →  metadata only
```

**AFTER HF-188:**
```
LEGACY ENGINE (shadow)         →  legacyTotal  →  concordance comparison only
INTENT ENGINE (authoritative)  →  entityTotal  →  total_payout, grandTotal
```

Both engines still run. Both still log. The only thing that changes is WHICH result is written to `calculation_results.total_payout`.

### Detailed changes:

#### Change 1: Legacy engine loop — demote to shadow

In the legacy engine loop (the `for (let compIdx = 0; compIdx < selectedComponents.length; compIdx++)` block):

- **KEEP** the `evaluateComponent` call — it still runs for concordance
- **KEEP** `componentResults.push(result)` — the ComponentResult structure is still needed for UI display
- **RENAME** `entityTotalDecimal` to `legacyTotalDecimal` to clarify its role
- **REMOVE** `roundComponentOutput` from this loop — rounding moves to the intent loop (avoid double-rounding)
- **REMOVE** `entityRoundingTraces` population from this loop — moves to intent loop

The legacy loop should still compute `legacyTotalDecimal` for concordance but it no longer controls rounding or the authoritative total.

#### Change 2: Intent engine loop — promote to authority

In the intent engine loop (the `for (const ci of entityIntents)` block):

- **KEEP** all existing intent execution code
- **ADD** Decision 122 rounding: after each `executeIntent`, apply `roundComponentOutput` with the same `inferOutputPrecision` logic currently used in the legacy loop
- **ADD** per-component result override: `componentResults[ci.componentIndex].payout = roundedValue`
- **ADD** rounding trace: `entityRoundingTraces[ci.componentIndex] = roundingTrace`
- **CHANGE** accumulation: use a new `intentTotalDecimal` (Decimal type) instead of the current `intentTotal += intentResult.outcome` (native number addition). This ensures Decision 122 precision for the authoritative total.
- **COMPUTE** `intentTotal = toNumber(intentTotalDecimal)` after the loop

#### Change 3: entityTotal from intent, not legacy

After both loops, set:
```typescript
const entityTotal = intentTotal;                    // HF-188: intent is authoritative
const legacyTotal = toNumber(legacyTotalDecimal);   // For concordance comparison
```

#### Change 4: Concordance uses legacyTotal vs intentTotal

```typescript
const entityMatch = Math.abs(legacyTotal - intentTotal) < 0.01;
```

The concordance log line (`OB-76 Dual-path: N match, N mismatch`) still works — it now compares legacy (shadow) against intent (authority).

#### Change 5: Update metadata

In the `entityResults.push()` call, update the metadata:
```typescript
metadata: {
  entityName: ...,
  externalId: ...,
  intentTraces,
  intentTotal,          // authoritative value
  legacyTotal,          // shadow value for concordance audit
  intentMatch: entityMatch,
  roundingTrace: { ... },  // from intent rounding traces
}
```

#### Change 6: One-time authority log

After the first entity completes:
```typescript
if (entityResults.length === 0) {
  addLog('HF-188: Intent executor is sole authority — legacy engine is concordance shadow');
}
```

### What NOT to change:
- `intent-transformer.ts` — NO changes
- `intent-executor.ts` — NO changes  
- `run-calculation.ts` — NO changes to the legacy engine code
- The `evaluateComponent` call — KEEP IT running for concordance
- All metric resolution code — UNCHANGED. Both engines share resolved metrics.
- The synaptic surface / density / flywheel code — UNCHANGED
- The variant matching / population filter — UNCHANGED
- The results write / batch transition / metering — UNCHANGED (they just receive intent-authority values now)

### What to watch for:
- **Component index alignment:** The legacy loop uses `compIdx` (0, 1, 2...) and the intent loop uses `ci.componentIndex` (same values from `transformVariant`). The override `componentResults[ci.componentIndex].payout = roundedValue` must use the correct index.
- **Rounding trace array:** `entityRoundingTraces` must be initialized BEFORE the legacy loop (same as current), populated by the INTENT loop, and used in the metadata.
- **`grandTotal`**: Must accumulate from `entityTotal` (which is now `intentTotal`). Currently `grandTotal += entityTotal` — this line is unchanged, it just receives a different value.
- **`perComponentMetrics`**: Populated by the LEGACY loop, consumed by the INTENT loop (`perComponentMetrics[ci.componentIndex]`). The legacy loop must still populate this even though its total is no longer authoritative.

---

## PHASE 3: BUILD VERIFICATION

1. `git stash` (stash any uncommitted work)
2. `npx tsc --noEmit` — must pass with zero errors
3. `npx next lint` — must pass
4. `git stash pop`
5. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev`
6. Confirm localhost:3000 responds

**Commit:** `git add -A && git commit -m "HF-188 Phase 3: Build verification" && git push origin dev`

---

## PROOF GATES — HARD

| # | Criterion | How to verify |
|---|-----------|---------------|
| G1 | Intent executor results go through `roundComponentOutput` with `inferOutputPrecision` | `grep -B 2 -A 5 'roundComponentOutput' web/src/app/api/calculation/run/route.ts` — paste output showing rounding in intent loop |
| G2 | `entityTotal` computed from intent results, not legacy | `grep -n 'entityTotal.*intent' web/src/app/api/calculation/run/route.ts` — paste output |
| G3 | Legacy engine still runs (`evaluateComponent` still called) | `grep -n 'evaluateComponent' web/src/app/api/calculation/run/route.ts` — paste showing it remains |
| G4 | `componentResults[].payout` overridden with intent values | `grep -A 2 'componentResults.*payout.*=.*rounded\|Override.*payout' web/src/app/api/calculation/run/route.ts` — paste output |
| G5 | Concordance comparison still runs and logs | `grep -n 'Dual-path\|intentMatch\|concordance' web/src/app/api/calculation/run/route.ts` — paste output |
| G6 | `total_payout` in entityResults uses intent-derived entityTotal | `grep -n 'total_payout.*entityTotal' web/src/app/api/calculation/run/route.ts` — paste output |
| G7 | No `INTENT_AUTHORITATIVE_TYPES` set exists | `grep -rn 'INTENT_AUTHORITATIVE' web/src/app/api/calculation/run/route.ts` — zero hits |
| G8 | `npx tsc --noEmit` passes | Paste exit code |
| G9 | `npx next lint` passes | Paste exit code |
| G10 | `npm run build` succeeds | Paste exit code |

## PROOF GATES — SOFT

| # | Criterion | How to verify |
|---|-----------|---------------|
| S1 | Only route.ts modified | `git diff --name-only` — paste output |
| S2 | No changes to intent-executor.ts or intent-transformer.ts | Same |
| S3 | No changes to run-calculation.ts (legacy engine untouched) | Same |
| S4 | Korean Test: no hardcoded field names in new code | Zero domain-specific strings in HF-188 changes |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-188_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## FINAL STEP

```bash
gh pr create --base main --head dev --title "HF-188: Intent executor as sole calculation authority" --body "Completes the planned dual-path transition. The intent executor is now the sole calculation authority for ALL component types. The legacy evaluateComponent still runs as a concordance shadow for observability but has zero authority over written results. BCL concordance (100%) proved the intent executor produces identical results for legacy types. Decision 122 rounding applied to intent executor results. No per-type authority sets — all current and future primitives are automatically handled. Legacy engine removal is a follow-up OB."
```
