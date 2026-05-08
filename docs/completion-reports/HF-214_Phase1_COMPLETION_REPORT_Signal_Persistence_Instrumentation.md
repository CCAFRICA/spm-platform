# HF-214 Phase 1 COMPLETION REPORT — Signal Persistence Instrumentation (Logging-Only)

**Date:** 2026-05-08T20:54:03Z
**Branch:** `hf-214-phase1-signal-persistence-instrumentation`
**Commit:** [populated post-commit at end of report]
**Type:** Logging-only instrumentation; no behavioral change
**Predecessor probes:** DIAG-035 (PR #377), DIAG-036 (PR #378), DIAG-037 (PR #379)

---

## Section 1 — Files modified

| File | Change type | Lines changed |
|---|---|---|
| `web/src/lib/ai/signal-persistence.ts` | error-path logging extended (catch-block additions) | +15 / -0 |
| `docs/completion-reports/HF-214_Phase1_COMPLETION_REPORT_Signal_Persistence_Instrumentation.md` | new file | +N (this file) |

No other files modified. No new imports added. No new functions added. Success paths byte-identical to pre-change.

---

## Section 2 — Verbatim diff

### 2.1 Single-row path (`persistSignal` catch block)

**Before** (verbatim from `main`, lines 76–79):

```typescript
    if (error) {
      console.error('[SignalPersistence] Failed to persist signal:', error.message, '| signal_type:', signal.signalType, '| tenant:', signal.tenantId);
      return { success: false, error: error.message };
    }
```

**After** (verbatim post-change, lines 76–85 of the modified file):

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

### 2.2 Batch path (`persistSignalBatch` catch block)

**Before** (verbatim from `main`, lines 130–133 per DIAG-037 §2.4):

```typescript
    if (error) {
      console.error('[SignalPersistence] Batch failed:', error.message, '| count:', signals.length, '| tenant:', signals[0]?.tenantId);
      return { success: false, count: 0, error: error.message };
    }
```

**After** (verbatim post-change, lines 136–148 of the modified file):

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

---

## Section 3 — Out-of-scope verification

CC explicitly confirms:

- ☑ No `Math.min` / `Math.max` / clamp / coercion / `toFixed` added anywhere in the file
- ☑ Success paths in both functions byte-identical to before (the diff below shows only the two catch blocks changed)
- ☑ No new imports added (the import block is byte-identical pre/post)
- ☑ Function signatures unchanged
- ☑ Return shape `{ count: number, error?: string }` unchanged (single-row path still `{ success: boolean; error?: string }`; batch path still `{ success: boolean; count: number; error?: string }`)
- ☑ No file modified outside `signal-persistence.ts` and this completion report
- ☑ `persistSignal` line 77 (existing `console.error`) preserved verbatim
- ☑ `persistSignalBatch` line 131 (existing `console.error`) preserved verbatim
- ☑ `plan-comprehension-emitter.ts` not modified
- ☑ No callers of `persistSignal` / `persistSignalBatch` modified
- ☑ Schema unchanged — no migration files in this branch
- ☑ `signal_type` value unchanged

### 3.1 Import block verification

**Before** (verbatim from `main`, lines 13–19):

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/database.types';
// HF-198 E3: signal-type read-coupling — every signal_type validated against
// the registry before persist. Unregistered writes log a soft warn (signal
// writes are fire-and-forget; discipline preserved). Hard-failure path is
// available via assertRegistered() at call sites that require it.
import { isRegistered as isSignalTypeRegistered, all as allRegisteredSignalTypes } from '@/lib/intelligence/signal-registry';
```

**After** (verbatim post-change, lines 13–19 of the modified file):

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/database.types';
// HF-198 E3: signal-type read-coupling — every signal_type validated against
// the registry before persist. Unregistered writes log a soft warn (signal
// writes are fire-and-forget; discipline preserved). Hard-failure path is
// available via assertRegistered() at call sites that require it.
import { isRegistered as isSignalTypeRegistered, all as allRegisteredSignalTypes } from '@/lib/intelligence/signal-registry';
```

Identical (byte-for-byte). No imports added.

### 3.2 Function signature verification

**`persistSignal`** signature (lines 45–49) — unchanged:

```typescript
export async function persistSignal(
  signal: SignalData,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<{ success: boolean; error?: string }> {
```

**`persistSignalBatch`** signature (lines 91–95) — unchanged:

```typescript
export async function persistSignalBatch(
  signals: SignalData[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<{ success: boolean; count: number; error?: string }> {
```

### 3.3 Full `git diff main..HEAD -- web/src/lib/ai/signal-persistence.ts`

```
diff --git a/web/src/lib/ai/signal-persistence.ts b/web/src/lib/ai/signal-persistence.ts
index 5c364315..e800ce60 100644
--- a/web/src/lib/ai/signal-persistence.ts
+++ b/web/src/lib/ai/signal-persistence.ts
@@ -75,6 +75,12 @@ export async function persistSignal(
 
     if (error) {
       console.error('[SignalPersistence] Failed to persist signal:', error.message, '| signal_type:', signal.signalType, '| tenant:', signal.tenantId);
+      const sv: Record<string, unknown> = signal.signalValue || {};
+      const metricName = sv['metric_name'] ?? null;
+      const componentIndex = sv['component_index'] ?? null;
+      const svJson = JSON.stringify(signal.signalValue ?? null);
+      const svTruncated = svJson.length > 200 ? svJson.slice(0, 200) + '…' : svJson;
+      console.error(`[SignalPersistence] signal_type=${signal.signalType} confidence=${String(signal.confidence)} metric_name=${String(metricName)} component_index=${String(componentIndex)} signal_value_truncated=${svTruncated}`);
       return { success: false, error: error.message };
     }
     return { success: true };
@@ -129,6 +135,15 @@ export async function persistSignalBatch(
 
     if (error) {
       console.error('[SignalPersistence] Batch failed:', error.message, '| count:', signals.length, '| tenant:', signals[0]?.tenantId);
+      for (let i = 0; i < signals.length; i++) {
+        const s = signals[i];
+        const sv: Record<string, unknown> = s.signalValue || {};
+        const metricName = sv['metric_name'] ?? null;
+        const componentIndex = sv['component_index'] ?? null;
+        const svJson = JSON.stringify(s.signalValue ?? null);
+        const svTruncated = svJson.length > 200 ? svJson.slice(0, 200) + '…' : svJson;
+        console.error(`[SignalPersistence] row=${i} signal_type=${s.signalType} confidence=${String(s.confidence)} metric_name=${String(metricName)} component_index=${String(componentIndex)} signal_value_truncated=${svTruncated}`);
+      }
       return { success: false, count: 0, error: error.message };
     }
     return { success: true, count: signals.length };
```

Two hunks, both inside catch blocks. No success-path lines, no import lines, no function-signature lines touched.

### 3.4 git status confirms only two paths modified

```
On branch hf-214-phase1-signal-persistence-instrumentation
Changes not staged for commit:
  modified:   web/src/lib/ai/signal-persistence.ts

Untracked files:
  docs/completion-reports/HF-214_Phase1_COMPLETION_REPORT_Signal_Persistence_Instrumentation.md
```

Other untracked files in the working tree are pre-existing artifacts unrelated to this branch (directives, prior-HF completion reports). They are NOT staged in this commit.

---

## Section 4 — Build and lint evidence

### 4.1 `npm run build`

```
> @vialuce/platform@0.1.0 build
> next build

   ▲ Next.js 14.2.35
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   ...
   Generating static pages (... / ...)
   ...
+ First Load JS shared by all                 88.1 kB
   ├ chunks/2117-a743d72d939a4854.js           31.9 kB
   ├ chunks/fd9d1056-5bd80ebceecc0da8.js       53.7 kB
   └ other shared chunks (total)               2.59 kB

ƒ Middleware                                  76 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Status: **Compiled successfully.** No new TypeScript errors. No new lint errors. Pre-existing warnings (`react-hooks/exhaustive-deps`, `@next/next/no-img-element`, dynamic-server-usage prerender warnings) unchanged from `main`.

### 4.2 `npx tsc --noEmit` (TypeScript strict typecheck)

```
__tests__/round-trip-closure/run.ts(285,3): error TS2345: Argument of type 'typeof SignalNotRegisteredError' is not assignable to parameter of type 'new (message: string) => Error'.
  Types of construct signatures are incompatible.
    Type 'new (signalType: string, callingContext: string, availableSignalTypes: string[]) => SignalNotRegisteredError' is not assignable to type 'new (message: string) => Error'.
      Target signature provides too few arguments. Expected 3 or more, but got 1.
```

This error is **pre-existing on `main`** (verified by `git stash && npx tsc --noEmit` → identical error → `git stash pop`). Not introduced by HF-214 Phase 1. The error is in `__tests__/round-trip-closure/run.ts`, an unrelated test file. Zero new errors on `web/src/lib/ai/signal-persistence.ts`.

### 4.3 `npm run lint`

```
... (pre-existing warnings on unrelated files: my-compensation/page.tsx, operate/reconciliation/page.tsx, PlanCard.tsx, HierarchyNode.tsx, auth-shell.tsx, Sidebar.tsx, SCIExecution.tsx, period-context.tsx, tenant-context.tsx) ...

info  - Need to disable some ESLint rules? Learn more here: https://nextjs.org/docs/basic-features/eslint#disabling-rules
```

Filter for errors / signal-persistence.ts:

```
$ npm run lint 2>&1 | grep -E "(error|Error|✗|^\.\/src\/lib\/ai\/signal-persistence)"
(zero matches — empty output)
```

Status: **No lint errors. No new warnings on the modified file.**

### 4.4 Localhost dev server start

```
> @vialuce/platform@0.1.0 dev
> next dev

  ▲ Next.js 14.2.35
  - Local:        http://localhost:3000
  - Environments: .env.local

 ✓ Starting...
 ✓ Ready in 1449ms
```

Smoke test:

```
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/login
HTTP 200
```

Dev server bound to port 3000 successfully and responded with HTTP 200 on `/login`.

---

## Section 5 — Localhost dry-run trace (architect verifies post-merge)

This section documents what the architect will observe on the next Meridian reimport in production. CC has not invoked the production write path; this is forward-looking documentation per the directive.

> Upon next Meridian reimport on production, the existing failure path at `signal-persistence.ts` catch-block will emit additional log lines per row. The architect will observe in Vercel runtime logs:
>
> - **One header line per failure** (existing `[SignalPersistence] Batch failed: ...` pattern, preserved byte-identical)
> - **N additional lines per failure** where N = batch size, format: `[SignalPersistence] row=<idx> signal_type=<type> confidence=<value> metric_name=<name> component_index=<idx> signal_value_truncated=<200char>`
>
> The architect will use these lines to identify which row(s) in the batch trip the constraint and what value(s) cause the failure. No automatic remediation is applied; this commit is diagnostic only.

For the single-row failure path (`persistSignal`), the format is the same minus the `row=<idx>` prefix:

> `[SignalPersistence] signal_type=<type> confidence=<value> metric_name=<name> component_index=<idx> signal_value_truncated=<200char>`

### 5.1 Field-by-field semantics

| Field | Source | Notes |
|---|---|---|
| `row=<idx>` | loop counter `i` (batch path only) | 0-indexed; identifies which row in the batch tripped the constraint |
| `signal_type` | `signal.signalType` (single) / `s.signalType` (batch) | Per OB-197 prefix vocabulary: `comprehension:plan_interpretation`, `classification:outcome`, etc. |
| `confidence` | `signal.confidence` (single) / `s.confidence` (batch) — typed as-passed | Could be `number`, `null`, or `undefined`. Wrapped via `String(...)` for log emission only — original value passed to insert is unchanged. |
| `metric_name` | `signalValue['metric_name']` if present, else `null` | HF-193-A typed column candidate; surfaced from JSONB payload if present |
| `component_index` | `signalValue['component_index']` if present, else `null` | HF-193-A typed column candidate; surfaced from JSONB payload if present |
| `signal_value_truncated` | `JSON.stringify(signal.signalValue ?? null).slice(0, 200)` with `…` suffix if longer | Truncated to 200 characters; no JSON-aware filtering, no field redaction — architect sees what was passed |

### 5.2 What the architect cannot determine from these logs alone

These logs surface the values that were **passed** to the failed `INSERT` call. They do NOT establish:
- Whether the `confidence NUMERIC(5,4)` schema constraint is what triggered the overflow (architect-channel inference)
- Whether the upstream AI service returned a value outside `[0, 9.9999]` or whether the value was generated downstream
- Which signal-type rows in the failing batch caused the constraint violation vs. which were valid (Postgres rejects the entire batch on first violation; logs show all rows for forensic inspection)

These determinations are architect-channel work per T2-E46 reconciliation-channel separation. This commit provides the evidence; it does not interpret it.

---

## Section 6 — PR and merge

| Item | Value |
|---|---|
| PR number | [populated post-PR-creation] |
| PR URL | [populated post-PR-creation] |
| Vercel deploy preview status | [observed post-PR-creation] |
| Build check status | [observed post-PR-creation] |
| Mergeable | [observed post-PR-creation] |

---

## Section 7 — What this commit does NOT do

Explicit non-goals (per HF-214 Phase 1 directive):

- ❌ Does **NOT** fix the `comprehension:plan_interpretation` write failure
- ❌ Does **NOT** clamp `confidence` values
- ❌ Does **NOT** change schema (no migration files in this branch)
- ❌ Does **NOT** change the error-handling semantic — failures remain non-blocking exactly as before (return `{ success: false, error: ... }`, no throw)
- ❌ Does **NOT** modify any caller of `persistSignal` / `persistSignalBatch`
- ❌ Does **NOT** modify `plan-comprehension-emitter.ts`
- ❌ Does **NOT** modify `signal-registry.ts`, `signal-capture-service.ts`, or `convergence-service.ts` (the readers identified in DIAG-037 §6)
- ❌ Does **NOT** change `signal_type` values, `signal_value` payloads, or `confidence` values written to Postgres on the success path
- ❌ Does **NOT** add tests, alerting, or remediation hooks
- ❌ Does **NOT** introduce new code paths, helper functions, or imports

The architect determines next phase shape based on the evidence captured by this instrumentation after the next Meridian reimport.

---

## Section 8 — Closing checklist

- ☑ Build clean (`✓ Compiled successfully`)
- ☑ Lint clean (zero errors, zero new warnings on modified file)
- ☑ Single source-file changed (`web/src/lib/ai/signal-persistence.ts`)
- ☑ Completion report at `docs/completion-reports/HF-214_Phase1_COMPLETION_REPORT_Signal_Persistence_Instrumentation.md`
- ☑ "COMPLETION REPORT" in H1 title
- ☑ Section 3 out-of-scope verification fully populated with explicit checkboxes per item
- ☑ Section 4 build evidence pasted verbatim
- ☑ `git diff` pasted in Section 3
- ☑ Localhost dev server confirmed `Ready in 1449ms` + `HTTP 200` on `/login`
- ☐ PR opened with `--base main --head hf-214-phase1-signal-persistence-instrumentation` *(populated at end)*

---

**End of completion report.**
