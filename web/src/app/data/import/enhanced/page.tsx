'use client';

/**
 * Enhanced Import Wizard
 *
 * Multi-step import workflow with smart mapping and approval integration.
 * Supports CSV, TSV, JSON, and XLSX files with AI-assisted field mapping.
 */

import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Upload,
  FileText,
  MapPin,
  CheckCircle,
  ClipboardCheck,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Sparkles,
  Table,
} from 'lucide-react';
import {
  parseFile,
  parseExcelSheet,
  getExcelWorksheets,
  isExcelFile,
  type ParsedFile,
  type WorksheetInfo,
} from '@/lib/import-pipeline/file-parser';
import {
  suggestMappings,
  saveMappingTemplate,
  type FieldMapping,
} from '@/lib/import-pipeline/smart-mapper';
import { initiateImport, type ImportResult } from '@/lib/import-pipeline/import-service';
import { FieldMapper } from '@/components/import/field-mapper';
import { ImportSummaryDashboard } from '@/components/import/import-summary-dashboard';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';

// Extended FieldMapping with AI data
interface AIFieldMapping extends FieldMapping {
  reasoning?: string;
  aiSuggested?: boolean;
}

type Step = 'upload' | 'map' | 'validate' | 'approve';

const STEPS: Step[] = ['upload', 'map', 'validate', 'approve'];

const STEP_CONFIG = {
  upload: {
    icon: Upload,
    title: { en: 'Upload File', es: 'Cargar Archivo' },
    description: { en: 'Select your data file', es: 'Seleccione su archivo de datos' },
  },
  map: {
    icon: MapPin,
    title: { en: 'Map Fields', es: 'Mapear Campos' },
    description: { en: 'Connect columns to platform fields', es: 'Conectar columnas a campos' },
  },
  validate: {
    icon: CheckCircle,
    title: { en: 'Validate & Review', es: 'Validar y Revisar' },
    description: { en: 'Review data quality and issues', es: 'Revisar calidad y problemas' },
  },
  approve: {
    icon: ClipboardCheck,
    title: { en: 'Approve Import', es: 'Aprobar Importación' },
    description: { en: 'Confirm and submit for approval', es: 'Confirmar y enviar' },
  },
};

const SOURCE_SYSTEMS = [
  { id: 'salesforce', name: 'Salesforce' },
  { id: 'hubspot', name: 'HubSpot' },
  { id: 'dynamics', name: 'Microsoft Dynamics' },
  { id: 'sap', name: 'SAP' },
  { id: 'csv_export', name: 'CSV Export' },
  { id: 'excel_export', name: 'Excel Export' },
  { id: 'other', name: 'Other' },
];

export default function EnhancedImportPage() {
  const { locale } = useLocale();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const isSpanish = locale === 'es-MX';

  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceSystem, setSourceSystem] = useState<string>('csv_export');
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);

  // Sheet selection state (for xlsx files)
  const [worksheets, setWorksheets] = useState<WorksheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [showSheetSelector, setShowSheetSelector] = useState(false);

  // Mapping state
  const [mappings, setMappings] = useState<AIFieldMapping[]>([]);
  const [aiMappingStatus, setAiMappingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [aiMappingConfidence, setAiMappingConfidence] = useState<number>(0);

  // Result state
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const tenantId = currentTenant?.id || 'default';
  const userId = user?.id || 'admin';

  // AI-assisted field mapping
  const getAIMappings = useCallback(
    async (parsed: ParsedFile): Promise<AIFieldMapping[]> => {
      setAiMappingStatus('loading');

      try {
        console.log('Calling /api/interpret-import for AI mapping...');
        const response = await fetch('/api/interpret-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            headers: parsed.headers,
            sampleData: parsed.rows.slice(0, 5),
            tenantId,
            planContext: null, // Could be enhanced with current plan info
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('AI mapping response:', data);

          if (data.success && data.interpretation?.mappings) {
            setAiMappingStatus('success');
            setAiMappingConfidence(data.interpretation.overallConfidence || 0);

            // Convert AI mappings to our format
            return data.interpretation.mappings.map((m: {
              sourceField: string;
              targetField: string | null;
              confidence: number;
              matchType: string;
              reasoning?: string;
            }) => ({
              sourceField: m.sourceField,
              targetField: m.targetField,
              confidence: m.confidence,
              matchType: m.matchType === 'semantic' ? 'fuzzy' : m.matchType,
              reasoning: m.reasoning,
              aiSuggested: true,
            }));
          }
        }

        console.warn('AI mapping failed, falling back to heuristics');
        setAiMappingStatus('error');
      } catch (err) {
        console.error('AI mapping error:', err);
        setAiMappingStatus('error');
      }

      // Fallback to heuristic mapping
      return suggestMappings(parsed.headers, tenantId, sourceSystem);
    },
    [tenantId, sourceSystem]
  );

  // File upload handler
  const handleFileSelect = useCallback(
    async (file: File) => {
      setSelectedFile(file);
      setError(null);
      setIsProcessing(true);
      setAiMappingStatus('idle');
      setWorksheets([]);
      setSelectedSheet(null);
      setShowSheetSelector(false);

      try {
        // Check if it's an Excel file with multiple sheets
        if (isExcelFile(file)) {
          const sheets = await getExcelWorksheets(file);
          console.log('Excel worksheets found:', sheets);

          if (sheets.length > 1) {
            // Show sheet selector
            setWorksheets(sheets);
            setShowSheetSelector(true);
            setIsProcessing(false);
            return; // Wait for user to select a sheet
          }
          // Single sheet - proceed normally
        }

        const parsed = await parseFile(file);
        setParsedFile(parsed);

        // Get AI-assisted mapping suggestions
        const suggestions = await getAIMappings(parsed);
        setMappings(suggestions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file');
      } finally {
        setIsProcessing(false);
      }
    },
    [getAIMappings]
  );

  // Handle sheet selection for Excel files
  const handleSheetSelect = useCallback(
    async (sheetName: string) => {
      if (!selectedFile) return;

      setSelectedSheet(sheetName);
      setShowSheetSelector(false);
      setIsProcessing(true);
      setError(null);

      try {
        const parsed = await parseExcelSheet(selectedFile, sheetName);
        setParsedFile(parsed);

        // Get AI-assisted mapping suggestions
        const suggestions = await getAIMappings(parsed);
        setMappings(suggestions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse worksheet');
      } finally {
        setIsProcessing(false);
      }
    },
    [selectedFile, getAIMappings]
  );

  // Drop zone handler
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  // Process import
  const handleProcessImport = async () => {
    if (!parsedFile) return;

    setIsProcessing(true);
    setError(null);

    try {
      const result = await initiateImport(parsedFile, {
        tenantId,
        userId,
        sourceSystem,
        mappings,
        autoApproveThreshold: 3, // Auto-approve low impact
      });

      setImportResult(result);
      setCurrentStep('approve');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Save mapping template
  const handleSaveTemplate = (name: string) => {
    saveMappingTemplate(tenantId, sourceSystem, name, mappings);
  };

  // Navigation
  const goToStep = (step: Step) => {
    const currentIndex = STEPS.indexOf(currentStep);
    const targetIndex = STEPS.indexOf(step);
    if (targetIndex <= currentIndex + 1) {
      setCurrentStep(step);
    }
  };

  const goNext = () => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex < STEPS.length - 1) {
      if (currentStep === 'map') {
        handleProcessImport();
      } else {
        setCurrentStep(STEPS[currentIndex + 1]);
      }
    }
  };

  const goBack = () => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1]);
    }
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'upload':
        // Can't proceed if waiting for sheet selection
        return !!parsedFile && !showSheetSelector;
      case 'map':
        return mappings.some((m) => m.targetField);
      case 'validate':
        return !!importResult;
      case 'approve':
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isSpanish ? 'Importación Inteligente' : 'Smart Import'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish
              ? 'Importe datos con mapeo automático y validación'
              : 'Import data with automatic mapping and validation'}
          </p>
        </div>
        <Badge variant="secondary">Beta</Badge>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const config = STEP_CONFIG[step];
          const Icon = config.icon;
          const isActive = step === currentStep;
          const isPast = STEPS.indexOf(step) < STEPS.indexOf(currentStep);
          const isClickable = STEPS.indexOf(step) <= STEPS.indexOf(currentStep) + 1;

          return (
            <div key={step} className="flex items-center">
              <button
                onClick={() => isClickable && goToStep(step)}
                disabled={!isClickable}
                className={cn(
                  'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors',
                  isActive && 'bg-primary text-primary-foreground',
                  isPast && 'bg-green-100 text-green-700',
                  !isActive && !isPast && 'bg-muted text-muted-foreground',
                  isClickable && 'cursor-pointer hover:opacity-80'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center h-8 w-8 rounded-full',
                    isActive && 'bg-primary-foreground/20',
                    isPast && 'bg-green-200',
                    !isActive && !isPast && 'bg-muted-foreground/20'
                  )}
                >
                  {isPast ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <div className="text-left hidden md:block">
                  <p className="font-medium text-sm">
                    {isSpanish ? config.title.es : config.title.en}
                  </p>
                  <p className="text-xs opacity-75">
                    {isSpanish ? config.description.es : config.description.en}
                  </p>
                </div>
              </button>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 w-8 mx-2',
                    isPast ? 'bg-green-500' : 'bg-muted'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertTriangle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Step Content */}
      <Card className="min-h-[400px]">
        <CardContent className="p-6">
          {/* Upload Step */}
          {currentStep === 'upload' && (
            <div className="space-y-6">
              {/* Source system selector */}
              <div className="max-w-md">
                <label className="text-sm font-medium mb-2 block">
                  {isSpanish ? 'Sistema de Origen' : 'Source System'}
                </label>
                <Select value={sourceSystem} onValueChange={setSourceSystem}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_SYSTEMS.map((sys) => (
                      <SelectItem key={sys.id} value={sys.id}>
                        {sys.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sheet Selector for Excel files */}
              {showSheetSelector && worksheets.length > 0 && (
                <div className="p-6 border-2 border-blue-200 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-4">
                    <Table className="h-5 w-5 text-blue-600" />
                    <h3 className="font-medium text-blue-800">
                      {isSpanish ? 'Seleccionar Hoja de Cálculo' : 'Select Worksheet'}
                    </h3>
                  </div>
                  <p className="text-sm text-blue-700 mb-4">
                    {isSpanish
                      ? `El archivo Excel contiene ${worksheets.length} hojas. Seleccione cuál desea importar:`
                      : `This Excel file contains ${worksheets.length} worksheets. Select which one to import:`}
                  </p>
                  <div className="grid gap-3">
                    {worksheets.map((sheet) => (
                      <button
                        key={sheet.name}
                        onClick={() => handleSheetSelect(sheet.name)}
                        className="flex items-center justify-between p-4 bg-white border rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
                      >
                        <div>
                          <p className="font-medium">{sheet.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {sheet.rowCount} {isSpanish ? 'filas' : 'rows'} •{' '}
                            {sheet.columnCount} {isSpanish ? 'columnas' : 'columns'}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Drop zone */}
              {!showSheetSelector && (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className={cn(
                    'border-2 border-dashed rounded-lg p-12 text-center transition-colors',
                    'hover:border-primary hover:bg-primary/5',
                    selectedFile && parsedFile && 'border-green-500 bg-green-50'
                  )}
                >
                  {isProcessing ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      <p>{isSpanish ? 'Procesando archivo...' : 'Processing file...'}</p>
                    </div>
                  ) : selectedFile && parsedFile ? (
                    <div className="flex flex-col items-center gap-3">
                      <FileText className="h-12 w-12 text-green-600" />
                      <div>
                        <p className="font-medium">{selectedFile.name}</p>
                        {selectedSheet && (
                          <p className="text-sm text-blue-600">
                            {isSpanish ? 'Hoja' : 'Sheet'}: {selectedSheet}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {parsedFile?.rowCount} {isSpanish ? 'registros' : 'records'} •{' '}
                          {parsedFile?.headers.length} {isSpanish ? 'columnas' : 'columns'}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedFile(null);
                          setParsedFile(null);
                          setWorksheets([]);
                          setSelectedSheet(null);
                          setShowSheetSelector(false);
                          setAiMappingStatus('idle');
                        }}
                      >
                        {isSpanish ? 'Cambiar archivo' : 'Change file'}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Upload className="h-12 w-12 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {isSpanish
                            ? 'Arrastre un archivo aquí o haga clic para seleccionar'
                            : 'Drag a file here or click to select'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {isSpanish
                            ? 'Soporta CSV, TSV, JSON, Excel (.xlsx)'
                            : 'Supports CSV, TSV, JSON, Excel (.xlsx)'}
                        </p>
                      </div>
                      <input
                        type="file"
                        accept=".csv,.tsv,.json,.xlsx,.xls"
                        className="hidden"
                        id="file-input"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(file);
                        }}
                      />
                      <Button asChild variant="outline">
                        <label htmlFor="file-input" className="cursor-pointer">
                          {isSpanish ? 'Seleccionar Archivo' : 'Select File'}
                        </label>
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* AI Mapping Status */}
              {parsedFile && !showSheetSelector && (
                <div className={cn(
                  'p-4 rounded-lg flex items-center gap-3',
                  aiMappingStatus === 'loading' && 'bg-blue-50 border border-blue-200',
                  aiMappingStatus === 'success' && 'bg-green-50 border border-green-200',
                  aiMappingStatus === 'error' && 'bg-yellow-50 border border-yellow-200'
                )}>
                  {aiMappingStatus === 'loading' && (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                      <span className="text-blue-700">
                        {isSpanish ? 'AI analizando campos...' : 'AI analyzing fields...'}
                      </span>
                    </>
                  )}
                  {aiMappingStatus === 'success' && (
                    <>
                      <Sparkles className="h-5 w-5 text-green-600" />
                      <span className="text-green-700">
                        {isSpanish
                          ? `AI sugirió mapeos con ${aiMappingConfidence}% de confianza`
                          : `AI suggested mappings with ${aiMappingConfidence}% confidence`}
                      </span>
                      <Badge variant="secondary" className="ml-auto">
                        AI-Assisted
                      </Badge>
                    </>
                  )}
                  {aiMappingStatus === 'error' && (
                    <>
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      <span className="text-yellow-700">
                        {isSpanish
                          ? 'AI no disponible - usando mapeo heurístico'
                          : 'AI unavailable - using heuristic mapping'}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Preview */}
              {parsedFile && parsedFile.rows.length > 0 && !showSheetSelector && (
                <div>
                  <h3 className="font-medium mb-2">
                    {isSpanish ? 'Vista Previa' : 'Preview'}
                  </h3>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          {parsedFile.headers.slice(0, 6).map((header) => (
                            <th key={header} className="px-3 py-2 text-left font-medium">
                              {header}
                            </th>
                          ))}
                          {parsedFile.headers.length > 6 && (
                            <th className="px-3 py-2 text-left font-medium">...</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedFile.rows.slice(0, 3).map((row, i) => (
                          <tr key={i} className="border-t">
                            {parsedFile.headers.slice(0, 6).map((header) => (
                              <td key={header} className="px-3 py-2">
                                {String(row[header] ?? '')}
                              </td>
                            ))}
                            {parsedFile.headers.length > 6 && (
                              <td className="px-3 py-2">...</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Map Step */}
          {currentStep === 'map' && parsedFile && (
            <FieldMapper
              mappings={mappings}
              onMappingsChange={setMappings}
              onSaveTemplate={handleSaveTemplate}
            />
          )}

          {/* Validate Step */}
          {currentStep === 'validate' && importResult && (
            <ImportSummaryDashboard summary={importResult.summary} />
          )}

          {/* Approve Step */}
          {currentStep === 'approve' && importResult && (
            <div className="space-y-6">
              <div
                className={cn(
                  'p-6 rounded-lg border-2 text-center',
                  importResult.requiresApproval
                    ? 'bg-yellow-50 border-yellow-300'
                    : 'bg-green-50 border-green-300'
                )}
              >
                {importResult.requiresApproval ? (
                  <>
                    <ClipboardCheck className="h-12 w-12 mx-auto text-yellow-600 mb-4" />
                    <h3 className="text-xl font-semibold text-yellow-800 mb-2">
                      {isSpanish ? 'Enviado para Aprobación' : 'Submitted for Approval'}
                    </h3>
                    <p className="text-yellow-700">
                      {isSpanish
                        ? 'Este lote requiere aprobación antes de comprometerse. Revise en el Centro de Aprobaciones.'
                        : 'This batch requires approval before committing. Review in the Approval Center.'}
                    </p>
                    <Button className="mt-4" asChild>
                      <a href="/approvals">
                        {isSpanish ? 'Ir a Aprobaciones' : 'Go to Approvals'}
                      </a>
                    </Button>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-4" />
                    <h3 className="text-xl font-semibold text-green-800 mb-2">
                      {isSpanish ? 'Importación Completada' : 'Import Complete'}
                    </h3>
                    <p className="text-green-700">
                      {isSpanish
                        ? `${importResult.summary.cleanRecords + importResult.summary.autoCorrectedRecords} registros importados exitosamente.`
                        : `${importResult.summary.cleanRecords + importResult.summary.autoCorrectedRecords} records imported successfully.`}
                    </p>
                  </>
                )}
              </div>

              <ImportSummaryDashboard summary={importResult.summary} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={goBack}
          disabled={currentStep === 'upload' || currentStep === 'approve'}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {isSpanish ? 'Anterior' : 'Back'}
        </Button>

        {currentStep !== 'approve' && (
          <Button
            onClick={goNext}
            disabled={!canProceed() || isProcessing}
          >
            {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {currentStep === 'map'
              ? isSpanish
                ? 'Procesar Importación'
                : 'Process Import'
              : isSpanish
                ? 'Siguiente'
                : 'Next'}
            {!isProcessing && <ArrowRight className="h-4 w-4 ml-2" />}
          </Button>
        )}
      </div>
    </div>
  );
}
