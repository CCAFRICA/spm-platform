'use client';

// SCI Import Page — Replaces old DPI stepper (OB-129)
// State machine: upload → analyzing → proposal → executing → complete
// Zero domain vocabulary. Korean Test applies.

import { useState, useCallback, useRef } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import { RequireRole } from '@/components/auth/RequireRole';
import { SCIUpload, type FileInfo, type ParsedFileData } from '@/components/sci/SCIUpload';
import { SCIProposalView } from '@/components/sci/SCIProposal';
import { SCIExecution } from '@/components/sci/SCIExecution';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SCIProposal, ContentUnitProposal, SCIExecutionResult } from '@/lib/sci/sci-types';

type ImportState =
  | { phase: 'upload' }
  | { phase: 'analyzing'; files: FileInfo[] }
  | { phase: 'proposal'; proposal: SCIProposal; rawData: ParsedFileData; fileName: string }
  | { phase: 'executing'; proposal: SCIProposal; confirmedUnits: ContentUnitProposal[]; rawData: ParsedFileData }
  | { phase: 'complete'; result: SCIExecutionResult }
  | { phase: 'error'; error: string; canRetry: boolean };

const ANALYSIS_SAMPLE_SIZE = 50;

export default function OperateImportPage() {
  const { currentTenant } = useTenant();
  const [state, setState] = useState<ImportState>({ phase: 'upload' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rawDataRef = useRef<ParsedFileData | null>(null);

  const tenantId = currentTenant?.id || '';

  const handleError = useCallback((message: string) => {
    setErrorMessage(message);
    // Auto-dismiss after 8 seconds
    setTimeout(() => setErrorMessage(null), 8000);
  }, []);

  const handleAnalysisStart = useCallback(async (files: FileInfo[]) => {
    if (!tenantId) {
      handleError('No workspace selected. Please select a workspace first.');
      return;
    }

    setState({ phase: 'analyzing', files });
    setErrorMessage(null);

    try {
      // Store full data for execution
      if (files.length > 0) {
        rawDataRef.current = files[0].parsedData;
      }

      const firstFile = files[0];
      const isDocument = !!firstFile?.parsedData.documentBase64;

      let proposal: SCIProposal;

      if (isDocument) {
        // OB-133: Document formats (PDF/PPTX/DOCX) → analyze-document API
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
        // Tabular formats (XLSX/CSV/TSV) → existing analyze API
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

  const handleConfirmAll = useCallback((confirmedUnits: ContentUnitProposal[]) => {
    if (state.phase !== 'proposal') return;

    setState({
      phase: 'executing',
      proposal: state.proposal,
      confirmedUnits,
      rawData: state.rawData,
    });
  }, [state]);

  const handleCancel = useCallback(() => {
    rawDataRef.current = null;
    setState({ phase: 'upload' });
  }, []);

  const handleExecutionComplete = useCallback((_: SCIExecutionResult) => {
    // SCIExecution handles display — state tracking for future use
    void _;
  }, []);

  const handleUploadMore = useCallback(() => {
    rawDataRef.current = null;
    setState({ phase: 'upload' });
  }, []);

  const handleRetry = useCallback(() => {
    rawDataRef.current = null;
    setState({ phase: 'upload' });
  }, []);

  return (
    <RequireRole roles={['vl_admin', 'admin']}>
      <div className="min-h-screen bg-zinc-950 p-6 md:p-8">
        <div className="max-w-3xl mx-auto">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-xl font-semibold text-zinc-100">Import</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {state.phase === 'upload' && 'Upload your data and the platform will handle the rest.'}
              {state.phase === 'analyzing' && 'Understanding your data...'}
              {state.phase === 'proposal' && 'Review what was found.'}
              {state.phase === 'executing' && 'Processing your data...'}
              {state.phase === 'complete' && 'Import complete.'}
              {state.phase === 'error' && 'Something went wrong.'}
            </p>
          </div>

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

          {/* Upload area — visible in upload and analyzing states, collapsed in proposal */}
          {(state.phase === 'upload' || state.phase === 'analyzing') && (
            <SCIUpload
              onAnalysisStart={handleAnalysisStart}
              onError={handleError}
              analyzing={state.phase === 'analyzing'}
            />
          )}

          {/* Collapsed upload indicator during proposal/execution */}
          {(state.phase === 'proposal' || state.phase === 'executing') && (
            <div className="mb-6">
              <SCIUpload
                onAnalysisStart={handleAnalysisStart}
                onError={handleError}
                collapsed
                fileName={state.phase === 'proposal' ? state.fileName : undefined}
              />
            </div>
          )}

          {/* Proposal */}
          {state.phase === 'proposal' && (
            <SCIProposalView
              proposal={state.proposal}
              fileName={state.fileName}
              onConfirmAll={handleConfirmAll}
              onCancel={handleCancel}
            />
          )}

          {/* Execution */}
          {state.phase === 'executing' && (
            <SCIExecution
              proposal={state.proposal}
              confirmedUnits={state.confirmedUnits}
              tenantId={tenantId}
              rawData={state.rawData}
              onComplete={handleExecutionComplete}
              onUploadMore={handleUploadMore}
            />
          )}

          {/* Error state */}
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
    </RequireRole>
  );
}
