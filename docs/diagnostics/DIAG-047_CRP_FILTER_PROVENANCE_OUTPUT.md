# DIAG-047 -- CRP Filter Provenance Output

**Date:** 2026-05-15
**Branch:** diag-047-crp-filter-provenance
**HEAD commit:** d8b4640a9f1811a81d02a9c51eef178734694c3d (pre-Phase-0 base; updated below each phase)
**Scope:** How does a product_category filter flow through signal write -> signal read -> derivation construction -> engine application?

CC pastes verbatim code at every section. No interpretation. No PASS/FAIL. No design proposals.

## Phase 1 -- Signal writer

### 1.1 Full file read of `web/src/lib/compensation/plan-comprehension-emitter.ts`

`wc -l web/src/lib/compensation/plan-comprehension-emitter.ts`:

```
     134 web/src/lib/compensation/plan-comprehension-emitter.ts
```

Full file:

```typescript
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

// OB-199 Phase 4: canonical writer migration. The load-bearing emitter for
// comprehension:plan_interpretation now routes through DS-023 §5.1 single
// entry point; §5.2 enforces Decision 30 v2 inclusive bound.
import { writeSignalBatch, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';

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

    try {
      const result = await writeSignalBatch(
        signals,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      console.log(`[PlanComprehensionEmitter] Emitted ${result.count} comprehension:plan_interpretation signals (rule_set=${args.ruleSetId}; observability_signals=${result.observabilitySignalsEmitted})`);
      return { emitted: result.count, errors: 0 };
    } catch (err) {
      if (err instanceof CanonicalWriteError) {
        console.warn(`[PlanComprehensionEmitter] Batch CanonicalWriteError (${err.cause}): ${err.message}`);
      } else {
        console.warn('[PlanComprehensionEmitter] Batch unexpected error:', err instanceof Error ? err.message : String(err));
      }
      return { emitted: 0, errors: signals.length };
    }
  } catch (err) {
    console.warn('[PlanComprehensionEmitter] Exception (non-blocking):', err instanceof Error ? err.message : String(err));
    return { emitted: 0, errors: 1 };
  }
}
```

### 1.2 Emitter call sites

`grep -rn "PlanComprehensionEmitter\|planComprehensionEmitter\|comprehensionEmitter\|emitComprehension\|emitPlanComprehension" web/src/ --include="*.ts"`:

```
web/src/app/api/import/sci/execute/route.ts:1257:    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
web/src/app/api/import/sci/execute/route.ts:1259:    void emitPlanComprehensionSignals({
web/src/app/api/import/sci/execute/route.ts:1508:    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
web/src/app/api/import/sci/execute/route.ts:1510:    void emitPlanComprehensionSignals({
web/src/lib/compensation/plan-comprehension-emitter.ts:58:export async function emitPlanComprehensionSignals(
web/src/lib/compensation/plan-comprehension-emitter.ts:120:      console.log(`[PlanComprehensionEmitter] Emitted ${result.count} comprehension:plan_interpretation signals (rule_set=${args.ruleSetId}; observability_signals=${result.observabilitySignalsEmitted})`);
web/src/lib/compensation/plan-comprehension-emitter.ts:124:        console.warn(`[PlanComprehensionEmitter] Batch CanonicalWriteError (${err.cause}): ${err.message}`);
web/src/lib/compensation/plan-comprehension-emitter.ts:126:        console.warn('[PlanComprehensionEmitter] Batch unexpected error:', err instanceof Error ? err.message : String(err));
web/src/lib/compensation/plan-comprehension-emitter.ts:131:    console.warn('[PlanComprehensionEmitter] Exception (non-blocking):', err instanceof Error ? err.message : String(err));
```

Caller context at `execute/route.ts` line ~1257 (batched plan path):

```typescript
  const variants = engineFormat.components.variants || [];
  const componentCount = variants.reduce((sum: number, v: { components?: unknown[] }) => sum + (v.components?.length || 0), 0);
  console.log(`[SCI Execute] Batched plan saved: ${planName} (${ruleSetId}), ${variants.length} variants, ${componentCount} components from ${planUnits.length} sheets`);

  // HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2)
  // so convergence Pass 4 reads authoritative semantic intent before AI derivation.
  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
  // signal carries plan-agent reasoning verbatim. PlanComponent (engine-format) drops
  // reasoning during convertComponent; routing to interpretation.components preserves it.
  try {
    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
    void emitPlanComprehensionSignals({
      tenantId,
      ruleSetId,
      interpretation: { components: componentsForSignals },
      planConfidence: response.confidence,
    });
  } catch (sigErr) {
    console.warn('[SCI Execute] Plan comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
  }
```

Caller context at `execute/route.ts` line ~1508 (per-unit plan path):

```typescript
  const variants = engineFormat.components.variants || [];
  const componentCount = variants.reduce((sum: number, v: { components?: unknown[] }) => sum + (v.components?.length || 0), 0);
  console.log(`[SCI Execute] Plan saved: ${planName} (${ruleSetId}), ${variants.length} variants, ${componentCount} components`);

  // HF-198 E5 + HF-201: Emit per-component comprehension:plan_interpretation signals (L2).
  // HF-201 Shape B: pass plan-agent's original output (interpretation.components) so the
  // signal carries plan-agent reasoning verbatim.
  try {
    const { emitPlanComprehensionSignals } = await import('@/lib/compensation/plan-comprehension-emitter');
    const componentsForSignals = (interpretation.components ?? []) as unknown as Array<Record<string, unknown>>;
    void emitPlanComprehensionSignals({
      tenantId,
      ruleSetId,
      interpretation: { components: componentsForSignals },
      planConfidence: response.confidence,
    });
  } catch (sigErr) {
    console.warn('[SCI Execute] Plan comprehension signal emission threw (non-blocking):', sigErr instanceof Error ? sigErr.message : String(sigErr));
  }
```

### 1.3 CRP Plan 1 signal_value content from the database

Command: `cd web && set -a && source .env.local && set +a && npx tsx scripts/diag047-signal-content.ts`

```
Rule set: Capital Equipment Commission Plan (7ae0fba1-83fe-4674-8664-e6516bb370c9, created: 2026-05-15T11:35:43.089993+00:00)

Total signals for this rule_set: 2

---
signal_type: comprehension:plan_interpretation
confidence: 1
signal_value: {
  "metric_op": "linear_function",
  "component_id": "senior_rep_commission",
  "metric_label": "Senior Rep Equipment Commission",
  "metric_inputs": {
    "source": "metric",
    "sourceSpec": {
      "field": "period_equipment_revenue"
    }
  },
  "component_type": "linear_function",
  "semantic_intent": "Document explicitly states linear formula: Commission = (Rate x Period Equipment Revenue) + Period Base Draw. For Senior Rep: 6.0% rate and $200 base draw.",
  "source_evidence": {
    "rule_set_id": "7ae0fba1-83fe-4674-8664-e6516bb370c9",
    "plan_confidence": 1,
    "component_confidence": 1
  }
}

---
signal_type: comprehension:plan_interpretation
confidence: 1
signal_value: {
  "metric_op": "linear_function",
  "component_id": "rep_commission",
  "metric_label": "Rep Equipment Commission",
  "metric_inputs": {
    "source": "metric",
    "sourceSpec": {
      "field": "period_equipment_revenue"
    }
  },
  "component_type": "linear_function",
  "semantic_intent": "Document explicitly states linear formula: Commission = (Rate x Period Equipment Revenue) + Period Base Draw. For Rep: 4.0% rate and $150 base draw.",
  "source_evidence": {
    "rule_set_id": "7ae0fba1-83fe-4674-8664-e6516bb370c9",
    "plan_confidence": 1,
    "component_confidence": 1
  }
}
```

The script's secondary `>>> Signal … CONTAINS filter/product_category/Capital Equipment reference` scan printed nothing for either signal — the substring check (`filter` | `product_category` | `Capital Equipment`) found no match in either `signal_value` payload.
