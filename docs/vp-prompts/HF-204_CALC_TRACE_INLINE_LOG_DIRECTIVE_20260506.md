# HF-204 — Calc Trace Inlined as Standard Log Output

**Class:** HF (architectural simplification of HF-202 / HF-203)
**Repo:** `~/spm-platform`
**Branch:** `hf-204-calc-trace-inline-log` (create from main HEAD post-HF-203 merge)
**Type:** Substitute toggle/buffer/flush infrastructure with inline `addLog` calls; remove dead code
**Substrate authority:**
- HF-202 architectural flaw surfaced empirically: Vercel serverless function instances do not share memory; `enableTrace()` POST and `/api/calculation/run` POST may hit different instances, causing trace to silently no-op despite confirmed enable response
- HF-203 architectural compromise: per-line console.log emission worked around Vercel filesystem ephemerality but did not solve the instance-state issue
- T1-E907 (Fix Logic Not Data) — code-only change; no data manipulation
- T1-E910 (Korean Test) — generic log format; no language-specific terms
- Decision 124 (Research-Derived Design) — architecture derived from Vercel serverless deployment constraints (stateless functions; persistent log stream)
- T5-E1064 (Procedural Theater Minimization) — eliminates all toggle/buffer/flush machinery; trace is the calc log
- T1-E952 (Adjacent-Arm Drift) — closes the defect class "stateful diagnostic infrastructure on stateless serverless platform"

## ARCHITECT INTENT

HF-202 introduced toggle-able trace infrastructure. HF-203 worked around the filesystem-output gap. Both retained the architectural assumption that trace state could be controlled via separate API endpoints. **Vercel serverless invalidates that assumption** — module-level state does not persist across instance boundaries. The toggle is unreliable.

**HF-204 inlines the trace output directly into the existing calc log stream**, using the existing `addLog` infrastructure. The instrumentation always fires; the per-step diagnostic detail appears inline with normal calc logging; architects retrieve via Vercel logs as they already do for any calc diagnostic. No toggle, no buffer, no flush, no instance state, no filesystem.

**Trade-off accepted:** every calc emits more log lines (~1,700 additional lines for an 85-entity, 4-component BCL calc). Vercel handles this volume. If log volume becomes a production concern, follow-on HF gates verbose lines behind a per-request URL flag (request-scoped state always survives serverless instance boundaries).

## SCOPE

**Files DELETED:**
- `web/src/lib/calculation/calc-trace.ts` — entire toggle/buffer/flush utility
- `web/src/app/api/calculation/trace/route.ts` — toggle API endpoint
- `docs/calc-traces/.gitkeep` — directory placeholder; directory removed

**Files MODIFIED:**
- `web/src/app/api/calculation/run/route.ts` — remove `calc-trace` imports; remove `setTraceContext` calls; remove `flushTraceToMD` call; replace `traceEvent(...)` invocations in `resolveColumnFromBatch` and `resolveMetricsFromConvergenceBindings` and per-entity loop with equivalent `addLog(...)` calls
- `web/src/lib/calculation/intent-executor.ts` — remove `calc-trace` import; remove `EntityData._traceContext` field; replace `traceEvent(...)` invocations in `resolveSource`, `executeBoundedLookup1D`, `executeBoundedLookup2D`, `findBoundaryIndex` with `addLog(...)` calls

The instrumentation **points** stay identical to HF-202. Only the **mechanism** changes: from buffered/toggled trace events to inline log lines.

## LOG LINE FORMAT

Each instrumentation point produces a single `addLog` line in the form:

```
[CalcTrace] <surface>:<step> entity=<entityExternalId> componentIdx=<n> componentName=<name> | <key1>=<value1> | <key2>=<value2> | ...
```

Examples:

```
[CalcTrace] resolveColumnFromBatch:entry entity=BCL-5003 componentIdx=1 componentName="Captación de Depósitos - Ejecutivo Senior" | batchId=d51c298d-0364-4485-95ca-dc48d3eb066e | column=Pct_Meta_Depositos | hasBatchInCache=true
[CalcTrace] resolveColumnFromBatch:cache_lookup entity=BCL-5003 componentIdx=1 | initialBatchEntityMapPresent=true | hasEntity=true | diag003Fallback=false
[CalcTrace] resolveColumnFromBatch:rows_processed entity=BCL-5003 componentIdx=1 | rowCount=1 | perRowValues=[1.282] | sum=1.282 | found=true
[CalcTrace] resolveColumnFromBatch:exit entity=BCL-5003 componentIdx=1 | returned=1.282
[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=BCL-5003 componentIdx=1 | preScale=1.282 | scaleFactor=100 | postScale=128.2
[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=BCL-5003 componentIdx=1 | metric=cumplimiento_depositos | metricValue=128.2 | returnedNull=false
[CalcTrace] resolveSource:metric_lookup entity=BCL-5003 componentIdx=1 | field=cumplimiento_depositos | rawValue=128.2 | resolvedValue=128.2
[CalcTrace] findBoundaryIndex:lookup entity=BCL-5003 componentIdx=1 | value=128.2 | matchedIndex=3
[CalcTrace] executeBoundedLookup1D:execution entity=BCL-5003 componentIdx=1 | inputValue=128.2 | bandIndex=3 | outputValue=400 | noMatchFired=false
```

JSON arrays for `perRowValues` and `boundaries` are inline. Long arrays may exceed Vercel's per-line cap (~4KB); same risk-and-mitigation pattern as HF-203 (extremely rare in normal calc; follow-on HF if encountered).

## OUT OF SCOPE (deferred)

- **Per-request URL flag** for verbose-mode gating — HF-205 candidate if log volume becomes a production concern
- **Database persistence of trace** — HF-206 candidate for substrate-level trace audit trail
- **Removal of carry-over untracked files** — independent housekeeping; not part of HF-204 scope

## CC PASTE BLOCK

```markdown
# HF-204 — Calc Trace Inlined as Standard Log Output

**Repo:** `~/spm-platform`
**Branch:** create `hf-204-calc-trace-inline-log` from main HEAD
**Inheritance:** `CC_STANDING_ARCHITECTURE_RULES.md` Rules 1-28
**Bindings:**
- T1-E907 (Fix Logic Not Data)
- T1-E910 (Korean Test) — generic log format; no domain-specific tokens
- T1-E952 (Adjacent-Arm Drift Discipline) — closes "stateful diagnostic infrastructure on stateless platform" defect class
- Decision 124 — architecture derived from Vercel serverless constraints
- T5-E1064 — minimal architecture; trace is the log

## SCOPE

Remove toggle/buffer/flush trace infrastructure (HF-202 + HF-203). Replace with inline `addLog` calls at the same instrumentation points. Trace becomes part of the standard calc log stream.

**Files deleted:**
- `web/src/lib/calculation/calc-trace.ts`
- `web/src/app/api/calculation/trace/route.ts`
- `docs/calc-traces/` directory (including `.gitkeep`)

**Files modified:**
- `web/src/app/api/calculation/run/route.ts` — remove calc-trace imports + setTraceContext + flushTraceToMD; replace traceEvent calls with addLog calls
- `web/src/lib/calculation/intent-executor.ts` — remove calc-trace imports + EntityData._traceContext field; replace traceEvent calls with addLog calls

## EXECUTION

### Phase 0 — Branch + baseline

```bash
cd ~/spm-platform
git checkout main
git pull origin main
git checkout -b hf-204-calc-trace-inline-log
git rev-parse HEAD
```

PASTE output.

### Phase 1 — Inventory current trace surface

```bash
grep -n "traceEvent\|isTraceEnabled\|setTraceContext\|flushTraceToMD\|enableTrace\|disableTrace\|_traceContext\|calc-trace" web/src/app/api/calculation/run/route.ts web/src/lib/calculation/intent-executor.ts
```

PASTE output. This is the BEFORE-state inventory of every site that needs replacement or removal.

### Phase 2 — Delete files

```bash
rm web/src/lib/calculation/calc-trace.ts
rm web/src/app/api/calculation/trace/route.ts
rm -rf docs/calc-traces
git status
```

PASTE output.

### Phase 3 — Modify calc/run/route.ts

For each site identified in Phase 1 (in `calc/run/route.ts`):

**Imports:** Remove the line `import { traceEvent, isTraceEnabled, setTraceContext, flushTraceToMD } from '@/lib/calculation/calc-trace';`

**setTraceContext call (calc start):** Remove entirely. Tenant/period/ruleSet/batch identifiers are already in the calc log via existing addLog lines.

**flushTraceToMD call + surrounding `if (isTraceEnabled())` block (calc end):** Remove entirely.

**traceEvent calls in `resolveColumnFromBatch`:** Replace each with an `addLog` line in the format:
```typescript
addLog(`[CalcTrace] resolveColumnFromBatch:<step> entity=${entityExternalId} | <key>=${value} | <key>=${value}`);
```

Specifically:
- entry → `addLog('[CalcTrace] resolveColumnFromBatch:entry entity=' + entityExternalId + ' | batchId=' + batchId + ' | column=' + column + ' | hasBatchInCache=' + dataByBatch.has(batchId));`
- cache_lookup → `addLog(...initialBatchEntityMapPresent / hasEntity / diag003Fallback / fallbackBatchSelected...)`
- rows_processed → `addLog(...rowCount / perRowValues=[...] / sum / found...)`
- exit → `addLog('[CalcTrace] resolveColumnFromBatch:exit entity=' + entityExternalId + ' | returned=' + (returnedValue ?? 'null'));`

**traceEvent calls in `resolveMetricsFromConvergenceBindings`:** Replace each with an `addLog` line. Include `componentIdx` from the call-site context.

Specifically:
- entry → `addLog('[CalcTrace] resolveMetricsFromConvergenceBindings:entry entity=' + entityExternalId + ' componentIdx=' + componentIdx + ' | compBindingsKeys=' + Object.keys(compBindings).join(',') + ' | expectedMetrics=' + JSON.stringify(expectedMetrics));`
- scale_applied (per slot: actual / target / numerator / denominator) → `addLog('[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=' + entityExternalId + ' componentIdx=' + componentIdx + ' | slot=' + slotName + ' | preScale=' + preScale + ' | scaleFactor=' + scaleFactor + ' | postScale=' + postScale);`
- attainment_computed (when both target + actual present) → `addLog(...attainmentValue=...)`
- exit → `addLog('[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=' + entityExternalId + ' componentIdx=' + componentIdx + ' | metricsKeys=' + Object.keys(metrics).join(',') + ' | metricValues=' + JSON.stringify(metrics) + ' | returnedNull=' + (result === null));`

**traceEvent calls in per-entity loop (entity_start, component_complete):** Replace with addLog lines. The existing `[CalcAPI]` per-entity total log line already covers component_complete summary; entity_start can be replaced with a brief addLog noting variant + flatDataRowCount.

PASTE the full modified calc/run/route.ts segments where changes occurred (per-site before/after).

### Phase 4 — Modify intent-executor.ts

**Imports:** Remove `import { traceEvent, isTraceEnabled } from './calc-trace';`

**EntityData type:** Remove the `_traceContext?: { ... }` field added by HF-202.

**traceEvent calls:** Replace each with `addLog`-style emission. Note: `intent-executor.ts` may not have direct access to `addLog` — if it only has access to `console.log`, use `console.log` with the same `[CalcTrace]` prefix. Verify which logging mechanism is in scope at the point of each replacement and use whichever is conventional in that file.

Specifically:
- `resolveSource:metric_lookup` → log entity (if available via parent scope), field, rawValue, resolvedValue
- `executeBoundedLookup1D:execution` → log inputValue, boundaries, bandIndex, outputValue, noMatchFired
- `executeBoundedLookup2D:execution` → same shape with row + column
- `findBoundaryIndex:lookup` → log value, boundaries, matchedIndex

If entity context is not available at the executor layer (because executor doesn't receive entity identifier), log without entity field — the surrounding calc log lines provide entity context by proximity (entities are processed sequentially).

PASTE the full modified intent-executor.ts segments where changes occurred.

### Phase 5 — Build + lint

```bash
cd web && npm run build 2>&1 | tail -20
npm run lint 2>&1 | tail -10
```

PASTE output. Both must PASS. Type errors expected if any traceEvent call sites were missed (the function no longer exists).

If lint warns about unused imports, remove them.

### Phase 6 — Verify no orphan references

```bash
cd ~/spm-platform
grep -rn "traceEvent\|isTraceEnabled\|setTraceContext\|flushTraceToMD\|enableTrace\|disableTrace\|_traceContext\|calc-trace" web/src --include="*.ts"
```

PASTE output. Should return ZERO matches. If any matches remain, surface to architect.

### Phase 7 — Commit + push

```bash
cd ~/spm-platform
git add -A web/src/ docs/
git commit -m "HF-204: inline calc trace as standard log output

Removes HF-202 toggle/buffer/flush infrastructure. Trace instrumentation
points become inline addLog calls in the standard calc log stream.

Closes HF-202 architectural flaw: Vercel serverless functions do not
share memory across instances. enableTrace() POST set the toggle on
one instance; calc invocation could route to a different instance
where the toggle was still default-false. Trace silently no-op'd
despite confirmed enable response.

Closes HF-203 architectural compromise: per-line console.log workaround
for ephemeral filesystem persists, but no longer requires a toggle to
gate emission. Trace is the calc log.

Files deleted:
- web/src/lib/calculation/calc-trace.ts (entire toggle utility)
- web/src/app/api/calculation/trace/route.ts (toggle API endpoint)
- docs/calc-traces/ (directory)

Files modified:
- web/src/app/api/calculation/run/route.ts: replace traceEvent calls
  with addLog at resolveColumnFromBatch (entry/cache_lookup/rows/exit),
  resolveMetricsFromConvergenceBindings (entry/scale_applied/exit),
  per-entity loop (entity_start)
- web/src/lib/calculation/intent-executor.ts: replace traceEvent calls
  with logging at resolveSource (metric_lookup), executeBoundedLookup1D,
  executeBoundedLookup2D, findBoundaryIndex; remove EntityData._traceContext

Architect retrieval: trace lines appear inline in calc log; retrieve
from Vercel Logs as with any other calc diagnostic. No setup, no toggle,
no instance-state issues.

Trade-off: every calc emits ~1,700 additional log lines for 85-entity,
4-component BCL. Vercel handles this volume. If log volume becomes a
production concern, follow-on HF gates verbose lines via per-request
URL flag (request-scoped state survives serverless instance boundaries).

Substrate: T1-E907 (logic not data); T1-E910 (Korean Test); T1-E952
(closes 'stateful diagnostic on stateless platform' defect class);
Decision 124 (architecture derived from Vercel serverless constraints);
T5-E1064 (minimal infrastructure)."
git push origin hf-204-calc-trace-inline-log
```

PASTE output including commit SHA.

### Phase 8 — Open PR

```bash
gh pr create --title "HF-204: inline calc trace as standard log output" \
  --body "Removes HF-202/203 toggle/buffer/flush infrastructure. Trace instrumentation becomes inline addLog calls. Closes serverless instance-state architectural flaw. See commit message for substrate citations and surface inventory."
```

PASTE PR number.

### Phase 9 — Completion report

Write `docs/completion-reports/HF-204_CALC_TRACE_INLINE_LOG_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26.

Hard Gates:
- Phase 1 BEFORE-state inventory verbatim
- Phase 2 file deletion confirmation
- Phase 3 modified segments (calc/run/route.ts) verbatim before/after
- Phase 4 modified segments (intent-executor.ts) verbatim before/after
- Phase 5 build + lint output PASS
- Phase 6 zero-orphan-references verification PASS
- Phase 7 commit SHA + push confirmation
- Phase 8 PR number

Soft Gates:
- T1-E907 PASS
- T1-E910 PASS
- T1-E952 PASS — defect class closed
- Decision 124 PASS — architecture derived from deployment-platform constraints
- T5-E1064 PASS — net code reduction

Known Issues:
- Log volume: ~1,700 additional lines per calc; Vercel-tier-acceptable; HF-205 candidate if production-concern
- Per-line cap remains: pretty-printed JSON arrays may truncate; HF-205 candidate if encountered
- Carry-over untracked files: housekeeping deferred per architect

PASTE completion report content in chat.

## HALT CONDITIONS

HALT if:
- Phase 5 build fails AFTER Phase 4 completion (likely orphan import or type reference)
- Phase 6 returns non-zero matches (orphan references remain after replacement)
- Phase 4 reveals `intent-executor.ts` has no logging mechanism in scope (must surface; architect dispositions whether to thread `addLog` through call hierarchy or use `console.log`)

Otherwise: execute continuously through Phases 0-9.

## NO FURTHER SCOPE

Single change shape: replace stateful trace machinery with inline logging. No new features. No new gating. No new endpoints. No new tables. Net negative LOC.

END OF DIRECTIVE.
```

## ARCHITECT POST-MERGE WORKFLOW

After HF-204 merges:

1. **Run BCL October calc through UI** — no enable step, no API call, no toggle
2. **Vercel dashboard → Logs** — find calc invocation
3. **Filter for `[CalcTrace]`** in log viewer (or just scroll the calc log)
4. **Copy the relevant `[CalcTrace]` lines** for the entity + component you're investigating
5. **Paste into chat**

Specifically for current BCL Gabriela C2 diagnostic: filter logs for `entity=BCL-5003` AND `componentIdx=1`. Copy those lines. Paste here.

I'll read the trace and identify the runtime defect mechanism.
