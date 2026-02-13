'use client';

/**
 * Reconciliation Benchmark Page
 *
 * HF-021: Smart Upload -- AI-Powered File Comparison
 * Phase 1: Smart file parser with preview table and multi-sheet XLSX support
 *
 * Accepts: CSV, TSV, XLSX, XLS, JSON
 * Uses SheetJS for Excel formats.
 * Shows preview of first 5 rows with ALL columns.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { isVLAdmin } from '@/types/auth';
import { useAdminLocale } from '@/hooks/useAdminLocale';
import {
  getReconciliationBridge,
  type ExtendedReconciliationSession,
} from '@/lib/reconciliation/reconciliation-bridge';
import { getOrchestrator, getPeriodRuns } from '@/lib/orchestration/calculation-orchestrator';
import {
  parseFile,
  parseSheetFromWorkbook,
  getPreviewRows,
  type ParsedFile,
} from '@/lib/reconciliation/smart-file-parser';
import {
  mapColumns,
  recordMappingFeedback,
  buildMappingTargets,
  getEmployeeIdMapping,
  getTotalAmountMapping,
  type ColumnMapping,
  type MappingResult,
} from '@/lib/reconciliation/ai-column-mapper';
import type * as XLSX_TYPE from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  RefreshCw,
  Scale,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  SortAsc,
  SortDesc,
  FileSpreadsheet,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Bilingual labels
const labels = {
  'en-US': {
    title: 'Reconciliation Benchmark',
    subtitle: 'Compare calculation results against benchmark data',
    uploadBenchmark: 'Upload Benchmark File',
    uploadDesc: 'Upload CSV, Excel, or JSON file with expected results',
    supportedFormats: 'Supported: CSV, TSV, XLSX, XLS, JSON',
    selectBatch: 'Select Calculation Batch',
    noBatches: 'No calculation batches available',
    runReconciliation: 'Run Reconciliation',
    running: 'Running...',
    results: 'Results',
    matchRate: 'Match Rate',
    matched: 'Matched',
    discrepancies: 'Discrepancies',
    missing: 'Missing',
    sourceTotal: 'Benchmark Total',
    targetTotal: 'Calculated Total',
    difference: 'Difference',
    employeeComparison: 'Employee Comparison',
    employee: 'Employee',
    expected: 'Expected',
    calculated: 'Calculated',
    variance: 'Variance',
    status: 'Status',
    viewDetails: 'View Details',
    sortByVariance: 'Sort by Variance',
    filter: 'Filter',
    all: 'All',
    matchedOnly: 'Matched Only',
    discrepanciesOnly: 'Discrepancies Only',
    missingOnly: 'Missing Only',
    componentDetail: 'Component Detail',
    reasoning: 'Variance Analysis',
    back: 'Back',
    accessDenied: 'Access Denied',
    accessDeniedDesc: 'You must be a VL Admin to access this page.',
    fieldMapping: 'Field Mapping',
    employeeIdField: 'Employee ID Field',
    amountField: 'Amount Field',
    autoDetected: 'Auto-detected',
    // HF-021 Phase 1 additions
    preview: 'Preview',
    previewDesc: 'First 5 rows from uploaded file',
    selectSheet: 'Select Sheet',
    rowsLoaded: 'rows loaded',
    columns: 'columns',
    format: 'Format',
    parseError: 'Failed to parse file. Check format and try again.',
    uploadAnother: 'Upload Another',
    aiMapping: 'AI Column Mapping',
    aiMappingRunning: 'AI is analyzing columns...',
    aiMappingSuccess: 'AI mapped columns',
    aiMappingFailed: 'AI unavailable -- using manual mapping',
    mappedTo: 'Mapped to',
    confidence: 'Confidence',
    unmapped: 'Not mapped',
    confirmMapping: 'Confirm Column Mapping',
    confirmMappingDesc: 'Review AI suggestions and adjust if needed',
    sourceColumn: 'Source Column',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    confirmAndProceed: 'Confirm Mapping',
    noMapping: 'None (skip)',
  },
  'es-MX': {
    title: 'Reconciliacion de Benchmark',
    subtitle: 'Comparar resultados de calculo contra datos de benchmark',
    uploadBenchmark: 'Subir Archivo de Benchmark',
    uploadDesc: 'Suba archivo CSV, Excel o JSON con resultados esperados',
    supportedFormats: 'Soportados: CSV, TSV, XLSX, XLS, JSON',
    selectBatch: 'Seleccionar Lote de Calculo',
    noBatches: 'No hay lotes de calculo disponibles',
    runReconciliation: 'Ejecutar Reconciliacion',
    running: 'Ejecutando...',
    results: 'Resultados',
    matchRate: 'Tasa de Coincidencia',
    matched: 'Coincidentes',
    discrepancies: 'Discrepancias',
    missing: 'Faltantes',
    sourceTotal: 'Total Benchmark',
    targetTotal: 'Total Calculado',
    difference: 'Diferencia',
    employeeComparison: 'Comparacion por Empleado',
    employee: 'Empleado',
    expected: 'Esperado',
    calculated: 'Calculado',
    variance: 'Varianza',
    status: 'Estado',
    viewDetails: 'Ver Detalles',
    sortByVariance: 'Ordenar por Varianza',
    filter: 'Filtrar',
    all: 'Todos',
    matchedOnly: 'Solo Coincidentes',
    discrepanciesOnly: 'Solo Discrepancias',
    missingOnly: 'Solo Faltantes',
    componentDetail: 'Detalle de Componentes',
    reasoning: 'Analisis de Varianza',
    back: 'Volver',
    accessDenied: 'Acceso Denegado',
    accessDeniedDesc: 'Debe ser un VL Admin para acceder a esta pagina.',
    fieldMapping: 'Mapeo de Campos',
    employeeIdField: 'Campo de ID de Empleado',
    amountField: 'Campo de Monto',
    autoDetected: 'Auto-detectado',
    // HF-021 Phase 1 additions
    preview: 'Vista Previa',
    previewDesc: 'Primeras 5 filas del archivo subido',
    selectSheet: 'Seleccionar Hoja',
    rowsLoaded: 'filas cargadas',
    columns: 'columnas',
    format: 'Formato',
    parseError: 'Error al analizar el archivo. Verifique el formato e intente de nuevo.',
    uploadAnother: 'Subir Otro',
    aiMapping: 'Mapeo de Columnas con IA',
    aiMappingRunning: 'La IA esta analizando columnas...',
    aiMappingSuccess: 'IA mapeo las columnas',
    aiMappingFailed: 'IA no disponible -- usando mapeo manual',
    mappedTo: 'Mapeado a',
    confidence: 'Confianza',
    unmapped: 'Sin mapear',
    confirmMapping: 'Confirmar Mapeo de Columnas',
    confirmMappingDesc: 'Revise las sugerencias de IA y ajuste si es necesario',
    sourceColumn: 'Columna Fuente',
    high: 'Alta',
    medium: 'Media',
    low: 'Baja',
    confirmAndProceed: 'Confirmar Mapeo',
    noMapping: 'Ninguno (omitir)',
  },
};

interface BenchmarkRow {
  employeeId: string;
  employeeName?: string;
  amount: number;
  [key: string]: unknown;
}

interface CalculationBatch {
  id: string;
  periodId: string;
  runType: string;
  completedAt: string;
  totalPayout: number;
  employeesProcessed: number;
}

interface ComparisonItem {
  employeeId: string;
  employeeName: string;
  expected: number;
  calculated: number;
  variance: number;
  variancePercent: number;
  status: 'matched' | 'discrepancy' | 'missing_benchmark' | 'missing_calculated';
  benchmarkRow?: BenchmarkRow;
}

export default function ReconciliationPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  // File upload state
  const [isDragging, setIsDragging] = useState(false);
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const workbookRef = useRef<XLSX_TYPE.WorkBook | null>(null);

  // HF-021 Phase 2: AI column mapping state
  const [aiMappings, setAiMappings] = useState<ColumnMapping[]>([]);
  const [aiMappingResult, setAiMappingResult] = useState<MappingResult | null>(null);
  const [isMapping, setIsMapping] = useState(false);
  // HF-021 Phase 3: Confirmation state
  const [mappingConfirmed, setMappingConfirmed] = useState(false);

  // Field mapping state (derived from AI or manual)
  const [employeeIdField, setEmployeeIdField] = useState<string>('');
  const [amountField, setAmountField] = useState<string>('');

  // Batch & reconciliation state
  const [batches, setBatches] = useState<CalculationBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [session, setSession] = useState<ExtendedReconciliationSession | null>(null);
  const [comparisonItems, setComparisonItems] = useState<ComparisonItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ComparisonItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'matched' | 'discrepancy' | 'missing'>('all');
  const [sortDesc, setSortDesc] = useState(true);

  // VL Admin always sees English, tenant users see tenant locale
  const { locale } = useAdminLocale();
  const t = labels[locale];

  // Check VL Admin access
  const hasAccess = user && isVLAdmin(user);

  // Derive benchmark data from parsed file + field mapping
  const benchmarkData: BenchmarkRow[] = parsedFile && employeeIdField && amountField
    ? parsedFile.rows.map((row) => ({
        employeeId: String(row[employeeIdField] ?? ''),
        amount: Number(row[amountField] ?? 0),
        ...row,
      }))
    : [];

  // Load calculation batches
  useEffect(() => {
    if (!currentTenant) return;

    const runs = getPeriodRuns(currentTenant.id);
    const completedRuns = runs.filter((r) => r.status === 'completed' && r.totalPayout);
    setBatches(
      completedRuns.map((r) => ({
        id: r.id,
        periodId: r.periodId,
        runType: r.runType,
        completedAt: r.completedAt || r.startedAt,
        totalPayout: r.totalPayout || 0,
        employeesProcessed: r.processedEmployees,
      }))
    );
  }, [currentTenant]);

  // ============================================
  // HF-021 Phase 1: Smart File Processing
  // ============================================

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processUploadedFile(files[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processUploadedFile(files[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Process uploaded file through smart parser, then run AI column mapping
   */
  const processUploadedFile = async (file: File) => {
    setParseError(null);
    setAiMappings([]);
    setAiMappingResult(null);

    try {
      const result = await parseFile(file);

      if (result.rows.length === 0) {
        setParseError(t.parseError);
        return;
      }

      // Store workbook reference for sheet switching (XLSX only)
      if ('_workbook' in result && result._workbook) {
        workbookRef.current = result._workbook as XLSX_TYPE.WorkBook;
      } else {
        workbookRef.current = null;
      }

      setParsedFile(result);

      // Phase 2: Run AI column mapping
      await runAIMapping(result);
    } catch (error) {
      console.error('[Reconciliation] File parse error:', error);
      setParseError(t.parseError);
    }
  };

  /**
   * Run AI-powered column mapping on parsed file
   * Falls back to heuristic detection if AI is unavailable
   */
  const runAIMapping = async (parsed: ParsedFile) => {
    if (!currentTenant || !user) {
      autoDetectFields(parsed);
      return;
    }

    setIsMapping(true);

    try {
      const result = await mapColumns(parsed, currentTenant.id, user.id);
      setAiMappingResult(result);

      if (result.aiAvailable && result.mappings.length > 0) {
        setAiMappings(result.mappings);

        // Apply AI suggestions to field mapping state
        const empId = getEmployeeIdMapping(result.mappings);
        const totalAmt = getTotalAmountMapping(result.mappings);
        if (empId) setEmployeeIdField(empId);
        if (totalAmt) setAmountField(totalAmt);
      } else {
        // AI unavailable - fall back to heuristic detection
        autoDetectFields(parsed);
      }
    } catch (error) {
      console.warn('[Reconciliation] AI mapping error, falling back:', error);
      autoDetectFields(parsed);
    } finally {
      setIsMapping(false);
    }
  };

  /**
   * Handle sheet change for multi-sheet XLSX files
   * Re-runs AI mapping on the new sheet
   */
  const handleSheetChange = async (sheetName: string) => {
    if (!workbookRef.current || !parsedFile) return;

    const updated = parseSheetFromWorkbook(
      workbookRef.current,
      sheetName,
      parsedFile.fileName,
    );

    setParsedFile(updated);
    setAiMappings([]);
    setAiMappingResult(null);

    // Re-run AI mapping on new sheet
    await runAIMapping(updated);
  };

  /**
   * Auto-detect employee ID and amount fields from headers
   * (Heuristic fallback -- Phase 2 will use AI for this)
   */
  const autoDetectFields = (parsed: ParsedFile) => {
    const fields = parsed.headers;

    // Auto-detect employee ID field
    const idField = fields.find((f) =>
      f.toLowerCase().includes('employee') && f.toLowerCase().includes('id')
    ) || fields.find((f) => f.toLowerCase().includes('id')) || fields[0] || '';
    setEmployeeIdField(idField);

    // Auto-detect amount field
    const amtField = fields.find((f) =>
      f.toLowerCase().includes('amount') || f.toLowerCase().includes('payout') || f.toLowerCase().includes('total')
    ) || fields.find((f) => {
      const sample = parsed.rows[0]?.[f];
      return typeof sample === 'number';
    }) || fields[1] || '';
    setAmountField(amtField);
  };

  /**
   * Reset file upload state
   */
  const handleResetFile = () => {
    setParsedFile(null);
    setParseError(null);
    workbookRef.current = null;
    setEmployeeIdField('');
    setAmountField('');
    setAiMappings([]);
    setAiMappingResult(null);
    setIsMapping(false);
    setMappingConfirmed(false);
    setSession(null);
    setComparisonItems([]);
  };

  // ============================================
  // RECONCILIATION (existing logic, will be enhanced in Phase 4)
  // ============================================

  const handleRunReconciliation = async () => {
    if (!currentTenant || !selectedBatch || benchmarkData.length === 0 || !user) return;

    setIsRunning(true);
    setSession(null);
    setComparisonItems([]);

    try {
      const bridge = getReconciliationBridge(currentTenant.id);
      const orchestrator = getOrchestrator(currentTenant.id);

      const batch = batches.find((b) => b.id === selectedBatch);
      if (!batch) throw new Error('Batch not found');

      const calculatedResults = orchestrator.getResults(batch.periodId);

      // Create source data (benchmark) with field mapping
      const sourceData = benchmarkData.map((row, index) => ({
        id: `benchmark-${index}`,
        employeeId: row.employeeId,
        amount: row.amount,
        date: new Date().toISOString(),
        type: 'benchmark',
      }));

      // Create target data (calculated)
      const targetData = calculatedResults.map((r) => ({
        id: r.employeeId,
        employeeId: r.employeeId,
        amount: r.totalIncentive,
        date: r.calculatedAt,
        type: 'calculated',
      }));

      const newSession = bridge.createSession({
        tenantId: currentTenant.id,
        periodId: batch.periodId,
        mode: 'operational',
        sourceSystem: 'Benchmark',
        targetSystem: 'Calculated',
        createdBy: user.name,
      });

      const result = await bridge.runReconciliation(newSession.id, sourceData, targetData);
      setSession(result);

      // Build comparison items
      const items: ComparisonItem[] = [];

      for (const item of result.items || []) {
        if (item.sourceRecord && item.targetRecord) {
          const variance = item.sourceRecord.amount - item.targetRecord.amount;
          items.push({
            employeeId: item.sourceRecord.employeeId,
            employeeName: item.sourceRecord.employeeId,
            expected: item.sourceRecord.amount,
            calculated: item.targetRecord.amount,
            variance,
            variancePercent: item.sourceRecord.amount > 0 ? (variance / item.sourceRecord.amount) * 100 : 0,
            status: Math.abs(variance) < 0.01 ? 'matched' : 'discrepancy',
          });
        } else if (item.sourceRecord && !item.targetRecord) {
          items.push({
            employeeId: item.sourceRecord.employeeId,
            employeeName: item.sourceRecord.employeeId,
            expected: item.sourceRecord.amount,
            calculated: 0,
            variance: item.sourceRecord.amount,
            variancePercent: 100,
            status: 'missing_calculated',
          });
        } else if (!item.sourceRecord && item.targetRecord) {
          items.push({
            employeeId: item.targetRecord.employeeId,
            employeeName: item.targetRecord.employeeId,
            expected: 0,
            calculated: item.targetRecord.amount,
            variance: -item.targetRecord.amount,
            variancePercent: 100,
            status: 'missing_benchmark',
          });
        }
      }

      setComparisonItems(items);
    } catch (error) {
      console.error('Reconciliation error:', error);
    } finally {
      setIsRunning(false);
    }
  };

  // Filter and sort items
  const filteredItems = comparisonItems
    .filter((item) => {
      if (filter === 'all') return true;
      if (filter === 'matched') return item.status === 'matched';
      if (filter === 'discrepancy') return item.status === 'discrepancy';
      if (filter === 'missing') return item.status === 'missing_benchmark' || item.status === 'missing_calculated';
      return true;
    })
    .sort((a, b) => {
      const aVar = Math.abs(a.variance);
      const bVar = Math.abs(b.variance);
      return sortDesc ? bVar - aVar : aVar - bVar;
    });

  // Get status badge
  const getStatusBadge = (status: ComparisonItem['status']) => {
    switch (status) {
      case 'matched':
        return <Badge className="bg-emerald-100 text-emerald-800">{t.matched}</Badge>;
      case 'discrepancy':
        return <Badge className="bg-amber-100 text-amber-800">{t.discrepancies}</Badge>;
      case 'missing_benchmark':
        return <Badge className="bg-red-100 text-red-800">{locale === 'es-MX' ? 'Sin Benchmark' : 'No Benchmark'}</Badge>;
      case 'missing_calculated':
        return <Badge className="bg-red-100 text-red-800">{locale === 'es-MX' ? 'Sin Calculo' : 'Not Calculated'}</Badge>;
      default:
        return null;
    }
  };

  // Calculate summary stats
  const stats = {
    total: comparisonItems.length,
    matched: comparisonItems.filter((i) => i.status === 'matched').length,
    discrepancies: comparisonItems.filter((i) => i.status === 'discrepancy').length,
    missing: comparisonItems.filter((i) => i.status.includes('missing')).length,
    matchRate: comparisonItems.length > 0
      ? (comparisonItems.filter((i) => i.status === 'matched').length / comparisonItems.length) * 100
      : 0,
    benchmarkTotal: comparisonItems.reduce((sum, i) => sum + i.expected, 0),
    calculatedTotal: comparisonItems.reduce((sum, i) => sum + i.calculated, 0),
  };

  // Access denied
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <CardTitle>{t.accessDenied}</CardTitle>
            <CardDescription>{t.accessDeniedDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/')} className="w-full">
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Preview rows for display
  const previewRows = parsedFile ? getPreviewRows(parsedFile, 5) : [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/launch')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            {t.title}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">{t.subtitle}</p>
        </div>
      </div>

      {/* Upload & Select */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Upload Benchmark */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              {t.uploadBenchmark}
            </CardTitle>
            <CardDescription>{t.supportedFormats}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Drop zone */}
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
                isDragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : parsedFile
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-slate-300 hover:border-slate-400 dark:border-slate-700'
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('benchmark-file')?.click()}
            >
              {parseError ? (
                <>
                  <XCircle className="h-10 w-10 text-red-500 mx-auto mb-2" />
                  <p className="text-sm text-red-600">{parseError}</p>
                </>
              ) : parsedFile ? (
                <>
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                  <p className="font-medium text-emerald-700">{parsedFile.fileName}</p>
                  <div className="flex items-center justify-center gap-3 mt-1 text-sm text-emerald-600">
                    <span>{parsedFile.totalRows} {t.rowsLoaded}</span>
                    <span className="text-emerald-400">|</span>
                    <span>{parsedFile.headers.length} {t.columns}</span>
                    <span className="text-emerald-400">|</span>
                    <Badge variant="outline" className="text-xs">
                      {parsedFile.format.toUpperCase()}
                    </Badge>
                  </div>
                </>
              ) : (
                <>
                  <FileText className="h-10 w-10 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-600">{t.uploadDesc}</p>
                </>
              )}
              <input
                id="benchmark-file"
                type="file"
                accept=".csv,.tsv,.xlsx,.xls,.json"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {/* Sheet selector for multi-sheet XLSX */}
            {parsedFile && parsedFile.sheetNames.length > 1 && (
              <div className="mt-4 space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {t.selectSheet}
                </Label>
                <Select value={parsedFile.activeSheet} onValueChange={handleSheetChange}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {parsedFile.sheetNames.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Phase 2: AI Column Mapping Status + Field Mapping */}
            {parsedFile && parsedFile.headers.length > 0 && (
              <div className="mt-4 space-y-3">
                {/* AI mapping status */}
                {isMapping ? (
                  <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm text-blue-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t.aiMappingRunning}
                  </div>
                ) : aiMappingResult ? (
                  <div className={cn(
                    'flex items-center gap-2 p-2 rounded text-sm',
                    aiMappingResult.aiAvailable
                      ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700'
                      : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700'
                  )}>
                    {aiMappingResult.aiAvailable ? (
                      <>
                        <Sparkles className="h-4 w-4" />
                        {t.aiMappingSuccess}
                        <Badge variant="outline" className="text-xs ml-auto">
                          {aiMappings.filter(m => m.mappedTo !== 'unmapped').length}/{parsedFile.headers.length}
                        </Badge>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4" />
                        {t.aiMappingFailed}
                      </>
                    )}
                  </div>
                ) : null}

                <p className="text-sm font-medium">{t.fieldMapping}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t.employeeIdField}</Label>
                    <Select value={employeeIdField} onValueChange={(val) => {
                      setEmployeeIdField(val);
                      // Record correction if AI suggested something different
                      if (aiMappingResult?.signalId) {
                        const aiSuggested = getEmployeeIdMapping(aiMappings);
                        if (aiSuggested && aiSuggested !== val) {
                          recordMappingFeedback(
                            aiMappingResult.signalId,
                            'corrected',
                            { employee_id: val },
                            currentTenant?.id,
                          );
                        }
                      }
                    }}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {parsedFile.headers.map((field) => (
                          <SelectItem key={field} value={field}>{field}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t.amountField}</Label>
                    <Select value={amountField} onValueChange={(val) => {
                      setAmountField(val);
                      // Record correction if AI suggested something different
                      if (aiMappingResult?.signalId) {
                        const aiSuggested = getTotalAmountMapping(aiMappings);
                        if (aiSuggested && aiSuggested !== val) {
                          recordMappingFeedback(
                            aiMappingResult.signalId,
                            'corrected',
                            { total_amount: val },
                            currentTenant?.id,
                          );
                        }
                      }
                    }}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {parsedFile.headers.map((field) => (
                          <SelectItem key={field} value={field}>{field}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Upload another button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetFile();
                  }}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  {t.uploadAnother}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Select Batch */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              {t.selectBatch}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedBatch} onValueChange={setSelectedBatch}>
              <SelectTrigger>
                <SelectValue placeholder={t.selectBatch} />
              </SelectTrigger>
              <SelectContent>
                {batches.length === 0 ? (
                  <div className="px-2 py-4 text-center text-slate-500">
                    {t.noBatches}
                  </div>
                ) : (
                  batches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.periodId} - {batch.runType} (${batch.totalPayout.toLocaleString()})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Button
              className="w-full mt-4"
              onClick={handleRunReconciliation}
              disabled={!selectedBatch || benchmarkData.length === 0 || isRunning}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {t.running}
                </>
              ) : (
                <>
                  <Scale className="h-4 w-4 mr-2" />
                  {t.runReconciliation}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* HF-021 Phase 1: Preview Table */}
      {parsedFile && previewRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {t.preview}
            </CardTitle>
            <CardDescription>
              {t.previewDesc} ({parsedFile.headers.length} {t.columns}, {parsedFile.totalRows} {t.rowsLoaded})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {parsedFile.headers.map((header) => (
                      <TableHead key={header} className="whitespace-nowrap text-xs">
                        {header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, rowIdx) => (
                    <TableRow key={rowIdx}>
                      {parsedFile.headers.map((header) => (
                        <TableCell key={header} className="whitespace-nowrap text-xs">
                          {row[header] != null ? String(row[header]) : ''}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsedFile.totalRows > 5 && (
              <p className="text-center text-xs text-slate-400 mt-2">
                {locale === 'es-MX'
                  ? `Mostrando 5 de ${parsedFile.totalRows} filas`
                  : `Showing 5 of ${parsedFile.totalRows} rows`}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* HF-021 Phase 3: Column Mapping Confirmation */}
      {parsedFile && aiMappings.length > 0 && !mappingConfirmed && !isMapping && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              {t.confirmMapping}
            </CardTitle>
            <CardDescription>{t.confirmMappingDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t.sourceColumn}</TableHead>
                    <TableHead className="text-xs">{t.mappedTo}</TableHead>
                    <TableHead className="text-xs">{t.confidence}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aiMappings.map((mapping) => {
                    const targets = currentTenant ? buildMappingTargets(currentTenant.id) : [];
                    return (
                      <TableRow key={mapping.sourceColumn}>
                        <TableCell className="font-mono text-xs">{mapping.sourceColumn}</TableCell>
                        <TableCell>
                          <Select
                            value={mapping.mappedTo}
                            onValueChange={(newTarget) => {
                              // Update local mapping
                              setAiMappings(prev => prev.map(m =>
                                m.sourceColumn === mapping.sourceColumn
                                  ? { ...m, mappedTo: newTarget, mappedToLabel: targets.find(t => t.id === newTarget)?.label || newTarget, isUserOverride: true }
                                  : m
                              ));
                              // Update employee ID / amount fields
                              if (newTarget === 'employee_id') setEmployeeIdField(mapping.sourceColumn);
                              if (newTarget === 'total_amount') setAmountField(mapping.sourceColumn);
                              // Record corrective training signal
                              if (aiMappingResult?.signalId && newTarget !== mapping.mappedTo) {
                                recordMappingFeedback(
                                  aiMappingResult.signalId,
                                  'corrected',
                                  { [mapping.sourceColumn]: newTarget },
                                  currentTenant?.id,
                                );
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unmapped">{t.noMapping}</SelectItem>
                              {targets.map((target) => (
                                <SelectItem key={target.id} value={target.id}>
                                  {target.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {mapping.mappedTo !== 'unmapped' ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                mapping.confidence >= 0.8
                                  ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                                  : mapping.confidence >= 0.5
                                  ? 'border-amber-300 text-amber-700 bg-amber-50'
                                  : 'border-red-300 text-red-700 bg-red-50'
                              )}
                            >
                              {mapping.confidence >= 0.8
                                ? t.high
                                : mapping.confidence >= 0.5
                                ? t.medium
                                : t.low}
                              {' '}{Math.round(mapping.confidence * 100)}%
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">--</span>
                          )}
                          {mapping.isUserOverride && (
                            <Badge variant="outline" className="text-xs ml-1 border-blue-300 text-blue-600">
                              {locale === 'es-MX' ? 'Editado' : 'Edited'}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Button
              className="w-full mt-4"
              onClick={() => {
                setMappingConfirmed(true);
                // Record acceptance if no overrides were made
                if (aiMappingResult?.signalId && !aiMappings.some(m => m.isUserOverride)) {
                  recordMappingFeedback(aiMappingResult.signalId, 'accepted', undefined, currentTenant?.id);
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {t.confirmAndProceed}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {session && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                    <TrendingUp className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.matchRate}</p>
                    <p className="text-2xl font-bold">{stats.matchRate.toFixed(1)}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.matched}</p>
                    <p className="text-2xl font-bold">{stats.matched}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
                    <AlertTriangle className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.discrepancies}</p>
                    <p className="text-2xl font-bold">{stats.discrepancies}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30">
                    <XCircle className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.missing}</p>
                    <p className="text-2xl font-bold">{stats.missing}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Totals Comparison */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-sm text-slate-500">{t.sourceTotal}</p>
                  <p className="text-2xl font-bold">${stats.benchmarkTotal.toLocaleString()}</p>
                </div>
                <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-sm text-slate-500">{t.targetTotal}</p>
                  <p className="text-2xl font-bold">${stats.calculatedTotal.toLocaleString()}</p>
                </div>
                <div className={cn(
                  'text-center p-4 rounded-lg',
                  Math.abs(stats.benchmarkTotal - stats.calculatedTotal) < 1
                    ? 'bg-emerald-50 dark:bg-emerald-900/30'
                    : 'bg-red-50 dark:bg-red-900/30'
                )}>
                  <p className="text-sm text-slate-500">{t.difference}</p>
                  <p className={cn(
                    'text-2xl font-bold',
                    Math.abs(stats.benchmarkTotal - stats.calculatedTotal) < 1
                      ? 'text-emerald-600'
                      : 'text-red-600'
                  )}>
                    ${Math.abs(stats.benchmarkTotal - stats.calculatedTotal).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Employee Comparison Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t.employeeComparison}</CardTitle>
                  <CardDescription>{filteredItems.length} items</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t.all}</SelectItem>
                      <SelectItem value="matched">{t.matchedOnly}</SelectItem>
                      <SelectItem value="discrepancy">{t.discrepanciesOnly}</SelectItem>
                      <SelectItem value="missing">{t.missingOnly}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSortDesc(!sortDesc)}
                  >
                    {sortDesc ? <SortDesc className="h-4 w-4" /> : <SortAsc className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.employee}</TableHead>
                    <TableHead className="text-right">{t.expected}</TableHead>
                    <TableHead className="text-right">{t.calculated}</TableHead>
                    <TableHead className="text-right">{t.variance}</TableHead>
                    <TableHead>{t.status}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.slice(0, 20).map((item) => (
                    <TableRow key={item.employeeId}>
                      <TableCell className="font-medium">{item.employeeId}</TableCell>
                      <TableCell className="text-right">${item.expected.toLocaleString()}</TableCell>
                      <TableCell className="text-right">${item.calculated.toLocaleString()}</TableCell>
                      <TableCell className={cn(
                        'text-right font-medium',
                        item.variance > 0 ? 'text-red-600' : item.variance < 0 ? 'text-emerald-600' : ''
                      )}>
                        <div className="flex items-center justify-end gap-1">
                          {item.variance > 0 ? (
                            <TrendingDown className="h-4 w-4" />
                          ) : item.variance < 0 ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <Minus className="h-4 w-4 text-slate-400" />
                          )}
                          ${Math.abs(item.variance).toLocaleString()}
                          <span className="text-xs text-slate-400">
                            ({item.variancePercent.toFixed(1)}%)
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedItem(item)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredItems.length > 20 && (
                <p className="text-center text-sm text-slate-500 mt-4">
                  {locale === 'es-MX' ? 'Mostrando 20 de' : 'Showing 20 of'} {filteredItems.length}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-lg">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedItem.employeeId}</DialogTitle>
                <DialogDescription>{getStatusBadge(selectedItem.status)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-sm text-slate-500">{t.expected}</p>
                    <p className="text-xl font-bold">${selectedItem.expected.toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-sm text-slate-500">{t.calculated}</p>
                    <p className="text-xl font-bold">${selectedItem.calculated.toLocaleString()}</p>
                  </div>
                </div>

                <div className={cn(
                  'p-4 rounded-lg',
                  selectedItem.status === 'matched'
                    ? 'bg-emerald-50 dark:bg-emerald-900/30'
                    : 'bg-amber-50 dark:bg-amber-900/30'
                )}>
                  <p className="text-sm font-medium mb-2">{t.reasoning}</p>
                  <p className="text-sm">
                    {selectedItem.status === 'matched'
                      ? locale === 'es-MX'
                        ? 'Los valores coinciden dentro del margen de tolerancia.'
                        : 'Values match within tolerance threshold.'
                      : selectedItem.status === 'discrepancy'
                      ? locale === 'es-MX'
                        ? `Diferencia de $${Math.abs(selectedItem.variance).toLocaleString()} (${selectedItem.variancePercent.toFixed(1)}%). Verificar componentes de calculo y datos de entrada.`
                        : `Difference of $${Math.abs(selectedItem.variance).toLocaleString()} (${selectedItem.variancePercent.toFixed(1)}%). Review calculation components and input data.`
                      : selectedItem.status === 'missing_calculated'
                      ? locale === 'es-MX'
                        ? 'El empleado existe en el benchmark pero no tiene calculo. Verificar que este incluido en el periodo y tenga metricas.'
                        : 'Employee exists in benchmark but has no calculation. Verify they are included in the period and have metrics.'
                      : locale === 'es-MX'
                      ? 'El empleado tiene calculo pero no aparece en el benchmark. Puede ser una nueva contratacion o error en datos de referencia.'
                      : 'Employee has calculation but is not in benchmark. May be a new hire or benchmark data issue.'}
                  </p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
