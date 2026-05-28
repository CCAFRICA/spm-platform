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
import {
  assembleTree,
  AssemblerCyclicReferenceError,
  AssemblerOrphanChunkError,
  AssemblerUnresolvedReferenceError,
  collectReferences,
  type SkeletonWithChunks,
  type SkeletonNode,
} from '@/lib/calculation/prime-assembler';
import { constructTree } from '@/lib/plan-intelligence/intent-constructor';
import { ConstructionError, type CompositionalIntent } from '@/lib/plan-intelligence/compositional-intent';
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

  // ── Phase B: per-component ──────────────────────────────────────────
  const components: OrchestratedComponent[] = [];
  const outcomes: ComponentOutcome[] = [];
  const skipIds = input.resumeSkipIds ?? new Set<string>();

  for (const rawEntry of componentIndex as Array<Record<string, unknown>>) {
    const compId = String(rawEntry.id ?? `comp-${components.length}`);
    const compName = String(rawEntry.name ?? `Component ${components.length + 1}`);
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
      components.push(cached);
      outcomes.push({
        id: compId,
        name: cached.name,
        status: 'success',
        attempts: 0,
        skippedFromPrior: true,
        lastAttemptAt: new Date().toISOString(),
      });
      console.log(`[plan-component] SKIPPED (reimport-resume) component=${compId} name="${cached.name}" — reusing prior successful tree`);
      continue;
    }

    // Per-component call with bounded retry.
    const componentResult = await callPlanComponentWithRetry({
      documentContent: input.documentContent,
      format: input.format,
      pdfBase64: input.pdfBase64,
      pdfMediaType: input.pdfMediaType,
      signalContext: input.signalContext,
      componentSpec: {
        id: compId,
        name: compName,
        nameEs: compNameEs,
        appliesToEmployeeTypes: appliesTo,
        briefSemantic,
        rateTableCellCount,
      },
    });

    outcomes.push(componentResult.outcome);
    if (componentResult.component) {
      // HF-252: CompositionalIntent.applies_to (from the per-component call)
      // takes precedence over the skeleton's appliesToEmployeeTypes. Per-component
      // emission sees the actual semantics of which variants this component
      // applies to. Falls back to the skeleton value when intent didn't declare.
      const intentAppliesTo = (componentResult.component.metadataExtension?.compositional_intent as
        | { applies_to?: unknown }
        | undefined)?.applies_to;
      const resolvedAppliesTo: string[] =
        Array.isArray(intentAppliesTo) && intentAppliesTo.length > 0
          ? (intentAppliesTo as unknown[]).map(String)
          : appliesTo;

      components.push({
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
      });
    }
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

/**
 * HF-250 Phase 3: mode-selection heuristic for the per-component call.
 *
 * Mode A (direct emission): small components emit a complete tree via the
 * HF-248 plan_component task. Backward-compatible with all components that
 * succeeded pre-HF-249.
 *
 * Mode B (skeleton + per-chunk): large components emit a skeleton via the
 * HF-250 plan_component_with_chunking task (now SKELETON_ONLY mode), then
 * the orchestrator fires plan_chunk LLM calls in parallel for each $ref
 * and the assembler stitches them.
 *
 * Korean Test compliant: the heuristic uses STRUCTURAL signals only
 * (rateTableCellCount from the skeleton call, complexityHint extension
 * point). No domain vocabulary. Threshold is conservative — borderline
 * components route to Mode B (multiple small calls always succeed; one
 * large call may truncate).
 */
// HF-251: shouldUseChunking is RETAINED but no longer dispatched on. Under
// Decision 158 + DS-024, the LLM emits CompositionalIntent (compact —
// typically 200-1000 bytes) regardless of component complexity. The
// constructor builds the tree. There is no token-budget reason to chunk.
// Function preserved for HF-250 backward-compat callers; new code does not
// reference it. Formal deprecation in HF-255.
function shouldUseChunking(spec: PerComponentCallArgs['componentSpec']): boolean {
  if (typeof spec.rateTableCellCount === 'number' && spec.rateTableCellCount > 15) return true;
  return false;
}
// Silence unused-export lint when this function falls out of use post-HF-255.
void shouldUseChunking;

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
  // Backward-compatibility: if the LLM emits the legacy `calculationIntent`
  // tree directly (ignoring the HF-251 prompt), the orchestrator falls back
  // to the HF-249/250 assembler path (assembleTree handles trees without
  // $refs as a no-op; with $refs the existing chunk machinery still runs).
  // This makes HF-251 deploy-able without breaking in-flight emissions.
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
        // HF-251 primary path: detect compositional_intent and construct.
        const compositionalIntentRaw = result.compositional_intent as Record<string, unknown> | undefined;
        const intentRaw = result.calculationIntent as Record<string, unknown> | undefined;
        const chunks = (result.chunks ?? {}) as Record<string, unknown>;
        let intent: Record<string, unknown> | undefined;
        let chunksResolvedCount = 0;
        let constructionMethod: 'compositional_intent' | 'legacy_tree' | 'legacy_skeleton_chunks' = 'legacy_tree';

        try {
          if (compositionalIntentRaw) {
            // HF-251 Decision 158 pathway: LLM emitted a CompositionalIntent.
            // Validate structurally inside constructTree; throw ConstructionError
            // on malformed input (caught below and mapped to error class).
            const ci = compositionalIntentRaw as unknown as CompositionalIntent;
            const constructedTree = constructTree(ci);
            intent = constructedTree as unknown as Record<string, unknown>;
            constructionMethod = 'compositional_intent';
            console.log(
              `[plan-component] constructed component=${spec.id} from compositional_intent ` +
                `shape=${ci.structure?.shape ?? '(unknown)'}`,
            );
          } else if (intentRaw) {
            // Backward-compat: LLM ignored the HF-251 prompt and emitted the
            // legacy calculationIntent tree (HF-249/HF-250 shape). Pass
            // through the assembler — handles direct trees as no-op and
            // skeleton+chunks via fetchChunksInParallel.
            const skeletonWithChunks: SkeletonWithChunks = {
              tree: intentRaw as SkeletonNode,
              chunks: chunks as Record<string, SkeletonNode>,
            };
            const refsBefore = collectReferences(skeletonWithChunks);
            const missingChunkIds = Array.from(refsBefore.referenced).filter(id => !(id in chunks));
            if (missingChunkIds.length > 0) {
              console.log(
                `[plan-skeleton-only] component=${spec.id} legacy skeleton parsed — ${refsBefore.referenced.size} $refs found`,
              );
              const fetched = await fetchChunksInParallel(
                args,
                spec,
                missingChunkIds,
                refsBefore.referencingPaths,
              );
              for (const [id, subtree] of Object.entries(fetched)) {
                (chunks as Record<string, unknown>)[id] = subtree as unknown;
              }
              constructionMethod = 'legacy_skeleton_chunks';
            }
            const assembleResult = assembleTree(skeletonWithChunks);
            intent = assembleResult.tree as Record<string, unknown>;
            chunksResolvedCount = assembleResult.chunksResolved;
          }
        } catch (constructErr) {
          const errLatency = Date.now() - callStart;
          if (constructErr instanceof ConstructionError) {
            // HF-251: constructor rejected the CompositionalIntent.
            // Output-count mismatch / breaks ordering / unknown shape →
            // cognition_violation (LLM's structural recognition was wrong).
            // Exhaustive-emission analog (insufficient outputs for declared
            // dimensions) → cognition_truncation.
            lastErrClass = constructErr.message.includes('output count')
              ? 'cognition_truncation'
              : 'cognition_violation';
            lastErrMessage = constructErr.message;
          } else if (constructErr instanceof AssemblerUnresolvedReferenceError) {
            lastErrClass = 'cognition_truncation';
            lastErrMessage = constructErr.message;
          } else if (constructErr instanceof AssemblerCyclicReferenceError) {
            lastErrClass = 'cognition_violation';
            lastErrMessage = constructErr.message;
          } else if (constructErr instanceof AssemblerOrphanChunkError) {
            lastErrClass = 'cognition_violation';
            lastErrMessage = constructErr.message;
          } else {
            lastErrClass = 'unknown';
            lastErrMessage = constructErr instanceof Error ? constructErr.message : String(constructErr);
          }
          console.log(
            `[plan-component] FAILED component=${spec.id} name="${spec.name}" errClass=${lastErrClass} ` +
              `attempt=${attempt}/${retryPolicy(lastErrClass).maxAttempts} latencyMs=${errLatency} ` +
              `construction="${lastErrMessage}"`,
          );
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
                lastAttemptAt: new Date().toISOString(),
              },
            };
          }
          const delayMs = policy.backoffMs * Math.pow(2, attempt - 1);
          if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
          continue;
        }

        // Validate the constructed/assembled tree against PRIME_GRAMMAR.
        // Under HF-251 the constructor's structural guarantees (exhaustive
        // emission, half-open intervals, terminal completeness) should
        // satisfy the validator on every well-formed intent. Validator-
        // rejections under HF-251 indicate a constructor bug.
        const validation = validateComponentIntent(intent, {
          componentLabel: spec.name,
          expectedCellCount: spec.rateTableCellCount,
        });
        if (validation.valid) {
          console.log(
            `[plan-component] SUCCESS component=${spec.id} name="${spec.name}" attempt=${attempt} ` +
              `latencyMs=${latency} method=${constructionMethod}` +
              `${chunksResolvedCount > 0 ? ` chunksResolved=${chunksResolvedCount}` : ''}`,
          );
          // HF-251: persist the CompositionalIntent in component metadata
          // when present, so the signal surface (Decision 153) carries the
          // semantic structure alongside the tree. Tree shape that the
          // engine consumes is unchanged.
          const metadataExtension: Record<string, unknown> = {
            construction_method: constructionMethod,
          };
          if (compositionalIntentRaw) {
            metadataExtension.compositional_intent = compositionalIntentRaw;
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

/**
 * HF-249 multi-call fallback — fetch missing chunks in parallel via
 * interpretPlanChunk. Each chunk gets one LLM call; total latency is bounded
 * by the slowest chunk (Promise.all), not the sum. Per T1-E947 chunks are
 * independent of each other so parallel emission is scope-correct.
 *
 * Returns a map of chunkId → emitted sub-tree. A chunk that itself fails
 * (parseError / fallback / API throw) is OMITTED from the map; the caller's
 * subsequent assemble step will raise AssemblerUnresolvedReferenceError for
 * the still-missing chunkIds and the orchestrator's existing error-class
 * path takes over.
 */
async function fetchChunksInParallel(
  args: PerComponentCallArgs,
  spec: PerComponentCallArgs['componentSpec'],
  missingChunkIds: string[],
  referencingPaths: Map<string, string>,
): Promise<Record<string, unknown>> {
  const aiService = getAIService();
  const settled = await Promise.allSettled(
    missingChunkIds.map(async chunkId => {
      const chunkStart = Date.now();
      const skeletonPath = referencingPaths.get(chunkId) ?? '$';
      try {
        const resp = await aiService.interpretPlanChunk(
          args.documentContent,
          args.format,
          {
            chunkId,
            parentComponentName: spec.name,
            parentBriefSemantic: spec.briefSemantic,
            skeletonPath,
          },
          args.signalContext,
          args.pdfBase64,
          args.pdfMediaType,
        );
        const r = (resp.result ?? {}) as Record<string, unknown>;
        const chunkLatency = Date.now() - chunkStart;
        if (r.parseError || r.error || r.fallback) {
          const message = String(r.error || (r.parseError ? 'JSON parse failed' : 'Fallback returned'));
          console.log(
            `[plan-chunk] FAILED chunkId=${chunkId} parent=${spec.id} ` +
              `latencyMs=${chunkLatency} message=${message}`,
          );
          return null;
        }
        const subtree = r.subtree;
        if (!subtree || typeof subtree !== 'object') {
          console.log(`[plan-chunk] FAILED chunkId=${chunkId} parent=${spec.id} reason=missing-subtree`);
          return null;
        }
        // Merge any nested sub-chunks the chunk itself declared, then return
        // the subtree as the chunk's value. The orchestrator's assembler
        // resolves nested $refs recursively from the merged chunks map.
        const subChunks = (r.chunks ?? {}) as Record<string, unknown>;
        console.log(
          `[plan-chunk] SUCCESS chunkId=${chunkId} parent=${spec.id} latencyMs=${chunkLatency}` +
            `${Object.keys(subChunks).length > 0 ? ` subChunks=${Object.keys(subChunks).length}` : ''}`,
        );
        return { chunkId, subtree, subChunks };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(
          `[plan-chunk] FAILED chunkId=${chunkId} parent=${spec.id} ` +
            `latencyMs=${Date.now() - chunkStart} message=${message}`,
        );
        return null;
      }
    }),
  );
  const merged: Record<string, unknown> = {};
  for (const s of settled) {
    if (s.status !== 'fulfilled' || s.value === null) continue;
    const { chunkId, subtree, subChunks } = s.value as {
      chunkId: string;
      subtree: unknown;
      subChunks: Record<string, unknown>;
    };
    merged[chunkId] = subtree;
    for (const [sId, sValue] of Object.entries(subChunks)) merged[sId] = sValue;
  }
  return merged;
}

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
