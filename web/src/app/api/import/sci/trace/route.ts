// SCI Trace API — GET /api/import/sci/trace
// OB-160E + HF-092 — Returns classification signals with full traces for a tenant
// HF-092: Queries dedicated columns, not signal_value JSONB blob
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
      .select(`
        id, source_file_name, sheet_name,
        classification, confidence, decision_source,
        structural_fingerprint, classification_trace,
        vocabulary_bindings, agent_scores,
        human_correction_from, scope, created_at
      `)
      .eq('tenant_id', tenantId)
      .eq('scope', 'tenant')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (sourceFile) {
      query = query.eq('source_file_name', sourceFile);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Query failed', details: error.message }, { status: 500 });
    }

    const signals = (data || []).map(row => ({
      id: row.id,
      sheet_name: row.sheet_name,
      source_file_name: row.source_file_name,
      classification: row.classification,
      confidence: row.confidence,
      decision_source: row.decision_source,
      structural_fingerprint: row.structural_fingerprint,
      classification_trace: row.classification_trace,
      vocabulary_bindings: row.vocabulary_bindings,
      agent_scores: row.agent_scores,
      human_correction_from: row.human_correction_from,
      scope: row.scope,
      created_at: row.created_at,
    }));

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
