// SCI Retry-Unit API — POST /api/import/sci/retry-unit
// OB-203 Phase 3 (R2): re-run comprehension for ONE failed unit WITHOUT re-ingestion.
// The unit's rows come from the already-persisted storage artifact; comprehension re-runs
// through the SAME decomposed dispatch (runDecomposedComprehension) the analyze route uses,
// so the retried unit benefits from everything the atom flywheel learned since the failure.
// Emits the resulting state (comprehended / failed_interpretation) on the canonical surface;
// the import surface's poll sees the unit advance.

export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isInternalCronCaller } from '@/lib/sci/cron-principal';
import { runDecomposedComprehension } from '@/lib/sci/header-comprehension';
import { debandWorksheet } from '@/lib/sci/deband-sheet';
import {
  retryUnitComprehension,
  productionRetryDeps,
  type DecomposedDispatch,
} from '@/lib/sci/retry-unit-comprehension';
// OB-203 Phase 4 (R3): emit a resolution signal when a retry resolves a failed unit.
import { fireSignal, buildResolutionSignal } from '@/lib/sci/comprehension-signal-vocabulary';

export async function POST(req: NextRequest) {
  try {
    // HF-372 Phase F (EPG-0.8 §1b): this was the THIRD classify entry with NO in-route auth at all
    // (service-role work behind only the middleware). Same principal set as process-job.
    const authClient = await createServerSupabaseClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    if (!authUser && !isInternalCronCaller(req)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId, importSessionId, storagePath, unitId } = body as {
      tenantId?: string; importSessionId?: string; storagePath?: string; unitId?: string;
    };
    if (!tenantId || !importSessionId || !storagePath || !unitId) {
      return NextResponse.json(
        { error: 'tenantId, importSessionId, storagePath, and unitId required' },
        { status: 400 },
      );
    }

    // unitId = fileName::sheetName::tabIndex
    const parts = unitId.split('::');
    const sheetName = parts[1];
    const tabIndex = Number(parts[2] ?? 0);
    const sourceFileName = parts[0] ?? (storagePath.split('/').pop()?.replace(/^\d+_/, '') ?? 'unknown');
    if (!sheetName) {
      return NextResponse.json({ error: `malformed unitId '${unitId}' (expected file::sheet::index)` }, { status: 400 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Re-read the persisted artifact (NO re-ingestion) and parse the target sheet only.
    const { data: fileData, error: dErr } = await supabase.storage.from('ingestion-raw').download(storagePath);
    if (dErr || !fileData) {
      return NextResponse.json({ error: `download failed: ${dErr?.message ?? 'no data'} (${storagePath})` }, { status: 500 });
    }
    const buffer = await fileData.arrayBuffer();
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'array' });
    const ws = workbook.Sheets[sheetName];
    if (!ws) {
      return NextResponse.json({ error: `sheet '${sheetName}' not found in ${storagePath}` }, { status: 404 });
    }
    // HF-372 Phase F (EPG-0.8 §1b): de-band like the OTHER classify entries (process-job,
    // execute-bulk's commit parse) — a retried banded unit previously re-parsed RAW (__EMPTY keys),
    // producing a different recognition surface than the original classify pass. One parse law.
    const deband = debandWorksheet(XLSX, ws, sheetName);
    const rows = deband.rows as Record<string, unknown>[];
    const columns = deband.columns;

    // SAME decomposed dispatch as analyze (adapter narrows the return to the retry contract).
    const dispatch: DecomposedDispatch = async (pm, sheets, t, u, k) => {
      const dc = await runDecomposedComprehension(pm, sheets, t, u, k);
      return { provenance: dc.provenance, perSheetFailure: dc.perSheetFailure as Map<string, string> };
    };

    const result = await retryUnitComprehension(
      { tenantId, importSessionId, unitId, sheetName, tabIndex, sourceFileName, columns, rows, rowCount: rows.length },
      productionRetryDeps(dispatch),
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // R3: a successful retry RESOLVES the prior failure (resolution-by-retry; source=sci_agent).
    if (result.state === 'comprehended') {
      fireSignal(
        buildResolutionSignal({ tenantId, unitId, sheetName, from: 'failed_interpretation', to: 'comprehended', source: 'sci_agent', importSessionId }),
        process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'retry failed' },
      { status: 500 },
    );
  }
}
