/**
 * OB-215 Agent C — per-AI-call metrics capture.
 *
 * Fire-and-forget insert of one row per AIService.execute() call into
 * `ai_call_metrics`. AUD-018 established that `agent_invocations` is the
 * agent-runtime table (NOT-NULL agent_name/invocation_type/fingerprint) and does
 * not fit the 20 single-call surfaces; this is their dedicated, queryable,
 * indexable home (task/model/tenant/tokens/cost/latency/status as first-class
 * columns).
 *
 * Never throws and never blocks the request — the caller does not await this.
 * Skips unattributed calls (no real tenant), mirroring the OB-135 cost signal guard.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { computeCallCostUSD } from './model-policy';
import type { AITaskType } from './types';

export type AICallStatus = 'success' | 'provider_error' | 'degraded';

export interface AICallMetric {
  tenantId: string;
  task: AITaskType;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  status: AICallStatus;
}

// The table is newly added and not in the generated Supabase types — a localized
// structural cast (same approach as the OB-212 agent_invocations writer).
interface MetricsInsertClient {
  from: (table: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: unknown }> };
}

export function recordAICallMetric(m: AICallMetric): void {
  if (!m.tenantId || m.tenantId === 'unknown') return;
  void (async () => {
    try {
      const supabase = (await createServiceRoleClient()) as unknown as MetricsInsertClient;
      await supabase.from('ai_call_metrics').insert({
        tenant_id: m.tenantId,
        task: m.task,
        provider: m.provider,
        model: m.model,
        tokens_in: m.tokensIn,
        tokens_out: m.tokensOut,
        latency_ms: m.latencyMs,
        cost_usd: computeCallCostUSD(m.model, m.tokensIn, m.tokensOut),
        status: m.status,
      });
    } catch {
      // Best-effort telemetry — never disrupt the AI call.
    }
  })();
}
