/**
 * Classification Signal Service
 *
 * Focused facade for persisting and retrieving classification signals per tenant.
 * Scoped by tenantId + data domain (e.g., "employee_data", "compensation_results").
 *
 * Integrates with:
 * - TrainingSignalService (AI-captured signals)
 * - Smart-mapper mapping history (usage-based signals)
 *
 * Confidence escalation:
 * - ai_initial: 0.60-0.80 (raw AI classification)
 * - user_confirmed: 0.95 (user accepted the AI suggestion)
 * - user_corrected: 0.99 (user provided explicit correction)
 *
 * Korean Test: No hardcoded field names. Works with any language/encoding.
 */

// ============================================
// TYPES
// ============================================

export type SignalSource = 'ai' | 'user_confirmed' | 'user_corrected';

export interface ClassificationSignal {
  id: string;
  tenantId: string;
  domain: string; // e.g., "employee_data", "compensation_results", "benchmark"
  fieldName: string; // The raw column/field name from the file
  semanticType: string; // e.g., "employee_id", "total_amount", "component:optical_sales"
  confidence: number; // 0-1
  source: SignalSource;
  timestamp: string;
  metadata?: Record<string, unknown>; // Additional context (fileName, sheetName, etc.)
}

export interface ConfidentMapping {
  fieldName: string;
  semanticType: string;
  confidence: number;
  source: SignalSource;
  signalCount: number; // How many signals support this mapping
}

// ============================================
// STORAGE
// ============================================

const STORAGE_KEY = (tenantId: string) => `vialuce_classification_signals_${tenantId}`;
const MAX_SIGNALS_PER_TENANT = 5000;

// ============================================
// PUBLIC API
// ============================================

/**
 * Record a classification signal for a field mapping.
 */
export function recordSignal(signal: Omit<ClassificationSignal, 'id' | 'timestamp'>): string {
  if (typeof window === 'undefined') return '';

  const id = `cs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fullSignal: ClassificationSignal = {
    ...signal,
    id,
    timestamp: new Date().toISOString(),
  };

  const signals = loadSignals(signal.tenantId);
  signals.push(fullSignal);

  // Prune if over limit (keep most recent)
  if (signals.length > MAX_SIGNALS_PER_TENANT) {
    signals.splice(0, signals.length - MAX_SIGNALS_PER_TENANT);
  }

  saveSignals(signal.tenantId, signals);
  return id;
}

/**
 * Record multiple signals from an AI classification batch.
 * Convenience wrapper for recording all mappings from a single file classification.
 */
export function recordAIClassificationBatch(
  tenantId: string,
  domain: string,
  mappings: Array<{ fieldName: string; semanticType: string; confidence: number }>,
  metadata?: Record<string, unknown>,
): string[] {
  return mappings.map((m) =>
    recordSignal({
      tenantId,
      domain,
      fieldName: m.fieldName,
      semanticType: m.semanticType,
      confidence: m.confidence,
      source: 'ai',
      metadata,
    })
  );
}

/**
 * Record a user confirmation (accepted AI suggestion).
 * Escalates confidence to 0.95.
 */
export function recordUserConfirmation(
  tenantId: string,
  domain: string,
  fieldName: string,
  semanticType: string,
  metadata?: Record<string, unknown>,
): string {
  return recordSignal({
    tenantId,
    domain,
    fieldName,
    semanticType,
    confidence: 0.95,
    source: 'user_confirmed',
    metadata,
  });
}

/**
 * Record a user correction (user changed the AI suggestion).
 * Escalates confidence to 0.99.
 */
export function recordUserCorrection(
  tenantId: string,
  domain: string,
  fieldName: string,
  semanticType: string,
  metadata?: Record<string, unknown>,
): string {
  return recordSignal({
    tenantId,
    domain,
    fieldName,
    semanticType,
    confidence: 0.99,
    source: 'user_corrected',
    metadata,
  });
}

/**
 * Get all signals for a tenant, optionally filtered by domain.
 */
export function getSignals(tenantId: string, domain?: string): ClassificationSignal[] {
  const signals = loadSignals(tenantId);
  if (domain) {
    return signals.filter((s) => s.domain === domain);
  }
  return signals;
}

/**
 * Get confident mappings for a tenant.
 * Returns the best mapping per normalized field name, with confidence >= threshold.
 * Aggregates across all signals, picking the highest-confidence source.
 */
export function getConfidentMappings(
  tenantId: string,
  threshold: number = 0.85,
  domain?: string,
): ConfidentMapping[] {
  const signals = getSignals(tenantId, domain);

  // Group by normalized field name
  const grouped = new Map<string, ClassificationSignal[]>();
  for (const signal of signals) {
    const key = normalizeFieldName(signal.fieldName);
    const existing = grouped.get(key) || [];
    existing.push(signal);
    grouped.set(key, existing);
  }

  const results: ConfidentMapping[] = [];

  for (const [, fieldSignals] of Array.from(grouped.entries())) {
    // Find the highest-confidence signal for this field
    // Priority: user_corrected > user_confirmed > ai (by confidence, then recency)
    const sorted = fieldSignals.sort((a, b) => {
      // Source priority
      const sourcePriority: Record<SignalSource, number> = {
        user_corrected: 3,
        user_confirmed: 2,
        ai: 1,
      };
      const sPriority = sourcePriority[b.source] - sourcePriority[a.source];
      if (sPriority !== 0) return sPriority;
      // Then by confidence
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      // Then by recency
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const best = sorted[0];
    if (best.confidence >= threshold) {
      results.push({
        fieldName: best.fieldName,
        semanticType: best.semanticType,
        confidence: best.confidence,
        source: best.source,
        signalCount: fieldSignals.length,
      });
    }
  }

  return results;
}

/**
 * Boost an AI-generated confidence using prior signals.
 * Returns the effective confidence: max(aiConfidence, priorConfidence).
 */
export function boostConfidence(
  tenantId: string,
  fieldName: string,
  aiConfidence: number,
  domain?: string,
): { effectiveConfidence: number; source: SignalSource; boosted: boolean } {
  const signals = getSignals(tenantId, domain);
  const normalized = normalizeFieldName(fieldName);

  // Find the best prior signal for this field
  let bestPrior: ClassificationSignal | null = null;
  for (const signal of signals) {
    if (normalizeFieldName(signal.fieldName) === normalized) {
      if (!bestPrior || signal.confidence > bestPrior.confidence) {
        bestPrior = signal;
      }
    }
  }

  if (bestPrior && bestPrior.confidence > aiConfidence) {
    return {
      effectiveConfidence: bestPrior.confidence,
      source: bestPrior.source,
      boosted: true,
    };
  }

  return {
    effectiveConfidence: aiConfidence,
    source: 'ai',
    boosted: false,
  };
}

/**
 * Clear all signals for a tenant (for testing/reset).
 */
export function clearSignals(tenantId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY(tenantId));
}

// ============================================
// INTERNAL
// ============================================

function normalizeFieldName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\u1100-\u11FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, '').trim();
}

function loadSignals(tenantId: string): ClassificationSignal[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY(tenantId));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveSignals(tenantId: string, signals: ClassificationSignal[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY(tenantId), JSON.stringify(signals));
  } catch (error) {
    console.warn('[ClassificationSignals] Storage error, pruning:', error);
    if (signals.length > 1000) {
      const pruned = signals.slice(-1000);
      localStorage.setItem(STORAGE_KEY(tenantId), JSON.stringify(pruned));
    }
  }
}
