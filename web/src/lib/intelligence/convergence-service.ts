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
}

// OB-191: Enriched metric context for Pass 4 AI prompt
interface MetricContext {
  name: string;          // Programmatic metric name (e.g., "period_equipment_revenue")
  label: string;         // Human-readable label (e.g., "Period Equipment Revenue")
  componentName: string; // Owning component name for additional context
  operation: string;     // Calculation operation (e.g., "linear_function")
  scope?: string;        // Scope level for scope_aggregate (e.g., "district")
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
export interface ComponentBinding {
  source_batch_id: string;
  column: string;
  field_identity: FieldIdentity;
  match_pass: number;  // 1=structural/boundary, 2=contextual/AI, 3=token
  confidence: number;
  // HF-111: Scale factor for percentage columns (e.g., 100 when column is 0-1 ratio but boundary is 0-100)
  scale_factor?: number;
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
  for (const match of matches) {
    const cap = capabilities.find(c => c.dataType === match.dataType);
    if (!cap) continue;

    matchReport.push({
      component: match.component.name,
      dataType: match.dataType,
      confidence: match.matchConfidence,
      reason: match.matchReason,
    });

    if (match.matchConfidence < 0.5) continue;

    const generated = generateDerivationsForMatch(match, cap, components, matches);
    derivations.push(...generated);

    for (const d of generated) {
      signals.push({
        domain: match.dataType,
        fieldName: d.source_field || 'row_count',
        semanticType: d.operation === 'sum' ? 'amount' : 'count',
        confidence: match.matchConfidence,
      });
    }

    // Note: per-component bindings generated in bulk below (HF-111)
  }

  // HF-112: Generate all component bindings with AI mapping + boundary validation
  const existingConvergenceBindings = (ruleSet.input_bindings as Record<string, unknown>)?.convergence_bindings as
    Record<string, Record<string, unknown>> | undefined;
  await generateAllComponentBindings(components, matches, capabilities, componentBindings, existingConvergenceBindings);

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

    // Apply corrections to bindings
    for (const pr of plausibilityResults) {
      if (pr.isAnomaly && pr.proposedCorrection) {
        const compKey = `component_${pr.componentIndex}`;
        const cb = componentBindings[compKey];
        if (cb) {
          const role = pr.proposedCorrection.bindingRole;
          const binding = cb[role];
          if (binding) {
            binding.scale_factor = pr.proposedCorrection.proposedScale;
            console.log(
              `[CONVERGENCE-VALIDATION]   Applying correction to ${compKey}:${role} ` +
              `(decision_source: structural_anomaly)`
            );
          }
        }
      }
    }

    // Capture classification signals
    for (const pr of plausibilityResults) {
      if (pr.isAnomaly) {
        const compKey = `component_${pr.componentIndex}`;
        const cb = componentBindings[compKey];
        const bindingRole = pr.proposedCorrection?.bindingRole ?? 'actual';
        const colName = cb?.[bindingRole]?.column ?? 'unknown';
        const dist = distributions[colName];

        await supabase.from('classification_signals').insert({
          tenant_id: tenantId,
          signal_type: 'convergence:calculation_validation',
          signal_value: {
            component_index: pr.componentIndex,
            component_name: pr.componentName,
            anomaly_type: pr.anomalyType,
            detected_result: pr.sampleResult,
            corrected_result: pr.proposedCorrection?.correctedResult,
            peer_median: pr.medianPeerResult,
            ratio_to_median: pr.ratioToMedian,
            correction_applied: !!pr.proposedCorrection,
            correction_type: pr.proposedCorrection?.type,
          },
          confidence: 0.85,
          source: 'convergence_validation',
          decision_source: 'structural_anomaly',
          context: {
            plan_id: ruleSetId,
            component_type: components[pr.componentIndex]?.calculationOp ?? 'unknown',
            bound_column: colName,
            value_distribution: dist ? { min: dist.min, max: dist.max, median: dist.median, scale: dist.scaleInference } : null,
          },
          calculation_run_id: calculationRunId ?? null,
        });
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
        if (score > 0.2 && (!bestCompMatch || score > bestCompMatch.score)) {
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
          source_batch_id: targetCap.batchIds[0],
          column: targetCap.targetField,
          field_identity: targetFI || { structuralType: 'measure', contextualIdentity: 'performance_target', confidence: 0.7 },
          match_pass: 2,
          confidence: bestCompMatch.score,
        };
      }

      console.log(`[Convergence] OB-128: Detected actuals-target pair for "${comp.name}" — generating ratio derivation (scale=${scaleFactor})`);
    }
  }

  // OB-185 Pass 4: AI Semantic Derivation for unresolved metrics
  // When Passes 1-3 leave metrics unresolved, invoke AI to bridge the gap.
  // This handles transaction-level data where plan metric names (e.g., "consumable_revenue")
  // don't match column names (e.g., "total_amount") — AI reasons about the semantic bridge.
  const allResolvedMetrics = new Set(derivations.map(d => d.metric));
  const allRequiredMetrics = Array.from(new Set(components.flatMap(c => c.expectedMetrics)));
  const unresolvedForAI = allRequiredMetrics.filter(m => !allResolvedMetrics.has(m));

  if (unresolvedForAI.length > 0 && capabilities.length > 0) {
    // OB-191: Build enriched metric context from calculationIntent
    const metricContexts: MetricContext[] = unresolvedForAI.map(metricName => {
      const ownerComp = components.find(c => c.expectedMetrics.includes(metricName));
      const intent = ownerComp?.calculationIntent;
      let scope: string | undefined;
      if (intent) {
        const inputSpec = (intent.input as Record<string, unknown> | undefined)?.sourceSpec as Record<string, unknown> | undefined;
        if (inputSpec?.scope) scope = String(inputSpec.scope);
      }
      return {
        name: metricName,
        label: humanizeMetricName(metricName),
        componentName: ownerComp?.name || 'Unknown',
        operation: ownerComp?.calculationOp || 'unknown',
        scope,
      };
    });

    console.log(`[Convergence] OB-185 Pass 4: ${unresolvedForAI.length} unresolved metrics — invoking AI semantic derivation`);
    for (const mc of metricContexts) {
      console.log(`[Convergence] Pass 4 metric: ${mc.name} (label: "${mc.label}", op: ${mc.operation}${mc.scope ? ', scope: ' + mc.scope : ''})`);
    }
    try {
      const aiResult = await generateAISemanticDerivations(
        metricContexts, capabilities, supabase, tenantId
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

  if (Array.isArray(componentsJson)) {
    // Direct array of components
    comps = componentsJson as Array<Record<string, unknown>>;
  } else if (typeof componentsJson === 'object') {
    const cj = componentsJson as Record<string, unknown>;
    const variants = cj.variants as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(variants) && variants.length > 0) {
      // Variant structure — use first variant (all share same structural pattern)
      comps = (variants[0].components as Array<Record<string, unknown>>) ?? [];
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

async function inventoryData(
  tenantId: string,
  supabase: SupabaseClient
): Promise<DataCapability[]> {
  const capabilities: DataCapability[] = [];

  // HF-196 Phase 1E: filter out superseded batches per Rule 30.
  const { fetchSupersededBatchIds } = await import('@/lib/sci/import-batch-supersession');
  const supersededIds = await fetchSupersededBatchIds(supabase, tenantId);

  // OB-162: Also read import_batch_id for convergence bindings
  let q = supabase
    .from('committed_data')
    .select('data_type, row_data, metadata, import_batch_id')
    .eq('tenant_id', tenantId)
    .not('data_type', 'is', null)
    .limit(500);
  if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
  const { data: rows } = await q;

  // OB-128: Separately fetch rows with semantic_roles (SCI-committed data)
  let q2 = supabase
    .from('committed_data')
    .select('data_type, row_data, metadata, import_batch_id')
    .eq('tenant_id', tenantId)
    .not('data_type', 'is', null)
    .not('metadata->semantic_roles', 'is', null)
    .limit(50);
  if (supersededIds.length > 0) q2 = q2.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
  const { data: sciRows } = await q2;

  const allRows = [...(rows || [])];
  if (sciRows) {
    for (const sr of sciRows) {
      const dt = sr.data_type as string;
      if (!allRows.some(r => (r.data_type as string) === dt)) {
        allRows.push(sr);
      }
    }
  }

  if (!allRows.length) return capabilities;

  // Group by data_type
  const byType = new Map<string, Array<Record<string, unknown>>>();
  const countByType = new Map<string, number>();
  const rolesByType = new Map<string, Record<string, string>>();
  // OB-162: Collect field identities and batch IDs per data_type
  const fieldIdentitiesByType = new Map<string, Record<string, FieldIdentity>>();
  const batchIdsByType = new Map<string, Set<string>>();

  for (const row of allRows) {
    const dt = row.data_type as string;
    if (!byType.has(dt)) byType.set(dt, []);
    countByType.set(dt, (countByType.get(dt) || 0) + 1);
    const samples = byType.get(dt)!;
    if (samples.length < 30) {
      const rd = row.row_data as Record<string, unknown> | null;
      if (rd) samples.push(rd);
    }

    // Collect batch IDs
    const batchId = row.import_batch_id as string | null;
    if (batchId) {
      if (!batchIdsByType.has(dt)) batchIdsByType.set(dt, new Set());
      batchIdsByType.get(dt)!.add(batchId);
    }

    // Extract semantic_roles from metadata
    if (!rolesByType.has(dt)) {
      const meta = row.metadata as Record<string, unknown> | null;
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
          rolesByType.set(dt, normalized);
        }
      }

      // OB-162: Extract field_identities from metadata (Decision 111)
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
        fieldIdentitiesByType.set(dt, identities);
      }
    }
  }

  for (const [dataType, samples] of Array.from(byType.entries())) {
    const roles = rolesByType.get(dataType) || {};
    const targetFieldEntry = Object.entries(roles).find(([, role]) => role === 'performance_target');
    const fieldIdentities = fieldIdentitiesByType.get(dataType) || {};
    const batchIds = Array.from(batchIdsByType.get(dataType) || new Set<string>());

    const cap: DataCapability = {
      dataType,
      rowCount: countByType.get(dataType) || 0,
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

      if (bestMatch && bestMatch.score > 0.3) {
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

    if (bestDt && bestScore > 0.2) {
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

  if (isSharedBase && capability.categoricalFields.length > 0) {
    return generateFilteredCountDerivations(comp, match.dataType, capability);
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
}

function extractInputRequirements(component: PlanComponent): ComponentInputRequirement[] {
  const intent = component.calculationIntent;
  if (!intent) return [{ role: 'actual', metricField: component.expectedMetrics[0] || 'unknown', expectedRange: null }];

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
      if (input?.source === 'ratio') {
        const spec = input.sourceSpec as Record<string, unknown> | undefined;
        const num = spec?.numerator ? String(spec.numerator).replace(/^metric:/, '') : 'unknown';
        const den = spec?.denominator ? String(spec.denominator).replace(/^metric:/, '') : 'unknown';
        reqs.push({ role: 'numerator', metricField: num, expectedRange: null });
        reqs.push({ role: 'denominator', metricField: den, expectedRange: null });
      } else {
        const spec = input?.sourceSpec as Record<string, unknown> | undefined;
        reqs.push({ role: 'actual', metricField: getField(spec), expectedRange: null });
      }
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
  anomalyType?: 'scale_mismatch' | 'rate_outlier' | 'unknown';
  proposedCorrection?: {
    type: 'scale_factor';
    currentScale: number;
    proposedScale: number;
    correctedResult: number;
    bindingRole: string;
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
        result.isAnomaly = true;
        result.anomalyType = 'scale_mismatch';

        // Propose correction: try dividing by powers of 10 to bring within range
        const comp = components[result.componentIndex];
        const compKey = `component_${comp.index}`;
        const cb = componentBindings[compKey];

        for (const scaleDivisor of [100, 10, 1000]) {
          const correctedResult = result.sampleResult / scaleDivisor;
          const correctedRatio = correctedResult / medianResult;
          if (correctedRatio >= 0.1 && correctedRatio <= 10) {
            // Find which binding role carries the value that needs scaling
            const bindingRole = cb.numerator ? 'numerator' : cb.actual ? 'actual' : 'row';
            const binding = cb[bindingRole];
            const currentScale = binding?.scale_factor ?? 1;

            result.proposedCorrection = {
              type: 'scale_factor',
              currentScale,
              proposedScale: currentScale / scaleDivisor,
              correctedResult,
              bindingRole,
            };
            break;
          }
        }
      }
    }
  }

  // Log all results
  for (const r of results) {
    const status = r.isAnomaly ? 'SCALE ANOMALY' : 'OK';
    console.log(
      `[CONVERGENCE-VALIDATION] Component ${r.componentIndex} (${r.componentName}): ` +
      `sample=${r.sampleResult.toFixed(0)}, median_peer=${r.medianPeerResult.toFixed(0)}, ` +
      `ratio=${r.ratioToMedian.toFixed(1)} — ${status}`
    );
    if (r.proposedCorrection) {
      console.log(
        `[CONVERGENCE-VALIDATION]   Proposed correction: scale_factor ${r.proposedCorrection.currentScale}→${r.proposedCorrection.proposedScale}, ` +
        `corrected=${r.proposedCorrection.correctedResult.toFixed(0)}, ` +
        `new_ratio=${(r.proposedCorrection.correctedResult / r.medianPeerResult).toFixed(1)}`
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

// HF-113: Validate that AI response is a metric→column mapping (not a narrative)
function isValidColumnMapping(
  result: Record<string, unknown>,
  metricFields: string[],
  columnNames: string[],
): boolean {
  const mappedCount = metricFields.filter(m =>
    typeof result[m] === 'string' && columnNames.includes(result[m] as string)
  ).length;
  return mappedCount >= Math.ceil(metricFields.length * 0.5);
}

// One AI call: match plan metric field names to data column contextual identities
async function resolveColumnMappingsViaAI(
  components: PlanComponent[],
  allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }>,
  measureColumns: Array<{ name: string; fi: FieldIdentity; stats: ColumnValueStats }>,
): Promise<Record<string, string>> {
  const metricFields = allRequirements.map(r => r.req.metricField).filter(f => f !== 'unknown');
  const columnNames = measureColumns.map(c => c.name);

  // Build compact metric list
  const metricList = metricFields.map((f, i) => `${i + 1}. "${f}"`).join('\n');

  // Build column list with contextual identities
  const columnList = measureColumns.map((c, i) =>
    `${i + 1}. "${c.name}" (${c.fi.contextualIdentity})`
  ).join('\n');

  // HF-114: User prompt passed straight through to AI via convergence_mapping task type.
  // System prompt is defined in SYSTEM_PROMPTS['convergence_mapping'] (anthropic-adapter.ts).
  // Mirrors HC pattern: system prompt defines schema, user prompt provides raw context.
  const userPrompt = `Match each metric field to the best data column. Each column used at most once.

METRIC FIELDS:
${metricList}

DATA COLUMNS:
${columnList}

EXAMPLE OUTPUT:
{"${metricFields[0] || 'metric_a'}": "${columnNames[0] || 'Column_A'}", "${metricFields[1] || 'metric_b'}": "${columnNames[1] || 'Column_B'}"}`;

  try {
    const aiService = getAIService();

    // HF-114: convergence_mapping task type — purpose-built system prompt + passthrough user prompt
    const response = await aiService.execute({
      task: 'convergence_mapping',
      input: { userMessage: userPrompt },
      options: { maxTokens: 500, responseFormat: 'json' as const },
    }, false);

    const result = response.result as Record<string, unknown>;

    // Validate: at least some keys are metric fields with values being column names
    if (!isValidColumnMapping(result, metricFields, columnNames)) {
      console.error(`[Convergence] HF-114 AI response invalid (keys: ${Object.keys(result).join(', ')}). Falling back to boundary matching.`);
      return {};
    }

    const mapping: Record<string, string> = {};
    for (const [key, val] of Object.entries(result)) {
      if (typeof val === 'string' && columnNames.includes(val)) {
        mapping[key] = val;
      }
    }
    console.log(`[Convergence] HF-114 AI mapping: ${JSON.stringify(mapping)}`);
    return mapping;
  } catch (err) {
    console.error('[Convergence] HF-114 AI mapping failed:', err);
  }

  return {};
}

// ──────────────────────────────────────────────
// HF-112: Generate Per-Component Input Bindings
// AI-Primary column selection + boundary validation + column exclusion
// ──────────────────────────────────────────────

async function generateAllComponentBindings(
  components: PlanComponent[],
  matches: BindingMatch[],
  capabilities: DataCapability[],
  bindings: Record<string, Record<string, ComponentBinding>>,
  existingConvergenceBindings: Record<string, Record<string, unknown>> | undefined,
): Promise<void> {
  // HF-112: Reuse existing bindings if complete (zero AI cost)
  if (hasCompleteBindings(existingConvergenceBindings, components.length)) {
    console.log('[Convergence] HF-112 Existing bindings complete — reusing (zero AI cost)');
    for (const [compKey, compBindings] of Object.entries(existingConvergenceBindings!)) {
      bindings[compKey] = compBindings as Record<string, ComponentBinding>;
    }
    return;
  }

  // Collect all measure columns across matched capabilities
  const measureColumns: Array<{
    name: string;
    fi: FieldIdentity;
    stats: ColumnValueStats;
    batchId: string;
  }> = [];
  let primaryCap: DataCapability | undefined;

  for (const match of matches) {
    const cap = capabilities.find(c => c.dataType === match.dataType);
    if (!cap) continue;
    if (!primaryCap) {
      primaryCap = cap;
    }

    for (const [colName, fi] of Object.entries(cap.fieldIdentities)) {
      if (fi.structuralType === 'measure' && cap.columnStats[colName]) {
        if (!measureColumns.some(mc => mc.name === colName)) {
          measureColumns.push({ name: colName, fi, stats: cap.columnStats[colName], batchId: cap.batchIds[0] || '' });
        }
      }
    }
    // Also include numeric columns with stats but no field identity
    for (const nf of cap.numericFields) {
      if (!measureColumns.some(mc => mc.name === nf.field) && cap.columnStats[nf.field]) {
        measureColumns.push({
          name: nf.field,
          fi: { structuralType: 'measure', contextualIdentity: 'inferred_numeric', confidence: 0.5 },
          stats: cap.columnStats[nf.field],
          batchId: cap.batchIds[0] || '',
        });
      }
    }
  }

  if (measureColumns.length === 0 || !primaryCap) return;

  // Collect all input requirements across all matched components
  const allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }> = [];
  for (const match of matches) {
    const reqs = extractInputRequirements(match.component);
    for (const req of reqs) {
      allRequirements.push({ compIndex: match.component.index, compName: match.component.name, req });
    }
  }

  // HF-112: AI-assisted column mapping (ONE call)
  console.log('[Convergence] HF-112 Requesting AI column mapping');
  const aiMapping = await resolveColumnMappingsViaAI(components, allRequirements, measureColumns);
  console.log(`[Convergence] HF-112 AI proposed ${Object.keys(aiMapping).length} mappings`);

  // Build bindings using AI mapping + boundary validation
  const boundColumns = new Set<string>();

  for (const match of matches) {
    const comp = match.component;
    const cap = capabilities.find(c => c.dataType === match.dataType);
    if (!cap) continue;

    const compKey = `component_${comp.index}`;
    if (!bindings[compKey]) bindings[compKey] = {};

    const batchId = cap.batchIds[0] || '';
    const requirements = extractInputRequirements(comp);

    for (const req of requirements) {
      const proposedColumnName = aiMapping[req.metricField];

      if (proposedColumnName) {
        const mc = measureColumns.find(c => c.name === proposedColumnName);
        if (mc && !boundColumns.has(proposedColumnName)) {
          // Boundary validation of AI proposal
          const { score: boundaryScore, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
          const isValidated = !req.expectedRange || boundaryScore > 0.1;

          bindings[compKey][req.role] = {
            source_batch_id: mc.batchId,
            column: proposedColumnName,
            field_identity: mc.fi,
            match_pass: isValidated ? 1 : 2,  // 1=AI+validated, 2=AI-only
            confidence: isValidated ? 0.9 : 0.6,
            scale_factor: scaleFactor !== 1 ? scaleFactor : undefined,
          };
          boundColumns.add(proposedColumnName);
          console.log(`[Convergence] HF-112 ${comp.name}:${req.role} → ${proposedColumnName} (AI${isValidated ? '+validated' : ''}, scale=${scaleFactor})`);
          continue;
        }
      }

      // Fallback: boundary matching for unmapped requirements (HF-111 logic)
      const candidates = measureColumns
        .filter(mc => !boundColumns.has(mc.name))
        .map(mc => {
          const { score, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
          return { ...mc, score, scaleFactor };
        })
        .sort((a, b) => b.score - a.score);

      if (candidates.length > 0 && candidates[0].score > 0) {
        const best = candidates[0];
        bindings[compKey][req.role] = {
          source_batch_id: best.batchId,
          column: best.name,
          field_identity: best.fi,
          match_pass: 3,  // Boundary-only fallback
          confidence: Math.min(0.7, match.matchConfidence * (0.3 + best.score * 0.4)),
          scale_factor: best.scaleFactor !== 1 ? best.scaleFactor : undefined,
        };
        boundColumns.add(best.name);
        console.log(`[Convergence] HF-112 ${comp.name}:${req.role} → ${best.name} (boundary fallback, score=${best.score.toFixed(2)})`);
      }
    }

    // Find entity identifier column
    const idEntries = Object.entries(cap.fieldIdentities)
      .filter(([, fi]) => fi.structuralType === 'identifier');
    if (idEntries.length > 0) {
      const [colName, fi] = idEntries[0];
      bindings[compKey]['entity_identifier'] = {
        source_batch_id: batchId,
        column: colName,
        field_identity: fi,
        match_pass: 1,
        confidence: match.matchConfidence,
      };
    }

    // Find temporal column
    const temporalEntries = Object.entries(cap.fieldIdentities)
      .filter(([, fi]) => fi.structuralType === 'temporal');
    if (temporalEntries.length > 0) {
      const [colName, fi] = temporalEntries[0];
      bindings[compKey]['period'] = {
        source_batch_id: batchId,
        column: colName,
        field_identity: fi,
        match_pass: 1,
        confidence: match.matchConfidence,
      };
    }
  }

  // Log complete binding map
  for (const [compKey, cb] of Object.entries(bindings)) {
    const roles = Object.entries(cb)
      .filter(([role]) => role !== 'entity_identifier' && role !== 'period')
      .map(([role, b]) => `${role}=${b.column}`)
      .join(', ');
    if (roles) console.log(`[Convergence] HF-112 ${compKey}: ${roles}`);
  }
}

/**
 * Generate COUNT derivation rules with category+boolean filters.
 */
function generateFilteredCountDerivations(
  component: PlanComponent,
  dataType: string,
  capability: DataCapability
): MetricDerivationRule[] {
  const rules: MetricDerivationRule[] = [];
  const compTokens = tokenize(component.name);

  let bestCatField: { field: string; matchedValue: string } | null = null;
  let bestCatScore = 0;

  for (const catField of capability.categoricalFields) {
    for (const value of catField.distinctValues) {
      const valueTokens = tokenize(value);
      const overlap = compTokens.filter(t =>
        valueTokens.some(v => v.includes(t) || t.includes(v))
      );
      const score = overlap.length / Math.max(valueTokens.length, 1);
      if (score > bestCatScore) {
        bestCatScore = score;
        bestCatField = { field: catField.field, matchedValue: value };
      }
    }
  }

  if (!bestCatField || bestCatScore < 0.3) {
    for (const metricName of component.expectedMetrics) {
      const metricTokens = tokenize(metricName);
      for (const catField of capability.categoricalFields) {
        for (const value of catField.distinctValues) {
          const valueTokens = tokenize(value);
          const overlap = metricTokens.filter(t =>
            valueTokens.some(v => v.includes(t) || t.includes(v))
          );
          const score = overlap.length / Math.max(metricTokens.length, 1);
          if (score > bestCatScore) {
            bestCatScore = score;
            bestCatField = { field: catField.field, matchedValue: value };
          }
        }
      }
    }
  }

  if (!bestCatField) return rules;

  const filters: MetricDerivationRule['filters'] = [
    { field: bestCatField.field, operator: 'eq', value: bestCatField.matchedValue },
  ];

  if (capability.booleanFields.length > 0) {
    const qualField = capability.booleanFields[0];
    filters.push({ field: qualField.field, operator: 'eq', value: qualField.trueValue });
  }

  for (const metricName of component.expectedMetrics) {
    rules.push({
      metric: metricName,
      operation: 'count',
      source_pattern: dataType,
      filters,
    });
  }

  return rules;
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
  supabase: SupabaseClient,
  tenantId: string,
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

  // 2. Get sample rows
  // HF-196 Phase 1E: filter out superseded batches per Rule 30.
  const { fetchSupersededBatchIds: fetchSupersededBatchIds2 } = await import('@/lib/sci/import-batch-supersession');
  const supersededIds3 = await fetchSupersededBatchIds2(supabase, tenantId);
  let q3 = supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', tenantId)
    .not('row_data', 'is', null)
    .limit(3);
  if (supersededIds3.length > 0) q3 = q3.not('import_batch_id', 'in', `(${supersededIds3.join(',')})`);
  const { data: sampleRows } = await q3;

  const sampleData = (sampleRows || []).map(r => r.row_data);

  // 3. Build AI prompt — enriched with metric labels and component context (OB-191)
  // Korean Test: No hardcoded field names. AI receives column metadata and sample values at runtime.
  const metricDescriptions = metricContexts.map(mc => {
    let desc = `- ${mc.name} (label: "${mc.label}", used in: ${mc.operation}, component: "${mc.componentName}")`;
    if (mc.scope) desc += `\n  NOTE: This metric should be aggregated at the ${mc.scope} scope level`;
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

Operations:
- sum: SUM a numeric field, optionally filtered by a categorical field value
- count: COUNT rows, optionally filtered by a categorical field value
- ratio: Divide one derived metric by another
- delta: Difference between two values

Respond with ONLY valid JSON, no markdown, no explanation:
{
  "derivations": [
    {
      "metric": "the_metric_name",
      "operation": "sum",
      "source_field": "column_name_to_aggregate",
      "filters": [
        { "field": "column_name", "operator": "eq", "value": "filter_value" }
      ]
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

Data sample (first ${sampleData.length} rows):
${JSON.stringify(sampleData, null, 2)}

Generate derivation rules for each required metric. Use filters to narrow broad fields to specific subsets when the metric label implies a category.`;

  // 4. Call AI
  try {
    const aiService = getAIService();
    const response = await aiService.execute({
      task: 'natural_language_query',
      input: { question: userPrompt, context: {} },
      options: { responseFormat: 'json', maxTokens: 4096, temperature: 0 },
    }, false);

    // 5. Parse response — handle different response shapes
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

        derivations.push({
          metric,
          operation: operation as MetricDerivationRule['operation'],
          source_pattern: sourcePattern,
          source_field: d.source_field ? String(d.source_field) : undefined,
          filters,
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

    // 6. Check for metrics that AI didn't address
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

  const variants = (cj.variants as Array<Record<string, unknown>>) ?? [];
  const comps = (variants[0]?.components as Array<Record<string, unknown>>) ?? [];
  const comp = comps[componentIndex];
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
