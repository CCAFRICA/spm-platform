// SCI Session State API — GET /api/import/sci/session-state
// OB-203 Phase 3 (R2/DI-1) → Phase 6B Phase D (Amendment 2 §2).
//
// THE PHASE 5 DATA CONTRACT is unchanged: the import surface polls this to
// render unit comprehension states live; the Phase 5 resolution dialog consumes
// the same `SessionStateView`; `?telemetry=1` attaches the same `ImportTelemetry`
// shape the panels already render.
//
// Phase D re-point: EVERY request is now ONE single-row PK read of
// `import_session_telemetry` (the write-time-accumulated session record) —
// O(1) in stored data volume, independent of tenant size. Both the view and
// the telemetry PROJECT from that one row, so no two panels on one screen can
// disagree (D19 closed by construction) and no polling path scans a data table
// (A5 closed: the old ?telemetry=1 path ran 5 table reads per 2s tick,
// including an exact COUNT over committed_data). The heavy derive is demoted
// to the once-per-session settle audit (/api/import/sci/settle-audit).
//
// A session that predates the telemetry record (or hasn't emitted yet) projects
// an empty view — same shape rebuildSessionState returned for a signal-less
// session. No fallback scan: the invariant is absolute.
//
// importSessionId is the COMPREHENSION-session identity (aliases the analyze
// proposalId) — distinct from execute-side import_batch_id (HF-213).

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchSessionTelemetryRecord,
  projectSessionStateView,
  projectImportTelemetry,
} from '@/lib/sci/session-telemetry-accumulator';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');
  const importSessionId = searchParams.get('importSessionId');

  if (!tenantId || !importSessionId) {
    return NextResponse.json({ error: 'tenantId and importSessionId required' }, { status: 400 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const record = await fetchSessionTelemetryRecord(tenantId, importSessionId, supabase);
    const view = projectSessionStateView(record, tenantId, importSessionId);
    if (searchParams.get('telemetry') === '1') {
      // Same row, second projection — still zero additional reads. `audit` is
      // the settle-time reconciliation verdict (null until settled); the
      // completion screen renders its divergence flag.
      return NextResponse.json({
        ...view,
        telemetry: projectImportTelemetry(record),
        audit: record?.audit ?? null,
      });
    }
    return NextResponse.json(view);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'session-state read failed' },
      { status: 500 },
    );
  }
}
