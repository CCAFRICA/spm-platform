// OB-230 Objective 1C — POST /api/admin/users/[id]/force-logout
// HALT-2: auth.admin.signOut() needs the user's JWT (unavailable server-side). We call the official
// GoTrue admin logout HTTP endpoint with the service-role bearer — the sanctioned Admin API, NOT a
// raw auth.* SQL write. Logs admin.user.force_logout before returning.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { logAdminUserAction, requestForensics } from '@/lib/observability/admin-action-log';
import { resolveTargetUser } from '@/lib/observability/resolve-target-user';
import type { AdminActionResponse } from '@/lib/observability/api-types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorizePlatformObservability();
  if (!authz.ok) return NextResponse.json({ ok: false, action: 'force_logout', message: authz.error, error: authz.error } as AdminActionResponse, { status: authz.status });

  const { id } = await params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const target = await resolveTargetUser(sb, id);
  if (!target) return NextResponse.json({ ok: false, action: 'force_logout', message: 'User not found' } as AdminActionResponse, { status: 404 });
  const { ip, userAgent } = requestForensics(req);

  let success = false;
  let errorDetail: string | undefined;
  let message: string;

  if (!target.authUserId) {
    message = 'User has no auth account — nothing to sign out.';
  } else {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${target.authUserId}/logout?scope=global`, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      });
      success = res.ok;
      if (!res.ok) errorDetail = (await res.text().catch(() => '')) || `HTTP ${res.status}`;
      message = success ? 'All sessions revoked — the user must sign in again.' : `Force-logout failed: ${errorDetail}`;
    } catch (e) {
      errorDetail = e instanceof Error ? e.message : 'request failed';
      message = `Force-logout failed: ${errorDetail}`;
    }
  }

  await logAdminUserAction(sb, {
    action: 'force_logout', actorId: authz.caller.authUserId, actorProfileId: authz.caller.profileId, actorEmail: authz.caller.email,
    targetUserId: target.authUserId, targetProfileId: target.profileId, tenantId: target.tenantId, ip, userAgent, success,
    detail: { scope: 'global', error: errorDetail ?? null },
  });

  return NextResponse.json({ ok: success, action: 'force_logout', message, error: errorDetail } as AdminActionResponse, { status: success ? 200 : 500 });
}
