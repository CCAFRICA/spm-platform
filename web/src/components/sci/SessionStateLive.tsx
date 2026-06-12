'use client';

// OB-203 Phase 3 (R2) — live unit-comprehension state on the import surface.
// Polls GET /api/import/sci/session-state (the durable signal surface, rebuilt) and renders
// each unit's state as it progresses; a failed unit is retryable WITHOUT re-ingestion
// (POST /api/import/sci/retry-unit re-runs the same decomposed dispatch). This is the minimal
// resolution affordance; the full action set is Phase 5, which consumes the same SessionStateView.

import { useEffect, useState, useCallback } from 'react';
import type { SessionStateView, UnitStateView, UnitComprehensionState } from '@/lib/sci/comprehension-state-service';
// OB-203 Phase 4 (R3): interaction capture (no visible UI change; Phase 5 consumes the same hooks).
import { setImportInteractionContext, captureImportInteraction, flushPendingImportInteractions } from '@/lib/sci/import-interaction-signals';

const STATE_LABEL: Record<UnitComprehensionState, string> = {
  persisted: 'Persisted',
  profiled: 'Profiled',
  recognized: 'Recognized',
  comprehended: 'Comprehended',
  classified: 'Classified',
  bound: 'Bound',
  failed_interpretation: 'Failed',
  resolved: 'Resolved',
};

const STATE_TONE: Record<UnitComprehensionState, string> = {
  persisted: 'bg-slate-100 text-slate-600',
  profiled: 'bg-slate-100 text-slate-600',
  recognized: 'bg-sky-100 text-sky-700',
  comprehended: 'bg-indigo-100 text-indigo-700',
  classified: 'bg-violet-100 text-violet-700',
  bound: 'bg-emerald-100 text-emerald-700',
  failed_interpretation: 'bg-rose-100 text-rose-700',
  resolved: 'bg-emerald-100 text-emerald-700',
};

interface Props {
  tenantId: string;
  importSessionId: string;
  storagePaths?: Record<string, string>;
  pollMs?: number;
}

export function SessionStateLive({ tenantId, importSessionId, storagePaths, pollMs = 1500 }: Props) {
  const [view, setView] = useState<SessionStateView | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(importSessionId)}`);
      if (res.ok) setView(await res.json());
    } catch {
      /* transient poll failure is non-fatal — next tick retries */
    }
  }, [tenantId, importSessionId]);

  // R3: bind the interaction session + flush captures on unmount.
  useEffect(() => {
    if (!tenantId || !importSessionId) return;
    setImportInteractionContext(tenantId, importSessionId);
    captureImportInteraction({ surface: 'session_state_live', action: 'view', dedupKey: `view:${importSessionId}` });
    return () => flushPendingImportInteractions();
  }, [tenantId, importSessionId]);

  useEffect(() => {
    if (!tenantId || !importSessionId) return;
    void poll();
    // keep polling while the session is open; stop once every unit is terminal
    const id = setInterval(() => {
      setView(prev => {
        if (prev && !prev.isOpen) { clearInterval(id); return prev; }
        void poll();
        return prev;
      });
    }, pollMs);
    return () => clearInterval(id);
  }, [poll, pollMs, tenantId, importSessionId]);

  const retry = async (u: UnitStateView) => {
    const fileName = u.unitId.split('::')[0];
    const storagePath = storagePaths?.[fileName];
    if (!storagePath) return;
    captureImportInteraction({ surface: 'session_state_live', action: 'action_click', unitId: u.unitId, metadata: { control: 'retry' } });
    setRetrying(u.unitId);
    try {
      await fetch('/api/import/sci/retry-unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, importSessionId, storagePath, unitId: u.unitId }),
      });
      await poll();
    } finally {
      setRetrying(null);
    }
  };

  if (!view || view.units.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Comprehension state</h3>
        <span className="text-xs text-slate-400">{view.isOpen ? 'live' : 'complete'}</span>
      </div>
      <ul className="space-y-2">
        {view.units.map(u => (
          <li key={u.unitId} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium text-slate-700">{u.sheetName ?? u.unitId}</span>
            <div className="flex items-center gap-2">
              {u.tier != null && u.state === 'recognized' && (
                <span className="text-xs text-slate-400">Tier {u.tier}</span>
              )}
              {u.novelCount != null && (
                <span className="text-xs text-slate-400">{u.novelCount} novel</span>
              )}
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_TONE[u.state]}`}>
                {STATE_LABEL[u.state]}
              </span>
              {u.retryable && (
                <button
                  type="button"
                  onClick={() => retry(u)}
                  disabled={retrying === u.unitId || !storagePaths?.[u.unitId.split('::')[0]]}
                  className="rounded border border-rose-300 px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  {retrying === u.unitId ? 'Retrying…' : 'Retry'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
