/**
 * API Route: Classification Signals
 *
 * GET /api/signals?tenant_id=...&signal_type=...&limit=...
 * Returns classification_signals for the tenant.
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
