/**
 * POST /api/ingest/classification — Record a classification signal
 *
 * Body: { event_id, ai_prediction, ai_confidence, user_decision, was_corrected, calculation_run_id? }
 * Returns: { signal_id }
 *
 * OB-197: signal_type emits prefix vocabulary 'classification:outcome'.
 * Body fields are packed into signal_value. tenant_id is resolved from the
 * authenticated user's profile. calculation_run_id is null for ingestion writes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { writeSignalWithClient } from '@/lib/intelligence/canonical-signal-writer'; // OB-235 P1: one canonical surface

export async function POST(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await authClient
      .from('profiles')
      .select('tenant_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'No tenant assigned to user' }, { status: 403 });
    }

    const body = await request.json();
    const { event_id, ai_prediction, ai_confidence, user_decision, was_corrected, calculation_run_id } = body;

    if (!event_id || !ai_prediction || ai_confidence == null || !user_decision) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    const wasCorrected = was_corrected ?? (ai_prediction !== user_decision);

    let signalId: string | null = null;
    try {
      const result = await writeSignalWithClient({
        tenantId: profile.tenant_id,
        signalType: 'classification:outcome',
        signalValue: {
          event_id,
          ai_prediction,
          ai_confidence,
          user_decision,
          was_corrected: wasCorrected,
        },
        confidence: ai_confidence,
        source: wasCorrected ? 'user_corrected' : 'user_confirmed',
        decisionSource: wasCorrected ? 'human_override' : 'human_confirmation',
        context: {},
        calculationRunId: calculation_run_id ?? null,
      }, supabase);
      signalId = result.id ?? null;
    } catch (error) {
      console.error('[Classification API] Insert error:', error);
      return NextResponse.json({ error: `Failed to record signal: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
    }

    return NextResponse.json({ signal_id: signalId });
  } catch (err) {
    console.error('[Classification API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
