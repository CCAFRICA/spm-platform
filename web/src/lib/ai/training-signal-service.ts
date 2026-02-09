/**
 * Training Signal Service
 *
 * Captures every AI interaction for closed-loop learning.
 * Every AI request, response, and user action is recorded.
 *
 * Storage: localStorage today, database tomorrow.
 * This data is invaluable for model fine-tuning and accuracy analysis.
 */

import { AIResponse, AITaskType, TrainingSignal } from './types';

const STORAGE_KEY_PREFIX = 'clearcomp_training_signals_';
const MAX_SIGNALS_PER_TENANT = 10000; // Prevent localStorage overflow

export class TrainingSignalService {
  private tenantId: string;

  constructor(tenantId: string = 'default') {
    this.tenantId = tenantId;
  }

  /**
   * Capture an AI response as a training signal
   * Called automatically by AIService after every AI call
   */
  captureAIResponse(
    response: AIResponse,
    tenantId: string,
    userId: string,
    metadata: Record<string, unknown> = {}
  ): string {
    const signalId = crypto.randomUUID();

    const signal: TrainingSignal = {
      signalId,
      requestId: response.requestId,
      task: response.task,
      tenantId,
      userId,
      timestamp: response.timestamp,
      aiOutput: response.result,
      aiConfidence: response.confidence,
      userAction: 'pending', // Will be updated when user acts
      metadata: {
        ...metadata,
        provider: response.provider,
        model: response.model,
        tokenUsage: response.tokenUsage,
        latencyMs: response.latencyMs,
      },
    };

    this.saveSignal(signal, tenantId);
    return signalId;
  }

  /**
   * Record what the user did with the AI output
   */
  recordUserAction(
    signalId: string,
    action: 'accepted' | 'corrected' | 'rejected' | 'ignored',
    correction?: Record<string, unknown>,
    tenantId?: string
  ): void {
    const tid = tenantId || this.tenantId;
    const signals = this.getSignals(tid);
    const index = signals.findIndex((s) => s.signalId === signalId);

    if (index >= 0) {
      signals[index].userAction = action;
      if (correction) {
        signals[index].userCorrection = correction;
      }
      this.setSignals(signals, tid);
    }
  }

  /**
   * Record the outcome of an AI prediction (filled later when ground truth is known)
   */
  recordOutcome(
    signalId: string,
    wasCorrect: boolean,
    feedbackSource: 'user_explicit' | 'downstream_validation' | 'reconciliation',
    tenantId?: string
  ): void {
    const tid = tenantId || this.tenantId;
    const signals = this.getSignals(tid);
    const index = signals.findIndex((s) => s.signalId === signalId);

    if (index >= 0) {
      signals[index].outcome = {
        wasCorrect,
        feedbackSource,
      };
      this.setSignals(signals, tid);
    }
  }

  /**
   * Get signal by ID
   */
  getSignal(signalId: string, tenantId?: string): TrainingSignal | undefined {
    const tid = tenantId || this.tenantId;
    const signals = this.getSignals(tid);
    return signals.find((s) => s.signalId === signalId);
  }

  /**
   * Get all signals for a tenant
   */
  getSignals(tenantId?: string): TrainingSignal[] {
    const tid = tenantId || this.tenantId;
    if (typeof window === 'undefined') return [];

    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${tid}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Get accuracy statistics by task type
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
   * Get signals that need outcome feedback (for reconciliation)
   */
  getPendingOutcomeSignals(tenantId?: string): TrainingSignal[] {
    const tid = tenantId || this.tenantId;
    const signals = this.getSignals(tid);
    return signals.filter(
      (s) => s.userAction !== 'pending' && s.userAction !== 'ignored' && !s.outcome
    );
  }

  /**
   * Export signals for external analysis/training
   */
  exportSignals(tenantId?: string): string {
    const tid = tenantId || this.tenantId;
    const signals = this.getSignals(tid);
    return JSON.stringify(signals, null, 2);
  }

  /**
   * Clear old signals (keep most recent N)
   */
  pruneSignals(keepCount: number = 5000, tenantId?: string): number {
    const tid = tenantId || this.tenantId;
    const signals = this.getSignals(tid);

    if (signals.length <= keepCount) return 0;

    // Sort by timestamp desc and keep most recent
    signals.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const pruned = signals.slice(0, keepCount);
    this.setSignals(pruned, tid);

    return signals.length - keepCount;
  }

  // === PRIVATE METHODS ===

  private saveSignal(signal: TrainingSignal, tenantId: string): void {
    const signals = this.getSignals(tenantId);
    signals.push(signal);

    // Prune if over limit
    if (signals.length > MAX_SIGNALS_PER_TENANT) {
      signals.shift(); // Remove oldest
    }

    this.setSignals(signals, tenantId);
  }

  private setSignals(signals: TrainingSignal[], tenantId: string): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${tenantId}`, JSON.stringify(signals));
    } catch (error) {
      console.warn('Failed to save training signals:', error);
      // If localStorage is full, prune aggressively
      if (signals.length > 1000) {
        const pruned = signals.slice(-1000);
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${tenantId}`, JSON.stringify(pruned));
      }
    }
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
