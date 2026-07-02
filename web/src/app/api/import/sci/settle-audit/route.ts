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
// HF-373 Phase D (D9): pulses are NOT compared (the retired formula-level compare
// checked ceil(rows/500) against itself); the accumulated record's ACTUAL
// byte-budgeted pulse counts ride in the audit payload as observability. A
// SETTLED GATE defers any audit fired while the session is still committing —
// the first-wins verdict may never freeze a mid-commit scan.

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  deriveImportTelemetry,
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

// Key-order-insensitive canonicalization: jsonb returns object keys
// alphabetized while in-process objects carry insertion order — equality is
// about CONTENT (Decision 95), never key order.
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => [k, canon(val)]),
    );
  }
  return v;
}

/** Field-by-field comparison; returns the names of diverging fields. */
function compareTelemetry(scanned: ImportTelemetry, accumulated: ImportTelemetry): string[] {
  const fields: string[] = [];
  const eq = (name: string, a: unknown, b: unknown) => {
    if (JSON.stringify(canon(a)) !== JSON.stringify(canon(b))) fields.push(name);
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
  // HF-373 Phase D (D9): the 'pulses(formula)' compare is RETIRED. It compared
  // ceil(rows/500) on BOTH sides — a formula against itself — so it could only ever
  // echo a rows divergence while the accumulated record's ACTUAL byte-budgeted pulse
  // counts (HF-359: live 2 and 9 actual pulses on equal-row clean runs vs formula 1)
  // went unaudited AND unflagged. Rows are compared exactly above; the accumulated
  // actual pulse bookkeeping stays in the audit payload as observability.
  return fields;
}

// HF-373 Phase D (D9): SETTLED GATE — the once-per-session FIRST-WINS audit must never
// scan mid-commit. On 2026-07-02 a premature finalize collapsed the UI mid-commit, the
// completion screen fired this audit while batches were still landing, and a genuinely
// clean import (final state: all batches completed, 20/20 rows) got a FROZEN false
// AUDIT DIVERGENCE. The session is settled when no batch is live-processing and its
// jobs are terminal; otherwise the audit DEFERS (no write) — the caller may retry.
const BATCH_LIVENESS_MS = 5 * 60_000;
interface SettleGateClient {
  from(table: string): {
    select(cols: string): {
      eq(c: string, v: string): { eq(c: string, v: string): PromiseLike<{ data: unknown[] | null }> };
    };
  };
}
async function auditSettledGate(
  supabase: SettleGateClient,
  tenantId: string,
  importSessionId: string,
): Promise<{ settled: boolean; reason: string }> {
  try {
    const { data: batches } = await supabase
      .from('import_batches')
      .select('status, created_at')
      .eq('tenant_id', tenantId)
      .eq('metadata->>proposalId', importSessionId);
    const now = Date.now();
    for (const b of (batches ?? []) as Array<{ status: string; created_at: string }>) {
      if (b.status !== 'processing') continue;
      const age = now - Date.parse(b.created_at);
      if (Number.isFinite(age) && age < BATCH_LIVENESS_MS) {
        return { settled: false, reason: 'a batch is live-processing for this session' };
      }
    }
    const { data: jobs } = await supabase
      .from('processing_jobs')
      .select('status')
      .eq('tenant_id', tenantId)
      .eq('metadata->>proposal_id', importSessionId);
    const nonTerminal = ((jobs ?? []) as Array<{ status: string }>).filter(
      j => !['committed', 'finalized', 'failed'].includes(j.status),
    );
    if (nonTerminal.length > 0) {
      return { settled: false, reason: `${nonTerminal.length} session job(s) not terminal (${nonTerminal.map(j => j.status).join(',')})` };
    }
    return { settled: true, reason: 'no live batches; jobs terminal' };
  } catch (err) {
    // Gate failure must not permanently block the audit — proceed as before.
    return { settled: true, reason: `gate check failed (${err instanceof Error ? err.message : 'unknown'}) — proceeding` };
  }
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

    // HF-373 Phase D (D9): refuse to freeze a mid-commit scan — defer, no write.
    const gate = await auditSettledGate(supabase as unknown as SettleGateClient, tenantId, importSessionId);
    if (!gate.settled) {
      console.log(`[OB-203][telemetry] settle-audit DEFERRED session=${importSessionId}: ${gate.reason}`);
      return NextResponse.json({ audited: false, deferred: true, reason: gate.reason });
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
