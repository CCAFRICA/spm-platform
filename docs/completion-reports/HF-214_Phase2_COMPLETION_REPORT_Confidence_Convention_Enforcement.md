# HF-214 Phase 2 COMPLETION REPORT — Confidence Convention Contract Enforcement

**Date:** 2026-05-09T13:02:52Z
**Branch:** `hf-214-phase2-confidence-convention-enforcement`
**Commit SHA:** [populated post-commit, see Section 6]
**Type:** Behavioral change — producer-side normalization (B1 prompt + B2 normalizer) + writer-side defense-in-depth clamp (A) with warning log
**Predecessor:** HF-214 Phase 1 (PR #380, commit `7ca17c4a` — instrumentation preserved byte-identical)
**Substrate authority:** IRA invocation HF-214 Phase 2 (`vialuce-governance` — `ira_request_hash db65a45f59c67bb334d5e4a99691d14038427e76be9075250bdf57122bae9a2b`, cost $1.354245, tier_3_novel)

---

## Section 1 — Phase 0 findings (verbatim from pre-flight)

### 1.1 AI plan interpretation prompt location

**File:** `web/src/lib/ai/providers/anthropic-adapter.ts`
**Template:** `plan_interpretation` (lines 185–593 pre-amendment; range unchanged post-amendment)
**Offending instruction (B1 target) — line 408 verbatim:**

```
3. Return confidence scores (0-100) for each component and overall.
```

This was the sole confidence-format reference within the `plan_interpretation` template — a template-scoped grep returned exactly one match. Other `(0-100)` confidence references in the file are in separate templates (`workbook_analysis`, `import_field_mapping`, `entity_extraction`, `anomaly_detection`, etc.) and are out of HF-214 Phase 2 scope.

### 1.2 Response normalization site

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`
**Top-level confidence population — line 213 verbatim (pre-amendment):**

```typescript
confidence: Number(parsed.confidence) || 0,
```

**Per-component confidence population — line 246 verbatim (pre-amendment):**

```typescript
confidence: Number(c.confidence) || 50,
```

Both sites populate from raw AI response with no range check. Note the asymmetric fallback: top-level fell back to `0` (interpretable as ratio), per-component fell back to `50` (interpretable as percentage). Post-amendment, both fallbacks are ratio-form (`0` and `0.5` respectively).

### 1.3 signal-persistence.ts current state (Phase 1 instrumentation preserved)

**File:** `web/src/lib/ai/signal-persistence.ts`
**Total lines pre-amendment:** 196 (HEAD of `main` post-Phase 1)
**HF-214 Phase 1 catch-block instrumentation:**
- `persistSignal` catch block: lines 76–84 (pre-amendment)
- `persistSignalBatch` catch block: lines 130–148 (pre-amendment)

**Phase 1 catch-block lines verbatim (preserved byte-identical post-Phase 2):**

`persistSignal` catch (lines 91–99 in post-amendment file numbering):

```typescript
    if (error) {
      console.error('[SignalPersistence] Failed to persist signal:', error.message, '| signal_type:', signal.signalType, '| tenant:', signal.tenantId);
      const sv: Record<string, unknown> = signal.signalValue || {};
      const metricName = sv['metric_name'] ?? null;
      const componentIndex = sv['component_index'] ?? null;
      const svJson = JSON.stringify(signal.signalValue ?? null);
      const svTruncated = svJson.length > 200 ? svJson.slice(0, 200) + '…' : svJson;
      console.error(`[SignalPersistence] signal_type=${signal.signalType} confidence=${String(signal.confidence)} metric_name=${String(metricName)} component_index=${String(componentIndex)} signal_value_truncated=${svTruncated}`);
      return { success: false, error: error.message };
    }
```

`persistSignalBatch` catch (lines 168–179 in post-amendment file numbering):

```typescript
    if (error) {
      console.error('[SignalPersistence] Batch failed:', error.message, '| count:', signals.length, '| tenant:', signals[0]?.tenantId);
      for (let i = 0; i < signals.length; i++) {
        const s = signals[i];
        const sv: Record<string, unknown> = s.signalValue || {};
        const metricName = sv['metric_name'] ?? null;
        const componentIndex = sv['component_index'] ?? null;
        const svJson = JSON.stringify(s.signalValue ?? null);
        const svTruncated = svJson.length > 200 ? svJson.slice(0, 200) + '…' : svJson;
        console.error(`[SignalPersistence] row=${i} signal_type=${s.signalType} confidence=${String(s.confidence)} metric_name=${String(metricName)} component_index=${String(componentIndex)} signal_value_truncated=${svTruncated}`);
      }
      return { success: false, count: 0, error: error.message };
    }
```

The Phase 2 writer-side clamp is added BEFORE the insert call (lines 62–76 single-row, 135–149 batch in post-amendment numbering), structurally distinct from the catch blocks. The catch-block lines are byte-identical to `main`.

### 1.4 Anomalies / ambiguities surfaced

Two anomalies surfaced during Phase 0 of the predecessor directive draft, both halted on per SR-41 and dispositioned by architect re-issuance:

1. **Three-file scope vs. directive's "TWO source files" header** — the prompt lives in `anthropic-adapter.ts`, not in `ai-plan-interpreter.ts`. Architect re-issued directive with three-file scope explicit.
2. **Line 408 amendment authority vs. "additive only" clause** — pure-additive instruction cannot resolve `(0-100)` vs. ratio-form contradiction. Architect re-issued directive with explicit line 408 amendment authority and "wording at CC discretion; structural intent binding."

Both were dispositioned cleanly. Implementation proceeded under the re-issued directive.

---

## Section 2 — Verbatim diffs

### 2.1 Change 1 (B1) — AI plan interpretation prompt

**File:** `web/src/lib/ai/providers/anthropic-adapter.ts`
**Lines changed:** 408 (single-line replacement)

**Before:**

```typescript
3. Return confidence scores (0-100) for each component and overall.
```

**After:**

```typescript
3. Return confidence scores as a decimal probability ratio between 0.0 and 1.0 for each component and overall (e.g., 0.95 means high confidence; 0.50 means uncertain). Do NOT emit integer percentages such as 95 or 90 — emit ratio form 0.95 and 0.90 instead.
```

Korean Test compliance: only general probability vocabulary used (`decimal probability ratio`, `0.0 and 1.0`, `0.95`, `0.50`, `0.90`); no domain-specific (compensation, ICM) or language-specific (Spanish, Korean, English-only) literals.

### 2.2 Change 2 (B2) — response normalization

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`
**Lines changed:** 213 (top-level call), 246 (per-component call), 217–232 (new private method)

**Before (top-level — line 213):**

```typescript
      confidence: Number(parsed.confidence) || 0,
```

**After (top-level — line 213):**

```typescript
      confidence: this.normalizeConfidence(parsed.confidence, 'interpretation.confidence', 0),
```

**Before (per-component — line 246):**

```typescript
        confidence: Number(c.confidence) || 50,
```

**After (per-component — line 262):**

```typescript
        confidence: this.normalizeConfidence(c.confidence, `interpretation.components[${index}].confidence`, 0.5),
```

**Before (no `normalizeConfidence` private method existed):**

(no equivalent — new private method)

**After (lines 217–232):**

```typescript
  // HF-214 Phase 2 (B2): structural normalization for AI-emitted confidence values.
  // Confidence is a decimal probability ratio in [0, 1]. Values > 1 are treated as
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

**Note on fallback semantics:** the per-component fallback changed from `50` (percentage-encoded) to `0.5` (ratio-encoded). The original `Number(c.confidence) || 50` would coerce a valid `0` confidence input to `50` via the `||` falsy-check; the new `Number.isFinite` guard preserves explicit `0` as a valid AI signal of zero confidence. This is a corrective semantic improvement aligned with T1-E922 (consume AI's decision as-produced); see Section 6.

### 2.3 Change 3 (A) — writer-side clamp (single-row `persistSignal`)

**File:** `web/src/lib/ai/signal-persistence.ts`
**Lines changed:** 62–76 (clamp insertion before insert call); 84 (insert object — `confidence` field references new `clampedConfidence`)

**Before (insert site only — Phase 1 form):**

```typescript
    const { error } = await supabase
      .from('classification_signals')
      .insert({
        tenant_id: signal.tenantId,
        entity_id: signal.entityId || null,
        signal_type: signal.signalType,
        signal_value: (signal.signalValue || {}) as Json,
        confidence: signal.confidence ?? null,
        source: signal.source ?? 'ai_prediction',
        context: (signal.context ?? {}) as Json,
        calculation_run_id: signal.calculationRunId ?? null,
        rule_set_id: signal.ruleSetId ?? null,
      });
```

**After:**

```typescript
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
        entity_id: signal.entityId || null,
        signal_type: signal.signalType,
        signal_value: (signal.signalValue || {}) as Json,
        confidence: clampedConfidence,
        source: signal.source ?? 'ai_prediction',
        context: (signal.context ?? {}) as Json,
        calculation_run_id: signal.calculationRunId ?? null,
        rule_set_id: signal.ruleSetId ?? null,
      });
```

### 2.4 Change 3 (A) — writer-side clamp (batch path `persistSignalBatch`)

**File:** `web/src/lib/ai/signal-persistence.ts`
**Lines changed:** 132–158 (rows.map rewrite to host clamp logic per-row)

**Before:**

```typescript
    const rows = signals.map(s => ({
      tenant_id: s.tenantId,
      entity_id: s.entityId || null,
      signal_type: s.signalType,
      signal_value: (s.signalValue || {}) as Json,
      confidence: s.confidence ?? null,
      source: s.source ?? 'ai_prediction',
      context: (s.context ?? {}) as Json,
      calculation_run_id: s.calculationRunId ?? null,
      rule_set_id: s.ruleSetId ?? null,
    }));
```

**After:**

```typescript
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
        confidence: clampedConfidence,
        source: s.source ?? 'ai_prediction',
        context: (s.context ?? {}) as Json,
        calculation_run_id: s.calculationRunId ?? null,
        rule_set_id: s.ruleSetId ?? null,
      };
    });
```

---

## Section 3 — Out-of-scope verification

CC explicitly confirms:

- ☑ NO modification to `classification_signals` schema or any migration file
- ☑ NO modification to `plan-comprehension-emitter.ts`
- ☑ NO modification to `convergence-service.ts` or any reader
- ☑ NO promotion of non-blocking-to-blocking failure handling (Option D out of scope)
- ☑ NO modification to any other signal_type emitter
- ☑ NO new dependencies, NO new helper modules — `normalizeConfidence` is a private method on the existing `AIPlainInterpreter` class within the existing file
- ☑ HF-214 Phase 1 catch-block instrumentation preserved exactly (verbatim before/after pasted in Section 1.3; diff against `main` shows zero `-` lines in catch-block ranges)
- ☑ Clamp logic uses no domain-specific or language-specific literals (Korean Test compliant — only `Math.min`, `Math.max`, structural value `0.9999`)
- ☑ Clamp logic does not hardcode schema precision references — no string `"NUMERIC(5,4)"` or `"5,4"` appears in either file; the value `0.9999` is the structural ceiling on probability ratio (max representable < 1.0)

### git diff main..HEAD --stat

```
 web/src/lib/ai/providers/anthropic-adapter.ts   |  2 +-
 web/src/lib/ai/signal-persistence.ts            | 56 +++++++++++++++++++------
 web/src/lib/compensation/ai-plan-interpreter.ts | 20 ++++++++-
 3 files changed, 63 insertions(+), 15 deletions(-)
```

Three source files modified, no other source files touched. Completion report file is the only additional path in the upcoming commit.

---

## Section 4 — Build, lint, type-check, dev server evidence

### 4.1 npm run build

**Exit code:** 0

```
> @vialuce/platform@0.1.0 build
> next build

   ▲ Next.js 14.2.35
 ✓ Compiled successfully
   ...
+ First Load JS shared by all                 88.1 kB
ƒ Middleware                                  76 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Pre-existing dynamic-server-usage warnings on cookie-using routes (`/api/ai/metrics`, `/api/canvas`, `/admin/launch/*`, etc.) unchanged from `main`. No new TypeScript or lint errors.

### 4.2 npm run lint

**Exit code:** 0

```
$ npm run lint 2>&1 | grep -E "(error|Error|✗|^\.\/src\/lib\/(ai|compensation))" | head -30
(zero matches — empty output)
```

Zero lint errors. Zero new warnings on the three modified files.

### 4.3 npx tsc --noEmit

**Exit code:** 1 (pre-existing — see below)

```
__tests__/round-trip-closure/run.ts(285,3): error TS2345: Argument of type 'typeof SignalNotRegisteredError' is not assignable to parameter of type 'new (message: string) => Error'.
  Types of construct signatures are incompatible.
    Type 'new (signalType: string, callingContext: string, availableSignalTypes: string[]) => SignalNotRegisteredError' is not assignable to type 'new (message: string) => Error'.
      Target signature provides too few arguments. Expected 3 or more, but got 1.
```

This error is **pre-existing on `main`** (verified during HF-214 Phase 1 via `git stash && npx tsc --noEmit && git stash pop`; see HF-214 Phase 1 PR #380 §4.2). Not introduced by HF-214 Phase 2.

**Filter for errors on the three changed files:**

```
$ npx tsc --noEmit 2>&1 | grep -E "src/lib/(ai|compensation)"
(zero matches — no type errors on the three changed files)
```

### 4.4 Dev server start + login route check

**Dev server log:**

```
> @vialuce/platform@0.1.0 dev
> next dev

  ▲ Next.js 14.2.35
  - Local:        http://localhost:3000
  - Environments: .env.local

 ✓ Starting...
 ✓ Ready in 1197ms
```

**Smoke test:**

```
$ curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
200
```

Dev server bound to port 3000 successfully and responded with HTTP 200 on `/login`.

---

## Section 5 — Architect-verifiable empirical assertion (post-merge)

This section documents the empirical observation the architect performs after merging this PR and triggering a Meridian reimport. CC writes this section as forward-looking documentation — CC does NOT perform the verification.

> "After this PR merges and the architect triggers a Meridian plan reimport on production, the architect will observe in the database:
>
> 1. **Comprehension signals persist:** `SELECT count(*) FROM classification_signals WHERE rule_set_id = '3d629051-f788-44f6-a546-45876dd187b1' AND signal_type = 'comprehension:plan_interpretation'` returns a non-zero count (expected: 10, matching the variant×component count for Meridian — 5 senior + 5 standard).
>
> 2. **Confidence values are in 0.0–1.0 range:** the persisted rows show confidence values as decimals (e.g., 0.90, 0.95), not integer percentages (90, 95). Sample query: `SELECT confidence FROM classification_signals WHERE rule_set_id = '3d629051-f788-44f6-a546-45876dd187b1' AND signal_type = 'comprehension:plan_interpretation' ORDER BY created_at DESC LIMIT 10`.
>
> 3. **Vercel logs may show clamp warnings** if any confidence value still exceeds the range despite producer-side normalization. Format: `[SignalPersistence] confidence clamped: original=<v> clamped=<v> signal_type=<type> metric_name=<name> component_index=<idx>`. If clamp warnings appear, this signals that the B1+B2 producer fix is incomplete and architect-channel investigation is warranted (e.g., an AI response that bypassed the B2 normalizer, or a non-AI writer producing out-of-range values). If no clamp warnings appear, B1+B2 is sufficient and A is correctly serving as defense-in-depth.
>
> 4. **`AIPlanInterpreter` normalization warnings may appear in Vercel logs** in format `[AIPlanInterpreter] confidence normalized: field=<path> original=<v> normalized=<v>`. These indicate the AI emitted a percentage-form value despite the amended B1 prompt and the B2 normalizer correctly converted it. Persistent normalization warnings indicate the AI is not honoring the amended prompt; clean (zero-warning) reimports indicate B1 is sufficient.
>
> 5. **The c4 magnitude defect** (`hub_utilization_rate_capped` resolving to 121.56 instead of 0.8292 per DIAG-035) may or may not resolve as a downstream consequence. **This Phase 2 does NOT adjudicate c4** — c4 verification is a separate empirical observation per T1-E947 reasoning-scope binding specificity. Architect determines next phase scope (HF-214 Phase 3 or HF-215) based on c4 observation post-Phase 2."

The architect performs the reimport and observes the database. CC does NOT perform the verification.

---

## Section 6 — PR and merge

| Item | Value |
|---|---|
| PR number | [populated post-PR-creation] |
| PR URL | [populated post-PR-creation] |
| Vercel deploy preview status | [observed post-PR-creation] |
| Build check status | [observed post-PR-creation] |
| Mergeable | [observed post-PR-creation] |
| Branch | `hf-214-phase2-confidence-convention-enforcement` |
| Initial commit SHA | [populated post-commit] |

---

## Section 7 — Carry-forward notes

### 7.1 Per-component fallback semantic improvement

The original per-component normalization at `ai-plan-interpreter.ts:246` used `Number(c.confidence) || 50` — coercing a valid `0` AI signal (zero confidence) to fallback `50` via the `||` falsy-check. The post-amendment helper uses `Number.isFinite()` as the validity guard, preserving explicit `0` as a valid AI signal. This is a corrective semantic improvement aligned with T1-E922 (consume AI's decision as-produced), surfaced naturally by the centralization of normalization logic.

### 7.2 Cosmetic log inconsistency at ai-plan-interpreter.ts:178

Line 178 (`${comp.confidence}% confidence`) appends a literal `%` to a value that is now in 0.0–1.0 ratio form. Post-amendment, this log line will display `0.95% confidence` instead of `95% confidence` — a cosmetic display defect, not a behavioral one. Out of HF-214 Phase 2 scope; carry-forward observation only. Architect can address in a follow-up cosmetic-only commit if desired.

### 7.3 Other prompt templates with `(0-100)` confidence references

The file `web/src/lib/ai/providers/anthropic-adapter.ts` contains additional `confidence: 0-100` and `confidence scores (0-100)` references in templates other than `plan_interpretation` (specifically: `file_classification`, `sheet_classification`, `field_mapping`, `field_mapping_second_pass`, `workbook_analysis`, `import_field_mapping`, `entity_extraction`, `anomaly_detection`, `recommendation`). These are out of HF-214 Phase 2 scope per directive. If similar overflow failures surface for other signal_types, the same B1 amendment pattern applies.

### 7.4 IRA-supersession candidates (architect-channel disposition pending)

The IRA verdict identified two supersession candidates, both `recommended_action: extend`:

- **T2-E29 → v3:** explicitly state confidence-out-of-range as contract violation; mandate ratio-encoded confidence at producer; specify defense-in-depth at persistence layer
- **T2-E08 → v4:** specify error-handling posture for sole-operative-path signal writes (block or alert; no silent non-blocking)

Architect dispositions ACT / DEFER / REJECT / WATCH per `IRA_INVOCATION_REFERENCE §6`. CC does NOT execute supersessions.

---

## Section 8 — Closing checklist

- ☑ Three source files modified (anthropic-adapter.ts, ai-plan-interpreter.ts, signal-persistence.ts), no others
- ☑ Three changes (B1, B2, A) implemented per scope
- ☑ Build clean (`✓ Compiled successfully`)
- ☑ Lint clean (zero errors, zero new warnings on changed files)
- ☑ Type-check: pre-existing error on `__tests__/round-trip-closure/run.ts:285` (verified pre-existing); zero new errors on changed files
- ☑ Dev server starts (`Ready in 1197ms`) and login route responds 200
- ☑ Section 3 out-of-scope verification fully populated with explicit checkboxes
- ☑ HF-214 Phase 1 instrumentation preserved exactly (verbatim before/after pasted)
- ☑ Korean Test compliance verified (no domain-specific literals in clamp logic; only general probability vocabulary in B1 prompt)
- ☑ Clamp logic uses no schema-precision string references
- ☑ Section 5 architect-verifiable empirical assertion documented (forward-looking only)
- ☑ "COMPLETION REPORT" appears in H1 title and filename
- ☑ git diff pasted in Section 3
- ☐ PR opened with `--base main --head hf-214-phase2-confidence-convention-enforcement` *(populated at PR creation)*
