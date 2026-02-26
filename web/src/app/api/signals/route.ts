/**
 * API Route: Classification Signals
 *
 * GET /api/signals?tenant_id=...&signal_type=...&limit=...
 * Returns classification_signals for the tenant.
 *
 * POST /api/signals
 * Creates classification signals (e.g., field_mapping accept/override).
 *
 * Used by: AI dashboard, VL Admin signal monitoring, closed-loop verification.
 *
 * Columns from SCHEMA_REFERENCE.md:
 *   id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenant_id');
    const signalType = searchParams.get('signal_type');
    const limitParam = searchParams.get('limit');
    const limit = Math.min(parseInt(limitParam || '50', 10), 200);

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenant_id query parameter is required' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from('classification_signals')
      .select('id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (signalType) {
      query = query.eq('signal_type', signalType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Signals API] Query failed:', error.message);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Compute summary stats
    const signals = data || [];
    const typeBreakdown: Record<string, number> = {};
    const sourceBreakdown: Record<string, number> = {};
    let confidenceSum = 0;
    let confidenceCount = 0;

    for (const signal of signals) {
      typeBreakdown[signal.signal_type] = (typeBreakdown[signal.signal_type] || 0) + 1;
      if (signal.source) {
        sourceBreakdown[signal.source] = (sourceBreakdown[signal.source] || 0) + 1;
      }
      if (signal.confidence != null) {
        confidenceSum += signal.confidence;
        confidenceCount++;
      }
    }

    return NextResponse.json({
      signals,
      summary: {
        total: signals.length,
        byType: typeBreakdown,
        bySource: sourceBreakdown,
        avgConfidence: confidenceCount > 0 ? confidenceSum / confidenceCount : null,
      },
    });
  } catch (error) {
    console.error('[Signals API] Exception:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/signals — Create classification signals (field_mapping, etc.)
 * HF-068: Captures accept/override decisions for closed-loop learning.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signals } = body as {
      signals: Array<{
        tenant_id: string;
        signal_type: string;
        signal_value: Record<string, unknown>;
        confidence: number;
        source: string;
        context: Record<string, unknown>;
      }>;
    };

    if (!signals || !Array.isArray(signals) || signals.length === 0) {
      return NextResponse.json({ error: 'signals array is required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    const rows = signals.map(s => ({
      tenant_id: s.tenant_id,
      signal_type: s.signal_type,
      signal_value: s.signal_value as unknown as undefined,
      confidence: s.confidence,
      source: s.source,
      context: s.context as unknown as undefined,
    }));

    const { data, error } = await supabase
      .from('classification_signals')
      .insert(rows)
      .select('id');

    if (error) {
      console.error('[Signals API] Insert failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: data?.length || 0 });
  } catch (error) {
    console.error('[Signals API] POST exception:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
