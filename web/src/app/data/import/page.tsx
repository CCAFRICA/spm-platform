'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Download,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingButton } from '@/components/ui/loading-button';
import { FileUpload } from '@/components/import/file-upload';
import { ColumnMapper } from '@/components/import/column-mapper';
import { ValidationPreview } from '@/components/import/validation-preview';
import {
  parseCSV,
  autoDetectMappings,
  validateImportData,
  executeImport,
  generateTemplate,
  downloadFile,
  ColumnMapping,
  ImportPreview,
  ImportResult,
  TRANSACTION_FIELDS,
} from '@/lib/import-service';
import { pageVariants } from '@/lib/animations';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ImportStep = 'upload' | 'mapping' | 'preview' | 'complete';

const STEPS: { key: ImportStep; label: string; number: number }[] = [
  { key: 'upload', label: 'Upload File', number: 1 },
  { key: 'mapping', label: 'Map Columns', number: 2 },
  { key: 'preview', label: 'Preview & Validate', number: 3 },
  { key: 'complete', label: 'Complete', number: 4 },
];

export default function ImportPage() {
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [fileData, setFileData] = useState<{
    headers: string[];
    rows: string[][];
    fileName: string;
  } | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileSelect = (file: File, content: string) => {
    const { headers, rows } = parseCSV(content);

    if (headers.length === 0) {
      toast.error('Invalid file', {
        description: 'The file appears to be empty or invalid.',
      });
      return;
    }

    const autoMappings = autoDetectMappings(headers, TRANSACTION_FIELDS);

    setFileData({ headers, rows, fileName: file.name });
    setMappings(autoMappings);

    toast.success('File uploaded', {
      description: `Found ${rows.length} rows and ${headers.length} columns.`,
    });

    setCurrentStep('mapping');
  };

  const handleValidate = () => {
    if (!fileData) return;

    const validationResult = validateImportData(
      fileData.rows,
      fileData.headers,
      mappings,
      TRANSACTION_FIELDS
    );

    setPreview(validationResult);
    setCurrentStep('preview');

    if (validationResult.errorRows === 0 && validationResult.errors.length === 0) {
      toast.success('Validation passed', {
        description: 'All rows are valid and ready to import.',
      });
    } else {
      toast.warning('Validation complete', {
        description: `Found ${validationResult.errors.length} issues to review.`,
      });
    }
  };

  const handleImport = async () => {
    if (!fileData || !preview) return;

    setIsImporting(true);

    try {
      const result = await executeImport(fileData.rows, mappings, TRANSACTION_FIELDS);
      setImportResult(result);
      setCurrentStep('complete');

      if (result.success) {
        toast.success('Import complete', {
          description: `Successfully imported ${result.imported} records.`,
        });
      } else {
        toast.error('Import failed', {
          description: 'No records were imported.',
        });
      }
    } catch {
      toast.error('Import failed', {
        description: 'An error occurred during import.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const template = generateTemplate(TRANSACTION_FIELDS);
    downloadFile(template, 'transaction-import-template.csv');
    toast.success('Template downloaded');
  };

  const handleReset = () => {
    setCurrentStep('upload');
    setFileData(null);
    setMappings([]);
    setPreview(null);
    setImportResult(null);
  };

  const canProceedToValidation = () => {
    const mappedRequiredFields = mappings
      .filter((m) => m.targetField)
      .map((m) => m.targetField);
    const requiredFields = TRANSACTION_FIELDS.filter((f) => f.required).map((f) => f.key);
    return requiredFields.every((f) => mappedRequiredFields.includes(f));
  };

  const canImport = () => {
    return preview && preview.validRows > 0;
  };

  const getCurrentStepIndex = () => STEPS.findIndex((s) => s.key === currentStep);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="container mx-auto px-4 py-8 max-w-4xl"
    >
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          Import Transactions
        </h1>
        <p className="text-slate-500 mt-1">
          Upload your transaction data from CSV or Excel files
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const isActive = step.key === currentStep;
            const isComplete = getCurrentStepIndex() > index;
            const isLast = index === STEPS.length - 1;

            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className="flex items-center">
                  <motion.div
                    initial={false}
                    animate={{
                      scale: isActive ? 1.1 : 1,
                      backgroundColor: isComplete
                        ? 'rgb(16, 185, 129)'
                        : isActive
                        ? 'rgb(14, 165, 233)'
                        : 'rgb(226, 232, 240)',
                    }}
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm',
                      isComplete || isActive ? 'text-white' : 'text-slate-500'
                    )}
                  >
                    {isComplete ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      step.number
                    )}
                  </motion.div>
                  <span
                    className={cn(
                      'ml-3 text-sm font-medium hidden sm:block',
                      isActive
                        ? 'text-slate-900 dark:text-slate-50'
                        : 'text-slate-500'
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {!isLast && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 mx-4',
                      isComplete ? 'bg-emerald-500' : 'bg-slate-200'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {currentStep === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Your File
                </CardTitle>
                <CardDescription>
                  Upload a CSV or Excel file containing your transaction data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FileUpload onFileSelect={handleFileSelect} />

                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-sm text-slate-500">or</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <div className="text-center">
                  <Button variant="outline" onClick={handleDownloadTemplate}>
                    <Download className="h-4 w-4 mr-2" />
                    Download Template
                  </Button>
                  <p className="text-xs text-slate-500 mt-2">
                    Start with our template to ensure correct formatting
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {currentStep === 'mapping' && fileData && (
          <motion.div
            key="mapping"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Map Your Columns</CardTitle>
                <CardDescription>
                  Match your file columns to the transaction fields. Required fields are
                  marked.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ColumnMapper
                  sourceHeaders={fileData.headers}
                  targetFields={TRANSACTION_FIELDS}
                  mappings={mappings}
                  onMappingChange={setMappings}
                  sampleData={fileData.rows.slice(0, 3)}
                />

                <div className="flex justify-between mt-6 pt-6 border-t">
                  <Button variant="outline" onClick={handleReset}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    onClick={handleValidate}
                    disabled={!canProceedToValidation()}
                  >
                    Validate
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {currentStep === 'preview' && preview && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Review & Import</CardTitle>
                <CardDescription>
                  Review the validation results before importing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ValidationPreview preview={preview} targetFields={TRANSACTION_FIELDS} />

                <div className="flex justify-between mt-6 pt-6 border-t">
                  <Button variant="outline" onClick={() => setCurrentStep('mapping')}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Mapping
                  </Button>
                  <LoadingButton
                    onClick={handleImport}
                    loading={isImporting}
                    disabled={!canImport()}
                  >
                    Import {preview.validRows} Records
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </LoadingButton>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {currentStep === 'complete' && importResult && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                >
                  <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="h-10 w-10 text-emerald-500" />
                  </div>
                </motion.div>

                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">
                  Import Complete!
                </h2>
                <p className="text-slate-500 mb-6">
                  Your transaction data has been successfully imported.
                </p>

                <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto mb-8">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg">
                    <p className="text-2xl font-bold text-emerald-600">
                      {importResult.imported}
                    </p>
                    <p className="text-sm text-emerald-600">Imported</p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                    <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">
                      {importResult.skipped}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Skipped</p>
                  </div>
                </div>

                <div className="flex justify-center gap-4">
                  <Button variant="outline" onClick={handleReset}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Import More
                  </Button>
                  <Button asChild>
                    <a href="/transactions/orders">View Transactions</a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
