'use client';

// HF-360 (Part C) — the TRUTHFUL load surface. When an import HANDS OFF its loads to the pg_cron worker,
// the rows are STAGED, not in committed_data yet — so the completion screen must NOT say "0 imported". This
// polls /api/import/sci/pulse-load/state and tells the exact truth: "N rows staged across P pulses — loading
// X of Y", then "loaded", with honest terminal states + rollback/resume controls on failure. It reads the
// job (pulse_load_jobs), never tallies. On completion it calls onLoadComplete so the page fires the
// post-commit finalize (entity resolution reads committed_data — it must run AFTER the load, not at stage).

import { useCallback, useEffect, useRef, useState } from 'react';
import { pollDecision, newPollState, type PollOutcome } from '@/lib/sci/poll-discipline';

interface SessionLoadState {
  sessionId: string;
  status: 'enqueued' | 'loading' | 'complete' | 'failed' | 'rolled_back' | 'empty';
  rowsLoaded: number;
  rowsTotal: number;
  pulsesLoaded: number;
  pulsesTotal: number;
  jobs: Array<{ id: string; status: string; cursor: number; totalPulses: number; rowsLoaded: number; totalRows: number; fileName: string; errorDetail: string | null }>;
}

const BASE_MS = 2500;

export function PulseLoadProgress({
  tenantId,
  sessionId,
  onLoadComplete,
}: {
  tenantId: string;
  sessionId: string;
  /** fired ONCE when the worker has loaded every pulse — the page then runs post-commit finalize. */
  onLoadComplete: (rowsLoaded: number) => void;
}) {
  const [st, setSt] = useState<SessionLoadState | null>(null);
  const [acting, setActing] = useState<null | 'rollback' | 'resume'>(null);
  const [rolledBack, setRolledBack] = useState(false);
  const firedComplete = useRef(false);
  const onComplete = useRef(onLoadComplete);
  onComplete.current = onLoadComplete;

  // Self-scheduling poll with discipline: pause when the tab is hidden (HF-347), stop on a terminal status
  // or a 401/5xx streak (HF-356 I8). Re-armed when an action (resume) changes the world.
  const pollEpoch = useRef(0);
  useEffect(() => {
    if (!tenantId || !sessionId) return;
    const myEpoch = ++pollEpoch.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pollState = newPollState();
    const stop = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };

    const tick = async () => {
      if (cancelled || myEpoch !== pollEpoch.current) return;
      if (typeof document !== 'undefined' && document.hidden) { timer = setTimeout(tick, BASE_MS); return; } // visibility-pause
      let outcome: PollOutcome = { ok: false, networkError: true };
      try {
        const r = await fetch(`/api/import/sci/pulse-load/state?tenantId=${encodeURIComponent(tenantId)}&sessionId=${encodeURIComponent(sessionId)}`);
        outcome = { ok: r.ok, status: r.status };
        if (r.ok && !cancelled) {
          const data = (await r.json()) as SessionLoadState;
          setSt(data);
          if (data.status === 'complete' && !firedComplete.current) {
            firedComplete.current = true;
            onComplete.current(data.rowsLoaded);
            stop();
            return;
          }
          if (data.status === 'rolled_back') { stop(); return; }
          // 'failed' keeps polling stopped until the user acts (resume re-arms the effect).
          if (data.status === 'failed') { stop(); return; }
        }
      } catch { /* network drop — counted toward the give-up cap */ }
      if (cancelled || myEpoch !== pollEpoch.current) return;
      const verdict = pollDecision(pollState, outcome, BASE_MS);
      if (verdict.action === 'stop') { stop(); return; }
      timer = setTimeout(tick, verdict.delayMs);
    };
    void tick();
    return () => { cancelled = true; stop(); };
  }, [tenantId, sessionId, acting]); // acting bump re-arms after resume

  const doRollback = useCallback(async () => {
    if (!confirm('Roll back this import? Every row loaded so far AND the staged pulses will be deleted. This cannot be undone.')) return;
    setActing('rollback');
    try {
      const r = await fetch('/api/import/sci/pulse-load/rollback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, sessionId }),
      });
      if (r.ok) setRolledBack(true);
    } finally { setActing(null); }
  }, [tenantId, sessionId]);

  const doResume = useCallback(async () => {
    setActing('resume');
    try {
      await fetch('/api/import/sci/pulse-load/resume', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, sessionId }),
      });
      firedComplete.current = false; // allow completion to fire after the resumed load finishes
    } finally { setActing(null); } // setActing change re-arms the poll effect
  }, [tenantId, sessionId]);

  if (rolledBack) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-900/50 px-5 py-4">
        <p className="text-sm font-medium text-zinc-200">Import rolled back</p>
        <p className="mt-1 text-xs text-zinc-500">All loaded and staged rows for this import were removed. You can re-import the file.</p>
      </div>
    );
  }
  if (!st || st.status === 'empty') return null;

  const pct = st.rowsTotal > 0 ? Math.round((st.rowsLoaded / st.rowsTotal) * 100) : 0;
  const failed = st.status === 'failed';
  const complete = st.status === 'complete';
  const failedDetail = st.jobs.find((j) => j.status === 'failed')?.errorDetail ?? null;

  // Full static class strings (Tailwind JIT cannot see dynamically-built names).
  const tone = complete
    ? { label: 'text-emerald-400', num: 'text-emerald-300', sub: 'text-emerald-400/70', bar: 'bg-emerald-500' }
    : failed
      ? { label: 'text-red-400', num: 'text-red-300', sub: 'text-red-400/70', bar: 'bg-red-500' }
      : { label: 'text-sky-400', num: 'text-sky-300', sub: 'text-sky-400/70', bar: 'bg-sky-500' };

  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900/70 to-zinc-900/30 px-5 py-4">
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${tone.label}`}>
          {complete ? 'Loaded' : failed ? 'Load interrupted' : 'Loading into your records'}
        </span>
        <span className="text-[10px] tabular-nums text-zinc-600">
          {st.pulsesLoaded} / {st.pulsesTotal} pulses
        </span>
      </div>

      {/* The headline TRUTH: staged → loading X of Y → loaded. Never "0 imported". */}
      <div className="flex items-end gap-2.5">
        <span className={`text-3xl font-light tabular-nums ${tone.num} leading-none`}>{st.rowsLoaded.toLocaleString()}</span>
        <span className={`text-xs ${tone.sub} pb-0.5`}>of {st.rowsTotal.toLocaleString()} rows loaded</span>
        <span className="ml-auto pb-1 text-right text-[11px] leading-tight text-zinc-500 max-w-[55%]">
          {complete
            ? 'every staged pulse landed in your records'
            : failed
              ? 'some pulses are loaded; the rest are staged and safe — resume or roll back'
              : `${st.rowsTotal.toLocaleString()} rows staged across ${st.pulsesTotal} pulses — loading on the database, off the browser`}
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${tone.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>

      {failed && (
        <div className="mt-3">
          {failedDetail && <p className="mb-2 text-[11px] text-red-300/80">{failedDetail}</p>}
          <div className="flex gap-2">
            <button
              onClick={doResume}
              disabled={acting !== null}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {acting === 'resume' ? 'Resuming…' : 'Resume loading'}
            </button>
            <button
              onClick={doRollback}
              disabled={acting !== null}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              {acting === 'rollback' ? 'Rolling back…' : 'Roll back'}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">Resume continues from where the load stopped (no row is loaded twice). Roll back removes everything this import staged.</p>
        </div>
      )}
    </div>
  );
}
