'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { ChequeImportService } from '@/lib/financial/cheque-import-service';
import { EntityService } from '@/lib/financial/entity-service';
import type { ChequeImportResult } from '@/lib/financial/types';

export default function FinancialImportPage() {
  const [tenantId] = useState('restaurantmx');
  const [step, setStep] = useState<'upload' | 'preview' | 'complete'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ChequeImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processFile = async (f: File) => {
    setError(null);
    setFile(f);

    try {
      const content = await f.text();

      // Preview import
      const importService = new ChequeImportService(tenantId);
      const result = importService.importFile(content, f.name, 'preview');
      setImportResult(result);
      setStep('preview');
    } catch (err) {
      setError('Failed to read file. Please ensure it is a valid text file.');
      console.error(err);
    }
  };

  const handleCommit = async () => {
    if (!importResult) return;

    setImporting(true);
    setError(null);

    try {
      const importService = new ChequeImportService(tenantId);
      const entityService = new EntityService(tenantId);

      // Commit the import
      const committed = importService.commitImport(importResult.batchId, 'user');

      if (!committed) {
        throw new Error('Failed to commit import');
      }

      // Auto-discover entities
      const cheques = importService.getAllCheques();
      entityService.discoverFromCheques(cheques);

      setStep('complete');
    } catch (err) {
      setError('Failed to commit import. Please try again.');
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setFile(null);
    setImportResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/financial"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Import Cheque Data</h1>
          <p className="text-gray-600 mt-1">Upload POS cheque export files (tab-delimited .txt)</p>
        </div>

        {/* Upload Step */}
        {step === 'upload' && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            className="bg-white rounded-lg shadow-sm border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors p-12"
          >
            <div className="text-center">
              <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Drop your cheque file here
              </h2>
              <p className="text-gray-600 mb-6">
                or click to browse your files
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
                <FileText className="w-5 h-5" />
                Select File
                <input
                  type="file"
                  accept=".txt,.csv,.tsv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
              <p className="text-sm text-gray-500 mt-4">
                Supports: cheques_YYYYMMDD.TXT from SoftRestaurant or ICG
              </p>
            </div>
          </div>
        )}

        {/* Preview Step */}
        {step === 'preview' && importResult && (
          <div className="space-y-6">
            {/* File Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-4 mb-4">
                <FileText className="w-8 h-8 text-blue-600" />
                <div>
                  <h3 className="font-semibold text-gray-900">{file?.name}</h3>
                  <p className="text-sm text-gray-500">
                    {(file?.size || 0 / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            </div>

            {/* Import Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Import Summary</h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Total Rows</p>
                  <p className="text-2xl font-bold text-gray-900">{importResult.totalRows}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-green-600">Valid Rows</p>
                  <p className="text-2xl font-bold text-green-700">{importResult.validRows}</p>
                </div>
                <div className={`${importResult.errorRows > 0 ? 'bg-red-50' : 'bg-gray-50'} rounded-lg p-4`}>
                  <p className={`text-sm ${importResult.errorRows > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    Errors
                  </p>
                  <p className={`text-2xl font-bold ${importResult.errorRows > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                    {importResult.errorRows}
                  </p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-blue-700">
                    ${importResult.totalRevenue.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Date Range:</span>
                  <span className="ml-2 font-medium">
                    {importResult.dateRange.start.substring(0, 10)} to{' '}
                    {importResult.dateRange.end.substring(0, 10)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Locations:</span>
                  <span className="ml-2 font-medium">{importResult.locations.length}</span>
                </div>
                <div>
                  <span className="text-gray-600">Staff Members:</span>
                  <span className="ml-2 font-medium">{importResult.staff.length}</span>
                </div>
                <div>
                  <span className="text-gray-600">Shifts:</span>
                  <span className="ml-2 font-medium">{importResult.shifts.join(', ')}</span>
                </div>
              </div>
            </div>

            {/* Errors */}
            {importResult.errors.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-yellow-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Warnings ({importResult.errors.length})
                  </h3>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {importResult.errors.slice(0, 10).map((err, i) => (
                    <div
                      key={i}
                      className={`text-sm p-2 rounded ${
                        err.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'
                      }`}
                    >
                      Row {err.row}: {err.message}
                    </div>
                  ))}
                  {importResult.errors.length > 10 && (
                    <p className="text-sm text-gray-500">
                      ... and {importResult.errors.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                <XCircle className="w-5 h-5 text-red-600" />
                <p className="text-red-700">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between">
              <button
                onClick={handleReset}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={importing || importResult.validRows === 0}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Commit Import
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Complete Step */}
        {step === 'complete' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Complete!</h2>
            <p className="text-gray-600 mb-6">
              Successfully imported {importResult?.validRows} cheque records.
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={handleReset}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Import Another File
              </button>
              <Link
                href="/financial"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                View Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
