# DIAG-039 — c4 Fleet Utilization Import-to-Result Trace

**Branch:** `diag-039-c4-import-to-result-trace`
**Base:** `main` HEAD `3b22eff2` (post-OB-199 merge).
**Discipline:** read-only empirical. CC produces verbatim code, schema, and DB values. CC does NOT classify the defect locus.
**Predecessors:** DIAG-035, DIAG-036, DIAG-037, DIAG-038 (each scoped to one surface). DIAG-039 is the missing-aperture diagnostic — end-to-end import → result for c4 with no pre-narrative about defect location.

---

## Empirical anchor (verbatim from directive)

| Property | Value |
|---|---|
| Batch totals (AUD-006 §6.3) | $55,909 / $53,559 / $57,534 |
| Ground truth (entity total) | ~MX$185,063 |
| c4 component resolved value | $2 uniformly across all entities × periods |
| Tenant | `5035b1e8-0754-4527-b7ec-9f93f85e4c79` (Meridian) |
| Entity count | 79 (E3.0 confirms count) |
| Period count | 3 (E3.0 confirms count) |
| Component | c4 (Fleet Utilization) |

DB state confirms: 3 calculation_batches for Meridian, one per period, with `summary.total_payout` values `$55,909` / `$53,559` / `$57,534` — matching the directive's anchor verbatim. The selected entity × period × component carries `calculation_results.components[4].payout = 2`.

---

## Evidence inventory

All evidence files are in `docs/diagnostics/DIAG-039_evidence/`. 35 files total.

### E1 — Calculation entry point + execution graph

- `E1_1_entry_point.md` — grep result locating `route.ts:66` as POST handler entry; 2507-line file
- `E1_2_a.md` … `E1_2_f.md` — full POST handler verbatim, 6 chunks of 500 lines each (file split per directive's >2000-line rule)
- `E1_3_imports.md` — import block + 30 invoked-symbol grep
- `E1_4_1_run-calculation.md` (1510 lines) — `evaluateComponent`, `aggregateMetrics`, `buildMetricsForComponent`, `applyMetricDerivations`, `getExpectedMetricNames`, `rowMatchesFilters`
- `E1_4_2_metric-resolver.md` — `inferSemanticType`
- `E1_4_3_intent-transformer.md` — `transformVariant`
- `E1_4_4_intent-executor.md` (711 lines) — `executeIntent`, `executeScalarMultiply`, `executeRatioOp`, `applyModifiers` (incl. `case 'cap'`)
- `E1_4_5_decimal-precision.md` — `toNumber`, `roundComponentOutput`, `inferOutputPrecision`
- `E1_4_6_calc-time-entity-resolution.md` — `resolveEntitiesAtCalcTime`
- `E1_4_7_synaptic-density.md` — `loadDensity`, `persistDensityUpdates`
- `E1_4_8_synaptic-surface.md` — `createSynapticSurface`, `writeSynapse`, `getExecutionMode`, `consolidateSurface`, `initializePatternDensity`
- `E1_4_9_pattern-signature.md` — `generatePatternSignature`
- `E1_4_10_agent-memory.md` — `loadPriorsForAgent`
- `E1_4_11_domain-dispatcher.md` — `createCalculationRequest`, `scoreCalculationResult`
- `E1_4_12_flywheel-pipeline.md` — `postConsolidationFlywheel`
- `E1_4_13_insight-agent.md` — `checkInlineInsights`, `generateFullAnalysis`
- `E1_4_14_import-batch-supersession.md` — `fetchSupersededBatchIds`
- `E1_5_arithmetic_sites.md` (218 grep matches) — every arithmetic site touching c4-relevant variables across route.ts + 14 invoked modules

### E2 — Component c4 declaration

- `E2_1_discovery.md` — execute_sql RPC halt-note (PGRST202); 5 candidate table probes (only `rule_sets` exists)
- `E2_2_rule_sets_full_row.md` (1287 lines) — Meridian rule_set row verbatim, full JSONB
- `E2_3_ts_grep.md` — c4 / fleet / utilization / hub_total_loads grep (zero in-source TypeScript matches except color hex codes)
- `E2_4_c4_full_declaration.md` — c4 Senior + Standard variant declarations extracted from E2.2; convergence_bindings.component_4; metric_derivations for hub_total_loads + hub_total_capacity

### E3 — One-(entity, period) value trace

- `E3_0_selection.md` — selection rule + selected entity (`007da35a-…`, Norma Rodríguez Rivera, external_id 70209) × selected period (`3c2557f4-…`, January 2025)
- `E3_1_committed_data.md` — 4 committed_data rows for entity verbatim (all carry `period_id: null`; period attribution via `source_date`)
- `E3_2_rule_set.md` — pointer to E2.2 + identifier summary
- `E3_3_input_bindings_c4.md` — c4 metric_derivations + convergence_bindings verbatim (also surfaced in E2.4)
- `E3_4_results.md` — calculation_results row (1 row), entity_period_outcomes row (1 row), calculation_batches (3 rows) all verbatim; logs halt-note
- E3.5 logs halt-noted in `E3_4_results.md`: no persisted log surface beyond `calculation_batches.config.insightAnalysis` + `calculation_results.metadata.intentTraces`; `addLog` in route.ts:79 writes to ephemeral Lambda console.log

### E4 — Value-at-every-boundary table (load-bearing artifact)

- `E4_boundary_table.md` — 16-step transformation table from committed_data DB read through final persist; verbatim runtime values where surfaceable + `<unrecoverable without runtime trace>` where not; per-step code citations to E1.4 modules with file:line markers

### E5 — Arithmetic site inventory

- `E5_arithmetic_site_inventory.md` — reformatted from E1.5, surfacing the 6 on-path sites identified in E4 boundary trace + pointer to E1.5 full 218-line inventory

### E6 — Schema cross-reference

- `E6_schema_cross_reference.md` — column-key inventory for 7 tables via Postgrest sample-row probe; FK declarations verbatim from migrations 001/002/003/004 (information_schema unavailable via Postgrest — halt-noted)

---

## Halt conditions encountered (verbatim, per directive)

| Halt | Manifestation | Action taken per directive |
|---|---|---|
| Postgrest RPC `execute_sql` unavailable | `PGRST202` returned for E2.1a, E6.1, E6.2 information_schema queries | Surfaced verbatim error; fell back to Postgrest sample-row column-key introspection and to migration files for FK declarations. |
| 5 candidate component-table names absent | `PGRST205` for `metric_derivation_rules`, `metric_bindings`, `components`, `plan_components`, `calculation_components` | Surfaced verbatim error responses; discovered the actual declaration site is `rule_sets.components` JSONB column. |
| Zero TypeScript matches for c4-derived identifiers (E2.3) | `grep "fleet_utilization_senior\|fleet_utilization_standard\|hub_total_loads\|hub_total_capacity\|component_4\b\|Fleet Utilization" web/src/ --include="*.ts"` returns empty | Surfaced verbatim empty result; no retry with alternative patterns. Architect reads E2.4 (data-driven declaration) and the operation/source vocabulary grep (29 matches in E2.3) as the indirect TS-side surface. |
| All committed_data rows carry `period_id: null` | E3.1 4 rows verbatim, every row | Surfaced verbatim; noted period attribution is via `source_date` only in this dataset. |
| Logs unsurfaceable without new instrumentation | `addLog` writes to ephemeral Lambda console.log; calculation_batches.config.insightAnalysis is the only persisted log surface | E3.5 halt-noted; no instrumentation added. Architect dispositions whether DIAG-039.1 should authorize one targeted log statement. |

No halt was bypassed. No discovery query was retried with assumed alternatives after a halt.

---

## Selected (entity, period) identifiers (for architect reference)

```
entityId:           007da35a-8e65-453b-ada9-b62337fd8683
entity_external_id: 70209
entity_display_name: Norma Rodríguez Rivera
periodId:           3c2557f4-d922-4b30-a073-ac4811f1f3cb
period_label:       January 2025
period_start:       2025-01-01
period_end:         2025-01-31
ruleSetId:          939cf576-4096-4ceb-a142-539a486868b3
batchId:            ef33e29f-d8f8-4b4f-8022-e183033b3800
calculation_results.id: a159f155-1eb1-4324-8504-a273c5035997
entity_period_outcomes.id: 85a6224a-144e-46e6-96ee-38e240e83a8d
```

---

## Architect reads

The architect reads `E4_boundary_table.md`. The Output column carries verbatim runtime values at each function boundary in the actual c4 execution path. The step where the value collapses is structurally visible. The architect then dispositions HF-216 scope from the code evidence in E1.4 and the boundary trace in E4.

CC does not propose a fix from DIAG-039.

---

## Pre-existing CC observations surfaced during evidence collection (verbatim, not classification)

These are observations CC noticed and surfaced as part of the verbatim discipline. They are not pre-classifications of the defect locus.

1. **Source data vs intentTrace input divergence (E4 step 9, also in `E3_4_results.md` CC observations §1).** For the selected entity × January 2025: `committed_data.row_data.Cargas_Flota_Hub = 1044`, `.Capacidad_Flota_Hub = 1370`, `.Entregas_Totales = 116`. The `calculation_results.metrics` object on the same result row carries `Cargas_Flota_Hub: 1044`, `Capacidad_Flota_Hub: 1370`, `Entregas_Totales: 116`. The `intentTraces[4].inputs.hub_total_loads.rawValue` = `116` and `.hub_total_capacity.rawValue` = `116`. The convergence_bindings (E2.4) target `Cargas_Flota_Hub` (numerator) and `Capacidad_Flota_Hub` (denominator); the metric_derivations (E3.3) declare `hub_total_loads` and `hub_total_capacity` with `operation: "count"` filtered by `Tipo_Coordinador = "Coordinador Senior"`.

2. **Cap modifier transformation at step 12 (E4).** `applyModifiers` line 586 `result = result.gt(cap) ? cap : result;` with `cap = toDecimal(1.5)` and `result = 800` evaluates to `1.5`. The persisted modifier log entry verbatim: `{ "after": 1.5, "before": 800, "modifier": "cap" }`.

3. **Rounding at step 13 (E4).** `rawValue: 1.5 → roundedValue: 2` (`roundingMethod: "half_even"`, `decimalPlaces: 0`, `roundingAdjustment: 0.5`).

4. **Batch-level concordance signal.** `calculation_batches.summary.intentLayer.matchCount = 0` and `concordance = "0.0%"` for all 3 periods (E3.4c). The result row's `metadata.intentMatch = false`, `intentTotal = 1402`, `legacyTotal = 2200`.

5. **TypeScript-side identifier surface for c4.** Zero TypeScript files reference `fleet_utilization_senior`, `fleet_utilization_standard`, `hub_total_loads`, `hub_total_capacity`, or the literal `Fleet Utilization` (E2.3). The c4 declaration is entirely data-driven via the `rule_sets.components` JSONB column. The engine reads the declaration by index/structure, not by name.

Architect reads.

---

## E1_1_entry_point.md

# E1.1 — Calculation entry point grep (verbatim)

**Command:**
```bash
grep -rn "POST\|export async function" web/src/app/api/calculation/ --include="*.ts" | head -20
```

**Output:**
```
web/src/app/api/calculation/density/route.ts:14:export async function GET(request: NextRequest) {
web/src/app/api/calculation/density/route.ts:60:export async function DELETE(request: NextRequest) {
web/src/app/api/calculation/run/route.ts:2: * POST /api/calculation/run
web/src/app/api/calculation/run/route.ts:66:export async function POST(request: NextRequest) {
```

The POST handler is `web/src/app/api/calculation/run/route.ts:66`. File length: 2507 lines. POST handler spans lines 66–2507 (file contains one top-level function declaration; closing brace at line 2507 is the handler's terminator).

---

## E1_2_a.md

# E1.2.a — route.ts lines ��500 (verbatim)

```typescript
/**
 * POST /api/calculation/run
 *
 * Server-side calculation orchestrator.
 * Uses service role client (bypasses RLS) to read inputs and write results.
 * Reuses the SAME evaluator functions from run-calculation.ts —
 * this proves the actual engine logic, not a reimplementation.
 *
 * Body: { tenantId, periodId, ruleSetId }
 */

// OB-150: Production timeout fix (processes all entities × components)
export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Pro max

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  evaluateComponent,
  aggregateMetrics,
  buildMetricsForComponent,
  applyMetricDerivations,
  getExpectedMetricNames,
  type ComponentResult,
  type AIContextSheet,
  type MetricDerivationRule,
  rowMatchesFilters,
} from '@/lib/calculation/run-calculation';
import { inferSemanticType } from '@/lib/orchestration/metric-resolver';
import { transformVariant } from '@/lib/calculation/intent-transformer';
import { executeIntent, type EntityData } from '@/lib/calculation/intent-executor';
import type { ComponentIntent, RoundingTrace } from '@/lib/calculation/intent-types';
import type { PlanComponent } from '@/types/compensation-plan';
import { toNumber, roundComponentOutput, inferOutputPrecision, ZERO } from '@/lib/calculation/decimal-precision';
import type { Json } from '@/lib/supabase/database.types';
import { convergeBindings } from '@/lib/intelligence/convergence-service';
// OB-199 Phase 4: canonical writer migration.
import { writeSignal, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
// HF-196 Phase 2: calc-time entity resolution per Decision 92 + OB-182 stated intent.
// Closes Break #2 (entity binding gap) by populating committed_data.entity_id at
// calc time for any rows where the import-time path didn't already resolve.
import { resolveEntitiesAtCalcTime } from '@/lib/sci/calc-time-entity-resolution';
import { loadDensity, persistDensityUpdates } from '@/lib/calculation/synaptic-density';
import {
  createSynapticSurface,
  writeSynapse,
  getExecutionMode,
  consolidateSurface,
  initializePatternDensity,
} from '@/lib/calculation/synaptic-surface';
import { generatePatternSignature } from '@/lib/calculation/pattern-signature';
// OB-81: Agent memory, flywheel, and insight wiring
import { loadPriorsForAgent, type AgentPriors } from '@/lib/agents/agent-memory';
// OB-83: Domain Agent dispatch — wraps calculation through negotiation protocol
import { createCalculationRequest, scoreCalculationResult } from '@/lib/domain/domain-dispatcher';
import '@/lib/domain/domains/icm'; // Import ICM to trigger domain registration
import { postConsolidationFlywheel } from '@/lib/calculation/flywheel-pipeline';
import {
  checkInlineInsights,
  generateFullAnalysis,
  DEFAULT_INSIGHT_CONFIG,
  type InlineInsight,
  type CalculationSummary,
} from '@/lib/agents/insight-agent';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tenantId, periodId, ruleSetId } = body;

  if (!tenantId || !periodId || !ruleSetId) {
    return NextResponse.json(
      { error: 'Missing required fields: tenantId, periodId, ruleSetId' },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();
  const log: string[] = [];
  const addLog = (msg: string) => { log.push(msg); console.log(`[CalcAPI] ${msg}`); };

  // HF-196 Phase 1E: fetch superseded import_batch ids; engine queries below
  // exclude these via NOT IN — operative-batch-only data per Rule 30.
  const { fetchSupersededBatchIds } = await import('@/lib/sci/import-batch-supersession');
  const supersededIds = await fetchSupersededBatchIds(supabase, tenantId);
  if (supersededIds.length > 0) {
    addLog(`Phase 1E: ${supersededIds.length} superseded batches excluded from engine reads`);
  }

  // OB-197 G11: pre-generate the calculation run id at run-start so signals
  // emitted during convergence (which runs before the calculation_batches row
  // is inserted) share scope with the eventual batch row. The id is assigned
  // to calculation_batches.id at insert time, making batch.id == calculationRunId.
  const calculationRunId = crypto.randomUUID();

  addLog(`Starting: tenant=${tenantId}, period=${periodId}, ruleSet=${ruleSetId}, run=${calculationRunId}`);

  // HF-208: Reconciliation summary counters. Incremented at existing emission sites;
  // surfaced in the [CalcRecon] summary block at handler exit. See HF-208 directive §3.
  let diag003FallbackCount = 0;
  let ob118MergeGuardFiredCount = 0;
  // boundaryFallbackCount derived post-hoc from convergence_bindings.match_pass===3 at handler exit.

  // HF-210: Cap route.ts [CalcTrace] emissions at first N entities for log visibility.
  // The `[CalcRecon]` reconciliation block at handler exit becomes visible without
  // truncation because per-entity trace volume drops from ~32×85 to ~32×5 lines.
  // Counters above (HF-208) increment for ALL entities regardless of cap.
  // intent-executor.ts traces are NOT capped here (separate-file scope per HF-210 §3).
  const TRACE_CAP_N = 5;
  const tracedEntityIds = new Set<string>();
  function shouldEmitTrace(entityId: string): boolean {
    if (tracedEntityIds.has(entityId)) return true;
    if (tracedEntityIds.size < TRACE_CAP_N) {
      tracedEntityIds.add(entityId);
      return true;
    }
    return false;
  }

  // HF-212: Forensic verbosity gate. Default OFF — Tier 4 per-metric trace suppressed.
  // Set CALC_TRACE_VERBOSE=true in Vercel env to enable forensic mode.
  // Tier 1 (header/footer), Tier 2 (per-entity summary), Tier 3 (exception detail) always emit.
  const CALC_TRACE_VERBOSE = process.env.CALC_TRACE_VERBOSE === 'true';

  // HF-211: Trace buffer — collects all forensic [CalcTrace] emissions during entity loop.
  // Flushed AFTER [CalcRecon] block emits at handler-exit so summary appears above forensics.
  // HF-212: Function-level verbosity gate. When CALC_TRACE_VERBOSE=false, bufferTrace is a
  // no-op — Tier 4 emissions skip even the buffer push (cleaner than per-site wrapping at
  // 13 call sites; satisfies directive §5.6 intent via single-source-of-truth gate).
  const traceBuffer: string[] = [];
  function bufferTrace(line: string): void {
    if (!CALC_TRACE_VERBOSE) return;
    traceBuffer.push(line);
  }

  // HF-211: Per-component totals accumulator — sum of rounded outcomes per component index.
  // Populated at component_complete site UNCONDITIONALLY (every entity, every component);
  // surfaced in [CalcRecon] block per-component breakdown for direct ground-truth reconciliation.
  const componentTotals: Map<number, { name: string; total: number }> = new Map();

  // HF-212: Variant distribution accumulator — variantKey → count of entities matched.
  // Populated at variant decision site (after exclusion check); surfaced in Tier 1 footer.
  const variantCounts: Map<string, number> = new Map();

  // HF-212: Per-entity flags collector. Handler-scope `let` so closures (resolveColumn
  // FromBatch, etc.) capture the variable binding; reassigned at start of each entity
  // iteration. Read by Tier 2 emission line. Push from any Tier 3 emission site.
  let currentEntityFlags: string[] = [];

  // ── HF-196 Phase 2: Calc-time entity resolution (Break #2 closure) ──
  // Per Decision 92 + OB-182 stated intent. Idempotent — does nothing if all
  // rows already have entity_id resolved. Surfaces unmatched rows as a data-
  // quality signal but does not halt the calc run.
  try {
    const entityResolution = await resolveEntitiesAtCalcTime(tenantId, supabase);
    addLog(
      `Calc-time entity resolution: tenant=${tenantId} ` +
      `null_rows_before=${entityResolution.totalNullRowsBefore} ` +
      `matched=${entityResolution.matched} ` +
      `unmatched=${entityResolution.unmatched} ` +
      `(${entityResolution.durationMs}ms)`,
    );
    if (entityResolution.unmatched > 0) {
      addLog(
        `[DATA QUALITY] ${entityResolution.unmatched} committed_data rows still have ` +
        `entity_id NULL after calc-time resolution; calc will skip these rows`,
      );
    }
  } catch (err) {
    // Non-blocking: calc proceeds even if resolution fails. Engine will
    // attribute only resolved rows to entities; unresolved rows skipped.
    addLog(`Calc-time entity resolution failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 1. Fetch rule set ──
  const { data: ruleSet, error: rsErr } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings, population_config, metadata')
    .eq('id', ruleSetId)
    .single();

  if (rsErr || !ruleSet) {
    return NextResponse.json(
      { error: `Rule set not found: ${rsErr?.message}`, log },
      { status: 404 }
    );
  }

  // Parse components from JSONB — handle 3 formats:
  // 1. Flat array: [{id, name, ...}, ...]
  // 2. Wrapped object: { components: [{id, name, ...}, ...] }
  // 3. Legacy nested: { variants: [{ components: [...] }] }
  const rawComponents = ruleSet.components;
  let defaultComponents: PlanComponent[];
  let variants: Array<Record<string, unknown>> = [];
  if (Array.isArray(rawComponents)) {
    defaultComponents = rawComponents as unknown as PlanComponent[];
  } else {
    const componentsJson = rawComponents as Record<string, unknown>;
    if (Array.isArray(componentsJson?.components)) {
      // OB-153: Wrapped object format { components: [...] }
      defaultComponents = componentsJson.components as unknown as PlanComponent[];
    } else {
      // Legacy nested format: { variants: [{ components: [...] }] }
      variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];
      defaultComponents = (variants[0]?.components as PlanComponent[]) ?? [];
    }
  }

  if (defaultComponents.length === 0) {
    return NextResponse.json(
      { error: 'Rule set has no components', log },
      { status: 400 }
    );
  }

  addLog(`Rule set "${ruleSet.name}" has ${defaultComponents.length} components`);

  // ── HF-165: Calc-time convergence (completes OB-182 deferred architecture) ──
  // OB-182 removed convergence from the bulk import path to eliminate sequence dependency.
  // At calculation time, both plans AND data are guaranteed to exist.
  // If input_bindings is empty, run convergence now to generate derivation rules.
  {
    const rawBindings = ruleSet.input_bindings as Record<string, unknown> | null;
    const hasMetricDerivations = Array.isArray(rawBindings?.metric_derivations) && (rawBindings.metric_derivations as unknown[]).length > 0;
    const hasConvergenceBindings = rawBindings?.convergence_bindings && Object.keys(rawBindings.convergence_bindings as Record<string, unknown>).length > 0;

    if (!hasMetricDerivations && !hasConvergenceBindings) {
      addLog('HF-165: input_bindings empty — running calc-time convergence');
      try {
        const convResult = await convergeBindings(tenantId, ruleSetId, supabase, calculationRunId);
        const derivationCount = convResult.derivations.length;
        const bindingCount = Object.keys(convResult.componentBindings).length;
        const gapCount = convResult.gaps.length;

        if (derivationCount > 0 || bindingCount > 0) {
          // Store convergence results on the rule_set for future calculations
          const updatedBindings: Record<string, unknown> = {};

          if (bindingCount > 0) {
            // Decision 111: convergence_bindings is the primary output
            updatedBindings.convergence_bindings = convResult.componentBindings;
          }

          if (derivationCount > 0) {
            updatedBindings.metric_derivations = convResult.derivations;
          }

          // Persist to rule_set for reuse on subsequent calculations
          await supabase
            .from('rule_sets')
            .update({ input_bindings: updatedBindings as unknown as Json })
            .eq('id', ruleSetId);

          // Re-read the updated rule_set so the engine uses the new bindings
          const { data: updatedRS } = await supabase
            .from('rule_sets')
            .select('input_bindings')
            .eq('id', ruleSetId)
            .single();

          if (updatedRS) {
            (ruleSet as Record<string, unknown>).input_bindings = updatedRS.input_bindings;
          }

          addLog(`HF-165: Convergence complete — ${derivationCount} derivations, ${bindingCount} component bindings, ${gapCount} gaps`);
        } else {
          addLog(`HF-165: Convergence produced 0 derivations and 0 bindings (${gapCount} gaps)`);
          for (const gap of convResult.gaps) {
            addLog(`HF-165 Gap: ${gap.component} — ${gap.reason}`);
          }
        }
      } catch (convErr) {
        // Non-blocking: convergence failure should not prevent calculation attempt
        addLog(`HF-165: Convergence failed (non-blocking): ${convErr instanceof Error ? convErr.message : String(convErr)}`);
      }
    } else {
      addLog('HF-165: input_bindings already populated — skipping convergence');
    }
  }

  // ── OB-118: Parse metric derivation rules from input_bindings ──
  const inputBindings = ruleSet.input_bindings as Record<string, unknown> | null;
  let metricDerivations: MetricDerivationRule[] =
    (inputBindings?.metric_derivations as MetricDerivationRule[] | undefined) ?? [];
  if (metricDerivations.length > 0) {
    addLog(`OB-118 Metric derivations: ${metricDerivations.length} rules from input_bindings`);
  }

  // OB-186: Cross-plan metric resolution for scope_aggregate plans.
  // When current plan has 0 derivations, look for derivation rules in OTHER plans
  // for this tenant. Scope aggregate plans consume metrics that other plans define.
  if (metricDerivations.length === 0) {
    const { data: otherPlans } = await supabase
      .from('rule_sets')
      .select('id, input_bindings')
      .eq('tenant_id', tenantId)
      .neq('id', ruleSetId);
    const crossPlanDerivations: MetricDerivationRule[] = [];
    for (const op of otherPlans || []) {
      const opBindings = op.input_bindings as Record<string, unknown> | null;
      const opDerivs = (opBindings?.metric_derivations as MetricDerivationRule[] | undefined) ?? [];
      crossPlanDerivations.push(...opDerivs);
    }
    if (crossPlanDerivations.length > 0) {
      metricDerivations = crossPlanDerivations;
      addLog(`OB-186: Cross-plan metric resolution — ${crossPlanDerivations.length} derivations from other plans`);
    }
  }

  // OB-153: Parse metric_mappings from input_bindings
  // Maps semantic metric names (in components) to raw field names (in row_data)
  const metricMappings = inputBindings?.metric_mappings as Record<string, string> | undefined;
  if (metricMappings) {
    addLog(`OB-153 Metric mappings: ${Object.keys(metricMappings).length} mappings from input_bindings`);
  }

  // HF-108: Parse convergence_bindings from input_bindings (Decision 111)
  // Per-component bindings: { component_N: { actual: { source_batch_id, column, ... }, ... } }
  // Priority: convergence_bindings (Decision 111) > metric_derivations (legacy)
  const convergenceBindings = inputBindings?.convergence_bindings as Record<string, Record<string, unknown>> | undefined;
  if (convergenceBindings && Object.keys(convergenceBindings).length > 0) {
    const bindingCount = Object.keys(convergenceBindings).length;
    addLog(`HF-108 Using convergence_bindings (Decision 111) for data resolution — ${bindingCount} component bindings`);
    for (const [compKey, bindings] of Object.entries(convergenceBindings)) {
      const bindingTypes = Object.keys(bindings);
      addLog(`  ${compKey}: ${bindingTypes.join(', ')}`);
    }
  } else if (metricDerivations.length > 0) {
    addLog('HF-108 Using metric_derivations (legacy) for data resolution — no convergence_bindings found');
  } else {
    addLog('HF-108 WARNING: No input_bindings found — calculation may produce incomplete results');
  }

  // ── OB-76: Transform components to intents (once, before entity loop) ──
  const componentIntents: ComponentIntent[] = transformVariant(defaultComponents);
  addLog(`OB-76 Intent layer: ${componentIntents.length} components transformed to intents`);

  // ── 2. Fetch entities via assignments (OB-75: paginated, no 1000-row cap) ──
  const PAGE_SIZE = 1000; // Supabase project max_rows = 1000
  const assignments: Array<{ entity_id: string }> = [];
  let assignPage = 0;
  while (true) {
    const from = assignPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data: page, error: aErr } = await supabase
      .from('rule_set_assignments')
      .select('entity_id')
      .eq('tenant_id', tenantId)
      .eq('rule_set_id', ruleSetId)
      .range(from, to);

    if (aErr) {
      return NextResponse.json(
        { error: `Failed to fetch assignments: ${aErr.message}`, log },
        { status: 500 }
      );
    }
    if (!page || page.length === 0) break;
    assignments.push(...page);
    if (page.length < PAGE_SIZE) break;
    assignPage++;
  }

  // HF-078: Deduplicate entity IDs to prevent UNIQUE constraint violations
  let entityIds = Array.from(new Set(assignments.map(a => a.entity_id)));

  // HF-126 + HF-189: Self-healing — ensure ALL tenant entities are assigned
  // HF-126 original: fires when zero assignments exist
  // HF-189 expansion: also fires when some entities are missing (import timing gap)
  {
    const allTenantEntityIds: string[] = [];
    let entPage = 0;
    while (true) {
      const { data: ep } = await supabase
        .from('entities')
        .select('id')
        .eq('tenant_id', tenantId)
        .range(entPage * PAGE_SIZE, (entPage + 1) * PAGE_SIZE - 1);
      if (!ep || ep.length === 0) break;
      allTenantEntityIds.push(...ep.map(e => e.id));
      if (ep.length < PAGE_SIZE) break;
      entPage++;
    }

    if (allTenantEntityIds.length > 0) {
      const assignedSet = new Set(entityIds);
      const missingEntityIds = allTenantEntityIds.filter(id => !assignedSet.has(id));

      if (missingEntityIds.length > 0) {
        const INSERT_BATCH = 5000;
        const newAssignments = missingEntityIds.map(eid => ({
          tenant_id: tenantId,
          rule_set_id: ruleSetId,
          entity_id: eid,
          assignment_type: 'direct',
          metadata: {},
        }));
        for (let i = 0; i < newAssignments.length; i += INSERT_BATCH) {
          const slice = newAssignments.slice(i, i + INSERT_BATCH);
          await supabase.from('rule_set_assignments').insert(slice);
        }
        entityIds = [...entityIds, ...missingEntityIds];
        if (assignedSet.size === 0) {
          addLog(`HF-126: Auto-created ${missingEntityIds.length} assignments (zero existed)`);
        } else {
          addLog(`HF-189: Assigned ${missingEntityIds.length} missing entities to rule set (import timing gap)`);
        }
      }
    }

    if (entityIds.length === 0) {
      return NextResponse.json(
        { error: 'No entities assigned to this rule set', log },
        { status: 400 }
      );
    }
  }

  addLog(`${entityIds.length} entities assigned (paginated fetch)`);

  // Fetch entity display info (OB-85-R3: reduced batch to 200 to avoid URL length limits)
  // HF-157: Added metadata for HF-155 scopeAggregates (district/region resolution)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entities: Array<{ id: string; external_id: string | null; display_name: string; metadata: any }> = [];
  const ENTITY_BATCH = 200;
  for (let i = 0; i < entityIds.length; i += ENTITY_BATCH) {
    const batch = entityIds.slice(i, i + ENTITY_BATCH);
    const { data: page, error: entErr } = await supabase
      .from('entities')
      .select('id, external_id, display_name, metadata')
      .in('id', batch);
    if (entErr) {
      console.log(`[R3-DIAG] Entity batch ${i}-${i+batch.length} ERROR: ${entErr.message}`);
    }
    if (page) entities.push(...page);
  }

  const entityMap = new Map(entities.map(e => [e.id, e]));

  // ── 3. Fetch period (OB-152: include end_date for source_date hybrid path) ──
  const { data: period } = await supabase
    .from('periods')
    .select('id, canonical_key, start_date, end_date')
    .eq('id', periodId)
    .single();

  if (!period) {
    return NextResponse.json(
      { error: 'Period not found', log },
      { status: 404 }
    );
  }

  addLog(`Period: ${period.canonical_key}`);

  // ── 3b. OB-121: Find prior period (for delta derivations) ──
  const hasDeltaDerivations = metricDerivations.some(d => d.operation === 'delta');
  let priorPeriodId: string | null = null;
  if (hasDeltaDerivations && period.start_date) {
    const { data: priorPeriod } = await supabase
      .from('periods')
      .select('id')
      .eq('tenant_id', tenantId)
      .lt('start_date', period.start_date)
      .order('start_date', { ascending: false })
      .limit(1)
      .single();
    priorPeriodId = priorPeriod?.id ?? null;
    addLog(`Prior period for delta: ${priorPeriodId ?? 'none (first period)'}`);
  }

  // ── 4. Fetch committed data (OB-152: hybrid — source_date primary, period_id fallback) ──
  // HF-108: Added import_batch_id for convergence binding resolution (Decision 111)
  // OB-183: Added metadata to resolve entity_id_field at calc time
  const committedData: Array<{ entity_id: string | null; data_type: string; row_data: Json; import_batch_id: string | null; metadata: Json | null }> = [];

  // OB-152 Strategy: Try source_date range first (new imports), fall back to period_id (LAB/legacy)
  let usedSourceDate = false;
  if (period.start_date && period.end_date) {
    let sdPage = 0;
    while (true) {
      const from = sdPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      // HF-196 Phase 1E: filter out superseded batches per Rule 30.
      let q = supabase
        .from('committed_data')
        .select('entity_id, data_type, row_data, import_batch_id, metadata')
        .eq('tenant_id', tenantId)
        .not('source_date', 'is', null)
        .gte('source_date', period.start_date)
        .lte('source_date', period.end_date)
        .range(from, to);
      if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
      const { data: page } = await q;

      if (!page || page.length === 0) break;
      committedData.push(...page);
      if (page.length < PAGE_SIZE) break;
      sdPage++;
    }
```

---

## E1_2_b.md

# E1.2.b — route.ts lines ��1000 (verbatim)

```typescript
    if (committedData.length > 0) {
      usedSourceDate = true;
      addLog(`OB-152 source_date path: ${committedData.length} rows for ${period.start_date}..${period.end_date}`);
    }
  }

  // Fallback: period_id path (LAB/legacy data without source_date)
  if (!usedSourceDate) {
    let dataPage = 0;
    while (true) {
      const from = dataPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      // HF-196 Phase 1E: filter out superseded batches per Rule 30.
      let q = supabase
        .from('committed_data')
        .select('entity_id, data_type, row_data, import_batch_id, metadata')
        .eq('tenant_id', tenantId)
        .eq('period_id', periodId)
        .range(from, to);
      if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
      const { data: page } = await q;

      if (!page || page.length === 0) break;
      committedData.push(...page);
      if (page.length < PAGE_SIZE) break;
      dataPage++;
    }
    addLog(`OB-152 period_id fallback: ${committedData.length} rows`);
  }

  // OB-128: Also fetch period-agnostic data (period_id IS NULL, source_date IS NULL)
  // Target data from SCI applies to all periods — not bound to a specific period
  let nullPeriodPage = 0;
  while (true) {
    const from = nullPeriodPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    // HF-196 Phase 1E: filter out superseded batches per Rule 30.
    let q = supabase
      .from('committed_data')
      .select('entity_id, data_type, row_data, import_batch_id, metadata')
      .eq('tenant_id', tenantId)
      .is('period_id', null)
      .is('source_date', null)
      .range(from, to);
    if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
    const { data: page } = await q;

    if (!page || page.length === 0) break;
    committedData.push(...page);
    if (page.length < PAGE_SIZE) break;
    nullPeriodPage++;
  }

  addLog(`Fetched ${committedData.length} committed_data rows (hybrid, incl. period-agnostic)`);

  // Group entity-level data by entity_id → data_type → rows
  const dataByEntity = new Map<string, Map<string, Array<{ row_data: Json }>>>();
  // Also keep flat structure for backward compat
  const flatDataByEntity = new Map<string, Array<{ row_data: Json }>>();

  // Store-level data (NULL entity_id) grouped by storeId → data_type → rows
  const storeData = new Map<string | number, Map<string, Array<{ row_data: Json }>>>();

  // OB-183: Build entity external_id → UUID map for calc-time resolution
  const extIdToUuid = new Map<string, string>();
  for (const e of entities) {
    if (e.external_id) extIdToUuid.set(String(e.external_id).trim(), e.id);
  }

  // HF-183: Build fallback entity_id_field from the FIRST row that has one.
  // Used only when a row's own metadata lacks entity_id_field (pre-OB-195 imports).
  let fallbackEntityIdField: string | null = null;
  for (const row of committedData) {
    const meta = row.metadata as Record<string, unknown> | null;
    if (meta?.entity_id_field && typeof meta.entity_id_field === 'string') {
      fallbackEntityIdField = meta.entity_id_field;
      break;
    }
  }

  // HF-181 Layer 3: Fallback — discover entity identifier from data when metadata missing
  // Korean Test: discovers by VALUE matching (entity external_ids), not by field name
  if (!fallbackEntityIdField && extIdToUuid.size > 0 && committedData.length > 0) {
    const sampleRow = committedData[0].row_data as Record<string, unknown> | null;
    if (sampleRow) {
      for (const [field, value] of Object.entries(sampleRow)) {
        if (typeof value !== 'string' || !value.trim()) continue;
        if (!extIdToUuid.has(value.trim())) continue;
        // Found a candidate — verify across a sample
        const sampleSize = Math.min(committedData.length, 20);
        let matchCount = 0;
        for (let s = 0; s < sampleSize; s++) {
          const rd = committedData[s].row_data as Record<string, unknown> | null;
          const val = rd?.[field];
          if (typeof val === 'string' && extIdToUuid.has(val.trim())) matchCount++;
        }
        const matchRate = matchCount / sampleSize;
        if (matchRate >= 0.8) {
          fallbackEntityIdField = field;
          addLog(`HF-181: entity_id_field not in metadata — discovered '${field}' from data (${matchCount}/${sampleSize} rows matched, ${(matchRate * 100).toFixed(0)}%)`);
          break;
        }
      }
    }
  }

  let calcTimeResolved = 0;
  for (const row of committedData) {
    let resolvedEntityId = row.entity_id; // Use FK if populated (backward compat for BCL)

    // HF-183: Per-row entity_id_field resolution.
    // Each row uses its OWN metadata.entity_id_field first, then falls back to global.
    // This fixes mixed-source resolution (transaction rows use sales_rep_id, quota rows use entity_id).
    if (!resolvedEntityId) {
      const rowMeta = row.metadata as Record<string, unknown> | null;
      const rowEntityIdField = (rowMeta?.entity_id_field as string) || fallbackEntityIdField;

      if (rowEntityIdField) {
        const rd = row.row_data as Record<string, unknown> | null;
        const extId = rd?.[rowEntityIdField];
        if (extId != null) {
          resolvedEntityId = extIdToUuid.get(String(extId).trim()) || null;
          if (resolvedEntityId) calcTimeResolved++;
        }
      }
    }

    if (resolvedEntityId) {
      // Entity-level: group by entity + sheet
      if (!dataByEntity.has(resolvedEntityId)) {
        dataByEntity.set(resolvedEntityId, new Map());
      }
      const entitySheets = dataByEntity.get(resolvedEntityId)!;
      const sheetName = row.data_type || '_unknown';
      if (!entitySheets.has(sheetName)) {
        entitySheets.set(sheetName, []);
      }
      entitySheets.get(sheetName)!.push({ row_data: row.row_data });

      // Also flat
      if (!flatDataByEntity.has(resolvedEntityId)) {
        flatDataByEntity.set(resolvedEntityId, []);
      }
      flatDataByEntity.get(resolvedEntityId)!.push({ row_data: row.row_data });
    } else {
      // Store-level: group by store identifier
      const rd = row.row_data as Record<string, unknown> | null;
      const storeKey = (rd?.['storeId'] ?? rd?.['num_tienda'] ?? rd?.['No_Tienda'] ?? rd?.['Tienda']) as string | number | undefined;
      if (storeKey !== undefined) {
        if (!storeData.has(storeKey)) {
          storeData.set(storeKey, new Map());
        }
        const storeSheets = storeData.get(storeKey)!;
        const sheetName = row.data_type || '_unknown';
        if (!storeSheets.has(sheetName)) {
          storeSheets.set(sheetName, []);
        }
        storeSheets.get(sheetName)!.push({ row_data: row.row_data });
      }
    }
  }

  if (calcTimeResolved > 0) {
    addLog(`OB-183: Resolved ${calcTimeResolved} rows to entities at calc time (entity_id was NULL)`);
  }

  // HF-109: Build batch-indexed data cache keyed by external_id via convergence binding column (DS-009 5.1)
  // Maps batchId → entity_external_id_value → [row_data, ...] for O(1) lookup during calculation
  // Key is the VALUE of row_data[entity_identifier_column], NOT the entity_id FK UUID
  const dataByBatch = new Map<string, Map<string, Array<Record<string, unknown>>>>();
  if (convergenceBindings && Object.keys(convergenceBindings).length > 0) {
    // Step 1: Collect entity_identifier columns per batch from convergence bindings
    const entityColsByBatch = new Map<string, string>();
    for (const compBindings of Object.values(convergenceBindings)) {
      const cb = compBindings as Record<string, { source_batch_id?: string; column?: string }>;
      const entityIdBinding = cb.entity_identifier;
      if (entityIdBinding?.source_batch_id && entityIdBinding?.column) {
        entityColsByBatch.set(entityIdBinding.source_batch_id, entityIdBinding.column);
      }
      // HF-111: Index ALL binding role batches (actual, target, row, column, numerator, denominator)
      const bindingRoles = ['actual', 'target', 'row', 'column', 'numerator', 'denominator'];
      for (const role of bindingRoles) {
        const binding = cb[role];
        if (binding?.source_batch_id && !entityColsByBatch.has(binding.source_batch_id)) {
          if (entityIdBinding?.column) {
            entityColsByBatch.set(binding.source_batch_id, entityIdBinding.column);
          }
        }
      }
    }

    // Step 2: Index committed_data by row_data[entity_column] value (DS-009 pattern)
    // DIAG-003: The entity_identifier column name is the SAME across batches (e.g., "ID_Empleado").
    // Convergence bindings reference the source_batch_id where the column was LEARNED,
    // but new periods have different import_batch_ids with the SAME column names.
    // Index ALL committed_data rows using any known entity column, not just source_batch rows.
    const knownEntityCols = Array.from(new Set(Array.from(entityColsByBatch.values())));
    for (const row of committedData) {
      const batchId = row.import_batch_id;
      if (!batchId) continue;

      // Try the batch-specific entity column first, then any known entity column
      let entityCol = entityColsByBatch.get(batchId);
      if (!entityCol && knownEntityCols.length > 0) {
        entityCol = knownEntityCols[0]; // Same column name applies across batches
      }
      if (!entityCol) continue;

      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
        ? row.row_data as Record<string, unknown> : {};
      const entityKey = String(rd[entityCol] ?? '').trim();
      if (!entityKey) continue;

      if (!dataByBatch.has(batchId)) dataByBatch.set(batchId, new Map());
      const entityMap = dataByBatch.get(batchId)!;
      if (!entityMap.has(entityKey)) entityMap.set(entityKey, []);
      entityMap.get(entityKey)!.push(rd);
    }
    addLog(`HF-109 Batch cache: ${dataByBatch.size} batches indexed by external_id (DS-009 5.1)`);
  }

  const entityRowCount = Array.from(flatDataByEntity.values()).reduce((s, r) => s + r.length, 0);
  const storeRowCount = committedData.length - entityRowCount;
  addLog(`${committedData.length} committed_data rows (${entityRowCount} entity-level, ${storeRowCount} store-level)`);
  addLog(`Store data: ${storeData.size} unique stores`);

  // ── 4b. OB-121: Fetch prior period data (OB-152: hybrid path) ──
  const priorDataByEntity = new Map<string, Map<string, Array<{ row_data: Json }>>>();
  if (priorPeriodId) {
    // Fetch prior period dates for source_date hybrid
    const { data: priorPeriod } = await supabase
      .from('periods')
      .select('start_date, end_date')
      .eq('id', priorPeriodId)
      .single();

    const priorCommittedData: Array<{ entity_id: string | null; data_type: string; row_data: Json }> = [];

    // OB-152: Try source_date first for prior period
    let priorUsedSourceDate = false;
    if (priorPeriod?.start_date && priorPeriod?.end_date) {
      let sdPage = 0;
      while (true) {
        const from = sdPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        // HF-196 Phase 1E: filter out superseded batches per Rule 30.
        let q = supabase
          .from('committed_data')
          .select('entity_id, data_type, row_data, import_batch_id, metadata')
          .eq('tenant_id', tenantId)
          .not('source_date', 'is', null)
          .gte('source_date', priorPeriod.start_date)
          .lte('source_date', priorPeriod.end_date)
          .range(from, to);
        if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
        const { data: page } = await q;

        if (!page || page.length === 0) break;
        priorCommittedData.push(...page);
        if (page.length < PAGE_SIZE) break;
        sdPage++;
      }
      if (priorCommittedData.length > 0) priorUsedSourceDate = true;
    }

    // Fallback: period_id
    if (!priorUsedSourceDate) {
      let priorPage = 0;
      while (true) {
        const from = priorPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        // HF-196 Phase 1E: filter out superseded batches per Rule 30.
        let q = supabase
          .from('committed_data')
          .select('entity_id, data_type, row_data, import_batch_id, metadata')
          .eq('tenant_id', tenantId)
          .eq('period_id', priorPeriodId)
          .range(from, to);
        if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
        const { data: page } = await q;

        if (!page || page.length === 0) break;
        priorCommittedData.push(...page);
        if (page.length < PAGE_SIZE) break;
        priorPage++;
      }
    }

    for (const row of priorCommittedData) {
      if (row.entity_id) {
        if (!priorDataByEntity.has(row.entity_id)) {
          priorDataByEntity.set(row.entity_id, new Map());
        }
        const entitySheets = priorDataByEntity.get(row.entity_id)!;
        const sheetName = row.data_type || '_unknown';
        if (!entitySheets.has(sheetName)) {
          entitySheets.set(sheetName, []);
        }
        entitySheets.get(sheetName)!.push({ row_data: row.row_data });
      }
    }

    addLog(`Prior period data: ${priorCommittedData.length} rows for ${priorDataByEntity.size} entities`);
  }

  // ── OB-85-R3 Fix 1: Entity data consolidation ──
  // The import creates separate entity UUIDs per sheet for the same employee.
  // external_ids differ ("96568046" vs "1-96568046"), so we match by row_data.entityId.
  //
  // Build employee number → [entity UUIDs] map from committed_data row_data.
  const employeeToEntityIds = new Map<string, Set<string>>();
  for (const row of committedData) {
    if (!row.entity_id) continue;
    const rd = row.row_data as Record<string, unknown> | null;
    const empNum = String(rd?.['entityId'] ?? rd?.['num_empleado'] ?? '');
    if (empNum && empNum !== 'undefined' && empNum !== 'null') {
      if (!employeeToEntityIds.has(empNum)) {
        employeeToEntityIds.set(empNum, new Set());
      }
      employeeToEntityIds.get(empNum)!.add(row.entity_id);
    }
  }

  // Build roster entity external_id → entity UUID for lookup
  // Roster entities have simple numeric external_ids like "96568046"
  const extIdToAssignedId = new Map<string, string>();
  for (const e of entities) {
    if (e.external_id && entityIds.includes(e.id)) {
      extIdToAssignedId.set(e.external_id, e.id);
    }
  }

  // Merge: for each employee number with multiple UUIDs, find the roster entity
  // and merge all other UUIDs' data into it.
  let consolidatedCount = 0;
  for (const [empNum, uuidSet] of Array.from(employeeToEntityIds.entries())) {
    if (uuidSet.size <= 1) continue; // No siblings to merge

    // Find the "primary" entity — the one with roster sheet (Datos Colaborador)
    let primaryId: string | null = null;
    for (const uuid of Array.from(uuidSet)) {
      const sheets = dataByEntity.get(uuid);
      if (sheets) {
        for (const sheetName of Array.from(sheets.keys())) {
          if (['datos colaborador', 'roster', 'employee', 'empleados'].some(r => sheetName.toLowerCase().includes(r))) {
            primaryId = uuid;
            break;
          }
        }
      }
      if (primaryId) break;
    }

    // Fallback: use the entity that's in the extIdToAssignedId map
    if (!primaryId) {
      primaryId = extIdToAssignedId.get(empNum) ?? null;
    }
    if (!primaryId) continue;

    // Merge all sibling data into the primary entity
    for (const siblingId of Array.from(uuidSet)) {
      if (siblingId === primaryId) continue;

      const siblingSheetData = dataByEntity.get(siblingId);
      if (!siblingSheetData) continue;

      if (!dataByEntity.has(primaryId)) {
        dataByEntity.set(primaryId, new Map());
      }
      const primarySheets = dataByEntity.get(primaryId)!;
      for (const [sheetName, rows] of Array.from(siblingSheetData.entries())) {
        if (!primarySheets.has(sheetName)) {
          primarySheets.set(sheetName, []);
        }
        primarySheets.get(sheetName)!.push(...rows);
      }

      // Merge flat data
      const siblingFlat = flatDataByEntity.get(siblingId);
      if (siblingFlat) {
        if (!flatDataByEntity.has(primaryId)) {
          flatDataByEntity.set(primaryId, []);
        }
        flatDataByEntity.get(primaryId)!.push(...siblingFlat);
      }
      consolidatedCount++;
    }
  }

  if (consolidatedCount > 0) {
    addLog(`Entity consolidation: merged data from ${consolidatedCount} sibling UUIDs by employee number`);
  }

  // ── 4a. Population filter: only calculate entities on the roster ──
  // OB-147: Enhanced roster identification — three-tier detection:
  //   1. AI context: sheet classified as 'roster' or 'entity_data'
  //   2. Parent sheet heuristic: sheet whose name is a prefix of others (via __ separator)
  //   3. Keyword fallback: sheet name contains known roster terms
  const allSheetNames = new Set<string>();
  for (const [, sheetMap] of Array.from(dataByEntity.entries())) {
    for (const sheetName of Array.from(sheetMap.keys())) {
      allSheetNames.add(sheetName);
    }
  }

  let rosterSheetName: string | null = null;

  // Tier 2: Parent sheet heuristic — a sheet is a "parent" if other sheets
  // start with its name + "__". This is the import convention for multi-tab files.
  if (!rosterSheetName && allSheetNames.size > 1) {
    for (const candidate of Array.from(allSheetNames)) {
      const prefix = candidate + '__';
      const isParent = Array.from(allSheetNames).some(s => s.startsWith(prefix));
      if (isParent) {
        rosterSheetName = candidate;
        addLog(`Roster detected via parent-sheet heuristic: "${rosterSheetName}"`);
        break;
      }
    }
  }

  // Tier 3: Keyword fallback
  if (!rosterSheetName) {
    const rosterKeywords = ['datos colaborador', 'roster', 'employee', 'empleados'];
    for (const sheetName of Array.from(allSheetNames)) {
      if (rosterKeywords.some(r => sheetName.toLowerCase().includes(r))) {
        rosterSheetName = sheetName;
        addLog(`Roster detected via keyword match: "${rosterSheetName}"`);
        break;
      }
    }
  }

  // Build roster entity set from the identified roster sheet
  const rosterEntityIds = new Set<string>();
  if (rosterSheetName) {
    for (const [entityId, sheetMap] of Array.from(dataByEntity.entries())) {
      if (sheetMap.has(rosterSheetName)) {
        rosterEntityIds.add(entityId);
      }
    }
  }

  // If roster found, filter entityIds to only roster employees
  let calculationEntityIds = entityIds;
  if (rosterEntityIds.size > 0) {
    calculationEntityIds = entityIds.filter(id => rosterEntityIds.has(id));
    addLog(`Population filter: ${entityIds.length} total → ${calculationEntityIds.length} roster entities (sheet: "${rosterSheetName}")`);
  } else {
    addLog(`No roster sheet detected — calculating all ${entityIds.length} assigned entities`);
  }

  // ── OB-85-R6: Pre-compute per-store entity sheet aggregates ──
  // For matrix_lookup column metrics that need store-level data derived from
  // entity-level sheets (e.g., store optical sales from individual optical sales),
  // aggregate entity data per store per sheet type AFTER consolidation.
  // Key: storeId → Map<sheetName, aggregated numeric metrics>
  const perStoreEntitySheetAgg = new Map<string, Map<string, Record<string, number>>>();
  for (const entityId of calculationEntityIds) {
    const entitySheetData = dataByEntity.get(entityId);
    if (!entitySheetData) continue;

    // Find this entity's storeId from its flat data
    const entityRows = flatDataByEntity.get(entityId) || [];
    let sid: string | undefined;
    for (const row of entityRows) {
      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
        ? row.row_data as Record<string, unknown> : {};
      const s = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
      if (s !== undefined && s !== null) {
        sid = String(s);
        break;
      }
    }
    if (!sid) continue;

    if (!perStoreEntitySheetAgg.has(sid)) {
      perStoreEntitySheetAgg.set(sid, new Map());
    }
    const storeSheetMap = perStoreEntitySheetAgg.get(sid)!;

    for (const [sheetName, rows] of Array.from(entitySheetData.entries())) {
      const existing = storeSheetMap.get(sheetName) ?? {};
      for (const row of rows) {
        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown> : {};
        for (const [key, value] of Object.entries(rd)) {
          if (typeof value === 'number' && !key.startsWith('_') && key !== 'date') {
            existing[key] = (existing[key] ?? 0) + value;
          }
        }
      }
      storeSheetMap.set(sheetName, existing);
    }
  }

  // ── 4b. Fetch AI Import Context from import_batches.metadata (OB-75) ──
  // Korean Test: PASSES — AI determined sheet→component mapping at import time
  const aiContextSheets: AIContextSheet[] = [];
  try {
```

---

## E1_2_c.md

# E1.2.c — route.ts lines ��1500 (verbatim)

```typescript
    // Get distinct batch IDs from committed_data (OB-153: also check period-agnostic data)
    // HF-196 Phase 1E: filter out superseded batches per Rule 30.
    let bq = supabase
      .from('committed_data')
      .select('import_batch_id')
      .eq('tenant_id', tenantId)
      .not('import_batch_id', 'is', null)
      .limit(100);
    if (supersededIds.length > 0) bq = bq.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
    const { data: batchRows } = await bq;

    const batchIds = Array.from(new Set((batchRows ?? []).map(r => r.import_batch_id).filter((id): id is string => id !== null)));

    if (batchIds.length > 0) {
      // HF-196 Phase 1E: also filter the import_batches lookup itself to operative.
      const { data: batches } = await supabase
        .from('import_batches')
        .select('id, metadata')
        .in('id', batchIds)
        .is('superseded_by', null);

      for (const b of (batches ?? [])) {
        const meta = b.metadata as Record<string, unknown> | null;
        const aiCtx = meta?.ai_context as { sheets?: AIContextSheet[] } | undefined;
        if (aiCtx?.sheets) {
          aiContextSheets.push(...aiCtx.sheets);
        }
      }
    }

    if (aiContextSheets.length > 0) {
      addLog(`AI context loaded: ${aiContextSheets.length} sheet mappings from import batches`);
    } else {
      addLog('No AI context found in import_batches — using fallback name matching');
    }
  } catch (aiErr) {
    addLog(`AI context fetch failed (non-blocking): ${aiErr instanceof Error ? aiErr.message : 'unknown'}`);
  }

  // ── 4c. OB-81: Load agent memory (three-flywheel priors) + create surface ──
  const synapticStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const domainId = 'icm'; // default domain — will be configurable per tenant
  const dispatchContext = { tenantId, domainId };
  let priors: AgentPriors;
  let density;
  try {
    priors = await loadPriorsForAgent(tenantId, domainId, 'calculation');
    density = priors.tenantDensity;
    addLog(`Agent memory loaded: ${density.size} tenant patterns, ${priors.foundationalPriors.size} foundational, ${priors.domainPriors.size} domain`);
  } catch (memErr) {
    console.error('[CalcAPI] Agent memory load failed, falling back to direct density:', memErr);
    try {
      density = await loadDensity(tenantId);
      addLog(`Fallback: Synaptic density loaded: ${density.size} patterns`);
    } catch {
      density = new Map() as Awaited<ReturnType<typeof loadDensity>>;
      addLog('Fallback: Synaptic density load failed (non-blocking) — starting fresh');
    }
    priors = {
      tenantDensity: density,
      foundationalPriors: new Map(),
      domainPriors: new Map(),
      signalHistory: { fieldMappingSignals: [], interpretationSignals: [], reconciliationSignals: [], resolutionSignals: [] },
    };
  }
  const coldStart = density.size === 0;
  const surface = createSynapticSurface(density);
  surface.stats.entityCount = calculationEntityIds.length;
  surface.stats.componentCount = componentIntents.length;

  // Generate pattern signatures and initialize density for each component
  const patternSignatures: string[] = [];
  for (const ci of componentIntents) {
    const sig = generatePatternSignature(ci);
    patternSignatures.push(sig);
    initializePatternDensity(surface, sig, ci.componentIndex);
  }
  addLog(`Pattern signatures: ${patternSignatures.length} generated`);

  // ── 5. Create calculation batch ──
  // OB-197 G11: explicit id == calculationRunId so any signal scoped to the
  // run (convergence, in-run SCI, lifecycle) joins back to this batch row.
  const { data: batch, error: batchErr } = await supabase
    .from('calculation_batches')
    .insert({
      id: calculationRunId,
      tenant_id: tenantId,
      period_id: periodId,
      rule_set_id: ruleSetId,
      batch_type: 'standard',
      lifecycle_state: 'DRAFT',
      entity_count: calculationEntityIds.length,
      config: {} as unknown as Json,
      summary: {} as unknown as Json,
    })
    .select()
    .single();

  if (batchErr || !batch) {
    return NextResponse.json(
      { error: `Failed to create batch: ${batchErr?.message}`, log },
      { status: 500 }
    );
  }

  addLog(`Batch created: ${batch.id}`);

  // HF-207: Fetch tenant name for trace context (best-effort; non-blocking).
  // Required for log-based diagnostics across multiple concurrent tenants.
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .single();
  const tenantName = tenantRow?.name ?? '(unknown)';

  // HF-204: Inline trace context as standard log lines (Vercel log stream)
  // HF-207: tenantName added to context for cross-tenant log diagnostics
  addLog(`[CalcTrace] context tenantId=${tenantId} tenantName=${tenantName} periodId=${periodId} periodLabel=${period?.canonical_key ?? 'n/a'} ruleSetId=${ruleSetId} ruleSetName=${ruleSet?.name ?? 'n/a'} calcBatchId=${batch.id}`);

  // ── 5a. OB-83: Domain Agent dispatch — create negotiation request ──
  const negotiationRequest = createCalculationRequest(dispatchContext, batch.id, periodId);
  addLog(`Domain dispatch: ${negotiationRequest.domainId} → ${negotiationRequest.requestType} (request=${negotiationRequest.requestId})`);

  // ── 5b. OB-81: Batch-load period history for temporal_window support ──
  const periodHistoryMap = new Map<string, number[]>();
  try {
    const TEMPORAL_WINDOW_MAX = 12;
    const { data: priorPeriodResults } = await supabase
      .from('calculation_results')
      .select('entity_id, total_payout')
      .eq('tenant_id', tenantId)
      .neq('period_id', periodId)
      .order('created_at', { ascending: false })
      .limit(TEMPORAL_WINDOW_MAX * Math.min(calculationEntityIds.length, 1000));

    if (priorPeriodResults && priorPeriodResults.length > 0) {
      // OB-196 Phase 3 (E4 / Q-A.5.5): shape validation on calc-engine self-read.
      // Calc engine produces these rows; shape violation here = bug.
      for (const row of priorPeriodResults) {
        if (typeof row.entity_id !== 'string' || typeof row.total_payout !== 'number') {
          throw new Error(
            `[calc-engine self-read] calculation_results row shape violation: ` +
            `entity_id=${typeof row.entity_id} total_payout=${typeof row.total_payout}. ` +
            `Calc engine produced these results; shape mismatch is a bug.`
          );
        }
        if (!periodHistoryMap.has(row.entity_id)) {
          periodHistoryMap.set(row.entity_id, []);
        }
        periodHistoryMap.get(row.entity_id)!.push(row.total_payout);
      }
      addLog(`Period history loaded: ${periodHistoryMap.size} entities with prior results`);
    } else {
      addLog('No prior period results found (temporal_window will use current values)');
    }
  } catch (histErr) {
    addLog(`Period history load failed (temporal_window will degrade gracefully): ${histErr instanceof Error ? histErr.message : 'unknown'}`);
  }

  // OB-81: Inline insights collector
  const allInlineInsights: InlineInsight[] = [];
  const INSIGHT_CHECKPOINT_INTERVAL = Math.max(100, Math.floor(calculationEntityIds.length / 10));

  // ── HF-108: Convergence binding resolution helper (Decision 111) ──
  // Resolves metrics for a component using convergence_bindings (batch_id + column)
  // instead of the old sheet-matching + aggregation path.
  // Returns resolved metrics map, or null if bindings are missing/incomplete.
  interface ConvergenceBindingEntry {
    source_batch_id: string;
    column: string;
    field_identity?: { structuralType?: string; contextualIdentity?: string };
    match_pass?: number;
    confidence?: number;
    // HF-111: Scale factor for percentage columns (e.g., 100 when ratio → percentage)
    scale_factor?: number;
  }

  function resolveMetricsFromConvergenceBindings(
    compBindings: Record<string, unknown>,
    component: PlanComponent,
    entityExternalId: string,
    componentIdx?: number,
  ): Record<string, number> | null {
    if (shouldEmitTrace(entityExternalId)) {
      bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:entry entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} componentName=${JSON.stringify(component.name)} | compBindingsKeys=${Object.keys(compBindings).join(',')}`);
    }
    // HF-111: Support multiple binding roles — actual, row, column, numerator, denominator
    const actualBinding = (compBindings.actual || compBindings.row) as ConvergenceBindingEntry | undefined;
    const targetBinding = (compBindings.target || compBindings.column) as ConvergenceBindingEntry | undefined;
    const numBinding = compBindings.numerator as ConvergenceBindingEntry | undefined;
    const denBinding = compBindings.denominator as ConvergenceBindingEntry | undefined;

    // Need at least one measure binding
    if (!actualBinding?.source_batch_id && !numBinding?.source_batch_id) return null;

    const expectedMetrics = getExpectedMetricNames(component);
    if (expectedMetrics.length === 0) return null;

    const metrics: Record<string, number> = {};

    // HF-111: Ratio input — resolve both numerator and denominator
    if (numBinding?.source_batch_id && numBinding?.column &&
        denBinding?.source_batch_id && denBinding?.column) {
      const rawNumValue = resolveColumnFromBatch(
        numBinding.source_batch_id, numBinding.column, entityExternalId
      );
      const rawDenValue = resolveColumnFromBatch(
        denBinding.source_batch_id, denBinding.column, entityExternalId
      );

      let numValue = rawNumValue;
      let denValue = rawDenValue;
      if (numBinding.scale_factor) numValue = numValue !== null ? numValue * numBinding.scale_factor : null;
      if (denBinding.scale_factor) denValue = denValue !== null ? denValue * denBinding.scale_factor : null;

      if (shouldEmitTrace(entityExternalId)) {
        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | slot=ratio | rawNum=${rawNumValue} | numScale=${numBinding.scale_factor ?? 'undefined'} | postNum=${numValue} | rawDen=${rawDenValue} | denScale=${denBinding.scale_factor ?? 'undefined'} | postDen=${denValue}`);
      }

      if (numValue !== null && denValue !== null && denValue !== 0) {
        metrics[expectedMetrics[0]] = numValue / denValue;
      }
      const result = Object.keys(metrics).length > 0 ? metrics : null;
      if (shouldEmitTrace(entityExternalId)) {
        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | path=ratio | metrics=${JSON.stringify(metrics)} | returnedNull=${result === null}`);
      }
      return result;
    }

    // Single or dual input (actual + target, or row + column)
    if (actualBinding?.source_batch_id && actualBinding?.column) {
      const rawActualValue = resolveColumnFromBatch(
        actualBinding.source_batch_id, actualBinding.column, entityExternalId
      );
      if (rawActualValue === null) {
        if (shouldEmitTrace(entityExternalId)) {
          bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | path=single_actual_null | returnedNull=true`);
        }
        return null;
      }

      // HF-111: Apply scale factor (e.g., 0.85 ratio → 85 percentage)
      let actualValue = rawActualValue;
      if (actualBinding.scale_factor) actualValue *= actualBinding.scale_factor;

      if (shouldEmitTrace(entityExternalId)) {
        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | slot=actual | rawActual=${rawActualValue} | actualScale=${actualBinding.scale_factor ?? 'undefined'} | postActual=${actualValue} | metricKey=${expectedMetrics[0]}`);
      }

      metrics[expectedMetrics[0]] = actualValue;

      // Resolve target/column value if binding exists
      if (targetBinding?.source_batch_id && targetBinding?.column) {
        const rawTargetValue = resolveColumnFromBatch(
          targetBinding.source_batch_id, targetBinding.column, entityExternalId
        );
        let targetValue = rawTargetValue;
        if (targetBinding.scale_factor && targetValue !== null) targetValue *= targetBinding.scale_factor;

        if (shouldEmitTrace(entityExternalId)) {
          bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | slot=target | rawTarget=${rawTargetValue} | targetScale=${targetBinding.scale_factor ?? 'undefined'} | postTarget=${targetValue}`);
        }

        if (targetValue !== null && targetValue !== 0) {
          const targetMetricName = expectedMetrics.length > 1
            ? expectedMetrics[1]
            : `${expectedMetrics[0]}_target`;
          metrics[targetMetricName] = targetValue;

          // Only compute attainment for actual+target pairs, NOT row+column 2D lookups
          if (compBindings.actual && compBindings.target) {
            metrics['attainment'] = actualValue / targetValue;
            if (shouldEmitTrace(entityExternalId)) {
              bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:attainment_computed entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | actualValue=${actualValue} | targetValue=${targetValue} | attainment=${metrics['attainment']}`);
            }
          }
        }
      }
    }

    const result = Object.keys(metrics).length > 0 ? metrics : null;
    if (shouldEmitTrace(entityExternalId)) {
      bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | path=single_or_dual | metrics=${JSON.stringify(result)} | returnedNull=${result === null}`);
    }
    return result;
  }

  // HF-109: Resolve a single column value for an entity from the batch data cache (DS-009 5.1).
  // Uses external_id as lookup key (the cache is indexed by row_data[entity_column] values).
  // Sums all matching rows (for period aggregation).
  function resolveColumnFromBatch(
    batchId: string,
    column: string,
    entityExternalId: string,
  ): number | null {
    const initialBatchPresent = dataByBatch.has(batchId);
    let batchEntityMap = dataByBatch.get(batchId);
    const initialEntityPresent = !!batchEntityMap?.has(entityExternalId);

    // DIAG-003: If the binding's source_batch_id doesn't have data (different period),
    // search ALL cached batches for this entity's data. The column names are the same
    // across batches — only the batch_id differs between periods.
    let diag003Fallback = false;
    if (!batchEntityMap || !batchEntityMap.has(entityExternalId)) {
      for (const [, map] of Array.from(dataByBatch.entries())) {
        if (map.has(entityExternalId)) {
          batchEntityMap = map;
          diag003Fallback = true;
          diag003FallbackCount++;  // HF-208: track per-call diag003 fallback engagements
          // HF-212 TIER 3: emit exception detail inline (always visible) + push flag for Tier 2
          addLog(`[CalcRecon-T3] EXCEPTION entity=${entityExternalId} type=diag003Fallback batchId=${batchId} column=${column}`);
          currentEntityFlags.push('diag003Fallback');
          break;
        }
      }
    }
    if (!batchEntityMap) {
      if (shouldEmitTrace(entityExternalId)) {
        bufferTrace(`[CalcTrace] resolveColumnFromBatch:exit entity=${entityExternalId} | batchId=${batchId} | column=${column} | initialBatchPresent=${initialBatchPresent} | initialEntityPresent=${initialEntityPresent} | diag003Fallback=${diag003Fallback} | reason=no_batch_map | returned=null`);
      }
      return null;
    }

    // DS-009 5.1: look up by external_id — the cache key IS the entity identifier value
    const rows = batchEntityMap.get(entityExternalId);
    if (!rows || rows.length === 0) {
      if (shouldEmitTrace(entityExternalId)) {
        bufferTrace(`[CalcTrace] resolveColumnFromBatch:exit entity=${entityExternalId} | batchId=${batchId} | column=${column} | initialBatchPresent=${initialBatchPresent} | initialEntityPresent=${initialEntityPresent} | diag003Fallback=${diag003Fallback} | reason=no_rows | returned=null`);
      }
      return null;
    }

    let sum = 0;
    let found = false;
    const perRowValues: unknown[] = [];
    for (const rd of rows) {
      const val = rd[column];
      perRowValues.push(val);
      if (val === null || val === undefined) continue;
      if (typeof val === 'number') {
        sum += val;
        found = true;
      } else if (typeof val === 'string') {
        const parsed = parseFloat(val.replace(/[,$\s]/g, ''));
        if (!isNaN(parsed)) {
          sum += parsed;
          found = true;
        }
      }
    }

    if (shouldEmitTrace(entityExternalId)) {
      bufferTrace(`[CalcTrace] resolveColumnFromBatch:exit entity=${entityExternalId} | batchId=${batchId} | column=${column} | initialBatchPresent=${initialBatchPresent} | initialEntityPresent=${initialEntityPresent} | diag003Fallback=${diag003Fallback} | rowCount=${rows.length} | perRowValues=${JSON.stringify(perRowValues)} | sum=${sum} | found=${found} | returned=${found ? sum : 'null'}`);
    }

    return found ? sum : null;
  }

  // ── 6. Evaluate each entity using DUAL-PATH: current engine + intent executor ──
  const entityResults: Array<{
    entity_id: string;
    rule_set_id: string;
    period_id: string;
    total_payout: number;
    components: ComponentResult[];
    metrics: Record<string, number>;
    attainment: { overall: number };
    metadata: Record<string, unknown>;
  }> = [];

  let grandTotal = 0;
  let intentMatchCount = 0;
  let intentMismatchCount = 0;

  // HF-119: Token overlap variant matching — build token sets once before entity loop
  const variantTokenize = (text: string): string[] =>
    text
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9\s_]/g, ' ')
      .split(/[\s_]+/)
      .filter(t => t.length > 2);

  const variantTokenSets = variants.map(v => {
    const text = [
      String(v.variantName ?? ''),
      String(v.description ?? ''),
      String(v.variantId ?? ''),
    ].join(' ');
    return new Set(variantTokenize(text));
  });

  // Discriminant tokens: tokens unique to each variant (not in any other variant)
  const variantDiscriminants = variantTokenSets.map((tokens, i) => {
    const otherTokens = new Set<string>();
    variantTokenSets.forEach((t, j) => { if (j !== i) t.forEach(tok => otherTokens.add(tok)); });
    return new Set(Array.from(tokens).filter(t => !otherTokens.has(t)));
  });

  if (variants.length > 1) {
    addLog(`HF-119 Variant discriminants: ${variantDiscriminants.map((d, i) =>
      `V${i}=[${Array.from(d).join(',')}]`).join(' ')}`);
  }

  // OB-177: Materialize period_entity_state and load for variant matching
  // Resolves entities.temporal_attributes as-of period date into flat resolved_attributes
  const materializedState = new Map<string, Record<string, unknown>>();
  if (variants.length > 1) {
    try {
      const { data: period } = await supabase
        .from('periods')
        .select('end_date')
        .eq('id', periodId)
        .single();
      const asOfDate = period?.end_date || new Date().toISOString().split('T')[0];

      // OB-190: Batch entity fetch to avoid Supabase .in() URL length limits
      const entitiesWithAttrs: Array<{ id: string; temporal_attributes: Json; metadata: Json }> = [];
      const MAT_BATCH = 200;
      for (let i = 0; i < calculationEntityIds.length; i += MAT_BATCH) {
        const batch = calculationEntityIds.slice(i, i + MAT_BATCH);
        const { data: page, error: matFetchErr } = await supabase
          .from('entities')
          .select('id, temporal_attributes, metadata')
          .eq('tenant_id', tenantId)
          .in('id', batch);
        if (matFetchErr) {
          console.warn(`[OB-190] Materialization batch ${i}-${i + batch.length} error:`, matFetchErr.message);
        }
        if (page) entitiesWithAttrs.push(...page);
      }

      if (entitiesWithAttrs.length > 0) {
        for (const ent of entitiesWithAttrs) {
          const attrs = (ent.temporal_attributes || []) as Array<{ key: string; value: Json; effective_from: string; effective_to: string | null }>;
          const resolved: Record<string, unknown> = {};
          // Resolve each temporal attribute as-of period date
          const sorted = [...attrs].sort((a, b) => (b.effective_from || '').localeCompare(a.effective_from || ''));
          for (const attr of sorted) {
            if (attr.key in resolved) continue;
            if (attr.effective_from && attr.effective_from > asOfDate) continue;
            if (attr.effective_to && attr.effective_to < asOfDate) continue;
            resolved[attr.key] = attr.value;
          }
          // Also include metadata.role if present (backward compat)
          const meta = (ent.metadata || {}) as Record<string, unknown>;
          if (meta.role && !resolved['role']) resolved['role'] = meta.role;
          if (Object.keys(resolved).length > 0) {
            materializedState.set(ent.id, resolved);
          }
        }
        if (materializedState.size > 0) {
          addLog(`OB-177 Materialized: ${materializedState.size} entities with resolved attributes`);
        }
      }

      // Write to period_entity_state for audit trail
      if (materializedState.size > 0) {
        await supabase.from('period_entity_state').delete().eq('tenant_id', tenantId).eq('period_id', periodId);
        const pesRows = Array.from(materializedState.entries()).map(([entityId, resolved]) => ({
          tenant_id: tenantId,
          entity_id: entityId,
          period_id: periodId,
          resolved_attributes: resolved as Json,
          resolved_relationships: {} as Json,
          entity_type: 'individual',
          status: 'active',
        }));
        const PES_BATCH = 1000;
        for (let i = 0; i < pesRows.length; i += PES_BATCH) {
          await supabase.from('period_entity_state').insert(pesRows.slice(i, i + PES_BATCH));
        }
      }
    } catch (matErr) {
      console.warn('[OB-177] Materialization failed (non-blocking):', matErr);
    }
  }

  // OB-190: VARIANT-DIAG — trace why variant matching fails for first 3 entities
  if (variants.length > 1) {
    let diagCount = 0;
    for (const eid of calculationEntityIds) {
      if (diagCount >= 3) break;
      diagCount++;
      const resolvedAttrs = materializedState.get(eid);
      const eInfo = entityMap.get(eid);
      const eRowsFlat = flatDataByEntity.get(eid) || [];
      const eName = eInfo?.display_name ?? eid;

      addLog(`[VARIANT-DIAG] ${eName}: materializedState=${JSON.stringify(resolvedAttrs || {})}`);
      const eMeta = (eInfo as { metadata?: Record<string, unknown> })?.metadata;
      addLog(`[VARIANT-DIAG] ${eName}: metadata.role=${JSON.stringify(eMeta?.role || 'NONE')}`);
      const sampleRd = eRowsFlat.length > 0 ? (eRowsFlat[0] as { row_data?: Record<string, unknown> })?.row_data : null;
      addLog(`[VARIANT-DIAG] ${eName}: flatDataRows=${eRowsFlat.length}, sampleRowKeys=${sampleRd ? Object.keys(sampleRd).join(',') : 'NONE'}`);

      // Show what tokens would be generated from materializedState
      const testTokens = new Set<string>();
      if (resolvedAttrs) {
        for (const val of Object.values(resolvedAttrs)) {
```

---

## E1_2_d.md

# E1.2.d — route.ts lines ��2000 (verbatim)

```typescript
          if (typeof val === 'string' && val.length > 1) {
            for (const token of variantTokenize(val)) {
              testTokens.add(token);
            }
          }
        }
      }
      addLog(`[VARIANT-DIAG] ${eName}: generated tokens=[${Array.from(testTokens).join(',')}]`);
      addLog(`[VARIANT-DIAG] ${eName}: V0 disc=[${Array.from(variantDiscriminants[0] || []).join(',')}], V1 disc=[${Array.from(variantDiscriminants[1] || []).join(',')}]`);
    }
    addLog(`[VARIANT-DIAG] materializedState.size=${materializedState.size}, calculationEntityIds.length=${calculationEntityIds.length}`);
  }

  // OB-194: Track excluded entities
  const excludedEntities: Array<{ entityId: string; entityName: string; externalId: string; reason: string; tokens: string }> = [];

  // ═══════════════════════════════════════════════════════════════
  // HF-212 TIER 1 HEADER: emits BEFORE entity loop
  // ═══════════════════════════════════════════════════════════════
  addLog(`[CalcRecon-T1] ╔═══════════════════════════════════════════════════════════════╗`);
  addLog(`[CalcRecon-T1] ║              CALC RECONCILIATION HEADER                       ║`);
  addLog(`[CalcRecon-T1] ╚═══════════════════════════════════════════════════════════════╝`);
  addLog(`[CalcRecon-T1] tenant=${tenantName ?? 'n/a'}`);
  addLog(`[CalcRecon-T1] period=${period?.canonical_key ?? 'n/a'}`);
  addLog(`[CalcRecon-T1] ruleSet="${ruleSet?.name ?? 'n/a'}"`);
  addLog(`[CalcRecon-T1] batchId=${batch.id} run=${calculationRunId ?? 'n/a'}`);
  addLog(`[CalcRecon-T1] entitiesAssigned=${calculationEntityIds.length} components=${defaultComponents.length}`);
  const t1ComponentNames = defaultComponents.map((c, i) => `c${i}:${c.name ?? 'unnamed'}`).join(' | ');
  addLog(`[CalcRecon-T1] componentList=[${t1ComponentNames}]`);
  addLog(`[CalcRecon-T1] verbosityMode=${CALC_TRACE_VERBOSE ? 'FORENSIC (Tier 4 enabled)' : 'DEFAULT (Tier 1-3 only)'}`);
  addLog(`[CalcRecon-T1] ─── Loop starts; Tier 2 lines emit per entity, Tier 3 emit on exceptions ───`);

  for (const entityId of calculationEntityIds) {
    const entityInfo = entityMap.get(entityId);
    const entitySheetData = dataByEntity.get(entityId) || new Map();
    const entityRowsFlat = flatDataByEntity.get(entityId) || [];

    // HF-212: Per-entity component breakdown. Cleared per iteration.
    // Populated at component_complete site (per-component); consumed at Tier 2 emission.
    const perEntityComponentBreakdown: Map<number, number> = new Map();
    // HF-212: Reset handler-scope flags collector for this entity (closures see the same binding).
    currentEntityFlags = [];

    // Find this entity's store ID and role (use FIRST occurrence, not sum)
    const allEntityMetrics = aggregateMetrics(entityRowsFlat);
    let entityStoreId: string | number | undefined;
    for (const row of entityRowsFlat) {
      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
        ? row.row_data as Record<string, unknown> : {};
      if (entityStoreId === undefined) {
        const sid = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
        if (sid !== undefined && sid !== null) {
          entityStoreId = sid as string | number;
        }
      }
      if (entityStoreId !== undefined) break;
    }

    const entityStoreData = entityStoreId !== undefined ? storeData.get(entityStoreId) : undefined;

    // HF-119: Token overlap variant matching — cross-language, structural
    let selectedComponents = defaultComponents;
    let selectedVariantIndex = 0;
    if (variants.length > 1) {
      // Build entity token set from ALL string field values
      const entityTokens = new Set<string>();
      for (const row of entityRowsFlat) {
        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown> : {};
        for (const val of Object.values(rd)) {
          if (typeof val === 'string' && val.length > 1) {
            for (const token of variantTokenize(val)) {
              entityTokens.add(token);
            }
          }
        }
      }

      // Score by discriminant token matches
      const discScores = variantDiscriminants.map((disc, i) => {
        const matched = Array.from(disc).filter(t => entityTokens.has(t));
        return { index: i, matches: matched.length, tokens: matched };
      });
      discScores.sort((a, b) => b.matches - a.matches);

      let method = 'default_last';
      if (discScores[0].matches > (discScores[1]?.matches ?? 0)) {
        // Clear discriminant winner
        selectedVariantIndex = discScores[0].index;
        method = 'discriminant_token';
      } else {
        // Tie on discriminants — try total overlap
        const overlapScores = variantTokenSets.map((tokens, i) => ({
          index: i,
          overlap: Array.from(tokens).filter(t => entityTokens.has(t)).length,
        }));
        overlapScores.sort((a, b) => b.overlap - a.overlap);

        if (overlapScores[0].overlap > (overlapScores[1]?.overlap ?? 0)) {
          selectedVariantIndex = overlapScores[0].index;
          method = 'total_overlap';
        } else {
          // Still tied — default to last variant (less-specific / Standard)
          selectedVariantIndex = variants.length - 1;
          method = 'default_last';
        }
      }

      selectedComponents = (variants[selectedVariantIndex]?.components as PlanComponent[]) ?? defaultComponents;

      // Log first 3 entities for debugging
      if (entityResults.length < 3) {
        const entityName = entityInfo?.display_name ?? entityId;
        console.log(`[VARIANT] ${entityName}: disc=[${discScores.map(s =>
          `V${s.index}:${s.matches}`).join(',')}] → variant_${selectedVariantIndex} (${method})`);
      }

      // OB-194: Variant Eligibility Gate
      // When a plan defines 2+ variants (explicit population segments) and an entity
      // matches NONE with score > 0, the entity is excluded from calculation.
      // Architecture: "An entity matching NO variant is an explicit error, not a silent zero."
      if (method === 'default_last') {
        const bestDiscScore = discScores[0]?.matches ?? 0;
        const bestOverlap = variantTokenSets.reduce((best, tokens) => {
          const overlap = Array.from(tokens).filter(t => entityTokens.has(t)).length;
          return Math.max(best, overlap);
        }, 0);

        if (bestDiscScore === 0 && bestOverlap === 0) {
          const entityName = entityInfo?.display_name ?? entityId;
          const tokenList = Array.from(entityTokens).slice(0, 10).join(',');
          console.log(`[VARIANT] ${entityName}: NO MATCH — excluded (disc=0, overlap=0, variants=${variants.length}, tokens=[${tokenList}])`);
          excludedEntities.push({
            entityId,
            entityName,
            externalId: entityInfo?.external_id ?? entityId,
            reason: 'no_qualifying_variant',
            tokens: tokenList,
          });
          continue; // Skip calculation for this entity
        }
      }
    }

    // HF-212: Increment variant distribution counter for non-excluded entities.
    // Variant key composition: variant_<index>(<role>) — index for engine routing,
    // role for population-segment granularity. Surfaced in Tier 1 footer.
    const variantKey = `variant_${selectedVariantIndex}(${(entityInfo as { metadata?: { role?: string } })?.metadata?.role ?? 'unknown'})`;
    variantCounts.set(variantKey, (variantCounts.get(variantKey) ?? 0) + 1);

    // ── OB-118: Derive metrics once per entity from loaded data ──
    // OB-121: Pass prior period data for delta derivations
    // OB-146: Merge entity + store data for derivation so store-level metrics
    // (e.g., new_customers from clientes_nuevos, collections from cobranza)
    // can be derived. Store data has entity_id IS NULL but derivation rules
    // match by sheet name pattern, which is source-agnostic.
    const entityPriorData = priorDataByEntity.get(entityId);
    let derivationInput = entitySheetData;
    if (entityStoreData && entityStoreData.size > 0) {
      derivationInput = new Map(entitySheetData);
      for (const [sheetName, rows] of Array.from(entityStoreData.entries())) {
        if (!derivationInput.has(sheetName)) {
          derivationInput.set(sheetName, rows);
        } else {
          // OB-148: Append store rows even when entity has same sheet name.
          // Store data may have fields (e.g., Real_Venta_Tienda, Meta_Venta_Tienda)
          // not present in entity rows. The derivation sum/ratio operations
          // only aggregate fields that exist, so mixing is safe.
          derivationInput.set(sheetName, [...derivationInput.get(sheetName)!, ...rows]);
        }
      }
    }
    const derivedMetrics = metricDerivations.length > 0
      ? applyMetricDerivations(derivationInput, metricDerivations, entityPriorData)
      : {};

    // ── LEGACY ENGINE PATH (concordance shadow — HF-188) ──
    if (entityResults.length === 0) {
      addLog('HF-188: Intent executor is sole authority — legacy engine is concordance shadow');
    }
    const componentResults: ComponentResult[] = [];
    let legacyTotalDecimal = ZERO;
    const perComponentMetrics: Record<string, number>[] = [];
    const entityRoundingTraces: RoundingTrace[] = [];

    for (let compIdx = 0; compIdx < selectedComponents.length; compIdx++) {
      const component = selectedComponents[compIdx];

      // HF-108: Convergence binding resolution (Decision 111) — PRIMARY path
      // Convergence bindings tell us exactly which batch + column has each input.
      // Old sheet-matching path (buildMetricsForComponent) is FALLBACK for pre-OB-162 data.
      const compBindingKey = `component_${compIdx}`;
      const compBindings = convergenceBindings?.[compBindingKey] as Record<string, unknown> | undefined;
      let metrics: Record<string, number>;
      let usedConvergenceBindings = false;

      if (compBindings && dataByBatch.size > 0) {
        const cbMetrics = resolveMetricsFromConvergenceBindings(
          compBindings, component, entityInfo?.external_id ?? '', compIdx
        );
        if (cbMetrics && Object.keys(cbMetrics).length > 0) {
          metrics = cbMetrics;
          usedConvergenceBindings = true;
        } else {
          // Convergence binding resolution returned nothing — fall back
          const entityStoreAgg = entityStoreId !== undefined
            ? perStoreEntitySheetAgg.get(String(entityStoreId))
            : undefined;
          metrics = buildMetricsForComponent(
            component, entitySheetData, entityStoreData,
            aiContextSheets, entityStoreAgg, metricMappings
          );
        }
      } else {
        // FALLBACK: Old sheet-matching path (no convergence bindings for this component)
        const entityStoreAgg = entityStoreId !== undefined
          ? perStoreEntitySheetAgg.get(String(entityStoreId))
          : undefined;
        metrics = buildMetricsForComponent(
          component, entitySheetData, entityStoreData,
          aiContextSheets, entityStoreAgg, metricMappings
        );
      }

      // Log which path was taken (first entity only, to avoid flooding)
      if (entityResults.length === 0 && compIdx === 0) {
        addLog(`HF-108 Resolution path: ${usedConvergenceBindings ? 'convergence_bindings (Decision 111)' : 'sheet-matching (fallback)'}`);
      }

      // OB-118 / HF-206: Convergence-resolved metrics are authoritative (Decision 111 /
      // Decision 153 atomic cutover completion). Derivation fills gaps only — a metric
      // resolved by convergence cannot be overwritten by Pass 4 derivation output.
      // IRA HF-206 (2026-05-06, $1.671075; ira_request_hash cfcef09e02e70710dbd5e523b1eb4ef27aedf50ccb6776ed75784c8963d9bb43)
      // recommended Shape A as minimum-viable coherence restoration.
      for (const [key, value] of Object.entries(derivedMetrics)) {
        if (!(key in metrics)) {
          metrics[key] = value;  // derivation fills gaps only; convergence values preserved
        } else {
          ob118MergeGuardFiredCount++;  // HF-208: track guard firings (convergence preserved over derivation)
          // HF-212 TIER 3: emit exception detail inline (always visible) + push flag for Tier 2
          addLog(`[CalcRecon-T3] EXCEPTION entity=${entityInfo?.external_id ?? entityId} component=${compIdx} type=ob118MergeGuardFired existingKey=${key} preserved=convergence`);
          currentEntityFlags.push('ob118MergeGuardFired');
        }
      }
      // OB-167: Band-aware normalization — replaces inferSemanticType-gated normalization.
      // Compare metric values against the component's band ranges (from the plan spec).
      // If value is in decimal range (0-2) but the band expects percentage range (max > 10),
      // normalize ×100. Korean Test: uses plan structure, not metric name patterns.
      // HF-116: Still skip for convergence path (scale_factor handles it there).
      if (!usedConvergenceBindings) {
        // OB-196 Phase 2: band-normalization reads foundational metadata.intent (Decision 151
        // read-only projection). 1D lookup → intent.boundaries[0].max keyed by intent.input
        // metric field; 2D lookup → intent.rowBoundaries[0].max + intent.columnBoundaries[0].max
        // keyed by intent.inputs.row/column metric fields.
        const bandMaxByMetric: Record<string, number> = {};
        const meta = (component.metadata || {}) as Record<string, unknown>;
        const intent = (meta.intent || component.calculationIntent) as Record<string, unknown> | undefined;
        if (intent) {
          const op = intent.operation as string | undefined;
          const readField = (raw: unknown): string | undefined => {
            if (!raw || typeof raw !== 'object') return undefined;
            const o = raw as Record<string, unknown>;
            if (o.source === 'metric') {
              const spec = (o.sourceSpec || {}) as Record<string, unknown>;
              return typeof spec.field === 'string' ? spec.field : undefined;
            }
            return undefined;
          };
          if (op === 'bounded_lookup_2d') {
            const inputs = (intent.inputs || {}) as Record<string, unknown>;
            const rowField = readField(inputs.row);
            const colField = readField(inputs.column);
            const rowBoundaries = intent.rowBoundaries as Array<{ max: number | null }> | undefined;
            const colBoundaries = intent.columnBoundaries as Array<{ max: number | null }> | undefined;
            if (rowField && rowBoundaries && rowBoundaries.length > 0 && rowBoundaries[0].max != null) {
              bandMaxByMetric[rowField] = rowBoundaries[0].max;
            }
            if (colField && colBoundaries && colBoundaries.length > 0 && colBoundaries[0].max != null) {
              bandMaxByMetric[colField] = colBoundaries[0].max;
            }
          } else if (op === 'bounded_lookup_1d') {
            const field = readField(intent.input);
            const boundaries = intent.boundaries as Array<{ max: number | null }> | undefined;
            if (field && boundaries && boundaries.length > 0 && boundaries[0].max != null) {
              bandMaxByMetric[field] = boundaries[0].max;
            }
          }
        }

        for (const [key, value] of Object.entries(metrics)) {
          const bandMax = bandMaxByMetric[key];
          if (bandMax !== undefined && bandMax > 10 && value > 0 && value < 10) {
            // Metric is in decimal range but band expects percentage → scale ×100
            metrics[key] = value * 100;
          } else if (bandMax === undefined) {
            // No band references this metric — fall back to semantic type detection
            // (handles derived metrics and other non-band-referenced inputs)
            if (inferSemanticType(key) === 'attainment' && value > 0 && value < 10) {
              metrics[key] = value * 100;
            }
          }
        }
      }
      const result = evaluateComponent(component, metrics);

      // HF-122: Per-component rounding (Decision 122).
      // OB-196 Phase 2: legacy SHAPE fields removed; precision derives from foundational
      // intent only.
      const componentIntent = component.calculationIntent as Record<string, unknown> | undefined;
      const precision = inferOutputPrecision(componentIntent, undefined);

      const { rounded, trace: roundingTrace } = roundComponentOutput(
        result.payout, compIdx, component.name, precision
      );
      result.payout = toNumber(rounded);
      entityRoundingTraces.push(roundingTrace);

      componentResults.push(result);
      perComponentMetrics.push(metrics);
      legacyTotalDecimal = legacyTotalDecimal.plus(rounded);
    }

    // HF-188: Legacy total preserved for concordance comparison only
    const legacyTotal = toNumber(legacyTotalDecimal);

    // ── HF-188 INTENT ENGINE PATH (authoritative) ──
    // HF-119: Use selected variant's intents, not always defaultComponents
    const entityIntents = selectedVariantIndex === 0
      ? componentIntents
      : transformVariant(selectedComponents);
    const intentTraces: unknown[] = [];
    const priorResults: number[] = [];

    // HF-155 Item 1: Populate crossDataCounts from entity's committed_data
    // Uses dataByEntity which groups by data_type (sheet name)
    const entityCrossData: Record<string, number> = {};
    const entitySheetMap = dataByEntity.get(entityId);
    if (entitySheetMap) {
      for (const [dataType, rows] of Array.from(entitySheetMap.entries())) {
        // Count rows for this data_type
        const countKey = `${dataType}:count`;
        entityCrossData[countKey] = rows.length;
        // Sum numeric fields
        for (const row of rows) {
          const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
            ? row.row_data as Record<string, unknown> : {};
          for (const [key, val] of Object.entries(rd)) {
            if (key.startsWith('_') || typeof val !== 'number') continue;
            const sumKey = `${dataType}:sum:${key}`;
            entityCrossData[sumKey] = (entityCrossData[sumKey] || 0) + val;
          }
        }
      }
    }

    // HF-155 Item 2 + OB-186: Populate scopeAggregates for entities with scope data
    // Resolves scope from entities.metadata (district, region, store_id)
    // OB-186: Produces BOTH unfiltered aggregates (raw field sums) AND filtered
    // aggregates (metric_derivation rules applied). Filtered aggregates use the
    // derived metric name as key (e.g., "district:equipment_revenue:sum").
    const entityScopeAgg: Record<string, number> = {};
    const entityMeta = entityMap.get(entityId);
    const entityMetadata = (entityMeta?.metadata || {}) as Record<string, unknown>;
    const entityDistrict = entityMetadata.district || entityMetadata.store_id;
    const entityRegion = entityMetadata.region;

    // Helper: aggregate rows from other entities in same scope
    const aggregateScopeRows = (
      scopeField: string,
      scopeValue: unknown,
      scopePrefix: string,
    ) => {
      for (const [otherId, otherSheetMap] of Array.from(dataByEntity.entries())) {
        if (otherId === entityId) continue;
        const otherMeta = entityMap.get(otherId);
        const otherMetaData = (otherMeta?.metadata || {}) as Record<string, unknown>;
        const otherScope = scopeField === 'district'
          ? (otherMetaData.district || otherMetaData.store_id)
          : otherMetaData.region;
        if (otherScope !== scopeValue) continue;

        for (const [, rows] of Array.from(otherSheetMap.entries())) {
          for (const row of rows) {
            const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
              ? row.row_data as Record<string, unknown> : {};

            // Unfiltered: sum all numeric fields
            for (const [key, val] of Object.entries(rd)) {
              if (key.startsWith('_') || typeof val !== 'number') continue;
              entityScopeAgg[`${scopePrefix}:${key}:sum`] = (entityScopeAgg[`${scopePrefix}:${key}:sum`] || 0) + val;
            }

            // OB-186: Filtered scope aggregates from metric_derivation rules
            for (const rule of metricDerivations) {
              if (rule.operation !== 'sum' || !rule.source_field) continue;
              if (!rowMatchesFilters(rd, rule.filters)) continue;
              const val = rd[rule.source_field];
              if (typeof val === 'number') {
                entityScopeAgg[`${scopePrefix}:${rule.metric}:sum`] = (entityScopeAgg[`${scopePrefix}:${rule.metric}:sum`] || 0) + val;
              }
            }
          }
        }
      }
    };

    if (entityDistrict) aggregateScopeRows('district', entityDistrict, 'district');
    if (entityRegion) aggregateScopeRows('region', entityRegion, 'region');

    // HF-188: Intent executor is sole authority. Rounding applied here.
    let intentTotalDecimal = ZERO;
    if (shouldEmitTrace(entityInfo?.external_id ?? entityId)) {
      bufferTrace(`[CalcTrace] runCalculation:entity_start entity=${entityInfo?.external_id ?? ''} entityName=${JSON.stringify(entityInfo?.display_name ?? entityId)} | variantSelected=${selectedVariantIndex} | flatDataRowCount=${entityRowsFlat.length} | metricsKeys=[${Object.keys(allEntityMetrics).join(',')}]`);
    }
    for (const ci of entityIntents) {
      // HF-205 Shape C: convergence is sole metrics authority (Decision 153 atomic
      // cutover completion). Per-component metrics map MUST be populated; fail fast
      // if not (rather than silently falling back to seeds-era raw-row-value map).
      // DIAG-033 verified: all metric keys consumed by intent-executor are
      // convergence-resolvable for tenants with convergence_bindings.
      const metrics = perComponentMetrics[ci.componentIndex];
      if (!metrics) {
        throw new Error(
          `HF-205 invariant: per-component metrics missing for component ${ci.componentIndex} ` +
          `(entity=${entityInfo?.external_id ?? entityId}). Convergence binding resolution ` +
          `must populate metrics for every component before intent-executor handoff. ` +
          `Decision 153 / Decision 111 violation.`
        );
      }
      const entityData: EntityData = {
        entityId,
        metrics,
        attributes: {},
        priorResults: [...priorResults],
        periodHistory: periodHistoryMap.get(entityId),
        crossDataCounts: entityCrossData,
        scopeAggregates: entityScopeAgg,
        // HF-211: Route intent-executor [CalcTrace] emissions through buffer (only for traced
        // entities) so they flush after the [CalcRecon] block at handler exit.
        traceCollector: shouldEmitTrace(entityInfo?.external_id ?? entityId) ? bufferTrace : undefined,
      };
      const intentResult = executeIntent(ci, entityData);
      intentTraces.push(intentResult.trace);

      // HF-188: Apply Decision 122 rounding to intent executor results
      const comp = selectedComponents[ci.componentIndex];
      const compIntent = comp?.calculationIntent as Record<string, unknown> | undefined;
      const precision = inferOutputPrecision(compIntent, undefined);
      const { rounded, trace: roundingTrace } = roundComponentOutput(
        intentResult.outcome, ci.componentIndex, ci.label, precision
      );
      const roundedValue = toNumber(rounded);

      // Override componentResults payout with intent-authority value
      if (componentResults[ci.componentIndex]) {
        componentResults[ci.componentIndex].payout = roundedValue;
      }
      entityRoundingTraces[ci.componentIndex] = roundingTrace;

      intentTotalDecimal = intentTotalDecimal.plus(rounded);
      priorResults[ci.componentIndex] = roundedValue;

      // HF-211: Accumulate per-component total UNCONDITIONALLY (every entity, every component).
      // Source for [CalcRecon] block per-component breakdown — independent of trace cap.
      const _existingCompTotal = componentTotals.get(ci.componentIndex);
      componentTotals.set(ci.componentIndex, {
        name: comp?.name ?? `component_${ci.componentIndex}`,
        total: (_existingCompTotal?.total ?? 0) + (Number(roundedValue) || 0),
      });

      // HF-212 TIER 2: Per-entity component breakdown — accumulate THIS entity's
      // per-component totals for the Tier 2 summary line emitted after the per-entity total.
      perEntityComponentBreakdown.set(
        ci.componentIndex,
        (perEntityComponentBreakdown.get(ci.componentIndex) ?? 0) + (Number(roundedValue) || 0),
      );

      if (shouldEmitTrace(entityInfo?.external_id ?? entityId)) {
        bufferTrace(`[CalcTrace] runCalculation:component_complete entity=${entityInfo?.external_id ?? ''} componentIdx=${ci.componentIndex} componentName=${JSON.stringify(comp?.name)} | rawOutcome=${intentResult.outcome} | rounded=${roundedValue} | metrics=${JSON.stringify(metrics)}`);
      }
    }

    // HF-188: Intent executor is authoritative — legacy is concordance shadow
    const intentTotal = toNumber(intentTotalDecimal);
    const entityTotal = intentTotal;

    // ── DUAL-PATH COMPARISON ──
    const entityMatch = Math.abs(legacyTotal - intentTotal) < 0.01;
    if (entityMatch) {
      intentMatchCount++;
    } else {
      intentMismatchCount++;
    }

    // ── SYNAPTIC: Write per-component confidence synapses ──
    for (let ci = 0; ci < componentIntents.length; ci++) {
      const compMatch = componentResults[ci] && Math.abs(componentResults[ci].payout - (priorResults[ci] ?? 0)) < 0.01;
      writeSynapse(surface, {
        type: 'confidence',
        componentIndex: ci,
```

---

## E1_2_e.md

# E1.2.e — route.ts lines ��2500 (verbatim)

```typescript
        entityId,
        value: compMatch ? 1.0 : 0.0,
        timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      });
    }

    grandTotal += entityTotal;

    entityResults.push({
      entity_id: entityId,
      rule_set_id: ruleSetId,
      period_id: periodId,
      total_payout: entityTotal,
      components: componentResults,
      metrics: allEntityMetrics,
      attainment: { overall: allEntityMetrics['attainment'] ?? 0 },
      metadata: {
        entityName: entityInfo?.display_name ?? entityId,
        externalId: entityInfo?.external_id ?? '',
        intentTraces,
        intentTotal,
        legacyTotal,
        intentMatch: entityMatch,
        roundingTrace: {
          rawTotal: entityRoundingTraces.reduce((s, t) => s + t.rawValue, 0),
          roundedTotal: entityTotal,
          totalRoundingAdjustment: entityRoundingTraces.reduce((s, t) => s + t.roundingAdjustment, 0),
          components: entityRoundingTraces,
        },
      },
    });

    // OB-81: Inline insight check at intervals during calculation
    if (entityResults.length > 0 && entityResults.length % INSIGHT_CHECKPOINT_INTERVAL === 0) {
      try {
        const inlineInsights = checkInlineInsights(surface, DEFAULT_INSIGHT_CONFIG, entityResults.length);
        if (inlineInsights.length > 0) {
          allInlineInsights.push(...inlineInsights);
        }
      } catch {
        // Never block calculation for insight failure
      }
    }

    // Only log first 20 and last 5 entities to avoid log flooding at scale
    if (entityResults.length <= 20 || entityResults.length > calculationEntityIds.length - 5) {
      const matchLabel = entityMatch ? '✓' : '✗';
      addLog(`  ${entityInfo?.display_name ?? entityId}: ${entityTotal.toLocaleString()} | intent=${intentTotal.toLocaleString()} ${matchLabel}`);
    } else if (entityResults.length === 21) {
      addLog(`  ... (${calculationEntityIds.length - 25} more entities) ...`);
    }

    // ═══════════════════════════════════════════════════════════════
    // HF-212 TIER 2: Per-entity summary line — always emits, one per entity
    // ═══════════════════════════════════════════════════════════════
    {
      const t2ExternalId = entityInfo?.external_id ?? entityId;
      const t2EntityName = entityInfo?.display_name ?? entityId;
      const t2Breakdown = Array.from(perEntityComponentBreakdown.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([idx, val]) => `c${idx}:${val}`)
        .join(',');
      addLog(`[CalcRecon-T2] ${t2ExternalId} | ${t2EntityName} | variant=${variantKey} | total=${entityTotal} | components=[${t2Breakdown}] | flags=[${currentEntityFlags.join(',')}]`);
    }
  }

  const concordanceRate = (intentMatchCount / calculationEntityIds.length) * 100;
  addLog(`OB-76 Dual-path: ${intentMatchCount} match, ${intentMismatchCount} mismatch (${concordanceRate.toFixed(1)}% concordance)`);

  addLog(`Grand total: ${grandTotal.toLocaleString()}`);

  // OB-194: Log exclusion summary
  if (excludedEntities.length > 0) {
    addLog(`OB-194: ${entityResults.length} calculated, ${excludedEntities.length} excluded (no qualifying variant)`);
    for (const ex of excludedEntities.slice(0, 5)) {
      addLog(`  Excluded: ${ex.entityName} (${ex.externalId}) — ${ex.reason}`);
    }
    if (excludedEntities.length > 5) {
      addLog(`  ... +${excludedEntities.length - 5} more excluded`);
    }
  }

  // ── SYNAPTIC: Consolidate surface + persist density updates ──
  const { densityUpdates, signalBatch } = consolidateSurface(surface);
  const synapticEndTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const synapticMs = Math.round(synapticEndTime - synapticStartTime);

  addLog(`Synaptic: ${surface.stats.totalSynapsesWritten} synapses, ${densityUpdates.length} density updates, ${surface.stats.anomalyCount} anomalies (${synapticMs}ms)`);

  // Persist density updates (fire-and-forget)
  if (densityUpdates.length > 0) {
    persistDensityUpdates(tenantId, densityUpdates).catch(err => {
      console.warn('[CalcAPI] Density persist failed (non-blocking):', err);
    });

    // OB-81: Flywheel post-consolidation — aggregate into F2 + F3 (fire-and-forget)
    try {
      const flywheelUpdates = densityUpdates.map(d => ({
        patternSignature: d.signature,
        confidence: d.newConfidence,
        executionCount: d.totalExecutions,
        anomalyRate: d.anomalyRate,
        learnedBehaviors: {},
      }));
      postConsolidationFlywheel(tenantId, domainId, undefined, flywheelUpdates)
        .catch(err => console.warn('[CalcAPI] Flywheel aggregation error (non-blocking):', err));
      addLog(`Flywheel: ${flywheelUpdates.length} patterns queued for F2+F3 aggregation`);
    } catch (fwErr) {
      console.warn('[CalcAPI] Flywheel wiring error (non-blocking):', fwErr);
    }
  }

  // Persist training signals from consolidation (OB-199 Phase 4: canonical writer)
  if (signalBatch.length > 0) {
    for (const signal of signalBatch) {
      writeSignal({
        tenantId,
        signalType: (signal.signalType as string) ?? 'lifecycle:synaptic_consolidation',
        signalValue: (signal.signalValue as Record<string, unknown>) ?? {},
        source: 'ai_prediction',
        context: { trigger: 'synaptic_consolidation', batchId: undefined },
      }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
        if (err instanceof CanonicalWriteError) {
          console.warn(`[CalcAPI] Synaptic signal CanonicalWriteError (${err.cause}): ${err.message}`);
        } else {
          console.warn('[CalcAPI] Synaptic signal unexpected error:', err instanceof Error ? err.message : String(err));
        }
      });
    }
  }

  // ── OB-77 + OB-199 Phase 4: Training signal — dual-path concordance (canonical writer) ──
  writeSignal({
    tenantId,
    signalType: 'convergence:dual_path_concordance',
    signalValue: {
      matchCount: intentMatchCount,
      mismatchCount: intentMismatchCount,
      concordanceRate: parseFloat(concordanceRate.toFixed(2)),
      entityCount: calculationEntityIds.length,
      componentCount: defaultComponents.length,
      intentsTransformed: componentIntents.length,
      totalPayout: grandTotal,
      ruleSetId,
      periodId,
    },
    // concordanceRate is in percentage (0–100); divide for Decision 30 v2 inclusive [0, 1].
    confidence: concordanceRate / 100,
    source: 'ai_prediction',
    context: {
      ruleSetName: ruleSet.name,
      trigger: 'calculation_run',
    },
  }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
    if (err instanceof CanonicalWriteError) {
      console.warn(`[CalcAPI] Dual-path concordance signal CanonicalWriteError (${err.cause}): ${err.message}`);
    } else {
      console.warn('[CalcAPI] Dual-path concordance signal unexpected error:', err instanceof Error ? err.message : String(err));
    }
  });

  // ── 7. Write calculation_results (OB-121: DELETE before INSERT to prevent stale accumulation) ──
  const { error: cleanupErr } = await supabase
    .from('calculation_results')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('rule_set_id', ruleSetId)
    .eq('period_id', periodId);

  if (cleanupErr) {
    return NextResponse.json(
      { error: `Failed to clear existing results: ${cleanupErr.message}`, log },
      { status: 500 }
    );
  }
  addLog(`OB-121: Cleaned old calculation_results for plan=${ruleSetId} period=${periodId}`);

  const insertRows = entityResults.map(r => ({
    tenant_id: tenantId,
    batch_id: batch.id,
    entity_id: r.entity_id,
    rule_set_id: r.rule_set_id,
    period_id: r.period_id,
    total_payout: r.total_payout,
    components: r.components.map(c => ({
      componentId: c.componentId,
      componentName: c.componentName,
      componentType: c.componentType,
      payout: c.payout,
      details: c.details,
    })) as unknown as Json,
    metrics: r.metrics as unknown as Json,
    attainment: r.attainment as unknown as Json,
    metadata: r.metadata as unknown as Json,
  }));

  const WRITE_BATCH = 5000;
  for (let i = 0; i < insertRows.length; i += WRITE_BATCH) {
    const slice = insertRows.slice(i, i + WRITE_BATCH);
    const { error: writeErr } = await supabase
      .from('calculation_results')
      .insert(slice);

    if (writeErr) {
      return NextResponse.json(
        { error: `Failed to write results batch ${i / WRITE_BATCH}: ${writeErr.message}`, log },
        { status: 500 }
      );
    }
  }

  addLog(`Wrote ${insertRows.length} calculation_results (in ${Math.ceil(insertRows.length / WRITE_BATCH)} batches)`);

  // ── 8. Transition batch to PREVIEW ──
  const { error: transErr } = await supabase
    .from('calculation_batches')
    .update({
      lifecycle_state: 'PREVIEW',
      entity_count: entityResults.length,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      summary: {
        total_payout: grandTotal,
        entity_count: entityResults.length,
        excluded_count: excludedEntities.length,
        component_count: defaultComponents.length,
        rule_set_name: ruleSet.name,
        intentLayer: {
          matchCount: intentMatchCount,
          mismatchCount: intentMismatchCount,
          concordance: ((intentMatchCount / calculationEntityIds.length) * 100).toFixed(1) + '%',
          intentsTransformed: componentIntents.length,
        },
        synaptic: {
          synapsesWritten: surface.stats.totalSynapsesWritten,
          densityUpdates: densityUpdates.length,
          anomalies: surface.stats.anomalyCount,
          patternsLoaded: density.size,
          executionTimeMs: synapticMs,
          patternSignatures,
        },
      } as unknown as Json,
    })
    .eq('id', batch.id);

  if (transErr) {
    addLog(`WARNING: Failed to transition batch: ${transErr.message}`);
  } else {
    addLog(`Batch transitioned to PREVIEW`);
  }

  // ── 8b. OB-81: Fire async full analysis (does not block response) ──
  try {
    const sorted = entityResults.map(r => r.total_payout).sort((a, b) => a - b);
    const medianOutcome = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const zeroCount = entityResults.filter(r => r.total_payout === 0).length;

    const calcSummary: CalculationSummary = {
      entityCount: entityResults.length,
      componentCount: defaultComponents.length,
      totalOutcome: grandTotal,
      avgOutcome: entityResults.length > 0 ? grandTotal / entityResults.length : 0,
      medianOutcome,
      zeroOutcomeCount: zeroCount,
      concordanceRate: parseFloat(concordanceRate.toFixed(2)),
      topEntities: entityResults
        .sort((a, b) => b.total_payout - a.total_payout)
        .slice(0, 5)
        .map(r => ({ entityId: r.entity_id, outcome: r.total_payout })),
      bottomEntities: entityResults
        .sort((a, b) => a.total_payout - b.total_payout)
        .slice(0, 5)
        .map(r => ({ entityId: r.entity_id, outcome: r.total_payout })),
    };

    const analysis = generateFullAnalysis(batch.id, surface, calcSummary, DEFAULT_INSIGHT_CONFIG, allInlineInsights);

    // Store analysis in batch config (fire-and-forget)
    Promise.resolve(
      supabase
        .from('calculation_batches')
        .update({
          config: { insightAnalysis: analysis } as unknown as Json,
        })
        .eq('id', batch.id)
    ).then(() => {
      console.log('[CalcAPI] Insight analysis stored in batch config');
    }).catch((err: unknown) => console.warn('[CalcAPI] Insight analysis store failed (non-blocking):', err));

    addLog(`Insights: ${analysis.insights.length} prescriptive, ${analysis.alerts.length} alerts, ${allInlineInsights.length} inline`);
  } catch (insightErr) {
    console.warn('[CalcAPI] Full analysis failed (non-blocking):', insightErr);
    addLog('Insight analysis failed (non-blocking)');
  }

  // ── 9. Materialize entity_period_outcomes ──
  const outcomeRows = entityResults.map(r => ({
    tenant_id: tenantId,
    entity_id: r.entity_id,
    period_id: r.period_id,
    total_payout: r.total_payout,
    lowest_lifecycle_state: 'PREVIEW',
    rule_set_breakdown: [{
      rule_set_id: ruleSetId,
      total_payout: r.total_payout,
    }] as unknown as Json,
    component_breakdown: r.components.map(c => ({
      componentId: c.componentId,
      componentName: c.componentName,
      payout: c.payout,
    })) as unknown as Json,
    attainment_summary: r.attainment as unknown as Json,
    metadata: {} as unknown as Json,
  }));

  // Delete existing outcomes for this tenant+period first
  await supabase
    .from('entity_period_outcomes')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId);

  // OB-75: Batched insert for 22K+ outcomes
  let outcomeWriteErr: string | null = null;
  for (let i = 0; i < outcomeRows.length; i += WRITE_BATCH) {
    const slice = outcomeRows.slice(i, i + WRITE_BATCH);
    const { error: outErr } = await supabase
      .from('entity_period_outcomes')
      .insert(slice);

    if (outErr) {
      outcomeWriteErr = outErr.message;
      break;
    }
  }

  if (outcomeWriteErr) {
    addLog(`WARNING: Failed to materialize outcomes: ${outcomeWriteErr}`);
  } else {
    addLog(`Materialized ${outcomeRows.length} entity_period_outcomes (in ${Math.ceil(outcomeRows.length / WRITE_BATCH)} batches)`);
  }

  // ── 10. Metering ──
  const now = new Date();
  const meterPeriodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  try {
    await supabase.from('usage_metering').insert({
      tenant_id: tenantId,
      metric_name: 'calculation_run',
      metric_value: entityResults.length,
      period_key: meterPeriodKey,
      dimensions: {
        batch_id: batch.id,
        rule_set_id: ruleSetId,
        period_id: periodId,
        total_payout: grandTotal,
        component_count: defaultComponents.length,
        source: 'api_calculation_run',
      } as unknown as Json,
    });
    addLog('Metering recorded');
  } catch {
    addLog('Metering failed (non-blocking)');
  }

  // ── OB-83: Domain Agent dispatch — score result through IAP ──
  const producedLearning = densityUpdates.length > 0 || signalBatch.length > 0;
  const avgConfidence = concordanceRate / 100; // concordance rate as 0-1 confidence
  const dispatchResult = scoreCalculationResult(
    dispatchContext,
    negotiationRequest.requestId,
    null, // actual results are in the response body below
    avgConfidence,
    producedLearning
  );
  addLog(`IAP score: I=${dispatchResult.negotiation.iapScore.intelligence.toFixed(2)} A=${dispatchResult.negotiation.iapScore.acceleration.toFixed(2)} P=${dispatchResult.negotiation.iapScore.performance.toFixed(2)} composite=${dispatchResult.negotiation.iapScore.composite.toFixed(3)}`);

  // ═══════════════════════════════════════════════════════════════
  // HF-212 TIER 1 FOOTER: emits AFTER entity loop (paired with Tier 1 header at loop start)
  // ═══════════════════════════════════════════════════════════════
  // boundaryFallbackCount derived post-hoc from convergence_bindings.match_pass===3
  // (binding-level; one count per binding that used HF-199 boundary fallback).
  // Each match_pass===3 binding additionally emits a Tier 3 EXCEPTION line for inline visibility.
  let boundaryFallbackCount = 0;
  try {
    const rawBindings = ruleSet.input_bindings as Record<string, unknown> | null;
    const cb = rawBindings?.convergence_bindings as Record<string, Record<string, { match_pass?: number }>> | undefined;
    if (cb) {
      for (const compKey of Object.keys(cb)) {
        const roleMap = cb[compKey];
        for (const role of Object.keys(roleMap)) {
          if (roleMap[role]?.match_pass === 3) {
            boundaryFallbackCount++;
            // HF-212 TIER 3: emit exception detail (binding-level, no per-entity attribution)
            addLog(`[CalcRecon-T3] EXCEPTION component=${compKey} role=${role} type=boundaryFallback`);
          }
        }
      }
    }
  } catch {
    // Non-fatal — counter stays 0
  }
  const t1FooterTotalLookups = entityResults.length * (((ruleSet.components as unknown[]) ?? []).length);
  addLog(`[CalcRecon-T1] ─── Loop complete; reconciliation footer ───`);
  addLog(`[CalcRecon-T1] entitiesCalculated=${entityResults.length} grandTotal=${grandTotal}`);
  const t1SortedComponents = Array.from(componentTotals.entries()).sort((a, b) => a[0] - b[0]);
  const t1ComponentSummary = t1SortedComponents.map(([idx, info]) => `c${idx}:${info.total}`).join(' | ');
  addLog(`[CalcRecon-T1] componentTotals=[${t1ComponentSummary}]`);
  addLog(`[CalcRecon-T1] flags={diag003Fallback:${diag003FallbackCount}/${t1FooterTotalLookups} boundaryFallback:${boundaryFallbackCount} ob118MergeGuardFired:${ob118MergeGuardFiredCount}/${t1FooterTotalLookups}}`);
  const t1VariantBreakdown = Array.from(variantCounts.entries()).map(([k, v]) => `${k}:${v}`).join(' | ');
  addLog(`[CalcRecon-T1] variantDistribution={${t1VariantBreakdown}}`);
  addLog(`[CalcRecon-T1] ╔═══════════════════════════════════════════════════════════════╗`);
  addLog(`[CalcRecon-T1] ║              END RECONCILIATION FOOTER                        ║`);
  addLog(`[CalcRecon-T1] ╚═══════════════════════════════════════════════════════════════╝`);

  // ═══════════════════════════════════════════════════════════════
  // HF-211 + HF-212: FORENSIC TRACE FLUSH (Tier 4) — gated by CALC_TRACE_VERBOSE
  // ═══════════════════════════════════════════════════════════════
  if (CALC_TRACE_VERBOSE) {
    addLog(`[CalcTrace] ─── FORENSIC TRACE (capped: ${TRACE_CAP_N} entities) ───`);
    for (const line of traceBuffer) {
      addLog(line);
    }
    addLog(`[CalcTrace] ─── END FORENSIC TRACE ─── (${traceBuffer.length} lines)`);
  }

  // HF-207 §3.1: period_complete — structured summary for log-based reconciliation.
  // Emits per-entity breakdown via JSON.stringify for grep-parseability. Keys are
  // entity external IDs (e.g., BCL-5003) for direct log-to-ground-truth reconciliation.
  const perEntityTotals: Record<string, number> = {};
  for (const r of entityResults) {
    const externalId = ((r.metadata as Record<string, unknown>)?.externalId as string) || (r.entity_id as string);
    perEntityTotals[externalId] = r.total_payout;
  }
  const periodLabel = period?.canonical_key ?? 'n/a';
  addLog(
    `[CalcTrace] runCalculation:period_complete` +
    ` | period=${periodLabel}` +
    ` | tenantId=${tenantId}` +
    ` | entitiesCalculated=${entityResults.length}` +
    ` | grandTotal=${grandTotal}` +
    ` | perEntityTotals=${JSON.stringify(perEntityTotals)}`
  );

  // HF-207 §3.2: batch_complete — terminal sentinel for downstream parsers.
  // Always-emit policy (single-period-per-call architecture: periodsCalculated=1).
  // Forward-compatible if a future architectural change introduces in-handler
  // multi-period iteration: only the perPeriodGrandTotals payload changes.
  addLog(
    `[CalcTrace] runCalculation:batch_complete` +
    ` | batchId=${batch.id}` +
    ` | tenantId=${tenantId}` +
    ` | ruleSetId=${ruleSetId}` +
    ` | periodsCalculated=1` +
    ` | crossPeriodGrandTotal=${grandTotal}` +
    ` | perPeriodGrandTotals=${JSON.stringify({ [periodLabel]: grandTotal })}`
  );

  addLog(`COMPLETE: batch=${batch.id}, entities=${entityResults.length}, total=${grandTotal}`);

  return NextResponse.json({
    success: true,
    batchId: batch.id,
    entityCount: entityResults.length,
    excludedCount: excludedEntities.length,
    totalPayout: grandTotal,
    intentLayer: {
      matchCount: intentMatchCount,
      mismatchCount: intentMismatchCount,
      concordance: `${((intentMatchCount / calculationEntityIds.length) * 100).toFixed(1)}%`,
      intentsTransformed: componentIntents.length,
    },
    synaptic: {
      synapsesWritten: surface.stats.totalSynapsesWritten,
      densityUpdates: densityUpdates.length,
      anomalies: surface.stats.anomalyCount,
      patternsLoaded: density.size,
      executionTimeMs: synapticMs,
      patternSignatures,
      executionModes: patternSignatures.map(sig => ({
        signature: sig,
        mode: getExecutionMode(surface, sig),
      })),
    },
    // OB-81: Density profile and inline insights
    densityProfile: {
      patternsTracked: density.size,
      coldStart,
      flywheelPriorsLoaded: priors.foundationalPriors.size + priors.domainPriors.size,
      agentMemorySource: density.size > 0 ? 'tenant' : (priors.foundationalPriors.size > 0 ? 'flywheel' : 'fresh'),
    },
    inlineInsights: allInlineInsights,
    // OB-83: Domain Agent negotiation metadata
    negotiation: dispatchResult.negotiation,
    results: entityResults.map(r => ({
      entityId: r.entity_id,
      entityName: r.metadata.entityName as string,
      totalPayout: r.total_payout,
      components: r.components.map(c => ({
        name: c.componentName,
```

---

## E1_2_f.md

# E1.2.f — route.ts lines ��2507 (verbatim)

```typescript
        type: c.componentType,
        payout: c.payout,
      })),
    })),
    log,
  });
}
```

---

## E1_3_imports.md

# E1.3 — POST handler imports + invocation map (verbatim)

## Import statements (lines 16–64, verbatim)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  evaluateComponent,
  aggregateMetrics,
  buildMetricsForComponent,
  applyMetricDerivations,
  getExpectedMetricNames,
  type ComponentResult,
  type AIContextSheet,
  type MetricDerivationRule,
  rowMatchesFilters,
} from '@/lib/calculation/run-calculation';
import { inferSemanticType } from '@/lib/orchestration/metric-resolver';
import { transformVariant } from '@/lib/calculation/intent-transformer';
import { executeIntent, type EntityData } from '@/lib/calculation/intent-executor';
import type { ComponentIntent, RoundingTrace } from '@/lib/calculation/intent-types';
import type { PlanComponent } from '@/types/compensation-plan';
import { toNumber, roundComponentOutput, inferOutputPrecision, ZERO } from '@/lib/calculation/decimal-precision';
import type { Json } from '@/lib/supabase/database.types';
import { convergeBindings } from '@/lib/intelligence/convergence-service';
// OB-199 Phase 4: canonical writer migration.
import { writeSignal, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
// HF-196 Phase 2: calc-time entity resolution per Decision 92 + OB-182 stated intent.
// Closes Break #2 (entity binding gap) by populating committed_data.entity_id at
// calc time for any rows where the import-time path didn't already resolve.
import { resolveEntitiesAtCalcTime } from '@/lib/sci/calc-time-entity-resolution';
import { loadDensity, persistDensityUpdates } from '@/lib/calculation/synaptic-density';
import {
  createSynapticSurface,
  writeSynapse,
  getExecutionMode,
  consolidateSurface,
  initializePatternDensity,
} from '@/lib/calculation/synaptic-surface';
import { generatePatternSignature } from '@/lib/calculation/pattern-signature';
// OB-81: Agent memory, flywheel, and insight wiring
import { loadPriorsForAgent, type AgentPriors } from '@/lib/agents/agent-memory';
// OB-83: Domain Agent dispatch — wraps calculation through negotiation protocol
import { createCalculationRequest, scoreCalculationResult } from '@/lib/domain/domain-dispatcher';
import '@/lib/domain/domains/icm'; // Import ICM to trigger domain registration
import { postConsolidationFlywheel } from '@/lib/calculation/flywheel-pipeline';
import {
  checkInlineInsights,
  generateFullAnalysis,
  DEFAULT_INSIGHT_CONFIG,
  type InlineInsight,
  type CalculationSummary,
} from '@/lib/agents/insight-agent';
```

## Invoked-symbol grep — every symbol that appears as a callable in the POST body

**Command:**
```bash
awk 'NR>=66 && NR<=2507' web/src/app/api/calculation/run/route.ts | grep -oE '[a-zA-Z_][a-zA-Z0-9_]*\(' | sort -u
```

**Output (sorted unique):**
```
abs(
add(
addLog(
aggregateMetrics(
aggregateScopeRows(
applyMetricDerivations(
bufferTrace(
buildMetricsForComponent(
catch(
ceil(
checkInlineInsights(
consolidateSurface(
convergeBindings(
createCalculationRequest(
createServiceRoleClient(
createSynapticSurface(
Date(
delete(
entries(
eq(
error(
Error(
evaluateComponent(
executeIntent(
fetchSupersededBatchIds(
filter(
floor(
forEach(
from(
generateFullAnalysis(
generatePatternSignature(
get(
getExecutionMode(
getExpectedMetricNames(
getFullYear(
getMonth(
gte(
has(
import(
in(
includes(
inferOutputPrecision(
inferSemanticType(
initializePatternDensity(
insert(
is(
isArray(
isNaN(
join(
json(
keys(
limit(
loadDensity(
loadPriorsForAgent(
localeCompare(
log(
lt(
lte(
map(
Map(
max(
min(
neq(
normalize(
not(
now(
Number(
O(
order(
padStart(
parseFloat(
persistDensityUpdates(
plus(
POST(
postConsolidationFlywheel(
push(
randomUUID(
range(
readField(
reduce(
replace(
resolve(
resolveColumnFromBatch(
resolveEntitiesAtCalcTime(
resolveMetricsFromConvergenceBindings(
round(
roundComponentOutput(
rowMatchesFilters(
scoreCalculationResult(
select(
set(
Set(
shouldEmitTrace(
single(
slice(
some(
sort(
split(
startsWith(
String(
stringify(
then(
toFixed(
toISOString(
toLocaleString(
toLowerCase(
toNumber(
transformVariant(
trim(
update(
values(
variantTokenize(
warn(
writeSignal(
writeSynapse(
```

---

## E1_4_1_run-calculation.md

# E1.4.1 — `web/src/lib/calculation/run-calculation.ts` (verbatim full source)

```typescript
/**
 * Calculation Orchestrator — Supabase-Only
 *
 * Reads rule_sets, entities, committed_data from Supabase.
 * Evaluates tier_lookup, percentage, matrix_lookup, conditional_percentage.
 * Writes calculation_batches, calculation_results, entity_period_outcomes.
 * Zero localStorage.
 */

import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';
import {
  createCalculationBatch,
  writeCalculationResults,
  transitionBatchLifecycle,
} from '@/lib/supabase/calculation-service';
import type { PlanComponent } from '@/types/compensation-plan';
import {
  inferSemanticType,
  findSheetForComponent,
} from '@/lib/orchestration/metric-resolver';
import { executeOperation, type EntityData } from '@/lib/calculation/intent-executor';
import { isIntentOperation, type IntentOperation } from '@/lib/calculation/intent-types';
import { toNumber, roundComponentOutput, inferOutputPrecision } from '@/lib/calculation/decimal-precision';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface CalculationInput {
  tenantId: string;
  periodId: string;
  ruleSetId: string;
  userId: string;
}

export interface ComponentResult {
  componentId: string;
  componentName: string;
  componentType: string;
  payout: number;
  metricValues: Record<string, number>;
  details: Record<string, unknown>;
}

export interface CalculationRunResult {
  success: boolean;
  batchId: string;
  entityCount: number;
  totalPayout: number;
  error?: string;
}

// ──────────────────────────────────────────────
// OB-118: Metric Derivation — count/filter/group on loaded data
// ──────────────────────────────────────────────

/**
 * A single metric derivation rule from input_bindings.metric_derivations.
 * Domain-agnostic: field names, values, and operators come from config.
 */
export interface MetricDerivationRule {
  metric: string;          // Target metric name (from plan configuration)
  operation: 'count' | 'sum' | 'delta' | 'ratio';  // Derivation operation
  source_pattern: string;  // Regex pattern to match data_type/sheet name
  filters: Array<{
    field: string;         // Field name in row_data (discovered at runtime)
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
    value: string | number | boolean;
  }>;
  source_field?: string;   // OB-119: Field to sum (for operation='sum' or 'delta')
  // OB-128: Ratio operation — computes numerator/denominator from already-derived metrics
  numerator_metric?: string;   // metric name to use as numerator (must be derived earlier)
  denominator_metric?: string; // metric name to use as denominator (must be derived earlier)
  scale_factor?: number;       // multiply ratio result (e.g., 100 for percentage)
}

/**
 * Apply metric derivation rules to already-loaded entity data.
 * Produces numeric metrics from categorical/string data via count+filter.
 *
 * Zero hardcoded field names. Zero DB queries. Works on in-memory rows.
 * Korean Test: All field names and values come from derivation rules, not code.
 *
 * @param entitySheetData - Map<sheetName, rows> already loaded for this entity (current period)
 * @param derivations - Derivation rules from input_bindings.metric_derivations
 * @param priorPeriodData - OB-121: Optional prior period data for delta operations
 * @returns Map of derived metric name → numeric value
 */
// HF-172 + OB-186: Filter check helper — exported for use in scope aggregate pre-computation
export function rowMatchesFilters(
  rd: Record<string, unknown>,
  filters: MetricDerivationRule['filters'],
): boolean {
  if (!filters || filters.length === 0) return true;
  return filters.every(filter => {
    const fieldValue = rd[filter.field];
    switch (filter.operator) {
      case 'eq':       return fieldValue === filter.value;
      case 'neq':      return fieldValue !== filter.value;
      case 'gt':       return typeof fieldValue === 'number' && fieldValue > (filter.value as number);
      case 'gte':      return typeof fieldValue === 'number' && fieldValue >= (filter.value as number);
      case 'lt':       return typeof fieldValue === 'number' && fieldValue < (filter.value as number);
      case 'lte':      return typeof fieldValue === 'number' && fieldValue <= (filter.value as number);
      case 'contains': return typeof fieldValue === 'string' && fieldValue.includes(String(filter.value));
      default:         return false;
    }
  });
}

export function applyMetricDerivations(
  entitySheetData: Map<string, Array<{ row_data: Json }>>,
  derivations: MetricDerivationRule[],
  priorPeriodData?: Map<string, Array<{ row_data: Json }>>
): Record<string, number> {
  const derived: Record<string, number> = {};

  for (const rule of derivations) {
    // HF-172: source_pattern is provenance metadata, NOT a row filter.
    // All entity rows within the period's date range are candidates.
    // Content filtering is done by the filters array, not source_pattern.
    let matchingRows: Array<{ row_data: Json }> = [];
    for (const [, rows] of Array.from(entitySheetData.entries())) {
      matchingRows = matchingRows.concat(rows);
    }

    // OB-128: Ratio operation works on already-derived metrics, not raw rows
    if (rule.operation === 'ratio') {
      const num = derived[rule.numerator_metric || ''] ?? 0;
      const den = derived[rule.denominator_metric || ''] ?? 0;
      derived[rule.metric] = den !== 0 ? (num / den) * (rule.scale_factor ?? 1) : 0;
      continue;
    }

    if (matchingRows.length === 0) continue;

    // Apply derivation operation
    if (rule.operation === 'sum' && rule.source_field) {
      // HF-172: Apply filters to sum (was missing — caused cross-category aggregation)
      let total = 0;
      for (const row of matchingRows) {
        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown>
          : {};
        if (!rowMatchesFilters(rd, rule.filters)) continue;
        const val = rd[rule.source_field];
        if (typeof val === 'number') total += val;
      }
      derived[rule.metric] = total;
    } else if (rule.operation === 'delta' && rule.source_field) {
      // OB-121: Period-over-period delta = current_sum - prior_sum
      // HF-172: Apply filters to both current and prior period loops
      let currentTotal = 0;
      for (const row of matchingRows) {
        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown>
          : {};
        if (!rowMatchesFilters(rd, rule.filters)) continue;
        const val = rd[rule.source_field];
        if (typeof val === 'number') currentTotal += val;
      }

      let priorTotal = 0;
      if (priorPeriodData) {
        // HF-172: Include ALL prior period rows, not just source_pattern matches
        for (const [, rows] of Array.from(priorPeriodData.entries())) {
          for (const row of rows) {
            const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
              ? row.row_data as Record<string, unknown>
              : {};
            if (!rowMatchesFilters(rd, rule.filters)) continue;
            const val = rd[rule.source_field];
            if (typeof val === 'number') priorTotal += val;
          }
        }
      }

      derived[rule.metric] = currentTotal - priorTotal;
      if (!priorPeriodData) {
        console.log(`[Derivation] delta: no prior period data for "${rule.metric}" — using current value only`);
      }
    } else if (rule.operation === 'count') {
      // HF-172: Uses same rowMatchesFilters helper (was already correct, now DRY)
      let count = 0;
      for (const row of matchingRows) {
        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown>
          : {};
        if (rowMatchesFilters(rd, rule.filters)) count++;
      }
      derived[rule.metric] = count;
    }
  }

  return derived;
}

// ──────────────────────────────────────────────
// Shared Band Resolution — Half-Open Intervals [min, max)
// OB-169: Single band resolution function for all evaluators.
// Uses [min, max) for non-last bands, [min, max] for last band.
// This prevents boundary values (e.g., 80.0) from matching the
// lower band via first-match-wins with inclusive upper bounds.
// ──────────────────────────────────────────────

export function resolveBandIndex(bands: Array<{ min: number; max: number }>, value: number): number {
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    const min = Number.isFinite(band.min) ? band.min : -Infinity;
    const max = Number.isFinite(band.max) ? band.max : Infinity;
    const isLast = i === bands.length - 1;
    // G4: Half-open intervals [min, max) for step functions.
    // Last band uses [min, max] to capture the upper boundary.
    if (value >= min && (isLast ? value <= max : value < max)) {
      return i;
    }
  }
  return -1;
}

// ──────────────────────────────────────────────
// E2 STRUCTURED FAILURE (OB-196 Phase 2 / Decision 151 / T2-E25)
// ──────────────────────────────────────────────
// Legacy component evaluators (evaluateTierLookup, evaluatePercentage,
// evaluateMatrixLookup, evaluateConditionalPercentage) deleted in Phase 2.
// Calculation flows through intent-executor (Decision 151 sole authority).

export class LegacyEngineUnknownComponentTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyEngineUnknownComponentTypeError';
  }
}

export function evaluateComponent(component: PlanComponent, metrics: Record<string, number>): ComponentResult {
  let payout = 0;
  let details: Record<string, unknown> = {};

  // OB-119: Treat missing 'enabled' as true (AI-interpreted plans omit this field)
  if (component.enabled === false) {
    return {
      componentId: component.id,
      componentName: component.name,
      componentType: component.componentType,
      payout: 0,
      metricValues: metrics,
      details: { skipped: true, reason: 'component disabled' },
    };
  }

  // OB-196 Phase 2: E2 structured failure on legacy engine arms (Decision 151 / T2-E25).
  // Post-Phase-1.7, ComponentType union admits foundational identifiers only — legacy
  // strings unreachable from rule_sets. If a legacy string surfaces here, it's a Phase
  // 1.5/1.6.5/1.7 cleanup gap; throw structured error rather than silently evaluate.
  switch (component.componentType) {
    case 'bounded_lookup_1d':
    case 'bounded_lookup_2d':
    case 'scalar_multiply':
    case 'conditional_gate':
    case 'linear_function':
    case 'piecewise_linear':
    case 'scope_aggregate':
    case 'aggregate':
    case 'ratio':
    case 'constant':
    case 'weighted_blend':
    case 'temporal_window':
      // Foundational primitive — calculation flows through intent-executor below.
      break;
    default:
      throw new LegacyEngineUnknownComponentTypeError(
        `[run-calculation] Unreachable componentType reached evaluateComponent: ` +
        `"${component.componentType as string}" (componentId=${component.id}, ` +
        `componentName=${component.name}). Foundational ComponentType union admits ` +
        `only registered primitives post-Phase-1.7. A legacy identifier reaching this ` +
        `point indicates an upstream cleanup gap (Phase 1.5 / 1.6.5 / 1.7 surface ` +
        `producing legacy strings was missed).`
      );
  }

  // OB-117: calculationIntent fallback — when legacy evaluator produces $0
  // and the component has an AI-produced calculationIntent, attempt evaluation
  // via the intent executor. This handles cases where tierConfig is broken
  // (empty tiers, wrong metric) but calculationIntent has the correct structure.
  if (payout === 0 && component.calculationIntent) {
    try {
      let intentOp = component.calculationIntent as unknown as IntentOperation;

      // OB-120: Transform postProcessing.rateFromLookup into scalar_multiply wrapper.
      // AI plan interpretation generates bounded_lookup_1d + postProcessing for compound
      // operations (rate × volume), but the executor only handles nested IntentOperations.
      // Transform: bounded_lookup_1d{postProcessing:{scalar_multiply, rateFromLookup}}
      //         → scalar_multiply{input: volume, rate: bounded_lookup_1d}
      const rawIntent = intentOp as unknown as Record<string, unknown>;
      const postProc = rawIntent.postProcessing as Record<string, unknown> | undefined;
      if (intentOp.operation === 'bounded_lookup_1d' && postProc?.rateFromLookup) {
        const lookupWithoutPost = { ...rawIntent };
        delete lookupWithoutPost.postProcessing;
        intentOp = {
          operation: 'scalar_multiply',
          input: postProc.input || rawIntent.input,
          rate: lookupWithoutPost,
        } as unknown as IntentOperation;
      }

      // OB-120: Auto-detect isMarginal for bounded_lookup_1d with rate-like outputs.
      // Mirrors OB-117 rate heuristic in evaluateTierLookup: if all non-zero outputs
      // are < 1.0, they represent rates to multiply against the input value.
      if (intentOp.operation === 'bounded_lookup_1d') {
        const bl = intentOp as unknown as Record<string, unknown>;
        const outputs = bl.outputs as number[] | undefined;
        if (!bl.isMarginal && Array.isArray(outputs)) {
          const nonZero = outputs.filter(v => v !== 0);
          if (nonZero.length > 0 && nonZero.every(v => v > 0 && v < 1.0)) {
            bl.isMarginal = true;
          }
        }
      }

      if (isIntentOperation(intentOp)) {
        const entityData: EntityData = {
          entityId: '',
          metrics,
          attributes: {},
        };
        const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
        const intentPayoutDecimal = executeOperation(intentOp, entityData, inputLog, {});
        const intentPayout = toNumber(intentPayoutDecimal);
        if (intentPayout > 0) {
          payout = intentPayout;
          details = {
            ...details,
            fallbackSource: 'calculationIntent',
            intentOperation: intentOp.operation,
            intentPayout,
            intentInputs: inputLog,
          };
        }
      }
    } catch {
      // Fallback failed silently — use original $0 payout
    }
  }

  return {
    componentId: component.id,
    componentName: component.name,
    componentType: component.componentType,
    payout,
    metricValues: metrics,
    details,
  };
}

// ──────────────────────────────────────────────
// Metric Aggregation from committed_data
// ──────────────────────────────────────────────

export function aggregateMetrics(
  rows: Array<{ row_data: Json }>
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const row of rows) {
    const data = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
      ? row.row_data as Record<string, Json | undefined>
      : {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'number') {
        result[key] = (result[key] || 0) + value;
      }
    }
  }

  return result;
}

// ──────────────────────────────────────────────
// Sheet-Aware Metric Resolution
// ──────────────────────────────────────────────

/** AI context sheet info — passed from import_batches.metadata */
export interface AIContextSheet {
  sheetName: string;
  matchedComponent: string | null;
}

/**
 * Find which sheet (data_type) feeds a given plan component.
 *
 * OB-122: Uses AI Import Context + direct name matching only.
 * No hardcoded pattern tables — Korean Test compliant.
 */
export function findMatchingSheet(
  componentName: string,
  availableSheets: string[],
  aiContextSheets?: AIContextSheet[]
): string | null {
  // Use AI context (from import_batches.metadata) if available
  if (aiContextSheets && aiContextSheets.length > 0) {
    const match = findSheetForComponent(
      componentName,
      componentName, // componentId = componentName for matching
      aiContextSheets
    );
    if (match && availableSheets.includes(match)) {
      return match;
    }
  }

  // Fallback 1: try direct name matching against available sheets
  const normComponent = componentName.toLowerCase().replace(/[-\s]/g, '_');
  for (const sheet of availableSheets) {
    const normSheet = sheet.toLowerCase().replace(/[-\s]/g, '_');
    if (normSheet.includes(normComponent) || normComponent.includes(normSheet)) {
      return sheet;
    }
  }

  // OB-153: Fallback 2 — if only one sheet exists, use it
  // When there's no AI context and names don't match, a single sheet is unambiguous
  if (availableSheets.length === 1) {
    return availableSheets[0];
  }

  return null;
}

/**
 * Get all metric names a component expects from its configuration.
 * OB-121: Also extracts from calculationIntent for ratio and metric sources.
 */
/**
 * HF-196 HF-204 absorption — Phase 1G-14.
 *
 * Recursive visitor over the IntentOperation AST. Surfaces every IntentSource
 * of source ∈ {'metric', 'ratio', 'aggregate'} regardless of position in the
 * AST. Closes Adjacent-Arm Drift defect class at the metadata-extraction layer
 * per Decision 108 architectural discipline.
 *
 * Replaces position-by-position enumeration that orphaned conditional_gate's
 * condition.left/right plus several other operation variants whose metric
 * sources live outside intent.input/intent.inputs (top-level aggregate.source,
 * ratio.numerator/denominator, weighted_blend.inputs[], piecewise_linear's
 * ratioInput/baseInput, modifier positions, variant routing, nested
 * onTrue/onFalse IntentOperations, etc.).
 *
 * Future operation types added to IntentOperation are automatically covered
 * because the visitor walks the AST shape, not enumerated positions.
 */
export function getExpectedMetricNames(component: PlanComponent): string[] {
  const names = new Set<string>();
  const intent = (component as unknown as Record<string, unknown>).calculationIntent as Record<string, unknown> | undefined;
  if (!intent) return [];
  visitNode(intent, names);
  return Array.from(names);
}

function visitNode(node: unknown, names: Set<string>): void {
  if (node === null || node === undefined) return;
  if (typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const child of node) visitNode(child, names);
    return;
  }

  const obj = node as Record<string, unknown>;

  // IntentSource of source='metric' — harvest field reference.
  if (obj.source === 'metric' && obj.sourceSpec && typeof obj.sourceSpec === 'object') {
    const spec = obj.sourceSpec as Record<string, unknown>;
    if (typeof spec.field === 'string') {
      names.add(spec.field.replace(/^metric:/, ''));
    }
    return;
  }

  // IntentSource of source='ratio' — harvest both operand field names.
  if (obj.source === 'ratio' && obj.sourceSpec && typeof obj.sourceSpec === 'object') {
    const spec = obj.sourceSpec as Record<string, unknown>;
    if (typeof spec.numerator === 'string') {
      names.add(spec.numerator.replace(/^metric:/, ''));
    }
    if (typeof spec.denominator === 'string') {
      names.add(spec.denominator.replace(/^metric:/, ''));
    }
    return;
  }

  // IntentSource of source='aggregate' — harvest field (entity scope reads data.metrics).
  if (obj.source === 'aggregate' && obj.sourceSpec && typeof obj.sourceSpec === 'object') {
    const spec = obj.sourceSpec as Record<string, unknown>;
    if (typeof spec.field === 'string') {
      names.add(spec.field.replace(/^metric:/, ''));
    }
    return;
  }

  // IntentSource of other kinds (constant, entity_attribute, prior_component,
  // cross_data, scope_aggregate) do not resolve via data.metrics — skip harvest
  // but do not recurse into sourceSpec (they don't carry nested operations).
  if (typeof obj.source === 'string') {
    return;
  }

  // Generic node — could be an IntentOperation, modifier, route, or plain
  // object with nested fields. Recurse into all values.
  for (const value of Object.values(obj)) {
    visitNode(value, names);
  }
}

/**
 * Compute attainment from goal + actual if not already present.
 * Mutates the metrics object in place.
 */
function computeAttainmentFromGoal(metrics: Record<string, number>): void {
  if (metrics['goal'] && metrics['goal'] > 0) {
    const actual = metrics['amount'] ?? metrics['quantity'] ?? 0;
    const computedAttainment = actual / metrics['goal'];
    // Override if attainment is missing or looks like a monetary value (>1000)
    if (metrics['attainment'] === undefined || metrics['attainment'] > 1000) {
      metrics['attainment'] = computedAttainment;
    }
  }
}

/**
 * Build metrics for a specific component using source-aware resolution.
 *
 * OB-85-R3 Fix 3: Replaces the single-source approach with source-aware
 * metric resolution that handles BOTH entity and store data.
 *
 * 1. Match entity sheet via AI context or pattern matching
 * 2. Build store context from ALL store sheets (shared across components)
 * 3. Resolve plan metric names with source preference:
 *    - "store_"-prefixed metrics → prefer store data
 *    - Other metrics → prefer entity data
 * 4. Compute attainment per source independently (prevents contamination)
 */
export function buildMetricsForComponent(
  component: PlanComponent,
  entityRowsBySheet: Map<string, Array<{ row_data: Json }>>,
  storeDataBySheet?: Map<string, Array<{ row_data: Json }>>,
  aiContextSheets?: AIContextSheet[],
  entitySheetStoreAggregates?: Map<string, Record<string, number>>,
  metricMappings?: Record<string, string>
): Record<string, number> {
  // Step 1: Match entity-level sheet for this component
  const entitySheets = Array.from(entityRowsBySheet.keys());
  const entityMatch = findMatchingSheet(component.name, entitySheets, aiContextSheets);
  let entityRows = entityMatch ? (entityRowsBySheet.get(entityMatch) || []) : [];

  // OB-157: Semantic metric matching fallback — when name matching fails,
  // find the sheet whose data columns best overlap the component's expected metrics.
  // Korean Test: uses inferSemanticType (pattern-based), not field names.
  if (entityRows.length === 0 && entitySheets.length > 0) {
    const expectedTypes = getExpectedMetricNames(component)
      .map(n => inferSemanticType(n))
      .filter(t => t !== 'unknown');
    if (expectedTypes.length > 0) {
      let bestSheet: string | null = null;
      let bestOverlap = 0;
      for (const sheetName of entitySheets) {
        const rows = entityRowsBySheet.get(sheetName) || [];
        if (rows.length === 0) continue;
        const rd = (rows[0].row_data && typeof rows[0].row_data === 'object' && !Array.isArray(rows[0].row_data))
          ? rows[0].row_data as Record<string, unknown> : {};
        const sheetTypes = new Set(
          Object.keys(rd)
            .filter(k => !k.startsWith('_'))
            .map(k => inferSemanticType(k))
            .filter(t => t !== 'unknown')
        );
        const overlap = expectedTypes.filter(t => sheetTypes.has(t)).length;
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestSheet = sheetName;
        }
      }
      if (bestSheet) {
        entityRows = entityRowsBySheet.get(bestSheet) || [];
      }
    }
  }

  // Step 2: Match store-level sheet for this component
  let storeMatchRows: Array<{ row_data: Json }> = [];
  if (storeDataBySheet) {
    const storeSheets = Array.from(storeDataBySheet.keys());
    const storeMatch = findMatchingSheet(component.name, storeSheets, aiContextSheets);
    storeMatchRows = storeMatch ? (storeDataBySheet.get(storeMatch) || []) : [];

    // OB-157: Same semantic fallback for store data
    if (storeMatchRows.length === 0 && storeSheets.length > 0) {
      const expectedTypes = getExpectedMetricNames(component)
        .map(n => inferSemanticType(n))
        .filter(t => t !== 'unknown');
      if (expectedTypes.length > 0) {
        let bestSheet: string | null = null;
        let bestOverlap = 0;
        for (const sheetName of storeSheets) {
          const rows = storeDataBySheet.get(sheetName) || [];
          if (rows.length === 0) continue;
          const rd = (rows[0].row_data && typeof rows[0].row_data === 'object' && !Array.isArray(rows[0].row_data))
            ? rows[0].row_data as Record<string, unknown> : {};
          const sheetTypes = new Set(
            Object.keys(rd)
              .filter(k => !k.startsWith('_'))
              .map(k => inferSemanticType(k))
              .filter(t => t !== 'unknown')
          );
          const overlap = expectedTypes.filter(t => sheetTypes.has(t)).length;
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestSheet = sheetName;
          }
        }
        if (bestSheet) {
          storeMatchRows = storeDataBySheet.get(bestSheet) || [];
        }
      }
    }
  }

  // Step 3: Build per-sheet store metrics (NOT aggregated across sheets).
  // OB-85-R3R4: Aggregating all store sheets produces wrong values
  // (e.g., amount from tienda+cobranza = 99M instead of tienda-only 44M).
  const perSheetStoreMetrics = new Map<string, Record<string, number>>();
  if (storeDataBySheet && storeDataBySheet.size > 0) {
    for (const [sheetName, rows] of Array.from(storeDataBySheet.entries())) {
      const m = aggregateMetrics(rows);
      computeAttainmentFromGoal(m);
      perSheetStoreMetrics.set(sheetName, m);
    }
  }

  // If no entity match, no store match, and no per-sheet store data → no data
  if (entityRows.length === 0 && storeMatchRows.length === 0 && perSheetStoreMetrics.size === 0) {
    return {};
  }

  // Aggregate each source independently to prevent cross-source contamination
  const entityMetrics = entityRows.length > 0 ? aggregateMetrics(entityRows) : {};
  const storeMatchMetrics = storeMatchRows.length > 0 ? aggregateMetrics(storeMatchRows) : {};

  // Compute attainment per source independently
  computeAttainmentFromGoal(entityMetrics);
  computeAttainmentFromGoal(storeMatchMetrics);

  // Step 4: Resolve expected metrics with source preference
  const resolvedMetrics: Record<string, number> = {};
  const expectedNames = getExpectedMetricNames(component);

  for (const metricName of expectedNames) {
    // Direct key match first (exact field name in data)
    if (entityMetrics[metricName] !== undefined) {
      resolvedMetrics[metricName] = entityMetrics[metricName];
      continue;
    }
    if (storeMatchMetrics[metricName] !== undefined) {
      resolvedMetrics[metricName] = storeMatchMetrics[metricName];
      continue;
    }
    // Check each store sheet for exact key match
    let foundInStoreSheet = false;
    for (const [, sheetMetrics] of Array.from(perSheetStoreMetrics.entries())) {
      if (sheetMetrics[metricName] !== undefined) {
        resolvedMetrics[metricName] = sheetMetrics[metricName];
        foundInStoreSheet = true;
        break;
      }
    }
    if (foundInStoreSheet) continue;

    // Semantic resolution: infer what kind of value this metric name needs
    const semanticType = inferSemanticType(metricName);
    if (semanticType === 'unknown') continue;

    if (/store/i.test(metricName)) {
      // OB-122: Store metrics — semantic type resolution (no hardcoded patterns)
      // Try matched store sheet first, then iterate all store sheets by semantic type
      if (storeMatchMetrics[semanticType] !== undefined) {
        resolvedMetrics[metricName] = storeMatchMetrics[semanticType];
      } else {
        let found = false;
        // Check store-level sheets (null entity_id)
        for (const [, sheetMetrics] of Array.from(perSheetStoreMetrics.entries())) {
          if (sheetMetrics[semanticType] !== undefined) {
            resolvedMetrics[metricName] = sheetMetrics[semanticType];
            found = true;
            break;
          }
        }
        // Fallback: entity-level sheets aggregated per store
        if (!found && entitySheetStoreAggregates) {
          for (const [, sheetMetrics] of Array.from(entitySheetStoreAggregates.entries())) {
            if (sheetMetrics[semanticType] !== undefined) {
              resolvedMetrics[metricName] = sheetMetrics[semanticType];
              found = true;
              break;
            }
          }
        }
        if (!found) {
          resolvedMetrics[metricName] = entityMetrics[semanticType] ?? 0;
        }
      }
    } else {
      // Non-store metrics: entity + storeMatch ONLY (no aggregated store fallback)
      // First try literal semantic key (e.g., metrics["amount"])
      let nonStoreResolved = entityMetrics[semanticType] ?? storeMatchMetrics[semanticType];

      // OB-106: If literal key not found, search all keys by inferred semantic type.
      // This handles metric name mismatches where the rule_set uses a generic name
      // but the data has a specific enriched key — both infer to the same semantic type.
      // OB-106: semanticType is already guaranteed non-'unknown' here (filtered at line 442)
      if (nonStoreResolved === undefined) {
        for (const [key, val] of Object.entries(entityMetrics)) {
          if (inferSemanticType(key) === semanticType) {
            nonStoreResolved = val;
            break;
          }
        }
      }
      if (nonStoreResolved === undefined) {
        for (const [key, val] of Object.entries(storeMatchMetrics)) {
          if (inferSemanticType(key) === semanticType) {
            nonStoreResolved = val;
            break;
          }
        }
      }

      resolvedMetrics[metricName] = nonStoreResolved ?? 0;
    }
  }

  // Normalize attainment from decimal ratio to percentage scale.
  // Values < 10 are treated as ratios (e.g., 1.35 → 135%, 3.88 → 388%).
  // Values >= 10 are already percentages (e.g., 135.14 stays 135.14%).
  // OB-90: Skip normalization for metrics with "percent" in the name —
  // these fields (e.g., optical_achievement_percentage) are already percentages.
  for (const metricName of expectedNames) {
    const semanticType = inferSemanticType(metricName);
    if (semanticType === 'attainment' && resolvedMetrics[metricName] !== undefined) {
      if (/percent/i.test(metricName)) continue;
      const v = resolvedMetrics[metricName];
      if (v > 0 && v < 10) {
        resolvedMetrics[metricName] = v * 100;
      }
    }
  }

  // Include raw entity metrics for backward compat (allEntityMetrics usage)
  for (const [k, v] of Object.entries(entityMetrics)) {
    if (resolvedMetrics[k] === undefined) {
      resolvedMetrics[k] = v;
    }
  }

  // OB-153: Apply metric_mappings from input_bindings (HIGHEST PRIORITY)
  // Maps semantic metric names (used by components) to raw field names (in row_data).
  // These override semantic resolution because the mappings are explicit configuration.
  // Uses FIRST-VALUE extraction (not sum) to handle duplicate rows correctly.
  if (metricMappings) {
    // Build first-value pool: scan ALL entity + store rows for field values
    const firstValues: Record<string, number> = {};
    for (const [, rows] of Array.from(entityRowsBySheet.entries())) {
      for (const row of rows) {
        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown> : {};
        for (const [k, v] of Object.entries(rd)) {
          if (typeof v === 'number' && firstValues[k] === undefined) {
            firstValues[k] = v;
          }
        }
      }
    }
    // Also scan store data
    for (const [, sheetMetrics] of Array.from(perSheetStoreMetrics.entries())) {
      for (const [k, v] of Object.entries(sheetMetrics)) {
        if (firstValues[k] === undefined) firstValues[k] = v;
      }
    }
    for (const [metricName, fieldName] of Object.entries(metricMappings)) {
      if (firstValues[fieldName] !== undefined) {
        resolvedMetrics[metricName] = firstValues[fieldName];
      } else {
        // If mapped field doesn't exist in entity data, zero it out.
        // Prevents semantic fallback from resolving to unrelated fields.
        resolvedMetrics[metricName] = 0;
      }
    }
  }

  return resolvedMetrics;
}

// ──────────────────────────────────────────────
// Main Orchestrator
// ──────────────────────────────────────────────

export async function runCalculation(input: CalculationInput): Promise<CalculationRunResult> {
  const { tenantId, periodId, ruleSetId, userId } = input;
  const supabase = createClient();

  console.log(`[RunCalculation] Starting: tenant=${tenantId}, period=${periodId}, ruleSet=${ruleSetId}`);

  // HF-196 Phase 1E: fetch superseded import_batch ids once; engine queries below
  // exclude these ids via NOT IN — operative-batch-only data per Rule 30.
  const { fetchSupersededBatchIds } = await import('@/lib/sci/import-batch-supersession');
  const supersededIds = await fetchSupersededBatchIds(supabase, tenantId);
  if (supersededIds.length > 0) {
    console.log(`[RunCalculation] Phase 1E: ${supersededIds.length} superseded batches excluded from engine reads`);
  }

  // ── 1. Fetch rule set ──
  const { data: ruleSet, error: rsErr } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings, population_config, metadata')
    .eq('id', ruleSetId)
    .single();

  if (rsErr || !ruleSet) {
    return { success: false, batchId: '', entityCount: 0, totalPayout: 0, error: `Rule set not found: ${rsErr?.message}` };
  }

  // Parse components from JSONB — handle 3 formats:
  // 1. Flat array: [{id, name, ...}, ...]
  // 2. Wrapped object: { components: [{id, name, ...}, ...] }
  // 3. Legacy nested: { variants: [{ components: [...] }] }
  const rawComponents = ruleSet.components;
  let defaultComponents: PlanComponent[];
  let variants: Array<Record<string, unknown>> = [];
  if (Array.isArray(rawComponents)) {
    defaultComponents = rawComponents as unknown as PlanComponent[];
  } else {
    const componentsJson = rawComponents as Record<string, unknown>;
    if (Array.isArray(componentsJson?.components)) {
      // OB-153: Wrapped object format { components: [...] }
      defaultComponents = componentsJson.components as unknown as PlanComponent[];
    } else {
      // Legacy nested format: { variants: [{ components: [...] }] }
      variants = (componentsJson?.variants as Array<Record<string, unknown>>) ?? [];
      defaultComponents = (variants[0]?.components as PlanComponent[]) ?? [];
    }
  }

  if (defaultComponents.length === 0) {
    return { success: false, batchId: '', entityCount: 0, totalPayout: 0, error: 'Rule set has no components' };
  }

  console.log(`[RunCalculation] Rule set "${ruleSet.name}" has ${defaultComponents.length} components`);

  // ── OB-118: Parse metric derivation rules from input_bindings ──
  const inputBindings = ruleSet.input_bindings as Record<string, unknown> | null;
  const metricDerivations: MetricDerivationRule[] =
    (inputBindings?.metric_derivations as MetricDerivationRule[] | undefined) ?? [];

  // ── 2. Fetch entities with assignments (OB-75: paginated) ──
  const PAGE_SIZE = 1000; // Supabase project max_rows = 1000
  const assignments: Array<{ entity_id: string }> = [];
  let assignPage = 0;
  while (true) {
    const from = assignPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data: page, error: aErr } = await supabase
      .from('rule_set_assignments')
      .select('entity_id')
      .eq('tenant_id', tenantId)
      .eq('rule_set_id', ruleSetId)
      .range(from, to);

    if (aErr) {
      return { success: false, batchId: '', entityCount: 0, totalPayout: 0, error: `Failed to fetch assignments: ${aErr.message}` };
    }
    if (!page || page.length === 0) break;
    assignments.push(...page);
    if (page.length < PAGE_SIZE) break;
    assignPage++;
  }

  // HF-078: Deduplicate entity IDs to prevent UNIQUE constraint violations
  const entityIds = Array.from(new Set(assignments.map(a => a.entity_id)));
  if (entityIds.length === 0) {
    return { success: false, batchId: '', entityCount: 0, totalPayout: 0, error: 'No entities assigned to this rule set' };
  }

  // Fetch entity display info (OB-75: batched .in() for 22K+ entities)
  const entities: Array<{ id: string; external_id: string | null; display_name: string }> = [];
  const ENTITY_BATCH = 200; // OB-85-R3: 1000 UUIDs × 37 chars exceeds Supabase URL limit
  for (let i = 0; i < entityIds.length; i += ENTITY_BATCH) {
    const idBatch = entityIds.slice(i, i + ENTITY_BATCH);
    const { data: page } = await supabase
      .from('entities')
      .select('id, external_id, display_name')
      .in('id', idBatch);
    if (page) entities.push(...page);
  }

  const entityMap = new Map(entities.map(e => [e.id, e]));

  // ── 3. Fetch period info (OB-152: include end_date for source_date hybrid) ──
  const { data: period } = await supabase
    .from('periods')
    .select('id, canonical_key, start_date, end_date')
    .eq('id', periodId)
    .single();

  if (!period) {
    return { success: false, batchId: '', entityCount: 0, totalPayout: 0, error: 'Period not found' };
  }

  // ── 3b. OB-121: Find prior period (for delta derivations) ──
  const hasDeltaDerivations = metricDerivations.some(d => d.operation === 'delta');
  let priorPeriodId: string | null = null;
  if (hasDeltaDerivations && period.start_date) {
    const { data: priorPeriod } = await supabase
      .from('periods')
      .select('id')
      .eq('tenant_id', tenantId)
      .lt('start_date', period.start_date)
      .order('start_date', { ascending: false })
      .limit(1)
      .single();
    priorPeriodId = priorPeriod?.id ?? null;
    console.log(`[RunCalculation] Prior period for delta: ${priorPeriodId ?? 'none (first period)'}`);
  }

  // ── 4. Fetch committed data (OB-152: hybrid — source_date primary, period_id fallback) ──
  const committedData: Array<{ entity_id: string | null; data_type: string; row_data: Json }> = [];

  // OB-152: Try source_date range first (new imports), fall back to period_id (LAB/legacy)
  let usedSourceDate = false;
  if (period.start_date && period.end_date) {
    let sdPage = 0;
    while (true) {
      const from = sdPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      // HF-196 Phase 1E: filter out superseded batches per Rule 30.
      let q = supabase
        .from('committed_data')
        .select('entity_id, data_type, row_data')
        .eq('tenant_id', tenantId)
        .not('source_date', 'is', null)
        .gte('source_date', period.start_date)
        .lte('source_date', period.end_date)
        .range(from, to);
      if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
      const { data: page } = await q;

      if (!page || page.length === 0) break;
      committedData.push(...page);
      if (page.length < PAGE_SIZE) break;
      sdPage++;
    }
    if (committedData.length > 0) {
      usedSourceDate = true;
      console.log(`[RunCalculation] OB-152 source_date path: ${committedData.length} rows`);
    }
  }

  // Fallback: period_id (LAB/legacy data)
  if (!usedSourceDate) {
    let dataPage = 0;
    while (true) {
      const from = dataPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      // HF-196 Phase 1E: filter out superseded batches per Rule 30.
      let q = supabase
        .from('committed_data')
        .select('entity_id, data_type, row_data')
        .eq('tenant_id', tenantId)
        .eq('period_id', periodId)
        .range(from, to);
      if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
      const { data: page } = await q;

      if (!page || page.length === 0) break;
      committedData.push(...page);
      if (page.length < PAGE_SIZE) break;
      dataPage++;
    }
    console.log(`[RunCalculation] OB-152 period_id fallback: ${committedData.length} rows`);
  }

  // Group entity-level data by entity_id → data_type → rows
  const dataByEntity = new Map<string, Map<string, Array<{ row_data: Json }>>>();
  const flatDataByEntity = new Map<string, Array<{ row_data: Json }>>();

  // Store-level data (NULL entity_id) grouped by storeId → data_type → rows
  const storeData = new Map<string | number, Map<string, Array<{ row_data: Json }>>>();

  for (const row of committedData) {
    if (row.entity_id) {
      if (!dataByEntity.has(row.entity_id)) {
        dataByEntity.set(row.entity_id, new Map());
      }
      const entitySheets = dataByEntity.get(row.entity_id)!;
      const sheetName = row.data_type || '_unknown';
      if (!entitySheets.has(sheetName)) {
        entitySheets.set(sheetName, []);
      }
      entitySheets.get(sheetName)!.push({ row_data: row.row_data });

      if (!flatDataByEntity.has(row.entity_id)) {
        flatDataByEntity.set(row.entity_id, []);
      }
      flatDataByEntity.get(row.entity_id)!.push({ row_data: row.row_data });
    } else {
      const rd = row.row_data as Record<string, unknown> | null;
      const storeKey = (rd?.['storeId'] ?? rd?.['num_tienda'] ?? rd?.['No_Tienda'] ?? rd?.['Tienda']) as string | number | undefined;
      if (storeKey !== undefined) {
        if (!storeData.has(storeKey)) {
          storeData.set(storeKey, new Map());
        }
        const storeSheets = storeData.get(storeKey)!;
        const sheetName = row.data_type || '_unknown';
        if (!storeSheets.has(sheetName)) {
          storeSheets.set(sheetName, []);
        }
        storeSheets.get(sheetName)!.push({ row_data: row.row_data });
      }
    }
  }

  console.log(`[RunCalculation] ${entityIds.length} entities, ${committedData.length} data rows (paginated fetch)`);

  // ── 4b. OB-121: Fetch prior period data (OB-152: hybrid path) ──
  const priorDataByEntity = new Map<string, Map<string, Array<{ row_data: Json }>>>();
  if (priorPeriodId) {
    // Fetch prior period dates for source_date hybrid
    const { data: priorPeriodInfo } = await supabase
      .from('periods')
      .select('start_date, end_date')
      .eq('id', priorPeriodId)
      .single();

    const priorCommittedData: Array<{ entity_id: string | null; data_type: string; row_data: Json }> = [];

    // OB-152: Try source_date first for prior period
    let priorUsedSourceDate = false;
    if (priorPeriodInfo?.start_date && priorPeriodInfo?.end_date) {
      let sdPage = 0;
      while (true) {
        const from = sdPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        // HF-196 Phase 1E: filter out superseded batches per Rule 30.
        let q = supabase
          .from('committed_data')
          .select('entity_id, data_type, row_data')
          .eq('tenant_id', tenantId)
          .not('source_date', 'is', null)
          .gte('source_date', priorPeriodInfo.start_date)
          .lte('source_date', priorPeriodInfo.end_date)
          .range(from, to);
        if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
        const { data: page } = await q;

        if (!page || page.length === 0) break;
        priorCommittedData.push(...page);
        if (page.length < PAGE_SIZE) break;
        sdPage++;
      }
      if (priorCommittedData.length > 0) priorUsedSourceDate = true;
    }

    // Fallback: period_id
    if (!priorUsedSourceDate) {
      let priorPage = 0;
      while (true) {
        const from = priorPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        // HF-196 Phase 1E: filter out superseded batches per Rule 30.
        let q = supabase
          .from('committed_data')
          .select('entity_id, data_type, row_data')
          .eq('tenant_id', tenantId)
          .eq('period_id', priorPeriodId)
          .range(from, to);
        if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
        const { data: page } = await q;

        if (!page || page.length === 0) break;
        priorCommittedData.push(...page);
        if (page.length < PAGE_SIZE) break;
        priorPage++;
      }
    }

    // Group by entity_id → data_type → rows (same structure as dataByEntity)
    for (const row of priorCommittedData) {
      if (row.entity_id) {
        if (!priorDataByEntity.has(row.entity_id)) {
          priorDataByEntity.set(row.entity_id, new Map());
        }
        const entitySheets = priorDataByEntity.get(row.entity_id)!;
        const sheetName = row.data_type || '_unknown';
        if (!entitySheets.has(sheetName)) {
          entitySheets.set(sheetName, []);
        }
        entitySheets.get(sheetName)!.push({ row_data: row.row_data });
      }
    }

    console.log(`[RunCalculation] Prior period data: ${priorCommittedData.length} rows for ${priorDataByEntity.size} entities`);
  }

  // ── OB-85-R3 Fix 1: Entity data consolidation ──
  // Match by row_data.entityId (employee number), not external_id.
  const employeeToEntityIds = new Map<string, Set<string>>();
  for (const row of committedData) {
    if (!row.entity_id) continue;
    const rd = row.row_data as Record<string, unknown> | null;
    const empNum = String(rd?.['entityId'] ?? rd?.['num_empleado'] ?? '');
    if (empNum && empNum !== 'undefined' && empNum !== 'null') {
      if (!employeeToEntityIds.has(empNum)) {
        employeeToEntityIds.set(empNum, new Set());
      }
      employeeToEntityIds.get(empNum)!.add(row.entity_id);
    }
  }

  for (const [, uuidSet] of Array.from(employeeToEntityIds.entries())) {
    if (uuidSet.size <= 1) continue;

    let primaryId: string | null = null;
    for (const uuid of Array.from(uuidSet)) {
      const sheets = dataByEntity.get(uuid);
      if (sheets) {
        for (const sheetName of Array.from(sheets.keys())) {
          if (['datos colaborador', 'roster', 'employee', 'empleados'].some(r => sheetName.toLowerCase().includes(r))) {
            primaryId = uuid;
            break;
          }
        }
      }
      if (primaryId) break;
    }
    if (!primaryId) continue;

    for (const siblingId of Array.from(uuidSet)) {
      if (siblingId === primaryId) continue;
      const siblingSheetData = dataByEntity.get(siblingId);
      if (!siblingSheetData) continue;

      if (!dataByEntity.has(primaryId)) {
        dataByEntity.set(primaryId, new Map());
      }
      const primarySheets = dataByEntity.get(primaryId)!;
      for (const [sheetName, rows] of Array.from(siblingSheetData.entries())) {
        if (!primarySheets.has(sheetName)) {
          primarySheets.set(sheetName, []);
        }
        primarySheets.get(sheetName)!.push(...rows);
      }

      const siblingFlat = flatDataByEntity.get(siblingId);
      if (siblingFlat) {
        if (!flatDataByEntity.has(primaryId)) {
          flatDataByEntity.set(primaryId, []);
        }
        flatDataByEntity.get(primaryId)!.push(...siblingFlat);
      }
    }
  }

  // ── 4a. Population filter: only calculate entities on the roster ──
  // OB-147: Enhanced roster identification — three-tier detection:
  //   1. AI context: sheet classified as 'roster' or 'entity_data'
  //   2. Parent sheet heuristic: sheet whose name is a prefix of others (via __ separator)
  //   3. Keyword fallback: sheet name contains known roster terms
  const allSheetNames = new Set<string>();
  for (const [, sheetMap] of Array.from(dataByEntity.entries())) {
    for (const sheetName of Array.from(sheetMap.keys())) {
      allSheetNames.add(sheetName);
    }
  }

  let rosterSheetName: string | null = null;

  // Tier 2: Parent sheet heuristic — a sheet is a "parent" if other sheets
  // start with its name + "__". This is the import convention for multi-tab files.
  if (!rosterSheetName && allSheetNames.size > 1) {
    for (const candidate of Array.from(allSheetNames)) {
      const prefix = candidate + '__';
      const isParent = Array.from(allSheetNames).some(s => s.startsWith(prefix));
      if (isParent) {
        rosterSheetName = candidate;
        console.log(`[RunCalculation] Roster detected via parent-sheet heuristic: "${rosterSheetName}"`);
        break;
      }
    }
  }

  // Tier 3: Keyword fallback
  if (!rosterSheetName) {
    const rosterKeywords = ['datos colaborador', 'roster', 'employee', 'empleados'];
    for (const sheetName of Array.from(allSheetNames)) {
      if (rosterKeywords.some(r => sheetName.toLowerCase().includes(r))) {
        rosterSheetName = sheetName;
        console.log(`[RunCalculation] Roster detected via keyword match: "${rosterSheetName}"`);
        break;
      }
    }
  }

  // Build roster entity set from the identified roster sheet
  const rosterEntityIds = new Set<string>();
  if (rosterSheetName) {
    for (const [entityId, sheetMap] of Array.from(dataByEntity.entries())) {
      if (sheetMap.has(rosterSheetName)) {
        rosterEntityIds.add(entityId);
      }
    }
  }

  let calculationEntityIds = entityIds;
  if (rosterEntityIds.size > 0) {
    calculationEntityIds = entityIds.filter(id => rosterEntityIds.has(id));
    console.log(`[RunCalculation] Population filter: ${entityIds.length} total → ${calculationEntityIds.length} roster entities (sheet: "${rosterSheetName}")`);
  } else {
    console.log(`[RunCalculation] No roster sheet detected — calculating all ${entityIds.length} entities`);
  }

  // ── 4b. Fetch AI Import Context (OB-75: Korean Test) ──
  const aiContextSheets: AIContextSheet[] = [];
  try {
    // HF-196 Phase 1E: filter out superseded batches per Rule 30.
    let bq = supabase
      .from('committed_data')
      .select('import_batch_id')
      .eq('tenant_id', tenantId)
      .eq('period_id', periodId)
      .not('import_batch_id', 'is', null)
      .limit(100);
    if (supersededIds.length > 0) bq = bq.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
    const { data: batchRows } = await bq;

    const batchIds = Array.from(new Set((batchRows ?? []).map(r => r.import_batch_id).filter((id): id is string => id !== null)));

    if (batchIds.length > 0) {
      // HF-196 Phase 1E: also filter the import_batches lookup itself to operative.
      const { data: batches } = await supabase
        .from('import_batches')
        .select('id, metadata')
        .in('id', batchIds)
        .is('superseded_by', null);

      for (const b of (batches ?? [])) {
        const meta = b.metadata as Record<string, unknown> | null;
        const aiCtx = meta?.ai_context as { sheets?: AIContextSheet[] } | undefined;
        if (aiCtx?.sheets) {
          aiContextSheets.push(...aiCtx.sheets);
        }
      }
    }

    console.log(`[RunCalculation] AI context: ${aiContextSheets.length} sheet mappings`);
  } catch (aiErr) {
    console.warn('[RunCalculation] AI context fetch failed (non-blocking):', aiErr);
  }

  // ── 5. Create calculation batch ──
  const batch = await createCalculationBatch(tenantId, {
    periodId,
    ruleSetId,
    entityCount: calculationEntityIds.length,
    createdBy: userId,
  });

  // ── 6. Evaluate each entity ──
  const entityResults: Array<{
    entityId: string;
    ruleSetId: string;
    periodId: string;
    totalPayout: number;
    components: Json;
    metrics: Json;
    attainment: Json;
    metadata: Json;
  }> = [];

  let grandTotal = 0;

  for (const entityId of calculationEntityIds) {
    const entityInfo = entityMap.get(entityId);
    const entitySheetData = dataByEntity.get(entityId) || new Map();
    const entityRowsFlat = flatDataByEntity.get(entityId) || [];

    // Find this entity's store ID and role (use FIRST occurrence, not sum)
    const allEntityMetrics = aggregateMetrics(entityRowsFlat);
    let entityStoreId: string | number | undefined;
    let entityRole: string | null = null;
    for (const row of entityRowsFlat) {
      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
        ? row.row_data as Record<string, unknown> : {};
      if (entityStoreId === undefined) {
        const sid = rd['storeId'] ?? rd['num_tienda'] ?? rd['No_Tienda'];
        if (sid !== undefined && sid !== null) {
          entityStoreId = sid as string | number;
        }
      }
      if (!entityRole) {
        const role = rd['role'] ?? rd['Puesto'] ?? rd['puesto'];
        if (typeof role === 'string' && role.length > 0) {
          entityRole = role;
        }
      }
      if (entityStoreId !== undefined && entityRole) break;
    }
    const entityStoreData = entityStoreId !== undefined ? storeData.get(entityStoreId) : undefined;

    // OB-85-R3R4 Fix 2: Select variant based on entity role
    let selectedComponents = defaultComponents;
    if (entityRole && variants.length > 1) {
      const normRole = entityRole.toLowerCase().replace(/\s+/g, ' ').trim();
      // Try exact match first (after normalization)
      for (const variant of variants) {
        const variantName = String(variant.variantName ?? variant.description ?? '');
        const normVariant = variantName.toLowerCase().replace(/\s+/g, ' ').trim();
        if (normRole === normVariant) {
          selectedComponents = (variant.components as PlanComponent[]) ?? defaultComponents;
          break;
        }
      }
      // If no exact match, try contains (longest variant name first to avoid partial matches)
      if (selectedComponents === defaultComponents) {
        const sorted = [...variants].sort((a, b) => {
          const aLen = String(a.variantName ?? '').length;
          const bLen = String(b.variantName ?? '').length;
          return bLen - aLen;
        });
        for (const variant of sorted) {
          const variantName = String(variant.variantName ?? variant.description ?? '');
          const normVariant = variantName.toLowerCase().replace(/\s+/g, ' ').trim();
          if (normRole.includes(normVariant) || normVariant.includes(normRole)) {
            selectedComponents = (variant.components as PlanComponent[]) ?? defaultComponents;
            break;
          }
        }
      }
    }

    // OB-118: Derive metrics once per entity from loaded data
    // OB-121: Pass prior period data for delta derivations
    // OB-146: Merge entity + store data for derivation so store-level metrics
    // (e.g., new_customers from clientes_nuevos, collections from cobranza)
    // can be derived. Store data has entity_id IS NULL but derivation rules
    // match by sheet name pattern, which is source-agnostic.
    const entityPriorData = priorDataByEntity.get(entityId);
    let derivationInput = entitySheetData;
    if (entityStoreData && entityStoreData.size > 0) {
      derivationInput = new Map(entitySheetData);
      for (const [sheetName, rows] of Array.from(entityStoreData.entries())) {
        if (!derivationInput.has(sheetName)) {
          derivationInput.set(sheetName, rows);
        } else {
          // OB-148: Append store rows even when entity has same sheet name.
          // Store data may have fields (e.g., Real_Venta_Tienda, Meta_Venta_Tienda)
          // not present in entity rows. The derivation sum/ratio operations
          // only aggregate fields that exist, so mixing is safe.
          derivationInput.set(sheetName, [...derivationInput.get(sheetName)!, ...rows]);
        }
      }
    }
    const derivedMetrics = metricDerivations.length > 0
      ? applyMetricDerivations(derivationInput, metricDerivations, entityPriorData)
      : {};

    // Evaluate each component with sheet-aware metrics
    const componentResults: ComponentResult[] = [];
    let entityTotal = 0;

    for (const component of selectedComponents) {
      const metrics = buildMetricsForComponent(
        component,
        entitySheetData,
        entityStoreData,
        aiContextSheets
      );
      // OB-118: Merge derived metrics
      for (const [key, value] of Object.entries(derivedMetrics)) {
        metrics[key] = value;
      }
      // OB-146: Normalize derived attainment metrics from decimal to percentage.
      // buildMetricsForComponent normalizes but the derivation override can
      // re-introduce decimal values (e.g., Cumplimiento = 1.165 → should be 116.5).
      // Apply the same heuristic: values < 10 are decimal ratios, multiply by 100.
      for (const [key, value] of Object.entries(metrics)) {
        if (inferSemanticType(key) === 'attainment' && value > 0 && value < 10) {
          metrics[key] = value * 100;
        }
      }
      const result = evaluateComponent(component, metrics);

      // HF-122: Per-component rounding (Decision 122).
      // OB-196 Phase 2: Legacy SHAPE fields removed; precision derives from foundational
      // intent only. inferOutputPrecision tolerates undefined componentConfig.
      const componentIntent = component.calculationIntent as Record<string, unknown> | undefined;
      const precision = inferOutputPrecision(componentIntent, undefined);
      const { rounded } = roundComponentOutput(result.payout, componentResults.length, component.name, precision);
      result.payout = toNumber(rounded);

      componentResults.push(result);
      entityTotal += result.payout;
    }

    grandTotal += entityTotal;

    entityResults.push({
      entityId,
      ruleSetId,
      periodId,
      totalPayout: entityTotal,
      components: componentResults.map(c => ({
        componentId: c.componentId,
        componentName: c.componentName,
        componentType: c.componentType,
        payout: c.payout,
        details: c.details,
      })) as unknown as Json,
      metrics: allEntityMetrics as unknown as Json,
      attainment: { overall: allEntityMetrics['attainment'] ?? 0 } as unknown as Json,
      metadata: {
        entityName: entityInfo?.display_name ?? entityId,
        externalId: entityInfo?.external_id ?? '',
      } as unknown as Json,
    });
  }

  console.log(`[RunCalculation] Calculated ${entityResults.length} entities, total payout: ${grandTotal}`);

  // ── 7. Write results (HF-078: DELETE before INSERT to prevent UNIQUE constraint violations) ──
  const { error: cleanupErr } = await supabase
    .from('calculation_results')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('rule_set_id', ruleSetId)
    .eq('period_id', periodId);

  if (cleanupErr) {
    console.warn(`[RunCalculation] HF-078 cleanup failed (non-blocking): ${cleanupErr.message}`);
  }

  try {
    await writeCalculationResults(tenantId, batch.id, entityResults);
  } catch (writeErr: unknown) {
    const errMsg = writeErr instanceof Error
      ? writeErr.message
      : (typeof writeErr === 'object' && writeErr !== null && 'message' in writeErr)
        ? String((writeErr as Record<string, unknown>).message)
        : JSON.stringify(writeErr);
    return {
      success: false,
      batchId: batch.id,
      entityCount: entityResults.length,
      totalPayout: grandTotal,
      error: `Failed to write results: ${errMsg}`,
    };
  }

  // ── 8. Transition to PREVIEW ──
  await transitionBatchLifecycle(tenantId, batch.id, 'PREVIEW', {
    summary: {
      total_payout: grandTotal,
      entity_count: entityResults.length,
      component_count: defaultComponents.length,
      rule_set_name: ruleSet.name,
    },
    completedAt: new Date().toISOString(),
  });

  // ── 9. Write metering event ──
  try {
    const now = new Date();
    const meterPeriodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await supabase.from('usage_metering').insert({
      tenant_id: tenantId,
      metric_name: 'calculation_run',
      metric_value: entityResults.length,
      period_key: meterPeriodKey,
      dimensions: {
        batch_id: batch.id,
        rule_set_id: ruleSetId,
        period_id: periodId,
        total_payout: grandTotal,
        component_count: defaultComponents.length,
      },
    });
  } catch (meterErr) {
    console.warn('[RunCalculation] Metering failed (non-blocking):', meterErr);
  }

  console.log(`[RunCalculation] Complete: batch=${batch.id}, entities=${entityResults.length}, total=${grandTotal}`);

  return {
    success: true,
    batchId: batch.id,
    entityCount: entityResults.length,
    totalPayout: grandTotal,
  };
}
```

---

## E1_4_10_agent-memory.md

# E1.4.10 — `web/src/lib/agents/agent-memory.ts` (verbatim full source)

```typescript
/**
 * Agent Memory — Unified Read Interface for Agent Priors
 *
 * Provides a single interface for all Foundational Agents to read
 * accumulated intelligence from three flywheel sources:
 *   - Flywheel 1 (Tenant): synaptic_density
 *   - Flywheel 2 (Foundational): foundational_patterns
 *   - Flywheel 3 (Domain): domain_patterns
 *   - Signal history: classification_signals
 *
 * Called ONCE before a pipeline run, not per-entity.
 * Results cached for the duration of the run.
 *
 * ZERO domain language. Korean Test applies.
 */

import type { PatternDensity, SynapticDensity } from '@/lib/calculation/synaptic-types';

// ──────────────────────────────────────────────
// Agent Types
// ──────────────────────────────────────────────

export type AgentType =
  | 'ingestion'
  | 'interpretation'
  | 'calculation'
  | 'reconciliation'
  | 'insight'
  | 'resolution';

// ──────────────────────────────────────────────
// Prior Types
// ──────────────────────────────────────────────

export interface AgentPriors {
  /** Flywheel 1: tenant-specific density */
  tenantDensity: SynapticDensity;

  /** Flywheel 2: cross-tenant structural priors */
  foundationalPriors: Map<string, { confidence: number; learnedBehaviors: Record<string, unknown> }>;

  /** Flywheel 3: domain + vertical priors */
  domainPriors: Map<string, { confidence: number; learnedBehaviors: Record<string, unknown> }>;

  /** Aggregated signal history from classification_signals */
  signalHistory: SignalSummary;
}

export interface SignalSummary {
  fieldMappingSignals: Array<{
    sourceColumn: string;
    mappedField: string;
    confidence: number;
    occurrences: number;
  }>;
  interpretationSignals: Array<{
    componentPattern: string;
    confidence: number;
    occurrences: number;
  }>;
  reconciliationSignals: Array<{
    discrepancyClass: string;
    count: number;
    lastSeen: string;
  }>;
  resolutionSignals: Array<{
    rootCause: string;
    count: number;
    lastSeen: string;
  }>;
}

// ──────────────────────────────────────────────
// Client Resolution
// ──────────────────────────────────────────────

async function getClient() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('[AgentMemory] Missing Supabase env vars');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ──────────────────────────────────────────────
// Load Priors
// ──────────────────────────────────────────────

/**
 * Load priors scoped to what an agent needs.
 * Called ONCE before a pipeline run, not per-entity.
 *
 * Each agent type reads the same interface but emphasizes different data:
 * - calculation: primarily tenantDensity
 * - ingestion: primarily fieldMappingSignals
 * - interpretation: primarily interpretationSignals + componentPattern density
 * - reconciliation: primarily reconciliationSignals + correction density
 * - insight: primarily all (broadest consumer)
 * - resolution: primarily resolutionSignals + correction density
 */
export async function loadPriorsForAgent(
  tenantId: string,
  domainId: string,
  _agentType: AgentType,
  verticalHint?: string
): Promise<AgentPriors> {
  const priors: AgentPriors = {
    tenantDensity: new Map(),
    foundationalPriors: new Map(),
    domainPriors: new Map(),
    signalHistory: {
      fieldMappingSignals: [],
      interpretationSignals: [],
      reconciliationSignals: [],
      resolutionSignals: [],
    },
  };

  try {
    const supabase = await getClient();

    // 1. Load tenant density from synaptic_density (Flywheel 1)
    const { data: densityRows } = await supabase
      .from('synaptic_density')
      .select('*')
      .eq('tenant_id', tenantId);

    for (const row of (densityRows ?? []) as Array<Record<string, unknown>>) {
      const sig = row.signature as string;
      priors.tenantDensity.set(sig, {
        signature: sig,
        confidence: (row.confidence as number) ?? 0.5,
        totalExecutions: (row.total_executions as number) ?? 0,
        lastAnomalyRate: (row.last_anomaly_rate as number) ?? 0,
        lastCorrectionCount: (row.last_correction_count as number) ?? 0,
        executionMode: ((row.execution_mode as string) ?? 'full_trace') as PatternDensity['executionMode'],
        learnedBehaviors: (typeof row.learned_behaviors === 'object' && row.learned_behaviors !== null)
          ? row.learned_behaviors as Record<string, unknown>
          : {},
      });
    }

    // 2. Load foundational priors (Flywheel 2)
    const { data: foundationalRows } = await supabase
      .from('foundational_patterns')
      .select('pattern_signature, confidence_mean, learned_behaviors');

    for (const row of (foundationalRows ?? []) as Array<Record<string, unknown>>) {
      priors.foundationalPriors.set(row.pattern_signature as string, {
        confidence: (row.confidence_mean as number) ?? 0.5,
        learnedBehaviors: (typeof row.learned_behaviors === 'object' && row.learned_behaviors !== null)
          ? row.learned_behaviors as Record<string, unknown>
          : {},
      });
    }

    // 3. Load domain priors (Flywheel 3)
    let domainQuery = supabase
      .from('domain_patterns')
      .select('pattern_signature, confidence_mean, learned_behaviors')
      .eq('domain_id', domainId);

    if (verticalHint) {
      domainQuery = domainQuery.eq('vertical_hint', verticalHint);
    }

    const { data: domainRows } = await domainQuery;

    for (const row of (domainRows ?? []) as Array<Record<string, unknown>>) {
      priors.domainPriors.set(row.pattern_signature as string, {
        confidence: (row.confidence_mean as number) ?? 0.5,
        learnedBehaviors: (typeof row.learned_behaviors === 'object' && row.learned_behaviors !== null)
          ? row.learned_behaviors as Record<string, unknown>
          : {},
      });
    }

    // 4. Load signal summary from classification_signals (aggregated)
    const { data: signalRows } = await supabase
      .from('classification_signals')
      .select('signal_type, signal_value, confidence, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500);

    priors.signalHistory = aggregateSignals(signalRows ?? []);
  } catch (err) {
    console.error('[AgentMemory] loadPriorsForAgent error:', err);
  }

  return priors;
}

// ──────────────────────────────────────────────
// Signal Aggregation (internal)
// ──────────────────────────────────────────────

function aggregateSignals(rows: Array<Record<string, unknown>>): SignalSummary {
  const fieldMappingMap = new Map<string, { mappedField: string; confidence: number; occurrences: number }>();
  const interpretationMap = new Map<string, { confidence: number; occurrences: number }>();
  const reconciliationMap = new Map<string, { count: number; lastSeen: string }>();
  const resolutionMap = new Map<string, { count: number; lastSeen: string }>();

  for (const row of rows) {
    const signalType = row.signal_type as string;
    const signalValue = row.signal_value as Record<string, unknown> | null;
    const confidence = (row.confidence as number) ?? 0;
    const createdAt = (row.created_at as string) ?? '';

    if (!signalValue) continue;

    if (signalType?.includes('field_mapping')) {
      const col = (signalValue.sourceColumn as string) ?? '';
      const field = (signalValue.mappedField as string) ?? '';
      const existing = fieldMappingMap.get(col);
      if (existing) {
        existing.occurrences++;
        existing.confidence = Math.max(existing.confidence, confidence);
      } else {
        fieldMappingMap.set(col, { mappedField: field, confidence, occurrences: 1 });
      }
    } else if (signalType?.includes('interpretation') || signalType?.includes('dual_path')) {
      const pattern = (signalValue.componentPattern as string) ?? (signalValue.signature as string) ?? '';
      if (pattern) {
        const existing = interpretationMap.get(pattern);
        if (existing) {
          existing.occurrences++;
          existing.confidence = Math.max(existing.confidence, confidence);
        } else {
          interpretationMap.set(pattern, { confidence, occurrences: 1 });
        }
      }
    } else if (signalType?.includes('reconciliation')) {
      const cls = (signalValue.discrepancyClass as string) ?? '';
      const existing = reconciliationMap.get(cls);
      if (existing) {
        existing.count++;
      } else {
        reconciliationMap.set(cls, { count: 1, lastSeen: createdAt });
      }
    } else if (signalType?.includes('resolution')) {
      const cause = (signalValue.rootCause as string) ?? '';
      const existing = resolutionMap.get(cause);
      if (existing) {
        existing.count++;
      } else {
        resolutionMap.set(cause, { count: 1, lastSeen: createdAt });
      }
    }
  }

  return {
    fieldMappingSignals: Array.from(fieldMappingMap.entries()).map(([col, data]) => ({
      sourceColumn: col,
      ...data,
    })),
    interpretationSignals: Array.from(interpretationMap.entries()).map(([pattern, data]) => ({
      componentPattern: pattern,
      ...data,
    })),
    reconciliationSignals: Array.from(reconciliationMap.entries()).map(([cls, data]) => ({
      discrepancyClass: cls,
      ...data,
    })),
    resolutionSignals: Array.from(resolutionMap.entries()).map(([cause, data]) => ({
      rootCause: cause,
      ...data,
    })),
  };
}

// ──────────────────────────────────────────────
// Empty Priors (for unit tests / cold start)
// ──────────────────────────────────────────────

export function emptyPriors(): AgentPriors {
  return {
    tenantDensity: new Map(),
    foundationalPriors: new Map(),
    domainPriors: new Map(),
    signalHistory: {
      fieldMappingSignals: [],
      interpretationSignals: [],
      reconciliationSignals: [],
      resolutionSignals: [],
    },
  };
}
```

---

## E1_4_11_domain-dispatcher.md

# E1.4.11 — `web/src/lib/domain/domain-dispatcher.ts` (verbatim full source)

```typescript
/**
 * Domain Dispatcher — routes work through the Domain Agent layer
 *
 * Wraps calculation dispatch through the registered Domain Agent.
 * Creates NegotiationRequest at entry, scores with IAP at exit.
 * The foundational pipeline itself is UNCHANGED — this is an additive wrapper.
 *
 * ZERO domain language. Korean Test applies.
 * Domain words come from the DomainRegistration at runtime, not from this file.
 */

import { getDomain, type DomainRegistration } from './domain-registry';
import {
  scoreIAP,
  type NegotiationRequest,
  type NegotiationResponse,
  type IAPWeights,
  type IAPScore,
} from './negotiation-protocol';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface DispatchContext {
  tenantId: string;
  domainId: string;
  verticalHint?: string;
  iapWeights?: IAPWeights;
}

export interface CalculationDispatchResult {
  /** The actual calculation results (unchanged from current pipeline) */
  results: unknown;

  /** Negotiation metadata added by the Domain Agent layer */
  negotiation: {
    requestId: string;
    domainId: string;
    domainVersion: string;
    iapScore: IAPScore;
    terminology: Record<string, string>;
  };
}

// ──────────────────────────────────────────────
// Dispatch Entry — Create NegotiationRequest
// ──────────────────────────────────────────────

export function createCalculationRequest(
  context: DispatchContext,
  batchId: string,
  periodId: string
): NegotiationRequest {
  const domain = getDomain(context.domainId);

  if (!domain) {
    // Fallback: no domain agent registered, proceed without negotiation metadata
    return {
      requestId: batchId,
      domainId: context.domainId,
      requestType: 'calculate_outcomes',
      payload: { batchId, periodId, tenantId: context.tenantId },
      urgency: 'immediate',
    };
  }

  return {
    requestId: batchId,
    domainId: domain.domainId,
    requestType: 'calculate_outcomes',
    payload: {
      batchId,
      periodId,
      tenantId: context.tenantId,
      interpretationContext: domain.interpretationContext,
      requiredPrimitives: domain.requiredPrimitives,
      verticalHints: domain.verticalHints,
    },
    iapPreference: context.iapWeights,
    urgency: 'immediate',
  };
}

// ──────────────────────────────────────────────
// Dispatch Exit — Score result through IAP
// ──────────────────────────────────────────────

export function scoreCalculationResult(
  context: DispatchContext,
  requestId: string,
  results: unknown,
  confidence: number,
  producedLearning: boolean
): CalculationDispatchResult {
  const domain = getDomain(context.domainId);

  const iapScore = scoreIAP(
    {
      producesLearning: producedLearning,
      automatesStep: true, // calculation is always automated
      confidence,
    },
    context.iapWeights
  );

  return {
    results,
    negotiation: {
      requestId,
      domainId: context.domainId,
      domainVersion: domain?.version || 'unknown',
      iapScore,
      terminology: domain ? buildTerminologyMap(domain) : {},
    },
  };
}

// ──────────────────────────────────────────────
// Build a NegotiationResponse for audit / signal capture
// ──────────────────────────────────────────────

export function buildNegotiationResponse(
  requestId: string,
  confidence: number,
  iapScore: IAPScore,
  trainingSignal?: Record<string, unknown>
): NegotiationResponse {
  return {
    requestId,
    status: 'completed',
    result: null, // actual results are in CalculationDispatchResult.results
    confidence,
    iapScore,
    trainingSignal,
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function buildTerminologyMap(domain: DomainRegistration): Record<string, string> {
  return {
    entity: domain.terminology.entity,
    entityGroup: domain.terminology.entityGroup,
    outcome: domain.terminology.outcome,
    outcomeVerb: domain.terminology.outcomeVerb,
    ruleset: domain.terminology.ruleset,
    period: domain.terminology.period,
    performance: domain.terminology.performance,
    target: domain.terminology.target,
  };
}
```

---

## E1_4_12_flywheel-pipeline.md

# E1.4.12 — `web/src/lib/calculation/flywheel-pipeline.ts` (verbatim full source)

```typescript
/**
 * Flywheel Pipeline — Three-scope learning infrastructure
 *
 * Flywheel 1 (Tenant): synaptic_density — already exists (OB-78)
 * Flywheel 2 (Foundational): foundational_patterns — cross-tenant structural aggregation
 * Flywheel 3 (Domain): domain_patterns — vertical expertise accumulation
 *
 * PRIVACY FIREWALL:
 * - No tenant_id stored in cross-tenant tables
 * - No entity data crosses the boundary
 * - Only: pattern_signature, confidence, execution count, anomaly rate, structural behaviors
 *
 * ZERO domain language. Korean Test applies.
 */

import type { PatternDensity } from './synaptic-types';

// ──────────────────────────────────────────────
// Input Types
// ──────────────────────────────────────────────

export interface FlywheelAggregationInput {
  tenantId: string;
  domainId: string;
  verticalHint?: string;
  densityUpdates: Array<{
    patternSignature: string;
    confidence: number;
    executionCount: number;
    anomalyRate: number;
    learnedBehaviors: Record<string, unknown>;
  }>;
}

// ──────────────────────────────────────────────
// Row Shapes (from Supabase tables)
// ──────────────────────────────────────────────

interface FoundationalPatternRow {
  id: string;
  pattern_signature: string;
  confidence_mean: number;
  confidence_variance: number;
  total_executions: number;
  tenant_count: number;
  anomaly_rate_mean: number;
  learned_behaviors: Record<string, unknown> | null;
}

interface DomainPatternRow {
  id: string;
  pattern_signature: string;
  domain_id: string;
  vertical_hint: string | null;
  confidence_mean: number;
  total_executions: number;
  tenant_count: number;
  learned_behaviors: Record<string, unknown> | null;
}

// ──────────────────────────────────────────────
// Client Resolution
// ──────────────────────────────────────────────

async function getClient() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('[FlywheelPipeline] Missing Supabase env vars');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ──────────────────────────────────────────────
// EMA Helper — Exponential Moving Average
// ──────────────────────────────────────────────

function ema(existing: number, newValue: number, weight: number = 0.1): number {
  return existing * (1 - weight) + newValue * weight;
}

// ──────────────────────────────────────────────
// Flywheel 2: Foundational Aggregation
// ──────────────────────────────────────────────

/**
 * Aggregate density updates into foundational_patterns.
 * PRIVACY: tenantId is used ONLY for tenant_count tracking.
 * It is NOT stored in the foundational_patterns row.
 */
export async function aggregateFoundational(input: FlywheelAggregationInput): Promise<void> {
  if (input.densityUpdates.length === 0) return;

  try {
    const supabase = await getClient();

    for (const update of input.densityUpdates) {
      // Read existing
      const { data: existing } = await supabase
        .from('foundational_patterns')
        .select('*')
        .eq('pattern_signature', update.patternSignature)
        .maybeSingle();

      const row = existing as FoundationalPatternRow | null;

      if (row) {
        // Update with EMA
        const newConfidence = ema(row.confidence_mean, update.confidence);
        const newAnomalyRate = ema(row.anomaly_rate_mean, update.anomalyRate);

        await supabase
          .from('foundational_patterns')
          .update({
            confidence_mean: newConfidence,
            anomaly_rate_mean: newAnomalyRate,
            total_executions: row.total_executions + update.executionCount,
            tenant_count: row.tenant_count + 1, // simplified — see note below
            updated_at: new Date().toISOString(),
          })
          .eq('pattern_signature', update.patternSignature);
      } else {
        // Insert new
        await supabase
          .from('foundational_patterns')
          .insert({
            pattern_signature: update.patternSignature,
            confidence_mean: update.confidence,
            total_executions: update.executionCount,
            tenant_count: 1,
            anomaly_rate_mean: update.anomalyRate,
            learned_behaviors: update.learnedBehaviors,
          });
      }
    }
  } catch (err) {
    console.error('[FlywheelPipeline] aggregateFoundational error:', err);
  }
}

// ──────────────────────────────────────────────
// Flywheel 3: Domain Aggregation
// ──────────────────────────────────────────────

/**
 * Aggregate density updates into domain_patterns.
 * Tagged by domain_id + vertical_hint.
 */
export async function aggregateDomain(input: FlywheelAggregationInput): Promise<void> {
  if (input.densityUpdates.length === 0) return;

  try {
    const supabase = await getClient();

    for (const update of input.densityUpdates) {
      const { data: existing } = await supabase
        .from('domain_patterns')
        .select('*')
        .eq('pattern_signature', update.patternSignature)
        .eq('domain_id', input.domainId)
        .eq('vertical_hint', input.verticalHint ?? '')
        .maybeSingle();

      const row = existing as DomainPatternRow | null;

      if (row) {
        const newConfidence = ema(row.confidence_mean, update.confidence);

        await supabase
          .from('domain_patterns')
          .update({
            confidence_mean: newConfidence,
            total_executions: row.total_executions + update.executionCount,
            tenant_count: row.tenant_count + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
      } else {
        await supabase
          .from('domain_patterns')
          .insert({
            pattern_signature: update.patternSignature,
            domain_id: input.domainId,
            vertical_hint: input.verticalHint ?? null,
            confidence_mean: update.confidence,
            total_executions: update.executionCount,
            tenant_count: 1,
            learned_behaviors: update.learnedBehaviors,
          });
      }
    }
  } catch (err) {
    console.error('[FlywheelPipeline] aggregateDomain error:', err);
  }
}

// ──────────────────────────────────────────────
// Cold Start — Load priors for a new tenant
// ──────────────────────────────────────────────

export interface ColdStartPrior {
  confidence: number;
  learnedBehaviors: Record<string, unknown>;
}

/**
 * Load structural priors from foundational + domain patterns.
 * Domain-specific priors override foundational where both exist.
 * Returns map of pattern_signature → { confidence, learnedBehaviors }.
 */
export async function loadColdStartPriors(
  domainId: string,
  verticalHint?: string
): Promise<Map<string, ColdStartPrior>> {
  const priors = new Map<string, ColdStartPrior>();

  try {
    const supabase = await getClient();

    // Load foundational priors (all structural patterns)
    const { data: foundational } = await supabase
      .from('foundational_patterns')
      .select('pattern_signature, confidence_mean, learned_behaviors');

    for (const row of (foundational ?? []) as FoundationalPatternRow[]) {
      priors.set(row.pattern_signature, {
        confidence: row.confidence_mean,
        learnedBehaviors: (typeof row.learned_behaviors === 'object' && row.learned_behaviors !== null)
          ? row.learned_behaviors
          : {},
      });
    }

    // Load domain priors (override foundational where applicable)
    let query = supabase
      .from('domain_patterns')
      .select('pattern_signature, confidence_mean, learned_behaviors')
      .eq('domain_id', domainId);

    if (verticalHint) {
      query = query.eq('vertical_hint', verticalHint);
    }

    const { data: domain } = await query;

    for (const row of (domain ?? []) as DomainPatternRow[]) {
      priors.set(row.pattern_signature, {
        confidence: row.confidence_mean,
        learnedBehaviors: (typeof row.learned_behaviors === 'object' && row.learned_behaviors !== null)
          ? row.learned_behaviors
          : {},
      });
    }
  } catch (err) {
    console.error('[FlywheelPipeline] loadColdStartPriors error:', err);
  }

  return priors;
}

// ──────────────────────────────────────────────
// Cold Start Discount Factor
// ──────────────────────────────────────────────

/** Priors are discounted — they're structural suggestions, not proven for this tenant */
export const COLD_START_DISCOUNT = 0.6;

/**
 * Convert cold start priors into initial PatternDensity entries.
 * Confidence is discounted by COLD_START_DISCOUNT.
 */
export function applyPriorsToEmptyDensity(
  priors: Map<string, ColdStartPrior>
): Map<string, PatternDensity> {
  const density = new Map<string, PatternDensity>();

  for (const [sig, prior] of Array.from(priors.entries())) {
    const discountedConfidence = prior.confidence * COLD_START_DISCOUNT;
    density.set(sig, {
      signature: sig,
      confidence: discountedConfidence,
      totalExecutions: 0,
      lastAnomalyRate: 0,
      lastCorrectionCount: 0,
      executionMode: discountedConfidence >= 0.7 ? 'light_trace' : 'full_trace',
      learnedBehaviors: prior.learnedBehaviors,
    });
  }

  return density;
}

// ──────────────────────────────────────────────
// Post-Consolidation Hook
// ──────────────────────────────────────────────

/**
 * Fire-and-forget after tenant density consolidation.
 * Aggregates into both Flywheel 2 + Flywheel 3.
 */
export async function postConsolidationFlywheel(
  tenantId: string,
  domainId: string,
  verticalHint: string | undefined,
  densityUpdates: FlywheelAggregationInput['densityUpdates']
): Promise<void> {
  await Promise.allSettled([
    aggregateFoundational({ tenantId, domainId, verticalHint, densityUpdates }),
    aggregateDomain({ tenantId, domainId, verticalHint, densityUpdates }),
  ]);
}
```

---

## E1_4_13_insight-agent.md

# E1.4.13 — `web/src/lib/agents/insight-agent.ts` (verbatim full source)

```typescript
/**
 * Insight Agent — Foundational Agent
 *
 * Dual-mode: lightweight inline (during calculation) + full analysis (post-run).
 * Moves from "here's what happened" to "here's what to do about it."
 * Persona-aware: Admin sees governance, Manager sees coaching, Rep sees growth.
 *
 * ZERO domain language. Korean Test applies.
 * Communicates exclusively through the Synaptic Surface.
 */

import type { SynapticSurface } from '@/lib/calculation/synaptic-types';
import { writeSynapse, readSynapses } from '@/lib/calculation/synaptic-surface';

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────

export interface InsightConfig {
  thresholds: {
    anomalyRateAlert: number;       // default 0.05 (5%)
    confidenceDropAlert: number;    // default 0.10 (10% drop)
    zeroOutcomeAlert: number;       // default 0.10 (10% zero outcomes)
    concentrationAlert: number;     // default 0.50 (50% of total in top 10%)
  };
}

export const DEFAULT_INSIGHT_CONFIG: InsightConfig = {
  thresholds: {
    anomalyRateAlert: 0.05,
    confidenceDropAlert: 0.10,
    zeroOutcomeAlert: 0.10,
    concentrationAlert: 0.50,
  },
};

// ──────────────────────────────────────────────
// Inline Mode — O(1) checks during calculation
// ──────────────────────────────────────────────

export interface InlineInsight {
  type: 'anomaly_rate_high' | 'confidence_dropping' | 'zero_outcome_cluster' | 'concentration_risk';
  severity: number;
  metric: string;
  currentValue: number;
  threshold: number;
  entityCount: number;
  recommendation: string;
}

/**
 * Check surface stats against thresholds. O(1) — reads aggregate stats only.
 * Should be called at checkpoints (every N entities or percentage milestones).
 */
export function checkInlineInsights(
  surface: SynapticSurface,
  config: InsightConfig,
  entitiesProcessed: number
): InlineInsight[] {
  const insights: InlineInsight[] = [];
  if (entitiesProcessed === 0) return insights;

  const stats = surface.stats;
  const t = config.thresholds;

  // Check 1: Anomaly rate
  const anomalyRate = stats.anomalyCount / entitiesProcessed;
  if (anomalyRate > t.anomalyRateAlert) {
    const insight: InlineInsight = {
      type: 'anomaly_rate_high',
      severity: Math.min(1.0, anomalyRate / t.anomalyRateAlert),
      metric: 'anomaly_rate',
      currentValue: anomalyRate,
      threshold: t.anomalyRateAlert,
      entityCount: entitiesProcessed,
      recommendation: 'Review input data quality — anomaly rate exceeds threshold',
    };
    insights.push(insight);

    writeSynapse(surface, {
      type: 'pattern',
      componentIndex: -1,
      value: anomalyRate,
      detail: `inline_insight:anomaly_rate_high:${anomalyRate.toFixed(3)}`,
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    });
  }

  // Check 2: Confidence dropping
  const confSynapses = readSynapses(surface, 'confidence', 'run');
  if (confSynapses.length > 0) {
    const avgConf = confSynapses.reduce((s, syn) => s + syn.value, 0) / confSynapses.length;
    const confDrop = 1.0 - avgConf;
    if (confDrop > t.confidenceDropAlert) {
      insights.push({
        type: 'confidence_dropping',
        severity: Math.min(1.0, confDrop / t.confidenceDropAlert),
        metric: 'avg_confidence',
        currentValue: avgConf,
        threshold: 1.0 - t.confidenceDropAlert,
        entityCount: entitiesProcessed,
        recommendation: 'Execution confidence below expected — verify rule interpretation',
      });
    }
  }

  // Check 3: Correction count (from prior reconciliation)
  if (stats.correctionCount > 0) {
    const correctionRate = stats.correctionCount / entitiesProcessed;
    if (correctionRate > t.anomalyRateAlert) {
      insights.push({
        type: 'anomaly_rate_high',
        severity: Math.min(1.0, correctionRate * 10),
        metric: 'correction_rate',
        currentValue: correctionRate,
        threshold: t.anomalyRateAlert,
        entityCount: entitiesProcessed,
        recommendation: 'Previous reconciliation corrections detected — review affected components',
      });
    }
  }

  return insights;
}

// ──────────────────────────────────────────────
// Full Analysis Mode — post-calculation
// ──────────────────────────────────────────────

export interface PrescriptiveInsight {
  id: string;
  category: 'performance' | 'data_quality' | 'process' | 'risk';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  dataSource: string[];
  confidence: number;
}

export interface Alert {
  id: string;
  severity: 'warning' | 'critical';
  title: string;
  description: string;
  dataSource: string[];
}

export interface CoachingAction {
  id: string;
  title: string;
  description: string;
  targetEntityCount: number;
  dataSource: string[];
}

export interface GovernanceFlag {
  id: string;
  title: string;
  description: string;
  severity: 'warning' | 'critical';
  dataSource: string[];
}

export interface GrowthSignal {
  id: string;
  title: string;
  description: string;
  currentValue: number;
  targetValue: number;
  dataSource: string[];
}

export interface CalculationSummary {
  entityCount: number;
  componentCount: number;
  totalOutcome: number;
  avgOutcome: number;
  medianOutcome: number;
  zeroOutcomeCount: number;
  concordanceRate: number;
  topEntities: Array<{ entityId: string; outcome: number }>;
  bottomEntities: Array<{ entityId: string; outcome: number }>;
}

export interface FullAnalysis {
  batchId: string;
  timestamp: string;
  runSummary: {
    entityCount: number;
    componentCount: number;
    totalOutcome: number;
    synapsesWritten: number;
    anomalyCount: number;
    correctionCount: number;
    avgConfidence: number;
  };
  insights: PrescriptiveInsight[];
  alerts: Alert[];
  coachingActions: CoachingAction[];
  governanceFlags: GovernanceFlag[];
  growthSignals: GrowthSignal[];
  inlineInsights: InlineInsight[];
}

/**
 * Generate full analysis from surface stats and calculation summary.
 * Deterministic — no LLM call. Produces structured insights from data.
 * AP-18: Every insight has dataSource. Empty dataSource → stripped.
 */
export function generateFullAnalysis(
  batchId: string,
  surface: SynapticSurface,
  summary: CalculationSummary,
  config: InsightConfig = DEFAULT_INSIGHT_CONFIG,
  inlineInsights: InlineInsight[] = []
): FullAnalysis {
  const insights: PrescriptiveInsight[] = [];
  const alerts: Alert[] = [];
  const coachingActions: CoachingAction[] = [];
  const governanceFlags: GovernanceFlag[] = [];
  const growthSignals: GrowthSignal[] = [];

  const stats = surface.stats;

  // Compute avg confidence from run synapses
  const confSynapses = readSynapses(surface, 'confidence', 'run');
  const avgConf = confSynapses.length > 0
    ? confSynapses.reduce((s, syn) => s + syn.value, 0) / confSynapses.length
    : 1.0;

  // ── Insight: Zero outcome concentration ──
  if (summary.zeroOutcomeCount > 0) {
    const zeroRate = summary.zeroOutcomeCount / Math.max(summary.entityCount, 1);
    if (zeroRate > config.thresholds.zeroOutcomeAlert) {
      insights.push({
        id: 'zero_outcome_cluster',
        category: 'data_quality',
        severity: zeroRate > 0.25 ? 'critical' : 'warning',
        title: 'Zero outcome concentration detected',
        description: `${summary.zeroOutcomeCount} of ${summary.entityCount} entities (${(zeroRate * 100).toFixed(1)}%) produced zero outcomes`,
        recommendation: 'Verify input data completeness for affected entities',
        dataSource: ['calculation_summary.zeroOutcomeCount', 'calculation_summary.entityCount'],
        confidence: 0.9,
      });

      governanceFlags.push({
        id: 'gov_zero_outcomes',
        title: 'Zero outcome entities require review',
        description: `${summary.zeroOutcomeCount} entities have zero outcomes — review before lifecycle advancement`,
        severity: zeroRate > 0.25 ? 'critical' : 'warning',
        dataSource: ['calculation_summary.zeroOutcomeCount'],
      });
    }
  }

  // ── Insight: Anomaly rate ──
  const anomalyRate = stats.anomalyCount / Math.max(summary.entityCount, 1);
  if (anomalyRate > config.thresholds.anomalyRateAlert) {
    insights.push({
      id: 'high_anomaly_rate',
      category: 'risk',
      severity: anomalyRate > 0.15 ? 'critical' : 'warning',
      title: 'Elevated anomaly rate',
      description: `${stats.anomalyCount} anomalies detected across ${summary.entityCount} entities (${(anomalyRate * 100).toFixed(1)}% rate)`,
      recommendation: 'Investigate anomalous entities before approving results',
      dataSource: ['surface.stats.anomalyCount', 'calculation_summary.entityCount'],
      confidence: 0.85,
    });

    alerts.push({
      id: 'alert_anomaly_rate',
      severity: anomalyRate > 0.15 ? 'critical' : 'warning',
      title: 'Anomaly rate exceeds threshold',
      description: `${(anomalyRate * 100).toFixed(1)}% anomaly rate (threshold: ${(config.thresholds.anomalyRateAlert * 100).toFixed(0)}%)`,
      dataSource: ['surface.stats.anomalyCount'],
    });
  }

  // ── Insight: Confidence drop ──
  if (avgConf < 1.0 - config.thresholds.confidenceDropAlert) {
    insights.push({
      id: 'low_confidence',
      category: 'process',
      severity: avgConf < 0.7 ? 'critical' : 'warning',
      title: 'Low execution confidence',
      description: `Average confidence: ${(avgConf * 100).toFixed(1)}% — some components may have interpretation uncertainty`,
      recommendation: 'Review component rule interpretations for low-confidence patterns',
      dataSource: ['surface.runSynapses.confidence'],
      confidence: 0.8,
    });
  }

  // ── Insight: Concentration risk ──
  if (summary.topEntities.length > 0 && summary.totalOutcome > 0) {
    const top10Outcome = summary.topEntities.reduce((s, e) => s + e.outcome, 0);
    const concentrationRatio = top10Outcome / summary.totalOutcome;
    if (concentrationRatio > config.thresholds.concentrationAlert) {
      insights.push({
        id: 'concentration_risk',
        category: 'risk',
        severity: concentrationRatio > 0.7 ? 'critical' : 'warning',
        title: 'Outcome concentration risk',
        description: `Top ${summary.topEntities.length} entities account for ${(concentrationRatio * 100).toFixed(1)}% of total outcomes`,
        recommendation: 'Verify high-outcome entities have complete and accurate data',
        dataSource: ['calculation_summary.topEntities', 'calculation_summary.totalOutcome'],
        confidence: 0.85,
      });
    }
  }

  // ── Insight: Concordance ──
  if (summary.concordanceRate < 100) {
    insights.push({
      id: 'concordance_gap',
      category: 'process',
      severity: summary.concordanceRate < 95 ? 'critical' : 'info',
      title: 'Dual-path concordance gap',
      description: `${summary.concordanceRate.toFixed(1)}% concordance between execution paths`,
      recommendation: summary.concordanceRate < 95
        ? 'Critical: execution paths diverge significantly — investigate component transformations'
        : 'Minor concordance gap — monitor in subsequent runs',
      dataSource: ['calculation_summary.concordanceRate'],
      confidence: 0.95,
    });
  }

  // ── Coaching: Performance distribution ──
  if (summary.bottomEntities.length > 0 && summary.totalOutcome > 0) {
    coachingActions.push({
      id: 'coach_bottom_performers',
      title: 'Bottom performers identified',
      description: `${summary.bottomEntities.length} entities in bottom tier — investigate input factors`,
      targetEntityCount: summary.bottomEntities.length,
      dataSource: ['calculation_summary.bottomEntities'],
    });
  }

  // ── Growth: Average performance ──
  if (summary.avgOutcome > 0) {
    growthSignals.push({
      id: 'growth_avg_outcome',
      title: 'Average outcome benchmark',
      description: `Current average outcome: ${summary.avgOutcome.toFixed(2)}`,
      currentValue: summary.avgOutcome,
      targetValue: summary.avgOutcome * 1.1, // 10% improvement target
      dataSource: ['calculation_summary.avgOutcome'],
    });
  }

  // ── AP-18 Gate: Strip any insights without dataSource ──
  const validInsights = insights.filter(i => i.dataSource.length > 0);
  const validAlerts = alerts.filter(a => a.dataSource.length > 0);

  return {
    batchId,
    timestamp: new Date().toISOString(),
    runSummary: {
      entityCount: summary.entityCount,
      componentCount: summary.componentCount,
      totalOutcome: summary.totalOutcome,
      synapsesWritten: stats.totalSynapsesWritten,
      anomalyCount: stats.anomalyCount,
      correctionCount: stats.correctionCount,
      avgConfidence: avgConf,
    },
    insights: validInsights,
    alerts: validAlerts,
    coachingActions,
    governanceFlags,
    growthSignals,
    inlineInsights,
  };
}

// ──────────────────────────────────────────────
// Persona Routing
// ──────────────────────────────────────────────

export interface PersonaInsights {
  insights: PrescriptiveInsight[];
  alerts?: Alert[];
  governance?: GovernanceFlag[];
  coaching?: CoachingAction[];
  growth?: GrowthSignal[];
}

export function routeToPersona(analysis: FullAnalysis, persona: 'admin' | 'manager' | 'rep'): PersonaInsights {
  switch (persona) {
    case 'admin':
      return {
        insights: analysis.insights.filter(i => i.category === 'process' || i.category === 'risk'),
        alerts: analysis.alerts,
        governance: analysis.governanceFlags,
      };
    case 'manager':
      return {
        insights: analysis.insights.filter(i => i.category === 'performance' || i.category === 'data_quality'),
        coaching: analysis.coachingActions,
      };
    case 'rep':
      return {
        insights: analysis.insights.filter(i => i.category === 'performance' && i.severity === 'info'),
        growth: analysis.growthSignals,
      };
  }
}
```

---

## E1_4_14_import-batch-supersession.md

# E1.4.14 — `web/src/lib/sci/import-batch-supersession.ts` (verbatim full source)

```typescript
/**
 * HF-213 — Content unit hash supersession identity primitive.
 * Supersedes HF-196 Phase 1F's (tenant_id, file_hash_sha256) supersession scope.
 *
 * Supersession scope: (tenant_id, content_unit_hash_sha256).
 *   - Content units within the same file have distinct hashes — they do not
 *     supersede each other (Manifestation 1 closure).
 *   - Same content in different file containers has the same content unit hash —
 *     supersession chains correctly across containers (Manifestation 2 closure).
 *
 * file_hash_sha256 retained on import_batches for file-level audit per HF-196
 * Phase 1F audit intent. No longer load-bearing for supersession decision.
 *
 * Phase 1E architecture preserved unchanged:
 *   - Supersession columns (superseded_by, supersedes, superseded_at, supersession_reason)
 *   - CHECK constraint on supersession integrity
 *   - Engine operative-only filter via fetchSupersededBatchIds + NOT IN
 *   - Audit trail discipline (nothing destroyed; SOC 2 CC7.2; GDPR Article 30)
 *
 * Korean Test (T1-E910): content_unit_hash_sha256 is structural primitive
 * (cryptographic hash of normalized content); tenantId, contentUnitHashSha256,
 * newBatchId are pure structural primitives. Zero domain literals.
 *
 * Path B-prime FK retained (architect invariant 3): structural_fingerprints.import_batch_id
 *   stays populated as lineage primitive for foundational flywheel work; not load-bearing
 *   for supersession decisions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeFingerprintHashSync } from './structural-fingerprint';
// HF-196 Phase 1F: computeFileHashSha256 lives in @/lib/sci/file-content-hash
// (separate module — kept out of this file so node:crypto is not pulled into client
// bundles via state-reader.ts → fetchSupersededBatchIds chain).

export interface SupersessionResult {
  prior_batch_id: string | null;
  prior_batch_status: 'superseded' | 'no_prior';
  new_batch_id: string;
  reason: string;
}

/**
 * Find prior operative batch for this (tenant, content_unit_hash_sha256), if any.
 * Single-query lookup on import_batches.
 *
 * Match identifier: (tenant_id, content_unit_hash_sha256). Same normalized content
 * anywhere in the tenant's import history → match (regardless of file container).
 * Different content → no match.
 *
 * Filters:
 *   - Operative only (superseded_by IS NULL)
 *   - Excludes the new batch itself
 *   - Most recent prior wins (LIMIT 1, ORDER BY created_at DESC)
 */
async function findPriorOperativeBatch(
  supabase: SupabaseClient,
  tenantId: string,
  contentUnitHashSha256: string,
  newBatchId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('import_batches')
    .select('id, created_at')
    .eq('tenant_id', tenantId)
    .eq('content_unit_hash_sha256', contentUnitHashSha256)
    .is('superseded_by', null)
    .neq('id', newBatchId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.warn(`[HF-213 supersession] lookup failed: ${error.message}`);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

/**
 * Supersede prior operative batch if (tenant_id, content_unit_hash_sha256) match exists.
 *
 * Returns supersession result for caller logging. Throws on update error
 * (caller should treat as non-blocking — original import succeeded; supersession
 * failure means both batches remain operative until manual reconciliation).
 */
export async function supersedePriorBatchIfExists(
  supabase: SupabaseClient,
  tenantId: string,
  contentUnitHashSha256: string,
  newBatchId: string,
  reason: string = 'content_unit_hash_match_reimport',
): Promise<SupersessionResult> {
  const priorBatchId = await findPriorOperativeBatch(
    supabase,
    tenantId,
    contentUnitHashSha256,
    newBatchId,
  );

  if (!priorBatchId) {
    return {
      prior_batch_id: null,
      prior_batch_status: 'no_prior',
      new_batch_id: newBatchId,
      reason: 'no_prior_operative_batch',
    };
  }

  // Mark prior batch as superseded — both link + audit columns set atomically per
  // CHECK constraint (superseded_by NOT NULL → superseded_at NOT NULL).
  const { error: updateError } = await supabase
    .from('import_batches')
    .update({
      superseded_by: newBatchId,
      superseded_at: new Date().toISOString(),
      supersession_reason: reason,
    })
    .eq('id', priorBatchId);

  if (updateError) {
    throw new Error(`[HF-213 supersession] update of prior batch failed: ${updateError.message}`);
  }

  // Link new batch back to predecessor (back-link is informational; not constrained
  // by CHECK because supersedes does not require superseded_at on the same row).
  const { error: linkError } = await supabase
    .from('import_batches')
    .update({ supersedes: priorBatchId })
    .eq('id', newBatchId);

  if (linkError) {
    throw new Error(`[HF-213 supersession] back-link to predecessor failed: ${linkError.message}`);
  }

  return {
    prior_batch_id: priorBatchId,
    prior_batch_status: 'superseded',
    new_batch_id: newBatchId,
    reason,
  };
}

/**
 * Engine-side helper (preserved unchanged from Phase 1E).
 * Fetch list of superseded import_batch ids for a tenant. Engine queries use this
 * to filter committed_data via NOT IN — surfacing only operative-batch rows.
 */
export async function fetchSupersededBatchIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('import_batches')
    .select('id')
    .eq('tenant_id', tenantId)
    .not('superseded_by', 'is', null);
  if (error) {
    console.warn(`[Phase 1E/1F] fetchSupersededBatchIds failed (non-blocking, engine continues unfiltered): ${error.message}`);
    return [];
  }
  return (data ?? []).map(b => b.id as string);
}

/**
 * HF-213 convenience wrapper — supersedes HF-196 Phase 1F's
 * supersedePriorBatchOnContentMatch (file_hash scope).
 *
 * Called from each processX function in execute-bulk + execute after import_batches
 * insert (which itself includes content_unit_hash_sha256 in the inserted row).
 *
 * Two responsibilities:
 *   1. Lineage link: structural_fingerprints.import_batch_id ← newBatchId
 *      (Phase 1E Path B-prime FK preserved per architect invariant 3 — informational
 *       only; not load-bearing for supersession trigger.)
 *   2. HF-213 supersession check by content_unit_hash_sha256.
 *
 * Non-blocking: lineage link or supersession failure is logged but does not throw.
 *
 * Returns SupersessionResult for caller-side log emission, or null on failure or
 * empty rows (no fingerprint to link → still attempts supersession by content hash alone).
 */
export async function supersedePriorBatchOnContentMatch(
  supabase: SupabaseClient,
  tenantId: string,
  newBatchId: string,
  contentUnitHashSha256: string,
  rows: Record<string, unknown>[],
  reason: string = 'content_unit_hash_match_reimport',
): Promise<SupersessionResult | null> {
  // 1. Lineage link (Phase 1E Path B-prime FK preserved — informational).
  if (rows.length > 0) {
    try {
      const columns = Object.keys(rows[0]);
      const fingerprintHash = computeFingerprintHashSync(columns, rows.slice(0, 50));
      const { error: linkErr } = await supabase
        .from('structural_fingerprints')
        .update({ import_batch_id: newBatchId })
        .eq('tenant_id', tenantId)
        .eq('fingerprint_hash', fingerprintHash)
        .is('import_batch_id', null);
      if (linkErr) {
        console.warn(`[HF-213] structural_fingerprints lineage link failed (non-blocking): ${linkErr.message}`);
      }
    } catch (err) {
      console.warn(`[HF-213] fingerprint lineage computation failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. HF-213 supersession check by content_unit_hash_sha256.
  try {
    const result = await supersedePriorBatchIfExists(
      supabase,
      tenantId,
      contentUnitHashSha256,
      newBatchId,
      reason,
    );
    if (result.prior_batch_status === 'superseded') {
      console.log(
        `[HF-213] Superseded prior batch ${result.prior_batch_id} → new batch ${result.new_batch_id} ` +
        `(tenant=${tenantId} content_unit_hash=${contentUnitHashSha256.substring(0, 12)} reason=${result.reason})`,
      );
    }
    return result;
  } catch (err) {
    console.warn(`[HF-213] supersession failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
```

---

## E1_4_2_metric-resolver.md

# E1.4.2 — `web/src/lib/orchestration/metric-resolver.ts` (verbatim full source)

```typescript
/**
 * Plan-Driven Metric Resolver
 *
 * Resolves plan metric names to semantic types using pattern analysis.
 *
 * The plan defines metric names (e.g., "store_optical_sales").
 * The aggregation produces semantic values (attainment, amount, goal).
 * This resolver bridges them without hardcoding customer-specific mappings.
 *
 * PRINCIPLE 1: AI-First, Never Hardcoded.
 * This uses pattern analysis on metric names, not customer-specific translation tables.
 * Works for ANY plan that uses English metric names (which AI interpretation always produces).
 */

export type SemanticType = 'attainment' | 'amount' | 'goal' | 'quantity' | 'unknown';

// Patterns checked in priority order - attainment first to handle "sales_attainment"
const ATTAINMENT_PATTERNS = [
  /attainment/i,
  /rate/i,
  /ratio/i,
  /percentage/i,
  /percent/i,
  /achievement/i,
  /completion/i,
  /fulfillment/i,
  /cumplimiento/i,
];

const AMOUNT_PATTERNS = [
  /sales/i,
  /revenue/i,
  /volume/i,
  /amount/i,
  /premium/i,
  /total/i,
  /income/i,
  /value/i,
  /disbursement/i,
  /monto/i,
  /venta/i,
];

const GOAL_PATTERNS = [
  /goal/i,
  /target/i,
  /quota/i,
  /budget/i,
  /objective/i,
  /meta/i,
];

const QUANTITY_PATTERNS = [
  /count/i,
  /quantity/i,
  /number/i,
  /units/i,
  /customers/i,
  /clients/i,
  /items/i,
  /cantidad/i,
  /infracci/i,
];

/**
 * Infer the semantic type of a plan metric name from its name alone.
 * Returns the most likely semantic type based on pattern matching.
 *
 * Priority order ensures "sales_attainment" returns 'attainment' not 'amount'.
 */
export function inferSemanticType(metricName: string): SemanticType {
  if (!metricName) return 'unknown';

  // Check patterns in priority order (attainment first because
  // "sales_attainment" should be attainment, not amount)
  for (const pattern of ATTAINMENT_PATTERNS) {
    if (pattern.test(metricName)) return 'attainment';
  }
  for (const pattern of GOAL_PATTERNS) {
    if (pattern.test(metricName)) return 'goal';
  }
  for (const pattern of QUANTITY_PATTERNS) {
    if (pattern.test(metricName)) return 'quantity';
  }
  for (const pattern of AMOUNT_PATTERNS) {
    if (pattern.test(metricName)) return 'amount';
  }

  return 'unknown';
}

/**
 * Component metric configuration - extracted from plan component configs
 */
export interface ComponentMetricConfig {
  rowMetric?: string;
  columnMetric?: string;
  metric?: string; // For tier lookups
  appliedTo?: string; // For percentage/conditional
}

/**
 * For a given plan component, determine which aggregated semantic value
 * maps to each of the plan's expected metric names.
 *
 * Returns a map: { planMetricName: semanticType }
 */
export function resolveComponentMetrics(
  component: ComponentMetricConfig
): Record<string, SemanticType> {
  const result: Record<string, SemanticType> = {};

  if (component.rowMetric) {
    result[component.rowMetric] = inferSemanticType(component.rowMetric);
  }
  if (component.columnMetric) {
    result[component.columnMetric] = inferSemanticType(component.columnMetric);
  }
  if (component.metric) {
    result[component.metric] = inferSemanticType(component.metric);
  }
  if (component.appliedTo) {
    result[component.appliedTo] = inferSemanticType(component.appliedTo);
  }

  return result;
}

/**
 * Aggregated sheet metrics with semantic types
 */
export interface SheetMetrics {
  attainment?: number;
  amount?: number;
  goal?: number;
  quantity?: number;
}

/**
 * Build the metrics object for one employee on one plan component.
 *
 * Takes the plan's expected metric names and fills them with the
 * aggregated semantic values from the matched sheet.
 *
 * OB-29 Phase 3B CONTEXTUAL FIX:
 * - tier_lookup components ONLY accept attainment values (no amount fallback)
 * - This prevents raw counts/amounts from being incorrectly used as percentages
 * - If attainment is unavailable for tier_lookup, metric is NOT added → engine returns $0
 *
 * @param component - Plan component with metric name config
 * @param sheetMetrics - Aggregated semantic values {attainment, amount, goal, quantity}
 * @param componentType - Optional: the plan component type (tier_lookup, matrix_lookup, etc.)
 * @returns Metrics object with plan-expected keys and aggregated values
 */
export function buildComponentMetrics(
  component: ComponentMetricConfig,
  sheetMetrics: SheetMetrics,
  componentType?: string
): Record<string, number> {
  const metricMap = resolveComponentMetrics(component);
  const result: Record<string, number> = {};

  // OB-29 Phase 3B: bounded_lookup_1d expects ATTAINMENT PERCENTAGE, not raw amounts
  const isTierLookup = componentType === 'bounded_lookup_1d';

  for (const [metricName, semanticType] of Object.entries(metricMap)) {
    switch (semanticType) {
      case 'attainment':
        if (sheetMetrics.attainment !== undefined) {
          result[metricName] = sheetMetrics.attainment;
        }
        // OB-29: If attainment is undefined (zero-goal), metric is NOT added → engine returns $0
        break;
      case 'amount':
        // OB-29 Phase 3B: For tier_lookup, amount is INVALID - it expects attainment
        if (isTierLookup) {
          // DO NOT add metric - this will trigger zero-goal guard in engine
        } else if (sheetMetrics.amount !== undefined) {
          result[metricName] = sheetMetrics.amount;
        }
        break;
      case 'goal':
        if (sheetMetrics.goal !== undefined) {
          result[metricName] = sheetMetrics.goal;
        }
        break;
      case 'quantity':
        // OB-29 Phase 3B: For tier_lookup, quantity is INVALID - it expects attainment
        if (isTierLookup) {
          // DO NOT add metric - this will trigger zero-goal guard in engine
        } else if (sheetMetrics.quantity !== undefined) {
          result[metricName] = sheetMetrics.quantity;
        }
        break;
      default:
        // OB-29 Phase 3B: For tier_lookup, unknown type gets NO fallback
        if (isTierLookup) {
          // DO NOT add metric - this will trigger zero-goal guard in engine
        } else {
          // Unknown type - try amount as fallback (most common) for non-tier_lookup
          if (sheetMetrics.amount !== undefined) {
            result[metricName] = sheetMetrics.amount;
          }
        }
    }
  }

  return result;
}

/**
 * OB-196 Phase 3 (E4 / Q-A.5.5): structured failure on missing intent at
 * metric-extraction surface. Silent empty config produced silent zero-payout
 * downstream — worst failure mode. Throw surfaces the shape violation.
 */
export class MetricResolverMissingIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetricResolverMissingIntentError';
  }
}

/**
 * Extract metric configuration from a plan component's foundational intent.
 *
 * OB-196 Phase 1.7: refactored to read metadata.intent (foundational shape) per
 * Decision 151 (read-only projection). Reads intent.input.sourceSpec.field for 1D
 * lookups + scalar_multiply, intent.inputs.row/column.sourceSpec.field for 2D
 * lookups, intent.condition.left.sourceSpec.field for conditional gates.
 *
 * OB-196 Phase 3: throws MetricResolverMissingIntentError when neither
 * metadata.intent nor calculationIntent is present. Caller must guarantee shape.
 */
export function extractMetricConfig(component: {
  id?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  calculationIntent?: Record<string, unknown>;
}): ComponentMetricConfig {
  const config: ComponentMetricConfig = {};

  const meta = (component.metadata || {}) as Record<string, unknown>;
  const intent = (meta.intent || component.calculationIntent) as Record<string, unknown> | undefined;
  if (!intent) {
    throw new MetricResolverMissingIntentError(
      `[metric-resolver] Missing metadata.intent and calculationIntent on component ` +
      `${component.id ?? '<unknown id>'} (${component.name ?? '<unknown name>'}). ` +
      `Foundational shape required for metric extraction; empty config produced ` +
      `silent zero-payout downstream prior to Phase 3 hardening.`
    );
  }

  const op = intent.operation as string | undefined;

  // 2D lookup: intent.inputs.row + intent.inputs.column carry metric sources
  if (op === 'bounded_lookup_2d') {
    const inputs = (intent.inputs || {}) as Record<string, unknown>;
    const rowField = readFieldFromSource(inputs.row);
    const colField = readFieldFromSource(inputs.column);
    if (rowField) config.rowMetric = rowField;
    if (colField) config.columnMetric = colField;
    return config;
  }

  // 1D lookup / scalar_multiply / piecewise_linear / linear_function: intent.input
  const inputField = readFieldFromSource(intent.input);
  if (inputField) {
    if (op === 'bounded_lookup_1d') {
      config.metric = inputField;
    } else {
      config.appliedTo = inputField;
    }
  }

  // conditional_gate: also extract the condition's left-hand metric
  if (op === 'conditional_gate') {
    const cond = (intent.condition || {}) as Record<string, unknown>;
    const condField = readFieldFromSource(cond.left);
    if (condField && !config.metric) config.metric = condField;
  }

  return config;
}

function readFieldFromSource(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.source === 'metric') {
    const spec = (obj.sourceSpec || {}) as Record<string, unknown>;
    const field = spec.field;
    return typeof field === 'string' ? field : undefined;
  }
  return undefined;
}

/**
 * Find the sheet that matches a plan component by matching component names/IDs.
 * The AI Import Context stores which sheet feeds which plan component.
 */
export function findSheetForComponent(
  componentName: string,
  componentId: string,
  aiContextSheets: Array<{
    sheetName: string;
    matchedComponent: string | null;
  }>
): string | null {
  if (!aiContextSheets || aiContextSheets.length === 0) {
    return null;
  }

  // Normalize for comparison
  const normName = componentName.toLowerCase().replace(/[-\s]/g, '_');
  const normId = componentId.toLowerCase().replace(/[-\s]/g, '_');

  // STRATEGY 1: Use AI matchedComponent if available
  for (const sheet of aiContextSheets) {
    if (!sheet.matchedComponent) continue;

    const matchedNorm = sheet.matchedComponent.toLowerCase().replace(/[-\s]/g, '_');

    // Check various matching strategies
    if (
      matchedNorm === normName ||
      matchedNorm === normId ||
      matchedNorm.includes(normName) ||
      normName.includes(matchedNorm) ||
      matchedNorm.includes(normId) ||
      normId.includes(matchedNorm)
    ) {
      return sheet.sheetName;
    }
  }

  return null;
}
```

---

## E1_4_3_intent-transformer.md

# E1.4.3 — `web/src/lib/calculation/intent-transformer.ts` (verbatim full source)

```typescript
/**
 * Intent Transformer — Bridge from PlanComponent to ComponentIntent
 *
 * Deterministic transformation. No AI. No heuristics.
 * Reads the existing plan component and produces a structural intent
 * that the domain-agnostic executor can process.
 *
 * Foundational primitives only — legacy vocabulary case arms removed in OB-196 Phase 1.6.5.
 */

import type { PlanComponent } from '../../types/compensation-plan';

import type {
  ComponentIntent,
  IntentOperation,
  IntentSource,
  IntentModifier,
} from './intent-types';

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Transform a PlanComponent into a ComponentIntent.
 * Returns null if the component is disabled or has no valid intent.
 */
export function transformComponent(
  component: PlanComponent,
  componentIndex: number
): ComponentIntent | null {
  if (!component.enabled) return null;

  switch (component.componentType) {
    case 'linear_function':
    case 'piecewise_linear':
    case 'scope_aggregate':
    case 'scalar_multiply':
    case 'conditional_gate':
      return transformFromMetadata(component, componentIndex);
    default:
      // Default path: any component with calculationIntent or metadata.intent
      // routes through metadata-driven construction. Components lacking either
      // produce null (no transform).
      return transformFromMetadata(component, componentIndex);
  }
}

/**
 * Transform all components in a variant into ComponentIntents.
 */
export function transformVariant(
  components: PlanComponent[]
): ComponentIntent[] {
  const results: ComponentIntent[] = [];
  for (let i = 0; i < components.length; i++) {
    const intent = transformComponent(components[i], i);
    if (intent) results.push(intent);
  }
  return results;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function entityScope(level: string): 'entity' | 'group' {
  return level === 'individual' ? 'entity' : 'group';
}

// ──────────────────────────────────────────────
// Metadata-driven intent construction (OB-182)
// The AI plan interpreter stores the intent structure in component.metadata.intent
// or component.calculationIntent.
// ──────────────────────────────────────────────

/**
 * HF-187: Normalize an AI-produced source reference into a valid IntentSource or IntentOperation.
 *
 * AI format for metrics:  { source: "metric", sourceSpec: { field: "X" } }  → pass through
 * AI format for ratios:   { source: "ratio", sourceSpec: { numerator: "X", denominator: "Y" } }
 *                         → { operation: "ratio", numerator: IntentSource, denominator: IntentSource }
 * AI format for constants: { source: "constant", value: N } → pass through
 * String shorthand:       "field_name" → { source: "metric", sourceSpec: { field: "field_name" } }
 */
function normalizeIntentInput(raw: unknown): IntentSource | IntentOperation {
  if (raw == null) return { source: 'constant', value: 0 };

  if (typeof raw === 'string') {
    return { source: 'metric', sourceSpec: { field: raw } };
  }

  if (typeof raw === 'number') {
    return { source: 'constant', value: raw };
  }

  const obj = raw as Record<string, unknown>;

  if ('operation' in obj && typeof obj.operation === 'string') {
    if (obj.operation === 'ratio') {
      const spec = (obj.sourceSpec || {}) as Record<string, unknown>;
      return {
        operation: 'ratio',
        numerator: normalizeIntentInput(obj.numerator || spec.numerator),
        denominator: normalizeIntentInput(obj.denominator || spec.denominator),
        zeroDenominatorBehavior: (obj.zeroDenominatorBehavior as string) || 'zero',
      } as IntentOperation;
    }
    return obj as unknown as IntentOperation;
  }

  if (obj.source === 'ratio') {
    const spec = (obj.sourceSpec || {}) as Record<string, unknown>;
    return {
      operation: 'ratio',
      numerator: normalizeIntentInput(spec.numerator),
      denominator: normalizeIntentInput(spec.denominator),
      zeroDenominatorBehavior: 'zero',
    } as IntentOperation;
  }

  if (obj.source === 'metric' || obj.source === 'constant' || obj.source === 'entity_attribute'
    || obj.source === 'prior_component' || obj.source === 'cross_data'
    || obj.source === 'scope_aggregate' || obj.source === 'aggregate') {
    return obj as unknown as IntentSource;
  }

  return { source: 'constant', value: 0 };
}

function transformFromMetadata(
  component: PlanComponent,
  componentIndex: number
): ComponentIntent | null {
  const meta = (component.metadata || {}) as Record<string, unknown>;
  const rawIntent = (meta?.intent || (component as unknown as Record<string, unknown>).calculationIntent) as Record<string, unknown> | undefined;
  if (!rawIntent) return null;

  let operation: IntentOperation;
  if (rawIntent.additionalConstant != null && rawIntent.rate != null) {
    operation = {
      operation: 'linear_function',
      input: normalizeIntentInput(rawIntent.input),
      slope: Number(rawIntent.rate),
      intercept: Number(rawIntent.additionalConstant),
    } as IntentOperation;
  } else if (rawIntent.operation === 'scalar_multiply' && rawIntent.rate != null) {
    operation = {
      operation: 'scalar_multiply',
      input: normalizeIntentInput(rawIntent.input),
      rate: Number(rawIntent.rate),
    } as IntentOperation;
  } else if (rawIntent.operation === 'piecewise_linear') {
    const calcMethod = (component as unknown as Record<string, unknown>).calculationMethod as Record<string, unknown> | undefined;
    const tv = rawIntent.targetValue ?? calcMethod?.targetValue ?? meta?.targetValue;
    operation = {
      operation: 'piecewise_linear',
      ratioInput: normalizeIntentInput(rawIntent.ratioInput),
      baseInput: normalizeIntentInput(rawIntent.baseInput),
      ...(tv != null && Number(tv) > 0 ? { targetValue: Number(tv) } : {}),
      segments: Array.isArray(rawIntent.segments) ? rawIntent.segments.map((seg: Record<string, unknown>) => ({
        min: Number(seg.min ?? 0),
        max: seg.max != null ? Number(seg.max) : null,
        rate: Number(seg.rate ?? 0),
      })) : [],
    } as IntentOperation;
  } else if (rawIntent.operation === 'conditional_gate') {
    const cond = (rawIntent.condition || {}) as Record<string, unknown>;
    operation = {
      operation: 'conditional_gate',
      condition: {
        left: normalizeIntentInput(cond.left),
        operator: String(cond.operator || '>='),
        right: normalizeIntentInput(cond.right),
      },
      onTrue: normalizeIntentInput(rawIntent.onTrue) as IntentOperation,
      onFalse: normalizeIntentInput(rawIntent.onFalse) as IntentOperation,
    } as IntentOperation;
  } else {
    operation = rawIntent as unknown as IntentOperation;
  }

  const modifiers: IntentModifier[] = [];

  if (Array.isArray(rawIntent.modifiers)) {
    for (const mod of rawIntent.modifiers) {
      const m = mod as Record<string, unknown>;
      if (m.modifier === 'cap' && m.maxValue != null) {
        modifiers.push({ modifier: 'cap', maxValue: Number(m.maxValue), scope: 'per_period' });
      }
      if (m.modifier === 'floor' && m.minValue != null) {
        modifiers.push({ modifier: 'floor', minValue: Number(m.minValue), scope: 'per_period' });
      }
    }
  }

  if (meta.cap != null && Number(meta.cap) > 0) {
    modifiers.push({ modifier: 'cap', maxValue: Number(meta.cap), scope: 'per_period' });
  }
  if (meta.floor != null && Number(meta.floor) > 0) {
    modifiers.push({ modifier: 'floor', minValue: Number(meta.floor), scope: 'per_period' });
  }

  return {
    componentIndex,
    label: component.name,
    confidence: typeof meta.confidence === 'number' ? meta.confidence : 0.5,
    dataSource: {
      sheetClassification: 'transaction',
      entityScope: entityScope(component.measurementLevel),
      requiredMetrics: [],
    },
    intent: operation,
    modifiers,
    metadata: {
      domainLabel: component.name,
      planReference: component.id,
      aiConfidence: typeof meta.confidence === 'number' ? meta.confidence : 0.5,
      interpretationNotes: `AI-interpreted ${component.componentType} via calculationIntent`,
    },
  };
}
```

---

## E1_4_4_intent-executor.md

# E1.4.4 — `web/src/lib/calculation/intent-executor.ts` (verbatim full source)

```typescript
/**
 * Intent Executor — The Foundational Calculation Agent
 *
 * Executes structural operations defined by ComponentIntent.
 * ZERO domain awareness. Does not know what domain it operates in.
 * Processes boundaries, ratios, grids, conditions, and scalars.
 *
 * Decision 122 (DS-010): All arithmetic uses decimal.js with Banker's Rounding.
 * Native number is used ONLY for boundary comparison (exact plan values)
 * and at the output boundary (executeIntent → number).
 */

import type {
  ComponentIntent,
  IntentOperation,
  IntentSource,
  ExecutionTrace,
  Boundary,
  BoundedLookup1D,
  BoundedLookup2D,
  ScalarMultiply,
  ConditionalGate,
  AggregateOp,
  RatioOp,
  ConstantOp,
  WeightedBlendOp,
  TemporalWindowOp,
  IntentModifier,
} from './intent-types';
import { isIntentOperation } from './intent-types';
import { Decimal, toDecimal, toNumber, ZERO } from './decimal-precision';

// ──────────────────────────────────────────────
// Entity Data — the executor's view of an entity
// ──────────────────────────────────────────────

export interface EntityData {
  entityId: string;
  metrics: Record<string, number>;
  attributes: Record<string, string | number | boolean>;
  groupMetrics?: Record<string, number>;
  priorResults?: number[];    // outcomes of previously calculated components
  periodHistory?: number[];   // prior period values for temporal_window (loaded in batch, not per-entity)
  // OB-181: Cross-data counts — pre-computed counts/sums of committed_data by data_type
  crossDataCounts?: Record<string, number>;  // key: "dataType:count" or "dataType:sum:field" → value
  // OB-181: Scope aggregates — pre-computed sums across entities in hierarchical scope
  scopeAggregates?: Record<string, number>;  // key: "scope:field:aggregation" → value
  // HF-211: Optional [CalcTrace] collector. When provided, intent-executor diagnostic
  // emissions route through this callback (caller-controlled buffering / cap / suppression);
  // when undefined, fall back to console.log for backward compatibility (test paths, other
  // callers). Architectural compromise: diagnostic plumbing on EntityData avoids threading
  // optional traceCollector through ~15 function signatures (executeIntent → executeOperation
  // → execute* operations → resolveValue → resolveSource).
  traceCollector?: (line: string) => void;
}

export interface ExecutionResult {
  entityId: string;
  componentIndex: number;
  outcome: number;
  trace: ExecutionTrace;
}

// ──────────────────────────────────────────────
// Source Resolution (returns Decimal — Decision 122)
// ──────────────────────────────────────────────

function resolveSource(
  src: IntentSource,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): Decimal {
  switch (src.source) {
    case 'metric': {
      const field = src.sourceSpec.field;
      // Strip "metric:" prefix if present
      const key = field.startsWith('metric:') ? field.slice(7) : field;
      const raw = data.metrics[key] ?? 0;
      inputLog[field] = { source: 'metric', rawValue: data.metrics[key], resolvedValue: raw };
      {
        const _line = `[CalcTrace] resolveSource:metric_lookup entity=${data.entityId} | field=${field} | key=${key} | rawValueInMetrics=${data.metrics[key]} | resolvedValue=${raw} | metricsKeys=[${Object.keys(data.metrics).join(',')}]`;
        if (process.env.CALC_TRACE_VERBOSE === 'true') {
          if (data.traceCollector) data.traceCollector(_line); else console.log(_line);
        }
      }
      return toDecimal(raw);
    }
    case 'ratio': {
      const numKey = src.sourceSpec.numerator.startsWith('metric:')
        ? src.sourceSpec.numerator.slice(7) : src.sourceSpec.numerator;
      const denKey = src.sourceSpec.denominator.startsWith('metric:')
        ? src.sourceSpec.denominator.slice(7) : src.sourceSpec.denominator;
      const num = toDecimal(data.metrics[numKey] ?? 0);
      const den = toDecimal(data.metrics[denKey] ?? 0);
      const val = den.isZero() ? ZERO : num.div(den);
      inputLog[`ratio(${numKey}/${denKey})`] = {
        source: 'ratio',
        rawValue: { numerator: toNumber(num), denominator: toNumber(den) },
        resolvedValue: toNumber(val),
      };
      return val;
    }
    case 'aggregate': {
      const field = src.sourceSpec.field;
      const key = field.startsWith('metric:') ? field.slice(7) : field;
      if (src.sourceSpec.scope === 'group' && data.groupMetrics) {
        const raw = data.groupMetrics[key] ?? 0;
        inputLog[`aggregate:group:${key}`] = { source: 'aggregate:group', rawValue: raw, resolvedValue: raw };
        return toDecimal(raw);
      }
      const raw = data.metrics[key] ?? 0;
      inputLog[`aggregate:${src.sourceSpec.scope}:${key}`] = {
        source: `aggregate:${src.sourceSpec.scope}`,
        rawValue: raw,
        resolvedValue: raw,
      };
      return toDecimal(raw);
    }
    case 'constant': {
      inputLog[`constant:${src.value}`] = { source: 'constant', rawValue: src.value, resolvedValue: src.value };
      return toDecimal(src.value);
    }
    case 'entity_attribute': {
      const attr = src.sourceSpec.attribute;
      const raw = data.attributes[attr];
      const val = typeof raw === 'number' ? raw : (typeof raw === 'string' ? parseFloat(raw) || 0 : 0);
      inputLog[`attr:${attr}`] = { source: 'entity_attribute', rawValue: raw, resolvedValue: val };
      return toDecimal(val);
    }
    case 'prior_component': {
      const idx = src.sourceSpec.componentIndex;
      const val = data.priorResults?.[idx] ?? 0;
      inputLog[`prior:${idx}`] = { source: 'prior_component', rawValue: val, resolvedValue: val };
      return toDecimal(val);
    }
    // OB-181: Cross-data count — reads pre-computed count/sum from crossDataCounts
    case 'cross_data': {
      const { dataType, field, aggregation } = src.sourceSpec;
      const key = field ? `${dataType}:${aggregation}:${field}` : `${dataType}:${aggregation}`;
      const val = data.crossDataCounts?.[key] ?? 0;
      inputLog[`cross_data:${key}`] = { source: 'cross_data', rawValue: val, resolvedValue: val };
      return toDecimal(val);
    }
    // OB-181: Scope aggregate — reads pre-computed hierarchical aggregate from scopeAggregates
    case 'scope_aggregate': {
      const { field, scope, aggregation } = src.sourceSpec;
      const key = `${scope}:${field}:${aggregation}`;
      const val = data.scopeAggregates?.[key] ?? 0;
      inputLog[`scope_aggregate:${key}`] = { source: 'scope_aggregate', rawValue: val, resolvedValue: val };
      return toDecimal(val);
    }
  }
}

// ──────────────────────────────────────────────
// Composable Value Resolution — handles IntentSource or nested IntentOperation
// ──────────────────────────────────────────────

function resolveValue(
  sourceOrOp: IntentSource | IntentOperation,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  if (isIntentOperation(sourceOrOp)) {
    // Recursive: execute the nested operation to get a value
    return executeOperation(sourceOrOp, data, inputLog, trace);
  }
  // Existing: resolve from entity data
  return resolveSource(sourceOrOp, data, inputLog);
}

// ──────────────────────────────────────────────
// Boundary Matching — Decision 127 (LOCKED 2026-03-16): half-open intervals
// [min, max) — inclusive lower bound, exclusive upper bound. The final band
// in any sequence uses inclusive upper bound [min, max] to capture the ceiling
// (or max=null for open-ended).
//
// Boundaries reaching this resolver are canonicalized at plan persistence per
// HF-196 Phase 1G-15: contiguous partition (b[i].max === b[i+1].min);
// non-final boundaries have maxInclusive: false; final boundary either
// max: null or maxInclusive: true. The OB-169 .999 snap heuristic is removed
// (redundant; canonicalizer at persistence guarantees the invariant).
// ──────────────────────────────────────────────

export function findBoundaryIndex(boundaries: Boundary[], value: number): number {
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    const isLast = i === boundaries.length - 1;

    const minOk = b.min === null
      ? true
      : (b.minInclusive !== false ? value >= b.min : value > b.min);

    let maxOk: boolean;
    if (b.max === null) {
      maxOk = true;
    } else if (isLast && b.maxInclusive === true) {
      // Final capped band: inclusive
      maxOk = value <= b.max;
    } else {
      // Half-open per Decision 127
      maxOk = value < b.max;
    }

    if (minOk && maxOk) return i;
  }
  return -1;
}

// ──────────────────────────────────────────────
// Primitive Executors (Decimal arithmetic — Decision 122)
// ──────────────────────────────────────────────

function executeBoundedLookup1D(
  op: BoundedLookup1D,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const inputValue = resolveValue(op.input, data, inputLog, trace);
  // Boundary comparison uses native number — plan values are exact
  const idx = findBoundaryIndex(op.boundaries, toNumber(inputValue));

  if (idx < 0) {
    trace.lookupResolution = { outputValue: 0 };
    {
      const _line = `[CalcTrace] executeBoundedLookup1D:no_band_match entity=${data.entityId} | inputValue=${toNumber(inputValue)} | boundaries=${JSON.stringify(op.boundaries)} | outputValue=0`;
      if (process.env.CALC_TRACE_VERBOSE === 'true') {
        if (data.traceCollector) data.traceCollector(_line); else console.log(_line);
      }
    }
    return ZERO;
  }

  const rawOutput = toDecimal(op.outputs[idx] ?? 0);
  // OB-117: isMarginal — outputs are rates to multiply against the input value
  const output = op.isMarginal ? rawOutput.mul(inputValue) : rawOutput;
  trace.lookupResolution = {
    rowBoundaryMatched: {
      min: op.boundaries[idx].min,
      max: op.boundaries[idx].max,
      index: idx,
    },
    outputValue: toNumber(output),
    ...(op.isMarginal ? { isMarginal: true, rate: toNumber(rawOutput), inputValue: toNumber(inputValue) } : {}),
  };
  {
    const _line = `[CalcTrace] executeBoundedLookup1D:execution entity=${data.entityId} | inputValue=${toNumber(inputValue)} | bandIndex=${idx} | bandRange=${JSON.stringify({min: op.boundaries[idx].min, max: op.boundaries[idx].max})} | rawOutput=${toNumber(rawOutput)} | isMarginal=${!!op.isMarginal} | outputValue=${toNumber(output)} | boundaries=${JSON.stringify(op.boundaries)} | outputs=${JSON.stringify(op.outputs)}`;
    if (process.env.CALC_TRACE_VERBOSE === 'true') {
      if (data.traceCollector) data.traceCollector(_line); else console.log(_line);
    }
  }
  return output;
}

function executeBoundedLookup2D(
  op: BoundedLookup2D,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const rowValue = resolveValue(op.inputs.row, data, inputLog, trace);
  const colValue = resolveValue(op.inputs.column, data, inputLog, trace);

  const rowIdx = findBoundaryIndex(op.rowBoundaries, toNumber(rowValue));
  const colIdx = findBoundaryIndex(op.columnBoundaries, toNumber(colValue));

  if (rowIdx < 0 || colIdx < 0) {
    trace.lookupResolution = {
      rowBoundaryMatched: rowIdx >= 0 ? { min: op.rowBoundaries[rowIdx].min, max: op.rowBoundaries[rowIdx].max, index: rowIdx } : undefined,
      columnBoundaryMatched: colIdx >= 0 ? { min: op.columnBoundaries[colIdx].min, max: op.columnBoundaries[colIdx].max, index: colIdx } : undefined,
      outputValue: 0,
    };
    {
      const _line = `[CalcTrace] executeBoundedLookup2D:no_band_match entity=${data.entityId} | rowValue=${toNumber(rowValue)} | colValue=${toNumber(colValue)} | rowIdx=${rowIdx} | colIdx=${colIdx} | rowBoundaries=${JSON.stringify(op.rowBoundaries)} | columnBoundaries=${JSON.stringify(op.columnBoundaries)} | outputValue=0`;
      if (process.env.CALC_TRACE_VERBOSE === 'true') {
        if (data.traceCollector) data.traceCollector(_line); else console.log(_line);
      }
    }
    return ZERO;
  }

  const output = toDecimal(op.outputGrid[rowIdx]?.[colIdx] ?? 0);
  trace.lookupResolution = {
    rowBoundaryMatched: { min: op.rowBoundaries[rowIdx].min, max: op.rowBoundaries[rowIdx].max, index: rowIdx },
    columnBoundaryMatched: { min: op.columnBoundaries[colIdx].min, max: op.columnBoundaries[colIdx].max, index: colIdx },
    outputValue: toNumber(output),
  };
  {
    const _line = `[CalcTrace] executeBoundedLookup2D:execution entity=${data.entityId} | rowValue=${toNumber(rowValue)} | colValue=${toNumber(colValue)} | rowIdx=${rowIdx} | colIdx=${colIdx} | outputGridCell=${op.outputGrid[rowIdx]?.[colIdx] ?? 0} | outputValue=${toNumber(output)}`;
    if (process.env.CALC_TRACE_VERBOSE === 'true') {
      if (data.traceCollector) data.traceCollector(_line); else console.log(_line);
    }
  }
  return output;
}

function executeScalarMultiply(
  op: ScalarMultiply,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const inputValue = resolveValue(op.input, data, inputLog, trace);
  const rateValue = typeof op.rate === 'number'
    ? toDecimal(op.rate)
    : resolveValue(op.rate, data, inputLog, trace);
  return inputValue.mul(rateValue);
}

function executeConditionalGate(
  op: ConditionalGate,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const leftVal = resolveSource(op.condition.left, data, inputLog);
  const rightVal = resolveSource(op.condition.right, data, inputLog);

  let conditionMet = false;
  switch (op.condition.operator) {
    case '>=': conditionMet = leftVal.gte(rightVal); break;
    case '>':  conditionMet = leftVal.gt(rightVal);  break;
    case '<=': conditionMet = leftVal.lte(rightVal); break;
    case '<':  conditionMet = leftVal.lt(rightVal);  break;
    case '=':  // AI plan interpreter produces single-equals for equality
    case '==': conditionMet = leftVal.eq(rightVal);  break;
    case '!=': conditionMet = !leftVal.eq(rightVal); break;
  }

  const branch = conditionMet ? op.onTrue : op.onFalse;
  return executeOperation(branch, data, inputLog, trace);
}

function executeAggregateOp(
  op: AggregateOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): Decimal {
  return resolveSource(op.source, data, inputLog);
}

function executeRatioOp(
  op: RatioOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>
): Decimal {
  const num = resolveSource(op.numerator, data, inputLog);
  const den = resolveSource(op.denominator, data, inputLog);
  if (den.isZero()) {
    return ZERO;
  }
  return num.div(den);
}

function executeConstantOp(op: ConstantOp): Decimal {
  return toDecimal(op.value);
}

// ──────────────────────────────────────────────
// Weighted Blend — N-input weighted combination
// ──────────────────────────────────────────────

function executeWeightedBlend(
  op: WeightedBlendOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const totalWeight = op.inputs.reduce((s, i) => s + i.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    inputLog['weighted_blend:weight_warning'] = {
      source: 'weighted_blend',
      rawValue: totalWeight,
      resolvedValue: totalWeight,
    };
  }

  let result = ZERO;
  for (let i = 0; i < op.inputs.length; i++) {
    const input = op.inputs[i];
    const value = resolveValue(input.source, data, inputLog, trace);
    const weighted = value.mul(toDecimal(input.weight));
    result = result.plus(weighted);
    inputLog[`blend_input_${i}`] = {
      source: 'weighted_blend',
      rawValue: toNumber(value),
      resolvedValue: toNumber(weighted),
    };
  }
  return result;
}

// ──────────────────────────────────────────────
// Temporal Window — rolling N-period aggregation
// ──────────────────────────────────────────────

function executeTemporalWindow(
  op: TemporalWindowOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const currentValue = resolveValue(op.input, data, inputLog, trace);

  // Build window values from period history
  const history = data.periodHistory ?? [];
  const historySlice = history.slice(-(op.windowSize));
  let windowValues: Decimal[] = historySlice.map(v => toDecimal(v));

  if (op.includeCurrentPeriod) {
    windowValues = [...windowValues, currentValue];
  }

  // Graceful degradation: no history → return current value
  if (windowValues.length === 0) {
    inputLog['temporal_window:no_history'] = {
      source: 'temporal_window',
      rawValue: toNumber(currentValue),
      resolvedValue: toNumber(currentValue),
    };
    return currentValue;
  }

  let result: Decimal;
  switch (op.aggregation) {
    case 'sum':
      result = windowValues.reduce((a, b) => a.plus(b), ZERO);
      break;
    case 'average': {
      const sum = windowValues.reduce((a, b) => a.plus(b), ZERO);
      result = sum.div(toDecimal(windowValues.length));
      break;
    }
    case 'min':
      result = windowValues.reduce((a, b) => a.lt(b) ? a : b);
      break;
    case 'max':
      result = windowValues.reduce((a, b) => a.gt(b) ? a : b);
      break;
    case 'trend': {
      // Linear regression slope: y = mx + b, return m
      const n = windowValues.length;
      if (n < 2) { result = ZERO; break; }
      const xMean = toDecimal((n - 1) / 2);
      const yMean = windowValues.reduce((a, b) => a.plus(b), ZERO).div(toDecimal(n));
      let num = ZERO;
      let den = ZERO;
      for (let i = 0; i < n; i++) {
        const xDiff = toDecimal(i).minus(xMean);
        num = num.plus(xDiff.mul(windowValues[i].minus(yMean)));
        den = den.plus(xDiff.mul(xDiff));
      }
      result = den.isZero() ? ZERO : num.div(den);
      break;
    }
  }

  inputLog['temporal_window'] = {
    source: 'temporal_window',
    rawValue: { windowSize: op.windowSize, aggregation: op.aggregation, valuesUsed: windowValues.length },
    resolvedValue: toNumber(result),
  };

  return result;
}

// ──────────────────────────────────────────────
// Operation Dispatch (returns Decimal — Decision 122)
// ──────────────────────────────────────────────

/**
 * OB-196 Phase 3 (E4 round-trip closure / Q-A.5.5): structured failure on
 * unknown operation at intent-executor dispatch surface. Mirrors Phase 2's
 * LegacyEngineUnknownComponentTypeError pattern at the next dispatch layer.
 */
export class IntentExecutorUnknownOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntentExecutorUnknownOperationError';
  }
}

// OB-117: Exported for use by evaluateComponent's calculationIntent fallback
export function executeOperation(
  op: IntentOperation,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  switch (op.operation) {
    case 'bounded_lookup_1d': return executeBoundedLookup1D(op, data, inputLog, trace);
    case 'bounded_lookup_2d': return executeBoundedLookup2D(op, data, inputLog, trace);
    case 'scalar_multiply':   return executeScalarMultiply(op, data, inputLog, trace);
    case 'conditional_gate':  return executeConditionalGate(op, data, inputLog, trace);
    case 'aggregate':         return executeAggregateOp(op, data, inputLog);
    case 'ratio':             return executeRatioOp(op, data, inputLog);
    case 'constant':          return executeConstantOp(op);
    case 'weighted_blend':    return executeWeightedBlend(op, data, inputLog, trace);
    case 'temporal_window':   return executeTemporalWindow(op, data, inputLog, trace);
    case 'linear_function':   return executeLinearFunction(op, data, inputLog, trace);
    case 'piecewise_linear':  return executePiecewiseLinear(op, data, inputLog, trace);
    default: {
      const operation = (op as { operation?: string }).operation ?? '<undefined>';
      throw new IntentExecutorUnknownOperationError(
        `[intent-executor] Unknown operation "${operation}" reached executeOperation. ` +
        `Foundational IntentOperation union admits only registered primitives. An unknown ` +
        `operation indicates either (1) an upstream cleanup gap producing a non-foundational ` +
        `operation string, or (2) data corruption in the persisted intent shape.`
      );
    }
  }
}

// ──────────────────────────────────────────────
// OB-180: Linear Function — y = slope * x + intercept
// ──────────────────────────────────────────────

function executeLinearFunction(
  op: import('./intent-types').LinearFunctionOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  const inputValue = resolveValue(op.input, data, inputLog, trace);
  const result = inputValue.mul(op.slope).plus(op.intercept);
  return result;
}

// ──────────────────────────────────────────────
// OB-180: Piecewise Linear — attainment selects rate, applied to base
// ──────────────────────────────────────────────

function executePiecewiseLinear(
  op: import('./intent-types').PiecewiseLinearOp,
  data: EntityData,
  inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
  trace: Partial<ExecutionTrace>
): Decimal {
  let ratio = toNumber(resolveValue(op.ratioInput, data, inputLog, trace));
  const baseValue = resolveValue(op.baseInput, data, inputLog, trace);

  // OB-186: If ratio resolved to 0 (missing denominator metric) and component
  // has a targetValue (quota), compute attainment = baseValue / targetValue.
  // This handles plans where quota is a plan parameter, not in transaction data.
  if (ratio === 0 && op.targetValue && op.targetValue > 0 && toNumber(baseValue) > 0) {
    ratio = toNumber(baseValue) / op.targetValue;
    inputLog['piecewise_linear:targetValue'] = {
      source: 'component_parameter',
      rawValue: op.targetValue,
      resolvedValue: ratio,
    };
  }

  // Find the matching segment
  for (const seg of op.segments) {
    const inRange = ratio >= seg.min && (seg.max === null || ratio < seg.max);
    if (inRange) {
      return baseValue.mul(seg.rate);
    }
  }

  // No segment matched — return zero
  return ZERO;
}

// ──────────────────────────────────────────────
// Modifier Application (Decimal — Decision 122)
// ──────────────────────────────────────────────

function applyModifiers(
  value: Decimal,
  modifiers: IntentModifier[],
  data: EntityData,
  modifierLog: Array<{ modifier: string; before: number; after: number }>
): Decimal {
  let result = value;

  for (const mod of modifiers) {
    const before = toNumber(result);

    switch (mod.modifier) {
      case 'cap': {
        const cap = toDecimal(mod.maxValue);
        result = result.gt(cap) ? cap : result;
        break;
      }
      case 'floor': {
        const floor = toDecimal(mod.minValue);
        result = result.lt(floor) ? floor : result;
        break;
      }
      case 'proration': {
        const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
        const num = resolveSource(mod.numerator, data, inputLog);
        const den = resolveSource(mod.denominator, data, inputLog);
        result = den.isZero() ? ZERO : result.mul(num.div(den));
        break;
      }
      case 'temporal_adjustment':
        // Temporal adjustment requires historical data — not applied in single-period execution
        break;
    }

    modifierLog.push({ modifier: mod.modifier, before, after: toNumber(result) });
  }

  return result;
}

// ──────────────────────────────────────────────
// Main Entry Point
// Decision 122: Decimal→number conversion at output boundary
// ──────────────────────────────────────────────

export function executeIntent(
  intent: ComponentIntent,
  entityData: EntityData
): ExecutionResult {
  const inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }> = {};
  const modifierLog: Array<{ modifier: string; before: number; after: number }> = [];
  // OB-196 Phase 3 (E4): trace carries foundational primitive identifier directly.
  // Top-level operation is intent.intent.operation; variant-routed primitives carry
  // identifier on the matched route's intent.operation, but the outer-shape op is
  // the foundational primitive that defines the component.
  const outerOp =
    (intent.intent && (intent.intent as { operation?: string }).operation) ||
    (intent.variants?.routes?.[0]?.intent && (intent.variants.routes[0].intent as { operation?: string }).operation) ||
    'unknown';
  const trace: Partial<ExecutionTrace> = {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    componentType: outerOp,
    confidence: intent.confidence,
  };

  let outcome = ZERO;

  // 1. Resolve variant routing (if present)
  if (intent.variants) {
    const routing = intent.variants;
    const attrSrc = routing.routingAttribute;

    // For entity_attribute source, resolve as string for matching
    let attrValue: string | number | boolean = '';
    if (attrSrc.source === 'entity_attribute') {
      attrValue = entityData.attributes[attrSrc.sourceSpec.attribute] ?? '';
    } else {
      attrValue = toNumber(resolveSource(attrSrc, entityData, inputLog));
    }

    const matchedRoute = routing.routes.find(r => String(r.matchValue) === String(attrValue));

    if (matchedRoute) {
      trace.variantRoute = {
        attribute: attrSrc.source === 'entity_attribute' ? attrSrc.sourceSpec.attribute : 'resolved',
        value: attrValue,
        matched: String(matchedRoute.matchValue),
      };
      outcome = executeOperation(matchedRoute.intent, entityData, inputLog, trace);
    } else {
      switch (routing.noMatchBehavior) {
        case 'first':
          if (routing.routes.length > 0) {
            outcome = executeOperation(routing.routes[0].intent, entityData, inputLog, trace);
          }
          break;
        case 'skip':
          outcome = ZERO;
          break;
        case 'error':
          outcome = ZERO;
          break;
      }
    }
  } else if (intent.intent) {
    // 2. Execute single operation (no variants)
    outcome = executeOperation(intent.intent, entityData, inputLog, trace);
  }

  // 3. Apply modifiers
  outcome = applyModifiers(outcome, intent.modifiers, entityData, modifierLog);

  // 4. Convert to native number at output boundary (Decision 122)
  const outcomeNumber = toNumber(outcome);

  // 5. Build complete trace
  const executionTrace: ExecutionTrace = {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    componentType: outerOp,
    variantRoute: trace.variantRoute,
    inputs: inputLog,
    lookupResolution: trace.lookupResolution,
    modifiers: modifierLog,
    finalOutcome: outcomeNumber,
    confidence: intent.confidence,
  };

  return {
    entityId: entityData.entityId,
    componentIndex: intent.componentIndex,
    outcome: outcomeNumber,
    trace: executionTrace,
  };
}
```

---

## E1_4_5_decimal-precision.md

# E1.4.5 — `web/src/lib/calculation/decimal-precision.ts` (verbatim full source)

```typescript
/**
 * Decimal Precision Module (Decision 122 — DS-010)
 *
 * The ONLY place where decimal.js is imported and configured.
 * All calculation code imports from this module, never directly from decimal.js.
 *
 * IEEE 754-2019 Section 4.3.1: roundTiesToEven (Banker's Rounding)
 * Eliminates systematic bias at scale (Goldberg 1991, Kahan 1996).
 */

import Decimal from 'decimal.js';
import type { OutputPrecision, RoundingTrace } from './intent-types';
import { DEFAULT_OUTPUT_PRECISION } from './intent-types';

// Configure decimal.js for financial calculation
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -9,
  toExpPos: 21,
});

// Re-export Decimal class for use in intent executor
export { Decimal };

/** Convert a native number to Decimal for precise arithmetic */
export function toDecimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

/** Convert Decimal back to native number (at output boundary only) */
export function toNumber(value: Decimal): number {
  return value.toNumber();
}

/** Cached zero constant — avoids repeated construction */
export const ZERO = new Decimal(0);

/** Round a component output per its outputPrecision and return the trace */
export function roundComponentOutput(
  rawValue: Decimal | number,
  componentIndex: number,
  label: string,
  precision?: OutputPrecision
): { rounded: Decimal; trace: RoundingTrace } {
  const prec = precision || DEFAULT_OUTPUT_PRECISION;
  const raw = rawValue instanceof Decimal ? rawValue : toDecimal(rawValue);

  const roundingMode = getRoundingMode(prec.roundingMethod);
  const rounded = raw.toDecimalPlaces(prec.decimalPlaces, roundingMode);

  return {
    rounded,
    trace: {
      componentIndex,
      label,
      rawValue: raw.toNumber(),
      roundedValue: rounded.toNumber(),
      roundingAdjustment: rounded.minus(raw).toNumber(),
      precision: prec,
    },
  };
}

function getRoundingMode(method: string): Decimal.Rounding {
  switch (method) {
    case 'half_even': return Decimal.ROUND_HALF_EVEN;
    case 'half_up': return Decimal.ROUND_HALF_UP;
    case 'floor': return Decimal.ROUND_FLOOR;
    case 'ceil': return Decimal.ROUND_CEIL;
    case 'truncate': return Decimal.ROUND_DOWN;
    default: return Decimal.ROUND_HALF_EVEN;
  }
}

/**
 * Infer outputPrecision from a component's plan structure.
 * Examines output values (boundary outputs, constant values, grid values, rates)
 * to determine if they are all integers → decimalPlaces: 0.
 *
 * Korean Test: examines numeric VALUES, not currency codes or locale strings.
 */
export function inferOutputPrecision(
  calculationIntent?: Record<string, unknown>,
  componentConfig?: Record<string, unknown>
): OutputPrecision {
  const values: number[] = [];

  // Collect output values from calculationIntent tree
  if (calculationIntent) {
    collectOutputValues(calculationIntent, values);
  }

  // Collect from legacy component configs
  if (componentConfig) {
    collectConfigValues(componentConfig, values);
  }

  if (values.length === 0) return DEFAULT_OUTPUT_PRECISION;

  // Check if all values are integers
  const allIntegers = values.every(v => Number.isInteger(v));
  if (allIntegers) {
    return { decimalPlaces: 0, roundingMethod: 'half_even', source: 'inferred_from_outputs' };
  }

  // Find max decimal places among values
  const maxDecimalPlaces = values.reduce((max, v) => {
    const str = v.toString();
    const dotIdx = str.indexOf('.');
    if (dotIdx < 0) return max;
    return Math.max(max, str.length - dotIdx - 1);
  }, 0);

  return {
    decimalPlaces: Math.min(maxDecimalPlaces, 10),
    roundingMethod: 'half_even',
    source: 'inferred_from_outputs',
  };
}

/** Recursively collect output values from an intent operation tree */
function collectOutputValues(op: Record<string, unknown>, values: number[]): void {
  if (!op || typeof op !== 'object') return;

  const operation = op.operation as string | undefined;

  switch (operation) {
    case 'bounded_lookup_1d': {
      const outputs = op.outputs as number[] | undefined;
      if (Array.isArray(outputs)) values.push(...outputs.filter(v => typeof v === 'number'));
      break;
    }
    case 'bounded_lookup_2d': {
      const grid = op.outputGrid as number[][] | undefined;
      if (Array.isArray(grid)) {
        for (const row of grid) {
          if (Array.isArray(row)) values.push(...row.filter(v => typeof v === 'number'));
        }
      }
      break;
    }
    case 'scalar_multiply': {
      if (typeof op.rate === 'number') values.push(op.rate);
      // Recurse into nested input/rate operations
      if (op.input && typeof op.input === 'object' && 'operation' in (op.input as Record<string, unknown>)) {
        collectOutputValues(op.input as Record<string, unknown>, values);
      }
      if (op.rate && typeof op.rate === 'object' && 'operation' in (op.rate as Record<string, unknown>)) {
        collectOutputValues(op.rate as Record<string, unknown>, values);
      }
      break;
    }
    case 'conditional_gate': {
      if (op.onTrue && typeof op.onTrue === 'object') {
        collectOutputValues(op.onTrue as Record<string, unknown>, values);
      }
      if (op.onFalse && typeof op.onFalse === 'object') {
        collectOutputValues(op.onFalse as Record<string, unknown>, values);
      }
      break;
    }
    case 'constant': {
      if (typeof op.value === 'number') values.push(op.value);
      break;
    }
  }
}

/** Collect output values from legacy component configs */
function collectConfigValues(config: Record<string, unknown>, values: number[]): void {
  // Tier config
  const tiers = (config as Record<string, unknown>).tiers as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(tiers)) {
    for (const tier of tiers) {
      if (typeof tier.payout === 'number') values.push(tier.payout);
      if (typeof tier.value === 'number') values.push(tier.value);
    }
  }

  // Matrix config
  const matrixValues = (config as Record<string, unknown>).values as number[][] | undefined;
  if (Array.isArray(matrixValues)) {
    for (const row of matrixValues) {
      if (Array.isArray(row)) values.push(...row.filter(v => typeof v === 'number'));
    }
  }

  // Percentage config
  if (typeof (config as Record<string, unknown>).rate === 'number') {
    values.push((config as Record<string, unknown>).rate as number);
  }

  // Conditional config
  const conditions = (config as Record<string, unknown>).conditions as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(conditions)) {
    for (const cond of conditions) {
      if (typeof cond.rate === 'number') values.push(cond.rate);
    }
  }
}
```

---

## E1_4_6_calc-time-entity-resolution.md

# E1.4.6 — `web/src/lib/sci/calc-time-entity-resolution.ts` (verbatim full source)

```typescript
/**
 * HF-196 Phase 2: Calc-time entity resolution.
 *
 * Implements the calc-time entity binding architecture per Decision 92
 * (Calculation Sovereignty / IGF-T1-E904) and OB-182's stated intent:
 * "engine resolves at calc time." The calc-side replacement for the
 * post-import back-link work that OB-182 removed.
 *
 * Engineering decision (architect-pre-authorized, HF-196 directive Phase 2):
 *   Durable update at calc time. Engine reads `committed_data.entity_id`
 *   directly (no engine refactor needed). Resolver UPDATEs the column for
 *   rows where entity_id IS NULL and an entities-table match exists.
 *
 * Coexists with HF-196 Phase 1 import-time back-link (defense in depth):
 *   Import-time path populates entity_id immediately for typical imports.
 *   Calc-time path catches any rows the import-time path missed (late-arriving
 *   data, prior tenant state, etc.). The two paths are mutually idempotent.
 *
 * Korean Test (IGF-T1-E910) compliance:
 *   - Tenant-agnostic: tenant_id is a runtime parameter
 *   - Entity matching delegates to resolveEntitiesFromCommittedData which
 *     uses structural identifiers from `field_identities` metadata, not
 *     hardcoded field names
 *   - Zero domain-specific string literals
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveEntitiesFromCommittedData } from './entity-resolution';

export interface CalcTimeEntityResolutionResult {
  totalNullRowsBefore: number;
  matched: number;
  unmatched: number;
  durationMs: number;
}

/**
 * Run calc-time entity resolution for a tenant.
 *
 * Reads count of `committed_data` rows with NULL `entity_id` (before),
 * delegates to `resolveEntitiesFromCommittedData` for structural matching
 * + back-link UPDATE, then reads count of NULL rows again (after) to
 * compute matched/unmatched counts.
 *
 * Idempotent: safe to call repeatedly. A second call against an already-
 * resolved tenant returns matched=0 since no rows remain with NULL entity_id
 * matchable against existing entities.
 *
 * Non-blocking: errors surface via console.error and the function returns
 * zeros for matched/unmatched. The calc run continues; rows with unresolved
 * entity_id are surfaced as data-quality signals (handled by caller).
 */
export async function resolveEntitiesAtCalcTime(
  tenantId: string,
  supabase: SupabaseClient,
): Promise<CalcTimeEntityResolutionResult> {
  const startedAt = Date.now();

  // Count rows with NULL entity_id before resolution
  const beforeCountQ = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null);

  if (beforeCountQ.error) {
    console.error(
      `[CalcTimeEntityResolution] tenant=${tenantId} pre-count query failed:`,
      beforeCountQ.error.message,
    );
    return {
      totalNullRowsBefore: 0,
      matched: 0,
      unmatched: 0,
      durationMs: Date.now() - startedAt,
    };
  }
  const totalNullRowsBefore = beforeCountQ.count ?? 0;

  if (totalNullRowsBefore === 0) {
    // No work to do
    return {
      totalNullRowsBefore: 0,
      matched: 0,
      unmatched: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  // Delegate structural matching to existing library function (Korean Test compliant)
  try {
    await resolveEntitiesFromCommittedData(supabase, tenantId);
  } catch (err) {
    console.error(
      `[CalcTimeEntityResolution] tenant=${tenantId} resolveEntitiesFromCommittedData threw (non-blocking):`,
      err,
    );
    return {
      totalNullRowsBefore,
      matched: 0,
      unmatched: totalNullRowsBefore,
      durationMs: Date.now() - startedAt,
    };
  }

  // Count rows still with NULL entity_id after resolution
  const afterCountQ = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null);

  if (afterCountQ.error) {
    console.error(
      `[CalcTimeEntityResolution] tenant=${tenantId} post-count query failed:`,
      afterCountQ.error.message,
    );
    return {
      totalNullRowsBefore,
      matched: 0,
      unmatched: totalNullRowsBefore,
      durationMs: Date.now() - startedAt,
    };
  }
  const unmatched = afterCountQ.count ?? 0;
  const matched = totalNullRowsBefore - unmatched;

  return {
    totalNullRowsBefore,
    matched,
    unmatched,
    durationMs: Date.now() - startedAt,
  };
}
```

---

## E1_4_7_synaptic-density.md

# E1.4.7 — `web/src/lib/calculation/synaptic-density.ts` (verbatim full source)

```typescript
/**
 * Synaptic Density Persistence
 *
 * Persists PatternDensity to Supabase synaptic_density table.
 * Loads at run start. Persists after consolidation.
 * Nuclear clear for fresh start / testing.
 *
 * ZERO domain language. Korean Test applies.
 * Fire-and-forget writes — never blocks the entity loop.
 *
 * NOTE: Uses untyped Supabase client because synaptic_density table
 * is not yet in the generated database.types.ts. After running
 * `supabase gen types`, the typed client can be used.
 */

import type { SynapticDensity, DensityUpdate, ExecutionMode } from './synaptic-types';

// Row shape from synaptic_density table
interface DensityRow {
  id: string;
  tenant_id: string;
  signature: string;
  confidence: number;
  execution_mode: string;
  total_executions: number;
  last_anomaly_rate: number;
  last_correction_count: number;
  learned_behaviors: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ──────────────────────────────────────────────
// Client Resolution — always untyped until types are regenerated
// ──────────────────────────────────────────────

async function getClient() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('[SynapticDensity] Missing Supabase env vars');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ──────────────────────────────────────────────
// Load — called once at run start
// ──────────────────────────────────────────────

/**
 * Load all PatternDensity entries for a tenant.
 * Returns a SynapticDensity map (signature → PatternDensity).
 * On failure, returns empty map — calculation proceeds without density.
 */
export async function loadDensity(tenantId: string): Promise<SynapticDensity> {
  const density: SynapticDensity = new Map();

  try {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from('synaptic_density')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[SynapticDensity] loadDensity failed:', error.message);
      return density;
    }

    for (const row of (data ?? []) as DensityRow[]) {
      density.set(row.signature, {
        signature: row.signature,
        confidence: row.confidence ?? 0.5,
        totalExecutions: row.total_executions ?? 0,
        lastAnomalyRate: row.last_anomaly_rate ?? 0,
        lastCorrectionCount: row.last_correction_count ?? 0,
        executionMode: (row.execution_mode ?? 'full_trace') as ExecutionMode,
        learnedBehaviors: (typeof row.learned_behaviors === 'object' && row.learned_behaviors !== null)
          ? row.learned_behaviors
          : {},
      });
    }
  } catch (err) {
    console.error('[SynapticDensity] loadDensity exception:', err);
  }

  return density;
}

// ──────────────────────────────────────────────
// Persist — called once after consolidation
// ──────────────────────────────────────────────

/**
 * Persist density updates to Supabase.
 * Uses upsert on (tenant_id, signature) to merge with existing.
 * Fire-and-forget — caller should `.catch()` this.
 */
export async function persistDensityUpdates(
  tenantId: string,
  updates: DensityUpdate[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (updates.length === 0) return { success: true, count: 0 };

  try {
    const supabase = await getClient();
    const rows = updates.map(u => ({
      tenant_id: tenantId,
      signature: u.signature,
      confidence: u.newConfidence,
      execution_mode: u.newMode,
      total_executions: u.totalExecutions,
      last_anomaly_rate: u.anomalyRate,
      updated_at: new Date().toISOString(),
    }));

    // Upsert in chunks of 500
    const CHUNK_SIZE = 500;
    let persisted = 0;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from('synaptic_density')
        .upsert(chunk, { onConflict: 'tenant_id,signature' });

      if (error) {
        console.error('[SynapticDensity] persistDensityUpdates chunk failed:', error.message);
        return { success: false, count: persisted, error: error.message };
      }
      persisted += chunk.length;
    }

    return { success: true, count: persisted };
  } catch (err) {
    console.error('[SynapticDensity] persistDensityUpdates exception:', err);
    return { success: false, count: 0, error: String(err) };
  }
}

// ──────────────────────────────────────────────
// Nuclear Clear — for testing / fresh start
// ──────────────────────────────────────────────

/**
 * Delete ALL density entries for a tenant.
 * Irreversible. Use with care.
 */
export async function nuclearClearDensity(
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getClient();
    const { error } = await supabase
      .from('synaptic_density')
      .delete()
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[SynapticDensity] nuclearClear failed:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error('[SynapticDensity] nuclearClear exception:', err);
    return { success: false, error: String(err) };
  }
}
```

---

## E1_4_8_synaptic-surface.md

# E1.4.8 — `web/src/lib/calculation/synaptic-surface.ts` (verbatim full source)

```typescript
/**
 * Synaptic Surface — In-Memory Shared Computation State
 *
 * Created per calculation run. Destroyed after consolidation.
 * ZERO domain language. Korean Test applies.
 *
 * O(1) read/write. No DB calls during entity loop.
 */

import type {
  Synapse,
  SynapseType,
  SynapticSurface,
  SynapticDensity,
  ExecutionMode,
  DensityUpdate,
} from './synaptic-types';
import { DENSITY_THRESHOLDS } from './synaptic-types';

// ──────────────────────────────────────────────
// Surface Creation
// ──────────────────────────────────────────────

/**
 * Create a new SynapticSurface for a calculation run.
 * Optionally pre-populate from persistent density.
 */
export function createSynapticSurface(density?: SynapticDensity): SynapticSurface {
  return {
    runSynapses: new Map(),
    componentSynapses: new Map(),
    entitySynapses: new Map(),
    density: density ?? new Map(),
    stats: {
      totalSynapsesWritten: 0,
      anomalyCount: 0,
      correctionCount: 0,
      entityCount: 0,
      componentCount: 0,
      startTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    },
  };
}

// ──────────────────────────────────────────────
// Synapse Write — O(1)
// ──────────────────────────────────────────────

/**
 * Write a synapse to the surface.
 * Appends to the appropriate scope map.
 */
export function writeSynapse(surface: SynapticSurface, synapse: Synapse): void {
  surface.stats.totalSynapsesWritten++;

  if (synapse.type === 'anomaly') surface.stats.anomalyCount++;
  if (synapse.type === 'correction') surface.stats.correctionCount++;

  // Run-level
  if (!surface.runSynapses.has(synapse.type)) {
    surface.runSynapses.set(synapse.type, []);
  }
  surface.runSynapses.get(synapse.type)!.push(synapse);

  // Component-level
  if (!surface.componentSynapses.has(synapse.componentIndex)) {
    surface.componentSynapses.set(synapse.componentIndex, new Map());
  }
  const compMap = surface.componentSynapses.get(synapse.componentIndex)!;
  if (!compMap.has(synapse.type)) {
    compMap.set(synapse.type, []);
  }
  compMap.get(synapse.type)!.push(synapse);

  // Entity-level (if entityId present)
  if (synapse.entityId) {
    if (!surface.entitySynapses.has(synapse.entityId)) {
      surface.entitySynapses.set(synapse.entityId, new Map());
    }
    const entityMap = surface.entitySynapses.get(synapse.entityId)!;
    if (!entityMap.has(synapse.type)) {
      entityMap.set(synapse.type, []);
    }
    entityMap.get(synapse.type)!.push(synapse);
  }
}

// ──────────────────────────────────────────────
// Synapse Read — O(1) lookup + O(n) filter
// ──────────────────────────────────────────────

/**
 * Read synapses from the surface.
 */
export function readSynapses(
  surface: SynapticSurface,
  type: SynapseType,
  scope: 'run' | 'component' | 'entity',
  key?: string | number
): Synapse[] {
  switch (scope) {
    case 'run':
      return surface.runSynapses.get(type) ?? [];
    case 'component': {
      if (key === undefined) return [];
      const compMap = surface.componentSynapses.get(key as number);
      return compMap?.get(type) ?? [];
    }
    case 'entity': {
      if (key === undefined) return [];
      const entityMap = surface.entitySynapses.get(key as string);
      return entityMap?.get(type) ?? [];
    }
  }
}

// ──────────────────────────────────────────────
// Execution Mode — density-driven
// ──────────────────────────────────────────────

/**
 * Determine execution mode from density for a given pattern.
 */
export function getExecutionMode(
  surface: SynapticSurface,
  patternSignature: string
): ExecutionMode {
  const density = surface.density.get(patternSignature);
  if (!density) return 'full_trace';

  if (density.confidence >= DENSITY_THRESHOLDS.SILENT_MIN) return 'silent';
  if (density.confidence >= DENSITY_THRESHOLDS.FULL_TRACE_MAX) return 'light_trace';
  return 'full_trace';
}

// ──────────────────────────────────────────────
// Consolidation — after the run
// ──────────────────────────────────────────────

/**
 * Consolidate the surface into density updates and signal batch.
 * Called once after the entity loop completes.
 */
export function consolidateSurface(surface: SynapticSurface): {
  densityUpdates: DensityUpdate[];
  signalBatch: Array<Record<string, unknown>>;
} {
  const densityUpdates: DensityUpdate[] = [];
  const signalBatch: Array<Record<string, unknown>> = [];

  // Group confidence synapses by componentIndex to compute per-pattern density
  const componentConfidences = new Map<number, number[]>();
  const componentAnomalies = new Map<number, number>();

  for (const [compIdx, typeMap] of Array.from(surface.componentSynapses.entries())) {
    const confidences = typeMap.get('confidence') ?? [];
    componentConfidences.set(compIdx, confidences.map(s => s.value));

    const anomalies = typeMap.get('anomaly') ?? [];
    componentAnomalies.set(compIdx, anomalies.length);
  }

  // For each pattern in density, compute updated confidence
  for (const [signature, existing] of Array.from(surface.density.entries())) {
    // Find which componentIndex maps to this signature
    // (The mapping is established when writing synapses — we use the pattern synapse)
    const patternSynapses = (surface.runSynapses.get('pattern') ?? [])
      .filter(s => s.detail === signature);

    if (patternSynapses.length === 0) continue;

    const compIdx = patternSynapses[0].componentIndex;
    const confidences = componentConfidences.get(compIdx) ?? [];
    const anomalyCount = componentAnomalies.get(compIdx) ?? 0;
    const entityCount = Math.max(surface.stats.entityCount, 1);

    // Compute new confidence: weighted average of existing + this run
    const runConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : existing.confidence;

    const anomalyRate = anomalyCount / entityCount;

    // Exponential moving average: 70% new, 30% existing
    const newConfidence = Math.max(0, Math.min(1,
      existing.confidence * 0.3 + runConfidence * 0.7 - anomalyRate * 0.1
    ));

    const newMode: ExecutionMode =
      newConfidence >= DENSITY_THRESHOLDS.SILENT_MIN ? 'silent' :
      newConfidence >= DENSITY_THRESHOLDS.FULL_TRACE_MAX ? 'light_trace' :
      'full_trace';

    densityUpdates.push({
      signature,
      newConfidence,
      newMode,
      totalExecutions: existing.totalExecutions + entityCount,
      anomalyRate,
    });

    // Training signal per component (not per entity)
    signalBatch.push({
      signalType: 'lifecycle:synaptic_consolidation',
      signalValue: {
        signature,
        previousConfidence: existing.confidence,
        newConfidence,
        executionMode: newMode,
        anomalyRate,
        entityCount,
      },
    });
  }

  return { densityUpdates, signalBatch };
}

/**
 * Initialize density entries for new patterns not yet in density.
 * Called when a pattern is first seen for a tenant.
 */
export function initializePatternDensity(
  surface: SynapticSurface,
  signature: string,
  componentIndex: number
): void {
  if (!surface.density.has(signature)) {
    surface.density.set(signature, {
      signature,
      confidence: 0.5,
      totalExecutions: 0,
      lastAnomalyRate: 0,
      lastCorrectionCount: 0,
      executionMode: 'full_trace',
      learnedBehaviors: {},
    });
  }

  // Write a pattern synapse to track signature → componentIndex mapping
  writeSynapse(surface, {
    type: 'pattern',
    componentIndex,
    value: 0.5,
    detail: signature,
    timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
  });
}
```

---

## E1_4_9_pattern-signature.md

# E1.4.9 — `web/src/lib/calculation/pattern-signature.ts` (verbatim full source)

```typescript
/**
 * Pattern Signature Generator
 *
 * Produces structural hashes from ComponentIntent.
 * Zero domain language. Purely structural description.
 *
 * Examples:
 *   "bounded_lookup_2d:ratio+metric:g2x2:entity"
 *   "bounded_lookup_1d:metric:b3:entity"
 *   "scalar_multiply:metric:rate_num:entity"
 *   "scalar_multiply:metric:rate_op(bounded_lookup_1d):entity"
 *   "conditional_gate:metric+constant:entity"
 */

import type { ComponentIntent, IntentOperation, IntentSource } from './intent-types';
import { isIntentOperation } from './intent-types';

/**
 * Generate a structural signature for a ComponentIntent.
 * Same structure → same signature, regardless of labels or metric names.
 */
export function generatePatternSignature(intent: ComponentIntent): string {
  const scope = intent.dataSource.entityScope;
  const modifiers = intent.modifiers.length > 0
    ? ':' + intent.modifiers.map(m => m.modifier).sort().join('+')
    : '';

  if (intent.variants) {
    return `variant:${intent.variants.routes.length}routes:${scope}${modifiers}`;
  }

  if (!intent.intent) {
    return `empty:${scope}${modifiers}`;
  }

  return `${describeOperation(intent.intent)}:${scope}${modifiers}`;
}

/**
 * Describe an operation structurally (recursive for nested ops).
 */
function describeOperation(op: IntentOperation): string {
  switch (op.operation) {
    case 'bounded_lookup_1d':
      return `bounded_lookup_1d:${describeInput(op.input)}:b${op.boundaries.length}`;

    case 'bounded_lookup_2d':
      return `bounded_lookup_2d:${describeInput(op.inputs.row)}+${describeInput(op.inputs.column)}:g${op.rowBoundaries.length}x${op.columnBoundaries.length}`;

    case 'scalar_multiply': {
      const rateDesc = typeof op.rate === 'number'
        ? 'rate_num'
        : `rate_op(${describeOperation(op.rate)})`;
      return `scalar_multiply:${describeInput(op.input)}:${rateDesc}`;
    }

    case 'conditional_gate':
      return `conditional_gate:${describeInput(op.condition.left)}+${describeInput(op.condition.right)}`;

    case 'aggregate':
      return `aggregate:${describeSourceType(op.source)}`;

    case 'ratio':
      return `ratio:${describeSourceType(op.numerator)}+${describeSourceType(op.denominator)}`;

    case 'constant':
      return 'constant';

    case 'weighted_blend':
      return `weighted_blend:${op.inputs.length}inputs:${op.inputs.map(i => describeInput(i.source)).join('+')}`;

    case 'temporal_window':
      return `temporal_window:${op.aggregation}:${op.windowSize}periods:${describeInput(op.input)}`;

    case 'linear_function':
      return `linear_function:${describeInput(op.input)}:slope${op.slope}:int${op.intercept}`;

    case 'piecewise_linear':
      return `piecewise_linear:${describeInput(op.ratioInput)}:${describeInput(op.baseInput)}:${op.segments.length}seg`;
  }
}

/**
 * Describe an input that may be IntentSource or IntentOperation.
 */
function describeInput(input: IntentSource | IntentOperation): string {
  if (isIntentOperation(input)) {
    return `op(${describeOperation(input)})`;
  }
  return describeSourceType(input);
}

/**
 * Describe a source type (just the kind, not the field name).
 */
function describeSourceType(src: IntentSource): string {
  return src.source;
}
```

---

## E1_5_arithmetic_sites.md

# E1.5 — Arithmetic site inventory (verbatim)

Lines where an arithmetic operator (`*`, `/`, `+`, `-`, `Math.*`) appears AND the line mentions any of: `c4`, `fleet`, `utilization`, `component`, `value`, `actual`, `expected`, `rate`, `amount`, `total`, `result` (case-insensitive). Files scanned: route.ts + 14 E1.4 source files.

**Command:**
```bash
grep -nHE "[*/+-]|Math\\." <files> | grep -iE "c4|fleet|utilization|component|\\bvalue\\b|actual|expected|\\brate\\b|\\bamount\\b|\\btotal\\b|\\bresult\\b"
```

**Output (218 lines verbatim):**
```
web/src/app/api/calculation/run/route.ts:7: * this proves the actual engine logic, not a reimplementation.
web/src/app/api/calculation/run/route.ts:12:// OB-150: Production timeout fix (processes all entities × components)
web/src/app/api/calculation/run/route.ts:32:import type { ComponentIntent, RoundingTrace } from '@/lib/calculation/intent-types';
web/src/app/api/calculation/run/route.ts:33:import type { PlanComponent } from '@/types/compensation-plan';
web/src/app/api/calculation/run/route.ts:34:import { toNumber, roundComponentOutput, inferOutputPrecision, ZERO } from '@/lib/calculation/decimal-precision';
web/src/app/api/calculation/run/route.ts:135:  // HF-211: Per-component totals accumulator — sum of rounded outcomes per component index.
web/src/app/api/calculation/run/route.ts:136:  // Populated at component_complete site UNCONDITIONALLY (every entity, every component);
web/src/app/api/calculation/run/route.ts:137:  // surfaced in [CalcRecon] block per-component breakdown for direct ground-truth reconciliation.
web/src/app/api/calculation/run/route.ts:188:  // Parse components from JSONB — handle 3 formats:
web/src/app/api/calculation/run/route.ts:190:  // 2. Wrapped object: { components: [{id, name, ...}, ...] }
web/src/app/api/calculation/run/route.ts:191:  // 3. Legacy nested: { variants: [{ components: [...] }] }
web/src/app/api/calculation/run/route.ts:200:      // OB-153: Wrapped object format { components: [...] }
web/src/app/api/calculation/run/route.ts:203:      // Legacy nested format: { variants: [{ components: [...] }] }
web/src/app/api/calculation/run/route.ts:265:          addLog(`HF-165: Convergence complete — ${derivationCount} derivations, ${bindingCount} component bindings, ${gapCount} gaps`);
web/src/app/api/calculation/run/route.ts:269:            addLog(`HF-165 Gap: ${gap.component} — ${gap.reason}`);
web/src/app/api/calculation/run/route.ts:311:  // Maps semantic metric names (in components) to raw field names (in row_data)
web/src/app/api/calculation/run/route.ts:318:  // Per-component bindings: { component_N: { actual: { source_batch_id, column, ... }, ... } }
web/src/app/api/calculation/run/route.ts:323:    addLog(`HF-108 Using convergence_bindings (Decision 111) for data resolution — ${bindingCount} component bindings`);
web/src/app/api/calculation/run/route.ts:334:  // ── OB-76: Transform components to intents (once, before entity loop) ──
web/src/app/api/calculation/run/route.ts:336:  addLog(`OB-76 Intent layer: ${componentIntents.length} components transformed to intents`);
web/src/app/api/calculation/run/route.ts:582:  // Korean Test: discovers by VALUE matching (entity external_ids), not by field name
web/src/app/api/calculation/run/route.ts:669:  // Key is the VALUE of row_data[entity_identifier_column], NOT the entity_id FK UUID
web/src/app/api/calculation/run/route.ts:680:      // HF-111: Index ALL binding role batches (actual, target, row, column, numerator, denominator)
web/src/app/api/calculation/run/route.ts:692:    // Step 2: Index committed_data by row_data[entity_column] value (DS-009 pattern)
web/src/app/api/calculation/run/route.ts:989:            existing[key] = (existing[key] ?? 0) + value;
web/src/app/api/calculation/run/route.ts:998:  // Korean Test: PASSES — AI determined sheet→component mapping at import time
web/src/app/api/calculation/run/route.ts:1071:  // Generate pattern signatures and initialize density for each component
web/src/app/api/calculation/run/route.ts:1166:  // Resolves metrics for a component using convergence_bindings (batch_id + column)
web/src/app/api/calculation/run/route.ts:1186:      bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:entry entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} componentName=${JSON.stringify(component.name)} | compBindingsKeys=${Object.keys(compBindings).join(',')}`);
web/src/app/api/calculation/run/route.ts:1188:    // HF-111: Support multiple binding roles — actual, row, column, numerator, denominator
web/src/app/api/calculation/run/route.ts:1218:        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | slot=ratio | rawNum=${rawNumValue} | numScale=${numBinding.scale_factor ?? 'undefined'} | postNum=${numValue} | rawDen=${rawDenValue} | denScale=${denBinding.scale_factor ?? 'undefined'} | postDen=${denValue}`);
web/src/app/api/calculation/run/route.ts:1222:        metrics[expectedMetrics[0]] = numValue / denValue;
web/src/app/api/calculation/run/route.ts:1226:        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | path=ratio | metrics=${JSON.stringify(metrics)} | returnedNull=${result === null}`);
web/src/app/api/calculation/run/route.ts:1231:    // Single or dual input (actual + target, or row + column)
web/src/app/api/calculation/run/route.ts:1238:          bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | path=single_actual_null | returnedNull=true`);
web/src/app/api/calculation/run/route.ts:1245:      if (actualBinding.scale_factor) actualValue *= actualBinding.scale_factor;
web/src/app/api/calculation/run/route.ts:1248:        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | slot=actual | rawActual=${rawActualValue} | actualScale=${actualBinding.scale_factor ?? 'undefined'} | postActual=${actualValue} | metricKey=${expectedMetrics[0]}`);
web/src/app/api/calculation/run/route.ts:1253:      // Resolve target/column value if binding exists
web/src/app/api/calculation/run/route.ts:1262:          bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | slot=target | rawTarget=${rawTargetValue} | targetScale=${targetBinding.scale_factor ?? 'undefined'} | postTarget=${targetValue}`);
web/src/app/api/calculation/run/route.ts:1271:          // Only compute attainment for actual+target pairs, NOT row+column 2D lookups
web/src/app/api/calculation/run/route.ts:1273:            metrics['attainment'] = actualValue / targetValue;
web/src/app/api/calculation/run/route.ts:1275:              bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:attainment_computed entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | actualValue=${actualValue} | targetValue=${targetValue} | attainment=${metrics['attainment']}`);
web/src/app/api/calculation/run/route.ts:1284:      bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | path=single_or_dual | metrics=${JSON.stringify(result)} | returnedNull=${result === null}`);
web/src/app/api/calculation/run/route.ts:1289:  // HF-109: Resolve a single column value for an entity from the batch data cache (DS-009 5.1).
web/src/app/api/calculation/run/route.ts:1325:    // DS-009 5.1: look up by external_id — the cache key IS the entity identifier value
web/src/app/api/calculation/run/route.ts:1527:  addLog(`[CalcRecon-T1] entitiesAssigned=${calculationEntityIds.length} components=${defaultComponents.length}`);
web/src/app/api/calculation/run/route.ts:1529:  addLog(`[CalcRecon-T1] componentList=[${t1ComponentNames}]`);
web/src/app/api/calculation/run/route.ts:1538:    // HF-212: Per-entity component breakdown. Cleared per iteration.
web/src/app/api/calculation/run/route.ts:1539:    // Populated at component_complete site (per-component); consumed at Tier 2 emission.
web/src/app/api/calculation/run/route.ts:1592:        // Tie on discriminants — try total overlap
web/src/app/api/calculation/run/route.ts:1686:    for (let compIdx = 0; compIdx < selectedComponents.length; compIdx++) {
web/src/app/api/calculation/run/route.ts:1691:      // Old sheet-matching path (buildMetricsForComponent) is FALLBACK for pre-OB-162 data.
web/src/app/api/calculation/run/route.ts:1715:        // FALLBACK: Old sheet-matching path (no convergence bindings for this component)
web/src/app/api/calculation/run/route.ts:1737:          metrics[key] = value;  // derivation fills gaps only; convergence values preserved
web/src/app/api/calculation/run/route.ts:1741:          addLog(`[CalcRecon-T3] EXCEPTION entity=${entityInfo?.external_id ?? entityId} component=${compIdx} type=ob118MergeGuardFired existingKey=${key} preserved=convergence`);
web/src/app/api/calculation/run/route.ts:1746:      // Compare metric values against the component's band ranges (from the plan spec).
web/src/app/api/calculation/run/route.ts:1747:      // If value is in decimal range (0-2) but the band expects percentage range (max > 10),
web/src/app/api/calculation/run/route.ts:1794:            metrics[key] = value * 100;
web/src/app/api/calculation/run/route.ts:1799:              metrics[key] = value * 100;
web/src/app/api/calculation/run/route.ts:1806:      // HF-122: Per-component rounding (Decision 122).
web/src/app/api/calculation/run/route.ts:1823:    // HF-188: Legacy total preserved for concordance comparison only
web/src/app/api/calculation/run/route.ts:1827:    // HF-119: Use selected variant's intents, not always defaultComponents
web/src/app/api/calculation/run/route.ts:1917:      // cutover completion). Per-component metrics map MUST be populated; fail fast
web/src/app/api/calculation/run/route.ts:1918:      // if not (rather than silently falling back to seeds-era raw-row-value map).
web/src/app/api/calculation/run/route.ts:1924:          `HF-205 invariant: per-component metrics missing for component ${ci.componentIndex} ` +
web/src/app/api/calculation/run/route.ts:1926:          `must populate metrics for every component before intent-executor handoff. ` +
web/src/app/api/calculation/run/route.ts:1954:      // Override componentResults payout with intent-authority value
web/src/app/api/calculation/run/route.ts:1963:      // HF-211: Accumulate per-component total UNCONDITIONALLY (every entity, every component).
web/src/app/api/calculation/run/route.ts:1964:      // Source for [CalcRecon] block per-component breakdown — independent of trace cap.
web/src/app/api/calculation/run/route.ts:1968:        total: (_existingCompTotal?.total ?? 0) + (Number(roundedValue) || 0),
web/src/app/api/calculation/run/route.ts:1971:      // HF-212 TIER 2: Per-entity component breakdown — accumulate THIS entity's
web/src/app/api/calculation/run/route.ts:1972:      // per-component totals for the Tier 2 summary line emitted after the per-entity total.
web/src/app/api/calculation/run/route.ts:1975:        (perEntityComponentBreakdown.get(ci.componentIndex) ?? 0) + (Number(roundedValue) || 0),
web/src/app/api/calculation/run/route.ts:1995:    // ── SYNAPTIC: Write per-component confidence synapses ──
web/src/app/api/calculation/run/route.ts:1996:    for (let ci = 0; ci < componentIntents.length; ci++) {
web/src/app/api/calculation/run/route.ts:1997:      const compMatch = componentResults[ci] && Math.abs(componentResults[ci].payout - (priorResults[ci] ?? 0)) < 0.01;
web/src/app/api/calculation/run/route.ts:2063:      addLog(`[CalcRecon-T2] ${t2ExternalId} | ${t2EntityName} | variant=${variantKey} | total=${entityTotal} | components=[${t2Breakdown}] | flags=[${currentEntityFlags.join(',')}]`);
web/src/app/api/calculation/run/route.ts:2158:      console.warn('[CalcAPI] Dual-path concordance signal unexpected error:', err instanceof Error ? err.message : String(err));
web/src/app/api/calculation/run/route.ts:2366:  // ── OB-83: Domain Agent dispatch — score result through IAP ──
web/src/app/api/calculation/run/route.ts:2368:  const avgConfidence = concordanceRate / 100; // concordance rate as 0-1 confidence
web/src/app/api/calculation/run/route.ts:2372:    null, // actual results are in the response body below
web/src/app/api/calculation/run/route.ts:2395:            addLog(`[CalcRecon-T3] EXCEPTION component=${compKey} role=${role} type=boundaryFallback`);
web/src/app/api/calculation/run/route.ts:2403:  const t1FooterTotalLookups = entityResults.length * (((ruleSet.components as unknown[]) ?? []).length);
web/src/app/api/calculation/run/route.ts:2406:  const t1SortedComponents = Array.from(componentTotals.entries()).sort((a, b) => a[0] - b[0]);
web/src/app/api/calculation/run/route.ts:2408:  addLog(`[CalcRecon-T1] componentTotals=[${t1ComponentSummary}]`);
web/src/lib/calculation/run-calculation.ts:17:import type { PlanComponent } from '@/types/compensation-plan';
web/src/lib/calculation/run-calculation.ts:24:import { toNumber, roundComponentOutput, inferOutputPrecision } from '@/lib/calculation/decimal-precision';
web/src/lib/calculation/run-calculation.ts:75:  scale_factor?: number;       // multiply ratio result (e.g., 100 for percentage)
web/src/lib/calculation/run-calculation.ts:88: * @returns Map of derived metric name → numeric value
web/src/lib/calculation/run-calculation.ts:147:        if (typeof val === 'number') total += val;
web/src/lib/calculation/run-calculation.ts:224:// Legacy component evaluators (evaluateTierLookup, evaluatePercentage,
web/src/lib/calculation/run-calculation.ts:252:  // Post-Phase-1.7, ComponentType union admits foundational identifiers only — legacy
web/src/lib/calculation/run-calculation.ts:272:        `[run-calculation] Unreachable componentType reached evaluateComponent: ` +
web/src/lib/calculation/run-calculation.ts:273:        `"${component.componentType as string}" (componentId=${component.id}, ` +
web/src/lib/calculation/run-calculation.ts:274:        `componentName=${component.name}). Foundational ComponentType union admits ` +
web/src/lib/calculation/run-calculation.ts:282:  // and the component has an AI-produced calculationIntent, attempt evaluation
web/src/lib/calculation/run-calculation.ts:291:      // operations (rate × volume), but the executor only handles nested IntentOperations.
web/src/lib/calculation/run-calculation.ts:293:      //         → scalar_multiply{input: volume, rate: bounded_lookup_1d}
web/src/lib/calculation/run-calculation.ts:306:      // OB-120: Auto-detect isMarginal for bounded_lookup_1d with rate-like outputs.
web/src/lib/calculation/run-calculation.ts:307:      // Mirrors OB-117 rate heuristic in evaluateTierLookup: if all non-zero outputs
web/src/lib/calculation/run-calculation.ts:308:      // are < 1.0, they represent rates to multiply against the input value.
web/src/lib/calculation/run-calculation.ts:371:        result[key] = (result[key] || 0) + value;
web/src/lib/calculation/run-calculation.ts:390: * Find which sheet (data_type) feeds a given plan component.
web/src/lib/calculation/run-calculation.ts:404:      componentName, // componentId = componentName for matching
web/src/lib/calculation/run-calculation.ts:413:  const normComponent = componentName.toLowerCase().replace(/[-\s]/g, '_');
web/src/lib/calculation/run-calculation.ts:431: * Get all metric names a component expects from its configuration.
web/src/lib/calculation/run-calculation.ts:501:  // IntentSource of other kinds (constant, entity_attribute, prior_component,
web/src/lib/calculation/run-calculation.ts:516: * Compute attainment from goal + actual if not already present.
web/src/lib/calculation/run-calculation.ts:522:    const computedAttainment = actual / metrics['goal'];
web/src/lib/calculation/run-calculation.ts:523:    // Override if attainment is missing or looks like a monetary value (>1000)
web/src/lib/calculation/run-calculation.ts:531: * Build metrics for a specific component using source-aware resolution.
web/src/lib/calculation/run-calculation.ts:537: * 2. Build store context from ALL store sheets (shared across components)
web/src/lib/calculation/run-calculation.ts:551:  // Step 1: Match entity-level sheet for this component
web/src/lib/calculation/run-calculation.ts:557:  // find the sheet whose data columns best overlap the component's expected metrics.
web/src/lib/calculation/run-calculation.ts:589:  // Step 2: Match store-level sheet for this component
web/src/lib/calculation/run-calculation.ts:630:  // (e.g., amount from tienda+cobranza = 99M instead of tienda-only 44M).
web/src/lib/calculation/run-calculation.ts:653:  // Step 4: Resolve expected metrics with source preference
web/src/lib/calculation/run-calculation.ts:678:    // Semantic resolution: infer what kind of value this metric name needs
web/src/lib/calculation/run-calculation.ts:713:      // First try literal semantic key (e.g., metrics["amount"])
web/src/lib/calculation/run-calculation.ts:765:  // Maps semantic metric names (used by components) to raw field names (in row_data).
web/src/lib/calculation/run-calculation.ts:767:  // Uses FIRST-VALUE extraction (not sum) to handle duplicate rows correctly.
web/src/lib/calculation/run-calculation.ts:769:    // Build first-value pool: scan ALL entity + store rows for field values
web/src/lib/calculation/run-calculation.ts:831:  // Parse components from JSONB — handle 3 formats:
web/src/lib/calculation/run-calculation.ts:833:  // 2. Wrapped object: { components: [{id, name, ...}, ...] }
web/src/lib/calculation/run-calculation.ts:834:  // 3. Legacy nested: { variants: [{ components: [...] }] }
web/src/lib/calculation/run-calculation.ts:843:      // OB-153: Wrapped object format { components: [...] }
web/src/lib/calculation/run-calculation.ts:846:      // Legacy nested format: { variants: [{ components: [...] }] }
web/src/lib/calculation/run-calculation.ts:1374:    // Evaluate each component with sheet-aware metrics
web/src/lib/calculation/run-calculation.ts:1390:      // buildMetricsForComponent normalizes but the derivation override can
web/src/lib/calculation/run-calculation.ts:1395:          metrics[key] = value * 100;
web/src/lib/calculation/run-calculation.ts:1400:      // HF-122: Per-component rounding (Decision 122).
web/src/lib/calculation/run-calculation.ts:1402:      // intent only. inferOutputPrecision tolerates undefined componentConfig.
web/src/lib/calculation/run-calculation.ts:1409:      entityTotal += result.payout;
web/src/lib/orchestration/metric-resolver.ts:7: * The aggregation produces semantic values (attainment, amount, goal).
web/src/lib/orchestration/metric-resolver.ts:20:  /rate/i,
web/src/lib/orchestration/metric-resolver.ts:34:  /amount/i,
web/src/lib/orchestration/metric-resolver.ts:36:  /total/i,
web/src/lib/orchestration/metric-resolver.ts:38:  /value/i,
web/src/lib/orchestration/metric-resolver.ts:69: * Priority order ensures "sales_attainment" returns 'attainment' not 'amount'.
web/src/lib/orchestration/metric-resolver.ts:75:  // "sales_attainment" should be attainment, not amount)
web/src/lib/orchestration/metric-resolver.ts:93: * Component metric configuration - extracted from plan component configs
web/src/lib/orchestration/metric-resolver.ts:103: * For a given plan component, determine which aggregated semantic value
web/src/lib/orchestration/metric-resolver.ts:104: * maps to each of the plan's expected metric names.
web/src/lib/orchestration/metric-resolver.ts:140: * Build the metrics object for one employee on one plan component.
web/src/lib/orchestration/metric-resolver.ts:142: * Takes the plan's expected metric names and fills them with the
web/src/lib/orchestration/metric-resolver.ts:146: * - tier_lookup components ONLY accept attainment values (no amount fallback)
web/src/lib/orchestration/metric-resolver.ts:150: * @param component - Plan component with metric name config
web/src/lib/orchestration/metric-resolver.ts:151: * @param sheetMetrics - Aggregated semantic values {attainment, amount, goal, quantity}
web/src/lib/orchestration/metric-resolver.ts:152: * @param componentType - Optional: the plan component type (tier_lookup, matrix_lookup, etc.)
web/src/lib/orchestration/metric-resolver.ts:153: * @returns Metrics object with plan-expected keys and aggregated values
web/src/lib/orchestration/metric-resolver.ts:175:        // OB-29 Phase 3B: For tier_lookup, amount is INVALID - it expects attainment
web/src/lib/orchestration/metric-resolver.ts:200:          // Unknown type - try amount as fallback (most common) for non-tier_lookup
web/src/lib/orchestration/metric-resolver.ts:224: * Extract metric configuration from a plan component's foundational intent.
web/src/lib/orchestration/metric-resolver.ts:246:      `[metric-resolver] Missing metadata.intent and calculationIntent on component ` +
web/src/lib/orchestration/metric-resolver.ts:247:      `${component.id ?? '<unknown id>'} (${component.name ?? '<unknown name>'}). ` +
web/src/lib/orchestration/metric-resolver.ts:297: * Find the sheet that matches a plan component by matching component names/IDs.
web/src/lib/orchestration/metric-resolver.ts:298: * The AI Import Context stores which sheet feeds which plan component.
web/src/lib/orchestration/metric-resolver.ts:313:  const normName = componentName.toLowerCase().replace(/[-\s]/g, '_');
web/src/lib/orchestration/metric-resolver.ts:314:  const normId = componentId.toLowerCase().replace(/[-\s]/g, '_');
web/src/lib/orchestration/metric-resolver.ts:316:  // STRATEGY 1: Use AI matchedComponent if available
web/src/lib/orchestration/metric-resolver.ts:320:    const matchedNorm = sheet.matchedComponent.toLowerCase().replace(/[-\s]/g, '_');
web/src/lib/calculation/intent-transformer.ts:2: * Intent Transformer — Bridge from PlanComponent to ComponentIntent
web/src/lib/calculation/intent-transformer.ts:5: * Reads the existing plan component and produces a structural intent
web/src/lib/calculation/intent-transformer.ts:11:import type { PlanComponent } from '../../types/compensation-plan';
web/src/lib/calculation/intent-transformer.ts:25: * Transform a PlanComponent into a ComponentIntent.
web/src/lib/calculation/intent-transformer.ts:26: * Returns null if the component is disabled or has no valid intent.
web/src/lib/calculation/intent-transformer.ts:42:      // Default path: any component with calculationIntent or metadata.intent
web/src/lib/calculation/intent-transformer.ts:43:      // routes through metadata-driven construction. Components lacking either
web/src/lib/calculation/intent-transformer.ts:50: * Transform all components in a variant into ComponentIntents.
web/src/lib/calculation/intent-transformer.ts:56:  for (let i = 0; i < components.length; i++) {
web/src/lib/calculation/intent-transformer.ts:73:// The AI plan interpreter stores the intent structure in component.metadata.intent
web/src/lib/calculation/intent-transformer.ts:74:// or component.calculationIntent.
web/src/lib/calculation/intent-transformer.ts:83: * AI format for constants: { source: "constant", value: N } → pass through
web/src/lib/calculation/intent-transformer.ts:219:      interpretationNotes: `AI-interpreted ${component.componentType} via calculationIntent`,
web/src/lib/calculation/decimal-precision.ts:40:/** Round a component output per its outputPrecision and return the trace */
web/src/lib/calculation/decimal-precision.ts:78: * Infer outputPrecision from a component's plan structure.
web/src/lib/calculation/decimal-precision.ts:95:  // Collect from legacy component configs
web/src/lib/calculation/decimal-precision.ts:146:      // Recurse into nested input/rate operations
web/src/lib/calculation/decimal-precision.ts:171:/** Collect output values from legacy component configs */
web/src/lib/domain/domain-dispatcher.ts:33:  /** The actual calculation results (unchanged from current pipeline) */
web/src/lib/domain/domain-dispatcher.ts:86:// Dispatch Exit — Score result through IAP
web/src/lib/domain/domain-dispatcher.ts:132:    result: null, // actual results are in CalculationDispatchResult.results
web/src/lib/calculation/intent-executor.ts:4: * Executes structural operations defined by ComponentIntent.
web/src/lib/calculation/intent-executor.ts:42:  priorResults?: number[];    // outcomes of previously calculated components
web/src/lib/calculation/intent-executor.ts:45:  crossDataCounts?: Record<string, number>;  // key: "dataType:count" or "dataType:sum:field" → value
web/src/lib/calculation/intent-executor.ts:47:  scopeAggregates?: Record<string, number>;  // key: "scope:field:aggregation" → value
web/src/lib/calculation/intent-executor.ts:156:// Composable Value Resolution — handles IntentSource or nested IntentOperation
web/src/lib/calculation/intent-executor.ts:166:    // Recursive: execute the nested operation to get a value
web/src/lib/calculation/intent-executor.ts:237:  // OB-117: isMarginal — outputs are rates to multiply against the input value
web/src/lib/calculation/intent-executor.ts:416:  // Graceful degradation: no history → return current value
web/src/lib/calculation/intent-executor.ts:476: * LegacyEngineUnknownComponentTypeError pattern at the next dispatch layer.
web/src/lib/calculation/intent-executor.ts:485:// OB-117: Exported for use by evaluateComponent's calculationIntent fallback
web/src/lib/calculation/intent-executor.ts:532:// OB-180: Piecewise Linear — attainment selects rate, applied to base
web/src/lib/calculation/intent-executor.ts:544:  // OB-186: If ratio resolved to 0 (missing denominator metric) and component
web/src/lib/calculation/intent-executor.ts:626:  // the foundational primitive that defines the component.
web/src/lib/agents/agent-memory.ts:103: * - interpretation: primarily interpretationSignals + componentPattern density
web/src/lib/calculation/pattern-signature.ts:4: * Produces structural hashes from ComponentIntent.
web/src/lib/calculation/pattern-signature.ts:15:import type { ComponentIntent, IntentOperation, IntentSource } from './intent-types';
web/src/lib/calculation/pattern-signature.ts:19: * Generate a structural signature for a ComponentIntent.
web/src/lib/calculation/flywheel-pipeline.ts:11: * - Only: pattern_signature, confidence, execution count, anomaly rate, structural behaviors
web/src/lib/sci/import-batch-supersession.ts:82: * Returns supersession result for caller logging. Throws on update error
web/src/lib/sci/import-batch-supersession.ts:220:        `[HF-213] Superseded prior batch ${result.prior_batch_id} → new batch ${result.new_batch_id} ` +
web/src/lib/calculation/synaptic-surface.ts:65:  // Component-level
web/src/lib/calculation/synaptic-surface.ts:151:  // Group confidence synapses by componentIndex to compute per-pattern density
web/src/lib/calculation/synaptic-surface.ts:165:    // Find which componentIndex maps to this signature
web/src/lib/calculation/synaptic-surface.ts:202:    // Training signal per component (not per entity)
web/src/lib/calculation/synaptic-surface.ts:240:  // Write a pattern synapse to track signature → componentIndex mapping
web/src/lib/agents/insight-agent.ts:24:    concentrationAlert: number;     // default 0.50 (50% of total in top 10%)
web/src/lib/agents/insight-agent.ts:66:  // Check 1: Anomaly rate
web/src/lib/agents/insight-agent.ts:82:      componentIndex: -1,
web/src/lib/agents/insight-agent.ts:92:    const avgConf = confSynapses.reduce((s, syn) => s + syn.value, 0) / confSynapses.length;
web/src/lib/agents/insight-agent.ts:229:    ? confSynapses.reduce((s, syn) => s + syn.value, 0) / confSynapses.length
web/src/lib/agents/insight-agent.ts:257:  // ── Insight: Anomaly rate ──
web/src/lib/agents/insight-agent.ts:265:      description: `${stats.anomalyCount} anomalies detected across ${summary.entityCount} entities (${(anomalyRate * 100).toFixed(1)}% rate)`,
web/src/lib/agents/insight-agent.ts:275:      description: `${(anomalyRate * 100).toFixed(1)}% anomaly rate (threshold: ${(config.thresholds.anomalyRateAlert * 100).toFixed(0)}%)`,
web/src/lib/agents/insight-agent.ts:287:      description: `Average confidence: ${(avgConf * 100).toFixed(1)}% — some components may have interpretation uncertainty`,
web/src/lib/agents/insight-agent.ts:288:      recommendation: 'Review component rule interpretations for low-confidence patterns',
web/src/lib/agents/insight-agent.ts:304:        description: `Top ${summary.topEntities.length} entities account for ${(concentrationRatio * 100).toFixed(1)}% of total outcomes`,
```

---

## E2_1_discovery.md

# E2.1 — Database table inventory (component-related)

## E2.1a — `information_schema.tables` via `execute_sql` RPC

**Query (verbatim):**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND (table_name LIKE '%metric%' OR table_name LIKE '%component%' OR table_name LIKE '%derivation%' OR table_name LIKE '%rule%')
```

**Postgrest RPC result (verbatim):**
```json
{
  "code": "PGRST202",
  "details": "Searched for the function public.execute_sql with parameter query_text or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.",
  "hint": null,
  "message": "Could not find the function public.execute_sql(query_text) in the schema cache"
}
```

**Halt status:** `execute_sql` RPC is not exposed via Postgrest. Direct `information_schema` queries against the Postgrest API also fail (information_schema is not exposed). CC cannot run the directive-specified SQL via Postgrest. CC proceeds with Postgrest table HEAD probes against candidate table names (E2.1b) as the next-most-direct surface.

## E2.1b — Postgrest table HEAD probes for candidate names

CC probed five candidate table names anticipated from prior diagnostic vocabulary. Verbatim results:

| Candidate table | Postgrest response |
|---|---|
| `rule_sets` | **EXISTS** — columns: `id, tenant_id, name, description, status, version, effective_from, effective_to, population_config, input_bindings, components, cadence_config, outcome_config, metadata, created_by, approved_by, created_at, updated_at` |
| `metric_derivation_rules` | `PGRST205 — Could not find the table 'public.metric_derivation_rules' in the schema cache. Hint: Perhaps you meant the table 'public.calculation_traces'` |
| `metric_bindings` | `PGRST205 — Could not find the table 'public.metric_bindings' in the schema cache. Hint: Perhaps you meant the table 'public.platform_settings'` |
| `components` | `PGRST205 — Could not find the table 'public.components' in the schema cache. Hint: Perhaps you meant the table 'public.platform_events'` |
| `plan_components` | `PGRST205 — Could not find the table 'public.plan_components' in the schema cache. Hint: Perhaps you meant the table 'public.platform_events'` |
| `calculation_components` | `PGRST205 — Could not find the table 'public.calculation_components' in the schema cache. Hint: Perhaps you meant the table 'public.calculation_results'` |

Only `rule_sets` is a live table among the candidate names. The component declarations live within the `components` JSONB column of `rule_sets`, not in a dedicated components table. See E2.2 for the verbatim row content.

---

## E2_2_rule_sets_full_row.md

# E2.2 — `rule_sets` row for Meridian (verbatim)

**Query:** `SELECT * FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79' ORDER BY created_at DESC`

**Result:** 1 row. Full row verbatim below:

```json
---ROW---
{
  "id": "939cf576-4096-4ceb-a142-539a486868b3",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "name": "Meridian Logistics Group Incentive Plan 2025",
  "description": "Monthly incentive plan for Logistics Coordinators with 5 components: Revenue Performance (2D matrix), On-Time Delivery (tiered), New Accounts (per unit), Safety Record (conditional), and Fleet Utilization (ratio-based)",
  "status": "active",
  "version": 1,
  "effective_from": null,
  "effective_to": null,
  "population_config": {
    "eligible_roles": []
  },
  "input_bindings": {
    "metric_derivations": [
      {
        "metric": "revenue_goal_attainment",
        "filters": [
          {
            "field": "Tipo_Coordinador",
            "value": "Coordinador Senior",
            "operator": "eq"
          }
        ],
        "operation": "count",
        "source_pattern": "transaction"
      },
      {
        "metric": "hub_route_volume",
        "filters": [
          {
            "field": "Tipo_Coordinador",
            "value": "Coordinador Senior",
            "operator": "eq"
          }
        ],
        "operation": "count",
        "source_pattern": "transaction"
      },
      {
        "metric": "on_time_delivery_percentage",
        "filters": [
          {
            "field": "Tipo_Coordinador",
            "value": "Coordinador Senior",
            "operator": "eq"
          }
        ],
        "operation": "count",
        "source_pattern": "transaction"
      },
      {
        "metric": "new_accounts_count",
        "filters": [
          {
            "field": "Tipo_Coordinador",
            "value": "Coordinador Senior",
            "operator": "eq"
          }
        ],
        "operation": "count",
        "source_pattern": "transaction"
      },
      {
        "metric": "safety_incidents_count",
        "filters": [
          {
            "field": "Tipo_Coordinador",
            "value": "Coordinador Senior",
            "operator": "eq"
          }
        ],
        "operation": "count",
        "source_pattern": "transaction"
      },
      {
        "metric": "hub_total_loads",
        "filters": [
          {
            "field": "Tipo_Coordinador",
            "value": "Coordinador Senior",
            "operator": "eq"
          }
        ],
        "operation": "count",
        "source_pattern": "transaction"
      },
      {
        "metric": "hub_total_capacity",
        "filters": [
          {
            "field": "Tipo_Coordinador",
            "value": "Coordinador Senior",
            "operator": "eq"
          }
        ],
        "operation": "count",
        "source_pattern": "transaction"
      }
    ],
    "convergence_bindings": {
      "component_0": {
        "row": {
          "column": "Cumplimiento_Ingreso",
          "confidence": 0.9,
          "match_pass": 1,
          "scale_factor": 100,
          "field_identity": {
            "confidence": 0.7,
            "structuralType": "measure",
            "contextualIdentity": "count"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        },
        "column": {
          "column": "Volumen_Rutas_Hub",
          "confidence": 0.9,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.7,
            "structuralType": "measure",
            "contextualIdentity": "count"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        },
        "period": {
          "column": "Mes",
          "confidence": 0.775,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.9,
            "structuralType": "temporal",
            "contextualIdentity": "date"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        },
        "entity_identifier": {
          "column": "Hub",
          "confidence": 0.775,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.9,
            "structuralType": "identifier",
            "contextualIdentity": "person_identifier"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        }
      },
      "component_1": {
        "actual": {
          "column": "Pct_Entregas_Tiempo",
          "confidence": 0.9,
          "match_pass": 1,
          "scale_factor": 100,
          "field_identity": {
            "confidence": 0.7,
            "structuralType": "measure",
            "contextualIdentity": "count"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        },
        "period": {
          "column": "Mes",
          "confidence": 0.775,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.9,
            "structuralType": "temporal",
            "contextualIdentity": "date"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        },
        "entity_identifier": {
          "column": "Hub",
          "confidence": 0.775,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.9,
            "structuralType": "identifier",
            "contextualIdentity": "person_identifier"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        }
      },
      "component_2": {
        "actual": {
          "column": "Cuentas_Nuevas",
          "confidence": 0.9,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.7,
            "structuralType": "measure",
            "contextualIdentity": "count"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        },
        "period": {
          "column": "Mes",
          "confidence": 0.775,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.9,
            "structuralType": "temporal",
            "contextualIdentity": "date"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        },
        "entity_identifier": {
          "column": "Hub",
          "confidence": 0.775,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.9,
            "structuralType": "identifier",
            "contextualIdentity": "person_identifier"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        }
      },
      "component_3": {
        "actual": {
          "column": "Incidentes_Seguridad",
          "confidence": 0.9,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.7,
            "structuralType": "measure",
            "contextualIdentity": "count"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        },
        "period": {
          "column": "Mes",
          "confidence": 0.775,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.9,
            "structuralType": "temporal",
            "contextualIdentity": "date"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        },
        "entity_identifier": {
          "column": "Hub",
          "confidence": 0.775,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.9,
            "structuralType": "identifier",
            "contextualIdentity": "person_identifier"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        }
      },
      "component_4": {
        "period": {
          "column": "Mes",
          "confidence": 0.775,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.9,
            "structuralType": "temporal",
            "contextualIdentity": "date"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        },
        "numerator": {
          "column": "Cargas_Flota_Hub",
          "confidence": 0.9,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.7,
            "structuralType": "measure",
            "contextualIdentity": "count"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        },
        "denominator": {
          "column": "Capacidad_Flota_Hub",
          "confidence": 0.9,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.7,
            "structuralType": "measure",
            "contextualIdentity": "count"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        },
        "entity_identifier": {
          "column": "Hub",
          "confidence": 0.775,
          "match_pass": 1,
          "field_identity": {
            "confidence": 0.9,
            "structuralType": "identifier",
            "contextualIdentity": "person_identifier"
          },
          "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
        }
      }
    }
  },
  "components": {
    "variants": [
      {
        "variantId": "senior",
        "components": [
          {
            "id": "revenue_performance_senior",
            "name": "Revenue Performance - Senior",
            "order": 1,
            "enabled": true,
            "metadata": {
              "intent": {
                "inputs": {
                  "row": {
                    "source": "metric",
                    "sourceSpec": {
                      "field": "revenue_goal_attainment"
                    }
                  },
                  "column": {
                    "source": "metric",
                    "sourceSpec": {
                      "field": "hub_route_volume"
                    }
                  }
                },
                "operation": "bounded_lookup_2d",
                "outputGrid": [
                  [
                    0,
                    0,
                    200,
                    400
                  ],
                  [
                    150,
                    300,
                    500,
                    800
                  ],
                  [
                    300,
                    600,
                    900,
                    1400
                  ],
                  [
                    600,
                    1000,
                    1600,
                    2200
                  ],
                  [
                    900,
                    1400,
                    2100,
                    3000
                  ]
                ],
                "rowBoundaries": [
                  {
                    "max": 80,
                    "min": 0,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 90,
                    "min": 80,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 100,
                    "min": 90,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 130,
                    "min": 100,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": null,
                    "min": 130,
                    "maxInclusive": true,
                    "minInclusive": true
                  }
                ],
                "noMatchBehavior": "zero",
                "columnBoundaries": [
                  {
                    "max": 500,
                    "min": 0,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 1000,
                    "min": 500,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 2000,
                    "min": 1000,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": null,
                    "min": 2000,
                    "maxInclusive": true,
                    "minInclusive": true
                  }
                ]
              }
            },
            "description": "Rendimiento de Ingreso - Senior",
            "componentType": "bounded_lookup_2d",
            "measurementLevel": "store",
            "calculationIntent": {
              "inputs": {
                "row": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "revenue_goal_attainment"
                  }
                },
                "column": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "hub_route_volume"
                  }
                }
              },
              "operation": "bounded_lookup_2d",
              "outputGrid": [
                [
                  0,
                  0,
                  200,
                  400
                ],
                [
                  150,
                  300,
                  500,
                  800
                ],
                [
                  300,
                  600,
                  900,
                  1400
                ],
                [
                  600,
                  1000,
                  1600,
                  2200
                ],
                [
                  900,
                  1400,
                  2100,
                  3000
                ]
              ],
              "rowBoundaries": [
                {
                  "max": 80,
                  "min": 0,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 90,
                  "min": 80,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 100,
                  "min": 90,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 130,
                  "min": 100,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": null,
                  "min": 130,
                  "maxInclusive": true,
                  "minInclusive": true
                }
              ],
              "noMatchBehavior": "zero",
              "columnBoundaries": [
                {
                  "max": 500,
                  "min": 0,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 1000,
                  "min": 500,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 2000,
                  "min": 1000,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": null,
                  "min": 2000,
                  "maxInclusive": true,
                  "minInclusive": true
                }
              ]
            }
          },
          {
            "id": "on_time_delivery_senior",
            "name": "On-Time Delivery - Senior",
            "order": 2,
            "enabled": true,
            "metadata": {
              "intent": {
                "input": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "on_time_delivery_percentage"
                  }
                },
                "outputs": [
                  0,
                  200,
                  400,
                  700,
                  1200
                ],
                "operation": "bounded_lookup_1d",
                "boundaries": [
                  {
                    "max": 85,
                    "min": 0,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 90,
                    "min": 85,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 95,
                    "min": 90,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 98,
                    "min": 95,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 100,
                    "min": 98,
                    "maxInclusive": true,
                    "minInclusive": true
                  }
                ],
                "noMatchBehavior": "zero"
              }
            },
            "description": "Entrega a Tiempo - Senior",
            "componentType": "bounded_lookup_1d",
            "measurementLevel": "store",
            "calculationIntent": {
              "input": {
                "source": "metric",
                "sourceSpec": {
                  "field": "on_time_delivery_percentage"
                }
              },
              "outputs": [
                0,
                200,
                400,
                700,
                1200
              ],
              "operation": "bounded_lookup_1d",
              "boundaries": [
                {
                  "max": 85,
                  "min": 0,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 90,
                  "min": 85,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 95,
                  "min": 90,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 98,
                  "min": 95,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 100,
                  "min": 98,
                  "maxInclusive": true,
                  "minInclusive": true
                }
              ],
              "noMatchBehavior": "zero"
            }
          },
          {
            "id": "new_accounts_senior",
            "name": "New Accounts - Senior",
            "order": 3,
            "enabled": true,
            "metadata": {
              "intent": {
                "rate": 350,
                "input": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "new_accounts_count"
                  }
                },
                "operation": "scalar_multiply"
              }
            },
            "description": "Cuentas Nuevas - Senior",
            "componentType": "scalar_multiply",
            "measurementLevel": "store",
            "calculationIntent": {
              "rate": 350,
              "input": {
                "source": "metric",
                "sourceSpec": {
                  "field": "new_accounts_count"
                }
              },
              "operation": "scalar_multiply"
            }
          },
          {
            "id": "safety_record_senior",
            "name": "Safety Record - Senior",
            "order": 4,
            "enabled": true,
            "metadata": {
              "intent": {
                "onTrue": {
                  "value": 500,
                  "operation": "constant"
                },
                "onFalse": {
                  "value": 0,
                  "operation": "constant"
                },
                "condition": {
                  "left": {
                    "source": "metric",
                    "sourceSpec": {
                      "field": "safety_incidents_count"
                    }
                  },
                  "right": {
                    "value": 0,
                    "source": "constant"
                  },
                  "operator": "="
                },
                "operation": "conditional_gate"
              }
            },
            "description": "Registro de Seguridad - Senior",
            "componentType": "conditional_gate",
            "measurementLevel": "store",
            "calculationIntent": {
              "onTrue": {
                "value": 500,
                "operation": "constant"
              },
              "onFalse": {
                "value": 0,
                "operation": "constant"
              },
              "condition": {
                "left": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "safety_incidents_count"
                  }
                },
                "right": {
                  "value": 0,
                  "source": "constant"
                },
                "operator": "="
              },
              "operation": "conditional_gate"
            }
          },
          {
            "id": "fleet_utilization_senior",
            "name": "Fleet Utilization - Senior",
            "order": 5,
            "enabled": true,
            "metadata": {
              "intent": {
                "rate": 800,
                "input": {
                  "source": "ratio",
                  "sourceSpec": {
                    "numerator": "hub_total_loads",
                    "denominator": "hub_total_capacity"
                  }
                },
                "modifiers": [
                  {
                    "maxValue": 1.5,
                    "modifier": "cap"
                  }
                ],
                "operation": "scalar_multiply"
              }
            },
            "description": "Utilización de Flota - Senior",
            "componentType": "scalar_multiply",
            "measurementLevel": "store",
            "calculationIntent": {
              "rate": 800,
              "input": {
                "source": "ratio",
                "sourceSpec": {
                  "numerator": "hub_total_loads",
                  "denominator": "hub_total_capacity"
                }
              },
              "modifiers": [
                {
                  "maxValue": 1.5,
                  "modifier": "cap"
                }
              ],
              "operation": "scalar_multiply"
            }
          }
        ],
        "description": "Coordinador Senior",
        "variantName": "Senior Logistics Coordinator",
        "eligibilityCriteria": {}
      },
      {
        "variantId": "standard",
        "components": [
          {
            "id": "revenue_performance_standard",
            "name": "Revenue Performance - Standard",
            "order": 1,
            "enabled": true,
            "metadata": {
              "intent": {
                "inputs": {
                  "row": {
                    "source": "metric",
                    "sourceSpec": {
                      "field": "revenue_goal_attainment"
                    }
                  },
                  "column": {
                    "source": "metric",
                    "sourceSpec": {
                      "field": "hub_route_volume"
                    }
                  }
                },
                "operation": "bounded_lookup_2d",
                "outputGrid": [
                  [
                    0,
                    0,
                    100,
                    200
                  ],
                  [
                    75,
                    150,
                    250,
                    400
                  ],
                  [
                    150,
                    300,
                    450,
                    700
                  ],
                  [
                    300,
                    500,
                    800,
                    1100
                  ],
                  [
                    450,
                    700,
                    1050,
                    1500
                  ]
                ],
                "rowBoundaries": [
                  {
                    "max": 80,
                    "min": 0,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 90,
                    "min": 80,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 100,
                    "min": 90,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 130,
                    "min": 100,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": null,
                    "min": 130,
                    "maxInclusive": true,
                    "minInclusive": true
                  }
                ],
                "noMatchBehavior": "zero",
                "columnBoundaries": [
                  {
                    "max": 500,
                    "min": 0,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 1000,
                    "min": 500,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 2000,
                    "min": 1000,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": null,
                    "min": 2000,
                    "maxInclusive": true,
                    "minInclusive": true
                  }
                ]
              }
            },
            "description": "Rendimiento de Ingreso - Coordinador",
            "componentType": "bounded_lookup_2d",
            "measurementLevel": "store",
            "calculationIntent": {
              "inputs": {
                "row": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "revenue_goal_attainment"
                  }
                },
                "column": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "hub_route_volume"
                  }
                }
              },
              "operation": "bounded_lookup_2d",
              "outputGrid": [
                [
                  0,
                  0,
                  100,
                  200
                ],
                [
                  75,
                  150,
                  250,
                  400
                ],
                [
                  150,
                  300,
                  450,
                  700
                ],
                [
                  300,
                  500,
                  800,
                  1100
                ],
                [
                  450,
                  700,
                  1050,
                  1500
                ]
              ],
              "rowBoundaries": [
                {
                  "max": 80,
                  "min": 0,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 90,
                  "min": 80,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 100,
                  "min": 90,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 130,
                  "min": 100,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": null,
                  "min": 130,
                  "maxInclusive": true,
                  "minInclusive": true
                }
              ],
              "noMatchBehavior": "zero",
              "columnBoundaries": [
                {
                  "max": 500,
                  "min": 0,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 1000,
                  "min": 500,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 2000,
                  "min": 1000,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": null,
                  "min": 2000,
                  "maxInclusive": true,
                  "minInclusive": true
                }
              ]
            }
          },
          {
            "id": "on_time_delivery_standard",
            "name": "On-Time Delivery - Standard",
            "order": 2,
            "enabled": true,
            "metadata": {
              "intent": {
                "input": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "on_time_delivery_percentage"
                  }
                },
                "outputs": [
                  0,
                  100,
                  200,
                  350,
                  600
                ],
                "operation": "bounded_lookup_1d",
                "boundaries": [
                  {
                    "max": 85,
                    "min": 0,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 90,
                    "min": 85,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 95,
                    "min": 90,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 98,
                    "min": 95,
                    "maxInclusive": false,
                    "minInclusive": true
                  },
                  {
                    "max": 100,
                    "min": 98,
                    "maxInclusive": true,
                    "minInclusive": true
                  }
                ],
                "noMatchBehavior": "zero"
              }
            },
            "description": "Entrega a Tiempo - Coordinador",
            "componentType": "bounded_lookup_1d",
            "measurementLevel": "store",
            "calculationIntent": {
              "input": {
                "source": "metric",
                "sourceSpec": {
                  "field": "on_time_delivery_percentage"
                }
              },
              "outputs": [
                0,
                100,
                200,
                350,
                600
              ],
              "operation": "bounded_lookup_1d",
              "boundaries": [
                {
                  "max": 85,
                  "min": 0,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 90,
                  "min": 85,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 95,
                  "min": 90,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 98,
                  "min": 95,
                  "maxInclusive": false,
                  "minInclusive": true
                },
                {
                  "max": 100,
                  "min": 98,
                  "maxInclusive": true,
                  "minInclusive": true
                }
              ],
              "noMatchBehavior": "zero"
            }
          },
          {
            "id": "new_accounts_standard",
            "name": "New Accounts - Standard",
            "order": 3,
            "enabled": true,
            "metadata": {
              "intent": {
                "rate": 200,
                "input": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "new_accounts_count"
                  }
                },
                "operation": "scalar_multiply"
              }
            },
            "description": "Cuentas Nuevas - Coordinador",
            "componentType": "scalar_multiply",
            "measurementLevel": "store",
            "calculationIntent": {
              "rate": 200,
              "input": {
                "source": "metric",
                "sourceSpec": {
                  "field": "new_accounts_count"
                }
              },
              "operation": "scalar_multiply"
            }
          },
          {
            "id": "safety_record_standard",
            "name": "Safety Record - Standard",
            "order": 4,
            "enabled": true,
            "metadata": {
              "intent": {
                "onTrue": {
                  "value": 300,
                  "operation": "constant"
                },
                "onFalse": {
                  "value": 0,
                  "operation": "constant"
                },
                "condition": {
                  "left": {
                    "source": "metric",
                    "sourceSpec": {
                      "field": "safety_incidents_count"
                    }
                  },
                  "right": {
                    "value": 0,
                    "source": "constant"
                  },
                  "operator": "="
                },
                "operation": "conditional_gate"
              }
            },
            "description": "Registro de Seguridad - Coordinador",
            "componentType": "conditional_gate",
            "measurementLevel": "store",
            "calculationIntent": {
              "onTrue": {
                "value": 300,
                "operation": "constant"
              },
              "onFalse": {
                "value": 0,
                "operation": "constant"
              },
              "condition": {
                "left": {
                  "source": "metric",
                  "sourceSpec": {
                    "field": "safety_incidents_count"
                  }
                },
                "right": {
                  "value": 0,
                  "source": "constant"
                },
                "operator": "="
              },
              "operation": "conditional_gate"
            }
          },
          {
            "id": "fleet_utilization_standard",
            "name": "Fleet Utilization - Standard",
            "order": 5,
            "enabled": true,
            "metadata": {
              "intent": {
                "rate": 450,
                "input": {
                  "source": "ratio",
                  "sourceSpec": {
                    "numerator": "hub_total_loads",
                    "denominator": "hub_total_capacity"
                  }
                },
                "modifiers": [
                  {
                    "maxValue": 1.5,
                    "modifier": "cap"
                  }
                ],
                "operation": "scalar_multiply"
              }
            },
            "description": "Utilización de Flota - Coordinador",
            "componentType": "scalar_multiply",
            "measurementLevel": "store",
            "calculationIntent": {
              "rate": 450,
              "input": {
                "source": "ratio",
                "sourceSpec": {
                  "numerator": "hub_total_loads",
                  "denominator": "hub_total_capacity"
                }
              },
              "modifiers": [
                {
                  "maxValue": 1.5,
                  "modifier": "cap"
                }
              ],
              "operation": "scalar_multiply"
            }
          }
        ],
        "description": "Coordinador",
        "variantName": "Standard Logistics Coordinator",
        "eligibilityCriteria": {}
      }
    ]
  },
  "cadence_config": {
    "period_type": "monthly"
  },
  "outcome_config": {},
  "metadata": {
    "source": "sci",
    "plan_type": "additive_lookup",
    "aiConfidence": 0.95,
    "contentUnitId": "bee373fc-2028-438f-8ec7-20f720637abd"
  },
  "created_by": "9c179b53-c5ee-4af7-a36b-09f5db3e35f2",
  "approved_by": null,
  "created_at": "2026-05-09T21:04:58.604051+00:00",
  "updated_at": "2026-05-09T21:06:11.52743+00:00"
}
```

---

## E2_3_ts_grep.md

# E2.3 — TypeScript references to c4 / Fleet Utilization (verbatim)

## Direct c4 / fleet / utilization grep

**Command:**
```bash
grep -rni "c4|fleet.utilization|fleet_utilization|FleetUtilization" web/src/ --include="*.ts"
```

**Output:**
```
web/src/app/api/financial/data/route.ts:170:const BRAND_PALETTE = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];
web/src/lib/data/results-loader.ts:22:  '#ec4899', // pink
```

CC observation (verbatim): the two matches contain the substring `c4` only within color hex codes (`#ec4899`). No TypeScript file declares an identifier that contains `c4`, `fleet_utilization`, or `FleetUtilization`.

## Grep for c4-derived identifiers from the E2.2 declaration

**Command:**
```bash
grep -rn "fleet_utilization_senior|fleet_utilization_standard|hub_total_loads|hub_total_capacity|component_4|Fleet Utilization" web/src/ --include="*.ts"
```

**Output:** (empty — zero matches)

**Halt status per directive:** "Any discovery query returns 0 rows where >0 was expected — surface the empty result + the verbatim query, do not retry with assumed alternatives." CC surfaces. No TypeScript file references `fleet_utilization_senior`, `fleet_utilization_standard`, `hub_total_loads`, `hub_total_capacity`, the literal `component_4`, or the string `"Fleet Utilization"`.

## Grep for the operation / source vocabulary the c4 declaration uses

The E2.2 c4 declaration uses `operation: "scalar_multiply"` with `input.source: "ratio"`. The TS-side handling of these tokens:

**Command:**
```bash
grep -rn "source: 'ratio'|\"ratio\"|scalar_multiply|source_pattern.*transaction|ComponentIntent.*ratio" web/src/lib/calculation/ --include="*.ts"
```

**Output (29 lines):**
```
web/src/lib/calculation/pattern-signature.ts:10: *   "scalar_multiply:metric:rate_num:entity"
web/src/lib/calculation/pattern-signature.ts:11: *   "scalar_multiply:metric:rate_op(bounded_lookup_1d):entity"
web/src/lib/calculation/pattern-signature.ts:15:import type { ComponentIntent, IntentOperation, IntentSource } from './intent-types';
web/src/lib/calculation/pattern-signature.ts:50:    case 'scalar_multiply': {
web/src/lib/calculation/pattern-signature.ts:54:      return `scalar_multiply:${describeInput(op.input)}:${rateDesc}`;
web/src/lib/calculation/intent-executor.ts:97:        source: 'ratio',
web/src/lib/calculation/intent-executor.ts:495:    case 'scalar_multiply':   return executeScalarMultiply(op, data, inputLog, trace);
web/src/lib/calculation/run-calculation.ts:258:    case 'scalar_multiply':
web/src/lib/calculation/run-calculation.ts:289:      // OB-120: Transform postProcessing.rateFromLookup into scalar_multiply wrapper.
web/src/lib/calculation/run-calculation.ts:292:      // Transform: bounded_lookup_1d{postProcessing:{scalar_multiply, rateFromLookup}}
web/src/lib/calculation/run-calculation.ts:293:      //         → scalar_multiply{input: volume, rate: bounded_lookup_1d}
web/src/lib/calculation/run-calculation.ts:300:          operation: 'scalar_multiply',
web/src/lib/calculation/intent-validator.ts:86:    case 'scalar_multiply':
web/src/lib/calculation/intent-validator.ts:344:  validateSourceOrOp(obj.input, 'scalar_multiply.input', errors, warnings);
web/src/lib/calculation/intent-validator.ts:351:    errors.push(...nestedResult.errors.map(e => `scalar_multiply.rate(nested): ${e}`));
web/src/lib/calculation/intent-validator.ts:352:    warnings.push(...nestedResult.warnings.map(w => `scalar_multiply.rate(nested): ${w}`));
web/src/lib/calculation/intent-validator.ts:354:    errors.push('scalar_multiply: rate must be a number or nested operation');
web/src/lib/calculation/intent-types.ts:25:  | { source: 'ratio'; sourceSpec: { numerator: string; denominator: string } }
web/src/lib/calculation/intent-types.ts:114:  operation: Op<'scalar_multiply'>;
web/src/lib/calculation/intent-transformer.ts:38:    case 'scalar_multiply':
web/src/lib/calculation/intent-transformer.ts:81: * AI format for ratios:   { source: "ratio", sourceSpec: { numerator: "X", denominator: "Y" } }
web/src/lib/calculation/intent-transformer.ts:82: *                         → { operation: "ratio", numerator: IntentSource, denominator: IntentSource }
web/src/lib/calculation/intent-transformer.ts:147:  } else if (rawIntent.operation === 'scalar_multiply' && rawIntent.rate != null) {
web/src/lib/calculation/intent-transformer.ts:149:      operation: 'scalar_multiply',
web/src/lib/calculation/decimal-precision.ts:144:    case 'scalar_multiply': {
web/src/lib/calculation/primitive-registry.ts:41: * scope aggregation as `scalar_multiply { input.source: 'scope_aggregate' }`.
web/src/lib/calculation/primitive-registry.ts:48:  'scalar_multiply',
web/src/lib/calculation/primitive-registry.ts:141:    id: 'scalar_multiply',
web/src/lib/calculation/results-formatter.ts:520:  if (componentType === 'scalar_multiply' || componentType === 'conditional_gate') {
```

CC surfaces these as the TypeScript sites that read the `scalar_multiply` operation token or the `'ratio'` source token. The architect reads which sites participate in the c4 execution path against the E1.4 function surface and the E4 boundary table.

---

## E2_4_c4_full_declaration.md

# E2.4 — Complete c4 declaration (verbatim, both variants)

The c4 component is declared inside the `rule_sets.components` JSONB column. Two variant declarations carry c4 — `senior` (Coordinador Senior, rate=800) and `standard` (Coordinador, rate=450). Both verbatim below from the E2.2 full-row evidence.

## c4 Senior variant

**Location in E2.2 row JSONB:** `components.variants[0].components[4]`

```json
{
  "id": "fleet_utilization_senior",
  "name": "Fleet Utilization - Senior",
  "order": 5,
  "enabled": true,
  "metadata": {
    "intent": {
      "rate": 800,
      "input": {
        "source": "ratio",
        "sourceSpec": {
          "numerator": "hub_total_loads",
          "denominator": "hub_total_capacity"
        }
      },
      "modifiers": [
        {
          "maxValue": 1.5,
          "modifier": "cap"
        }
      ],
      "operation": "scalar_multiply"
    }
  },
  "description": "Utilización de Flota - Senior",
  "componentType": "scalar_multiply",
  "measurementLevel": "store",
  "calculationIntent": {
    "rate": 800,
    "input": {
      "source": "ratio",
      "sourceSpec": {
        "numerator": "hub_total_loads",
        "denominator": "hub_total_capacity"
      }
    },
    "modifiers": [
      {
        "maxValue": 1.5,
        "modifier": "cap"
      }
    ],
    "operation": "scalar_multiply"
  }
}
```

## c4 Standard variant

**Location in E2.2 row JSONB:** `components.variants[1].components[4]`

```json
{
  "id": "fleet_utilization_standard",
  "name": "Fleet Utilization - Standard",
  "order": 5,
  "enabled": true,
  "metadata": {
    "intent": {
      "rate": 450,
      "input": {
        "source": "ratio",
        "sourceSpec": {
          "numerator": "hub_total_loads",
          "denominator": "hub_total_capacity"
        }
      },
      "modifiers": [
        {
          "maxValue": 1.5,
          "modifier": "cap"
        }
      ],
      "operation": "scalar_multiply"
    }
  },
  "description": "Utilización de Flota - Coordinador",
  "componentType": "scalar_multiply",
  "measurementLevel": "store",
  "calculationIntent": {
    "rate": 450,
    "input": {
      "source": "ratio",
      "sourceSpec": {
        "numerator": "hub_total_loads",
        "denominator": "hub_total_capacity"
      }
    },
    "modifiers": [
      {
        "maxValue": 1.5,
        "modifier": "cap"
      }
    ],
    "operation": "scalar_multiply"
  }
}
```

## c4-relevant fields elsewhere in the rule_sets row

### `input_bindings.metric_derivations` entries naming hub_total_loads / hub_total_capacity (verbatim)

```json
{
  "metric": "hub_total_loads",
  "filters": [
    {
      "field": "Tipo_Coordinador",
      "value": "Coordinador Senior",
      "operator": "eq"
    }
  ],
  "operation": "count",
  "source_pattern": "transaction"
},
{
  "metric": "hub_total_capacity",
  "filters": [
    {
      "field": "Tipo_Coordinador",
      "value": "Coordinador Senior",
      "operator": "eq"
    }
  ],
  "operation": "count",
  "source_pattern": "transaction"
}
```

### `input_bindings.convergence_bindings.component_4` (verbatim — c4 column-to-metric bindings)

```json
"component_4": {
  "period": {
    "column": "Mes",
    "confidence": 0.775,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.9,
      "structuralType": "temporal",
      "contextualIdentity": "date"
    },
    "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
  },
  "numerator": {
    "column": "Cargas_Flota_Hub",
    "confidence": 0.9,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.7,
      "structuralType": "measure",
      "contextualIdentity": "count"
    },
    "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
  },
  "denominator": {
    "column": "Capacidad_Flota_Hub",
    "confidence": 0.9,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.7,
      "structuralType": "measure",
      "contextualIdentity": "count"
    },
    "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
  },
  "entity_identifier": {
    "column": "Hub",
    "confidence": 0.775,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.9,
      "structuralType": "identifier",
      "contextualIdentity": "person_identifier"
    },
    "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
  }
}
```

CC has surfaced the full c4 declaration as present in the rule_sets row. Architect reads.

---

## E3_0_selection.md

# E3.0 — Selection (entity, period) (verbatim)

**Selection rule:** first entity_id alphabetically ascending × earliest period_id by start_date ascending.

## Counts

```
Entity count: 79
Period count: 3
```

## Selected entity

```json
{
  "id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "display_name": "Norma Rodríguez Rivera",
  "entity_type": "individual",
  "external_id": "70209",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "metadata": {
    "region": "Sur",
    "fecha_ingreso": "2018-10-03",
    "tipo_coordinador": "Coordinador Senior"
  }
}
```

## All 3 Meridian periods (start_date ascending)

```json
[
  {
    "id": "3c2557f4-d922-4b30-a073-ac4811f1f3cb",
    "label": "January 2025",
    "period_type": "monthly",
    "status": "open",
    "start_date": "2025-01-01",
    "end_date": "2025-01-31",
    "canonical_key": "monthly_2025-01-01_2025-01-31",
    "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79"
  },
  {
    "id": "95c303a0-0287-47ed-bbe5-f0a766a6843e",
    "label": "February 2025",
    "period_type": "monthly",
    "status": "open",
    "start_date": "2025-02-01",
    "end_date": "2025-02-28",
    "canonical_key": "monthly_2025-02-01_2025-02-28",
    "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79"
  },
  {
    "id": "8bfc8730-458d-4abb-96cb-dc3f936bc2da",
    "label": "March 2025",
    "period_type": "monthly",
    "status": "open",
    "start_date": "2025-03-01",
    "end_date": "2025-03-31",
    "canonical_key": "monthly_2025-03-01_2025-03-31",
    "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79"
  }
]
```

## Selection IDs (chosen for trace)

```json
{
  "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
  "entity_external_id": "70209",
  "entity_display_name": "Norma Rodríguez Rivera",
  "periodId": "3c2557f4-d922-4b30-a073-ac4811f1f3cb",
  "period_label": "January 2025",
  "period_start": "2025-01-01",
  "period_end": "2025-01-31"
}
```

---

## E3_1_committed_data.md

# E3.1 — committed_data for selected entity (verbatim)

**Query:** `SELECT * FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79' AND entity_id = '007da35a-8e65-453b-ada9-b62337fd8683'`

**Result:** 4 rows (filter on period_id=selected OR period_id IS NULL retains all 4 — every row has `period_id: null`). Verbatim below in the order Postgrest returned.

## Row 1 — transaction (source_date 2025-02-01)

```json
{
  "id": "b55b7756-bdfd-4218-a321-9536b8a7186c",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "import_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b",
  "entity_id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "period_id": null,
  "data_type": "transaction",
  "row_data": {
    "Hub": "Mérida Hub",
    "Mes": 2,
    "Año": 2025,
    "Nombre": "Norma Rodríguez Rivera",
    "Region": "Sur",
    "_rowIndex": 103,
    "_sheetName": "Datos_Rendimiento",
    "No_Empleado": "70209",
    "Ingreso_Meta": 227769,
    "Ingreso_Real": 149377,
    "Cuentas_Nuevas": 8,
    "Entregas_Tiempo": 68,
    "Cargas_Flota_Hub": 807,
    "Entregas_Totales": 75,
    "Tipo_Coordinador": "Coordinador Senior",
    "Volumen_Rutas_Hub": 807,
    "Capacidad_Flota_Hub": 1044,
    "Pct_Entregas_Tiempo": 0.9067,
    "Cumplimiento_Ingreso": 0.6558,
    "Incidentes_Seguridad": 0,
    "Tasa_Utilizacion_Hub": 0.773
  },
  "created_at": "2026-05-09T21:05:51.324839+00:00",
  "source_date": "2025-02-01"
}
```

(metadata.semantic_roles and metadata.field_identities omitted from this row excerpt — see /tmp probe output for the full ±300-line JSONB if needed. The data the engine reads is `row_data`; semantic_roles + field_identities are import-time annotations.)

## Row 2 — transaction (source_date 2025-03-01)

```json
{
  "id": "002f99b3-f2e5-470e-a58d-35fdae716fa6",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "import_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b",
  "entity_id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "period_id": null,
  "data_type": "transaction",
  "row_data": {
    "Hub": "Mérida Hub",
    "Mes": 3,
    "Año": 2025,
    "Nombre": "Norma Rodríguez Rivera",
    "Region": "Sur",
    "_rowIndex": 170,
    "_sheetName": "Datos_Rendimiento",
    "No_Empleado": "70209",
    "Ingreso_Meta": 241797,
    "Ingreso_Real": 315744,
    "Cuentas_Nuevas": 7,
    "Entregas_Tiempo": 98,
    "Cargas_Flota_Hub": 849,
    "Entregas_Totales": 99,
    "Tipo_Coordinador": "Coordinador Senior",
    "Volumen_Rutas_Hub": 849,
    "Capacidad_Flota_Hub": 820,
    "Pct_Entregas_Tiempo": 0.9899,
    "Cumplimiento_Ingreso": 1.3058,
    "Incidentes_Seguridad": 0,
    "Tasa_Utilizacion_Hub": 1.0354
  },
  "created_at": "2026-05-09T21:05:51.324839+00:00",
  "source_date": "2025-03-01"
}
```

## Row 3 — entity master (source_date null)

```json
{
  "id": "e30dd7cb-4eff-4344-95f4-549aa43db413",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "import_batch_id": "eb3d909b-8ac0-4272-b069-704f6f342fdb",
  "entity_id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "period_id": null,
  "data_type": "entity",
  "row_data": {
    "Region": "Sur",
    "_rowIndex": 36,
    "_sheetName": "Plantilla",
    "No_Empleado": "70209",
    "Hub_Asignado": "Mérida Hub",
    "Fecha_Ingreso": "2018-10-03",
    "Nombre_Completo": "Norma Rodríguez Rivera",
    "Tipo_Coordinador": "Coordinador Senior"
  },
  "created_at": "2026-05-09T21:05:51.050534+00:00",
  "source_date": null
}
```

## Row 4 — transaction (source_date 2025-01-01) — period of interest

```json
{
  "id": "34bd82fa-1276-47bb-a6b7-47d0f004eea2",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "import_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b",
  "entity_id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "period_id": null,
  "data_type": "transaction",
  "row_data": {
    "Hub": "Mérida Hub",
    "Mes": 1,
    "Año": 2025,
    "Nombre": "Norma Rodríguez Rivera",
    "Region": "Sur",
    "_rowIndex": 36,
    "_sheetName": "Datos_Rendimiento",
    "No_Empleado": "70209",
    "Ingreso_Meta": 151402,
    "Ingreso_Real": 143414,
    "Cuentas_Nuevas": 0,
    "Entregas_Tiempo": 102,
    "Cargas_Flota_Hub": 1044,
    "Entregas_Totales": 116,
    "Tipo_Coordinador": "Coordinador Senior",
    "Volumen_Rutas_Hub": 1044,
    "Capacidad_Flota_Hub": 1370,
    "Pct_Entregas_Tiempo": 0.8793,
    "Cumplimiento_Ingreso": 0.9472,
    "Incidentes_Seguridad": 0,
    "Tasa_Utilizacion_Hub": 0.762
  },
  "created_at": "2026-05-09T21:05:51.324839+00:00",
  "source_date": "2025-01-01"
}
```

## CC observation (verbatim, not classification)

Every committed_data row has `period_id: null`. The period attribution mechanism in this dataset is via `source_date` only.

---

## E3_2_rule_set.md

# E3.2 — Active rule_set for Meridian (verbatim)

**Query:** `SELECT * FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79' ORDER BY created_at DESC`

**Result:** 1 row. Verbatim row content already surfaced in `E2_2_rule_sets_full_row.md` (1287 lines).

## Summary identifiers

```
id:        939cf576-4096-4ceb-a142-539a486868b3
tenant_id: 5035b1e8-0754-4527-b7ec-9f93f85e4c79
name:      "Meridian Logistics Group Incentive Plan 2025"
status:    "active"
version:   1
created_at: 2026-05-09T21:06:11.52743+00:00
```

## Disposition note

Only 1 active rule_set exists for Meridian at the time of this probe — no disposition needed regarding "which rule_set was active for the AUD-006 §6.3 reading" (the directive's contingency for multiple rule_sets). The calculation_results row surfaced in E3.4 carries `rule_set_id: 939cf576-4096-4ceb-a142-539a486868b3` confirming this is the rule_set actually used.

---

## E3_3_input_bindings_c4.md

# E3.3 — c4 input_bindings (verbatim)

The c4 binding entries within `rule_sets.input_bindings` for the Meridian rule_set (id `939cf576-4096-4ceb-a142-539a486868b3`).

## input_bindings.metric_derivations entries naming hub_total_loads / hub_total_capacity

```json
{
  "metric": "hub_total_loads",
  "filters": [
    {
      "field": "Tipo_Coordinador",
      "value": "Coordinador Senior",
      "operator": "eq"
    }
  ],
  "operation": "count",
  "source_pattern": "transaction"
},
{
  "metric": "hub_total_capacity",
  "filters": [
    {
      "field": "Tipo_Coordinador",
      "value": "Coordinador Senior",
      "operator": "eq"
    }
  ],
  "operation": "count",
  "source_pattern": "transaction"
}
```

## input_bindings.convergence_bindings.component_4 (c4 column-to-metric bindings, verbatim)

```json
"component_4": {
  "period": {
    "column": "Mes",
    "confidence": 0.775,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.9,
      "structuralType": "temporal",
      "contextualIdentity": "date"
    },
    "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
  },
  "numerator": {
    "column": "Cargas_Flota_Hub",
    "confidence": 0.9,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.7,
      "structuralType": "measure",
      "contextualIdentity": "count"
    },
    "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
  },
  "denominator": {
    "column": "Capacidad_Flota_Hub",
    "confidence": 0.9,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.7,
      "structuralType": "measure",
      "contextualIdentity": "count"
    },
    "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
  },
  "entity_identifier": {
    "column": "Hub",
    "confidence": 0.775,
    "match_pass": 1,
    "field_identity": {
      "confidence": 0.9,
      "structuralType": "identifier",
      "contextualIdentity": "person_identifier"
    },
    "source_batch_id": "e876997f-6a7a-4374-82b6-e9bf3bbd7a5b"
  }
}
```

## CC observations (verbatim, not classification)

- `metric_derivations` declares `hub_total_loads` and `hub_total_capacity` with `operation: "count"`, source_pattern `"transaction"`, filtered to `Tipo_Coordinador = "Coordinador Senior"`.
- `convergence_bindings.component_4.numerator.column` = `"Cargas_Flota_Hub"`.
- `convergence_bindings.component_4.denominator.column` = `"Capacidad_Flota_Hub"`.
- `convergence_bindings.component_4.entity_identifier.column` = `"Hub"` (not `"No_Empleado"`). The `field_identity.contextualIdentity` for `Hub` is `"person_identifier"` in this binding.

---

## E3_4_results.md

# E3.4 — Calculation results for selected (entity, period) (verbatim)

Selected: entity `007da35a-8e65-453b-ada9-b62337fd8683` × period `3c2557f4-d922-4b30-a073-ac4811f1f3cb` (January 2025).

## E3.4a — `calculation_results` (1 row)

```json
{
  "id": "a159f155-1eb1-4324-8504-a273c5035997",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "batch_id": "ef33e29f-d8f8-4b4f-8022-e183033b3800",
  "entity_id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "rule_set_id": "939cf576-4096-4ceb-a142-539a486868b3",
  "period_id": "3c2557f4-d922-4b30-a073-ac4811f1f3cb",
  "total_payout": 1402,
  "components": [
    {
      "payout": 300,
      "details": {
        "intentInputs": {
          "hub_route_volume":           { "source": "metric", "rawValue": 116,  "resolvedValue": 116 },
          "revenue_goal_attainment":    { "source": "metric", "rawValue": 94.72, "resolvedValue": 94.72 }
        },
        "intentPayout": 300,
        "fallbackSource": "calculationIntent",
        "intentOperation": "bounded_lookup_2d"
      },
      "componentId": "revenue_performance_senior",
      "componentName": "Revenue Performance - Senior",
      "componentType": "bounded_lookup_2d"
    },
    {
      "payout": 400,
      "details": {
        "intentInputs": {
          "on_time_delivery_percentage": { "source": "metric", "rawValue": 94.72, "resolvedValue": 94.72 }
        },
        "intentPayout": 400,
        "fallbackSource": "calculationIntent",
        "intentOperation": "bounded_lookup_1d"
      },
      "componentId": "on_time_delivery_senior",
      "componentName": "On-Time Delivery - Senior",
      "componentType": "bounded_lookup_1d"
    },
    {
      "payout": 700,
      "details": {
        "intentInputs": {
          "new_accounts_count": { "source": "metric", "rawValue": 2, "resolvedValue": 2 }
        },
        "intentPayout": 700,
        "fallbackSource": "calculationIntent",
        "intentOperation": "scalar_multiply"
      },
      "componentId": "new_accounts_senior",
      "componentName": "New Accounts - Senior",
      "componentType": "scalar_multiply"
    },
    {
      "payout": 0,
      "details": {},
      "componentId": "safety_record_senior",
      "componentName": "Safety Record - Senior",
      "componentType": "conditional_gate"
    },
    {
      "payout": 2,
      "details": {
        "intentInputs": {
          "ratio(hub_total_loads/hub_total_capacity)": {
            "source": "ratio",
            "rawValue": { "numerator": 116, "denominator": 116 },
            "resolvedValue": 1
          }
        },
        "intentPayout": 800,
        "fallbackSource": "calculationIntent",
        "intentOperation": "scalar_multiply"
      },
      "componentId": "fleet_utilization_senior",
      "componentName": "Fleet Utilization - Senior",
      "componentType": "scalar_multiply"
    }
  ],
  "metrics": {
    "Mes": 1, "Año": 2025, "_rowIndex": 72,
    "Ingreso_Meta": 151402, "Ingreso_Real": 143414,
    "Cuentas_Nuevas": 0, "Entregas_Tiempo": 102,
    "Cargas_Flota_Hub": 1044, "Entregas_Totales": 116,
    "Volumen_Rutas_Hub": 1044, "Capacidad_Flota_Hub": 1370,
    "Pct_Entregas_Tiempo": 0.8793, "Cumplimiento_Ingreso": 0.9472,
    "Incidentes_Seguridad": 0, "Tasa_Utilizacion_Hub": 0.762
  },
  "attainment": { "overall": 0 },
  "metadata": {
    "entityName": "Norma Rodríguez Rivera",
    "externalId": "70209",
    "intentMatch": false,
    "intentTotal": 1402,
    "legacyTotal": 2200,
    "intentTraces": [
      {
        "inputs": {
          "hub_route_volume":           { "source": "metric", "rawValue": 116,  "resolvedValue": 116 },
          "revenue_goal_attainment":    { "source": "metric", "rawValue": 94.72, "resolvedValue": 94.72 }
        },
        "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
        "modifiers": [],
        "confidence": 0.5,
        "finalOutcome": 300,
        "componentType": "bounded_lookup_2d",
        "componentIndex": 0,
        "lookupResolution": {
          "outputValue": 300,
          "rowBoundaryMatched":    { "max": 100, "min": 90, "index": 2 },
          "columnBoundaryMatched": { "max": 500, "min": 0,  "index": 0 }
        }
      },
      {
        "inputs": {
          "on_time_delivery_percentage": { "source": "metric", "rawValue": 94.72, "resolvedValue": 94.72 }
        },
        "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
        "modifiers": [],
        "confidence": 0.5,
        "finalOutcome": 400,
        "componentType": "bounded_lookup_1d",
        "componentIndex": 1,
        "lookupResolution": {
          "outputValue": 400,
          "rowBoundaryMatched": { "max": 95, "min": 90, "index": 2 }
        }
      },
      {
        "inputs": {
          "new_accounts_count": { "source": "metric", "rawValue": 2, "resolvedValue": 2 }
        },
        "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
        "modifiers": [],
        "confidence": 0.5,
        "finalOutcome": 700,
        "componentType": "scalar_multiply",
        "componentIndex": 2
      },
      {
        "inputs": {
          "constant:0":             { "source": "constant", "rawValue": 0, "resolvedValue": 0 },
          "safety_incidents_count": { "source": "metric",   "rawValue": 2, "resolvedValue": 2 }
        },
        "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
        "modifiers": [],
        "confidence": 0.5,
        "finalOutcome": 0,
        "componentType": "conditional_gate",
        "componentIndex": 3
      },
      {
        "inputs": {
          "hub_total_loads":    { "source": "metric", "rawValue": 116, "resolvedValue": 116 },
          "hub_total_capacity": { "source": "metric", "rawValue": 116, "resolvedValue": 116 }
        },
        "entityId": "007da35a-8e65-453b-ada9-b62337fd8683",
        "modifiers": [
          { "after": 1.5, "before": 800, "modifier": "cap" }
        ],
        "confidence": 0.5,
        "finalOutcome": 1.5,
        "componentType": "scalar_multiply",
        "componentIndex": 4
      }
    ],
    "roundingTrace": {
      "rawTotal": 1401.5,
      "components": [
        { "label": "Revenue Performance - Senior", "rawValue": 300, "roundedValue": 300, "componentIndex": 0, "roundingAdjustment": 0,   "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" } },
        { "label": "On-Time Delivery - Senior",     "rawValue": 400, "roundedValue": 400, "componentIndex": 1, "roundingAdjustment": 0,   "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" } },
        { "label": "New Accounts - Senior",         "rawValue": 700, "roundedValue": 700, "componentIndex": 2, "roundingAdjustment": 0,   "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" } },
        { "label": "Safety Record - Senior",        "rawValue": 0,   "roundedValue": 0,   "componentIndex": 3, "roundingAdjustment": 0,   "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" } },
        { "label": "Fleet Utilization - Senior",    "rawValue": 1.5, "roundedValue": 2,   "componentIndex": 4, "roundingAdjustment": 0.5, "precision": { "source": "inferred_from_outputs", "decimalPlaces": 0, "roundingMethod": "half_even" } }
      ],
      "roundedTotal": 1402,
      "totalRoundingAdjustment": 0.5
    }
  },
  "created_at": "2026-05-09T21:06:12.314139+00:00"
}
```

## E3.4b — `entity_period_outcomes` (1 row)

```json
{
  "id": "85a6224a-144e-46e6-96ee-38e240e83a8d",
  "tenant_id": "5035b1e8-0754-4527-b7ec-9f93f85e4c79",
  "entity_id": "007da35a-8e65-453b-ada9-b62337fd8683",
  "period_id": "3c2557f4-d922-4b30-a073-ac4811f1f3cb",
  "total_payout": 1402,
  "rule_set_breakdown": [
    { "rule_set_id": "939cf576-4096-4ceb-a142-539a486868b3", "total_payout": 1402 }
  ],
  "component_breakdown": [
    { "payout": 300, "componentId": "revenue_performance_senior", "componentName": "Revenue Performance - Senior" },
    { "payout": 400, "componentId": "on_time_delivery_senior",    "componentName": "On-Time Delivery - Senior" },
    { "payout": 700, "componentId": "new_accounts_senior",        "componentName": "New Accounts - Senior" },
    { "payout": 0,   "componentId": "safety_record_senior",       "componentName": "Safety Record - Senior" },
    { "payout": 2,   "componentId": "fleet_utilization_senior",   "componentName": "Fleet Utilization - Senior" }
  ],
  "lowest_lifecycle_state": "PREVIEW",
  "attainment_summary": { "overall": 0 },
  "metadata": {},
  "materialized_at": "2026-05-09T21:06:12.417023+00:00"
}
```

## E3.4c — `calculation_batches` for Meridian (3 rows, most recent first)

Three batches: one per period. Each has `lifecycle_state: PREVIEW`, `entity_count: 67`, `intentLayer.matchCount: 0`, `intentLayer.concordance: "0.0%"`, `intentLayer.mismatchCount: 67`, `intentLayer.intentsTransformed: 5`.

`patternSignatures` (identical across all 3 batches):
```
"bounded_lookup_2d:metric+metric:g5x4:group"
"bounded_lookup_1d:metric:b5:group"
"scalar_multiply:metric:rate_num:group"
"conditional_gate:metric+constant:group"
"scalar_multiply:op(ratio:metric+metric):rate_num:group:cap"
```

Batch totals (verbatim from `summary.total_payout`):
| batch.id | period_id | period (deduced) | total_payout |
|---|---|---|---|
| `ef33e29f-d8f8-4b4f-8022-e183033b3800` | `3c2557f4-d922-4b30-a073-ac4811f1f3cb` | January 2025 | **$55,909** |
| `8f00d244-4ef6-4336-81eb-399714d64eaf` | `95c303a0-0287-47ed-bbe5-f0a766a6843e` | February 2025 | **$53,559** |
| `2cb59727-dc0a-46e1-b16c-05a97b84d292` | `8bfc8730-458d-4abb-96cb-dc3f936bc2da` | March 2025 | **$57,534** |

These three batch totals match the directive's empirical anchor exactly ($55,909 / $53,559 / $57,534).

## E3.5 — Logs

No application-level log surface exists for this calculation run beyond what is persisted in `calculation_batches.config.insightAnalysis` and `calculation_results.metadata.intentTraces` (already surfaced above). The `addLog` helper in `route.ts` (line 79) writes to a local `log: string[]` array and `console.log` — neither is persisted to the database; both are ephemeral to the Vercel Lambda invocation that ran on 2026-05-09T21:06:12Z. No new instrumentation added per directive ("CC does not add new instrumentation; surfaces only what already exists"). Halt-noted.

## CC observations (verbatim, not classification)

- The c4 row's `intentInputs.ratio(hub_total_loads/hub_total_capacity).rawValue` is `{ numerator: 116, denominator: 116 }`. The committed_data row for Jan 2025 (E3.1 Row 4) carries `Cargas_Flota_Hub: 1044` and `Capacidad_Flota_Hub: 1370`.
- The c4 row's `metrics.Cargas_Flota_Hub` is `1044` and `metrics.Capacidad_Flota_Hub` is `1370` (matching committed_data), but `intentTraces[4].inputs.hub_total_loads.rawValue` is `116` and `.hub_total_capacity.rawValue` is `116` (matching `Entregas_Totales: 116` in committed_data, not the binding's column targets).
- The c4 modifier entry is `{ "after": 1.5, "before": 800, "modifier": "cap" }`. The `intentPayout` is `800`; the `finalOutcome` after the cap modifier is `1.5`; the `rawValue` then `roundedValue` is `2`.
- The batch summary `intentLayer.concordance` is `"0.0%"` for all 3 periods.
- The result row's `metadata.legacyTotal` is `2200`; `intentTotal` is `1402`; `intentMatch` is `false`.

---

## E4_boundary_table.md

# E4 — Value-at-every-boundary trace for c4 (verbatim)

**Subject:** entity `007da35a-8e65-453b-ada9-b62337fd8683` (Norma Rodríguez Rivera, external_id 70209) × period `3c2557f4-d922-4b30-a073-ac4811f1f3cb` (January 2025) × component `fleet_utilization_senior` (c4).

**Discipline:** every cell carries a verbatim runtime value or `<unrecoverable without runtime trace>`. Operation cells quote the verbatim source line from E1.4. CC does NOT classify any step as the locus of collapse.

Runtime values that ARE recoverable come from:
- E3.1 committed_data row (Jan 2025 row, id `34bd82fa-…`)
- E3.4 calculation_results row (id `a159f155-…`) including `components[4]`, `metadata.intentTraces[4]`, `metadata.roundingTrace.components[4]`, `metrics`

| # | Code location (file:line) | Function / block | Input shape & values | Operation (verbatim) | Output shape & values |
|---|---|---|---|---|---|
| 0 | `committed_data` row id `34bd82fa-1276-47bb-a6b7-47d0f004eea2` | DB read | n/a (DB read) | `SELECT * FROM committed_data WHERE entity_id = '007da35a-…' AND source_date = '2025-01-01'` | `row_data.Cargas_Flota_Hub = 1044`, `row_data.Capacidad_Flota_Hub = 1370`, `row_data.Entregas_Totales = 116`, `row_data.Tasa_Utilizacion_Hub = 0.762`, `period_id = null` |
| 1 | `route.ts:84` | POST handler — fetch superseded import_batch ids | `tenantId: '5035b1e8-…'` | `const supersededIds = await fetchSupersededBatchIds(supabase, tenantId);` | `supersededIds: <unrecoverable without runtime trace>` (E3.4 result row carries `import_batch_id` references but the operative-set diff is not persisted) |
| 2 | `route.ts:93` | calculationRunId pre-allocation | n/a | `const calculationRunId = crypto.randomUUID();` | calculationRunId = `ef33e29f-d8f8-4b4f-8022-e183033b3800` (matches `calculation_batches.id` in E3.4c) |
| 3 | `route.ts:?` (entity resolution invoke) | call `resolveEntitiesAtCalcTime` | committed_data rows w/ entity_id possibly null | `resolveEntitiesAtCalcTime(...)` (signature in `E1_4_6_calc-time-entity-resolution.md`) | <unrecoverable without runtime trace>; pre-existing E3.1 rows already carry `entity_id`, so this row's resolution is a no-op |
| 4 | `route.ts:?` (rule_set + period fetch) | DB read of `rule_sets` + `periods` | `tenantId, ruleSetId='939cf576-…', periodId='3c2557f4-…'` | `supabase.from('rule_sets').select(...).eq('id', ruleSetId)` | rule_set row from E2.2 (1287 lines); period row from E3.0 |
| 5 | `run-calculation.ts:543` (buildMetricsForComponent) | metric aggregation for c4 | committed_data rows for entity (4 rows from E3.1); component `fleet_utilization_senior` | `export function buildMetricsForComponent(...)` (full body in `E1_4_1_run-calculation.md`) | `metrics` object as persisted at result.metrics: `Cargas_Flota_Hub: 1044`, `Capacidad_Flota_Hub: 1370`, `Entregas_Totales: 116`, …; **note: the c4 intentTrace inputs derive different values** (see step 9) |
| 6 | `run-calculation.ts:111` (applyMetricDerivations) | derive metric_derivations from convergence-bindings & input_bindings | `metric_derivations` list (E2.2) + committed_data; component-targeted | `export function applyMetricDerivations(...)` (full body in `E1_4_1_run-calculation.md`) | `hub_total_loads`: <unrecoverable> intermediate; `hub_total_capacity`: <unrecoverable> intermediate. Per metric_derivations declared `operation: "count"` filtered by `Tipo_Coordinador = "Coordinador Senior"`. |
| 7 | `intent-transformer.ts:52` (transformVariant) | raw rule_sets.components[].calculationIntent → ComponentIntent | rule_set c4 declaration (E2.4): `{ operation: 'scalar_multiply', input: { source: 'ratio', sourceSpec: { numerator: 'hub_total_loads', denominator: 'hub_total_capacity' } }, rate: 800, modifiers: [{ modifier: 'cap', maxValue: 1.5 }] }` | `export function transformVariant(...)` (full body in `E1_4_3_intent-transformer.md`) | ComponentIntent shape (matching the declared intent — no transformation needed for `scalar_multiply` operation per intent-transformer line 38) |
| 8 | `intent-executor.ts:617` (executeIntent) | top-level intent executor | ComponentIntent for c4; `entityData: EntityData` | `export function executeIntent(intent, entityData): ExecutionResult` (full body in `E1_4_4_intent-executor.md`) | calls `executeOperation` then `applyModifiers`; returns ExecutionResult with `finalOutcome`, `inputs`, `modifiers`, `componentIndex` |
| 9 | `intent-executor.ts:344` (executeRatioOp) | ratio of metric source — numerator/denominator resolution | numerator metric `hub_total_loads`, denominator metric `hub_total_capacity` | `const num = resolveSource(op.numerator, data, inputLog); const den = resolveSource(op.denominator, data, inputLog); if (den.isZero()) { return ZERO; } return num.div(den);` | From E3.4 intentTraces[4].inputs: `hub_total_loads.rawValue=116, .resolvedValue=116; hub_total_capacity.rawValue=116, .resolvedValue=116`. Returned value: `116/116 = 1` (matches result.components[4].details.intentInputs.ratio(…).resolvedValue) |
| 10 | `intent-executor.ts:299` (executeScalarMultiply) | scalar multiply: input × rate | inputValue = `1` (from step 9); rate = `800` (literal from c4 intent) | `const inputValue = resolveValue(op.input, data, inputLog, trace); const rateValue = typeof op.rate === 'number' ? toDecimal(op.rate) : resolveValue(op.rate, data, inputLog, trace); return inputValue.mul(rateValue);` | `1 × 800 = 800` (matches result.components[4].details.intentPayout = 800) |
| 11 | `intent-executor.ts:683` (applyModifiers from executeIntent) | wrap `outcome = applyModifiers(outcome, intent.modifiers, ...)` | outcome = `800`; modifiers = `[{ modifier: 'cap', maxValue: 1.5 }]` | `outcome = applyModifiers(outcome, intent.modifiers, entityData, modifierLog);` | invokes `applyModifiers` per step 12 |
| 12 | `intent-executor.ts:584` (case 'cap' inside applyModifiers) | apply cap modifier to scalar_multiply outcome | result before = `800`; mod.maxValue = `1.5` | `case 'cap': { const cap = toDecimal(mod.maxValue); result = result.gt(cap) ? cap : result; break; }` | `800 > 1.5` → result becomes `1.5` (matches modifier log entry `{ before: 800, after: 1.5, modifier: 'cap' }`); finalOutcome = `1.5` |
| 13 | `decimal-precision.ts:144` (roundComponentOutput case 'scalar_multiply') | rounding | rawValue = `1.5`; precision = `{ source: 'inferred_from_outputs', decimalPlaces: 0, roundingMethod: 'half_even' }` | `case 'scalar_multiply': { ... }` (full body in `E1_4_5_decimal-precision.md`) | roundedValue = `2` (matches roundingTrace.components[4].roundedValue); roundingAdjustment = `0.5` |
| 14 | `route.ts:?` (persist) | DB write `calculation_results` row | per-entity component[] + metadata + metrics + total_payout = sum(roundedValues) | `await supabase.from('calculation_results').insert({ … });` (in POST body; full handler in `E1_2_a..f.md`) | calculation_results row id `a159f155-…`: `total_payout: 1402`, components[4].payout = `2` (verbatim E3.4a) |
| 15 | `route.ts:?` (rollup) | aggregate to entity_period_outcomes | rule_set_breakdown + component_breakdown built from per-entity component[] | `await supabase.from('entity_period_outcomes').upsert({…});` (in POST body) | EPO row id `85a6224a-…`: total_payout = `1402`; component_breakdown[4].payout = `2` (verbatim E3.4b) |

## CC observations (verbatim — no classification)

1. **Step 9 verbatim discrepancy (recoverable from DB state):** `intentTraces[4].inputs.hub_total_loads.rawValue` = `116` and `.hub_total_capacity.rawValue` = `116`. The same calculation_results row's `metrics.Cargas_Flota_Hub` = `1044`, `metrics.Capacidad_Flota_Hub` = `1370`, `metrics.Entregas_Totales` = `116`. The convergence_bindings entry for c4 (E2.4) targets `Cargas_Flota_Hub` (numerator) and `Capacidad_Flota_Hub` (denominator). The metric_derivations declarations for `hub_total_loads` and `hub_total_capacity` (E3.3) carry `operation: "count"`, `source_pattern: "transaction"`, `filters: [{ field: "Tipo_Coordinador", value: "Coordinador Senior", operator: "eq" }]`.

2. **Step 12 verbatim values:** the cap modifier transformed `800` into `1.5`. The committed_data row's `Tasa_Utilizacion_Hub` = `0.762`. The intent declaration (E2.4) has `modifiers: [{ "maxValue": 1.5, "modifier": "cap" }]`.

3. **Step 13 rounding:** `rawValue=1.5` → `roundedValue=2`. The roundingMethod is `"half_even"` (banker's rounding); `decimalPlaces=0`.

4. **Batch summary signal:** `calculation_batches.summary.intentLayer.matchCount = 0` and `concordance = "0.0%"` for all 3 periods (E3.4c) — i.e. the intent-layer outputs do not match the legacy-path outputs across the 67 entities in each batch. The result row's `metadata.legacyTotal = 2200`, `intentTotal = 1402`, `intentMatch = false`.

Architect reads the table top to bottom. The arithmetic operations and their inputs at each step are above; the Output column carries the verbatim values surfaced from DB state.

---

## E5_arithmetic_site_inventory.md

# E5 — Arithmetic site inventory (reformatted from E1.5)

Per directive: "Every arithmetic site touching c4-relevant variables on the execution path. Architect compares against E4 to determine which sites are on the actual c4 path and which are dormant."

The complete verbatim grep output (218 lines) is in `E1_5_arithmetic_sites.md`. Below is the same content re-rendered as the directive's tabular form for the **subset that the E4 boundary table identifies as on-path for c4** (steps 9, 10, 12, 13). The remaining 200+ rows from E1.5 are off-path or peripheral — architect reads the full E1.5 for the dormant inventory.

## On-path arithmetic sites for c4

| File:line | Variables | Operator | Verbatim line |
|---|---|---|---|
| `web/src/lib/calculation/intent-executor.ts:354` | `num`, `den` | `.div` | `return num.div(den);` (executeRatioOp) |
| `web/src/lib/calculation/intent-executor.ts:309` | `inputValue`, `rateValue` | `.mul` | `return inputValue.mul(rateValue);` (executeScalarMultiply) |
| `web/src/lib/calculation/intent-executor.ts:586` | `result`, `cap` | `.gt`, ternary | `result = result.gt(cap) ? cap : result;` (case 'cap' inside applyModifiers) |
| `web/src/lib/calculation/intent-executor.ts:606` | `result`, `before` | `toNumber` | `modifierLog.push({ modifier: mod.modifier, before, after: toNumber(result) });` (modifier log entry; the `{ before: 800, after: 1.5, modifier: 'cap' }` entry in E3.4a is from this line) |
| `web/src/lib/calculation/decimal-precision.ts:144` | rawValue, precision | (case body) | `case 'scalar_multiply': { … }` (full body in `E1_4_5_decimal-precision.md`; rounding logic) |
| `web/src/lib/calculation/intent-executor.ts:352` | `den` | `.isZero()` | `if (den.isZero()) { return ZERO; }` (zero-denominator guard — did not fire for c4 because den=116 not 0) |

## CC observation (verbatim, not classification)

The c4 boundary trace at step 12 (line 586) is where the **cap modifier transformed the value 800 into 1.5**. The line `result = result.gt(cap) ? cap : result;` is the literal site of that transformation. The full applyModifiers function (E1.4.4 lines 572-610) provides surrounding context.

The full 218-line `E1_5_arithmetic_sites.md` inventory contains arithmetic sites in:
- `web/src/app/api/calculation/run/route.ts` (the orchestrator; many sites involving `metric`, `result`, `value`, `component`)
- `web/src/lib/calculation/run-calculation.ts` (the engine; `evaluateComponent`, `buildMetricsForComponent`, etc.)
- `web/src/lib/calculation/intent-executor.ts` (the intent runtime; `executeRatioOp`, `executeScalarMultiply`, `applyModifiers`)
- `web/src/lib/calculation/decimal-precision.ts` (rounding + scaling)
- `web/src/lib/calculation/intent-transformer.ts` (AI-shape → ComponentIntent)

Architect reads E1.5 for the full inventory and E4 for the on-path subset.

---

## E6_schema_cross_reference.md

# E6 — Schema cross-reference (verbatim)

## E6.1 — Column-key inventory via Postgrest sample-row probe

**Halt-noted:** `information_schema.columns` is not exposed via Postgrest. Sample-row column-key introspection (Postgrest `select('*').limit(1)`) used as fallback per the prior AUD-007 finding. CC surfaces.

Verbatim probe output below for the 7 tables E2/E3/E4 read from.

### `rule_sets` — 18 columns
```
id: string                  population_config: object
tenant_id: string           input_bindings: object
name: string                components: object
description: string         cadence_config: object
status: string              outcome_config: object
version: number             metadata: object
effective_from: null        created_by: string
effective_to: null          approved_by: null
                            created_at: string
                            updated_at: string
```

### `committed_data` — 10 columns
```
id: string                  data_type: string
tenant_id: string           row_data: object
import_batch_id: string     metadata: object
entity_id: string           created_at: string
period_id: null             source_date: null
```

### `entities` — 11 columns
```
id: string                  profile_id: null
tenant_id: string           temporal_attributes: array
entity_type: string         metadata: object
status: string              created_at: string
external_id: string         updated_at: string
display_name: string
```

### `periods` — 11 columns
```
id: string                  start_date: string
tenant_id: string           end_date: string
label: string               canonical_key: string
period_type: string         metadata: object
status: string              created_at: string
                            updated_at: string
```

### `calculation_results` — 12 columns
```
id: string                  total_payout: number
tenant_id: string           components: array
batch_id: string            metrics: object
entity_id: string           attainment: object
rule_set_id: string         metadata: object
period_id: string           created_at: string
```

### `entity_period_outcomes` — 11 columns
```
id: string                  rule_set_breakdown: array
tenant_id: string           component_breakdown: array
entity_id: string           lowest_lifecycle_state: string
period_id: string           attainment_summary: object
total_payout: number        metadata: object
                            materialized_at: string
```

### `calculation_batches` — 16 columns
```
id: string                  entity_count: number
tenant_id: string           summary: object
period_id: string           config: object
rule_set_id: string         started_at: string
batch_type: string          completed_at: string
lifecycle_state: string     created_by: null
superseded_by: null         created_at: string
supersedes: null            updated_at: string
```

## E6.2 — Foreign-key relationships (verbatim from migrations)

**Halt-noted:** `information_schema.table_constraints + key_column_usage` are not exposed via Postgrest. The canonical FK declarations are in `supabase/migrations/*.sql`. Verbatim `REFERENCES` lines from the table-declaring migrations below.

### `rule_sets` (supabase/migrations/002_rule_sets_and_periods.sql)

```
12: CREATE TABLE rule_sets (
14:   tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
28:   created_by        UUID REFERENCES profiles(id),
29:   approved_by       UUID REFERENCES profiles(id),
```

### `periods` (supabase/migrations/002_rule_sets_and_periods.sql)

```
136: CREATE TABLE periods (
138:   tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
```

### `entities` (supabase/migrations/001_core_tables.sql)

```
57: CREATE TABLE entities (
59:   tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
```

### `committed_data` (supabase/migrations/003_data_and_calculation.sql)

```
51: CREATE TABLE committed_data (
53:   tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
54:   import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL,
55:   entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,
56:   period_id       UUID REFERENCES periods(id) ON DELETE SET NULL,
```

### `calculation_batches` (supabase/migrations/003_data_and_calculation.sql)

```
90:  CREATE TABLE calculation_batches (
92:    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
93:    period_id       UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
94:    rule_set_id     UUID REFERENCES rule_sets(id) ON DELETE SET NULL,
103:   superseded_by   UUID REFERENCES calculation_batches(id),
104:   supersedes      UUID REFERENCES calculation_batches(id),
110:   created_by      UUID REFERENCES profiles(id),
```

### `calculation_results` (supabase/migrations/003_data_and_calculation.sql)

```
151: CREATE TABLE calculation_results (
153:   tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
154:   batch_id        UUID NOT NULL REFERENCES calculation_batches(id) ON DELETE CASCADE,
155:   entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
156:   rule_set_id     UUID REFERENCES rule_sets(id) ON DELETE SET NULL,
157:   period_id       UUID REFERENCES periods(id) ON DELETE SET NULL,
```

### `entity_period_outcomes` (supabase/migrations/004_materializations.sql)

```
136: CREATE TABLE entity_period_outcomes (
138:   tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
139:   entity_id             UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
140:   period_id             UUID NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
```

## CC observations (verbatim, not classification)

- `committed_data.period_id` is `nullable` (FK `ON DELETE SET NULL`), and the live row sample's `period_id` is `null` (E3.1 — all 4 rows for the selected entity).
- `calculation_results.period_id` is also nullable; the live row sample's `period_id` is non-null (`3c2557f4-…`).
- `entity_period_outcomes.period_id` is `NOT NULL` (no FK SET NULL); the live row sample's `period_id` matches the selected period.
- No FK named after the c4 component exists at the schema layer; c4 is a JSONB element within `rule_sets.components.variants[0].components[4]`.

---

