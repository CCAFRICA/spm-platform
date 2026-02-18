/**
 * Agent Loop Runner — ODAR Implementation
 *
 * OBSERVE → DECIDE → ACT → REPORT
 *
 * 1. OBSERVE: Fetch recent events (last 24 hours, limit 100)
 * 2. DECIDE: Run relevant agents, collect actions
 * 3. ACT: Write actions to agent_inbox (upsert by tenant+agent+title)
 * 4. REPORT: Emit agent.recommendation events
 *
 * Designed for fire-and-forget async execution.
 * Errors are caught and logged, never thrown.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { emitEvent } from '@/lib/events/emitter';
import { getAgentsForEvent, getAllAgents } from './registry';
import type { AgentContext, AgentEvent, AgentAction } from './types';

/**
 * Run the agent loop for a tenant, triggered by an event.
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function runAgentLoop(
  tenantId: string,
  triggerEventType?: string,
): Promise<void> {
  try {
    const supabase = await createServiceRoleClient();

    // ── STEP 1: OBSERVE — Fetch recent events ──
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: eventRows, error: evError } = await (supabase as unknown as { from: (t: string) => any })
      .from('platform_events')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100);

    if (evError) {
      console.error('[AgentLoop] Failed to fetch events:', evError.message);
      return;
    }

    const recentEvents: AgentEvent[] = (eventRows || []) as AgentEvent[];

    // Fetch tenant settings for context
    const { data: tenant } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const tenantSettings = (tenant?.settings || {}) as Record<string, unknown>;

    const context: AgentContext = {
      tenantId,
      tenantSettings,
      recentEvents,
    };

    // ── STEP 2: DECIDE — Run relevant agents ──
    const agents = triggerEventType
      ? getAgentsForEvent(triggerEventType)
      : getAllAgents().filter(a => a.enabled);

    const allActions: AgentAction[] = [];

    for (const agent of agents) {
      try {
        const actions = await agent.evaluate(context);
        allActions.push(...actions);
      } catch (err) {
        console.error(`[AgentLoop] Agent "${agent.id}" evaluation failed:`, err);
      }
    }

    if (allActions.length === 0) return;

    // ── STEP 3: ACT — Write to agent_inbox ──
    for (const action of allActions) {
      try {
        // agent_inbox table created via SQL migration — not yet in generated types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as unknown as { from: (t: string) => any })
          .from('agent_inbox')
          .upsert(
            {
              tenant_id: tenantId,
              agent_id: action.agentId,
              type: action.type,
              title: action.title,
              description: action.description,
              severity: action.severity,
              action_url: action.actionUrl || null,
              action_label: action.actionLabel || null,
              metadata: action.metadata || {},
              persona: action.persona,
              expires_at: action.expiresAt || null,
            },
            { onConflict: 'tenant_id,agent_id,title' },
          );
      } catch (err) {
        console.error(`[AgentLoop] Failed to write inbox item "${action.title}":`, err);
      }
    }

    // ── STEP 4: REPORT — Emit agent events ──
    for (const action of allActions) {
      emitEvent({
        tenant_id: tenantId,
        event_type: 'agent.recommendation',
        payload: {
          agent_id: action.agentId,
          action_type: action.type,
          title: action.title,
          severity: action.severity,
          persona: action.persona,
        },
      }).catch(() => {});
    }

  } catch (err) {
    console.error('[AgentLoop] Top-level error:', err);
  }
}
