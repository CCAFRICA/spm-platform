// OB-230 Objective 1C — POST /api/admin/users/[id]/ban
// Bans the user via auth.admin.updateUserById({ ban_duration }). Logs admin.user.ban before returning.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizePlatformObservability } from '@/lib/auth/authorize-platform-observability';
import { logAdminUserAction, requestForensics } from '@/lib/observability/admin-action-log';
import { resolveTargetUser } from '@/lib/observability/resolve-target-user';
import type { AdminActionResponse } from '@/lib/observability/api-types';

export const runtime = 'nodejs';
const DEFAULT_BAN = '876000h'; // ~100y — matches provision-user disable() precedent

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorizePlatformObservability();
  if (!authz.ok) return NextResponse.json({ ok: false, action: 'ban', message: authz.error, error: authz.error } as AdminActionResponse, { status: authz.status });

  const { id } = await params;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const target = await resolveTargetUser(sb, id);
  if (!target) return NextResponse.json({ ok: false, action: 'ban', message: 'User not found' } as AdminActionResponse, { status: 404 });
  const { ip, userAgent } = requestForensics(req);

  let durationHours = 0;
  try { const b = await req.json().catch(() => ({})); durationHours = Number((b as { durationHours?: number })?.durationHours) || 0; } catch { /* no body */ }
  const banDuration = durationHours > 0 ? `${durationHours}h` : DEFAULT_BAN;

  let success = false;
  let errorDetail: string | undefined;
  let message: string;

  if (!target.authUserId) {
    message = 'User has no auth account — cannot ban.';
  } else {
    const { error } = await sb.auth.admin.updateUserById(target.authUserId, { ban_duration: banDuration });
    success = !error;
    errorDetail = error?.message;
    message = success ? 'User banned — their sessions are invalidated.' : `Ban failed: ${errorDetail}`;
  }

  await logAdminUserAction(sb, {
    action: 'ban', actorId: authz.caller.authUserId, actorProfileId: authz.caller.profileId, actorEmail: authz.caller.email,
    targetUserId: target.authUserId, targetProfileId: target.profileId, tenantId: target.tenantId, ip, userAgent, success,
    detail: { ban_duration: banDuration, error: errorDetail ?? null },
  });

  return NextResponse.json({ ok: success, action: 'ban', message, error: errorDetail } as AdminActionResponse, { status: success ? 200 : 500 });
}
