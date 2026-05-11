# E2.2 — Pre-deletion `getTrainingSignals` (commit 5e42d88d^ = ff55872c)

**Source:** `git show 5e42d88d^:web/src/lib/ai/signal-persistence.ts` (lines 188–242)
**Note:** 5e42d88d^ resolves to commit `ff55872c` (OB-199 Phase 2 close, before Phase 3 thin-wrap conversion).

```typescript
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
```
