// SCI Interaction API — POST /api/import/sci/interaction
// OB-203 Phase 4 (R3) — interaction-signal capture on the import surface, generalizing the
// DS-015 stream_interaction pattern. Behavioral data → SR-39 gate applies:
//
//   1. UNAUTHENTICATED calls are rejected (401) — no anonymous behavioral writes.
//   2. tenant is AUTHORIZED server-side against the session user's profile membership
//      (DS-014 / Decision 123): a caller cannot write interaction signals to a tenant it is
//      not a member of (403). The body's tenantId is a routing hint, never trusted on its own.
//   3. writes carry scope:'tenant' + the validated tenant_id (single-tenant scope; no cross-scope
//      aggregation here, so DI-10 anonymization is not triggered on this path).
//
// Fire-and-forget: capture must never block or fail the UI (DI-5 spirit on the write side).

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { fireSignalBatch, buildInteractionSignal, type InteractionAction } from '@/lib/sci/comprehension-signal-vocabulary';

const VALID_ACTIONS = new Set<InteractionAction>(['view', 'expand', 'action_click', 'correction', 'dwell']);

interface InteractionEvent { surface: string; action: string; unitId?: string; dwellMs?: number; metadata?: Record<string, unknown>; }

export async function POST(req: NextRequest) {
  // SR-39 (1): reject unauthenticated.
  const authClient = await createServerSupabaseClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null) as { tenantId?: string; importSessionId?: string; events?: InteractionEvent[] } | null;
  if (!body?.tenantId || !Array.isArray(body.events) || body.events.length === 0) {
    return NextResponse.json({ error: 'tenantId and non-empty events required' }, { status: 400 });
  }

  // SR-39 (2): authorize the tenant against the session user's membership (DS-014/Decision 123).
  const svc = await createServiceRoleClient();
  const { data: membership } = await svc
    .from('profiles').select('id').eq('auth_user_id', user.id).eq('tenant_id', body.tenantId).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Forbidden: not a member of tenant' }, { status: 403 });

  // SR-39 (3): build with the VALIDATED tenant_id, scope:'tenant'. Drop unknown action verbs.
  const signals = body.events
    .filter(e => VALID_ACTIONS.has(e.action as InteractionAction))
    .map(e => buildInteractionSignal({
      tenantId: body.tenantId!, surface: e.surface, action: e.action as InteractionAction,
      unitId: e.unitId ?? null, dwellMs: e.dwellMs ?? null, importSessionId: body.importSessionId ?? null, metadata: e.metadata,
    }));
  fireSignalBatch(signals, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  return NextResponse.json({ accepted: signals.length });
}
