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
      components.push({
        id: compId,
        name: compName,
        nameEs: compNameEs,
        type: 'prime_dag',
        appliesToEmployeeTypes: appliesTo,
        calculationIntent: componentResult.component.calculationIntent,
        calculationMethod: componentResult.component.calculationMethod ?? { type: 'prime_dag' },
        rateTableCellCount,
        confidence: componentResult.component.confidence ?? 0.8,
        reasoning: componentResult.component.reasoning ?? '',
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
  } | null;
  outcome: ComponentOutcome;
}

async function callPlanComponentWithRetry(args: PerComponentCallArgs): Promise<PerComponentCallResult> {
  const aiService = getAIService();
  const spec = args.componentSpec;
  let attempt = 0;
  let lastErrClass: InterpretationErrorClass = 'unknown';
  let lastErrMessage = '';
  let lastHttpStatus: number | undefined;
  let lastViolations: string | undefined;

  // Probe initial classification with a placeholder so we honor the policy
  // shape from the very first attempt. The classifier returns 'unknown' for
  // null input, which yields a 1-attempt policy — replaced below as soon as
  // an actual error is observed.
  while (true) {
    attempt += 1;
    const callStart = Date.now();
    try {
      // HF-249 single-response mode: plan_component_with_chunking. LLM emits
      // either a complete tree (chunks empty — small components) or a
      // skeleton with $ref placeholders + chunks object (large components).
      // The assembler stitches both shapes identically before validation.
      const resp = await aiService.interpretPlanComponentWithChunking(
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
        // HF-249 assembly: branch on chunks presence. When chunks is empty
        // AND the calculationIntent has no $ref placeholders, the assembler
        // is a no-op (small components pass through identically to HF-248).
        // When chunks is non-empty OR the tree carries $refs, the assembler
        // stitches the skeleton + chunks into a single PrimeNode tree. The
        // validator then runs against the ASSEMBLED tree — exhaustive
        // emission counts leaves across the full assembled structure, not
        // just the skeleton's surface leaves.
        const intentRaw = result.calculationIntent as Record<string, unknown> | undefined;
        const chunks = (result.chunks ?? {}) as Record<string, unknown>;
        let intent: Record<string, unknown> | undefined = intentRaw;
        let chunksResolvedCount = 0;

        if (intentRaw) {
          try {
            const skeletonWithChunks: SkeletonWithChunks = {
              tree: intentRaw as SkeletonNode,
              chunks: chunks as Record<string, SkeletonNode>,
            };
            // HF-249 multi-call fallback: if the skeleton carries $refs but
            // chunks is incomplete (unresolved references), the LLM emitted
            // a skeleton-only shape under budget pressure. Fetch the missing
            // chunks individually via plan_chunk and merge before assembly.
            const refsBefore = collectReferences(skeletonWithChunks);
            const missingChunkIds = Array.from(refsBefore.referenced).filter(id => !(id in chunks));
            if (missingChunkIds.length > 0) {
              console.log(
                `[plan-component] HF-249 multi-call fallback component=${spec.id} ` +
                  `missingChunks=${missingChunkIds.length} (${missingChunkIds.join(',')})`,
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
            }
            const assembleResult = assembleTree(skeletonWithChunks);
            intent = assembleResult.tree as Record<string, unknown>;
            chunksResolvedCount = assembleResult.chunksResolved;
            if (chunksResolvedCount > 0) {
              console.log(
                `[plan-component] assembled component=${spec.id} chunksResolved=${chunksResolvedCount}`,
              );
            }
          } catch (asmErr) {
            const errLatency = Date.now() - callStart;
            if (asmErr instanceof AssemblerUnresolvedReferenceError) {
              lastErrClass = 'cognition_truncation';
              lastErrMessage = asmErr.message;
            } else if (asmErr instanceof AssemblerCyclicReferenceError) {
              lastErrClass = 'cognition_violation';
              lastErrMessage = asmErr.message;
            } else if (asmErr instanceof AssemblerOrphanChunkError) {
              lastErrClass = 'cognition_violation';
              lastErrMessage = asmErr.message;
            } else {
              lastErrClass = 'unknown';
              lastErrMessage = asmErr instanceof Error ? asmErr.message : String(asmErr);
            }
            console.log(
              `[plan-component] FAILED component=${spec.id} name="${spec.name}" errClass=${lastErrClass} ` +
                `attempt=${attempt}/${retryPolicy(lastErrClass).maxAttempts} latencyMs=${errLatency} ` +
                `assembler="${lastErrMessage}"`,
            );
            // Skip the validator branch; flow falls to retry-policy decision below.
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
        }

        // Validate the emitted intent against PRIME_GRAMMAR. Critical violations
        // (e.g., exhaustive_emission when rateTableCellCount is declared) reject
        // the component the same way ai-plan-interpreter's convertComponent does
        // downstream. Catching here lets us surface the validator output as a
        // per-component error class without persisting a half-formed rule_set.
        const validation = validateComponentIntent(intent, {
          componentLabel: spec.name,
          expectedCellCount: spec.rateTableCellCount,
        });
        if (validation.valid) {
          console.log(
            `[plan-component] SUCCESS component=${spec.id} name="${spec.name}" attempt=${attempt} ` +
              `latencyMs=${latency} leaves=${intent ? '<populated>' : '<missing>'}` +
              `${chunksResolvedCount > 0 ? ` chunksResolved=${chunksResolvedCount}` : ''}`,
          );
          return {
            component: {
              calculationIntent: intent,
              calculationMethod: (result.calculationMethod ?? { type: 'prime_dag' }) as Record<string, unknown>,
              confidence: typeof result.confidence === 'number' ? result.confidence : 0.8,
              reasoning: typeof result.reasoning === 'string' ? result.reasoning : '',
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
