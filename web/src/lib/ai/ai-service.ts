/**
 * AI Service
 *
 * Provider-agnostic AI service layer. All AI features call through this service.
 * The service routes requests to the configured provider adapter.
 *
 * IMPORTANT: This is the ONLY way to call AI. Feature code should never import
 * provider SDKs directly.
 */

import {
  AIRequest,
  AIResponse,
  AIServiceConfig,
  AIProvider,
  AIProviderAdapter,
  FileClassificationResult,
  SheetClassificationResult,
  FieldMappingResult,
  PlanInterpretationResult,
  AnomalyDetectionResult,
  ProviderHardError,
  AgentTurnRequest,
  AgentTurnResponse,
} from './types';
import { AnthropicAdapter } from './providers/anthropic-adapter';
import { getTrainingSignalService } from './training-signal-service';
import { captureSCISignal } from '@/lib/sci/signal-capture-service';
// OB-215: model selection is owned by the single resolver. The service no longer
// hardcodes a model fallback — resolveModel(task) decides per request at the adapter.
import { resolveModel, defaultModel } from './model-policy';
import { ensureModelPolicyLoaded } from './model-policy-loader';
import { recordAICallMetric } from './ai-metrics-writer';

export class AIService {
  private config: AIServiceConfig;
  private adapter: AIProviderAdapter;

  constructor(config?: Partial<AIServiceConfig>) {
    this.config = {
      provider: (process.env.NEXT_PUBLIC_AI_PROVIDER as AIProvider) || 'anthropic',
      // OB-215: the env/default model is the NON-PLAN default only — resolveModel(task)
      // at the adapter overrides it per request (plan family → Opus). No hardcoded
      // model literal lives here anymore (the constant moved to model-policy.ts).
      model: defaultModel(),
      ...config,
    };
    this.adapter = this.createAdapter(this.config.provider);
  }

  private createAdapter(provider: AIProvider): AIProviderAdapter {
    switch (provider) {
      case 'anthropic':
        return new AnthropicAdapter(this.config);
      // Future providers:
      // case 'openai':
      //   return new OpenAIAdapter(this.config);
      // case 'azure_openai':
      //   return new AzureOpenAIAdapter(this.config);
      // case 'local':
      //   return new LocalModelAdapter(this.config);
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  /**
   * Execute an AI request through the configured provider
   */
  async execute(
    request: AIRequest,
    captureSignal: boolean = true,
    signalContext?: { tenantId?: string; userId?: string }
  ): Promise<AIResponse> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    // OB-215: load operator-set per-task model overrides (cached per process) before
    // the resolver runs, so an Observatory model change governs without a code deploy.
    await ensureModelPolicyLoaded();

    let adapterResponse;
    try {
      // Execute through adapter
      adapterResponse = await this.adapter.execute(request);
    } catch (error) {
      // Graceful degradation: return a zero-confidence response instead of throwing.
      const errorMessage = error instanceof Error ? error.message : String(error);

      // AUD-009 (HF-294): a provider HARD-failure (non-2xx HTTP, or connectivity
      // failure after retries — tagged by the adapter) must be LOUD and
      // DISTINGUISHABLE from a legitimate low-confidence classification. This is a
      // single general guard (any tagged provider hard-error), NOT a per-status
      // catalog. Behavior-preserving: we still return the degraded zero-confidence
      // response (no throw, no fall-through change) — we only add a structural marker
      // (providerError/errorClass) and an error-level log. Recoverable/parse failures
      // keep the prior warn-and-degrade path below unchanged, which is exactly what
      // keeps the two cases distinguishable.
      const hardError =
        error && typeof error === 'object' && (error as { providerError?: unknown }).providerError === true
          ? (error as ProviderHardError)
          : null;
      if (hardError) {
        const errorClass =
          typeof hardError.status === 'number' ? `provider_http_${hardError.status}` : 'provider_unreachable';
        console.error(
          `[AIService] PROVIDER HARD-ERROR on ${request.task}: ${errorMessage} (model=${resolveModel(request.task, { configModel: this.config.model })}, class=${errorClass})`
        );
        recordAICallMetric({
          tenantId: signalContext?.tenantId || 'unknown',
          task: request.task,
          provider: this.config.provider,
          model: resolveModel(request.task, { configModel: this.config.model }),
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: Date.now() - startTime,
          status: 'provider_error',
        });
        return {
          task: request.task,
          result: {
            error: errorMessage,
            fallback: true,
            confidence: 0,
            providerError: true,
            errorClass,
          },
          confidence: 0,
          tokenUsage: { input: 0, output: 0 },
          requestId,
          provider: this.config.provider,
          model: resolveModel(request.task, { configModel: this.config.model }),
          latencyMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      }

      // Recoverable / non-provider failure: graceful degradation (unchanged behavior).
      console.warn(`[AIService] ${request.task} failed: ${errorMessage}`);
      recordAICallMetric({
        tenantId: signalContext?.tenantId || 'unknown',
        task: request.task,
        provider: this.config.provider,
        model: resolveModel(request.task, { configModel: this.config.model }),
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: Date.now() - startTime,
        status: 'degraded',
      });
      return {
        task: request.task,
        result: {
          error: errorMessage,
          fallback: true,
          confidence: 0,
        },
        confidence: 0,
        tokenUsage: { input: 0, output: 0 },
        requestId,
        provider: this.config.provider,
        model: resolveModel(request.task, { configModel: this.config.model }),
        latencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Build full response
    const response: AIResponse = {
      ...adapterResponse,
      requestId,
      provider: this.config.provider,
      // OB-215: report the model the adapter ACTUALLY sent (resolved per task), not the
      // constructor default — so cost/telemetry name Opus on plan tasks, Sonnet elsewhere.
      model: adapterResponse.model || resolveModel(request.task, { configModel: this.config.model }),
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    // OB-215: per-call metrics capture (fire-and-forget; never blocks/throws).
    recordAICallMetric({
      tenantId: signalContext?.tenantId || 'unknown',
      task: request.task,
      provider: response.provider,
      model: response.model,
      tokensIn: response.tokenUsage?.input || 0,
      tokensOut: response.tokenUsage?.output || 0,
      latencyMs: response.latencyMs,
      status: 'success',
    });

    // Capture training signal if enabled
    if (captureSignal) {
      try {
        const signalService = getTrainingSignalService();
        const signalId = signalService.captureAIResponse(
          response,
          signalContext?.tenantId || 'unknown',
          signalContext?.userId || 'unknown',
          request.context || {}
        );
        response.signalId = signalId;
      } catch (error) {
        console.warn('Failed to capture training signal:', error);
      }
    }

    // OB-135: Capture cost event signal (fire-and-forget)
    if (signalContext?.tenantId && signalContext.tenantId !== 'unknown') {
      const inputTokens = response.tokenUsage?.input || 0;
      const outputTokens = response.tokenUsage?.output || 0;
      captureSCISignal({
        tenantId: signalContext.tenantId,
        signal: {
          signalType: 'cost_event',
          eventType: 'ai_api_call',
          provider: response.provider || 'anthropic',
          model: response.model || 'unknown',
          purpose: request.task,
          inputTokens,
          outputTokens,
          estimatedCostUSD: computeEstimatedCost(inputTokens, outputTokens),
        },
      }).catch(() => {});
    }

    return response;
  }

  // OB-212: one tools-capable model turn for the agent runtime, through the
  // configured provider adapter (the AIService mandate — agent-runner never opens
  // its own fetch). The multi-turn loop is owned by agent-runner.
  async executeAgentTurn(request: AgentTurnRequest): Promise<AgentTurnResponse> {
    return this.adapter.executeAgentTurn(request);
  }

  // === CONVENIENCE METHODS ===

  /**
   * Classify a file to determine its type and processing strategy
   */
  async classifyFile(
    fileName: string,
    contentPreview: string,
    metadata?: Record<string, unknown>,
    signalContext?: { tenantId?: string; userId?: string }
  ): Promise<AIResponse & { result: FileClassificationResult }> {
    const response = await this.execute(
      {
        task: 'file_classification',
        input: { fileName, contentPreview, metadata },
        options: { responseFormat: 'json', temperature: 0 },
      },
      true,
      signalContext
    );
    return response as AIResponse & { result: FileClassificationResult };
  }

  /**
   * Classify a spreadsheet sheet to determine its data type and mappings
   */
  async classifySheet(
    sheetName: string,
    headers: string[],
    sampleRows: unknown[],
    planContext?: unknown,
    signalContext?: { tenantId?: string; userId?: string }
  ): Promise<AIResponse & { result: SheetClassificationResult }> {
    const response = await this.execute(
      {
        task: 'sheet_classification',
        input: { sheetName, headers, sampleRows, planContext },
        options: { responseFormat: 'json', temperature: 0 },
      },
      true,
      signalContext
    );
    return response as AIResponse & { result: SheetClassificationResult };
  }

  /**
   * Suggest field mapping for a column
   */
  async suggestFieldMapping(
    columnName: string,
    sampleValues: unknown[],
    targetFields: string[],
    planComponents?: unknown[],
    signalContext?: { tenantId?: string; userId?: string }
  ): Promise<AIResponse & { result: FieldMappingResult }> {
    const response = await this.execute(
      {
        task: 'field_mapping',
        input: { columnName, sampleValues, targetFields, planComponents },
        options: { responseFormat: 'json', temperature: 0 },
      },
      true,
      signalContext
    );
    return response as AIResponse & { result: FieldMappingResult };
  }

  /**
   * CLT-08: Second-pass field classification with plan context
   * Called for unresolved fields after initial mapping
   */
  async classifyFieldsSecondPass(
    sheetName: string,
    componentName: string,
    calculationType: string,
    neededMetrics: string[],
    alreadyMapped: Array<{ sourceColumn: string; semanticType: string }>,
    unresolvedFields: Array<{ sourceColumn: string; sampleValues: unknown[]; dataType: string }>,
    signalContext?: { tenantId?: string; userId?: string }
  ): Promise<AIResponse & { result: { classifications: Array<{ sourceColumn: string; semanticType: string | null; confidence: number; reasoning: string }> } }> {
    const response = await this.execute(
      {
        task: 'field_mapping_second_pass',
        input: {
          sheetName,
          componentName,
          calculationType,
          neededMetrics,
          alreadyMapped,
          unresolvedFields,
        },
        options: { responseFormat: 'json', temperature: 0 },
      },
      true,
      signalContext
    );
    return response as AIResponse & { result: { classifications: Array<{ sourceColumn: string; semanticType: string | null; confidence: number; reasoning: string }> } };
  }

  /**
   * Interpret a compensation plan document
   * For PDF: pass pdfBase64 + pdfMediaType instead of content
   */
  async interpretPlan(
    content: string,
    format: string,
    signalContext?: { tenantId?: string; userId?: string },
    pdfBase64?: string,
    pdfMediaType?: string
  ): Promise<AIResponse & { result: PlanInterpretationResult }> {
    const input: Record<string, unknown> = { content, format };
    if (pdfBase64) {
      input.pdfBase64 = pdfBase64;
      input.pdfMediaType = pdfMediaType || 'application/pdf';
      input.contentType = 'document'; // HF-258: explicit content-unit type — adapter attaches the document block on this, not task name
    }
    const response = await this.execute(
      {
        task: 'plan_interpretation',
        input,
        options: { responseFormat: 'json', maxTokens: 8192, temperature: 0 },
      },
      true,
      signalContext
    );
    return response as AIResponse & { result: PlanInterpretationResult };
  }

  /**
   * HF-248 Phase A — emit plan-level structure + component index only.
   * Small JSON; no per-component DAG trees. Used as the first call in
   * per-component plan interpretation, before plan_component fires per
   * componentIndex entry.
   */
  async interpretPlanSkeleton(
    content: string,
    format: string,
    signalContext?: { tenantId?: string; userId?: string },
    pdfBase64?: string,
    pdfMediaType?: string
  ): Promise<AIResponse> {
    const input: Record<string, unknown> = { content, format };
    if (pdfBase64) {
      input.pdfBase64 = pdfBase64;
      input.pdfMediaType = pdfMediaType || 'application/pdf';
      input.contentType = 'document'; // HF-258: explicit content-unit type — adapter attaches the document block on this, not task name
    }
    return this.execute(
      {
        task: 'plan_skeleton',
        // OB-256 (W-3): the skeleton is a compact INDEX, but a high-column-count sheet (MAQUINARIA (2),
        // 20 columns → many components) overran the 4096-token cap and truncated mid-JSON at ~position
        // 8320 (dense JSON ≈ 2 chars/token), so the plan refused to persist (7/8 plans). The index has no
        // rate-table cells (those are per-component, Phase B), so a larger ceiling stays well-bounded.
        input,
        options: { responseFormat: 'json', maxTokens: 16384, temperature: 0 },
      },
      true,
      signalContext
    );
  }

  /**
   * HF-248 Phase B — emit a single component's calculationIntent DAG tree.
   * One LLM call per component; the orchestration assembles trees into the
   * complete plan. componentSpec carries id/name/briefSemantic/rateTableCellCount
   * from the skeleton call.
   */
  async interpretPlanComponent(
    content: string,
    format: string,
    componentSpec: {
      id: string;
      name: string;
      nameEs?: string;
      appliesToEmployeeTypes: string[];
      briefSemantic: string;
      rateTableCellCount?: number;
    },
    signalContext?: { tenantId?: string; userId?: string },
    pdfBase64?: string,
    pdfMediaType?: string,
    // HF-270: runtime comprehended/declared field set. Forwarded to the adapter's
    // plan_component prompt as the AVAILABLE COMPREHENDED FIELDS anchor so the LLM
    // resolves each reference_field to a comprehended identity instead of minting
    // one from prose. Absent/empty → no anchor block (pre-HF-270 behavior, DD-7).
    fieldAnchor?: Array<{ field: string; meaning: string; role: string }>,
    // HF-280: structured error from the PRIOR attempt at this component, forwarded
    // verbatim to the adapter's plan_component prompt as retry feedback so the model
    // receives what was violated. Absent on the first attempt (DD-7 — no block).
    retryFeedback?: string,
  ): Promise<AIResponse> {
    const input: Record<string, unknown> = { content, format, componentSpec };
    if (fieldAnchor && fieldAnchor.length > 0) {
      input.fieldAnchor = fieldAnchor;
    }
    if (retryFeedback && retryFeedback.trim().length > 0) {
      input.retryFeedback = retryFeedback;
    }
    if (pdfBase64) {
      input.pdfBase64 = pdfBase64;
      input.pdfMediaType = pdfMediaType || 'application/pdf';
      input.contentType = 'document'; // HF-258: explicit content-unit type — adapter attaches the document block on this, not task name
    }
    return this.execute(
      {
        task: 'plan_component',
        input,
        options: { responseFormat: 'json', maxTokens: 8192, temperature: 0 },
      },
      true,
      signalContext
    );
  }

  /**
   * HF-249 — emit a component as skeleton + chunks (single-response mode).
   * The LLM may either emit a complete tree (no $ref placeholders, empty
   * chunks) for small components, or a skeleton with $ref placeholders at
   * grammar-legal cut points plus a sibling chunks object for large ones.
   * The pathway is unified — the assembler in prime-assembler.ts stitches
   * either shape into a single PrimeNode tree.
   */
  async interpretPlanComponentWithChunking(
    content: string,
    format: string,
    componentSpec: {
      id: string;
      name: string;
      nameEs?: string;
      appliesToEmployeeTypes: string[];
      briefSemantic: string;
      rateTableCellCount?: number;
    },
    signalContext?: { tenantId?: string; userId?: string },
    pdfBase64?: string,
    pdfMediaType?: string
  ): Promise<AIResponse> {
    const input: Record<string, unknown> = { content, format, componentSpec };
    if (pdfBase64) {
      input.pdfBase64 = pdfBase64;
      input.pdfMediaType = pdfMediaType || 'application/pdf';
      input.contentType = 'document'; // HF-258: explicit content-unit type — adapter attaches the document block on this, not task name
    }
    return this.execute(
      {
        task: 'plan_component_with_chunking',
        input,
        options: { responseFormat: 'json', maxTokens: 8192, temperature: 0 },
      },
      true,
      signalContext
    );
  }

  /**
   * HF-249 — emit one sub-tree chunk in the multi-call fallback path.
   * Used when the skeleton's truncation indicates the skeleton + chunks
   * together exceed budget; the orchestration retries the skeleton in
   * a budgeted-emission mode and then dispatches one plan_chunk call per
   * declared chunkId. Chunks may themselves contain $ref placeholders to
   * sub-chunks; the assembler resolves recursively.
   */
  async interpretPlanChunk(
    content: string,
    format: string,
    chunkSpec: {
      chunkId: string;
      parentComponentName: string;
      parentBriefSemantic: string;
      skeletonPath: string;
    },
    signalContext?: { tenantId?: string; userId?: string },
    pdfBase64?: string,
    pdfMediaType?: string
  ): Promise<AIResponse> {
    const input: Record<string, unknown> = { content, format, chunkSpec };
    if (pdfBase64) {
      input.pdfBase64 = pdfBase64;
      input.pdfMediaType = pdfMediaType || 'application/pdf';
      input.contentType = 'document'; // HF-258: explicit content-unit type — adapter attaches the document block on this, not task name
    }
    return this.execute(
      {
        task: 'plan_chunk',
        input,
        options: { responseFormat: 'json', maxTokens: 8192, temperature: 0 },
      },
      true,
      signalContext
    );
  }

  /**
   * Analyze a multi-sheet workbook for structure and relationships
   */
  async analyzeWorkbook(
    sheetsInfo: string,
    planComponents?: string,
    expectedFields?: string,
    signalContext?: { tenantId?: string; userId?: string }
  ): Promise<AIResponse> {
    return this.execute(
      {
        task: 'workbook_analysis',
        input: { sheetsInfo, planComponents, expectedFields },
        options: { responseFormat: 'json', maxTokens: 8000, temperature: 0 },
      },
      true,
      signalContext
    );
  }

  /**
   * Suggest field mappings for import data
   */
  async suggestImportFieldMappings(
    headers: string,
    sampleData: string,
    tenantContext?: string,
    signalContext?: { tenantId?: string; userId?: string }
  ): Promise<AIResponse> {
    return this.execute(
      {
        task: 'import_field_mapping',
        input: { headers, sampleData, tenantContext },
        options: { responseFormat: 'json', temperature: 0 },
      },
      true,
      signalContext
    );
  }

  /**
   * Detect anomalies in data
   */
  async detectAnomalies(
    data: unknown[],
    metricName: string,
    context?: Record<string, unknown>,
    signalContext?: { tenantId?: string; userId?: string }
  ): Promise<AIResponse & { result: AnomalyDetectionResult }> {
    const response = await this.execute(
      {
        task: 'anomaly_detection',
        input: { data, metricName, context },
        options: { responseFormat: 'json' },
      },
      true,
      signalContext
    );
    return response as AIResponse & { result: AnomalyDetectionResult };
  }

  /**
   * Generate recommendations based on analysis
   */
  async generateRecommendation(
    analysisData: unknown,
    context: Record<string, unknown>,
    signalContext?: { tenantId?: string; userId?: string }
  ): Promise<AIResponse> {
    return this.execute(
      {
        task: 'recommendation',
        input: { analysisData, context },
        options: { responseFormat: 'json' },
      },
      true,
      signalContext
    );
  }

  /**
   * Answer a natural language query
   */
  async query(
    question: string,
    context: Record<string, unknown>,
    signalContext?: { tenantId?: string; userId?: string }
  ): Promise<AIResponse> {
    return this.execute(
      {
        task: 'natural_language_query',
        input: { question, context },
        options: { responseFormat: 'json' },
      },
      true,
      signalContext
    );
  }

  /**
   * OB-71: Generate a persona-driven dashboard assessment
   */
  async generateAssessment(
    persona: 'admin' | 'manager' | 'rep',
    data: Record<string, unknown>,
    locale: string = 'es',
    anomalies?: unknown[],
    signalContext?: { tenantId?: string; userId?: string }
  ): Promise<AIResponse> {
    return this.execute(
      {
        task: 'dashboard_assessment',
        input: { persona, data, locale, anomalies },
        options: { maxTokens: 500 },
      },
      true,
      signalContext
    );
  }

  /**
   * Get current provider info
   */
  getProviderInfo(): { provider: AIProvider; model: string } {
    return {
      provider: this.config.provider,
      model: this.config.model,
    };
  }
}

// === SINGLETON ===
let _instance: AIService | null = null;

export function getAIService(config?: Partial<AIServiceConfig>): AIService {
  if (!_instance) {
    _instance = new AIService(config);
  }
  return _instance;
}

export function resetAIService(): void {
  _instance = null;
}

// OB-135: Approximate cost computation for trend analysis (not billing)
function computeEstimatedCost(inputTokens: number, outputTokens: number): number {
  // Approximate pricing — used for trend analysis, NOT billing
  const INPUT_COST_PER_1K = 0.003;
  const OUTPUT_COST_PER_1K = 0.015;
  const inputCost = (inputTokens / 1000) * INPUT_COST_PER_1K;
  const outputCost = (outputTokens / 1000) * OUTPUT_COST_PER_1K;
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}
