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

      // HF-141: Upload ALL spreadsheet files to Supabase Storage in parallel.
      // Each file gets its own storage path with a unique suffix (index + random)
      // to prevent any collision or ambiguity. Keyed by filename for lookup.
      const spreadsheetFiles = files.filter(f => f.rawFile && !f.parsedData.documentBase64);
      if (spreadsheetFiles.length > 0) {
        storageUploadPromiseRef.current = (async () => {
          try {
            const supabase = createClient();
            const paths: Record<string, string> = {};
            const baseTimestamp = Date.now();
            await Promise.all(spreadsheetFiles.map(async (file, index) => {
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
            console.log(`[HF-141] Upload complete: ${Object.keys(paths).length}/${spreadsheetFiles.length} files`);
          } catch (err) {
            console.error('[HF-141] Storage upload error:', err);
          }
        })();
      }
      const firstFile = files[0];
      const isDocument = !!firstFile?.parsedData.documentBase64;

      // OB-174: Try async processing path for spreadsheet files
      // Creates processing_jobs records and fires parallel workers.
      // Falls back to synchronous analyze if processing_jobs table doesn't exist.
      if (!isDocument && spreadsheetFiles.length > 0) {
        try {
          // Wait for storage uploads to complete
          if (storageUploadPromiseRef.current) {
            await storageUploadPromiseRef.current;
          }
          const storagePaths = storagePathsRef.current;

          // Check if all files were uploaded
          if (Object.keys(storagePaths).length === spreadsheetFiles.length) {
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

      // Synchronous analysis path (existing — fallback for async unavailable or document imports)
      let proposal: SCIProposal;

      if (isDocument) {
        const res = await fetch('/api/import/sci/analyze-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            fileName: firstFile.parsedData.fileName,
            fileBase64: firstFile.parsedData.documentBase64,
            mimeType: firstFile.parsedData.documentMimeType,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Document analysis failed' }));
          throw new Error(err.error || `Document analysis failed (${res.status})`);
        }

        proposal = await res.json();
      } else {
        const analysisFiles = files.map(f => ({
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

        proposal = await res.json();
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
            // DIAG-002: Prefer active plan for entity count display.
            // Draft plans may have 0 assignments even when active has 85.
            const activePlan = plans.find((p: { status?: string }) => p.status === 'active') || plans[0];
            setPostImportData(prev => prev ? {
              ...prev,
              planName: activePlan.planName,
              entityCount: activePlan.entityCount,
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
