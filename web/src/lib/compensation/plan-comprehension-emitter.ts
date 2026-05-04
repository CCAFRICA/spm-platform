/**
 * HF-198 E5 — Plan-agent comprehension as L2 signal
 *
 * Emits one `comprehension:plan_interpretation` signal per plan component
 * after rule_set save. Signal carries the metric semantic intent (label, op,
 * inputs, source evidence) so downstream consumers (convergence Pass 4) can
 * read authoritative semantic intent rather than re-deriving it.
 *
 * Read-coupling per AUD-004 v3 §2 E3:
 *   - signal_level: L2 (Comprehension)
 *   - originating_flywheel: tenant
 *   - declared_writers: this module
 *   - declared_readers: web/src/lib/intelligence/convergence-service.ts
 *     (loadMetricComprehensionSignals)
 *
 * Korean Test (AP-25 / Decision 154): signal_type is governance vocabulary
 * ('comprehension:plan_interpretation'); per-metric payload is structural
 * (label/op/inputs from plan-agent output, no language-specific lexicon).
 *
 * Fire-and-forget per signal-write discipline; never throws; rule_set save
 * succeeds independently.
 */

import { persistSignalBatch } from '@/lib/ai/signal-persistence';

interface PlanInterpretationLike {
  components?: Array<Record<string, unknown>>;
}

interface ComponentLike {
  id?: string;
  name?: string;
  type?: string;
  calculationMethod?: { type?: string; [key: string]: unknown } | null;
  calculationIntent?: Record<string, unknown> | null;
  confidence?: number;
  reasoning?: string;
  expectedMetrics?: string[];
  metrics?: Array<{ metric?: string; metricLabel?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * Emit one `comprehension:plan_interpretation` signal per plan component.
 *
 * Each signal carries:
 *   - metric_label: human-readable component name
 *   - metric_op: operation type (from calculationMethod.type or calculationIntent)
 *   - metric_inputs: input shape (from calculationIntent.input or method-specific config)
 *   - semantic_intent: AI reasoning text from plan-agent output
 *   - source_evidence: { rule_set_id, plan_confidence }
 *
 * Returns { emitted, errors }; never throws.
 */
export async function emitPlanComprehensionSignals(
  args: {
    tenantId: string;
    ruleSetId: string;
    interpretation: PlanInterpretationLike;
    planConfidence?: number;
  },
): Promise<{ emitted: number; errors: number }> {
  try {
    const components = Array.isArray(args.interpretation.components) ? args.interpretation.components : [];
    if (components.length === 0) {
      return { emitted: 0, errors: 0 };
    }

    const signals = components.map((rawComp) => {
      const comp = rawComp as ComponentLike;
      const calcMethod = (comp.calculationMethod ?? {}) as { type?: string };
      const calcIntent = (comp.calculationIntent ?? null) as Record<string, unknown> | null;

      // metric_op: prefer calculationIntent.calculationType (structural intent), then calculationMethod.type
      const metricOp =
        (calcIntent?.calculationType as string | undefined) ??
        calcMethod?.type ??
        comp.type ??
        'unknown';

      // metric_inputs: extract from calculationIntent.input, or fall back to expectedMetrics list
      const metricInputs =
        (calcIntent?.input as Record<string, unknown> | undefined) ??
        (comp.expectedMetrics ? { expectedMetrics: comp.expectedMetrics } : null);

      const signalValue: Record<string, unknown> = {
        metric_label: comp.name ?? comp.id ?? 'unnamed_component',
        metric_op: metricOp,
        metric_inputs: metricInputs,
        semantic_intent: comp.reasoning ?? null,
        component_id: comp.id ?? null,
        component_type: comp.type ?? null,
        source_evidence: {
          rule_set_id: args.ruleSetId,
          plan_confidence: args.planConfidence ?? null,
          component_confidence: comp.confidence ?? null,
        },
      };

      const conf = comp.confidence ?? args.planConfidence;
      return {
        tenantId: args.tenantId,
        signalType: 'comprehension:plan_interpretation',
        signalValue,
        confidence: typeof conf === 'number' ? conf : undefined,
        source: 'ai_prediction' as const,
        ruleSetId: args.ruleSetId,
      };
    });

    const result = await persistSignalBatch(
      signals,
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    if (!result.success) {
      console.warn(`[PlanComprehensionEmitter] Batch persist failed (non-blocking): ${result.error}`);
      return { emitted: 0, errors: signals.length };
    }
    console.log(`[PlanComprehensionEmitter] Emitted ${result.count} comprehension:plan_interpretation signals (rule_set=${args.ruleSetId})`);
    return { emitted: result.count, errors: 0 };
  } catch (err) {
    console.warn('[PlanComprehensionEmitter] Exception (non-blocking):', err instanceof Error ? err.message : String(err));
    return { emitted: 0, errors: 1 };
  }
}
