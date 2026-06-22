// OB-230 Objective 1C — POST /api/admin/users/[id]/unban
// Lifts a ban via auth.admin.updateUserById({ ban_duration: 'none' }). Logs admin.user.unban.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { logAdminUserAction, requestForensics } from '@/lib/observability/admin-action-log';
import { resolveTargetUser } from '@/lib/observability/resolve-target-user';
import type { AdminActionResponse } from '@/lib/observability/api-types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorizePlatformObservability();
  if (!authz.ok) return NextResponse.json({ ok: false, action: 'unban', message: authz.error, error: authz.error } as AdminActionResponse, { status: authz.status });

  const { id } = await params;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const target = await resolveTargetUser(sb, id);
  if (!target) return NextResponse.json({ ok: false, action: 'unban', message: 'User not found' } as AdminActionResponse, { status: 404 });
  const { ip, userAgent } = requestForensics(req);

  let success = false;
  let errorDetail: string | undefined;
  let message: string;

  if (!target.authUserId) {
    message = 'User has no auth account — nothing to unban.';
  } else {
    const { error } = await sb.auth.admin.updateUserById(target.authUserId, { ban_duration: 'none' });
    success = !error;
    errorDetail = error?.message;
    message = success ? 'Ban lifted — the user can sign in again.' : `Unban failed: ${errorDetail}`;
  }

  await logAdminUserAction(sb, {
    action: 'unban', actorId: authz.caller.authUserId, actorProfileId: authz.caller.profileId, actorEmail: authz.caller.email,
    targetUserId: target.authUserId, targetProfileId: target.profileId, tenantId: target.tenantId, ip, userAgent, success,
    detail: { error: errorDetail ?? null },
  });

  return NextResponse.json({ ok: success, action: 'unban', message, error: errorDetail } as AdminActionResponse, { status: success ? 200 : 500 });
}
