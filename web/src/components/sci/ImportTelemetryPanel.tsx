'use client';

// OB-203 §2 (BL-005) — Import Telemetry: the witness operator observes the platform's ACTUAL work live.
// Every number is derived server-side from the durable spine (signals / session-state / batch rows) and
// delivered via /session-state?telemetry=1 — this component only renders; it never tallies. Shaped to
// DS-020's SynapticSurface.stats vocabulary. "Pulse" is the user-facing name for a write (DS-021 family);
// "nanobatch" is reserved for the DS-020 learning innovation and never appears here.

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { allUnitsSettled } from '@/lib/sci/comprehension-state-service';
import type { UnitComprehensionState } from '@/lib/sci/comprehension-state-service';
import { useIsVialuce } from '@/hooks/use-is-vialuce'; // HF-318: import-analyze intelligence → .kpi cards on top

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

// 2.1: the Progressive-Performance hero — the memory-bypass number IS the story, given prominence.
function Hero({ value, unit, caption }: { value: string; unit: string; caption: string }) {
  return (
    <div className="flex items-end gap-2.5">
      <span className="text-3xl font-light tabular-nums text-emerald-300 leading-none">{value}</span>
      <span className="text-xs text-emerald-400/70 pb-0.5">{unit}</span>
      <span className="text-[11px] text-zinc-500 pb-1 ml-auto text-right max-w-[55%] leading-tight">{caption}</span>
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
  const isVialuce = useIsVialuce(); // HF-318: Vialuce renders the intelligence as design-spec .kpi cards (no gray footer)
  const [t, setT] = useState<ImportTelemetry | null>(null);

  useEffect(() => {
    if (!tenantId || !sessionId) return;
    // HF-298: do NOT poll during the EXECUTE phase. Per-unit commit progress is now driven by the
    // execute-bulk HTTP 200 responses (rendered by ExecutionProgress); a telemetry=1 poll here only
    // adds session-state load that contends with the deferred post-commit work (DIAG-070). The panel
    // stays a live telemetry surface during ANALYZE (phase='analyzing'), where there is no
    // response-driven progress to read and the poll is the only source.
    if (phase === 'executing') return;
    let cancelled = false;
    let id: ReturnType<typeof setInterval> | null = null;
    const stop = (reason: string) => { if (id !== null) { clearInterval(id); id = null; console.log(`[TRACE-POLL] ImportTelemetryPanel STOP reason=${reason}`); } }; // DIAG-070
    // HF-296 (Stream B): hard stall-timeout. The HF-286 allUnitsSettled stop never fires if a unit is
    // orphaned on the spine (never reaches a terminal state) — this interval would then poll FOREVER,
    // adding to the auth-starving execute-phase load. Bound it: if telemetry shows no forward progress
    // (totalSignalsWritten, monotonic) for STALL_MS, stop. Normal completion still stops immediately
    // via allUnitsSettled AND via the page unmounting this panel at the executing -> complete transition.
    const STALL_MS = 30_000;
    let lastSignals = -1;
    let lastProgressAt = Date.now();
    console.log(`[TRACE-POLL] ImportTelemetryPanel START phase=${phase}`); // DIAG-070
    const poll = async () => {
      try {
        const r = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(sessionId)}&telemetry=1`);
        if (!r.ok || cancelled) return;
        const data = await r.json();
        if (data?.telemetry) setT(data.telemetry as ImportTelemetry);
        const signals = Number(data?.telemetry?.totalSignalsWritten ?? 0);
        if (signals > lastSignals) { lastSignals = signals; lastProgressAt = Date.now(); }
        // HF-286: the telemetry=1 response spreads ...view, so data.units is present.
        // Stop once every unit is settled (same settled-set predicate as the proposal poller).
        const units = (data?.units ?? []) as Array<{ state: UnitComprehensionState }>;
        console.log(`[TRACE-POLL] ImportTelemetryPanel TICK signals=${signals} units=${units.length}`); // DIAG-070
        if (units.length > 0 && allUnitsSettled(units)) { stop('allSettled'); return; }
        // HF-296 backstop: no forward progress for the stall window — stop (orphaned-unit guard).
        if (Date.now() - lastProgressAt > STALL_MS) stop('stall-timeout');
      } catch { /* best-effort — durable record is the source; a missed poll self-corrects next tick */ }
    };
    id = setInterval(poll, 2000);
    void poll();
    return () => { cancelled = true; stop('unmount'); };
  }, [tenantId, sessionId, phase]);

  if (!t) return null;

  const recognized = t.llm.bypassedByMemory;
  const totalCompd = t.llm.made + t.llm.bypassedByMemory;
  const pulseNow = Math.min(t.pulses.committed + (t.pulses.committed < t.pulses.total ? 1 : 0), t.pulses.total);
  const pulsePct = t.pulses.total > 0 ? Math.round((t.pulses.committed / t.pulses.total) * 100) : 0;

  // HF-318: Vialuce — the platform's intelligence is the HEADLINE. Render it as design-spec .kpi
  // cards (analyze) / a clean commit card (execute) in USER LANGUAGE — no "atoms"/"fingerprints"/
  // "pulses"/gray footer. The page places this ABOVE the file list. Else-branch unchanged.
  if (isVialuce) {
    const sheetsPct = t.sheets.total > 0 ? Math.round((t.sheets.comprehended / t.sheets.total) * 100) : 0;
    if (phase === 'analyzing') {
      return (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: 10.5, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', margin: '0 0 12px' }}>Understanding your data</p>
          <div className="kpis">
            <div className="kpi" style={{ '--accent': 'var(--vl-kpi-accent)' } as CSSProperties}>
              <div className="kpi-label">Sheets Comprehended</div>
              <div className="kpi-val">{t.sheets.comprehended}<span style={{ fontSize: 14, color: 'var(--vl-text-soft)' }}> / {t.sheets.total}</span></div>
              <div style={{ marginTop: 8, height: 4, borderRadius: 999, background: 'var(--vl-line)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${sheetsPct}%`, background: 'var(--vl-kpi-accent)', transition: 'width .4s' }} />
              </div>
            </div>
            <div className="kpi"><div className="kpi-label">Fields Recognized</div><div className="kpi-val">{t.atoms.claimedFromMemory.toLocaleString()}</div></div>
            <div className="kpi"><div className="kpi-label">New Patterns Learned</div><div className="kpi-val">{t.atoms.novelComprehended.toLocaleString()}</div></div>
            <div className="kpi"><div className="kpi-label">Data Signatures</div><div className="kpi-val">{t.fingerprints.storedNew.toLocaleString()}</div></div>
          </div>
        </div>
      );
    }
    // executing — clean commit-progress card (records landing), user language
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: 10.5, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', margin: 0 }}>Committing records</p>
          <span style={{ fontFamily: 'var(--vl-font-mono)', fontSize: 13, color: 'var(--vl-text)' }}>{t.rows.committed.toLocaleString()} / {t.rows.total.toLocaleString()}</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--vl-line)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pulsePct}%`, background: 'var(--vl-success)', transition: 'width .5s' }} />
        </div>
        <p style={{ fontSize: 11, color: 'var(--vl-text-soft)', margin: '8px 0 0' }}>{t.units.committed} of {t.units.total} content units committed</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900/70 to-zinc-900/30 px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {phase === 'analyzing' ? 'Comprehension — what memory saved' : 'Committing — pulses landing'}
        </span>
        <span className="text-[10px] tabular-nums text-zinc-600">{t.totalSignalsWritten.toLocaleString()} signals captured</span>
      </div>

      {phase === 'analyzing' ? (
        <>
          {/* HERO: the Progressive-Performance number — LLM calls the platform did NOT need to make. */}
          <Hero
            value={`${recognized}`}
            unit={totalCompd > 0 ? `of ${totalCompd} bypassed` : 'recognized'}
            caption={recognized > 0 ? 'sheets recognized from memory — no AI call needed' : 'cold start — learning this shape now'}
          />
          <div className="mt-2.5 h-px bg-zinc-800" />
          <div className="mt-2.5 grid grid-cols-2 gap-x-6">
            <div>
              <Stat label="Sheets comprehended" value={`${t.sheets.comprehended} / ${t.sheets.total}`} />
              <Stat label="LLM calls made" value={`${t.llm.made}`} />
              <Stat label="Fingerprints recognized · new" value={`${t.fingerprints.recognizedTier1} · ${t.fingerprints.storedNew}`} />
            </div>
            <div>
              <Stat label="Atoms from memory" value={`${t.atoms.claimedFromMemory}`} accent={t.atoms.claimedFromMemory > 0} />
              <Stat label="Atoms learned (novel)" value={`${t.atoms.novelComprehended}`} />
              <Stat label="Field bindings injected" value={`${t.fieldBindingsInjected}`} accent={t.fieldBindingsInjected > 0} />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* HERO: pulse progress — the write landing on the durable record. */}
          <Hero value={`${pulseNow}`} unit={`of ${t.pulses.total} pulses`} caption={`${t.rows.committed.toLocaleString()} of ${t.rows.total.toLocaleString()} rows committed`} />
          <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pulsePct}%` }} />
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-x-6">
            <Stat label="Units committed" value={`${t.units.committed} / ${t.units.total}`} accent={t.units.committed > 0} />
            <Stat label="Signals captured" value={`${t.totalSignalsWritten.toLocaleString()}`} />
          </div>
          {t.perUnit.filter(u => u.committed).slice(-3).map((u, i) => (
            <Stat key={i} label={`  ${u.sheetName ?? 'unit'} ✓`} value={`${u.expectedRows.toLocaleString()} rows`} />
          ))}
        </>
      )}
    </div>
  );
}
