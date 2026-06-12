// SCI Resolve-Unit API — POST /api/import/sci/resolve-unit
// OB-203 Phase 5 (D4) — the manual-assign and exclude resolution actions on a
// failed_interpretation unit. Outcome signals are emitted SERVER-SIDE (canonical writer is
// service-role); the import surface's poll then reflects the resolution.
//
// SR-39 (same posture as the interaction route): 401 unauthenticated; tenant authorized via the
// canonical resolveIdentity() (platform-scope cross-tenant, tenant-scope confined to own tenant).
//
// SCOPE BOUNDARY (architect, HALT-6 disposition item 2): manual assign is CLASSIFICATION-LEVEL only.
// Binding-level correction interacts with convergence + the workbook graph → Phase 6, NOT here.

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveIdentity } from '@/lib/auth/resolve-identity';
import { emitUnitStates } from '@/lib/sci/comprehension-state-service';
import { fireSignal } from '@/lib/sci/comprehension-signal-vocabulary';
import { resolveUnitSignals } from '@/lib/sci/resolve-unit-signals';

export async function POST(req: NextRequest) {
  const authClient = await createServerSupabaseClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    tenantId?: string; importSessionId?: string; unitId?: string; sheetName?: string;
    action?: 'assign' | 'exclude'; classification?: string;
  } | null;
  if (!body?.tenantId || !body.importSessionId || !body.unitId || !body.action) {
    return NextResponse.json({ error: 'tenantId, importSessionId, unitId, action required' }, { status: 400 });
  }
  if (body.action === 'assign' && !body.classification) {
    return NextResponse.json({ error: 'classification required for assign' }, { status: 400 });
  }

  // SR-39: authorize tenant via the canonical identity reader.
  const svc = await createServiceRoleClient();
  const identity = await resolveIdentity(svc, user.id);
  if (!identity) return NextResponse.json({ error: 'Forbidden: no identity' }, { status: 403 });
  const isPlatform = identity.canonicalRole === 'platform' || identity.capabilities.includes('manage_tenants');
  if (!isPlatform && identity.tenantId !== body.tenantId) {
    return NextResponse.json({ error: 'Forbidden: not authorized for tenant' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // The action's ENTIRE durable effect is the signals this returns (EPG-5.2).
  const { states, signals } = resolveUnitSignals({
    tenantId: body.tenantId, importSessionId: body.importSessionId, unitId: body.unitId,
    sheetName: body.sheetName, action: body.action, classification: body.classification,
  });
  // Durable state transitions are awaited so the next poll reflects them; vocabulary signals fire-and-forget.
  if (states.length > 0) await emitUnitStates(states, url, key);
  for (const s of signals) fireSignal(s, url, key);

  return NextResponse.json({ ok: true, action: body.action, state: states[0]?.state ?? null });
}
