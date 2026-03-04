'use client';

// SCI Execution — Orchestrates pipeline execution + renders progress
// OB-129 Phase 4, OB-136 chunking, OB-139 ExecutionProgress integration.
// HF-087: 300s fetch timeout, recovery check, elapsed timer, duplicate guard.
// OB-151: Module-level dedup guard, polling recovery, server idempotency.
// Zero domain vocabulary. Korean Test applies.

import { useEffect, useState, useCallback, useRef } from 'react';
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

// HF-087: Match server maxDuration (300s) — prevents browser from giving up before server
const FETCH_TIMEOUT_MS = 300_000;

// OB-151: Module-level guard against duplicate execution.
// useRef resets on component remount (new instance = new ref).
// A module-level Set survives remounts within the same page session.
const executedProposals = new Set<string>();

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

/**
 * HF-087: Fetch with explicit 300s timeout via AbortController.
 * Prevents browser/proxy from silently dropping long-running requests.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * OB-151: Polling recovery check — the server may still be processing when
 * the client connection drops. Poll up to maxWaitMs with increasing intervals.
 */
async function pollPlanRecovery(
  tenantId: string,
  maxWaitMs: number = 90_000,
): Promise<boolean> {
  const startTime = Date.now();
  // Poll intervals: 5s, 10s, 15s, 15s, 15s, ...
  const intervals = [5000, 10000, 15000, 15000, 15000, 15000, 15000];
  let attempt = 0;

  while (Date.now() - startTime < maxWaitMs) {
    const waitMs = intervals[Math.min(attempt, intervals.length - 1)];
    await new Promise(resolve => setTimeout(resolve, waitMs));
    attempt++;

    try {
      const res = await fetch(`/api/plan-readiness?tenantId=${encodeURIComponent(tenantId)}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data.plans) && data.plans.length > 0) {
        return true;
      }
    } catch {
      // Network error — keep polling
    }
  }
  return false;
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
  // HF-087: Track elapsed time for active processing
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // OB-151: useRef as secondary guard (works for strict mode double-invocation)
  const executingRef = useRef(false);

  // HF-087: Elapsed timer — ticks every second while processing
  useEffect(() => {
    if (executionDone) return;
    const hasActive = units.some(u => u.status === 'processing');
    if (!hasActive) return;

    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [executionDone, units]);

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

      // Mark as processing + reset elapsed timer
      setElapsedSeconds(0);
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

            // HF-087: Use fetchWithTimeout (300s)
            const chunkRes = await fetchWithTimeout('/api/import/sci/execute', {
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
          // HF-087: Use fetchWithTimeout (300s)
          const res = await fetchWithTimeout('/api/import/sci/execute', {
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
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        const isNetworkError = err instanceof TypeError && (err.message === 'Failed to fetch' || err.message.includes('network'));
        const errorMsg = isAbort
          ? 'Request timed out — the server may still be processing'
          : err instanceof Error ? err.message : 'Processing failed';

        // OB-151: Polling recovery — if the fetch failed due to timeout/network
        // for a plan unit, poll for up to 90s to see if server actually succeeded.
        if ((isAbort || isNetworkError) && unit.classification === 'plan') {
          // Update UI to show we're waiting for server
          setUnits(prev => prev.map(u =>
            u.contentUnitId === unit.contentUnitId
              ? { ...u, error: 'Connection lost — checking if server completed...' }
              : u
          ));

          const recovered = await pollPlanRecovery(tenantId);
          if (recovered) {
            setUnits(prev => prev.map(u =>
              u.contentUnitId === unit.contentUnitId
                ? {
                    ...u,
                    status: 'complete' as const,
                    error: undefined,
                    result: {
                      contentUnitId: unit.contentUnitId,
                      classification: unit.classification,
                      success: true,
                      rowsProcessed: 0,
                      pipeline: 'plan-interpretation',
                    },
                  }
                : u
            ));
            continue; // Skip the error state — plan was actually saved
          }
        }

        setUnits(prev => prev.map(u =>
          u.contentUnitId === unit.contentUnitId
            ? {
                ...u,
                status: 'error' as const,
                error: errorMsg,
              }
            : u
        ));
      }
    }
  }, [confirmedUnits, rawData, proposal.proposalId, tenantId]);

  // Start execution on mount — OB-151: dual guard (module-level Set + useRef)
  useEffect(() => {
    // Primary guard: module-level Set survives component remount
    if (executedProposals.has(proposal.proposalId)) return;
    // Secondary guard: useRef survives strict mode double-invocation
    if (executionDone || executingRef.current) return;

    executedProposals.add(proposal.proposalId);
    executingRef.current = true;

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
  // HF-087: Track if retry is in progress to prevent duplicate clicks
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryFailed = async () => {
    if (isRetrying) return; // Prevent duplicate retry
    setIsRetrying(true);

    const failedUnits = units.filter(u => u.status === 'error');

    // Reset failed units to pending
    setUnits(prev => prev.map(u =>
      u.status === 'error' ? { ...u, status: 'pending' as const, error: undefined } : u
    ));

    // OB-151: Allow retry to execute (clear module-level guard for this proposal)
    executedProposals.delete(proposal.proposalId);

    setExecutionDone(false);
    await executeUnits(failedUnits);
    setExecutionDone(true);
    setIsRetrying(false);
  };

  // OB-139: Render via ExecutionProgress
  // HF-087: Pass elapsed time for long operations
  return (
    <ExecutionProgress
      items={toProgressItems(units)}
      isComplete={executionDone}
      hasErrors={hasErrors}
      onRetryFailed={handleRetryFailed}
      onContinue={onUploadMore}
      elapsedSeconds={elapsedSeconds}
      isRetrying={isRetrying}
    />
  );
}
