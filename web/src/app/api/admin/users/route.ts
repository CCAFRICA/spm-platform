// OB-230 Objective 1A — GET /api/admin/users
// Paginated, searchable, cross-tenant user list with composite auth/MFA/event state for the
// platform-admin User Operations Console. Platform capability required (platform.system_config).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { synthesizeAuthHealth } from '@/lib/observability/auth-health';
import { summarizeEvents } from '@/lib/observability/event-queries';
import type { TimelineEventDTO, UserListItem, UserListResponse } from '@/lib/observability/api-types';

export const runtime = 'nodejs';

const ACTOR_INDEX_WARNING =
  'platform_events has no (actor_id, created_at) index yet (OB-230 HALT-5) — per-user event reads may be slow at scale until the delivered migration is applied.';

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(req: NextRequest) {
  const authz = await authorizePlatformObservability();
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

  const url = new URL(req.url);
  const rawQ = (url.searchParams.get('q') || '').trim();
  const safeQ = rawQ.replace(/[%,()]/g, ' ').trim(); // neutralize PostgREST or() metacharacters
  const roleFilter = url.searchParams.get('role');
  const tenantFilter = url.searchParams.get('tenantId');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('perPage') || '25', 10) || 25));

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 1. profiles page — SQL filters (search/role/tenant) + exact total for pagination (SR-2)
  let pq = sb
    .from('profiles')
    .select('id, auth_user_id, display_name, email, role, tenant_id, created_at', { count: 'exact' });
  if (roleFilter) pq = pq.eq('role', roleFilter);
  if (tenantFilter) pq = pq.eq('tenant_id', tenantFilter);
  if (safeQ) pq = pq.or(`email.ilike.%${safeQ}%,display_name.ilike.%${safeQ}%`);
  pq = pq.order('created_at', { ascending: false }).range((page - 1) * perPage, (page - 1) * perPage + perPage - 1);
  const { data: profiles, count, error: pErr } = await pq;
  if (pErr) return NextResponse.json({ error: `Profile query failed: ${pErr.message}` }, { status: 500 });
  const rows = (profiles ?? []) as any[];

  // 2. auth.users map (bounded server-side paging — /api/users precedent). factors are best-effort here.
  const authById = new Map<string, any>();
  for (let p = 1; p <= 25; p++) {
    const { data } = await sb.auth.admin.listUsers({ page: p, perPage: 200 });
    if (!data?.users?.length) break;
    for (const u of data.users) authById.set(u.id, u);
    if (data.users.length < 200) break;
  }

  // 3. tenant names
  const { data: tenantRows } = await sb.from('tenants').select('id, name');
  const tenantName = new Map<string, string>((tenantRows ?? []).map((t: any) => [t.id, t.name]));

  // 4. last-24h event summary for the page's actors (bounded; actor_id read — HALT-5)
  const authIds = rows.map((r) => r.auth_user_id).filter((x): x is string => !!x);
  const eventsByActor = new Map<string, TimelineEventDTO[]>();
  if (authIds.length > 0) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: evs } = await sb
      .from('platform_events')
      .select('id, event_type, actor_id, entity_id, payload, created_at')
      .in('actor_id', authIds)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(3000);
    for (const e of (evs ?? []) as any[]) {
      const aid = e.actor_id as string | null;
      if (!aid) continue;
      const dto: TimelineEventDTO = {
        id: e.id, eventType: e.event_type, createdAt: e.created_at,
        actorId: aid, entityId: e.entity_id, payload: (e.payload ?? {}) as Record<string, unknown>,
      };
      const arr = eventsByActor.get(aid) ?? [];
      arr.push(dto);
      eventsByActor.set(aid, arr);
    }
  }

  // 5. compose
  const users: UserListItem[] = rows.map((p) => {
    const au = p.auth_user_id ? authById.get(p.auth_user_id) : undefined;
    const evs = (p.auth_user_id ? eventsByActor.get(p.auth_user_id) : undefined) ?? [];
    const summary = summarizeEvents(evs);
    const factors = (au?.factors ?? []) as Array<{ status?: string }>;
    const mfaFactorCount = factors.length;
    const mfaVerified = factors.some((f) => f.status === 'verified');
    const bannedUntil = (au?.banned_until as string | null) ?? null;
    const lastSignInAt = (au?.last_sign_in_at as string | null) ?? null;
    const emailConfirmedAt = (au?.email_confirmed_at as string | null) ?? null;
    const health = synthesizeAuthHealth({
      bannedUntil, lastSignInAt, emailConfirmedAt, mfaFactorCount,
      mfaVerifiedCount: mfaVerified ? 1 : 0,
      loginFailures24h: summary.loginFailures24h,
      hydrationTimeouts24h: summary.hydrationTimeouts24h,
      sessionChurn24h: summary.sessionChurn24h,
      permissionDenied24h: summary.permissionDenied24h,
    });
    return {
      profileId: p.id, authUserId: p.auth_user_id, displayName: p.display_name, email: p.email,
      role: p.role, tenantId: p.tenant_id,
      tenantName: p.tenant_id ? (tenantName.get(p.tenant_id) ?? null) : null,
      createdAt: p.created_at, lastSignInAt, emailConfirmedAt, bannedUntil,
      mfaFactorCount, mfaVerified,
      lastEventType: summary.lastEventType, lastEventAt: summary.lastEventAt,
      loginFailures24h: summary.loginFailures24h, sessionExpiries24h: summary.sessionExpiries24h,
      hydrationTimeouts24h: summary.hydrationTimeouts24h, sessionChurn24h: summary.sessionChurn24h,
      lastUserAgent: summary.lastUserAgent, health,
    };
  });

  const body: UserListResponse = {
    users, page, perPage, total: count ?? null,
    tenants: (tenantRows ?? []).map((t: any) => ({ id: t.id, name: t.name })),
    indexWarning: ACTOR_INDEX_WARNING,
  };
  return NextResponse.json(body);
}
