# AUD-012 — Execute / Execute-Bulk Comprehensive Trace for Unification

**Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.**

---

## PURPOSE

The platform has two import API routes: `execute/route.ts` and `execute-bulk/route.ts`. HF-231 unified the committed_data WRITE path via `commitContentUnit`, but the routes themselves remain separate with divergent behavior — most critically, `execute-bulk` clears `input_bindings` to `{}` on every import while `execute` preserves them.

This audit extracts the complete structure of both routes so the architect can design a single unified import path. **Read-only. Zero code changes.**

---

## PROBE 1 — FULL ROUTE STRUCTURE

### 1A — execute-bulk/route.ts

Paste the full file structure. NOT the entire file — the STRUCTURE. For each function in the file:

```bash
grep -n "^export\|^async function\|^function\|^const.*=.*async\|^const.*=.*function\|^  async function\|processEntityUnit\|processDataUnit\|processReferenceUnit\|processPlanUnit" web/src/app/api/import/sci/execute-bulk/route.ts
```

Paste full output. Then for each function found, paste:
- Function signature (parameters and return type)
- First 5 lines of body (to show what it does)
- Any call to `commitContentUnit`
- Any call to `supabase.from('rule_sets').update`
- Any call to `supabase.from('entities')`
- Any `input_bindings` reference

### 1B — execute/route.ts

Same extraction:

```bash
grep -n "^export\|^async function\|^function\|^const.*=.*async\|^const.*=.*function\|^  async function\|executeEntityPipeline\|executeTransactionPipeline\|executeTargetPipeline\|executeReferencePipeline\|executeBatchedPlanInterpretation" web/src/app/api/import/sci/execute/route.ts
```

Paste full output. Same detail per function as 1A.

---

## PROBE 2 — THE THREE BINDING CLEARS

### 2A — All three clearing sites in execute-bulk

Paste 20 lines of context above and below EACH of these three sites:

- Line ~532: `.update({ input_bindings: {} })`
- Line ~579: `.update({ input_bindings: {} })`
- Line ~657: `.update({ input_bindings: {} })`

For each: what triggered the clear? What classification? What comment explains why?

### 2B — Does execute clear bindings?

```bash
grep -n "input_bindings.*{}" web/src/app/api/import/sci/execute/route.ts
grep -n "input_bindings" web/src/app/api/import/sci/execute/route.ts
```

Paste full output. Does `execute` ever clear `input_bindings`? Or does it write/preserve them?

---

## PROBE 3 — commitContentUnit

### 3A — Full function

Paste the entire `commitContentUnit` function from `web/src/lib/sci/commit-content-unit.ts`. Every line.

### 3B — All callers

```bash
grep -rn "commitContentUnit" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."
```

Paste full output. How many call sites? Which route do they live in?

---

## PROBE 4 — SIDE EFFECTS BY CLASSIFICATION

For each content classification type (entity, transaction, target, reference, plan), trace what SIDE EFFECTS occur beyond the `commitContentUnit` call:

### 4A — Entity classification side effects

In execute-bulk, find `processEntityUnit`. Paste everything it does BESIDES calling `commitContentUnit`:
- Entity creation/enrichment (`supabase.from('entities')` calls)
- Entity resolution
- Any other table writes

In execute, find `executeEntityPipeline`. Same extraction.

### 4B — Plan classification side effects

In execute-bulk, find `processPlanUnit`. Paste everything it does BESIDES calling `commitContentUnit`:
- Plan interpretation (AI/anthropic calls)
- Rule set creation
- Any other table writes

In execute, find `executeBatchedPlanInterpretation` or equivalent. Same extraction.

### 4C — Transaction/target/reference classification side effects

In execute-bulk: what does `processDataUnit` do beyond `commitContentUnit`?
In execute: what do `executeTransactionPipeline`, `executeTargetPipeline`, `executeReferencePipeline` do beyond `commitContentUnit`?

List any side effect that differs between the two routes for the same classification.

---

## PROBE 5 — CONVERGENCE TRIGGER POINTS

### 5A — Where does convergence run at import time?

```bash
grep -rn "convergeBindings\|convergence" web/src/app/api/import/sci/execute/route.ts | head -20
grep -rn "convergeBindings\|convergence" web/src/app/api/import/sci/execute-bulk/route.ts | head -20
```

Does `execute` run convergence at import time? Does `execute-bulk`? OB-182 removed convergence from `execute-bulk` — verify this is still the case.

### 5B — Where does convergence run at calc time?

```bash
grep -n "convergeBindings\|HF-165.*convergence\|input_bindings empty" web/src/app/api/calculation/run/route.ts | head -20
```

Paste the calc-time convergence trigger block (lines ~229-429 from DIAG-052 Probe 2B — already captured, paste the reference).

---

## PROBE 6 — STRUCTURAL FINGERPRINT AND FLYWHEEL

### 6A — Fingerprint writes

```bash
grep -rn "structural_fingerprints" web/src/app/api/import/sci/execute-bulk/route.ts | head -20
grep -rn "structural_fingerprints" web/src/app/api/import/sci/execute/route.ts | head -20
```

Which route writes structural fingerprints? Both? One?

### 6B — Flywheel cache interaction

```bash
grep -rn "flywheel\|fingerprint.*cache\|cache.*fingerprint\|insufficientFlywheelCache" web/src/app/api/import/sci/execute-bulk/route.ts | head -20
grep -rn "flywheel\|fingerprint.*cache\|cache.*fingerprint" web/src/app/api/import/sci/execute/route.ts | head -20
```

---

## PROBE 7 — UI CALL SITES

### 7A — Which route does the browser call?

```bash
grep -rn "execute-bulk\|execute/\|/api/import/sci/execute" web/src/app/ web/src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v route.ts | grep -v ".test."
```

Paste full output. Which UI components call which route?

### 7B — Is execute reachable from ANY UI surface?

If no UI component calls `execute`, it's dead code. Confirm.

---

## PROBE 8 — LINE COUNTS AND OVERLAP

```bash
wc -l web/src/app/api/import/sci/execute/route.ts
wc -l web/src/app/api/import/sci/execute-bulk/route.ts
wc -l web/src/lib/sci/commit-content-unit.ts
```

And a diff summary showing what's structurally different:

```bash
diff <(grep -n "function\|async\|supabase\|import\|export" web/src/app/api/import/sci/execute/route.ts) \
     <(grep -n "function\|async\|supabase\|import\|export" web/src/app/api/import/sci/execute-bulk/route.ts) \
     | head -80
```

---

## COMPLETION

Save to `docs/audits/AUD-012_EXECUTE_EXECUTE_BULK_TRACE.md` and commit.

The report is pasted code from Probes 1-8. No interpretation. No recommendations. Paste the evidence. The architect reads it and designs the unified path.

Branch: `aud-012-import-path-trace` off `main`.

`gh pr create --base main --head aud-012-import-path-trace` with title: "AUD-012: Execute / Execute-Bulk comprehensive trace for unification — read-only"

PR body: "Read-only audit. Eight probes extracting full route structure, binding clearing sites, commitContentUnit callers, side effects by classification, convergence trigger points, flywheel interaction, UI call sites, and structural overlap. Zero code changes. Architect designs unified import path from this evidence."
