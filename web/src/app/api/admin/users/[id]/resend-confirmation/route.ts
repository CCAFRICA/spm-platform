// OB-230 Objective 1C — POST /api/admin/users/[id]/resend-confirmation
// Re-issues an email-confirmation link for an unconfirmed user. NOTE: generateLink({type:'signup'})
// requires a password (not available for an existing account), so for an existing unconfirmed user the
// equivalent is a magic link — clicking it confirms the email and signs the user in. The admin delivers
// the link. Logs admin.user.resend_confirmation.
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
  if (!authz.ok) return NextResponse.json({ ok: false, action: 'resend_confirmation', message: authz.error, error: authz.error } as AdminActionResponse, { status: authz.status });

  const { id } = await params;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const target = await resolveTargetUser(sb, id);
  if (!target) return NextResponse.json({ ok: false, action: 'resend_confirmation', message: 'User not found' } as AdminActionResponse, { status: 404 });
  const { ip, userAgent } = requestForensics(req);

  let success = false;
  let errorDetail: string | undefined;
  let message: string;
  let link: string | undefined;
  let alreadyConfirmed = false;

  if (!target.authUserId) {
    message = 'User has no auth account.';
  } else {
    const { data: authData } = await sb.auth.admin.getUserById(target.authUserId);
    alreadyConfirmed = !!(authData?.user as any)?.email_confirmed_at;
    if (alreadyConfirmed) {
      success = true;
      message = 'Email is already confirmed — no link needed.';
    } else {
      const { data, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email: target.email });
      success = !error;
      link = (data as any)?.properties?.action_link as string | undefined;
      errorDetail = error?.message;
      message = success
        ? 'Confirmation (magic) link generated — deliver it to the user; clicking it confirms their email.'
        : `Could not generate confirmation link: ${errorDetail}`;
    }
  }

  await logAdminUserAction(sb, {
    action: 'resend_confirmation', actorId: authz.caller.authUserId, actorProfileId: authz.caller.profileId, actorEmail: authz.caller.email,
    targetUserId: target.authUserId, targetProfileId: target.profileId, tenantId: target.tenantId, ip, userAgent, success,
    detail: { link_type: 'magiclink', already_confirmed: alreadyConfirmed, error: errorDetail ?? null },
  });

  return NextResponse.json({ ok: success, action: 'resend_confirmation', message, link, error: errorDetail } as AdminActionResponse, { status: success ? 200 : 500 });
}
