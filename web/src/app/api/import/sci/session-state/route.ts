// SCI Session State API — GET /api/import/sci/session-state
// OB-203 Phase 3 (R2/DI-1). THE PHASE 5 DATA CONTRACT: the import surface polls
// this to render unit comprehension states live; the Phase 5 resolution dialog
// consumes the same `SessionStateView` without rework.
//
// Read-only over the durable signal surface — rebuilds the session view from
// `classification_signals` (signal_type='comprehension:unit_state', grouped by
// context.importSessionId). No ephemeral state; survives process restart (R2).
//
// importSessionId is the COMPREHENSION-session identity (aliases the analyze
// proposalId) — distinct from execute-side import_batch_id (HF-213).

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { rebuildSessionState, deriveImportTelemetry } from '@/lib/sci/comprehension-state-service';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');
  const importSessionId = searchParams.get('importSessionId');

  if (!tenantId || !importSessionId) {
    return NextResponse.json({ error: 'tenantId and importSessionId required' }, { status: 400 });
  }

  try {
    const view = await rebuildSessionState(
      tenantId,
      importSessionId,
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    // OB-203 §2: attach import telemetry only when asked (?telemetry=1) — the witness panel polls with it;
    // the lightweight stall/progress polls stay cheap. Telemetry failure must not break the state read.
    if (searchParams.get('telemetry') === '1') {
      try {
        const telemetry = await deriveImportTelemetry(
          tenantId, importSessionId,
          process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        return NextResponse.json({ ...view, telemetry });
      } catch (telErr) {
        console.warn('[session-state] telemetry derivation failed (non-blocking):', telErr instanceof Error ? telErr.message : telErr);
      }
    }
    return NextResponse.json(view);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'session-state rebuild failed' },
      { status: 500 },
    );
  }
}
