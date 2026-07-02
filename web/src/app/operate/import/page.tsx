'use client';

// SCI Import Page — Full import experience
// OB-129 (foundation), OB-138 (proposal intelligence), OB-139 (post-confirm).
// State machine: upload → analyzing → proposal → executing → complete → error
// Zero domain vocabulary. Korean Test applies.

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { RequireCapability } from '@/components/auth/RequireCapability';
import { SCIUpload, type FileInfo, type ParsedFileData } from '@/components/sci/SCIUpload';
import { SCIProposalView } from '@/components/sci/SCIProposal';
import { SCIExecution } from '@/components/sci/SCIExecution';
import { ImportReadyState } from '@/components/sci/ImportReadyState';
import { PulseLoadProgress } from '@/components/sci/PulseLoadProgress';
import { RemediationReview } from '@/components/remediation/RemediationReview'; // OB-249 (P7)
import { ClearedSourcePanel } from '@/components/prism/ClearedSourcePanel'; // OB-250 (PRISM import source)
import { ImportProgress } from '@/components/sci/ImportProgress';
import { ImportTelemetryPanel } from '@/components/sci/ImportTelemetryPanel';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import type {
  SCIProposal,
  ContentUnitProposal,
  SCIExecutionResult,
  ContentUnitResult,
} from '@/lib/sci/sci-types';
// HF-356 (I8): poll discipline — a 401 stops the analyze progress/recovery polls (and aborts analyze)
// instead of hammering a failing endpoint for the full stall window; a 5xx streak backs off then gives up.
import { pollDecision, newPollState, POLL_UNAUTHORIZED_MESSAGE, type PollOutcome } from '@/lib/sci/poll-discipline';

// ============================================================
// STATE MACHINE
// ============================================================

type ImportState =
  | { phase: 'upload' }
  | { phase: 'analyzing'; files: FileInfo[] }
  | { phase: 'processing'; sessionId: string; files: FileInfo[] } // OB-174: async processing
  | { phase: 'proposal'; proposal: SCIProposal; rawData: ParsedFileData; fileName: string }
  | { phase: 'executing'; proposal: SCIProposal; confirmedUnits: ContentUnitProposal[]; rawData: ParsedFileData; storagePath?: string; storagePaths?: Record<string, string>; asyncSessionId?: string | null }
  // HF-360 (Part C): the rows are STAGED and the pg_cron worker is loading them off the serverless clock.
  // The page waits here (truthful PulseLoadProgress surface) and runs post-commit finalize only once the
  // load completes (entity resolution reads committed_data — it must not run at stage time).
  | { phase: 'loading'; executionResult: SCIExecutionResult; pulseLoadJob: { jobId: string; totalPulses: number; totalRows: number } }
  | { phase: 'complete'; executionResult: SCIExecutionResult }
  | { phase: 'error'; error: string; canRetry: boolean };

interface PostImportData {
  totalRowsCommitted: number;
  results: ContentUnitResult[];
  importSessionId?: string;   // OB-203 Phase 5 (D10): completion screen reads SessionStateView for the full unit set
  entityCount?: number;
  planName?: string;
  componentCount?: number;
  sourceDateRange?: { min: string; max: string } | null;
}

const ANALYSIS_SAMPLE_SIZE = 50;

// OB-203 Phase 5 (D4 client-tier failure surface): the analyze fetch must never hang the UI into an
// infinite spinner. OB-203 D12: the client OWNS the session id, kicks off analyze, and watches the
// durable SessionStateView for progress. The timeout is STALL-based (no new unit-state for STALL_MS),
// NEVER total-duration — a long-but-progressing analysis (the 16-sheet / 162,956-row holdout took
// ~120s) is never discarded. If the response races a stall-abort or the network drops, the proposal
// is RECOVERED from the session (analyze persists it; the session read is the source of truth).
const ANALYZE_STALL_MS = 60_000;
async function analyzeTabular(
  tenantId: string,
  importSessionId: string,
  analysisFiles: unknown,
  onProgress: (settled: number, total: number) => void,
): Promise<SCIProposal> {
  const controller = new AbortController();
  let lastProgressAt = Date.now();
  let lastCount = -1;
  const progressPollState = newPollState(); // HF-356 (I8): 401 → abort analyze; 5xx/network streak → give up.
  const poll = setInterval(() => {
    void (async () => {
      let outcome: PollOutcome = { ok: false, networkError: true };
      try {
        const r = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(importSessionId)}`);
        outcome = { ok: r.ok, status: r.status };
        if (r.ok) {
          progressPollState.serverErrors = 0; // a good read clears the failure streak
          const view = await r.json() as { units: Array<{ state: string }>; progressTick?: number };
          // OB-203 Phase D: the monotonic progress tick is total_signals_written on the
          // session telemetry record (the view no longer carries per-unit history).
          const count = view.progressTick ?? 0;
          if (count > lastCount) {
            lastCount = count;
            lastProgressAt = Date.now();
            // D14: count units that have reached comprehension (or beyond) — the streamed `comprehended`
            // states ARE the mid-file progress. The prior filter counted only terminal states, so the
            // strip sat at 0/N through the whole comprehension stretch even as states streamed.
            const done = view.units.filter(u => ['comprehended', 'classified', 'bound', 'resolved', 'failed_interpretation'].includes(u.state)).length;
            onProgress(done, view.units.length);
          }
        }
      } catch { /* network drop — outcome stays networkError; counted toward the give-up cap */ }
      // HF-356 (I8): a 401/403 (auth gone) or a 5xx/network streak past the cap → abort analyze + stop this
      // poll, rather than polling a dead endpoint until the stall window elapses.
      if (!outcome.ok && pollDecision(progressPollState, outcome, 2000).action === 'stop') {
        clearInterval(poll);
        controller.abort();
        return;
      }
      if (Date.now() - lastProgressAt > ANALYZE_STALL_MS) controller.abort();
    })();
  }, 2000);

  try {
    const res = await fetch('/api/import/sci/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ tenantId, importSessionId, files: analysisFiles }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error((err as { error?: string }).error || `Analysis failed (${res.status})`); }
    return await res.json() as SCIProposal;
  } catch (e) {
    // D13: recovery is a POLL, not a single shot. The response raced the abort / the network dropped —
    // keep polling the proposal AND the server session. A 404 while states still advance = keep
    // waiting. Only surface failure when the SERVER session is genuinely quiet for the stall window
    // AND no proposal has materialized.
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
    let recoverCount = lastCount;
    let recoverProgressAt = Date.now();
    const recoverPollState = newPollState(); // HF-356 (I8): a 401 makes recovery futile — stop; 5xx streak → give up.
    while (Date.now() - recoverProgressAt < ANALYZE_STALL_MS) {
      let outcome: PollOutcome = { ok: false, networkError: true };
      try {
        const rec = await fetch(`/api/import/sci/proposal?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(importSessionId)}`);
        if (rec.ok) return await rec.json() as SCIProposal;   // proposal persisted — recovered
        // A 401/403 on the proposal read means auth is gone — recovery cannot succeed.
        if (rec.status === 401 || rec.status === 403) throw new Error(POLL_UNAUTHORIZED_MESSAGE);
      } catch (recErr) {
        if (recErr instanceof Error && recErr.message === POLL_UNAUTHORIZED_MESSAGE) throw recErr;
        /* otherwise keep polling */
      }
      try {
        const r = await fetch(`/api/import/sci/session-state?tenantId=${encodeURIComponent(tenantId)}&importSessionId=${encodeURIComponent(importSessionId)}`);
        outcome = { ok: r.ok, status: r.status };
        if (r.ok) {
          recoverPollState.serverErrors = 0;
          const view = await r.json() as { progressTick?: number };
          const c = view.progressTick ?? 0;   // OB-203 Phase D: monotonic tick from the session record
          if (c > recoverCount) { recoverCount = c; recoverProgressAt = Date.now(); }   // server still advancing → keep waiting
        }
      } catch { /* network drop — outcome stays networkError; counted toward the give-up cap */ }
      // HF-356 (I8): 401 → auth gone, stop now; 5xx/network streak past the cap → endpoint down, give up.
      if (!outcome.ok) {
        const verdict = pollDecision(recoverPollState, outcome, 2000);
        if (verdict.action === 'stop') {
          if (verdict.reason === 'unauthorized') throw new Error(POLL_UNAUTHORIZED_MESSAGE);
          break; // server gave up — fall to the failure throw below
        }
        await sleep(verdict.delayMs);
      } else {
        await sleep(2000);
      }
    }
    // Server quiet for the full stall window AND no proposal — a genuine failure.
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Analysis stopped responding. The service may be busy; please try again.');
    }
    throw e instanceof Error ? e : new Error('Analysis could not reach the server. Check your connection and try again.');
  } finally {
    clearInterval(poll);
  }
}

const PHASE_SUBTITLES: Record<string, string> = {
  upload: 'Upload your data and the platform will handle the rest.',
  analyzing: 'Understanding your data...',
  processing: '',  // ImportProgress shows its own header
  proposal: 'Review what was found.',
  executing: '',  // ExecutionProgress shows its own header
  loading: '',    // HF-360: PulseLoadProgress shows its own header
  complete: '',   // ImportReadyState shows its own header
  error: 'Something went wrong.',
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OperateImportPage() {
  const { currentTenant } = useTenant();
  const router = useRouter();
  const isVialuce = useIsVialuce();
  const [state, setState] = useState<ImportState>({ phase: 'upload' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rawDataRef = useRef<ParsedFileData | null>(null);
  const importSessionIdRef = useRef<string | null>(null); // OB-203 §2: shared analyze/execute session id
  const [postImportData, setPostImportData] = useState<PostImportData | null>(null);
  // OB-203 D12: live analyze progress (settled/total sheets) from the durable SessionStateView poll.
  const [analyzeProgress, setAnalyzeProgress] = useState<{ settled: number; total: number } | null>(null);

  const tenantId = currentTenant?.id || '';
  // HF-140: Track storage upload for ALL files (runs in parallel with analysis)
  const storagePathsRef = useRef<Record<string, string>>({});
  // HF-372 Phase E: verbatim storage rejections, surfaced to the user when the upload gate fails.
  const uploadFailuresRef = useRef<string[]>([]);
  const storageUploadPromiseRef = useRef<Promise<void> | null>(null);
  // OB-251: the async (OB-174) classify session id, retained so the COMMIT confirmation can close the
  // processing_jobs lifecycle (classified → committing → committed). Null for the synchronous path
  // (no jobs were created), where the status updates below are harmless no-ops.
  const asyncSessionIdRef = useRef<string | null>(null);
  // OB-256 (W-6): the proposalId whose import is already in flight — guards against a second click during
  // the async storage-await firing a DUPLICATE execute-bulk dispatch (SINGLE-FLIGHT contention, orphaned
  // claims, wasted LLM calls). One dispatch per proposal; a later DIFFERENT import has a new id and proceeds.
  const confirmingProposalRef = useRef<string | null>(null);

  const handleError = useCallback((message: string) => {
    setErrorMessage(message);
    setTimeout(() => setErrorMessage(null), 8000);
  }, []);

  // ── Upload → Analyzing → Proposal ──

  const handleAnalysisStart = useCallback(async (files: FileInfo[]) => {
    if (!tenantId) {
      handleError('No workspace selected. Please select a workspace first.');
      return;
    }

    setAnalyzeProgress(null);
    setState({ phase: 'analyzing', files });
    setErrorMessage(null);

    try {
      // OB-175: rawDataRef stores first file only — used for legacy execution fallback
      // and row count display in SCIProposalView. Primary path (OB-174 async) downloads
      // files server-side from Supabase Storage, so rawData is not needed for commitment.
      if (files.length > 0) {
        rawDataRef.current = files[0].parsedData;
      }

      // HF-255: DECOUPLE the Storage-upload set from the async-process set.
      // - uploadableFiles = every file carrying raw bytes (XLSX, CSV/TSV, AND
      //   PDF/PPTX/DOCX documents). ALL formats upload to ingestion-raw so a
      //   document-format plan obtains a storagePath (restores OB-133 any-format
      //   import regressed by HF-239). Format-agnostic: keys on `rawFile`
      //   presence only, no extension/format literal (Korean Test).
      // - spreadsheetFiles (non-document) continues to gate the spreadsheet-only
      //   async processing-jobs / XLSX-worker path below — unchanged.
      const uploadableFiles = files.filter(f => f.rawFile);
      const spreadsheetFiles = files.filter(f => f.rawFile && !f.parsedData.documentBase64);
      // HF-141: Upload ALL uploadable files to Supabase Storage in parallel.
      // Each file gets its own storage path with a unique suffix (index + random)
      // to prevent any collision or ambiguity. Keyed by filename for lookup.
      if (uploadableFiles.length > 0) {
        storageUploadPromiseRef.current = (async () => {
          try {
            const supabase = createClient();
            const paths: Record<string, string> = {};
            uploadFailuresRef.current = []; // fresh per attempt
            const baseTimestamp = Date.now();
            await Promise.all(uploadableFiles.map(async (file, index) => {
              // HF-141: Unique path per file — timestamp + index + random suffix
              const uniqueSuffix = `${baseTimestamp}_${index}_${crypto.randomUUID().substring(0, 8)}`;
              const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
              const path = `${tenantId}/${uniqueSuffix}_${sanitized}`;
              const { error: uploadErr } = await supabase.storage
                .from('ingestion-raw')
                .upload(path, file.rawFile!, { cacheControl: '3600', upsert: false });
              if (uploadErr) {
                // HF-372 Phase E (C2): the storage rejection reaches the USER verbatim — a bucket/
                // project size-limit rejection previously died in the console while the screen said
                // only "Please retry" with no limit named.
                console.error(`[HF-141] Storage upload FAILED for ${file.name}:`, uploadErr.message);
                uploadFailuresRef.current.push(`"${file.name}" (${(file.rawFile!.size / 1048576).toFixed(1)}MB): ${uploadErr.message}`);
              } else {
                paths[file.name] = path;
                console.log(`[HF-141] File uploaded: ${file.name} → ${path} (${(file.size / 1024).toFixed(0)}KB)`);
              }
            }));
            storagePathsRef.current = paths;
            console.log(`[HF-141] Upload complete: ${Object.keys(paths).length}/${uploadableFiles.length} files`);
          } catch (err) {
            console.error('[HF-141] Storage upload error:', err);
          }
        })();
      }
      // HF-256: the async spreadsheet fast-path is eligible only when the import is
      // PURELY spreadsheets (no document files). A mixed set (any PDF/PPTX/DOCX present)
      // takes the synchronous per-file dispatch below, which routes documents to the Plan
      // Agent AND tabular files to analyze — so documents are never dropped by the
      // spreadsheet-only async worker. (Was: gated on files[0] only, which dropped
      // documents whenever the first file happened to be a spreadsheet.)
      const allSpreadsheets = spreadsheetFiles.length === files.length;

      // HF-355 (I1, SR-34): spreadsheet ingestion is the ASYNC path ONLY. The job is minted
      // SERVER-SIDE by /api/import/sci/enqueue (service-role + the platform.data_operations capability
      // gate) — never a client-side insert (AP-3, the 403 source) and NEVER a fallback to the
      // synchronous full-materialization path (the production-outage path). On any enqueue failure the
      // import STOPS and surfaces a clear, actionable error; it does not invoke execute-bulk.
      if (allSpreadsheets && spreadsheetFiles.length > 0) {
        // Wait for storage uploads to complete.
        if (storageUploadPromiseRef.current) {
          await storageUploadPromiseRef.current;
        }
        const storagePaths = storagePathsRef.current;

        if (!spreadsheetFiles.every(f => storagePaths[f.name])) {
          // Upload did not complete — STOP (no sync fallback; the worker would have nothing to read).
          // HF-372 Phase E (C2): name the actual rejection(s) — a size-limit refusal is actionable
          // only when the user can see WHAT was refused and WHY.
          const detail = uploadFailuresRef.current.length > 0 ? ` ${uploadFailuresRef.current.join(' | ')}` : '';
          setState({ phase: 'error', error: `The file upload did not complete.${detail} Please retry the import.`, canRetry: true });
          return;
        }

        const sessionId = crypto.randomUUID();
        const res = await fetch('/api/import/sci/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            sessionId,
            files: spreadsheetFiles.map(f => {
              const path = storagePaths[f.name];
              return { storagePath: path, fileName: path.split('/').pop() || f.name, fileSizeBytes: f.size };
            }),
          }),
        });
        if (!res.ok) {
          // HF-355 I1: STOP. The import was NOT performed. Surface what happened + the next action.
          // NEVER fall back to the synchronous execute-bulk materialization path.
          const detail = await res.json().catch(() => ({} as { error?: string }));
          setState({
            phase: 'error',
            error: detail.error ?? `Could not start the import (HTTP ${res.status}). The import was not performed.`,
            canRetry: res.status >= 500,
          });
          return;
        }
        const { jobIds } = await res.json() as { jobIds: string[] };

        // Fire the per-file workers (client-initiated, cron-backstopped by /api/import/sci/dispatch-jobs).
        for (const jobId of jobIds) {
          fetch('/api/import/sci/process-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId }),
          }).catch(err => console.warn('[HF-355] Worker fire failed:', err));
        }

        asyncSessionIdRef.current = sessionId; // OB-251: retained to close the commit lifecycle
        setState({ phase: 'processing', sessionId, files });
        return;
      }

      // HF-256 (Decision 82): per-file route + unified proposal. The import is NOT
      // classified by files[0]. Each file is dispatched to its format's analyzer —
      // documents (PDF/PPTX/DOCX) -> analyze-document (one call per document, concurrent);
      // tabular files -> analyze (one call; the route already loops files server-side).
      // All content units merge into ONE proposal. Single-file / single-call imports
      // (one document, or tabular-only) use that one proposal verbatim — byte-identical
      // to the pre-HF path; merging happens only for genuinely mixed / multi-document sets.
      const documentFiles = files.filter(f => f.parsedData.documentBase64);
      const tabularFiles = files.filter(f => !f.parsedData.documentBase64);

      let tabularProposal: SCIProposal | null = null;
      if (tabularFiles.length > 0) {
        const analysisFiles = tabularFiles.map(f => ({
          fileName: f.parsedData.fileName,
          sheets: f.parsedData.sheets.map(s => ({
            sheetName: s.sheetName,
            columns: s.columns,
            rows: s.rows.slice(0, ANALYSIS_SAMPLE_SIZE),
            totalRowCount: s.totalRowCount,
          })),
        }));
        // OB-203 D12: state-observed, stall-based (never discards a progressing analysis).
        const importSessionId = crypto.randomUUID();
        importSessionIdRef.current = importSessionId; // OB-203 §2: telemetry panel keys off the same session
        tabularProposal = await analyzeTabular(tenantId, importSessionId, analysisFiles, (settled, total) => {
          setAnalyzeProgress({ settled, total });
        });
      }

      const documentProposals = await Promise.all(documentFiles.map(async (f) => {
        const res = await fetch('/api/import/sci/analyze-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            fileName: f.parsedData.fileName,
            fileBase64: f.parsedData.documentBase64,
            mimeType: f.parsedData.documentMimeType,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Document analysis failed' }));
          throw new Error(err.error || `Document analysis failed (${res.status})`);
        }
        return res.json() as Promise<SCIProposal>;
      }));

      let proposal: SCIProposal;
      if (documentFiles.length === 0 && tabularProposal) {
        // Tabular-only (single XLSX or multi-spreadsheet) — verbatim, byte-identical.
        proposal = tabularProposal;
      } else if (tabularFiles.length === 0 && documentProposals.length === 1) {
        // Single document — verbatim, identical to the pre-HF isDocument path.
        proposal = documentProposals[0];
      } else {
        // Mixed-format and/or multi-document: merge all content units into ONE proposal.
        const base = tabularProposal ?? documentProposals[0];
        if (!base) {
          throw new Error('No files could be analyzed');
        }
        const mergedContentUnits = [
          ...(tabularProposal?.contentUnits ?? []),
          ...documentProposals.flatMap(p => p.contentUnits ?? []),
        ];
        proposal = {
          ...base,
          contentUnits: mergedContentUnits,
          sourceFiles: files.map(f => f.parsedData.fileName),
          processingOrder: mergedContentUnits.map(u => u.contentUnitId),
          overallConfidence: mergedContentUnits.length > 0
            ? mergedContentUnits.reduce((s, u) => s + (u.confidence ?? 0), 0) / mergedContentUnits.length
            : base.overallConfidence,
          requiresHumanReview: (tabularProposal?.requiresHumanReview ?? false)
            || documentProposals.some(p => p.requiresHumanReview),
        };
      }

      setState({
        phase: 'proposal',
        proposal,
        rawData: rawDataRef.current!,
        fileName: files[0]?.name || 'Unknown file',
      });
    } catch (err) {
      setState({
        phase: 'error',
        error: err instanceof Error ? err.message : 'Something went wrong analyzing your file. Try again or contact support.',
        canRetry: true,
      });
    }
  }, [tenantId, handleError]);

  // ── Processing → Proposal (OB-174: async jobs classified → build merged proposal) ──

  const handleAllClassified = useCallback((jobs: Array<{ id: string; proposal: Record<string, unknown> | null; file_name: string }>) => {
    // Merge proposals from all classified jobs into a single SCIProposal
    const allUnits: ContentUnitProposal[] = [];
    for (const job of jobs) {
      const jobProposal = job.proposal as { contentUnits?: ContentUnitProposal[] } | null;
      if (jobProposal?.contentUnits) {
        allUnits.push(...jobProposal.contentUnits);
      }
    }

    const mergedProposal: SCIProposal = {
      proposalId: crypto.randomUUID(),
      tenantId,
      sourceFiles: jobs.map(j => j.file_name),
      contentUnits: allUnits,
      processingOrder: allUnits.map(u => u.contentUnitId),
      overallConfidence: allUnits.length > 0
        ? allUnits.reduce((s, u) => s + u.confidence, 0) / allUnits.length
        : 0,
      requiresHumanReview: false,
      timestamp: new Date().toISOString(),
    };

    setState({
      phase: 'proposal',
      proposal: mergedProposal,
      rawData: rawDataRef.current || { fileName: '', sheets: [] },
      // OB-175: Display original file names, strip HF-141 storage prefix
      fileName: jobs.map(j => j.file_name.replace(/^\d+_\d+_[a-f0-9]{8}_/, '')).join(', '),
    });
  }, [tenantId]);

  // ── Proposal → Executing ──

  const handleConfirmAll = useCallback(async (confirmedUnits: ContentUnitProposal[]) => {
    if (state.phase !== 'proposal') return;
    // OB-256 (W-6): one dispatch per proposal. A rapid second click re-enters here while the first call is
    // still awaiting storage (phase is still 'proposal' in this stale closure), firing a duplicate
    // execute-bulk. The ref is synchronous, so the second entry is rejected before any dispatch.
    if (confirmingProposalRef.current === state.proposal.proposalId) return;
    confirmingProposalRef.current = state.proposal.proposalId;

    // HF-140: Wait for ALL storage uploads to complete
    if (storageUploadPromiseRef.current) {
      await storageUploadPromiseRef.current;
    }
    const storagePaths = storagePathsRef.current;
    // Backwards compat: first path as single storagePath
    const storagePath = Object.values(storagePaths)[0] || undefined;

    // HF-372 Phase D: the browser NO LONGER writes job status. The server is the single writer —
    // execute-bulk stamps 'committing' at entry (service-role, immune to the platform-operator RLS
    // hole that silently no-oped this write and left every such import lying at 'classified').

    setState({
      phase: 'executing',
      proposal: state.proposal,
      confirmedUnits,
      rawData: state.rawData,
      storagePath,
      storagePaths,
      asyncSessionId: asyncSessionIdRef.current, // HF-358 (Part B-1): thread the real session_id to the commit
    });
  }, [state]);

  // ── Executing → Complete ──

  // HF-300 (C3, DIAG-071): the CRITICAL post-commit work — entity resolution + entity_id back-link,
  // input_bindings invalidation, rule_set_assignments, and the flywheel aggregation. It READS committed_data,
  // so it must run only AFTER the rows are actually in the table: for the synchronous path that is at
  // execution-complete; for the HF-360 hand-off it is after the worker finishes the load (handleLoadComplete).
  // Fire-and-forget + idempotent (the server runs each to completion in its own request).
  const fireFinalizeAndFlywheel = useCallback((proposalId: string) => {
    if (!tenantId) return;
    void fetch('/api/import/sci/finalize-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, proposalId }),
    })
      .then(r => console.log(`[HF-300] finalize-import dispatched: HTTP ${r.status}`))
      .catch(err => console.warn('[HF-300] finalize-import dispatch failed:', err));

    // HF-372 Phase D: the browser's 'committed' write is REMOVED — execute-bulk writes 'committed'
    // server-side when the rows are durable, and finalize-import writes 'finalized' when entity
    // resolution + assignments complete. The durable record can no longer depend on this tab.
    void fetch('/api/import/sci/aggregate-flywheel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId }),
    }).catch(() => { /* best-effort: aggregation advances recognition; never blocks completion */ });
  }, [tenantId]);

  const goComplete = useCallback((result: SCIExecutionResult, totalRows: number) => {
    setPostImportData({
      totalRowsCommitted: totalRows,
      results: result.results,
      importSessionId: result.proposalId,   // = comprehension-session id; completion reads the full unit set
    });
    setState({ phase: 'complete', executionResult: result });
  }, []);

  const handleExecutionComplete = useCallback((result: SCIExecutionResult) => {
    // HF-360 (Part C): staging succeeded but the hand-off enqueue failed — the rows are staged yet nothing
    // will load them. Surface a clear, recoverable error; never a false "0 rows imported" completion.
    if (result.pulseLoadEnqueueFailed) {
      setState({ phase: 'error', error: 'Your data was staged but could not be handed to the loader. No rows were loaded. Please re-import to try again.', canRetry: true });
      return;
    }
    // HF-360 (Part C): the import HANDED OFF its loads — the rows are STAGED, not in committed_data yet.
    // Wait in the 'loading' phase (truthful surface) and DO NOT finalize now (entity resolution would read
    // an empty table). handleLoadComplete fires finalize + flywheel once the worker has loaded every pulse.
    if (result.pulseLoadJob) {
      setState({ phase: 'loading', executionResult: result, pulseLoadJob: result.pulseLoadJob });
      return;
    }
    // Synchronous path (hand-off off): the rows are already loaded — finalize + complete now.
    // HF-373 Phase F (D7): finalize fires only when SOMETHING committed. An all-failed result has
    // nothing for entity resolution, and its finalize's blind terminal stamp is what recorded the
    // failed 86K import as "finalized/completed" (the server-side waitUntil already guards on
    // overallSuccess — this mirrors it). Partial success still finalizes the committed part; the
    // outcome-aware stamp preserves each failed job's failure.
    const totalRows = result.results.filter(r => r.success).reduce((s, r) => s + r.rowsProcessed, 0);
    const anySuccess = result.results.some(r => r.success);
    if (anySuccess) {
      fireFinalizeAndFlywheel(result.proposalId);
    } else {
      console.warn('[import] every unit failed — finalize skipped (nothing committed); the job record carries the failure');
    }
    goComplete(result, totalRows);
  }, [fireFinalizeAndFlywheel, goComplete]);

  // HF-360 (Part C): the worker finished loading every staged pulse — NOW run post-commit finalize (against
  // the loaded committed_data) and transition to the completion screen with the truthful loaded-row total.
  const handleLoadComplete = useCallback((result: SCIExecutionResult, rowsLoaded: number) => {
    fireFinalizeAndFlywheel(result.proposalId);
    goComplete(result, rowsLoaded);
  }, [fireFinalizeAndFlywheel, goComplete]);

  // ── Fetch post-import enrichment data ──

  useEffect(() => {
    if (state.phase !== 'complete' || !tenantId || !postImportData) return;
    // Already enriched
    if (postImportData.entityCount != null) return;

    const fetchEnrichment = async () => {
      try {
        // Fetch plan readiness data (plan name, entity count)
        const res = await fetch(`/api/plan-readiness?tenantId=${tenantId}`);
        if (res.ok) {
          const data = await res.json();
          const plans = data.plans as Array<{
            planId: string;
            planName: string;
            status?: string;
            entityCount: number;
            hasBindings: boolean;
            dataRowCount: number;
            lastBatchDate: string | null;
            lastTotal: number | null;
          }> | undefined;

          if (plans && plans.length > 0) {
            // HF-182 Fix 6: Show all plan names for context, not just the first active one
            const activePlans = plans.filter((p: { status?: string }) => p.status === 'active' || p.status === 'draft');
            const planNames = activePlans.map((p: { planName: string }) => p.planName).join(', ');
            const totalEntities = activePlans.reduce((s: number, p: { entityCount: number }) => Math.max(s, p.entityCount), 0);
            setPostImportData(prev => prev ? {
              ...prev,
              planName: planNames || plans[0].planName,
              entityCount: totalEntities,
            } : prev);
          }
        }
      } catch {
        // Enrichment failure is not critical — ImportReadyState degrades gracefully
      }
    };

    fetchEnrichment();
  }, [state.phase, tenantId, postImportData]);

  // ── Resets ──

  const handleCancel = useCallback(() => {
    rawDataRef.current = null;
    storagePathsRef.current = {};
    storageUploadPromiseRef.current = null;
    asyncSessionIdRef.current = null; // OB-251: don't leak an async session into the next import
    setPostImportData(null);
    setState({ phase: 'upload' });
  }, []);

  const handleUploadMore = useCallback(() => {
    rawDataRef.current = null;
    storagePathsRef.current = {};
    storageUploadPromiseRef.current = null;
    asyncSessionIdRef.current = null; // OB-251: don't leak an async session into the next import
    setPostImportData(null);
    setState({ phase: 'upload' });
  }, []);

  const handleRetry = useCallback(() => {
    rawDataRef.current = null;
    storagePathsRef.current = {};
    storageUploadPromiseRef.current = null;
    asyncSessionIdRef.current = null; // OB-251: don't leak an async session into the next import
    setPostImportData(null);
    setState({ phase: 'upload' });
  }, []);

  const handleNavigateToCalculate = useCallback(() => {
    router.push('/operate/calculate');
  }, [router]);

  // ── Render ──

  const subtitle = PHASE_SUBTITLES[state.phase] || '';

  return (
    <RequireCapability capability="data.import">
      <div className={isVialuce ? '' : 'min-h-screen bg-zinc-950 p-6 md:p-8'}>
        <div className={isVialuce ? 'page' : 'max-w-3xl mx-auto'}>
          {/* Page header — hidden during executing + complete (components show their own) */}
          {state.phase !== 'executing' && state.phase !== 'complete' && state.phase !== 'processing' && state.phase !== 'loading' && (
            isVialuce ? (
              <div className="phead">
                <div>
                  <h1>Import</h1>
                  {subtitle && <div className="sub">{subtitle}</div>}
                </div>
              </div>
            ) : (
              <div className="mb-8">
                <h1 className="text-xl font-semibold text-zinc-100">Import</h1>
                {subtitle && (
                  <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>
                )}
              </div>
            )
          )}

          {/* Error banner */}
          {errorMessage && (
            <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-lg bg-red-950/30 border border-red-800/30">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-300 flex-1">{errorMessage}</p>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-red-400 hover:text-red-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* HF-318: Vialuce inverts the hierarchy — the platform's intelligence (.kpi cards) is the
              HEADLINE, ABOVE the file list. The file list is reference detail (the admin knows what
              they uploaded). Dark/Bliss keep the original order (telemetry footer below). */}
          {isVialuce && state.phase === 'analyzing' && importSessionIdRef.current && (
            <ImportTelemetryPanel tenantId={tenantId} sessionId={importSessionIdRef.current} phase="analyzing" />
          )}

          {/* ─── UPLOAD STATE ─── */}
          {/* OB-250: the PRISM import source (cleared shelf) is ADDITIVE above the always-available
              local source (SCIUpload). It self-gates: renders only when prism_enabled is on (I6/I7). */}
          {state.phase === 'upload' && <ClearedSourcePanel />}
          {(state.phase === 'upload' || state.phase === 'analyzing') && (
            <SCIUpload
              onAnalysisStart={handleAnalysisStart}
              onError={handleError}
              analyzing={state.phase === 'analyzing'}
            />
          )}

          {/* OB-203 D12: thin live progress strip during analysis (per-sheet states from SessionStateView). */}
          {state.phase === 'analyzing' && analyzeProgress && analyzeProgress.total > 0 && (
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Comprehending sheets…</span>
                <span className="tabular-nums">{analyzeProgress.settled} / {analyzeProgress.total}</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.round((analyzeProgress.settled / analyzeProgress.total) * 100)}%` }} />
              </div>
            </div>
          )}

          {/* OB-203 §2: live platform telemetry (durable-spine-derived) during analyze.
              HF-318: Dark/Bliss only — under Vialuce this renders ABOVE the file list (inverted hierarchy). */}
          {!isVialuce && state.phase === 'analyzing' && importSessionIdRef.current && (
            <ImportTelemetryPanel tenantId={tenantId} sessionId={importSessionIdRef.current} phase="analyzing" />
          )}

          {/* ─── PROCESSING STATE ─── (OB-174: async job processing) */}
          {state.phase === 'processing' && (
            <ImportProgress
              sessionId={state.sessionId}
              tenantId={tenantId}
              onAllClassified={handleAllClassified}
              onError={handleError}
            />
          )}

          {/* ─── PROPOSAL STATE ─── */}
          {/* OB-175: Single file header in SCIProposalView — no duplicate collapsed SCIUpload */}
          {state.phase === 'proposal' && (
            /* OB-203 Phase 5 (D7): ONE surface — unit state + the resolution action set live ON the
               proposal cards (durable SessionStateView read). No separate state panel. */
            <SCIProposalView
              proposal={state.proposal}
              fileName={state.fileName}
              rawData={state.rawData}
              tenantId={tenantId}
              storagePaths={storagePathsRef.current}
              onConfirmAll={handleConfirmAll}
              onCancel={handleCancel}
            />
          )}

          {/* ─── EXECUTING STATE ─── */}
          {/* OB-139: NO upload dropzone during execution */}
          {state.phase === 'executing' && (
            <>
              <SCIExecution
                proposal={state.proposal}
                confirmedUnits={state.confirmedUnits}
                tenantId={tenantId}
                rawData={state.rawData}
                storagePath={state.storagePath}
                storagePaths={state.storagePaths}
                asyncSessionId={state.asyncSessionId}
                onComplete={handleExecutionComplete}
                onUploadMore={handleUploadMore}
              />
              {/* OB-203 §2: live platform telemetry (durable-spine-derived) during execute — pulses landing. */}
              <ImportTelemetryPanel tenantId={tenantId} sessionId={state.proposal.proposalId} phase="executing" />
            </>
          )}

          {/* ─── HF-360 LOADING STATE — the rows are STAGED; the worker is loading them off the clock ─── */}
          {state.phase === 'loading' && (
            <div className="rounded-xl bg-zinc-900/40 border border-zinc-800 p-6">
              <p className="text-sm font-medium text-zinc-200">Your data is in — loading into your records</p>
              <p className="mt-1 text-xs text-zinc-500">
                We staged every row safely, then handed the load to the database so a big file never times out
                in your browser. This finishes on its own; you can leave this page and the load continues.
              </p>
              <PulseLoadProgress
                tenantId={tenantId}
                sessionId={state.executionResult.proposalId}
                onLoadComplete={(rowsLoaded) => handleLoadComplete(state.executionResult, rowsLoaded)}
              />
            </div>
          )}

          {/* ─── COMPLETE STATE ─── */}
          {/* OB-139: ImportReadyState with summary + Calculate bridge */}
          {state.phase === 'complete' && postImportData && (
            <ImportReadyState
              results={postImportData.results}
              totalRowsCommitted={postImportData.totalRowsCommitted}
              tenantId={tenantId}
              importSessionId={postImportData.importSessionId}
              entityCount={postImportData.entityCount}
              planName={postImportData.planName}
              componentCount={postImportData.componentCount}
              sourceDateRange={postImportData.sourceDateRange}
              onNavigateToCalculate={handleNavigateToCalculate}
              onImportMore={handleUploadMore}
            />
          )}
          {/* OB-249 (P7): rendered remediation — what the stage made congruent before promotion. */}
          {state.phase === 'complete' && postImportData && (
            <RemediationReview tenantId={tenantId} />
          )}

          {/* ─── ERROR STATE ─── */}
          {state.phase === 'error' && (
            <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/50 p-8 text-center">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
              <p className="text-sm text-zinc-300 mb-6">{state.error}</p>
              {state.canRetry && (
                <Button
                  onClick={handleRetry}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Try Again
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </RequireCapability>
  );
}
