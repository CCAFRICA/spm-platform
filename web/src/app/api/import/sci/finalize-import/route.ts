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
import { isInternalCronCaller } from '@/lib/sci/cron-principal'; // HF-361: finalize-sweep fires this cookielessly
import { claimFinalize, completeFinalize } from '@/lib/sci/finalize-coalesce'; // HF-371: one finalize per import
import { markJobsByProposal } from '@/lib/sci/job-status'; // HF-372 Phase D: server-side job truth
import { runFlywheelAggregation } from '@/lib/sci/flywheel-aggregation';
import { executePostCommitConstruction } from '@/lib/sci/post-commit-construction';
import { createMissingAssignments } from '@/lib/sci/assignment-creation';
import { generateComprehension } from '@/lib/summary/comprehension-generator'; // OB-233
import { runSummaryEngine } from '@/lib/summary/summary-engine'; // OB-229
import { generateInsights } from '@/lib/insight/insight-engine'; // OB-232

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    // Auth-gate the caller; the work itself uses service-role and is tenant-scoped by the request body (the
    // gate authorizes, it provides no identity). Two principals are accepted:
    //   • a logged-in user (the browser-driven finalize when the user stays through the load), OR
    //   • the internal CRON principal (HF-361) — the HF-360 finalize-sweep fires this endpoint SERVER-SIDE,
    //     cookielessly, with the CRON_SECRET bearer, to finalize a session whose user has left. Without
    //     accepting it, the sweep's call 401'd (getUser → no session) and committed_data stayed orphaned.
    if (!isInternalCronCaller(req)) {
      const authClient = await createServerSupabaseClient();
      const { data: { user: authUser } } = await authClient.auth.getUser();
      if (!authUser) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tenantId, proposalId } = await req.json() as { tenantId?: string; proposalId?: string };
    if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const trace = (phase: string) => console.log(`[SCI Finalize] ${tenantId} | ${phase} | +${Date.now() - t0}ms`);
    trace(`start proposal=${proposalId ?? 'n/a'}`);

    // HF-371 (Root 1): coalesce concurrent finalize passes for ONE import to exactly one. The sync path
    // fires this from BOTH the client and execute-bulk's server-side waitUntil; without this claim they run
    // simultaneously and disagree (one creates the entities, the other reports 0 and links fewer rows). The
    // first caller claims; a concurrent duplicate no-ops here. Stale/failed claims are retryable; if the
    // claim table is absent (migration pending) the claim is granted and the run proceeds on idempotency.
    const claim = await claimFinalize(supabase, tenantId, proposalId);
    if (!claim.granted) {
      trace(`coalesced: ${claim.reason}`);
      return NextResponse.json({ ok: true, tenantId, coalesced: true, reason: claim.reason, durationMs: Date.now() - t0 });
    }
    trace(`claim: ${claim.reason}`);

    // HF-372 Phase D: the job record shows the REAL step (by the proposal_id execute-bulk stamped).
    await markJobsByProposal(supabase, tenantId, proposalId, { phase: 'finalizing' });

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

    // 2. OB-233 (HALT-4 Option A): TARGETED invalidation of the calc-time convergence reuse cache.
    //    HF-269 blanked input_bindings WHOLESALE (`= {}`), which both destroyed HF-336 comprehension
    //    (now stored in comprehension_artifacts, untouched here) AND wiped any non-derived key. We now
    //    clear ONLY the three derived cache keys (convergence_bindings + metric_derivations +
    //    convergence_version) so the calc engine re-derives convergence on the next run (the blank's
    //    only remaining function — convergeBindings is calc-time, unchanged), while PRESERVING every
    //    other key in input_bindings (C6). Per-rule_set read-modify-write.
    try {
      const { data: ruleSets } = await supabase.from('rule_sets')
        .select('id, input_bindings').eq('tenant_id', tenantId).in('status', ['active', 'draft']);
      for (const rs of (ruleSets ?? []) as Array<{ id: string; input_bindings: Record<string, unknown> | null }>) {
        const ib: Record<string, unknown> = (rs.input_bindings && typeof rs.input_bindings === 'object') ? { ...rs.input_bindings } : {};
        delete ib.convergence_bindings;
        delete ib.metric_derivations;
        delete ib.convergence_version;
        await supabase.from('rule_sets').update({ input_bindings: ib }).eq('id', rs.id);
      }
      trace(`binding-cache-invalidated ruleSets=${(ruleSets ?? []).length}`);
    } catch (err) {
      console.error('[SCI Finalize] targeted input_bindings invalidation failed:', err instanceof Error ? err.message : err);
    }

    // 3. Create rule_set_assignments for every ACTIVE rule_set × entity (idempotent per pair).
    let assignments: { ruleSetCount: number; entityCount: number; newlyCreatedPairs: number; alreadyAssignedPairs: number } | null = null;
    try {
      assignments = await createMissingAssignments(supabase, tenantId);
      trace(`assignments-done created=${assignments.newlyCreatedPairs} ruleSets=${assignments.ruleSetCount} entities=${assignments.entityCount}`);
    } catch (err) {
      console.error('[SCI Finalize] createMissingAssignments failed:', err instanceof Error ? err.message : err);
    }

    // 3.5 OB-233: generate comprehension for EVERY field -> comprehension_artifacts (DS-030). Runs for
    //     every import, every tenant, regardless of any rule_set (C0b); NEVER writes input_bindings (C6).
    //     MUST precede the Summary Engine (step 4 reads comprehension for semantic labels + aggregation
    //     methods). Batched LLM, one call per data_type run concurrently (HALT-2: never per-field).
    let comprehension: { fieldsComprehended: number; dataTypes: number } | null = null;
    try {
      const c = await generateComprehension(supabase, tenantId);
      comprehension = { fieldsComprehended: c.fieldsComprehended, dataTypes: c.dataTypes };
      trace(`comprehension-done fields=${c.fieldsComprehended} dataTypes=${c.dataTypes}`);
    } catch (err) {
      console.error('[SCI Finalize] comprehension generation failed:', err instanceof Error ? err.message : err);
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

    // HF-371: mark the claim done so a later duplicate for THIS import coalesces (and a re-import with a
    // new proposalId claims fresh). A hard failure leaves the claim 'running' → stale after 15 min → retryable.
    // HF-372 Phase D (D5 re-scoped): this runs BEFORE the insight step — the import's completion is
    // gated on committed data + entity resolution + assignments, never on insight generation (which
    // previously held the claim window for up to ~76s of retry backoff and, on failure, was silently
    // swallowed with the claim already stamped done).
    await completeFinalize(supabase, tenantId, proposalId, true);

    // HF-372 Phase D: the import is COMPLETE — the job record says so, server-side, before insights.
    await markJobsByProposal(supabase, tenantId, proposalId, { status: 'finalized', phase: 'completed', completedAt: true });
    trace('import-complete (insights follow off the critical path)');

    // 5. OB-232: generate insights from the freshly-computed summaries (Insight Engine, DS-028 P2).
    //    LLM recognizes patterns; deterministic validator + shape enforce the Decision-158 boundary.
    //    HF-372 Phase D: AFTER completeFinalize — an insight failure can no longer hold the import
    //    open or silently ride a done-stamped claim; it is loud in the log AND visible in the
    //    response's insights.error field.
    let insights: { stored: number; failed: number; error?: string } | null = null;
    try {
      const r = await generateInsights(supabase, tenantId);
      insights = { stored: r.stored, failed: r.failed };
      trace(`insight-engine-done stored=${r.stored} failed=${r.failed} model=${r.model}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      insights = { stored: 0, failed: 0, error: msg };
      console.error(`[SCI Finalize] INSIGHT ENGINE FAILED (import already complete; insights missing until next finalize): ${msg}`);
    }

    // HF-372 Phase F (EPG-0.8 §4): flywheel aggregation was CLIENT-ONLY (page.tsx fire) — a
    // navigate-away import got finalize (waitUntil/sweep) but never aggregation. Server-side
    // backstop here, fire-and-forget + idempotent, off the critical path like insights.
    void runFlywheelAggregation(supabase, tenantId, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .then(r => trace(`flywheel-aggregation-done ${JSON.stringify(r).slice(0, 120)}`))
      .catch(err => console.warn('[SCI Finalize] flywheel aggregation failed (non-blocking):', err instanceof Error ? err.message : err));

    trace('done');
    return NextResponse.json({ ok: true, tenantId, postCommitOk, assignments, comprehension, summary, insights, durationMs: Date.now() - t0 });
  } catch (err) {
    console.error('[SCI Finalize] Error:', err);
    return NextResponse.json({ error: 'Finalize failed', details: String(err) }, { status: 500 });
  }
}
