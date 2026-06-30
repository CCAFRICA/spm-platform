/**
 * GET /api/import/sci/pulse-load/state?tenantId=...&sessionId=...
 *
 * HF-360 (Part C data source / Part B audit) — the TRUTHFUL load state for an import session: exactly what
 * landed vs what is still loading, from pulse_load_jobs (NOT the rowsCommitted=0 the surface used to read at
 * stage time). Returns the session aggregate (rows/pulses loaded vs total, status) + each job's snapshot +
 * the audit transitions. The import surface polls this while the load is non-terminal.
 *
 * Authorized by the shared pulse-load gate (tenant member OR platform.data_operations); tenant-scoped read.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authorizePulseLoadCaller } from '@/lib/sci/pulse-load-authz';
import { getSessionJobs, projectSessionLoadState } from '@/lib/sci/pulse-load-enqueue';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 });
  }
  const authz = await authorizePulseLoadCaller(tenantId);
  if (!authz.ok) return authz.response;

  try {
    const jobs = await getSessionJobs(authz.service, tenantId!, sessionId);
    const state = projectSessionLoadState(sessionId, jobs);
    return NextResponse.json({
      sessionId,
      status: state.status,
      rowsLoaded: state.rowsLoaded,
      rowsTotal: state.rowsTotal,
      pulsesLoaded: state.pulsesLoaded,
      pulsesTotal: state.pulsesTotal,
      jobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        cursor: j.cursor,
        totalPulses: j.total_pulses,
        rowsLoaded: j.rows_loaded,
        totalRows: j.total_rows,
        fileName: j.file_name,
        errorDetail: j.error_detail,
        audit: j.audit,
        updatedAt: j.updated_at,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed to read load state' }, { status: 500 });
  }
}
