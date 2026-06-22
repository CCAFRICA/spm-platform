// OB-230 Objective 1C — POST /api/admin/users/[id]/reset-mfa
// Removes ALL of the user's MFA factors via auth.admin.mfa.deleteFactor. The user re-enrolls on next
// login. Logs admin.user.mfa_reset before returning.
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
  if (!authz.ok) return NextResponse.json({ ok: false, action: 'mfa_reset', message: authz.error, error: authz.error } as AdminActionResponse, { status: authz.status });

  const { id } = await params;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const target = await resolveTargetUser(sb, id);
  if (!target) return NextResponse.json({ ok: false, action: 'mfa_reset', message: 'User not found' } as AdminActionResponse, { status: 404 });
  const { ip, userAgent } = requestForensics(req);

  let success = false;
  let errorDetail: string | undefined;
  let message: string;
  let deleted = 0;

  if (!target.authUserId) {
    message = 'User has no auth account — no MFA factors.';
  } else {
    const { data: facData, error: listErr } = await sb.auth.admin.mfa.listFactors({ userId: target.authUserId });
    if (listErr) {
      errorDetail = listErr.message;
      message = `Could not list MFA factors: ${errorDetail}`;
    } else {
      const factors = (facData?.factors ?? []) as any[];
      const errors: string[] = [];
      for (const f of factors) {
        const { error } = await sb.auth.admin.mfa.deleteFactor({ userId: target.authUserId, id: f.id });
        if (error) errors.push(error.message);
        else deleted += 1;
      }
      success = errors.length === 0;
      errorDetail = errors.length ? errors.join('; ') : undefined;
      message = success
        ? `Removed ${deleted} MFA factor${deleted === 1 ? '' : 's'} — the user will re-enroll on next login.`
        : `Removed ${deleted}; ${errors.length} failed: ${errorDetail}`;
    }
  }

  await logAdminUserAction(sb, {
    action: 'mfa_reset', actorId: authz.caller.authUserId, actorProfileId: authz.caller.profileId, actorEmail: authz.caller.email,
    targetUserId: target.authUserId, targetProfileId: target.profileId, tenantId: target.tenantId, ip, userAgent, success,
    detail: { factors_removed: deleted, error: errorDetail ?? null },
  });

  return NextResponse.json({ ok: success, action: 'mfa_reset', message, error: errorDetail } as AdminActionResponse, { status: success ? 200 : 500 });
}
