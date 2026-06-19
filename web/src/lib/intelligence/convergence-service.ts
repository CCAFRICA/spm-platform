/**
 * OB-120/OB-162: Convergence Service — Field Identity Binding (Decision 111)
 *
 * Matches plan requirements to data capabilities through field identity matching
 * and token overlap. Generates MetricDerivationRule[] for the calculation engine
 * AND per-component input_bindings for Decision 111 convergence.
 *
 * Korean Test: Zero hardcoded field names. All field names, values, and patterns
 * discovered from runtime data sampling and HC field identities.
 *
 * OB-162 3-pass matching:
 *   Pass 1: Structural match — find batches with required structuralTypes
 *   Pass 2: Contextual match — use contextualIdentity to disambiguate
 *   Pass 3: Token overlap fallback — legacy matching for data without field identities
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetricDerivationRule } from '@/lib/calculation/run-calculation';
import type { FieldIdentity } from '@/lib/sci/sci-types';
import { getAIService } from '@/lib/ai';
// OB-199 Phase 4: canonical writer migration — bypass writer at line 363 removed.
import { writeSignal, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface PlanComponent {
  name: string;
  index: number;
  expectedMetrics: string[];
  calculationOp: string;
  calculationRate?: number;
  // HF-111: Carry raw calculationIntent for boundary extraction
  calculationIntent?: Record<string, unknown>;
  // HF-253: structural variant grouping carried from components.variants[].variantId.
  // Undefined for direct-array (non-variant) plans — those take a single implicit
  // binding group, preserving byte-identical pre-HF behavior. Never derived from
  // field-name or value content (Korean Test): it is the persisted structural key.
  variantId?: string;
}

// OB-191: Enriched metric context for Pass 4 AI prompt
// HF-198 E5: extended with semantic_intent from comprehension:plan_interpretation
// signals so AI prompt receives authoritative plan-agent semantic intent (read
// before derive — declared reader for L2 Comprehension signals).
interface MetricContext {
  name: string;          // Programmatic metric name (e.g., "period_equipment_revenue")
  label: string;         // Human-readable label (e.g., "Period Equipment Revenue")
  componentName: string; // Owning component name for additional context
  operation: string;     // Calculation operation (e.g., "linear_function")
  scope?: string;        // Scope level for scope_aggregate (e.g., "district")
  semanticIntent?: string;             // HF-198 E5: AI plan-agent reasoning text (per metric_comprehension signal)
  metricInputs?: Record<string, unknown> | null;  // HF-198 E5: input shape from plan-agent (per metric_comprehension signal)
  // HF-226 Phase 2A — Carry Everything from the plan-agent signal (T1-E902).
  // The full signal_value flows through so downstream prompt builders can
  // surface any field the LLM emitted (filters, expectedMetrics, calculationMethod,
  // free-form predicate vocabulary). semanticIntent and metricInputs above are
  // retained for backward compatibility with existing extractions; new consumers
  // read directly off signalContext.
  signalContext?: Record<string, unknown> | null;
}

/** Convert programmatic metric name to human-readable label */
function humanizeMetricName(name: string): string {
  return name
    .replace(/^(period|monthly|weekly|biweekly|quarterly|annual)_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// HF-111: Per-column value statistics for boundary matching
interface ColumnValueStats {
  min: number;
  max: number;
  mean: number;
  sampleCount: number;
}

interface DataCapability {
  dataType: string;
  // OB-216 Phase 1 (sheet-aware partition): structural partition identity =
  // `${dataType}␟${column-signature}`. Distinguishes capabilities that share a data_type but
  // carry different column schemas (e.g. MIR's Cobranza vs Ventas sheets, both
  // data_type='transaction'). The signature is the SET of non-underscore column names as an
  // opaque fingerprint — never branched on by meaning (Korean Test).
  partitionKey: string;
  rowCount: number;
  numericFields: Array<{ field: string; avg: number; nonNullCount: number }>;
  categoricalFields: Array<{ field: string; distinctValues: string[]; count: number }>;
  booleanFields: Array<{ field: string; trueValue: string; falseValue: string }>;
  // OB-128: Semantic role awareness — discovered from committed_data metadata
  semanticRoles: Record<string, string>;  // fieldName → semanticRole
  hasTargetData: boolean;                 // true if any field has 'performance_target' role
  targetField?: string;                   // field name with 'performance_target' role
  // OB-162: Field identity awareness (Decision 111)
  fieldIdentities: Record<string, FieldIdentity>;  // columnName → FieldIdentity
  batchIds: string[];                               // import_batch_ids for this data_type
  // HF-111: Per-column value distributions for boundary matching
  columnStats: Record<string, ColumnValueStats>;    // columnName → value stats
}

// OB-162: Per-component convergence binding (Decision 111)
// HF-222 Phase 3 (schema-class root closure): the prior single batch-id field that
// collapsed learning-provenance and data-location semantics is retired. Audit
// provenance is now carried by `learning_provenance` (period-agnostic, write-time
// metadata only). Data-location resolution keys by column name across all
// operative-period batches. See VG entry T1-E-PG3 for the class naming.
// OB-216 §2 (Phase 3'): the GENERAL aggregation-reduction set — how a bound column's multiple rows
// per entity reduce to a single value. NOT a sum/snapshot binary. Recognized by the LLM per binding
// (Decision 158), applied deterministically at resolution. 'snapshot' = a stock/balance value that is
// the same on every row (take it once, do not sum); flow amounts sum; max/min/average/distinct_count
// are plan-intent-driven.
export type ReductionKind = 'sum' | 'snapshot' | 'last' | 'first' | 'max' | 'min' | 'average' | 'distinct_count';

export interface ComponentBinding {
  column: string;
  field_identity: FieldIdentity;
  match_pass: number | 'failed';  // 1=structural/boundary, 2=contextual/AI, 3=token, 'failed'=HF-203 binding rejection
  confidence: number;
  // HF-111: Scale factor for percentage columns (e.g., 100 when column is 0-1 ratio but boundary is 0-100)
  scale_factor?: number;
  // OB-216 §2 (Phase 3'): how the bound column's multiple rows per entity reduce to one value —
  // LLM-recognized from the column's nature (contextualIdentity / value-shape) + the field's intent
  // role, deterministically applied by resolveColumnFromBatch. Absent ⇒ 'sum' (legacy flow behavior).
  reduction?: ReductionKind;
  // HF-196 Phase 1G Path α (HF-203): rejection metadata when binding misalignment detected (ratio>10 vs peer median)
  failure_reason?: string;
  // HF-272: per-component resolution-failure MARKER. Set when a required reference token
  // (a `reference` leaf the constructed DAG depends on) resolved to NO real data column —
  // neither AI semantic mapping nor boundary fallback bound it. This is the relocated
  // hallucination-catch (formerly the HF-270 interpretation-time gate): the comparison is
  // against the REAL columns convergence evaluated (measureColumns — complete-by-
  // construction), NEVER an enumerated/declared list (AUD-009). It is a DATA marker, not a
  // thrown exception: the run continues (Option 1 — no abort), and calc surfaces the
  // component as a loud `failed` (no silent $0).
  resolutionFailure?: {
    token: string;                  // the recognized reference token that matched no real column
    // OB-216 §2-S5: widened from the single 'no_real_column_match' literal to carry the specific
    // gap cause (no_proposal | llm_abstained:<reason> | proposed_column_absent_in_sheet |
    // role_inconsistent:needs_<X>_got_<Y>). Consumers read it as a string (route.ts:2594).
    reason: string;
    candidatesConsidered: number;   // how many real columns convergence weighed (0 = none existed)
  };
  // HF-222 Phase 3: learning provenance (audit metadata only).
  learning_provenance?: {
    batch_id: string;
    learned_at: string;
  };
  // HF-227: filters live on the binding. Decision 111 ratifies convergence_bindings
  // as the sole engine output; the engine reads filter applicability natively from
  // the binding entry rather than via a metric_derivations cross-structure lookup
  // bridge (findMetricFilters, retired in HF-227 Phase 3). An empty / absent array
  // means "no filter" — rowMatchesFilters returns true for empty filter arrays.
  // Operator union mirrors MetricDerivationRule['filters'][number]['operator']
  // so binding.filters can pass directly to resolveColumnFromBatch.
  filters?: Array<{
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
    value: string | number | boolean;
  }>;
}

interface BindingMatch {
  component: PlanComponent;
  dataType: string;
  matchConfidence: number;
  matchReason: string;
}

export interface ConvergenceGap {
  component: string;
  componentIndex: number;
  requiredMetrics: string[];
  calculationOp: string;
  reason: string;
  resolution: string;
  referenceDataAvailable?: boolean;
}

// OB-197 G11: shape of observations surfaced from the canonical signal surface.
// Convergence is observation, not computation (DS-021 §7) — these rows are surfaced
// alongside the matching algorithm output, not consumed by the matching algorithm.
export interface ConvergenceSignalObservation {
  signal_type: string;
  signal_value: Record<string, unknown> | null;
  decision_source: string | null;
  classification: string | null;
  structural_fingerprint: Record<string, unknown> | null;
  agent_scores: Record<string, unknown> | null;
  confidence: number | null;
}

export interface ConvergenceResult {
  derivations: MetricDerivationRule[];
  matchReport: Array<{ component: string; dataType: string; confidence: number; reason: string }>;
  signals: Array<{ domain: string; fieldName: string; semanticType: string; confidence: number }>;
  gaps: ConvergenceGap[];
  // OB-162: Per-component input bindings (Decision 111)
  componentBindings: Record<string, Record<string, ComponentBinding>>;
  // OB-197 G11: signal-surface observations (within-run + cross-run).
  // Surfaced for downstream consumers; matching algorithm itself is unchanged.
  // HF-196 Phase 3: D153 B-E4 atomic cutover — metricComprehension is the
  // operative signal-surface input. The legacy private-JSONB-key path was
  // eradicated by PR #342 cutover-revert; signal surface is now the path.
  observations: {
    withinRun: ConvergenceSignalObservation[];
    crossRun: ConvergenceSignalObservation[];
    // HF-196 Phase 3: rule-set-scoped metric comprehension signals read from
    // classification_signals WHERE signal_type='comprehension:plan_interpretation'
    // (OB-198 vocabulary aligned). These signals carry plan-agent metric
    // semantics that the legacy private-key path used to provide. The legacy
    // path was eradicated PR #342; signal surface now operative per D153 B-E4.
    metricComprehension: MetricComprehensionSignal[];
  };
}

// HF-196 Phase 3: shape of metric_comprehension signals consumed as operative
// input to convergence. These signals replace the legacy private-JSONB path
// (eradicated by PR #342 cutover-revert). Read scoped to (tenant_id,
// rule_set_id, signal_type='comprehension:plan_interpretation').
export interface MetricComprehensionSignal {
  signal_value: Record<string, unknown> | null;
  confidence: number | null;
  rule_set_id: string | null;
}

// ──────────────────────────────────────────────
// Main Entry Point
// ──────────────────────────────────────────────

export async function convergeBindings(
  tenantId: string,
  ruleSetId: string,
  supabase: SupabaseClient,
  calculationRunId?: string,  // OB-197 G11: scope signals emitted by this convergence to a calculation run
): Promise<ConvergenceResult> {
  const derivations: MetricDerivationRule[] = [];
  const matchReport: ConvergenceResult['matchReport'] = [];
  const signals: ConvergenceResult['signals'] = [];
  const gaps: ConvergenceGap[] = [];
  const componentBindings: Record<string, Record<string, ComponentBinding>> = {};
  // OB-197 G11: observations populated from the canonical signal surface
  // before matching begins. Empty when no calculationRunId is supplied.
  // HF-196 Phase 3: metricComprehension is read unconditionally (not gated on
  // calculationRunId) because it is the operative input replacing seeds.
  const observations: ConvergenceResult['observations'] = { withinRun: [], crossRun: [], metricComprehension: [] };

  // 1. Fetch rule set
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('id', ruleSetId)
    .single();

  if (!ruleSet) return { derivations, matchReport, signals, gaps, componentBindings, observations };

  // 2. Extract plan requirements
  const components = extractComponents(ruleSet.components);
  if (components.length === 0) return { derivations, matchReport, signals, gaps, componentBindings, observations };

  // HF-196 Phase 3: D153 B-E4 atomic cutover — read metric_comprehension signals
  // as the operative signal-surface input. These signals (signal_type=
  // 'comprehension:plan_interpretation') carry plan-agent metric semantics that
  // the eradicated seeds path used to provide. Read scoped to (tenant_id, rule_set_id).
  // Per D153 B-E4: "signal surface as the operative path. No parallel paths."
  const metricComprehensionSignals = await loadMetricComprehensionSignals(tenantId, ruleSetId, supabase);
  observations.metricComprehension = metricComprehensionSignals;
  if (metricComprehensionSignals.length > 0) {
    console.log(`[Convergence] HF-196 D153 cutover: ${metricComprehensionSignals.length} metric_comprehension signals loaded as operative input (rule_set=${ruleSetId})`);
  }

  // 3. Inventory data capabilities (OB-162: includes field identities)
  const capabilities = await inventoryData(tenantId, supabase);
  if (capabilities.length === 0) {
    for (const comp of components) {
      gaps.push({
        component: comp.name,
        componentIndex: comp.index,
        requiredMetrics: comp.expectedMetrics,
        calculationOp: comp.calculationOp,
        reason: 'No committed data found for this tenant',
        resolution: `Import data for this plan's components`,
      });
    }
    return { derivations, matchReport, signals, gaps, componentBindings, observations };
  }

  // OB-197 G11: signal-surface observation (DS-021 §7 — convergence observes,
  // does not compute). Reads are gated on calculationRunId; outside a run the
  // observations stay empty and matching proceeds unchanged.
  if (calculationRunId) {
    // OB-197 G11: within-run signal observation. Surface what has been observed
    // earlier in THIS calculation run for this tenant. Per DS-021 §7, convergence
    // uses this output for OBSERVATION (matches/gaps/opportunities) — NOT for scoring.
    const { data: withinRunPriors } = await supabase
      .from('classification_signals')
      .select('signal_type, signal_value, decision_source, classification, structural_fingerprint, agent_scores, confidence')
      .eq('tenant_id', tenantId)
      .eq('calculation_run_id', calculationRunId)
      .order('created_at', { ascending: true });

    // OB-197 G11: cross-run signal observation. Surface this tenant's signals from
    // prior runs that match the current convergence context. Per DS-021 §7,
    // observation only — not consumed by matching algorithm.
    const { data: crossRunPriors } = await supabase
      .from('classification_signals')
      .select('signal_type, signal_value, decision_source, classification, structural_fingerprint, agent_scores, confidence')
      .eq('tenant_id', tenantId)
      .in('signal_type', [
        'classification:outcome',
        'comprehension:plan_interpretation',
        'comprehension:header_binding',
        'classification:human_correction',
        // HF-198 E3 / F-011 closure: declared reader for convergence:dual_path_concordance.
        // Cross-run observation surface for dual-path agreement-rate trend.
        // HF-222 Phase 4: signal classification is observation-only. The HF-218 Component 4b
        // gate consumer was retired in Phase 1 (Korean Test compliance). This reader remains
        // — it is read-only and feeds cross-run flywheel observation (IRA priors,
        // ICA Mode 5 capture). Classification metadata lives at substrate (VG entry
        // T2-E-signal-convergence-dual-path-concordance-observation-only), not at code comment;
        // this comment is the runtime breadcrumb pointing to the substrate entry. The signal
        // MUST NOT be re-introduced as a binding-gate consumer without satisfying AP-25 /
        // IGF-T1-E910 (Korean Test).
        'convergence:dual_path_concordance',
      ])
      .not('calculation_run_id', 'is', null)
      .neq('calculation_run_id', calculationRunId)
      .order('created_at', { ascending: false })
      .limit(200);

    observations.withinRun = (withinRunPriors ?? []) as ConvergenceSignalObservation[];
    observations.crossRun = (crossRunPriors ?? []) as ConvergenceSignalObservation[];
  }

  // 4. OB-162: 3-pass matching — field identities first, token overlap fallback
  const matches = matchComponentsToData(components, capabilities);

  // 5. Generate derivation rules
  // HF-226 Phase 2B (IRA DS-025 Option D): generateDerivationsForMatch was the
  // routing gate that hardcoded filters: [] on every produced rule, then
  // populated `derivations` and pre-resolved metrics so the AI-mediated Pass 4
  // never saw them. Removing the call here means ALL metrics fall through to
  // the unified Pass 4 (generateAISemanticDerivations) which carries the
  // categorical-subset prompt and produces filter populated rules. The
  // matchReport / signals emissions for deterministic matches are preserved.
  for (const match of matches) {
    const cap = capabilities.find(c => c.dataType === match.dataType);
    if (!cap) continue;

    matchReport.push({
      component: match.component.name,
      dataType: match.dataType,
      confidence: match.matchConfidence,
      reason: match.matchReason,
    });

    // OB-216 Phase 3: the developer matchConfidence cutoff is removed (Decision 110). It gated only
    // the per-match SIGNAL below — observation, not binding — and the synthesized-derivation path it
    // once guarded is dead. Every structural match emits its observation signal; no tuned cutoff.

    // Emit per-match signal (preserving HF-219 surface) without a synthesized
    // derivation. The signal records the structural match outcome; the
    // derivation comes from Pass 4 with the full LLM-derived filter context.
    signals.push({
      domain: match.dataType,
      fieldName: 'match_outcome',
      semanticType: 'match',
      confidence: match.matchConfidence,
    });
    // Note: per-component bindings generated in bulk below (HF-111)
  }

  // HF-112 / HF-199 D2: Generate all component bindings with AI mapping + boundary validation.
  // metricComprehension signals (HF-198 E5) flow through as authoritative semantic intent,
  // raising binding accuracy and the boundary-fallback acceptance threshold.
  const existingConvergenceBindings = (ruleSet.input_bindings as Record<string, unknown>)?.convergence_bindings as
    Record<string, Record<string, unknown>> | undefined;

  // HF-218 Component 1: fetch tenant entity external_id set for binding self-verification.
  // The set seeds the structural cardinality × intersection composition (ADR Decision 1) used
  // by generateAllComponentBindings entity_identifier selection. Per Disposition 2: gate-only
  // read; not a calculation input — verification metadata only.
  const tenantEntityExternalIds = new Set<string>();
  {
    const { data: entRows, error: entErr } = await supabase
      .from('entities')
      .select('external_id')
      .eq('tenant_id', tenantId)
      .not('external_id', 'is', null);
    if (entErr) {
      console.warn(`[Convergence] HF-218 tenant entity fetch failed (non-blocking, proceeds with empty set): ${entErr.message}`);
    } else if (entRows) {
      for (const r of entRows) {
        const eid = r.external_id;
        if (eid != null) tenantEntityExternalIds.add(String(eid).trim());
      }
    }
    console.log(`[Convergence] HF-218 Tenant entity overlap baseline: ${tenantEntityExternalIds.size} external_ids loaded`);
  }

  await generateAllComponentBindings(
    components,
    matches,
    capabilities,
    componentBindings,
    existingConvergenceBindings,
    observations.metricComprehension,
    tenantEntityExternalIds,
    tenantId,
    supabase,
  );

  // HF-115: Cross-component plausibility check — detect scale anomalies
  // Skip if reusing existing bindings (already validated in prior run)
  const bindingsWereReused = hasCompleteBindings(existingConvergenceBindings, components.length);
  if (Object.keys(componentBindings).length > 0 && !bindingsWereReused) {
    // Build distributions from existing columnStats (mean approximates median for 10x outlier detection)
    const distributions: Record<string, ColumnDistribution> = {};
    for (const cap of capabilities) {
      for (const [colName, stats] of Object.entries(cap.columnStats)) {
        if (!distributions[colName]) {
          distributions[colName] = {
            column: colName,
            min: stats.min,
            max: stats.max,
            median: stats.mean,  // mean ≈ median for anomaly detection (10x threshold)
            p25: stats.min + (stats.mean - stats.min) * 0.5,
            p75: stats.mean + (stats.max - stats.mean) * 0.5,
            distinctCount: stats.sampleCount,
            nullCount: 0,
            sampleSize: stats.sampleCount,
            scaleInference: inferScale(stats),
          };
        }
      }
    }

    const plausibilityResults = checkCalculationPlausibility(
      components, componentBindings, distributions
    );

    // HF-196 Phase 1G Path α (HF-203): apply binding rejections — mark match_pass='failed' on
    // misaligned bindings; surface as convergence gap. Do NOT patch scale_factor. Engine reads
    // operate only on bindings with legitimate scale_factor values from the column-mapping
    // process (set in generateAllComponentBindings); rejected bindings either have failed
    // match_pass (downstream consumers must skip / surface gap) or get re-mapped via convergence
    // gap surface (caller-driven, out of scope for this function).
    for (const pr of plausibilityResults) {
      if (pr.isAnomaly && pr.proposedAction?.type === 'binding_rejection') {
        const compKey = `component_${pr.componentIndex}`;
        const cb = componentBindings[compKey];
        if (cb) {
          const role = pr.proposedAction.bindingRole;
          const binding = cb[role];
          if (binding) {
            binding.match_pass = 'failed';
            binding.failure_reason = pr.proposedAction.rationale;
            console.log(
              `[CONVERGENCE-VALIDATION]   Binding rejected on ${compKey}:${role} ` +
              `(decision_source: binding_misalignment, rejected_column: ${pr.proposedAction.rejectedColumn}, ` +
              `ratio: ${pr.ratioToMedian.toFixed(1)}x)`
            );
          }
        }
      }
    }

    // Capture classification signals (HF-203 inversion: signal carries binding rejection, not scale correction)
    for (const pr of plausibilityResults) {
      if (pr.isAnomaly) {
        const compKey = `component_${pr.componentIndex}`;
        const cb = componentBindings[compKey];
        const bindingRole = pr.proposedAction?.bindingRole ?? 'actual';
        const colName = cb?.[bindingRole]?.column ?? 'unknown';
        const dist = distributions[colName];

        // OB-199 Phase 4: bypass writer removed; migrated to canonical writer per DS-023 §5.1.
        // Explicit error handling per AUD-001 F-003 closure (no fire-and-forget swallow).
        try {
          await writeSignal({
            tenantId,
            signalType: 'convergence:calculation_validation',
            signalValue: {
              component_index: pr.componentIndex,
              component_name: pr.componentName,
              anomaly_type: pr.anomalyType,
              detected_result: pr.sampleResult,
              peer_median: pr.medianPeerResult,
              ratio_to_median: pr.ratioToMedian,
              action_applied: !!pr.proposedAction,
              action_type: pr.proposedAction?.type,
              rejected_column: pr.proposedAction?.rejectedColumn,
            },
            confidence: 0.85,
            source: 'convergence_validation',
            decisionSource: 'binding_misalignment',
            context: {
              plan_id: ruleSetId,
              component_type: components[pr.componentIndex]?.calculationOp ?? 'unknown',
              bound_column: colName,
              value_distribution: dist ? { min: dist.min, max: dist.max, median: dist.median, scale: dist.scaleInference } : null,
            },
            calculationRunId: calculationRunId ?? null,
          }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        } catch (err) {
          if (err instanceof CanonicalWriteError) {
            console.warn(`[ConvergenceService] anomaly signal CanonicalWriteError (${err.cause}): ${err.message}`);
          } else {
            console.warn('[ConvergenceService] anomaly signal unexpected error:', err instanceof Error ? err.message : String(err));
          }
        }
      }
    }
  }

  // 5b. OB-128: Detect actuals-target pairs via semantic roles
  const targetCapabilities = capabilities.filter(c => c.hasTargetData);
  if (targetCapabilities.length > 0) {
    for (const targetCap of targetCapabilities) {
      const targetTokens = tokenize(targetCap.dataType);
      let bestCompMatch: { comp: PlanComponent; score: number } | null = null;

      for (const comp of components) {
        const compTokens = tokenize(comp.name);
        const overlap = compTokens.filter(t => targetTokens.some(d => d.includes(t) || t.includes(d)));
        const score = overlap.length / Math.max(compTokens.length, 1);
        // OB-216 Phase 3: argmax over candidates with the structural floor 0 (any token overlap),
        // not a developer cutoff (Decision 110). 0 is the bare structural floor ("is there overlap
        // at all"), never a tuned threshold.
        if (score > 0 && (!bestCompMatch || score > bestCompMatch.score)) {
          bestCompMatch = { comp, score };
        }
      }

      if (!bestCompMatch) continue;
      const comp = bestCompMatch.comp;

      const actualsDerivation = derivations.find(d =>
        comp.expectedMetrics.includes(d.metric) && d.operation === 'sum'
      );
      if (!actualsDerivation || !targetCap.targetField) continue;

      if (actualsDerivation.source_pattern === targetCap.dataType) {
        const nonTargetCaps = capabilities.filter(c => !c.hasTargetData);
        const compTokens = tokenize(comp.name);
        let bestActualsDt = '';
        let bestActualsScore = 0;

        for (const nc of nonTargetCaps) {
          const dtTokens = tokenize(nc.dataType);
          const overlap = compTokens.filter(t => dtTokens.some(d => d.includes(t) || t.includes(d)));
          const score = overlap.length / Math.max(compTokens.length, 1);
          if (score > bestActualsScore && nc.numericFields.length > 0) {
            bestActualsScore = score;
            bestActualsDt = nc.dataType;
          }
        }

        if (bestActualsDt) {
          const actualsCap = nonTargetCaps.find(c => c.dataType === bestActualsDt);
          if (actualsCap) {
            const bestField = [...actualsCap.numericFields].sort((a, b) => b.avg - a.avg)[0];
            if (bestField) {
              actualsDerivation.source_pattern = bestActualsDt;
              actualsDerivation.source_field = bestField.field;
            }
          }
        }
      }

      const baseMetric = actualsDerivation.metric;

      derivations.push({
        metric: `${baseMetric}_target`,
        operation: 'sum',
        source_pattern: targetCap.dataType,
        source_field: targetCap.targetField,
        filters: [],
      });

      const scaleFactor = detectBoundaryScale(ruleSet.components, comp.index);

      derivations.push({
        metric: baseMetric,
        operation: 'ratio',
        source_pattern: '',
        filters: [],
        numerator_metric: `${baseMetric}_actuals`,
        denominator_metric: `${baseMetric}_target`,
        scale_factor: scaleFactor,
      });

      actualsDerivation.metric = `${baseMetric}_actuals`;

      matchReport.push({
        component: comp.name,
        dataType: targetCap.dataType,
        confidence: bestCompMatch.score,
        reason: `Semantic role: performance_target on field "${targetCap.targetField}"`,
      });

      signals.push({
        domain: targetCap.dataType,
        fieldName: targetCap.targetField,
        semanticType: 'performance_target',
        confidence: bestCompMatch.score,
      });

      // OB-162: Add target binding to component bindings
      const compKey = `component_${comp.index}`;
      if (!componentBindings[compKey]) componentBindings[compKey] = {};
      if (targetCap.batchIds.length > 0) {
        const targetFI = targetCap.fieldIdentities[targetCap.targetField];
        componentBindings[compKey]['target'] = {
          column: targetCap.targetField,
          field_identity: targetFI || { structuralType: 'measure', contextualIdentity: 'performance_target', confidence: 0.7 },
          match_pass: 2,
          confidence: bestCompMatch.score,
          learning_provenance: {
            batch_id: targetCap.batchIds[0],
            learned_at: new Date().toISOString(),
          },
        };
      }

      console.log(`[Convergence] OB-128: Detected actuals-target pair for "${comp.name}" — generating ratio derivation (scale=${scaleFactor})`);
    }
  }

  // HF-226 Phase 2B (IRA DS-025 Option D): Pass 4 is now the SOLE derivation
  // authority. Pre-HF-226 it fired only for metrics the deterministic Path
  // 1-3 (generateDerivationsForMatch, removed above) had failed to resolve.
  // Removing that path means the `derivations` array entering this point
  // contains ONLY the targets-pair ratio derivations (from the actuals+target
  // capability detection block).
  //
  // HF-234 — when capabilities carry categorical fields, ALL required metrics
  // flow through Pass 4 regardless of whether earlier code added a derivation
  // for them. Pass 4 is the surface where filter discovery happens, and any
  // metric on data with categorical dimensions may need subsetting. Tenants
  // without categorical data (e.g., Meridian — one metric per column) keep
  // the prior gate so Pass 4 fires only for metrics not already resolved by
  // the targets-pair ratio block.
  //
  // The variable name `unresolvedForAI` is retained for git-blame readability;
  // its membership semantics depend on the categorical-data branch below.
  // OB-200 Phase 3: unification — Pass 5 always receives ALL required metrics,
  // not the "unresolved" subset. Pre-OB-200 the pipeline had two paths: an
  // earlier ratio-pair inline block produced filter-less derivations
  // (filters:[]) which then GATED Pass 5 from firing for those metrics. That
  // bypass kept filter and scope architecturally unreachable. The unification
  // makes Pass 5 the authoritative derivation surface; column-mapping outputs
  // from earlier passes INFORM the Pass 5 prompt (the AI knows which column
  // each role binds to) but do not bypass the derivation step. Since
  // applyMetricDerivations processes the array in order and the last entry
  // wins per metric key, Pass 5's output supersedes earlier inline derivations
  // without removing them — additive change preserving git-blame readability.
  const hasCategoricalData = capabilities.some(cap =>
    (cap.categoricalFields?.length ?? 0) > 0,
  );
  const allRequiredMetrics = Array.from(new Set(components.flatMap(c => c.expectedMetrics)));
  const unresolvedForAI = allRequiredMetrics;

  if (unresolvedForAI.length > 0 && capabilities.length > 0) {
    // OB-191 / HF-198 E5: Build enriched metric context from calculationIntent
    // and from comprehension:plan_interpretation signals (read before derive).
    // The metric_comprehension signals carry plan-agent semantic intent that the
    // legacy private-JSONB path used to provide; consumed here per AUD-004 v3 §2 E5.
    const metricContexts: MetricContext[] = unresolvedForAI.map(metricName => {
      const ownerComp = components.find(c => c.expectedMetrics.includes(metricName));
      const intent = ownerComp?.calculationIntent;
      let scope: string | undefined;
      if (intent) {
        // HF-224: scope lives on any leaf IntentSource. Walk the intent tree
        // and take the first leaf that declares it so HF-223 nested shapes
        // (e.g. conditional_gate-wrapped ratio) still surface their scope.
        for (const leaf of extractLeafSources(intent)) {
          const leafScope = leaf.sourceSpec?.scope;
          if (typeof leafScope === 'string') {
            scope = leafScope;
            break;
          }
        }
      }
      // HF-198 E5: Find matching metric_comprehension signal by metric label / component name.
      const matchedSignal = observations.metricComprehension.find(sig => {
        const sv = sig.signal_value as Record<string, unknown> | null;
        if (!sv) return false;
        const sigLabel = (sv.metric_label as string | undefined) ?? '';
        const ownerName = ownerComp?.name ?? '';
        return sigLabel === ownerName || sigLabel === metricName;
      });
      const sigValue = (matchedSignal?.signal_value ?? {}) as Record<string, unknown>;
      const semanticIntent = (sigValue.semantic_intent as string | undefined) ?? undefined;
      const metricInputs = (sigValue.metric_inputs as Record<string, unknown> | null | undefined) ?? null;
      // HF-226 Phase 2A: carry full signal_value as signalContext so the
      // Pass 4 prompt builder can surface any field the plan-agent emitted
      // beyond the three already-extracted keys.
      return {
        name: metricName,
        label: humanizeMetricName(metricName),
        componentName: ownerComp?.name || 'Unknown',
        operation: ownerComp?.calculationOp || 'unknown',
        scope,
        semanticIntent,
        metricInputs,
        signalContext: matchedSignal ? sigValue : null,
      };
    });

    console.log(`[Convergence] OB-185 Pass 4: ${unresolvedForAI.length} metrics for AI semantic derivation (hasCategoricalData=${hasCategoricalData})`);
    for (const mc of metricContexts) {
      console.log(`[Convergence] Pass 4 metric: ${mc.name} (label: "${mc.label}", op: ${mc.operation}${mc.scope ? ', scope: ' + mc.scope : ''})`);
    }
    try {
      const aiResult = await generateAISemanticDerivations(
        metricContexts, capabilities
      );
      derivations.push(...aiResult.derivations);
      for (const g of aiResult.gaps) {
        gaps.push({
          component: components.find(c => c.expectedMetrics.includes(g.metric))?.name || 'Unknown',
          componentIndex: components.find(c => c.expectedMetrics.includes(g.metric))?.index || 0,
          requiredMetrics: [g.metric],
          calculationOp: 'derived',
          reason: g.reason,
          resolution: g.resolution,
        });
      }
      console.log(`[Convergence] OB-185 Pass 4: ${aiResult.derivations.length} derivations, ${aiResult.gaps.length} gaps`);
      for (const d of aiResult.derivations) {
        console.log(`[Convergence] Pass 4 derivation: ${d.metric} → ${d.operation}(${d.source_field || ''}) filters=${JSON.stringify(d.filters || [])}`);
      }
    } catch (aiErr) {
      console.error('[Convergence] OB-185 Pass 4 AI call failed:', aiErr);
      // Non-blocking — gaps will be detected below
    }
  }

  // 6. Detect convergence gaps
  // OB-162: No longer check reference_data (deprecated) — all data in committed_data
  const matchedComponentIndices = new Set(matches.map(m => m.component.index));
  // OB-185: Include AI-resolved metrics in the resolved set
  const finalResolvedMetrics = new Set(derivations.map(d => d.metric));
  for (const comp of components) {
    // OB-185: Check against ALL resolved metrics (Passes 1-3 + Pass 4 AI)
    const unresolvedMetrics = comp.expectedMetrics.filter(m => !finalResolvedMetrics.has(m));
    // Also skip if gap already recorded by Pass 4
    const alreadyGapped = gaps.some(g => g.componentIndex === comp.index);

    if (unresolvedMetrics.length > 0 && !alreadyGapped) {
      if (matchedComponentIndices.has(comp.index)) {
        gaps.push({
          component: comp.name,
          componentIndex: comp.index,
          requiredMetrics: unresolvedMetrics,
          calculationOp: comp.calculationOp,
          reason: `${unresolvedMetrics.length} metric(s) could not be derived from available data`,
          resolution: `Import data containing fields that map to: ${unresolvedMetrics.join(', ')}`,
        });
      } else {
        const opHint = comp.calculationOp === 'ratio' || comp.calculationOp === 'bounded_lookup_1d'
          ? 'ratio/lookup-based calculation requires structured data with numerator and denominator fields'
          : `${comp.calculationOp} calculation requires matching data`;
        gaps.push({
          component: comp.name,
          componentIndex: comp.index,
          requiredMetrics: unresolvedMetrics,
          calculationOp: comp.calculationOp,
          reason: `No matching data type found — ${opHint}`,
          resolution: comp.expectedMetrics.length > 0
            ? `Import data for metrics: ${unresolvedMetrics.join(', ')}`
            : `Import data with a data_type matching component "${comp.name}"`,
        });
      }
    }
  }

  console.log(`[Convergence] ${ruleSet.name}: ${derivations.length} derivations, ${gaps.length} gaps, ${Object.keys(componentBindings).length} component bindings`);
  return { derivations, matchReport, signals, gaps, componentBindings, observations };
}

// ──────────────────────────────────────────────
// Step 1: Extract Plan Components
// ──────────────────────────────────────────────

function extractComponents(componentsJson: unknown): PlanComponent[] {
  const result: PlanComponent[] = [];
  if (!componentsJson) return result;

  // HF-110: Handle both formats (FP-49 — verify structure before assuming)
  // Format 1: { variants: [{ variantId: "...", components: [...] }] }
  // Format 2: Direct array of components [{ name: "...", ... }]
  let comps: Array<Record<string, unknown>> = [];
  // HF-253: variantId aligned by index with `comps`. undefined for non-variant plans.
  const compVariantIds: Array<string | undefined> = [];

  if (Array.isArray(componentsJson)) {
    // Direct array of components
    comps = componentsJson as Array<Record<string, unknown>>;
  } else if (typeof componentsJson === 'object') {
    const cj = componentsJson as Record<string, unknown>;
    const variants = cj.variants as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(variants) && variants.length > 0) {
      // HF-243: flatten across ALL variants in declaration order so the binding
      // pipeline sees every variant component, not just variants[0]. Pre-HF-243
      // this took variants[0].components only — the comment claimed "all share
      // same structural pattern" but the engine keys bindings by global flat
      // index (component_0..N-1) and looks up variant 1's entities under
      // component_4+. DIAG-054 R3 confirmed convergence_bindings had zero entries
      // for component_4..7 because those components were never extracted.
      // Order is variant 0 components first, then variant 1, etc., matching the
      // engine's flat indexing.
      // HF-253: capture each variant's structural identifier (variantId) and align
      // it by index with the flattened component pushed from that variant. Verified
      // against the persisted shape (DIAG-051: variants[].variantId present, e.g.
      // "ejecutivo-senior", "ejecutivo"). AP-13: no assumption — fall through to
      // undefined if the key is absent (HALT-1 territory, surfaced by EPG-1).
      for (const v of variants) {
        const variantId = typeof v.variantId === 'string' ? v.variantId : undefined;
        const vc = v.components as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(vc)) {
          for (const c of vc) {
            comps.push(c);
            compVariantIds.push(variantId);
          }
        }
      }
    }
  }

  for (let i = 0; i < comps.length; i++) {
    const comp = comps[i];
    if (comp.enabled === false) continue;

    const name = (comp.name || comp.id || `Component ${i}`) as string;
    const intent = comp.calculationIntent as Record<string, unknown> | undefined;
    const calcMethod = comp.calculationMethod as Record<string, unknown> | undefined;
    const tierConfig = comp.tierConfig as Record<string, unknown> | undefined;

    const metrics: string[] = [];
    if (tierConfig?.metric) metrics.push(String(tierConfig.metric));

    if (intent) {
      // Handle both 'input' (singular) and 'inputs' (plural) structures
      const inputSpec = (intent.input as Record<string, unknown>)?.sourceSpec as Record<string, unknown> | undefined;
      if (inputSpec?.field) {
        const field = String(inputSpec.field).replace(/^metric:/, '');
        if (!metrics.includes(field)) metrics.push(field);
      }
      if (inputSpec?.numerator) metrics.push(String(inputSpec.numerator).replace(/^metric:/, ''));
      if (inputSpec?.denominator) metrics.push(String(inputSpec.denominator).replace(/^metric:/, ''));

      // 'inputs' plural — multiple named inputs (e.g., { row: { source: "metric", sourceSpec: { field: "..." } } })
      const inputs = intent.inputs as Record<string, Record<string, unknown>> | undefined;
      if (inputs) {
        for (const inputEntry of Object.values(inputs)) {
          const spec = inputEntry?.sourceSpec as Record<string, unknown> | undefined;
          if (spec?.field) {
            const field = String(spec.field).replace(/^metric:/, '');
            if (!metrics.includes(field)) metrics.push(field);
          }
        }
      }

      // OB-185: Handle piecewise_linear 'ratioInput' and 'baseInput' structures
      const ratioInput = intent.ratioInput as Record<string, unknown> | undefined;
      if (ratioInput?.sourceSpec) {
        const ratioSpec = ratioInput.sourceSpec as Record<string, unknown>;
        if (ratioSpec.numerator) {
          const n = String(ratioSpec.numerator).replace(/^metric:/, '');
          if (!metrics.includes(n)) metrics.push(n);
        }
        if (ratioSpec.denominator) {
          const d = String(ratioSpec.denominator).replace(/^metric:/, '');
          if (!metrics.includes(d)) metrics.push(d);
        }
        if (ratioSpec.field) {
          const f = String(ratioSpec.field).replace(/^metric:/, '');
          if (!metrics.includes(f)) metrics.push(f);
        }
      }
      const baseInput = intent.baseInput as Record<string, unknown> | undefined;
      if (baseInput?.sourceSpec) {
        const baseSpec = baseInput.sourceSpec as Record<string, unknown>;
        if (baseSpec.field) {
          const f = String(baseSpec.field).replace(/^metric:/, '');
          if (!metrics.includes(f)) metrics.push(f);
        }
      }

      // OB-185: Walk nested onTrue/onFalse for conditional_gate chains
      const walkNested = (obj: Record<string, unknown>) => {
        const spec = (obj.input as Record<string, unknown>)?.sourceSpec as Record<string, unknown> | undefined;
        if (spec?.field) {
          const f = String(spec.field).replace(/^metric:/, '');
          if (!metrics.includes(f)) metrics.push(f);
        }
        const condLeft = (obj.condition as Record<string, unknown>)?.left as Record<string, unknown> | undefined;
        const condSpec = condLeft?.sourceSpec as Record<string, unknown> | undefined;
        if (condSpec?.field) {
          const f = String(condSpec.field).replace(/^metric:/, '');
          if (!metrics.includes(f)) metrics.push(f);
        }
        if (obj.onTrue && typeof obj.onTrue === 'object') walkNested(obj.onTrue as Record<string, unknown>);
        if (obj.onFalse && typeof obj.onFalse === 'object') walkNested(obj.onFalse as Record<string, unknown>);
      };
      if (intent.onTrue || intent.onFalse || intent.condition) walkNested(intent);
    }

    if (calcMethod?.metric) {
      const cm = String(calcMethod.metric);
      if (!metrics.includes(cm)) metrics.push(cm);
    }

    const op = (intent?.operation || calcMethod?.type || 'unknown') as string;
    const rate = typeof intent?.rate === 'number' ? intent.rate : undefined;

    result.push({
      name,
      index: i,
      expectedMetrics: metrics,
      calculationOp: op,
      calculationRate: rate,
      // HF-111: Carry raw calculationIntent for boundary extraction
      calculationIntent: intent || undefined,
      // HF-253: structural variant grouping (undefined for non-variant plans).
      variantId: compVariantIds[i],
    });
  }

  return result;
}

// ──────────────────────────────────────────────
// HF-196 Phase 3: Load metric_comprehension signals (D153 B-E4 atomic cutover)
//
// Reads classification_signals scoped to (tenant_id, rule_set_id, signal_type
// = 'comprehension:plan_interpretation') — the OB-198-aligned vocabulary for
// plan-agent metric semantics. The legacy private-JSONB-key path that HF-191
// introduced was eradicated by PR #342 cutover-revert; this read replaces it
// as the operative signal-surface input per Decision 153 B-E4.
//
// Per Decision 153 B-E4: "atomic cutover to L2 Comprehension signals on
// classification_signals. Signal surface as the operative path."
//
// Korean Test (IGF-T1-E910) compliance: signal_type is a stable governance string,
// not a domain-name literal. tenant_id + rule_set_id are runtime parameters.
// ──────────────────────────────────────────────

async function loadMetricComprehensionSignals(
  tenantId: string,
  ruleSetId: string,
  supabase: SupabaseClient,
): Promise<MetricComprehensionSignal[]> {
  const { data, error } = await supabase
    .from('classification_signals')
    .select('signal_value, confidence, rule_set_id')
    .eq('tenant_id', tenantId)
    .eq('rule_set_id', ruleSetId)
    .eq('signal_type', 'comprehension:plan_interpretation')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn(`[Convergence] metric_comprehension signal read failed (non-blocking): ${error.message}`);
    return [];
  }
  return (data ?? []) as MetricComprehensionSignal[];
}

// ──────────────────────────────────────────────
// Step 2: Inventory Data Capabilities
// OB-162: Enhanced with field identity extraction
// ──────────────────────────────────────────────

// OB-216 Phase 1: exported so the partition can be verified in isolation (EPG-1). The convergence
// entry (convergeBindings) calls it internally; export adds no behavior, only test reachability.
export async function inventoryData(
  tenantId: string,
  supabase: SupabaseClient
): Promise<DataCapability[]> {
  const capabilities: DataCapability[] = [];

  // Phase 6B: the SINGLE canonical visibility gate hides non-completed AND superseded batches (the HF-196
  // fetchSupersededBatchIds filter is retired into it). No-op when nothing is hidden.
  const { hiddenBatchIdsForTenant, applyCommittedDataVisibility } = await import('@/lib/sci/committed-data-visibility');
  const hiddenBatchIds = await hiddenBatchIdsForTenant(supabase, tenantId);

  type InvRow = { data_type: string; row_data: Record<string, unknown> | null; metadata: Record<string, unknown> | null; import_batch_id: string };

  // OB-216 Phase 1 (sheet-aware partition): the prior flat `.limit(500)` sample could miss small
  // sheets entirely (e.g. a 30-row quota sheet or a 34-row roster), so a per-(data_type,
  // column-signature) partition would be blind to them. Enumerate the tenant's VISIBLE import
  // batches and sample EACH, so every batch's schema is represented before partitioning.
  // import_batch_id is a structural source key (one batch = one source sheet); no column semantics.
  // SAMPLE_ROWS_PER_BATCH is a coverage/perf SAMPLE BOUND, not a decision authority (Decision 110).
  const SAMPLE_ROWS_PER_BATCH = 50;
  const allRows: InvRow[] = [];

  const { data: batchRows } = await supabase
    .from('import_batches')
    .select('id')
    .eq('tenant_id', tenantId);
  const visibleBatchIds = (batchRows || [])
    .map(b => (b as { id?: string }).id)
    .filter((id): id is string => !!id && !hiddenBatchIds.includes(id));

  for (const batchId of visibleBatchIds) {
    let bq = supabase
      .from('committed_data')
      .select('data_type, row_data, metadata, import_batch_id')
      .eq('tenant_id', tenantId)
      .eq('import_batch_id', batchId)
      .not('data_type', 'is', null)
      .limit(SAMPLE_ROWS_PER_BATCH);
    bq = applyCommittedDataVisibility(bq, hiddenBatchIds);
    const { data: bRows } = await bq;
    if (bRows) allRows.push(...(bRows as InvRow[]));
  }

  // Fallback (robustness / SR-2): if batch enumeration yielded nothing (e.g. committed_data rows
  // not tied to a listed import_batch), preserve the prior flat-sample behavior so no tenant
  // silently loses its inventory.
  if (allRows.length === 0) {
    let q = supabase
      .from('committed_data')
      .select('data_type, row_data, metadata, import_batch_id')
      .eq('tenant_id', tenantId)
      .not('data_type', 'is', null)
      .limit(500);
    q = applyCommittedDataVisibility(q, hiddenBatchIds);
    const { data: rows } = await q;
    if (rows) allRows.push(...(rows as InvRow[]));
  }

  if (!allRows.length) return capabilities;

  // OB-216 Phase 1: partition by (data_type, column-signature) — the STRUCTURAL file boundary.
  // The signature is the SET of non-underscore column names treated as an opaque fingerprint
  // (sorted, joined). KOREAN TEST: the partition NEVER branches on what a column name MEANS — a
  // column named in any language groups purely by the shape of the column-key set. Same-schema
  // batches (e.g. monthly imports of one sheet) collapse to ONE capability; genuinely different
  // schemas (different column sets) become distinct capabilities, even within one data_type. This
  // replaces (a) the data_type-only grouping that merged distinct sheets, and (b) the HF-228
  // schema-coverage loop, whose purpose (admit multiple schemas per data_type) is now native.
  const sigOf = (rd: Record<string, unknown>): string =>
    Object.keys(rd).filter(k => !k.startsWith('_')).sort().join(',');
  const SEP = '␟'; // unit-separator: structural composite key delimiter, not content
  const partitionKeyOf = (dataType: string, rd: Record<string, unknown>): string =>
    `${dataType}${SEP}${sigOf(rd)}`;

  const byPartition = new Map<string, Array<Record<string, unknown>>>();
  const dataTypeByPartition = new Map<string, string>();
  const countByPartition = new Map<string, number>();
  const rolesByPartition = new Map<string, Record<string, string>>();
  const fieldIdentitiesByPartition = new Map<string, Record<string, FieldIdentity>>();
  const batchIdsByPartition = new Map<string, Set<string>>();

  for (const row of allRows) {
    const dataType = row.data_type as string;
    const rd = row.row_data as Record<string, unknown> | null;
    if (!rd) continue;
    const pk = partitionKeyOf(dataType, rd);
    dataTypeByPartition.set(pk, dataType);
    countByPartition.set(pk, (countByPartition.get(pk) || 0) + 1);
    if (!byPartition.has(pk)) byPartition.set(pk, []);
    const samples = byPartition.get(pk)!;
    if (samples.length < 50) samples.push(rd);

    const batchId = row.import_batch_id as string | null;
    if (batchId) {
      if (!batchIdsByPartition.has(pk)) batchIdsByPartition.set(pk, new Set());
      batchIdsByPartition.get(pk)!.add(batchId);
    }

    // Extract semantic_roles + field_identities from metadata (once per partition).
    const meta = row.metadata as Record<string, unknown> | null;
    if (!rolesByPartition.has(pk)) {
      const rawRoles = meta?.semantic_roles as Record<string, unknown> | undefined;
      if (rawRoles && Object.keys(rawRoles).length > 0) {
        const normalized: Record<string, string> = {};
        for (const [field, val] of Object.entries(rawRoles)) {
          if (typeof val === 'string') {
            normalized[field] = val;
          } else if (val && typeof val === 'object' && 'role' in val) {
            normalized[field] = String((val as Record<string, unknown>).role);
          }
        }
        if (Object.keys(normalized).length > 0) {
          rolesByPartition.set(pk, normalized);
        }
      }
    }
    if (!fieldIdentitiesByPartition.has(pk)) {
      const fieldIds = meta?.field_identities as Record<string, { structuralType?: string; contextualIdentity?: string; confidence?: number }> | undefined;
      if (fieldIds && Object.keys(fieldIds).length > 0) {
        const identities: Record<string, FieldIdentity> = {};
        for (const [colName, fi] of Object.entries(fieldIds)) {
          identities[colName] = {
            structuralType: (fi.structuralType || 'unknown') as FieldIdentity['structuralType'],
            contextualIdentity: fi.contextualIdentity || 'unknown',
            confidence: typeof fi.confidence === 'number' ? fi.confidence : 0.5,
          };
        }
        fieldIdentitiesByPartition.set(pk, identities);
      }
    }
  }

  for (const [partitionKey, samples] of Array.from(byPartition.entries())) {
    const dataType = dataTypeByPartition.get(partitionKey) || '';
    const roles = rolesByPartition.get(partitionKey) || {};
    const targetFieldEntry = Object.entries(roles).find(([, role]) => role === 'performance_target');
    const fieldIdentities = fieldIdentitiesByPartition.get(partitionKey) || {};
    const batchIds = Array.from(batchIdsByPartition.get(partitionKey) || new Set<string>());

    const cap: DataCapability = {
      dataType,
      partitionKey,
      rowCount: countByPartition.get(partitionKey) || 0,
      numericFields: [],
      categoricalFields: [],
      booleanFields: [],
      semanticRoles: roles,
      hasTargetData: !!targetFieldEntry,
      targetField: targetFieldEntry?.[0],
      fieldIdentities,
      batchIds,
      columnStats: {},
    };

    if (samples.length === 0) {
      capabilities.push(cap);
      continue;
    }

    const allKeys = new Set<string>();
    for (const sample of samples) {
      for (const key of Object.keys(sample)) {
        if (!key.startsWith('_')) allKeys.add(key);
      }
    }

    for (const key of Array.from(allKeys)) {
      const values = samples.map(s => s[key]).filter(v => v !== null && v !== undefined);
      if (values.length === 0) continue;

      const numericValues = values.filter(v => typeof v === 'number') as number[];
      const stringValues = values.filter(v => typeof v === 'string') as string[];

      if (numericValues.length > values.length * 0.5) {
        const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        if (avg > 100 && (avg < 43000 || avg > 48000)) {
          cap.numericFields.push({ field: key, avg, nonNullCount: numericValues.length });
        }
        // HF-111: Collect per-column value stats for boundary matching
        // Include ALL numeric columns (not just the filtered ones above)
        const minVal = Math.min(...numericValues);
        const maxVal = Math.max(...numericValues);
        cap.columnStats[key] = { min: minVal, max: maxVal, mean: avg, sampleCount: numericValues.length };
      }

      // HF-111: Also parse numeric strings (e.g., "0.85", "265625")
      if (numericValues.length <= values.length * 0.5 && stringValues.length > 0) {
        const parsedNums: number[] = [];
        for (const sv of stringValues) {
          const p = parseFloat(sv.replace(/[,$\s]/g, ''));
          if (!isNaN(p)) parsedNums.push(p);
        }
        if (parsedNums.length > values.length * 0.5) {
          const avg = parsedNums.reduce((a, b) => a + b, 0) / parsedNums.length;
          cap.columnStats[key] = {
            min: Math.min(...parsedNums),
            max: Math.max(...parsedNums),
            mean: avg,
            sampleCount: parsedNums.length,
          };
        }
      }

      if (stringValues.length > values.length * 0.5) {
        const distinctValues = Array.from(new Set(stringValues));
        if (distinctValues.length >= 2 && distinctValues.length <= 20) {
          if (distinctValues.length === 2) {
            const lower = distinctValues.map(v => v.toLowerCase());
            const isBoolLike = lower.some(v => ['yes', 'no', 'sí', 'si', 'true', 'false', 'qualified', 'not qualified'].includes(v));
            if (isBoolLike) {
              const trueVal = distinctValues.find(v => ['yes', 'sí', 'si', 'true', 'qualified'].includes(v.toLowerCase()));
              const falseVal = distinctValues.find(v => v !== trueVal);
              cap.booleanFields.push({
                field: key,
                trueValue: trueVal || distinctValues[0],
                falseValue: falseVal || distinctValues[1],
              });
              continue;
            }
          }
          cap.categoricalFields.push({
            field: key,
            distinctValues,
            count: stringValues.length,
          });
        }
      }
    }

    capabilities.push(cap);
  }

  return capabilities;
}

// ──────────────────────────────────────────────
// Step 3: Match Components to Data Types
// OB-162: 3-pass matching — field identities → contextual → token overlap
// ──────────────────────────────────────────────

function matchComponentsToData(
  components: PlanComponent[],
  capabilities: DataCapability[]
): BindingMatch[] {
  const matches: BindingMatch[] = [];
  const matchedComponents = new Set<number>();

  // OB-162 Pass 1+2: Field identity matching
  // Find capabilities that have field identities with measure columns
  const capsWithFI = capabilities.filter(c => Object.keys(c.fieldIdentities).length > 0);

  if (capsWithFI.length > 0) {
    for (const comp of components) {
      if (matchedComponents.has(comp.index)) continue;

      // Pass 1: Structural match — capability must have a 'measure' structuralType
      const structuralCandidates = capsWithFI.filter(cap => {
        const hasMeasure = Object.values(cap.fieldIdentities).some(fi => fi.structuralType === 'measure');
        const hasIdentifier = Object.values(cap.fieldIdentities).some(fi => fi.structuralType === 'identifier');
        return hasMeasure && hasIdentifier;
      });

      if (structuralCandidates.length === 0) continue;

      // HF-109 Pass 2: Structural co-location — disambiguate by component structural pattern (DS-009 4.2)
      // Uses measure count + contextual type diversity, NOT token overlap with component names
      const requiredMeasures = getRequiredMeasureCount(comp.calculationOp);

      let bestMatch: { cap: DataCapability; score: number; reason: string } | null = null;

      for (const cap of structuralCandidates) {
        let score = 0;
        const reasons: string[] = [];

        // Count measure columns in this capability
        const measureFIs = Object.entries(cap.fieldIdentities)
          .filter(([, fi]) => fi.structuralType === 'measure');
        const measureCount = measureFIs.length;

        // Does the batch have the right number of measures for this component?
        if (measureCount >= requiredMeasures) {
          score += 0.5;
          reasons.push(`${measureCount} measures (need ${requiredMeasures})`);
        }

        // Does the batch have a temporal column?
        const hasTemporal = Object.values(cap.fieldIdentities)
          .some(fi => fi.structuralType === 'temporal');
        if (hasTemporal) {
          score += 0.25;
          reasons.push('has temporal');
        }

        // For ratio/2D components needing 2+ measures: check contextual type diversity
        // (e.g., one currency_amount and one percentage — likely actual + target pair)
        if (requiredMeasures >= 2 && measureCount >= 2) {
          const contextualTypes = new Set(measureFIs.map(([, fi]) => fi.contextualIdentity));
          if (contextualTypes.size >= 2) {
            score += 0.25;
            reasons.push('diverse measure types');
          }
        }

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { cap, score, reason: reasons.join(', ') };
        }
      }

      // OB-216 Phase 3: accept the ARGMAX structural winner (bestMatch is set only when score > 0,
      // line ~1274) — no developer acceptance floor (Decision 110). With Phase-2's all-capabilities
      // candidate pool, the matched data_type drives only entity_identifier/period cap selection and
      // variant grouping; binding correctness is the LLM recognition + structural validation.
      if (bestMatch) {
        matches.push({
          component: comp,
          dataType: bestMatch.cap.dataType,
          matchConfidence: Math.min(0.90, 0.4 + bestMatch.score * 0.5),
          matchReason: `HF-109 structural: ${bestMatch.reason}`,
        });
        matchedComponents.add(comp.index);
      }
    }
  }

  // Pass 3: Token overlap fallback for unmatched components
  const dataTypes = capabilities.map(c => c.dataType);
  for (const comp of components) {
    if (matchedComponents.has(comp.index)) continue;

    const compTokens = tokenize(comp.name);
    let bestDt = '';
    let bestScore = 0;

    for (const dt of dataTypes) {
      const dtTokens = tokenize(dt);
      const overlap = compTokens.filter(t => dtTokens.some(d => d.includes(t) || t.includes(d)));
      const score = overlap.length / Math.max(compTokens.length, 1);
      if (score > bestScore) {
        bestScore = score;
        bestDt = dt;
      }
    }

    // OB-216 Phase 3: accept any token-overlap winner (bestDt is set only when score > 0) — argmax
    // + structural floor 0, no developer cutoff (Decision 110).
    if (bestDt) {
      matches.push({
        component: comp,
        dataType: bestDt,
        matchConfidence: Math.min(0.80, 0.4 + bestScore * 0.4),
        matchReason: `Token overlap: ${(bestScore * 100).toFixed(0)}%`,
      });
    }
  }

  return matches;
}

// ──────────────────────────────────────────────
// Step 4: Generate Derivation Rules
// ──────────────────────────────────────────────

// HF-226 Phase 2B: Superseded by unified derivation pass (generateAISemanticDerivations).
// The hardcoded `filters: []` literals at lines 1245, 1253 are the routing-gate
// instance of the registry/cherry-pick defect class (AUD-009). Call site at
// convergeBindings line ~310 commented out. Function body retained for
// rollback safety; remove after three-tenant verification per directive
// "Do NOT delete superseded functions yet" section.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateDerivationsForMatch(
  match: BindingMatch,
  capability: DataCapability,
  allComponents: PlanComponent[],
  allMatches: BindingMatch[]
): MetricDerivationRule[] {
  const rules: MetricDerivationRule[] = [];
  const comp = match.component;

  const sameDataTypeMatches = allMatches.filter(m => m.dataType === match.dataType);
  const isSharedBase = sameDataTypeMatches.length > 1;

  // OB-216 Phase 3: superseded generateFilteredCountDerivations (token-overlap categorical match,
  // a Korean-Test violation per DIAG-073 §5) removed; this dead branch returns no derivations.
  if (isSharedBase && capability.categoricalFields.length > 0) {
    return rules;
  }

  for (const metricName of comp.expectedMetrics) {
    const needsCount = comp.calculationOp === 'scalar_multiply' && comp.calculationRate !== undefined
      && comp.calculationRate > 1;
    const needsSum = !needsCount && capability.numericFields.length > 0;

    if (needsSum) {
      // OB-162: Prefer field identity measure column over highest-average heuristic
      let bestField: { field: string; avg: number } | undefined;
      if (Object.keys(capability.fieldIdentities).length > 0) {
        // Find measure columns from field identities
        const measureCols = Object.entries(capability.fieldIdentities)
          .filter(([, fi]) => fi.structuralType === 'measure')
          .map(([col]) => col);
        // Match measure column to numeric fields
        for (const mc of measureCols) {
          const nf = capability.numericFields.find(f => f.field === mc);
          if (nf && (!bestField || nf.avg > bestField.avg)) {
            bestField = nf;
          }
        }
      }
      // Fallback to highest average numeric field
      if (!bestField) {
        bestField = capability.numericFields.sort((a, b) => b.avg - a.avg)[0];
      }
      if (bestField) {
        rules.push({
          metric: metricName,
          operation: 'sum',
          source_pattern: match.dataType,
          source_field: bestField.field,
          filters: [],
        });
      }
    } else if (needsCount) {
      rules.push({
        metric: metricName,
        operation: 'count',
        source_pattern: match.dataType,
        filters: [],
      });
    }
  }

  return rules;
}

// ──────────────────────────────────────────────
// HF-111: Component Input Requirements
// Extracts what each component needs from its calculationIntent
// ──────────────────────────────────────────────

interface ComponentInputRequirement {
  role: string;  // 'actual', 'row', 'column', 'numerator', 'denominator'
  metricField: string;  // HF-112: from sourceSpec.field (e.g., 'revenue_attainment')
  expectedRange: { min: number; max: number } | null;
  /**
   * OB-200 Phase 2: LLM-emitted scale metadata for this field, extracted from
   * constant.meta on compare nodes referencing the field. When present,
   * scoreColumnForRequirement applies it directly and skips the ratio-vs-
   * percentage trial — the LLM told us the scale; we consume it.
   */
  scaleMetadata?: { unit: string; scale: number; confidence: number };
}

// HF-224: Generic intent tree traversal.
// Mirrors intent-executor's resolveValue: an IntentOperation has `operation`,
// an IntentSource has `source`. Recurse through every operation child until
// every leaf IntentSource is collected. Consumers that previously assumed a
// flat `intent.input` (pre-HF-223) call this to find the leaf they need.
export function extractLeafSources(
  node: unknown
): Array<{ source: string; sourceSpec?: Record<string, unknown> }> {
  if (!node || typeof node !== 'object') return [];

  const obj = node as Record<string, unknown>;

  if (typeof obj.source === 'string') {
    return [{
      source: obj.source,
      sourceSpec: obj.sourceSpec as Record<string, unknown> | undefined,
    }];
  }

  if (typeof obj.operation === 'string') {
    const leaves: Array<{ source: string; sourceSpec?: Record<string, unknown> }> = [];

    const recurseField = (field: unknown) => {
      if (field && typeof field === 'object') {
        leaves.push(...extractLeafSources(field));
      }
    };

    recurseField(obj.input);
    recurseField(obj.onTrue);
    recurseField(obj.onFalse);

    if (obj.condition && typeof obj.condition === 'object') {
      const cond = obj.condition as Record<string, unknown>;
      recurseField(cond.left);
      recurseField(cond.right);
    }

    if (obj.inputs && typeof obj.inputs === 'object') {
      for (const val of Object.values(obj.inputs as Record<string, unknown>)) {
        recurseField(val);
      }
    }

    if (Array.isArray(obj.segments)) {
      for (const seg of obj.segments) {
        recurseField(seg);
      }
    }

    recurseField(obj.ratioInput);
    recurseField(obj.baseInput);

    return leaves;
  }

  return [];
}

/**
 * HF-242: Walk a PrimeNode DAG and collect every `reference` field name and
 * every `aggregate` field name. These are the metric / row-field names the
 * DAG evaluator reads at calculation time; they are exactly the fields
 * convergence needs to bind to committed_data columns.
 *
 * Korean Test compliant — pure structural traversal, no field-name matching.
 * Domain-agnostic — works for any PrimeNode tree regardless of vocabulary.
 */
/**
 * HF-272: read the per-component resolution-failure marker from a component's convergence
 * bindings, if any role's binding carries one (written by generateAllComponentBindings when
 * a required reference token mapped to no real column). Pure structural read — no enumeration,
 * no plan knowledge, no declared-field list. Returns the FIRST unresolved token (a component
 * fails as soon as ANY required reference token maps to nothing real). Consumed by the calc
 * path (run/route.ts) and evaluateComponent to surface a loud per-component `failed` in place
 * of the prior silent $0.
 */
export function findComponentResolutionFailure(
  compBindings: Record<string, unknown> | undefined | null,
): { token: string; reason: string; candidatesConsidered: number } | null {
  if (!compBindings || typeof compBindings !== 'object') return null;
  for (const binding of Object.values(compBindings)) {
    if (binding && typeof binding === 'object') {
      const rf = (binding as { resolutionFailure?: { token?: unknown; reason?: unknown; candidatesConsidered?: unknown } }).resolutionFailure;
      if (rf && typeof rf === 'object' && typeof rf.token === 'string') {
        return {
          token: rf.token,
          reason: typeof rf.reason === 'string' ? rf.reason : 'no_real_column_match',
          candidatesConsidered: typeof rf.candidatesConsidered === 'number' ? rf.candidatesConsidered : 0,
        };
      }
    }
  }
  return null;
}

export function extractReferencesFromDAG(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const refs = new Set<string>();
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    const prime = typeof obj.prime === 'string' ? obj.prime : null;
    if (prime === 'reference' && typeof obj.field === 'string') {
      refs.add(obj.field);
      return;
    }
    if (prime === 'aggregate' && typeof obj.field === 'string') {
      refs.add(obj.field);
      // aggregate is a leaf; no downstream to recurse.
      return;
    }
    // Generic recursion — every prime that carries children carries them in
    // one of these positions. Recursing into `inputs` / `downstream` /
    // `condition` / `then` / `else` covers arithmetic, compare, logical,
    // filter, scope, conditional, and prior_period.
    if (Array.isArray(obj.inputs)) {
      for (const child of obj.inputs) walk(child);
    }
    if (obj.downstream) walk(obj.downstream);
    if (obj.condition) walk(obj.condition);
    if (obj.then) walk(obj.then);
    if (obj.else) walk(obj.else);
  };
  walk(node);
  return Array.from(refs);
}

/**
 * HF-243: Walk a PrimeNode DAG and collect every numeric `constant` that
 * appears alongside `reference(fieldName)` inside a `compare` node. The
 * collected constants are the threshold values the DAG expects the field
 * to be compared against — i.e. the expected value range for the field.
 *
 * Legacy bounded_lookup_1d / bounded_lookup_2d intents carried explicit
 * `boundaries: [{min, max}, ...]` arrays; `extractRangeFromBoundaries`
 * read these to produce `expectedRange` for `scoreColumnForRequirement`'s
 * scale inference (×1 vs ×100). Prime-DAG emissions embed those thresholds
 * directly inside `compare` nodes as constants; this function recovers the
 * equivalent expectedRange purely from the tree shape.
 *
 * Korean Test compliant — pure structural traversal, no field-name matching.
 */
export function extractExpectedRangeFromDAG(
  node: unknown,
  fieldName: string,
): { min: number; max: number } | null {
  if (!node || typeof node !== 'object') return null;
  const constants: number[] = [];

  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    const prime = typeof obj.prime === 'string' ? obj.prime : null;

    // A compare node has exactly 2 inputs. When ONE of them is a reference
    // to fieldName and the OTHER is a constant, the constant is a threshold
    // the field will be tested against.
    if (prime === 'compare' && Array.isArray(obj.inputs) && obj.inputs.length === 2) {
      const [a, b] = obj.inputs as Array<Record<string, unknown>>;
      const aIsRef = a && a.prime === 'reference' && a.field === fieldName;
      const bIsRef = b && b.prime === 'reference' && b.field === fieldName;
      const aIsConst = a && a.prime === 'constant' && typeof a.value === 'number';
      const bIsConst = b && b.prime === 'constant' && typeof b.value === 'number';
      if (aIsRef && bIsConst) constants.push(b.value as number);
      else if (bIsRef && aIsConst) constants.push(a.value as number);
      // Fall through and recurse — inputs may also contain compares (e.g.
      // `compare(eq, arithmetic(...), constant)`) that we shouldn't miss.
    }

    if (Array.isArray(obj.inputs)) {
      for (const child of obj.inputs) walk(child);
    }
    if (obj.downstream) walk(obj.downstream);
    if (obj.condition) walk(obj.condition);
    if (obj.then) walk(obj.then);
    if (obj.else) walk(obj.else);
  };
  walk(node);

  if (constants.length === 0) return null;
  return { min: Math.min(...constants), max: Math.max(...constants) };
}

/**
 * OB-200 Phase 2: extract LLM-emitted scale metadata for a referenced field.
 * Walks the DAG looking for compare nodes whose inputs are
 * (reference(fieldName), constant{meta:{unit,scale,confidence}}) — the
 * canonical pattern produced by prime-grammar's SCALE METADATA convention.
 * Returns the first non-null meta found for the field (the LLM should emit
 * a consistent scale across all thresholds for one field). When metadata
 * is present, convergence consumes it directly and skips the ratio-vs-
 * percentage trial in scoreColumnForRequirement. When absent, the HF-243
 * extractExpectedRangeFromDAG fallback infers scale from threshold
 * distribution — backward compatible with trees emitted before OB-200.
 */
export function extractScaleMetadataFromDAG(
  node: unknown,
  fieldName: string,
): { unit: string; scale: number; confidence: number } | null {
  if (!node || typeof node !== 'object') return null;
  let found: { unit: string; scale: number; confidence: number } | null = null;

  const walk = (n: unknown): void => {
    if (found || !n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    const prime = typeof obj.prime === 'string' ? obj.prime : null;

    if (prime === 'compare' && Array.isArray(obj.inputs) && obj.inputs.length === 2) {
      const [a, b] = obj.inputs as Array<Record<string, unknown>>;
      const aIsRef = a && a.prime === 'reference' && a.field === fieldName;
      const bIsRef = b && b.prime === 'reference' && b.field === fieldName;
      const aMeta = a && a.prime === 'constant' && a.meta && typeof a.meta === 'object' ? a.meta as Record<string, unknown> : null;
      const bMeta = b && b.prime === 'constant' && b.meta && typeof b.meta === 'object' ? b.meta as Record<string, unknown> : null;
      if (aIsRef && bMeta && typeof bMeta.scale === 'number') {
        found = {
          unit: typeof bMeta.unit === 'string' ? bMeta.unit : 'ratio',
          scale: bMeta.scale,
          confidence: typeof bMeta.confidence === 'number' ? bMeta.confidence : 0.9,
        };
        return;
      }
      if (bIsRef && aMeta && typeof aMeta.scale === 'number') {
        found = {
          unit: typeof aMeta.unit === 'string' ? aMeta.unit : 'ratio',
          scale: aMeta.scale,
          confidence: typeof aMeta.confidence === 'number' ? aMeta.confidence : 0.9,
        };
        return;
      }
    }

    if (Array.isArray(obj.inputs)) {
      for (const child of obj.inputs) walk(child);
    }
    if (obj.downstream) walk(obj.downstream);
    if (obj.condition) walk(obj.condition);
    if (obj.then) walk(obj.then);
    if (obj.else) walk(obj.else);
  };
  walk(node);
  return found;
}

// ──────────────────────────────────────────────
// HF-281 — Convergence binding completeness
// ──────────────────────────────────────────────
//
// A component binding is complete only if it maps every token the component's
// intent requires. The binding phase succeeds only if every component binding of
// every variant group is complete. These pure helpers compute the predicate
//   requiredTokens(componentIntent) ⊆ mappedTokens(componentBinding)
// from STRUCTURE only (Decision 154 / AUD-009): requiredTokens are the intent's
// DAG reference fields (extractInputRequirements — already the binding-time
// requirement source); mappedTokens are the binding roles that resolved to a real
// column. No field/component/tenant literals, no token-name patterns; names appear
// only as display data in the surfaced failure. Every cause of a miss (silent gap,
// failed-marker, requirements-omitted) is incomplete identically — no registry.

export interface IncompleteBinding {
  /** Binding key (component_<index>) — the key calc reads. */
  componentKey: string;
  /** Display data: the component's name (from the plan). */
  componentName: string;
  /** Display data: the variant group (variantId) the component belongs to. */
  variantId?: string;
  /** The intent-required tokens with no resolved binding entry. */
  missingTokens: string[];
}

/**
 * The tokens a component's intent requires at bind time — its DAG reference
 * fields. Wraps extractInputRequirements (the same structural read the binding
 * assembly uses), deduped. Exported for deterministic unit testing.
 */
export function requiredTokensForComponent(component: PlanComponent): string[] {
  const seen = new Set<string>();
  for (const req of extractInputRequirements(component)) {
    if (req.metricField && req.metricField !== 'unknown') seen.add(req.metricField);
  }
  return Array.from(seen);
}

// OB-216 §GC-2: the NEEDED structural type for a requirement field, derived from how the field is
// USED in the component's calculationIntent — over the FULL structuralType space, not a binary.
export type NeededType = 'numeric' | 'categorical' | 'temporal' | 'identifier';

// Acceptable column structuralTypes for each needed-type (used by binding validation, §2-S5).
// 'categorical' deliberately also accepts numeric columns (a filter/compare can read a measure);
// the asymmetry that matters is: a NUMERIC need must NOT bind a non-numeric attribute.
export function acceptableStructuralTypes(needed: NeededType): Set<string> {
  switch (needed) {
    case 'numeric': return new Set(['measure', 'count']);
    case 'categorical': return new Set(['attribute', 'measure', 'count', 'name']);
    case 'temporal': return new Set(['temporal']);
    case 'identifier': return new Set(['identifier', 'reference_key']);
  }
}

/**
 * Derive a requirement field's NEEDED structural type by walking the component's calculationIntent
 * AST and classifying the field's USAGE CONTEXT. Korean Test (E910): branches ONLY on operation /
 * prime types (arithmetic, aggregate, compare, conditional, temporal, join…), NEVER on a
 * column-name literal or language string. No developer threshold.
 *   - under an arithmetic op (multiply/subtract/divide/add) or an aggregate (sum/avg/min/max/count) → 'numeric'
 *   - under a compare / conditional / filter / gate context                                          → 'categorical' (attribute-OK)
 *   - under a temporal / date / period context                                                      → 'temporal'
 *   - as a join / grouping / lookup key                                                              → 'identifier'
 *   - bare reference with no qualifying context                                                      → 'numeric' (dominant kind)
 */
export function deriveNeededType(field: string, calculationIntent: unknown): NeededType {
  const ARITH_PRIME = new Set(['arithmetic', 'aggregate']);
  const ARITH_OP = new Set(['multiply', 'subtract', 'divide', 'add', 'sum', 'avg', 'average', 'mean', 'min', 'max']);
  // 'count' is type-agnostic: counting rows by a field works for ANY structuralType (count of
  // verified-flag rows, count of categories, count of ids). So count → categorical (permissive),
  // NOT numeric — distinct from sum/avg/min/max which require a numeric measure.
  const CMP = new Set(['compare', 'conditional', 'conditional_gate', 'gate', 'filter', 'predicate']);
  const TEMPORAL = new Set(['temporal', 'date', 'period', 'prior_period']);
  const IDKEY = new Set(['join', 'group', 'grouping', 'groupby', 'lookup', 'key', 'reference_join']);

  const classify = (prime?: string, op?: string): NeededType | null => {
    const p = (prime || '').toLowerCase();
    const o = (op || '').toLowerCase();
    if (o === 'count') return 'categorical';
    if (ARITH_PRIME.has(p) || ARITH_OP.has(o)) return 'numeric';
    if (CMP.has(p) || CMP.has(o)) return 'categorical';
    if (TEMPORAL.has(p) || TEMPORAL.has(o)) return 'temporal';
    if (IDKEY.has(p) || IDKEY.has(o)) return 'identifier';
    return null;
  };

  const found = new Set<NeededType>();
  const walk = (node: unknown, ctx: NeededType | null): void => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const prime = typeof obj.prime === 'string' ? obj.prime : undefined;
    const op = typeof obj.op === 'string' ? obj.op : undefined;
    // A node that directly names the field is a usage site (covers both `prime:'reference',field`
    // and `prime:'aggregate',op:'sum',field`). Its kind = its own classification, else enclosing ctx.
    if (typeof obj.field === 'string' && obj.field === field) {
      found.add(classify(prime, op) ?? ctx ?? 'numeric');
      return;
    }
    const childCtx = classify(prime, op) ?? ctx;
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) v.forEach(x => walk(x, childCtx));
      else if (v && typeof v === 'object') walk(v, childCtx);
    }
  };
  walk(calculationIntent, null);

  // A field used numerically ANYWHERE must be numeric (a measure also serves a compare). Otherwise
  // take the most specific structural need observed.
  if (found.has('numeric')) return 'numeric';
  if (found.has('identifier')) return 'identifier';
  if (found.has('temporal')) return 'temporal';
  if (found.has('categorical')) return 'categorical';
  return 'numeric';
}

// OB-216 §2-S3: a binding candidate column, LABELED with its sheet (partitionKey) and role tags.
// The sheet label is the discriminator the old unlabeled cross-sheet measure pool lacked (DIAG-073).
type LabeledCandidate = {
  column: string;
  partitionKey: string;        // structural sheet identity
  structuralType: string;
  contextualIdentity: string;
  fi: FieldIdentity;
  stats?: ColumnValueStats;
  batchId: string;
};

// OB-216 §2-S4: one field's LLM binding proposal — a resolved column on a named sheet with a
// confidence, OR an explicit abstention (insufficient evidence). Optional categorical filters.
type BindingProposal =
  | { column: string; partitionKey: string; confidence: number; filters: ColumnMappingFilter[]; reduction: ReductionKind }
  | { abstain: true; reason: string };

// OB-216 §2-S4: ONE LLM binding pass over the labeled candidate set. Returns a proposal per field —
// {column, sheet, confidence} or {abstain, reason}. No measure-only pool, no developer threshold,
// no column-name literal in the prompt. Sheet labels are OPAQUE (S1..Sn): the LLM discriminates by
// each candidate's columns / structuralType / range, never by sheet-name meaning (Korean Test).
async function recognizeBindingsViaAI(
  components: PlanComponent[],
  allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }>,
  labeledCandidates: LabeledCandidate[],
  metricComprehension: MetricComprehensionSignal[] = [],
): Promise<Record<string, BindingProposal>> {
  const metricFields = Array.from(new Set(allRequirements.map(r => r.req.metricField).filter(f => f !== 'unknown')));
  if (metricFields.length === 0 || labeledCandidates.length === 0) return {};

  const sheetKeys = Array.from(new Set(labeledCandidates.map(c => c.partitionKey)));
  const labelByKey = new Map<string, string>();
  const keyByLabel = new Map<string, string>();
  sheetKeys.forEach((k, i) => { const lbl = `S${i + 1}`; labelByKey.set(k, lbl); keyByLabel.set(lbl, k); });

  // Per-metric semantic intent (HF-199 D2): plan-agent intent is authoritative context.
  const intentByField = new Map<string, { intent: string; inputs: string }>();
  for (const r of allRequirements) {
    const ownerComp = components.find(c => c.name === r.compName);
    const matchedSignal = metricComprehension.find(sig => {
      const sv = sig.signal_value as Record<string, unknown> | null;
      const sigLabel = (sv?.metric_label as string | undefined) ?? '';
      return sigLabel === r.compName || sigLabel === ownerComp?.name;
    });
    if (matchedSignal) {
      const sv = (matchedSignal.signal_value ?? {}) as Record<string, unknown>;
      const intent = (sv.semantic_intent as string | undefined) ?? '';
      const inputs = sv.metric_inputs ? JSON.stringify(sv.metric_inputs).slice(0, 200) : '';
      if (intent || inputs) intentByField.set(r.req.metricField, { intent, inputs });
    }
  }
  const roleByField = new Map<string, string>();
  for (const r of allRequirements) if (!roleByField.has(r.req.metricField)) roleByField.set(r.req.metricField, r.req.role);

  const fieldList = metricFields.map((f, i) => {
    const ctx = intentByField.get(f);
    const parts = [`${i + 1}. field "${f}" (role: ${roleByField.get(f) ?? 'value'})`];
    if (ctx?.intent) parts.push(`   plan intent: ${ctx.intent}`);
    if (ctx?.inputs) parts.push(`   plan inputs: ${ctx.inputs}`);
    return parts.join('\n');
  }).join('\n');

  const bySheet = new Map<string, LabeledCandidate[]>();
  for (const c of labeledCandidates) {
    const lbl = labelByKey.get(c.partitionKey)!;
    if (!bySheet.has(lbl)) bySheet.set(lbl, []);
    bySheet.get(lbl)!.push(c);
  }
  const candidateList = Array.from(bySheet.entries()).map(([lbl, cols]) => {
    const lines = cols.map(c => {
      const s = c.stats;
      const range = s ? ` [min=${s.min}, max=${s.max}, mean=${s.mean.toFixed(2)}]` : '';
      return `    - "${c.column}" (type=${c.structuralType}, identity=${c.contextualIdentity})${range}`;
    });
    return `  SHEET ${lbl}:\n${lines.join('\n')}`;
  }).join('\n');

  const userPrompt = `REQUIRED FIELDS:
${fieldList}

CANDIDATE COLUMNS (grouped by sheet; each labeled with structural type, contextual identity, value range):
${candidateList}

For each required field above, return {"column","sheet","confidence","reduction"} choosing "column" and "sheet" strictly from the candidates listed, or {"abstain":true,"reason"} when no candidate is a sound fit.

"reduction" = HOW this column's MULTIPLE ROWS for one entity over the period collapse to ONE value for this field's role:
- "sum": a FLOW / per-transaction amount — each row is a distinct event to add up (e.g. an amount collected per transaction).
- "snapshot": a STOCK / balance / point-in-time value that is THE SAME on every row of the entity (a running balance, an assigned quota). Take it ONCE — NEVER sum it (summing multiplies it by the row count).
- "max" / "min" / "average": when the field's role calls for the peak / floor / mean over the period.
- "last" / "first": the latest / earliest value. "distinct_count": the count of distinct values.
Infer it from the column's contextual identity (an "...balance"/"outstanding" reads as a stock → "snapshot"; an "amount_collected"/per-event amount reads as a flow → "sum") and the field's role in the plan intent. Default to "sum" only when it is genuinely a flow.`;

  try {
    const aiService = getAIService();
    const response = await aiService.execute({
      task: 'convergence_mapping',
      input: { userMessage: userPrompt },
      options: { maxTokens: 900, responseFormat: 'json' as const },
    }, false);
    const result = response.result as Record<string, unknown>;
    const validCols = new Set(labeledCandidates.map(c => `${c.partitionKey} ${c.column}`));
    const validOps: ColumnMappingFilterOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'];
    const proposals: Record<string, BindingProposal> = {};
    for (const [field, val] of Object.entries(result)) {
      if (!val || typeof val !== 'object') continue;
      const obj = val as Record<string, unknown>;
      if (obj.abstain === true) { proposals[field] = { abstain: true, reason: String(obj.reason ?? 'unspecified') }; continue; }
      const col = typeof obj.column === 'string' ? obj.column : undefined;
      const lbl = typeof obj.sheet === 'string' ? obj.sheet : undefined;
      const pk = lbl ? keyByLabel.get(lbl) : undefined;
      if (!col || !pk || !validCols.has(`${pk} ${col}`)) continue; // column must exist in the named sheet
      const conf = typeof obj.confidence === 'number' ? obj.confidence : 0.5;
      const filters: ColumnMappingFilter[] = Array.isArray(obj.filters)
        ? (obj.filters as Array<Record<string, unknown>>)
            .filter(f => typeof f.field === 'string' && f.value != null)
            .map(f => ({
              field: String(f.field),
              operator: (typeof f.operator === 'string' && (validOps as string[]).includes(f.operator)) ? f.operator as ColumnMappingFilterOperator : 'eq',
              value: f.value as string | number | boolean,
            }))
        : [];
      const validReductions = ['sum', 'snapshot', 'last', 'first', 'max', 'min', 'average', 'distinct_count'];
      const reduction: ReductionKind = (typeof obj.reduction === 'string' && validReductions.includes(obj.reduction)) ? obj.reduction as ReductionKind : 'sum';
      proposals[field] = { column: col, partitionKey: pk, confidence: conf, filters, reduction };
    }
    const summary = Object.entries(proposals).map(([k, v]) => 'abstain' in v ? `${k}:ABSTAIN` : `${k}->${v.column}@${labelByKey.get(v.partitionKey)}/${v.reduction}`).join(', ');
    console.log(`[Convergence] OB-216 §2-S4 LLM binding proposals: {${summary}}`);
    return proposals;
  } catch (err) {
    console.error('[Convergence] OB-216 §2-S4 LLM binding failed:', err);
    return {};
  }
}

/**
 * The tokens a component binding actually RESOLVED — roles whose entry carries a
 * real column and was not rejected (match_pass !== 'failed'). A token that is
 * absent OR present only as a match_pass:'failed' marker is NOT mapped.
 */
export function mappedTokensForBinding(binding: Record<string, ComponentBinding> | undefined): Set<string> {
  const out = new Set<string>();
  if (!binding) return out;
  for (const [role, entry] of Object.entries(binding)) {
    if (entry && typeof entry.column === 'string' && entry.column.length > 0 && entry.match_pass !== 'failed') {
      out.add(role);
    }
  }
  return out;
}

/**
 * Completeness gate over a full binding set. For every component of every variant
 * group, assert requiredTokens ⊆ mappedTokens. Returns one IncompleteBinding per
 * component that is missing any required token (empty array ⇒ the binding phase is
 * complete and calc may proceed). `componentsJson` is rule_sets.components (the
 * variant-grouped engine format); `convergenceBindings` is
 * input_bindings.convergence_bindings (keyed component_<index>).
 */
export function findIncompleteBindings(
  componentsJson: unknown,
  convergenceBindings: Record<string, Record<string, ComponentBinding>> | undefined | null,
): IncompleteBinding[] {
  const bindings = convergenceBindings ?? {};
  const out: IncompleteBinding[] = [];
  for (const component of extractComponents(componentsJson)) {
    const required = requiredTokensForComponent(component);
    if (required.length === 0) continue; // nothing to map (DD-7: unchanged)
    const componentKey = `component_${component.index}`;
    const mapped = mappedTokensForBinding(bindings[componentKey]);
    const missing = required.filter(t => !mapped.has(t));
    if (missing.length > 0) {
      out.push({ componentKey, componentName: component.name, variantId: component.variantId, missingTokens: missing });
    }
  }
  return out;
}

function extractInputRequirements(component: PlanComponent): ComponentInputRequirement[] {
  const intent = component.calculationIntent;
  if (!intent) return [{ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: null }];

  // HF-242: prime_dag components carry a PrimeNode tree under
  // calculationIntent (discriminator key `prime`) instead of the legacy
  // `operation` shape. Walk the DAG to collect every reference field — each
  // becomes a requirement whose `role` IS the field name so the binding
  // entry is keyed by field name (vs. legacy role names like 'actual' /
  // 'row' / 'column'). This makes the AI column-mapping prompt receive
  // the actual metric names the DAG will read, instead of an empty list.
  const compType = (component as unknown as { componentType?: string }).componentType;
  const isPrimeDag = compType === 'prime_dag'
    || (typeof (intent as Record<string, unknown>).prime === 'string');
  if (isPrimeDag) {
    const refs = extractReferencesFromDAG(intent);
    if (refs.length === 0) {
      return [{ role: 'actual', metricField: 'unknown', expectedRange: null }];
    }
    // HF-243: per-field expectedRange recovered from the DAG's compare
    // constants. Drives scoreColumnForRequirement's existing ratio/percentage
    // scale inference identically to how extractRangeFromBoundaries drove it
    // for legacy bounded_lookup_1d/2d intents. No new code path — the same
    // inference function handles both shapes.
    // OB-200 Phase 2: capture LLM-emitted scale metadata too. When present,
    // scoreColumnForRequirement consumes it directly and skips inference; the
    // HF-243 expectedRange path remains the fallback for trees without meta.
    return refs.map(field => ({
      role: field,
      metricField: field,
      expectedRange: extractExpectedRangeFromDAG(intent, field),
      scaleMetadata: extractScaleMetadataFromDAG(intent, field) ?? undefined,
    }));
  }

  const reqs: ComponentInputRequirement[] = [];
  const op = intent.operation as string;

  // Helper to get field name from a sourceSpec
  const getField = (spec: Record<string, unknown> | undefined): string =>
    spec?.field ? String(spec.field).replace(/^metric:/, '') : 'unknown';

  switch (op) {
    case 'bounded_lookup_2d': {
      const inputs = intent.inputs as Record<string, Record<string, unknown>> | undefined;
      const rowRange = extractRangeFromBoundaries(intent.rowBoundaries as Array<Record<string, unknown>> | undefined);
      const colRange = extractRangeFromBoundaries(intent.columnBoundaries as Array<Record<string, unknown>> | undefined);
      if (inputs) {
        const rowSpec = inputs.row?.sourceSpec as Record<string, unknown> | undefined;
        const colSpec = inputs.column?.sourceSpec as Record<string, unknown> | undefined;
        reqs.push({ role: 'row', metricField: getField(rowSpec), expectedRange: rowRange });
        reqs.push({ role: 'column', metricField: getField(colSpec), expectedRange: colRange });
      } else {
        reqs.push({ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: rowRange });
      }
      break;
    }
    case 'bounded_lookup_1d': {
      const range = extractRangeFromBoundaries(intent.boundaries as Array<Record<string, unknown>> | undefined);
      const inputSpec = (intent.input as Record<string, unknown>)?.sourceSpec as Record<string, unknown> | undefined;
      reqs.push({ role: 'actual', metricField: getField(inputSpec), expectedRange: range });
      break;
    }
    case 'scalar_multiply': {
      const input = intent.input as Record<string, unknown> | undefined;

      // Fast path: flat ratio IntentSource (pre-HF-223 shape).
      if (input?.source === 'ratio') {
        const spec = input.sourceSpec as Record<string, unknown> | undefined;
        const num = spec?.numerator ? String(spec.numerator).replace(/^metric:/, '') : 'unknown';
        const den = spec?.denominator ? String(spec.denominator).replace(/^metric:/, '') : 'unknown';
        reqs.push({ role: 'numerator', metricField: num, expectedRange: null });
        reqs.push({ role: 'denominator', metricField: den, expectedRange: null });
        break;
      }

      // Fast path: flat metric IntentSource.
      if (typeof input?.source === 'string') {
        const spec = input.sourceSpec as Record<string, unknown> | undefined;
        reqs.push({ role: 'actual', metricField: getField(spec), expectedRange: null });
        break;
      }

      // HF-224: Nested IntentOperation input (e.g. HF-223 conditional_gate-wrapped ratio).
      // Walk every operation child until leaf IntentSources are found, then pick
      // the ratio leaf (preferred) or the first metric leaf.
      if (input && typeof input.operation === 'string') {
        const leaves = extractLeafSources(input);
        const ratioLeaf = leaves.find(l => l.source === 'ratio');
        if (ratioLeaf) {
          const spec = ratioLeaf.sourceSpec;
          const num = spec?.numerator ? String(spec.numerator).replace(/^metric:/, '') : 'unknown';
          const den = spec?.denominator ? String(spec.denominator).replace(/^metric:/, '') : 'unknown';
          reqs.push({ role: 'numerator', metricField: num, expectedRange: null });
          reqs.push({ role: 'denominator', metricField: den, expectedRange: null });
          break;
        }
        const firstLeaf = leaves[0];
        if (firstLeaf) {
          reqs.push({ role: 'actual', metricField: getField(firstLeaf.sourceSpec), expectedRange: null });
          break;
        }
      }

      reqs.push({ role: 'actual', metricField: 'unknown', expectedRange: null });
      break;
    }
    case 'conditional_gate': {
      const condLeft = (intent.condition as Record<string, unknown>)?.left as Record<string, unknown> | undefined;
      const spec = condLeft?.sourceSpec as Record<string, unknown> | undefined;
      reqs.push({ role: 'actual', metricField: getField(spec), expectedRange: null });
      break;
    }
    case 'piecewise_linear': {
      // OB-185: piecewise_linear has ratioInput (numerator/denominator) and baseInput
      const ratioIn = intent.ratioInput as Record<string, unknown> | undefined;
      const baseIn = intent.baseInput as Record<string, unknown> | undefined;
      const ratioSpec = ratioIn?.sourceSpec as Record<string, unknown> | undefined;
      const baseSpec = baseIn?.sourceSpec as Record<string, unknown> | undefined;
      if (ratioSpec?.numerator) reqs.push({ role: 'numerator', metricField: String(ratioSpec.numerator).replace(/^metric:/, ''), expectedRange: null });
      if (ratioSpec?.denominator) reqs.push({ role: 'denominator', metricField: String(ratioSpec.denominator).replace(/^metric:/, ''), expectedRange: null });
      if (baseSpec?.field) reqs.push({ role: 'actual', metricField: getField(baseSpec), expectedRange: null });
      break;
    }
    case 'linear_function': {
      // OB-185: linear_function has single input
      const lfInput = intent.input as Record<string, unknown> | undefined;
      const lfSpec = lfInput?.sourceSpec as Record<string, unknown> | undefined;
      reqs.push({ role: 'actual', metricField: getField(lfSpec), expectedRange: null });
      break;
    }
    default:
      reqs.push({ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: null });
  }

  return reqs;
}

function extractRangeFromBoundaries(
  boundaries: Array<Record<string, unknown>> | undefined
): { min: number; max: number } | null {
  if (!boundaries || boundaries.length === 0) return null;
  const first = boundaries[0];
  const last = boundaries[boundaries.length - 1];
  const minVal = (first.min as number) ?? 0;
  const maxVal = (last.max as number) ?? (last.min as number) * 2;
  if (typeof minVal !== 'number' || typeof maxVal !== 'number') return null;
  return { min: minVal, max: maxVal };
}

// ──────────────────────────────────────────────
// HF-111: Score a column against a component requirement
// Korean Test compliant: matches on value distribution vs boundary range
// ──────────────────────────────────────────────

function scoreColumnForRequirement(
  columnName: string,
  stats: ColumnValueStats,
  requirement: ComponentInputRequirement,
): { score: number; scaleFactor: number } {
  // HF-244 Phase 1: scale mutual exclusion. When the LLM has emitted scale
  // metadata for this field (constant.meta on compare nodes), the evaluator's
  // compare case (intent-executor.ts) applies meta.scale at evaluate() time.
  // Convergence MUST NOT also scale, otherwise data is scaled twice (live
  // BCL evidence: cumplimiento_depositos 1.282 × 100 (convergence scale_factor)
  // × 100 (evaluator meta.scale) = 12820 vs constant(130) → always true).
  //
  // Use the LLM-emitted scale ONLY for scoring (does the column's stat
  // distribution × scale fit the expectedRange?), then return scaleFactor=1 so
  // the resulting binding carries no scale_factor (the generateAllComponentBindings
  // shape spreads scale_factor only when !== 1).
  //
  // The HF-243 trial path below remains the deterministic fallback for legacy
  // trees emitted without meta — those get scale_factor on the binding because
  // there is no evaluator-side scaling for them.
  if (requirement.scaleMetadata && typeof requirement.scaleMetadata.scale === 'number') {
    const scale = requirement.scaleMetadata.scale;
    if (requirement.expectedRange) {
      const { min: expMin, max: expMax } = requirement.expectedRange;
      if (expMax > expMin) {
        const scaledMin = stats.min * scale;
        const scaledMax = stats.max * scale;
        const overlapMin = Math.max(scaledMin, expMin);
        const overlapMax = Math.min(scaledMax, expMax);
        const overlap = Math.max(0, overlapMax - overlapMin);
        const boundarySpan = expMax - expMin;
        const fit = boundarySpan > 0 ? overlap / boundarySpan : 0.5;
        return { score: Math.max(0.5, fit), scaleFactor: 1 };
      }
    }
    // No expectedRange to score against; scale metadata is authoritative for
    // the evaluator, but the binding still gets scaleFactor=1.
    return { score: 0.6, scaleFactor: 1 };
  }

  if (!requirement.expectedRange) {
    // No boundaries to match — return baseline score
    return { score: 0.1, scaleFactor: 1 };
  }

  const { min: expMin, max: expMax } = requirement.expectedRange;
  if (expMax <= expMin) return { score: 0.1, scaleFactor: 1 };

  let bestScore = 0;
  let bestScale = 1;

  // Try multiple scale factors: raw, ×100 (ratio→percentage), ×1000
  const scales = [1, 100];
  for (const scale of scales) {
    const scaledMin = stats.min * scale;
    const scaledMax = stats.max * scale;

    // Does the scaled column range overlap with the boundary range?
    if (scaledMax >= expMin * 0.5 && scaledMin <= expMax * 2) {
      // Compute fit ratio: how well does the column's range fit within the boundary range?
      const overlapMin = Math.max(scaledMin, expMin);
      const overlapMax = Math.min(scaledMax, expMax);
      const overlap = Math.max(0, overlapMax - overlapMin);
      const boundarySpan = expMax - expMin;
      const columnSpan = scaledMax - scaledMin;

      // Good fit: column values span a meaningful portion of the boundary range
      // but don't wildly exceed it
      const coverageRatio = boundarySpan > 0 ? overlap / boundarySpan : 0;
      const excessRatio = columnSpan > 0 && boundarySpan > 0
        ? Math.min(1, boundarySpan / columnSpan)  // Penalize columns much wider than boundaries
        : 0.5;

      const fitScore = coverageRatio * 0.6 + excessRatio * 0.4;
      if (fitScore > bestScore) {
        bestScore = fitScore;
        bestScale = scale;
      }
    }
  }

  return { score: bestScore, scaleFactor: bestScale };
}

// ──────────────────────────────────────────────
// HF-115: Value Distribution Profiling + Scale Inference
// ──────────────────────────────────────────────

export interface ColumnDistribution {
  column: string;
  min: number;
  max: number;
  median: number;
  p25: number;
  p75: number;
  distinctCount: number;
  nullCount: number;
  sampleSize: number;
  scaleInference: 'ratio_0_1' | 'percentage_0_100' | 'integer_count' | 'integer_hundreds' | 'currency_large' | 'unknown';
}

export function profileColumnDistribution(
  committedData: Array<Record<string, unknown>>,
  columnName: string,
): ColumnDistribution {
  const values: number[] = [];
  let nullCount = 0;

  for (const row of committedData) {
    const rowData = row.row_data as Record<string, unknown> | undefined;
    const val = rowData?.[columnName];
    if (val === null || val === undefined || val === '') {
      nullCount++;
    } else {
      const num = Number(val);
      if (!isNaN(num)) values.push(num);
      else nullCount++;
    }
  }

  values.sort((a, b) => a - b);
  const n = values.length;

  const median = n === 0 ? 0 : n % 2 === 1 ? values[Math.floor(n / 2)] : (values[n / 2 - 1] + values[n / 2]) / 2;
  const p25 = n === 0 ? 0 : values[Math.floor(n * 0.25)];
  const p75 = n === 0 ? 0 : values[Math.floor(n * 0.75)];
  const min = n === 0 ? 0 : values[0];
  const max = n === 0 ? 0 : values[n - 1];
  const distinctCount = new Set(values).size;

  // Scale inference — structural heuristics (Korean Test compliant)
  let scaleInference: ColumnDistribution['scaleInference'] = 'unknown';
  if (n > 0) {
    const allNonNeg = min >= 0;
    const allIntegers = values.every(v => Number.isInteger(v));

    if (allNonNeg && max <= 1.5) {
      scaleInference = 'ratio_0_1';
    } else if (allNonNeg && max <= 150 && min < 1.5) {
      scaleInference = 'percentage_0_100';
    } else if (allNonNeg && allIntegers && max <= 50) {
      scaleInference = 'integer_count';
    } else if (allNonNeg && max > 50 && max <= 10000) {
      scaleInference = 'integer_hundreds';
    } else if (max > 10000) {
      scaleInference = 'currency_large';
    }
  }

  return {
    column: columnName,
    min, max, median, p25, p75,
    distinctCount, nullCount,
    sampleSize: n,
    scaleInference,
  };
}

function inferScale(stats: ColumnValueStats): ColumnDistribution['scaleInference'] {
  if (stats.sampleCount === 0) return 'unknown';
  const allNonNeg = stats.min >= 0;
  if (allNonNeg && stats.max <= 1.5) return 'ratio_0_1';
  if (allNonNeg && stats.max <= 150 && stats.min < 1.5) return 'percentage_0_100';
  if (allNonNeg && stats.max <= 50) return 'integer_count';
  if (allNonNeg && stats.max > 50 && stats.max <= 10000) return 'integer_hundreds';
  if (stats.max > 10000) return 'currency_large';
  return 'unknown';
}

// ──────────────────────────────────────────────
// HF-115: Cross-Component Plausibility Check
// Detects scale anomalies by comparing sample results across components
// ──────────────────────────────────────────────

interface PlausibilityResult {
  componentIndex: number;
  componentName: string;
  sampleResult: number;
  medianPeerResult: number;
  ratioToMedian: number;
  isAnomaly: boolean;
  anomalyType?: 'scale_mismatch' | 'rate_outlier' | 'binding_misalignment' | 'unknown';
  // HF-196 Phase 1G Path α (HF-203): architectural inversion — ratio>10 vs peer median is binding
  // misalignment evidence, not magnitude error. Reject binding (mark match_pass='failed') and
  // surface convergence gap; do NOT patch scale_factor.
  proposedAction?: {
    type: 'binding_rejection';
    rejectedColumn: string;
    bindingRole: string;
    rationale: string;
  };
}

function estimateSampleResult(
  component: PlanComponent,
  compBindings: Record<string, ComponentBinding>,
  distributions: Record<string, ColumnDistribution>,
): number {
  const intent = component.calculationIntent;
  const op = (intent?.operation || component.calculationOp) as string;

  switch (op) {
    case 'scalar_multiply': {
      const rate = component.calculationRate ?? (intent?.rate as number | undefined) ?? 0;
      if (rate === 0) return 0;

      // Ratio input (numerator/denominator)
      const numBinding = compBindings.numerator;
      const denBinding = compBindings.denominator;
      if (numBinding && denBinding) {
        const numDist = distributions[numBinding.column];
        const denDist = distributions[denBinding.column];
        if (numDist && denDist && denDist.median !== 0) {
          let ratio = numDist.median / denDist.median;
          if (numBinding.scale_factor) ratio = (numDist.median * numBinding.scale_factor) / denDist.median;
          if (denBinding.scale_factor) ratio = numDist.median / (denDist.median * denBinding.scale_factor);
          return rate * ratio;
        }
        return 0;
      }

      // Single input
      const actualBinding = compBindings.actual;
      if (actualBinding) {
        const dist = distributions[actualBinding.column];
        if (dist) {
          let value = dist.median;
          if (actualBinding.scale_factor) value *= actualBinding.scale_factor;
          return rate * value;
        }
      }
      return 0;
    }

    case 'bounded_lookup_1d': {
      const actualBinding = compBindings.actual;
      if (!actualBinding) return 0;
      const dist = distributions[actualBinding.column];
      if (!dist) return 0;

      let value = dist.median;
      if (actualBinding.scale_factor) value *= actualBinding.scale_factor;

      // Find which tier the median falls in
      const boundaries = intent?.boundaries as Array<Record<string, unknown>> | undefined;
      if (boundaries) {
        for (const tier of boundaries) {
          const min = (tier.min as number) ?? -Infinity;
          const max = (tier.max as number) ?? Infinity;
          if (value >= min && value <= max) {
            return (tier.value as number) ?? (tier.payout as number) ?? 0;
          }
        }
      }

      // Fallback: check tierConfig
      const tierConfig = intent?.tierConfig as Record<string, unknown> | undefined;
      const tiers = tierConfig?.tiers as Array<Record<string, unknown>> | undefined;
      if (tiers) {
        for (const tier of tiers) {
          const min = (tier.min as number) ?? -Infinity;
          const max = (tier.max as number) ?? Infinity;
          if (value >= min && value <= max) {
            return (tier.value as number) ?? 0;
          }
        }
      }
      return 0;
    }

    case 'bounded_lookup_2d': {
      const rowBinding = compBindings.row;
      const colBinding = compBindings.column;
      if (!rowBinding || !colBinding) return 0;

      const rowDist = distributions[rowBinding.column];
      const colDist = distributions[colBinding.column];
      if (!rowDist || !colDist) return 0;

      let rowValue = rowDist.median;
      let colValue = colDist.median;
      if (rowBinding.scale_factor) rowValue *= rowBinding.scale_factor;
      if (colBinding.scale_factor) colValue *= colBinding.scale_factor;

      const rowBounds = intent?.rowBoundaries as Array<Record<string, unknown>> | undefined;
      const colBounds = intent?.columnBoundaries as Array<Record<string, unknown>> | undefined;
      const outputGrid = intent?.outputGrid as number[][] | undefined;

      if (!rowBounds || !colBounds || !outputGrid) return 0;

      let rowIdx = -1;
      for (let i = 0; i < rowBounds.length; i++) {
        const min = (rowBounds[i].min as number) ?? -Infinity;
        const max = (rowBounds[i].max as number) ?? Infinity;
        if (rowValue >= min && rowValue <= max) { rowIdx = i; break; }
      }
      let colIdx = -1;
      for (let i = 0; i < colBounds.length; i++) {
        const min = (colBounds[i].min as number) ?? -Infinity;
        const max = (colBounds[i].max as number) ?? Infinity;
        if (colValue >= min && colValue <= max) { colIdx = i; break; }
      }

      return (rowIdx >= 0 && colIdx >= 0) ? (outputGrid[rowIdx]?.[colIdx] ?? 0) : 0;
    }

    case 'conditional_gate': {
      const actualBinding = compBindings.actual;
      if (!actualBinding) return 0;
      const dist = distributions[actualBinding.column];
      if (!dist) return 0;

      // Gates typically return a fixed payout or 0. Estimate using the gate's payout value.
      const onTrue = intent?.onTrue as Record<string, unknown> | undefined;
      const payoutValue = (onTrue?.value as number) ?? (onTrue?.rate as number) ?? 0;
      return payoutValue;
    }

    default:
      return 0;
  }
}

function checkCalculationPlausibility(
  components: PlanComponent[],
  componentBindings: Record<string, Record<string, ComponentBinding>>,
  distributions: Record<string, ColumnDistribution>,
): PlausibilityResult[] {
  const results: PlausibilityResult[] = [];

  for (const comp of components) {
    const compKey = `component_${comp.index}`;
    const cb = componentBindings[compKey];
    if (!cb) continue;

    const sampleResult = estimateSampleResult(comp, cb, distributions);
    results.push({
      componentIndex: comp.index,
      componentName: comp.name,
      sampleResult,
      medianPeerResult: 0,  // filled below
      ratioToMedian: 0,
      isAnomaly: false,
    });
  }

  // Cross-component comparison
  const nonZeroResults = results.filter(r => r.sampleResult > 0);
  if (nonZeroResults.length < 2) return results;

  const sortedValues = nonZeroResults.map(r => r.sampleResult).sort((a, b) => a - b);
  const mid = Math.floor(sortedValues.length / 2);
  const medianResult = sortedValues.length % 2 === 1
    ? sortedValues[mid]
    : (sortedValues[mid - 1] + sortedValues[mid]) / 2;

  for (const result of results) {
    result.medianPeerResult = medianResult;
    if (result.sampleResult > 0 && medianResult > 0) {
      result.ratioToMedian = result.sampleResult / medianResult;
      if (result.ratioToMedian > 10) {
        // HF-196 Phase 1G Path α (HF-203): ratio>10 vs peer median is evidence of binding
        // misalignment (wrong column bound), NOT magnitude error. Reject binding; surface
        // convergence gap; do NOT patch scale_factor. Auto-correction masks the misalignment
        // as silent-failure mode (Cantidad_Productos_Cruzados defect: ratio=2636.4 →
        // scale_factor=0.001 → engine reads deposits values × 0.001 → plausible-shaped wrong result).
        result.isAnomaly = true;
        result.anomalyType = 'binding_misalignment';

        const comp = components[result.componentIndex];
        const compKey = `component_${comp.index}`;
        const cb = componentBindings[compKey];

        if (cb) {
          // Find which binding role carries the misaligned value
          const bindingRole = cb.numerator ? 'numerator' : cb.actual ? 'actual' : 'row';
          const binding = cb[bindingRole];
          if (binding) {
            result.proposedAction = {
              type: 'binding_rejection',
              rejectedColumn: binding.column,
              bindingRole,
              rationale: `ratio ${result.ratioToMedian.toFixed(1)}x peer median indicates wrong column bound, not wrong scale`,
            };
          }
        }
      }
    }
  }

  // Log all results
  for (const r of results) {
    const status = r.isAnomaly ? 'BINDING MISALIGNMENT' : 'OK';
    console.log(
      `[CONVERGENCE-VALIDATION] Component ${r.componentIndex} (${r.componentName}): ` +
      `sample=${r.sampleResult.toFixed(0)}, median_peer=${r.medianPeerResult.toFixed(0)}, ` +
      `ratio=${r.ratioToMedian.toFixed(1)} — ${status}`
    );
    if (r.proposedAction) {
      console.log(
        `[CONVERGENCE-VALIDATION]   Proposed action: binding_rejection on column "${r.proposedAction.rejectedColumn}" ` +
        `(role=${r.proposedAction.bindingRole}); rationale: ${r.proposedAction.rationale}`
      );
    }
  }

  return results;
}

// ──────────────────────────────────────────────
// HF-112: AI-Assisted Column-to-Metric Mapping
// LLM-Primary, Deterministic Validation, Human Authority
// ──────────────────────────────────────────────

// Check if existing bindings are complete (skip AI call if so)
function hasCompleteBindings(
  existingBindings: Record<string, Record<string, unknown>> | undefined,
  componentCount: number,
): boolean {
  if (!existingBindings) return false;
  const boundComponents = Object.keys(existingBindings).length;
  if (boundComponents < componentCount) return false;
  for (const compBindings of Object.values(existingBindings)) {
    const cb = compBindings as Record<string, { column?: string }>;
    if (!cb.actual?.column && !cb.row?.column && !cb.numerator?.column) return false;
  }
  return true;
}


// HF-227: Return shape of resolveColumnMappingsViaAI. Each metric maps to
// either the column name as a plain string (backward-compatible) or to an
// enriched object carrying the column plus an optional filters array. The
// engine treats the absence of filters and the empty-filters array
// identically (rowMatchesFilters returns true for empty arrays).
// Operator union matches MetricDerivationRule['filters'][number]['operator']
// so the binding can be passed directly to resolveColumnFromBatch without a
// cast — closing the bridge entirely (filters ARE binding state, not
// derived per-call).
export type ColumnMappingFilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
export type ColumnMappingFilter = {
  field: string;
  operator: ColumnMappingFilterOperator;
  value: string | number | boolean;
};
export type ColumnMappingValue = string | { column: string; filters?: ColumnMappingFilter[] };


// ──────────────────────────────────────────────
// HF-112: Generate Per-Component Input Bindings
// AI-Primary column selection + boundary validation + column exclusion
// ──────────────────────────────────────────────

// HF-218 Component 1 — Structural confidence composition (ADR Decision 1: product).
// Returns score in [0,1] computed as cardinality_ratio × intersection_ratio.
// Zero on either axis ⇒ zero score (structural AND). Korean Test compliant: zero
// hardcoded weights, zero domain literals.
export interface StructuralBindingConfidence {
  score: number;
  cardinality_ratio: number;
  intersection_ratio: number;
  distinct_count: number;
  intersection_count: number;
  total_row_count: number;
}

export function computeStructuralBindingConfidence(
  candidateDistinctValues: Set<string>,
  candidateTotalRows: number,
  tenantEntityExternalIds: Set<string>,
): StructuralBindingConfidence {
  const distinctCount = candidateDistinctValues.size;
  const cardinalityRatio = candidateTotalRows > 0 ? distinctCount / candidateTotalRows : 0;
  let intersectionCount = 0;
  if (tenantEntityExternalIds.size > 0) {
    for (const v of Array.from(candidateDistinctValues)) {
      if (tenantEntityExternalIds.has(v)) intersectionCount++;
    }
  }
  const intersectionRatio = distinctCount > 0 && tenantEntityExternalIds.size > 0
    ? intersectionCount / distinctCount
    : 0;
  const score = cardinalityRatio * intersectionRatio;
  return {
    score,
    cardinality_ratio: cardinalityRatio,
    intersection_ratio: intersectionRatio,
    distinct_count: distinctCount,
    intersection_count: intersectionCount,
    total_row_count: candidateTotalRows,
  };
}

// HF-222 Phase 2: distribution-derived distinguishability test.
//
// Replaces HF-218 Component 4b's tenant-adaptive boundary threshold (which carried
// a developer-stated initial-state anchor value and signal-window size — both
// Korean Test violations per AP-25 / IGF-T1-E910). The new test derives its acceptance
// threshold from the candidate distribution itself at the moment of binding;
// no developer-stated numerical constants in foundational binding-gate code.
//
// Properties verified algebraically (and via property-test proof in
// scripts/hf222-phase2-3-distribution-test-proof.ts):
//   - N=0: refuses to bind (empty distribution).
//   - N=1: binds iff score > 0 (substrate eligibility floor: cardinality × intersection
//          > 0 — already a substrate test, not a magnitude threshold).
//   - N=2: binds iff scores differ at all (population stddev = |s1-s0|/2,
//          top-next = |s1-s0|; the comparison holds whenever scores aren't equal).
//   - N>=3: cluster cases (small dispersion relative to top-next gap) refuse to bind;
//           clear-outlier cases bind. Invariant under linear scaling and translation.
export function distinctEnoughToBind(scoredCandidates: Array<{ score: number }>): boolean {
  if (scoredCandidates.length === 0) return false;
  if (scoredCandidates.length === 1) {
    return scoredCandidates[0].score > 0;
  }
  const scores = scoredCandidates.map(c => c.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);
  return scoredCandidates[0].score - scoredCandidates[1].score > stddev;
}

/**
 * HF-275: per-column null-rate over the CALCULATION POPULATION (committed_data rows with
 * entity_id IS NOT NULL — the individual payees; HF-263 grouping/hub rows have entity_id
 * IS NULL and are excluded). Returns columnName → null_rate in [0,1]; a rate of 1 means the
 * column is null on every payee row and genuinely cannot produce a value. Scoped per column
 * to its OWN data batch (so a column absent from other batches is not spuriously counted as
 * null). Bounded paginated read — a sample distinguishes all-null from has-values. Korean
 * Test: operates on the structural presence of values for the passed column names — no
 * column/component/tenant literal.
 */
export async function computeIndividualNullRates(
  supabase: SupabaseClient | undefined,
  columns: Array<{ name: string; batchId: string }>,
): Promise<Map<string, number>> {
  const rates = new Map<string, number>();
  if (!supabase || columns.length === 0) return rates;
  const byBatch = new Map<string, string[]>();
  for (const c of columns) {
    if (!c.batchId) continue;
    if (!byBatch.has(c.batchId)) byBatch.set(c.batchId, []);
    if (!byBatch.get(c.batchId)!.includes(c.name)) byBatch.get(c.batchId)!.push(c.name);
  }
  const PAGE = 1000;
  const PAGE_CEILING = 20; // 20k-row sampling ceiling per batch
  for (const [batchId, cols] of Array.from(byBatch.entries())) {
    const nonNull = new Map<string, number>();
    for (const c of cols) nonNull.set(c, 0);
    let total = 0;
    for (let page = 0; page <= PAGE_CEILING; page++) {
      const from = page * PAGE;
      const { data, error } = await supabase
        .from('committed_data')
        .select('row_data')
        .eq('import_batch_id', batchId)
        .not('entity_id', 'is', null)
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      for (const r of data) {
        total++;
        const rd = (r.row_data as Record<string, unknown> | null) ?? {};
        for (const c of cols) {
          const v = rd[c];
          if (v !== null && v !== undefined && v !== '') nonNull.set(c, (nonNull.get(c) ?? 0) + 1);
        }
      }
      if (data.length < PAGE) break;
    }
    if (total === 0) continue; // no payee rows in this batch → cannot assess → no penalty
    for (const c of cols) rates.set(c, 1 - (nonNull.get(c) ?? 0) / total);
  }
  return rates;
}

async function generateAllComponentBindings(
  components: PlanComponent[],
  matches: BindingMatch[],
  capabilities: DataCapability[],
  bindings: Record<string, Record<string, ComponentBinding>>,
  existingConvergenceBindings: Record<string, Record<string, unknown>> | undefined,
  metricComprehension: MetricComprehensionSignal[] = [], // HF-199 D2: E5 signals threaded through
  // HF-218 Component 1: tenant entity external_id set for binding self-verification.
  // generateAllComponentBindings receives the set so identifier-candidate selection can
  // verify column values against the tenant's registered entities (closes DIAG-042 §2.3
  // structural absence — no value-set intersection check).
  tenantEntityExternalIds: Set<string> = new Set(),
  // HF-218 Component 1: tenantId + supabase needed for (a) per-column distinct-value reads,
  // (b) writeSignal emission for convergence:binding_selection provenance.
  tenantId: string = '',
  supabase?: SupabaseClient,
): Promise<void> {
  // HF-222 Phase 1: HF-218 Component 4b tenant-adaptive boundary threshold block
  // RETIRED (Korean Test violation: developer-stated initial-state anchor value
  // and signal-window size were introduced at HF-218 design lock and reviewed via
  // an unfilled GP-2 citation slot). The boundary-fallback acceptance mechanism
  // is replaced in Phase 2 by a distribution-derived distinguishability test that
  // computes its threshold from the candidate distribution at decision time.
  //
  // The `convergence:dual_path_concordance` signal continues to be emitted by the
  // engine (calculation/run/route.ts) and is classified observation-only per the
  // VG substrate entry T2-E-signal-convergence-dual-path-concordance-observation-only.

  // HF-112: Reuse existing bindings if complete (zero AI cost)
  if (hasCompleteBindings(existingConvergenceBindings, components.length)) {
    console.log('[Convergence] HF-112 Existing bindings complete — reusing (zero AI cost)');
    for (const [compKey, compBindings] of Object.entries(existingConvergenceBindings!)) {
      bindings[compKey] = compBindings as Record<string, ComponentBinding>;
    }
    return;
  }

  // OB-216 §2-S3: labeled, role-aware candidate set from ALL sheet capabilities — not measure-only,
  // not match-scoped. Each column carries its sheet (partitionKey), structuralType, contextualIdentity,
  // and stats. The sheet LABEL is the discriminator the old unlabeled cross-sheet pool lacked
  // (DIAG-073 §2.3). ALL role-bearing columns are candidates (attributes admitted, role-tagged),
  // so an attribute requirement (e.g. a verified-flag) can bind its attribute column.
  const labeledCandidates: LabeledCandidate[] = [];
  const seenCand = new Set<string>();
  for (const cap of capabilities) {
    for (const [colName, fi] of Object.entries(cap.fieldIdentities)) {
      const k = `${cap.partitionKey} ${colName}`;
      if (seenCand.has(k)) continue;
      seenCand.add(k);
      labeledCandidates.push({
        column: colName, partitionKey: cap.partitionKey,
        structuralType: fi.structuralType, contextualIdentity: fi.contextualIdentity,
        fi, stats: cap.columnStats[colName], batchId: cap.batchIds[0] || '',
      });
    }
    // numeric columns with stats but no field identity → inferred measure
    for (const colName of Object.keys(cap.columnStats)) {
      const k = `${cap.partitionKey} ${colName}`;
      if (cap.fieldIdentities[colName] || seenCand.has(k)) continue;
      seenCand.add(k);
      const inferred: FieldIdentity = { structuralType: 'measure', contextualIdentity: 'inferred_numeric', confidence: 0.5 };
      labeledCandidates.push({
        column: colName, partitionKey: cap.partitionKey,
        structuralType: 'measure', contextualIdentity: 'inferred_numeric',
        fi: inferred, stats: cap.columnStats[colName], batchId: cap.batchIds[0] || '',
      });
    }
  }
  if (labeledCandidates.length === 0) return;
  console.log(`[Convergence] OB-216 §2-S3 labeled candidates: ${labeledCandidates.length} columns across ${new Set(labeledCandidates.map(c => c.partitionKey)).size} sheet(s); attributes admitted=[${labeledCandidates.filter(c => c.structuralType === 'attribute').map(c => c.column).join(', ') || 'none'}]`);

  // OB-216 §2-S5: the §2-S3 measure-only shim and the HF-275 null-rate scoring are removed — the
  // binding loop below consumes `labeledCandidates` directly via LLM recognition (§2-S4) +
  // structural validation (§D). Candidate selection is the LLM's; the guarantee is existence +
  // role-consistency, not a null-rate-penalized boundary score.

  // HF-253: group matches by structural variantId before binding. The engine's
  // variant router (HF-119) evaluates exactly ONE variant per entity, so columns
  // are never contended ACROSS variants at calculation time. Binding each variant
  // in its own scope — its own AI mapping call and its own one-column-once exclusion
  // map — removes the spurious cross-variant contention that forced a variant's
  // ratio operand off the correct column (Cause A). A plan with no variants yields a
  // single group keyed `undefined`, which preserves byte-identical pre-HF behavior
  // (one AI call, one exclusion map, same component order). variantId is the persisted
  // structural key — never field-name or value content (Korean Test).
  const variantGroups = new Map<string | undefined, BindingMatch[]>();
  for (const match of matches) {
    const key = match.component.variantId;
    if (!variantGroups.has(key)) variantGroups.set(key, []);
    variantGroups.get(key)!.push(match);
  }
  console.log(`[Convergence] HF-253 binding ${variantGroups.size} variant group(s): ${Array.from(variantGroups.keys()).map(k => k ?? '(non-variant)').join(', ')}`);

  for (const [variantId, groupMatches] of Array.from(variantGroups.entries())) {
    const variantLabel = variantId ?? '(non-variant)';

    // Collect input requirements for THIS variant group only.
    const allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }> = [];
    for (const match of groupMatches) {
      const reqs = extractInputRequirements(match.component);
      for (const req of reqs) {
        allRequirements.push({ compIndex: match.component.index, compName: match.component.name, req });
      }
    }

    // Per-group component list (used for semantic-intent matching in the AI call).
    const groupComponents = groupMatches.map(m => m.component);

    console.log(`[Convergence] OB-216 §2-S4 requesting LLM binding for variant group ${variantLabel}`);
    const proposals = await recognizeBindingsViaAI(
      groupComponents,
      allRequirements,
      labeledCandidates,
      metricComprehension,
    );
    console.log(`[Convergence] OB-216 §2-S5 ${Object.keys(proposals).length} proposals for variant group ${variantLabel}`);

    // OB-216 §2-S5: bind each component's requirements from the LLM proposals (per field), with
    // deterministic structural validation. No one-column-once exclusion map (per-field recognition);
    // no boundary fallback. variantId scoping preserved (HF-253).
    for (const match of groupMatches) {
      const comp = match.component;
      const cap = capabilities.find(c => c.dataType === match.dataType);
      if (!cap) continue;

    const compKey = `component_${comp.index}`;
    if (!bindings[compKey]) bindings[compKey] = {};

    const batchId = cap.batchIds[0] || '';
    const requirements = extractInputRequirements(comp);

    for (const req of requirements) {
      const proposal = proposals[req.metricField];

      // §2-S5: no proposal or explicit abstention → convergence gap (never a forced bind).
      if (!proposal || 'abstain' in proposal) {
        const why = proposal ? (proposal as { reason: string }).reason : 'no_proposal';
        bindings[compKey][req.role] = {
          column: '',
          field_identity: { structuralType: 'unknown', contextualIdentity: 'unresolved', confidence: 0 },
          match_pass: 'failed',
          confidence: 0,
          resolutionFailure: {
            token: req.metricField,
            reason: proposal ? `llm_abstained:${why}` : 'no_proposal',
            candidatesConsidered: labeledCandidates.length,
          },
        };
        console.log(`[Convergence] OB-216 §2-S5 ${comp.name}:${req.role}: ${proposal ? `LLM abstained (${why})` : 'no proposal'} → convergence gap`);
        continue;
      }

      // §2-S5 structural validation (§D): (1) column exists in the proposed sheet; (2) its
      // structuralType is consistent with the field's intent-usage-derived needed type. No threshold.
      const sheetCap = capabilities.find(c => c.partitionKey === proposal.partitionKey);
      const colFi: FieldIdentity | undefined = sheetCap?.fieldIdentities[proposal.column]
        ?? (sheetCap && sheetCap.columnStats[proposal.column]
              ? { structuralType: 'measure', contextualIdentity: 'inferred_numeric', confidence: 0.5 }
              : undefined);
      if (!sheetCap || !colFi) {
        bindings[compKey][req.role] = {
          column: '', field_identity: { structuralType: 'unknown', contextualIdentity: 'unresolved', confidence: 0 },
          match_pass: 'failed', confidence: 0,
          resolutionFailure: { token: req.metricField, reason: 'proposed_column_absent_in_sheet', candidatesConsidered: labeledCandidates.length },
        };
        console.log(`[Convergence] OB-216 §2-S5 ${comp.name}:${req.role} → ${proposal.column}@${proposal.partitionKey.split('␟')[0]}: column not present in proposed sheet → gap`);
        continue;
      }
      const needed = deriveNeededType(req.metricField, comp.calculationIntent);
      if (!acceptableStructuralTypes(needed).has(colFi.structuralType)) {
        bindings[compKey][req.role] = {
          column: '', field_identity: { structuralType: 'unknown', contextualIdentity: 'unresolved', confidence: 0 },
          match_pass: 'failed', confidence: 0,
          resolutionFailure: { token: req.metricField, reason: `role_inconsistent:needs_${needed}_got_${colFi.structuralType}`, candidatesConsidered: labeledCandidates.length },
        };
        console.log(`[Convergence] OB-216 §2-S5 ${comp.name}:${req.role} → ${proposal.column} (${colFi.structuralType}): role-inconsistent, needs ${needed} → gap`);
        continue;
      }

      // Validated → write. The bound column's SHEET drives provenance; resolveColumnFromBatch scans
      // all batches by column name, so a column resolves from its own sheet's rows — and a component
      // whose fields bind on different sheets unions those sheets implicitly (§E batchIds union).
      const stats = sheetCap.columnStats[proposal.column];
      const scaleFactor = stats ? scoreColumnForRequirement(proposal.column, stats, req).scaleFactor : 1;
      bindings[compKey][req.role] = {
        column: proposal.column,
        field_identity: colFi,
        match_pass: 1,
        confidence: proposal.confidence,
        scale_factor: scaleFactor !== 1 ? scaleFactor : undefined,
        reduction: proposal.reduction !== 'sum' ? proposal.reduction : undefined,
        filters: proposal.filters,
        learning_provenance: { batch_id: sheetCap.batchIds[0] || '', learned_at: new Date().toISOString() },
      };
      console.log(`[Convergence] OB-216 §2-S5 ${comp.name}:${req.role} → ${proposal.column} (sheet=${proposal.partitionKey.split('␟')[0]}, type=${colFi.structuralType}, needs=${needed}, conf=${proposal.confidence.toFixed(2)}, validated)`);
    }

    // HF-218 Component 1 — Entity identifier self-verification.
    // Pre-HF-218: idEntries[0] (first-by-insertion-order; no value-content check, no
    // cardinality scoring, no tenant-entity intersection). Closes DIAG-042 §2.3
    // structural absences.
    //
    // Structural verification protocol (ADR Decision 1: product composition):
    //   1. Inventory all candidates where fi.structuralType === 'identifier'
    //   2. For each candidate, fetch distinct values from committed_data for batchIds
    //   3. Compute cardinality_ratio × intersection_ratio (vs tenant entity external_ids)
    //   4. Select highest-scoring candidate
    //   5. Fall back to cardinality-only if zero intersection across all candidates
    //   6. Persist with freshly-computed confidence; emit convergence:binding_selection signal
    // OB-216 §2-S5: an entity-key column may be classified 'identifier' OR 'reference_key' (e.g.
    // a per-sheet vendor key like a national-ID column is a reference_key). Consider BOTH as
    // candidates; the cardinality×intersection score below disambiguates structurally (the key whose
    // VALUES overlap the tenant's entity external_ids wins — Korean Test, value-overlap not name).
    // Pre-Phase-1 the merged single capability happened to expose the entity key as 'identifier';
    // per-sheet capabilities classify it 'reference_key', so the 'identifier'-only filter would pick
    // a high-cardinality non-entity column (e.g. a folio) with zero entity overlap.
    const idEntries = Object.entries(cap.fieldIdentities)
      .filter(([, fi]) => fi.structuralType === 'identifier' || fi.structuralType === 'reference_key');
    if (idEntries.length > 0) {
      type CandidateScore = {
        colName: string;
        fi: FieldIdentity;
        conf: StructuralBindingConfidence;
      };
      const candidateScores: CandidateScore[] = [];

      for (const [colName, fi] of idEntries) {
        const distinctValues = new Set<string>();
        let totalRows = 0;
        if (supabase && cap.batchIds.length > 0) {
          const PAGE_SIZE = 1000;
          let page = 0;
          while (true) {
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;
            const { data: rows } = await supabase
              .from('committed_data')
              .select('row_data')
              .in('import_batch_id', cap.batchIds)
              .range(from, to);
            if (!rows || rows.length === 0) break;
            for (const r of rows) {
              const rd = r.row_data as Record<string, unknown> | null;
              if (!rd) continue;
              const v = rd[colName];
              if (v != null && String(v).trim().length > 0) {
                distinctValues.add(String(v).trim());
                totalRows++;
              }
            }
            if (rows.length < PAGE_SIZE) break;
            page++;
            if (page > 10) break; // 10k row sampling ceiling for cardinality estimate
          }
        }
        const conf = computeStructuralBindingConfidence(distinctValues, totalRows, tenantEntityExternalIds);
        candidateScores.push({ colName, fi, conf });
      }

      // Rank: prefer non-zero score (intersection > 0); fall back to cardinality-only if all zero.
      candidateScores.sort((a, b) => {
        if (a.conf.score !== b.conf.score) return b.conf.score - a.conf.score;
        // Tie-break on cardinality_ratio (handles all-zero-intersection case)
        return b.conf.cardinality_ratio - a.conf.cardinality_ratio;
      });

      const winner = candidateScores[0];
      const winnerScore = winner.conf.score > 0 ? winner.conf.score : winner.conf.cardinality_ratio;

      bindings[compKey]['entity_identifier'] = {
        column: winner.colName,
        field_identity: winner.fi,
        match_pass: 1,
        confidence: winnerScore,
        learning_provenance: {
          batch_id: batchId,
          learned_at: new Date().toISOString(),
        },
      };

      // Emit convergence:binding_selection signal with full candidate provenance.
      // Per DS-022 v2 §5.1: canonical writer is the singular write path.
      if (supabase && tenantId) {
        try {
          await writeSignal({
            tenantId,
            signalType: 'convergence:binding_selection',
            signalValue: {
              component_index: comp.index,
              component_name: comp.name,
              selected_column: winner.colName,
              selected_confidence: winnerScore,
              tenant_entity_count: tenantEntityExternalIds.size,
              candidates: candidateScores.map(c => ({
                column: c.colName,
                score: c.conf.score,
                cardinality_ratio: c.conf.cardinality_ratio,
                intersection_ratio: c.conf.intersection_ratio,
                distinct_count: c.conf.distinct_count,
                intersection_count: c.conf.intersection_count,
              })),
              fallback_to_cardinality_only: winner.conf.score === 0,
            },
            confidence: winnerScore,
            source: 'convergence_validation',
            decisionSource: 'binding_self_verification',
          }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        } catch (sigErr) {
          if (sigErr instanceof CanonicalWriteError) {
            console.warn(`[Convergence] HF-218 binding_selection signal CanonicalWriteError (${sigErr.cause}): ${sigErr.message}`);
          } else {
            console.warn(`[Convergence] HF-218 binding_selection signal write failed (non-blocking): ${sigErr instanceof Error ? sigErr.message : String(sigErr)}`);
          }
        }
      }
    }

    // Find temporal column
    const temporalEntries = Object.entries(cap.fieldIdentities)
      .filter(([, fi]) => fi.structuralType === 'temporal');
    if (temporalEntries.length > 0) {
      const [colName, fi] = temporalEntries[0];
      bindings[compKey]['period'] = {
        column: colName,
        field_identity: fi,
        match_pass: 1,
        confidence: match.matchConfidence,
        learning_provenance: {
          batch_id: batchId,
          learned_at: new Date().toISOString(),
        },
      };
    }
    } // end for (match of groupMatches)

    // HF-269 Phase A: the HF-263 P3.2 magnitude-proxy post-pass redirect was REMOVED here.
    // It rewrote any cross_source_numeric measure binding to a same-batch column chosen by
    // magnitude proximity (log10 mean within 1). Magnitude is size, not meaning: a quota-style
    // column in the entity-identifier's batch sits in the same numeric band as transaction
    // amounts/counts, so the proxy overwrote correct AI mappings with the wrong column for the
    // general shared-column case. Filter-carrying bindings (Phase B) resolve the cross-source
    // metric correctly through the validated-mapping path — no magnitude rewrite. cross_source_numeric
    // remains a valid CLASSIFICATION (HF-228 tagging retained; consumed by the mapping prompt).
  } // HF-253 end for (variant group)

  // Log complete binding map
  for (const [compKey, cb] of Object.entries(bindings)) {
    const roles = Object.entries(cb)
      .filter(([role]) => role !== 'entity_identifier' && role !== 'period')
      .map(([role, b]) => `${role}=${b.column}`)
      .join(', ');
    if (roles) console.log(`[Convergence] HF-112 ${compKey}: ${roles}`);
  }
}


// ──────────────────────────────────────────────
// OB-185 Pass 4: AI-Assisted Semantic Derivation
// When Passes 1-3 fail to match plan metric references to data columns,
// invoke AI to reason about the semantic relationship and produce
// MetricDerivationRule entries.
// Korean Test: Zero hardcoded field names. AI receives column metadata
// and sample values at runtime.
// ──────────────────────────────────────────────

async function generateAISemanticDerivations(
  metricContexts: MetricContext[],
  capabilities: DataCapability[],
  // HF-235 — `supabase` and `tenantId` parameters dropped from the signature
  // after the in-function sample-row fetch was removed. The function now
  // operates purely on its `metricContexts` + `capabilities` inputs and the
  // shared AI service.
): Promise<{ derivations: MetricDerivationRule[]; gaps: Array<{ metric: string; reason: string; resolution: string }> }> {
  const derivations: MetricDerivationRule[] = [];
  const gaps: Array<{ metric: string; reason: string; resolution: string }> = [];

  if (metricContexts.length === 0) return { derivations, gaps };
  const unresolvedMetrics = metricContexts.map(mc => mc.name);

  // 1. Build column inventory for AI
  const columnDescriptions: string[] = [];
  for (const cap of capabilities) {
    columnDescriptions.push(`Data type: "${cap.dataType}" (${cap.rowCount} rows)`);
    for (const nf of cap.numericFields) {
      const stats = cap.columnStats[nf.field];
      columnDescriptions.push(`  - ${nf.field}: numeric (avg=${nf.avg.toFixed(2)}${stats ? `, min=${stats.min}, max=${stats.max}` : ''})`);
    }
    for (const cf of cap.categoricalFields) {
      columnDescriptions.push(`  - ${cf.field}: categorical (values: ${cf.distinctValues.join(', ')})`);
    }
    for (const bf of cap.booleanFields) {
      columnDescriptions.push(`  - ${bf.field}: boolean (true="${bf.trueValue}", false="${bf.falseValue}")`);
    }
  }

  // HF-235: Sample rows REMOVED from Pass 4 prompt.
  // Column descriptions from capabilities (built above) provide complete
  // metadata — numeric stats, categorical distinct values, boolean labels —
  // sufficient for filter derivation. The previous 3-row sample query was
  // non-deterministic (.limit(3), no ordering, no data_type filter) and
  // could contradict the column descriptions by returning rows from a
  // different data_type than the metrics reference (e.g., roster rows
  // when the metric needs transaction-level filter discovery). Removing
  // the sample eliminates the source of Pass-4 derivation non-determinism
  // observed post-HF-234. Token budget freed for richer metric context.

  // 2. Build AI prompt — enriched with metric labels, component context (OB-191),
  // and HF-198 E5 plan-agent semantic intent from comprehension:plan_interpretation
  // signals (read before derive per AUD-004 v3 §2 E5).
  // Korean Test: No hardcoded field names. AI receives column metadata and sample values at runtime.
  const metricDescriptions = metricContexts.map(mc => {
    let desc = `- ${mc.name} (label: "${mc.label}", used in: ${mc.operation}, component: "${mc.componentName}")`;
    if (mc.scope) desc += `\n  NOTE: This metric should be aggregated at the ${mc.scope} scope level`;
    if (mc.semanticIntent) desc += `\n  PLAN-AGENT INTENT: ${mc.semanticIntent}`;
    if (mc.metricInputs && Object.keys(mc.metricInputs).length > 0) {
      try {
        desc += `\n  PLAN-AGENT INPUTS: ${JSON.stringify(mc.metricInputs).slice(0, 240)}`;
      } catch {}
    }
    // HF-226 Phase 2A: surface the full plan-agent signal_value (minus already-
    // emitted keys) so the AI sees any extension fields the LLM expressed —
    // calculationMethod, filters, expectedMetrics, free-form predicate
    // vocabulary, etc. Pass-4 already instructs the AI to identify categorical
    // subsets; richer context strengthens that determination.
    if (mc.signalContext) {
      const sc = mc.signalContext;
      const skip = new Set(['metric_label', 'metric_op', 'metric_inputs', 'semantic_intent', 'component_id', 'component_type', 'source_evidence']);
      const extras: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(sc)) {
        if (skip.has(k)) continue;
        if (v == null) continue;
        extras[k] = v;
      }
      if (Object.keys(extras).length > 0) {
        try {
          desc += `\n  PLAN-AGENT FULL CONTEXT: ${JSON.stringify(extras).slice(0, 480)}`;
        } catch {}
      }
    }
    return desc;
  }).join('\n');

  const userPrompt = `You are a data analyst bridging calculation plan metrics to available data columns.

You receive:
1. Required metrics with semantic labels describing what each metric represents
2. Available data columns with types, statistics, and categorical values

Your task: For each required metric, determine how to derive it from the available data.

IMPORTANT RULES:
- Match the metric's semantic label to available data fields. If the label suggests a subset of a broader numeric field (e.g., "Equipment Revenue" from a general "total_amount"), identify the categorical field and value that filters to the correct subset.
- Use the categorical field's distinct values to find exact filter matches. The filter value must be one of the listed distinct values.
- For count metrics (e.g., "Deal Count", "Cross Sell Count"), use the "count" operation with appropriate filters.
- For metrics with a scope note, the derivation defines how to compute the metric per entity — the platform handles scope aggregation separately.

HF-238 NOTE — DAG semantics behind the emission shape:
The runtime translates each derivation into a Prime-DAG composition over the
nine engine primes (arithmetic, aggregate, filter, conditional, scope, compare,
logical, constant, reference). The emission shape below maps to:
  • sum / count / avg / min / max  →  filter(predicate, ...)+ wrapping aggregate(op, field).
    Each entry in "filters" becomes one filter prime; the aggregate prime sits at the innermost
    position, reducing the row set narrowed by the filter chain.
  • ratio                          →  arithmetic(divide, reference(num), reference(den)),
    zero-guarded via conditional(compare(eq, den, 0), 0, divide).
  • delta                          →  not yet expressible in the row-context EvalContext
    (requires prior-period rows); the engine retains a hybrid path for delta until
    historical-row plumbing lands.
Filter operators recognized by the filter prime: eq, neq, gt, gte, lt, lte, contains.

Operations:
- sum: SUM a numeric field, optionally filtered by a categorical field value
- count: COUNT rows, optionally filtered by a categorical field value
- ratio: Divide one derived metric by another
- delta: Difference between two values

OB-200 Phase 3 — SCOPE EXPRESSION:
When a metric must be aggregated across entity siblings (e.g., "district revenue", "team sales total", "manager override on subordinates"), emit the optional "scope" field on the derivation. scope.entity_group_by is the entity-attribute key that defines the sibling group (e.g., "district", "region", "team_lead_id"). When scope is present, the runtime wraps the produced DAG with a scope prime so the aggregate runs over sibling rows. Omit scope entirely for single-entity metrics. Use the metric's scope NOTE when provided to determine the right entity_group_by attribute.

Respond with ONLY valid JSON, no markdown, no explanation:
{
  "derivations": [
    {
      "metric": "the_metric_name",
      "operation": "sum",
      "source_field": "column_name_to_aggregate",
      "filters": [
        { "field": "column_name", "operator": "eq", "value": "filter_value" }
      ],
      "scope": { "entity_group_by": "district", "aggregation_function": "sum" }
    }
  ],
  "gaps": [
    {
      "metric": "the_metric_name",
      "reason": "Why this metric cannot be derived",
      "resolution": "What data the user should import"
    }
  ]
}

Required metrics:
${metricDescriptions}

Available data columns:
${columnDescriptions.join('\n')}

Generate derivation rules for each required metric. Use filters to narrow broad fields to specific subsets when the metric label implies a category. Use scope when the metric label or NOTE indicates aggregation across an entity grouping.`;

  // 3. Call AI
  try {
    const aiService = getAIService();
    const response = await aiService.execute({
      task: 'natural_language_query',
      input: { question: userPrompt, context: {} },
      options: { responseFormat: 'json', maxTokens: 4096, temperature: 0 },
    }, false);

    // 4. Parse response — handle different response shapes
    let parsedResult: Record<string, unknown> = response.result as Record<string, unknown>;
    // If wrapped in natural_language_query response format, extract from answer
    if (parsedResult?.answer && typeof parsedResult.answer === 'string') {
      try {
        parsedResult = JSON.parse(parsedResult.answer);
      } catch {
        // answer might already be an object or unparseable
      }
    }
    // If the result itself has derivations, use it directly
    const aiDerivations = (parsedResult?.derivations as Array<Record<string, unknown>>) ?? [];
    const aiGaps = (parsedResult?.gaps as Array<Record<string, unknown>>) ?? [];

    if (Array.isArray(aiDerivations)) {
      for (const d of aiDerivations) {
        const metric = String(d.metric || '');
        const operation = String(d.operation || 'sum');
        if (!metric || !unresolvedMetrics.includes(metric)) continue;

        // Validate operation is a valid MetricDerivationRule operation
        const validOps = ['sum', 'count', 'ratio', 'delta'];
        if (!validOps.includes(operation)) continue;

        // Find the data_type that contains the source_field
        let sourcePattern = '.*';
        for (const cap of capabilities) {
          const hasField = cap.numericFields.some(f => f.field === d.source_field) ||
            cap.categoricalFields.some(f => f.field === d.source_field) ||
            (Array.isArray(d.filters) && d.filters.some((df: Record<string, unknown>) =>
              cap.categoricalFields.some(f => f.field === df.field)
            ));
          if (hasField) {
            sourcePattern = cap.dataType;
            break;
          }
        }

        const filters: MetricDerivationRule['filters'] = [];
        if (Array.isArray(d.filters)) {
          for (const f of d.filters as Array<Record<string, unknown>>) {
            if (f.field && f.value != null) {
              filters.push({
                field: String(f.field),
                operator: (String(f.operator || 'eq') as MetricDerivationRule['filters'][0]['operator']),
                value: f.value as string | number | boolean,
              });
            }
          }
        }

        // HF-226 Phase 2B — Carry Everything (T1-E902). Spread the AI's raw
        // derivation output first; overlay the validated typed fields. Any
        // additional fields the AI emitted (confidence, reasoning, scope, or
        // future schema extensions) land on the rule via the spread; the
        // engine's deterministic execution path reads only the typed fields
        // it knows. Future intelligence consumers (signals, observatory,
        // debugging) can read the carried context without an emitter change.
        // OB-200 Phase 3: scope extraction. The AI may emit scope as part of
        // its derivation; validate the shape so a malformed emission is
        // ignored rather than persisted. entity_group_by must be a non-empty
        // string for the runtime to wrap with a scope prime.
        let scope: MetricDerivationRule['scope'] | undefined;
        const rawScope = d.scope as Record<string, unknown> | undefined;
        if (rawScope && typeof rawScope === 'object') {
          const egb = typeof rawScope.entity_group_by === 'string' ? rawScope.entity_group_by : undefined;
          const aggFn = typeof rawScope.aggregation_function === 'string' ? rawScope.aggregation_function : undefined;
          const tr = rawScope.temporal_range as Record<string, unknown> | undefined;
          const trShape =
            tr && typeof tr === 'object'
              && typeof tr.offset === 'number'
              && typeof tr.length === 'number'
              ? { offset: tr.offset as number, length: tr.length as number }
              : undefined;
          if (egb || trShape || aggFn) {
            scope = {
              ...(egb ? { entity_group_by: egb } : {}),
              ...(trShape ? { temporal_range: trShape } : {}),
              ...(aggFn ? { aggregation_function: aggFn as 'sum' | 'count' | 'avg' | 'min' | 'max' } : {}),
            };
          }
        }
        derivations.push({
          ...d,
          metric,
          operation: operation as MetricDerivationRule['operation'],
          source_pattern: sourcePattern,
          source_field: d.source_field ? String(d.source_field) : undefined,
          filters,
          ...(scope ? { scope } : {}),
        });
      }
    }

    if (Array.isArray(aiGaps)) {
      for (const g of aiGaps) {
        gaps.push({
          metric: String(g.metric || ''),
          reason: String(g.reason || 'Not derivable from available data'),
          resolution: String(g.resolution || 'Import data containing this metric'),
        });
      }
    }

    // 5. Check for metrics that AI didn't address
    const addressedMetrics = new Set([
      ...derivations.map(d => d.metric),
      ...gaps.map(g => g.metric),
    ]);
    for (const m of unresolvedMetrics) {
      if (!addressedMetrics.has(m)) {
        gaps.push({
          metric: m,
          reason: 'AI did not produce a derivation or gap for this metric',
          resolution: 'Configure metric derivation rules manually',
        });
      }
    }
  } catch (err) {
    console.error('[Convergence] OB-185 Pass 4 AI call failed:', err);
    // Non-blocking — return gaps for all unresolved metrics
    for (const m of unresolvedMetrics) {
      gaps.push({
        metric: m,
        reason: 'AI semantic derivation failed — manual configuration required',
        resolution: 'Configure metric derivation rules in plan settings',
      });
    }
  }

  return { derivations, gaps };
}

// ──────────────────────────────────────────────
// OB-128: Boundary Scale Detection
// ──────────────────────────────────────────────

function detectBoundaryScale(componentsJson: unknown, componentIndex: number): number {
  const cj = componentsJson as Record<string, unknown> | null;
  if (!cj) return 100;

  // HF-243: same flattening fix as extractComponents — index into the global
  // flat component list across all variants, not just variants[0].
  const variants = (cj.variants as Array<Record<string, unknown>>) ?? [];
  const flat: Array<Record<string, unknown>> = [];
  for (const v of variants) {
    const vc = v.components as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(vc)) flat.push(...vc);
  }
  const comp = flat[componentIndex];
  if (!comp) return 100;

  const tierConfig = comp.tierConfig as Record<string, unknown> | undefined;
  const tiers = (tierConfig?.tiers as Array<Record<string, unknown>>) ?? [];
  for (const tier of tiers) {
    const min = tier.min as number | null;
    const max = tier.max as number | null;
    if ((min !== null && min > 1) || (max !== null && max > 1)) {
      return 100;
    }
  }

  const intent = comp.calculationIntent as Record<string, unknown> | undefined;
  const boundaries = (intent?.boundaries as Array<Record<string, unknown>>) ?? [];
  for (const b of boundaries) {
    const min = b.min as number | null;
    const max = b.max as number | null;
    if ((min !== null && min > 1) || (max !== null && max > 1)) {
      return 100;
    }
  }

  return 1;
}

// HF-109: Structural measure count by operation type (DS-009 4.2)
// Used by Pass 2 to match component structural pattern against batch field identities
function getRequiredMeasureCount(operation: string): number {
  switch (operation) {
    case 'ratio':
    case 'bounded_lookup_2d':
      return 2; // actual + target (or numerator + denominator)
    case 'sum':
    case 'count':
    case 'bounded_lookup_1d':
    case 'scalar_multiply':
    case 'conditional_gate':
    case 'aggregate':
    default:
      return 1;
  }
}

// ──────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────

function tokenize(name: string): string[] {
  return name
    .replace(/([A-Z])/g, '_$1')  // camelCase → snake_case
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')  // Non-alphanumeric → underscore
    .split('_')
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'per', 'ins', 'cfg', 'q1', 'q2', 'q3', 'q4',
  '2024', '2025', '2026', 'plan', 'program',
]);
