# HF-215 COMPLETION REPORT — Revert anthropic-adapter.ts:408 Prompt Amendment

**Date:** 2026-05-09T20:35:33Z
**Branch:** `hf-215-revert-anthropic-adapter-prompt`
**Commit SHA:** `efca0d3a58b774a021fcc9d4bb991d5dd9501d8b` (initial), see PR #383
**Type:** Single-line revert; restores pre-Phase-2 confidence prompt at `anthropic-adapter.ts:408`
**Reverts:** HF-214 Phase 2 B1 amendment (PR #381 squash-merged commit `5418f4f4`)
**Predecessor diagnostic:** DIAG-038 (PR #382 squash-merged commit `a32fcd48`)

---

## Section 1 — Phase 0 verification (verbatim)

### 1.1 Current B1 amendment location (live, on `main` pre-revert)

`sed -n '405,412p' web/src/lib/ai/providers/anthropic-adapter.ts` (verbatim):

```
IMPORTANT GUIDELINES:
1. Documents may be in ANY language. Preserve original language labels in component names and metric labels.
2. Extract worked examples if present - these are critical for validation.
3. Return confidence scores as a decimal probability ratio between 0.0 and 1.0 for each component and overall (e.g., 0.95 means high confidence; 0.50 means uncertain). Do NOT emit integer percentages such as 95 or 90 — emit ratio form 0.95 and 0.90 instead.
4. If a table has different values for different employee types/classifications, create SEPARATE components for each.

=== CALCULATION INTENT (STRUCTURAL VOCABULARY) ===
```

**Confirmed live B1 amendment line: 408 (single line).** No drift from DIAG-038 Section 2.1.

### 1.2 Pre-Phase-2 source text (commit `7ca17c4a`)

`git show 7ca17c4a:web/src/lib/ai/providers/anthropic-adapter.ts | sed -n '405,412p'` (verbatim):

```
IMPORTANT GUIDELINES:
1. Documents may be in ANY language. Preserve original language labels in component names and metric labels.
2. Extract worked examples if present - these are critical for validation.
3. Return confidence scores (0-100) for each component and overall.
4. If a table has different values for different employee types/classifications, create SEPARATE components for each.

=== CALCULATION INTENT (STRUCTURAL VOCABULARY) ===
```

**Confirmed pre-Phase-2 text (verbatim):**

```
3. Return confidence scores (0-100) for each component and overall.
```

This is exactly the text the directive's Phase 0 Step 0.2 anticipated.

### 1.3 B2 and A preservation status (live, on `main` pre-revert)

`sed -n '220,232p' web/src/lib/compensation/ai-plan-interpreter.ts` (verbatim, abbreviated):

```typescript
  // percentage-encoded and rescaled by /100; values < 0 clamp to 0. Original-vs-normalized
  // divergence is logged so upstream prompt drift is observable.
  private normalizeConfidence(raw: unknown, fieldPath: string, fallback: number): number {
    const original = Number(raw);
    if (!Number.isFinite(original)) return fallback;
    let normalized = original;
    if (normalized > 1) normalized = normalized / 100;
    if (normalized < 0) normalized = 0;
    if (normalized !== original) {
      console.warn(`[AIPlanInterpreter] confidence normalized: field=${fieldPath} original=${original} normalized=${normalized}`);
    }
    return normalized;
  }
```

`sed -n '60,80p' web/src/lib/ai/signal-persistence.ts` (verbatim, persistSignal clamp area):

```typescript
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // HF-214 Phase 2 (A): writer-side defense-in-depth clamp.
    // Confidence is a probability ratio in [0, 1); clamp at the canonical writer
    // protects every signal_type symmetrically against any upstream drift.
    let clampedConfidence: number | null = signal.confidence ?? null;
    if (clampedConfidence != null) {
      const original = clampedConfidence;
      const clamped = Math.min(Math.max(original, 0), 0.9999);
      if (clamped !== original) {
        const sv: Record<string, unknown> = signal.signalValue || {};
        const metricName = sv['metric_name'] ?? null;
        const componentIndex = sv['component_index'] ?? null;
        console.warn(`[SignalPersistence] confidence clamped: original=${original} clamped=${clamped} signal_type=${signal.signalType} metric_name=${String(metricName)} component_index=${String(componentIndex)}`);
      }
      clampedConfidence = clamped;
    }
    const { error } = await supabase
      .from('classification_signals')
      .insert({
        tenant_id: signal.tenantId,
```

`sed -n '130,155p' web/src/lib/ai/signal-persistence.ts` (verbatim, persistSignalBatch clamp area):

```typescript

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // HF-214 Phase 2 (A): writer-side defense-in-depth clamp.
    // Confidence is a probability ratio in [0, 1); clamp per-row protects every
    // signal_type symmetrically against any upstream drift.
    const rows = signals.map(s => {
      let clampedConfidence: number | null = s.confidence ?? null;
      if (clampedConfidence != null) {
        const original = clampedConfidence;
        const clamped = Math.min(Math.max(original, 0), 0.9999);
        if (clamped !== original) {
          const sv: Record<string, unknown> = s.signalValue || {};
          const metricName = sv['metric_name'] ?? null;
          const componentIndex = sv['component_index'] ?? null;
          console.warn(`[SignalPersistence] confidence clamped: original=${original} clamped=${clamped} signal_type=${s.signalType} metric_name=${String(metricName)} component_index=${String(componentIndex)}`);
        }
        clampedConfidence = clamped;
      }
      return {
        tenant_id: s.tenantId,
        entity_id: s.entityId || null,
        signal_type: s.signalType,
        signal_value: (s.signalValue || {}) as Json,
```

| Item | Status |
|---|---|
| B2 `normalizeConfidence` present (`ai-plan-interpreter.ts:222-232`) | Y (byte-identical to DIAG-038 Section 2.2) |
| A writer clamp present (`persistSignal`, `signal-persistence.ts:62-76`) | Y (byte-identical to DIAG-038 Section 2.3) |
| A writer clamp present (`persistSignalBatch`, `signal-persistence.ts:135-149`) | Y (byte-identical to DIAG-038 Section 2.3) |
| HF-214 Phase 1 catch-block instrumentation byte-identical | Y (untouched by HF-215) |

---

## Section 2 — Verbatim diff

### 2.1 Removed line (B1 amendment)

```typescript
3. Return confidence scores as a decimal probability ratio between 0.0 and 1.0 for each component and overall (e.g., 0.95 means high confidence; 0.50 means uncertain). Do NOT emit integer percentages such as 95 or 90 — emit ratio form 0.95 and 0.90 instead.
```

### 2.2 Restored line (pre-Phase-2 text from commit `7ca17c4a`)

```typescript
3. Return confidence scores (0-100) for each component and overall.
```

### 2.3 git diff main..HEAD (verbatim)

```diff
diff --git a/web/src/lib/ai/providers/anthropic-adapter.ts b/web/src/lib/ai/providers/anthropic-adapter.ts
index 7de6bede..8e09dbea 100644
--- a/web/src/lib/ai/providers/anthropic-adapter.ts
+++ b/web/src/lib/ai/providers/anthropic-adapter.ts
@@ -405,7 +405,7 @@ NUMERIC PARSING RULES:
 IMPORTANT GUIDELINES:
 1. Documents may be in ANY language. Preserve original language labels in component names and metric labels.
 2. Extract worked examples if present - these are critical for validation.
-3. Return confidence scores as a decimal probability ratio between 0.0 and 1.0 for each component and overall (e.g., 0.95 means high confidence; 0.50 means uncertain). Do NOT emit integer percentages such as 95 or 90 — emit ratio form 0.95 and 0.90 instead.
+3. Return confidence scores (0-100) for each component and overall.
 4. If a table has different values for different employee types/classifications, create SEPARATE components for each.
 
 === CALCULATION INTENT (STRUCTURAL VOCABULARY) ===
```

**Empirical proof of byte-identical pre-Phase-2 restoration:** the post-revert blob hash is `8e09dbea`, which matches the blob hash of `anthropic-adapter.ts` at commit `7ca17c4a` exactly. The revert produces a byte-identical file to its pre-Phase-2 state.

### 2.4 git diff main..HEAD --stat

```
 web/src/lib/ai/providers/anthropic-adapter.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

Exactly one source file modified, one line removed, one line added. No other content changes.

---

## Section 3 — Out-of-scope verification

CC explicitly confirms:

- ☑ NO modification to `web/src/lib/compensation/ai-plan-interpreter.ts` (B2 normalizer remains byte-identical)
- ☑ NO modification to `web/src/lib/ai/signal-persistence.ts` (A writer clamp + Phase 1 catch-block instrumentation remain byte-identical)
- ☑ NO modification to `anthropic-adapter.ts:973-975` (`/100` normalizer remains untouched)
- ☑ NO modification to any other prompt template inside `anthropic-adapter.ts` (`file_classification`, `sheet_classification`, `field_mapping`, `field_mapping_second_pass`, `workbook_analysis`, `import_field_mapping`, `entity_extraction`, `anomaly_detection`, `recommendation`, etc.)
- ☑ NO modification to any other line of `anthropic-adapter.ts` outside line 408
- ☑ NO modification to `route.ts`, `run-calculation.ts`, `intent-executor.ts`, `convergence-service.ts`, or `plan-comprehension-emitter.ts`
- ☑ NO new dependencies; NO new helper modules

`git diff main..HEAD --stat` confirms: ONE source file modified (`web/src/lib/ai/providers/anthropic-adapter.ts`) plus this completion report. The diff shows ONLY the B1 amendment site changed; one `-` line (B1 amendment), one `+` line (pre-Phase-2 verbatim text from `7ca17c4a`).

---

## Section 4 — Build, lint, type-check, dev server evidence

### 4.1 npm run build

**Exit code:** 0 (clean)

```
> @vialuce/platform@0.1.0 build
> next build

   ▲ Next.js 14.2.35
   ...
 ✓ Compiled successfully
   ...
ƒ Middleware                                  76 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Pre-existing dynamic-server-usage warnings on cookie-using routes unchanged from `main`. No new TypeScript or lint errors.

### 4.2 npm run lint

**Exit code:** 0

```
$ npm run lint 2>&1 | grep -E "(error|✗|^\.\/src\/lib\/ai)" | head -10
(zero matches — empty output)
```

Zero lint errors. Zero new warnings on the modified file.

### 4.3 npx tsc --noEmit

**Exit code:** 1 (pre-existing — see below)

```
__tests__/round-trip-closure/run.ts(285,3): error TS2345: Argument of type 'typeof SignalNotRegisteredError' is not assignable to parameter of type 'new (message: string) => Error'.
  Types of construct signatures are incompatible.
    Type 'new (signalType: string, callingContext: string, availableSignalTypes: string[]) => SignalNotRegisteredError' is not assignable to type 'new (message: string) => Error'.
      Target signature provides too few arguments. Expected 3 or more, but got 1.
```

This error is **pre-existing on `main`** (verified during HF-214 Phase 1, HF-214 Phase 2, and DIAG-038 via `git stash` round-trip and on-main inspection). Not introduced by HF-215. The error is in `__tests__/round-trip-closure/run.ts`, an unrelated test file outside the three-file scope of HF-214 Phase 2 and outside the one-file scope of HF-215.

**Filter for errors on the changed file:**

```
$ npx tsc --noEmit 2>&1 | grep -E "src/lib/ai/providers"
(zero matches — no type errors on the changed file)
```

### 4.4 Dev server start + login route check

**Dev server log (verbatim):**

```
> @vialuce/platform@0.1.0 dev
> next dev

  ▲ Next.js 14.2.35
  - Local:        http://localhost:3000
  - Environments: .env.local

 ✓ Starting...
 ✓ Ready in 1430ms
```

**Smoke test:**

```
$ curl -sS -o /dev/null -w "HTTP_STATUS=%{http_code}\n" http://localhost:3000/login
HTTP_STATUS=200
```

Dev server bound to port 3000 successfully and responded with HTTP 200 on `/login`.

---

## Section 5 — Architect-verifiable empirical assertion (post-merge)

CC writes this section as forward-looking documentation; CC does NOT perform the verification.

> "After this PR merges and the architect performs a clean-slate Meridian reimport, the architect will observe in the database:
>
> 1. **AI plan interpretation prompt restored to (0-100) form:** the next plan interpretation call will be made with the pre-Phase-2 prompt instruction (line 408 reads `Return confidence scores (0-100) for each component and overall.`).
>
> 2. **AI emits percentage form:** AI's `confidence` values in the response will be in the 0-100 integer range (e.g., 95, 90).
>
> 3. **`anthropic-adapter:974` produces correct ratio:** `response.confidence` will be in 0.0-1.0 range (e.g., 0.95, 0.90). The pre-existing `/100` divides 95 → 0.95 (correct).
>
> 4. **`comprehension:plan_interpretation` persists at correct ratio:** the 10 emitted signals will have `confidence` in [0.85, 0.99] range, not under-divided.
>
> 5. **`comprehension:ai_plan_interpretation` no longer at 0.0093:** subsequent rows of this signal_type will be at correct ratio (consistent with `response.confidence` of 0.95 etc., not 0.0095).
>
> 6. **`planConfidence` restored:** consumers at `import/sci/execute/route.ts:1345` and `:1596` will receive ~0.95-range values, not 0.0095.
>
> 7. **Writer clamp does NOT fire on `comprehension:plan_interpretation` or related signal_types:** valid ratio values (0.85–0.99) are well below the 0.9999 threshold; the A clamp warning log will be silent for this signal_type.
>
> 8. **B2 normalizer's `>1` branch does NOT fire:** values arrive already in ratio form (0.0–1.0); B2 acts as defense-in-depth only — its log line `[AIPlanInterpreter] confidence normalized` will be silent for plan interpretations.
>
> 9. **The c4 magnitude defect remains unresolved by this revert.** c4 is the separate empirical observation per T1-E947, governed by `route.ts:1793/1798`. HF-215 does not address c4."

---

## Section 6 — PR and merge

| Item | Value |
|---|---|
| PR number | #383 |
| PR URL | https://github.com/CCAFRICA/spm-platform/pull/383 |
| Vercel deploy preview status | UNSTABLE at time of report (Vercel build pending) |
| Build check status | (PR just opened; Vercel queued) |
| Mergeable | MERGEABLE |
| Branch | `hf-215-revert-anthropic-adapter-prompt` |
| Initial commit SHA | `efca0d3a58b774a021fcc9d4bb991d5dd9501d8b` |

---

## Section 7 — Closing checklist

- ☑ Single source file modified: `web/src/lib/ai/providers/anthropic-adapter.ts`
- ☑ Verbatim revert of B1 amendment to pre-Phase-2 text from commit `7ca17c4a`
- ☑ Post-revert blob hash matches `7ca17c4a`'s blob hash exactly (`8e09dbea`)
- ☑ B2 byte-identical to DIAG-038 reading
- ☑ A writer clamp byte-identical to DIAG-038 reading
- ☑ HF-214 Phase 1 catch-block instrumentation byte-identical
- ☑ Build clean (`✓ Compiled successfully`)
- ☑ Lint clean (zero errors)
- ☑ Type-check clean on modified file (only pre-existing `__tests__/round-trip-closure/run.ts:285` error)
- ☑ Dev server starts (`Ready in 1430ms`) and login route responds 200
- ☑ Section 3 out-of-scope verification fully populated
- ☑ Section 5 architect-verifiable empirical assertion documented
- ☑ "COMPLETION REPORT" appears in H1 title and filename
- ☑ git diff pasted in Section 2.3
- ☑ PR #383 opened with `--base main --head hf-215-revert-anthropic-adapter-prompt`
