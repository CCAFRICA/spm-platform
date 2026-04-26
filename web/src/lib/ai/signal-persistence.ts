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

// ============================================
// TYPES
// ============================================

export interface SignalData {
  tenantId: string;
  signalType: string;          // 'sheet_classification' | 'field_mapping' | 'plan_interpretation' | 'training:*'
  signalValue: Record<string, unknown>;
  confidence?: number;
  source?: string;             // 'ai_prediction' | 'user_confirmed' | 'user_corrected' | 'ai'
  entityId?: string;
  context?: Record<string, unknown>;
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
