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

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { isVLAdmin } from '@/types/auth';
import { useAdminLocale } from '@/hooks/useAdminLocale';
import { getPeriodRuns } from '@/lib/orchestration/calculation-orchestrator';
import { getTraces } from '@/lib/forensics/forensics-service';
import {
  getConfidentMappings,
  boostConfidence,
  recordUserCorrection,
} from '@/lib/intelligence/classification-signal-service';
import {
  getFlagColor,
  type ComparisonResult,
  type EmployeeComparison,
} from '@/lib/reconciliation/comparison-engine';
import {
  assessComparisonDepth,
  type DepthAssessment,
} from '@/lib/reconciliation/comparison-depth-engine';
import {
  runAdaptiveComparison,
  type AdaptiveComparisonResult,
} from '@/lib/reconciliation/adaptive-comparison-engine';
import {
  parseFile,
  parseSheetFromWorkbook,
  getPreviewRows,
  type ParsedFile,
} from '@/lib/reconciliation/smart-file-parser';
import {
  mapColumns,
  recordMappingFeedback,
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
  Download,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Bilingual labels
const labels = {
  'en-US': {
    title: 'Reconciliation',
    subtitle: 'Compare calculation results against benchmark data',
    uploadBenchmark: 'Upload Benchmark File',
    uploadDesc: 'Upload CSV, Excel, or JSON file with expected results',
    supportedFormats: 'Supported: CSV, TSV, TXT, XLSX, XLS, JSON',
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
    exportCSV: 'Export CSV',
    exportResults: 'Export Results',
    fileOnlyCount: 'File Only',
    vlOnlyCount: 'VL Only',
    // Phase 4: Inline locale elimination
    fileOnly: 'File Only',
    vlOnly: 'VL Only',
    exact: 'Exact',
    toleranceLabel: 'Tolerance',
    amberLabel: 'Amber',
    redLabel: 'Red',
    official: 'Official',
    previewRun: 'Preview',
    adjustment: 'Adjustment',
    employees: 'employees',
    showingNOfTotal: 'Showing',
    ofLabel: 'of',
    edited: 'Edited',
    exactTolerance: 'Exact / Tolerance',
    redFlags: 'Red Flags',
    flagged: 'Flagged',
    component: 'Component',
    matchMsg: 'Values match within tolerance threshold.',
    diffMsg: 'Review calculation components and input data.',
    fileOnlyMsg: 'Employee exists in uploaded file but has no VL calculation. Verify they are included in the period.',
    vlOnlyMsg: 'Employee has VL calculation but is not in uploaded file. May be a new hire or benchmark data issue.',
    differenceOf: 'Difference of',
  },
  'es-MX': {
    title: 'Reconciliacion',
    subtitle: 'Comparar resultados de calculo contra datos de benchmark',
    uploadBenchmark: 'Subir Archivo de Benchmark',
    uploadDesc: 'Suba archivo CSV, Excel o JSON con resultados esperados',
    supportedFormats: 'Soportados: CSV, TSV, TXT, XLSX, XLS, JSON',
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
    exportCSV: 'Exportar CSV',
    exportResults: 'Exportar Resultados',
    fileOnlyCount: 'Solo Archivo',
    vlOnlyCount: 'Solo VL',
    // Phase 4: Inline locale elimination
    fileOnly: 'Solo Archivo',
    vlOnly: 'Solo VL',
    exact: 'Exacto',
    toleranceLabel: 'Tolerancia',
    amberLabel: 'Ambar',
    redLabel: 'Rojo',
    official: 'Oficial',
    previewRun: 'Vista Previa',
    adjustment: 'Ajuste',
    employees: 'empleados',
    showingNOfTotal: 'Mostrando',
    ofLabel: 'de',
    edited: 'Editado',
    exactTolerance: 'Exactos / Tolerancia',
    redFlags: 'Alertas Rojas',
    flagged: 'Con Alertas',
    component: 'Componente',
    matchMsg: 'Los valores coinciden dentro del margen de tolerancia.',
    diffMsg: 'Verificar componentes de calculo y datos de entrada.',
    fileOnlyMsg: 'El empleado existe en el archivo pero no tiene calculo en VL. Verificar que este incluido en el periodo.',
    vlOnlyMsg: 'El empleado tiene calculo en VL pero no aparece en el archivo. Puede ser una nueva contratacion o error en datos de referencia.',
    differenceOf: 'Diferencia de',
  },
};

interface CalculationBatch {
  id: string;
  periodId: string;
  runType: string;
  completedAt: string;
  totalPayout: number;
  employeesProcessed: number;
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
  // OB-39: Comparison depth assessment
  const [depthAssessment, setDepthAssessment] = useState<DepthAssessment | null>(null);
  // OB-39: Adaptive multi-layer comparison result
  const [adaptiveResult, setAdaptiveResult] = useState<AdaptiveComparisonResult | null>(null);
  // Phase 4: New comparison engine result (derived from adaptive)
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeComparison | null>(null);
  const [filter, setFilter] = useState<'all' | 'matched' | 'file_only' | 'vl_only' | 'flagged'>('all');
  const [sortDesc, setSortDesc] = useState(true);
  // OB-41: Reconciliation feedback banner
  const [reconFeedback, setReconFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
  // OB-39 Phase 6: Expandable rows for component breakdown
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Locale and currency
  const { locale } = useAdminLocale();
  const t = labels[locale];
  const { format: formatCurrency } = useCurrency();

  // Check VL Admin access
  const hasAccess = user && isVLAdmin(user);

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

  // OB-39: Run depth assessment when file, mappings, and VL results are available
  useEffect(() => {
    if (!currentTenant || !parsedFile || !employeeIdField || !amountField) {
      setDepthAssessment(null);
      return;
    }

    // Load VL results for depth assessment
    const batch = selectedBatch ? batches.find(b => b.id === selectedBatch) : null;
    const traces = getTraces(currentTenant.id, batch?.id);
    if (traces.length === 0) {
      setDepthAssessment(null);
      return;
    }

    const vlResults = traces as unknown as import('@/types/compensation-plan').CalculationResult[];

    const assessment = assessComparisonDepth({
      vlResults,
      fileRows: parsedFile.rows,
      mappings: aiMappings,
      employeeIdField,
      totalAmountField: amountField,
    });

    setDepthAssessment(assessment);
    console.log('[Reconciliation] Depth assessment:', assessment.maxDepth,
      'layers:', assessment.layers.map(l => `${l.layer}=${l.status}`).join(', '),
      'falseGreenRisk:', assessment.falseGreenRisk);
  }, [currentTenant, parsedFile, employeeIdField, amountField, selectedBatch, batches, aiMappings]);

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
        // OB-39: Boost AI confidence with prior classification signals
        const boostedMappings = result.mappings.map(m => {
          if (m.mappedTo === 'unmapped' || m.confidence === 0) return m;
          const boost = boostConfidence(currentTenant.id, m.sourceColumn, m.confidence);
          if (boost.boosted) {
            return {
              ...m,
              confidence: boost.effectiveConfidence,
              reasoning: `${m.reasoning} (boosted from ${Math.round(m.confidence * 100)}% by prior ${boost.source} signal)`,
            };
          }
          return m;
        });

        setAiMappings(boostedMappings);

        // Apply AI suggestions to field mapping state
        const empId = getEmployeeIdMapping(boostedMappings);
        const totalAmt = getTotalAmountMapping(boostedMappings);
        if (empId) setEmployeeIdField(empId);
        if (totalAmt) setAmountField(totalAmt);

        // OB-39: Auto-confirm mapping when both critical fields mapped with high confidence
        const empMapping = boostedMappings.find(m => m.mappedTo === 'employee_id');
        const amtMapping = boostedMappings.find(m => m.mappedTo === 'total_amount');
        if (empMapping && empMapping.confidence >= 0.85 && amtMapping && amtMapping.confidence >= 0.85) {
          setMappingConfirmed(true);
          console.log('[Reconciliation] Auto-confirmed mapping: empId=%s (%.0f%%), amount=%s (%.0f%%)',
            empMapping.sourceColumn, empMapping.confidence * 100,
            amtMapping.sourceColumn, amtMapping.confidence * 100);
        }
      } else {
        // AI unavailable -- check if prior signals can map fields directly
        const priorMappings = getConfidentMappings(currentTenant.id, 0.85);
        if (priorMappings.length > 0) {
          const empSignal = priorMappings.find(m => m.semanticType === 'employee_id');
          const amtSignal = priorMappings.find(m => m.semanticType === 'total_amount');
          const matchedEmp = empSignal && parsed.headers.some(h => h.toLowerCase() === empSignal.fieldName.toLowerCase());
          const matchedAmt = amtSignal && parsed.headers.some(h => h.toLowerCase() === amtSignal.fieldName.toLowerCase());
          if (matchedEmp && empSignal) setEmployeeIdField(empSignal.fieldName);
          if (matchedAmt && amtSignal) setAmountField(amtSignal.fieldName);
          if (matchedEmp && matchedAmt) setMappingConfirmed(true);
        }
        if (!employeeIdField && !amountField) {
          autoDetectFields(parsed);
        }
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

  // ============================================
  // Phase 4: Comparison Engine
  // ============================================

  const handleRunComparison = () => {
    if (!currentTenant || !parsedFile || !employeeIdField || !amountField) {
      console.warn('[Reconciliation] Guard failed:', { currentTenant: !!currentTenant, parsedFile: !!parsedFile, employeeIdField, amountField });
      return;
    }

    setIsRunning(true);
    setComparisonResult(null);
    setAdaptiveResult(null);
    setReconFeedback(null);

    // Use requestAnimationFrame so React renders loading spinner first
    requestAnimationFrame(() => {
      try {
        // Read from forensics traces (the only storage path the orchestrator writes to)
        const batch = selectedBatch ? batches.find(b => b.id === selectedBatch) : null;
        const traces = getTraces(currentTenant.id, batch?.id);
        console.log(`[Reconciliation] Forensics traces for tenant '${currentTenant.id}', run '${batch?.id || 'latest'}': ${traces.length} employees`);

        const vlResults = traces as unknown as import('@/types/compensation-plan').CalculationResult[];

        console.log(`[Reconciliation] Running adaptive multi-layer comparison: ${parsedFile.rows.length} file rows vs ${vlResults.length} VL results`);

        // OB-39: Use adaptive comparison engine for multi-layer depth
        const result = runAdaptiveComparison(
          parsedFile.rows,
          vlResults,
          aiMappings,
          employeeIdField,
          amountField,
        );

        setAdaptiveResult(result);

        // Set the employee comparison for backward-compatible results display
        if (result.employeeComparison) {
          setComparisonResult(result.employeeComparison);
        }

        // Update depth assessment from the comparison
        if (result.depth) {
          setDepthAssessment(result.depth);
        }

        console.log('[Reconciliation] Adaptive result:',
          'layers:', result.comparedLayers.join(', '),
          'matched:', result.summary?.matched ?? 0,
          'fileOnly:', result.summary?.fileOnly ?? 0,
          'vlOnly:', result.summary?.vlOnly ?? 0,
          'falseGreens:', result.falseGreens.length);

        // OB-41: Set user-visible feedback
        if (vlResults.length === 0) {
          setReconFeedback({
            type: 'warning',
            message: `No ViaLuce calculation results found for ${batch?.id ? `batch "${batch.id}"` : 'this tenant'}. Run calculations first, then reconcile.`,
          });
        } else if (result.employeeComparison && result.employeeComparison.summary.matched === 0) {
          setReconFeedback({
            type: 'warning',
            message: `0 employee matches found. The file has ${parsedFile.rows.length} rows but none matched ${vlResults.length} VL results. Check that the Employee ID field mapping is correct.`,
          });
        } else if (result.falseGreens.length > 0) {
          setReconFeedback({
            type: 'warning',
            message: `Reconciliation complete: ${result.employeeComparison?.summary.matched ?? 0} matched, but ${result.falseGreens.length} false green(s) detected — totals match but component-level discrepancies exist.`,
          });
        } else {
          const matched = result.employeeComparison?.summary.matched ?? 0;
          const exact = result.employeeComparison?.summary.exactMatches ?? 0;
          setReconFeedback({
            type: 'success',
            message: `Reconciliation complete: ${matched} employee(s) matched, ${exact} exact. ${result.comparedLayers.length} layer(s) compared.`,
          });
        }
      } catch (error) {
        console.error('[Reconciliation] Comparison error:', error);
        setReconFeedback({
          type: 'error',
          message: `Reconciliation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      } finally {
        setIsRunning(false);
      }
    });
  };

  // Filter and sort employees from comparison result
  const filteredEmployees = comparisonResult
    ? comparisonResult.employees
        .filter((emp) => {
          if (filter === 'all') return true;
          if (filter === 'matched') return emp.population === 'matched';
          if (filter === 'file_only') return emp.population === 'file_only';
          if (filter === 'vl_only') return emp.population === 'vl_only';
          if (filter === 'flagged') return emp.totalFlag === 'amber' || emp.totalFlag === 'red';
          return true;
        })
        .sort((a, b) => {
          const aVar = Math.abs(a.totalDelta);
          const bVar = Math.abs(b.totalDelta);
          return sortDesc ? bVar - aVar : aVar - bVar;
        })
    : [];

  // OB-39 Phase 6: Set of false green employee IDs for visual distinction
  const falseGreenIds = new Set(
    adaptiveResult?.falseGreens.map(fg => fg.employeeId) ?? []
  );

  // OB-39 Phase 6: Toggle expandable row
  const toggleRow = (employeeId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  };

  // Get flag/population badge for an employee (Wayfinder Layer 2: attention patterns)
  const getFlagBadge = (emp: EmployeeComparison) => {
    if (emp.population === 'file_only') {
      return <Badge variant="outline" className="text-xs border-slate-400 text-slate-600">{t.fileOnly}</Badge>;
    }
    if (emp.population === 'vl_only') {
      return <Badge variant="outline" className="text-xs border-slate-400 text-slate-500">{t.vlOnly}</Badge>;
    }
    switch (emp.totalFlag) {
      case 'exact':
        return <Badge variant="outline" className="text-xs border-slate-600 text-slate-900 dark:text-slate-100 font-semibold">{t.exact}</Badge>;
      case 'tolerance':
        return <Badge variant="outline" className="text-xs border-slate-300 text-slate-600">{t.toleranceLabel}</Badge>;
      case 'amber':
        return <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 font-medium">{t.amberLabel}</Badge>;
      case 'red':
        return <Badge variant="outline" className="text-xs border-orange-500 text-orange-800 dark:text-orange-300 font-bold">{t.redLabel}</Badge>;
    }
  };

  // Phase 5: Export comparison results to CSV
  const handleExportCSV = () => {
    if (!comparisonResult) return;

    const rows: string[][] = [];
    // Header row
    const headers = [
      'Employee ID', 'Employee Name', 'Population',
      'File Total', 'VL Total', 'Delta', 'Delta %', 'Flag',
      'False Green',
    ];

    // Add component columns if any employee has components
    const hasComponents = comparisonResult.employees.some(e => e.components.length > 0);
    const componentNames: string[] = [];
    if (hasComponents) {
      const first = comparisonResult.employees.find(e => e.components.length > 0);
      if (first) {
        for (const comp of first.components) {
          componentNames.push(comp.componentName);
          headers.push(`${comp.componentName} (File)`, `${comp.componentName} (VL)`, `${comp.componentName} (Delta)`);
        }
      }
    }

    rows.push(headers);

    // Data rows
    for (const emp of comparisonResult.employees) {
      const row = [
        emp.employeeId,
        emp.employeeName,
        emp.population,
        emp.fileTotal.toString(),
        emp.vlTotal.toString(),
        emp.totalDelta.toString(),
        (emp.totalDeltaPercent * 100).toFixed(2) + '%',
        emp.totalFlag,
        falseGreenIds.has(emp.employeeId) ? 'YES' : '',
      ];

      if (hasComponents) {
        for (const compName of componentNames) {
          const comp = emp.components.find(c => c.componentName === compName);
          row.push(
            comp ? comp.fileValue.toString() : '',
            comp ? comp.vlValue.toString() : '',
            comp ? comp.delta.toString() : '',
          );
        }
      }

      rows.push(row);
    }

    // Summary row
    rows.push([]);
    rows.push(['Summary']);
    rows.push(['Total Employees', comparisonResult.summary.totalEmployees.toString()]);
    rows.push(['Matched', comparisonResult.summary.matched.toString()]);
    rows.push(['File Only', comparisonResult.summary.fileOnly.toString()]);
    rows.push(['VL Only', comparisonResult.summary.vlOnly.toString()]);
    rows.push(['Exact Matches', comparisonResult.summary.exactMatches.toString()]);
    rows.push(['Within Tolerance', comparisonResult.summary.toleranceMatches.toString()]);
    rows.push(['Amber Flags', comparisonResult.summary.amberFlags.toString()]);
    rows.push(['Red Flags', comparisonResult.summary.redFlags.toString()]);
    rows.push(['File Total', comparisonResult.summary.fileTotalAmount.toString()]);
    rows.push(['VL Total', comparisonResult.summary.vlTotalAmount.toString()]);
    rows.push(['Total Delta', comparisonResult.summary.totalDelta.toString()]);
    // OB-39: Include comparison depth and false green info
    if (adaptiveResult) {
      rows.push(['Comparison Depth', adaptiveResult.depth.maxDepth]);
      rows.push(['Layers Compared', adaptiveResult.comparedLayers.join(', ')]);
      rows.push(['False Green Risk', adaptiveResult.depth.falseGreenRisk]);
      rows.push(['False Green Count', adaptiveResult.falseGreens.length.toString()]);
    }

    // Convert to CSV string
    const csvContent = rows.map(row =>
      row.map(cell => {
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')
    ).join('\n');

    // Trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reconciliation_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
                accept=".csv,.tsv,.txt,.xlsx,.xls,.json"
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
                      // Record correction signal for closed-loop learning
                      if (currentTenant) {
                        const aiSuggested = getEmployeeIdMapping(aiMappings);
                        if (aiSuggested && aiSuggested !== val) {
                          if (aiMappingResult?.signalId) {
                            recordMappingFeedback(aiMappingResult.signalId, 'corrected', { employee_id: val }, currentTenant.id);
                          }
                          recordUserCorrection(currentTenant.id, 'reconciliation', val, 'employee_id');
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
                      // Record correction signal for closed-loop learning
                      if (currentTenant) {
                        const aiSuggested = getTotalAmountMapping(aiMappings);
                        if (aiSuggested && aiSuggested !== val) {
                          if (aiMappingResult?.signalId) {
                            recordMappingFeedback(aiMappingResult.signalId, 'corrected', { total_amount: val }, currentTenant.id);
                          }
                          recordUserCorrection(currentTenant.id, 'reconciliation', val, 'total_amount');
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

                {/* OB-39: Confidence indicators for auto-mapped fields */}
                {aiMappings.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Sparkles className="h-3 w-3 text-purple-500" />
                    {aiMappings.filter(m => m.mappedTo !== 'unmapped').length} {t.columns} {locale === 'es-MX' ? 'clasificadas por IA' : 'classified by AI'}
                    {mappingConfirmed && (
                      <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700 bg-emerald-50">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {locale === 'es-MX' ? 'Confirmado' : 'Confirmed'}
                      </Badge>
                    )}
                  </div>
                )}
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
                  batches.map((batch) => {
                    const runLabel = batch.runType === 'official' ? t.official
                      : batch.runType === 'preview' ? t.previewRun
                      : batch.runType === 'adjustment' ? t.adjustment
                      : batch.runType;
                    const dateStr = batch.completedAt
                      ? new Date(batch.completedAt).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
                      : '';
                    return (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.periodId} - {runLabel} | {dateStr} | {batch.employeesProcessed} {t.employees} | {formatCurrency(batch.totalPayout)}
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>

            {/* OB-39: Comparison Depth Assessment */}
            {depthAssessment && (
              <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">
                    {locale === 'es-MX' ? 'Profundidad de Comparacion' : 'Comparison Depth'}
                  </span>
                  <Badge variant="outline" className={cn('text-xs',
                    depthAssessment.falseGreenRisk === 'high' ? 'border-red-300 text-red-700 bg-red-50' :
                    depthAssessment.falseGreenRisk === 'medium' ? 'border-amber-300 text-amber-700 bg-amber-50' :
                    'border-emerald-300 text-emerald-700 bg-emerald-50'
                  )}>
                    {locale === 'es-MX' ? 'Riesgo falso verde' : 'False green risk'}: {depthAssessment.falseGreenRisk}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  {depthAssessment.layers.map((layer) => (
                    <div key={layer.layer} className={cn(
                      'flex-1 h-2 rounded-full',
                      layer.status === 'available' ? 'bg-emerald-400' :
                      layer.status === 'partial' ? 'bg-amber-400' :
                      'bg-slate-200'
                    )} title={`${layer.layer}: ${layer.status} (${layer.depth}%)`} />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>L0</span><span>L1</span><span>L2</span><span>L3</span><span>L4</span>
                </div>
                <p className="text-xs text-slate-500">
                  {locale === 'es-MX' ? 'Nivel maximo' : 'Max depth'}: <strong className="text-slate-700">{depthAssessment.maxDepth}</strong>
                  {' | '}{depthAssessment.dataQuality.matchableRecords} {locale === 'es-MX' ? 'empleados coinciden' : 'employees matchable'}
                </p>
              </div>
            )}

            <Button
              className="w-full mt-4"
              onClick={handleRunComparison}
              disabled={!parsedFile || !employeeIdField || !amountField || isRunning}
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

      {/* OB-41: Reconciliation result feedback banner */}
      {reconFeedback && (
        <Card className={
          reconFeedback.type === 'success' ? 'border-green-200 bg-green-50' :
          reconFeedback.type === 'warning' ? 'border-amber-200 bg-amber-50' :
          'border-red-200 bg-red-50'
        }>
          <CardContent className="py-4 flex items-start gap-3">
            {reconFeedback.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : reconFeedback.type === 'warning' ? (
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <p className={`text-sm ${
              reconFeedback.type === 'success' ? 'text-green-800' :
              reconFeedback.type === 'warning' ? 'text-amber-800' :
              'text-red-800'
            }`}>
              {reconFeedback.message}
            </p>
          </CardContent>
        </Card>
      )}

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
                {`${t.showingNOfTotal} 5 ${t.ofLabel} ${parsedFile.totalRows}`}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* OB-39: Removed redundant 30-row Confirm Column Mapping section.
          Field mapping is now handled inline in the upload card with
          AI signal boosting and auto-confirmation. */}

      {/* Phase 4-5: Comparison Results */}
      {comparisonResult && (
        <>
          {/* OB-39: Comparison depth and false green summary */}
          {adaptiveResult && (
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-blue-50">
                  {locale === 'es-MX' ? 'Profundidad' : 'Depth'}: {adaptiveResult.depth.maxDepth}
                </Badge>
                <span className="text-slate-500">
                  {adaptiveResult.comparedLayers.length} {locale === 'es-MX' ? 'capas comparadas' : 'layers compared'}
                </span>
                {adaptiveResult.falseGreens.length > 0 && (
                  <Badge variant="outline" className="text-xs border-red-300 text-red-700 bg-red-50">
                    {adaptiveResult.falseGreens.length} {locale === 'es-MX' ? 'falsos verdes' : 'false greens'}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Export bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-slate-500">
              {comparisonResult.summary.fileOnly > 0 && (
                <span>{t.fileOnlyCount}: <strong className="text-orange-600">{comparisonResult.summary.fileOnly}</strong></span>
              )}
              {comparisonResult.summary.vlOnly > 0 && (
                <span>{t.vlOnlyCount}: <strong className="text-purple-600">{comparisonResult.summary.vlOnly}</strong></span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-1" />
              {t.exportCSV}
            </Button>
          </div>

          {/* Summary Cards (Wayfinder Layer 2: attention patterns) */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800">
                    <CheckCircle2 className="h-6 w-6 text-slate-700 dark:text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.exactTolerance}</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {comparisonResult.summary.exactMatches + comparisonResult.summary.toleranceMatches}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800">
                    <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.amberLabel} (5-15%)</p>
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{comparisonResult.summary.amberFlags}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800">
                    <XCircle className="h-6 w-6 text-orange-700 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.redFlags} (&gt;15%)</p>
                    <p className="text-2xl font-bold text-orange-800 dark:text-orange-300">{comparisonResult.summary.redFlags}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800">
                    <TrendingUp className="h-6 w-6 text-slate-600 dark:text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.matched}</p>
                    <p className="text-2xl font-bold">
                      {comparisonResult.summary.matched}
                      <span className="text-sm font-normal text-slate-400 ml-1">/ {comparisonResult.summary.totalEmployees}</span>
                    </p>
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
                  <p className="text-2xl font-bold">{formatCurrency(comparisonResult.summary.fileTotalAmount)}</p>
                </div>
                <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-sm text-slate-500">{t.targetTotal}</p>
                  <p className="text-2xl font-bold">{formatCurrency(comparisonResult.summary.vlTotalAmount)}</p>
                </div>
                <div className={cn(
                  'text-center p-4 rounded-lg',
                  Math.abs(comparisonResult.summary.totalDelta) < 1
                    ? 'bg-slate-50 dark:bg-slate-800'
                    : 'bg-slate-50 dark:bg-slate-800 border border-amber-200 dark:border-amber-800'
                )}>
                  <p className="text-sm text-slate-500">{t.difference}</p>
                  <p className={cn(
                    'text-2xl font-bold',
                    Math.abs(comparisonResult.summary.totalDelta) < 1
                      ? 'text-slate-900 dark:text-slate-100'
                      : 'text-amber-700 dark:text-amber-400'
                  )}>
                    {formatCurrency(Math.abs(comparisonResult.summary.totalDelta))}
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
                  <CardDescription>{filteredEmployees.length} {t.employees}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t.all}</SelectItem>
                      <SelectItem value="matched">{t.matchedOnly}</SelectItem>
                      <SelectItem value="file_only">{t.fileOnly}</SelectItem>
                      <SelectItem value="vl_only">{t.vlOnly}</SelectItem>
                      <SelectItem value="flagged">{t.flagged}</SelectItem>
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
                  {filteredEmployees.slice(0, 20).map((emp) => {
                    const isFalseGreen = falseGreenIds.has(emp.employeeId);
                    const isExpanded = expandedRows.has(emp.employeeId);
                    const hasComponents = emp.components.length > 0;
                    return (
                      <React.Fragment key={emp.employeeId}>
                        <TableRow className={cn(
                          isFalseGreen && 'bg-amber-50/50 dark:bg-amber-900/10'
                        )}>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {hasComponents && (
                                <button
                                  className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                                  onClick={() => toggleRow(emp.employeeId)}
                                >
                                  {isExpanded
                                    ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                                    : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                                  }
                                </button>
                              )}
                              <div>
                                <p className="font-medium">{emp.employeeName}</p>
                                <p className="text-xs text-slate-400">{emp.employeeId}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(emp.fileTotal)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(emp.vlTotal)}</TableCell>
                          <TableCell className={cn('text-right font-medium', getFlagColor(emp.totalFlag))}>
                            <div className="flex items-center justify-end gap-1">
                              {emp.totalDelta > 0 ? (
                                <TrendingUp className="h-4 w-4" />
                              ) : emp.totalDelta < 0 ? (
                                <TrendingDown className="h-4 w-4" />
                              ) : (
                                <Minus className="h-4 w-4 text-slate-400" />
                              )}
                              {formatCurrency(Math.abs(emp.totalDelta))}
                              <span className="text-xs text-slate-400">
                                ({(Math.abs(emp.totalDeltaPercent) * 100).toFixed(1)}%)
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {getFlagBadge(emp)}
                              {isFalseGreen && (
                                <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50">
                                  {locale === 'es-MX' ? 'Falso verde' : 'False green'}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedEmployee(emp)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        {/* OB-39 Phase 6: Expandable component breakdown row */}
                        {isExpanded && hasComponents && (
                          <TableRow className="bg-slate-50/80 dark:bg-slate-900/40">
                            <TableCell colSpan={6} className="py-2 px-8">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs h-7">{t.component}</TableHead>
                                    <TableHead className="text-xs text-right h-7">{t.expected}</TableHead>
                                    <TableHead className="text-xs text-right h-7">{t.calculated}</TableHead>
                                    <TableHead className="text-xs text-right h-7">{t.variance}</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {emp.components.map((comp) => (
                                    <TableRow key={comp.componentId}>
                                      <TableCell className="text-xs py-1">{comp.componentName}</TableCell>
                                      <TableCell className="text-xs text-right py-1">{formatCurrency(comp.fileValue)}</TableCell>
                                      <TableCell className="text-xs text-right py-1">{formatCurrency(comp.vlValue)}</TableCell>
                                      <TableCell className={cn('text-xs text-right py-1', getFlagColor(comp.flag))}>
                                        {formatCurrency(Math.abs(comp.delta))} ({(Math.abs(comp.deltaPercent) * 100).toFixed(1)}%)
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              {filteredEmployees.length > 20 && (
                <p className="text-center text-sm text-slate-500 mt-4">
                  {t.showingNOfTotal} 20 {t.ofLabel} {filteredEmployees.length}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent className="max-w-lg">
          {selectedEmployee && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedEmployee.employeeName}</DialogTitle>
                <DialogDescription className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{selectedEmployee.employeeId}</span>
                  {getFlagBadge(selectedEmployee)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-sm text-slate-500">{t.expected}</p>
                    <p className="text-xl font-bold">{formatCurrency(selectedEmployee.fileTotal)}</p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-sm text-slate-500">{t.calculated}</p>
                    <p className="text-xl font-bold">{formatCurrency(selectedEmployee.vlTotal)}</p>
                  </div>
                </div>

                {/* Per-component breakdown */}
                {selectedEmployee.components.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">{t.componentDetail}</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">{t.component}</TableHead>
                          <TableHead className="text-xs text-right">{t.expected}</TableHead>
                          <TableHead className="text-xs text-right">{t.calculated}</TableHead>
                          <TableHead className="text-xs text-right">{t.variance}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedEmployee.components.map((comp) => (
                          <TableRow key={comp.componentId}>
                            <TableCell className="text-xs">{comp.componentName}</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(comp.fileValue)}</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(comp.vlValue)}</TableCell>
                            <TableCell className={cn('text-xs text-right', getFlagColor(comp.flag))}>
                              {formatCurrency(Math.abs(comp.delta))} ({(Math.abs(comp.deltaPercent) * 100).toFixed(1)}%)
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <p className="text-sm font-medium mb-2">{t.reasoning}</p>
                  <p className="text-sm">
                    {selectedEmployee.population === 'matched'
                      ? selectedEmployee.totalFlag === 'exact' || selectedEmployee.totalFlag === 'tolerance'
                        ? t.matchMsg
                        : `${t.differenceOf} ${formatCurrency(Math.abs(selectedEmployee.totalDelta))} (${(Math.abs(selectedEmployee.totalDeltaPercent) * 100).toFixed(1)}%). ${t.diffMsg}`
                      : selectedEmployee.population === 'file_only'
                      ? t.fileOnlyMsg
                      : t.vlOnlyMsg}
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
