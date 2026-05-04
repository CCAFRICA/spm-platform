/**
 * Signal Persistence Service
 *
 * HF-055: Bridges in-memory signal capture → Supabase classification_signals table.
 * HF-161: Refactored to argument-passing pattern (same as writeClassificationSignal).
 *         Removed getClient() dual-mode resolution that caused TypeError: fetch failed
 *         in Vercel serverless functions. Static import, no dynamic imports.
 *
 * Columns from SCHEMA_REFERENCE.md:
 *   id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at
 */

import { createClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/database.types';
// HF-198 E3: signal-type read-coupling — every signal_type validated against
// the registry before persist. Unregistered writes log a soft warn (signal
// writes are fire-and-forget; discipline preserved). Hard-failure path is
// available via assertRegistered() at call sites that require it.
import { isRegistered as isSignalTypeRegistered, all as allRegisteredSignalTypes } from '@/lib/intelligence/signal-registry';

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
// WRITE OPERATIONS
// ============================================

/**
 * Persist a single signal to Supabase classification_signals table.
 * HF-161: Accepts Supabase credentials as arguments (no dynamic imports).
 */
export async function persistSignal(
  signal: SignalData,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<{ success: boolean; error?: string }> {
  // HF-198 E3: read-coupling soft validation — surface unregistered signal_types.
  if (!isSignalTypeRegistered(signal.signalType)) {
    console.warn(
      `[SignalRegistry] persistSignal: signal_type '${signal.signalType}' not registered. ` +
      `Per AUD-004 v3 §2 E3, every signal_type should declare ≥1 reader. ` +
      `Available: ${allRegisteredSignalTypes().map(d => d.identifier).join(', ')}`,
    );
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await supabase
      .from('classification_signals')
      .insert({
        tenant_id: signal.tenantId,
        entity_id: signal.entityId || null,
        signal_type: signal.signalType,
        signal_value: (signal.signalValue || {}) as Json,
        confidence: signal.confidence ?? null,
        source: signal.source ?? 'ai_prediction',
        context: (signal.context ?? {}) as Json,
        calculation_run_id: signal.calculationRunId ?? null,
        rule_set_id: signal.ruleSetId ?? null,
      });

    if (error) {
      console.error('[SignalPersistence] Failed to persist signal:', error.message, '| signal_type:', signal.signalType, '| tenant:', signal.tenantId);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error('[SignalPersistence] Exception:', err, '| signal_type:', signal.signalType, '| tenant:', signal.tenantId);
    return { success: false, error: String(err) };
  }
}

/**
 * Persist a batch of signals to Supabase classification_signals table.
 * HF-161: Accepts Supabase credentials as arguments (no dynamic imports).
 */
export async function persistSignalBatch(
  signals: SignalData[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  if (signals.length === 0) return { success: true, count: 0 };

  // HF-198 E3: read-coupling soft validation — surface unregistered signal_types.
  const unregistered = new Set<string>();
  for (const s of signals) {
    if (!isSignalTypeRegistered(s.signalType)) unregistered.add(s.signalType);
  }
  if (unregistered.size > 0) {
    console.warn(
      `[SignalRegistry] persistSignalBatch: unregistered signal_type(s): ${Array.from(unregistered).join(', ')}. ` +
      `Per AUD-004 v3 §2 E3, every signal_type should declare ≥1 reader.`,
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const rows = signals.map(s => ({
      tenant_id: s.tenantId,
      entity_id: s.entityId || null,
      signal_type: s.signalType,
      signal_value: (s.signalValue || {}) as Json,
      confidence: s.confidence ?? null,
      source: s.source ?? 'ai_prediction',
      context: (s.context ?? {}) as Json,
      calculation_run_id: s.calculationRunId ?? null,
      rule_set_id: s.ruleSetId ?? null,
    }));

    const { error } = await supabase
      .from('classification_signals')
      .insert(rows);

    if (error) {
      console.error('[SignalPersistence] Batch failed:', error.message, '| count:', signals.length, '| tenant:', signals[0]?.tenantId);
      return { success: false, count: 0, error: error.message };
    }
    return { success: true, count: signals.length };
  } catch (err) {
    console.error('[SignalPersistence] Batch exception:', err, '| count:', signals.length, '| tenant:', signals[0]?.tenantId);
    return { success: false, count: 0, error: String(err) };
  }
}

// ============================================
// READ OPERATIONS
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
