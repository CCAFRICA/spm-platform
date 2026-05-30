'use client';

// SCI Import Page — Full import experience
// OB-129 (foundation), OB-138 (proposal intelligence), OB-139 (post-confirm).
// State machine: upload → analyzing → proposal → executing → complete → error
// Zero domain vocabulary. Korean Test applies.

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { RequireCapability } from '@/components/auth/RequireCapability';
import { SCIUpload, type FileInfo, type ParsedFileData } from '@/components/sci/SCIUpload';
import { SCIProposalView } from '@/components/sci/SCIProposal';
import { SCIExecution } from '@/components/sci/SCIExecution';
import { ImportReadyState } from '@/components/sci/ImportReadyState';
import { ImportProgress } from '@/components/sci/ImportProgress';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import type {
  SCIProposal,
  ContentUnitProposal,
  SCIExecutionResult,
  ContentUnitResult,
} from '@/lib/sci/sci-types';

// ============================================================
// STATE MACHINE
// ============================================================

type ImportState =
  | { phase: 'upload' }
  | { phase: 'analyzing'; files: FileInfo[] }
  | { phase: 'processing'; sessionId: string; files: FileInfo[] } // OB-174: async processing
  | { phase: 'proposal'; proposal: SCIProposal; rawData: ParsedFileData; fileName: string }
  | { phase: 'executing'; proposal: SCIProposal; confirmedUnits: ContentUnitProposal[]; rawData: ParsedFileData; storagePath?: string; storagePaths?: Record<string, string> }
  | { phase: 'complete'; executionResult: SCIExecutionResult }
  | { phase: 'error'; error: string; canRetry: boolean };

interface PostImportData {
  totalRowsCommitted: number;
  results: ContentUnitResult[];
  entityCount?: number;
  planName?: string;
  componentCount?: number;
  sourceDateRange?: { min: string; max: string } | null;
}

const ANALYSIS_SAMPLE_SIZE = 50;

const PHASE_SUBTITLES: Record<string, string> = {
  upload: 'Upload your data and the platform will handle the rest.',
  analyzing: 'Understanding your data...',
  processing: '',  // ImportProgress shows its own header
  proposal: 'Review what was found.',
  executing: '',  // ExecutionProgress shows its own header
  complete: '',   // ImportReadyState shows its own header
  error: 'Something went wrong.',
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OperateImportPage() {
  const { currentTenant } = useTenant();
  const router = useRouter();
  const [state, setState] = useState<ImportState>({ phase: 'upload' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rawDataRef = useRef<ParsedFileData | null>(null);
  const [postImportData, setPostImportData] = useState<PostImportData | null>(null);

  const tenantId = currentTenant?.id || '';
  // HF-140: Track storage upload for ALL files (runs in parallel with analysis)
  const storagePathsRef = useRef<Record<string, string>>({});
  const storageUploadPromiseRef = useRef<Promise<void> | null>(null);

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
                console.error(`[HF-141] Storage upload FAILED for ${file.name}:`, uploadErr.message);
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

      // OB-174: Try async processing path for spreadsheet files
      // Creates processing_jobs records and fires parallel workers.
      // Falls back to synchronous analyze if processing_jobs table doesn't exist.
      if (allSpreadsheets && spreadsheetFiles.length > 0) {
        try {
          // Wait for storage uploads to complete
          if (storageUploadPromiseRef.current) {
            await storageUploadPromiseRef.current;
          }
          const storagePaths = storagePathsRef.current;

          // Check that every spreadsheet file was uploaded. HF-255: storagePaths may now
          // also contain document paths (the upload set was decoupled from this async
          // set), so check per-file presence rather than total-count equality. For a
          // non-document (pure-spreadsheet) import this is identical to the prior check.
          if (spreadsheetFiles.every(f => storagePaths[f.name])) {
            const supabase = createClient();
            const sessionId = crypto.randomUUID();
            const jobIds: string[] = [];

            // Create processing_jobs records
            for (const file of spreadsheetFiles) {
              const path = storagePaths[file.name];
              if (!path) continue;

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data: job, error: jobErr } = await (supabase as any)
                .from('processing_jobs')
                .insert({
                  tenant_id: tenantId,
                  status: 'pending',
                  file_storage_path: path,
                  file_name: path.split('/').pop() || file.name,
                  file_size_bytes: file.size,
                  session_id: sessionId,
                })
                .select('id')
                .single();

              if (jobErr) {
                // Table doesn't exist or insert failed — fall through to sync path
                console.log('[OB-174] Async path unavailable:', jobErr.message);
                throw new Error('ASYNC_UNAVAILABLE');
              }
              if (job) jobIds.push(job.id);
            }

            // Fire parallel workers (Option C — client-initiated)
            console.log(`[OB-174] Launching ${jobIds.length} parallel workers`);
            for (const jobId of jobIds) {
              fetch('/api/import/sci/process-job', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
              }).catch(err => console.warn(`[OB-174] Worker fire failed:`, err));
            }

            // Transition to processing phase
            setState({ phase: 'processing', sessionId, files });
            return;
          }
        } catch (asyncErr) {
          if (asyncErr instanceof Error && asyncErr.message === 'ASYNC_UNAVAILABLE') {
            console.log('[OB-174] Falling back to synchronous analysis');
          } else {
            console.warn('[OB-174] Async path error, falling back:', asyncErr);
          }
        }
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
        const res = await fetch('/api/import/sci/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, files: analysisFiles }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
          throw new Error(err.error || `Analysis failed (${res.status})`);
        }
        tabularProposal = await res.json();
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

    // HF-140: Wait for ALL storage uploads to complete
    if (storageUploadPromiseRef.current) {
      await storageUploadPromiseRef.current;
    }
    const storagePaths = storagePathsRef.current;
    // Backwards compat: first path as single storagePath
    const storagePath = Object.values(storagePaths)[0] || undefined;

    setState({
      phase: 'executing',
      proposal: state.proposal,
      confirmedUnits,
      rawData: state.rawData,
      storagePath,
      storagePaths,
    });
  }, [state]);

  // ── Executing → Complete ──

  const handleExecutionComplete = useCallback((result: SCIExecutionResult) => {
    const successResults = result.results.filter(r => r.success);
    const totalRows = successResults.reduce((s, r) => s + r.rowsProcessed, 0);

    setPostImportData({
      totalRowsCommitted: totalRows,
      results: result.results,
    });

    setState({ phase: 'complete', executionResult: result });
  }, []);

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
    setPostImportData(null);
    setState({ phase: 'upload' });
  }, []);

  const handleUploadMore = useCallback(() => {
    rawDataRef.current = null;
    storagePathsRef.current = {};
    storageUploadPromiseRef.current = null;
    setPostImportData(null);
    setState({ phase: 'upload' });
  }, []);

  const handleRetry = useCallback(() => {
    rawDataRef.current = null;
    storagePathsRef.current = {};
    storageUploadPromiseRef.current = null;
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
      <div className="min-h-screen bg-zinc-950 p-6 md:p-8">
        <div className="max-w-3xl mx-auto">
          {/* Page header — hidden during executing + complete (components show their own) */}
          {state.phase !== 'executing' && state.phase !== 'complete' && state.phase !== 'processing' && (
            <div className="mb-8">
              <h1 className="text-xl font-semibold text-zinc-100">Import</h1>
              {subtitle && (
                <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>
              )}
            </div>
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

          {/* ─── UPLOAD STATE ─── */}
          {(state.phase === 'upload' || state.phase === 'analyzing') && (
            <SCIUpload
              onAnalysisStart={handleAnalysisStart}
              onError={handleError}
              analyzing={state.phase === 'analyzing'}
            />
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
            <SCIProposalView
              proposal={state.proposal}
              fileName={state.fileName}
              rawData={state.rawData}
              onConfirmAll={handleConfirmAll}
              onCancel={handleCancel}
            />
          )}

          {/* ─── EXECUTING STATE ─── */}
          {/* OB-139: NO upload dropzone during execution */}
          {state.phase === 'executing' && (
            <SCIExecution
              proposal={state.proposal}
              confirmedUnits={state.confirmedUnits}
              tenantId={tenantId}
              rawData={state.rawData}
              storagePath={state.storagePath}
              storagePaths={state.storagePaths}
              onComplete={handleExecutionComplete}
              onUploadMore={handleUploadMore}
            />
          )}

          {/* ─── COMPLETE STATE ─── */}
          {/* OB-139: ImportReadyState with summary + Calculate bridge */}
          {state.phase === 'complete' && postImportData && (
            <ImportReadyState
              results={postImportData.results}
              totalRowsCommitted={postImportData.totalRowsCommitted}
              entityCount={postImportData.entityCount}
              planName={postImportData.planName}
              componentCount={postImportData.componentCount}
              sourceDateRange={postImportData.sourceDateRange}
              onNavigateToCalculate={handleNavigateToCalculate}
              onImportMore={handleUploadMore}
            />
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
