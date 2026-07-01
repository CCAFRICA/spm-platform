/**
 * POST /api/import/sci/cancel — HF-372 Phase D: the import screen's inline stop/kill.
 *
 * Cancels every non-terminal job of an import session: status → 'failed' with a human-readable
 * reason, retry_count → CANCEL_RETRY_SENTINEL (99, >> dispatch-jobs MAX_RETRIES) so the requeue
 * sweep never resurrects it, metadata.phase → 'cancelled'. Terminal jobs (committed/finalized)
 * are never flipped (a cancel arriving after the rows are durable is a no-op — the truth wins).
 *
 * Auth: a logged-in user (the import screen's principal). The update runs service-role so the
 * platform-operator RLS hole (SELECT-only on processing_jobs) cannot silently no-op the cancel.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const CANCEL_RETRY_SENTINEL = 99;
const CANCELLABLE = ['pending', 'classifying', 'classified', 'confirming', 'committing'];

export async function POST(req: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    if (!authUser) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { tenantId, sessionId } = await req.json() as { tenantId?: string; sessionId?: string };
    if (!tenantId || !sessionId) {
      return NextResponse.json({ error: 'tenantId and sessionId required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    type CancelJobRow = { id: string; status: string; metadata?: Record<string, unknown> | null };
    let jobs: CancelJobRow[] | null = null;
    let readErr: { code?: string; message: string } | null = null;
    {
      const res = await supabase
        .from('processing_jobs')
        .select('id, status, metadata')
        .eq('tenant_id', tenantId)
        .eq('session_id', sessionId)
        .in('status', CANCELLABLE);
      jobs = res.data as unknown as CancelJobRow[] | null; readErr = res.error;
    }
    if (readErr && readErr.code === '42703') {
      const res = await supabase
        .from('processing_jobs')
        .select('id, status')
        .eq('tenant_id', tenantId)
        .eq('session_id', sessionId)
        .in('status', CANCELLABLE);
      jobs = res.data as unknown as CancelJobRow[] | null; readErr = res.error;
    }
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    let cancelled = 0;
    for (const job of jobs ?? []) {
      const patch: Record<string, unknown> = {
        status: 'failed',
        error_detail: 'Cancelled by user from the import screen',
        retry_count: CANCEL_RETRY_SENTINEL,
        completed_at: new Date().toISOString(),
        metadata: { ...((job.metadata as Record<string, unknown>) ?? {}), phase: 'cancelled', phase_at: new Date().toISOString() },
      };
      let { error } = await supabase
        .from('processing_jobs')
        .update(patch)
        .eq('id', job.id)
        .in('status', CANCELLABLE); // guarded — a job that turned terminal mid-flight stays truthful
      if (error && (error.code === '42703' || error.code === 'PGRST204')) {
        // pre-migration (20260703_hf372): cancel WITHOUT the phase stamp — the kill must still land
        delete patch.metadata;
        ({ error } = await supabase.from('processing_jobs').update(patch).eq('id', job.id).in('status', CANCELLABLE));
      }
      if (!error) cancelled++;
    }

    console.log(`[SCI Cancel] session=${sessionId.slice(0, 8)} tenant=${tenantId.slice(0, 8)} cancelled=${cancelled}/${jobs?.length ?? 0}`);
    return NextResponse.json({ ok: true, cancelled, matched: jobs?.length ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: 'Cancel failed', details: String(err) }, { status: 500 });
  }
}
