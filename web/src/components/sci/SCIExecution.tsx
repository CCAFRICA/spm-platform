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
  reference: 4,
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
  storagePath?: string; // OB-156: File storage path for bulk server-side processing
  storagePaths?: Record<string, string>; // HF-140: Per-file storage paths (fileName → path)
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
  storagePath,
  storagePaths,
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

  // D18: the durable DATA SURFACE is the only truth for per-unit disposition. After firing execute-bulk we
  // poll session-state + telemetry until the server has settled EVERY unit (bound/resolved/failed) — a dead
  // HTTP response (Vercel's 300s cap fired mid-Ventas in run-5 while the server kept committing and FINISHED)
  // is a NON-EVENT. Per-unit committed rows come from telemetry; a failed unit carries its reason from the
  // spine. Bounded by a stall window that server-progress resets (same shape as the D13 analyze recovery).
  const settleFromSurface = useCallback(async () => {
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
    const STALL_MS = 90_000;
    const trackedIds = confirmedUnits.map(u => u.contentUnitId);
    let lastSettled = -1, lastProgressAt = Date.now();
    while (Date.now() - lastProgressAt < STALL_MS) {
      try {
        const r = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(proposal.proposalId)}&telemetry=1`);
        if (r.ok) {
          const view = await r.json() as { units?: Array<{ unitId: string; state: string; sheetName: string | null; failureClass: string | null }>; telemetry?: { perUnit?: Array<{ sheetName: string | null; expectedRows: number }> } };
          const sUnits = view.units ?? [];
          const rowsBySheet = new Map((view.telemetry?.perUnit ?? []).map(p => [p.sheetName, p.expectedRows]));
          setUnits(prev => prev.map(u => {
            const su = sUnits.find(x => x.unitId === u.contentUnitId);
            if (!su) return u;
            if (su.state === 'bound' || su.state === 'resolved') {
              return { ...u, status: 'complete' as const, result: { contentUnitId: u.contentUnitId, classification: u.classification, success: true, rowsProcessed: rowsBySheet.get(su.sheetName) ?? u.result?.rowsProcessed ?? 0, pipeline: u.classification } };
            }
            if (su.state === 'failed_interpretation') {
              return { ...u, status: 'error' as const, error: su.failureClass ?? u.error ?? 'interpretation failed' };
            }
            return u;
          }));
          const settledCount = trackedIds.filter(id => {
            const su = sUnits.find(x => x.unitId === id);
            return su && ['bound', 'resolved', 'failed_interpretation'].includes(su.state);
          }).length;
          if (settledCount > lastSettled) { lastSettled = settledCount; lastProgressAt = Date.now(); }
          if (settledCount >= trackedIds.length) return; // every tracked unit has a terminal disposition
        }
      } catch { /* keep polling — the surface is the truth, a missed poll self-corrects */ }
      await sleep(2000);
    }
  }, [tenantId, proposal.proposalId, confirmedUnits]);

  // D16/execute-progress: poll the durable session-state spine during execution and reflect per-unit
  // `bound` states AS they STREAM (execute-bulk writes one per unit the moment it commits, keyed by
  // proposalId). Without this the strip sat at 0/N for the entire bulk window even though units were
  // committing — the same spine the completion screen reads, now read live by the in-progress strip.
  useEffect(() => {
    if (executionDone) return;
    const hasActive = units.some(u => u.status === 'processing');
    if (!hasActive) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(proposal.proposalId)}`);
        if (!r.ok || cancelled) return;
        const view = await r.json() as { units: Array<{ unitId: string; state: string }> };
        const boundIds = new Set(view.units.filter(u => u.state === 'bound').map(u => u.unitId));
        if (boundIds.size === 0) return;
        setUnits(prev => prev.some(u => u.status === 'processing' && boundIds.has(u.contentUnitId))
          ? prev.map(u => (u.status === 'processing' && boundIds.has(u.contentUnitId) ? { ...u, status: 'complete' as const } : u))
          : prev);
      } catch { /* best-effort: the fetch return is the source of truth; this only advances the strip */ }
    };
    const interval = setInterval(() => { void poll(); }, 2000);
    void poll();
    return () => { cancelled = true; clearInterval(interval); };
  }, [executionDone, units, tenantId, proposal.proposalId]);

  // OB-156/HF-140: Bulk execution — sends storagePath to server, no row data in HTTP body
  // HF-140: Now accepts explicit path parameter for per-file isolation
  const executeBulk = useCallback(async (dataUnits: ExecutionUnit[], bulkStoragePath?: string) => {
    const effectivePath = bulkStoragePath || storagePath;
    // Mark all data units as processing
    setElapsedSeconds(0);
    setUnits(prev => prev.map(u =>
      dataUnits.some(du => du.contentUnitId === u.contentUnitId)
        ? { ...u, status: 'processing' as const }
        : u
    ));

    // Build content unit metadata (no rawData — server reads from Storage)
    const bulkUnits = dataUnits.map(eu => {
      const proposalUnit = confirmedUnits.find(u => u.contentUnitId === eu.contentUnitId);
      if (!proposalUnit) return null;
      return {
        contentUnitId: eu.contentUnitId,
        confirmedClassification: eu.classification,
        confirmedBindings: proposalUnit.fieldBindings,
        ...(proposalUnit.claimType ? { claimType: proposalUnit.claimType } : {}),
        ...(proposalUnit.ownedFields ? { ownedFields: proposalUnit.ownedFields } : {}),
        ...(proposalUnit.sharedFields ? { sharedFields: proposalUnit.sharedFields } : {}),
        originalClassification: proposalUnit.classification,
        originalConfidence: proposalUnit.confidence,
        // HF-110: Pass HC data for field_identities extraction (DS-009 1.3)
        ...(proposalUnit.classificationTrace ? { classificationTrace: proposalUnit.classificationTrace } : {}),
        ...(proposalUnit.structuralFingerprint ? { structuralFingerprint: proposalUnit.structuralFingerprint } : {}),
        ...(proposalUnit.vocabularyBindings ? { vocabularyBindings: proposalUnit.vocabularyBindings } : {}),
        sourceFile: proposalUnit.sourceFile,
        tabName: proposalUnit.tabName,
      };
    }).filter(Boolean);

    try {
      const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.proposalId,
          tenantId,
          storagePath: effectivePath,
          contentUnits: bulkUnits,
        }),
      });

      // D18: the response is a BONUS, not the truth. A non-OK / dead response is a NON-EVENT — the server
      // may still be committing (run-5: Vercel's 300s cap fired mid-Ventas while the server finished). We
      // log and fall through to read the durable data surface, which is authoritative.
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.warn(`[SCIExecution] execute-bulk responded ${res.status} (reading durable surface): ${errBody.slice(0, 160)}`);
      } else {
        // Optimistic fast-path: seed from the response, but the surface settle below is the final word.
        try {
          const bulkResult: SCIExecutionResult = await res.json();
          for (const result of bulkResult.results) {
            setUnits(prev => prev.map(u => u.contentUnitId === result.contentUnitId
              ? { ...u, status: result.success ? 'complete' as const : 'error' as const, result, error: result.success ? undefined : result.error }
              : u));
          }
        } catch { /* malformed body — the surface settle is authoritative anyway */ }
      }
    } catch (err) {
      // D18: timeout / network drop is also a non-event — do NOT mark units failed. Read the surface.
      console.warn('[SCIExecution] execute-bulk response did not return (reading durable surface):', err instanceof Error ? err.message : err);
    }
    // D18: finalize per-unit disposition from the DURABLE DATA SURFACE, never the (possibly dead) response.
    await settleFromSurface();
    // OB-203 Phase D: trigger the once-per-session settle audit (idempotent —
    // first audit wins; ImportReadyState also invokes it on mount as a backstop).
    // Fire-and-forget: the audit verdict surfaces on the completion screen.
    void fetch('/api/import/sci/settle-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, importSessionId: proposal.proposalId }),
    }).catch(() => { /* completion-screen invocation is the backstop */ });
  }, [confirmedUnits, proposal.proposalId, tenantId, storagePath, settleFromSurface]);

  // Legacy execution — used for plan units (document-based) and fallback when no storagePath
  const executeLegacyUnit = useCallback(async (unit: ExecutionUnit) => {
    const proposalUnit = confirmedUnits.find(u => u.contentUnitId === unit.contentUnitId);
    if (!proposalUnit) throw new Error('Could not find execution data for this content');

    const baseContentUnitId = unit.contentUnitId.replace(/::split$/, '');
    const sheetData = rawData.sheets.find(s => {
      const expectedId = `${rawData.fileName}::${s.sheetName}::${rawData.sheets.indexOf(s)}`;
      return expectedId === baseContentUnitId;
    }) || rawData.sheets.find(s => s.sheetName === unit.tabName);

    const execUnit = {
      contentUnitId: unit.contentUnitId,
      confirmedClassification: unit.classification,
      confirmedBindings: proposalUnit.fieldBindings,
      rawData: sheetData?.rows || [],
      ...(proposalUnit.documentMetadata ? { documentMetadata: proposalUnit.documentMetadata } : {}),
      ...(proposalUnit.claimType ? { claimType: proposalUnit.claimType } : {}),
      ...(proposalUnit.ownedFields ? { ownedFields: proposalUnit.ownedFields } : {}),
      ...(proposalUnit.sharedFields ? { sharedFields: proposalUnit.sharedFields } : {}),
      originalClassification: proposalUnit.classification,
      originalConfidence: proposalUnit.confidence,
      // HF-110: Pass HC data for field_identities extraction (DS-009 1.3)
      ...(proposalUnit.classificationTrace ? { classificationTrace: proposalUnit.classificationTrace } : {}),
      ...(proposalUnit.structuralFingerprint ? { structuralFingerprint: proposalUnit.structuralFingerprint } : {}),
      ...(proposalUnit.vocabularyBindings ? { vocabularyBindings: proposalUnit.vocabularyBindings } : {}),
      sourceFile: proposalUnit.sourceFile,
      tabName: proposalUnit.tabName,
    };

    // HF-239: Unified import route. The legacy execute path is deleted; all
    // content units go through execute-bulk. The bulk route REQUIRES storagePath
    // — the request body shape no longer carries rawData. If no storagePath
    // is available (rare per-unit fallback), surface a structured error.
    if (!storagePath) {
      throw new Error('storagePath required: HF-239 unified import requires Storage transport for all content units');
    }
    const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposalId: proposal.proposalId,
        tenantId,
        storagePath,
        contentUnits: [execUnit],
      }),
    });

    if (!res.ok) {
      throw new Error(`Processing failed (${res.status})`);
    }

    const result: SCIExecutionResult = await res.json();
    return result.results[0];
  }, [confirmedUnits, rawData, proposal.proposalId, tenantId, storagePath]);

  const executeUnits = useCallback(async (unitsToExecute: ExecutionUnit[]) => {
    // OB-156: Split units into plan (legacy) and data (bulk) groups
    const planUnits = unitsToExecute.filter(u => u.classification === 'plan');
    const dataUnits = unitsToExecute.filter(u => u.classification !== 'plan');

    // HF-131: Execute ALL plan units in a SINGLE request so the backend (HF-130)
    // can batch them into one AI interpretation call with full cross-sheet context.
    if (planUnits.length > 0) {
      setElapsedSeconds(0);
      // Mark all plan units as processing
      setUnits(prev => prev.map(u =>
        planUnits.some(pu => pu.contentUnitId === u.contentUnitId)
          ? { ...u, status: 'processing' as const }
          : u
      ));

      // Build execution payloads for ALL plan units
      const planExecUnits = planUnits.map(unit => {
        const proposalUnit = confirmedUnits.find(u => u.contentUnitId === unit.contentUnitId);
        if (!proposalUnit) return null;
        return {
          contentUnitId: unit.contentUnitId,
          confirmedClassification: unit.classification,
          confirmedBindings: proposalUnit.fieldBindings,
          rawData: [] as Record<string, unknown>[], // Plan units have no row data
          ...(proposalUnit.documentMetadata ? { documentMetadata: proposalUnit.documentMetadata } : {}),
          ...(proposalUnit.claimType ? { claimType: proposalUnit.claimType } : {}),
          ...(proposalUnit.ownedFields ? { ownedFields: proposalUnit.ownedFields } : {}),
          ...(proposalUnit.sharedFields ? { sharedFields: proposalUnit.sharedFields } : {}),
          originalClassification: proposalUnit.classification,
          originalConfidence: proposalUnit.confidence,
          ...(proposalUnit.classificationTrace ? { classificationTrace: proposalUnit.classificationTrace } : {}),
          ...(proposalUnit.structuralFingerprint ? { structuralFingerprint: proposalUnit.structuralFingerprint } : {}),
          ...(proposalUnit.vocabularyBindings ? { vocabularyBindings: proposalUnit.vocabularyBindings } : {}),
          sourceFile: proposalUnit.sourceFile,
          tabName: proposalUnit.tabName,
        };
      }).filter(Boolean);

      try {
        // HF-239: plan batching flows through execute-bulk's `case 'plan'` arm.
        // HF-256: send the per-file storage map so the server groups plan units by their
        // source file — each plan file is interpreted with its own path and produces its
        // own rule set (multi-plan-file). storagePath is retained for single-file back-compat.
        const haveAnyPath = !!storagePath || !!(storagePaths && Object.keys(storagePaths).length > 0);
        if (!haveAnyPath) {
          throw new Error('storagePath required: HF-239 unified import requires Storage transport for plan units');
        }
        const res = await fetchWithTimeout('/api/import/sci/execute-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposalId: proposal.proposalId,
            tenantId,
            storagePath,
            storagePaths,
            contentUnits: planExecUnits,
          }),
        });

        if (!res.ok) {
          throw new Error(`Plan processing failed (${res.status})`);
        }

        const planResult: SCIExecutionResult = await res.json();

        // Map results back to individual plan units
        for (const result of planResult.results) {
          setUnits(prev => prev.map(u =>
            u.contentUnitId === result.contentUnitId
              ? {
                  ...u,
                  status: result.success ? 'complete' as const : 'error' as const,
                  result,
                  error: result.success ? undefined : result.error,
                }
              : u
          ));
        }
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        const isNetworkError = err instanceof TypeError && (err.message === 'Failed to fetch' || err.message.includes('network'));
        const errorMsg = isAbort
          ? 'Request timed out — the server may still be processing'
          : err instanceof Error ? err.message : 'Plan processing failed';

        if (isAbort || isNetworkError) {
          // Show checking status for all plan units
          setUnits(prev => prev.map(u =>
            planUnits.some(pu => pu.contentUnitId === u.contentUnitId)
              ? { ...u, error: 'Connection lost — checking if server completed...' }
              : u
          ));

          const recovered = await pollPlanRecovery(tenantId);
          if (recovered) {
            setUnits(prev => prev.map(u =>
              planUnits.some(pu => pu.contentUnitId === u.contentUnitId)
                ? {
                    ...u,
                    status: 'complete' as const,
                    error: undefined,
                    result: {
                      contentUnitId: u.contentUnitId,
                      classification: u.classification,
                      success: true,
                      rowsProcessed: 0,
                      pipeline: 'plan-interpretation',
                    },
                  }
                : u
            ));
          } else {
            // Recovery failed — mark all plan units as error
            setUnits(prev => prev.map(u =>
              planUnits.some(pu => pu.contentUnitId === u.contentUnitId)
                ? { ...u, status: 'error' as const, error: errorMsg }
                : u
            ));
          }
        } else {
          // Non-timeout error — mark all plan units as error
          setUnits(prev => prev.map(u =>
            planUnits.some(pu => pu.contentUnitId === u.contentUnitId)
              ? { ...u, status: 'error' as const, error: errorMsg }
              : u
          ));
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIMARY PATH: Per-file bulk execution via Supabase Storage (OB-174/HF-142)
    // Each file group downloads its own file server-side. No rawData in HTTP body.
    // Legacy fallback retained for graceful degradation when storage upload
    // fails or processing_jobs table is unavailable.
    // ═══════════════════════════════════════════════════════════════════
    if (dataUnits.length > 0 && (storagePaths && Object.keys(storagePaths).length > 0 || storagePath)) {
      const fileGroups = new Map<string, ExecutionUnit[]>();
      for (const unit of dataUnits) {
        const proposalUnit = confirmedUnits.find(u => u.contentUnitId === unit.contentUnitId);
        const sourceFile = proposalUnit?.sourceFile || '_default';
        if (!fileGroups.has(sourceFile)) fileGroups.set(sourceFile, []);
        fileGroups.get(sourceFile)!.push(unit);
      }

      console.log(`[HF-142] File groups (${fileGroups.size}): ${Array.from(fileGroups.keys()).join(', ')}`);
      console.log(`[HF-142] Storage paths available: ${JSON.stringify(storagePaths || {})}`);

      for (const [sourceFile, groupUnits] of Array.from(fileGroups.entries())) {
        // HF-141: Strict per-file path resolution — NO cross-file fallback.
        // Only use storagePaths[sourceFile] (exact match). If missing and only
        // one file was uploaded (single-file case), use storagePath as the
        // single-file fallback. Never use storagePath when multiple files exist.
        const hasMultipleFiles = fileGroups.size > 1;
        const filePath = storagePaths?.[sourceFile] || (!hasMultipleFiles ? storagePath : undefined);
        // HF-142: Log per-file storage path resolution for diagnostic traceability
        console.log(`[HF-142] sourceFile: "${sourceFile}" → storagePath: ${filePath || 'NONE'} (matched: ${!!filePath})`);

        if (filePath) {
          console.log(`[HF-142] Executing bulk for "${sourceFile}" → ${filePath} (${groupUnits.length} units)`);
          await executeBulk(groupUnits, filePath);
        } else {
          // HF-141: No storage path for this specific file — legacy fallback per unit
          console.warn(`[HF-141] No storage path for "${sourceFile}" — using legacy execution`);
          for (const unit of groupUnits) {
            setElapsedSeconds(0);
            setUnits(prev => prev.map(u =>
              u.contentUnitId === unit.contentUnitId
                ? { ...u, status: 'processing' as const }
                : u
            ));
            try {
              const unitResult = await executeLegacyUnit(unit);
              if (unitResult && unitResult.success) {
                setUnits(prev => prev.map(u =>
                  u.contentUnitId === unit.contentUnitId
                    ? { ...u, status: 'complete' as const, result: unitResult }
                    : u
                ));
              } else {
                setUnits(prev => prev.map(u =>
                  u.contentUnitId === unit.contentUnitId
                    ? { ...u, status: 'error' as const, error: unitResult?.error || 'Unknown error', result: unitResult }
                    : u
                ));
              }
            } catch (err) {
              setUnits(prev => prev.map(u =>
                u.contentUnitId === unit.contentUnitId
                  ? { ...u, status: 'error' as const, error: err instanceof Error ? err.message : 'Processing failed' }
                  : u
              ));
            }
          }
        }
      }
    } else if (dataUnits.length > 0) {
      // LEGACY FALLBACK: No storagePath — sends rawData via HTTP body (AP-1 tolerated for degradation).
      // Reached when: (1) storage upload failed, (2) single-file sync path without storage,
      // (3) processing_jobs table unavailable. rawDataRef stores only first file's data.
      for (const unit of dataUnits) {
        setElapsedSeconds(0);
        setUnits(prev => prev.map(u =>
          u.contentUnitId === unit.contentUnitId
            ? { ...u, status: 'processing' as const }
            : u
        ));

        try {
          const unitResult = await executeLegacyUnit(unit);
          if (unitResult && unitResult.success) {
            setUnits(prev => prev.map(u =>
              u.contentUnitId === unit.contentUnitId
                ? { ...u, status: 'complete' as const, result: unitResult }
                : u
            ));
          } else {
            setUnits(prev => prev.map(u =>
              u.contentUnitId === unit.contentUnitId
                ? { ...u, status: 'error' as const, error: unitResult?.error || 'Unknown error', result: unitResult }
                : u
            ));
          }
        } catch (err) {
          setUnits(prev => prev.map(u =>
            u.contentUnitId === unit.contentUnitId
              ? { ...u, status: 'error' as const, error: err instanceof Error ? err.message : 'Processing failed' }
              : u
          ));
        }
      }
    }
  }, [confirmedUnits, rawData, proposal.proposalId, tenantId, storagePath, storagePaths, executeBulk, executeLegacyUnit]);

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
