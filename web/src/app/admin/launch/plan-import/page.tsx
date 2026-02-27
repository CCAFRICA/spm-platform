'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { isVLAdmin } from '@/types/auth';
import { RequireRole } from '@/components/auth/RequireRole';
import { useAdminLocale } from '@/hooks/useAdminLocale';
// Plan import uses /api/plan/import route (service role) instead of browser client
import { parseFile } from '@/lib/import-pipeline/file-parser';
import {
  interpretPlanDocument,
  isAIInterpreterAvailable,
  type PlanInterpretation,
} from '@/lib/compensation/plan-interpreter';
import { interpretationToPlanConfig } from '@/lib/compensation/ai-plan-interpreter';
import type { RuleSetConfig, PlanComponent, AdditiveLookupConfig } from '@/types/compensation-plan';
import { isAdditiveLookupConfig } from '@/types/compensation-plan';
import {
  validatePlanConfig,
  getAnomaliesForComponent,
  hasUnresolvedCriticals,
  anomalyKey,
  type PlanValidationResult,
} from '@/lib/validation/plan-anomaly-registry';
import { recordSignal } from '@/lib/intelligence/classification-signal-service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
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
  Sparkles,
  Edit2,
  Save,
  ArrowLeft,
  ArrowRight,
  Brain,
  Cpu,
  Clock,
  RotateCcw,
  SkipForward,
  FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Bilingual labels
const labels = {
  'en-US': {
    title: 'Plan Import',
    subtitle: 'Import and interpret compensation plan structure',
    uploadTitle: 'Upload Plan File',
    uploadDesc: 'Drag and drop or click to upload plan files (PDF, XLSX, PPTX, CSV). Multiple files supported.',
    supportedFormats: 'Supported formats: PDF, XLSX, XLS, CSV, TSV, JSON, PPTX, DOCX',
    analyzing: 'Analyzing plan structure...',
    aiAnalyzing: 'AI is analyzing your plan...',
    aiAnalyzingDesc: 'Using Claude AI to intelligently interpret your compensation plan structure',
    heuristicAnalyzing: 'Analyzing with pattern matching...',
    heuristicAnalyzingDesc: 'AI interpretation not configured. Using heuristic pattern detection.',
    aiNotConfigured: 'AI plan interpretation is not configured. Contact platform administrator.',
    detected: 'Detected Plan Structure',
    confidence: 'Confidence',
    reasoning: 'Reasoning',
    componentType: 'Component Type',
    metricSource: 'Metric Source',
    measurementLevel: 'Measurement Level',
    editComponent: 'Edit Component',
    saveChanges: 'Save Changes',
    cancel: 'Cancel',
    confirmImport: 'Confirm & Import Plan',
    importing: 'Importing...',
    importSuccess: 'Plan imported successfully!',
    importError: 'Failed to import plan',
    back: 'Back',
    ruleSetName: 'Plan Name',
    planDescription: 'Plan Description',
    effectiveDate: 'Effective Date',
    eligibleRoles: 'Eligible Roles',
    noComponents: 'No components detected',
    accessDenied: 'Access Denied',
    accessDeniedDesc: 'You must be a VL Admin to access this page.',
    viewDetails: 'View Details',
    adjust: 'Adjust',
    highConfidence: 'High confidence',
    mediumConfidence: 'Medium confidence - review recommended',
    lowConfidence: 'Low confidence - manual review required',
    aiPowered: 'AI-Powered',
    heuristicMode: 'Pattern Matching',
    overallConfidence: 'Overall Confidence',
    interpretationMethod: 'Interpretation Method',
    workedExamples: 'Worked Examples',
    employeeTypes: 'Employee Types',
    requiredInputs: 'Required Inputs',
    currency: 'Currency',
    viewRawResponse: 'View Raw Response',
  },
  'es-MX': {
    title: 'Importar Plan',
    subtitle: 'Importar e interpretar la estructura del plan de compensación',
    uploadTitle: 'Subir Archivo de Plan',
    uploadDesc: 'Arrastre y suelte o haga clic para subir archivos de plan (PDF, XLSX, PPTX, CSV). Se admiten múltiples archivos.',
    supportedFormats: 'Formatos soportados: PDF, XLSX, XLS, CSV, TSV, JSON, PPTX, DOCX',
    analyzing: 'Analizando estructura del plan...',
    aiAnalyzing: 'La IA está analizando su plan...',
    aiAnalyzingDesc: 'Usando Claude AI para interpretar inteligentemente la estructura de su plan de compensación',
    heuristicAnalyzing: 'Analizando con coincidencia de patrones...',
    heuristicAnalyzingDesc: 'Interpretación IA no configurada. Usando detección heurística de patrones.',
    aiNotConfigured: 'La interpretación IA del plan no está configurada. Contacte al administrador de la plataforma.',
    detected: 'Estructura del Plan Detectada',
    confidence: 'Confianza',
    reasoning: 'Razonamiento',
    componentType: 'Tipo de Componente',
    metricSource: 'Fuente de Métrica',
    measurementLevel: 'Nivel de Medición',
    editComponent: 'Editar Componente',
    saveChanges: 'Guardar Cambios',
    cancel: 'Cancelar',
    confirmImport: 'Confirmar e Importar Plan',
    importing: 'Importando...',
    importSuccess: '¡Plan importado exitosamente!',
    importError: 'Error al importar plan',
    back: 'Volver',
    ruleSetName: 'Nombre del Plan',
    planDescription: 'Descripción del Plan',
    effectiveDate: 'Fecha de Vigencia',
    eligibleRoles: 'Roles Elegibles',
    noComponents: 'No se detectaron componentes',
    accessDenied: 'Acceso Denegado',
    accessDeniedDesc: 'Debe ser un VL Admin para acceder a esta página.',
    viewDetails: 'Ver Detalles',
    adjust: 'Ajustar',
    highConfidence: 'Alta confianza',
    mediumConfidence: 'Confianza media - revisión recomendada',
    lowConfidence: 'Baja confianza - revisión manual requerida',
    aiPowered: 'Impulsado por IA',
    heuristicMode: 'Coincidencia de Patrones',
    overallConfidence: 'Confianza General',
    interpretationMethod: 'Método de Interpretación',
    workedExamples: 'Ejemplos Trabajados',
    employeeTypes: 'Tipos de Empleado',
    requiredInputs: 'Entradas Requeridas',
    currency: 'Moneda',
    viewRawResponse: 'Ver Respuesta Raw',
  },
};

interface TierDetail {
  min: number;
  max: number;
  label?: string;
  payout: number;
}

interface MatrixDetail {
  rowMetric: string;
  rowLabel: string;
  rowRanges: Array<{ min: number; max: number; label: string }>;
  columnMetric: string;
  columnLabel: string;
  columnRanges: Array<{ min: number; max: number; label: string }>;
  values: number[][];
}

interface PercentageDetail {
  rate: number;
  appliedTo: string;
}

interface ConditionalDetail {
  conditions: Array<{
    threshold: number;
    operator: string;
    rate: number;
    label?: string;
  }>;
  appliedTo: string;
  conditionMetric: string;
}

interface DetectedComponent {
  id: string;
  name: string;
  nameEs?: string;
  type: PlanComponent['componentType'];
  metricSource: string;
  measurementLevel: string;
  confidence: number;
  reasoning: string;
  config: Partial<PlanComponent>;
  // Detailed calculation data from AI
  tiers?: TierDetail[];
  matrix?: MatrixDetail;
  percentage?: PercentageDetail;
  conditional?: ConditionalDetail;
}

interface ParsedPlan {
  name: string;
  nameEs?: string;
  description: string;
  descriptionEs?: string;
  components: DetectedComponent[];
  rawData: Record<string, unknown>[];
  detectedFormat: string;
  interpretationMethod: 'ai' | 'heuristic';
  overallConfidence: number;
  overallReasoning: string;
  currency?: string;
  employeeTypes?: Array<{ id: string; name: string; nameEs?: string }>;
  workedExamples?: PlanInterpretation['workedExamples'];
  requiredInputs?: PlanInterpretation['requiredInputs'];
  planConfig?: RuleSetConfig;
  rawApiResponse?: string;
}

// OB-104: File queue status tracking
type QueueFileStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'skipped';
interface QueueFileEntry {
  file: File;
  status: QueueFileStatus;
  planName?: string;
  confidence?: number;
  error?: string;
  ruleSetId?: string;
}

function PlanImportPageInner() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { format: fmt } = useCurrency();
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parsedPlan, setParsedPlan] = useState<ParsedPlan | null>(null);
  const [editingComponent, setEditingComponent] = useState<DetectedComponent | null>(null);
  const [importResult, setImportResult] = useState<{ success: boolean; ruleSetId?: string; error?: string } | null>(null);

  // Multi-file queue (Decision 49)
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [completedPlans, setCompletedPlans] = useState<Array<{ name: string; ruleSetId: string; fileName: string }>>([]);

  // OB-104: Queue status tracking for batch context
  const [queueEntries, setQueueEntries] = useState<QueueFileEntry[]>([]);
  const [showBatchSummary, setShowBatchSummary] = useState(false);
  // Plan metadata
  const [ruleSetName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [eligibleRoles, _setEligibleRoles] = useState<string[]>(['sales_rep']);

  // AI configuration
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const aiAvailable = isAIInterpreterAvailable();

  // OB-91: Plan validation state
  const [validationResult, setValidationResult] = useState<PlanValidationResult | null>(null);
  const [resolvedAnomalies, setResolvedAnomalies] = useState<Set<string>>(new Set());
  const [showFullValidation, setShowFullValidation] = useState(false);

  // VL Admin always sees English, tenant users see tenant locale
  const { locale } = useAdminLocale();
  const t = labels[locale];

  // Check VL Admin access
  const hasAccess = user && isVLAdmin(user);

  // File drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // OB-104: Initialize queue entries when files are selected
  const initializeQueue = useCallback((files: File[]) => {
    const entries: QueueFileEntry[] = files.map((file, i) => ({
      file,
      status: i === 0 ? 'processing' : 'queued',
    }));
    setQueueEntries(entries);
    setFileQueue(files);
    setCurrentFileIndex(0);
    setCompletedPlans([]);
    setShowBatchSummary(false);
    processFile(files[0], 0);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      initializeQueue(files);
    }
  }, [initializeQueue]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      initializeQueue(Array.from(files));
    }
  }, [initializeQueue]);

  // Process uploaded file
  // HF-064: Accept fileIndex explicitly to avoid stale closure on currentFileIndex
  const processFile = async (file: File, fileIndex?: number) => {
    const idx = fileIndex ?? currentFileIndex;
    setIsAnalyzing(true);
    setParsedPlan(null);
    setImportResult(null);
    setAnalysisProgress(0);

    try {
      // Progress: File parsing
      setAnalysisProgress(20);

      console.log('\n========== PLAN IMPORT DEBUG ==========');
      console.log('Processing file:', file.name);

      // Use unified file parser (handles CSV, TSV, JSON, PPTX)
      const parsedFile = await parseFile(file);

      console.log('Parsed file format:', parsedFile.format);
      console.log('Slides available:', parsedFile.slides?.length || 0);
      console.log('Rows available:', parsedFile.rows?.length || 0);

      // Build document content string for AI interpretation
      let documentContent = '';

      // Add file metadata
      documentContent += `File: ${file.name}\n`;
      documentContent += `Format: ${parsedFile.format.toUpperCase()}\n\n`;

      // If PPTX, include slide text and tables
      if (parsedFile.format === 'pptx' && parsedFile.slides) {
        console.log('\nBuilding document content from PPTX slides...');
        for (const slide of parsedFile.slides) {
          documentContent += `--- Slide ${slide.slideNumber} ---\n`;
          documentContent += slide.texts.join('\n') + '\n';

          console.log(`Slide ${slide.slideNumber}: ${slide.texts.length} texts, ${slide.tables.length} tables`);

          for (const table of slide.tables) {
            documentContent += '\nTable:\n';
            if (table.headers.length > 0) {
              documentContent += '| ' + table.headers.join(' | ') + ' |\n';
              documentContent += '|' + table.headers.map(() => '---').join('|') + '|\n';
            }
            // table.rows is string[][] not Record[], so iterate directly
            for (const row of table.rows) {
              // row is string[] - join directly
              const rowValues = Array.isArray(row) ? row : Object.values(row);
              documentContent += '| ' + rowValues.join(' | ') + ' |\n';
            }
          }
          documentContent += '\n';
        }
      }

      // Add parsed row data (for non-PPTX or as supplement)
      if (parsedFile.rows.length > 0) {
        documentContent += '\n--- Data Rows ---\n';
        const headers = Object.keys(parsedFile.rows[0]);
        documentContent += '| ' + headers.join(' | ') + ' |\n';
        documentContent += '|' + headers.map(() => '---').join('|') + '|\n';
        for (const row of parsedFile.rows.slice(0, 50)) {
          // Limit to first 50 rows for AI
          documentContent += '| ' + Object.values(row).join(' | ') + ' |\n';
        }
      }

      console.log('\n========== DOCUMENT CONTENT FOR AI ==========');
      console.log('Format:', parsedFile.format);
      console.log('Content length:', documentContent.length, 'chars');
      if (parsedFile.format !== 'pdf') {
        console.log('Content preview (first 2000 chars):');
        console.log(documentContent.substring(0, 2000));
      } else {
        console.log('PDF base64 length:', parsedFile.pdfBase64?.length || 0);
      }
      console.log('==============================================\n');

      // Progress: Starting interpretation
      setAnalysisProgress(40);

      // For PDF files, send base64 directly to the API (Decision 50)
      let result;
      if (parsedFile.format === 'pdf' && parsedFile.pdfBase64) {
        console.log('Sending PDF directly to AI via document block...');
        const res = await fetch('/api/interpret-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentContent: `[PDF document: ${file.name}]`,
            pdfBase64: parsedFile.pdfBase64,
            pdfMediaType: parsedFile.pdfMediaType || 'application/pdf',
            tenantId: currentTenant?.id || 'default',
            userId: user?.id || 'system',
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'PDF interpretation failed');
        }
        // HF-064: Build planConfig for PDF path (matches non-PDF path from interpretPlanDocument)
        const pdfPlanConfig = data.interpretation
          ? interpretationToPlanConfig(data.interpretation, currentTenant?.id || 'default', user?.id || 'system')
          : undefined;
        result = {
          success: true,
          method: data.method as 'ai' | 'heuristic',
          interpretation: data.interpretation,
          planConfig: pdfPlanConfig,
          confidence: data.confidence,
        };
      } else {
        // Use standard AI-powered interpretation (with heuristic fallback)
        result = await interpretPlanDocument(
          documentContent,
          currentTenant?.id || 'default',
          user?.id || 'system',
          locale
        );
      }

      // Progress: Processing results
      setAnalysisProgress(80);

      if (!result.success) {
        throw new Error(result.error || 'Interpretation failed');
      }

      const interpretation = result.interpretation!;
      const detectedFormat = parsedFile.format.toUpperCase();

      // Build description
      let description = interpretation.description || `Imported from ${file.name}`;
      if (parsedFile.format === 'pptx' && parsedFile.slides) {
        description += ` (${parsedFile.slides.length} slides, ${parsedFile.slides.reduce((sum, s) => sum + s.tables.length, 0)} tables found)`;
      }

      // Convert AI components to DetectedComponent format with full calculation details
      const components: DetectedComponent[] = (interpretation.components || []).map((comp: Record<string, unknown>) => {
        // Null-safe access to calculationMethod
        const calcMethod = (comp?.calculationMethod as unknown as Record<string, unknown>) || {};
        const componentType =
          comp?.type === 'tiered_lookup'
            ? 'tier_lookup'
            : comp?.type === 'flat_percentage'
              ? 'percentage'
              : ((comp?.type || 'tier_lookup') as PlanComponent['componentType']);

        const detected: DetectedComponent = {
          id: String(comp?.id || `component-${Date.now()}`),
          name: String(comp?.name || 'Unknown Component'),
          nameEs: comp?.nameEs as string | undefined,
          type: componentType,
          metricSource:
            calcMethod && 'metric' in calcMethod
              ? String(calcMethod.metric)
              : calcMethod && 'rowAxis' in calcMethod
                ? String((calcMethod.rowAxis as Record<string, unknown>)?.metric || 'metric')
                : 'metric',
          measurementLevel: 'individual',
          confidence: Number(comp?.confidence ?? 50),
          reasoning: String(comp?.reasoning || ''),
          config: {
            componentType,
            measurementLevel: 'individual',
          },
        };

        // Extract detailed calculation data based on type (null-safe)
        if (comp?.type === 'tiered_lookup' && calcMethod && 'tiers' in calcMethod) {
          detected.tiers = ((calcMethod.tiers || []) as Array<Record<string, unknown>>).map((t) => ({
            min: Number(t?.min) || 0,
            max: t?.max === 'Infinity' || t?.max === Infinity ? Infinity : Number(t?.max) || 100,
            label: String(t?.label || ''),
            payout: Number(t?.payout) || 0,
          }));
        }

        if (comp?.type === 'matrix_lookup' && calcMethod && 'rowAxis' in calcMethod) {
          const rowAxis = (calcMethod.rowAxis as Record<string, unknown>) || {};
          const columnAxis = (calcMethod.columnAxis as Record<string, unknown>) || {};
          detected.matrix = {
            rowMetric: String(rowAxis?.metric || ''),
            rowLabel: String(rowAxis?.label || ''),
            rowRanges: ((rowAxis?.ranges || []) as Array<Record<string, unknown>>).map((r) => ({
              min: Number(r?.min) || 0,
              max: r?.max === 'Infinity' || r?.max === Infinity ? Infinity : Number(r?.max) || 100,
              label: String(r?.label || ''),
            })),
            columnMetric: String(columnAxis?.metric || ''),
            columnLabel: String(columnAxis?.label || ''),
            columnRanges: ((columnAxis?.ranges || []) as Array<Record<string, unknown>>).map((r) => ({
              min: Number(r?.min) || 0,
              max: r?.max === 'Infinity' || r?.max === Infinity ? Infinity : Number(r?.max) || 100,
              label: String(r?.label || ''),
            })),
            values: (calcMethod.values as number[][]) || [],
          };
        }

        if ((comp?.type === 'percentage' || comp?.type === 'flat_percentage') && calcMethod && 'rate' in calcMethod) {
          detected.percentage = {
            rate: Number(calcMethod.rate) || 0,
            appliedTo: String(calcMethod.metric || ''),
          };
        }

        if (comp?.type === 'conditional_percentage' && calcMethod && 'conditions' in calcMethod) {
          detected.conditional = {
            conditions: ((calcMethod.conditions || []) as Array<Record<string, unknown>>).map((c) => ({
              threshold: Number(c?.threshold) || 0,
              operator: String(c?.operator || '>='),
              rate: Number(c?.rate) || 0,
              label: String(c?.label || ''),
            })),
            appliedTo: String(calcMethod.metric || ''),
            conditionMetric: String(calcMethod.conditionMetric || ''),
          };
        }

        return detected;
      });

      // OB-23 FIX: Deep copy planConfig to prevent any reference mutation issues
      // This ensures tier data cannot be lost due to shared references
      const deepCopiedPlanConfig = result.planConfig
        ? JSON.parse(JSON.stringify(result.planConfig, (key, value) => {
            // Preserve Infinity values that JSON.stringify would convert to null
            if (value === Infinity) return 'INFINITY_PLACEHOLDER';
            return value;
          }), (key, value) => {
            if (value === 'INFINITY_PLACEHOLDER') return Infinity;
            return value;
          }) as RuleSetConfig
        : undefined;

      const parsed: ParsedPlan = {
        name: interpretation.ruleSetName,
        nameEs: interpretation.ruleSetNameEs,
        description,
        descriptionEs: interpretation.descriptionEs,
        components,
        rawData: parsedFile.rows,
        detectedFormat,
        interpretationMethod: result.method,
        overallConfidence: result.confidence,
        overallReasoning: interpretation.reasoning,
        currency: interpretation.currency,
        employeeTypes: interpretation.employeeTypes,
        workedExamples: interpretation.workedExamples,
        requiredInputs: interpretation.requiredInputs,
        planConfig: deepCopiedPlanConfig,
        rawApiResponse: interpretation.rawApiResponse,
      };

      setAnalysisProgress(100);
      setParsedPlan(parsed);
      setPlanName(parsed.name);
      setPlanDescription(parsed.description);

      // OB-104: Update queue entry with interpretation results (still processing until import)
      // HF-064: Use idx (explicit param) instead of currentFileIndex (stale closure)
      setQueueEntries(prev => prev.map((entry, i) =>
        i === idx ? {
          ...entry,
          planName: parsed.name,
          confidence: parsed.overallConfidence,
        } : entry
      ));

      // OB-91: Run plan validation if additive_lookup config available
      if (parsed.planConfig?.configuration && isAdditiveLookupConfig(parsed.planConfig.configuration)) {
        const vResult = validatePlanConfig(parsed.planConfig.configuration as AdditiveLookupConfig);
        setValidationResult(vResult);
        setResolvedAnomalies(new Set());
      }
    } catch (error) {
      console.error('Error processing file:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      // OB-104: Update queue entry with failure status and file name
      // HF-064: Use idx (explicit param) instead of currentFileIndex (stale closure)
      setQueueEntries(prev => prev.map((entry, i) =>
        i === idx ? { ...entry, status: 'failed' as QueueFileStatus, error: `${file.name}: ${errorMsg}` } : entry
      ));
      setImportResult({
        success: false,
        error: `${file.name} — ${errorMsg}`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };


  // Update component
  const handleUpdateComponent = (updated: DetectedComponent) => {
    if (!parsedPlan) return;

    // OB-91 Mission 3: Record correction signal when component values are edited
    const original = parsedPlan.components.find(c => c.id === updated.id);
    if (original && currentTenant?.id) {
      const hasValueChange =
        JSON.stringify(original.tiers) !== JSON.stringify(updated.tiers) ||
        JSON.stringify(original.matrix?.values) !== JSON.stringify(updated.matrix?.values) ||
        original.percentage?.rate !== updated.percentage?.rate;

      if (hasValueChange) {
        recordSignal({
          tenantId: currentTenant.id,
          domain: 'plan_anomaly',
          fieldName: updated.name,
          semanticType: 'plan_anomaly_resolution',
          confidence: 0.99,
          source: 'user_corrected',
          metadata: {
            component: updated.name,
            componentType: updated.type,
            correctionType: 'value_edit',
          },
        });
      }
    }

    setParsedPlan({
      ...parsedPlan,
      components: parsedPlan.components.map((c) =>
        c.id === updated.id ? updated : c
      ),
    });
    setEditingComponent(null);
  };

  // Import plan
  const handleImport = async () => {
    console.log('[handleImport] Button clicked - handler fired');
    console.log('[handleImport] parsedPlan:', parsedPlan ? 'EXISTS' : 'NULL');
    console.log('[handleImport] currentTenant:', currentTenant ? currentTenant.id : 'NULL');

    if (!parsedPlan) {
      console.error('[handleImport] ABORT: parsedPlan is null/undefined');
      return;
    }
    if (!currentTenant) {
      console.error('[handleImport] ABORT: currentTenant is null/undefined');
      return;
    }

    setIsImporting(true);

    try {
      const now = new Date().toISOString();
      let planConfig: RuleSetConfig;

      // Use the pre-built plan config from AI interpretation if available
      if (parsedPlan.planConfig) {

        // OB-23 FIX: Deep copy the configuration to ensure tier data is preserved
        // The spread operator only does shallow copy, which could lose nested tier arrays
        const preservedConfig = JSON.parse(JSON.stringify(parsedPlan.planConfig.configuration, (key, value) => {
          if (value === Infinity) return 'INFINITY_PLACEHOLDER';
          return value;
        }), (key, value) => {
          if (value === 'INFINITY_PLACEHOLDER') return Infinity;
          return value;
        });

        planConfig = {
          ...parsedPlan.planConfig,
          configuration: preservedConfig, // Use deep-copied configuration
          name: ruleSetName,
          description: planDescription,
          effectiveDate: new Date(effectiveDate).toISOString(),
          tenantId: currentTenant.id,
          createdBy: user?.id || 'system',
          updatedBy: user?.id || 'system',
          createdAt: now,
          updatedAt: now,
        };
      } else {
        // Fallback: Build plan configuration from detected components
        planConfig = {
          id: crypto.randomUUID(),
          tenantId: currentTenant.id,
          name: ruleSetName,
          description: planDescription,
          ruleSetType: 'additive_lookup',
          status: 'draft',
          effectiveDate: new Date(effectiveDate).toISOString(),
          endDate: null,
          eligibleRoles,
          version: 1,
          previousVersionId: null,
          createdBy: user?.id || 'system',
          createdAt: now,
          updatedBy: user?.id || 'system',
          updatedAt: now,
          approvedBy: null,
          approvedAt: null,
          configuration: {
            type: 'additive_lookup',
            variants: [
              {
                variantId: 'default',
                variantName: 'Default',
                description: 'Imported plan variant',
                components: parsedPlan.components.map((c, index) => ({
                  id: c.id,
                  name: c.name,
                  description: c.reasoning,
                  order: index + 1,
                  enabled: true,
                  componentType: c.type,
                  measurementLevel: (c.measurementLevel === 'bu' ? 'team' : c.measurementLevel) as 'individual' | 'store' | 'team' | 'region',
                  // OB-23: Use AI-extracted tier data from c.tiers (already mapped from calculationMethod)
                  ...(c.type === 'tier_lookup' && {
                    tierConfig: {
                      metric: c.metricSource || 'attainment',
                      metricLabel: c.metricSource || 'Attainment',
                      tiers: c.tiers && c.tiers.length > 0
                        ? c.tiers.map(t => ({
                            min: t.min,
                            max: t.max === 999999 ? Infinity : t.max,
                            label: t.label || `${t.min}-${t.max}%`,
                            value: t.payout, // Map AI's 'payout' to engine's 'value'
                          }))
                        : [{ min: 0, max: Infinity, label: 'Default', value: 0 }],
                      currency: parsedPlan.currency || 'USD',
                    },
                  }),
                  ...(c.type === 'percentage' && {
                    percentageConfig: {
                      rate: c.percentage?.rate || 0.05,
                      appliedTo: c.metricSource || 'amount',
                      appliedToLabel: c.metricSource || 'Amount',
                    },
                  }),
                  // OB-23: Use AI-extracted matrix data from c.matrix
                  ...(c.type === 'matrix_lookup' && c.matrix && {
                    matrixConfig: {
                      rowMetric: c.matrix.rowMetric || 'attainment',
                      rowMetricLabel: c.matrix.rowLabel || 'Attainment',
                      rowBands: c.matrix.rowRanges && c.matrix.rowRanges.length > 0
                        ? c.matrix.rowRanges.map(r => ({
                            min: r.min,
                            max: r.max === 999999 ? Infinity : r.max,
                            label: r.label || `${r.min}-${r.max}`,
                          }))
                        : [{ min: 0, max: Infinity, label: 'Default' }],
                      columnMetric: c.matrix.columnMetric || 'volume',
                      columnMetricLabel: c.matrix.columnLabel || 'Volume',
                      columnBands: c.matrix.columnRanges && c.matrix.columnRanges.length > 0
                        ? c.matrix.columnRanges.map(r => ({
                            min: r.min,
                            max: r.max === 999999 ? Infinity : r.max,
                            label: r.label || `${r.min}-${r.max}`,
                          }))
                        : [{ min: 0, max: Infinity, label: 'Default' }],
                      values: c.matrix.values && c.matrix.values.length > 0
                        ? c.matrix.values
                        : [[0]],
                      currency: parsedPlan.currency || 'USD',
                    },
                  }),
                })),
              },
            ],
          },
        };
      }

      // Save and activate via server API route (service role bypasses RLS)
      console.log('[handleImport] Saving plan via API:', planConfig.id, planConfig.name);
      const response = await fetch('/api/plan/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planConfig, activate: true }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Plan import failed: ${response.status}`);
      }

      const { ruleSet } = await response.json();
      console.log('[handleImport] Plan saved and activated via API:', ruleSet.id);

      setImportResult({ success: true, ruleSetId: planConfig.id });

      // OB-104: Update queue entry with success status
      setQueueEntries(prev => prev.map((entry, i) =>
        i === currentFileIndex ? {
          ...entry,
          status: 'completed' as QueueFileStatus,
          planName: ruleSetName || parsedPlan?.name || 'Unnamed Plan',
          confidence: parsedPlan?.overallConfidence,
          ruleSetId: planConfig.id,
        } : entry
      ));

      // Track completed plan for multi-file queue
      setCompletedPlans(prev => [...prev, {
        name: ruleSetName || parsedPlan?.name || 'Unnamed Plan',
        ruleSetId: planConfig.id,
        fileName: fileQueue[currentFileIndex]?.name || 'unknown',
      }]);

      // OB-104: Show batch summary when all files in a multi-file queue are done
      if (currentFileIndex >= fileQueue.length - 1 && fileQueue.length > 1) {
        setShowBatchSummary(true);
      }

      console.log('[handleImport] SUCCESS - Import complete');
    } catch (error) {
      console.error('[handleImport] ERROR:', error);
      setImportResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Get confidence badge color
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 80) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (confidence >= 60) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
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

  // Determine current subway step
  const currentStep = importResult?.success
    ? 'confirm'
    : parsedPlan
      ? 'review'
      : 'upload';

  const STEPS = [
    { key: 'upload', label: locale === 'es-MX' ? 'Subir Documento' : 'Upload Plan Document' },
    { key: 'review', label: locale === 'es-MX' ? 'Revisar Interpretacion' : 'Review AI Interpretation' },
    { key: 'confirm', label: locale === 'es-MX' ? 'Confirmar y Guardar' : 'Confirm & Save' },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/performance/plans')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-50">
            {t.title}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">{t.subtitle}</p>
        </div>
      </div>

      {/* Subway Progress Indicator — OB-58 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
        {STEPS.map((step, i) => {
          const isCurrent = step.key === currentStep;
          const stepIndex = STEPS.findIndex(s => s.key === currentStep);
          const isPast = stepIndex > i;
          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: i < STEPS.length - 1 ? 1 : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: isPast ? '#10B981' : isCurrent ? '#6366F1' : '#1E293B',
                  color: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 600,
                }}>
                  {isPast ? '\u2713' : i + 1}
                </div>
                <span style={{ fontSize: '14px', color: isCurrent ? '#E2E8F0' : isPast ? '#10B981' : '#94A3B8', fontWeight: isCurrent ? 500 : 400 }}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: '2px', background: isPast ? '#10B981' : '#1E293B', marginLeft: '8px' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Import Success */}
      {importResult?.success && (
        <div className="space-y-4">
          <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20">
            <CardContent className="flex items-center gap-4 py-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <div className="flex-1">
                <p className="font-medium text-emerald-900 dark:text-emerald-100">{t.importSuccess}</p>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">Plan ID: {importResult.ruleSetId}</p>
              </div>
            </CardContent>
          </Card>

          {/* Multi-file: completed plans summary */}
          {completedPlans.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{completedPlans.length} {completedPlans.length === 1 ? 'plan' : 'plans'} imported</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {completedPlans.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-zinc-300">{p.fileName}</span>
                      <span className="text-zinc-500">→</span>
                      <span className="text-zinc-100">{p.name}</span>
                    </div>
                  ))}
                  {currentFileIndex < fileQueue.length - 1 && (
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{fileQueue.length - currentFileIndex - 1} file(s) remaining in queue</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Multi-file: Next File button */}
          {currentFileIndex < fileQueue.length - 1 && (
            <Card className="border-blue-800 bg-blue-900/20">
              <CardContent className="flex items-center gap-4 py-4">
                <FileText className="h-8 w-8 text-blue-400" />
                <div className="flex-1">
                  <p className="font-medium text-blue-100">
                    Next: {fileQueue[currentFileIndex + 1]?.name}
                  </p>
                  <p className="text-sm text-blue-300">
                    File {currentFileIndex + 2} of {fileQueue.length}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    const nextIndex = currentFileIndex + 1;
                    // OB-104: Update queue entries — mark next as processing
                    setQueueEntries(prev => prev.map((entry, i) =>
                      i === nextIndex ? { ...entry, status: 'processing' as QueueFileStatus } : entry
                    ));
                    setCurrentFileIndex(nextIndex);
                    processFile(fileQueue[nextIndex], nextIndex);
                  }}
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Process Next File
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Next Steps (only when all files are done) */}
          {(currentFileIndex >= fileQueue.length - 1) && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-primary" />
                  {locale === 'es-MX' ? 'Siguiente Paso' : 'Next Step'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <a
                    href="/data/import/enhanced"
                    className="p-4 border rounded-lg hover:bg-zinc-800/50 transition-colors flex items-start gap-4"
                  >
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <Upload className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">
                        {locale === 'es-MX' ? 'Importar Plantilla y Datos' : 'Import Roster & Data'}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {locale === 'es-MX'
                          ? 'Cargar la plantilla de empleados y datos de rendimiento para calcular compensaciones.'
                          : 'Upload your employee roster and performance data to run calculations.'}
                      </p>
                    </div>
                  </a>
                  <a
                    href="/performance/plans"
                    className="p-4 border rounded-lg hover:bg-zinc-800/50 transition-colors flex items-start gap-4"
                  >
                    <div className="p-3 bg-muted rounded-lg">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">
                        {locale === 'es-MX' ? 'Ver Planes' : 'View Plans'}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {locale === 'es-MX'
                          ? 'Revisar los planes de compensacion importados.'
                          : 'Review the compensation plans you just imported.'}
                      </p>
                    </div>
                  </a>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* OB-104: File Queue Panel — shows when multiple files are queued */}
      {queueEntries.length > 1 && (
        <Card className="border-slate-700 bg-slate-900/50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-200 flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                {locale === 'es-MX' ? 'Cola de Importacion' : 'Plan Import Queue'} — {queueEntries.length} {locale === 'es-MX' ? 'archivos' : 'files'}
              </p>
              <span className="text-xs text-slate-400">
                {locale === 'es-MX' ? 'Archivo' : 'File'} {currentFileIndex + 1} {locale === 'es-MX' ? 'de' : 'of'} {queueEntries.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {queueEntries.map((entry, i) => (
                <div key={i} className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm',
                  i === currentFileIndex ? 'bg-slate-800 border border-slate-600' : 'opacity-70'
                )}>
                  {entry.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                  {entry.status === 'processing' && <div className="h-3.5 w-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />}
                  {entry.status === 'failed' && <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                  {entry.status === 'skipped' && <SkipForward className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
                  {entry.status === 'queued' && <div className="h-3.5 w-3.5 rounded-full border border-slate-500 shrink-0" />}
                  <span className={cn('truncate flex-1', i === currentFileIndex ? 'text-slate-100 font-medium' : 'text-slate-400')}>
                    {entry.file.name}
                  </span>
                  {entry.status === 'completed' && entry.planName && (
                    <span className="text-xs text-emerald-400 shrink-0">{entry.planName}</span>
                  )}
                  {entry.status === 'completed' && entry.confidence && (
                    <Badge className={cn('text-[10px] shrink-0', getConfidenceColor(entry.confidence))}>
                      {entry.confidence}%
                    </Badge>
                  )}
                  {entry.status === 'failed' && (
                    <span className="text-xs text-red-400 shrink-0">{locale === 'es-MX' ? 'Error' : 'Failed'}</span>
                  )}
                  {entry.status === 'skipped' && (
                    <span className="text-xs text-slate-500 shrink-0">{locale === 'es-MX' ? 'Omitido' : 'Skipped'}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* OB-104: Batch Completion Summary */}
      {showBatchSummary && queueEntries.length > 1 && (
        <Card className="border-emerald-700 bg-emerald-900/20">
          <CardContent className="py-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              <div>
                <p className="font-medium text-emerald-100">
                  {locale === 'es-MX' ? 'Importacion de Planes Completa' : 'Plan Import Complete'} — {queueEntries.length} {locale === 'es-MX' ? 'archivos procesados' : 'files processed'}
                </p>
                <p className="text-sm text-emerald-300">
                  {queueEntries.filter(e => e.status === 'completed').length} {locale === 'es-MX' ? 'exitosos' : 'succeeded'} · {queueEntries.filter(e => e.status === 'failed').length} {locale === 'es-MX' ? 'fallidos' : 'failed'} · {queueEntries.filter(e => e.status === 'skipped').length} {locale === 'es-MX' ? 'omitidos' : 'skipped'}
                </p>
              </div>
            </div>
            <div className="space-y-1.5 mb-4">
              {queueEntries.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {entry.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                  {entry.status === 'failed' && <XCircle className="h-3.5 w-3.5 text-red-400" />}
                  {entry.status === 'skipped' && <SkipForward className="h-3.5 w-3.5 text-slate-500" />}
                  <span className="text-slate-300">{entry.file.name}</span>
                  {entry.planName && <span className="text-slate-500">→ {entry.planName}</span>}
                  {entry.confidence && <span className="text-xs text-slate-400">{entry.confidence}%</span>}
                  {entry.error && <span className="text-xs text-red-400">{entry.error}</span>}
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={() => router.push('/performance/plans')}>
                {locale === 'es-MX' ? 'Ver Planes' : 'View Plans'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setQueueEntries([]); setShowBatchSummary(false); setParsedPlan(null); setImportResult(null); }}>
                {locale === 'es-MX' ? 'Importar Mas' : 'Import More'}
              </Button>
              <Button size="sm" onClick={() => router.push('/operate/import')}>
                {locale === 'es-MX' ? 'Continuar a Importar Datos' : 'Continue to Data Import'} →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Error — OB-104: Enhanced with file name, recovery options */}
      {importResult?.success === false && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-4">
              <XCircle className="h-8 w-8 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-900 dark:text-red-100">{t.importError}</p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{importResult.error}</p>
                {/* OB-104: Recovery options */}
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setImportResult(null);
                      setParsedPlan(null);
                      setQueueEntries(prev => prev.map((entry, i) =>
                        i === currentFileIndex ? { ...entry, status: 'processing' as QueueFileStatus, error: undefined } : entry
                      ));
                      processFile(fileQueue[currentFileIndex], currentFileIndex);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    {locale === 'es-MX' ? 'Reintentar' : 'Retry This File'}
                  </Button>
                  {currentFileIndex < fileQueue.length - 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Mark current as skipped, move to next
                        setQueueEntries(prev => prev.map((entry, i) =>
                          i === currentFileIndex ? { ...entry, status: 'skipped' as QueueFileStatus } : entry
                        ));
                        setImportResult(null);
                        setParsedPlan(null);
                        const nextIndex = currentFileIndex + 1;
                        setCurrentFileIndex(nextIndex);
                        setQueueEntries(prev => prev.map((entry, i) =>
                          i === nextIndex ? { ...entry, status: 'processing' as QueueFileStatus } : entry
                        ));
                        processFile(fileQueue[nextIndex], nextIndex);
                      }}
                    >
                      <SkipForward className="h-3.5 w-3.5 mr-1.5" />
                      {locale === 'es-MX' ? 'Omitir y Siguiente' : 'Skip & Process Next'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setImportResult(null);
                      setParsedPlan(null);
                      setQueueEntries(prev => prev.map((entry, i) =>
                        i === currentFileIndex ? { ...entry, status: 'queued' as QueueFileStatus, error: undefined } : entry
                      ));
                      document.getElementById('replace-file-input')?.click();
                    }}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {locale === 'es-MX' ? 'Reemplazar Archivo' : 'Upload Different File'}
                  </Button>
                  <input
                    id="replace-file-input"
                    type="file"
                    accept=".pdf,.pptx,.docx,.xlsx,.xls,.csv,.tsv,.json"
                    className="hidden"
                    onChange={(e) => {
                      const newFile = e.target.files?.[0];
                      if (newFile) {
                        setFileQueue(prev => prev.map((f, i) => i === currentFileIndex ? newFile : f));
                        setQueueEntries(prev => prev.map((entry, i) =>
                          i === currentFileIndex ? { file: newFile, status: 'processing' as QueueFileStatus } : entry
                        ));
                        processFile(newFile, currentFileIndex);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Area */}
      {!parsedPlan && !isAnalyzing && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  {t.uploadTitle}
                </CardTitle>
                <CardDescription>{t.supportedFormats}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {aiAvailable ? (
                  <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                    <Brain className="h-3 w-3 mr-1" />
                    {t.aiPowered}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    <Cpu className="h-3 w-3 mr-1" />
                    {t.heuristicMode}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer',
                isDragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-slate-300 hover:border-slate-400 dark:border-slate-700'
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <FileText className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">{t.uploadDesc}</p>
              <input
                id="file-input"
                type="file"
                multiple
                accept=".pdf,.pptx,.docx,.xlsx,.xls,.csv,.tsv,.json"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analyzing */}
      {isAnalyzing && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            {aiAvailable ? (
              <>
                <Brain className="h-12 w-12 text-purple-500 animate-pulse mb-4" />
                <p className="text-lg font-medium mb-2">{t.aiAnalyzing}</p>
                <p className="text-sm text-slate-400 mb-4">{t.aiAnalyzingDesc}</p>
              </>
            ) : (
              <>
                <Cpu className="h-12 w-12 text-blue-500 animate-pulse mb-4" />
                <p className="text-lg font-medium mb-2">{t.heuristicAnalyzing}</p>
                <p className="text-sm text-slate-400 mb-4">{t.heuristicAnalyzingDesc}</p>
              </>
            )}
            <Progress value={analysisProgress} className="w-64" />
            <p className="text-xs text-slate-400 mt-2">{analysisProgress}%</p>
          </CardContent>
        </Card>
      )}

      {/* Parsed Plan */}
      {parsedPlan && !importResult?.success && (
        <>
          {/* Interpretation Summary */}
          <Card className={cn(
            'border-2',
            parsedPlan.interpretationMethod === 'ai'
              ? 'border-purple-200 dark:border-purple-800'
              : 'border-blue-200 dark:border-blue-800'
          )}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {parsedPlan.interpretationMethod === 'ai' ? (
                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                      <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Cpu className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-lg">{t.detected}</CardTitle>
                    <CardDescription>
                      {t.interpretationMethod}: {parsedPlan.interpretationMethod === 'ai' ? t.aiPowered : t.heuristicMode}
                      {' | '}Format: {parsedPlan.detectedFormat ?? 'unknown'}
                      {' | '}{parsedPlan.rawData?.length ?? 0} rows
                      {parsedPlan.currency && ` | ${t.currency}: ${parsedPlan.currency}`}
                    </CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-400">{t.overallConfidence}</div>
                  <Badge className={getConfidenceColor(parsedPlan.overallConfidence ?? 0)}>
                    {parsedPlan.overallConfidence ?? 0}%
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-800/50 rounded-lg p-3 text-sm">
                <p className="text-slate-600 dark:text-slate-400">
                  <strong>{t.reasoning}:</strong> {parsedPlan.overallReasoning}
                </p>
              </div>
              {parsedPlan.rawApiResponse && (
                <div className="mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRawResponse(!showRawResponse)}
                    className="text-slate-400"
                  >
                    {t.viewRawResponse}
                  </Button>
                  {showRawResponse && (
                    <pre className="mt-2 p-3 bg-slate-900 text-slate-100 rounded-lg text-xs overflow-auto max-h-48">
                      {parsedPlan.rawApiResponse}
                    </pre>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Plan Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>{t.ruleSetName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ruleSetName">{t.ruleSetName}</Label>
                  <Input
                    id="ruleSetName"
                    value={ruleSetName}
                    onChange={(e) => setPlanName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="effectiveDate">{t.effectiveDate}</Label>
                  <Input
                    id="effectiveDate"
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="planDescription">{t.planDescription}</Label>
                <Textarea
                  id="planDescription"
                  value={planDescription}
                  onChange={(e) => setPlanDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Employee Types & Worked Examples (if available from AI) */}
          {parsedPlan.interpretationMethod === 'ai' && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Employee Types */}
              {parsedPlan.employeeTypes && parsedPlan.employeeTypes.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t.employeeTypes}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {parsedPlan.employeeTypes.map((et) => (
                        <Badge key={et.id} variant="outline">
                          {et.name}
                          {et.nameEs && locale === 'es-MX' && ` (${et.nameEs})`}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Worked Examples */}
              {parsedPlan.workedExamples && parsedPlan.workedExamples.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t.workedExamples}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {parsedPlan.workedExamples.filter(ex => ex != null).map((ex, idx) => (
                        <div key={idx} className="bg-emerald-50 dark:bg-emerald-900/20 rounded p-2 text-sm">
                          <span className="font-medium">{ex?.employeeType ?? 'Employee'}:</span>{' '}
                          <span className="text-emerald-700 dark:text-emerald-300">
                            {fmt(ex?.expectedTotal ?? 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* OB-91: Validation Summary Cards */}
          {validationResult && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold text-slate-100">{validationResult.components}</p>
                  <p className="text-xs text-slate-400">{locale === 'es-MX' ? 'Componentes Analizados' : 'Components Parsed'}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold text-slate-100">{validationResult.valuesParsed}</p>
                  <p className="text-xs text-slate-400">{locale === 'es-MX' ? 'Valores Analizados' : 'Values Parsed'}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className={cn('text-2xl font-bold', validationResult.passedChecks === validationResult.totalChecks ? 'text-emerald-400' : 'text-amber-400')}>
                    {validationResult.passedChecks}/{validationResult.totalChecks}
                  </p>
                  <p className="text-xs text-slate-400">{locale === 'es-MX' ? 'Checks Pasados' : 'Checks Passed'}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  {(() => {
                    const unresolvedCount = validationResult.anomalies.filter(a => !resolvedAnomalies.has(anomalyKey(a))).length;
                    return (
                      <>
                        <p className={cn('text-2xl font-bold', unresolvedCount === 0 ? 'text-emerald-400' : 'text-amber-400')}>
                          {unresolvedCount}
                        </p>
                        <p className="text-xs text-slate-400">{locale === 'es-MX' ? 'Requieren Revision' : 'Needs Review'}</p>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Detected Components */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-500" />
                {locale === 'es-MX' ? 'Componentes Detectados' : 'Detected Components'}
              </CardTitle>
              <CardDescription>
                {parsedPlan.components.length} {locale === 'es-MX' ? 'componentes encontrados' : 'components found'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {parsedPlan.components.length === 0 ? (
                <p className="text-center text-slate-400 py-8">{t.noComponents}</p>
              ) : (
                <div className="space-y-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{locale === 'es-MX' ? 'Componente' : 'Component'}</TableHead>
                        <TableHead>{t.componentType}</TableHead>
                        <TableHead>{t.metricSource}</TableHead>
                        <TableHead>{t.confidence}</TableHead>
                        <TableHead>{locale === 'es-MX' ? 'Validacion' : 'Validation'}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(parsedPlan.components || []).filter(c => c != null).map((component) => {
                        const compAnomalies = validationResult
                          ? getAnomaliesForComponent(validationResult, component?.name ?? '')
                          : [];
                        const unresolvedCompAnomalies = compAnomalies.filter(a => !resolvedAnomalies.has(anomalyKey(a)));
                        const hasCritical = unresolvedCompAnomalies.some(a => a.severity === 'critical');
                        const hasWarning = unresolvedCompAnomalies.some(a => a.severity === 'warning');

                        return (
                          <TableRow key={component?.id || Math.random()}>
                            <TableCell className="font-medium">{component?.name ?? 'Unknown'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{component?.type ?? 'unknown'}</Badge>
                            </TableCell>
                            <TableCell>{component?.metricSource ?? '-'}</TableCell>
                            <TableCell>
                              <Badge className={getConfidenceColor(component?.confidence ?? 0)}>
                                {component?.confidence ?? 0}%
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {validationResult ? (
                                unresolvedCompAnomalies.length === 0 ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    {locale === 'es-MX' ? 'Limpio' : 'Clean'}
                                  </Badge>
                                ) : (
                                  <Badge className={hasCritical
                                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                    : hasWarning
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                  }>
                                    {hasCritical ? <XCircle className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                                    {unresolvedCompAnomalies.length} {locale === 'es-MX' ? 'alerta(s)' : 'issue(s)'}
                                  </Badge>
                                )
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => component && setEditingComponent(component)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {/* OB-91: Inline anomaly cards per component */}
                  {validationResult && validationResult.anomalies.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {(parsedPlan.components || []).filter(c => c != null).map((component) => {
                        const compAnomalies = getAnomaliesForComponent(validationResult, component?.name ?? '');
                        if (compAnomalies.length === 0) return null;

                        return (
                          <div key={`anomalies-${component?.id}`} className="border rounded-lg p-3 space-y-2">
                            <p className="text-xs font-medium text-slate-300">
                              {component?.name} — {compAnomalies.length} {locale === 'es-MX' ? 'anomalía(s)' : 'anomaly(ies)'}
                            </p>
                            {compAnomalies.map((anomaly) => {
                              const key = anomalyKey(anomaly);
                              const isResolved = resolvedAnomalies.has(key);

                              return (
                                <div
                                  key={key}
                                  className={cn(
                                    'rounded-lg p-3 text-sm border',
                                    isResolved
                                      ? 'bg-zinc-800/30 border-zinc-700 opacity-60'
                                      : anomaly.severity === 'critical'
                                        ? 'bg-red-900/20 border-red-800/50'
                                        : anomaly.severity === 'warning'
                                          ? 'bg-amber-900/20 border-amber-800/50'
                                          : 'bg-blue-900/20 border-blue-800/50'
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="outline" className="text-[10px]">{anomaly.id}</Badge>
                                        <span className={cn('text-[10px] font-bold uppercase',
                                          anomaly.severity === 'critical' ? 'text-red-400' :
                                          anomaly.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
                                        )}>
                                          {anomaly.severity}
                                        </span>
                                        <span className="text-[10px] text-slate-400">{anomaly.location}</span>
                                      </div>
                                      <p className="text-xs text-slate-300">{anomaly.explanation}</p>
                                      {anomaly.suggestions.length > 0 && (
                                        <p className="text-[11px] text-slate-400 mt-1">
                                          {anomaly.suggestions[0]}
                                        </p>
                                      )}
                                    </div>
                                    {!isResolved && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs shrink-0"
                                        onClick={() => {
                                          setResolvedAnomalies(prev => {
                                            const next = new Set(prev);
                                            next.add(key);
                                            return next;
                                          });
                                          // OB-91 Mission 3: Record classification signal
                                          if (currentTenant?.id) {
                                            recordSignal({
                                              tenantId: currentTenant.id,
                                              domain: 'plan_anomaly',
                                              fieldName: anomaly.id,
                                              semanticType: 'plan_anomaly_resolution',
                                              confidence: 0.95,
                                              source: 'user_confirmed',
                                              metadata: {
                                                anomalyType: anomaly.type,
                                                component: anomaly.component,
                                                variant: anomaly.variant,
                                                location: anomaly.location,
                                                extractedValue: anomaly.extractedValue,
                                                severity: anomaly.severity,
                                              },
                                            });
                                          }
                                        }}
                                      >
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        {locale === 'es-MX' ? 'Confirmar correcto' : 'Confirm correct'}
                                      </Button>
                                    )}
                                    {isResolved && (
                                      <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3" />
                                        {locale === 'es-MX' ? 'Resuelto' : 'Resolved'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* OB-104: Accept All Warnings button */}
                  {validationResult && validationResult.anomalies.filter(a => a.severity !== 'critical' && !resolvedAnomalies.has(anomalyKey(a))).length > 0 && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const next = new Set(resolvedAnomalies);
                          validationResult.anomalies
                            .filter(a => a.severity !== 'critical')
                            .forEach(a => next.add(anomalyKey(a)));
                          setResolvedAnomalies(next);
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        {locale === 'es-MX' ? 'Aceptar Todas las Advertencias' : 'Accept All Warnings'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* OB-91: Full Validation Panel button */}
          {validationResult && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setShowFullValidation(true)}>
                {locale === 'es-MX' ? 'Ver Reporte Completo de Validacion' : 'View Full Validation Report'}
              </Button>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => { setParsedPlan(null); setValidationResult(null); }}>
              {locale === 'es-MX' ? 'Subir Otro Archivo' : 'Upload Different File'}
            </Button>
            <Button
              onClick={handleImport}
              disabled={
                isImporting ||
                parsedPlan.components.length === 0 ||
                (validationResult != null && hasUnresolvedCriticals(validationResult, resolvedAnomalies))
              }
              title={
                validationResult && hasUnresolvedCriticals(validationResult, resolvedAnomalies)
                  ? (locale === 'es-MX' ? 'Resuelva las anomalías criticas antes de importar' : 'Resolve critical anomalies before importing')
                  : undefined
              }
            >
              {isImporting ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  {t.importing}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {t.confirmImport}
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {/* OB-91: Full Validation Report Dialog */}
      <Dialog open={showFullValidation} onOpenChange={setShowFullValidation}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {locale === 'es-MX' ? 'Reporte de Validacion del Plan' : 'Plan Validation Report'}
            </DialogTitle>
            <DialogDescription>
              {validationResult
                ? `${validationResult.totalChecks} ${locale === 'es-MX' ? 'verificaciones ejecutadas' : 'checks run'} — ${validationResult.passedChecks} ${locale === 'es-MX' ? 'pasadas' : 'passed'}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {validationResult && (
            <div className="space-y-3 pt-2">
              {/* All checks list */}
              {['S-01', 'S-02', 'S-03', 'S-04', 'S-05', 'S-06', 'S-07', 'S-08', 'S-09', 'V-01', 'V-02', 'V-03', 'X-01', 'X-04'].map(checkId => {
                const checkNames: Record<string, string> = {
                  'S-01': 'Row Monotonicity',
                  'S-02': 'Column Monotonicity',
                  'S-03': 'Magnitude Outlier',
                  'S-04': 'Zero in Active Region',
                  'S-05': 'Non-Zero in Floor',
                  'S-06': 'Threshold Gap',
                  'S-07': 'Threshold Overlap',
                  'S-08': 'Boundary Ambiguity',
                  'S-09': 'Inconsistent Convention',
                  'V-01': 'Structural Mismatch',
                  'V-02': 'Ratio Break',
                  'V-03': 'Value Exceeds Primary',
                  'X-01': 'Missing Data Binding',
                  'X-04': 'Partial Matrix',
                };
                const found = validationResult.anomalies.filter(a => a.id === checkId);
                const allResolved = found.every(a => resolvedAnomalies.has(anomalyKey(a)));
                const hasCritical = found.some(a => a.severity === 'critical' && !resolvedAnomalies.has(anomalyKey(a)));
                const passed = found.length === 0 || allResolved;

                return (
                  <div key={checkId} className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg border',
                    passed ? 'border-emerald-800/30 bg-emerald-900/10' :
                    hasCritical ? 'border-red-800/30 bg-red-900/10' : 'border-amber-800/30 bg-amber-900/10'
                  )}>
                    {passed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    ) : hasCritical ? (
                      <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                    )}
                    <div className="flex-1">
                      <span className="text-sm text-slate-200">{checkId}: {checkNames[checkId]}</span>
                      {found.length > 0 && (
                        <span className="text-xs text-slate-400 ml-2">
                          ({found.length} {locale === 'es-MX' ? 'hallazgos' : 'finding(s)'}{allResolved ? ` — ${locale === 'es-MX' ? 'resueltos' : 'resolved'}` : ''})
                        </span>
                      )}
                    </div>
                    {passed && (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">
                        PASS
                      </Badge>
                    )}
                    {!passed && (
                      <Badge className={hasCritical
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px]'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]'
                      }>
                        {found.length} {hasCritical ? 'CRITICAL' : 'WARNING'}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Component Dialog */}
      <Dialog open={!!editingComponent} onOpenChange={() => setEditingComponent(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {editingComponent && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Edit2 className="h-5 w-5" />
                  {t.editComponent}
                </DialogTitle>
                <DialogDescription>
                  {editingComponent.name}
                  <Badge className={cn('ml-2', getConfidenceColor(editingComponent.confidence))}>
                    {editingComponent.confidence}% {t.confidence}
                  </Badge>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 pt-4">
                {/* Basic Info */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{locale === 'es-MX' ? 'Nombre' : 'Name'}</Label>
                    <Input
                      value={editingComponent.name}
                      onChange={(e) =>
                        setEditingComponent({ ...editingComponent, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.componentType}</Label>
                    <Select
                      value={editingComponent.type}
                      onValueChange={(value) =>
                        setEditingComponent({
                          ...editingComponent,
                          type: value as PlanComponent['componentType'],
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="matrix_lookup">Matrix Lookup</SelectItem>
                        <SelectItem value="tier_lookup">Tier Lookup</SelectItem>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="conditional_percentage">Conditional Percentage</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t.metricSource}</Label>
                    <Input
                      value={editingComponent.metricSource}
                      onChange={(e) =>
                        setEditingComponent({ ...editingComponent, metricSource: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.measurementLevel}</Label>
                    <Select
                      value={editingComponent.measurementLevel}
                      onValueChange={(value) =>
                        setEditingComponent({ ...editingComponent, measurementLevel: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="store">Store</SelectItem>
                        <SelectItem value="team">Team</SelectItem>
                        <SelectItem value="region">Region</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Reasoning */}
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    <strong>{t.reasoning}:</strong> {editingComponent.reasoning}
                  </p>
                </div>

                {/* Tier Lookup Details */}
                {editingComponent.type === 'tier_lookup' && editingComponent.tiers && (
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">
                      {locale === 'es-MX' ? 'Tabla de Niveles' : 'Tier Table'}
                    </Label>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{locale === 'es-MX' ? 'Rango' : 'Range'}</TableHead>
                            <TableHead>{locale === 'es-MX' ? 'Mín' : 'Min'}</TableHead>
                            <TableHead>{locale === 'es-MX' ? 'Máx' : 'Max'}</TableHead>
                            <TableHead>{locale === 'es-MX' ? 'Pago' : 'Payout'}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {editingComponent.tiers.map((tier, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{tier.label || `Tier ${idx + 1}`}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="w-20 h-8"
                                  value={tier.min}
                                  onChange={(e) => {
                                    const newTiers = [...editingComponent.tiers!];
                                    newTiers[idx] = { ...tier, min: Number(e.target.value) };
                                    setEditingComponent({ ...editingComponent, tiers: newTiers });
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="w-20 h-8"
                                  value={tier.max === Infinity ? '' : tier.max}
                                  placeholder="∞"
                                  onChange={(e) => {
                                    const newTiers = [...editingComponent.tiers!];
                                    newTiers[idx] = { ...tier, max: e.target.value === '' ? Infinity : Number(e.target.value) };
                                    setEditingComponent({ ...editingComponent, tiers: newTiers });
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="w-24 h-8"
                                  value={tier.payout}
                                  onChange={(e) => {
                                    const newTiers = [...editingComponent.tiers!];
                                    newTiers[idx] = { ...tier, payout: Number(e.target.value) };
                                    setEditingComponent({ ...editingComponent, tiers: newTiers });
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Matrix Lookup Details */}
                {editingComponent.type === 'matrix_lookup' && editingComponent.matrix && (
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">
                      {locale === 'es-MX' ? 'Matriz de Pagos' : 'Payout Matrix'}
                    </Label>
                    <div className="grid gap-2 md:grid-cols-2 text-sm">
                      <div>
                        <span className="text-slate-400">{locale === 'es-MX' ? 'Filas' : 'Rows'}:</span>{' '}
                        {editingComponent.matrix.rowLabel} ({editingComponent.matrix.rowMetric})
                      </div>
                      <div>
                        <span className="text-slate-400">{locale === 'es-MX' ? 'Columnas' : 'Columns'}:</span>{' '}
                        {editingComponent.matrix.columnLabel} ({editingComponent.matrix.columnMetric})
                      </div>
                    </div>
                    <div className="border rounded-lg overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="bg-slate-100 dark:bg-slate-800"></TableHead>
                            {editingComponent.matrix.columnRanges.map((col, idx) => (
                              <TableHead key={idx} className="text-center bg-slate-100 dark:bg-slate-800">
                                {col.label}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {editingComponent.matrix.rowRanges.map((row, rowIdx) => (
                            <TableRow key={rowIdx}>
                              <TableCell className="font-medium bg-slate-800/50">
                                {row.label}
                              </TableCell>
                              {editingComponent.matrix!.values[rowIdx]?.map((val, colIdx) => (
                                <TableCell key={colIdx} className="text-center">
                                  <Input
                                    type="number"
                                    className="w-20 h-8 text-center"
                                    value={val}
                                    onChange={(e) => {
                                      const newValues = editingComponent.matrix!.values.map((r) => [...r]);
                                      newValues[rowIdx][colIdx] = Number(e.target.value);
                                      setEditingComponent({
                                        ...editingComponent,
                                        matrix: { ...editingComponent.matrix!, values: newValues },
                                      });
                                    }}
                                  />
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Percentage Details */}
                {editingComponent.type === 'percentage' && editingComponent.percentage && (
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">
                      {locale === 'es-MX' ? 'Configuración de Porcentaje' : 'Percentage Configuration'}
                    </Label>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>{locale === 'es-MX' ? 'Tasa (%)' : 'Rate (%)'}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={(editingComponent.percentage.rate * 100).toFixed(2)}
                          onChange={(e) =>
                            setEditingComponent({
                              ...editingComponent,
                              percentage: {
                                ...editingComponent.percentage!,
                                rate: Number(e.target.value) / 100,
                              },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{locale === 'es-MX' ? 'Aplicado a' : 'Applied To'}</Label>
                        <Input
                          value={editingComponent.percentage.appliedTo}
                          onChange={(e) =>
                            setEditingComponent({
                              ...editingComponent,
                              percentage: {
                                ...editingComponent.percentage!,
                                appliedTo: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Conditional Percentage Details */}
                {editingComponent.type === 'conditional_percentage' && editingComponent.conditional && (
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">
                      {locale === 'es-MX' ? 'Porcentaje Condicional' : 'Conditional Percentage'}
                    </Label>
                    <div className="grid gap-4 md:grid-cols-2 text-sm">
                      <div>
                        <span className="text-slate-400">{locale === 'es-MX' ? 'Aplicado a' : 'Applied To'}:</span>{' '}
                        {editingComponent.conditional.appliedTo}
                      </div>
                      <div>
                        <span className="text-slate-400">{locale === 'es-MX' ? 'Condición basada en' : 'Condition based on'}:</span>{' '}
                        {editingComponent.conditional.conditionMetric}
                      </div>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{locale === 'es-MX' ? 'Condición' : 'Condition'}</TableHead>
                            <TableHead>{locale === 'es-MX' ? 'Umbral' : 'Threshold'}</TableHead>
                            <TableHead>{locale === 'es-MX' ? 'Tasa (%)' : 'Rate (%)'}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {editingComponent.conditional.conditions.map((cond, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{cond.label || `${cond.operator} ${cond.threshold}`}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="w-20 h-8"
                                  value={cond.threshold}
                                  onChange={(e) => {
                                    const newConds = [...editingComponent.conditional!.conditions];
                                    newConds[idx] = { ...cond, threshold: Number(e.target.value) };
                                    setEditingComponent({
                                      ...editingComponent,
                                      conditional: { ...editingComponent.conditional!, conditions: newConds },
                                    });
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  className="w-20 h-8"
                                  value={(cond.rate * 100).toFixed(2)}
                                  onChange={(e) => {
                                    const newConds = [...editingComponent.conditional!.conditions];
                                    newConds[idx] = { ...cond, rate: Number(e.target.value) / 100 };
                                    setEditingComponent({
                                      ...editingComponent,
                                      conditional: { ...editingComponent.conditional!, conditions: newConds },
                                    });
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* No Details Available Message */}
                {!editingComponent.tiers &&
                  !editingComponent.matrix &&
                  !editingComponent.percentage &&
                  !editingComponent.conditional && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        <AlertTriangle className="inline h-4 w-4 mr-2" />
                        {locale === 'es-MX'
                          ? 'No se extrajeron detalles de cálculo. Los valores predeterminados se usarán al importar.'
                          : 'No calculation details were extracted. Default values will be used when importing.'}
                      </p>
                    </div>
                  )}

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setEditingComponent(null)}>
                    {t.cancel}
                  </Button>
                  <Button onClick={() => handleUpdateComponent(editingComponent)}>
                    <Save className="h-4 w-4 mr-2" />
                    {t.saveChanges}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

export default function PlanImportPage() {
  return (
    <RequireRole roles={['vl_admin', 'admin']}>
      <PlanImportPageInner />
    </RequireRole>
  );
}
