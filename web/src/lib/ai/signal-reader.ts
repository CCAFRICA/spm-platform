/**
 * Signal Reader — OB-199 Phase 4 (final)
 *
 * Read-only surface for `classification_signals`. Successor to the read
 * functions previously in `signal-persistence.ts` (which is deleted at the
 * end of Phase 4).
 *
 * Write surface lives at `@/lib/intelligence/canonical-signal-writer.ts`
 * (DS-023 §5.1 single entry point).
 *
 * HF-161 contract preserved: accepts Supabase credentials as arguments
 * (no dynamic imports, no module-level client construction).
 */

import { createClient } from '@supabase/supabase-js';

// ============================================
// TYPES (preserved from deleted signal-persistence.ts for caller compatibility)
// ============================================

export interface SignalData {
  tenantId: string;
  signalType: string;          // OB-197: prefix vocabulary — classification:* | comprehension:* | convergence:* | cost:* | lifecycle:*
  signalValue: Record<string, unknown>;
  confidence?: number;
  source?: string;             // 'ai_prediction' | 'user_confirmed' | 'user_corrected' | 'ai'
  entityId?: string;
  context?: Record<string, unknown>;
  calculationRunId?: string;
  ruleSetId?: string;
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
      console.error('[SignalReader] getTrainingSignals failed:', error.message, '| tenant:', tenantId);
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
    console.error('[SignalReader] getTrainingSignals exception:', err, '| tenant:', tenantId);
    return [];
  }
}
