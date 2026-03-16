'use client';

// SCI Proposal — DS-006 v2 implementation
// Collapsed card rows with expand, bulk confirm, honest uncertainty.
// Zero domain vocabulary. Korean Test applies.

import { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  SCIProposal as SCIProposalType,
  ContentUnitProposal,
  AgentType,
} from '@/lib/sci/sci-types';
import type { ParsedFileData } from '@/components/sci/SCIUpload';

// ============================================================
// VERDICT BADGE — classification type indicator
// ============================================================

const BADGE_STYLES: Record<string, string> = {
  entity: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  transaction: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  target: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  plan: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  reference: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

function VerdictBadge({ classification }: { classification: AgentType }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
      BADGE_STYLES[classification] || 'bg-red-500/15 text-red-400 border-red-500/30'
    )}>
      {classification}
    </span>
  );
}

// ============================================================
// CONFIDENCE BAR — visual confidence indicator
// ============================================================

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

// ============================================================
// CONTENT UNIT CARD — collapsed + expanded states
// ============================================================

interface ContentUnitCardProps {
  unit: ContentUnitProposal;
  originalClassification?: AgentType;
  rowCount: number;
  isConfirmed: boolean;
  onToggleConfirm: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onChangeClassification: (newType: AgentType) => void;
}

function ContentUnitCard({
  unit, originalClassification, rowCount, isConfirmed, onToggleConfirm, isExpanded, onToggleExpand,
  onChangeClassification,
}: ContentUnitCardProps) {
  const isOverridden = originalClassification != null && originalClassification !== unit.classification;
  const [showClassMenu, setShowClassMenu] = useState(false);

  const hasCloseScores = unit.allScores?.some(s =>
    s.agent !== unit.classification && s.confidence > unit.confidence - 0.15
  );
  const isSplit = unit.claimType === 'PARTIAL';
  const needsReview = unit.confidence < 0.6 || (unit.warnings?.length || 0) > 0;

  const displayBindings = unit.fieldBindings?.filter(
    b => b.semanticRole !== 'unknown' || b.displayContext
  ) || [];

  const isDocPlan = unit.classification === 'plan' && !!unit.documentMetadata;

  return (
    <div className={cn(
      'border rounded-lg transition-colors',
      needsReview && !isConfirmed ? 'border-amber-500/30 bg-amber-500/5' :
      isConfirmed ? 'border-emerald-500/30 bg-emerald-500/5' :
      'border-zinc-700/50'
    )}>
      {/* ---- COLLAPSED ROW (always visible) ---- */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={onToggleExpand}
      >
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isConfirmed}
          onChange={(e) => { e.stopPropagation(); onToggleConfirm(); }}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 flex-shrink-0"
        />

        {/* Tab name */}
        <span className="text-sm font-medium text-zinc-200 min-w-[140px] truncate">
          {isDocPlan ? unit.sourceFile : unit.tabName}
        </span>

        {/* Verdict badge */}
        <VerdictBadge classification={unit.classification} />
        {isOverridden && (
          <span className="text-[10px] text-amber-400/70 font-medium">
            (was {originalClassification})
          </span>
        )}

        {/* Verdict text */}
        <span className="text-xs text-zinc-500 flex-1 truncate">
          {unit.verdictSummary || unit.reasoning}
        </span>

        {/* Row count */}
        {rowCount > 0 && (
          <span className="text-xs text-zinc-600 whitespace-nowrap">
            {rowCount.toLocaleString()} rows
          </span>
        )}

        {/* Confidence bar */}
        <ConfidenceBar confidence={unit.confidence} />

        {/* Expand chevron */}
        <ChevronDown className={cn(
          'w-4 h-4 text-zinc-500 transition-transform flex-shrink-0',
          isExpanded && 'rotate-180'
        )} />
      </div>

      {/* ---- EXPANDED SECTION ---- */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-zinc-800/50 space-y-4">

          {/* Content profile headline */}
          <p className="text-xs text-zinc-500">
            {rowCount > 0 ? `${rowCount.toLocaleString()} rows` : 'Rows unknown'}
            {displayBindings.length > 0 && ` x ${displayBindings.length} columns`}
            {displayBindings.length > 0 && ` — ${displayBindings.slice(0, 3).map(b => b.sourceField).join(', ')}...`}
          </p>

          {/* SECTION: Observations — OB-173: institutional voice */}
          {((unit.observations?.length || 0) > 0 || displayBindings.length > 0) && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Observations
              </h4>
              <div className="space-y-1.5">
                {(unit.observations || []).map((obs, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                    <span className="text-zinc-600 mt-0.5">&bull;</span>
                    <span>{obs}</span>
                  </div>
                ))}
                {/* Field bindings as observations */}
                {displayBindings.slice(0, 6).map((b, i) => (
                  <div key={`fb-${i}`} className="flex items-center gap-2 text-sm text-zinc-400">
                    <span className="text-indigo-400/50">&bull;</span>
                    <code className="text-xs bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-300">{b.sourceField}</code>
                    <span className="text-zinc-600">&rarr;</span>
                    <span className="text-zinc-400">{b.displayLabel || b.semanticRole}</span>
                    <span className="text-xs text-zinc-600">({Math.round(b.confidence * 100)}%)</span>
                  </div>
                ))}
                {displayBindings.length > 6 && (
                  <p className="text-xs text-zinc-600 pl-4">+ {displayBindings.length - 6} more fields</p>
                )}
              </div>
            </div>
          )}

          {/* SECTION: Classification Rationale */}
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Classification Rationale
            </h4>
            <p className="text-sm text-zinc-400">
              {unit.verdictSummary || unit.reasoning || 'Not available'}
            </p>
          </div>

          {/* SECTION: Reclassification Conditions */}
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Reclassification Conditions
            </h4>
            <div className="space-y-1">
              {(unit.whatChangesMyMind || []).map((w, i) => (
                <p key={i} className="text-sm text-zinc-500">{w}</p>
              ))}
              {(!unit.whatChangesMyMind || unit.whatChangesMyMind.length === 0) && (
                <p className="text-sm text-zinc-600 italic">Not available</p>
              )}
            </div>
          </div>

          {/* CLOSE SCORES WARNING (amber box when alt within 15%) */}
          {hasCloseScores && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3">
              <p className="text-sm text-amber-400 font-medium">Close classification scores</p>
              <div className="mt-1 space-y-1">
                {unit.allScores
                  .filter(s => s.agent !== unit.classification)
                  .sort((a, b) => b.confidence - a.confidence)
                  .slice(0, 2)
                  .map((s, i) => (
                    <p key={i} className="text-xs text-amber-400/70">
                      {s.agent}: {Math.round(s.confidence * 100)}% — {s.reasoning}
                    </p>
                  ))}
              </div>
            </div>
          )}

          {/* SPLIT INFO (violet box) */}
          {isSplit && (
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-md p-3">
              <p className="text-sm text-violet-400 font-medium">
                This sheet has been split
              </p>
              {unit.ownedFields && unit.ownedFields.length > 0 && (
                <p className="text-xs text-violet-400/70 mt-1">
                  Fields owned: {unit.ownedFields.join(', ')}
                </p>
              )}
              {unit.sharedFields && unit.sharedFields.length > 0 && (
                <p className="text-xs text-violet-400/70">
                  Shared join keys: {unit.sharedFields.join(', ')}
                </p>
              )}
            </div>
          )}

          {/* Warnings */}
          {(unit.warnings?.length || 0) > 0 && (
            <div className="space-y-1">
              {unit.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-400/70">{w}</p>
              ))}
            </div>
          )}

          {/* Change classification */}
          <div className="pt-2 border-t border-zinc-800/30">
            <div className="relative inline-block">
              <button
                onClick={(e) => { e.stopPropagation(); setShowClassMenu(!showClassMenu); }}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Change classification
              </button>
              {showClassMenu && (
                <div className="absolute left-0 bottom-full mb-1 z-50 w-56 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
                  {(['plan', 'entity', 'target', 'transaction', 'reference'] as AgentType[]).map(t => (
                    <button
                      key={t}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeClassification(t);
                        setShowClassMenu(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm hover:bg-zinc-700/50 transition-colors first:rounded-t-lg last:rounded-b-lg',
                        t === unit.classification && 'bg-zinc-700/30 text-zinc-200'
                      )}
                    >
                      <VerdictBadge classification={t} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SUMMARY BAR
// ============================================================

function SummaryBar({ units, confirmedCount, totalRows }: {
  units: ContentUnitProposal[];
  confirmedCount: number;
  totalRows: number;
}) {
  const confident = units.filter(u => u.confidence >= 0.75).length;
  const needsReview = units.filter(u => u.confidence < 0.6 || (u.warnings?.length || 0) > 0).length;

  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-800/40 border border-zinc-700/50 mb-4">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-emerald-400 font-medium">{confident} confident</span>
        {needsReview > 0 && (
          <>
            <span className="text-zinc-700">|</span>
            <span className="text-amber-400 font-medium">{needsReview} need review</span>
          </>
        )}
        <span className="text-zinc-700">|</span>
        <span className="text-zinc-500">{totalRows.toLocaleString()} total rows</span>
      </div>
      <span className="text-xs text-zinc-600">
        {confirmedCount} of {units.length} confirmed
      </span>
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
  onConfirmAll: (confirmedUnits: ContentUnitProposal[]) => void;
  onCancel: () => void;
}

export function SCIProposalView({ proposal, fileName, rawData, onConfirmAll, onCancel }: SCIProposalProps) {
  // Build row count map from rawData sheets
  const rowCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!rawData?.sheets) return map;
    for (const sheet of rawData.sheets) {
      map.set(sheet.sheetName, sheet.totalRowCount || sheet.rows?.length || 0);
    }
    return map;
  }, [rawData]);

  function getRowCount(unit: ContentUnitProposal): number {
    // contentUnitId format: fileName::tabName::tabIndex
    const parts = unit.contentUnitId.split('::');
    const tabName = parts[1] || unit.tabName;
    return rowCountMap.get(tabName) || 0;
  }

  const totalRows = useMemo(() => {
    return proposal.contentUnits.reduce((sum, u) => sum + getRowCount(u), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal.contentUnits, rowCountMap]);

  // State
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Auto-expand needs-review items
    const auto = new Set<string>();
    proposal.contentUnits.forEach(u => {
      if (u.confidence < 0.6 || (u.warnings?.length || 0) > 0) {
        auto.add(u.contentUnitId);
      }
    });
    return auto;
  });
  const [classificationOverrides, setClassificationOverrides] = useState<Map<string, AgentType>>(new Map());

  const effectiveUnits = useMemo(() => {
    return proposal.contentUnits.map(u => {
      const override = classificationOverrides.get(u.contentUnitId);
      if (!override || override === u.classification) return u;
      return { ...u, classification: override };
    });
  }, [proposal.contentUnits, classificationOverrides]);

  const allConfirmed = confirmedIds.size === effectiveUnits.length;

  const toggleConfirm = (id: string) => {
    setConfirmedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const confirmAll = () => {
    setConfirmedIds(new Set(effectiveUnits.map(u => u.contentUnitId)));
  };

  const handleChangeClassification = (id: string, newType: AgentType) => {
    setClassificationOverrides(prev => {
      const next = new Map(prev);
      next.set(id, newType);
      return next;
    });
    // Unconfirm on reclassification
    setConfirmedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleImport = () => {
    onConfirmAll(effectiveUnits);
  };

  return (
    <div className="space-y-4">
      {/* File header */}
      <div>
        <h2 className="text-base font-semibold text-zinc-100">{fileName}</h2>
        <p className="text-xs text-zinc-500 mt-1">
          {effectiveUnits.length} content unit{effectiveUnits.length !== 1 ? 's' : ''} detected
        </p>
      </div>

      {/* Summary bar */}
      <SummaryBar
        units={effectiveUnits}
        confirmedCount={confirmedIds.size}
        totalRows={totalRows}
      />

      {/* Content unit cards */}
      <div className="space-y-2">
        {effectiveUnits.map(unit => {
          const original = proposal.contentUnits.find(u => u.contentUnitId === unit.contentUnitId);
          return (
            <ContentUnitCard
              key={unit.contentUnitId}
              unit={unit}
              originalClassification={original?.classification}
              rowCount={getRowCount(unit)}
              isConfirmed={confirmedIds.has(unit.contentUnitId)}
              onToggleConfirm={() => toggleConfirm(unit.contentUnitId)}
              isExpanded={expandedIds.has(unit.contentUnitId)}
              onToggleExpand={() => toggleExpand(unit.contentUnitId)}
              onChangeClassification={(newType) => handleChangeClassification(unit.contentUnitId, newType)}
            />
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
        <button
          onClick={confirmAll}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2"
        >
          Confirm all
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!allConfirmed}
            className={cn(
              'px-5 py-2 rounded-lg font-medium text-sm transition-colors',
              allConfirmed
                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            )}
          >
            Import {totalRows > 0 ? `${totalRows.toLocaleString()} rows` : 'data'}
          </button>
        </div>
      </div>
    </div>
  );
}
