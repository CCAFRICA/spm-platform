'use client';

// SCI Execution — Progress display, completion state, next actions
// OB-129 Phase 4 — Zero domain vocabulary. Korean Test applies.

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Check,
  Loader2,
  XCircle,
  ArrowRight,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ContentUnitProposal,
  AgentType,
  SCIExecutionResult,
  ContentUnitResult,
} from '@/lib/sci/sci-types';
import type { ParsedFileData } from './SCIUpload';

const CLASSIFICATION_LABELS: Record<AgentType, string> = {
  plan: 'Plan Rules',
  entity: 'Team Roster',
  target: 'Performance Targets',
  transaction: 'Operational Data',
};

const PROCESSING_ORDER: Record<AgentType, number> = {
  plan: 0,
  entity: 1,
  target: 2,
  transaction: 3,
};

type UnitStatus = 'pending' | 'processing' | 'complete' | 'error';

interface ExecutionUnit {
  contentUnitId: string;
  tabName: string;
  classification: AgentType;
  status: UnitStatus;
  result?: ContentUnitResult;
  error?: string;
}

interface SCIExecutionProps {
  proposal: {
    proposalId: string;
    contentUnits: ContentUnitProposal[];
  };
  confirmedUnits: ContentUnitProposal[];
  tenantId: string;
  rawData: ParsedFileData;
  onComplete: (result: SCIExecutionResult) => void;
  onUploadMore: () => void;
}

export function SCIExecution({
  proposal,
  confirmedUnits,
  tenantId,
  rawData,
  onComplete,
  onUploadMore,
}: SCIExecutionProps) {
  const [units, setUnits] = useState<ExecutionUnit[]>(() =>
    [...confirmedUnits]
      .sort((a, b) => PROCESSING_ORDER[a.classification] - PROCESSING_ORDER[b.classification])
      .map(u => ({
        contentUnitId: u.contentUnitId,
        tabName: u.tabName,
        classification: u.classification,
        status: 'pending' as const,
      }))
  );
  const [executionDone, setExecutionDone] = useState(false);
  const [, setOverallResult] = useState<SCIExecutionResult | null>(null);
  const [retrying, setRetrying] = useState(false);

  const executeUnits = useCallback(async (unitsToExecute: ExecutionUnit[]) => {
    // Build execution request with full row data
    const executionUnits = unitsToExecute.map(eu => {
      const proposalUnit = confirmedUnits.find(u => u.contentUnitId === eu.contentUnitId);
      if (!proposalUnit) return null;

      // Find matching sheet data from parsed file
      const sheetData = rawData.sheets.find(s => {
        const expectedId = `${rawData.fileName}::${s.sheetName}::${rawData.sheets.indexOf(s)}`;
        return expectedId === eu.contentUnitId;
      }) || rawData.sheets.find(s => s.sheetName === eu.tabName);

      return {
        contentUnitId: eu.contentUnitId,
        confirmedClassification: eu.classification,
        confirmedBindings: proposalUnit.fieldBindings,
        rawData: sheetData?.rows || [],
      };
    }).filter(Boolean);

    // Process one at a time to show sequential progress
    for (let i = 0; i < unitsToExecute.length; i++) {
      const unit = unitsToExecute[i];

      // Mark as processing
      setUnits(prev => prev.map(u =>
        u.contentUnitId === unit.contentUnitId
          ? { ...u, status: 'processing' as const }
          : u
      ));

      try {
        // Execute this unit
        const execUnit = executionUnits.find(
          eu => eu && eu.contentUnitId === unit.contentUnitId
        );

        if (!execUnit) {
          throw new Error('Could not find execution data for this content');
        }

        const res = await fetch('/api/import/sci/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposalId: proposal.proposalId,
            tenantId,
            contentUnits: [execUnit],
          }),
        });

        if (!res.ok) {
          throw new Error(`Processing failed (${res.status})`);
        }

        const result: SCIExecutionResult = await res.json();
        const unitResult = result.results[0];

        if (unitResult && unitResult.success) {
          setUnits(prev => prev.map(u =>
            u.contentUnitId === unit.contentUnitId
              ? { ...u, status: 'complete' as const, result: unitResult }
              : u
          ));
        } else {
          setUnits(prev => prev.map(u =>
            u.contentUnitId === unit.contentUnitId
              ? {
                  ...u,
                  status: 'error' as const,
                  error: unitResult?.error || 'Unknown error',
                  result: unitResult,
                }
              : u
          ));
        }
      } catch (err) {
        setUnits(prev => prev.map(u =>
          u.contentUnitId === unit.contentUnitId
            ? {
                ...u,
                status: 'error' as const,
                error: err instanceof Error ? err.message : 'Processing failed',
              }
            : u
        ));
      }
    }
  }, [confirmedUnits, rawData, proposal.proposalId, tenantId]);

  // Start execution on mount
  useEffect(() => {
    if (executionDone) return;

    const run = async () => {
      await executeUnits(units);
      setExecutionDone(true);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build overall result when done
  useEffect(() => {
    if (!executionDone) return;

    const results: ContentUnitResult[] = units.map(u => ({
      contentUnitId: u.contentUnitId,
      classification: u.classification,
      success: u.status === 'complete',
      rowsProcessed: u.result?.rowsProcessed || 0,
      pipeline: u.result?.pipeline || u.classification,
      error: u.error,
    }));

    const result: SCIExecutionResult = {
      proposalId: proposal.proposalId,
      results,
      overallSuccess: results.every(r => r.success),
    };

    setOverallResult(result);
    onComplete(result);
  }, [executionDone, units, proposal.proposalId, onComplete]);

  const hasErrors = units.some(u => u.status === 'error');
  const allComplete = executionDone && !hasErrors;

  const handleRetryFailed = async () => {
    setRetrying(true);
    const failedUnits = units.filter(u => u.status === 'error');

    // Reset failed units to pending
    setUnits(prev => prev.map(u =>
      u.status === 'error' ? { ...u, status: 'pending' as const, error: undefined } : u
    ));

    setExecutionDone(false);
    await executeUnits(failedUnits);
    setExecutionDone(true);
    setRetrying(false);
  };

  // Build outcome summary
  const outcomeSummary = units.filter(u => u.status === 'complete').map(u => {
    const rows = u.result?.rowsProcessed || 0;
    const label = CLASSIFICATION_LABELS[u.classification];
    if (u.classification === 'plan') {
      return rows > 0
        ? `${label} interpreted — ${rows} component${rows !== 1 ? 's' : ''} extracted`
        : `${label} interpreted`;
    }
    return `${rows} ${label.toLowerCase()} records committed`;
  });

  return (
    <div className="space-y-6">
      {/* Execution Progress */}
      <Card>
        <CardContent className="p-5">
          <div className="space-y-3">
            {units.map((unit) => (
              <div
                key={unit.contentUnitId}
                className="flex items-center gap-3 py-2"
              >
                {/* Status indicator */}
                <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                  {unit.status === 'pending' && (
                    <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />
                  )}
                  {unit.status === 'processing' && (
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                  )}
                  {unit.status === 'complete' && (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  )}
                  {unit.status === 'error' && (
                    <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-200">{unit.tabName}</span>
                    <span className="text-xs text-zinc-600">&middot;</span>
                    <span className="text-xs text-zinc-500">
                      {CLASSIFICATION_LABELS[unit.classification]}
                    </span>
                  </div>

                  {unit.status === 'processing' && (
                    <p className="text-xs text-indigo-400 mt-0.5">Processing...</p>
                  )}
                  {unit.status === 'complete' && unit.result && (
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {unit.result.rowsProcessed > 0
                        ? `${unit.result.rowsProcessed} records processed`
                        : 'Acknowledged'}
                    </p>
                  )}
                  {unit.status === 'error' && (
                    <p className="text-xs text-red-400 mt-0.5">{unit.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Completion State */}
      {executionDone && (
        <Card className={cn(
          allComplete ? 'ring-1 ring-emerald-500/20' : hasErrors ? 'ring-1 ring-red-500/20' : ''
        )}>
          <CardContent className="p-6">
            {allComplete ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <Check className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-base font-medium text-zinc-200">All done.</span>
                </div>

                <div className="space-y-1.5 mb-6 pl-8">
                  {outcomeSummary.map((summary, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-zinc-400">
                      <span className="text-zinc-600">&bull;</span>
                      <span>{summary}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <span className="text-zinc-600">&bull;</span>
                    <span>Ready to calculate</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pl-8">
                  <Button
                    onClick={() => window.location.href = '/operate/calculate'}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white"
                  >
                    Go to Calculate
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={onUploadMore}
                    className="text-zinc-400 hover:text-zinc-200"
                  >
                    <Upload className="w-4 h-4" />
                    Upload More Files
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <XCircle className="w-4 h-4 text-amber-400" />
                  </div>
                  <span className="text-base font-medium text-zinc-200">Some items need attention.</span>
                </div>

                <div className="space-y-1.5 mb-6 pl-8">
                  {units.filter(u => u.status === 'complete').length > 0 && (
                    <p className="text-sm text-zinc-400">
                      {units.filter(u => u.status === 'complete').length} of {units.length} items processed successfully.
                    </p>
                  )}
                  {units.filter(u => u.status === 'error').map(u => (
                    <div key={u.contentUnitId} className="flex items-start gap-2 text-sm text-red-400">
                      <span className="text-zinc-600">&bull;</span>
                      <span>&ldquo;{u.tabName}&rdquo;: {u.error}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3 pl-8">
                  <Button
                    onClick={handleRetryFailed}
                    disabled={retrying}
                    className="bg-amber-600 hover:bg-amber-500 text-white"
                  >
                    {retrying ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Retry Failed
                  </Button>
                  {units.some(u => u.status === 'complete') && (
                    <Button
                      variant="ghost"
                      onClick={() => window.location.href = '/operate/calculate'}
                      className="text-zinc-400 hover:text-zinc-200"
                    >
                      Continue to Calculate
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
