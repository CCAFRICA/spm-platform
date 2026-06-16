/**
 * POST /api/ai/agent/reconcile-diagnose  (OB-212 N4)
 *
 * Invokes the Reconciliation Diagnosis Agent through the harness (runAgent → AIService.executeAgentTurn)
 * and records exactly one agent_invocations row per call (running → completed | failed | cached).
 *
 * Progressive Performance: a request_fingerprint cache check runs BEFORE any paid model call — an
 * identical prior completed run is replayed as a status='cached' row (cache_hit=true, cost_usd=0).
 *
 * Boundary (Decision 158): writes only above-DCB surfaces — agent_invocations, agent_inbox (N5),
 * and classification_signals via the canonical writer (N6); never a calculation table. All tool
 * handlers are read-only. AIService mandate: the harness is the only caller of the provider; this
 * route opens no fetch.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runAgent, AgentTurnError, AgentRunawayError } from '@/lib/ai/agent/agent-runner';
import { createReconciliationDiagnosisAgent } from '@/lib/ai/agent/reconciliation-diagnosis-agent';
import { writeSignal, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';

const AGENT = 'reconciliation_diagnosis';

// Approximate cost (trend analysis, not billing) — mirrors AIService.computeEstimatedCost.
function estimatedCost(inputTokens: number, outputTokens: number): number {
  const cost = (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015;
  return Math.round(cost * 10000) / 10000;
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const tenantId = String(body.tenantId ?? '');
  const reconciliationSessionId = String(body.reconciliationSessionId ?? '');
  const entityId = String(body.entityId ?? '');
  const component = body.component == null || body.component === '' ? null : String(body.component);
  const userId = body.userId ? String(body.userId) : null;

  if (!tenantId || !reconciliationSessionId || !entityId) {
    return NextResponse.json(
      { error: 'tenantId, reconciliationSessionId and entityId are required' },
      { status: 400 },
    );
  }

  const provider = process.env.NEXT_PUBLIC_AI_PROVIDER || 'anthropic';
  const model = process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-6';

  const subjectRef = { reconciliation_session_id: reconciliationSessionId, entity_id: entityId, component };
  const requestFingerprint = createHash('sha256')
    .update(JSON.stringify({ agent: AGENT, tenantId, ...subjectRef }))
    .digest('hex');

  // agent_invocations is not yet in the generated Database types; use a structurally-typed
  // client so the (verified-live) table is queryable without coupling to a stale types file.
  const supabase = (await createServiceRoleClient()) as unknown as SupabaseClient;

  // ---- Progressive Performance: cache check BEFORE any paid call ----
  const { data: cached } = await supabase
    .from('agent_invocations')
    .select('result, turn_count, tool_calls, confidence')
    .eq('tenant_id', tenantId)
    .eq('request_fingerprint', requestFingerprint)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1);

  if (cached?.length) {
    const prior = cached[0] as Record<string, unknown>;
    const { data: row } = await supabase
      .from('agent_invocations')
      .insert({
        tenant_id: tenantId,
        agent_name: AGENT,
        invocation_type: AGENT,
        subject_ref: subjectRef,
        request_fingerprint: requestFingerprint,
        status: 'cached',
        turn_count: prior.turn_count ?? 0,
        tool_calls: prior.tool_calls ?? [],
        result: prior.result ?? {},
        confidence: prior.confidence ?? null,
        latency_ms: Date.now() - start,
        provider,
        model,
        token_usage: { input: 0, output: 0 },
        cost_usd: 0,
        cache_hit: true,
        created_by: userId,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    return NextResponse.json({
      success: true,
      cached: true,
      cache_hit: true,
      cost_usd: 0,
      invocationId: (row as { id?: string } | null)?.id ?? null,
      result: prior.result ?? {},
    });
  }

  // ---- miss: open a 'running' row, run the agent, then close it ----
  const { data: runningRow, error: insErr } = await supabase
    .from('agent_invocations')
    .insert({
      tenant_id: tenantId,
      agent_name: AGENT,
      invocation_type: AGENT,
      subject_ref: subjectRef,
      request_fingerprint: requestFingerprint,
      status: 'running',
      provider,
      model,
      created_by: userId,
    })
    .select('id')
    .single();
  if (insErr || !runningRow) {
    return NextResponse.json({ error: `failed to open invocation: ${insErr?.message ?? 'unknown'}` }, { status: 500 });
  }
  const invocationId = (runningRow as { id: string }).id;

  try {
    const ctx = { supabase, tenantId };
    const agentDef = createReconciliationDiagnosisAgent(ctx);
    const kickoff =
      `Investigate reconciliation session ${reconciliationSessionId}, entity ${entityId}` +
      (component ? `, focusing on component "${component}"` : '') +
      `. Determine why the engine (platform) value differs from the expected (benchmark) value, using the tools. Then give a concise structural diagnosis.`;

    const run = await runAgent(agentDef, kickoff);

    await supabase
      .from('agent_invocations')
      .update({
        status: 'completed',
        turn_count: run.turnCount,
        tool_calls: run.turns,
        result: { diagnosis: run.finalText },
        latency_ms: Date.now() - start,
        token_usage: run.tokenUsage,
        cost_usd: estimatedCost(run.tokenUsage.input, run.tokenUsage.output),
        completed_at: new Date().toISOString(),
      })
      .eq('id', invocationId);

    const diagnosisText = run.finalText ?? '';
    const costUsd = estimatedCost(run.tokenUsage.input, run.tokenUsage.output);

    // N5: surface the diagnosis in the agent inbox (awaited — the UI re-fetches the inbox after
    // a Diagnose action). Upsert on (tenant_id, agent_id, title) so re-diagnosing updates in place.
    const { error: inboxErr } = await supabase.from('agent_inbox').upsert(
      {
        tenant_id: tenantId,
        agent_id: AGENT,
        type: 'insight',
        title: `Diagnosis: ${entityId}${component ? ` · ${component}` : ''}`,
        description: diagnosisText.length > 600 ? `${diagnosisText.slice(0, 600)}…` : diagnosisText,
        severity: 'warning',
        action_url: `/operate/reconciliation?sessionId=${reconciliationSessionId}&entityId=${encodeURIComponent(entityId)}`,
        action_label: 'Review diagnosis',
        metadata: { invocationId, reconciliationSessionId, entityId, component, turnCount: run.turnCount, costUsd },
        persona: 'admin',
      },
      { onConflict: 'tenant_id,agent_id,title' },
    );
    if (inboxErr) console.warn(`[reconcile-diagnose] agent_inbox write failed: ${inboxErr.message}`);

    // N6: capture a convergence signal on completion (fire-and-forget; never blocks the response).
    writeSignal(
      {
        tenantId,
        signalType: 'convergence:diagnosis_complete',
        signalValue: { agentName: AGENT, invocationId, reconciliationSessionId, entityId, component, turnCount: run.turnCount, diagnosisLength: diagnosisText.length },
        confidence: null,
        source: 'ai_prediction',
        context: { trigger: 'reconciliation_diagnosis_agent', endpoint: '/api/ai/agent/reconcile-diagnose', provider, model },
      },
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    ).catch((err: unknown) => {
      if (err instanceof CanonicalWriteError) console.warn(`[reconcile-diagnose] diagnosis_complete CanonicalWriteError (${err.cause}): ${err.message}`);
      else console.warn('[reconcile-diagnose] diagnosis_complete signal error:', err instanceof Error ? err.message : String(err));
    });

    return NextResponse.json({
      success: true,
      cached: false,
      cache_hit: false,
      invocationId,
      result: { diagnosis: run.finalText },
      turnCount: run.turnCount,
      tokenUsage: run.tokenUsage,
      cost_usd: costUsd,
    });
  } catch (e) {
    const reason =
      e instanceof AgentTurnError ? e.reason : e instanceof AgentRunawayError ? 'runaway' : 'error';
    const message = e instanceof Error ? e.message : String(e);
    // Persist the partial trajectory + usage the harness attached to the error (debuggable failures).
    const partial = e instanceof AgentTurnError || e instanceof AgentRunawayError ? e : null;
    const usage = partial?.tokenUsage ?? { input: 0, output: 0 };
    await supabase
      .from('agent_invocations')
      .update({
        status: 'failed',
        result: { error: message, reason },
        turn_count: partial?.turnCount ?? 0,
        tool_calls: partial?.turns ?? [],
        token_usage: usage,
        cost_usd: estimatedCost(usage.input, usage.output),
        latency_ms: Date.now() - start,
        completed_at: new Date().toISOString(),
      })
      .eq('id', invocationId);
    console.error(`[reconcile-diagnose] agent failed (${reason}): ${message}`);
    return NextResponse.json({ success: false, invocationId, error: message, reason }, { status: 500 });
  }
}
