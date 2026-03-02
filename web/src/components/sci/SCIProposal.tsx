'use client';

// SCI Proposal — Intelligence-first content cards
// OB-138 — DS-006 v2: 3-layer progressive disclosure of agent reasoning.
// OB-129 foundation + OB-133 docs + OB-134 negotiation + OB-138 intelligence.
// Zero domain vocabulary. Korean Test applies.

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileSpreadsheet,
  FileText,
  ChevronDown,
  ChevronRight,
  Check,
  Pencil,
  ArrowRight,
  Split,
  Link2,
  Eye,
  Lightbulb,
  AlertTriangle,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  SCIProposal as SCIProposalType,
  ContentUnitProposal,
  AgentType,
  SemanticBinding,
} from '@/lib/sci/sci-types';

// ============================================================
// CONSTANTS
// ============================================================

const CLASSIFICATION_OPTIONS: Array<{
  value: AgentType;
  label: string;
  description: string;
}> = [
  { value: 'plan', label: 'Plan Rules', description: 'This describes how performance is measured and rewarded' },
  { value: 'entity', label: 'Team Roster', description: 'This lists the people in my organization' },
  { value: 'target', label: 'Performance Targets', description: 'This sets goals for each team member' },
  { value: 'transaction', label: 'Operational Data', description: 'This contains transactions, events, or activity records' },
];

const PROCESSING_ORDER: Record<AgentType, number> = {
  plan: 0, entity: 1, target: 2, transaction: 3,
};

const CLASSIFICATION_LABELS: Record<AgentType, string> = {
  plan: 'Plan Rules',
  entity: 'Team Roster',
  target: 'Performance Targets',
  transaction: 'Operational Data',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  low: 'bg-red-500/15 text-red-400 border-red-500/20',
};

// ============================================================
// HELPERS
// ============================================================

function getConfidenceLevel(c: number): 'high' | 'medium' | 'low' {
  if (c >= 0.80) return 'high';
  if (c >= 0.60) return 'medium';
  return 'low';
}

function getOverallSummary(units: ContentUnitProposal[]): string {
  const types = new Map<AgentType, number>();
  for (const u of units) {
    types.set(u.classification, (types.get(u.classification) || 0) + 1);
  }

  const typeNames: Record<AgentType, string> = {
    plan: 'plan rules',
    entity: 'team roster data',
    target: 'performance targets',
    transaction: 'operational data',
  };

  const sorted = Array.from(types.entries()).sort(
    (a, b) => PROCESSING_ORDER[a[0]] - PROCESSING_ORDER[b[0]]
  );

  const parts = sorted.map(([type]) => typeNames[type]);
  if (parts.length === 0) return 'No recognizable content found.';
  if (parts.length === 1) return `I found ${parts[0]}.`;
  if (parts.length === 2) return `I found ${parts[0]} and ${parts[1]}.`;
  return `I found ${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`;
}

function getFieldDescription(binding: SemanticBinding): string {
  if (binding.displayContext) return binding.displayContext;
  const roleDescriptions: Record<string, string> = {
    entity_identifier: 'identifies each team member',
    entity_name: 'display name',
    performance_target: 'individual goal or target',
    baseline_value: 'starting value for growth measurement',
    transaction_amount: 'event value',
    transaction_date: 'event date',
    transaction_count: 'event count',
    entity_attribute: 'team member attribute',
    entity_license: 'access or permission level',
    category_code: 'category or grouping',
    rate_value: 'rate or percentage',
    tier_boundary: 'threshold value',
    payout_amount: 'reward amount',
    period_marker: 'time period reference',
    descriptive_label: 'label or description',
    unknown: 'purpose not determined',
  };
  return roleDescriptions[binding.semanticRole] || '';
}

// ============================================================
// CONFIDENCE BAR (visual score comparison)
// ============================================================

function ScoreBar({ agent, confidence, isWinner }: {
  agent: AgentType;
  confidence: number;
  isWinner: boolean;
}) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        'text-xs w-28 truncate',
        isWinner ? 'text-zinc-200 font-medium' : 'text-zinc-500'
      )}>
        {CLASSIFICATION_LABELS[agent]}
      </span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isWinner ? 'bg-indigo-500' : 'bg-zinc-600'
          )}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className={cn(
        'text-xs w-8 text-right tabular-nums',
        isWinner ? 'text-zinc-200' : 'text-zinc-600'
      )}>
        {pct}%
      </span>
    </div>
  );
}

// ============================================================
// CONTENT UNIT CARD — 3-Layer Intelligence Display
// ============================================================

interface ContentUnitCardProps {
  unit: ContentUnitProposal;
  confirmed: boolean;
  onConfirm: () => void;
  onChangeClassification: (newType: AgentType) => void;
}

function ContentUnitCard({ unit, confirmed, onConfirm, onChangeClassification }: ContentUnitCardProps) {
  const [showClassificationMenu, setShowClassificationMenu] = useState(false);
  const [expandedLayer, setExpandedLayer] = useState<2 | 3 | null>(null);

  const isDocumentPlan = unit.classification === 'plan' && !!unit.documentMetadata;
  const isPartial = unit.claimType === 'PARTIAL';
  const confidenceLevel = getConfidenceLevel(unit.confidence);
  const confidencePct = Math.round(unit.confidence * 100);

  // Meaningful field bindings
  const displayBindings = unit.fieldBindings.filter(
    b => b.semanticRole !== 'unknown' || b.displayContext
  );

  // Document extraction summary
  const extractionSummary = unit.documentMetadata?.extractionSummary;
  const componentCount = (extractionSummary?.componentCount as number) || 0;
  const components = (extractionSummary?.components as Array<{ name: string }>) || [];

  const toggleLayer = (layer: 2 | 3) => {
    setExpandedLayer(prev => prev === layer ? null : layer);
  };

  return (
    <Card className={cn(
      'relative transition-all duration-200',
      confidenceLevel === 'low' && !confirmed && 'ring-1 ring-amber-500/30',
      confirmed && 'ring-1 ring-emerald-500/30'
    )}>
      <CardContent className="p-5">
        {/* ─── LAYER 1: Verdict (always visible) ─── */}
        <div className="flex items-start gap-3">
          {/* Icon */}
          {isDocumentPlan ? (
            <FileText className="w-5 h-5 text-rose-400 mt-0.5 flex-shrink-0" />
          ) : isPartial ? (
            <Split className="w-5 h-5 text-violet-400 mt-0.5 flex-shrink-0" />
          ) : (
            <FileSpreadsheet className="w-5 h-5 text-zinc-400 mt-0.5 flex-shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            {/* Sheet/doc name + classification badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-zinc-200">
                {isDocumentPlan
                  ? unit.sourceFile
                  : unit.tabName}
              </span>
              {isPartial && (
                <span className="text-xs text-violet-400">(split)</span>
              )}
              <span className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs border',
                CONFIDENCE_COLORS[confidenceLevel]
              )}>
                {CLASSIFICATION_LABELS[unit.classification]} {confidencePct}%
              </span>
            </div>

            {/* Verdict summary — the key intelligence line */}
            <p className="text-sm text-zinc-400 mt-1.5">
              {unit.verdictSummary || unit.reasoning}
            </p>

            {/* Warnings inline */}
            {unit.warnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {unit.warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-amber-400/80">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Confirmed badge */}
          {confirmed && (
            <div className="flex items-center gap-1 text-emerald-400 text-xs flex-shrink-0">
              <Check className="w-3.5 h-3.5" />
              <span>Confirmed</span>
            </div>
          )}
        </div>

        {/* ─── Layer expanders ─── */}
        <div className="flex items-center gap-1 mt-4 pl-8">
          <button
            onClick={() => toggleLayer(2)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors',
              expandedLayer === 2
                ? 'bg-zinc-700/50 text-zinc-200'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            )}
          >
            <Eye className="w-3 h-3" />
            Observations
            {expandedLayer === 2 ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          <button
            onClick={() => toggleLayer(3)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors',
              expandedLayer === 3
                ? 'bg-zinc-700/50 text-zinc-200'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            )}
          >
            <Lightbulb className="w-3 h-3" />
            Deep Dive
            {expandedLayer === 3 ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        </div>

        {/* ─── LAYER 2: Observations + Field Bindings ─── */}
        {expandedLayer === 2 && (
          <div className="mt-3 pl-8 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
            {/* Observations */}
            {unit.observations && unit.observations.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">What I noticed</p>
                <div className="space-y-1.5">
                  {unit.observations.map((obs, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                      <span className="text-zinc-600 mt-0.5">&bull;</span>
                      <span>{obs}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Document plan — component summary */}
            {isDocumentPlan && componentCount > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Components extracted</p>
                <div className="space-y-1.5">
                  <div className="text-sm text-zinc-300">
                    {componentCount} component{componentCount !== 1 ? 's' : ''} with rate tables
                  </div>
                  {components.slice(0, 6).map((comp, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-sm">
                      <span className="text-zinc-600">&bull;</span>
                      <span className="text-zinc-300">{comp.name}</span>
                    </div>
                  ))}
                  {components.length > 6 && (
                    <p className="text-xs text-zinc-500">+ {components.length - 6} more</p>
                  )}
                </div>
              </div>
            )}

            {/* PARTIAL claim — owned + shared fields */}
            {isPartial && unit.ownedFields && unit.ownedFields.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">My fields</p>
                <div className="space-y-1.5">
                  {unit.ownedFields.map((fieldName, i) => {
                    const binding = unit.fieldBindings.find(b => b.sourceField === fieldName);
                    return (
                      <div key={i} className="flex items-baseline gap-2 text-sm">
                        <span className="font-medium text-zinc-200">{fieldName}</span>
                        {binding && (
                          <>
                            <span className="text-zinc-600">&mdash;</span>
                            <span className="text-zinc-400">{getFieldDescription(binding)}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                {unit.sharedFields && unit.sharedFields.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Link2 className="w-3 h-3" />
                      Shared with partner
                    </p>
                    <div className="space-y-1">
                      {unit.sharedFields.map((fieldName, i) => (
                        <div key={i} className="flex items-baseline gap-2 text-sm">
                          <span className="text-zinc-400">{fieldName}</span>
                          <span className="text-xs text-zinc-600">(join key)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Field bindings — tabular data */}
            {!isDocumentPlan && !isPartial && displayBindings.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Field mapping</p>
                <div className="space-y-1.5">
                  {displayBindings.slice(0, 8).map((binding, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-sm">
                      <span className="font-medium text-zinc-200">{binding.sourceField}</span>
                      <span className="text-zinc-600">&mdash;</span>
                      <span className="text-zinc-400">{getFieldDescription(binding)}</span>
                    </div>
                  ))}
                  {displayBindings.length > 8 && (
                    <p className="text-xs text-zinc-500">+ {displayBindings.length - 8} more fields</p>
                  )}
                </div>
              </div>
            )}

            {/* Action preview */}
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5">What happens next</p>
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{unit.action}</span>
              </div>
            </div>
          </div>
        )}

        {/* ─── LAYER 3: Deep Dive — Falsifiability + Scores + Log ─── */}
        {expandedLayer === 3 && (
          <div className="mt-3 pl-8 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
            {/* What changes my mind */}
            {unit.whatChangesMyMind && unit.whatChangesMyMind.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">What would change my mind</p>
                <div className="space-y-1.5">
                  {unit.whatChangesMyMind.map((condition, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                      <Lightbulb className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-zinc-600" />
                      <span>{condition}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All agent scores */}
            {unit.allScores.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <BarChart3 className="w-3 h-3" />
                  All scores
                </p>
                <div className="space-y-1.5">
                  {unit.allScores
                    .sort((a, b) => b.confidence - a.confidence)
                    .map(score => (
                      <ScoreBar
                        key={score.agent}
                        agent={score.agent}
                        confidence={score.confidence}
                        isWinner={score.agent === unit.classification}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Negotiation log */}
            {unit.negotiationLog && unit.negotiationLog.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Decision log</p>
                <div className="space-y-1 text-xs text-zinc-500 font-mono bg-zinc-900/50 rounded-md p-3">
                  {unit.negotiationLog.map((entry, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-zinc-600 w-20 flex-shrink-0">[{entry.stage}]</span>
                      <span>{entry.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Actions ─── */}
        {!confirmed && (
          <div className="flex items-center gap-3 pl-8 mt-4 pt-3 border-t border-zinc-800">
            <Button
              onClick={onConfirm}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <Check className="w-3.5 h-3.5" />
              Confirm
            </Button>

            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowClassificationMenu(!showClassificationMenu)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <Pencil className="w-3.5 h-3.5" />
                Change
                <ChevronDown className="w-3 h-3" />
              </Button>

              {showClassificationMenu && (
                <div className="absolute left-0 top-full mt-1 z-50 w-80 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
                  {CLASSIFICATION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        onChangeClassification(opt.value);
                        setShowClassificationMenu(false);
                      }}
                      className={cn(
                        'w-full text-left px-4 py-3 hover:bg-zinc-700/50 transition-colors first:rounded-t-lg last:rounded-b-lg',
                        opt.value === unit.classification && 'bg-zinc-700/30'
                      )}
                    >
                      <p className="text-sm font-medium text-zinc-200">{opt.label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{opt.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// PROPOSAL SUMMARY BAR
// ============================================================

function ProposalSummaryBar({
  fileName,
  units,
  overallConfidence,
}: {
  fileName: string;
  units: ContentUnitProposal[];
  overallConfidence: number;
}) {
  const overallLevel = getConfidenceLevel(overallConfidence);
  const summary = getOverallSummary(units);

  const hasPartial = units.some(u => u.claimType === 'PARTIAL');
  const lowConfCount = units.filter(u => u.confidence < 0.60).length;

  return (
    <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/50 p-6">
      {/* File info row */}
      <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3 flex-wrap">
        <span className="font-medium text-zinc-400">{fileName}</span>
        <span>&middot;</span>
        <span>{units.length} {units.length === 1 ? 'item' : 'items'}</span>
        {hasPartial && (
          <>
            <span>&middot;</span>
            <span className="text-violet-400">Mixed content detected</span>
          </>
        )}
        <span>&middot;</span>
        <span className={cn(
          overallLevel === 'high' ? 'text-emerald-400' :
          overallLevel === 'medium' ? 'text-amber-400' : 'text-red-400'
        )}>
          {overallLevel === 'high' ? 'Ready to process' :
           overallLevel === 'medium' ? 'Review recommended' : 'Needs review'}
        </span>
      </div>

      {/* Summary */}
      <p className="text-base text-zinc-200">
        {summary}
        {units.length > 1 && " Here's what I'll do with each."}
      </p>

      {/* Confidence note */}
      {lowConfCount > 0 && (
        <p className="text-sm text-amber-400/80 mt-2">
          {lowConfCount === 1
            ? '1 item needs a closer look.'
            : `${lowConfCount} items need your review.`}
        </p>
      )}
    </div>
  );
}

// ============================================================
// MAIN SCIProposal COMPONENT
// ============================================================

interface SCIProposalProps {
  proposal: SCIProposalType;
  fileName: string;
  onConfirmAll: (confirmedUnits: ContentUnitProposal[]) => void;
  onCancel: () => void;
}

export function SCIProposalView({ proposal, fileName, onConfirmAll, onCancel }: SCIProposalProps) {
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [classificationOverrides, setClassificationOverrides] = useState<Map<string, AgentType>>(new Map());

  const effectiveUnits = useMemo(() => {
    return proposal.contentUnits.map(u => {
      const override = classificationOverrides.get(u.contentUnitId);
      if (!override || override === u.classification) return u;
      return { ...u, classification: override };
    });
  }, [proposal.contentUnits, classificationOverrides]);

  const allConfirmed = confirmedIds.size === effectiveUnits.length;

  const orderedUnits = useMemo(() => {
    return [...effectiveUnits].sort(
      (a, b) => PROCESSING_ORDER[a.classification] - PROCESSING_ORDER[b.classification]
    );
  }, [effectiveUnits]);

  const processingOrderLabels = useMemo(() => {
    const seen = new Set<AgentType>();
    const labels: string[] = [];
    for (const u of orderedUnits) {
      if (!seen.has(u.classification)) {
        seen.add(u.classification);
        labels.push(CLASSIFICATION_LABELS[u.classification]);
      }
    }
    return labels;
  }, [orderedUnits]);

  const handleConfirmUnit = (id: string) => {
    setConfirmedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleChangeClassification = (id: string, newType: AgentType) => {
    setClassificationOverrides(prev => {
      const next = new Map(prev);
      next.set(id, newType);
      return next;
    });
    setConfirmedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleConfirmAll = () => {
    onConfirmAll(effectiveUnits);
  };

  // Fast path: all high confidence
  const allHighConfidence = effectiveUnits.every(u => u.confidence >= 0.80);
  const [showDetails, setShowDetails] = useState(!allHighConfidence);

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <ProposalSummaryBar
        fileName={fileName}
        units={effectiveUnits}
        overallConfidence={proposal.overallConfidence}
      />

      {/* Fast path: all high confidence */}
      {allHighConfidence && !showDetails && (
        <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/50 p-6 text-center">
          <p className="text-sm text-zinc-300 mb-4">
            Everything looks clear. Confirm to proceed.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              onClick={handleConfirmAll}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <Check className="w-4 h-4" />
              Confirm All &amp; Go
            </Button>
            <button
              onClick={() => setShowDetails(true)}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Show Details
            </button>
          </div>
        </div>
      )}

      {/* Content unit cards */}
      {(showDetails || !allHighConfidence) && (
        <>
          <div className="space-y-4">
            {orderedUnits.map(unit => (
              <ContentUnitCard
                key={unit.contentUnitId}
                unit={unit}
                confirmed={confirmedIds.has(unit.contentUnitId)}
                onConfirm={() => handleConfirmUnit(unit.contentUnitId)}
                onChangeClassification={(newType) =>
                  handleChangeClassification(unit.contentUnitId, newType)
                }
              />
            ))}
          </div>

          {/* Footer */}
          <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/50 p-5">
            {processingOrderLabels.length > 1 && (
              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4">
                <span>Processing order:</span>
                {processingOrderLabels.map((label, i) => (
                  <span key={label} className="flex items-center gap-2">
                    {i > 0 && <ArrowRight className="w-3 h-3 text-zinc-600" />}
                    <span className="text-zinc-400">{label}</span>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={handleConfirmAll}
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                <Check className="w-4 h-4" />
                {allConfirmed ? 'Go' : 'Confirm All & Go'}
              </Button>
              <Button
                variant="ghost"
                onClick={onCancel}
                className="text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
