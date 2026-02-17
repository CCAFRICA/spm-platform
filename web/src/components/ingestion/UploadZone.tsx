'use client';

/**
 * UploadZone — DS-005 drag-and-drop upload component.
 *
 * Replaces the basic FileUpload with full ingestion pipeline:
 * - Drag-and-drop (react-dropzone)
 * - Per-file progress tracking (validate → hash → upload → register)
 * - Rejection display for invalid files
 * - Multi-file support
 * - Calls upload-service for SHA-256 + Supabase Storage + event creation
 */

import { useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone, FileRejection } from 'react-dropzone';
import {
  Upload, FileText, X, CheckCircle, AlertCircle, Shield,
  Loader2, Hash, CloudUpload, ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTenant } from '@/contexts/tenant-context';
import {
  uploadFile,
  type UploadProgress,
  type UploadResult,
  type UploadError,
} from '@/lib/ingestion/upload-service';
import {
  validateFile,
  getAcceptString,
  formatFileSize,
  ACCEPTED_TYPES,
  type FileCategory,
} from '@/lib/ingestion/file-validator';

// ── Types ──

export interface UploadZoneProps {
  /** Restrict to specific file categories */
  acceptCategories?: FileCategory[];
  /** Called when a file finishes uploading successfully */
  onFileUploaded?: (result: UploadResult & { file: File }) => void;
  /** Called with all completed results when all files finish */
  onAllComplete?: (results: Array<UploadResult & { file: File }>) => void;
  /** Called when the user also needs the raw file content (bridge to old import) */
  onFileContent?: (file: File, content: string) => void;
  /** Batch ID for grouping uploads */
  batchId?: string;
  /** Max files per session */
  maxFiles?: number;
  /** Additional className */
  className?: string;
}

interface TrackedFile {
  id: string;
  file: File;
  status: 'queued' | 'validating' | 'hashing' | 'uploading' | 'registering' | 'done' | 'error';
  progress: number;
  error?: string;
  result?: UploadResult;
}

// Phase icons and labels
const PHASE_META: Record<string, { icon: typeof Loader2; label: string }> = {
  validating: { icon: Shield, label: 'Validating...' },
  hashing:    { icon: Hash, label: 'Computing SHA-256...' },
  uploading:  { icon: CloudUpload, label: 'Uploading to storage...' },
  registering:{ icon: ClipboardList, label: 'Registering event...' },
};

// ── Component ──

export function UploadZone({
  acceptCategories,
  onFileUploaded,
  onAllComplete,
  onFileContent,
  batchId,
  maxFiles = 20,
  className,
}: UploadZoneProps) {
  const { currentTenant } = useTenant();
  const [tracked, setTracked] = useState<TrackedFile[]>([]);
  const [rejections, setRejections] = useState<string[]>([]);
  const idCounter = useRef(0);
  const resultsRef = useRef<Array<UploadResult & { file: File }>>([]);

  // Update a tracked file by ID
  const updateFile = useCallback((id: string, patch: Partial<TrackedFile>) => {
    setTracked(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }, []);

  // Process a single file through the upload pipeline
  const processFile = useCallback(async (tracked: TrackedFile) => {
    if (!currentTenant?.id) return;

    // If the caller also needs raw content (bridge mode), read it first
    if (onFileContent) {
      try {
        const content = await tracked.file.text();
        onFileContent(tracked.file, content);
      } catch {
        // Non-blocking — content read failure doesn't stop upload
      }
    }

    try {
      const result = await uploadFile({
        tenantId: currentTenant.id,
        file: tracked.file,
        batchId,
        acceptCategories,
        onProgress: (p: UploadProgress) => {
          updateFile(tracked.id, {
            status: p.phase,
            progress: p.percentage,
          });
        },
      });

      updateFile(tracked.id, { status: 'done', progress: 100, result });

      const fileResult = { ...result, file: tracked.file };
      onFileUploaded?.(fileResult);
      resultsRef.current.push(fileResult);
    } catch (err) {
      const uploadErr = err as UploadError;
      updateFile(tracked.id, {
        status: 'error',
        error: uploadErr.message || 'Upload failed',
      });
    }
  }, [currentTenant, batchId, acceptCategories, onFileContent, onFileUploaded, updateFile]);

  // Handle dropped files
  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setRejections([]);

      // Show rejections
      if (rejectedFiles.length > 0) {
        setRejections(
          rejectedFiles.map(r => `${r.file.name}: ${r.errors.map(e => e.message).join(', ')}`)
        );
      }

      if (acceptedFiles.length === 0) return;

      // Client-side pre-validation
      const validFiles: TrackedFile[] = [];
      const newRejections: string[] = [];

      for (const file of acceptedFiles) {
        const v = validateFile(file, acceptCategories);
        if (!v.valid) {
          newRejections.push(`${file.name}: ${v.error}`);
        } else {
          idCounter.current += 1;
          validFiles.push({
            id: `upload-${idCounter.current}`,
            file,
            status: 'queued',
            progress: 0,
          });
        }
      }

      if (newRejections.length > 0) {
        setRejections(prev => [...prev, ...newRejections]);
      }

      if (validFiles.length === 0) return;

      // Enforce max files
      const available = maxFiles - tracked.length;
      const toProcess = validFiles.slice(0, Math.max(0, available));
      if (toProcess.length < validFiles.length) {
        setRejections(prev => [
          ...prev,
          `${validFiles.length - toProcess.length} file(s) skipped: max ${maxFiles} files per session`,
        ]);
      }

      setTracked(prev => [...prev, ...toProcess]);
      resultsRef.current = [];

      // Process files sequentially to avoid overwhelming the network
      for (const tf of toProcess) {
        await processFile(tf);
      }

      // All done
      if (resultsRef.current.length > 0) {
        onAllComplete?.(resultsRef.current);
      }
    },
    [tracked.length, maxFiles, acceptCategories, processFile, onAllComplete]
  );

  // Build accept map for react-dropzone from our categories
  const acceptMap: Record<string, string[]> = {};
  const categories = acceptCategories || (['spreadsheets', 'text', 'documents', 'archives'] as FileCategory[]);
  for (const cat of categories) {
    const def = ACCEPTED_TYPES[cat];
    if (def) {
      for (const mime of def.mimeTypes) {
        acceptMap[mime] = def.extensions;
      }
    }
  }

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: acceptMap,
    maxSize: 500 * 1024 * 1024, // 500MB — validator enforces per-category limits
    multiple: true,
    disabled: !currentTenant?.id,
  });

  const removeFile = (id: string) => {
    setTracked(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    setTracked([]);
    setRejections([]);
    resultsRef.current = [];
  };

  const isProcessing = tracked.some(f => !['done', 'error'].includes(f.status));
  const doneCount = tracked.filter(f => f.status === 'done').length;
  const errorCount = tracked.filter(f => f.status === 'error').length;

  return (
    <div className={className}>
      {/* Drop Zone */}
      {(!isProcessing || tracked.length === 0) && (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
            isDragActive && !isDragReject && 'border-sky-500 bg-sky-950/20',
            isDragReject && 'border-red-500 bg-red-950/20',
            !isDragActive && 'border-zinc-700 hover:border-zinc-500',
            !currentTenant?.id && 'opacity-50 cursor-not-allowed',
          )}
        >
          <input {...getInputProps()} />
          <motion.div
            animate={isDragActive ? { scale: 1.05 } : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <Upload
              className={cn(
                'h-12 w-12 mx-auto mb-4',
                isDragActive ? 'text-sky-500' : 'text-zinc-500'
              )}
            />
          </motion.div>
          <p className="text-lg font-medium text-zinc-200 mb-1">
            {isDragActive ? 'Drop your file(s) here' : 'Drag and drop your file(s) here'}
          </p>
          <p className="text-sm text-zinc-400 mb-4">or click to browse</p>
          <p className="text-xs text-zinc-500">
            {getAcceptString(acceptCategories) ? `Accepted: ${categories.join(', ')}` : 'All supported file types'}
            {' '} (max 500MB per file)
          </p>
        </div>
      )}

      {/* File Progress List */}
      <AnimatePresence>
        {tracked.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 space-y-2"
          >
            {tracked.map(tf => (
              <FileProgressRow
                key={tf.id}
                tracked={tf}
                onRemove={() => removeFile(tf.id)}
              />
            ))}

            {/* Summary bar */}
            <div className="flex items-center justify-between pt-2 text-xs text-zinc-400">
              <span>
                {doneCount}/{tracked.length} complete
                {errorCount > 0 && ` • ${errorCount} failed`}
              </span>
              <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs h-7">
                Clear all
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rejections */}
      <AnimatePresence>
        {rejections.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="mt-3 space-y-1"
          >
            {rejections.map((msg, i) => (
              <div key={i} className="flex items-start gap-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{msg}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── File Progress Row ──

function FileProgressRow({
  tracked,
  onRemove,
}: {
  tracked: TrackedFile;
  onRemove: () => void;
}) {
  const phaseMeta = PHASE_META[tracked.status];
  const PhaseIcon = phaseMeta?.icon || Loader2;

  return (
    <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/50">
      <div className="flex items-center gap-3">
        <div className={cn(
          'p-2 rounded-lg',
          tracked.status === 'done' && 'bg-emerald-900/30',
          tracked.status === 'error' && 'bg-red-900/30',
          !['done', 'error'].includes(tracked.status) && 'bg-zinc-800',
        )}>
          {tracked.status === 'done' ? (
            <CheckCircle className="h-5 w-5 text-emerald-400" />
          ) : tracked.status === 'error' ? (
            <AlertCircle className="h-5 w-5 text-red-400" />
          ) : (
            <FileText className="h-5 w-5 text-zinc-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-zinc-200 text-sm truncate">{tracked.file.name}</p>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>{formatFileSize(tracked.file.size)}</span>
            {phaseMeta && tracked.status !== 'done' && tracked.status !== 'error' && (
              <>
                <span className="text-zinc-700">|</span>
                <span className="flex items-center gap-1 text-sky-400">
                  <PhaseIcon className="h-3 w-3 animate-spin" />
                  {phaseMeta.label}
                </span>
              </>
            )}
            {tracked.status === 'done' && tracked.result && (
              <>
                <span className="text-zinc-700">|</span>
                <span className="text-emerald-400">SHA-256 verified</span>
              </>
            )}
            {tracked.status === 'error' && (
              <>
                <span className="text-zinc-700">|</span>
                <span className="text-red-400">{tracked.error}</span>
              </>
            )}
          </div>
        </div>

        {/* Progress or remove */}
        <div className="flex items-center gap-2">
          {!['done', 'error', 'queued'].includes(tracked.status) && (
            <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-sky-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${tracked.progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
