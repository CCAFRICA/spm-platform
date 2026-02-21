/**
 * Signal Persistence Service
 *
 * HF-055: Bridges in-memory signal capture → Supabase classification_signals table.
 * Works in both browser (client components) and server (API routes) contexts.
 *
 * Client-side: uses browser Supabase client (cookie-based auth)
 * Server-side: uses @supabase/supabase-js directly with service role key (no next/headers import)
 *
 * Columns from SCHEMA_REFERENCE.md:
 *   id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at
 */

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
// CLIENT RESOLUTION
// ============================================

/**
 * Get a Supabase client that works in both browser and server contexts.
 * Browser: uses @supabase/ssr browser client (from client.ts)
 * Server: uses @supabase/supabase-js with service role key (avoids next/headers)
 */
async function getClient() {
  if (typeof window !== 'undefined') {
    // Browser context: use the existing browser client
    const { createClient } = await import('@/lib/supabase/client');
    return createClient();
  } else {
    // Server context: create a standalone client with service role key
    // This avoids importing next/headers which breaks client component bundles
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('[SignalPersistence] Missing Supabase env vars for server-side persistence');
    }
    return createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
}

// ============================================
// WRITE OPERATIONS
// ============================================

/**
 * Persist a single signal to Supabase classification_signals table.
 */
export async function persistSignal(signal: SignalData): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getClient();
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
      console.error('[SignalPersistence] Failed to persist signal:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error('[SignalPersistence] Exception:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Persist a batch of signals to Supabase classification_signals table.
 */
export async function persistSignalBatch(signals: SignalData[]): Promise<{ success: boolean; count: number; error?: string }> {
  if (signals.length === 0) return { success: true, count: 0 };

  try {
    const supabase = await getClient();
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
      console.error('[SignalPersistence] Batch failed:', error.message);
      return { success: false, count: 0, error: error.message };
    }
    return { success: true, count: signals.length };
  } catch (err) {
    console.error('[SignalPersistence] Batch exception:', err);
    return { success: false, count: 0, error: String(err) };
  }
}

// ============================================
// READ OPERATIONS
// ============================================

/**
 * Retrieve training signals from Supabase classification_signals table.
 * Replaces the old in-memory getSignals() that returned [].
 */
export async function getTrainingSignals(
  tenantId: string,
  signalType?: string,
  limit: number = 100
): Promise<SignalData[]> {
  try {
    const supabase = await getClient();
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
      console.error('[SignalPersistence] getTrainingSignals failed:', error.message);
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
    console.error('[SignalPersistence] getTrainingSignals exception:', err);
    return [];
  }
}
