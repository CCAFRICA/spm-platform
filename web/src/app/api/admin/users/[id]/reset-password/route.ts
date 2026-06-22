// OB-230 Objective 1C — POST /api/admin/users/[id]/reset-password
// Generates a recovery link via auth.admin.generateLink({ type: 'recovery' }). The admin delivers
// the link to the user through their own channel (out of scope: in-platform email). Logs admin.user.password_reset.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { logAdminUserAction, requestForensics } from '@/lib/observability/admin-action-log';
import { resolveTargetUser } from '@/lib/observability/resolve-target-user';
import type { AdminActionResponse } from '@/lib/observability/api-types';

export const runtime = 'nodejs';

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorizePlatformObservability();
  if (!authz.ok) return NextResponse.json({ ok: false, action: 'password_reset', message: authz.error, error: authz.error } as AdminActionResponse, { status: authz.status });

  const { id } = await params;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const target = await resolveTargetUser(sb, id);
  if (!target) return NextResponse.json({ ok: false, action: 'password_reset', message: 'User not found' } as AdminActionResponse, { status: 404 });
  const { ip, userAgent } = requestForensics(req);

  const { data, error } = await sb.auth.admin.generateLink({ type: 'recovery', email: target.email });
  const success = !error;
  const link = (data as any)?.properties?.action_link as string | undefined;
  const errorDetail = error?.message;
  const message = success
    ? 'Recovery link generated — deliver it to the user securely.'
    : `Could not generate recovery link: ${errorDetail}`;

  await logAdminUserAction(sb, {
    action: 'password_reset', actorId: authz.caller.authUserId, actorProfileId: authz.caller.profileId, actorEmail: authz.caller.email,
    targetUserId: target.authUserId, targetProfileId: target.profileId, tenantId: target.tenantId, ip, userAgent, success,
    detail: { link_type: 'recovery', error: errorDetail ?? null }, // the link itself is NOT persisted to the audit payload
  });

  return NextResponse.json({ ok: success, action: 'password_reset', message, link, error: errorDetail } as AdminActionResponse, { status: success ? 200 : 500 });
}
