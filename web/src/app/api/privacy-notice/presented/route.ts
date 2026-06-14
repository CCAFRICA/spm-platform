// OB-204 A.7 (I-4) — POST /api/privacy-notice/presented.
// Emits a version-stamped privacy_notice.presented event on first authenticated load.
// I-1: uuid (profile_id) + version only — no PII. No gate (Q-J: acknowledgment deferred).
import { NextResponse } from 'next/server';
import { getServerAuthState } from '@/lib/auth/server-auth';
import { emitEvent } from '@/lib/events/emitter';

export const runtime = 'nodejs';
const PRIVACY_NOTICE_VERSION = '2026-06-13';

export async function POST() {
  const state = await getServerAuthState();
  if (!state.isAuthenticated || !state.profile) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await emitEvent({
    tenant_id: state.profile.tenantId,
    event_type: 'privacy_notice.presented',
    actor_id: state.profile.id,
    entity_id: state.profile.id,
    payload: { profile_id: state.profile.id, version: PRIVACY_NOTICE_VERSION },
  });
  return NextResponse.json({ ok: true, version: PRIVACY_NOTICE_VERSION });
}
