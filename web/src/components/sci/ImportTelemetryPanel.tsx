'use client';

// OB-203 §2 (BL-005) — Import Telemetry: the witness operator observes the platform's ACTUAL work live.
// Every number is derived server-side from the durable spine (signals / session-state / batch rows) and
// delivered via /session-state?telemetry=1 — this component only renders; it never tallies. Shaped to
// DS-020's SynapticSurface.stats vocabulary. "Pulse" is the user-facing name for a write (DS-021 family);
// "nanobatch" is reserved for the DS-020 learning innovation and never appears here.

import { useEffect, useState } from 'react';

interface ImportTelemetry {
  totalSignalsWritten: number;
  signalsPerType: Record<string, number>;
  sheets: { comprehended: number; total: number };
  fingerprints: { recognizedTier1: number; storedNew: number };
  atoms: { claimedFromMemory: number; novelComprehended: number };
  llm: { made: number; bypassedByMemory: number };
  fieldBindingsInjected: number;
  units: { committed: number; total: number };
  rows: { committed: number; total: number };
  perUnit: Array<{ sheetName: string | null; expectedRows: number; committed: boolean }>;
  pulses: { committed: number; total: number };
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className={`text-xs tabular-nums font-medium ${accent ? 'text-emerald-300' : 'text-zinc-300'}`}>{value}</span>
    </div>
  );
}

export function ImportTelemetryPanel({
  tenantId,
  sessionId,
  phase,
}: {
  tenantId: string;
  sessionId: string;
  phase: 'analyzing' | 'executing';
}) {
  const [t, setT] = useState<ImportTelemetry | null>(null);

  useEffect(() => {
    if (!tenantId || !sessionId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(sessionId)}&telemetry=1`);
        if (!r.ok || cancelled) return;
        const data = await r.json();
        if (data?.telemetry) setT(data.telemetry as ImportTelemetry);
      } catch { /* best-effort — durable record is the source; a missed poll self-corrects next tick */ }
    };
    const id = setInterval(poll, 2000);
    void poll();
    return () => { cancelled = true; clearInterval(id); };
  }, [tenantId, sessionId]);

  if (!t) return null;

  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Live platform telemetry</span>
        <span className="text-[10px] tabular-nums text-zinc-600">{t.totalSignalsWritten} signals</span>
      </div>

      {phase === 'analyzing' ? (
        <div className="grid grid-cols-2 gap-x-6">
          <div>
            <Stat label="Sheets comprehended" value={`${t.sheets.comprehended} / ${t.sheets.total}`} />
            <Stat label="LLM calls bypassed (memory)" value={`${t.llm.bypassedByMemory}`} accent={t.llm.bypassedByMemory > 0} />
            <Stat label="LLM calls made" value={`${t.llm.made}`} />
          </div>
          <div>
            <Stat label="Fingerprints recognized · new" value={`${t.fingerprints.recognizedTier1} · ${t.fingerprints.storedNew}`} />
            <Stat label="Atoms from memory · novel" value={`${t.atoms.claimedFromMemory} · ${t.atoms.novelComprehended}`} />
            <Stat label="Field bindings injected" value={`${t.fieldBindingsInjected}`} accent={t.fieldBindingsInjected > 0} />
          </div>
        </div>
      ) : (
        <div>
          <Stat label="Units committed" value={`${t.units.committed} / ${t.units.total}`} />
          <Stat label="Writing pulse" value={`${Math.min(t.pulses.committed + (t.pulses.committed < t.pulses.total ? 1 : 0), t.pulses.total)} of ${t.pulses.total}`} accent />
          <Stat label="Rows committed" value={`${t.rows.committed.toLocaleString()} / ${t.rows.total.toLocaleString()}`} />
          {t.perUnit.filter(u => u.committed).slice(-4).map((u, i) => (
            <Stat key={i} label={`  ${u.sheetName ?? 'unit'}`} value={`${u.expectedRows.toLocaleString()} rows ✓`} />
          ))}
        </div>
      )}
    </div>
  );
}
