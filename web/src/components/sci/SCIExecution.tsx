'use client';

// SCI Execution — Orchestrates pipeline execution + renders progress
// OB-129 Phase 4, OB-136 chunking, OB-139 ExecutionProgress integration.
// Zero domain vocabulary. Korean Test applies.

import { useEffect, useState, useCallback } from 'react';
import type {
  ContentUnitProposal,
  AgentType,
  SCIExecutionResult,
  ContentUnitResult,
} from '@/lib/sci/sci-types';
import type { ParsedFileData } from './SCIUpload';
import { ExecutionProgress, toProgressItems } from './ExecutionProgress';

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

  const executeUnits = useCallback(async (unitsToExecute: ExecutionUnit[]) => {
    // Build execution request with full row data
    const executionUnits = unitsToExecute.map(eu => {
      const proposalUnit = confirmedUnits.find(u => u.contentUnitId === eu.contentUnitId);
      if (!proposalUnit) return null;

      // Find matching sheet data from parsed file
      // OB-134: Strip ::split suffix for PARTIAL claims (both halves use same sheet data)
      const baseContentUnitId = eu.contentUnitId.replace(/::split$/, '');
      const sheetData = rawData.sheets.find(s => {
        const expectedId = `${rawData.fileName}::${s.sheetName}::${rawData.sheets.indexOf(s)}`;
        return expectedId === baseContentUnitId;
      }) || rawData.sheets.find(s => s.sheetName === eu.tabName);

      return {
        contentUnitId: eu.contentUnitId,
        confirmedClassification: eu.classification,
        confirmedBindings: proposalUnit.fieldBindings,
        rawData: sheetData?.rows || [],
        // OB-133: Pass document metadata for plan interpretation
        ...(proposalUnit.documentMetadata ? { documentMetadata: proposalUnit.documentMetadata } : {}),
        // OB-134: Pass PARTIAL claim field info for field filtering
        ...(proposalUnit.claimType ? { claimType: proposalUnit.claimType } : {}),
        ...(proposalUnit.ownedFields ? { ownedFields: proposalUnit.ownedFields } : {}),
        ...(proposalUnit.sharedFields ? { sharedFields: proposalUnit.sharedFields } : {}),
        // OB-135: Original prediction for signal outcome recording
        originalClassification: proposalUnit.classification,
        originalConfidence: proposalUnit.confidence,
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

        // Chunk large content units to avoid HTTP 413 (Vercel 4.5MB limit)
        const MAX_ROWS_PER_CHUNK = 5000;
        const rawRows = execUnit.rawData || [];
        const needsChunking = rawRows.length > MAX_ROWS_PER_CHUNK;
        let unitResult: ContentUnitResult | undefined;

        if (needsChunking) {
          // Split into chunks and send sequentially
          let totalProcessed = 0;
          for (let ci = 0; ci < rawRows.length; ci += MAX_ROWS_PER_CHUNK) {
            const chunk = rawRows.slice(ci, ci + MAX_ROWS_PER_CHUNK);
            const chunkUnit = { ...execUnit, rawData: chunk };

            const chunkRes = await fetch('/api/import/sci/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                proposalId: proposal.proposalId,
                tenantId,
                contentUnits: [chunkUnit],
              }),
            });

            if (!chunkRes.ok) {
              throw new Error(`Processing failed (${chunkRes.status}) on chunk ${Math.floor(ci / MAX_ROWS_PER_CHUNK) + 1}`);
            }

            const chunkResult: SCIExecutionResult = await chunkRes.json();
            const cr = chunkResult.results[0];
            if (cr) {
              totalProcessed += cr.rowsProcessed;
              if (!cr.success) {
                unitResult = cr;
                break;
              }
              unitResult = { ...cr, rowsProcessed: totalProcessed };
            }
          }
        } else {
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
          unitResult = result.results[0];
        }

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

    onComplete(result);
  }, [executionDone, units, proposal.proposalId, onComplete]);

  const hasErrors = units.some(u => u.status === 'error');

  const handleRetryFailed = async () => {
    const failedUnits = units.filter(u => u.status === 'error');

    // Reset failed units to pending
    setUnits(prev => prev.map(u =>
      u.status === 'error' ? { ...u, status: 'pending' as const, error: undefined } : u
    ));

    setExecutionDone(false);
    await executeUnits(failedUnits);
    setExecutionDone(true);
  };

  // OB-139: Render via ExecutionProgress
  return (
    <ExecutionProgress
      items={toProgressItems(units)}
      isComplete={executionDone}
      hasErrors={hasErrors}
      onRetryFailed={handleRetryFailed}
      onContinue={onUploadMore}
    />
  );
}
