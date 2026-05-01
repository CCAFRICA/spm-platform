/**
 * Training Signal Service
 *
 * Captures every AI interaction for closed-loop learning.
 * Every AI request, response, and user action is recorded.
 *
 * HF-055: Wired to Supabase via signal-persistence.ts.
 * Writes fire-and-forget to classification_signals table.
 * Reads query Supabase for historical signals.
 */

import { AIResponse, AITaskType, TrainingSignal } from './types';
import { persistSignal, getTrainingSignals } from './signal-persistence';

// OB-198: AI task → DS-021 §3 Role 4 semantic level (architect-disposed Option A).
// Record<AITaskType, string> typing makes the map exhaustive — adding a new
// AITaskType member without extending the map produces a tsc error.
const AI_TASK_LEVEL_MAP: Record<AITaskType, string> = {
  // classification: Level 1 — "what kind?"
  file_classification:        'classification:ai_file_classification',
  sheet_classification:       'classification:ai_sheet_classification',
  document_analysis:          'classification:ai_document_analysis',
  // comprehension: Level 2 — "how does it behave?"
  field_mapping:              'comprehension:ai_field_mapping',
  field_mapping_second_pass:  'comprehension:ai_field_mapping_second_pass',
  import_field_mapping:       'comprehension:ai_import_field_mapping',
  header_comprehension:       'comprehension:ai_header_comprehension',
  plan_interpretation:        'comprehension:ai_plan_interpretation',
  workbook_analysis:          'comprehension:ai_workbook_analysis',
  entity_extraction:          'comprehension:ai_entity_extraction',
  // convergence: Level 3 — "what connects to what?"
  convergence_mapping:        'convergence:ai_convergence_mapping',
  anomaly_detection:          'convergence:ai_anomaly_detection',
  // lifecycle: platform output events
  recommendation:             'lifecycle:ai_recommendation',
  narration:                  'lifecycle:ai_narration',
  dashboard_assessment:       'lifecycle:ai_dashboard_assessment',
  natural_language_query:     'lifecycle:ai_natural_language_query',
};

export class TrainingSignalService {
  private tenantId: string;

  constructor(tenantId: string = 'default') {
    this.tenantId = tenantId;
  }

  /**
   * Capture an AI response as a training signal.
   * Called automatically by AIService after every AI call.
   * HF-055: Now persists to Supabase via fire-and-forget.
   */
  captureAIResponse(
    response: AIResponse,
    tenantId: string,
    userId: string,
    metadata: Record<string, unknown> = {}
  ): string {
    const signalId = crypto.randomUUID();

    // HF-055: Fire-and-forget persist to Supabase
    // HF-161: Pass credentials explicitly (no dynamic imports)
    persistSignal({
      tenantId,
      signalType: AI_TASK_LEVEL_MAP[response.task],
      signalValue: {
        signalId,
        requestId: response.requestId,
        task: response.task,
        aiOutput: response.result,
        userAction: 'pending',
      },
      confidence: response.confidence,
      source: 'ai_prediction',
      context: {
        ...metadata,
        userId,
        provider: response.provider,
        model: response.model,
        tokenUsage: response.tokenUsage,
        latencyMs: response.latencyMs,
      },
    }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch(err => {
      console.warn('[TrainingSignalService] Persist failed (non-blocking):', err instanceof Error ? err.message : 'unknown');
    });

    return signalId;
  }

  /**
   * Record what the user did with the AI output.
   * HF-055: Persists a new signal with user action to Supabase.
   */
  recordUserAction(
    signalId: string,
    action: 'accepted' | 'corrected' | 'rejected' | 'ignored',
    correction?: Record<string, unknown>,
    tenantId?: string
  ): void {
    const tid = tenantId || this.tenantId;

    // HF-055: Persist user action as a new signal
    // HF-161: Pass credentials explicitly
    persistSignal({
      tenantId: tid,
      signalType: 'lifecycle:user_action',
      signalValue: {
        signalId,
        userAction: action,
        userCorrection: correction ?? null,
      },
      confidence: action === 'accepted' ? 0.95 : action === 'corrected' ? 0.99 : 0,
      source: action === 'corrected' ? 'user_corrected' : action === 'accepted' ? 'user_confirmed' : 'ai_prediction',
      context: { originalSignalId: signalId },
    }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch(err => {
      console.warn('[TrainingSignalService] recordUserAction persist failed (non-blocking):', err instanceof Error ? err.message : 'unknown');
    });
  }

  /**
   * Record the outcome of an AI prediction.
   * HF-055: Persists outcome as a new signal to Supabase.
   */
  recordOutcome(
    signalId: string,
    wasCorrect: boolean,
    feedbackSource: 'user_explicit' | 'downstream_validation' | 'reconciliation',
    tenantId?: string
  ): void {
    const tid = tenantId || this.tenantId;

    // HF-055: Persist outcome as a new signal
    // HF-161: Pass credentials explicitly
    persistSignal({
      tenantId: tid,
      signalType: 'lifecycle:outcome',
      signalValue: {
        signalId,
        wasCorrect,
        feedbackSource,
      },
      confidence: wasCorrect ? 1.0 : 0.0,
      source: feedbackSource === 'user_explicit' ? 'user_confirmed' : 'ai_prediction',
      context: { originalSignalId: signalId },
    }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch(err => {
      console.warn('[TrainingSignalService] recordOutcome persist failed (non-blocking):', err instanceof Error ? err.message : 'unknown');
    });
  }

  /**
   * Get signal by ID (queries Supabase).
   */
  async getSignalAsync(signalId: string, tenantId?: string): Promise<TrainingSignal | undefined> {
    const tid = tenantId || this.tenantId;
    const signals = await this.getSignalsAsync(tid);
    return signals.find((s) => s.signalId === signalId);
  }

  /**
   * Get all signals for a tenant.
   * HF-055: Now queries Supabase instead of returning [].
   */
  async getSignalsAsync(tenantId?: string): Promise<TrainingSignal[]> {
    const tid = tenantId || this.tenantId;
    const rows = await getTrainingSignals(tid, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, undefined, 200);

    return rows
      .filter(row => {
        // OB-198 R-1: training-signal-service writes preserve `signalId` in
        // signal_value across every captureAIResponse / recordUserAction /
        // recordOutcome path. Filter on that durable identifier rather than
        // the dynamic prefix space (classification:* / comprehension:* /
        // convergence:* / lifecycle:* per AI_TASK_LEVEL_MAP).
        const sv = row.signalValue as Record<string, unknown> | undefined;
        return typeof sv?.signalId === 'string';
      })
      .map(row => ({
        signalId: (row.signalValue as Record<string, unknown>)?.signalId as string || '',
        requestId: (row.signalValue as Record<string, unknown>)?.requestId as string || '',
        task: ((row.signalValue as Record<string, unknown>)?.task as AITaskType) || 'file_classification',
        tenantId: row.tenantId,
        userId: (row.context as Record<string, unknown>)?.userId as string || '',
        timestamp: new Date().toISOString(),
        aiOutput: (row.signalValue as Record<string, unknown>)?.aiOutput as Record<string, unknown> || {},
        aiConfidence: row.confidence ?? 0,
        userAction: ((row.signalValue as Record<string, unknown>)?.userAction as TrainingSignal['userAction']) || 'pending',
        metadata: (row.context as Record<string, unknown>) || {},
      }));
  }

  /**
   * Synchronous getSignals — returns [] for backward compatibility.
   * Use getSignalsAsync() for Supabase-backed retrieval.
   * @deprecated Use getSignalsAsync() instead
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getSignals(_tenantId?: string): TrainingSignal[] {
    // Sync callers still get [] — async callers should use getSignalsAsync()
    return [];
  }

  /**
   * Get signal by ID (sync — backward compat).
   * @deprecated Use getSignalAsync() instead
   */
  getSignal(signalId: string, tenantId?: string): TrainingSignal | undefined {
    const tid = tenantId || this.tenantId;
    const signals = this.getSignals(tid);
    return signals.find((s) => s.signalId === signalId);
  }

  /**
   * Get accuracy statistics by task type.
   * HF-055: Async version that reads from Supabase.
   */
  async getAccuracyByTaskAsync(tenantId?: string): Promise<Record<AITaskType, {
    total: number;
    accepted: number;
    corrected: number;
    rejected: number;
    acceptanceRate: number;
    avgConfidence: number;
  }>> {
    const tid = tenantId || this.tenantId;
    const signals = await this.getSignalsAsync(tid);

    const stats: Record<string, {
      total: number;
      accepted: number;
      corrected: number;
      rejected: number;
      confidenceSum: number;
    }> = {};

    for (const signal of signals) {
      if (!stats[signal.task]) {
        stats[signal.task] = {
          total: 0,
          accepted: 0,
          corrected: 0,
          rejected: 0,
          confidenceSum: 0,
        };
      }

      const taskStats = stats[signal.task];
      taskStats.total++;
      taskStats.confidenceSum += signal.aiConfidence;

      if (signal.userAction === 'accepted') taskStats.accepted++;
      else if (signal.userAction === 'corrected') taskStats.corrected++;
      else if (signal.userAction === 'rejected') taskStats.rejected++;
    }

    const result: Record<string, {
      total: number;
      accepted: number;
      corrected: number;
      rejected: number;
      acceptanceRate: number;
      avgConfidence: number;
    }> = {};

    for (const [task, taskStats] of Object.entries(stats)) {
      const actionedCount = taskStats.accepted + taskStats.corrected + taskStats.rejected;
      result[task] = {
        total: taskStats.total,
        accepted: taskStats.accepted,
        corrected: taskStats.corrected,
        rejected: taskStats.rejected,
        acceptanceRate: actionedCount > 0 ? taskStats.accepted / actionedCount : 0,
        avgConfidence: taskStats.total > 0 ? taskStats.confidenceSum / taskStats.total : 0,
      };
    }

    return result as Record<AITaskType, typeof result[string]>;
  }

  /**
   * Sync accuracy stats — backward compat.
   * @deprecated Use getAccuracyByTaskAsync() instead
   */
  getAccuracyByTask(tenantId?: string): Record<AITaskType, {
    total: number;
    accepted: number;
    corrected: number;
    rejected: number;
    acceptanceRate: number;
    avgConfidence: number;
  }> {
    const tid = tenantId || this.tenantId;
    const signals = this.getSignals(tid);

    const stats: Record<string, {
      total: number;
      accepted: number;
      corrected: number;
      rejected: number;
      confidenceSum: number;
    }> = {};

    for (const signal of signals) {
      if (!stats[signal.task]) {
        stats[signal.task] = { total: 0, accepted: 0, corrected: 0, rejected: 0, confidenceSum: 0 };
      }
      const taskStats = stats[signal.task];
      taskStats.total++;
      taskStats.confidenceSum += signal.aiConfidence;
      if (signal.userAction === 'accepted') taskStats.accepted++;
      else if (signal.userAction === 'corrected') taskStats.corrected++;
      else if (signal.userAction === 'rejected') taskStats.rejected++;
    }

    const result: Record<string, {
      total: number; accepted: number; corrected: number; rejected: number;
      acceptanceRate: number; avgConfidence: number;
    }> = {};

    for (const [task, taskStats] of Object.entries(stats)) {
      const actionedCount = taskStats.accepted + taskStats.corrected + taskStats.rejected;
      result[task] = {
        total: taskStats.total,
        accepted: taskStats.accepted,
        corrected: taskStats.corrected,
        rejected: taskStats.rejected,
        acceptanceRate: actionedCount > 0 ? taskStats.accepted / actionedCount : 0,
        avgConfidence: taskStats.total > 0 ? taskStats.confidenceSum / taskStats.total : 0,
      };
    }

    return result as Record<AITaskType, typeof result[string]>;
  }

  /**
   * Get signals that need outcome feedback (for reconciliation).
   */
  async getPendingOutcomeSignalsAsync(tenantId?: string): Promise<TrainingSignal[]> {
    const tid = tenantId || this.tenantId;
    const signals = await this.getSignalsAsync(tid);
    return signals.filter(
      (s) => s.userAction !== 'pending' && s.userAction !== 'ignored' && !s.outcome
    );
  }

  /**
   * Sync version — backward compat.
   * @deprecated Use getPendingOutcomeSignalsAsync() instead
   */
  getPendingOutcomeSignals(tenantId?: string): TrainingSignal[] {
    const tid = tenantId || this.tenantId;
    const signals = this.getSignals(tid);
    return signals.filter(
      (s) => s.userAction !== 'pending' && s.userAction !== 'ignored' && !s.outcome
    );
  }

  /**
   * Export signals for external analysis/training.
   */
  async exportSignalsAsync(tenantId?: string): Promise<string> {
    const tid = tenantId || this.tenantId;
    const signals = await this.getSignalsAsync(tid);
    return JSON.stringify(signals, null, 2);
  }

  /**
   * Sync version — backward compat.
   * @deprecated Use exportSignalsAsync() instead
   */
  exportSignals(tenantId?: string): string {
    const tid = tenantId || this.tenantId;
    const signals = this.getSignals(tid);
    return JSON.stringify(signals, null, 2);
  }

  /**
   * Pruning is handled at the DB level (query limits).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pruneSignals(_keepCount: number = 5000, _tenantId?: string): number {
    // Supabase handles storage — no client-side pruning needed
    return 0;
  }
}

// === SINGLETON ===
let _instance: TrainingSignalService | null = null;

export function getTrainingSignalService(tenantId?: string): TrainingSignalService {
  if (!_instance || (tenantId && _instance['tenantId'] !== tenantId)) {
    _instance = new TrainingSignalService(tenantId);
  }
  return _instance;
}

export function resetTrainingSignalService(): void {
  _instance = null;
}
