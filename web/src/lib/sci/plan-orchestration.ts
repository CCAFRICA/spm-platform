/**
 * HF-248 — Per-component plan interpretation orchestration.
 *
 * Two-phase replacement for the monolithic `interpretPlan` call:
 *
 *   Phase A (plan_skeleton):   single small LLM call that emits ruleSetName,
 *                              employeeTypes, and a componentIndex array.
 *                              No calculationIntent here. Tiny output —
 *                              never hits max_tokens for typical plans.
 *
 *   Phase B (plan_component):  one LLM call per component in the index.
 *                              Each call sees the full plan document + the
 *                              component's briefSemantic from Phase A, and
 *                              emits ONLY that component's calculationIntent
 *                              tree. Each call fits comfortably in max_tokens.
 *
 * The orchestrator assembles Phase A's skeleton + Phase B's component trees
 * into the same PlanInterpretation shape that `bridgeAIToEngineFormat`
 * already consumes. No changes downstream.
 *
 * Per Decision 151 / T1-E910 v2: the LLM emits compositions per component,
 * not monolithic plans. The grammar is the canonical declaration; each
 * component's tree is a self-contained composition.
 *
 * Phase 2 (interpretation-errors.ts) and Phase 3 (componentOutcomes
 * persistence) extend this orchestrator without changing its surface.
 */

import { getAIService } from '@/lib/ai';
import { validateComponentIntent } from '@/lib/calculation/prime-validator';
// HF-341 R3: the CompositionalIntent shape layer (intent-constructor / compositional-intent) is
// eradicated — the LLM emits the calculationIntent PrimeNode DAG directly and validateComponentIntent
// (the structural verifier) is the construction layer. constructTree / ConstructionError /
// MissingCompositionalIntentError / StructuralCoherenceError / assertRatioBandScaleCoherence and the
// HF-271 collectDeclaredRatios/collectTwoFieldDivides ratio-proofread are gone.
// HF-272: the extractReferencesFromDAG import (HF-270 gate's reference-leaf walk) was
// removed with the interpretation-time field-resolution gate (Phase 2.1). The canonical
// walk still lives in convergence-service for the calc-time resolution path.
// HF-252: prime-assembler imports retired from the plan_component call path
// per T0-E03 single-pipeline restoration. The assembler module file is
// preserved per DD-7 (no smuggled expansion); formal file deprecation is
// HF-255. Construction pathway is the sole route.
import {
  classifyInterpretationError,
  retryPolicy,
  type InterpretationErrorClass,
  type ComponentOutcome,
} from './interpretation-errors';

export interface SkeletonComponentEntry {
  id: string;
  name: string;
  nameEs?: string;
  appliesToEmployeeTypes: string[];
  briefSemantic: string;
  rateTableCellCount?: number;
  confidence?: number;
}

export interface OrchestrationInput {
  documentContent: string;
  format: 'text' | 'pdf';
  pdfBase64?: string;
  pdfMediaType?: string;
  signalContext: { tenantId: string; userId?: string };
  /**
   * HF-248 Phase 3: reimport-resume. Component IDs whose calculationIntent
   * was successfully validated on a prior attempt. The orchestrator SKIPS
   * the per-component LLM call for these IDs and reuses the cached tree.
   * Provided via priorComponents.
   */
  resumeSkipIds?: Set<string>;
  /**
   * HF-248 Phase 3: per-component results from a prior partial-success
   * import. Keyed by component id. When resumeSkipIds is non-empty, the
   * orchestrator pulls the calculationIntent + rateTableCellCount + name
   * for skipped components from this map.
   */
  priorComponents?: Map<string, OrchestratedComponent>;
  /**
   * HF-272: the runtime comprehended-field set (HC of the data sheets in this
   * import). Used as an INFORMATIONAL prompt hint only (a hint, not a gate; T1-E902);
   * the HF-270 membership enforcement and the `requiredInputs` fallback were removed
   * (AUD-009). Absent/empty (plan-only import) → no field hint; the LLM defines fields
   * from plan prose and convergence resolves them against real columns at calc time.
   */
  fieldComprehension?: Array<{ field: string; meaning: string; role: string }>;
}

export interface OrchestratedComponent {
  id: string;
  name: string;
  nameEs?: string;
  type: string;
  appliesToEmployeeTypes: string[];
  calculationIntent?: Record<string, unknown>;
  calculationMethod?: Record<string, unknown>;
  rateTableCellCount?: number;
  confidence: number;
  reasoning: string;
  /**
   * HF-251: orchestration-time metadata extension carried alongside the
   * component. Populated with construction_method + compositional_intent
   * for downstream signal-surface writers (Decision 153 L2 signals).
   */
  metadataExtension?: Record<string, unknown>;
}

export interface OrchestrationResult {
  /**
   * Assembled PlanInterpretation shape ready for bridgeAIToEngineFormat.
   * Empty .components when no component succeeded — caller's failure guard
   * (HF-247 Phase 3) catches and refuses to persist.
   */
  interpretation: {
    ruleSetName: string;
    ruleSetNameEs?: string;
    description: string;
    currency: string;
    cadence: string;
    employeeTypes: Array<{ id: string; name: string; nameEs?: string }>;
    components: OrchestratedComponent[];
    requiredInputs: Array<Record<string, unknown>>;
    workedExamples: Array<Record<string, unknown>>;
    confidence: number;
    reasoning: string;
    fallback?: boolean;
    error?: string;
    parseError?: boolean;
  };
  componentOutcomes: ComponentOutcome[];
  partialSuccess: boolean;
  retryableFailures: string[];
  skeletonError?: string;
}

/**
 * Run the two-phase plan interpretation. Returns the assembled
 * PlanInterpretation plus per-component outcome records.
 *
 * The orchestrator does NOT supersede prior rule_sets, persist signals, or
 * call bridgeAIToEngineFormat — those remain the caller's responsibility
 * (web/src/lib/sci/plan-interpretation.ts). This separation keeps the
 * orchestrator a pure interpretation function.
 */
export async function orchestratePerComponentInterpretation(
  input: OrchestrationInput,
): Promise<OrchestrationResult> {
  const aiService = getAIService();

  // ── Phase A: skeleton ────────────────────────────────────────────────
  console.log(`[plan-orchestrator] Phase A skeleton call — ${input.documentContent.length} chars`);
  const skeletonStart = Date.now();
  let skeletonRaw: Record<string, unknown>;
  try {
    const resp = await aiService.interpretPlanSkeleton(
      input.documentContent,
      input.format,
      input.signalContext,
      input.pdfBase64,
      input.pdfMediaType,
    );
    skeletonRaw = (resp.result ?? {}) as Record<string, unknown>;
  } catch (err) {
    const errClass = classifyInterpretationError(err);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[plan-orchestrator] Phase A skeleton call FAILED errClass=${errClass} message=${message}`);
    return emptyOrchestrationResult({
      ruleSetName: 'Unnamed Plan',
      reasoning: '',
      skeletonError: `Skeleton call failed (${errClass}): ${message}`,
    });
  }

  const skeletonLatency = Date.now() - skeletonStart;
  if (skeletonRaw.parseError || skeletonRaw.error || skeletonRaw.fallback) {
    const reason = String(skeletonRaw.error || (skeletonRaw.parseError ? 'JSON parse failed' : 'Fallback returned'));
    console.error(`[plan-orchestrator] Phase A skeleton response invalid (${skeletonLatency}ms): ${reason}`);
    return emptyOrchestrationResult({
      ruleSetName: 'Unnamed Plan',
      reasoning: '',
      skeletonError: reason,
    });
  }

  const componentIndex = Array.isArray(skeletonRaw.componentIndex) ? skeletonRaw.componentIndex : [];
  console.log(`[plan-orchestrator] Phase A skeleton complete (${skeletonLatency}ms) — ${componentIndex.length} components in index`);
  if (componentIndex.length === 0) {
    return emptyOrchestrationResult({
      ruleSetName: String(skeletonRaw.ruleSetName ?? 'Unnamed Plan'),
      reasoning: String(skeletonRaw.reasoning ?? ''),
      skeletonError: 'Skeleton returned zero components',
    });
  }

  // ── HF-272: resolve the field anchor as the HC-of-data-sheets set ONLY (real runtime
  // comprehension of the columns physically present in THIS import). The HF-270
  // `requiredInputs` fallback was REMOVED (AUD-009): the plan's declared-input list is
  // structurally incomplete for ratio sub-fields and must not bias recognition even as a
  // prompt hint. When no data sheet accompanies the plan, the anchor is EMPTY and the
  // per-component prompt carries no field hint — the LLM defines fields from plan prose,
  // and convergence resolves those named tokens against real columns at calc time. The
  // anchor is now INFORMATIONAL ONLY (a hint, not a gate): the interpretation-time
  // membership rejection it once fed was removed in Phase 2.1. Korean Test: the set is
  // runtime HC output for this upload — no enumerated vocabulary, no synonym table.
  const fieldAnchor: Array<{ field: string; meaning: string; role: string }> =
    input.fieldComprehension && input.fieldComprehension.length > 0
      ? input.fieldComprehension
      : [];
  const fieldAnchorSource =
    fieldAnchor.length > 0 ? 'HC-data-sheets' : 'none';
  console.log(`[plan-orchestrator] HF-272 field hint = ${fieldAnchorSource} (${fieldAnchor.length} fields)`);

  // ── Phase B: per-component (HF-259 Q4: bounded-concurrency parallel) ──────────
  // The N component phases are independent (each receives the full manifest + its own
  // componentSpec); they run with BOUNDED concurrency instead of sequentially, collapsing
  // ~(sum of components) into ~(max within the limit). Per-component inputs, retry, and
  // construction are UNCHANGED — only scheduling differs (DD-7: outputs byte-identical to
  // sequential). Results are assembled in componentIndex order, so components[]/outcomes[]
  // are identical in content and order to the prior sequential build.
  const skipIds = input.resumeSkipIds ?? new Set<string>();
  const PHASE_B_CONCURRENCY = 4; // bounded fan-out (not unbounded) — avoids rate-limit storms
  const entries = componentIndex as Array<Record<string, unknown>>;

  type IndexedComponentResult = { component: OrchestratedComponent | null; outcome: ComponentOutcome };

  const runOne = async (rawEntry: Record<string, unknown>, index: number): Promise<IndexedComponentResult> => {
    const compId = String(rawEntry.id ?? `comp-${index}`);
    const compName = String(rawEntry.name ?? `Component ${index + 1}`);
    const compNameEs = rawEntry.nameEs ? String(rawEntry.nameEs) : undefined;
    const appliesTo = Array.isArray(rawEntry.appliesToEmployeeTypes)
      ? (rawEntry.appliesToEmployeeTypes as unknown[]).map(String)
      : ['all'];
    const briefSemantic = String(rawEntry.briefSemantic ?? '');
    const rateTableCellCount = typeof rawEntry.rateTableCellCount === 'number' && rawEntry.rateTableCellCount > 0
      ? Math.floor(rawEntry.rateTableCellCount)
      : undefined;

    // HF-248 Phase 3: resume — skip this component if it succeeded on a prior import.
    if (skipIds.has(compId) && input.priorComponents?.has(compId)) {
      const cached = input.priorComponents.get(compId)!;
      console.log(`[plan-component] SKIPPED (reimport-resume) component=${compId} name="${cached.name}" — reusing prior successful tree`);
      return {
        component: cached,
        outcome: { id: compId, name: cached.name, status: 'success', attempts: 0, skippedFromPrior: true, lastAttemptAt: new Date().toISOString() },
      };
    }

    // Per-component call with bounded retry (unchanged).
    const componentResult = await callPlanComponentWithRetry({
      documentContent: input.documentContent,
      format: input.format,
      pdfBase64: input.pdfBase64,
      pdfMediaType: input.pdfMediaType,
      signalContext: input.signalContext,
      componentSpec: { id: compId, name: compName, nameEs: compNameEs, appliesToEmployeeTypes: appliesTo, briefSemantic, rateTableCellCount },
      fieldAnchor, // HF-272: informational HC-of-data-sheets field hint (not a gate)
    });

    if (!componentResult.component) {
      // HF-280: carry the variant/category onto the failed outcome so the
      // import-atomicity guard (plan-interpretation.ts) can name which variant
      // the failed component belongs to. Display data only — not a predicate.
      return { component: null, outcome: { ...componentResult.outcome, appliesTo } };
    }
    // HF-252 / HF-341 R3: the LLM's top-level `applies_to` takes precedence over the skeleton's value.
    // (Carried on metadataExtension.applies_to from the prime-DAG-direct response field.)
    const intentAppliesTo = (componentResult.component.metadataExtension as
      | { applies_to?: unknown } | undefined)?.applies_to;
    const resolvedAppliesTo: string[] =
      Array.isArray(intentAppliesTo) && intentAppliesTo.length > 0
        ? (intentAppliesTo as unknown[]).map(String)
        : appliesTo;
    return {
      component: {
        id: compId,
        name: compName,
        nameEs: compNameEs,
        type: 'prime_dag',
        appliesToEmployeeTypes: resolvedAppliesTo,
        calculationIntent: componentResult.component.calculationIntent,
        calculationMethod: componentResult.component.calculationMethod ?? { type: 'prime_dag' },
        rateTableCellCount,
        confidence: componentResult.component.confidence ?? 0.8,
        reasoning: componentResult.component.reasoning ?? '',
        metadataExtension: componentResult.component.metadataExtension,
      },
      outcome: componentResult.outcome,
    };
  };

  // Order-preserving bounded-concurrency pool: a shared cursor hands indices to N workers;
  // each result is written to its index slot, so assembly order == componentIndex order.
  const indexed: IndexedComponentResult[] = new Array(entries.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const i = cursor++;
      if (i >= entries.length) return;
      indexed[i] = await runOne(entries[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PHASE_B_CONCURRENCY, entries.length) }, () => worker()),
  );

  const components: OrchestratedComponent[] = [];
  const outcomes: ComponentOutcome[] = [];
  for (const r of indexed) {
    outcomes.push(r.outcome);
    if (r.component) components.push(r.component);
  }

  const successCount = outcomes.filter(o => o.status === 'success').length;
  const failureOutcomes = outcomes.filter(o => o.status === 'failed');
  const partialSuccess = successCount > 0 && failureOutcomes.length > 0;
  // Retryable failures: adapter-class errors are retryable on next reimport.
  // Cognition-class errors are deterministic — the LLM emission for this
  // component is wrong; reimporting with the same input won't change it.
  const retryableClasses: InterpretationErrorClass[] = [
    'adapter_rate_limit',
    'adapter_overloaded',
    'adapter_timeout',
    'adapter_transient',
    'unknown',
  ];
  const retryableFailures = failureOutcomes
    .filter(o => o.errClass !== undefined && retryableClasses.includes(o.errClass))
    .map(o => o.id);

  console.log(
    `[plan-orchestrator] Phase B complete — ${successCount}/${componentIndex.length} components succeeded, ` +
      `${failureOutcomes.length} failed (${retryableFailures.length} retryable on reimport)`,
  );

  return {
    interpretation: {
      ruleSetName: String(skeletonRaw.ruleSetName ?? 'Unnamed Plan'),
      ruleSetNameEs: skeletonRaw.ruleSetNameEs ? String(skeletonRaw.ruleSetNameEs) : undefined,
      description: String(skeletonRaw.description ?? ''),
      currency: String(skeletonRaw.currency ?? 'USD'),
      cadence: String(skeletonRaw.cadence ?? 'monthly'),
      employeeTypes: Array.isArray(skeletonRaw.employeeTypes)
        ? (skeletonRaw.employeeTypes as Array<Record<string, unknown>>).map(et => ({
            id: String(et.id ?? ''),
            name: String(et.name ?? ''),
            nameEs: et.nameEs ? String(et.nameEs) : undefined,
          }))
        : [],
      components,
      requiredInputs: Array.isArray(skeletonRaw.requiredInputs)
        ? (skeletonRaw.requiredInputs as Array<Record<string, unknown>>)
        : [],
      workedExamples: [],
      confidence: typeof skeletonRaw.confidence === 'number' ? skeletonRaw.confidence : 0,
      reasoning: String(skeletonRaw.reasoning ?? ''),
    },
    componentOutcomes: outcomes,
    partialSuccess,
    retryableFailures,
  };
}

interface PerComponentCallArgs {
  documentContent: string;
  format: 'text' | 'pdf';
  pdfBase64?: string;
  pdfMediaType?: string;
  signalContext: { tenantId: string; userId?: string };
  componentSpec: {
    id: string;
    name: string;
    nameEs?: string;
    appliesToEmployeeTypes: string[];
    briefSemantic: string;
    rateTableCellCount?: number;
  };
  // HF-272: informational field hint (HC of data sheets only; empty on plan-only import).
  // Forwarded into the adapter prompt as context — NOT a gate (the HF-270 enforcement was removed).
  fieldAnchor: Array<{ field: string; meaning: string; role: string }>;
}

interface PerComponentCallResult {
  component: {
    calculationIntent?: Record<string, unknown>;
    calculationMethod?: Record<string, unknown>;
    confidence?: number;
    reasoning?: string;
    /** HF-251: carries construction_method + compositional_intent for the component's persisted metadata. */
    metadataExtension?: Record<string, unknown>;
  } | null;
  outcome: ComponentOutcome;
}

// HF-252: shouldUseChunking and the Mode A/B dispatch retired entirely per
// T0-E03 (Single Pipeline) restoration. Construction pathway (Decision 158)
// is the sole plan-interpretation route. The function's prior body —
// `rateTableCellCount > 15 → chunking` — is irrelevant under the construction
// pathway because the LLM emits a compact CompositionalIntent regardless of
// component complexity. Formal removal from compilation per AP-17. See HF-255
// for the prime-assembler.ts file-level deprecation.

// ─────────────────────────────────────────────
// HF-271: structural-coherence proofread helpers
// ─────────────────────────────────────────────
//
// Pure structure-to-structure traversal — no catalog, no field literals, no shape names.

async function callPlanComponentWithRetry(args: PerComponentCallArgs): Promise<PerComponentCallResult> {
  const aiService = getAIService();
  const spec = args.componentSpec;
  let attempt = 0;
  let lastErrClass: InterpretationErrorClass = 'unknown';
  let lastErrMessage = '';
  let lastHttpStatus: number | undefined;
  let lastViolations: string | undefined;

  console.log(
    `[plan-component] mode=construction component=${spec.id} name="${spec.name}" ` +
      `rateTableCellCount=${spec.rateTableCellCount ?? '(absent)'}`,
  );

  // HF-251 — Decision 158 pathway: the LLM emits a compact CompositionalIntent
  // describing the component's structure; the deterministic constructor (see
  // intent-constructor.ts) builds the PrimeNode tree from the intent. Tree
  // emission is no longer the LLM's responsibility; the LLM does recognition,
  // code does construction. Mode A/B chunking dispatch from HF-250 is retired
  // (the intent is always small enough for a single LLM call).
  //
  // HF-252: legacy fallback removed. A response without compositional_intent
  // raises MissingCompositionalIntentError → cognition_violation per the
  // HF-248 error class taxonomy. Single pipeline per T0-E03 / AP-17.
  while (true) {
    attempt += 1;
    const callStart = Date.now();
    try {
      const resp = await aiService.interpretPlanComponent(
        args.documentContent,
        args.format,
        spec,
        args.signalContext,
        args.pdfBase64,
        args.pdfMediaType,
        args.fieldAnchor, // HF-272: informational HC field hint for the prompt (not a gate)
        // HF-280: on retry after a cognition violation (e.g. the HF-279 coherence
        // invariant — "emit breaks in the quotient's own space; scale: null for
        // ratio-source bands"), feed the structured error back to the model VERBATIM
        // so it receives WHAT was violated. Without this an identical temperature-0
        // prompt deterministically re-emits the identical violation (proven: BCL
        // c2-ejecutivo attempts=3, same cognition_violation each time). Pass-through
        // only — no rewriting, no cause-specific templates (Korean Test).
        attempt > 1 && lastErrClass === 'cognition_violation' ? lastErrMessage : undefined,
      );
      const result = (resp.result ?? {}) as Record<string, unknown>;
      const latency = Date.now() - callStart;

      // Adapter-layer parse failure surfaces as .parseError / .error.
      if (result.parseError || result.error || result.fallback) {
        const message = String(result.error || (result.parseError ? 'JSON parse failed' : 'Fallback returned'));
        lastErrClass = classifyInterpretationError(null, result);
        lastErrMessage = message;
        console.log(
          `[plan-component] FAILED component=${spec.id} name="${spec.name}" errClass=${lastErrClass} ` +
            `attempt=${attempt}/${retryPolicy(lastErrClass).maxAttempts} latencyMs=${latency} message=${message}`,
        );
      } else {
        // HF-341 R3: the LLM emits the calculationIntent PrimeNode DAG DIRECTLY (the engine's
        // computation algebra). There is no CompositionalIntent shape intermediate and no constructTree —
        // CONSTRUCTION IS STRUCTURAL VERIFICATION. validateComponentIntent (PRIME_GRAMMAR /
        // validatePrimeTree) checks the DAG is well-formed (canonical primes, op-in-algebra, arity, child
        // topology, type compatibility) AND the R3-elevated guarantees (Decision-127 half-open band edges,
        // HF-279 scale coherence, terminal completeness, exhaustive emission) and rejects loudly (C2). The
        // engine evaluates the verified DAG; convergence resolves each `reference` token against the real
        // data columns at calc time (Decision 158).
        const intent = result.calculationIntent as Record<string, unknown> | undefined;
        const constructionMethod = 'prime_dag' as const;

        if (!intent || typeof intent.prime !== 'string') {
          // Structured failure: the response carried no PrimeNode calculationIntent.
          lastErrClass = 'cognition_violation';
          lastErrMessage = `[plan-component] "${spec.name}" (id="${spec.id}") emitted no calculationIntent PrimeNode tree (expected a "prime"-discriminated DAG).`;
          console.log(
            `[plan-component] FAILED component=${spec.id} name="${spec.name}" errClass=${lastErrClass} ` +
              `attempt=${attempt}/${retryPolicy(lastErrClass).maxAttempts} latencyMs=${latency} ${lastErrMessage}`,
          );
        } else {
          // Structural verification IS the construction layer (Validation Premise Law).
          const validation = validateComponentIntent(intent, {
            componentLabel: spec.name,
            expectedCellCount: spec.rateTableCellCount,
          });
          if (validation.valid) {
            console.log(
              `[plan-component] SUCCESS component=${spec.id} name="${spec.name}" attempt=${attempt} ` +
                `latencyMs=${latency} method=${constructionMethod}`,
            );
            const metadataExtension: Record<string, unknown> = {
              construction_method: constructionMethod,
            };
            // HF-341 R3: carry the LLM's top-level applies_to (variant routing) onto metadata.
            if (Array.isArray(result.applies_to)) {
              metadataExtension.applies_to = result.applies_to;
            }
            return {
              component: {
                calculationIntent: intent,
                calculationMethod: (result.calculationMethod ?? { type: 'prime_dag' }) as Record<string, unknown>,
                confidence: typeof result.confidence === 'number' ? result.confidence : 0.8,
                reasoning: typeof result.reasoning === 'string' ? result.reasoning : '',
                metadataExtension,
              },
              outcome: {
                id: spec.id,
                name: spec.name,
                status: 'success',
                attempts: attempt,
                lastAttemptAt: new Date().toISOString(),
              },
            };
          }
          const critical = validation.violations.filter(v => v.severity === 'critical');
          lastViolations = critical.map(v => `${v.check}@${v.nodePath}: ${v.message}`).join('; ');
          lastErrClass = critical.some(v => v.check === 'exhaustive_emission')
            ? 'cognition_truncation'
            : 'cognition_violation';
          lastErrMessage = `Validator rejected (${critical.length} critical): ${lastViolations}`;
          console.log(
            `[plan-component] FAILED component=${spec.id} name="${spec.name}" errClass=${lastErrClass} ` +
              `attempt=${attempt}/${retryPolicy(lastErrClass).maxAttempts} latencyMs=${latency} violation="${lastViolations}"`,
          );
        }
      }
    } catch (err) {
      const latency = Date.now() - callStart;
      lastErrClass = classifyInterpretationError(err);
      lastErrMessage = err instanceof Error ? err.message : String(err);
      const statusMatch = lastErrMessage.match(/\b(4\d{2}|5\d{2})\b/);
      lastHttpStatus = statusMatch ? Number(statusMatch[1]) : undefined;
      console.log(
        `[plan-component] FAILED component=${spec.id} name="${spec.name}" errClass=${lastErrClass} ` +
          `attempt=${attempt}/${retryPolicy(lastErrClass).maxAttempts}` +
          `${lastHttpStatus !== undefined ? ` httpStatus=${lastHttpStatus}` : ''} latencyMs=${latency} message=${lastErrMessage}`,
      );
    }

    const policy = retryPolicy(lastErrClass);
    if (attempt >= policy.maxAttempts) {
      return {
        component: null,
        outcome: {
          id: spec.id,
          name: spec.name,
          status: 'failed',
          attempts: attempt,
          errClass: lastErrClass,
          errMessage: lastErrMessage,
          httpStatus: lastHttpStatus,
          violations: lastViolations,
          lastAttemptAt: new Date().toISOString(),
        },
      };
    }

    // Exponential back-off between attempts.
    const delayMs = policy.backoffMs * Math.pow(2, attempt - 1);
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

// HF-252: fetchChunksInParallel removed. The plan_chunk multi-call path
// (HF-249/250) is retired from orchestration per T0-E03 single-pipeline
// restoration. The construction pathway emits a compact CompositionalIntent
// in one call; no chunking is needed. The `interpretPlanChunk` ai-service
// method is preserved (DD-7: no smuggled expansion); formal removal in HF-255.

function emptyOrchestrationResult(
  args: { ruleSetName: string; reasoning: string; skeletonError: string },
): OrchestrationResult {
  return {
    interpretation: {
      ruleSetName: args.ruleSetName,
      description: '',
      currency: 'USD',
      cadence: 'monthly',
      employeeTypes: [],
      components: [],
      requiredInputs: [],
      workedExamples: [],
      confidence: 0,
      reasoning: args.reasoning,
      error: args.skeletonError,
    },
    componentOutcomes: [],
    partialSuccess: false,
    retryableFailures: [],
    skeletonError: args.skeletonError,
  };
}
