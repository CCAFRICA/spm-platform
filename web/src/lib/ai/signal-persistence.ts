/**
 * Signal Persistence Service — OB-199 Phase 3 thin-wrap of canonical writer
 *
 * History:
 *   HF-055 — Bridged in-memory signal capture → Supabase classification_signals
 *   HF-161 — Refactored to argument-passing (removed dynamic-import getClient()
 *            pattern that caused TypeError: fetch failed in Vercel serverless)
 *   HF-214 Phase 1 — Added catch-block diagnostic instrumentation
 *   HF-214 Phase 2 — Added writer-side confidence clamp at [0, 0.9999]
 *   HF-215 — Reverted Phase 2 B1 prompt amendment; preserved clamp + B2
 *   OB-199 Phase 3 (this) — `signal-persistence.ts` becomes a thin wrapper
 *            calling `canonical-signal-writer.ts`. Clamp blocks deleted per
 *            DS-023 §5.5. HF-214 Phase 1 per-row diagnostic emission deleted
 *            (canonical writer surfaces structural failures via the typed
 *            CanonicalWriteError and observability:write_failure signal).
 *   OB-199 Phase 4 (next) — `signal-persistence.ts` deletes entirely; all
 *            callers migrate to call canonical-signal-writer.ts directly.
 *
 * This file remains only to preserve the existing call sites' return-shape
 * contract during the Phase 4 migration window. Each function maps to the
 * canonical writer's typed-result return shape, converting CanonicalWriteError
 * back into the legacy `{ success: false, error: string }` shape so callers
 * not yet migrated continue to work. Once all callers migrate (Phase 4), this
 * file deletes entirely.
 */

import { createClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/database.types';
import { isRegistered as isSignalTypeRegistered, all as allRegisteredSignalTypes } from '@/lib/intelligence/signal-registry';
import {
  writeSignal as canonicalWriteSignal,
  writeSignalBatch as canonicalWriteSignalBatch,
  CanonicalWriteError,
  type CanonicalSignalInput,
} from '@/lib/intelligence/canonical-signal-writer';

// ============================================
// TYPES
// ============================================

export interface SignalData {
  tenantId: string;
  signalType: string;          // OB-197: prefix vocabulary — classification:* | comprehension:* | convergence:* | cost:* | lifecycle:*
  signalValue: Record<string, unknown>;
  confidence?: number;
  source?: string;             // 'ai_prediction' | 'user_confirmed' | 'user_corrected' | 'ai'
  entityId?: string;
  context?: Record<string, unknown>;
  calculationRunId?: string;   // OB-197 G11: scope signal to a calculation run; null when emitted outside a run
  ruleSetId?: string;          // HF-198 E5: scope signal to a rule_set (e.g., 'comprehension:plan_interpretation' per-component emissions)
}

// ============================================
// WRITE OPERATIONS (THIN WRAPPER — Phase 3)
// ============================================

function toCanonicalInput(signal: SignalData): CanonicalSignalInput {
  return {
    tenantId: signal.tenantId,
    signalType: signal.signalType,
    signalValue: signal.signalValue,
    confidence: signal.confidence,
    source: signal.source,
    entityId: signal.entityId ?? null,
    context: signal.context,
    calculationRunId: signal.calculationRunId ?? null,
    ruleSetId: signal.ruleSetId ?? null,
  };
}

/**
 * Persist a single signal. OB-199 Phase 3: thin wrapper around
 * `canonical-signal-writer.writeSignal`. Legacy return shape preserved
 * so pre-Phase-4 callers continue to work.
 */
export async function persistSignal(
  signal: SignalData,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<{ success: boolean; error?: string }> {
  // HF-198 E3: read-coupling soft validation — surface unregistered signal_types.
  // OB-199 Phase 3: the canonical writer also enforces this structurally (throws
  // CanonicalWriteError); the soft-warn here preserves the pre-canonical caller
  // observability surface for callers not yet migrated.
  if (!isSignalTypeRegistered(signal.signalType)) {
    console.warn(
      `[SignalRegistry] persistSignal: signal_type '${signal.signalType}' not registered. ` +
      `OB-199 Phase 3+: canonical writer rejects unregistered identifiers structurally. ` +
      `Available: ${allRegisteredSignalTypes().map(d => d.identifier).join(', ')}`,
    );
  }
  try {
    await canonicalWriteSignal(toCanonicalInput(signal), supabaseUrl, supabaseServiceKey);
    return { success: true };
  } catch (err) {
    if (err instanceof CanonicalWriteError) {
      console.error(`[SignalPersistence] CanonicalWriteError (${err.cause}) for signal_type='${signal.signalType}' tenant='${signal.tenantId}': ${err.message}`);
      return { success: false, error: err.message };
    }
    console.error(`[SignalPersistence] Unexpected error for signal_type='${signal.signalType}' tenant='${signal.tenantId}':`, err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Persist a batch of signals. OB-199 Phase 3: thin wrapper around
 * `canonical-signal-writer.writeSignalBatch`. Legacy return shape preserved.
 */
export async function persistSignalBatch(
  signals: SignalData[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  if (signals.length === 0) return { success: true, count: 0 };

  // HF-198 E3: read-coupling soft validation surface preserved for pre-migration callers.
  const unregistered = new Set<string>();
  for (const s of signals) {
    if (!isSignalTypeRegistered(s.signalType)) unregistered.add(s.signalType);
  }
  if (unregistered.size > 0) {
    console.warn(
      `[SignalRegistry] persistSignalBatch: unregistered signal_type(s): ${Array.from(unregistered).join(', ')}. ` +
      `OB-199 Phase 3+: canonical writer rejects unregistered identifiers structurally.`,
    );
  }

  try {
    const result = await canonicalWriteSignalBatch(
      signals.map(toCanonicalInput),
      supabaseUrl,
      supabaseServiceKey,
    );
    return { success: true, count: result.count };
  } catch (err) {
    if (err instanceof CanonicalWriteError) {
      console.error(`[SignalPersistence] Batch CanonicalWriteError (${err.cause}) count=${signals.length}: ${err.message}`);
      return { success: false, count: 0, error: err.message };
    }
    console.error(`[SignalPersistence] Batch unexpected error count=${signals.length}:`, err);
    return { success: false, count: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================
// READ OPERATIONS (unchanged — out of OB-199 scope)
// ============================================

/**
 * Retrieve training signals from Supabase classification_signals table.
 * HF-161: Accepts Supabase credentials as arguments (no dynamic imports).
 */
export async function getTrainingSignals(
  tenantId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  signalType?: string,
  limit: number = 100,
): Promise<SignalData[]> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let query = supabase
      .from('classification_signals')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (signalType) {
      query = query.eq('signal_type', signalType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[SignalPersistence] getTrainingSignals failed:', error.message, '| tenant:', tenantId);
      return [];
    }

    return (data || []).map(row => ({
      tenantId: row.tenant_id,
      signalType: row.signal_type,
      signalValue: (typeof row.signal_value === 'object' && row.signal_value !== null)
        ? row.signal_value as Record<string, unknown>
        : {},
      confidence: row.confidence ?? undefined,
      source: row.source ?? undefined,
      entityId: row.entity_id ?? undefined,
      context: (typeof row.context === 'object' && row.context !== null)
        ? row.context as Record<string, unknown>
        : {},
    }));
  } catch (err) {
    console.error('[SignalPersistence] getTrainingSignals exception:', err, '| tenant:', tenantId);
    return [];
  }
}

// Re-export Json type for any caller that imports it via this module
export type { Json };
