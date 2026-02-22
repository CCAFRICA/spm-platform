/**
 * Synaptic Density Persistence
 *
 * Persists PatternDensity to Supabase synaptic_density table.
 * Loads at run start. Persists after consolidation.
 * Nuclear clear for fresh start / testing.
 *
 * ZERO domain language. Korean Test applies.
 * Fire-and-forget writes — never blocks the entity loop.
 */

import type { SynapticDensity, PatternDensity, DensityUpdate, ExecutionMode } from './synaptic-types';

// ──────────────────────────────────────────────
// Client Resolution (same pattern as signal-persistence)
// ──────────────────────────────────────────────

async function getClient() {
  if (typeof window !== 'undefined') {
    const { createClient } = await import('@/lib/supabase/client');
    return createClient();
  } else {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('[SynapticDensity] Missing Supabase env vars');
    }
    return createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
}

// ──────────────────────────────────────────────
// Load — called once at run start
// ──────────────────────────────────────────────

/**
 * Load all PatternDensity entries for a tenant.
 * Returns a SynapticDensity map (signature → PatternDensity).
 * On failure, returns empty map — calculation proceeds without density.
 */
export async function loadDensity(tenantId: string): Promise<SynapticDensity> {
  const density: SynapticDensity = new Map();

  try {
    const supabase = await getClient();
    const { data, error } = await supabase
      .from('synaptic_density')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[SynapticDensity] loadDensity failed:', error.message);
      return density;
    }

    for (const row of data ?? []) {
      density.set(row.signature, {
        signature: row.signature,
        confidence: row.confidence ?? 0.5,
        totalExecutions: row.total_executions ?? 0,
        lastAnomalyRate: row.last_anomaly_rate ?? 0,
        lastCorrectionCount: row.last_correction_count ?? 0,
        executionMode: (row.execution_mode ?? 'full_trace') as ExecutionMode,
        learnedBehaviors: (typeof row.learned_behaviors === 'object' && row.learned_behaviors !== null)
          ? row.learned_behaviors as Record<string, unknown>
          : {},
      });
    }
  } catch (err) {
    console.error('[SynapticDensity] loadDensity exception:', err);
  }

  return density;
}

// ──────────────────────────────────────────────
// Persist — called once after consolidation
// ──────────────────────────────────────────────

/**
 * Persist density updates to Supabase.
 * Uses upsert on (tenant_id, signature) to merge with existing.
 * Fire-and-forget — caller should `.catch()` this.
 */
export async function persistDensityUpdates(
  tenantId: string,
  updates: DensityUpdate[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (updates.length === 0) return { success: true, count: 0 };

  try {
    const supabase = await getClient();
    const rows = updates.map(u => ({
      tenant_id: tenantId,
      signature: u.signature,
      confidence: u.newConfidence,
      execution_mode: u.newMode,
      total_executions: u.totalExecutions,
      last_anomaly_rate: u.anomalyRate,
      updated_at: new Date().toISOString(),
    }));

    // Upsert in chunks of 500
    const CHUNK_SIZE = 500;
    let persisted = 0;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from('synaptic_density')
        .upsert(chunk, { onConflict: 'tenant_id,signature' });

      if (error) {
        console.error('[SynapticDensity] persistDensityUpdates chunk failed:', error.message);
        return { success: false, count: persisted, error: error.message };
      }
      persisted += chunk.length;
    }

    return { success: true, count: persisted };
  } catch (err) {
    console.error('[SynapticDensity] persistDensityUpdates exception:', err);
    return { success: false, count: 0, error: String(err) };
  }
}

// ──────────────────────────────────────────────
// Nuclear Clear — for testing / fresh start
// ──────────────────────────────────────────────

/**
 * Delete ALL density entries for a tenant.
 * Irreversible. Use with care.
 */
export async function nuclearClearDensity(
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getClient();
    const { error } = await supabase
      .from('synaptic_density')
      .delete()
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[SynapticDensity] nuclearClear failed:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error('[SynapticDensity] nuclearClear exception:', err);
    return { success: false, error: String(err) };
  }
}
