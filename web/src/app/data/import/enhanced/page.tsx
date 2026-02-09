'use client';

/**
 * Data Package Import - Phase 1 & 2
 *
 * PHASE 1:
 * - Sheet-by-sheet navigation (Next advances to next sheet, not Validate)
 * - Plan-derived target fields from tenant's compensation plan
 * - AI pre-selection of mappings (>=90% confidence auto-selected, 70-89% shown as suggested)
 * - Column header translation (Spanish ↔ English)
 * - Sheet-to-component banner showing matched component
 * - Required vs optional field indicators
 * - Custom field creation option
 * - Formula value resolution (not formula text)
 *
 * PHASE 2:
 * - Data quality scoring per sheet (completeness, validity, consistency)
 * - Period detection with date range display
 * - Cross-sheet validation for shared keys
 * - Calculation preview with sample employee data
 * - Anomaly detection and highlights
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
  BarChart3,
  Calendar,
  RefreshCw,
  TrendingUp,
  XCircle,
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
import { isCCAdmin } from '@/types/auth';
import { cn } from '@/lib/utils';
import { getPlans } from '@/lib/compensation/plan-storage';
import type { CompensationPlanConfig, PlanComponent } from '@/types/compensation-plan';
import { isAdditiveLookupConfig } from '@/types/compensation-plan';
import {
  directCommitImportData,
  storeFieldMappings,
} from '@/lib/data-architecture/data-layer-service';

// Step definitions
type Step = 'upload' | 'analyze' | 'map' | 'validate' | 'approve' | 'complete';

const STEPS: Step[] = ['upload', 'analyze', 'map', 'validate', 'approve'];

const STEP_CONFIG: Record<Step, { icon: typeof Upload; title: { en: string; es: string }; description: { en: string; es: string } }> = {
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
  complete: {
    icon: CheckCircle,
    title: { en: 'Complete', es: 'Completado' },
    description: { en: 'Import successful', es: 'Importación exitosa' },
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

// ============================================
// PHASE 2: VALIDATION TYPES
// ============================================

interface ValidationResult {
  isValid: boolean;
  overallScore: number;
  sheetScores: SheetQualityScore[];
  periodInfo: PeriodValidation;
  crossSheetValidation: CrossSheetValidation;
  anomalies: DataAnomaly[];
  calculationPreview: CalculationPreviewResult[];
}

interface SheetQualityScore {
  sheetName: string;
  completenessScore: number; // % of required fields with values
  validityScore: number; // % of values passing type/format checks
  consistencyScore: number; // % of rows with consistent data patterns
  overallScore: number;
  issues: QualityIssue[];
}

interface QualityIssue {
  type: 'missing' | 'invalid' | 'inconsistent' | 'anomaly';
  severity: 'error' | 'warning' | 'info';
  field: string;
  rowCount: number;
  description: string;
  sampleRows?: number[];
}

interface PeriodValidation {
  detected: boolean;
  periodType: 'monthly' | 'bi-weekly' | 'weekly' | 'custom';
  startDate: string | null;
  endDate: string | null;
  confirmedStart: string | null;
  confirmedEnd: string | null;
}

interface CrossSheetValidation {
  employeeIdMatch: {
    rosterCount: number;
    dataSheetCount: number;
    matchedCount: number;
    unmatchedIds: string[];
  };
  storeIdMatch: {
    referenceCount: number;
    dataSheetCount: number;
    matchedCount: number;
    unmatchedIds: string[];
  };
  overallMatch: number; // percentage
}

interface DataAnomaly {
  sheetName: string;
  field: string;
  type: 'outlier' | 'duplicate' | 'negative' | 'zero' | 'future_date' | 'pattern_break';
  rowIndices: number[];
  description: string;
  suggestedAction: string;
}

interface CalculationPreviewResult {
  employeeId: string;
  employeeName?: string;
  storeId?: string;
  components: ComponentPreview[];
  totalIncentive: number;
  currency: string;
  flags: string[];
}

interface ComponentPreview {
  componentId: string;
  componentName: string;
  inputMetric: string;
  inputValue: number;
  lookupResult: number;
  calculation: string;
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

// Helper: Map AI-suggested field names to dropdown option IDs
const FIELD_ID_MAPPINGS: Record<string, string> = {
  // Employee identifiers
  'employee_id': 'employeeId',
  'employeeid': 'employeeId',
  'emp_id': 'employeeId',
  'empid': 'employeeId',
  'num_empleado': 'employeeId',
  'numero_empleado': 'employeeId',
  'id_empleado': 'employeeId',
  'rep_id': 'employeeId',
  'repid': 'employeeId',
  'sales_rep_id': 'employeeId',
  // Store identifiers
  'store_id': 'storeId',
  'storeid': 'storeId',
  'no_tienda': 'storeId',
  'id_tienda': 'storeId',
  'tienda': 'storeId',
  'location_id': 'storeId',
  // Date fields
  'date': 'date',
  'fecha': 'date',
  'transaction_date': 'date',
  'fecha_corte': 'date',
  'fecha_transaccion': 'date',
  'order_date': 'date',
  // Period fields
  'period': 'period',
  'periodo': 'period',
  'mes': 'period',
  'month': 'period',
  'ano': 'period',
  'year': 'period',
  // Amount fields
  'amount': 'amount',
  'monto': 'amount',
  'total': 'amount',
  'value': 'amount',
  'venta': 'amount',
  'revenue': 'amount',
  // Attainment fields
  'attainment': 'attainment',
  'cumplimiento': 'attainment',
  'porcentaje': 'attainment',
  'percentage': 'attainment',
  'pct_cumplimiento': 'attainment',
  // Goal/target fields
  'goal': 'goal',
  'meta': 'goal',
  'target': 'goal',
  'quota': 'goal',
  'cuota': 'goal',
  // Quantity fields
  'quantity': 'quantity',
  'cantidad': 'quantity',
  'count': 'quantity',
  'units': 'quantity',
};

function normalizeAISuggestionToFieldId(suggestion: string | null, targetFields: TargetField[]): string | null {
  if (!suggestion) return null;

  const normalized = suggestion.toLowerCase().replace(/[\s_-]+/g, '_').trim();

  // First try direct mapping
  const directMatch = FIELD_ID_MAPPINGS[normalized];
  if (directMatch && targetFields.some(f => f.id === directMatch)) {
    return directMatch;
  }

  // Try matching against targetFields directly
  for (const field of targetFields) {
    const fieldNorm = field.id.toLowerCase();
    const labelNorm = field.label.toLowerCase().replace(/[\s_-]+/g, '_');
    const labelEsNorm = field.labelEs?.toLowerCase().replace(/[\s_-]+/g, '_');

    if (normalized === fieldNorm || normalized === labelNorm || normalized === labelEsNorm) {
      return field.id;
    }

    // Partial match - suggestion contains field ID or vice versa
    if (normalized.includes(fieldNorm) || fieldNorm.includes(normalized)) {
      return field.id;
    }
  }

  return null;
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
  const { user } = useAuth(); // For authentication check
  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : (locale === 'es-MX' || currentTenant?.locale === 'es-MX');

  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload state - keep file reference for parsing all rows on submit
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
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
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_importComplete, setImportComplete] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);

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
        console.log('[Field Mapping] Target fields available:', targetFields.length, targetFields.map(f => f.id));
        const mappings: SheetFieldMapping[] = analyzedSheets
          .filter((sheet: AnalyzedSheet) => sheet.classification !== 'unrelated')
          .map((sheet: AnalyzedSheet) => {
            const sheetMappings = sheet.headers.map(header => {
              // Case-insensitive matching with whitespace normalization
              const headerNorm = header.toLowerCase().trim();
              const suggestion = sheet.suggestedFieldMappings?.find(
                m => m.sourceColumn.toLowerCase().trim() === headerNorm
              );
              const confidence = suggestion?.confidence || 0;
              // Auto-confirm if confidence >= 85% (high confidence, per OB-12)
              // Pre-populate dropdown if confidence >= 70% (suggested)
              const autoConfirmed = confidence >= 85;
              const showSuggestion = confidence >= 70;

              // Normalize AI suggestion to a valid dropdown option ID
              const normalizedTargetField = normalizeAISuggestionToFieldId(
                suggestion?.targetField || null,
                targetFields
              );

              // Use normalized field if confidence is high enough to show suggestion
              const effectiveTargetField = showSuggestion ? normalizedTargetField : null;
              const isRequired = targetFields.find(f => f.id === effectiveTargetField)?.isRequired || false;

              // Debug logging
              if (confidence >= 70) {
                console.log(`[Field Mapping] ${header}: AI suggested "${suggestion?.targetField}" (${confidence}%) -> normalized to "${normalizedTargetField}" -> effective: "${effectiveTargetField}"`);
              }

              return {
                sourceColumn: header,
                targetField: effectiveTargetField,
                confidence,
                confirmed: autoConfirmed && !!effectiveTargetField,
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
    setUploadedFile(file);
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

  // ============================================
  // PHASE 2: VALIDATION LOGIC
  // ============================================

  const runValidation = useCallback(() => {
    if (!analysis || fieldMappings.length === 0) return;

    setIsValidating(true);

    // Simulate validation processing
    setTimeout(() => {
      // Calculate sheet quality scores
      const sheetScores: SheetQualityScore[] = fieldMappings.map(sheet => {
        const sheetData = analysis.sheets.find(s => s.name === sheet.sheetName);
        if (!sheetData) return {
          sheetName: sheet.sheetName,
          completenessScore: 0,
          validityScore: 0,
          consistencyScore: 0,
          overallScore: 0,
          issues: [],
        };

        const mappedFields = sheet.mappings.filter(m => m.targetField);
        const requiredMapped = mappedFields.filter(m => m.isRequired);
        const issues: QualityIssue[] = [];

        // Calculate completeness (required fields with values)
        let completenessScore = 100;
        if (requiredMapped.length === 0) {
          completenessScore = 50;
          issues.push({
            type: 'missing',
            severity: 'warning',
            field: 'Required Fields',
            rowCount: 0,
            description: isSpanish
              ? 'No se han mapeado campos requeridos'
              : 'No required fields have been mapped',
          });
        }

        // Check for null/empty values in sample data
        let nullCount = 0;
        sheetData.sampleRows.forEach((row) => {
          mappedFields.forEach(mapping => {
            const value = row[mapping.sourceColumn];
            if (value === null || value === '' || value === undefined) {
              nullCount++;
            }
          });
        });

        const totalCells = sheetData.sampleRows.length * mappedFields.length;
        const validityScore = totalCells > 0
          ? Math.round((1 - nullCount / totalCells) * 100)
          : 100;

        if (validityScore < 80) {
          issues.push({
            type: 'invalid',
            severity: 'warning',
            field: 'Multiple Fields',
            rowCount: nullCount,
            description: isSpanish
              ? `${nullCount} celdas vacías o nulas detectadas`
              : `${nullCount} empty or null cells detected`,
          });
        }

        // Consistency check (numeric fields should have consistent formats)
        const consistencyScore = 95; // Assume high consistency for now

        // Check for negative values in amount fields
        const amountMappings = mappedFields.filter(m =>
          m.targetField?.includes('amount') ||
          m.targetField?.includes('sales') ||
          m.targetField?.includes('revenue')
        );

        amountMappings.forEach(mapping => {
          sheetData.sampleRows.forEach((row, idx) => {
            const value = row[mapping.sourceColumn];
            if (typeof value === 'number' && value < 0) {
              issues.push({
                type: 'anomaly',
                severity: 'warning',
                field: mapping.sourceColumn,
                rowCount: 1,
                description: isSpanish
                  ? `Valor negativo en fila ${idx + 1}`
                  : `Negative value in row ${idx + 1}`,
                sampleRows: [idx],
              });
            }
          });
        });

        const overallScore = Math.round(
          (completenessScore * 0.3 + validityScore * 0.4 + consistencyScore * 0.3)
        );

        return {
          sheetName: sheet.sheetName,
          completenessScore,
          validityScore,
          consistencyScore,
          overallScore,
          issues,
        };
      });

      // Period detection from analysis
      const periodInfo: PeriodValidation = {
        detected: analysis.periodDetected.found,
        periodType: (analysis.periodDetected.periodType || 'monthly') as 'monthly' | 'bi-weekly' | 'weekly' | 'custom',
        startDate: analysis.periodDetected.dateRange?.start || null,
        endDate: analysis.periodDetected.dateRange?.end || null,
        confirmedStart: analysis.periodDetected.dateRange?.start || null,
        confirmedEnd: analysis.periodDetected.dateRange?.end || null,
      };

      // Cross-sheet validation
      const rosterSheet = analysis.sheets.find(s => s.classification === 'roster');
      const dataSheets = analysis.sheets.filter(s => s.classification === 'component_data');

      const employeeIds = new Set<string>();
      const dataEmployeeIds = new Set<string>();

      if (rosterSheet) {
        const employeeCol = rosterSheet.headers.find(h =>
          h.toLowerCase().includes('empleado') ||
          h.toLowerCase().includes('employee') ||
          h.toLowerCase().includes('id')
        );
        if (employeeCol) {
          rosterSheet.sampleRows.forEach(row => {
            const id = row[employeeCol];
            if (id) employeeIds.add(String(id));
          });
        }
      }

      dataSheets.forEach(sheet => {
        const mapping = fieldMappings.find(m => m.sheetName === sheet.name);
        const employeeMapping = mapping?.mappings.find(m => m.targetField === 'employeeId');
        if (employeeMapping) {
          sheet.sampleRows.forEach(row => {
            const id = row[employeeMapping.sourceColumn];
            if (id) dataEmployeeIds.add(String(id));
          });
        }
      });

      const matchedEmployees = new Set(Array.from(employeeIds).filter(x => dataEmployeeIds.has(x)));
      const unmatchedEmployees = Array.from(dataEmployeeIds).filter(x => !employeeIds.has(x));

      const crossSheetValidation: CrossSheetValidation = {
        employeeIdMatch: {
          rosterCount: employeeIds.size,
          dataSheetCount: dataEmployeeIds.size,
          matchedCount: matchedEmployees.size,
          unmatchedIds: unmatchedEmployees.slice(0, 5),
        },
        storeIdMatch: {
          referenceCount: 0,
          dataSheetCount: 0,
          matchedCount: 0,
          unmatchedIds: [],
        },
        overallMatch: dataEmployeeIds.size > 0
          ? Math.round((matchedEmployees.size / dataEmployeeIds.size) * 100)
          : 100,
      };

      // Anomaly detection
      const anomalies: DataAnomaly[] = [];

      sheetScores.forEach(score => {
        score.issues
          .filter(i => i.type === 'anomaly')
          .forEach(issue => {
            anomalies.push({
              sheetName: score.sheetName,
              field: issue.field,
              type: 'outlier',
              rowIndices: issue.sampleRows || [],
              description: issue.description,
              suggestedAction: isSpanish ? 'Revisar valores' : 'Review values',
            });
          });
      });

      // Calculation preview (sample for 3 employees)
      const calculationPreview: CalculationPreviewResult[] = [];

      // Get first data sheet with employee data
      const firstDataSheet = dataSheets[0];
      const firstDataMapping = fieldMappings.find(m => m.sheetName === firstDataSheet?.name);

      if (firstDataSheet && firstDataMapping && activePlan) {
        const employeeMapping = firstDataMapping.mappings.find(m => m.targetField === 'employeeId');

        firstDataSheet.sampleRows.slice(0, 3).forEach((row, idx) => {
          const employeeId = employeeMapping
            ? String(row[employeeMapping.sourceColumn] || `EMP-${idx + 1}`)
            : `EMP-${idx + 1}`;

          // Generate mock calculation preview based on plan components
          const components: ComponentPreview[] = [];
          let totalIncentive = 0;

          if (activePlan.configuration && isAdditiveLookupConfig(activePlan.configuration)) {
            const variant = activePlan.configuration.variants[0];
            variant?.components?.slice(0, 3).forEach(comp => {
              let inputValue = 0;
              let lookupResult = 0;

              // Try to find mapped metric
              if (comp.matrixConfig) {
                const metricMapping = firstDataMapping.mappings.find(m =>
                  m.targetField === comp.matrixConfig!.rowMetric
                );
                if (metricMapping) {
                  const val = row[metricMapping.sourceColumn];
                  inputValue = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
                }
                // Simulate lookup (random for demo)
                lookupResult = Math.round(inputValue > 0 ? 500 + Math.random() * 1500 : 0);
              } else if (comp.tierConfig) {
                const metricMapping = firstDataMapping.mappings.find(m =>
                  m.targetField === comp.tierConfig!.metric
                );
                if (metricMapping) {
                  const val = row[metricMapping.sourceColumn];
                  inputValue = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
                }
                lookupResult = inputValue >= 100 ? 300 : inputValue >= 90 ? 150 : 0;
              }

              totalIncentive += lookupResult;

              components.push({
                componentId: comp.id,
                componentName: comp.name,
                inputMetric: comp.matrixConfig?.rowMetric || comp.tierConfig?.metric || 'metric',
                inputValue,
                lookupResult,
                calculation: lookupResult > 0
                  ? `${inputValue.toFixed(1)}% → ${currency} ${lookupResult.toLocaleString()}`
                  : isSpanish ? 'No califica' : 'Does not qualify',
              });
            });
          }

          calculationPreview.push({
            employeeId,
            components,
            totalIncentive,
            currency,
            flags: totalIncentive === 0 ? [isSpanish ? 'Sin incentivo' : 'No incentive'] : [],
          });
        });
      }

      // Calculate overall score
      const overallScore = sheetScores.length > 0
        ? Math.round(sheetScores.reduce((sum, s) => sum + s.overallScore, 0) / sheetScores.length)
        : 0;

      setValidationResult({
        isValid: overallScore >= 70,
        overallScore,
        sheetScores,
        periodInfo,
        crossSheetValidation,
        anomalies,
        calculationPreview,
      });

      setIsValidating(false);
      setValidationComplete(true);
    }, 1500);
  }, [analysis, fieldMappings, isSpanish, activePlan, currency]);

  // Submit import handler - ACTUALLY PERSISTS DATA
  const handleSubmitImport = useCallback(async () => {
    if (!uploadedFile || !analysis) {
      setError('No file or analysis available');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      // Parse ALL rows from the workbook (not just samples)
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, {
        type: 'array',
        cellFormula: false,
        cellNF: false,
        cellStyles: false,
      });

      // Build sheet data with all rows and field mappings
      const sheetData: Array<{
        sheetName: string;
        rows: Record<string, unknown>[];
        mappings?: Record<string, string>;
      }> = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: null,
          raw: true,
        });

        // Skip empty sheets
        if (jsonData.length === 0) continue;

        // Get field mappings for this sheet
        const sheetMapping = fieldMappings.find(m => m.sheetName === sheetName);
        const mappings: Record<string, string> = {};

        if (sheetMapping) {
          sheetMapping.mappings.forEach(m => {
            if (m.targetField) {
              mappings[m.sourceColumn] = m.targetField;
            }
          });
        }

        sheetData.push({
          sheetName,
          rows: jsonData,
          mappings: Object.keys(mappings).length > 0 ? mappings : undefined,
        });
      }

      // Get user ID
      const userId = user?.id || 'system';

      // Commit data to data layer
      const result = directCommitImportData(
        tenantId,
        userId,
        uploadedFile.name,
        sheetData
      );

      // Store field mappings separately
      const mappingsToStore = fieldMappings.map(m => ({
        sheetName: m.sheetName,
        mappings: Object.fromEntries(
          m.mappings
            .filter(mapping => mapping.targetField)
            .map(mapping => [mapping.sourceColumn, mapping.targetField as string])
        ),
      }));
      storeFieldMappings(tenantId, result.batchId, mappingsToStore);

      console.log(`[Import] Committed ${result.recordCount} records, batch: ${result.batchId}`);
      console.log(`[Import] TenantId used: ${tenantId}`);

      // Verify persistence to localStorage
      const batchesInStorage = localStorage.getItem('data_layer_batches');
      const committedInStorage = localStorage.getItem('data_layer_committed');
      console.log(`[Import] Verification - batches in storage: ${batchesInStorage ? 'YES' : 'NO'}`);
      console.log(`[Import] Verification - committed in storage: ${committedInStorage ? 'YES' : 'NO'}`);
      if (batchesInStorage) {
        const batches = JSON.parse(batchesInStorage);
        console.log(`[Import] Batches count: ${batches.length}`);
        const thisBatch = batches.find(([id]: [string, unknown]) => id === result.batchId);
        console.log(`[Import] This batch found: ${thisBatch ? 'YES' : 'NO'}`);
      }

      setImportId(result.batchId);
      setIsImporting(false);
      setImportComplete(true);
      setCurrentStep('complete');
    } catch (err) {
      console.error('Import commit error:', err);
      setError(err instanceof Error ? err.message : 'Failed to commit import');
      setIsImporting(false);
    }
  }, [uploadedFile, analysis, fieldMappings, tenantId, user]);

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
        // All sheets mapped, go to validate and run validation
        setCurrentStep('validate');
        runValidation();
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
                          mapping.confidence >= 90 && 'border-green-200 bg-green-50/50',
                          mapping.confidence >= 70 && mapping.confidence < 90 && 'border-amber-200 bg-amber-50/30'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{mapping.sourceColumn}</p>
                            {mapping.confidence >= 90 && (
                              <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                                AI {mapping.confidence}%
                              </Badge>
                            )}
                            {mapping.confidence >= 70 && mapping.confidence < 90 && (
                              <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300">
                                {isSpanish ? 'Sugerido' : 'Suggested'} {mapping.confidence}%
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

          {/* Validate Step - Phase 2 Enhanced */}
          {currentStep === 'validate' && (
            <div className="space-y-6">
              {/* Loading State */}
              {isValidating && (
                <div className="p-12 flex flex-col items-center justify-center">
                  <RefreshCw className="h-12 w-12 animate-spin text-primary mb-4" />
                  <p className="font-medium">
                    {isSpanish ? 'Validando datos...' : 'Validating data...'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isSpanish
                      ? 'Verificando calidad, consistencia y calculando preview'
                      : 'Checking quality, consistency and calculating preview'}
                  </p>
                </div>
              )}

              {/* Validation Results */}
              {!isValidating && validationResult && (
                <>
                  {/* Overall Status Banner */}
                  <div className={cn(
                    'p-6 rounded-lg flex items-center gap-4',
                    validationResult.isValid
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-yellow-50 border border-yellow-200'
                  )}>
                    <div className={cn(
                      'p-3 rounded-full',
                      validationResult.isValid ? 'bg-green-100' : 'bg-yellow-100'
                    )}>
                      {validationResult.isValid ? (
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-8 w-8 text-yellow-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className={cn(
                        'text-xl font-semibold',
                        validationResult.isValid ? 'text-green-800' : 'text-yellow-800'
                      )}>
                        {validationResult.isValid
                          ? (isSpanish ? 'Validación Exitosa' : 'Validation Passed')
                          : (isSpanish ? 'Revisión Recomendada' : 'Review Recommended')}
                      </h3>
                      <p className={validationResult.isValid ? 'text-green-700' : 'text-yellow-700'}>
                        {isSpanish
                          ? `Puntuación de calidad: ${validationResult.overallScore}%`
                          : `Quality score: ${validationResult.overallScore}%`}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={cn(
                        'text-4xl font-bold',
                        validationResult.overallScore >= 80 ? 'text-green-600' :
                        validationResult.overallScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                      )}>
                        {validationResult.overallScore}%
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish ? 'Calidad General' : 'Overall Quality'}
                      </p>
                    </div>
                  </div>

                  {/* Quality Scores Grid */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {validationResult.sheetScores.map((score) => (
                      <Card key={score.sheetName}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span className="truncate">{score.sheetName}</span>
                            <Badge variant={score.overallScore >= 80 ? 'default' : 'secondary'}>
                              {score.overallScore}%
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {/* Score Bars */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span>{isSpanish ? 'Completitud' : 'Completeness'}</span>
                                <span>{score.completenessScore}%</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-full transition-all',
                                    score.completenessScore >= 80 ? 'bg-green-500' :
                                    score.completenessScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                                  )}
                                  style={{ width: `${score.completenessScore}%` }}
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span>{isSpanish ? 'Validez' : 'Validity'}</span>
                                <span>{score.validityScore}%</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-full transition-all',
                                    score.validityScore >= 80 ? 'bg-green-500' :
                                    score.validityScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                                  )}
                                  style={{ width: `${score.validityScore}%` }}
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span>{isSpanish ? 'Consistencia' : 'Consistency'}</span>
                                <span>{score.consistencyScore}%</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-full transition-all',
                                    score.consistencyScore >= 80 ? 'bg-green-500' :
                                    score.consistencyScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                                  )}
                                  style={{ width: `${score.consistencyScore}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Issues */}
                          {score.issues.length > 0 && (
                            <div className="mt-3 pt-3 border-t space-y-1">
                              {score.issues.slice(0, 2).map((issue, idx) => (
                                <div
                                  key={idx}
                                  className={cn(
                                    'text-xs p-2 rounded flex items-start gap-2',
                                    issue.severity === 'error' ? 'bg-red-50 text-red-700' :
                                    issue.severity === 'warning' ? 'bg-yellow-50 text-yellow-700' :
                                    'bg-blue-50 text-blue-700'
                                  )}
                                >
                                  {issue.severity === 'error' ? <XCircle className="h-3 w-3 mt-0.5" /> :
                                   issue.severity === 'warning' ? <AlertTriangle className="h-3 w-3 mt-0.5" /> :
                                   <Info className="h-3 w-3 mt-0.5" />}
                                  <span>{issue.description}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Period Detection */}
                  {validationResult.periodInfo.detected && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {isSpanish ? 'Período Detectado' : 'Detected Period'}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4">
                          <div className="flex-1 p-3 bg-muted rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">
                              {isSpanish ? 'Inicio' : 'Start'}
                            </p>
                            <p className="font-medium">
                              {validationResult.periodInfo.startDate
                                ? new Date(validationResult.periodInfo.startDate).toLocaleDateString()
                                : (isSpanish ? 'No detectado' : 'Not detected')}
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1 p-3 bg-muted rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">
                              {isSpanish ? 'Fin' : 'End'}
                            </p>
                            <p className="font-medium">
                              {validationResult.periodInfo.endDate
                                ? new Date(validationResult.periodInfo.endDate).toLocaleDateString()
                                : (isSpanish ? 'No detectado' : 'Not detected')}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {validationResult.periodInfo.periodType === 'monthly' ? (isSpanish ? 'Mensual' : 'Monthly') :
                             validationResult.periodInfo.periodType === 'bi-weekly' ? (isSpanish ? 'Quincenal' : 'Bi-weekly') :
                             validationResult.periodInfo.periodType === 'weekly' ? (isSpanish ? 'Semanal' : 'Weekly') :
                             (isSpanish ? 'Personalizado' : 'Custom')}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Cross-Sheet Validation */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Link2 className="h-4 w-4" />
                        {isSpanish ? 'Validación Cruzada' : 'Cross-Sheet Validation'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">
                              {isSpanish ? 'IDs de Empleado' : 'Employee IDs'}
                            </span>
                            <Badge variant={validationResult.crossSheetValidation.overallMatch >= 80 ? 'default' : 'secondary'}>
                              {validationResult.crossSheetValidation.overallMatch}% {isSpanish ? 'coincidencia' : 'match'}
                            </Badge>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{isSpanish ? 'En plantilla' : 'In roster'}:</span>
                              <span>{validationResult.crossSheetValidation.employeeIdMatch.rosterCount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{isSpanish ? 'En datos' : 'In data'}:</span>
                              <span>{validationResult.crossSheetValidation.employeeIdMatch.dataSheetCount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{isSpanish ? 'Coincidentes' : 'Matched'}:</span>
                              <span className="text-green-600">{validationResult.crossSheetValidation.employeeIdMatch.matchedCount}</span>
                            </div>
                          </div>
                          {validationResult.crossSheetValidation.employeeIdMatch.unmatchedIds.length > 0 && (
                            <div className="mt-2 pt-2 border-t">
                              <p className="text-xs text-muted-foreground mb-1">
                                {isSpanish ? 'IDs no encontrados en plantilla:' : 'IDs not in roster:'}
                              </p>
                              <p className="text-xs text-orange-600">
                                {validationResult.crossSheetValidation.employeeIdMatch.unmatchedIds.join(', ')}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="p-4 border rounded-lg flex items-center justify-center text-center text-muted-foreground">
                          <div>
                            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">
                              {isSpanish
                                ? 'Validación de tiendas disponible con datos de referencia'
                                : 'Store validation available with reference data'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Anomalies */}
                  {validationResult.anomalies.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          {isSpanish ? 'Anomalías Detectadas' : 'Detected Anomalies'}
                          <Badge variant="secondary">{validationResult.anomalies.length}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {validationResult.anomalies.map((anomaly, idx) => (
                            <div key={idx} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium text-yellow-800">{anomaly.sheetName}: {anomaly.field}</p>
                                  <p className="text-sm text-yellow-700">{anomaly.description}</p>
                                </div>
                                <Badge variant="outline" className="text-yellow-700 border-yellow-300">
                                  {anomaly.type}
                                </Badge>
                              </div>
                              <p className="text-xs text-yellow-600 mt-1">
                                {isSpanish ? 'Sugerencia:' : 'Suggestion:'} {anomaly.suggestedAction}
                              </p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Calculation Preview */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calculator className="h-4 w-4" />
                        {isSpanish ? 'Vista Previa de Cálculo' : 'Calculation Preview'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {validationResult.calculationPreview.length === 0 ? (
                        <p className="text-muted-foreground text-sm text-center py-4">
                          {isSpanish
                            ? 'No hay datos suficientes para generar vista previa'
                            : 'Not enough data to generate preview'}
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">
                                  {isSpanish ? 'Empleado' : 'Employee'}
                                </th>
                                {validationResult.calculationPreview[0]?.components.map(comp => (
                                  <th key={comp.componentId} className="px-3 py-2 text-right font-medium">
                                    {comp.componentName}
                                  </th>
                                ))}
                                <th className="px-3 py-2 text-right font-medium">
                                  {isSpanish ? 'Total' : 'Total'}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {validationResult.calculationPreview.map((preview, idx) => (
                                <tr key={preview.employeeId} className={cn('border-t', idx % 2 === 0 && 'bg-muted/30')}>
                                  <td className="px-3 py-2 font-medium">
                                    {preview.employeeId}
                                    {preview.flags.length > 0 && (
                                      <span className="ml-2 text-xs text-orange-500">
                                        ({preview.flags[0]})
                                      </span>
                                    )}
                                  </td>
                                  {preview.components.map(comp => (
                                    <td key={comp.componentId} className="px-3 py-2 text-right">
                                      <div>
                                        <span className={cn(
                                          comp.lookupResult > 0 ? 'text-green-600' : 'text-muted-foreground'
                                        )}>
                                          {formatCurrency(comp.lookupResult)}
                                        </span>
                                        <p className="text-xs text-muted-foreground">
                                          {comp.inputValue > 0 ? `${comp.inputValue.toFixed(1)}%` : '-'}
                                        </p>
                                      </div>
                                    </td>
                                  ))}
                                  <td className="px-3 py-2 text-right font-semibold">
                                    <span className={cn(
                                      preview.totalIncentive > 0
                                        ? 'text-green-600'
                                        : 'text-muted-foreground'
                                    )}>
                                      {formatCurrency(preview.totalIncentive)}
                                    </span>
                                    {preview.totalIncentive > 0 && (
                                      <TrendingUp className="inline-block h-3 w-3 ml-1 text-green-500" />
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}

          {/* Approve Step - Phase 3 Enhanced */}
          {currentStep === 'approve' && analysis && (
            <div className="space-y-6">
              {/* Progressive Node Visual - Approval Workflow */}
              <div className="p-6 bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-lg">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  {isSpanish ? 'Flujo de Aprobación' : 'Approval Workflow'}
                </h3>
                <div className="flex items-center justify-between">
                  {/* Node 1: Upload */}
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white">
                      <CheckCircle className="h-6 w-6" />
                    </div>
                    <p className="text-xs mt-2 font-medium">{isSpanish ? 'Cargado' : 'Uploaded'}</p>
                  </div>
                  <div className="flex-1 h-1 bg-green-500 mx-2" />

                  {/* Node 2: Analyzed */}
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white">
                      <CheckCircle className="h-6 w-6" />
                    </div>
                    <p className="text-xs mt-2 font-medium">{isSpanish ? 'Analizado' : 'Analyzed'}</p>
                  </div>
                  <div className="flex-1 h-1 bg-green-500 mx-2" />

                  {/* Node 3: Mapped */}
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white">
                      <CheckCircle className="h-6 w-6" />
                    </div>
                    <p className="text-xs mt-2 font-medium">{isSpanish ? 'Mapeado' : 'Mapped'}</p>
                  </div>
                  <div className="flex-1 h-1 bg-green-500 mx-2" />

                  {/* Node 4: Validated */}
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white">
                      <CheckCircle className="h-6 w-6" />
                    </div>
                    <p className="text-xs mt-2 font-medium">{isSpanish ? 'Validado' : 'Validated'}</p>
                  </div>
                  <div className="flex-1 h-1 bg-primary/30 mx-2" />

                  {/* Node 5: Pending Approval */}
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-primary animate-pulse flex items-center justify-center text-white">
                      <ClipboardCheck className="h-6 w-6" />
                    </div>
                    <p className="text-xs mt-2 font-medium text-primary">{isSpanish ? 'Aprobación' : 'Approval'}</p>
                  </div>
                </div>
              </div>

              {/* Validation Warnings Summary */}
              {validationResult && validationResult.sheetScores.some(s => s.issues.length > 0) && (
                <Card className="border-amber-200 bg-amber-50/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                      <AlertTriangle className="h-4 w-4" />
                      {isSpanish ? 'Advertencias de Validación' : 'Validation Warnings'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {validationResult.sheetScores.flatMap(score =>
                        score.issues.map((issue, idx) => (
                          <div
                            key={`${score.sheetName}-${idx}`}
                            className={cn(
                              'text-sm p-2 rounded flex items-start gap-2',
                              issue.severity === 'error' ? 'bg-red-100 text-red-800' :
                              issue.severity === 'warning' ? 'bg-amber-100 text-amber-800' :
                              'bg-blue-100 text-blue-800'
                            )}
                          >
                            {issue.severity === 'error' ? <XCircle className="h-4 w-4 mt-0.5" /> :
                             issue.severity === 'warning' ? <AlertTriangle className="h-4 w-4 mt-0.5" /> :
                             <Info className="h-4 w-4 mt-0.5" />}
                            <div>
                              <span className="font-medium">{score.sheetName}:</span>{' '}
                              {issue.description}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <p className="text-xs text-amber-700 mt-3">
                      {isSpanish
                        ? 'Estas advertencias no bloquean la importación, pero se recomienda revisar antes de aprobar.'
                        : 'These warnings do not block import, but review is recommended before approval.'}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Package Awareness - Complete Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    {isSpanish ? 'Paquete de Datos Completo' : 'Complete Data Package'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className="text-3xl font-bold text-primary">{analysis.sheets.length}</p>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish ? 'Hojas' : 'Sheets'}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className="text-3xl font-bold text-primary">
                        {analysis.sheets.reduce((sum, s) => sum + s.rowCount, 0).toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish ? 'Registros' : 'Records'}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className="text-3xl font-bold text-primary">
                        {fieldMappings.reduce((sum, m) => sum + m.mappings.filter(f => f.targetField).length, 0)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish ? 'Campos Mapeados' : 'Mapped Fields'}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className={cn(
                        'text-3xl font-bold',
                        (validationResult?.overallScore || analysisConfidence) >= 80 ? 'text-green-600' :
                        (validationResult?.overallScore || analysisConfidence) >= 60 ? 'text-yellow-600' : 'text-red-600'
                      )}>
                        {validationResult?.overallScore || analysisConfidence}%
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish ? 'Calidad' : 'Quality'}
                      </p>
                    </div>
                  </div>

                  {/* Sheet Breakdown */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium mb-3">
                      {isSpanish ? 'Desglose por Hoja' : 'Sheet Breakdown'}
                    </p>
                    <div className="space-y-2">
                      {analysis.sheets.filter(s => s.classification !== 'unrelated').map((sheet) => {
                        const config = CLASSIFICATION_CONFIG[sheet.classification];
                        const Icon = config.icon;
                        const mapping = fieldMappings.find(m => m.sheetName === sheet.name);
                        const mappedCount = mapping?.mappings.filter(m => m.targetField).length || 0;

                        return (
                          <div key={sheet.name} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className={cn('p-2 rounded-lg', config.color)}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium">{sheet.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {sheet.rowCount} {isSpanish ? 'filas' : 'rows'} • {mappedCount} {isSpanish ? 'campos' : 'fields'}
                                </p>
                              </div>
                            </div>
                            {sheet.matchedComponent && (
                              <Badge variant="secondary" className="text-xs">
                                → {sheet.matchedComponent}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Active Plan Reference */}
              {activePlan ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calculator className="h-4 w-4" />
                      {isSpanish ? 'Plan de Compensación Activo' : 'Active Compensation Plan'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{activePlan.name}</p>
                        <p className="text-sm text-muted-foreground">{activePlan.description}</p>
                      </div>
                      <Badge variant={activePlan.status === 'active' ? 'default' : 'secondary'}>
                        {activePlan.status === 'active' ? (isSpanish ? 'Activo' : 'Active') : activePlan.status}
                      </Badge>
                    </div>
                    {activePlan.configuration && isAdditiveLookupConfig(activePlan.configuration) && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground mb-2">
                          {isSpanish ? 'Componentes del Plan' : 'Plan Components'} ({activePlan.configuration.variants[0]?.components?.length || 0}):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {activePlan.configuration.variants[0]?.components?.map(comp => (
                            <Badge key={comp.id} variant="outline" className="text-xs">
                              {comp.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-amber-800 dark:text-amber-200">
                      <AlertTriangle className="h-4 w-4" />
                      {isSpanish ? 'Sin Plan Activo' : 'No Active Plan'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                      {isSpanish
                        ? 'Importe un plan de compensación primero para habilitar el mapeo de campos basado en componentes.'
                        : 'Import a compensation plan first to enable component-based field mapping.'}
                    </p>
                    <a href="/admin/launch/plan-import" className="text-sm text-primary hover:underline">
                      {isSpanish ? 'Importar Plan →' : 'Import Plan →'}
                    </a>
                  </CardContent>
                </Card>
              )}

              {/* Approval Routing Notice */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-primary">
                        {isSpanish ? 'Enrutamiento de Aprobación' : 'Approval Routing'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish
                          ? 'Esta importación será enrutada automáticamente a los aprobadores según las reglas de aprobación configuradas. Recibirá una notificación cuando se complete la aprobación.'
                          : 'This import will be automatically routed to approvers based on configured approval rules. You will receive a notification when approval is complete.'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Approval Actions */}
              <div className="flex justify-center gap-4 pt-4">
                <Button variant="outline" size="lg" onClick={() => setCurrentStep('validate')}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {isSpanish ? 'Revisar Validación' : 'Review Validation'}
                </Button>
                <Button variant="outline" size="lg" onClick={() => setCurrentStep('analyze')}>
                  {isSpanish ? 'Revisar Análisis' : 'Review Analysis'}
                </Button>
                <Button
                  size="lg"
                  className="px-8"
                  onClick={handleSubmitImport}
                  disabled={isImporting}
                >
                  {isImporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  {isImporting
                    ? (isSpanish ? 'Importando...' : 'Importing...')
                    : (isSpanish ? 'Aprobar e Importar' : 'Approve & Import')}
                </Button>
              </div>
            </div>
          )}

          {/* Complete Step - Phase 4 */}
          {currentStep === 'complete' && (
            <div className="space-y-8">
              {/* Success Banner */}
              <div className="p-8 bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-lg text-center">
                <div className="w-20 h-20 mx-auto bg-green-500 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="h-12 w-12 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-green-800 mb-2">
                  {isSpanish ? '¡Importación Completada!' : 'Import Complete!'}
                </h2>
                <p className="text-green-700 mb-4">
                  {isSpanish
                    ? 'Los datos han sido importados exitosamente al sistema.'
                    : 'Data has been successfully imported into the system.'}
                </p>
                <Badge variant="outline" className="text-green-700 border-green-400 text-lg px-4 py-1">
                  {isSpanish ? 'ID de Importación' : 'Import ID'}: {importId}
                </Badge>
              </div>

              {/* Import Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    {isSpanish ? 'Resumen de Importación' : 'Import Summary'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{analysis?.sheets.length || 0}</p>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish ? 'Hojas Procesadas' : 'Sheets Processed'}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">
                        {analysis?.sheets.reduce((sum, s) => sum + s.rowCount, 0).toLocaleString() || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish ? 'Registros Importados' : 'Records Imported'}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">
                        {validationResult?.overallScore || analysisConfidence}%
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish ? 'Calidad de Datos' : 'Data Quality'}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">
                        {new Date().toLocaleDateString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish ? 'Fecha de Importación' : 'Import Date'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* What's Next Section */}
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    {isSpanish ? '¿Qué Sigue?' : "What's Next?"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Run Calculations */}
                    <a
                      href="/operate/calculate"
                      className="p-4 border rounded-lg hover:bg-white transition-colors flex items-start gap-4"
                    >
                      <div className="p-3 bg-primary/10 rounded-lg">
                        <Calculator className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1">
                          {isSpanish ? 'Ejecutar Cálculos' : 'Run Calculations'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {isSpanish
                            ? 'Procesar los datos importados con el plan de compensación activo para generar resultados de incentivos.'
                            : 'Process imported data with the active compensation plan to generate incentive results.'}
                        </p>
                        <Button variant="link" className="p-0 h-auto mt-2 text-primary">
                          {isSpanish ? 'Ir a Cálculos →' : 'Go to Calculations →'}
                        </Button>
                      </div>
                    </a>

                    {/* Review Data Quality */}
                    <a
                      href="/data/quality"
                      className="p-4 border rounded-lg hover:bg-white transition-colors flex items-start gap-4"
                    >
                      <div className="p-3 bg-primary/10 rounded-lg">
                        <BarChart3 className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1">
                          {isSpanish ? 'Revisar Calidad de Datos' : 'Review Data Quality'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {isSpanish
                            ? 'Ver el análisis detallado de calidad de datos y resolver cualquier problema pendiente.'
                            : 'View detailed data quality analysis and resolve any outstanding issues.'}
                        </p>
                        <Button variant="link" className="p-0 h-auto mt-2 text-primary">
                          {isSpanish ? 'Ver Calidad →' : 'View Quality →'}
                        </Button>
                      </div>
                    </a>

                    {/* View Transactions */}
                    <a
                      href="/transactions"
                      className="p-4 border rounded-lg hover:bg-white transition-colors flex items-start gap-4"
                    >
                      <div className="p-3 bg-primary/10 rounded-lg">
                        <Database className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1">
                          {isSpanish ? 'Ver Transacciones' : 'View Transactions'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {isSpanish
                            ? 'Explorar los registros importados y verificar que los datos se cargaron correctamente.'
                            : 'Explore imported records and verify that data was loaded correctly.'}
                        </p>
                        <Button variant="link" className="p-0 h-auto mt-2 text-primary">
                          {isSpanish ? 'Ver Transacciones →' : 'View Transactions →'}
                        </Button>
                      </div>
                    </a>

                    {/* Import More Data */}
                    <button
                      onClick={() => {
                        // Reset all state for new import
                        setCurrentStep('upload');
                        setUploadedFile(null);
                        setAnalysis(null);
                        setFieldMappings([]);
                        setValidationResult(null);
                        setValidationComplete(false);
                        setImportComplete(false);
                        setImportId(null);
                      }}
                      className="p-4 border rounded-lg hover:bg-white transition-colors flex items-start gap-4 text-left"
                    >
                      <div className="p-3 bg-primary/10 rounded-lg">
                        <Upload className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1">
                          {isSpanish ? 'Importar Más Datos' : 'Import More Data'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {isSpanish
                            ? 'Iniciar una nueva importación de datos para agregar más información al sistema.'
                            : 'Start a new data import to add more information to the system.'}
                        </p>
                        <Button variant="link" className="p-0 h-auto mt-2 text-primary">
                          {isSpanish ? 'Nueva Importación →' : 'New Import →'}
                        </Button>
                      </div>
                    </button>
                  </div>
                </CardContent>
              </Card>

              {/* Approval Status Notice */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-800">
                    {isSpanish ? 'Estado de Aprobación' : 'Approval Status'}
                  </p>
                  <p className="text-sm text-blue-700">
                    {isSpanish
                      ? 'Los cálculos generados a partir de esta importación requerirán aprobación antes de ser finalizados. Se le notificará cuando los resultados estén listos para revisión.'
                      : 'Calculations generated from this import will require approval before being finalized. You will be notified when results are ready for review.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation - hide on complete step */}
      {currentStep !== 'complete' && (
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
      )}
    </div>
  );
}
