'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { isCCAdmin } from '@/types/auth';
import { useAdminLocale } from '@/hooks/useAdminLocale';
import { savePlan } from '@/lib/compensation/plan-storage';
import { parseFile } from '@/lib/import-pipeline/file-parser';
import {
  interpretPlanDocument,
  isAIInterpreterAvailable,
  type PlanInterpretation,
} from '@/lib/compensation/plan-interpreter';
import type { CompensationPlanConfig, PlanComponent } from '@/types/compensation-plan';
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
  Brain,
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Bilingual labels
const labels = {
  'en-US': {
    title: 'Plan Import',
    subtitle: 'Import and interpret compensation plan structure',
    uploadTitle: 'Upload Plan File',
    uploadDesc: 'Drag and drop or click to upload CSV, Excel, JSON, TSV, or PowerPoint files',
    supportedFormats: 'Supported formats: CSV, XLSX, XLS, JSON, TSV, PPTX',
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
    planName: 'Plan Name',
    planDescription: 'Plan Description',
    effectiveDate: 'Effective Date',
    eligibleRoles: 'Eligible Roles',
    noComponents: 'No components detected',
    accessDenied: 'Access Denied',
    accessDeniedDesc: 'You must be a CC Admin to access this page.',
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
    uploadDesc: 'Arrastre y suelte o haga clic para subir archivos CSV, Excel, JSON, TSV o PowerPoint',
    supportedFormats: 'Formatos soportados: CSV, XLSX, XLS, JSON, TSV, PPTX',
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
    planName: 'Nombre del Plan',
    planDescription: 'Descripción del Plan',
    effectiveDate: 'Fecha de Vigencia',
    eligibleRoles: 'Roles Elegibles',
    noComponents: 'No se detectaron componentes',
    accessDenied: 'Acceso Denegado',
    accessDeniedDesc: 'Debe ser un CC Admin para acceder a esta página.',
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
  planConfig?: CompensationPlanConfig;
  rawApiResponse?: string;
}

export default function PlanImportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parsedPlan, setParsedPlan] = useState<ParsedPlan | null>(null);
  const [editingComponent, setEditingComponent] = useState<DetectedComponent | null>(null);
  const [importResult, setImportResult] = useState<{ success: boolean; planId?: string; error?: string } | null>(null);

  // Plan metadata
  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [eligibleRoles, _setEligibleRoles] = useState<string[]>(['sales_rep']);

  // AI configuration
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const aiAvailable = isAIInterpreterAvailable();

  // CC Admin always sees English, tenant users see tenant locale
  const { locale } = useAdminLocale();
  const t = labels[locale];

  // Check CC Admin access
  const hasAccess = user && isCCAdmin(user);

  // File drop handlers
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
      processFile(files[0]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, []);

  // Process uploaded file
  const processFile = async (file: File) => {
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
      console.log('Content length:', documentContent.length, 'chars');
      console.log('Content preview (first 2000 chars):');
      console.log(documentContent.substring(0, 2000));
      console.log('...');
      console.log('==============================================\n');

      // Progress: Starting interpretation
      setAnalysisProgress(40);

      // Use AI-powered interpretation (with heuristic fallback)
      const result = await interpretPlanDocument(
        documentContent,
        currentTenant?.id || 'default',
        user?.id || 'system',
        locale
      );

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
      const components: DetectedComponent[] = interpretation.components.map((comp) => {
        const calcMethod = comp.calculationMethod as unknown as Record<string, unknown>;
        const componentType =
          comp.type === 'tiered_lookup'
            ? 'tier_lookup'
            : comp.type === 'flat_percentage'
              ? 'percentage'
              : (comp.type as PlanComponent['componentType']);

        const detected: DetectedComponent = {
          id: comp.id,
          name: comp.name,
          nameEs: comp.nameEs,
          type: componentType,
          metricSource:
            'metric' in calcMethod
              ? String(calcMethod.metric)
              : 'rowAxis' in calcMethod
                ? String((calcMethod.rowAxis as Record<string, unknown>)?.metric || 'metric')
                : 'metric',
          measurementLevel: 'individual',
          confidence: comp.confidence,
          reasoning: comp.reasoning,
          config: {
            componentType,
            measurementLevel: 'individual',
          },
        };

        // Extract detailed calculation data based on type
        if (comp.type === 'tiered_lookup' && 'tiers' in calcMethod) {
          detected.tiers = (calcMethod.tiers as Array<Record<string, unknown>>).map((t) => ({
            min: Number(t.min) || 0,
            max: t.max === 'Infinity' || t.max === Infinity ? Infinity : Number(t.max) || 100,
            label: String(t.label || ''),
            payout: Number(t.payout) || 0,
          }));
        }

        if (comp.type === 'matrix_lookup' && 'rowAxis' in calcMethod) {
          const rowAxis = calcMethod.rowAxis as Record<string, unknown>;
          const columnAxis = calcMethod.columnAxis as Record<string, unknown>;
          detected.matrix = {
            rowMetric: String(rowAxis.metric || ''),
            rowLabel: String(rowAxis.label || ''),
            rowRanges: ((rowAxis.ranges || []) as Array<Record<string, unknown>>).map((r) => ({
              min: Number(r.min) || 0,
              max: r.max === 'Infinity' || r.max === Infinity ? Infinity : Number(r.max) || 100,
              label: String(r.label || ''),
            })),
            columnMetric: String(columnAxis?.metric || ''),
            columnLabel: String(columnAxis?.label || ''),
            columnRanges: ((columnAxis?.ranges || []) as Array<Record<string, unknown>>).map((r) => ({
              min: Number(r.min) || 0,
              max: r.max === 'Infinity' || r.max === Infinity ? Infinity : Number(r.max) || 100,
              label: String(r.label || ''),
            })),
            values: (calcMethod.values as number[][]) || [],
          };
        }

        if ((comp.type === 'percentage' || comp.type === 'flat_percentage') && 'rate' in calcMethod) {
          detected.percentage = {
            rate: Number(calcMethod.rate) || 0,
            appliedTo: String(calcMethod.metric || ''),
          };
        }

        if (comp.type === 'conditional_percentage' && 'conditions' in calcMethod) {
          detected.conditional = {
            conditions: ((calcMethod.conditions || []) as Array<Record<string, unknown>>).map((c) => ({
              threshold: Number(c.threshold) || 0,
              operator: String(c.operator || '>='),
              rate: Number(c.rate) || 0,
              label: String(c.label || ''),
            })),
            appliedTo: String(calcMethod.metric || ''),
            conditionMetric: String(calcMethod.conditionMetric || ''),
          };
        }

        return detected;
      });

      const parsed: ParsedPlan = {
        name: interpretation.planName,
        nameEs: interpretation.planNameEs,
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
        planConfig: result.planConfig,
        rawApiResponse: interpretation.rawApiResponse,
      };

      setAnalysisProgress(100);
      setParsedPlan(parsed);
      setPlanName(parsed.name);
      setPlanDescription(parsed.description);
    } catch (error) {
      console.error('Error processing file:', error);
      setImportResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };


  // Update component
  const handleUpdateComponent = (updated: DetectedComponent) => {
    if (!parsedPlan) return;

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
    if (!parsedPlan || !currentTenant) return;

    setIsImporting(true);

    try {
      const now = new Date().toISOString();
      let planConfig: CompensationPlanConfig;

      // Use the pre-built plan config from AI interpretation if available
      if (parsedPlan.planConfig) {
        planConfig = {
          ...parsedPlan.planConfig,
          name: planName,
          description: planDescription,
          effectiveDate: new Date(effectiveDate).toISOString(),
          tenantId: currentTenant.id,
          createdBy: user?.name || 'system',
          updatedBy: user?.name || 'system',
          createdAt: now,
          updatedAt: now,
        };
      } else {
        // Fallback: Build plan configuration from detected components
        planConfig = {
          id: `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          tenantId: currentTenant.id,
          name: planName,
          description: planDescription,
          planType: 'additive_lookup',
          status: 'draft',
          effectiveDate: new Date(effectiveDate).toISOString(),
          endDate: null,
          eligibleRoles,
          version: 1,
          previousVersionId: null,
          createdBy: user?.name || 'system',
          createdAt: now,
          updatedBy: user?.name || 'system',
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
                  ...(c.type === 'tier_lookup' && {
                    tierConfig: {
                      metric: c.metricSource,
                      metricLabel: c.metricSource,
                      tiers: [
                        { min: 0, max: 79.99, label: '< 80%', value: 0 },
                        { min: 80, max: 99.99, label: '80-100%', value: 500 },
                        { min: 100, max: Infinity, label: '100%+', value: 1000 },
                      ],
                      currency: parsedPlan.currency || 'USD',
                    },
                  }),
                  ...(c.type === 'percentage' && {
                    percentageConfig: {
                      rate: 0.05,
                      appliedTo: c.metricSource,
                      appliedToLabel: c.metricSource,
                    },
                  }),
                  ...(c.type === 'matrix_lookup' && {
                    matrixConfig: {
                      rowMetric: c.metricSource,
                      rowMetricLabel: c.metricSource,
                      rowBands: [
                        { min: 0, max: 79.99, label: '< 80%' },
                        { min: 80, max: 99.99, label: '80-100%' },
                        { min: 100, max: Infinity, label: '100%+' },
                      ],
                      columnMetric: 'volume',
                      columnMetricLabel: 'Volume',
                      columnBands: [
                        { min: 0, max: 99999, label: '< $100K' },
                        { min: 100000, max: Infinity, label: '$100K+' },
                      ],
                      values: [
                        [0, 0],
                        [500, 750],
                        [1000, 1500],
                      ],
                      currency: parsedPlan.currency || 'USD',
                    },
                  }),
                })),
              },
            ],
          },
        };
      }

      // Save the plan
      savePlan(planConfig);

      setImportResult({ success: true, planId: planConfig.id });
    } catch (error) {
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

      {/* Import Success */}
      {importResult?.success && (
        <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20">
          <CardContent className="flex items-center gap-4 py-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div className="flex-1">
              <p className="font-medium text-emerald-900 dark:text-emerald-100">{t.importSuccess}</p>
              <p className="text-sm text-emerald-700 dark:text-emerald-300">Plan ID: {importResult.planId}</p>
            </div>
            <Button onClick={() => router.push('/admin/launch')}>
              {t.back}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Import Error */}
      {importResult?.success === false && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
          <CardContent className="flex items-center gap-4 py-4">
            <XCircle className="h-8 w-8 text-red-500" />
            <div className="flex-1">
              <p className="font-medium text-red-900 dark:text-red-100">{t.importError}</p>
              <p className="text-sm text-red-700 dark:text-red-300">{importResult.error}</p>
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
                accept=".csv,.xlsx,.xls,.json,.tsv,.pptx"
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
                <p className="text-sm text-slate-500 mb-4">{t.aiAnalyzingDesc}</p>
              </>
            ) : (
              <>
                <Cpu className="h-12 w-12 text-blue-500 animate-pulse mb-4" />
                <p className="text-lg font-medium mb-2">{t.heuristicAnalyzing}</p>
                <p className="text-sm text-slate-500 mb-4">{t.heuristicAnalyzingDesc}</p>
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
                      {' | '}Format: {parsedPlan.detectedFormat}
                      {' | '}{parsedPlan.rawData.length} rows
                      {parsedPlan.currency && ` | ${t.currency}: ${parsedPlan.currency}`}
                    </CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-500">{t.overallConfidence}</div>
                  <Badge className={getConfidenceColor(parsedPlan.overallConfidence)}>
                    {parsedPlan.overallConfidence}%
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-sm">
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
                    className="text-slate-500"
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
              <CardTitle>{t.planName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="planName">{t.planName}</Label>
                  <Input
                    id="planName"
                    value={planName}
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
                      {parsedPlan.workedExamples.map((ex, idx) => (
                        <div key={idx} className="bg-emerald-50 dark:bg-emerald-900/20 rounded p-2 text-sm">
                          <span className="font-medium">{ex.employeeType}:</span>{' '}
                          <span className="text-emerald-700 dark:text-emerald-300">
                            ${ex.expectedTotal.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
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
                <p className="text-center text-slate-500 py-8">{t.noComponents}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{locale === 'es-MX' ? 'Componente' : 'Component'}</TableHead>
                      <TableHead>{t.componentType}</TableHead>
                      <TableHead>{t.metricSource}</TableHead>
                      <TableHead>{t.confidence}</TableHead>
                      <TableHead>{t.reasoning}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedPlan.components.map((component) => (
                      <TableRow key={component.id}>
                        <TableCell className="font-medium">{component.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{component.type}</Badge>
                        </TableCell>
                        <TableCell>{component.metricSource}</TableCell>
                        <TableCell>
                          <Badge className={getConfidenceColor(component.confidence)}>
                            {component.confidence}%
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="text-sm text-slate-500 truncate" title={component.reasoning}>
                            {component.reasoning}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingComponent(component)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => setParsedPlan(null)}>
              {locale === 'es-MX' ? 'Subir Otro Archivo' : 'Upload Different File'}
            </Button>
            <Button
              onClick={handleImport}
              disabled={isImporting || parsedPlan.components.length === 0}
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
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
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
                        <span className="text-slate-500">{locale === 'es-MX' ? 'Filas' : 'Rows'}:</span>{' '}
                        {editingComponent.matrix.rowLabel} ({editingComponent.matrix.rowMetric})
                      </div>
                      <div>
                        <span className="text-slate-500">{locale === 'es-MX' ? 'Columnas' : 'Columns'}:</span>{' '}
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
                              <TableCell className="font-medium bg-slate-50 dark:bg-slate-800/50">
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
                        <span className="text-slate-500">{locale === 'es-MX' ? 'Aplicado a' : 'Applied To'}:</span>{' '}
                        {editingComponent.conditional.appliedTo}
                      </div>
                      <div>
                        <span className="text-slate-500">{locale === 'es-MX' ? 'Condición basada en' : 'Condition based on'}:</span>{' '}
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
