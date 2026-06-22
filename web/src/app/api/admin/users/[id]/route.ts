// OB-230 Objective 1B — GET /api/admin/users/[id]
// Deep per-user diagnostic state: profile + auth.users + MFA factors + inferred sessions (HALT-1) +
// event timeline (actor OR target) + journey milestones + audit activity. Platform capability required.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { synthesizeAuthHealth } from '@/lib/observability/auth-health';
import { inferSessions, summarizeEvents } from '@/lib/observability/event-queries';
import type {
  AuditEntryDTO, JourneyMilestoneDTO, MfaFactorDTO, TimelineEventDTO, UserDetailResponse,
} from '@/lib/observability/api-types';

export const runtime = 'nodejs';

const SESSION_NOTE =
  'Sessions are INFERRED from the platform_events stream (HALT-1: Supabase auth.sessions is not accessible to the service role). Boundaries are heuristic — a login/idle-gap starts a session; a logout/expiry ends it.';
const TIMELINE_LIMIT = 200;

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorizePlatformObservability();
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

  const { id } = await params;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Resolve the user from either a profile id or an auth_user_id.
  let { data: profile } = await sb
    .from('profiles')
    .select('id, auth_user_id, display_name, email, role, tenant_id, capabilities, locale, avatar_url, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (!profile) {
    const byAuth = await sb
      .from('profiles')
      .select('id, auth_user_id, display_name, email, role, tenant_id, capabilities, locale, avatar_url, created_at, updated_at')
      .eq('auth_user_id', id)
      .maybeSingle();
    profile = byAuth.data;
  }
  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const p = profile as any;
  const authUserId: string | null = p.auth_user_id ?? (id !== p.id ? id : null);

  // auth.users + MFA factors (authoritative listFactors, not the best-effort list view)
  let auth: UserDetailResponse['auth'] = null;
  const mfaFactors: MfaFactorDTO[] = [];
  if (authUserId) {
    const { data: authData } = await sb.auth.admin.getUserById(authUserId);
    const u = authData?.user as any;
    if (u) {
      auth = {
        id: u.id, email: u.email ?? null, emailConfirmedAt: u.email_confirmed_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null, bannedUntil: u.banned_until ?? null, createdAt: u.created_at ?? null,
      };
    }
    const { data: facData } = await sb.auth.admin.mfa.listFactors({ userId: authUserId });
    for (const f of ((facData?.factors ?? []) as any[])) {
      mfaFactors.push({
        id: f.id, factorType: f.factor_type ?? 'unknown', status: f.status ?? 'unknown',
        friendlyName: f.friendly_name ?? null, createdAt: f.created_at ?? null,
      });
    }
  }

  // Event timeline — actor OR target (so admin actions on this user surface here). actor_id read (HALT-5).
  const timeline: TimelineEventDTO[] = [];
  if (authUserId) {
    const { data: evs } = await sb
      .from('platform_events')
      .select('id, event_type, actor_id, entity_id, payload, created_at')
      .or(`actor_id.eq.${authUserId},entity_id.eq.${authUserId}`)
      .order('created_at', { ascending: false })
      .limit(TIMELINE_LIMIT);
    for (const e of (evs ?? []) as any[]) {
      timeline.push({
        id: e.id, eventType: e.event_type, createdAt: e.created_at,
        actorId: e.actor_id, entityId: e.entity_id, payload: (e.payload ?? {}) as Record<string, unknown>,
      });
    }
  }

  // journey + audit
  const journey: JourneyMilestoneDTO[] = [];
  if (authUserId) {
    const { data: jr } = await sb
      .from('user_journey')
      .select('milestone, completed_at, metadata')
      .eq('user_id', authUserId)
      .order('completed_at', { ascending: false });
    for (const m of (jr ?? []) as any[]) {
      journey.push({ milestone: m.milestone, completedAt: m.completed_at, metadata: (m.metadata ?? {}) as Record<string, unknown> });
    }
  }

  const audit: AuditEntryDTO[] = [];
  const { data: al } = await sb
    .from('audit_logs')
    .select('id, action, resource_type, resource_id, ip_address, changes, created_at')
    .eq('profile_id', p.id)
    .order('created_at', { ascending: false })
    .limit(50);
  for (const a of (al ?? []) as any[]) {
    audit.push({
      id: a.id, action: a.action, resourceType: a.resource_type, resourceId: a.resource_id ?? null,
      ip: a.ip_address ?? null, createdAt: a.created_at, changes: (a.changes ?? {}) as Record<string, unknown>,
    });
  }

  // tenant name
  let tenantName: string | null = null;
  if (p.tenant_id) {
    const { data: t } = await sb.from('tenants').select('name').eq('id', p.tenant_id).maybeSingle();
    tenantName = (t as any)?.name ?? null;
  }

  // health from auth + last-24h slice
  const since = Date.now() - 24 * 3600 * 1000;
  const recent = timeline.filter((e) => Date.parse(e.createdAt) >= since && e.actorId === authUserId);
  const summary = summarizeEvents(recent);
  const health = synthesizeAuthHealth({
    bannedUntil: auth?.bannedUntil, lastSignInAt: auth?.lastSignInAt, emailConfirmedAt: auth?.emailConfirmedAt,
    mfaFactorCount: mfaFactors.length, mfaVerifiedCount: mfaFactors.filter((f) => f.status === 'verified').length,
    loginFailures24h: summary.loginFailures24h, hydrationTimeouts24h: summary.hydrationTimeouts24h,
    sessionChurn24h: summary.sessionChurn24h, permissionDenied24h: summary.permissionDenied24h,
  });

  const body: UserDetailResponse = {
    profile: {
      id: p.id, authUserId: p.auth_user_id ?? null, displayName: p.display_name, email: p.email, role: p.role,
      tenantId: p.tenant_id ?? null, tenantName, capabilities: (p.capabilities ?? []) as string[],
      locale: p.locale ?? null, avatarUrl: p.avatar_url ?? null, createdAt: p.created_at ?? null, updatedAt: p.updated_at ?? null,
    },
    auth,
    mfaFactors,
    inferredSessions: inferSessions(timeline.filter((e) => e.actorId === authUserId)),
    sessionHealthNote: SESSION_NOTE,
    timeline,
    journey,
    audit,
    health,
  };
  return NextResponse.json(body);
}
