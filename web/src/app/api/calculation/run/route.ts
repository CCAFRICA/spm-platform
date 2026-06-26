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
import { resolveCallerTenant } from '@/lib/auth/api-tenant'; // OB-246 AP3 — session-derived tenant
import { resolveReferenceJoinRows } from '@/lib/calculation/reference-join'; // HF-329: classified reference-sheet join
import {
  aggregateMetrics,
  getExpectedMetricNames,
  type ComponentResult,
  type AIContextSheet,
  type MetricDerivationRule,
  rowMatchesFilters,
  // HF-228 Phase 4: production entity loop now executes convergence-produced
  // metric_derivations rules so derived metrics (e.g. filtered counts,
  // cross-category sums) reach the intent executor's data.metrics map.
  applyMetricDerivations,
} from '@/lib/calculation/run-calculation';
import { inferSemanticType } from '@/lib/orchestration/metric-resolver';
import { transformVariant } from '@/lib/calculation/intent-transformer';
import { groundComponentDags } from '@/lib/intelligence/category-grounding'; // OB-223 §1.7
import { executeIntent, type EntityData } from '@/lib/calculation/intent-executor';
import type { ComponentIntent, RoundingTrace } from '@/lib/calculation/intent-types';
import type { PlanComponent } from '@/types/compensation-plan';
// OB-217: per-transaction trace substrate.
import { writeCalculationTraces } from '@/lib/supabase/calculation-service';
import {
  analyzePrimeDag,
  classifyAttributionPattern,
  extractTransactionRef,
  attributeRows,
  type AttributionTracePrecursor,
  type PerRowMetricValue,
} from '@/lib/calculation/per-row-attribution';
// OB-220: wide-format temporal column binding (Cuotas Enero_2025..Junio_2025).
import { resolveTemporalColumn, periodKeyFromStartDate, isTemporalBinding } from '@/lib/calculation/temporal-binding';
import { toNumber, roundComponentOutput, inferOutputPrecision, ZERO } from '@/lib/calculation/decimal-precision';
import type { Json } from '@/lib/supabase/database.types';
import { convergeBindings, extractLeafSources, extractReferencesFromDAG, findComponentResolutionFailure, findIncompleteBindings, type IncompleteBinding, type ComponentBinding } from '@/lib/intelligence/convergence-service';
// OB-199 Phase 4: canonical writer migration.
import { writeSignal, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
// HF-196 Phase 2: calc-time entity resolution per Decision 92 + OB-182 stated intent.
// HF-301 (AUD-006 RC-1): resolveEntitiesAtCalcTime import REMOVED — its whole-tenant scan timed out
// the calc at MIR scale. OB-183 resolves entity_id in-memory from period rows; the durable back-link
// is the import's job (HF-300 finalize-import). The calc-time-entity-resolution module is unchanged.
// HF-219 Component R2: bidirectional flywheel loop wiring at structural_exception path.
import { decrementFingerprintConfidence } from '@/lib/sci/fingerprint-flywheel';
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
// HF-216: ConvergenceBindingEntry type (extended with optional via-join clause).
import type { ConvergenceBindingEntry } from '@/types/convergence-bindings';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { periodId, ruleSetId } = body;

  // OB-246 AP3: tenant from the authenticated session, never body.tenantId.
  const auth = await resolveCallerTenant(body?.tenantId);
  if (!auth.ok) return auth.response;
  const tenantId = auth.caller.tenantId;

  if (!periodId || !ruleSetId) {
    return NextResponse.json(
      { error: 'Missing required fields: periodId, ruleSetId' },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();
  const log: string[] = [];
  const addLog = (msg: string) => { log.push(msg); console.log(`[CalcAPI] ${msg}`); };

  // Phase 6B: the SINGLE canonical visibility gate — hides non-completed AND superseded batches. This
  // route previously composed only the legacy HF-196 superseded filter (no D16.1 gate); it now adopts the
  // gate (the F4 fix: the gate is the one predicate every committed_data consumer reads).
  const { hiddenBatchIdsForTenant, applyCommittedDataVisibility } = await import('@/lib/sci/committed-data-visibility');
  const hiddenBatchIds = await hiddenBatchIdsForTenant(supabase, tenantId);
  if (hiddenBatchIds.length > 0) {
    addLog(`visibility gate: ${hiddenBatchIds.length} batch(es) hidden (non-completed or superseded)`);
  }

  // OB-197 G11: pre-generate the calculation run id at run-start so signals
  // emitted during convergence (which runs before the calculation_batches row
  // is inserted) share scope with the eventual batch row. The id is assigned
  // to calculation_batches.id at insert time, making batch.id == calculationRunId.
  const calculationRunId = crypto.randomUUID();

  addLog(`Starting: tenant=${tenantId}, period=${periodId}, ruleSet=${ruleSetId}, run=${calculationRunId}`);

  // HF-208: Reconciliation summary counters. Incremented at existing emission sites;
  // surfaced in the [CalcRecon] summary block at handler exit. See HF-208 directive §3.
  // HF-220 R2: ob118MergeGuardFiredCount retired (merge-guard removed; counter vestigial).
  // HF-222 Phase 3: diag003FallbackCount retired (schema-class root closure eliminated
  // the fallback path; counter remains for [CalcRecon-T1] footer schema stability —
  // always logs 0 post-Phase-3).
  const diag003FallbackCount = 0;
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

  // HF-272: per-component resolution failures — componentIndex → { name, token, reason }.
  // Populated once per failed component (a required reference token mapped to NO real column
  // at convergence; the relocated hallucination-catch). Surfaced distinctly in the
  // [CalcRecon-T1] footer (a loud `failed`, never counted as a $0 success).
  const resolutionFailures: Map<number, { name: string; token: string; reason: string }> = new Map();

  // HF-212: Variant distribution accumulator — variantKey → count of entities matched.
  // Populated at variant decision site (after exclusion check); surfaced in Tier 1 footer.
  const variantCounts: Map<string, number> = new Map();

  // HF-212: Per-entity flags collector. Handler-scope `let` so closures (resolveColumn
  // FromBatch, etc.) capture the variable binding; reassigned at start of each entity
  // iteration. Read by Tier 2 emission line. Push from any Tier 3 emission site.
  let currentEntityFlags: string[] = [];

  // ── HF-301 (AUD-006 RC-1): whole-tenant calc-time entity resolution REMOVED from the hot path. ──
  // This previously called `resolveEntitiesAtCalcTime(tenantId, supabase)` → `resolveEntitiesFromCommittedData`,
  // a WHOLE-TENANT scan of every committed_data row (165,897 on the MIR tenant) plus an entity_id back-link
  // UPDATE. Above ~50k rows it dominated the 300s budget and timed out the calc function (AUD-006).
  //
  // It is NOT needed at calc time: OB-183 resolves entity_id IN-MEMORY from row_data[metadata.entity_id_field]
  // against extIdToUuid using only the PERIOD-scoped rows already loaded (the `calcTimeResolved` loop in
  // Phase 4 below). The DURABLE entity_id back-link is the IMPORT's responsibility now — HF-300 moved it to
  // the /api/import/sci/finalize-import endpoint (a live request), so the calc must not redo a whole-tenant
  // write. Korean Test: OB-183 keys on the structural metadata.entity_id_field the SCI classification wrote
  // at import time — no field-name matching here. (Was: HF-196 Phase 2 / Decision 92 / OB-182 intent.)
  addLog('HF-301: whole-tenant calc-time entity resolution skipped — OB-183 resolves period-scoped entity_id in-memory (Phase 4)');

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
    // HF-226 Phase 2B: convergence_version marker. Pre-HF-226 bindings were
    // produced by generateDerivationsForMatch which hardcoded filters: [] —
    // they look "complete" but never carry filter information. Re-derive
    // when the marker is absent so the unified Pass 4 path runs fresh and
    // produces filters for metrics that semantically require categorical
    // subsetting.
    const convergenceVersion = typeof rawBindings?.convergence_version === 'string' ? rawBindings.convergence_version : null;
    // HF-234: separation of concerns moved filter discovery from Call 1's
    // binding output to Pass 4's metric_derivations. Pre-HF-234 bindings may
    // carry filters on the binding entry from Call 1's object-form return;
    // those are now stale because Pass 4 also produces filters for the same
    // metric (different key) and the engine consumes BOTH. Force re-derive
    // for any rule_set not yet at HF-234.
    const bindingsAreCurrent = convergenceVersion === 'HF-234';

    // HF-281: binding completeness — populated by whichever branch produces the
    // bindings calc will use (fresh convergence or reused). When a component
    // binding is missing any intent-required token, calc must NOT run against it.
    let incompleteBindings: IncompleteBinding[] = [];

    if ((!hasMetricDerivations && !hasConvergenceBindings) || !bindingsAreCurrent) {
      addLog('HF-165: input_bindings empty — running calc-time convergence');
      try {
        const convResult = await convergeBindings(tenantId, ruleSetId, supabase, calculationRunId);
        const derivationCount = convResult.derivations.length;
        const bindingCount = Object.keys(convResult.componentBindings).length;
        const gapCount = convResult.gaps.length;

        // HF-281: a component binding is complete only if it maps every token its
        // intent requires (requiredTokens ⊆ mappedTokens). Checked ONLY when the
        // convergence_bindings path is active (bindingCount > 0) — the legacy
        // metric_derivations path is untouched. Structure-only predicate; no
        // literals, no per-cause handling (AUD-009 / Decision 154).
        if (bindingCount > 0) {
          incompleteBindings = findIncompleteBindings(ruleSet.components, convResult.componentBindings);
        }

        if ((derivationCount > 0 || bindingCount > 0) && incompleteBindings.length === 0) {
          // Store convergence results on the rule_set for future calculations
          const updatedBindings: Record<string, unknown> = {};

          if (bindingCount > 0) {
            // Decision 111: convergence_bindings is the primary output
            updatedBindings.convergence_bindings = convResult.componentBindings;
          }

          if (derivationCount > 0) {
            updatedBindings.metric_derivations = convResult.derivations;
          }

          // HF-234: stamp the convergence_version so the reuse gate at line
          // ~228 can distinguish pre-HF-234 (filters on binding) from
          // post-HF-234 (filters on metric_derivations only) outputs. Bumped
          // from 'HF-226' once the Call-1 prompt stopped requesting filters
          // and Pass 4 became the sole filter-discovery surface.
          updatedBindings.convergence_version = 'HF-234';

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
        } else if (incompleteBindings.length > 0) {
          // HF-281: do NOT persist an incomplete binding set (atomic — no partial
          // binding set). The gate below aborts the calc run; the freshly-derived
          // incomplete bindings are discarded, never written to input_bindings.
          addLog(`HF-281: Convergence produced an INCOMPLETE binding set (${incompleteBindings.length} component binding(s) missing required tokens) — not persisting; aborting calc.`);
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
      // HF-281: re-validate the REUSED binding set — a partial binding set
      // persisted by a prior run (pre-HF-281) must not silently calc on reuse.
      if (hasConvergenceBindings) {
        incompleteBindings = findIncompleteBindings(
          ruleSet.components,
          rawBindings?.convergence_bindings as Record<string, Record<string, ComponentBinding>> | undefined,
        );
      }
    }

    // HF-281 — binding-completeness PHASE GATE. Calc never executes against a
    // binding set known at bind time to be incomplete (the Meridian senior-c4
    // shape: Utilización bound without its two tokens → flagged zeros). Structured,
    // operator-visible failure naming variant group + component + missing tokens
    // through the run-route's existing failure channel; nothing persisted. The
    // calc-time T3 RESOLUTION_FAILURE surface remains as backstop for bind-vs-calc
    // data drift.
    if (incompleteBindings.length > 0) {
      const detail = incompleteBindings
        .map(b => `${b.componentName}${b.variantId ? ` [variant ${b.variantId}]` : ''} (${b.componentKey}): missing ${b.missingTokens.join(', ')}`)
        .join('; ');
      const reason = `Binding phase incomplete (HF-281) — ${incompleteBindings.length} component binding(s) do not map every intent-required token; calc aborted, no partial binding set persisted. Re-bind (cold re-import) once the columns resolve. Incomplete: ${detail}`;
      addLog(`HF-281: ${reason}`);
      return NextResponse.json(
        { error: reason, incompleteBindings, log },
        { status: 422 },
      );
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
  // Per-component bindings: { component_N: { actual: { column, learning_provenance, ... }, ... } }
  // HF-222 Phase 3: learning_provenance.batch_id replaces the prior collapsed batch-id field;
  // data-location resolution is column-name-keyed across all operative-period batches.
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

  // ── OB-223 §1.7: calc-time category value grounding (P1) ──
  // A category-differentiated component's DAG misuses `scope` (per-row partition) with PLAN-vocabulary
  // filter values (e.g. "ALI"); the data stores full values ("Alimentos"). Ground the plan labels to
  // the tenant's actual distinct values and rewrite scope→filter, IN MEMORY for this calc (deterministic
  // prefix/initials matcher — no LLM, cheap to redo each run). Conditional on scope-node presence →
  // BCL/Meridian (no scope) untouched. Architect verifies the produced numbers on MIR (SR-44).
  try {
    const groundResults = await groundComponentDags(
      defaultComponents as unknown as Array<Record<string, unknown>>,
      async (field: string): Promise<string[]> => {
        const vals = new Set<string>();
        for (let page = 0; page < 5 && vals.size < 50; page++) {
          let q = supabase.from('committed_data').select('row_data').eq('tenant_id', tenantId).range(page * 1000, page * 1000 + 999);
          q = applyCommittedDataVisibility(q, hiddenBatchIds);
          const { data } = await q;
          if (!data || data.length === 0) break;
          for (const r of data) {
            const v = (r.row_data as Record<string, unknown> | null)?.[field];
            if (typeof v === 'string' && v.trim()) vals.add(v.trim());
          }
          if (data.length < 1000) break;
        }
        return Array.from(vals);
      },
    );
    const grounded = groundResults.filter(r => r.grounded > 0);
    if (grounded.length > 0) {
      addLog(`OB-223 §1.7: grounded ${grounded.length} category-differentiated component(s): ${grounded.map(g => `${g.name}→${g.grounded} filter(s)`).join('; ')}`);
    }
    const stillUngrounded = groundResults.filter(r => r.ungrounded > 0);
    if (stillUngrounded.length > 0) {
      addLog(`OB-223 §1.7: ${stillUngrounded.length} component(s) have ungrounded scope branches (plan label unmatched in data) — left unfiltered, no wrong filter.`);
    }
  } catch (err) {
    addLog(`OB-223 §1.7: category grounding skipped (${err instanceof Error ? err.message : 'error'})`);
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
        .eq('entity_type', 'individual')  // HF-263: never self-assign grouping entities for calculation
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

  // HF-218 Component 2: tenant entity external_id set for engine-side binding verification.
  // Per Disposition 2 (architect Decision B): engine reading tenant.entities for verification
  // does not violate Calculation Sovereignty — verification is gate-and-correct with full
  // SOC-grade preservation (Component 5 snapshot), not influence-result. Set used to compute
  // C_proposed at calc time for the existing convergence_bindings.entity_identifier column.
  const tenantEntityExternalIdsForEngine = new Set<string>();
  {
    const { data: extRows, error: extErr } = await supabase
      .from('entities')
      .select('external_id')
      .eq('tenant_id', tenantId)
      .not('external_id', 'is', null);
    if (extErr) {
      addLog(`HF-218 Tenant entity external_id fetch failed (non-blocking): ${extErr.message}`);
    } else if (extRows) {
      for (const r of extRows) {
        if (r.external_id != null) tenantEntityExternalIdsForEngine.add(String(r.external_id).trim());
      }
    }
    addLog(`HF-218 Engine verification baseline: ${tenantEntityExternalIdsForEngine.size} tenant external_ids`);
  }
  // HF-218 Component 5: accumulator for binding corrections fired during this calculation run.
  // Persisted into calculation_results.metadata.binding_snapshot.corrections_in_this_run.
  const correctionsInThisRun: Array<{
    entity_id: string;
    entity_external_id?: string | null;
    component_index: number;
    component_name: string;
    pre_column: string;
    post_column: string;
    pre_confidence: number;
    post_confidence: number;
    methodology_version: string;
    ts: string;
  }> = [];
  // HF-218 Component 2: structural exceptions emitted during this calculation run.
  const structuralExceptionsInThisRun: Array<{
    entity_id: string;
    entity_external_id?: string | null;
    component_index: number;
    component_name: string;
    reason: string;
    binding_column: string;
    ts: string;
  }> = [];

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
      .in('id', batch)
      .eq('entity_type', 'individual');  // HF-263: exclude grouping entities (hubs/territories) from calc
    if (entErr) {
      console.log(`[R3-DIAG] Entity batch ${i}-${i+batch.length} ERROR: ${entErr.message}`);
    }
    if (page) entities.push(...page);
  }

  const entityMap = new Map(entities.map(e => [e.id, e]));

  // HF-263: drop grouping (non-individual) entities from the calculation population.
  // entityMap was fetched with entity_type='individual', so any assigned id absent from
  // it is a grouping entity (e.g. a hub). They remain in committed_data / dataByEntity /
  // allEntityRowsForPeriod as the scope SOURCE (HALT-5 preserved) — only excluded as payees.
  {
    const beforeCount = entityIds.length;
    entityIds = entityIds.filter(id => entityMap.has(id));
    if (entityIds.length !== beforeCount) {
      addLog(`HF-263: excluded ${beforeCount - entityIds.length} grouping (non-individual) entities from calculation population`);
    }
  }

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
  // OB-217: select `id` so per-row traces can carry committed_data_id (structural identity).
  const committedData: Array<{ id: string; entity_id: string | null; data_type: string; row_data: Json; import_batch_id: string | null; metadata: Json | null }> = [];

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
        .select('id, entity_id, data_type, row_data, import_batch_id, metadata')
        .eq('tenant_id', tenantId)
        .not('source_date', 'is', null)
        .gte('source_date', period.start_date)
        .lte('source_date', period.end_date)
        .range(from, to);
      q = applyCommittedDataVisibility(q, hiddenBatchIds);
      const { data: page } = await q;

      if (!page || page.length === 0) break;
      committedData.push(...page);
      if (page.length < PAGE_SIZE) break;
      sdPage++;
    }
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
        .select('id, entity_id, data_type, row_data, import_batch_id, metadata')
        .eq('tenant_id', tenantId)
        .eq('period_id', periodId)
        .range(from, to);
      q = applyCommittedDataVisibility(q, hiddenBatchIds);
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
      .select('id, entity_id, data_type, row_data, import_batch_id, metadata')
      .eq('tenant_id', tenantId)
      .is('period_id', null)
      .is('source_date', null)
      .range(from, to);
    q = applyCommittedDataVisibility(q, hiddenBatchIds);
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
      // OB-216 Phase 4 (fold-in, Rule 34): pick the entity-id field by ARGMAX value-overlap with the
      // entity external_ids over the sample — the field whose values most match — rather than the FIRST
      // field to clear the retired developer match-rate cutoff. Decision 110: the only bare number is 0,
      // the structural floor "does this field match ANY entity at all". Korean Test: value-overlap, never
      // field name.
      const sampleSize = Math.min(committedData.length, 20);
      let bestField: string | null = null;
      let bestRate = 0;
      for (const [field, value] of Object.entries(sampleRow)) {
        if (typeof value !== 'string' || !value.trim()) continue;
        if (!extIdToUuid.has(value.trim())) continue;
        let matchCount = 0;
        for (let s = 0; s < sampleSize; s++) {
          const rd = committedData[s].row_data as Record<string, unknown> | null;
          const val = rd?.[field];
          if (typeof val === 'string' && extIdToUuid.has(val.trim())) matchCount++;
        }
        const matchRate = matchCount / sampleSize;
        if (matchRate > bestRate) { bestRate = matchRate; bestField = field; }
      }
      if (bestField && bestRate > 0) {
        fallbackEntityIdField = bestField;
        addLog(`HF-181/OB-216 Phase 4: entity_id_field discovered '${bestField}' by argmax value-overlap (${(bestRate * 100).toFixed(0)}% of sample)`);
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
  //
  // HF-222 Phase 3 (schema-class root closure): the prior batch-id-keyed
  // intermediary map for entity column resolution is eliminated. Entity column
  // resolution now derives directly from convergenceBindings — every component's
  // entity_identifier binding contributes its column name; the canonical path is
  // single-column-shared-across-batches (the DIAG-003 operative assumption).
  // Downstream consumers (resolveColumnFromBatch) iterate dataByBatch by column
  // name; no batch_id mediation.
  const dataByBatch = new Map<string, Map<string, Array<Record<string, unknown>>>>();
  // OB-217: parallel per-row structure carrying committed_data identity (id) + sibling
  // metadata, keyed IDENTICALLY to dataByBatch (same batch + per-sheet entity-key column).
  // The existing aggregation path (dataByBatch / resolveColumnFromBatch) is untouched; the
  // per-row attribution step reads this sibling so each trace can carry committed_data_id and
  // a structurally-extracted transaction_ref. Memory is bounded by the same row set already
  // held for the whole calc (row_data is referenced, not copied).
  const attribRowsByBatch = new Map<string, Map<string, Array<{ id: string; row_data: Record<string, unknown>; metadata: Record<string, unknown> }>>>();
  // HF-329: rows from dimensional REFERENCE sheets that carry NO entity-overlapping key column —
  // they never key into dataByBatch (their entityKey resolves empty), so resolveColumnFromBatch would
  // hard-stop (column_in_no_batch) on a convergence-bound column that lives only here (e.g. Meridian
  // Datos_Flota_Hub.Cargas_Totales). Retained flat for the reference-join fallback below: entity →
  // value-overlap dimensional key (a classified reference_key the entity's own rows carry) → reference
  // row → column value. Period scoping is already applied — committedData is fetched source_date-scoped
  // to the calc period, so these reference rows are the current period's rows by construction.
  const referenceRows: Array<Record<string, unknown>> = [];
  if (convergenceBindings && Object.keys(convergenceBindings).length > 0) {
    // Derive known entity columns directly from convergenceBindings.
    const knownEntityCols = Array.from(new Set(
      Object.values(convergenceBindings)
        .map(comp => (comp as Record<string, unknown> | undefined)?.entity_identifier as
          { column?: string } | undefined)
        .map(eid => eid?.column)
        .filter((col): col is string => !!col && col.length > 0)
    ));
    const entityCol: string | undefined = knownEntityCols[0];

    if (entityCol) {
      // HF-302 (RC-3, DIAG-072): assigned-entity external_id set for structural key discovery.
      // extIdToUuid was built above from the assigned (paying) entities. Korean Test: value-overlap, not names.
      const entityExtIdSet = new Set(Array.from(extIdToUuid.keys()));

      // OB-216 Phase 4 (per-sheet entity key): the global `entityCol = knownEntityCols[0]` keyed EVERY
      // batch by ONE column — correct for MIR (uniform DNI_Vendedor across sheets) but wrong for a tenant
      // whose sheets carry DIFFERENT entity identifiers. Replace it with a PER-BATCH key: for each batch,
      // the entity-key column is the one whose VALUES most overlap the assigned-entity external_ids
      // (argmax membership — HF-303 relative selection, the only bare number being 0, the structural floor
      // "is this column an entity foreign key at all"; ties surface and fall back). This generalises the
      // prior primary+secondary keying into one per-sheet mechanism: a heterogeneous-identifier tenant is
      // served BY CONSTRUCTION; MIR/BCL resolve every sheet to their single shared key (no regression). The
      // binding's entity_identifier (entityCol) is the fallback when a batch has no value-overlapping column.
      const batchEntityCol = new Map<string, string>();
      {
        const perBatchColHits = new Map<string, Map<string, { hit: number; total: number }>>();
        for (const row of committedData) {
          const batchId = row.import_batch_id;
          if (!batchId) continue;
          const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
            ? row.row_data as Record<string, unknown> : {};
          let cm = perBatchColHits.get(batchId);
          if (!cm) { cm = new Map(); perBatchColHits.set(batchId, cm); }
          for (const [col, val] of Object.entries(rd)) {
            const v = String(val ?? '').trim();
            if (!v) continue;
            let st = cm.get(col); if (!st) { st = { hit: 0, total: 0 }; cm.set(col, st); }
            st.total++;
            if (entityExtIdSet.has(v)) st.hit++;
          }
        }
        for (const [batchId, cm] of Array.from(perBatchColHits.entries())) {
          let maxMembership = 0;
          let winners: string[] = [];
          for (const [col, st] of Array.from(cm.entries())) {
            if (st.total < 1) continue;
            const membership = st.hit / st.total;        // ratio of set-membership counts — a structural observation
            if (membership > maxMembership) { maxMembership = membership; winners = [col]; }
            else if (membership === maxMembership && maxMembership > 0) { winners.push(col); }
          }
          if (maxMembership > 0 && winners.length === 1) {
            batchEntityCol.set(batchId, winners[0]);
          } else if (winners.length > 1) {
            // Genuine ambiguity (two columns equally entity-id-like): fall back to the binding key; never
            // pick by iteration order.
            addLog(`OB-216 Phase 4: ambiguous per-sheet entity key for batch ${batchId} — ${winners.length} columns tie at max membership; using binding entity_identifier`);
          }
          // maxMembership === 0 → no overlapping column; the binding entity_identifier fallback applies below.
        }
      }

      for (const row of committedData) {
        const batchId = row.import_batch_id;
        if (!batchId) continue;

        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown> : {};

        if (!dataByBatch.has(batchId)) dataByBatch.set(batchId, new Map());
        const entityMap = dataByBatch.get(batchId)!;

        // OB-216 Phase 4: index by THIS batch's (sheet's) entity-key column (value-overlap argmax), with
        // the binding's entity_identifier as the fallback. The key VALUE that reaches a payee is an
        // assigned entity external_id.
        const keyCol = batchEntityCol.get(batchId) ?? entityCol;
        const entityKey = String(rd[keyCol] ?? '').trim();
        if (entityKey) {
          if (!entityMap.has(entityKey)) entityMap.set(entityKey, []);
          entityMap.get(entityKey)!.push(rd);
          // OB-217: mirror this row into the per-row attribution structure under the same key.
          if (!attribRowsByBatch.has(batchId)) attribRowsByBatch.set(batchId, new Map());
          const attribMap = attribRowsByBatch.get(batchId)!;
          if (!attribMap.has(entityKey)) attribMap.set(entityKey, []);
          attribMap.get(entityKey)!.push({
            id: row.id,
            row_data: rd,
            metadata: (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata))
              ? row.metadata as Record<string, unknown> : {},
          });
        } else {
          // HF-329: no entity-key value on this row — a dimensional reference-sheet row. Retain it for
          // the reference-join fallback in resolveColumnFromBatch. (Entity/transaction-batch rows always
          // carry the key, so this captures reference sheets; a stray sparse entity row is harmless —
          // the join only reads reference rows that actually carry the convergence-bound column.)
          referenceRows.push(rd);
        }
      }
      addLog(`HF-109 Batch cache: ${dataByBatch.size} batches indexed by external_id (DS-009 5.1)`);
      addLog(`HF-329 Reference rows retained for cross-sheet join: ${referenceRows.length}`);
      addLog(`OB-216 Phase 4: per-sheet entity key — ${batchEntityCol.size}/${dataByBatch.size} batch(es) keyed by their own value-overlap column; the rest fall back to the binding entity_identifier (${entityCol})`);
    }
  }

  // HF-216: Build roster join index for entity_identifier.via bindings.
  // Indexes: "data_type|entity_field|roster_field" → Map<entity_external_id, roster_field_value>
  // The map allows resolveMetricsFromConvergenceBindings to translate the
  // employee external_id into the join-target value (e.g., Hub_Asignado) that
  // the measure-side cache (dataByBatch) is keyed by.
  const rosterJoinIndex = new Map<string, Map<string, string>>();
  if (convergenceBindings && Object.keys(convergenceBindings).length > 0) {
    const viaSpecs = new Set<string>();
    for (const compBindings of Object.values(convergenceBindings)) {
      const cb = compBindings as Record<string, ConvergenceBindingEntry>;
      const eid = cb.entity_identifier;
      if (eid?.via?.roster_data_type && eid.via.roster_field && eid.via.entity_field) {
        viaSpecs.add(`${eid.via.roster_data_type}|${eid.via.entity_field}|${eid.via.roster_field}`);
      }
    }

    for (const spec of Array.from(viaSpecs)) {
      const [rosterDataType, entityField, rosterField] = spec.split('|');
      const map = new Map<string, string>();
      for (const row of committedData) {
        if (row.data_type !== rosterDataType) continue;
        const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
          ? row.row_data as Record<string, unknown> : {};
        const entityVal = rd[entityField];
        const rosterVal = rd[rosterField];
        if (entityVal != null && rosterVal != null) {
          map.set(String(entityVal).trim(), String(rosterVal).trim());
        }
      }
      rosterJoinIndex.set(`${rosterDataType}|${entityField}|${rosterField}`, map);
    }

    if (rosterJoinIndex.size > 0) {
      addLog(`HF-216 Roster join index: ${rosterJoinIndex.size} via-specs indexed`);
    }
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
          .select('id, entity_id, data_type, row_data, import_batch_id, metadata')
          .eq('tenant_id', tenantId)
          .not('source_date', 'is', null)
          .gte('source_date', priorPeriod.start_date)
          .lte('source_date', priorPeriod.end_date)
          .range(from, to);
        q = applyCommittedDataVisibility(q, hiddenBatchIds);
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
          .select('id, entity_id, data_type, row_data, import_batch_id, metadata')
          .eq('tenant_id', tenantId)
          .eq('period_id', priorPeriodId)
          .range(from, to);
        q = applyCommittedDataVisibility(q, hiddenBatchIds);
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
    // Get distinct batch IDs from committed_data (OB-153: also check period-agnostic data)
    // HF-196 Phase 1E: filter out superseded batches per Rule 30.
    let bq = supabase
      .from('committed_data')
      .select('import_batch_id')
      .eq('tenant_id', tenantId)
      .not('import_batch_id', 'is', null)
      .limit(100);
    bq = applyCommittedDataVisibility(bq, hiddenBatchIds);
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
  // HF-216: ConvergenceBindingEntry extracted to @/types/convergence-bindings.ts; via clause added.

  function resolveMetricsFromConvergenceBindings(
    compBindings: Record<string, unknown>,
    component: PlanComponent,
    entityExternalId: string,
    componentIdx?: number,
  ): Record<string, number> | null {
    if (shouldEmitTrace(entityExternalId)) {
      bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:entry entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} componentName=${JSON.stringify(component.name)} | compBindingsKeys=${Object.keys(compBindings).join(',')}`);
    }

    // OB-220: a binding may be wide-format temporal (columnMap periodKey→column, e.g. MIR Cuotas)
    // instead of a single static `column`. effCol/effRed resolve it for THIS calc period; static
    // bindings are unchanged. periodKey derives from the period start_date ("2025-01-01" → "2025-01").
    const tbPeriodKey = periodKeyFromStartDate(period?.start_date ?? null);
    const effCol = (b: ConvergenceBindingEntry | undefined): string | undefined =>
      isTemporalBinding(b) ? (tbPeriodKey ? (resolveTemporalColumn(b.columnMap, tbPeriodKey) ?? undefined) : undefined) : b?.column || undefined;
    const effRed = (b: ConvergenceBindingEntry | undefined): string | undefined =>
      isTemporalBinding(b) ? ((b as { reduction?: string }).reduction ?? 'snapshot') : b?.reduction;

    // HF-216: If entity_identifier carries a via-clause, translate entityExternalId
    // through the roster-join index to produce the lookup key against the measure
    // batch. Existing dataByBatch cache is keyed by row_data[entity_identifier.column],
    // which for via-bindings is the measure-side join target — exactly what
    // lookupKey holds after translation. No change to dataByBatch indexing.
    const eidBinding = compBindings.entity_identifier as ConvergenceBindingEntry | undefined;
    let lookupKey = entityExternalId;
    if (eidBinding?.via?.roster_data_type && eidBinding.via.roster_field && eidBinding.via.entity_field) {
      const viaKey = `${eidBinding.via.roster_data_type}|${eidBinding.via.entity_field}|${eidBinding.via.roster_field}`;
      const map = rosterJoinIndex.get(viaKey);
      const translated = map?.get(String(entityExternalId).trim());
      if (translated) {
        lookupKey = translated;
        if (shouldEmitTrace(entityExternalId)) {
          bufferTrace(`[CalcTrace] HF-216 via-join translated entity=${entityExternalId} | viaKey=${viaKey} | translatedLookupKey=${translated}`);
        }
      } else {
        // Via declared but no roster mapping — surface as exception, return null.
        addLog(`[CalcRecon-T3] EXCEPTION entity=${entityExternalId} type=via_join_unresolved viaKey=${viaKey}`);
        currentEntityFlags.push('viaJoinUnresolved');
        return null;
      }
    }

    // HF-242: prime_dag components carry per-field bindings keyed by the
    // DAG reference field name (set by extractInputRequirements'
    // prime_dag branch). The DAG evaluator reads every field from
    // context.metrics uniformly — no role-slot semantics — so resolution
    // walks the DAG's reference set and reads each field's binding by
    // name. This branch runs BEFORE the legacy role-binding extraction
    // because prime_dag components have NO `actual` / `row` / `numerator`
    // role keys — the early return guard for legacy bindings would
    // short-circuit before reaching this branch otherwise.
    const compType = (component as unknown as { componentType?: string }).componentType;
    const intent = component.calculationIntent as Record<string, unknown> | undefined;
    const intentIsPrimeNode = !!intent && typeof intent.prime === 'string';
    if (compType === 'prime_dag' || intentIsPrimeNode) {
      const refs = extractReferencesFromDAG(intent);
      const dagMetrics: Record<string, number> = {};
      for (const field of refs) {
        const fieldBinding = compBindings[field] as ConvergenceBindingEntry | undefined;
        // HF-273 Defect B: a structural "no column binding for this DAG reference" gap is now
        // caught LOUD upstream — the consumer's pre-resolution check (see componentResolutionFailure
        // assembly) fails the whole component before this resolver is even called, so this `continue`
        // no longer silently converts a missing required field into a band-collapsing ZERO. The
        // `continue` remains as defense-in-depth; the `rawValue === null` case below stays a silent
        // per-entity skip on purpose (per-entity data absence, NOT a binding gap — DD-7).
        const fbCol = effCol(fieldBinding); // OB-220: temporal-aware column resolution
        if (!fbCol) continue;
        const rawValue = resolveColumnFromBatch(fbCol, lookupKey, fieldBinding?.filters, effRed(fieldBinding));
        if (rawValue === null) continue;
        const scaled = fieldBinding?.scale_factor ? rawValue * fieldBinding.scale_factor : rawValue;
        dagMetrics[field] = scaled;
        if (shouldEmitTrace(entityExternalId)) {
          bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:prime_dag_field entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | field=${field} | column=${fbCol} | raw=${rawValue} | scale=${fieldBinding?.scale_factor ?? 'undefined'} | scaled=${scaled}`);
        }
      }
      const dagResult = Object.keys(dagMetrics).length > 0 ? dagMetrics : null;
      if (shouldEmitTrace(entityExternalId)) {
        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | path=prime_dag | refs=${refs.length} | resolved=${Object.keys(dagMetrics).length} | metrics=${JSON.stringify(dagMetrics)} | returnedNull=${dagResult === null}`);
      }
      return dagResult;
    }

    // HF-111: Support multiple binding roles — actual, row, column, numerator, denominator
    const actualBinding = (compBindings.actual || compBindings.row) as ConvergenceBindingEntry | undefined;
    const targetBinding = (compBindings.target || compBindings.column) as ConvergenceBindingEntry | undefined;
    const numBinding = compBindings.numerator as ConvergenceBindingEntry | undefined;
    const denBinding = compBindings.denominator as ConvergenceBindingEntry | undefined;

    // Need at least one measure binding (HF-222 Phase 3: gate on column rather than
    // the retired batch-id field).
    if (!effCol(actualBinding) && !effCol(numBinding)) return null; // OB-220: temporal-aware gate

    const expectedMetrics = getExpectedMetricNames(component);
    if (expectedMetrics.length === 0) return null;

    const metrics: Record<string, number> = {};

    // HF-227 — Decision 111 single-structure completion. Pre-HF-227 the engine
    // looked up filters from metric_derivations via the findMetricFilters
    // bridge (HF-226 Phase 3B), which depended on metric-name matching across
    // two independently produced structures. Post-HF-227 each binding entry
    // carries its own filters: resolveColumnMappingsViaAI produces them and
    // generateAllComponentBindings writes them to the binding. The engine
    // reads binding.filters natively. Empty / absent arrays preserve byte-
    // identical pre-HF-227 behavior via rowMatchesFilters returning true on
    // empty filter arrays.

    // HF-111: Ratio input — resolve both numerator and denominator
    // HF-222 Phase 3: gate on column; resolveColumnFromBatch is column-name-keyed.
    if (effCol(numBinding) && effCol(denBinding)) {
      // HF-224 / HF-226: extract ratio leaf names BEFORE the column reads so
      // the metric-name resolution flows through to the metrics map below.
      const ratioLeafForNames = extractLeafSources(component.calculationIntent).find(l => l.source === 'ratio');
      const ratioSpec = ratioLeafForNames?.sourceSpec;
      const numMetricName = typeof ratioSpec?.numerator === 'string'
        ? ratioSpec.numerator.replace(/^metric:/, '')
        : null;
      const denMetricName = typeof ratioSpec?.denominator === 'string'
        ? ratioSpec.denominator.replace(/^metric:/, '')
        : null;

      // HF-227: filters read from the binding entry, not from metric_derivations.
      const rawNumValue = resolveColumnFromBatch(effCol(numBinding)!, lookupKey, numBinding!.filters, effRed(numBinding));
      const rawDenValue = resolveColumnFromBatch(effCol(denBinding)!, lookupKey, denBinding!.filters, effRed(denBinding));

      let numValue = rawNumValue;
      let denValue = rawDenValue;
      if (numBinding?.scale_factor) numValue = numValue !== null ? numValue * numBinding.scale_factor : null;
      if (denBinding?.scale_factor) denValue = denValue !== null ? denValue * denBinding.scale_factor : null;

      if (shouldEmitTrace(entityExternalId)) {
        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | slot=ratio | rawNum=${rawNumValue} | numScale=${numBinding?.scale_factor ?? 'undefined'} | postNum=${numValue} | rawDen=${rawDenValue} | denScale=${denBinding?.scale_factor ?? 'undefined'} | postDen=${denValue}`);
      }

      if (numMetricName && numValue !== null) {
        metrics[numMetricName] = numValue;
      }
      if (denMetricName && denValue !== null) {
        metrics[denMetricName] = denValue;
      }
      const result = Object.keys(metrics).length > 0 ? metrics : null;
      if (shouldEmitTrace(entityExternalId)) {
        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | path=ratio | metrics=${JSON.stringify(metrics)} | returnedNull=${result === null}`);
      }
      return result;
    }

    // Single or dual input (actual + target, or row + column)
    // HF-222 Phase 3: gate on column.
    if (effCol(actualBinding)) {
      // HF-227: filters live on the binding entry (Decision 111 single-
      // structure completion; replaces HF-226's findMetricFilters bridge).
      const rawActualValue = resolveColumnFromBatch(effCol(actualBinding)!, lookupKey, actualBinding!.filters, effRed(actualBinding));
      if (rawActualValue === null) {
        if (shouldEmitTrace(entityExternalId)) {
          bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | path=single_actual_null | returnedNull=true`);
        }
        return null;
      }

      // HF-111: Apply scale factor (e.g., 0.85 ratio → 85 percentage)
      let actualValue = rawActualValue;
      if (actualBinding?.scale_factor) actualValue *= actualBinding.scale_factor;

      if (shouldEmitTrace(entityExternalId)) {
        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | slot=actual | rawActual=${rawActualValue} | actualScale=${actualBinding?.scale_factor ?? 'undefined'} | postActual=${actualValue} | metricKey=${expectedMetrics[0]}`);
      }

      metrics[expectedMetrics[0]] = actualValue;

      // Resolve target/column value if binding exists
      // HF-222 Phase 3: gate on column.
      if (effCol(targetBinding)) {
        // HF-227: filters read from the binding entry directly.
        const rawTargetValue = resolveColumnFromBatch(effCol(targetBinding)!, lookupKey, targetBinding!.filters, effRed(targetBinding));
        let targetValue = rawTargetValue;
        if (targetBinding?.scale_factor && targetValue !== null) targetValue *= targetBinding.scale_factor;

        if (shouldEmitTrace(entityExternalId)) {
          bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | slot=target | rawTarget=${rawTargetValue} | targetScale=${targetBinding?.scale_factor ?? 'undefined'} | postTarget=${targetValue}`);
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
  //
  // HF-222 Phase 3 (schema-class root closure): the prior signature took a batch_id
  // intermediary derived from the binding's recorded learning-provenance batch;
  // the function now resolves by column name across all operative-period batches
  // in dataByBatch. The first batch that contains the entity provides the rows.
  // This is the canonical post-class-closure path — the prior dual-path code
  // (batch-keyed primary, all-batches fallback) collapses to single-path.
  function resolveColumnFromBatch(
    column: string,
    entityExternalId: string,
    filters?: MetricDerivationRule['filters'],
    reduction: string = 'sum',  // OB-216 §2 (Phase 3'): binding-recognised reduction; default flow-sum
  ): number | null {
    // HF-302 (RC-2, DIAG-072): select the batch whose rows actually CARRY `column` (non-null) for this
    // entity — not merely the first batch with ANY rows. After RC-3 an entity can have rows in multiple
    // batches (roster + transactions); first-with-rows could pick a batch that lacks the bound column →
    // null → silent $0 (the DIAG-072 failure). Column-presence selection resolves the bound column from
    // the file it actually lives in. No source_batch_id needed (the persisted binding carries none).
    // Single-batch (single-file) tenants are unaffected: the one batch is selected exactly as before.
    let entityRows: Array<Record<string, unknown>> | undefined;
    let firstNonEmptyRows: Array<Record<string, unknown>> | undefined; // OB-222: fallback for count over field "*"
    let anyRowsForEntity = false;
    for (const [, map] of Array.from(dataByBatch.entries())) {
      const rows = map.get(entityExternalId);
      if (!rows || rows.length === 0) continue;
      anyRowsForEntity = true;
      if (!firstNonEmptyRows) firstNonEmptyRows = rows;
      if (rows.some(rd => rd[column] !== null && rd[column] !== undefined)) {
        entityRows = rows;   // this batch carries the column for the entity
        break;
      }
    }
    // OB-222: a 'count' reduction over field "*" counts qualifying ROWS, not a column's values, so
    // column-presence batch selection does not apply — use the entity's first non-empty batch.
    if (!entityRows && reduction === 'count' && (!column || column === '*')) {
      entityRows = firstNonEmptyRows;
    }
    if (!entityRows) {
      // HF-329 (SUBTRACTION of the hard-stop): a convergence-bound column that lives in NO entity-keyed
      // batch is not necessarily unresolvable. When the entity HAS rows (anyRowsForEntity) but none carry
      // the column, the column lives in a dimensional REFERENCE sheet reachable by a classified join — the
      // entity's own rows carry the dimensional key (a reference_key value) the reference sheet is keyed
      // by. Follow it via value-overlap (Korean Test, HALT-1). The matched reference row(s) become the
      // entity's rows for the existing reduction below — period scoping is already applied at fetch time.
      if (anyRowsForEntity && firstNonEmptyRows) {
        const joined = resolveReferenceJoinRows(column, firstNonEmptyRows, referenceRows);
        if (joined && joined.length > 0) {
          entityRows = joined;
          if (shouldEmitTrace(entityExternalId)) {
            bufferTrace(`[CalcTrace] HF-329 reference-join entity=${entityExternalId} | column=${column} | refRowsMatched=${joined.length} | path=entity→value-overlap-key→reference-row`);
          }
        }
      }
    }
    if (!entityRows) {
      // Graceful fallback (C6): no entity-keyed batch carries the column AND no classified reference-join
      // path resolves → the same structured null as before. Distinguish "entity has rows but none carry
      // this column" (mis-binding / cross-file gap with no join) from "entity has no rows at all".
      if (shouldEmitTrace(entityExternalId)) {
        bufferTrace(`[CalcTrace] resolveColumnFromBatch:exit entity=${entityExternalId} | column=${column} | reason=${anyRowsForEntity ? 'column_in_no_batch' : 'no_rows'} | returned=null`);
      }
      return null;
    }

    // HF-226 Phase 3A — unified filter contract. Pre-HF-226 this function had
    // no filter parameter and summed every row, while the parallel engine path
    // (applyMetricDerivations in run-calculation.ts) respected filters via
    // rowMatchesFilters. The two paths differed on the filter contract, which
    // is the engine-side manifestation of the filter-loss class (DIAG-047).
    // rowMatchesFilters returns true for empty/missing filter arrays, so this
    // is a pure capability addition: callers that don't pass filters get
    // byte-identical behavior to today (Meridian / BCL preserved).
    const hasActiveFilters = Array.isArray(filters) && filters.length > 0;
    const nums: number[] = [];
    let filteredOut = 0;
    const perRowValues: unknown[] = [];
    for (const rd of entityRows) {
      if (hasActiveFilters && !rowMatchesFilters(rd, filters!)) {
        filteredOut += 1;
        continue;
      }
      const val = rd[column];
      perRowValues.push(val);
      if (val === null || val === undefined) continue;
      if (typeof val === 'number') {
        nums.push(val);
      } else if (typeof val === 'string') {
        const parsed = parseFloat(val.replace(/[,$\s]/g, ''));
        if (!isNaN(parsed)) nums.push(parsed);
      }
    }

    // OB-222: 'count' reduction returns the number of rows that passed the filter (the column value is
    // irrelevant; field "*" signals a pure row count). Zero qualifying rows is a meaningful 0, not
    // data-absence — so count is NOT gated on numeric parseability and never returns null here (the
    // entity is known to have rows; the count is well-defined). Deterministic mirror of the
    // aggregate(count) prime, exposed on the binding path for "count of qualifying transactions" metrics.
    if (reduction === 'count') {
      const matched = entityRows.length - filteredOut;
      if (shouldEmitTrace(entityExternalId)) {
        bufferTrace(`[CalcTrace] resolveColumnFromBatch:exit entity=${entityExternalId} | column=${column} | reduction=count | rowCount=${entityRows.length} | filteredOut=${filteredOut} | matched=${matched} | returned=${matched}`);
      }
      return matched;
    }

    // OB-216 §2 (Phase 3'): apply the BINDING-RECOGNISED reduction over the entity's rows. Default
    // 'sum' is byte-identical to pre-OB-216 (a flow / per-transaction amount). 'snapshot'/'last'/
    // 'first' take a single value — a stock/balance repeated across the entity's rows, where summing
    // would N× inflate it (the DIAG-073 / Plan-3 Saldo_Pendiente defect). max/min/average/
    // distinct_count are plan-intent-driven. Deterministic application of the LLM-recognised policy.
    const found = nums.length > 0;
    let result = 0;
    if (found) {
      switch (reduction) {
        case 'snapshot': {
          // OB-216 §2.0 data-shape guard: 'snapshot' means a STOCK value that is INVARIANT across the
          // entity's rows (a balance/quota repeated per row). Honour it ONLY when the values are
          // actually all-equal; if they VARY (a flow the recogniser mislabelled from semantics — e.g.
          // a monthly revenue goal that differs per month), fall back to SUM. This keeps the recognised
          // reduction from regressing flow / multi-row tenants (BCL) while fixing the MIR stock defect.
          result = nums.every(n => n === nums[0]) ? nums[0] : nums.reduce((a, b) => a + b, 0);
          break;
        }
        case 'last': result = nums[nums.length - 1]; break;
        case 'first': result = nums[0]; break;
        case 'max': result = Math.max(...nums); break;
        case 'min': result = Math.min(...nums); break;
        case 'average': result = nums.reduce((a, b) => a + b, 0) / nums.length; break;
        case 'distinct_count': result = new Set(nums).size; break;
        case 'sum':
        default: result = nums.reduce((a, b) => a + b, 0); break;
      }
    }

    if (shouldEmitTrace(entityExternalId)) {
      bufferTrace(`[CalcTrace] resolveColumnFromBatch:exit entity=${entityExternalId} | column=${column} | reduction=${reduction} | rowCount=${entityRows.length} | filteredOut=${filteredOut} | perRowValues=${JSON.stringify(perRowValues)} | result=${result} | found=${found} | returned=${found ? result : 'null'}`);
    }

    return found ? result : null;
  }

  // ── OB-217: per-row counterpart to resolveColumnFromBatch ──
  // Mirrors the batch-selection (column-presence) + filter logic EXACTLY, but returns the
  // individual rows (with committed_data id + sibling metadata) instead of the aggregate.
  // Only flow-sum metrics are additively decomposable, so callers use this for reduction='sum';
  // the SR-38 self-validation gate (Σ contributions === engine raw outcome) catches any
  // divergence from resolveColumnFromBatch by construction.
  function collectAttribRowsForColumn(
    column: string,
    entityExternalId: string,
    filters?: MetricDerivationRule['filters'],
  ): Array<{ committedDataId: string; rawValue: number; row_data: Record<string, unknown>; metadata: Record<string, unknown> }> | null {
    let entityRows: Array<{ id: string; row_data: Record<string, unknown>; metadata: Record<string, unknown> }> | undefined;
    for (const [, map] of Array.from(attribRowsByBatch.entries())) {
      const rows = map.get(entityExternalId);
      if (!rows || rows.length === 0) continue;
      if (rows.some(r => r.row_data[column] !== null && r.row_data[column] !== undefined)) {
        entityRows = rows;
        break;
      }
    }
    if (!entityRows) return null;

    const hasActiveFilters = Array.isArray(filters) && filters.length > 0;
    const out: Array<{ committedDataId: string; rawValue: number; row_data: Record<string, unknown>; metadata: Record<string, unknown> }> = [];
    for (const r of entityRows) {
      if (hasActiveFilters && !rowMatchesFilters(r.row_data, filters!)) continue;
      const val = r.row_data[column];
      let num: number | null = null;
      if (typeof val === 'number') num = val;
      else if (typeof val === 'string') {
        const parsed = parseFloat(val.replace(/[,$\s]/g, ''));
        if (!isNaN(parsed)) num = parsed;
      }
      if (num === null) continue; // matches resolveColumnFromBatch: only parseable values contribute
      out.push({ committedDataId: r.id, rawValue: num, row_data: r.row_data, metadata: r.metadata });
    }
    return out;
  }

  // OB-217: per-entity per-row trace precursors, accumulated during the entity loop and
  // finalized (result_id attached) + written after the calculation_results insert below.
  const perRowTraceAccumulator: Array<{ entityId: string; componentName: string; traces: AttributionTracePrecursor[] }> = [];
  // OB-217: SR-38 hard-gate failures (a pure-additive component whose per-row sum did not
  // reconcile to the engine raw outcome). Non-empty → HALT before writing traces.
  const sr38Failures: Array<{ entityId: string; component: string; rawOutcome: number; perRowSum: number; delta: number }> = [];

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

  // HF-238 Phase 3: build allEntityRows once per period for the scope+aggregate
  // prime composition. The structural scope prime narrows allEntityRows to
  // peer entities sharing the boundary attribute value; previously this was
  // pre-computed per-entity via aggregateScopeRows (deleted below).
  const allEntityRowsForPeriod: Array<{ entityMetadata: Record<string, unknown>; row: Record<string, unknown> }> = [];
  for (const [eid, sheetMap] of Array.from(dataByEntity.entries())) {
    const meta = (entityMap.get(eid)?.metadata || {}) as Record<string, unknown>;
    const metaWithId: Record<string, unknown> = { ...meta, entityId: eid };
    for (const [, rows] of Array.from(sheetMap.entries())) {
      for (const r of rows) {
        const rd = (r.row_data && typeof r.row_data === 'object' && !Array.isArray(r.row_data))
          ? r.row_data as Record<string, unknown>
          : {};
        allEntityRowsForPeriod.push({ entityMetadata: metaWithId, row: rd });
      }
    }
  }

  for (const entityId of calculationEntityIds) {
    const entityInfo = entityMap.get(entityId);
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

    const componentResults: ComponentResult[] = [];
    const perComponentMetrics: Record<string, number>[] = [];
    // HF-325: parallel to perComponentMetrics — whether each component's metrics came from the
    // convergence_bindings path (vs sheet-matching fallback). Read at intent-executor handoff.
    const perComponentUsedConvergence: boolean[] = [];
    const entityRoundingTraces: RoundingTrace[] = [];

    // HF-228 Phase 4: execute convergence-produced metric_derivations to make
    // derived metrics available to the intent executor. Convergence produces
    // derivation rules (operation + filter + source_field per
    // MetricDerivationRule) that the engine's binding-based path
    // (resolveMetricsFromConvergenceBindings) cannot express — filtered
    // counts (Cross-Sell conditional_gate), cross-category sums, ratio
    // derivations, prior-period deltas. Pre-HF-228 the production loop
    // bypassed applyMetricDerivations entirely (DIAG-048 Phase 10 evidence):
    // the convergence pipeline produced correct rules but the engine never
    // executed them, so dependent metrics (equipment_deal_count,
    // cross_sell_count, etc.) were undefined when the intent executor
    // read data.metrics. Runs once per entity (rules are entity-agnostic);
    // results merge into each component's metrics map below.
    const perEntitySheetData = dataByEntity.get(entityId);
    const derivedMetrics: Record<string, number> = perEntitySheetData && metricDerivations.length > 0
      ? applyMetricDerivations(perEntitySheetData, metricDerivations)
      : {};

    for (let compIdx = 0; compIdx < selectedComponents.length; compIdx++) {
      const component = selectedComponents[compIdx];

      // HF-108: Convergence binding resolution (Decision 111) — sole metrics authority
      // post-HF-220. Convergence bindings tell us exactly which batch + column has each
      // input; absence or empty-resolver-output emits engine:exception observability +
      // metrics = {} (Decision 153 atomic cutover completion).
      // HF-273 Defect A: convergence_bindings is keyed `component_N` against the FLATTENED
      // all-variants component list (extractComponents order — see convergence-service.ts
      // generateAllComponentBindings, `component_${comp.index}`). `selectedComponents` is the
      // per-entity VARIANT-SELECTED array; its ordinal equals the flattened ordinal ONLY for
      // variant 0. For a non-0 variant, `selectedComponents[compIdx]` sits at flattened
      // position offset(variant)+compIdx, so reading `component_${compIdx}` consults the WRONG
      // variant's binding (the BCL Ejecutivo C1 collapse: compIdx 0 read Senior `component_0`
      // instead of Ejecutivo `component_4`). Recover the flattened ordinal by OBJECT IDENTITY:
      // `component` IS an element of `variants.flatMap(v => v.components)`, so its indexOf there
      // is exactly the producer's binding key. Korean Test: structural identity (object), no
      // name/role/variant string. DD-7: for variant 0 and single-variant plans (variants.length
      // <= 1 OR selectedVariantIndex === 0) the flattened ordinal equals compIdx, so the key is
      // byte-identical to today — the remap only runs for selectedVariantIndex > 0.
      let compBindingKey: string | null = `component_${compIdx}`;
      if (variants.length > 1 && selectedVariantIndex > 0) {
        const flattenedComponents = variants.flatMap(
          v => ((v.components as PlanComponent[] | undefined) ?? []),
        );
        const flattenedIdx = flattenedComponents.indexOf(component);
        // flattenedIdx < 0 is a structural impossibility (component IS from variants). If it
        // ever occurs, key = null → loud per-component failure below (never component_0).
        compBindingKey = flattenedIdx >= 0 ? `component_${flattenedIdx}` : null;
      }
      const compBindings = compBindingKey
        ? (convergenceBindings?.[compBindingKey] as Record<string, unknown> | undefined)
        : undefined;
      // HF-272: relocated hallucination-catch — read the per-component resolution-failure
      // marker (a required reference token that mapped to NO real column at convergence).
      // This is a DATA read from the persisted binding; it flows here regardless of the
      // convergence swallow-catch (Phase 3.4), which only guards genuine infra throws.
      // HF-273 Defect B: an unresolvable prime_dag DAG reference must be LOUD, not a silent
      // skip (the silent skip → ZERO → band collapse is the exact HF-272 class recurring at
      // the binding-resolution path). Detect it structurally (parallel to the HF-272 binding
      // marker, same per-component shape) and route it through the SAME resolutionFailure
      // surface — no new channel (Decision 158 / HALT-2). Scoped to a field with NO column
      // binding (a per-component structural gap, identical across entities); the per-entity
      // `rawValue === null` data-absence case inside resolveMetricsFromConvergenceBindings is
      // deliberately NOT promoted (DD-7 — it must not mass-fail sparse-data entities). A null
      // compBindingKey (flattenedIdx < 0 above) is also a loud failure here, never silent.
      let componentResolutionFailure = findComponentResolutionFailure(compBindings);
      if (!componentResolutionFailure && compBindingKey === null) {
        // candidatesConsidered: 0 — no flattened binding slot exists for this selected component.
        componentResolutionFailure = { token: component.name ?? `component_${compIdx}`, reason: 'no_real_column_match', candidatesConsidered: 0 };
      }
      if (!componentResolutionFailure && compBindings) {
        const cIntent = component.calculationIntent as Record<string, unknown> | undefined;
        const isPrime = (component as unknown as { componentType?: string }).componentType === 'prime_dag'
          || (!!cIntent && typeof cIntent.prime === 'string');
        if (isPrime) {
          const refs = extractReferencesFromDAG(cIntent);
          const unresolved = refs.find(f => {
            const fb = (compBindings as Record<string, ConvergenceBindingEntry | undefined>)[f];
            // OB-225 (P2 fix): a wide-format TEMPORAL binding carries an empty `column` plus a
            // populated `columnMap` (periodKey→column); effCol resolves the period's column at calc
            // time. Such a binding is RESOLVED, not a structural gap — flagging it here as
            // no_real_column_match was the MIR Plan-2 silent-$0 defect. Only a binding with NEITHER a
            // static column NOR a temporal columnMap is a genuine gap.
            return !fb?.column && !isTemporalBinding(fb);
          });
          if (unresolved !== undefined) {
            // candidatesConsidered: 0 — the DAG reference has no column binding at all (structural gap).
            componentResolutionFailure = { token: unresolved, reason: 'no_real_column_match', candidatesConsidered: 0 };
          }
        }
      }
      let metrics: Record<string, number>;
      let usedConvergenceBindings = false;
      // HF-218 Component 2 — Engine binding verification at calc time.
      // Closes DIAG-042 §3.2 silent fall-through. Per Disposition 4: relative-confidence
      // comparison (C_proposed > C_existing) using the same structural product methodology
      // as Component 1 (cardinality × intersection). Per Disposition 3: corrections preserve
      // pre-state via classification_signals + calculation_results.metadata snapshot.
      // Verification scope: entity_identifier binding only (the load-bearing identity hop).
      let bindingVerified = true;
      let bindingExceptionReason: string | null = null;
      // HF-219 Component R1: proposed correction holder. When verification finds an
      // alternative column with strictly higher score, this is populated and the
      // correction branch fires (atomic rule_sets update + engine_correction signal).
      let proposedCorrection: { column: string; confidence: number } | null = null;
      let verificationExistingScore = 0;
      const eidBindingRaw = compBindings?.entity_identifier as ConvergenceBindingEntry | undefined;
      const eidColumn = eidBindingRaw?.column;
      const eidStoredConf = typeof eidBindingRaw?.confidence === 'number' ? eidBindingRaw.confidence : 0;
      if (compBindings && eidColumn) {
        // HF-222 Phase 3.5c (class-root closure): verification reads by column name
        // across all operative-period batches in dataByBatch. The set of distinct
        // entity-identifier values for this period is the union of dataByBatch keys
        // across all batches (every dataByBatch inner map is keyed by row_data[eidColumn]
        // — see dataByBatch Step 2 construction). The prior batch-id-keyed lookup is
        // replaced; no batch_id read-filter to mismatch.
        const distinctValues = new Set<string>();
        let totalRows = 0;
        for (const [, entityMap] of Array.from(dataByBatch.entries())) {
          for (const key of Array.from(entityMap.keys())) {
            if (key && key.length > 0) {
              distinctValues.add(key);
              totalRows += (entityMap.get(key)?.length ?? 0);
            }
          }
        }
        let intersectionCount = 0;
        if (tenantEntityExternalIdsForEngine.size > 0) {
          for (const v of Array.from(distinctValues)) {
            if (tenantEntityExternalIdsForEngine.has(v)) intersectionCount++;
          }
        }
        const cardinalityRatio = totalRows > 0 ? distinctValues.size / totalRows : 0;
        const intersectionRatio = distinctValues.size > 0 && tenantEntityExternalIdsForEngine.size > 0
          ? intersectionCount / distinctValues.size : 0;
        const proposedConf = cardinalityRatio * intersectionRatio;

        // Verification gate: C_proposed > 0 (binding has operative tenant-entity overlap).
        // When tenantEntityExternalIdsForEngine is empty, intersection_ratio is 0 by construction;
        // fall back to cardinality-only check (cardinalityRatio > 0 acceptable, score = cardinalityRatio).
        const operativeConf = proposedConf > 0 ? proposedConf : (tenantEntityExternalIdsForEngine.size === 0 ? cardinalityRatio : 0);
        verificationExistingScore = operativeConf;
        if (operativeConf === 0) {
          bindingVerified = false;
          bindingExceptionReason = tenantEntityExternalIdsForEngine.size === 0
            ? `cardinality_ratio=0 (column ${eidColumn} has zero distinct non-null values in batch)`
            : `intersection_ratio=0 (column ${eidColumn} distinct values do not intersect with tenant entities; distinct=${distinctValues.size} tenantSize=${tenantEntityExternalIdsForEngine.size})`;
        }
        // HF-219 Component R1: Correction proposal scan.
        // Per Disposition 3 (restored from HF-218 scope contraction): engine MAY correct
        // bindings when C_proposed > C_existing strictly (Disposition 4 inequality).
        // Scan committed_data rows for the learning-provenance batch (provenance-scoped
        // read: "the batch where the column was learned"), extract distinct values per
        // column, compute structural product score (cardinality × intersection); propose
        // the highest scorer that strictly beats verificationExistingScore AND differs
        // from eidColumn. Scan is bounded (5000-row ceiling) for scale.
        //
        // HF-222 Phase 3.5a: inner provenance guard restores pre-Phase-3 outer-condition
        // semantics. The original outer condition at the verification-block head gated
        // this block on the (now-retired) batch-id field; Phase 3.5c drops that gate
        // (verification reads by column name); this inner guard restores "skip
        // correction-scan when no provenance" semantics exactly.
        if (eidBindingRaw?.learning_provenance?.batch_id && tenantEntityExternalIdsForEngine.size > 0) {
          try {
            const SAMPLE_CEILING = 5000;
            const { data: scanRows } = await supabase
              .from('committed_data')
              .select('row_data')
              .eq('import_batch_id', eidBindingRaw.learning_provenance.batch_id)
              .limit(SAMPLE_CEILING);
            if (scanRows && scanRows.length > 0) {
              // Per-column distinct value sets
              const columnDistincts = new Map<string, Set<string>>();
              const columnTotalRows = new Map<string, number>();
              for (const row of scanRows) {
                const rd = row.row_data as Record<string, unknown> | null;
                if (!rd) continue;
                for (const [colName, v] of Object.entries(rd)) {
                  if (colName === eidColumn) continue; // skip stored binding column (already verified)
                  if (colName.startsWith('_')) continue; // skip metadata fields (_rowIndex, _sheetName)
                  if (v == null) continue;
                  const sv = String(v).trim();
                  if (sv.length === 0) continue;
                  if (!columnDistincts.has(colName)) {
                    columnDistincts.set(colName, new Set<string>());
                    columnTotalRows.set(colName, 0);
                  }
                  columnDistincts.get(colName)!.add(sv);
                  columnTotalRows.set(colName, (columnTotalRows.get(colName) ?? 0) + 1);
                }
              }
              // Score each candidate; track the highest that strictly beats verificationExistingScore
              let bestCandidate: { column: string; score: number } | null = null;
              for (const [candCol, candDistinct] of Array.from(columnDistincts.entries())) {
                const candTotal = columnTotalRows.get(candCol) ?? 0;
                if (candDistinct.size === 0 || candTotal === 0) continue;
                let candIntersection = 0;
                for (const v of Array.from(candDistinct)) {
                  if (tenantEntityExternalIdsForEngine.has(v)) candIntersection++;
                }
                if (candIntersection === 0) continue;
                const candCardinalityRatio = candDistinct.size / candTotal;
                const candIntersectionRatio = candIntersection / candDistinct.size;
                const candScore = candCardinalityRatio * candIntersectionRatio;
                if (candScore > verificationExistingScore && (!bestCandidate || candScore > bestCandidate.score)) {
                  bestCandidate = { column: candCol, score: candScore };
                }
              }
              if (bestCandidate && bestCandidate.column !== eidColumn) {
                proposedCorrection = { column: bestCandidate.column, confidence: bestCandidate.score };
              }
            }
          } catch (scanErr) {
            console.warn(`[CalcAPI] HF-219 correction scan failed (non-blocking): ${scanErr instanceof Error ? scanErr.message : String(scanErr)}`);
          }
        }
      }

      if (componentResolutionFailure) {
        // HF-272: a required reference token mapped to NO real column at convergence — the
        // relocated hallucination-catch fires here as a LOUD per-component failure (Option 1,
        // no run abort). Empty metrics → no computed payout; the componentResult below is
        // marked `failed` with the named token, and the [CalcRecon-T1] footer surfaces it
        // distinctly — never a silent $0. The run CONTINUES; every other component computes
        // normally. DD-7: a component whose tokens resolve to real columns never enters here.
        if (!resolutionFailures.has(compIdx)) {
          resolutionFailures.set(compIdx, {
            name: component.name,
            token: componentResolutionFailure.token,
            reason: componentResolutionFailure.reason,
          });
          addLog(`[CalcRecon-T3] RESOLUTION_FAILURE component=${compIdx} name="${component.name}" token="${componentResolutionFailure.token}" reason=${componentResolutionFailure.reason} — loud per-component failure (not silent $0)`);
        }
        metrics = {};
      } else if (compBindings && !bindingVerified) {
        // HF-218 Component 2: structural exception — binding cannot be verified; refuse to calculate.
        // Emit signal + addLog + skip metric resolution for this entity-component.
        addLog(`[CalcRecon-T3] EXCEPTION entity=${entityInfo?.external_id ?? entityId} component=${compIdx} type=structural_exception reason="${bindingExceptionReason}"`);
        currentEntityFlags.push('structuralException');
        structuralExceptionsInThisRun.push({
          entity_id: entityId,
          entity_external_id: entityInfo?.external_id ?? null,
          component_index: compIdx,
          component_name: component.name,
          reason: bindingExceptionReason ?? 'unknown',
          binding_column: eidColumn ?? '<unset>',
          ts: new Date().toISOString(),
        });
        // HF-219 Component R2: trace failing binding to source fingerprint (ADR Decision 2);
        // invoke decrementFingerprintConfidence when trace yields a cached fingerprint.
        // Bidirectional flywheel loop: increment on success (writeFingerprint, pre-HF-218);
        // decrement on verification failure traced to fingerprint cache (HF-219 wiring).
        let fingerprintDecrementInfo: { hash: string; pre: number; post: number } | null = null;
        // HF-222 Phase 3.5a: provenance-scoped guard (learning-provenance batch lookup).
        if (eidBindingRaw?.learning_provenance?.batch_id) {
          try {
            // Type-assertion through unknown: Supabase type-defs predate HF-196 Phase 1F
            // `content_unit_hash_sha256` column on import_batches; runtime column exists per
            // supabase/migrations/20260503032541_hf196_phase1f_*.sql. Same for structural_fingerprints
            // table (present at runtime; absent from generated types pre-HF-218).
            const batchRes = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: { content_unit_hash_sha256?: string | null } | null }> } } } })
              .from('import_batches')
              .select('content_unit_hash_sha256')
              .eq('id', eidBindingRaw.learning_provenance.batch_id)
              .single();
            const contentHash = batchRes.data?.content_unit_hash_sha256 ?? null;
            if (contentHash) {
              const fpRes = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (c: string, v: string) => { eq: (c2: string, v2: string) => { maybeSingle: () => Promise<{ data: { fingerprint_hash?: string | null; confidence?: number | null } | null }> } } } } })
                .from('structural_fingerprints')
                .select('fingerprint_hash, confidence')
                .eq('tenant_id', tenantId)
                .eq('fingerprint_hash', contentHash)
                .maybeSingle();
              if (fpRes.data?.fingerprint_hash) {
                const decResult = await decrementFingerprintConfidence(
                  tenantId,
                  fpRes.data.fingerprint_hash,
                  `engine_structural_exception:component=${compIdx},column=${eidColumn},batch=${eidBindingRaw.learning_provenance?.batch_id ?? 'unknown'},calc=${calculationRunId},reason=${bindingExceptionReason}`,
                  process.env.NEXT_PUBLIC_SUPABASE_URL!,
                  process.env.SUPABASE_SERVICE_ROLE_KEY!,
                );
                if (decResult.updated) {
                  fingerprintDecrementInfo = {
                    hash: fpRes.data.fingerprint_hash,
                    pre: decResult.preConfidence,
                    post: decResult.postConfidence,
                  };
                  addLog(`[CalcRecon-T3] HF-219 FINGERPRINT_DECREMENT hash=${fpRes.data.fingerprint_hash.substring(0, 12)} ${decResult.preConfidence.toFixed(4)} → ${decResult.postConfidence.toFixed(4)}`);
                }
              }
            }
          } catch (traceErr) {
            console.warn(`[CalcAPI] HF-219 fingerprint trace/decrement failed (non-blocking): ${traceErr instanceof Error ? traceErr.message : String(traceErr)}`);
          }
        }
        writeSignal({
          tenantId,
          signalType: 'engine:structural_exception',
          signalValue: {
            entity_external_id: entityInfo?.external_id ?? null,
            component_index: compIdx,
            component_name: component.name,
            reason: bindingExceptionReason,
            binding_column: eidColumn,
            stored_confidence: eidStoredConf,
            tenant_entity_count: tenantEntityExternalIdsForEngine.size,
            // HF-219: fingerprint decrement provenance (null if no traceable fingerprint cache hit)
            fingerprint_decrement: fingerprintDecrementInfo,
          },
          confidence: 0,
          source: 'system',
          calculationRunId,
          ruleSetId,
          context: { trigger: 'engine_verification', binding_role: 'entity_identifier' },
        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
          if (err instanceof CanonicalWriteError) {
            console.warn(`[CalcAPI] HF-218 structural_exception signal CanonicalWriteError (${err.cause}): ${err.message}`);
          } else {
            console.warn('[CalcAPI] HF-218 structural_exception signal unexpected error:', err instanceof Error ? err.message : String(err));
          }
        });
        // Skip metric resolution: produce empty metrics → component evaluates to zero
        // per existing buildMetricsForComponent semantics for empty input (which is the
        // refuse-with-zero pattern preserving downstream calculation flow).
        metrics = {};
      } else if (compBindings && proposedCorrection) {
        // HF-219 Component R1 — Engine correction branch (third branch).
        // Per Disposition 3 (restored) + ADR Decision 1 (optimistic concurrency control).
        // C_proposed > C_existing strictly + column_proposed !== column_existing.
        // Atomic compose: rule_sets update + classification_signals write succeed together.
        // HF-273 Defect A: this branch is entered only when `compBindings` is truthy, which by
        // construction means `compBindingKey` is non-null (compBindings = key ? lookup : undefined).
        // Narrow it for the keyed reads/writes below — the correction inherits the corrected key.
        const cbKey: string = compBindingKey as string;
        const preBinding = { ...(eidBindingRaw as unknown as Record<string, unknown>) };
        const correctionResolved = await (async () => {
          const MAX_RETRIES = 3;
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const { data: rsRow } = await supabase
              .from('rule_sets')
              .select('input_bindings, updated_at')
              .eq('id', ruleSetId)
              .single();
            if (!rsRow) return false;
            const currentBindings = (rsRow.input_bindings as Record<string, unknown>) ?? {};
            const cb = currentBindings.convergence_bindings as Record<string, Record<string, unknown>> | undefined;
            if (!cb || !cb[cbKey]) return false;
            const newComp = { ...cb[cbKey] };
            // HF-222 Phase 3: correction-write preserves the original learning provenance
            // (the column was corrected, but provenance still references the same batch
            // where the binding was learned).
            newComp.entity_identifier = {
              ...(newComp.entity_identifier as Record<string, unknown>),
              column: proposedCorrection!.column,
              confidence: proposedCorrection!.confidence,
              learning_provenance: eidBindingRaw?.learning_provenance,
              match_pass: 1,
            };
            const newBindings = {
              ...currentBindings,
              convergence_bindings: { ...cb, [cbKey]: newComp },
            };
            const { data: updateData, error: updateErr } = await supabase
              .from('rule_sets')
              .update({ input_bindings: newBindings as unknown as Json })
              .eq('id', ruleSetId)
              .eq('updated_at', rsRow.updated_at)
              .select('id');
            if (updateErr) {
              console.warn(`[CalcAPI] HF-219 correction update error (attempt ${attempt + 1}/${MAX_RETRIES}): ${updateErr.message}`);
              continue;
            }
            if (updateData && updateData.length === 1) {
              return true; // success
            }
            // affected_rows === 0 → updated_at mismatch (contention); retry
          }
          // Persistent contention after MAX_RETRIES
          writeSignal({
            tenantId,
            signalType: 'convergence:correction_contention',
            signalValue: {
              entity_external_id: entityInfo?.external_id ?? null,
              component_index: compIdx,
              component_name: component.name,
              proposed_column: proposedCorrection!.column,
              proposed_confidence: proposedCorrection!.confidence,
              stored_column: eidColumn,
              stored_confidence: verificationExistingScore,
              retries: MAX_RETRIES,
            },
            confidence: 0,
            source: 'system',
            calculationRunId,
            ruleSetId,
            context: { trigger: 'engine_correction_contention' },
          }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch(() => { /* non-blocking */ });
          return false;
        })();

        if (correctionResolved) {
          // Update in-memory compBindings + convergenceBindings cache to use corrected column.
          const correctedCompBindings = { ...compBindings } as Record<string, unknown>;
          correctedCompBindings.entity_identifier = {
            ...(eidBindingRaw as unknown as Record<string, unknown>),
            column: proposedCorrection.column,
            confidence: proposedCorrection.confidence,
          };
          if (convergenceBindings) {
            (convergenceBindings as Record<string, unknown>)[cbKey] = correctedCompBindings;
          }
          // Emit engine_correction signal with full pre/post state for SOC preservation.
          writeSignal({
            tenantId,
            signalType: 'convergence:engine_correction',
            signalValue: {
              entity_external_id: entityInfo?.external_id ?? null,
              component_index: compIdx,
              component_name: component.name,
              pre_state: preBinding,
              post_state: correctedCompBindings.entity_identifier,
              c_existing: verificationExistingScore,
              c_proposed: proposedCorrection.confidence,
              column_pre: eidColumn,
              column_post: proposedCorrection.column,
              tenant_entity_count: tenantEntityExternalIdsForEngine.size,
            },
            confidence: proposedCorrection.confidence,
            source: 'engine_correction',
            calculationRunId,
            ruleSetId,
            context: { trigger: 'engine_correction', binding_role: 'entity_identifier' },
          }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err: unknown) => {
            console.warn(`[CalcAPI] HF-219 engine_correction signal write failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
          });
          correctionsInThisRun.push({
            entity_id: entityId,
            entity_external_id: entityInfo?.external_id ?? null,
            component_index: compIdx,
            component_name: component.name,
            pre_column: eidColumn ?? '<unset>',
            post_column: proposedCorrection.column,
            pre_confidence: verificationExistingScore,
            post_confidence: proposedCorrection.confidence,
            methodology_version: 'HF-219 structural_product_v1',
            ts: new Date().toISOString(),
          });
          addLog(`[CalcRecon-T2] HF-219 ENGINE_CORRECTION entity=${entityInfo?.external_id ?? entityId} component=${compIdx} ${eidColumn} → ${proposedCorrection.column} (C ${verificationExistingScore.toFixed(4)} → ${proposedCorrection.confidence.toFixed(4)})`);
          currentEntityFlags.push('engineCorrection');
        }
        // Whether correction succeeded or contended, proceed with resolveMetrics using
        // current compBindings (corrected on success; unchanged on contention).
        const cbMetrics = resolveMetricsFromConvergenceBindings(
          compBindings, component, entityInfo?.external_id ?? '', compIdx
        );
        metrics = cbMetrics && Object.keys(cbMetrics).length > 0 ? cbMetrics : {};
        if (cbMetrics && Object.keys(cbMetrics).length > 0) usedConvergenceBindings = true;
      } else if (compBindings && dataByBatch.size > 0) {
        const cbMetrics = resolveMetricsFromConvergenceBindings(
          compBindings, component, entityInfo?.external_id ?? '', compIdx
        );
        if (cbMetrics && Object.keys(cbMetrics).length > 0) {
          metrics = cbMetrics;
          usedConvergenceBindings = true;
        } else {
          // Convergence binding resolution returned nothing — fall back.
          // HF-218 Component 4a: persist [CalcRecon-T3]-style EXCEPTION as classification_signal.
          // Distinct from structural_exception above (binding verified but data resolution null —
          // a data anomaly, not a binding invalidity per Component 2 bright line). Engine produces
          // zero/fallback result here AND emits engine:exception for closed-loop visibility.
          writeSignal({
            tenantId,
            signalType: 'engine:exception',
            signalValue: {
              entity_external_id: entityInfo?.external_id ?? null,
              component_index: compIdx,
              component_name: component.name,
              type: 'cbMetrics_null_falling_back_to_sheet_matching',
              binding_column: eidColumn,
            },
            confidence: 0,
            source: 'system',
            calculationRunId,
            ruleSetId,
            context: { trigger: 'engine_fallback', binding_role: 'entity_identifier' },
          }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch(() => { /* non-blocking */ });
          // HF-220 R1 / ADR Decision 2: legacy buildMetricsForComponent fallback retired
          // (Decision 153 atomic cutover completion). Component evaluates to zero per
          // existing refuse-with-empty-metrics semantics; HF-218 Component 4a signal
          // above preserves observability.
          metrics = {};
        }
      } else {
        // HF-220 R1 / ADR Decision 2: no convergence_bindings for this component.
        // Emit engine:exception signal for observability (HF-218 Component 4a pattern);
        // metrics = {} → component evaluates to zero per Decision 153 atomic cutover
        // completion. Legacy sheet-matching path retired.
        writeSignal({
          tenantId,
          signalType: 'engine:exception',
          signalValue: {
            entity_external_id: entityInfo?.external_id ?? null,
            component_index: compIdx,
            component_name: component.name,
            type: 'no_convergence_bindings_for_component',
          },
          confidence: 0,
          source: 'system',
          calculationRunId,
          ruleSetId,
          context: { trigger: 'engine_no_bindings' },
        }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch(() => { /* non-blocking */ });
        metrics = {};
      }

      // Log which path was taken (first entity only, to avoid flooding)
      if (entityResults.length === 0 && compIdx === 0) {
        addLog(`HF-108 Resolution path: ${usedConvergenceBindings ? 'convergence_bindings (Decision 111)' : 'sheet-matching (fallback)'}`);
      }

      // HF-220 R2 / ADR Decision 1: OB-118 merge-guard retired. With legacy derivation
      // path removed in R1, convergence binding resolution is the single populator of
      // metrics[key]; no merge required, no guard fires possible.
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
      // HF-220 R1 / ADR Decision 1: legacy evaluateComponent + per-component rounding
      // retired. Intent executor (below) is sole authority for component payout +
      // rounding; this loop's residual responsibility is to populate perComponentMetrics
      // (HF-205 Shape C invariant target) and seed ComponentResult slots with metadata.
      // Intent executor overwrites placeholder.payout at the index-assignment site.
      // HF-228 Phase 4: merge derived metrics into the component's metrics map.
      // Derived metrics (from convergence metric_derivations executed once
      // above per entity) carry operation+filter rules that produce metrics
      // the convergence_bindings cannot express (filtered counts, cross-
      // category sums, ratio derivations, prior-period deltas). Merge order:
      // binding-resolved values populate metrics first; derivation outputs
      // overlay so a derivation rule for a given metric name takes
      // precedence over an incomplete binding-resolved value for the same
      // name. Empty derivedMetrics ({}) is a no-op.
      for (const [key, value] of Object.entries(derivedMetrics)) {
        metrics[key] = value;
      }
      componentResults.push({
        componentId: component.id,
        componentName: component.name,
        componentType: component.componentType,
        payout: 0,
        metricValues: metrics,
        details: componentResolutionFailure
          ? { failed: true, reason: 'resolution_failure', unresolvedToken: componentResolutionFailure.token }
          : {},
        // HF-272: loud per-component failure marker (a required token mapped to no real
        // column). Carries through to persistence + footer so a failed component is never
        // a silent $0. Absent on components whose tokens resolve to real columns (DD-7).
        ...(componentResolutionFailure
          ? { status: 'failed' as const, resolutionFailure: { token: componentResolutionFailure.token, reason: componentResolutionFailure.reason } }
          : {}),
      });
      perComponentMetrics.push(metrics);
      perComponentUsedConvergence.push(usedConvergenceBindings); // HF-325
    }

    // ── INTENT ENGINE PATH (authoritative — Decision 151 sole authority) ──
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

    // HF-238 Phase 3: aggregateScopeRows pre-computation deleted. The scope+
    // aggregate prime composition computes hierarchical aggregates on the fly
    // from allEntityRowsForPeriod (built once above). Entity attributes are
    // passed via entityData.attributes so the scope prime can read the
    // boundary value from context.entity.metadata.
    const entityMeta = entityMap.get(entityId);
    const entityMetadata = (entityMeta?.metadata || {}) as Record<string, unknown>;

    // Intent executor is sole authority (Decision 151). Rounding applied here.
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
      // HF-238 Phase 3: entity attributes populated from entities.metadata so
      // the scope prime can read the boundary value (district/region/etc.)
      // from context.entity.metadata. Numeric fields are coerced for
      // arithmetic compatibility; string/boolean values pass through.
      const entityAttributesForExec: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(entityMetadata)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          entityAttributesForExec[k] = v;
        }
      }

      const entityData: EntityData = {
        entityId,
        metrics,
        attributes: entityAttributesForExec,
        priorResults: [...priorResults],
        periodHistory: periodHistoryMap.get(entityId),
        crossDataCounts: entityCrossData,
        // HF-238 Phase 3: allEntityRowsForPeriod replaces the pre-computed
        // scopeAggregates surface; the scope prime walks these rows directly.
        allEntityRows: allEntityRowsForPeriod,
        // OB-216 §2 (Phase 3'): default `activeRows` to the ENTITY'S OWN rows so an UNSCOPED
        // aggregate (e.g. Plan 3 `sum(Monto_Cobrado)`) operates over the entity's transactions
        // rather than an empty set → 0. The `scope` prime still OVERRIDES activeRows to peer rows
        // for hierarchical/override semantics. Korean Test: structural (the entity's rows), no literal.
        activeRows: entityRowsFlat.map(r => (r.row_data ?? {}) as Record<string, unknown>),
        // HF-325 (Decision 111): when convergence bindings resolved this component's metrics, the
        // aggregate prime reads the convergence-resolved scalar for a bound field instead of
        // re-deriving it from rows. False on the sheet-matching fallback → unchanged behavior.
        convergenceAuthoritative: perComponentUsedConvergence[ci.componentIndex] ?? false,
        // HF-211: Route intent-executor [CalcTrace] emissions through buffer (only for traced
        // entities) so they flush after the [CalcRecon] block at handler exit.
        traceCollector: shouldEmitTrace(entityInfo?.external_id ?? entityId) ? bufferTrace : undefined,
      };
      const intentResult = executeIntent(ci, entityData);
      intentTraces.push(intentResult.trace);

      // Apply Decision 122 rounding to intent executor results
      const comp = selectedComponents[ci.componentIndex];
      const compIntent = comp?.calculationIntent as Record<string, unknown> | undefined;
      // HF-265 (P3): round each component payout to an integer. inferOutputPrecision otherwise
      // infers >0 decimals when the intent carries a fractional constant (e.g. the fleet clamp
      // threshold 1.5), yielding penny values (Meridian C5 = 373.16) where GT expects integers.
      // Forcing decimalPlaces:0 keeps Decision-122 banker's rounding (roundComponentOutput uses
      // ROUND_HALF_EVEN) — NOT native Math.round — and is a no-op for already-integer components.
      const precision = { ...inferOutputPrecision(compIntent, undefined), decimalPlaces: 0 };
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

    const intentTotal = toNumber(intentTotalDecimal);
    const entityTotal = intentTotal;

    // ════════════════════════════════════════════════════════════════════════
    // OB-217: Per-transaction attribution (additive / qualified components).
    // Additive & non-invasive — the entity-level results above are already final. For each
    // attributable component, decompose its rounded payout onto the committed_data rows that
    // produced it, self-validating Σ(contributions) === engine raw outcome (SR-38). Traces are
    // accumulated here (result_id is not known until the post-loop insert) and written below.
    // ════════════════════════════════════════════════════════════════════════
    if (convergenceBindings) {
      for (let attrIdx = 0; attrIdx < selectedComponents.length; attrIdx++) {
        const attrComponent = selectedComponents[attrIdx];
        const attrPattern = classifyAttributionPattern(attrComponent);
        // OB-218: a clawback (Pattern D / temporal_adjustment) component is NOT an in-period additive
        // term — it reverses an original transaction's contribution via cross-period retrieval
        // (lib/calculation/clawback.ts attributeClawbackRows). Skip the additive path so it never
        // emits wrong positive traces. Live dispatch wiring lands with the MIR binding regeneration
        // (the clawback proof tenant); the engine + generality proof ship in this PR.
        if (attrPattern === 'non-attributable' || attrPattern === 'clawback') continue;

        const cr = componentResults[attrIdx];
        const rt = entityRoundingTraces[attrIdx];
        if (!cr || !rt) continue;
        const storedPayout = cr.payout;
        const rawOutcome = rt.rawValue;

        // Re-derive the flattened binding key (same rule as the metrics loop, HF-273 Defect A).
        let attrBindingKey: string | null = `component_${attrIdx}`;
        if (variants.length > 1 && selectedVariantIndex > 0) {
          const flattened = variants.flatMap(v => ((v.components as PlanComponent[] | undefined) ?? []));
          const fi = flattened.indexOf(attrComponent);
          attrBindingKey = fi >= 0 ? `component_${fi}` : null;
        }
        const attrBindings = attrBindingKey
          ? (convergenceBindings[attrBindingKey] as Record<string, unknown> | undefined)
          : undefined;
        if (!attrBindings) continue;

        // Entity lookup key, mirroring resolveMetricsFromConvergenceBindings (HF-216 via-join).
        const attrEid = attrBindings.entity_identifier as ConvergenceBindingEntry | undefined;
        let attrLookupKey = entityInfo?.external_id ?? '';
        if (attrEid?.via?.roster_data_type && attrEid.via.roster_field && attrEid.via.entity_field) {
          const viaKey = `${attrEid.via.roster_data_type}|${attrEid.via.entity_field}|${attrEid.via.roster_field}`;
          const translated = rosterJoinIndex.get(viaKey)?.get(String(attrLookupKey).trim());
          if (!translated) continue; // via declared but unresolved → no per-row attribution
          attrLookupKey = translated;
        }
        if (!attrLookupKey) continue;
        const attrEntityIdCol = attrEid?.column ?? null;

        // Try each candidate additive term; the one whose Σ matches the engine raw outcome is
        // the term that produced this entity's payout (self-validating branch selection — handles
        // qualified gates without re-evaluating the condition).
        const { terms } = analyzePrimeDag(attrComponent.calculationIntent);
        let chosen: ReturnType<typeof attributeRows> | null = null;
        for (const term of terms) {
          if (term.kind !== 'reference') continue; // only binding-resolvable references for this OB
          const fb = attrBindings[term.metricField] as ConvergenceBindingEntry | undefined;
          if (!fb?.column) continue;
          const reduction = fb.reduction ?? 'sum';
          if (reduction !== 'sum') continue; // only flow-sum is additively decomposable
          const collected = collectAttribRowsForColumn(fb.column, attrLookupKey, fb.filters);
          if (!collected || collected.length === 0) continue;
          const effectiveRate = term.rate * (fb.scale_factor ?? 1);
          const rows: PerRowMetricValue[] = collected.map(r => ({
            committedDataId: r.committedDataId,
            rawValue: r.rawValue,
            transactionRef: extractTransactionRef(
              r.row_data,
              r.metadata,
              // OB-218: pass the binding's entity_identifier column; extractTransactionRef ALSO
              // excludes the row's metadata.entity_id_field internally (they can differ).
              attrEntityIdCol,
            ),
          }));
          const outcome = attributeRows({
            rows, effectiveRate, metricColumn: fb.column, pattern: attrPattern, rawOutcome, storedPayout,
            entityMetricValue: perComponentMetrics[attrIdx]?.[term.metricField],
          });
          if (outcome.matched) { chosen = outcome; break; }
        }

        if (chosen) {
          perRowTraceAccumulator.push({ entityId, componentName: attrComponent.name, traces: chosen.traces });
          if (!chosen.reconciled) {
            addLog(`[OB-217] WARN reconcile entity=${entityId} comp=${JSON.stringify(attrComponent.name)} roundedSum=${chosen.roundedSum} storedPayout=${storedPayout}`);
          }
        } else if (attrPattern === 'additive' && Math.abs(rawOutcome) > 0) {
          // A pure additive component MUST reconcile when it produced a nonzero outcome.
          // Probe the first reference term for diagnostics, then record an SR-38 hard failure.
          let probeSum = 0; let probeDelta = Math.abs(rawOutcome);
          const probeTerm = terms.find(t => t.kind === 'reference');
          const fb = probeTerm ? (attrBindings[probeTerm.metricField] as ConvergenceBindingEntry | undefined) : undefined;
          if (probeTerm && fb?.column) {
            const collected = collectAttribRowsForColumn(fb.column, attrLookupKey, fb.filters);
            if (collected) {
              const effRate = probeTerm.rate * (fb.scale_factor ?? 1);
              probeSum = collected.reduce((s, r) => s + effRate * r.rawValue, 0);
              probeDelta = Math.abs(probeSum - rawOutcome);
            }
          }
          sr38Failures.push({ entityId, component: attrComponent.name, rawOutcome, perRowSum: probeSum, delta: probeDelta });
        }
        // qualified + no match → entity took a constant/else branch (flat or zero): no per-row trace.
      }
    }

    // ── SYNAPTIC: Write per-component confidence synapses ──
    for (let ci = 0; ci < componentIntents.length; ci++) {
      // OB-235 P9 — density-driven trace gating (RECONNECT of execution-mode action (b)). This is
      // RECONCILIATION-PRESERVING: the payout math (componentResults / entityTotal / grandTotal) is already
      // computed ABOVE; this confidence synapse is observability the consolidation reads. A pattern that has
      // learned to `silent` (density ≥ 0.95, Synaptic-Spec) skips its per-entity trace — silent skips
      // TRACING, never MATH. full_trace / light_trace still record it so the pattern keeps consolidating.
      // Mode is a pure function of recalled density; it cannot alter a value (HALT-CALC honoured).
      if (getExecutionMode(surface, patternSignatures[ci]) === 'silent') continue;
      // Dual-path payout concordance: two independently-computed Decimal payouts are "the same" within a cent.
      const compMatch = componentResults[ci] && Math.abs(componentResults[ci].payout - (priorResults[ci] ?? 0)) < 0.01; // RATIFIED: numerical-precision epsilon for payout equality, not an authority threshold (Decision 110)
      writeSynapse(surface, {
        type: 'confidence',
        componentIndex: ci,
        entityId,
        value: compMatch ? 1.0 : 0.0,
        timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      });
    }

    grandTotal += entityTotal;

    // HF-218 Component 5: Binding snapshot in metadata.binding_snapshot.
    // Per ADR Decision 4: co-located in calculation_results.metadata JSONB (no DDL).
    // Atomic-by-construction (same row INSERT). Per Disposition 3 + GP-1 (compliance is
    // architecture): SOC-grade preservation lives in the row, not in logging.
    // Per Disposition 3: pre-state + post-state + trigger + actor + timestamp captured.
    const bindingSnapshot = {
      ts: new Date().toISOString(),
      convergence_bindings_used: convergenceBindings ?? null,
      tenant_entity_external_ids_at_t: Array.from(tenantEntityExternalIdsForEngine),
      verification_confidences: {} as Record<string, { column: string | null; confidence_computed_at_t: number; methodology_version: string }>,
      corrections_in_this_run: correctionsInThisRun.filter(c => c.entity_id === entityId),
      structural_exceptions_in_this_run: structuralExceptionsInThisRun.filter(e => e.entity_id === entityId),
      engine_version: 'HF-218',
      calculation_run_id: calculationRunId,
    };
    // Populate per-component verification confidences (entity_identifier slot only — Component 1 scope).
    if (convergenceBindings) {
      for (const [ck, cb] of Object.entries(convergenceBindings)) {
        const cbObj = cb as Record<string, { column?: string; confidence?: number } | undefined>;
        const eid = cbObj.entity_identifier;
        bindingSnapshot.verification_confidences[ck] = {
          column: eid?.column ?? null,
          confidence_computed_at_t: typeof eid?.confidence === 'number' ? eid.confidence : 0,
          methodology_version: 'HF-218 structural_product_v1',
        };
      }
    }

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
        roundingTrace: {
          rawTotal: entityRoundingTraces.reduce((s, t) => s + t.rawValue, 0),
          roundedTotal: entityTotal,
          totalRoundingAdjustment: entityRoundingTraces.reduce((s, t) => s + t.roundingAdjustment, 0),
          components: entityRoundingTraces,
        },
        // HF-218 Component 5: SOC-grade preservation snapshot.
        binding_snapshot: bindingSnapshot,
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
      addLog(`  ${entityInfo?.display_name ?? entityId}: ${entityTotal.toLocaleString()}`);
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
  // OB-217: capture inserted ids → map entity_id → calculation_results.id (the FK every
  // per-row trace needs; a trace cannot exist before its result row does).
  const resultIdByEntity = new Map<string, string>();
  for (let i = 0; i < insertRows.length; i += WRITE_BATCH) {
    const slice = insertRows.slice(i, i + WRITE_BATCH);
    const { data: inserted, error: writeErr } = await supabase
      .from('calculation_results')
      .insert(slice)
      .select('id, entity_id');

    if (writeErr) {
      return NextResponse.json(
        { error: `Failed to write results batch ${i / WRITE_BATCH}: ${writeErr.message}`, log },
        { status: 500 }
      );
    }
    for (const row of inserted ?? []) {
      if (row.entity_id) resultIdByEntity.set(row.entity_id, row.id);
    }
  }

  addLog(`Wrote ${insertRows.length} calculation_results (in ${Math.ceil(insertRows.length / WRITE_BATCH)} batches)`);

  // ── OB-217: write per-transaction traces (after results exist, so the result_id FK resolves) ──
  if (sr38Failures.length > 0) {
    // SR-38 / SR-34: a pure-additive component failed to reconcile to the engine raw outcome.
    // Do NOT ship wrong traces. Entity-level results are already correct and persisted; surface
    // loudly and skip the trace write (never fail the calculation for an attribution defect).
    const sample = sr38Failures.slice(0, 5)
      .map(f => `entity=${f.entityId} comp=${JSON.stringify(f.component)} raw=${f.rawOutcome} perRowSum=${f.perRowSum} delta=${f.delta}`)
      .join('; ');
    addLog(`[OB-217] HALT-SR38: ${sr38Failures.length} additive component(s) did not reconcile — traces NOT written. ${sample}`);
    console.error(`[OB-217] HALT-SR38 (${sr38Failures.length} failures):`, sr38Failures.slice(0, 20));
  } else if (perRowTraceAccumulator.length > 0) {
    const traceRows = perRowTraceAccumulator.flatMap(acc => {
      const resultId = resultIdByEntity.get(acc.entityId);
      if (!resultId) return [] as Array<Parameters<typeof writeCalculationTraces>[1][number]>;
      return acc.traces.map(t => ({
        resultId,
        componentName: acc.componentName,
        formula: t.formula,
        inputs: t.inputs,
        output: t.output,
        committedDataId: t.committedDataId,
        transactionRef: t.transactionRef,
      }));
    });
    if (traceRows.length > 0) {
      try {
        await writeCalculationTraces(tenantId, traceRows, supabase);
        addLog(`[OB-217] Wrote ${traceRows.length} per-transaction traces across ${perRowTraceAccumulator.length} entity-component groups`);
      } catch (traceErr) {
        // Non-blocking: entity-level results are already persisted; trace failure must not fail the run.
        addLog(`[OB-217] WARNING: per-transaction trace write failed (non-blocking): ${traceErr instanceof Error ? traceErr.message : String(traceErr)}`);
        console.error('[OB-217] trace write error:', traceErr);
      }
    }
  }

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
  // HF-220 R3: concordance rate retired (Decision 151 sole authority); IAP confidence
  // proxy now derives from synaptic activity rather than dual-path concordance.
  const producedLearning = densityUpdates.length > 0 || signalBatch.length > 0;
  const avgConfidence = producedLearning ? 1.0 : 0.0;
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
            // HF-218 Component 4a: mirror T3 EXCEPTION into classification_signals.
            writeSignal({
              tenantId,
              signalType: 'engine:exception',
              signalValue: {
                component_key: compKey,
                role,
                type: 'boundaryFallback',
              },
              confidence: 0,
              source: 'system',
              calculationRunId,
              ruleSetId,
              context: { trigger: 'engine_boundary_fallback', binding_role: role },
            }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch(() => { /* non-blocking */ });
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
  // HF-272: surface per-component resolution failures distinctly (loud, never a $0 success).
  // A required reference token that mapped to NO real column at convergence (the relocated
  // hallucination-catch) — the component is `failed`, not silently $0.
  if (resolutionFailures.size > 0) {
    const t1Failures = Array.from(resolutionFailures.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([idx, info]) => `c${idx}("${info.name}"):token="${info.token}"/${info.reason}`)
      .join(' | ');
    addLog(`[CalcRecon-T1] resolutionFailures=[${t1Failures}]`);
  } else {
    addLog(`[CalcRecon-T1] resolutionFailures=[none]`);
  }
  addLog(`[CalcRecon-T1] flags={diag003Fallback:${diag003FallbackCount}/${t1FooterTotalLookups} boundaryFallback:${boundaryFallbackCount}}`);
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

  // OB-213 3A: persist a calculation-run audit event (resource_type/resource_id per audit_logs).
  await (supabase as unknown as { from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<{ error: { message: string } | null }> } })
    .from('audit_logs')
    .insert({
      tenant_id: tenantId,
      action: 'calculate',
      resource_type: 'calculation_batch',
      resource_id: batch.id,
      metadata: { periodId, ruleSetId, calculationRunId, entityCount: entityResults.length, totalPayout: grandTotal },
    })
    .then((r) => { if (r.error) addLog(`audit insert failed: ${r.error.message}`); });

  return NextResponse.json({
    success: true,
    batchId: batch.id,
    entityCount: entityResults.length,
    excludedCount: excludedEntities.length,
    totalPayout: grandTotal,
    intentLayer: {
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
        type: c.componentType,
        payout: c.payout,
      })),
    })),
    log,
  });
}
