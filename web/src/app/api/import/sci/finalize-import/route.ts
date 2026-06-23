// HF-300 (C3, DIAG-071): finalize-import — run the CRITICAL post-commit work in a LIVE request.
//
// DIAG-071 proved the post-commit tail that PR #530 moved into execute-bulk's waitUntil() background
// does NOT complete on Vercel: 99% of committed_data rows were left with NULL entity_id and the active
// plan got 0 assignments (`TypeError: fetch failed` after response flush). A post-response background
// task's fetch context is torn down, so DB writes there are unreliable.
//
// Fix: the client calls this endpoint ONCE after the whole import completes. It runs the critical,
// tenant-scoped post-commit work IN ITS OWN request (live fetch context, full maxDuration) — so it
// completes reliably — and exactly ONCE per import, not per-file (also retiring DIAG-070's 15×
// redundancy). It does NOT block the per-file execute-bulk responses, so PR #530's import-speed win is
// preserved. Idempotent: entity resolution matches by external_id; createMissingAssignments skips
// existing (entity_id, rule_set_id) pairs — safe to call more than once (and as a reconciliation tool).

export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
import { createMissingAssignments } from '@/lib/sci/assignment-creation';
import { runSummaryEngine } from '@/lib/summary/summary-engine'; // OB-229

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    // Auth-gate the caller (same pattern as execute-bulk); the work itself uses service-role.
    const authClient = await createServerSupabaseClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    if (!authUser) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { tenantId, proposalId } = await req.json() as { tenantId?: string; proposalId?: string };
    if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const trace = (phase: string) => console.log(`[SCI Finalize] ${tenantId} | ${phase} | +${Date.now() - t0}ms`);
    trace(`start proposal=${proposalId ?? 'n/a'}`);

    // 1. Entity resolution + entity_id back-link — the work that left 99% of committed_data NULL when
    //    it ran in the dead waitUntil background (DIAG-071). Whole-tenant, idempotent (matches external_id).
    let postCommitOk = false;
    try {
      await executePostCommitConstruction({ supabase, tenantId, source: 'sci-bulk' });
      postCommitOk = true;
      trace('post-commit-construction-done');
    } catch (err) {
      console.error('[SCI Finalize] post-commit-construction failed:', err instanceof Error ? err.message : err);
    }

    // 2. Invalidate stale input_bindings so calc convergence re-derives (HF-269 — scoped to this tenant).
    try {
      await supabase.from('rule_sets').update({ input_bindings: {} })
        .eq('tenant_id', tenantId).in('status', ['active', 'draft']);
      trace('binding-clear-done');
    } catch (err) {
      console.error('[SCI Finalize] input_bindings invalidation failed:', err instanceof Error ? err.message : err);
    }

    // 3. Create rule_set_assignments for every ACTIVE rule_set × entity (idempotent per pair).
    let assignments: { ruleSetCount: number; entityCount: number; newlyCreatedPairs: number; alreadyAssignedPairs: number } | null = null;
    try {
      assignments = await createMissingAssignments(supabase, tenantId);
      trace(`assignments-done created=${assignments.newlyCreatedPairs} ruleSets=${assignments.ruleSetCount} entities=${assignments.entityCount}`);
    } catch (err) {
      console.error('[SCI Finalize] createMissingAssignments failed:', err instanceof Error ? err.message : err);
    }

    // 4. OB-229: pre-compute summary_artifacts now that committed_data is written AND entity resolution
    //    is done (step 1). Production path is the SQL RPC (fast); JS fallback until the RPC is applied.
    //    Awaited (HF-300 reliability model — post-response work dies on Vercel).
    let summary: { written: number; skipped: number; via: 'rpc' | 'js' } | null = null;
    try {
      summary = await runSummaryEngine(supabase, tenantId, trace);
      trace(`summary-engine-done via=${summary.via} written=${summary.written} skipped=${summary.skipped}`);
    } catch (err) {
      console.error('[SCI Finalize] summary engine failed:', err instanceof Error ? err.message : err);
    }

    trace('done');
    return NextResponse.json({ ok: true, tenantId, postCommitOk, assignments, summary, durationMs: Date.now() - t0 });
  } catch (err) {
    console.error('[SCI Finalize] Error:', err);
    return NextResponse.json({ error: 'Finalize failed', details: String(err) }, { status: 500 });
  }
}
