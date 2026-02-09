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
} from './types';
import { AnthropicAdapter } from './providers/anthropic-adapter';
import { getTrainingSignalService } from './training-signal-service';

export class AIService {
  private config: AIServiceConfig;
  private adapter: AIProviderAdapter;

  constructor(config?: Partial<AIServiceConfig>) {
    this.config = {
      provider: (process.env.NEXT_PUBLIC_AI_PROVIDER as AIProvider) || 'anthropic',
      model: process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-20250514',
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

    // Execute through adapter
    const adapterResponse = await this.adapter.execute(request);

    // Build full response
    const response: AIResponse = {
      ...adapterResponse,
      requestId,
      provider: this.config.provider,
      model: this.config.model,
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

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

    return response;
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
        options: { responseFormat: 'json' },
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
        options: { responseFormat: 'json' },
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
        options: { responseFormat: 'json' },
      },
      true,
      signalContext
    );
    return response as AIResponse & { result: FieldMappingResult };
  }

  /**
   * Interpret a compensation plan document
   */
  async interpretPlan(
    content: string,
    format: string,
    signalContext?: { tenantId?: string; userId?: string }
  ): Promise<AIResponse & { result: PlanInterpretationResult }> {
    const response = await this.execute(
      {
        task: 'plan_interpretation',
        input: { content, format },
        options: { responseFormat: 'json', maxTokens: 8000 },
      },
      true,
      signalContext
    );
    return response as AIResponse & { result: PlanInterpretationResult };
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
