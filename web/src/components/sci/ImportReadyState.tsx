'use client';

// SCI ImportReadyState — Post-import summary + Calculate bridge.
// OB-203 Phase 5 (D10): the completion screen tells the TRUTH about the session — it renders the FULL
// unit set from the durable SessionStateView read (imported / excluded / failed–unresolved), not just
// the committed subset; and context-dependent panels (components / plan) are suppressed when no plan
// exists rather than rendering as placeholders, with a plan-aware next action. Same durable read, no
// new surface. Zero domain vocabulary. Korean Test applies.

import { useEffect, useState } from 'react';
import { Check, XCircle, ArrowRight, Upload, AlertTriangle, RotateCcw, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentType, ContentUnitResult } from '@/lib/sci/sci-types';
import type { SessionStateView, UnitStateView, ImportTelemetry } from '@/lib/sci/comprehension-state-service';

const CLASSIFICATION_LABELS: Record<AgentType, string> = {
  plan: 'Plan Rules', entity: 'Team Roster', target: 'Perf. Targets', transaction: 'Transaction Data', reference: 'Reference Data',
};

interface ImportReadyStateProps {
  results: ContentUnitResult[];
  totalRowsCommitted: number;
  tenantId?: string;
  importSessionId?: string;
  entityCount?: number;
  planName?: string;
  componentCount?: number;
  sourceDateRange?: { min: string; max: string } | null;
  onNavigateToCalculate: () => void;
  onImportMore: () => void;
  onRetryFailed?: () => void;
}

type Disposition = 'imported' | 'failed' | 'excluded' | 'resolved';
interface CompletionRow { key: string; sheetName: string; disposition: Disposition; rows: number; classification?: AgentType; reason?: string | null; }

function Conclusion({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-0.5">
      <p className="text-sm text-zinc-200 tabular-nums">{value}</p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}

const sheetOf = (id: string) => id.split('::')[1] || id;

export function ImportReadyState({
  results, totalRowsCommitted, tenantId, importSessionId, planName, componentCount, sourceDateRange,
  onNavigateToCalculate, onImportMore, onRetryFailed,
}: ImportReadyStateProps) {
  const [sessionUnits, setSessionUnits] = useState<UnitStateView[] | null>(null);
  const [telemetry, setTelemetry] = useState<ImportTelemetry | null>(null);

  // D10/D18: read the full unit set AND the final telemetry from the durable surface (?telemetry=1). This
  // is the ONLY source — never the execute response (which died at Vercel's 300s cap in run-5 while the
  // server kept committing). The completion screen renders the truth: what the DB actually holds.
  useEffect(() => {
    if (!tenantId || !importSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(importSessionId)}&telemetry=1`);
        if (res.ok && !cancelled) {
          const view = (await res.json()) as SessionStateView & { telemetry?: ImportTelemetry };
          setSessionUnits(view.units);
          if (view.telemetry) setTelemetry(view.telemetry);
        }
      } catch { /* graceful degradation to results-only below */ }
    })();
    return () => { cancelled = true; };
  }, [tenantId, importSessionId]);

  // D18: per-unit committed rows come from the durable telemetry (keyed by sheet), not the dead response.
  const telRowsBySheet = new Map((telemetry?.perUnit ?? []).map(p => [p.sheetName, p.expectedRows]));
  // D18: the authoritative "records imported" is the durable row count, not the response-scoped prop.
  const committedRows = telemetry ? telemetry.rows.committed : totalRowsCommitted;

  // Rows + commit-failures from the execute results (keyed by sheet).
  const resultBySheet = new Map(results.map(r => [sheetOf(r.contentUnitId), r]));

  // Build the truthful unit list: prefer the durable session set; fall back to results when absent.
  const rows: CompletionRow[] = sessionUnits
    ? sessionUnits.map(u => {
        const r = resultBySheet.get(sheetOf(u.unitId));
        let disposition: Disposition;
        if (u.state === 'bound' || (r && r.success)) disposition = 'imported';
        else if (u.state === 'failed_interpretation') disposition = 'failed';
        else if (u.state === 'resolved') disposition = 'resolved';
        else disposition = 'excluded';
        // D18: rows from durable telemetry (by sheet); reason persists from the spine's failureClass.
        const sheetName = u.sheetName ?? sheetOf(u.unitId);
        return { key: u.unitId, sheetName, disposition, rows: telRowsBySheet.get(sheetName) ?? r?.rowsProcessed ?? 0, classification: (r?.classification ?? u.classification ?? undefined) as AgentType | undefined, reason: u.failureClass };
      })
    : results.map(r => ({ key: r.contentUnitId, sheetName: sheetOf(r.contentUnitId), disposition: (r.success ? 'imported' : 'failed') as Disposition, rows: r.rowsProcessed, classification: r.classification }));

  const importedRows = rows.filter(r => r.disposition === 'imported');
  const notImportedRows = rows.filter(r => r.disposition !== 'imported');
  const total = rows.length;
  const importedCount = importedRows.length;

  const hasPlan = !!planName;
  const hasData = committedRows > 0;
  const calculateReady = hasData && hasPlan;

  const title = notImportedRows.length > 0
    ? `Import complete — ${importedCount} of ${total} units imported`
    : 'Import Complete';

  const DISPO_CHIP: Record<Exclude<Disposition, 'imported'>, { label: string; cls: string }> = {
    failed: { label: 'failed — unresolved', cls: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
    excluded: { label: 'excluded', cls: 'border-zinc-600 bg-zinc-700/30 text-zinc-400' },
    resolved: { label: 'resolved — not committed', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-6">
        <div className="flex items-center gap-2 mb-6">
          {notImportedRows.length > 0 ? <AlertTriangle className="w-5 h-5 text-amber-400" /> : <Check className="w-5 h-5 text-emerald-400" />}
          <h2 className="text-base font-medium text-zinc-100">{title}</h2>
        </div>

        {/* Stat boxes — Components shown only when a plan exists (D10.2: no placeholder) */}
        <div className={cn('grid gap-6 mb-6', hasPlan ? (sourceDateRange ? 'grid-cols-3' : 'grid-cols-2') : (sourceDateRange ? 'grid-cols-2' : 'grid-cols-1'))}>
          <div className="text-center">
            <p className="text-2xl text-zinc-100 font-light tabular-nums">{committedRows.toLocaleString()}</p>
            <p className="text-xs text-zinc-500 mt-1">Records imported</p>
          </div>
          {sourceDateRange && (
            <div className="text-center">
              <p className="text-lg text-zinc-100 font-light">{sourceDateRange.min} — {sourceDateRange.max}</p>
              <p className="text-xs text-zinc-500 mt-1">Source date range</p>
            </div>
          )}
          {hasPlan && (
            <div className="text-center">
              <p className="text-2xl text-zinc-100 font-light tabular-nums">{componentCount != null ? componentCount.toString() : '—'}</p>
              <p className="text-xs text-zinc-500 mt-1">Components</p>
            </div>
          )}
        </div>

        {/* Context — Plan row only when a plan exists (D10.2) */}
        {(hasPlan || sourceDateRange) && (
          <>
            <div className="h-px bg-zinc-800 mb-6" />
            <div className="space-y-2.5 mb-6">
              {hasPlan && (
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-zinc-500">Plan</span>
                  <span className="text-sm text-zinc-200">{planName}</span>
                </div>
              )}
              {sourceDateRange && (
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-zinc-500">Source dates</span>
                  <span className="text-sm text-zinc-200">{sourceDateRange.min} through {sourceDateRange.max}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Session summary (truthful) */}
        <div className="h-px bg-zinc-800 mb-6" />
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
          Session — {importedCount} of {total} units imported · {committedRows.toLocaleString()} rows
          {notImportedRows.length > 0 && ` · ${notImportedRows.length} not imported`}
        </p>
        <div className="space-y-0.5">
          {importedRows.map(r => (
            <div key={r.key} className="flex items-center gap-3 px-3 py-2 rounded-lg">
              <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Check className="w-2.5 h-2.5 text-emerald-400" />
              </div>
              <span className="text-sm text-zinc-300 flex-1 min-w-0 truncate">{r.sheetName}</span>
              {r.classification && <span className="text-xs text-zinc-600 flex-shrink-0">{CLASSIFICATION_LABELS[r.classification]}</span>}
              <span className="text-xs text-zinc-500 tabular-nums w-20 text-right flex-shrink-0">{r.rows > 0 ? `${r.rows.toLocaleString()} rows` : 'Acknowledged'}</span>
            </div>
          ))}
          {/* D10.1: excluded / failed units MUST appear — the user's decision is not erased */}
          {notImportedRows.map(r => {
            const chip = DISPO_CHIP[r.disposition as Exclude<Disposition, 'imported'>];
            return (
              <div key={r.key} className="px-3 py-2 rounded-lg opacity-70">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-zinc-600/20 flex items-center justify-center flex-shrink-0">
                    {r.disposition === 'failed' ? <XCircle className="w-2.5 h-2.5 text-rose-400" /> : <MinusCircle className="w-2.5 h-2.5 text-zinc-400" />}
                  </div>
                  <span className={cn('text-sm flex-1 min-w-0 truncate', r.disposition === 'excluded' ? 'text-zinc-500 line-through' : 'text-zinc-400')}>{r.sheetName}</span>
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border flex-shrink-0', chip.cls)}>{chip.label}</span>
                  <span className="text-xs text-zinc-600 tabular-nums w-20 text-right flex-shrink-0">not committed</span>
                </div>
                {/* D18: the failure REASON persists — the story is not erased ("plan interpretation found zero components"). */}
                {r.reason && <p className="text-[11px] text-zinc-500 mt-1 ml-7">{r.reason.replace(/_/g, ' ')}</p>}
              </div>
            );
          })}
        </div>

        {/* D18 conclusion summary: the final telemetry persists on the screen — the platform's work, durable. */}
        {telemetry && (
          <>
            <div className="h-px bg-zinc-800 my-6" />
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">What the platform did</p>
            <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              <Conclusion label="Rows committed" value={telemetry.rows.committed.toLocaleString()} />
              <Conclusion label="Pulses" value={`${telemetry.pulses.committed} / ${telemetry.pulses.total}`} />
              <Conclusion label="Atoms learned (novel)" value={telemetry.atoms.novelComprehended.toLocaleString()} />
              <Conclusion label="Atoms from memory" value={telemetry.atoms.claimedFromMemory.toLocaleString()} />
              <Conclusion label="LLM calls made / bypassed" value={`${telemetry.llm.made} / ${telemetry.llm.bypassedByMemory}`} />
              <Conclusion label="Signals captured" value={telemetry.totalSignalsWritten.toLocaleString()} />
            </div>
          </>
        )}

        {results.some(r => !r.success) && onRetryFailed && (
          <div className="mt-4">
            <button onClick={onRetryFailed} className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Retry failed items
            </button>
          </div>
        )}
      </div>

      {/* Actions — plan-aware (D10.2) */}
      <div className="flex items-center justify-between">
        <button onClick={onImportMore} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 transition-colors">
          <Upload className="w-4 h-4" /> Import more data
        </button>
        {hasPlan && (
          <button onClick={onNavigateToCalculate} disabled={!calculateReady}
            className={cn('flex items-center gap-2 px-5 py-2 rounded-lg font-medium text-sm transition-colors',
              calculateReady ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed')}>
            Go to Calculate <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Guidance — plan-aware next action (D10.2) */}
      <div className="text-xs text-zinc-500 text-center">
        {!hasData
          ? 'No data imported. Import data to enable calculation.'
          : !hasPlan
            ? 'Imported data is saved. A plan is needed before calculation — configure one to continue.'
            : 'Import complete. Go to Calculate to run calculations, or import additional data.'}
      </div>
    </div>
  );
}
