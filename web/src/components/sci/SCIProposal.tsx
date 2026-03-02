'use client';

// SCI Proposal — Content cards, confidence language, customer vocabulary
// OB-129 Phase 3 — Zero domain vocabulary. Korean Test applies.

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileSpreadsheet,
  FileText,
  ChevronDown,
  Check,
  Pencil,
  Info,
  ArrowRight,
  Split,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  SCIProposal as SCIProposalType,
  ContentUnitProposal,
  AgentType,
  SemanticBinding,
} from '@/lib/sci/sci-types';

// Classification labels in customer vocabulary — zero platform jargon
const CLASSIFICATION_OPTIONS: Array<{
  value: AgentType;
  label: string;
  description: string;
}> = [
  {
    value: 'plan',
    label: 'Plan Rules',
    description: 'This describes how performance is measured and rewarded',
  },
  {
    value: 'entity',
    label: 'Team Roster',
    description: 'This lists the people in my organization',
  },
  {
    value: 'target',
    label: 'Performance Targets',
    description: 'This sets goals for each team member',
  },
  {
    value: 'transaction',
    label: 'Operational Data',
    description: 'This contains transactions, events, or activity records',
  },
];

// Processing order for display
const PROCESSING_ORDER: Record<AgentType, number> = {
  plan: 0,
  entity: 1,
  target: 2,
  transaction: 3,
};

const CLASSIFICATION_LABELS: Record<AgentType, string> = {
  plan: 'Plan Rules',
  entity: 'Team Roster',
  target: 'Performance Targets',
  transaction: 'Operational Data',
};

function getConfidenceLanguage(confidence: number, classification: AgentType): string {
  const label = CLASSIFICATION_LABELS[classification].toLowerCase();
  if (confidence >= 0.80) {
    return `I identified this as ${label}.`;
  }
  if (confidence >= 0.60) {
    return `This appears to be ${label}.`;
  }
  return "I'm not sure about this one \u2014 please confirm the classification.";
}

function getOverallSummary(units: ContentUnitProposal[]): string {
  const types = new Map<AgentType, number>();
  for (const u of units) {
    types.set(u.classification, (types.get(u.classification) || 0) + 1);
  }

  const parts: string[] = [];
  const typeNames: Record<AgentType, string> = {
    plan: 'plan rules',
    entity: 'team roster data',
    target: 'performance targets',
    transaction: 'operational data',
  };

  // Sort by processing order
  const sorted = Array.from(types.entries()).sort(
    (a, b) => PROCESSING_ORDER[a[0]] - PROCESSING_ORDER[b[0]]
  );

  for (const [type] of sorted) {
    parts.push(typeNames[type]);
  }

  if (parts.length === 0) return 'No recognizable content found.';
  if (parts.length === 1) return `I found ${parts[0]}.`;
  if (parts.length === 2) return `I found ${parts[0]} and ${parts[1]}.`;
  return `I found ${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`;
}

function getOverallConfidenceLanguage(confidence: number): string {
  if (confidence >= 0.80) return '';
  if (confidence >= 0.60) return 'Some items need a closer look.';
  return 'Several items need your review.';
}

function getEntityMatchSummary(bindings: SemanticBinding[]): string | null {
  const entityBinding = bindings.find(b => b.semanticRole === 'entity_identifier');
  if (!entityBinding) return null;
  // The displayContext from the agent often contains match info
  return entityBinding.displayContext || null;
}

function getFieldDescription(binding: SemanticBinding): string {
  if (binding.displayContext) return binding.displayContext;
  // Fallback descriptions based on semantic role
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

interface ContentUnitCardProps {
  unit: ContentUnitProposal;
  confirmed: boolean;
  onConfirm: () => void;
  onChangeClassification: (newType: AgentType) => void;
}

function ContentUnitCard({ unit, confirmed, onConfirm, onChangeClassification }: ContentUnitCardProps) {
  const [showClassificationMenu, setShowClassificationMenu] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNegotiationLog, setShowNegotiationLog] = useState(false);

  const isLowConfidence = unit.confidence < 0.60;
  const isMediumConfidence = unit.confidence >= 0.60 && unit.confidence < 0.80;

  // OB-133: Detect document-sourced plan proposals
  const isDocumentPlan = unit.classification === 'plan' && !!unit.documentMetadata;

  // OB-134: Detect PARTIAL claims
  const isPartial = unit.claimType === 'PARTIAL';

  // Get meaningful field bindings (skip unknown with no context)
  const displayBindings = unit.fieldBindings.filter(
    b => b.semanticRole !== 'unknown' || b.displayContext
  );

  const entityMatch = getEntityMatchSummary(unit.fieldBindings);

  // OB-133: Extract component summary from document metadata
  const extractionSummary = unit.documentMetadata?.extractionSummary;
  const componentCount = (extractionSummary?.componentCount as number) || 0;
  const hasVariants = (extractionSummary?.hasVariants as boolean) || false;
  const components = (extractionSummary?.components as Array<{ name: string }>) || [];

  return (
    <Card className={cn(
      'relative transition-all duration-200',
      isLowConfidence && 'ring-1 ring-amber-500/30',
      confirmed && 'ring-1 ring-emerald-500/30 opacity-80'
    )}>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          {isDocumentPlan ? (
            <FileText className="w-5 h-5 text-rose-400 mt-0.5 flex-shrink-0" />
          ) : isPartial ? (
            <Split className="w-5 h-5 text-violet-400 mt-0.5 flex-shrink-0" />
          ) : (
            <FileSpreadsheet className="w-5 h-5 text-zinc-400 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-200">
              {isDocumentPlan ? (
                <>Document: &ldquo;{unit.sourceFile}&rdquo;</>
              ) : isPartial ? (
                <>Sheet: &ldquo;{unit.tabName}&rdquo; <span className="text-violet-400 text-xs font-normal">(split &mdash; {CLASSIFICATION_LABELS[unit.classification]})</span></>
              ) : (
                <>Sheet: &ldquo;{unit.tabName}&rdquo;</>
              )}
            </p>
            <p className={cn(
              'text-sm mt-1',
              isLowConfidence ? 'text-amber-400' : isMediumConfidence ? 'text-zinc-300' : 'text-zinc-300'
            )}>
              {isDocumentPlan
                ? `I identified this as a plan document.`
                : isPartial
                  ? `This sheet has mixed content. I'll process the ${CLASSIFICATION_LABELS[unit.classification].toLowerCase()} fields.`
                  : getConfidenceLanguage(unit.confidence, unit.classification)}
            </p>
          </div>
          {confirmed && (
            <div className="flex items-center gap-1 text-emerald-400 text-xs">
              <Check className="w-3.5 h-3.5" />
              <span>Confirmed</span>
            </div>
          )}
        </div>

        {/* OB-133: Document plan — component summary */}
        {isDocumentPlan && componentCount > 0 && (
          <div className="mb-4 pl-8">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">What I found</p>
            <div className="space-y-1.5">
              <div className="text-sm text-zinc-300">
                {componentCount} component{componentCount !== 1 ? 's' : ''} with rate tables
              </div>
              {hasVariants && (
                <div className="text-sm text-zinc-400">
                  Multiple variants detected
                </div>
              )}
              {components.slice(0, showAdvanced ? undefined : 4).map((comp, i) => (
                <div key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="text-zinc-600">&bull;</span>
                  <span className="text-zinc-300">{comp.name}</span>
                </div>
              ))}
              {!showAdvanced && components.length > 4 && (
                <button
                  onClick={() => setShowAdvanced(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  + {components.length - 4} more components
                </button>
              )}
            </div>
          </div>
        )}

        {/* OB-134: PARTIAL claim — owned + shared fields */}
        {isPartial && unit.ownedFields && unit.ownedFields.length > 0 && (
          <div className="mb-4 pl-8">
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

        {/* Field Bindings — for tabular data proposals */}
        {!isDocumentPlan && !isPartial && displayBindings.length > 0 && (
          <div className="mb-4 pl-8">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">What I found</p>
            <div className="space-y-1.5">
              {displayBindings.slice(0, showAdvanced ? undefined : 5).map((binding, i) => (
                <div key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium text-zinc-200">{binding.sourceField}</span>
                  <span className="text-zinc-600">&mdash;</span>
                  <span className="text-zinc-400">{getFieldDescription(binding)}</span>
                </div>
              ))}
              {!showAdvanced && displayBindings.length > 5 && (
                <button
                  onClick={() => setShowAdvanced(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  + {displayBindings.length - 5} more fields
                </button>
              )}
            </div>
          </div>
        )}

        {/* Entity match info */}
        {entityMatch && (
          <div className="mb-4 pl-8">
            <div className="flex items-start gap-2 text-xs text-zinc-500">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{entityMatch}</span>
            </div>
          </div>
        )}

        {/* Action preview */}
        <div className="mb-4 pl-8">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5">What happens next</p>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{unit.action}</span>
          </div>
        </div>

        {/* Warnings */}
        {unit.warnings.length > 0 && (
          <div className="mb-4 pl-8 space-y-1">
            {unit.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-zinc-500">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500/60" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* OB-134: Negotiation log */}
        {unit.negotiationLog && unit.negotiationLog.length > 0 && (
          <div className="mb-4 pl-8">
            <button
              onClick={() => setShowNegotiationLog(!showNegotiationLog)}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
            >
              <ChevronDown className={cn('w-3 h-3 transition-transform', showNegotiationLog && 'rotate-180')} />
              How did I decide?
            </button>
            {showNegotiationLog && (
              <div className="mt-2 space-y-1 text-xs text-zinc-500 font-mono bg-zinc-900/50 rounded-md p-3">
                {unit.negotiationLog.map((entry, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-zinc-600 w-20 flex-shrink-0">[{entry.stage}]</span>
                    <span>{entry.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!confirmed && (
          <div className="flex items-center gap-3 pl-8 pt-2 border-t border-zinc-800">
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
                Change Classification
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

// ── Main SCIProposal Component ──

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

  const overallSummary = useMemo(() => getOverallSummary(effectiveUnits), [effectiveUnits]);
  const confidenceNote = useMemo(
    () => getOverallConfidenceLanguage(proposal.overallConfidence),
    [proposal.overallConfidence]
  );

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
    // Unconfirm if classification changed
    setConfirmedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleConfirmAll = () => {
    onConfirmAll(effectiveUnits);
  };

  // Streamlined view for all-high-confidence single-action
  const allHighConfidence = effectiveUnits.every(u => u.confidence >= 0.80);
  const [showDetails, setShowDetails] = useState(!allHighConfidence);

  return (
    <div className="space-y-6">
      {/* Proposal Header */}
      <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/50 p-6">
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3">
          <span>{fileName}</span>
          <span>&middot;</span>
          <span>{effectiveUnits.length} {effectiveUnits.length === 1 ? 'item' : 'items'} detected</span>
          {effectiveUnits.some(u => u.claimType === 'PARTIAL') && (
            <>
              <span>&middot;</span>
              <span className="text-violet-400">Mixed content detected</span>
            </>
          )}
          <span>&middot;</span>
          <span className="text-emerald-400">Ready to process</span>
        </div>

        <p className="text-base text-zinc-200">
          {overallSummary}
          {effectiveUnits.length > 1 && " Here's what I'll do with each."}
        </p>

        {confidenceNote && (
          <p className="text-sm text-amber-400/80 mt-2">{confidenceNote}</p>
        )}
      </div>

      {/* Streamlined all-high-confidence view */}
      {allHighConfidence && !showDetails && (
        <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/50 p-6 text-center">
          <p className="text-sm text-zinc-300 mb-4">
            Everything looks clear. {overallSummary} Confirm to proceed.
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

      {/* Content Unit Cards */}
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
