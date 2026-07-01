'use client';

// SCI Proposal — DS-006 v2 + OB-203 Phase 5 (D4 observer, D7/D8 fixes).
// ONE surface: each unit is a card whose live comprehension state derives from the SAME durable
// SessionStateView read (poll). A failed_interpretation unit HOLDS on its card with the four
// resolution actions (view detail / retry / assign / exclude). No separate state panel, no parallel
// listing (D7). Import proceeds with any non-empty selection; failed/excluded units simply don't
// commit; the button reflects the subset (D8). Zero domain vocabulary. Korean Test applies.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import type {
  SCIProposal as SCIProposalType,
  ContentUnitProposal,
  AgentType,
} from '@/lib/sci/sci-types';
import type { ParsedFileData } from '@/components/sci/SCIUpload';
import type { SessionStateView, UnitStateView, UnitComprehensionState } from '@/lib/sci/comprehension-state-service';
import { allUnitsSettled } from '@/lib/sci/comprehension-state-service';
import { setImportInteractionContext, captureImportInteraction, flushPendingImportInteractions } from '@/lib/sci/import-interaction-signals';
// HF-356 (I8): poll discipline — 401 stops + shows a message, 5xx streak backs off then gives up, unmount cancels.
import { pollDecision, newPollState, type PollOutcome } from '@/lib/sci/poll-discipline';

const BADGE_STYLES: Record<string, string> = {
  entity: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  transaction: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  target: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  plan: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  reference: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

function VerdictBadge({ classification }: { classification: AgentType }) {
  const isVialuce = useIsVialuce(); // HF-315: classification badge → design-spec .pill under Vialuce
  if (isVialuce) {
    return <span className="pill open">{classification}</span>;
  }
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
      BADGE_STYLES[classification] || 'bg-red-500/15 text-red-400 border-red-500/30'
    )}>
      {classification}
    </span>
  );
}

// Live comprehension-state chip (derives from the durable SessionStateView). Shown for the
// states that matter on the proposal surface; the classification badge carries the happy path.
const STATE_CHIP: Partial<Record<UnitComprehensionState, string>> = {
  failed_interpretation: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  bound: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};
const STATE_LABEL: Partial<Record<UnitComprehensionState, string>> = {
  failed_interpretation: 'Failed', resolved: 'Resolved', bound: 'Imported',
};

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-500 w-8 tabular-nums">{pct}%</span>
    </div>
  );
}

const CLASSIFICATIONS: AgentType[] = ['entity', 'target', 'transaction', 'reference', 'plan'];

// ============================================================
// CONTENT UNIT CARD — collapsed + expanded; live state + resolution actions
// ============================================================

interface ContentUnitCardProps {
  unit: ContentUnitProposal;
  originalClassification?: AgentType;
  rowCount: number;
  liveState?: UnitStateView;
  isFailed: boolean;
  isExcluded: boolean;
  isConfirmed: boolean;
  busy: boolean;
  canRetry: boolean;
  onToggleConfirm: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onChangeClassification: (newType: AgentType) => void;
  onRetry: () => void;
  onAssign: (c: AgentType) => void;
  onExclude: () => void;
}

function ContentUnitCard({
  unit, originalClassification, rowCount, liveState, isFailed, isExcluded, isConfirmed, busy, canRetry,
  onToggleConfirm, isExpanded, onToggleExpand, onChangeClassification, onRetry, onAssign, onExclude,
}: ContentUnitCardProps) {
  const isVialuce = useIsVialuce(); // HF-315: each content unit → design-spec .card; state/verdict chips → .pill
  const isOverridden = originalClassification != null && originalClassification !== unit.classification;
  const [showClassMenu, setShowClassMenu] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const hasCloseScores = unit.allScores?.some(s => s.agent !== unit.classification && s.confidence > unit.confidence - 0.15);
  const isSplit = unit.claimType === 'PARTIAL';
  const needsReview = unit.confidence < 0.6 || (unit.warnings?.length || 0) > 0;
  const displayBindings = unit.fieldBindings?.filter(b => b.semanticRole !== 'unknown' || b.displayContext) || [];
  const isDocPlan = unit.classification === 'plan' && !!unit.documentMetadata;
  const stateKey = liveState?.state;

  // HF-370 (O4): the model's per-column recognition (what each column was recognized AS) — the atom
  // signal information the operator inspects at completion. Read directly from the classification
  // trace's header comprehension (Decision 158: surface the model's structured recognition, do not
  // re-derive). Empty when the trace carries no interpretations.
  const columnRecognition: Array<{ col: string; scope: string; nature: string; conf: number }> = (() => {
    const hc = (unit.classificationTrace as { headerComprehension?: { interpretations?: Record<string, { scope_role?: string; nature_role?: string; data_nature?: string; confidence?: number }> } } | undefined)?.headerComprehension?.interpretations;
    if (!hc) return [];
    return Object.entries(hc).map(([col, i]) => ({
      col,
      scope: i.scope_role || '—',
      nature: i.nature_role || (i.data_nature ? '(prose only)' : '—'),
      conf: typeof i.confidence === 'number' ? i.confidence : 0,
    }));
  })();

  // HF-341 R6: the workbook-graph structural role cross-check is removed (the graph was a
  // structural classifier; classification is now expression-derived). No graphEvidence chip.

  return (
    <div
      className={isVialuce ? 'card' : cn(
        'border rounded-lg transition-colors',
        isExcluded ? 'border-zinc-800/50 opacity-40' :
        isFailed ? 'border-rose-700/40 bg-rose-950/15' :
        needsReview && !isConfirmed ? 'border-amber-500/30 bg-amber-500/5' :
        isConfirmed ? 'border-emerald-500/30 bg-emerald-500/5' :
        'border-zinc-700/50'
      )}
      style={isVialuce ? {
        marginTop: 0,
        padding: 0,
        overflow: 'hidden',
        ...(isExcluded ? { opacity: 0.5 } : {}),
        ...(isFailed ? { borderLeft: '3px solid var(--vl-danger)' } :
          needsReview && !isConfirmed ? { borderLeft: '3px solid var(--vialuce-gold)' } :
          isConfirmed ? { borderLeft: '3px solid var(--vl-success)' } : {}),
      } : undefined}
    >
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggleExpand}>
        {/* Checkbox — only confirmable (non-failed, non-excluded) units */}
        <input
          type="checkbox"
          checked={isConfirmed}
          disabled={isFailed || isExcluded}
          onChange={(e) => { e.stopPropagation(); onToggleConfirm(); }}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 flex-shrink-0 disabled:opacity-40"
        />

        <span className={cn('text-sm font-medium min-w-[140px] truncate', isExcluded ? 'text-zinc-500 line-through' : 'text-zinc-200')}>
          {isDocPlan ? unit.sourceFile : unit.tabName}
          {!isDocPlan && unit.sourceFile && unit.sourceFile !== unit.tabName && (
            <span className="text-zinc-500 font-normal text-xs ml-1.5 no-underline">{unit.sourceFile.replace(/^\d+_\d+_[a-f0-9]{8}_/, '')}</span>
          )}
        </span>

        {/* D9a: in-progress chip while an action reprocesses (busy until the durable read returns) */}
        {busy ? (
          isVialuce ? (
            <span className="pill open">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
              Processing…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-indigo-400 border-t-transparent" />
              Processing…
            </span>
          )
        ) : isExcluded ? (
          /* D9b: excluded units stay in the list with explicit excluded treatment */
          isVialuce
            ? <span className="pill neutral">Excluded</span>
            : <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border border-zinc-600 bg-zinc-700/30 text-zinc-400">Excluded</span>
        ) : (
          <>
            {stateKey && STATE_CHIP[stateKey] && (
              isVialuce
                ? <span className={cn('pill', stateKey === 'failed_interpretation' ? 'danger' : 'success')}>{STATE_LABEL[stateKey]}</span>
                : <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border', STATE_CHIP[stateKey])}>{STATE_LABEL[stateKey]}</span>
            )}
            {!isFailed && <VerdictBadge classification={unit.classification} />}
            {!isFailed && isOverridden && <span className="text-[10px] text-amber-400/70 font-medium">(was {originalClassification})</span>}
          </>
        )}

        {unit.recognitionProvenance && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20" title="Atom recognition provenance">
            {Math.round(unit.recognitionProvenance.recognizedFraction * 100)}% atoms
            {unit.recognitionProvenance.novelCount > 0 ? ` · ${unit.recognitionProvenance.novelCount} new` : ''}
            {!unit.recognitionProvenance.llmCalled ? ' · no LLM' : ''}
          </span>
        )}

        {/* HF-370 (O4): tier + resolver telemetry on EVERY unit (was previously visible only in the
            failed-unit detail panel). Tier-1 = recognized from the sheet flywheel (no LLM); Tier-3 =
            fresh comprehension (LLM). Surfaces the model→memory boundary to the operator live. */}
        {(liveState?.tier ?? unit.recognitionTier) != null && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-300/80 border border-indigo-500/20" title="Recognition tier · resolver (flywheel memory vs fresh LLM)">
            Tier-{liveState?.tier ?? unit.recognitionTier}
            {' · '}{(unit.recognitionProvenance ? !unit.recognitionProvenance.llmCalled : (liveState?.tier ?? unit.recognitionTier) === 1) ? 'flywheel' : 'LLM'}
            {typeof liveState?.knownCount === 'number' ? ` · ${liveState.knownCount} known` : ''}
          </span>
        )}

        <span className="text-xs text-zinc-500 flex-1 truncate">
          {isFailed ? `Could not interpret — ${(liveState?.failureClass ?? unit.failedInterpretation?.failureClass ?? 'failed').replace(/_/g, ' ')}` : (unit.verdictSummary || unit.reasoning)}
        </span>

        {rowCount > 0 && <span className="text-xs text-zinc-600 whitespace-nowrap">{rowCount.toLocaleString()} rows</span>}
        {!isFailed && <ConfidenceBar confidence={unit.confidence} />}
        <ChevronDown className={cn('w-4 h-4 text-zinc-500 transition-transform flex-shrink-0', isExpanded && 'rotate-180')} />
      </div>

      {/* Resolution action set — HOLDS on the failed card (DS-027 §4.4) */}
      {isFailed && !isExcluded && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3" onClick={e => e.stopPropagation()}>
          <button type="button" onClick={onToggleExpand} className={isVialuce ? 'btn-sec' : 'rounded border border-zinc-600 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800'}>
            {isExpanded ? 'Hide detail' : 'View detail'}
          </button>
          <button type="button" onClick={onRetry} disabled={busy || !canRetry} className={isVialuce ? 'btn-pri' : 'rounded border border-indigo-500/40 px-2 py-0.5 text-xs text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-40'} style={isVialuce && (busy || !canRetry) ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>
            {busy ? '…' : 'Retry'}
          </button>
          <div className="relative inline-block">
            <button type="button" onClick={() => setShowAssign(!showAssign)} disabled={busy} className={isVialuce ? 'btn-sec' : 'rounded border border-violet-500/40 px-2 py-0.5 text-xs text-violet-300 hover:bg-violet-500/10 disabled:opacity-40'} style={isVialuce && busy ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>
              Assign ▾
            </button>
            {showAssign && (
              <div className={isVialuce ? 'card' : 'absolute left-0 z-50 mt-1 rounded border border-zinc-700 bg-zinc-800 shadow-xl'} style={isVialuce ? { position: 'absolute', left: 0, zIndex: 50, marginTop: 4, padding: 4, minWidth: 120 } : undefined}>
                {CLASSIFICATIONS.map(c => (
                  isVialuce
                    ? <button key={c} type="button" onClick={() => { setShowAssign(false); onAssign(c); }} style={{ display: 'block', width: '100%', padding: '6px 10px', textAlign: 'left', fontSize: '12px', textTransform: 'capitalize', color: 'var(--vl-text)', background: 'none', border: 'none', borderRadius: 'var(--vl-r-sm)', cursor: 'pointer' }}>{c}</button>
                    : <button key={c} type="button" onClick={() => { setShowAssign(false); onAssign(c); }} className="block w-full px-3 py-1.5 text-left text-xs capitalize text-zinc-200 hover:bg-violet-500/10">{c}</button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={onExclude} disabled={busy} className={isVialuce ? 'iact del' : 'rounded border border-rose-500/40 px-2 py-0.5 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-40'} style={isVialuce ? { width: 'auto', padding: '0 12px', height: 34, fontSize: '12.5px', ...(busy ? { opacity: 0.4, cursor: 'not-allowed' } : {}) } : undefined}>
            Exclude
          </button>
        </div>
      )}

      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-zinc-800/50 space-y-4">
          {isFailed && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded bg-zinc-900/60 p-2 text-[11px] text-zinc-400">
              <dt className="text-zinc-500">state</dt><dd>{liveState?.state ?? 'failed_interpretation'}</dd>
              <dt className="text-zinc-500">failure class</dt><dd>{liveState?.failureClass ?? unit.failedInterpretation?.failureClass ?? '—'}</dd>
              <dt className="text-zinc-500">tier</dt><dd>{liveState?.tier ?? '—'}</dd>
              <dt className="text-zinc-500">novel residue</dt><dd>{liveState?.novelCount ?? '—'}</dd>
            </dl>
          )}

          <p className="text-xs text-zinc-500">
            {rowCount > 0 ? `${rowCount.toLocaleString()} rows` : 'Rows unknown'}
            {displayBindings.length > 0 && ` x ${displayBindings.length} columns`}
            {displayBindings.length > 0 && ` — ${displayBindings.slice(0, 3).map(b => b.sourceField).join(', ')}...`}
          </p>

          {((unit.observations?.length || 0) > 0 || displayBindings.length > 0) && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Observations</h4>
              <div className="space-y-1.5">
                {(unit.observations || [])
                  .filter(obs => !/repeat ratio|composite signature|identifierRepeat|numericFieldRatio/i.test(obs))
                  .map((obs, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-zinc-400"><span className="text-zinc-600 mt-0.5">&bull;</span><span>{obs}</span></div>
                  ))}
                {displayBindings.slice(0, 6).map((b, i) => (
                  <div key={`fb-${i}`} className="flex items-center gap-2 text-sm text-zinc-400">
                    <span className="text-indigo-400/50">&bull;</span>
                    <code className="text-xs bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-300">{b.sourceField}</code>
                    <span className="text-zinc-600">&rarr;</span>
                    <span className="text-zinc-400">{b.displayLabel || b.semanticRole}</span>
                    <span className="text-xs text-zinc-600">({Math.round(b.confidence * 100)}%)</span>
                  </div>
                ))}
                {displayBindings.length > 6 && <p className="text-xs text-zinc-600 pl-4">+ {displayBindings.length - 6} more fields</p>}
              </div>
            </div>
          )}

          {/* HF-370 (O4): per-column recognition — the model's bare scope_role / nature_role for each
              column (the atom/signal info restored to the operator). Shows exactly what the model
              recognized each column AS, per Decision 158. */}
          {columnRecognition.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Column recognition (model)</h4>
              <div className="rounded bg-zinc-900/60 p-2 overflow-x-auto">
                <table className="w-full text-[11px] text-zinc-400">
                  <thead>
                    <tr className="text-zinc-500">
                      <th className="text-left font-medium pr-4 pb-1">column</th>
                      <th className="text-left font-medium pr-4 pb-1">scope_role</th>
                      <th className="text-left font-medium pr-4 pb-1">nature_role</th>
                      <th className="text-right font-medium pb-1">conf</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columnRecognition.map(r => (
                      <tr key={r.col}>
                        <td className="pr-4 py-0.5"><code className="text-zinc-300">{r.col}</code></td>
                        <td className="pr-4 py-0.5">{r.scope}</td>
                        <td className="pr-4 py-0.5">{r.nature}</td>
                        <td className="py-0.5 text-right tabular-nums">{r.conf > 0 ? `${Math.round(r.conf * 100)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!isFailed && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Classification Rationale</h4>
              <p className="text-sm text-zinc-400">{unit.verdictSummary || unit.reasoning || 'Not available'}</p>
            </div>
          )}

          {hasCloseScores && !isFailed && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3">
              <p className="text-sm text-amber-400 font-medium">Close classification scores</p>
              <div className="mt-1 space-y-1">
                {unit.allScores.filter(s => s.agent !== unit.classification).sort((a, b) => b.confidence - a.confidence).slice(0, 2).map((s, i) => (
                  <p key={i} className="text-xs text-amber-400/70">{s.agent}: {Math.round(s.confidence * 100)}% — {s.reasoning}</p>
                ))}
              </div>
            </div>
          )}

          {isSplit && (
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-md p-3">
              <p className="text-sm text-violet-400 font-medium">This sheet has been split</p>
              {unit.ownedFields && unit.ownedFields.length > 0 && <p className="text-xs text-violet-400/70 mt-1">Fields owned: {unit.ownedFields.join(', ')}</p>}
              {unit.sharedFields && unit.sharedFields.length > 0 && <p className="text-xs text-violet-400/70">Shared join keys: {unit.sharedFields.join(', ')}</p>}
            </div>
          )}

          {(unit.warnings?.length || 0) > 0 && (
            <div className="space-y-1">{unit.warnings.map((w, i) => <p key={i} className="text-xs text-amber-400/70">{w}</p>)}</div>
          )}

          {!isFailed && (
            <div className="pt-2 border-t border-zinc-800/30">
              <div className="relative inline-block">
                <button onClick={(e) => { e.stopPropagation(); setShowClassMenu(!showClassMenu); }} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Change classification</button>
                {showClassMenu && (
                  <div className="absolute left-0 bottom-full mb-1 z-50 w-56 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
                    {CLASSIFICATIONS.map(t => (
                      <button key={t} onClick={(e) => { e.stopPropagation(); onChangeClassification(t); setShowClassMenu(false); }}
                        className={cn('w-full text-left px-3 py-2 text-sm hover:bg-zinc-700/50 transition-colors first:rounded-t-lg last:rounded-b-lg', t === unit.classification && 'bg-zinc-700/30 text-zinc-200')}>
                        <VerdictBadge classification={t} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT — SCIProposalView
// ============================================================

interface SCIProposalProps {
  proposal: SCIProposalType;
  fileName: string;
  rawData?: ParsedFileData;
  tenantId: string;
  storagePaths?: Record<string, string>;
  onConfirmAll: (confirmedUnits: ContentUnitProposal[]) => void;
  onCancel: () => void;
}

export function SCIProposalView({ proposal, fileName, rawData, tenantId, storagePaths, onConfirmAll, onCancel }: SCIProposalProps) {
  const isVialuce = useIsVialuce(); // HF-315: proposal header/footer → design-spec type + .btn-pri/.btn-sec under Vialuce
  const importSessionId = proposal.importSessionId;

  const rowCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!rawData?.sheets) return map;
    for (const sheet of rawData.sheets) map.set(sheet.sheetName, sheet.totalRowCount || sheet.rows?.length || 0);
    return map;
  }, [rawData]);

  const getRowCount = useCallback((unit: ContentUnitProposal): number => {
    const tabName = unit.contentUnitId.split('::')[1] || unit.tabName;
    return rowCountMap.get(tabName) || 0;
  }, [rowCountMap]);

  // ── D7: ONE durable state read drives every card (poll SessionStateView) ──
  const [liveStates, setLiveStates] = useState<Map<string, UnitStateView>>(new Map());
  // HF-356 (I8): set when the poller stops on an auth/server failure — surfaced inline so the user knows
  // the live card state is no longer updating (instead of staring at a silently-frozen poll).
  const [pollStopMessage, setPollStopMessage] = useState<string | null>(null);

  // One-shot live-state refresh — invoked right after a user resolution action (retry/assign/exclude) to
  // reflect it immediately. A single best-effort read; if it fails, the scheduled poll below self-corrects.
  const refreshLiveStates = useCallback(async () => {
    if (!tenantId || !importSessionId) return;
    try {
      const res = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(importSessionId)}`);
      if (res.ok) {
        const view = await res.json() as SessionStateView;
        setLiveStates(new Map(view.units.map(u => [u.unitId, u])));
      }
    } catch { /* transient — the scheduled poll will pick it up */ }
  }, [tenantId, importSessionId]);

  useEffect(() => {
    if (!importSessionId) return;
    setImportInteractionContext(tenantId, importSessionId);
    captureImportInteraction({ surface: 'sci_proposal', action: 'view', dedupKey: `view:${importSessionId}` });

    const BASE_MS = 1500;
    const pollState = newPollState();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // HF-356 (I8): self-scheduling tick. 401 stops + shows a message; a 5xx/network streak backs off then
    // gives up (cap) — never a fixed-cadence storm against a failing server. Unmount cancels everything.
    const tick = async () => {
      if (cancelled || !tenantId || !importSessionId) return;
      let outcome: PollOutcome = { ok: false, networkError: true };
      try {
        const res = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(importSessionId)}`);
        outcome = { ok: res.ok, status: res.status };
        if (res.ok && !cancelled) {
          const view = await res.json() as SessionStateView;
          setLiveStates(new Map(view.units.map(u => [u.unitId, u])));
          // HF-286: stop polling once every unit is settled (bound/resolved/failed_interpretation).
          // Settled-set, NOT !isOpen — failed_interpretation keeps isOpen===true (awaiting human).
          if (allUnitsSettled(view.units)) return; // terminal — let the timer simply not reschedule
        }
      } catch { /* network drop — outcome stays the networkError default; counted toward the give-up cap */ }
      if (cancelled) return;
      const verdict = pollDecision(pollState, outcome, BASE_MS);
      if (verdict.action === 'stop') { setPollStopMessage(verdict.message); return; }
      timer = setTimeout(tick, verdict.delayMs);
    };
    void tick();

    return () => { cancelled = true; if (timer) clearTimeout(timer); flushPendingImportInteractions(); };
  }, [tenantId, importSessionId]);

  const unitIds = useMemo(() => {
    const ids = new Map<number, string>();
    const seen = new Set<string>();
    proposal.contentUnits.forEach((u, i) => {
      let id = u.contentUnitId;
      if (seen.has(id)) id = `${id}::dedup_${i}`;
      seen.add(id);
      ids.set(i, id);
    });
    return ids;
  }, [proposal.contentUnits]);

  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [classificationOverrides, setClassificationOverrides] = useState<Map<string, AgentType>>(new Map());
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const effectiveUnits = useMemo(() => proposal.contentUnits.map((u, i) => {
    const uniqueId = unitIds.get(i) || u.contentUnitId;
    const override = classificationOverrides.get(uniqueId);
    return { ...u, classification: (override && override !== u.classification) ? override : u.classification, _uniqueId: uniqueId };
  }), [proposal.contentUnits, classificationOverrides, unitIds]);

  // live failed-ness: the durable state overrides the analyze-time marker (retry/assign can clear it)
  const isFailed = useCallback((u: ContentUnitProposal) => {
    const s = liveStates.get(u.contentUnitId)?.state;
    if (s) return s === 'failed_interpretation';
    return !!u.failedInterpretation;
  }, [liveStates]);

  const confirmedRows = useMemo(() => effectiveUnits
    .filter(u => confirmedIds.has(u._uniqueId)).reduce((sum, u) => sum + getRowCount(u), 0), [effectiveUnits, confirmedIds, getRowCount]);

  const confirmableUnits = useMemo(() => effectiveUnits.filter(u => !isFailed(u) && !excludedIds.has(u._uniqueId)), [effectiveUnits, isFailed, excludedIds]);

  const toggleSet = (id: string, prev: Set<string>) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const toggleConfirm = (id: string) => setConfirmedIds(prev => toggleSet(id, prev));
  const toggleExpand = (id: string) => { setExpandedIds(prev => toggleSet(id, prev)); captureImportInteraction({ surface: 'sci_proposal', action: 'expand', unitId: id }); };
  const confirmAllConfirmable = () => setConfirmedIds(new Set(confirmableUnits.map(u => u._uniqueId)));

  const handleChangeClassification = (id: string, newType: AgentType) => {
    setClassificationOverrides(prev => new Map(prev).set(id, newType));
    setConfirmedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  // ── resolution actions (each routes through a signal endpoint — EPG-5.2) ──
  const retry = async (u: ContentUnitProposal & { _uniqueId: string }) => {
    const storagePath = storagePaths?.[u.contentUnitId.split('::')[0]];
    if (!storagePath || !importSessionId) return;
    captureImportInteraction({ surface: 'sci_proposal', action: 'action_click', unitId: u.contentUnitId, metadata: { control: 'retry' } });
    setBusyId(u._uniqueId);
    try {
      await fetch('/api/import/sci/retry-unit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, importSessionId, storagePath, unitId: u.contentUnitId }) });
      await refreshLiveStates();
    } finally { setBusyId(null); }
  };
  const assign = async (u: ContentUnitProposal & { _uniqueId: string }, classification: AgentType) => {
    if (!importSessionId) return;
    setBusyId(u._uniqueId);
    try {
      await fetch('/api/import/sci/resolve-unit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, importSessionId, unitId: u.contentUnitId, sheetName: u.tabName, action: 'assign', classification }) });
      await refreshLiveStates();
    } finally { setBusyId(null); }
  };
  const exclude = async (u: ContentUnitProposal & { _uniqueId: string }) => {
    if (!importSessionId) return;
    setBusyId(u._uniqueId);
    try {
      await fetch('/api/import/sci/resolve-unit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, importSessionId, unitId: u.contentUnitId, sheetName: u.tabName, action: 'exclude' }) });
      setExcludedIds(prev => new Set(prev).add(u._uniqueId));
    } finally { setBusyId(null); }
  };

  // D8: import the CONFIRMED subset (≥1); failed/excluded units never commit.
  const confirmedUnits = useMemo(() => confirmableUnits.filter(u => confirmedIds.has(u._uniqueId)), [confirmableUnits, confirmedIds]);
  const canImport = confirmedUnits.length > 0;
  const handleImport = () => { if (canImport) onConfirmAll(confirmedUnits); };

  const failedCount = effectiveUnits.filter(isFailed).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className={isVialuce ? undefined : 'text-base font-semibold text-zinc-100'} style={isVialuce ? { fontSize: '16px', fontWeight: 'var(--vl-fw-med)' as unknown as number, color: 'var(--vl-text)', margin: 0 } : undefined}>{fileName}</h2>
        <p className={isVialuce ? undefined : 'text-xs text-zinc-500 mt-1'} style={isVialuce ? { fontSize: '12px', color: 'var(--vl-text-soft)', margin: '4px 0 0' } : undefined}>
          {effectiveUnits.length} content unit{effectiveUnits.length !== 1 ? 's' : ''} detected
          {failedCount > 0 && <span className={isVialuce ? undefined : 'text-rose-400'} style={isVialuce ? { color: 'var(--vl-danger)' } : undefined}>{' '}· {failedCount} holding at failed interpretation</span>}
        </p>
      </div>

      {/* HF-356 (I8): the live-state poller stopped on an auth/server failure — say so instead of leaving
          the cards silently frozen. */}
      {pollStopMessage && (
        <div
          role="status"
          className={isVialuce ? undefined : 'text-xs text-amber-300 border border-amber-500/30 bg-amber-500/5 rounded px-3 py-2'}
          style={isVialuce ? { fontSize: '12px', color: 'var(--vialuce-gold)', border: '1px solid var(--vialuce-gold)', borderRadius: 6, padding: '8px 12px' } : undefined}
        >
          {pollStopMessage}
        </div>
      )}

      {/* ONE list — every unit is a card; failed units hold here with their action set (D7) */}
      <div className="space-y-2">
        {effectiveUnits.map((unit) => {
          const uid = unit._uniqueId;
          const original = proposal.contentUnits.find(u => u.contentUnitId === unit.contentUnitId);
          const failed = isFailed(unit);
          return (
            <ContentUnitCard
              key={uid}
              unit={unit}
              originalClassification={original?.classification}
              rowCount={getRowCount(unit)}
              liveState={liveStates.get(unit.contentUnitId)}
              isFailed={failed}
              isExcluded={excludedIds.has(uid)}
              isConfirmed={confirmedIds.has(uid)}
              busy={busyId === uid}
              canRetry={!!storagePaths?.[unit.contentUnitId.split('::')[0]]}
              onToggleConfirm={() => toggleConfirm(uid)}
              isExpanded={expandedIds.has(uid)}
              onToggleExpand={() => toggleExpand(uid)}
              onChangeClassification={(newType) => handleChangeClassification(uid, newType)}
              onRetry={() => retry(unit)}
              onAssign={(c) => assign(unit, c)}
              onExclude={() => exclude(unit)}
            />
          );
        })}
      </div>

      {/* Footer — D8: enabled with any non-empty selection; label reflects the subset */}
      <div
        className={isVialuce ? undefined : 'flex items-center justify-between px-4 py-3 border-t border-zinc-800'}
        style={isVialuce ? { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--vl-line)' } : undefined}
      >
        <button
          onClick={confirmAllConfirmable}
          className={isVialuce ? undefined : 'text-sm text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2'}
          style={isVialuce ? { fontSize: '13px', color: 'var(--vialuce-indigo)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 } : undefined}
        >
          Select all{confirmableUnits.length < effectiveUnits.length ? ` (${confirmableUnits.length} importable)` : ''}
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className={isVialuce ? 'btn-sec' : 'text-sm text-zinc-500 hover:text-zinc-300 transition-colors'}
          >Cancel</button>
          <button
            onClick={handleImport}
            disabled={!canImport}
            className={isVialuce ? 'btn-pri' : cn('px-5 py-2 rounded-lg font-medium text-sm transition-colors',
              canImport ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed')}
            style={isVialuce && !canImport ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          >
            {canImport
              ? `Import ${confirmedRows.toLocaleString()} rows · ${confirmedUnits.length} of ${effectiveUnits.length} units`
              : 'Select units to import'}
          </button>
        </div>
      </div>
    </div>
  );
}
