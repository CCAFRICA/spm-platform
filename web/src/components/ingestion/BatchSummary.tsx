'use client';

/**
 * BatchSummary — displays batch upload session summary.
 *
 * Shows file count, success/failure stats, and total bytes transferred.
 */

import { CheckCircle, XCircle, FileText, HardDrive } from 'lucide-react';
import { type BatchSession } from '@/lib/ingestion/batch-manager';
import { getBatchSummary } from '@/lib/ingestion/batch-manager';
import { formatFileSize } from '@/lib/ingestion/file-validator';
import { cn } from '@/lib/utils';

interface BatchSummaryProps {
  batch: BatchSession;
  className?: string;
}

export function BatchSummary({ batch, className }: BatchSummaryProps) {
  const summary = getBatchSummary(batch);

  const statusColor = {
    open: 'text-sky-400',
    complete: 'text-emerald-400',
    partial: 'text-amber-400',
    failed: 'text-red-400',
  }[summary.status];

  const statusLabel = {
    open: 'In Progress',
    complete: 'Complete',
    partial: 'Partial Success',
    failed: 'Failed',
  }[summary.status];

  return (
    <div className={cn('border border-zinc-800 rounded-lg p-4 bg-zinc-900/50', className)}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-medium text-zinc-200">{batch.label}</h4>
          <p className="text-xs text-zinc-400">{batch.id.slice(0, 8)}</p>
        </div>
        <span className={cn('text-xs font-medium', statusColor)}>{statusLabel}</span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-zinc-400" />
          <div>
            <p className="text-sm font-medium text-zinc-200">{summary.totalFiles}</p>
            <p className="text-[10px] text-zinc-400">Files</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-400" />
          <div>
            <p className="text-sm font-medium text-emerald-400">{summary.completedFiles}</p>
            <p className="text-[10px] text-zinc-400">Success</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-400">{summary.failedFiles}</p>
            <p className="text-[10px] text-zinc-400">Failed</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-zinc-400" />
          <div>
            <p className="text-sm font-medium text-zinc-200">{formatFileSize(summary.uploadedBytes)}</p>
            <p className="text-[10px] text-zinc-400">Uploaded</p>
          </div>
        </div>
      </div>

      {/* File list */}
      {batch.files.length > 0 && (
        <div className="mt-3 space-y-1">
          {batch.files.map((f, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 truncate max-w-[60%]">{f.fileName}</span>
              <div className="flex items-center gap-2">
                <span className="text-zinc-600">{formatFileSize(f.fileSize)}</span>
                {f.status === 'done' && <CheckCircle className="h-3 w-3 text-emerald-400" />}
                {f.status === 'error' && <XCircle className="h-3 w-3 text-red-400" />}
                {f.status === 'pending' && <span className="text-zinc-600">pending</span>}
                {f.status === 'uploading' && <span className="text-sky-400">uploading</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
