/**
 * POST /api/ingest/classification — Record a classification signal
 *
 * Body: { event_id, ai_prediction, ai_confidence, user_decision, was_corrected }
 * Returns: { signal_id }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { event_id, ai_prediction, ai_confidence, user_decision, was_corrected } = body;

    if (!event_id || !ai_prediction || ai_confidence == null || !user_decision) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertPayload: any = {
      event_id,
      ai_prediction,
      ai_confidence,
      user_decision,
      was_corrected: was_corrected ?? (ai_prediction !== user_decision),
    };

    const { data, error } = await supabase
      .from('classification_signals')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      console.error('[Classification API] Insert error:', error);
      return NextResponse.json({ error: `Failed to record signal: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ signal_id: data.id });
  } catch (err) {
    console.error('[Classification API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
