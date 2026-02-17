'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone, FileRejection } from 'react-dropzone';
import { Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileWithContent {
  file: File;
  content: string;
}

interface FileUploadProps {
  onFileSelect: (file: File, content: string) => void;
  onFilesSelect?: (files: FileWithContent[]) => void;
  accept?: Record<string, string[]>;
  maxSize?: number;
  multiple?: boolean;
  className?: string;
}

export function FileUpload({
  onFileSelect,
  onFilesSelect,
  accept = {
    'text/csv': ['.csv'],
    'text/tab-separated-values': ['.tsv', '.txt'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  },
  maxSize = 10 * 1024 * 1024, // 10MB
  multiple = true,
  className,
}: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setError(null);

      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0];
        setError(rejection.errors[0]?.message || 'File rejected');
        return;
      }

      if (acceptedFiles.length === 0) return;

      setUploadedFiles(acceptedFiles);
      setIsProcessing(true);

      try {
        if (multiple && onFilesSelect) {
          // Handle multiple files
          const filesWithContent: FileWithContent[] = await Promise.all(
            acceptedFiles.map(async (file) => ({
              file,
              content: await file.text(),
            }))
          );
          onFilesSelect(filesWithContent);
        } else {
          // Handle single file (backward compatibility)
          const file = acceptedFiles[0];
          const content = await file.text();
          onFileSelect(file, content);
        }
      } catch {
        setError('Failed to read file content');
        setUploadedFiles([]);
      } finally {
        setIsProcessing(false);
      }
    },
    [onFileSelect, onFilesSelect, multiple]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple,
  });

  const clearFiles = () => {
    setUploadedFiles([]);
    setError(null);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={className}>
      <AnimatePresence mode="wait">
        {uploadedFiles.length === 0 ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                isDragActive && !isDragReject && 'border-sky-500 bg-sky-50 dark:bg-sky-950/20',
                isDragReject && 'border-red-500 bg-red-50 dark:bg-red-950/20',
                !isDragActive && 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
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
                    isDragActive ? 'text-sky-500' : 'text-slate-400'
                  )}
                />
              </motion.div>
              <p className="text-lg font-medium text-slate-700 dark:text-slate-200 mb-1">
                {isDragActive ? 'Drop your file(s) here' : 'Drag and drop your file(s) here'}
              </p>
              <p className="text-sm text-slate-500 mb-4">or click to browse</p>
              <p className="text-xs text-slate-400">
                Supported formats: CSV, TSV, XLS, XLSX (max {formatFileSize(maxSize)})
                {multiple && ' • Multiple files supported'}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="uploaded"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-2"
          >
            {uploadedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="border rounded-lg p-4 bg-slate-900"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <FileText className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-700 dark:text-slate-200 truncate">
                      {file.name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isProcessing ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="h-5 w-5 border-2 border-sky-500 border-t-transparent rounded-full"
                      />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFile(index)}
                      className="h-8 w-8"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {uploadedFiles.length > 1 && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={clearFiles}>
                  Clear all
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-3 flex items-center gap-2 text-red-600 text-sm"
          >
            <AlertCircle className="h-4 w-4" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
