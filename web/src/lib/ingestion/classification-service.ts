/**
 * Classification Service — DS-005 classification signal capture.
 *
 * Records every AI classification decision as an immutable signal
 * linked to an ingestion event. Tracks:
 * - AI prediction and confidence
 * - User decision (accept/override)
 * - Whether the user corrected the AI
 */

// ── Types ──

export interface ClassificationSignal {
  eventId: string;
  aiPrediction: string;
  aiConfidence: number;
  userDecision: string;
  wasCorrected: boolean;
}

export interface ClassificationResult {
  signalId: string;
  eventId: string;
  prediction: string;
  confidence: number;
}

// ── API ──

/**
 * Record a classification signal for an ingestion event.
 * Called after the AI classifies a file and the user confirms/overrides.
 */
export async function recordClassificationSignal(
  signal: ClassificationSignal
): Promise<ClassificationResult | null> {
  try {
    const res = await fetch('/api/ingest/classification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: signal.eventId,
        ai_prediction: signal.aiPrediction,
        ai_confidence: signal.aiConfidence,
        user_decision: signal.userDecision,
        was_corrected: signal.wasCorrected,
      }),
    });

    if (!res.ok) {
      console.error('[Classification] Failed to record signal:', await res.text());
      return null;
    }

    const data = await res.json();
    return {
      signalId: data.signal_id,
      eventId: signal.eventId,
      prediction: signal.aiPrediction,
      confidence: signal.aiConfidence,
    };
  } catch (err) {
    console.error('[Classification] Error recording signal:', err);
    return null;
  }
}

/**
 * Record an auto-accepted classification (AI confidence >= threshold).
 * Convenience wrapper for the common case.
 */
export async function recordAutoClassification(
  eventId: string,
  prediction: string,
  confidence: number
): Promise<ClassificationResult | null> {
  return recordClassificationSignal({
    eventId,
    aiPrediction: prediction,
    aiConfidence: confidence,
    userDecision: prediction, // Auto-accepted
    wasCorrected: false,
  });
}

/**
 * Record a user-corrected classification.
 */
export async function recordCorrectedClassification(
  eventId: string,
  aiPrediction: string,
  aiConfidence: number,
  userDecision: string
): Promise<ClassificationResult | null> {
  return recordClassificationSignal({
    eventId,
    aiPrediction,
    aiConfidence,
    userDecision,
    wasCorrected: aiPrediction !== userDecision,
  });
}
