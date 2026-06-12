// SCI Settle Audit — POST /api/import/sci/settle-audit
// OB-203 Phase 6B Phase D (Amendment 2 §2 D.3): the heavy deriveImportTelemetry
// full-scan runs EXACTLY ONCE per session, here, at settle — as the AUDIT of the
// write-time-accumulated session telemetry record. Scanned truth is compared to
// accumulated truth field-by-field; the verdict is written (write-once,
// first-wins at the RPC) onto the record's `audit` jsonb together with the
// `conclusion` summary. Divergence emits the named platform_event
// 'data.import_telemetry_audit_divergence' and surfaces on the completion
// screen as a reconciliation flag — truth-telling, never silent self-correction
// (Decision 95 posture: the fast surface is self-auditing).
//
// Idempotent: guarded on `audit IS NULL` app-side AND first-wins at the RPC, so
// the two invokers (settleFromSurface completion; ImportReadyState mount) can
// race harmlessly.
//
// Pulses are compared at the FORMULA level (ceil(rows/PULSE_SIZE) on both
// sides): the accumulated record carries ACTUAL pulse counts from the commit
// path's own chunking, which the scanned surface cannot reconstruct (no
// per-pulse trace exists in the data tables) — so pulse equality reduces to
// row equality, which IS compared exactly.

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  deriveImportTelemetry,
  PULSE_SIZE,
  type ImportTelemetry,
} from '@/lib/sci/comprehension-state-service';
import {
  fetchSessionTelemetryRecord,
  projectImportTelemetry,
  accumulateSessionTelemetry,
} from '@/lib/sci/session-telemetry-accumulator';
import { emitEvent } from '@/lib/events/emitter';

const sortedPerUnit = (t: ImportTelemetry) =>
  t.perUnit
    .slice()
    .sort((a, b) => (a.sheetName ?? '').localeCompare(b.sheetName ?? ''))
    .map(u => ({ sheetName: u.sheetName, expectedRows: u.expectedRows, committed: u.committed }));

/** Field-by-field comparison; returns the names of diverging fields. */
function compareTelemetry(scanned: ImportTelemetry, accumulated: ImportTelemetry): string[] {
  const fields: string[] = [];
  const eq = (name: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) fields.push(name);
  };
  eq('totalSignalsWritten', scanned.totalSignalsWritten, accumulated.totalSignalsWritten);
  eq('signalsPerType', scanned.signalsPerType, accumulated.signalsPerType);
  eq('sheets', scanned.sheets, accumulated.sheets);
  eq('fingerprints', scanned.fingerprints, accumulated.fingerprints);
  eq('atoms', scanned.atoms, accumulated.atoms);
  eq('llm', scanned.llm, accumulated.llm);
  eq('fieldBindingsInjected', scanned.fieldBindingsInjected, accumulated.fieldBindingsInjected);
  eq('units', scanned.units, accumulated.units);
  eq('rows', scanned.rows, accumulated.rows);
  eq('perUnit', sortedPerUnit(scanned), sortedPerUnit(accumulated));
  // Formula-level pulse comparison (see header note).
  eq('pulses(formula)', scanned.pulses, {
    committed: Math.ceil(accumulated.rows.committed / PULSE_SIZE),
    total: Math.ceil(accumulated.rows.total / PULSE_SIZE),
  });
  return fields;
}

export async function POST(req: NextRequest) {
  let body: { tenantId?: string; importSessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { tenantId, importSessionId } = body;
  if (!tenantId || !importSessionId) {
    return NextResponse.json({ error: 'tenantId and importSessionId required' }, { status: 400 });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const record = await fetchSessionTelemetryRecord(tenantId, importSessionId, supabase);
    if (!record) {
      return NextResponse.json({ audited: false, reason: 'no_session_record' }, { status: 404 });
    }
    if (record.audit) {
      // Already settled — idempotent no-op (first audit wins).
      const divergent = (record.audit as { divergent?: boolean }).divergent === true;
      return NextResponse.json({ audited: true, alreadySettled: true, divergent, audit: record.audit });
    }

    // THE once-per-session heavy derive (its only caller — Amendment 2 D.3).
    const scanned = await deriveImportTelemetry(tenantId, importSessionId, supabaseUrl, serviceKey);
    const accumulated = projectImportTelemetry(record);
    const divergentFields = compareTelemetry(scanned, accumulated);
    const divergent = divergentFields.length > 0;

    const audit = {
      at: new Date().toISOString(),
      divergent,
      fields: divergentFields,
      scanned,
      accumulated,
    };
    // Conclusion summary = the accumulated truth the completion screen renders
    // (Saved/Learned/Cost vocabulary lives inside ImportTelemetry).
    await accumulateSessionTelemetry({
      tenantId,
      importSessionId,
      signalsDelta: 0,
      signalsPerType: {},
      unitStates: {},
      conclusion: { settledAt: audit.at, telemetry: accumulated },
      audit,
    }, supabase);

    if (divergent) {
      console.error(`[OB-203][telemetry] AUDIT DIVERGENCE session=${importSessionId} fields=${divergentFields.join(',')}`);
      await emitEvent({
        tenant_id: tenantId,
        event_type: 'data.import_telemetry_audit_divergence',
        payload: { importSessionId, fields: divergentFields, scanned, accumulated },
      });
    } else {
      console.log(`[OB-203][telemetry] audit EQUAL session=${importSessionId} (accumulated == scanned)`);
    }

    return NextResponse.json({ audited: true, divergent, fields: divergentFields });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'settle-audit failed' },
      { status: 500 },
    );
  }
}
