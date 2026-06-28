/**
 * OB-252 — GET/POST /api/platform/tenants/[tenantId]/users
 *
 * The Observatory Tenant Admin surface's TENANT ADMIN USERS endpoint (Section C). Platform-admin
 * only (authorizePlatformObservability → platform.system_config).
 *
 *   GET  — list this tenant's users (id, name, email, role) straight from `profiles` (the single
 *          source of truth — the cross-tenant Users tab reads the same table, so a user created here
 *          appears there with no sync step; PG-15).
 *   POST — create a user for THIS tenant via the single-door createUser (provision-user.ts):
 *          auth.admin.createUser + profiles insert (correct tenant_id + role + derived capabilities)
 *          with auth-rollback atomicity and an audit_logs row (I4, written inside createUser).
 *
 * I6 (no silent failure): a provisioning failure is propagated as a real error status with the
 * specific cause — NOT swallowed into a fake success (the create-wizard defect this surface fixes).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { createUser, ProvisionError, type ServiceErrorCode } from '@/lib/auth/provision-user';
import { resolveRole } from '@/lib/auth/permissions';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Roles a platform admin may provision for a tenant from this surface. NOT 'platform' (platform
// users have NULL tenant_id — provisioning one for a specific tenant is a contract violation that
// createUser would reject anyway). 'admin' is the tenant administrator (the section's headline use).
const ASSIGNABLE_ROLES = ['admin', 'manager', 'member', 'viewer'] as const;

/** Map a ProvisionError code to an HTTP status (honest failure surfacing, I6). */
const STATUS_FOR_CODE: Record<ServiceErrorCode, number> = {
  invalid_role: 400,
  tenant_scope_violation: 400,
  duplicate_identity: 409,
  not_found: 404,
  lockout_guard: 409,
  auth_create_failed: 502,
  profile_insert_failed: 500,
  rate_limited: 429,
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const gate = await authorizePlatformObservability();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const supabase = (await createServiceRoleClient()) as unknown as SupabaseClient;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, auth_user_id, display_name, email, role, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data ?? [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await params;
    const gate = await authorizePlatformObservability();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await request.json()) as Partial<{ email: string; displayName: string; role: string; mode: 'invite' | 'temp_password' }>;

    const email = (body.email ?? '').trim();
    const displayName = (body.displayName ?? '').trim();
    const requestedRole = (body.role ?? 'admin').trim();
    const mode = body.mode === 'temp_password' ? 'temp_password' : 'invite';

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }
    if (!displayName) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
    }
    // Validate the requested role resolves to an assignable, non-platform canonical role.
    const canonical = resolveRole(requestedRole);
    if (!canonical || !(ASSIGNABLE_ROLES as readonly string[]).includes(canonical)) {
      return NextResponse.json(
        { error: `role must be one of ${ASSIGNABLE_ROLES.join(', ')}`, received: requestedRole },
        { status: 400 },
      );
    }

    // Verify the tenant exists (createUser would otherwise produce a dangling tenant_id).
    const supabase = (await createServiceRoleClient()) as unknown as SupabaseClient;
    const { data: tenant } = await supabase.from('tenants').select('id').eq('id', tenantId).maybeSingle();
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    // Single-door provisioning — atomic, audited (audit_logs written inside createUser), service-role.
    // locale defaults to 'en' inside createUser; the new user can set their own afterward.
    const result = await createUser({
      email,
      displayName,
      role: canonical,
      tenantId,
      mode,
      actorProfileId: gate.caller.profileId,
    });

    return NextResponse.json(
      {
        user: {
          profileId: result.profileId,
          authUserId: result.authUserId,
          email,
          displayName,
          role: result.role,
        },
        delivery: result.delivery ?? null,
        // temp_password is returned ONCE for out-of-band delivery; never logged/persisted.
        tempPassword: result.tempPassword ?? null,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ProvisionError) {
      // I6: surface the specific cause (duplicate email, RLS/CHECK, auth failure) — never a fake 201.
      return NextResponse.json({ error: err.message, code: err.code }, { status: STATUS_FOR_CODE[err.code] ?? 500 });
    }
    console.error('[POST /api/platform/tenants/[tenantId]/users] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
