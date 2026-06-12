'use client';

// OB-203 Phase 5 (D4) — the import surface as a state-machine OBSERVER (DS-027 §4.4).
// Polls the durable SessionStateView (Phase 3) and renders each unit's state live; a
// `failed_interpretation` unit HOLDS VISIBLY and carries the STANDING resolution action set:
//   view structural detail · retry comprehension · manually assign classification · exclude unit.
// Every action emits its outcome signal (Phase 4 vocabulary) — EPG-5.1. No action mutates durable
// state except through a signal endpoint (retry-unit / resolve-unit / interaction) — EPG-5.2.
//
// SCOPE (architect HALT-6 item 2): manual assign is CLASSIFICATION-LEVEL only; binding-level
// correction is Phase 6. Recognition provenance (Phase 2) renders on comprehended/classified rows.

import { useEffect, useState, useCallback } from 'react';
import type { SessionStateView, UnitStateView, UnitComprehensionState } from '@/lib/sci/comprehension-state-service';
import type { ContentUnitProposal, AgentType } from '@/lib/sci/sci-types';
import { setImportInteractionContext, captureImportInteraction, flushPendingImportInteractions } from '@/lib/sci/import-interaction-signals';

const STATE_LABEL: Record<UnitComprehensionState, string> = {
  persisted: 'Persisted', profiled: 'Profiled', recognized: 'Recognized', comprehended: 'Comprehended',
  classified: 'Classified', bound: 'Bound', failed_interpretation: 'Failed', resolved: 'Resolved',
};
const STATE_TONE: Record<UnitComprehensionState, string> = {
  persisted: 'bg-slate-100 text-slate-600', profiled: 'bg-slate-100 text-slate-600',
  recognized: 'bg-sky-100 text-sky-700', comprehended: 'bg-indigo-100 text-indigo-700',
  classified: 'bg-violet-100 text-violet-700', bound: 'bg-emerald-100 text-emerald-700',
  failed_interpretation: 'bg-rose-100 text-rose-700', resolved: 'bg-emerald-100 text-emerald-700',
};
const CLASSIFICATIONS: AgentType[] = ['entity', 'target', 'transaction', 'reference', 'plan'];

interface Props {
  tenantId: string;
  importSessionId: string;
  storagePaths?: Record<string, string>;
  contentUnits?: ContentUnitProposal[];   // for recognition provenance + the assign affordance
  pollMs?: number;
}

export function SessionStateLive({ tenantId, importSessionId, storagePaths, contentUnits, pollMs = 1500 }: Props) {
  const [view, setView] = useState<SessionStateView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);          // unitId currently acting
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const provenanceOf = (unitId: string) =>
    contentUnits?.find(c => c.contentUnitId === unitId)?.recognitionProvenance;

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(importSessionId)}`);
      if (res.ok) setView(await res.json());
    } catch { /* transient — next tick retries */ }
  }, [tenantId, importSessionId]);

  useEffect(() => {
    if (!tenantId || !importSessionId) return;
    setImportInteractionContext(tenantId, importSessionId);
    captureImportInteraction({ surface: 'session_state_live', action: 'view', dedupKey: `view:${importSessionId}` });
    return () => flushPendingImportInteractions();
  }, [tenantId, importSessionId]);

  useEffect(() => {
    if (!tenantId || !importSessionId) return;
    void poll();
    const id = setInterval(() => {
      setView(prev => { if (prev && !prev.isOpen) { clearInterval(id); return prev; } void poll(); return prev; });
    }, pollMs);
    return () => clearInterval(id);
  }, [poll, pollMs, tenantId, importSessionId]);

  // ── resolution actions (each routes through a signal endpoint — EPG-5.2) ──
  const viewDetail = (u: UnitStateView) => {
    const next = expanded === u.unitId ? null : u.unitId;
    setExpanded(next);
    if (next) captureImportInteraction({ surface: 'session_state_live', action: 'expand', unitId: u.unitId });
  };

  const retry = async (u: UnitStateView) => {
    const storagePath = storagePaths?.[u.unitId.split('::')[0]];
    if (!storagePath) return;
    captureImportInteraction({ surface: 'session_state_live', action: 'action_click', unitId: u.unitId, metadata: { control: 'retry' } });
    setBusy(u.unitId);
    try {
      await fetch('/api/import/sci/retry-unit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, importSessionId, storagePath, unitId: u.unitId }),
      });
      await poll();
    } finally { setBusy(null); }
  };

  const assign = async (u: UnitStateView, classification: AgentType) => {
    setAssigning(null);
    setBusy(u.unitId);
    try {
      await fetch('/api/import/sci/resolve-unit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, importSessionId, unitId: u.unitId, sheetName: u.sheetName, action: 'assign', classification }),
      });
      await poll();
    } finally { setBusy(null); }
  };

  const exclude = async (u: UnitStateView) => {
    setBusy(u.unitId);
    try {
      await fetch('/api/import/sci/resolve-unit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, importSessionId, unitId: u.unitId, sheetName: u.sheetName, action: 'exclude' }),
      });
      setExcluded(prev => new Set(prev).add(u.unitId));
    } finally { setBusy(null); }
  };

  if (!view || view.units.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Comprehension state</h3>
        <span className="text-xs text-slate-400">{view.isOpen ? 'live' : 'complete'}</span>
      </div>
      <ul className="space-y-2">
        {view.units.map(u => {
          const prov = provenanceOf(u.unitId);
          const isExcluded = excluded.has(u.unitId);
          const failed = u.state === 'failed_interpretation';
          return (
            <li key={u.unitId} className={`rounded border px-3 py-2 ${isExcluded ? 'opacity-40' : ''} ${failed ? 'border-rose-200 bg-rose-50/40' : 'border-slate-100'}`}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-slate-700">{u.sheetName ?? u.unitId}</span>
                <div className="flex items-center gap-2">
                  {prov && (u.state === 'comprehended' || u.state === 'classified' || u.state === 'bound') && (
                    <span className="text-[10px] text-slate-400" title="Atom recognition provenance">
                      {Math.round(prov.recognizedFraction * 100)}% atoms{prov.novelCount > 0 ? ` · ${prov.novelCount} new` : ''}{!prov.llmCalled ? ' · no LLM' : ''}
                    </span>
                  )}
                  {u.tier != null && u.state === 'recognized' && <span className="text-xs text-slate-400">Tier {u.tier}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_TONE[u.state]}`}>{STATE_LABEL[u.state]}</span>
                </div>
              </div>

              {/* Resolution action set — holds on failed_interpretation (DS-027 §4.4) */}
              {failed && !isExcluded && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => viewDetail(u)} className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">
                    {expanded === u.unitId ? 'Hide detail' : 'View detail'}
                  </button>
                  <button type="button" onClick={() => retry(u)} disabled={busy === u.unitId || !storagePaths?.[u.unitId.split('::')[0]]}
                    className="rounded border border-indigo-300 px-2 py-0.5 text-xs text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                    {busy === u.unitId ? '…' : 'Retry'}
                  </button>
                  <div className="relative inline-block">
                    <button type="button" onClick={() => setAssigning(assigning === u.unitId ? null : u.unitId)} disabled={busy === u.unitId}
                      className="rounded border border-violet-300 px-2 py-0.5 text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-50">
                      Assign ▾
                    </button>
                    {assigning === u.unitId && (
                      <div className="absolute z-10 mt-1 rounded border border-slate-200 bg-white shadow">
                        {CLASSIFICATIONS.map(c => (
                          <button key={c} type="button" onClick={() => assign(u, c)} className="block w-full px-3 py-1 text-left text-xs capitalize text-slate-700 hover:bg-violet-50">{c}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => exclude(u)} disabled={busy === u.unitId}
                    className="rounded border border-rose-300 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                    Exclude
                  </button>
                </div>
              )}

              {/* Structural detail panel (read-only) */}
              {expanded === u.unitId && (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded bg-slate-50 p-2 text-[11px] text-slate-600">
                  <dt className="text-slate-400">tier</dt><dd>{u.tier ?? '—'}</dd>
                  <dt className="text-slate-400">atoms known</dt><dd>{u.knownCount ?? '—'}</dd>
                  <dt className="text-slate-400">novel residue</dt><dd>{u.novelCount ?? '—'}</dd>
                  <dt className="text-slate-400">failure class</dt><dd>{u.failureClass ?? '—'}</dd>
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
