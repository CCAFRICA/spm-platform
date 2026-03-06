// SCI Trace API — GET /api/import/sci/trace
// OB-160E — Returns classification signals with full traces for a tenant
// Supports verification scripts and browser-based debugging
// Zero domain vocabulary. Korean Test applies.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 100);
    const sourceFile = searchParams.get('sourceFile');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    let query = supabase
      .from('classification_signals')
      .select('id, tenant_id, signal_type, signal_value, confidence, source, context, created_at')
      .eq('tenant_id', tenantId)
      .eq('signal_type', 'sci:classification_outcome_v2')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (sourceFile) {
      query = query.filter('signal_value->>source_file_name', 'eq', sourceFile);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Query failed', details: error.message }, { status: 500 });
    }

    const signals = (data || []).map(row => {
      const sv = row.signal_value as Record<string, unknown>;
      return {
        id: row.id,
        sheet_name: sv.sheet_name,
        source_file_name: sv.source_file_name,
        classification: sv.classification,
        confidence: row.confidence,
        decision_source: sv.decision_source,
        structural_fingerprint: sv.structural_fingerprint,
        classification_trace: sv.classification_trace,
        vocabulary_bindings: sv.vocabulary_bindings,
        agent_scores: sv.agent_scores,
        human_correction_from: sv.human_correction_from,
        scope: sv.scope,
        created_at: row.created_at,
      };
    });

    return NextResponse.json({
      signals,
      count: signals.length,
      tenant_id: tenantId,
    });
  } catch (err) {
    console.error('[SCI Trace] Error:', err);
    return NextResponse.json(
      { error: 'Trace query failed', details: String(err) },
      { status: 500 },
    );
  }
}
