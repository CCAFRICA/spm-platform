/**
 * OB-230 — Shared API response shapes for the User Operations Console.
 * One contract consumed by both the /api/admin/users routes (writers) and the Observatory UI (readers).
 */

import type { AuthHealthStatus } from './auth-health';

export interface UserHealthDTO {
  status: AuthHealthStatus;
  reasons: string[];
}

export interface UserListItem {
  profileId: string;
  authUserId: string | null;
  displayName: string;
  email: string;
  role: string;
  tenantId: string | null;
  tenantName: string | null;
  createdAt: string | null;
  // auth.users (admin API)
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  bannedUntil: string | null;
  // mfa (best-effort from listUsers().factors)
  mfaFactorCount: number;
  mfaVerified: boolean;
  // platform_events 24h summary
  lastEventType: string | null;
  lastEventAt: string | null;
  loginFailures24h: number;
  sessionExpiries24h: number;
  hydrationTimeouts24h: number;
  sessionChurn24h: number;
  lastUserAgent: string | null;
  // synthesized (structural)
  health: UserHealthDTO;
}

export interface UserListResponse {
  users: UserListItem[];
  page: number;
  perPage: number;
  total: number | null; // total profiles matching the SQL filters
  tenants: { id: string; name: string }[];
  indexWarning?: string; // HALT-5 disclosure when the actor_id index is absent
}

export interface TimelineEventDTO {
  id: string;
  eventType: string;
  createdAt: string;
  actorId: string | null;
  entityId: string | null;
  payload: Record<string, unknown>;
}

export interface MfaFactorDTO {
  id: string;
  factorType: string;
  status: string;
  friendlyName: string | null;
  createdAt: string | null;
}

export interface JourneyMilestoneDTO {
  milestone: string;
  completedAt: string;
  metadata: Record<string, unknown>;
}

export interface AuditEntryDTO {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ip: string | null;
  createdAt: string;
  changes: Record<string, unknown>;
}

/** HALT-1: sessions are INFERRED from platform_events (auth.sessions is not accessible). */
export interface InferredSessionDTO {
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  active: boolean;
  ip: string | null;
  userAgent: string | null;
  eventCount: number;
  mfaStepUp: boolean; // saw a successful mfa.verify in this window
}

export interface UserDetailResponse {
  profile: {
    id: string;
    authUserId: string | null;
    displayName: string;
    email: string;
    role: string;
    tenantId: string | null;
    tenantName: string | null;
    capabilities: string[];
    locale: string | null;
    avatarUrl: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  auth: {
    id: string;
    email: string | null;
    emailConfirmedAt: string | null;
    lastSignInAt: string | null;
    bannedUntil: string | null;
    createdAt: string | null;
  } | null;
  mfaFactors: MfaFactorDTO[];
  inferredSessions: InferredSessionDTO[];
  sessionHealthNote: string; // HALT-1 disclosure shown in Panel 2
  timeline: TimelineEventDTO[];
  journey: JourneyMilestoneDTO[];
  audit: AuditEntryDTO[];
  health: UserHealthDTO;
  indexWarning?: string;
}

export interface AdminActionResponse {
  ok: boolean;
  action: string;
  message: string;
  link?: string; // password_reset / resend_confirmation return a link the admin delivers
  error?: string; // Supabase error detail on failure
}
