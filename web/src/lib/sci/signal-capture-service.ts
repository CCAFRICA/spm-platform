// SCI Signal Capture Service — wraps signal-persistence.ts for SCI events
// Decision 30 — "Classification Signal" not "Training Signal"
// CRITICAL: Fire-and-forget. NEVER throws. Import NEVER fails due to signal capture.
// Zero domain vocabulary. Korean Test applies.

import { persistSignal, persistSignalBatch, getTrainingSignals } from '@/lib/ai/signal-persistence';
import type { SCISignalCapture, SCISignal } from './sci-signal-types';

// ============================================================
// WRITE OPERATIONS
// ============================================================

/**
 * Capture a single SCI signal. Maps SCISignalCapture → SignalData for persistence.
 * Returns signal_type on success, null on failure. NEVER throws.
 */
export async function captureSCISignal(capture: SCISignalCapture): Promise<string | null> {
  try {
    const confidence = extractConfidence(capture.signal);
    const result = await persistSignal({
      tenantId: capture.tenantId,
      entityId: capture.entityId,
      signalType: `sci:${capture.signal.signalType}`,
      signalValue: capture.signal as unknown as Record<string, unknown>,
      confidence,
      source: getSource(capture.signal),
      context: { sciVersion: '1.0', capturedAt: new Date().toISOString() },
    });

    if (result.success) {
      return capture.signal.signalType;
    }
    console.warn('[SCISignalCapture] Write failed:', result.error);
    return null;
  } catch (err) {
    console.warn('[SCISignalCapture] Exception (non-blocking):', err);
    return null;
  }
}

/**
 * Batch capture SCI signals. Returns count of successfully written signals.
 * NEVER throws.
 */
export async function captureSCISignalBatch(captures: SCISignalCapture[]): Promise<number> {
  if (captures.length === 0) return 0;

  try {
    const signals = captures.map(c => ({
      tenantId: c.tenantId,
      entityId: c.entityId,
      signalType: `sci:${c.signal.signalType}`,
      signalValue: c.signal as unknown as Record<string, unknown>,
      confidence: extractConfidence(c.signal),
      source: getSource(c.signal),
      context: { sciVersion: '1.0', capturedAt: new Date().toISOString() } as Record<string, unknown>,
    }));

    const result = await persistSignalBatch(signals);
    return result.count;
  } catch (err) {
    console.warn('[SCISignalCapture] Batch exception (non-blocking):', err);
    return 0;
  }
}

// ============================================================
// READ OPERATIONS
// ============================================================

/**
 * Get SCI signals for a tenant, optionally filtered by signal type.
 * Returns empty array on failure. NEVER throws.
 */
export async function getSCISignals(
  tenantId: string,
  options?: { signalType?: string; limit?: number }
): Promise<Array<{ signalType: string; signalValue: Record<string, unknown>; confidence: number | undefined; createdAt?: string }>> {
  try {
    const typeFilter = options?.signalType ? `sci:${options.signalType}` : undefined;
    const raw = await getTrainingSignals(tenantId, typeFilter, options?.limit || 200);

    return raw
      .filter(r => r.signalType.startsWith('sci:'))
      .map(r => ({
        signalType: r.signalType.replace('sci:', ''),
        signalValue: r.signalValue,
        confidence: r.confidence,
      }));
  } catch (err) {
    console.warn('[SCISignalCapture] getSCISignals exception:', err);
    return [];
  }
}

/**
 * Compute SCI classification accuracy from outcome signals.
 * Returns null if no outcome signals exist (honest empty state).
 */
export async function computeSCIAccuracy(
  tenantId: string
): Promise<{ total: number; correct: number; accuracy: number; overrideRate: number } | null> {
  try {
    const outcomes = await getSCISignals(tenantId, { signalType: 'content_classification_outcome', limit: 1000 });

    if (outcomes.length === 0) return null;

    let correct = 0;
    let overridden = 0;

    for (const o of outcomes) {
      const val = o.signalValue;
      if (val.wasOverridden === true) {
        overridden++;
      } else {
        correct++;
      }
    }

    return {
      total: outcomes.length,
      correct,
      accuracy: outcomes.length > 0 ? correct / outcomes.length : 0,
      overrideRate: outcomes.length > 0 ? overridden / outcomes.length : 0,
    };
  } catch (err) {
    console.warn('[SCISignalCapture] computeSCIAccuracy exception:', err);
    return null;
  }
}

/**
 * Compute SCI flywheel trend — classification confidence over time.
 * Returns null if < 2 data points.
 */
export async function computeSCIFlywheelTrend(
  tenantId: string
): Promise<Array<{ week: string; avgConfidence: number; signalCount: number; accuracy: number }> | null> {
  try {
    const classifications = await getSCISignals(tenantId, { signalType: 'content_classification', limit: 1000 });
    const outcomes = await getSCISignals(tenantId, { signalType: 'content_classification_outcome', limit: 1000 });

    if (classifications.length < 2) return null;

    // Group by ISO week
    const byWeek = new Map<string, { confSum: number; count: number; correct: number; outcomeCount: number }>();

    for (const c of classifications) {
      const capturedAt = (c.signalValue as Record<string, unknown>).capturedAt ||
        ((c as Record<string, unknown>).createdAt);
      const week = capturedAt ? getISOWeek(new Date(String(capturedAt))) : 'unknown';
      if (!byWeek.has(week)) byWeek.set(week, { confSum: 0, count: 0, correct: 0, outcomeCount: 0 });
      const w = byWeek.get(week)!;
      w.count++;
      w.confSum += (c.confidence || 0);
    }

    for (const o of outcomes) {
      const capturedAt = (o.signalValue as Record<string, unknown>).capturedAt ||
        ((o as Record<string, unknown>).createdAt);
      const week = capturedAt ? getISOWeek(new Date(String(capturedAt))) : 'unknown';
      if (!byWeek.has(week)) byWeek.set(week, { confSum: 0, count: 0, correct: 0, outcomeCount: 0 });
      const w = byWeek.get(week)!;
      w.outcomeCount++;
      if (!(o.signalValue as Record<string, unknown>).wasOverridden) w.correct++;
    }

    const points = Array.from(byWeek.entries())
      .filter(([week]) => week !== 'unknown')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, d]) => ({
        week,
        avgConfidence: d.count > 0 ? d.confSum / d.count : 0,
        signalCount: d.count,
        accuracy: d.outcomeCount > 0 ? d.correct / d.outcomeCount : 0,
      }));

    return points.length >= 2 ? points : null;
  } catch (err) {
    console.warn('[SCISignalCapture] computeSCIFlywheelTrend exception:', err);
    return null;
  }
}

/**
 * Compute cost curve — AI API costs over time.
 * Returns null if no cost events.
 */
export async function computeSCICostCurve(
  tenantId: string
): Promise<Array<{ week: string; totalCostUSD: number; apiCalls: number; avgTokens: number }> | null> {
  try {
    const costEvents = await getSCISignals(tenantId, { signalType: 'cost_event', limit: 1000 });

    if (costEvents.length === 0) return null;

    const byWeek = new Map<string, { cost: number; calls: number; tokens: number }>();

    for (const e of costEvents) {
      const val = e.signalValue;
      const capturedAt = (val as Record<string, unknown>).capturedAt ||
        ((e as Record<string, unknown>).createdAt);
      const week = capturedAt ? getISOWeek(new Date(String(capturedAt))) : 'unknown';
      if (!byWeek.has(week)) byWeek.set(week, { cost: 0, calls: 0, tokens: 0 });
      const w = byWeek.get(week)!;
      w.cost += (val.estimatedCostUSD as number) || 0;
      w.calls++;
      w.tokens += ((val.inputTokens as number) || 0) + ((val.outputTokens as number) || 0);
    }

    return Array.from(byWeek.entries())
      .filter(([week]) => week !== 'unknown')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, d]) => ({
        week,
        totalCostUSD: Math.round(d.cost * 10000) / 10000,
        apiCalls: d.calls,
        avgTokens: d.calls > 0 ? Math.round(d.tokens / d.calls) : 0,
      }));
  } catch (err) {
    console.warn('[SCISignalCapture] computeSCICostCurve exception:', err);
    return null;
  }
}

// ============================================================
// HELPERS
// ============================================================

function extractConfidence(signal: SCISignal): number {
  switch (signal.signalType) {
    case 'content_classification':
      return signal.winningConfidence;
    case 'content_classification_outcome':
      return signal.predictionConfidence;
    case 'field_binding':
      return signal.avgConfidence;
    case 'field_binding_outcome':
      return signal.predictionConfidence;
    case 'negotiation_round':
      return signal.round2TopConfidence;
    case 'convergence_outcome':
      return signal.matchRate;
    case 'cost_event':
      return 1.0; // cost events are factual, not predictive
  }
}

function getSource(signal: SCISignal): string {
  switch (signal.signalType) {
    case 'content_classification':
    case 'field_binding':
    case 'negotiation_round':
      return 'sci_agent';
    case 'content_classification_outcome':
    case 'field_binding_outcome':
      return (signal as { wasOverridden?: boolean }).wasOverridden ? 'user_corrected' : 'user_confirmed';
    case 'convergence_outcome':
      return 'reconciliation';
    case 'cost_event':
      return 'system';
  }
}

function getISOWeek(date: Date): string {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
