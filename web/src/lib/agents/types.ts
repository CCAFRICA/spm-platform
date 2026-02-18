/**
 * Agent Framework Types
 *
 * Defines the interfaces for the ODAR (Observe → Decide → Act → Report) agent system.
 */

import type { PlatformEventType } from '@/lib/events/emitter';

// ---------------------------------------------------------------------------
// Agent Definition
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  observes: PlatformEventType[];
  enabled: boolean;
  evaluate: (context: AgentContext) => Promise<AgentAction[]>;
}

// ---------------------------------------------------------------------------
// Agent Context (passed to evaluate)
// ---------------------------------------------------------------------------

export interface AgentContext {
  tenantId: string;
  tenantSettings: Record<string, unknown>;
  recentEvents: AgentEvent[];
}

export interface AgentEvent {
  id: string;
  tenant_id: string;
  event_type: PlatformEventType;
  actor_id: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  processed_by: string[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Agent Action (output from evaluate)
// ---------------------------------------------------------------------------

export type AgentActionSeverity = 'critical' | 'warning' | 'info';
export type AgentActionType = 'recommendation' | 'alert' | 'insight' | 'action_required';
export type PersonaTarget = 'admin' | 'manager' | 'rep' | 'all';

export interface AgentAction {
  agentId: string;
  type: AgentActionType;
  title: string;
  description: string;
  severity: AgentActionSeverity;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  persona: PersonaTarget;
  expiresAt?: string;
}

// ---------------------------------------------------------------------------
// Agent Inbox Item (persisted action)
// ---------------------------------------------------------------------------

export interface AgentInboxItem extends AgentAction {
  id: string;
  tenantId: string;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  actedAt: string | null;
}
