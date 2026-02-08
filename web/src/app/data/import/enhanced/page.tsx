'use client';

/**
 * Data Package Import - Phase 1 Redesign
 *
 * AI-powered multi-sheet workbook import with:
 * - Sheet-by-sheet navigation (Next advances to next sheet, not Validate)
 * - Plan-derived target fields from tenant's compensation plan
 * - AI pre-selection of mappings (>70% confidence auto-selected)
 * - Column header translation (Spanish ↔ English)
 * - Sheet-to-component banner showing matched component
 * - Required vs optional field indicators
 * - Custom field creation option
 * - Formula value resolution (not formula text)
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  FileSpreadsheet,
  GitBranch,
  MapPin,
  CheckCircle,
  ClipboardCheck,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Sparkles,
  Users,
  Database,
  Map,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Link2,
  AlertCircle,
  Info,
  Languages,
  Plus,
  Star,
} from 'lucide-react';
import {
  parseFile,
  getExcelWorksheets,
  isExcelFile,
  type WorksheetInfo,
} from '@/lib/import-pipeline/file-parser';
import * as XLSX from 'xlsx';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { getPlans } from '@/lib/compensation/plan-storage';
import type { CompensationPlanConfig, PlanComponent } from '@/types/compensation-plan';
import { isAdditiveLookupConfig } from '@/types/compensation-plan';

// Step definitions
type Step = 'upload' | 'analyze' | 'map' | 'validate' | 'approve';

const STEPS: Step[] = ['upload', 'analyze', 'map', 'validate', 'approve'];

const STEP_CONFIG = {
  upload: {
    icon: Upload,
    title: { en: 'Upload Package', es: 'Cargar Paquete' },
    description: { en: 'Upload your data workbook', es: 'Cargue su libro de datos' },
  },
  analyze: {
    icon: GitBranch,
    title: { en: 'Sheet Analysis', es: 'Análisis de Hojas' },
    description: { en: 'Review detected structure', es: 'Revisar estructura detectada' },
  },
  map: {
    icon: MapPin,
    title: { en: 'Field Mapping', es: 'Mapeo de Campos' },
    description: { en: 'Map columns to fields', es: 'Mapear columnas a campos' },
  },
  validate: {
    icon: Calculator,
    title: { en: 'Validate & Preview', es: 'Validar y Previsualizar' },
    description: { en: 'Review calculations', es: 'Revisar cálculos' },
  },
  approve: {
    icon: ClipboardCheck,
    title: { en: 'Approve Import', es: 'Aprobar Importación' },
    description: { en: 'Confirm and submit', es: 'Confirmar y enviar' },
  },
};

// Sheet classification types
type SheetClassification = 'roster' | 'component_data' | 'reference' | 'regional_partition' | 'period_summary' | 'unrelated';

interface AnalyzedSheet {
  name: string;
  classification: SheetClassification;
  classificationConfidence: number;
  classificationReasoning: string;
  matchedComponent: string | null;
  matchedComponentConfidence: number;
  detectedPrimaryKey: string | null;
  detectedDateColumn: string | null;
  detectedAmountColumns: string[];
  suggestedFieldMappings: Array<{
    sourceColumn: string;
    targetField: string;
    confidence: number;
  }>;
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];
}

interface SheetRelationship {
  fromSheet: string;
  toSheet: string;
  relationshipType: 'references' | 'partitions' | 'aggregates' | 'links_via';
  sharedKeys: string[];
  confidence: number;
  description: string;
}

interface WorkbookAnalysis {
  sheets: AnalyzedSheet[];
  relationships: SheetRelationship[];
  sheetGroups: Array<{
    groupType: string;
    sheets: string[];
    description: string;
  }>;
  rosterDetected: {
    found: boolean;
    sheetName: string | null;
    employeeIdColumn: string | null;
    storeAssignmentColumn: string | null;
    canCreateUsers: boolean;
  };
  periodDetected: {
    found: boolean;
    dateColumn: string;
    dateRange: { start: string | null; end: string | null };
    periodType: string;
  };
  gaps: Array<{
    type: string;
    description: string;
    severity: 'error' | 'warning' | 'info';
  }>;
  extras: Array<{
    sheetName: string;
    description: string;
    recommendation: string;
  }>;
  overallConfidence: number;
  summary: string;
}

// Field mapping for each sheet
interface SheetFieldMapping {
  sheetName: string;
  mappings: Array<{
    sourceColumn: string;
    targetField: string | null;
    confidence: number;
    confirmed: boolean;
    isRequired: boolean;
  }>;
  isComplete: boolean;
}

// Target field definition (derived from plan)
interface TargetField {
  id: string;
  label: string;
  labelEs: string;
  isRequired: boolean;
  category: 'identifier' | 'metric' | 'dimension' | 'date' | 'amount' | 'custom';
  componentId?: string;
  componentName?: string;
}

// Spanish to English column name translations
const COLUMN_TRANSLATIONS: Record<string, string> = {
  // Identifiers
  'num_empleado': 'Employee ID',
  'numero_empleado': 'Employee ID',
  'id_empleado': 'Employee ID',
  'empleado': 'Employee',
  'no_tienda': 'Store ID',
  'tienda': 'Store',
  'id_tienda': 'Store ID',
  'nombre_tienda': 'Store Name',

  // Dates
  'fecha': 'Date',
  'fecha_corte': 'Cut-off Date',
  'periodo': 'Period',
  'mes': 'Month',
  'año': 'Year',

  // Metrics
  'venta': 'Sales',
  'ventas': 'Sales',
  'venta_optica': 'Optical Sales',
  'venta_tienda': 'Store Sales',
  'cumplimiento': 'Attainment',
  'meta': 'Goal',
  'objetivo': 'Target',
  'cobranza': 'Collections',
  'clientes_nuevos': 'New Customers',
  'seguros': 'Insurance',
  'servicios': 'Services',
  'garantia': 'Warranty',

  // Amounts
  'monto': 'Amount',
  'importe': 'Amount',
  'total': 'Total',
  'subtotal': 'Subtotal',
  'comision': 'Commission',
  'incentivo': 'Incentive',
  'bono': 'Bonus',

  // Status
  'estado': 'Status',
  'activo': 'Active',
  'certificado': 'Certified',
};

// Classification icon and color mapping
const CLASSIFICATION_CONFIG: Record<SheetClassification, { icon: typeof Users; color: string; label: string; labelEs: string }> = {
  roster: { icon: Users, color: 'bg-blue-100 border-blue-300 text-blue-800', label: 'Employee Roster', labelEs: 'Plantilla de Empleados' },
  component_data: { icon: Database, color: 'bg-green-100 border-green-300 text-green-800', label: 'Component Data', labelEs: 'Datos de Componente' },
  reference: { icon: Map, color: 'bg-purple-100 border-purple-300 text-purple-800', label: 'Reference Data', labelEs: 'Datos de Referencia' },
  regional_partition: { icon: GitBranch, color: 'bg-orange-100 border-orange-300 text-orange-800', label: 'Regional Data', labelEs: 'Datos Regionales' },
  period_summary: { icon: Calculator, color: 'bg-cyan-100 border-cyan-300 text-cyan-800', label: 'Period Summary', labelEs: 'Resumen del Período' },
  unrelated: { icon: AlertCircle, color: 'bg-gray-100 border-gray-300 text-gray-600', label: 'Unrelated', labelEs: 'No Relacionado' },
};

// Helper: Translate column name
function translateColumn(column: string): string | null {
  const normalized = column.toLowerCase().replace(/[\s_-]+/g, '_').trim();
  return COLUMN_TRANSLATIONS[normalized] || null;
}

// Helper: Extract target fields from plan components
function extractTargetFieldsFromPlan(plan: CompensationPlanConfig | null): TargetField[] {
  const baseFields: TargetField[] = [
    // Always-required identifier fields
    { id: 'employeeId', label: 'Employee ID', labelEs: 'ID Empleado', isRequired: true, category: 'identifier' },
    { id: 'storeId', label: 'Store ID', labelEs: 'ID Tienda', isRequired: false, category: 'identifier' },
    { id: 'date', label: 'Date', labelEs: 'Fecha', isRequired: true, category: 'date' },
    { id: 'period', label: 'Period', labelEs: 'Período', isRequired: false, category: 'date' },
  ];

  // Check if plan has additive lookup config with variants
  if (!plan?.configuration || !isAdditiveLookupConfig(plan.configuration)) {
    // Return generic fields if no plan or not additive lookup
    return [
      ...baseFields,
      { id: 'amount', label: 'Amount', labelEs: 'Monto', isRequired: true, category: 'amount' },
      { id: 'quantity', label: 'Quantity', labelEs: 'Cantidad', isRequired: false, category: 'metric' },
      { id: 'attainment', label: 'Attainment %', labelEs: '% Cumplimiento', isRequired: false, category: 'metric' },
      { id: 'goal', label: 'Goal', labelEs: 'Meta', isRequired: false, category: 'metric' },
    ];
  }

  // Extract component-specific fields from the plan
  const componentFields: TargetField[] = [];
  const firstVariant = plan.configuration.variants[0];

  if (firstVariant?.components) {
    firstVariant.components.forEach((comp: PlanComponent) => {
      // Extract metrics from matrix configs
      if (comp.matrixConfig) {
        componentFields.push({
          id: comp.matrixConfig.rowMetric,
          label: comp.matrixConfig.rowMetricLabel,
          labelEs: comp.matrixConfig.rowMetricLabel,
          isRequired: true,
          category: 'metric',
          componentId: comp.id,
          componentName: comp.name,
        });
        componentFields.push({
          id: comp.matrixConfig.columnMetric,
          label: comp.matrixConfig.columnMetricLabel,
          labelEs: comp.matrixConfig.columnMetricLabel,
          isRequired: true,
          category: 'amount',
          componentId: comp.id,
          componentName: comp.name,
        });
      }

      // Extract metrics from tier configs
      if (comp.tierConfig) {
        componentFields.push({
          id: comp.tierConfig.metric,
          label: comp.tierConfig.metricLabel,
          labelEs: comp.tierConfig.metricLabel,
          isRequired: true,
          category: 'metric',
          componentId: comp.id,
          componentName: comp.name,
        });
      }

      // Extract metrics from percentage configs
      if (comp.percentageConfig) {
        componentFields.push({
          id: comp.percentageConfig.appliedTo,
          label: comp.percentageConfig.appliedToLabel || comp.percentageConfig.appliedTo,
          labelEs: comp.percentageConfig.appliedToLabel || comp.percentageConfig.appliedTo,
          isRequired: true,
          category: 'amount',
          componentId: comp.id,
          componentName: comp.name,
        });
      }

      // Extract metrics from conditional configs
      if (comp.conditionalConfig) {
        comp.conditionalConfig.conditions.forEach(cond => {
          componentFields.push({
            id: cond.metric,
            label: cond.metricLabel,
            labelEs: cond.metricLabel,
            isRequired: true,
            category: 'metric',
            componentId: comp.id,
            componentName: comp.name,
          });
        });
        componentFields.push({
          id: comp.conditionalConfig.appliedTo,
          label: comp.conditionalConfig.appliedToLabel,
          labelEs: comp.conditionalConfig.appliedToLabel,
          isRequired: true,
          category: 'amount',
          componentId: comp.id,
          componentName: comp.name,
        });
      }
    });
  }

  // Deduplicate by id
  const seen = new Set<string>();
  const uniqueFields = componentFields.filter(f => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  return [...baseFields, ...uniqueFields];
}

export default function DataPackageImportPage() {
  const { locale } = useLocale();
  const { currentTenant } = useTenant();
  useAuth(); // For authentication check
  const isSpanish = locale === 'es-MX';

  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [, setSelectedFile] = useState<File | null>(null);
  const [, setWorksheets] = useState<WorksheetInfo[]>([]);

  // Analysis state
  const [analysis, setAnalysis] = useState<WorkbookAnalysis | null>(null);
  const [analysisConfidence, setAnalysisConfidence] = useState(0);

  // Mapping state
  const [fieldMappings, setFieldMappings] = useState<SheetFieldMapping[]>([]);
  const [currentMappingSheetIndex, setCurrentMappingSheetIndex] = useState(0);
  const [previewRowIndex, setPreviewRowIndex] = useState(0);
  const [showTranslations, setShowTranslations] = useState(true);
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [newCustomField, setNewCustomField] = useState('');

  // Plan state
  const [activePlan, setActivePlan] = useState<CompensationPlanConfig | null>(null);
  const [targetFields, setTargetFields] = useState<TargetField[]>([]);

  // Validation state
  const [validationComplete, setValidationComplete] = useState(false);

  const tenantId = currentTenant?.id || 'retailcgmx';
  const currency = currentTenant?.currency || 'MXN';

  // Load tenant's active plan on mount
  useEffect(() => {
    const plans = getPlans(tenantId);
    const active = plans.find(p => p.status === 'active');
    setActivePlan(active || null);
    setTargetFields(extractTargetFieldsFromPlan(active || null));
  }, [tenantId]);

  // Get mappable sheets (exclude unrelated)
  const mappableSheets = useMemo(() => {
    if (!analysis) return [];
    return analysis.sheets.filter(s => s.classification !== 'unrelated');
  }, [analysis]);

  // Current sheet being mapped
  const currentMappingSheet = useMemo(() => {
    return mappableSheets[currentMappingSheetIndex] || null;
  }, [mappableSheets, currentMappingSheetIndex]);

  // Current sheet's field mappings
  const currentSheetMapping = useMemo(() => {
    if (!currentMappingSheet) return null;
    return fieldMappings.find(m => m.sheetName === currentMappingSheet.name) || null;
  }, [fieldMappings, currentMappingSheet]);

  // Parse all sheets from the workbook with formula resolution
  const parseAllSheets = useCallback(async (file: File): Promise<Array<{
    name: string;
    headers: string[];
    rowCount: number;
    sampleRows: Record<string, unknown>[];
  }>> => {
    const arrayBuffer = await file.arrayBuffer();
    // IMPORTANT: cellFormula: false ensures we get computed values, not formula text
    const workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      cellFormula: false,  // Don't parse formulas as strings
      cellNF: false,       // Don't apply number formatting
      cellStyles: false,   // Don't extract styles
    });

    return workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      // raw: true gets the computed values; defval ensures empty cells get null
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: null,
        raw: true, // Get computed values, not formatted strings
      });

      const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

      return {
        name,
        headers,
        rowCount: jsonData.length,
        sampleRows: jsonData.slice(0, 5),
      };
    });
  }, []);

  // Analyze the workbook with AI
  const analyzeWorkbook = useCallback(async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Get worksheet info
      const sheets = await parseAllSheets(file);
      console.log('Parsed sheets for analysis:', sheets.length);

      // Get plan components for AI context
      let planComponents = null;
      if (activePlan?.configuration && isAdditiveLookupConfig(activePlan.configuration)) {
        planComponents = activePlan.configuration.variants?.[0]?.components?.map(c => ({
          id: c.id,
          name: c.name,
          type: c.componentType,
        })) || null;
      }

      // Call the AI analysis endpoint
      const response = await fetch('/api/analyze-workbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheets,
          tenantId,
          planComponents,
          expectedFields: null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.analysis) {
        // Merge sample data into analyzed sheets
        const analyzedSheets = data.analysis.sheets.map((s: AnalyzedSheet) => {
          const sourceSheet = sheets.find(ss => ss.name === s.name);
          return {
            ...s,
            headers: sourceSheet?.headers || [],
            rowCount: sourceSheet?.rowCount || 0,
            sampleRows: sourceSheet?.sampleRows || [],
          };
        });

        setAnalysis({
          ...data.analysis,
          sheets: analyzedSheets,
        });
        setAnalysisConfidence(data.confidence || 0);

        // Initialize field mappings from AI suggestions with auto-selection for high confidence
        const mappings: SheetFieldMapping[] = analyzedSheets
          .filter((sheet: AnalyzedSheet) => sheet.classification !== 'unrelated')
          .map((sheet: AnalyzedSheet) => {
            const sheetMappings = sheet.headers.map(header => {
              const suggestion = sheet.suggestedFieldMappings?.find(
                m => m.sourceColumn === header
              );
              const confidence = suggestion?.confidence || 0;
              // Auto-select if confidence >= 70%
              const autoSelected = confidence >= 70;

              // Check if this is a required field
              const targetField = autoSelected ? suggestion?.targetField : null;
              const isRequired = targetFields.find(f => f.id === targetField)?.isRequired || false;

              return {
                sourceColumn: header,
                targetField: autoSelected ? (suggestion?.targetField || null) : null,
                confidence,
                confirmed: autoSelected,
                isRequired,
              };
            });

            // Check if required fields are mapped
            const hasRequiredMappings = sheetMappings.some(m =>
              m.targetField && targetFields.find(f => f.id === m.targetField)?.isRequired
            );

            return {
              sheetName: sheet.name,
              mappings: sheetMappings,
              isComplete: hasRequiredMappings,
            };
          });

        setFieldMappings(mappings);
        setCurrentMappingSheetIndex(0);
        setCurrentStep('analyze');
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (err) {
      console.error('Workbook analysis error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze workbook');
    } finally {
      setIsProcessing(false);
    }
  }, [parseAllSheets, tenantId, activePlan, targetFields]);

  // File upload handler
  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    setError(null);
    setAnalysis(null);
    setFieldMappings([]);

    if (isExcelFile(file)) {
      const sheets = await getExcelWorksheets(file);
      setWorksheets(sheets);
      // Automatically analyze multi-sheet workbooks
      await analyzeWorkbook(file);
    } else {
      // For single-file formats, parse directly
      setIsProcessing(true);
      try {
        const parsed = await parseFile(file);
        // Create a simple analysis for single files
        const simpleAnalysis: WorkbookAnalysis = {
          sheets: [{
            name: file.name,
            classification: 'component_data',
            classificationConfidence: 50,
            classificationReasoning: 'Single file import - manual classification recommended',
            matchedComponent: null,
            matchedComponentConfidence: 0,
            detectedPrimaryKey: null,
            detectedDateColumn: null,
            detectedAmountColumns: [],
            suggestedFieldMappings: [],
            headers: parsed.headers,
            rowCount: parsed.rowCount,
            sampleRows: parsed.rows.slice(0, 5),
          }],
          relationships: [],
          sheetGroups: [],
          rosterDetected: { found: false, sheetName: null, employeeIdColumn: null, storeAssignmentColumn: null, canCreateUsers: false },
          periodDetected: { found: false, dateColumn: '', dateRange: { start: null, end: null }, periodType: 'unknown' },
          gaps: [],
          extras: [],
          overallConfidence: 50,
          summary: 'Single file import',
        };
        setAnalysis(simpleAnalysis);
        setCurrentStep('analyze');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file');
      } finally {
        setIsProcessing(false);
      }
    }
  }, [analyzeWorkbook]);

  // Drop zone handler
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // Update field mapping
  const updateFieldMapping = useCallback((sheetName: string, sourceColumn: string, targetField: string | null) => {
    setFieldMappings(prev => prev.map(sheet => {
      if (sheet.sheetName !== sheetName) return sheet;

      const updatedMappings = sheet.mappings.map(m => {
        if (m.sourceColumn !== sourceColumn) return m;
        const isRequired = targetFields.find(f => f.id === targetField)?.isRequired || false;
        return { ...m, targetField, confirmed: true, isRequired };
      });

      // Check if sheet has at least one mapping
      const hasMapping = updatedMappings.some(m => m.targetField);

      return {
        ...sheet,
        mappings: updatedMappings,
        isComplete: hasMapping,
      };
    }));
  }, [targetFields]);

  // Add custom field
  const addCustomField = useCallback(() => {
    if (newCustomField.trim() && !customFields.includes(newCustomField.trim())) {
      setCustomFields(prev => [...prev, newCustomField.trim()]);
      setNewCustomField('');
    }
  }, [newCustomField, customFields]);

  // Navigation helpers
  const goToNextSheet = useCallback(() => {
    if (currentMappingSheetIndex < mappableSheets.length - 1) {
      setCurrentMappingSheetIndex(prev => prev + 1);
      setPreviewRowIndex(0);
    }
  }, [currentMappingSheetIndex, mappableSheets.length]);

  const goToPrevSheet = useCallback(() => {
    if (currentMappingSheetIndex > 0) {
      setCurrentMappingSheetIndex(prev => prev - 1);
      setPreviewRowIndex(0);
    }
  }, [currentMappingSheetIndex]);

  // Main navigation
  const goToStep = (step: Step) => {
    if (step === 'analyze' && currentStep === 'map') {
      setCurrentStep('analyze');
      return;
    }
    const currentIndex = STEPS.indexOf(currentStep);
    const targetIndex = STEPS.indexOf(step);
    if (targetIndex <= currentIndex + 1) {
      setCurrentStep(step);
    }
  };

  const goNext = () => {
    const currentIndex = STEPS.indexOf(currentStep);

    if (currentStep === 'map') {
      // Check if on last mappable sheet
      if (currentMappingSheetIndex < mappableSheets.length - 1) {
        // Go to next sheet
        goToNextSheet();
        return;
      } else {
        // All sheets mapped, go to validate
        setValidationComplete(true);
        setCurrentStep('validate');
        return;
      }
    }

    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1]);
    }
  };

  const goBack = () => {
    const currentIndex = STEPS.indexOf(currentStep);

    if (currentStep === 'map') {
      if (currentMappingSheetIndex > 0) {
        // Go to previous sheet
        goToPrevSheet();
        return;
      } else {
        // First sheet, go back to analyze
        setCurrentStep('analyze');
        return;
      }
    }

    if (currentIndex > 0) {
      if (currentStep === 'validate') {
        // Go back to last sheet in mapping
        setCurrentMappingSheetIndex(mappableSheets.length - 1);
        setCurrentStep('map');
      } else {
        setCurrentStep(STEPS[currentIndex - 1]);
      }
    }
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'upload':
        return false;
      case 'analyze':
        return !!analysis && analysis.sheets.length > 0;
      case 'map':
        // Can proceed if current sheet has at least one mapping
        return currentSheetMapping?.mappings.some(m => m.targetField) || false;
      case 'validate':
        return validationComplete;
      case 'approve':
        return true;
      default:
        return false;
    }
  };

  // Format currency value
  const formatCurrency = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(num)) return String(value);
    return new Intl.NumberFormat(isSpanish ? 'es-MX' : 'en-US', {
      style: 'currency',
      currency: currency,
    }).format(num);
  };

  // Render sheet node in the visual graph
  const renderSheetNode = (sheet: AnalyzedSheet, isSelected: boolean = false) => {
    const config = CLASSIFICATION_CONFIG[sheet.classification];
    const Icon = config.icon;

    return (
      <div
        key={sheet.name}
        className={cn(
          'p-4 border-2 rounded-lg transition-all cursor-pointer',
          config.color,
          isSelected && 'ring-2 ring-primary ring-offset-2'
        )}
        onClick={() => {
          if (sheet.classification !== 'unrelated') {
            const idx = mappableSheets.findIndex(s => s.name === sheet.name);
            if (idx >= 0) {
              setCurrentMappingSheetIndex(idx);
              setCurrentStep('map');
            }
          }
        }}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white/50 rounded-lg">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">{sheet.name}</p>
              <Badge variant="outline" className="text-xs">
                {sheet.classificationConfidence}%
              </Badge>
            </div>
            <p className="text-sm opacity-75">
              {isSpanish ? config.labelEs : config.label}
            </p>
            <p className="text-xs opacity-60 mt-1">
              {sheet.rowCount} {isSpanish ? 'filas' : 'rows'} • {sheet.headers.length} {isSpanish ? 'columnas' : 'columns'}
            </p>
            {sheet.matchedComponent && (
              <Badge variant="secondary" className="mt-2 text-xs">
                → {sheet.matchedComponent}
              </Badge>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isSpanish ? 'Importar Paquete de Datos' : 'Data Package Import'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish
              ? 'Importe libros de Excel con análisis AI de estructura y relaciones'
              : 'Import Excel workbooks with AI analysis of structure and relationships'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <Badge variant="secondary">AI-Powered</Badge>
          {activePlan && (
            <Badge variant="outline" className="ml-2">
              {activePlan.name}
            </Badge>
          )}
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between overflow-x-auto pb-2">
        {STEPS.map((step, index) => {
          const config = STEP_CONFIG[step];
          const Icon = config.icon;
          const isActive = step === currentStep;
          const isPast = STEPS.indexOf(step) < STEPS.indexOf(currentStep);
          const isClickable = isPast || (step === 'analyze' && currentStep === 'map');

          return (
            <div key={step} className="flex items-center">
              <button
                onClick={() => isClickable && goToStep(step)}
                disabled={!isClickable && !isActive}
                className={cn(
                  'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors whitespace-nowrap',
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
                  {isPast ? <CheckCircle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
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
                <div className={cn('h-0.5 w-8 mx-2', isPast ? 'bg-green-500' : 'bg-muted')} />
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
      <Card className="min-h-[500px]">
        <CardContent className="p-6">
          {/* Upload Step */}
          {currentStep === 'upload' && (
            <div className="space-y-6">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className={cn(
                  'border-2 border-dashed rounded-lg p-12 text-center transition-colors',
                  'hover:border-primary hover:bg-primary/5'
                )}
              >
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <div>
                      <p className="font-medium">
                        {isSpanish ? 'Analizando libro de trabajo...' : 'Analyzing workbook...'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish
                          ? 'AI está detectando estructura y relaciones'
                          : 'AI is detecting structure and relationships'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <FileSpreadsheet className="h-16 w-16 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-lg">
                        {isSpanish
                          ? 'Arrastre un libro de Excel aquí'
                          : 'Drop an Excel workbook here'}
                      </p>
                      <p className="text-muted-foreground">
                        {isSpanish
                          ? 'Soporta archivos .xlsx con múltiples hojas'
                          : 'Supports .xlsx files with multiple sheets'}
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      id="file-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file);
                      }}
                    />
                    <Button asChild size="lg">
                      <label htmlFor="file-input" className="cursor-pointer">
                        <Upload className="h-4 w-4 mr-2" />
                        {isSpanish ? 'Seleccionar Archivo' : 'Select File'}
                      </label>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Analyze Step - Visual Sheet Graph */}
          {currentStep === 'analyze' && analysis && (
            <div className="space-y-6">
              {/* Summary Header */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">{analysis.summary}</p>
                    <p className="text-sm text-muted-foreground">
                      {analysis.sheets.length} {isSpanish ? 'hojas analizadas' : 'sheets analyzed'} •{' '}
                      {analysis.relationships.length} {isSpanish ? 'relaciones detectadas' : 'relationships detected'}
                    </p>
                  </div>
                </div>
                <Badge variant={analysisConfidence >= 80 ? 'default' : 'secondary'}>
                  {analysisConfidence}% {isSpanish ? 'confianza' : 'confidence'}
                </Badge>
              </div>

              {/* Roster Detection Alert */}
              {analysis.rosterDetected.found && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-blue-800">
                        {isSpanish ? 'Plantilla de Empleados Detectada' : 'Employee Roster Detected'}
                      </p>
                      <p className="text-sm text-blue-700">
                        {isSpanish
                          ? `Hoja "${analysis.rosterDetected.sheetName}" contiene datos de empleados`
                          : `Sheet "${analysis.rosterDetected.sheetName}" contains employee data`}
                      </p>
                      {analysis.rosterDetected.canCreateUsers && (
                        <Button variant="outline" size="sm" className="mt-2">
                          <Users className="h-4 w-4 mr-2" />
                          {isSpanish ? 'Crear/Actualizar Usuarios' : 'Create/Update Users'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Sheet Groups */}
              <div className="space-y-4">
                {/* Component Data Sheets */}
                {analysis.sheets.filter(s => s.classification === 'component_data').length > 0 && (
                  <div>
                    <h3 className="font-medium mb-3 flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      {isSpanish ? 'Datos de Componentes del Plan' : 'Plan Component Data'}
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {analysis.sheets
                        .filter(s => s.classification === 'component_data')
                        .map(sheet => renderSheetNode(sheet))}
                    </div>
                  </div>
                )}

                {/* Roster */}
                {analysis.sheets.filter(s => s.classification === 'roster').length > 0 && (
                  <div>
                    <h3 className="font-medium mb-3 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {isSpanish ? 'Plantilla de Empleados' : 'Employee Roster'}
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {analysis.sheets
                        .filter(s => s.classification === 'roster')
                        .map(sheet => renderSheetNode(sheet))}
                    </div>
                  </div>
                )}

                {/* Reference Data */}
                {analysis.sheets.filter(s => s.classification === 'reference').length > 0 && (
                  <div>
                    <h3 className="font-medium mb-3 flex items-center gap-2">
                      <Map className="h-4 w-4" />
                      {isSpanish ? 'Datos de Referencia' : 'Reference Data'}
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {analysis.sheets
                        .filter(s => s.classification === 'reference')
                        .map(sheet => renderSheetNode(sheet))}
                    </div>
                  </div>
                )}

                {/* Unrelated */}
                {analysis.sheets.filter(s => s.classification === 'unrelated').length > 0 && (
                  <div>
                    <h3 className="font-medium mb-3 flex items-center gap-2 text-muted-foreground">
                      <AlertCircle className="h-4 w-4" />
                      {isSpanish ? 'No Relacionado' : 'Unrelated'}
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {analysis.sheets
                        .filter(s => s.classification === 'unrelated')
                        .map(sheet => renderSheetNode(sheet))}
                    </div>
                  </div>
                )}
              </div>

              {/* Relationships */}
              {analysis.relationships.length > 0 && (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    {isSpanish ? 'Relaciones Detectadas' : 'Detected Relationships'}
                  </h3>
                  <div className="space-y-2">
                    {analysis.relationships.map((rel, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline">{rel.fromSheet}</Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <Badge variant="outline">{rel.toSheet}</Badge>
                        <span className="text-muted-foreground">
                          via {rel.sharedKeys.join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gaps and Warnings */}
              {analysis.gaps.length > 0 && (
                <div className="space-y-2">
                  {analysis.gaps.map((gap, i) => (
                    <div
                      key={i}
                      className={cn(
                        'p-3 rounded-lg flex items-center gap-2',
                        gap.severity === 'error' && 'bg-red-50 text-red-700',
                        gap.severity === 'warning' && 'bg-yellow-50 text-yellow-700',
                        gap.severity === 'info' && 'bg-blue-50 text-blue-700'
                      )}
                    >
                      {gap.severity === 'error' && <AlertTriangle className="h-4 w-4" />}
                      {gap.severity === 'warning' && <AlertCircle className="h-4 w-4" />}
                      {gap.severity === 'info' && <Info className="h-4 w-4" />}
                      <span className="text-sm">{gap.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Map Step - Field Mapping with Sheet Navigation */}
          {currentStep === 'map' && analysis && currentMappingSheet && currentSheetMapping && (
            <div className="space-y-6">
              {/* Sheet Navigation Header */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-4">
                  {/* Sheet Progress */}
                  <div className="flex items-center gap-2">
                    {mappableSheets.map((sheet, idx) => (
                      <button
                        key={sheet.name}
                        onClick={() => {
                          setCurrentMappingSheetIndex(idx);
                          setPreviewRowIndex(0);
                        }}
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all',
                          idx === currentMappingSheetIndex
                            ? 'bg-primary text-primary-foreground'
                            : fieldMappings.find(m => m.sheetName === sheet.name)?.isComplete
                              ? 'bg-green-500 text-white'
                              : 'bg-muted-foreground/20 text-muted-foreground'
                        )}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>

                  {/* Current Sheet Info */}
                  <div>
                    <p className="font-medium">{currentMappingSheet.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {isSpanish ? 'Hoja' : 'Sheet'} {currentMappingSheetIndex + 1} / {mappableSheets.length}
                    </p>
                  </div>
                </div>

                {/* Translation Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTranslations(!showTranslations)}
                  className={cn(showTranslations && 'bg-primary/10')}
                >
                  <Languages className="h-4 w-4 mr-2" />
                  {isSpanish ? 'Traducciones' : 'Translations'}
                </Button>
              </div>

              {/* Component Banner (if matched) */}
              {currentMappingSheet.matchedComponent && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <Database className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800">
                      {isSpanish ? 'Componente Detectado' : 'Matched Component'}: {currentMappingSheet.matchedComponent}
                    </p>
                    <p className="text-xs text-green-700">
                      {currentMappingSheet.matchedComponentConfidence}% {isSpanish ? 'confianza' : 'confidence'}
                    </p>
                  </div>
                </div>
              )}

              {/* Data Preview with Navigation */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {isSpanish ? 'Vista Previa de Datos' : 'Data Preview'}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={previewRowIndex === 0}
                        onClick={() => setPreviewRowIndex(i => Math.max(0, i - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {isSpanish ? 'Fila' : 'Row'} {previewRowIndex + 1} / {currentMappingSheet.sampleRows.length}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={previewRowIndex >= currentMappingSheet.sampleRows.length - 1}
                        onClick={() => setPreviewRowIndex(i => Math.min(currentMappingSheet.sampleRows.length - 1, i + 1))}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          {currentMappingSheet.headers.slice(0, 8).map(header => {
                            const translation = translateColumn(header);
                            return (
                              <th key={header} className="px-3 py-2 text-left font-medium">
                                <div>
                                  {header}
                                  {showTranslations && translation && (
                                    <span className="block text-xs text-muted-foreground font-normal">
                                      {translation}
                                    </span>
                                  )}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t">
                          {currentMappingSheet.headers.slice(0, 8).map(header => {
                            const value = currentMappingSheet.sampleRows[previewRowIndex]?.[header];
                            // Format currency values
                            const isAmountField = header.toLowerCase().includes('monto') ||
                              header.toLowerCase().includes('venta') ||
                              header.toLowerCase().includes('total');
                            return (
                              <td key={header} className="px-3 py-2">
                                {isAmountField ? formatCurrency(value) : String(value ?? '')}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Field Mappings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">
                    {isSpanish ? 'Mapeo de Campos' : 'Field Mappings'}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Star className="h-3 w-3 text-amber-500" />
                    {isSpanish ? 'Requerido' : 'Required'}
                  </div>
                </div>

                <div className="grid gap-3">
                  {currentSheetMapping.mappings.map((mapping) => {
                    const translation = translateColumn(mapping.sourceColumn);
                    const targetField = targetFields.find(f => f.id === mapping.targetField);

                    return (
                      <div
                        key={mapping.sourceColumn}
                        className={cn(
                          'flex items-center gap-4 p-3 border rounded-lg',
                          mapping.confidence >= 70 && 'border-green-200 bg-green-50/50'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{mapping.sourceColumn}</p>
                            {mapping.confidence >= 70 && (
                              <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                                AI {mapping.confidence}%
                              </Badge>
                            )}
                          </div>
                          {showTranslations && translation && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Languages className="h-3 w-3" />
                              {translation}
                            </p>
                          )}
                        </div>

                        <ArrowRight className="h-4 w-4 text-muted-foreground" />

                        <div className="flex-1">
                          <select
                            className={cn(
                              'w-full p-2 border rounded-md text-sm',
                              mapping.targetField && 'border-primary'
                            )}
                            value={mapping.targetField || ''}
                            onChange={(e) => updateFieldMapping(
                              currentSheetMapping.sheetName,
                              mapping.sourceColumn,
                              e.target.value || null
                            )}
                          >
                            <option value="">{isSpanish ? '— Ignorar —' : '— Ignore —'}</option>

                            {/* Required Fields Group */}
                            <optgroup label={isSpanish ? 'Campos Requeridos' : 'Required Fields'}>
                              {targetFields.filter(f => f.isRequired).map(field => (
                                <option key={field.id} value={field.id}>
                                  {isSpanish ? field.labelEs : field.label} *
                                </option>
                              ))}
                            </optgroup>

                            {/* Optional Fields Group */}
                            <optgroup label={isSpanish ? 'Campos Opcionales' : 'Optional Fields'}>
                              {targetFields.filter(f => !f.isRequired).map(field => (
                                <option key={field.id} value={field.id}>
                                  {isSpanish ? field.labelEs : field.label}
                                  {field.componentName && ` (${field.componentName})`}
                                </option>
                              ))}
                            </optgroup>

                            {/* Custom Fields Group */}
                            {customFields.length > 0 && (
                              <optgroup label={isSpanish ? 'Campos Personalizados' : 'Custom Fields'}>
                                {customFields.map(field => (
                                  <option key={`custom_${field}`} value={`custom_${field}`}>
                                    {field}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </div>

                        {/* Required indicator */}
                        {targetField?.isRequired && (
                          <Star className="h-4 w-4 text-amber-500" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add Custom Field */}
                <div className="flex items-center gap-2 pt-4 border-t">
                  <input
                    type="text"
                    value={newCustomField}
                    onChange={(e) => setNewCustomField(e.target.value)}
                    placeholder={isSpanish ? 'Nuevo campo personalizado...' : 'New custom field...'}
                    className="flex-1 p-2 border rounded-md text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomField();
                      }
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={addCustomField}>
                    <Plus className="h-4 w-4 mr-1" />
                    {isSpanish ? 'Agregar' : 'Add'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Validate Step */}
          {currentStep === 'validate' && (
            <div className="space-y-6">
              <div className="p-6 bg-green-50 border border-green-200 rounded-lg text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-4" />
                <h3 className="text-xl font-semibold text-green-800 mb-2">
                  {isSpanish ? 'Validación Exitosa' : 'Validation Successful'}
                </h3>
                <p className="text-green-700">
                  {isSpanish
                    ? 'Los datos están listos para importación'
                    : 'Data is ready for import'}
                </p>
              </div>

              {/* Mapping Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {isSpanish ? 'Resumen de Mapeo' : 'Mapping Summary'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {fieldMappings.map((sheet) => {
                      const mappedCount = sheet.mappings.filter(m => m.targetField).length;
                      return (
                        <div key={sheet.sheetName} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{sheet.sheetName}</p>
                            <p className="text-xs text-muted-foreground">
                              {mappedCount} / {sheet.mappings.length} {isSpanish ? 'campos mapeados' : 'fields mapped'}
                            </p>
                          </div>
                          <Badge variant={sheet.isComplete ? 'default' : 'secondary'}>
                            {sheet.isComplete ? (isSpanish ? 'Completo' : 'Complete') : (isSpanish ? 'Incompleto' : 'Incomplete')}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Calculation Preview Placeholder */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calculator className="h-4 w-4" />
                    {isSpanish ? 'Vista Previa de Cálculo' : 'Calculation Preview'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    {isSpanish
                      ? 'Vista previa de cálculo de comisiones estará disponible en la siguiente fase'
                      : 'Commission calculation preview will be available in Phase 2'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Approve Step */}
          {currentStep === 'approve' && analysis && (
            <div className="space-y-6">
              {/* Package Overview */}
              <div className="p-6 bg-primary/5 border border-primary/20 rounded-lg">
                <h3 className="font-semibold mb-4">
                  {isSpanish ? 'Resumen del Paquete de Datos' : 'Data Package Summary'}
                </h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="text-center p-4 bg-white rounded-lg">
                    <p className="text-2xl font-bold">{analysis.sheets.length}</p>
                    <p className="text-sm text-muted-foreground">
                      {isSpanish ? 'Hojas' : 'Sheets'}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-white rounded-lg">
                    <p className="text-2xl font-bold">
                      {analysis.sheets.reduce((sum, s) => sum + s.rowCount, 0).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isSpanish ? 'Registros Totales' : 'Total Records'}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-white rounded-lg">
                    <p className="text-2xl font-bold">{analysisConfidence}%</p>
                    <p className="text-sm text-muted-foreground">
                      {isSpanish ? 'Confianza' : 'Confidence'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Approval Actions */}
              <div className="flex justify-center gap-4">
                <Button variant="outline" size="lg" onClick={() => setCurrentStep('analyze')}>
                  {isSpanish ? 'Revisar Análisis' : 'Review Analysis'}
                </Button>
                <Button size="lg">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {isSpanish ? 'Aprobar e Importar' : 'Approve & Import'}
                </Button>
              </div>
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
          {currentStep === 'map' && currentMappingSheetIndex > 0
            ? (isSpanish ? 'Hoja Anterior' : 'Previous Sheet')
            : (isSpanish ? 'Anterior' : 'Back')}
        </Button>

        {currentStep !== 'approve' && currentStep !== 'upload' && (
          <Button onClick={goNext} disabled={!canProceed() || isProcessing}>
            {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {currentStep === 'map' && currentMappingSheetIndex < mappableSheets.length - 1
              ? (isSpanish ? 'Siguiente Hoja' : 'Next Sheet')
              : (isSpanish ? 'Siguiente' : 'Next')}
            {!isProcessing && <ArrowRight className="h-4 w-4 ml-2" />}
          </Button>
        )}
      </div>
    </div>
  );
}
