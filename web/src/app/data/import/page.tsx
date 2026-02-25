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
  FileText,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingButton } from '@/components/ui/loading-button';
import { UploadZone } from '@/components/ingestion/UploadZone';
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
import {
  validateImportData as validateChequesData,
  executeImport as executeChequesImport,
  generateSampleData as generateChequesSample,
  ImportPreview as ChequesPreview,
  ImportResult as ChequesResult,
} from '@/lib/cheques-import-service';
import { useTenant, useTerm, useCurrency } from '@/contexts/tenant-context';
import { pageVariants } from '@/lib/animations';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

type ImportStep = 'upload' | 'mapping' | 'preview' | 'complete';

const STEPS: { key: ImportStep; label: string; number: number }[] = [
  { key: 'upload', label: 'Upload File', number: 1 },
  { key: 'mapping', label: 'Map Columns', number: 2 },
  { key: 'preview', label: 'Preview & Validate', number: 3 },
  { key: 'complete', label: 'Complete', number: 4 },
];

// Simplified steps for TSV import (no mapping needed)
const TSV_STEPS: { key: ImportStep; label: string; number: number }[] = [
  { key: 'upload', label: 'Subir Archivo', number: 1 },
  { key: 'preview', label: 'Validar', number: 2 },
  { key: 'complete', label: 'Completo', number: 3 },
];

export default function ImportPage() {
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const transactionTerm = useTerm('transaction', true);
  const isHospitality = currentTenant?.industry === 'Hospitality';

  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [fileData, setFileData] = useState<{
    headers: string[];
    rows: string[][];
    fileName: string;
    content: string;
  } | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Hospitality-specific state
  const [chequesPreview, setChequesPreview] = useState<ChequesPreview | null>(null);
  const [chequesResult, setChequesResult] = useState<ChequesResult | null>(null);

  const steps = isHospitality ? TSV_STEPS : STEPS;

  const handleFileSelect = (file: File, content: string) => {
    if (isHospitality) {
      // TSV import for hospitality
      const preview = validateChequesData(content, file.name);

      setFileData({
        headers: preview.detectedColumns,
        rows: [],
        fileName: file.name,
        content,
      });
      setChequesPreview(preview);

      if (preview.missingColumns.length > 0) {
        toast.error('Columnas faltantes', {
          description: `Faltan ${preview.missingColumns.length} columnas requeridas.`,
        });
      } else if (preview.errorRows > 0) {
        toast.warning('Archivo cargado con errores', {
          description: `${preview.validRows} filas válidas, ${preview.errorRows} con errores.`,
        });
      } else {
        toast.success('Archivo validado', {
          description: `${preview.validRows} filas listas para importar.`,
        });
      }

      setCurrentStep('preview');
      return;
    }

    // Standard CSV import for other tenants
    const { headers, rows } = parseCSV(content);

    if (headers.length === 0) {
      toast.error('Invalid file', {
        description: 'The file appears to be empty or invalid.',
      });
      return;
    }

    const autoMappings = autoDetectMappings(headers, TRANSACTION_FIELDS);

    setFileData({ headers, rows, fileName: file.name, content });
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
    if (isHospitality && fileData && chequesPreview) {
      setIsImporting(true);
      try {
        const result = await executeChequesImport(fileData.content, fileData.fileName);
        setChequesResult(result);
        setCurrentStep('complete');

        if (result.success) {
          toast.success('Importación completada', {
            description: `Se importaron ${result.importedRows} cheques correctamente.`,
          });
        } else {
          toast.error('Error en la importación', {
            description: 'No se pudieron importar los cheques.',
          });
        }
      } catch {
        toast.error('Error en la importación', {
          description: 'Ocurrió un error durante la importación.',
        });
      } finally {
        setIsImporting(false);
      }
      return;
    }

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
    if (isHospitality) {
      const template = generateChequesSample(5);
      downloadFile(template, 'plantilla-cheques.tsv');
      toast.success('Plantilla descargada');
      return;
    }
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
    setChequesPreview(null);
    setChequesResult(null);
  };

  const canProceedToValidation = () => {
    const mappedRequiredFields = mappings
      .filter((m) => m.targetField)
      .map((m) => m.targetField);
    const requiredFields = TRANSACTION_FIELDS.filter((f) => f.required).map((f) => f.key);
    return requiredFields.every((f) => mappedRequiredFields.includes(f));
  };

  const canImport = () => {
    if (isHospitality) {
      return chequesPreview && chequesPreview.validRows > 0 && chequesPreview.missingColumns.length === 0;
    }
    return preview && preview.validRows > 0;
  };

  const getCurrentStepIndex = () => steps.findIndex((s) => s.key === currentStep);

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
        <h1 className="text-2xl font-bold text-slate-50">
          {isHospitality ? 'Importar Cheques' : `Import ${transactionTerm}`}
        </h1>
        <p className="text-slate-400 mt-1">
          {isHospitality
            ? 'Sube tu archivo TSV de cheques desde el sistema POS'
            : 'Upload your transaction data from CSV or Excel files'}
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isActive = step.key === currentStep;
            const isComplete = getCurrentStepIndex() > index;
            const isLast = index === steps.length - 1;

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
                      isComplete || isActive ? 'text-white' : 'text-slate-400'
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
                        ? 'text-slate-50'
                        : 'text-slate-400'
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
                  {isHospitality ? 'Sube tu Archivo' : 'Upload Your File'}
                </CardTitle>
                <CardDescription>
                  {isHospitality
                    ? 'Sube un archivo TSV (.txt) exportado desde tu sistema POS'
                    : 'Upload a CSV or Excel file containing your transaction data'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <UploadZone
                  acceptCategories={isHospitality ? ['text'] : ['spreadsheets', 'text']}
                  onFileContent={handleFileSelect}
                  maxFiles={1}
                />

                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-sm text-slate-400">{isHospitality ? 'o' : 'or'}</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <div className="text-center">
                  <Button variant="outline" onClick={handleDownloadTemplate}>
                    <Download className="h-4 w-4 mr-2" />
                    {isHospitality ? 'Descargar Plantilla' : 'Download Template'}
                  </Button>
                  <p className="text-xs text-slate-400 mt-2">
                    {isHospitality
                      ? 'Usa esta plantilla para ver el formato correcto'
                      : 'Start with our template to ensure correct formatting'}
                  </p>
                </div>

                {isHospitality && (
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4">
                    <div className="flex gap-2">
                      <FileText className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                          Formato de archivo esperado
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          El archivo debe ser TSV (valores separados por tabulación) con las columnas
                          del sistema POS: numero_franquicia, turno_id, folio, numero_cheque, fecha,
                          cierre, numero_de_personas, mesero_id, pagado, cancelado, total, propina, etc.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {currentStep === 'mapping' && fileData && !isHospitality && (
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

        {currentStep === 'preview' && isHospitality && chequesPreview && (
          <motion.div
            key="preview-hospitality"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Revisar e Importar</CardTitle>
                <CardDescription>
                  Revisa los resultados de la validación antes de importar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-900 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-slate-50">
                      {chequesPreview.totalRows}
                    </p>
                    <p className="text-sm text-slate-400">Total Filas</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-600">
                      {chequesPreview.validRows}
                    </p>
                    <p className="text-sm text-emerald-600">Válidas</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-red-600">
                      {chequesPreview.errorRows}
                    </p>
                    <p className="text-sm text-red-600">Con Errores</p>
                  </div>
                </div>

                {/* Missing Columns Warning */}
                {chequesPreview.missingColumns.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-4">
                    <div className="flex gap-2">
                      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-800 dark:text-red-200">
                          Columnas requeridas faltantes
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {chequesPreview.missingColumns.map((col) => (
                            <Badge key={col} variant="destructive" className="text-xs">
                              {col}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Detected Columns */}
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Columnas detectadas ({chequesPreview.detectedColumns.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {chequesPreview.detectedColumns.map((col) => (
                      <Badge key={col} variant="secondary" className="text-xs">
                        {col}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Sample Data */}
                {chequesPreview.sampleData.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Datos de muestra
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2">Cheque #</th>
                            <th className="text-left py-2 px-2">Franquicia</th>
                            <th className="text-left py-2 px-2">Fecha</th>
                            <th className="text-right py-2 px-2">Total</th>
                            <th className="text-right py-2 px-2">Propina</th>
                          </tr>
                        </thead>
                        <tbody>
                          {chequesPreview.sampleData.map((row, i) => (
                            <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                              <td className="py-2 px-2 font-mono">{row.numero_cheque}</td>
                              <td className="py-2 px-2">{row.numero_franquicia}</td>
                              <td className="py-2 px-2">{row.fecha?.split(' ')[0]}</td>
                              <td className="py-2 px-2 text-right">{formatCurrency(row.total ?? 0)}</td>
                              <td className="py-2 px-2 text-right text-green-600">{formatCurrency(row.propina ?? 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Errors */}
                {chequesPreview.errors.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">
                      Errores encontrados ({chequesPreview.errors.length})
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {chequesPreview.errors.slice(0, 10).map((err, i) => (
                        <div key={i} className="text-xs bg-red-50 dark:bg-red-950/20 p-2 rounded">
                          <span className="text-red-600">Fila {err.row}:</span>{' '}
                          <span className="text-slate-600 dark:text-slate-400">{err.messageEs}</span>
                        </div>
                      ))}
                      {chequesPreview.errors.length > 10 && (
                        <p className="text-xs text-slate-400 text-center py-2">
                          ... y {chequesPreview.errors.length - 10} errores más
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-between pt-6 border-t">
                  <Button variant="outline" onClick={handleReset}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Atrás
                  </Button>
                  <LoadingButton
                    onClick={handleImport}
                    loading={isImporting}
                    disabled={!canImport()}
                  >
                    Importar {chequesPreview.validRows} Cheques
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </LoadingButton>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {currentStep === 'preview' && preview && !isHospitality && (
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

        {currentStep === 'complete' && isHospitality && chequesResult && (
          <motion.div
            key="complete-hospitality"
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
                  <div className={cn(
                    'w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6',
                    chequesResult.success
                      ? 'bg-emerald-100 dark:bg-emerald-900/30'
                      : 'bg-red-100 dark:bg-red-900/30'
                  )}>
                    {chequesResult.success ? (
                      <CheckCircle className="h-10 w-10 text-emerald-500" />
                    ) : (
                      <AlertCircle className="h-10 w-10 text-red-500" />
                    )}
                  </div>
                </motion.div>

                <h2 className="text-2xl font-bold text-slate-50 mb-2">
                  {chequesResult.success ? 'Importación Completada' : 'Error en la Importación'}
                </h2>
                <p className="text-slate-400 mb-6">
                  {chequesResult.success
                    ? 'Los datos de cheques se importaron correctamente.'
                    : 'No se pudieron importar los cheques.'}
                </p>

                <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto mb-8">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg">
                    <p className="text-2xl font-bold text-emerald-600">
                      {chequesResult.importedRows}
                    </p>
                    <p className="text-sm text-emerald-600">Importados</p>
                  </div>
                  <div className="p-4 bg-slate-900 rounded-lg">
                    <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">
                      {chequesResult.errorRows}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Errores</p>
                  </div>
                </div>

                <div className="flex justify-center gap-4">
                  <Button variant="outline" onClick={handleReset}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Importar Más
                  </Button>
                  <Button asChild>
                    <Link href="/transactions">Ver Cheques</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {currentStep === 'complete' && importResult && !isHospitality && (
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

                <h2 className="text-2xl font-bold text-slate-50 mb-2">
                  Import Complete!
                </h2>
                <p className="text-slate-400 mb-6">
                  Your transaction data has been successfully imported.
                </p>

                <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto mb-8">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg">
                    <p className="text-2xl font-bold text-emerald-600">
                      {importResult.imported}
                    </p>
                    <p className="text-sm text-emerald-600">Imported</p>
                  </div>
                  <div className="p-4 bg-slate-900 rounded-lg">
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
                    <Link href="/transactions">View Transactions</Link>
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
