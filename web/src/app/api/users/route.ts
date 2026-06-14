// OB-204 A.4 — POST /api/users (create) · C.1 — GET /api/users (server-backed list, CLT166-F10 fix).
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createUser, ProvisionError } from '@/lib/auth/provision-user';
import { authorizeUserMgmt, authorizeUserRead, provisionErrorStatus } from '@/lib/auth/authorize-user-mgmt';

export const runtime = 'nodejs';

// HF-288: resolve a suggested invite email per roster entity FROM THE IMPORT CLASSIFICATION (structural).
// The import pipeline classifies each column's SEMANTIC type (header_comprehension); we read the field
// the classifier marked email-semantic — its NORMALIZED output, never a header-name match (Korean Test) —
// and pull that key from committed_data.row_data. Returns {} when no email-semantic field was classified
// (the current estate: rosters identify people by employee-number, not email → all manual-fill).
async function resolveSuggestedEmails(
  sb: SupabaseClient, tenantId: string | null, rosterIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!tenantId || rosterIds.length === 0) return out;
  // 1. the field key(s) the import classified as email-semantic (classifier's semantic output)
  const { data: sigs } = await sb.from('classification_signals').select('header_comprehension').eq('tenant_id', tenantId).not('header_comprehension', 'is', null).limit(500);
  const emailKeys = new Set<string>();
  for (const s of (sigs ?? [])) {
    const hc = s.header_comprehension as Record<string, { semanticMeaning?: string; columnRole?: string }> | null;
    if (!hc || typeof hc !== 'object') continue;
    for (const [k, meta] of Object.entries(hc)) {
      const semantic = `${meta?.semanticMeaning ?? ''} ${meta?.columnRole ?? ''}`.toLowerCase();
      if (semantic.includes('email')) emailKeys.add(k);   // semantic type, not a header literal
    }
  }
  if (emailKeys.size === 0) return out;   // no email-semantic field in this import → manual-fill interim
  // 2. read row_data at the classified key for the roster entities (batched)
  const VALID = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
  for (let i = 0; i < rosterIds.length; i += 300) {
    const { data: cd } = await sb.from('committed_data').select('entity_id, row_data').in('entity_id', rosterIds.slice(i, i + 300));
    for (const r of (cd ?? [])) {
      const rd = (r.row_data as Record<string, unknown>) ?? {};
      for (const k of Array.from(emailKeys)) { const v = rd[k]; if (typeof v === 'string' && VALID.test(v)) { out.set(r.entity_id as string, v); break; } }
    }
  }
  return out;
}

// GET /api/users[?tenantId=] — the user list + roster. The read runs SERVER-SIDE with the service
// role and tenant scoping enforced HERE (not client RLS — CLT166-F10). Admin: own tenant only;
// platform: a selected tenant (?tenantId) or all tenants.
export async function GET(req: NextRequest) {
  const authz = await authorizeUserRead();
  if (!authz.ok) return NextResponse.json({ error: authz.error, code: authz.code }, { status: authz.status });

  const requested = new URL(req.url).searchParams.get('tenantId');
  // tenant scope: admin is pinned to own tenant; platform may select one or see all.
  const scopeTenant = authz.caller.role === 'platform' ? requested : authz.caller.tenantId;

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  let pq = sb.from('profiles').select('id, auth_user_id, display_name, email, role, status, tenant_id, created_at');
  if (scopeTenant) pq = pq.eq('tenant_id', scopeTenant);
  const { data: profiles } = await pq;

  // auth.users → last_sign_in / banned / email_confirmed (credential state)
  const authById = new Map<string, { last_sign_in_at?: string | null; banned_until?: string | null; email_confirmed_at?: string | null }>();
  for (let page = 1; page <= 20; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (!data?.users?.length) break;
    for (const u of data.users) authById.set(u.id, u as never);
    if (data.users.length < 200) break;
  }

  // entities for linkage + roster (entities.profile_id), tenant-scoped
  let eq = sb.from('entities').select('id, display_name, external_id, profile_id, tenant_id');
  if (scopeTenant) eq = eq.eq('tenant_id', scopeTenant);
  const { data: entities } = await eq;
  const entityByProfile = new Map<string, { id: string; display_name: string; external_id: string | null }>();
  for (const e of (entities ?? [])) if (e.profile_id) entityByProfile.set(e.profile_id, e as never);

  const credentialState = (authUserId: string | null, status: string): 'disabled' | 'active' | 'invited' => {
    if (status === 'disabled') return 'disabled';
    const au = authUserId ? authById.get(authUserId) : undefined;
    if (au?.banned_until && new Date(au.banned_until) > new Date()) return 'disabled';
    return au?.last_sign_in_at ? 'active' : 'invited';
  };

  const users = (profiles ?? []).map(p => {
    const au = p.auth_user_id ? authById.get(p.auth_user_id) : undefined;
    const linked = entityByProfile.get(p.id);
    return {
      id: p.id, displayName: p.display_name, email: p.email, role: p.role, status: p.status,
      tenantId: p.tenant_id, createdAt: p.created_at,
      lastSignInAt: au?.last_sign_in_at ?? null,
      credentialState: credentialState(p.auth_user_id, p.status),
      linkedEntity: linked ? { id: linked.id, displayName: linked.display_name, externalId: linked.external_id } : null,
    };
  });
  // F7 roster: entities WITHOUT platform access (profile_id IS NULL), tenant-scoped.
  // HF-288: suggestedEmail sourced structurally from the import classification (null when none).
  const rosterEntities = (entities ?? []).filter(e => !e.profile_id);
  const suggested = await resolveSuggestedEmails(sb, scopeTenant, rosterEntities.map(e => e.id as string));
  const roster = rosterEntities.map(e => ({ id: e.id, displayName: e.display_name, externalId: e.external_id, tenantId: e.tenant_id, suggestedEmail: suggested.get(e.id as string) ?? null }));

  // platform callers get the tenant list for the C.2 selector
  let tenants: Array<{ id: string; name: string }> = [];
  if (authz.caller.role === 'platform') {
    const { data: t } = await sb.from('tenants').select('id, name').order('name');
    tenants = (t ?? []) as Array<{ id: string; name: string }>;
  }

  return NextResponse.json({ users, roster, tenants, scopeTenant: scopeTenant ?? null });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, displayName, role, tenantId = null, entityId, mode, locale, notifyEmail } = body ?? {};
  if (!email || !displayName || !role || !mode) {
    return NextResponse.json({ error: 'email, displayName, role and mode are required' }, { status: 400 });
  }
  const authz = await authorizeUserMgmt({ tenantId: tenantId ?? null, assigningPlatform: role === 'platform' });
  if (!authz.ok) return NextResponse.json({ error: authz.error, code: authz.code }, { status: authz.status });
  try {
    const result = await createUser({ email, displayName, role, tenantId: tenantId ?? null, entityId, mode, locale, notifyEmail: notifyEmail || undefined, actorProfileId: authz.caller.profileId });
    // result.tempPassword (temp_password mode) is returned ONCE here; never logged or persisted by us.
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ProvisionError) return NextResponse.json({ error: e.message, code: e.code }, { status: provisionErrorStatus(e.code) });
    return NextResponse.json({ error: e instanceof Error ? e.message : 'create failed' }, { status: 500 });
  }
}
