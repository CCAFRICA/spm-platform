'use client';

// SCI Upload — Drop zone + file handling + analysis trigger
// OB-129 Phase 2 — Zero domain vocabulary. Korean Test applies.

import { useCallback, useState, useRef } from 'react';
import { Upload, FileSpreadsheet, FileText, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ParsedFileData {
  fileName: string;
  sheets: Array<{
    sheetName: string;
    columns: string[];
    rows: Record<string, unknown>[];
    totalRowCount: number;
  }>;
}

export interface FileInfo {
  name: string;
  size: number;
  sheetCount: number;
  parsedData: ParsedFileData;
}

interface SCIUploadProps {
  onAnalysisStart: (files: FileInfo[]) => void;
  onError: (message: string) => void;
  analyzing?: boolean;
  collapsed?: boolean;
  fileName?: string;
}

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.tsv', '.pdf'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name: string): string {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

function isAcceptedFile(name: string): boolean {
  return ACCEPTED_EXTENSIONS.includes(getFileExtension(name));
}

async function parseFile(file: File): Promise<ParsedFileData> {
  const ext = getFileExtension(file.name);

  if (ext === '.csv' || ext === '.tsv') {
    return parseCsvFile(file, ext === '.tsv' ? '\t' : ',');
  }

  if (ext === '.xlsx' || ext === '.xls') {
    return parseExcelFile(file);
  }

  if (ext === '.pdf') {
    // PDF files don't get parsed client-side — send as-is
    return {
      fileName: file.name,
      sheets: [{
        sheetName: 'Document',
        columns: [],
        rows: [],
        totalRowCount: 0,
      }],
    };
  }

  throw new Error(`Unsupported file format: ${ext}`);
}

async function parseCsvFile(file: File, delimiter: string): Promise<ParsedFileData> {
  const text = await file.text();
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) throw new Error('File is empty');

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, unknown>[] = [];
  const totalRowCount = lines.length - 1;

  // Parse all rows (not just sample — full data for execute)
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      const val = values[idx] ?? '';
      const num = Number(val);
      row[h] = val !== '' && !isNaN(num) && val !== '' ? num : val;
    });
    rows.push(row);
  }

  return {
    fileName: file.name,
    sheets: [{
      sheetName: file.name.replace(/\.[^.]+$/, ''),
      columns: headers,
      rows,
      totalRowCount,
    }],
  };
}

async function parseExcelFile(file: File): Promise<ParsedFileData> {
  // Dynamic import to avoid SSR issues
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheets: ParsedFileData['sheets'] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

    // Filter out auto-generated __EMPTY columns that are fully empty
    const meaningfulColumns = columns.filter(col => {
      if (!col.startsWith('__EMPTY')) return true;
      return jsonData.some(row => row[col] !== '' && row[col] != null);
    });

    sheets.push({
      sheetName,
      columns: meaningfulColumns,
      rows: jsonData,
      totalRowCount: jsonData.length,
    });
  }

  if (sheets.length === 0) {
    throw new Error('No readable sheets found in the file');
  }

  return { fileName: file.name, sheets };
}

export function SCIUpload({ onAnalysisStart, onError, analyzing, collapsed, fileName }: SCIUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileInfo[]>([]);
  const [parsing, setParsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);

    // Validate
    for (const file of files) {
      if (!isAcceptedFile(file.name)) {
        onError(`"${file.name}" is not a supported format. Try XLSX, CSV, or PDF.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        onError(`"${file.name}" is too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`);
        return;
      }
      if (file.size === 0) {
        onError(`"${file.name}" appears to be empty. Please check the file and try again.`);
        return;
      }
    }

    setParsing(true);
    try {
      const parsedFiles: FileInfo[] = [];
      for (const file of files) {
        const parsed = await parseFile(file);
        parsedFiles.push({
          name: file.name,
          size: file.size,
          sheetCount: parsed.sheets.length,
          parsedData: parsed,
        });
      }
      setSelectedFiles(parsedFiles);

      // Auto-trigger analysis
      onAnalysisStart(parsedFiles);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to read the file. Please try again.');
    } finally {
      setParsing(false);
    }
  }, [onAnalysisStart, onError]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const onBrowse = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  }, [handleFiles]);

  const removeFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Collapsed state — just show filename
  if (collapsed && fileName) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
        <FileSpreadsheet className="w-4 h-4 text-zinc-400" />
        <span className="text-sm text-zinc-300">{fileName}</span>
      </div>
    );
  }

  // Analyzing state — show file info + progress
  if (analyzing && selectedFiles.length > 0) {
    return (
      <div className="space-y-3">
        {selectedFiles.map((file, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
            <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
              <p className="text-xs text-zinc-500">
                {formatFileSize(file.size)}
                {file.sheetCount > 0 && ` \u00B7 ${file.sheetCount} sheet${file.sheetCount !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
              <span className="text-xs text-amber-400">Understanding your data...</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Parsing state
  if (parsing) {
    return (
      <div className="flex flex-col items-center justify-center py-20 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/50">
        <Loader2 className="w-8 h-8 text-zinc-400 animate-spin mb-3" />
        <p className="text-sm text-zinc-400">Reading your file...</p>
      </div>
    );
  }

  // File selected but not yet sent for analysis — show preview
  if (selectedFiles.length > 0 && !analyzing) {
    return (
      <div className="space-y-3">
        {selectedFiles.map((file, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
            {getFileExtension(file.name) === '.pdf' ? (
              <FileText className="w-5 h-5 text-rose-400" />
            ) : (
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
              <p className="text-xs text-zinc-500">
                {formatFileSize(file.size)}
                {file.sheetCount > 0 && ` \u00B7 ${file.sheetCount} sheet${file.sheetCount !== 1 ? 's' : ''}`}
              </p>
            </div>
            <button
              onClick={() => removeFile(i)}
              className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    );
  }

  // Default: drop zone
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={onBrowse}
      className={cn(
        'flex flex-col items-center justify-center py-20 px-8 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200',
        isDragOver
          ? 'border-indigo-400/60 bg-indigo-950/20'
          : 'border-zinc-700 bg-zinc-900/30 hover:border-zinc-500 hover:bg-zinc-900/50'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={onInputChange}
        className="hidden"
      />

      <div className={cn(
        'w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors',
        isDragOver ? 'bg-indigo-900/40' : 'bg-zinc-800/80'
      )}>
        <Upload className={cn(
          'w-6 h-6 transition-colors',
          isDragOver ? 'text-indigo-400' : 'text-zinc-400'
        )} />
      </div>

      <p className="text-base font-medium text-zinc-200 mb-1">
        {isDragOver ? 'Drop your file here' : 'Drop a file to get started'}
      </p>
      <p className="text-sm text-zinc-500 mb-4">
        or <span className="text-indigo-400 hover:text-indigo-300">browse</span> to choose
      </p>

      <p className="text-xs text-zinc-600">
        Supports XLSX, XLS, CSV, TSV, and PDF
      </p>
    </div>
  );
}
