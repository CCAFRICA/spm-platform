# E2.1 — Signal Reader Full Source (verbatim with line numbers)

**File:** `web/src/lib/ai/signal-reader.ts`
**Total lines:** 87
**Captured at:** AUD-007 execution, branch HEAD

```typescript
     1	/**
     2	 * Signal Reader — OB-199 Phase 4 (final)
     3	 *
     4	 * Read-only surface for `classification_signals`. Successor to the read
     5	 * functions previously in `signal-persistence.ts` (which is deleted at the
     6	 * end of Phase 4).
     7	 *
     8	 * Write surface lives at `@/lib/intelligence/canonical-signal-writer.ts`
     9	 * (DS-023 §5.1 single entry point).
    10	 *
    11	 * HF-161 contract preserved: accepts Supabase credentials as arguments
    12	 * (no dynamic imports, no module-level client construction).
    13	 */
    14	
    15	import { createClient } from '@supabase/supabase-js';
    16	
    17	// ============================================
    18	// TYPES (preserved from deleted signal-persistence.ts for caller compatibility)
    19	// ============================================
    20	
    21	export interface SignalData {
    22	  tenantId: string;
    23	  signalType: string;          // OB-197: prefix vocabulary — classification:* | comprehension:* | convergence:* | cost:* | lifecycle:*
    24	  signalValue: Record<string, unknown>;
    25	  confidence?: number;
    26	  source?: string;             // 'ai_prediction' | 'user_confirmed' | 'user_corrected' | 'ai'
    27	  entityId?: string;
    28	  context?: Record<string, unknown>;
    29	  calculationRunId?: string;
    30	  ruleSetId?: string;
    31	}
    32	
    33	// ============================================
    34	// READ OPERATIONS
    35	// ============================================
    36	
    37	/**
    38	 * Retrieve training signals from Supabase classification_signals table.
    39	 * HF-161: Accepts Supabase credentials as arguments (no dynamic imports).
    40	 */
    41	export async function getTrainingSignals(
    42	  tenantId: string,
    43	  supabaseUrl: string,
    44	  supabaseServiceKey: string,
    45	  signalType?: string,
    46	  limit: number = 100,
    47	): Promise<SignalData[]> {
    48	  try {
    49	    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    50	      auth: { autoRefreshToken: false, persistSession: false },
    51	    });
    52	    let query = supabase
    53	      .from('classification_signals')
    54	      .select('*')
    55	      .eq('tenant_id', tenantId)
    56	      .order('created_at', { ascending: false })
    57	      .limit(limit);
    58	
    59	    if (signalType) {
    60	      query = query.eq('signal_type', signalType);
    61	    }
    62	
    63	    const { data, error } = await query;
    64	
    65	    if (error) {
    66	      console.error('[SignalReader] getTrainingSignals failed:', error.message, '| tenant:', tenantId);
    67	      return [];
    68	    }
    69	
    70	    return (data || []).map(row => ({
    71	      tenantId: row.tenant_id,
    72	      signalType: row.signal_type,
    73	      signalValue: (typeof row.signal_value === 'object' && row.signal_value !== null)
    74	        ? row.signal_value as Record<string, unknown>
    75	        : {},
    76	      confidence: row.confidence ?? undefined,
    77	      source: row.source ?? undefined,
    78	      entityId: row.entity_id ?? undefined,
    79	      context: (typeof row.context === 'object' && row.context !== null)
    80	        ? row.context as Record<string, unknown>
    81	        : {},
    82	    }));
    83	  } catch (err) {
    84	    console.error('[SignalReader] getTrainingSignals exception:', err, '| tenant:', tenantId);
    85	    return [];
    86	  }
    87	}
```
