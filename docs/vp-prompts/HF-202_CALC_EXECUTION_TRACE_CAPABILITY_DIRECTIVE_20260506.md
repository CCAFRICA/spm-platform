# HF-202 — Calc-Execution Trace Capability (Reusable)

**Class:** HF (VP code feature; reusable diagnostic capability)
**Repo:** `~/spm-platform`
**Branch:** `hf-202-calc-execution-trace-capability` (create from main HEAD `b17ebec7`)
**Type:** New feature; toggle-able; reusable across tenants/entities/components
**Substrate authority:**
- **T1-E907 (Fix Logic Not Data):** instrumentation is code addition; no data manipulation
- **T1-E910 (Korean Test, AP-25):** trace fields are structural (binding, value, intermediate); no language-specific terms
- **Decision 109 / 124:** no magic numbers; no thresholds; structural transparency
- **T2-E46 (Reconciliation-Channel Separation):** trace produces architect-readable MD; CC reports execution, architect interprets values

## INTENT

Establish a reusable calc-execution trace capability that can be invoked on demand to diagnose calculation behavior at the per-entity, per-component level. The defect chain pursued in DIAG-025 through DIAG-032 reached the limits of static analysis. Runtime data flow inspection is the next architectural layer; this capability makes it permanent infrastructure.

**Triggering pattern (architect-initiated):** future prompts can request "trace BCL October Gabriela" or "trace Meridian Q1 entity X component Y", and CC enables trace mode → runs calc → captures MD → presents file path. Architect copies MD content into chat context.

**Concrete current need:** localize why C2 (Captación de Depósitos) returns 0 for Gabriela despite all empirical inputs being correct.

## ARCHITECTURAL SHAPE

**Single source-file addition:** `web/src/lib/calculation/calc-trace.ts` — pure trace utility, importable from existing surfaces. Contains:
- `CalcTraceConfig` type — { enabled, entityFilter?, componentFilter?, outputPath? }
- `traceConfig` — module-level mutable config (default disabled)
- `enableTrace(opts)` — turn on with filters
- `disableTrace()` — turn off
- `traceEvent(event, data)` — log helper; emits structured JSON line if enabled
- `flushTraceToMD(filepath)` — write accumulated trace events to MD file with substrate-coherent structure

**Three instrumented surfaces** (existing files, minimal additions):
1. `web/src/app/api/calculation/run/route.ts` — `resolveMetricsFromConvergenceBindings` instrument (entry, scale_factor application, return)
2. `web/src/lib/calculation/intent-executor.ts` — `executeBoundedLookup1D` + `executeBoundedLookup2D` + `findBoundaryIndex` instrument
3. `web/src/lib/calculation/run-calculation.ts` — main entity loop entry instrument (per-entity hook)

**API endpoint** for architect-channel toggling: `web/src/app/api/calculation/trace/route.ts` (POST: enable + filters; DELETE: disable). Tenant-scoped via auth.

**Default state:** off in production; trace overhead is zero when disabled.

## TRACE EVENT SHAPE (substrate-coherent, Korean-Test compliant)

Events are structured JSON written to a buffer:

```typescript
interface TraceEvent {
  ts: string;                // ISO timestamp
  surface: string;            // e.g., 'resolveColumnFromBatch', 'executeBoundedLookup1D', 'findBoundaryIndex'
  entityExternalId?: string;  // when applicable
  componentIdx?: number;      // when applicable
  componentName?: string;     // when applicable
  step: string;               // 'entry' | 'lookup' | 'scale' | 'band' | 'output' | 'exit'
  data: Record<string, unknown>;  // structured per-step data; values verbatim
}
```

## MD OUTPUT FORMAT

```markdown
# Calc Trace — <tenant_label> <period_label> <timestamp>

**Tenant:** <tenant_id>
**Period:** <period_id> (<period_label>)
**Rule Set:** <rule_set_id> (<rule_set_name>)
**Calc Batch:** <calc_batch_id>
**Filter:** entity=<entityExternalId>, component=<componentIdx-or-all>
**Total Events:** <count>

## Trace Events

### Entity: <entityName> (<entityExternalId>) — Variant: <variantName>

#### Component <idx>: <componentName> (<componentType>)

##### Step: resolveMetricsFromConvergenceBindings entry
- compBindings: <pretty JSON>
- expectedMetrics: <array>

##### Step: resolveColumnFromBatch
- batchId: <uuid>
- column: <name>
- entityExternalId: <id>
- dataByBatch.has(batchId): <true/false>
- batchEntityMap.size: <count>
- batchEntityMap.has(entityExternalId): <true/false>
- DIAG-003 fallback fired: <true/false>
- rows.length: <count>
- per-row values: [<val1>, <val2>, ...]
- sum: <number>
- found: <true/false>
- return: <number-or-null>

##### Step: scale_factor application
- pre-scale value: <number>
- scale_factor: <number-or-undefined>
- post-scale value: <number>

##### Step: metric population
- metric key written: <name>
- metric value: <number>

##### Step: bounded_lookup_1d execution (or 2d / scalar / conditional)
- input value: <number>
- boundaries: [<bands>]
- band index found: <number-or-(-1)>
- output value: <number>
- noMatchBehavior fired: <true/false>

##### Step: component output
- payout: <number>

---

(repeat per component, per entity)

## Summary

- entities traced: <count>
- components traced: <count>
- entity totals: <table of name → total>
```

## OUT OF SCOPE (deferred)

- **Trace persistence to DB** (synaptic_density / classification_signals etc.) — kept file-based for current iteration; substrate promotion candidate
- **Real-time streaming to UI** — file-based output sufficient
- **Multi-tenant aggregation** — single-calc-per-trace this iteration
- **Trace replay against historical batches** — current scope is live calc only

## CC PASTE BLOCK

```markdown
# HF-202 — Calc-Execution Trace Capability

**Repo:** `~/spm-platform`
**Branch:** create `hf-202-calc-execution-trace-capability` from main HEAD
**Inheritance:** `CC_STANDING_ARCHITECTURE_RULES.md` Rules 1-28
**Bindings:**
- T1-E905 (Prove Don't Describe) — verbatim trace events; no inferred data
- T1-E907 (Fix Logic Not Data) — code addition only
- T1-E910 (Korean Test) — generic trace fields; no language-specific keys
- Decision 109 / 124 — no magic numbers; no thresholds
- T2-E46 (Reconciliation-Channel Separation) — trace produces architect-readable MD; CC executes; architect interprets

## SCOPE

Build reusable calc-execution trace capability. Single new utility file + minimal instrumentation at three existing surfaces + one API endpoint for toggling. Default off; zero overhead when disabled.

**Files created:**
- `web/src/lib/calculation/calc-trace.ts` (new) — trace utility
- `web/src/app/api/calculation/trace/route.ts` (new) — toggle API
- `docs/calc-traces/.gitkeep` (new) — output directory

**Files modified:**
- `web/src/app/api/calculation/run/route.ts` — instrument `resolveMetricsFromConvergenceBindings`, `resolveColumnFromBatch`
- `web/src/lib/calculation/intent-executor.ts` — instrument `executeBoundedLookup1D`, `executeBoundedLookup2D`, `findBoundaryIndex`, `resolveSource`
- `web/src/lib/calculation/run-calculation.ts` — instrument main per-entity loop entry

## EXECUTION

### Phase 0 — Branch + baseline

```bash
cd ~/spm-platform
git checkout main
git pull origin main
git checkout -b hf-202-calc-execution-trace-capability
git rev-parse HEAD
mkdir -p docs/calc-traces
touch docs/calc-traces/.gitkeep
```

PASTE output.

### Phase 1 — Build calc-trace.ts utility

Create `web/src/lib/calculation/calc-trace.ts` with:

```typescript
// HF-202 — Calc-Execution Trace Capability
// Reusable instrumented diagnostic. Off by default; zero overhead when disabled.
// Substrate: T1-E910 Korean Test (generic trace fields), Decision 124 (research-derived).

import * as fs from 'fs';
import * as path from 'path';

export interface TraceEvent {
  ts: string;
  surface: string;
  entityExternalId?: string;
  componentIdx?: number;
  componentName?: string;
  step: string;
  data: Record<string, unknown>;
}

interface TraceConfig {
  enabled: boolean;
  entityFilter?: string[];     // entityExternalId allowlist; if empty, all entities
  componentFilter?: number[];   // componentIdx allowlist; if empty, all components
  outputPath?: string;          // override default output dir
  context?: {
    tenantId?: string;
    periodId?: string;
    periodLabel?: string;
    ruleSetId?: string;
    ruleSetName?: string;
    calcBatchId?: string;
  };
}

let config: TraceConfig = { enabled: false };
let buffer: TraceEvent[] = [];

export function isTraceEnabled(): boolean {
  return config.enabled;
}

export function enableTrace(opts: Omit<TraceConfig, 'enabled'>): void {
  config = { ...opts, enabled: true };
  buffer = [];
}

export function disableTrace(): void {
  config = { enabled: false };
}

export function setTraceContext(ctx: TraceConfig['context']): void {
  if (config.enabled) config.context = { ...config.context, ...ctx };
}

export function getTraceConfig(): TraceConfig {
  return config;
}

export function traceEvent(
  surface: string,
  step: string,
  data: Record<string, unknown>,
  scope?: { entityExternalId?: string; componentIdx?: number; componentName?: string },
): void {
  if (!config.enabled) return;
  if (config.entityFilter && config.entityFilter.length > 0
      && scope?.entityExternalId
      && !config.entityFilter.includes(scope.entityExternalId)) return;
  if (config.componentFilter && config.componentFilter.length > 0
      && scope?.componentIdx !== undefined
      && !config.componentFilter.includes(scope.componentIdx)) return;
  buffer.push({
    ts: new Date().toISOString(),
    surface,
    step,
    data,
    ...scope,
  });
}

export function flushTraceToMD(filename?: string): string {
  const outDir = config.outputPath ?? path.resolve(process.cwd(), 'docs/calc-traces');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const fname = filename ?? `calc-trace-${ts}.md`;
  const fp = path.join(outDir, fname);

  const lines: string[] = [];
  const ctx = config.context ?? {};
  lines.push(`# Calc Trace — ${ctx.periodLabel ?? 'unknown'} ${ts}`);
  lines.push('');
  lines.push(`**Tenant:** ${ctx.tenantId ?? 'n/a'}`);
  lines.push(`**Period:** ${ctx.periodId ?? 'n/a'} (${ctx.periodLabel ?? 'n/a'})`);
  lines.push(`**Rule Set:** ${ctx.ruleSetId ?? 'n/a'} (${ctx.ruleSetName ?? 'n/a'})`);
  lines.push(`**Calc Batch:** ${ctx.calcBatchId ?? 'n/a'}`);
  lines.push(`**Filter:** entity=${(config.entityFilter ?? []).join(',') || 'all'}, component=${(config.componentFilter ?? []).join(',') || 'all'}`);
  lines.push(`**Total Events:** ${buffer.length}`);
  lines.push('');
  lines.push('## Trace Events');
  lines.push('');

  // Group by entity → component → ordered events
  const byEntity = new Map<string, Map<number, TraceEvent[]>>();
  for (const ev of buffer) {
    const eKey = ev.entityExternalId ?? '__global__';
    const cKey = ev.componentIdx ?? -1;
    if (!byEntity.has(eKey)) byEntity.set(eKey, new Map());
    const cMap = byEntity.get(eKey)!;
    if (!cMap.has(cKey)) cMap.set(cKey, []);
    cMap.get(cKey)!.push(ev);
  }

  for (const [entityId, cMap] of byEntity) {
    lines.push(`### Entity: ${entityId}`);
    lines.push('');
    for (const [cIdx, events] of cMap) {
      const componentName = events.find(e => e.componentName)?.componentName ?? `(component ${cIdx})`;
      lines.push(`#### Component ${cIdx}: ${componentName}`);
      lines.push('');
      for (const ev of events) {
        lines.push(`##### Step: ${ev.surface} → ${ev.step}`);
        lines.push('```json');
        lines.push(JSON.stringify(ev.data, null, 2));
        lines.push('```');
        lines.push('');
      }
    }
  }

  fs.writeFileSync(fp, lines.join('\n'), 'utf8');
  return fp;
}

export function getBufferSize(): number {
  return buffer.length;
}

export function clearBuffer(): void {
  buffer = [];
}
```

PASTE the content you wrote.

### Phase 2 — Build trace toggle API endpoint

Create `web/src/app/api/calculation/trace/route.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { enableTrace, disableTrace, getTraceConfig, isTraceEnabled } from '@/lib/calculation/calc-trace';

// POST /api/calculation/trace — enable trace mode
// Body: { entityFilter?: string[], componentFilter?: number[] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    enableTrace({
      entityFilter: body.entityFilter,
      componentFilter: body.componentFilter,
    });
    return NextResponse.json({ enabled: true, config: getTraceConfig() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/calculation/trace — disable trace mode
export async function DELETE() {
  disableTrace();
  return NextResponse.json({ enabled: false });
}

// GET /api/calculation/trace — current state
export async function GET() {
  return NextResponse.json({ enabled: isTraceEnabled(), config: getTraceConfig() });
}
```

PASTE.

### Phase 3 — Instrument resolveMetricsFromConvergenceBindings

Locate the function in `web/src/app/api/calculation/run/route.ts` (around line 1099 per AUD-001 reference, may have shifted).

Add at top of file:
```typescript
import { traceEvent } from '@/lib/calculation/calc-trace';
```

Inside `resolveMetricsFromConvergenceBindings`:
- After binding extraction, before resolution: `traceEvent('resolveMetricsFromConvergenceBindings', 'entry', { compBindings, expectedMetrics }, { entityExternalId, componentIdx: <idx-from-call-context> });`
- After scale_factor multiplication: `traceEvent('resolveMetricsFromConvergenceBindings', 'scale_applied', { preScale: <pre>, scaleFactor: <factor>, postScale: <post> }, { entityExternalId, componentIdx });`
- Before return: `traceEvent('resolveMetricsFromConvergenceBindings', 'exit', { metrics, returnedNull: <bool> }, { entityExternalId, componentIdx });`

Inside `resolveColumnFromBatch`:
- At entry: `traceEvent('resolveColumnFromBatch', 'entry', { batchId, column, entityExternalId, hasBatchInCache: dataByBatch.has(batchId) });`
- After batchEntityMap selection: `traceEvent('resolveColumnFromBatch', 'cache_lookup', { initialBatchEntityMapPresent: <bool>, hasEntity: <bool>, diag003Fallback: <bool>, fallbackBatchSelected: <id-if-fired> });`
- After row iteration: `traceEvent('resolveColumnFromBatch', 'rows_processed', { rowCount: rows.length, perRowValues: rows.map(r => r[column]), sum, found });`
- Before return: `traceEvent('resolveColumnFromBatch', 'exit', { returned: <value-or-null> });`

PASTE before/after diff for each modified site.

### Phase 4 — Instrument intent-executor

Locate `executeBoundedLookup1D`, `executeBoundedLookup2D`, `findBoundaryIndex`, `resolveSource` in `web/src/lib/calculation/intent-executor.ts`.

Add at top:
```typescript
import { traceEvent } from './calc-trace';
```

In `resolveSource` (after value resolution, before return):
```typescript
traceEvent('resolveSource', 'metric_lookup', {
  source: src.source,
  field: src.sourceSpec.field,
  rawValue: data.metrics[key],
  resolvedValue: raw,
}, { /* scope from caller — if available */ });
```

In `findBoundaryIndex`:
```typescript
traceEvent('findBoundaryIndex', 'lookup', {
  value,
  boundaries,
  matchedIndex: idx,
});
```

In `executeBoundedLookup1D`:
```typescript
traceEvent('executeBoundedLookup1D', 'execution', {
  inputValue: value,
  boundaries: op.boundaries,
  outputs: op.outputs,
  bandIndex: idx,
  outputValue: output,
  noMatchFired: idx === -1,
});
```

In `executeBoundedLookup2D`: similar shape with row + column inputs.

PASTE before/after for each site.

### Phase 5 — Instrument run-calculation entity loop

Locate the per-entity iteration in `web/src/lib/calculation/run-calculation.ts`.

Add at top:
```typescript
import { traceEvent, setTraceContext } from './calc-trace';
```

At calc start (after batch creation):
```typescript
setTraceContext({
  tenantId,
  periodId,
  periodLabel: '<period_label_from_period>',
  ruleSetId,
  ruleSetName: '<from_ruleset>',
  calcBatchId: batchId,
});
```

At entity loop entry:
```typescript
traceEvent('runCalculation', 'entity_start', {
  variantSelected,
  flatDataRowCount: data.flatRows?.length ?? 0,
  metricsKeys: Object.keys(data.metrics ?? {}),
}, { entityExternalId: data.entityExternalId });
```

At per-component result:
```typescript
traceEvent('runCalculation', 'component_complete', {
  payout: result.payout,
  rounded,
}, { entityExternalId: data.entityExternalId, componentIdx: compIdx, componentName: component.name });
```

After all entities calculated (at calc completion):
```typescript
if (isTraceEnabled()) {
  const filepath = flushTraceToMD();
  console.log(`[CalcTrace] Trace written to: ${filepath}`);
}
```

PASTE before/after for each site.

### Phase 6 — Build + lint

```bash
cd web && npm run build 2>&1 | tail -30
npm run lint 2>&1 | tail -20
```

PASTE. Both must pass before commit.

### Phase 7 — Commit + push

```bash
cd ~/spm-platform
git add web/src/lib/calculation/calc-trace.ts \
        web/src/app/api/calculation/trace/route.ts \
        web/src/app/api/calculation/run/route.ts \
        web/src/lib/calculation/intent-executor.ts \
        web/src/lib/calculation/run-calculation.ts \
        docs/calc-traces/.gitkeep
git commit -m "HF-202: calc-execution trace capability (reusable diagnostic)

Establishes invokable calc-execution trace capability for runtime
data-flow inspection at per-entity, per-component level.

New utility: web/src/lib/calculation/calc-trace.ts
- enableTrace(opts) / disableTrace() / traceEvent / flushTraceToMD
- entity + component filters; default off; zero overhead when disabled
- Korean Test compliant; structural fields only

New API endpoint: web/src/app/api/calculation/trace/route.ts
- POST: enable with optional entity/component filters
- DELETE: disable
- GET: current state

Instrumented surfaces (existing files; minimal additions):
- calc/run/route.ts: resolveMetricsFromConvergenceBindings,
  resolveColumnFromBatch (entry, cache lookup, scale_factor, exit)
- intent-executor.ts: resolveSource, findBoundaryIndex,
  executeBoundedLookup1D, executeBoundedLookup2D
- run-calculation.ts: entity loop entry, component complete,
  flush-on-completion

Output: docs/calc-traces/calc-trace-<timestamp>.md
- Architect-readable structured MD
- Grouped by entity → component → ordered steps
- Verbatim values; no interpretation

Substrate: T1-E907 (logic not data); T1-E910 (Korean Test);
Decision 109/124 (no thresholds, structural transparency);
T2-E46 (CC executes; architect interprets).

Use case (current): localize BCL C2 = \$0 root cause
Future use: any reconciliation-channel question requiring runtime data flow"
git push origin hf-202-calc-execution-trace-capability
```

PASTE.

### Phase 8 — Open PR

```bash
gh pr create --title "HF-202: calc-execution trace capability (reusable diagnostic)" \
  --body "Reusable calc-execution trace capability. Off by default. Architect-channel toggleable via POST /api/calculation/trace. Output to docs/calc-traces/<timestamp>.md. See commit message for substrate citations and instrumentation surface inventory."
```

PASTE PR number.

### Phase 9 — Completion report

Write `docs/completion-reports/HF-202_CALC_EXECUTION_TRACE_CAPABILITY_COMPLETION_REPORT_<YYYYMMDD>.md` per Rule 26.

Hard Gates:
- All Phase 1-5 file content verbatim
- Phase 6 build + lint output PASS
- Phase 7 commit SHA + push confirmation
- Phase 8 PR number

Soft Gates:
- T1-E907 (logic not data) PASS
- T1-E910 (Korean Test) PASS
- Decision 109/124 PASS
- T2-E46 PASS

Known Issues:
- Trace is in-memory until flush; long calcs accumulate buffer; current scope acceptable
- Architect dispositions whether to add streaming/persistence in follow-on
- Default-off ensures production safety

PASTE completion report content in chat.

## HALT CONDITIONS

HALT if:
- Phase 3-5 cannot locate target functions in modified files (line numbers shifted; surface CC search results to architect)
- Build or lint fails after instrumentation (likely import path or type issue)
- Trace events overwhelm calc time (>2x baseline) — performance regression

Otherwise: execute continuously.

## NO FURTHER SCOPE

Single feature: trace capability. No remediation of underlying defect. No band/scale fixes. No convergence-binding changes. Architect uses the trace to inform next remediation.

END OF DIRECTIVE.
```

## ARCHITECT INVOCATION (post-merge)

After HF-202 ships, you can use it like this:

1. Enable trace for specific entity/component:
   ```bash
   curl -X POST https://<your-platform>/api/calculation/trace \
     -H 'Content-Type: application/json' \
     -d '{"entityFilter":["BCL-5003"],"componentFilter":[1]}'
   ```

2. Run the calc through UI as normal

3. CC reads the resulting `docs/calc-traces/calc-trace-<timestamp>.md` file and pastes its content into the chat

4. You disable trace:
   ```bash
   curl -X DELETE https://<your-platform>/api/calculation/trace
   ```

5. Architect-channel reads the MD and identifies the runtime defect.

For BCL C2 diagnostic right after merge: enable for `BCL-5003`, `componentFilter:[1]` (Senior C2), run October calc, CC pastes trace content.
