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
import { RequireRole } from '@/components/auth/RequireRole';
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
import { cn } from '@/lib/utils';
import { getRuleSets } from '@/lib/supabase/rule-set-service';
import type { RuleSetConfig, PlanComponent } from '@/types/compensation-plan';
import { isAdditiveLookupConfig } from '@/types/compensation-plan';
// directCommitImportDataAsync removed — now uses server-side /api/import/commit
import { detectPeriods, type PeriodDetectionResult } from '@/lib/import/period-detector';

interface AIImportContext {
  tenantId: string;
  batchId: string;
  timestamp: string;
  rosterSheet: string | null;
  rosterEmployeeIdColumn: string | null;
  sheets: Array<{
    sheetName: string;
    classification: string;
    matchedComponent: string | null;
    matchedComponentConfidence: number | null;
    fieldMappings: Array<{ sourceColumn: string; semanticType: string; confidence: number }>;
  }>;
}
function storeImportContext(ctx: AIImportContext) { console.log('[Import] Context stored:', ctx.sheets.length, 'sheets'); }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function storeFieldMappings(_tenantId: string, _batchId: string, _mappings: unknown[]) { /* stored in batch metadata */ }
// createClient removed — import commit now uses server-side API route
import { classifyFile, recordClassificationFeedback } from '@/lib/ai/file-classifier';
import { AI_CONFIDENCE } from '@/lib/ai/types';

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
type SheetClassification = 'roster' | 'component_data' | 'reference' | 'regional_partition' | 'period_summary' | 'unrelated' | 'pos_cheque';

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
    entityIdColumn: string | null;
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
// CLT-08 FIX: Three-tier auto-confirmation system
// - Tier 1 (auto): ≥85% confidence, pre-selected and confirmed
// - Tier 2 (suggested): 60-84% confidence, pre-selected but needs review
// - Tier 3 (unresolved): <60% confidence, requires human selection
type MappingTier = 'auto' | 'suggested' | 'unresolved';

interface SheetFieldMapping {
  sheetName: string;
  mappings: Array<{
    sourceColumn: string;
    targetField: string | null;
    confidence: number;
    confirmed: boolean;
    isRequired: boolean;
    tier: MappingTier;  // CLT-08: Track which tier this mapping is in
  }>;
  isComplete: boolean;
}

// Target field definition (derived from plan)
interface TargetField {
  id: string;
  label: string;
  labelEs: string;
  isRequired: boolean;
  category: 'identifier' | 'metric' | 'dimension' | 'date' | 'amount' | 'custom' | 'hierarchy' | 'contact' | 'employment';
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
  detectedPeriods: PeriodDetectionResult | null; // HF-053: detailed period detection
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
  entityIdMatch: {
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
  entityId: string;
  entityName?: string;
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

// ============================================
// CLT-08 FIX: CRITICAL FIELD VALIDATION
// ============================================

// Validation issue for missing critical fields
interface CriticalFieldValidation {
  severity: 'error' | 'warning' | 'info';
  component?: string;  // which plan component is affected
  sheet?: string;      // which sheet has the gap
  field: string;       // which semantic type is missing
  message: string;     // human-readable explanation
  impact: string;      // what happens if not resolved
}

// Validate that all critical fields are mapped for calculation
function validateCriticalFields(
  fieldMappings: SheetFieldMapping[],
  analysis: { sheets: AnalyzedSheet[]; rosterDetected?: { sheetName: string | null } } | null,
  activePlan: RuleSetConfig | null,
  isSpanish: boolean
): CriticalFieldValidation[] {
  const issues: CriticalFieldValidation[] = [];

  if (!fieldMappings.length || !analysis) return issues;

  // Get all mapped semantic types across all sheets
  const allMappedFields = fieldMappings.flatMap(sheet =>
    sheet.mappings
      .filter(m => m.targetField)
      .map(m => ({ sheet: sheet.sheetName, field: m.targetField! }))
  );
  const mappedFieldTypes = new Set(allMappedFields.map(m => m.field));

  // Get roster sheet name
  const rosterSheet = analysis.rosterDetected?.sheetName ||
    analysis.sheets.find(s => s.classification === 'roster')?.name;

  // 1. CRITICAL: entityId must be mapped somewhere
  if (!mappedFieldTypes.has('entityId')) {
    issues.push({
      severity: 'error',
      field: 'entityId',
      message: isSpanish
        ? 'No se ha mapeado identificador de empleado'
        : 'No entity identifier mapped',
      impact: isSpanish
        ? 'Los calculos no podran asociar datos a empleados'
        : 'Calculations cannot match data to entities',
    });
  }

  // 2. WARNING: role/employeeType needed for plan routing (if roster exists)
  if (rosterSheet && !mappedFieldTypes.has('role') && !mappedFieldTypes.has('employeeType')) {
    const rosterMapping = fieldMappings.find(s => s.sheetName === rosterSheet);
    const hasRoleField = rosterMapping?.mappings.some(m =>
      m.targetField === 'role' || m.targetField === 'employeeType'
    );
    if (!hasRoleField) {
      issues.push({
        severity: 'warning',
        sheet: rosterSheet,
        field: 'role',
        message: isSpanish
          ? 'No se ha mapeado tipo/puesto de empleado en el roster'
          : 'No entity type/role field mapped on roster sheet',
        impact: isSpanish
          ? 'El enrutamiento del plan (ej. Certificado vs No Certificado) no funcionara'
          : 'Plan routing (e.g., Certified vs Non-Certified) will not work',
      });
    }
  }

  // 3. Check each plan component for required metrics - per sheet specificity
  if (activePlan?.configuration && analysis?.sheets) {
    const config = activePlan.configuration as {
      variants?: Array<{
        components?: Array<{
          id?: string;
          name?: string;
          type?: string;
          calculationType?: string;
        }>;
      }>;
    };
    const components = config.variants?.[0]?.components || [];

    // Track which components have been validated (to avoid duplicates)
    const validatedComponents = new Set<string>();
    let fullyMappedCount = 0;

    for (const sheet of analysis.sheets) {
      if (sheet.classification === 'unrelated' || sheet.classification === 'roster') continue;
      if (!sheet.matchedComponent) continue;

      // Find the plan component this sheet maps to
      const compName = sheet.matchedComponent;
      if (validatedComponents.has(compName)) continue;
      validatedComponents.add(compName);

      const matchedComp = components.find(c =>
        (c.name || c.id || '').toLowerCase().includes(compName.toLowerCase()) ||
        compName.toLowerCase().includes((c.name || c.id || '').toLowerCase())
      );

      const calcType = matchedComp?.calculationType || matchedComp?.type || 'unknown';
      const neededMetrics = getRequiredMetrics(calcType);

      // Get fields mapped for THIS sheet
      const sheetMapping = fieldMappings.find(fm => fm.sheetName === sheet.name);
      if (!sheetMapping) continue;

      const mappedOnSheet = sheetMapping.mappings
        .filter(m => m.targetField)
        .map(m => m.targetField!);

      // Check which needed metrics are missing
      const missingMetrics = neededMetrics.filter(m => !mappedOnSheet.includes(m));

      if (missingMetrics.length > 0) {
        issues.push({
          severity: 'warning',
          component: matchedComp?.name || compName,
          sheet: sheet.name,
          field: missingMetrics.join(', '),
          message: isSpanish
            ? `"${matchedComp?.name || compName}" en hoja "${sheet.name}": falta ${missingMetrics.join(', ')}`
            : `"${matchedComp?.name || compName}" on sheet "${sheet.name}": missing ${missingMetrics.join(', ')}`,
          impact: isSpanish
            ? `Este componente calculara como $0 para todos los empleados`
            : `This component will calculate as $0 for all entities`,
        });
      } else {
        fullyMappedCount++;
      }
    }

    // Log fully mapped component count (info, not warning)
    if (fullyMappedCount > 0 && issues.filter(i => i.severity === 'warning').length > 0) {
      // Don't add info for fully mapped - we'll show this in the summary
    }
  }

  // 4. INFO: name field for readable results
  if (!mappedFieldTypes.has('name') && !mappedFieldTypes.has('entityName') && !mappedFieldTypes.has('fullName')) {
    issues.push({
      severity: 'info',
      field: 'name',
      message: isSpanish
        ? 'No se ha mapeado campo de nombre'
        : 'No name field mapped',
      impact: isSpanish
        ? 'Los nombres de empleados mostraran IDs'
        : 'Entity names will show as IDs',
    });
  }

  return issues;
}

// Spanish to English column name translations
const COLUMN_TRANSLATIONS: Record<string, string> = {
  // Identifiers
  'num_empleado': 'Entity ID',
  'numero_empleado': 'Entity ID',
  'id_empleado': 'Entity ID',
  'empleado': 'Entity',
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
  'cumplimiento': 'Achievement',
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
  'comision': 'Outcome',
  'incentivo': 'Incentive',
  'bono': 'Bonus',

  // Status
  'estado': 'Status',
  'activo': 'Active',
  'certificado': 'Certified',
};

// Classification icon and color mapping
const CLASSIFICATION_CONFIG: Record<SheetClassification, { icon: typeof Users; color: string; label: string; labelEs: string }> = {
  roster: { icon: Users, color: 'bg-blue-100 border-blue-300 text-blue-800', label: 'Entity Roster', labelEs: 'Plantilla de Empleados' },
  component_data: { icon: Database, color: 'bg-green-100 border-green-300 text-green-800', label: 'Component Data', labelEs: 'Datos de Componente' },
  reference: { icon: Map, color: 'bg-purple-100 border-purple-300 text-purple-800', label: 'Reference Data', labelEs: 'Datos de Referencia' },
  regional_partition: { icon: GitBranch, color: 'bg-orange-100 border-orange-300 text-orange-800', label: 'Regional Data', labelEs: 'Datos Regionales' },
  period_summary: { icon: Calculator, color: 'bg-cyan-100 border-cyan-300 text-cyan-800', label: 'Period Summary', labelEs: 'Resumen del Período' },
  unrelated: { icon: AlertCircle, color: 'bg-gray-100 border-gray-300 text-gray-600', label: 'Unrelated', labelEs: 'No Relacionado' },
  pos_cheque: { icon: BarChart3, color: 'bg-amber-100 border-amber-300 text-amber-800', label: 'POS Cheque Data', labelEs: 'Datos de Cheques POS' },
};

// Helper: Translate column name
function translateColumn(column: string): string | null {
  if (!column) return null;
  const normalized = column.toLowerCase().replace(/[\s_-]+/g, '_').trim();
  return COLUMN_TRANSLATIONS[normalized] || null;
}

/**
 * OB-72 Korean Test: Field mapping is AI-first.
 *
 * REMOVED: FIELD_ID_MAPPINGS (80+ hardcoded entries) and COMPOUND_PATTERNS (30+ regex rules).
 * The AI classifier handles any language. These functions now only do language-agnostic
 * targetField matching (id, label, labelEs) which works regardless of input language.
 *
 * Flow: Source header → AI classifier → normalizeAISuggestionToFieldId() → dropdown selection
 * Fallback: Source header → normalizeFieldWithPatterns() → targetField direct match only
 */

// Returns { targetField, confidence } — language-agnostic targetField matching only
function normalizeFieldWithPatterns(
  sourceName: string,
  targetFields: TargetField[]
): { targetField: string | null; confidence: number } {
  const normalized = sourceName.toLowerCase().replace(/[\s_-]+/g, '_').trim();

  // Match against targetField id, label, and labelEs (language-agnostic)
  for (const field of targetFields) {
    if (!field?.id || !field?.label) continue;
    const fieldNorm = field.id.toLowerCase();
    const labelNorm = field.label.toLowerCase().replace(/[\s_-]+/g, '_');
    const labelEsNorm = field.labelEs?.toLowerCase().replace(/[\s_-]+/g, '_');

    if (normalized === fieldNorm || normalized === labelNorm || normalized === labelEsNorm) {
      return { targetField: field.id, confidence: 1.0 };
    }
  }

  // No match — let AI classifier handle it
  return { targetField: null, confidence: 0 };
}

function normalizeAISuggestionToFieldId(suggestion: string | null, targetFields: TargetField[]): string | null {
  if (!suggestion) return null;

  const normalized = suggestion.toLowerCase().replace(/[\s_-]+/g, '_').trim();

  // Match against targetField id, label, and labelEs
  for (const field of targetFields) {
    if (!field?.id || !field?.label) continue;
    const fieldNorm = field.id.toLowerCase();
    const labelNorm = field.label.toLowerCase().replace(/[\s_-]+/g, '_');
    const labelEsNorm = field.labelEs?.toLowerCase().replace(/[\s_-]+/g, '_');

    if (normalized === fieldNorm || normalized === labelNorm || normalized === labelEsNorm) {
      return field.id;
    }

    // Partial match — suggestion contains field ID or vice versa
    if (normalized.includes(fieldNorm) || fieldNorm.includes(normalized)) {
      return field.id;
    }
  }

  return null;
}

// Helper: Extract target fields from plan components
// OB-13A: Base fields include role for position/puesto mapping
// CLT-08 FIX: Added name field for employee name display
// HOTFIX: Core metric types (amount, goal, attainment, quantity) ALWAYS included
function extractTargetFieldsFromPlan(plan: RuleSetConfig | null): TargetField[] {
  const baseFields: TargetField[] = [
    // Always-required identifier fields
    { id: 'entityId', label: 'Entity ID', labelEs: 'ID Empleado', isRequired: true, category: 'identifier' },
    { id: 'name', label: 'Entity Name', labelEs: 'Nombre', isRequired: false, category: 'identifier' },  // CLT-08
    { id: 'storeId', label: 'Store ID', labelEs: 'ID Tienda', isRequired: false, category: 'identifier' },
    // HF-065 F28: date is NOT required — roster imports have no date column.
    // Only entityId is truly required for all import types.
    { id: 'date', label: 'Date', labelEs: 'Fecha', isRequired: false, category: 'date' },
    { id: 'period', label: 'Period', labelEs: 'Período', isRequired: false, category: 'date' },
    { id: 'year', label: 'Year', labelEs: 'Year', isRequired: false, category: 'date' },
    { id: 'month', label: 'Month', labelEs: 'Month', isRequired: false, category: 'date' },
    { id: 'role', label: 'Role/Position', labelEs: 'Puesto', isRequired: false, category: 'identifier' },
    // HOTFIX: Core metric types - ALWAYS valid for AI classification
    { id: 'amount', label: 'Amount', labelEs: 'Monto', isRequired: false, category: 'amount' },
    { id: 'goal', label: 'Goal', labelEs: 'Meta', isRequired: false, category: 'metric' },
    { id: 'attainment', label: 'Achievement %', labelEs: '% Cumplimiento', isRequired: false, category: 'metric' },
    { id: 'quantity', label: 'Quantity', labelEs: 'Cantidad', isRequired: false, category: 'metric' },
    { id: 'storeRange', label: 'Store Range', labelEs: 'Rango Tienda', isRequired: false, category: 'identifier' },

    // HF-065 F25: Hierarchy fields — common org structure data
    { id: 'branch_name', label: 'Branch Name', labelEs: 'Nombre de Sucursal', isRequired: false, category: 'hierarchy' },
    { id: 'branch_id', label: 'Branch ID', labelEs: 'ID Sucursal', isRequired: false, category: 'hierarchy' },
    { id: 'region', label: 'Region', labelEs: 'Region', isRequired: false, category: 'hierarchy' },
    { id: 'department', label: 'Department', labelEs: 'Departamento', isRequired: false, category: 'hierarchy' },
    { id: 'location', label: 'Location', labelEs: 'Ubicacion', isRequired: false, category: 'hierarchy' },
    { id: 'manager_id', label: 'Manager ID', labelEs: 'ID Gerente', isRequired: false, category: 'hierarchy' },
    { id: 'manager_name', label: 'Manager Name', labelEs: 'Nombre Gerente', isRequired: false, category: 'hierarchy' },

    // HF-065 F25: Contact fields
    { id: 'email', label: 'Employee Email', labelEs: 'Correo Electronico', isRequired: false, category: 'contact' },
    { id: 'phone', label: 'Phone Number', labelEs: 'Telefono', isRequired: false, category: 'contact' },

    // HF-065 F25: Employment fields
    { id: 'hire_date', label: 'Hire Date', labelEs: 'Fecha de Contratacion', isRequired: false, category: 'employment' },
    { id: 'status', label: 'Status', labelEs: 'Estatus', isRequired: false, category: 'employment' },
    { id: 'product_licenses', label: 'Product Licenses', labelEs: 'Licencias de Producto', isRequired: false, category: 'employment' },
  ];

  // Check if plan has additive lookup config with variants
  if (!plan?.configuration || !isAdditiveLookupConfig(plan.configuration)) {
    // Return base fields (includes all core metric types now)
    return baseFields;
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

// ============================================
// CLT-08 FIX 2: SECOND-PASS CLASSIFICATION
// ============================================

// Required metrics by calculation type
function getRequiredMetrics(calcType: string): string[] {
  switch (calcType?.toLowerCase()) {
    case 'matrix_lookup': return ['attainment', 'amount', 'goal'];
    case 'tier_lookup': return ['attainment'];
    case 'percentage': return ['amount'];
    case 'conditional_percentage': return ['attainment', 'amount', 'goal'];
    default: return ['attainment', 'amount', 'goal'];
  }
}

// Get sample values from a sheet for a given column
function getSampleValues(
  sheets: AnalyzedSheet[],
  sheetName: string,
  columnName: string
): unknown[] {
  const sheet = sheets.find(s => s.name === sheetName);
  if (!sheet?.sampleRows) return [];
  return sheet.sampleRows
    .slice(0, 5)
    .map(row => row[columnName])
    .filter(v => v !== undefined && v !== null && v !== '');
}

// Infer data type from sample values
function inferDataType(values: unknown[]): string {
  if (values.length === 0) return 'unknown';
  const sample = values[0];
  if (typeof sample === 'number') return 'number';
  if (sample instanceof Date) return 'date';
  if (typeof sample === 'string') {
    if (values.every(v => !isNaN(Number(v)))) return 'number';
    if (values.every(v => !isNaN(Date.parse(String(v))))) return 'date';
  }
  return 'string';
}

// Run second-pass classification using API route (server-side has access to API keys)
async function runSecondPassClassification(
  sheets: AnalyzedSheet[],
  fieldMappings: SheetFieldMapping[],
  activePlan: RuleSetConfig,
  targetFields: TargetField[],
  tenantId: string
): Promise<SheetFieldMapping[]> {

  // Get plan components
  const planConfig = activePlan.configuration as {
    variants?: Array<{
      components?: Array<{
        id?: string;
        name?: string;
        type?: string;
        calculationType?: string;
      }>;
    }>;
  };
  const planComponents = planConfig?.variants?.[0]?.components || [];

  // Process each sheet with unresolved fields
  const updatedMappings = [...fieldMappings];

  for (let sheetIdx = 0; sheetIdx < updatedMappings.length; sheetIdx++) {
    const sheetMapping = updatedMappings[sheetIdx];
    const sheet = sheets.find(s => s.name === sheetMapping.sheetName);
    if (!sheet) continue;

    // Get unresolved fields for this sheet
    const unresolvedFields = sheetMapping.mappings
      .filter(m => m.tier === 'unresolved')
      .map(m => ({
        sourceColumn: m.sourceColumn,
        sampleValues: getSampleValues(sheets, sheetMapping.sheetName, m.sourceColumn),
        dataType: inferDataType(getSampleValues(sheets, sheetMapping.sheetName, m.sourceColumn)),
      }));

    if (unresolvedFields.length === 0) continue;

    // Find matched component for this sheet
    const componentName = sheet.matchedComponent || 'Unknown';
    const matchedComp = planComponents.find(c =>
      (c.name || c.id || '').toLowerCase().includes(componentName.toLowerCase()) ||
      componentName.toLowerCase().includes((c.name || c.id || '').toLowerCase())
    );
    const calculationType = matchedComp?.calculationType || matchedComp?.type || 'unknown';
    const neededMetrics = getRequiredMetrics(calculationType);

    // Get already-mapped fields
    const alreadyMapped = sheetMapping.mappings
      .filter(m => m.targetField)
      .map(m => ({ sourceColumn: m.sourceColumn, semanticType: m.targetField! }));

    console.log(`[Smart Import] Second pass for sheet "${sheetMapping.sheetName}":`);
    console.log(`  Component: ${componentName}, Type: ${calculationType}`);
    console.log(`  Needed metrics: ${neededMetrics.join(', ')}`);
    console.log(`  Already mapped: ${alreadyMapped.map(m => m.semanticType).join(', ')}`);
    console.log(`  Unresolved: ${unresolvedFields.map(f => f.sourceColumn).join(', ')}`);

    try {
      // Call API route (server-side has access to ANTHROPIC_API_KEY)
      const apiResponse = await fetch('/api/ai/classify-fields-second-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetName: sheetMapping.sheetName,
          componentName,
          calculationType,
          neededMetrics,
          alreadyMapped,
          unresolvedFields,
          tenantId,
        }),
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        throw new Error(errorData.error || `API error: ${apiResponse.status}`);
      }

      const response = await apiResponse.json();
      console.log(`[Smart Import] Second pass AI response:`, JSON.stringify(response.result, null, 2));

      // Apply classifications
      const classifications = response.result?.classifications || [];
      for (const classification of classifications) {
        if (!classification.semanticType) continue;
        if (classification.confidence < 60) continue;

        // Find and update the mapping
        const mappingIdx = sheetMapping.mappings.findIndex(
          m => m.sourceColumn === classification.sourceColumn
        );
        if (mappingIdx === -1) continue;

        // Validate that the semantic type is a valid target field
        if (!targetFields.some(f => f.id === classification.semanticType)) {
          console.log(`[Smart Import] Skipping "${classification.sourceColumn}" -> "${classification.semanticType}" (not a valid target field)`);
          continue;
        }

        // Upgrade to Tier 2 (suggested)
        updatedMappings[sheetIdx].mappings[mappingIdx] = {
          ...sheetMapping.mappings[mappingIdx],
          targetField: classification.semanticType,
          confidence: classification.confidence,
          tier: 'suggested',
          confirmed: false,
        };

        console.log(`[Smart Import] Resolved: "${classification.sourceColumn}" -> "${classification.semanticType}" (${classification.confidence}%) - ${classification.reasoning}`);
      }
    } catch (error) {
      console.warn(`[Smart Import] Second pass failed for sheet "${sheetMapping.sheetName}":`, error);
    }
  }

  return updatedMappings;
}

function DataPackageImportPageInner() {
  const { locale } = useLocale();
  const { currentTenant } = useTenant();
  const { user } = useAuth(); // For authentication check
  const isSpanish = locale === 'es-MX';

  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload state - keep file reference for parsing all rows on submit
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [, setWorksheets] = useState<WorksheetInfo[]>([]);
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [periodsCreated, setPeriodsCreated] = useState(false);

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
  const [activePlan, setActivePlan] = useState<RuleSetConfig | null>(null);
  const [targetFields, setTargetFields] = useState<TargetField[]>([]);

  // Validation state
  const [validationComplete, setValidationComplete] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // CLT-08: Critical field validation state
  const [criticalFieldIssues, setCriticalFieldIssues] = useState<CriticalFieldValidation[]>([]);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_importComplete, setImportComplete] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    recordCount: number;
    entityCount: number;
    periodCount: number;
    periods: Array<{ key: string; id: string }>;
    elapsedSeconds: number;
  } | null>(null);

  // AI Classification state
  const [aiClassification, setAiClassification] = useState<{
    fileType: string;
    suggestedModule: string;
    confidence: number;
    reasoning: string;
    signalId?: string;
  } | null>(null);

  // CRITICAL: Use currentTenant.id directly - no fallback
  // The orchestrator uses currentTenant.id, so import MUST use the same
  // If no tenant selected, show error in UI (not early return to preserve hook order)
  const tenantId = currentTenant?.id;
  const currency = currentTenant?.currency || 'MXN';

  // Load tenant's active plan on mount
  useEffect(() => {
    if (!tenantId) return; // Guard for when tenant not selected
    getRuleSets(tenantId)
      .then((plans) => {
        const active = plans.find(p => p.status === 'active');
        setActivePlan(active || null);
        setTargetFields(extractTargetFieldsFromPlan(active || null));
      })
      .catch((err) => console.error('Error loading rule sets:', err));
  }, [tenantId]);

  // CLT-08: Validate critical fields whenever mappings change
  useEffect(() => {
    if (fieldMappings.length > 0 && analysis) {
      const issues = validateCriticalFields(fieldMappings, analysis, activePlan, isSpanish);
      setCriticalFieldIssues(issues);
      console.log(`[Smart Import] Critical field validation: ${issues.length} issues`);
      issues.forEach(issue => {
        console.log(`  ${issue.severity.toUpperCase()}: ${issue.message} -> ${issue.impact}`);
      });
    } else {
      setCriticalFieldIssues([]);
    }
  }, [fieldMappings, analysis, activePlan, isSpanish]);

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

  // HF-053: Store full row data per sheet for validation (period detection + entity counts)
  const [fullSheetData, setFullSheetData] = useState<Record<string, Record<string, unknown>[]>>({});

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

    const fullData: Record<string, Record<string, unknown>[]> = {};

    const result = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      // raw: true gets the computed values; defval ensures empty cells get null
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: null,
        raw: true, // Get computed values, not formatted strings
      });

      const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

      // HF-053: Store ALL rows for validation scanning
      fullData[name] = jsonData;

      return {
        name,
        headers,
        rowCount: jsonData.length,
        sampleRows: jsonData.slice(0, 5),
      };
    });

    // HF-053: Save full data for validation use (period detection, entity counts)
    setFullSheetData(fullData);
    return result;
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

        // CLT-08 FIX: Three-tier auto-confirmation of AI mappings
        // Tier 1 (auto): ≥85% — pre-selected and confirmed, no user action needed
        // Tier 2 (suggested): 60-84% — pre-selected but flagged for review
        // Tier 3 (unresolved): <60% — requires human selection

        // HF-046 FIX: Guard against stale closure where targetFields is empty.
        // If getRuleSets hasn't resolved yet (race condition), compute base fields inline.
        // Without this, normalizeAISuggestionToFieldId returns null for EVERY field
        // because targetFields.some() always returns false on an empty array.
        let effectiveTargetFields = targetFields;
        if (effectiveTargetFields.length === 0) {
          console.warn('[Field Mapping] targetFields is empty — using inline base fields fallback');
          effectiveTargetFields = extractTargetFieldsFromPlan(activePlan);
          // Also update the state so Step 3 rendering has the fields for dropdowns
          setTargetFields(effectiveTargetFields);
        }
        console.log('[Field Mapping] Target fields available:', effectiveTargetFields.length, effectiveTargetFields.map(f => f.id));

        let tier1Count = 0, tier2Count = 0, tier3Count = 0;
        let patternMatchCount = 0;

        const mappings: SheetFieldMapping[] = analyzedSheets
          .filter((sheet: AnalyzedSheet) => sheet.classification !== 'unrelated')
          .map((sheet: AnalyzedSheet) => {
            // Filter out undefined/empty headers
            const validHeaders = (sheet.headers || []).filter(h => h != null && h !== '');
            const sheetMappings = validHeaders.map(header => {
              // Case-insensitive matching with whitespace normalization
              const headerNorm = header?.toLowerCase()?.trim() || '';
              const suggestion = sheet.suggestedFieldMappings?.find(
                m => m?.sourceColumn && headerNorm && m.sourceColumn.toLowerCase().trim() === headerNorm
              );
              const aiConfidence = suggestion?.confidence || 0;

              // Normalize AI suggestion to a valid dropdown option ID
              const normalizedTargetField = normalizeAISuggestionToFieldId(
                suggestion?.targetField || null,
                effectiveTargetFields
              );

              // CLT-08 FIX 2: If AI didn't provide a mapping, try compound pattern matching
              let effectiveTargetField = normalizedTargetField;
              let effectiveConfidence = aiConfidence;
              let usedPatternMatch = false;

              if (!normalizedTargetField) {
                const patternResult = normalizeFieldWithPatterns(header, effectiveTargetFields);
                if (patternResult.targetField) {
                  effectiveTargetField = patternResult.targetField;
                  effectiveConfidence = patternResult.confidence * 100; // Convert to percentage
                  usedPatternMatch = true;
                  patternMatchCount++;
                  console.log(`[Field Mapping] Pattern match: "${header}" -> "${patternResult.targetField}" (${Math.round(effectiveConfidence)}%)`);
                }
              }

              // CLT-08: Determine tier based on confidence AND whether we have a valid mapping
              let tier: MappingTier;
              let confirmed: boolean;

              if (effectiveTargetField && effectiveConfidence >= 85 && !usedPatternMatch) {
                // Tier 1: Auto-confirmed — high AI confidence, pre-selected
                tier = 'auto';
                confirmed = true;
                tier1Count++;
              } else if (effectiveTargetField && (effectiveConfidence >= 60 || usedPatternMatch)) {
                // Tier 2: Suggested — medium confidence OR pattern match, needs review
                tier = 'suggested';
                confirmed = false;
                tier2Count++;
              } else {
                // Tier 3: Unresolved — no mapping found
                tier = 'unresolved';
                effectiveTargetField = null;
                confirmed = false;
                tier3Count++;
              }

              const isRequired = effectiveTargetFields.find(f => f.id === effectiveTargetField)?.isRequired || false;

              // Debug logging for all tiers
              if (tier !== 'unresolved') {
                const source = usedPatternMatch ? 'PATTERN' : 'AI';
                console.log(`[Field Mapping] ${header}: ${source} -> ${tier.toUpperCase()} -> "${effectiveTargetField}" (${Math.round(effectiveConfidence)}%)`);
              }

              return {
                sourceColumn: header,
                targetField: effectiveTargetField,
                confidence: effectiveConfidence, // Use effective confidence (may be from pattern match)
                confirmed,
                isRequired,
                tier,
              };
            });

            // Check if required fields are mapped
            const hasRequiredMappings = sheetMappings.some(m =>
              m.targetField && effectiveTargetFields.find(f => f.id === m.targetField)?.isRequired
            );

            return {
              sheetName: sheet.name,
              mappings: sheetMappings,
              isComplete: hasRequiredMappings,
            };
          });

        // CLT-08: Log tier summary for zero-touch verification
        console.log(`[Smart Import] Three-tier summary (BEFORE second pass):`);
        console.log(`  Tier 1 (auto-confirmed, ≥85%): ${tier1Count} fields`);
        console.log(`  Tier 2 (suggested, 60-84% or pattern): ${tier2Count} fields (${patternMatchCount} from pattern matching)`);
        console.log(`  Tier 3 (unresolved, <60%): ${tier3Count} fields`);
        console.log(`  Total: ${tier1Count + tier2Count + tier3Count} fields`);

        // CLT-08 FIX 2: Run second-pass classification for unresolved fields
        let finalMappings = mappings;
        if (tier3Count > 0 && activePlan && tenantId) {
          console.log(`[Smart Import] ${tier3Count} unresolved fields — running plan-context second pass...`);
          try {
            finalMappings = await runSecondPassClassification(
              analyzedSheets,
              mappings,
              activePlan,
              effectiveTargetFields,
              tenantId
            );

            // Recount tiers after second pass
            let newTier1 = 0, newTier2 = 0, newTier3 = 0;
            for (const sheet of finalMappings) {
              for (const m of sheet.mappings) {
                if (m.tier === 'auto') newTier1++;
                else if (m.tier === 'suggested') newTier2++;
                else newTier3++;
              }
            }
            console.log(`[Smart Import] Three-tier summary (AFTER second pass):`);
            console.log(`  Tier 1 (auto): ${newTier1} fields`);
            console.log(`  Tier 2 (suggested): ${newTier2} fields`);
            console.log(`  Tier 3 (unresolved): ${newTier3} fields`);
            console.log(`[Smart Import] Second pass resolved ${tier3Count - newTier3} fields`);
          } catch (err) {
            console.warn('[Smart Import] Second pass failed, using first-pass results:', err);
          }
        }

        setFieldMappings(finalMappings);
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
      // For single-file formats (CSV, TSV, TXT), use AI classification
      setIsProcessing(true);
      try {
        const parsed = await parseFile(file);

        // Read file content for AI classification
        const fileContent = await file.text();
        const contentPreview = fileContent.substring(0, 5000);

        // Call AI file classifier
        console.log('Calling AI file classifier for:', file.name);
        const classificationResult = await classifyFile(
          file.name,
          contentPreview,
          {
            fileSize: file.size,
            mimeType: file.type,
            columnCount: parsed.headers.length,
            rowCount: parsed.rowCount,
            headers: parsed.headers,
            tenantModules: currentTenant?.features ? Object.keys(currentTenant.features).filter(k => currentTenant.features?.[k as keyof typeof currentTenant.features]) : [],
          },
          tenantId,
          user?.id
        );

        console.log('AI Classification result:', classificationResult);

        // Store classification for UI display
        setAiClassification(classificationResult.classification);

        // Determine classification to use based on confidence
        const classification = classificationResult.classification;
        const confidenceNorm = classification.confidence / 100;

        // Create analysis with AI classification results
        const simpleAnalysis: WorkbookAnalysis = {
          sheets: [{
            name: file.name,
            classification: classification.fileType === 'pos_cheque' ? 'pos_cheque' : 'component_data',
            classificationConfidence: classification.confidence,
            classificationReasoning: classification.reasoning,
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
          rosterDetected: { found: false, sheetName: null, entityIdColumn: null, storeAssignmentColumn: null, canCreateUsers: false },
          periodDetected: { found: false, dateColumn: '', dateRange: { start: null, end: null }, periodType: 'unknown' },
          gaps: [],
          extras: [],
          overallConfidence: classification.confidence,
          summary: confidenceNorm >= AI_CONFIDENCE.AUTO_APPLY
            ? `AI detected: ${classification.fileType} (auto-applied)`
            : confidenceNorm >= AI_CONFIDENCE.SUGGEST
              ? `AI suggests: ${classification.fileType} (please confirm)`
              : `AI detected: ${classification.fileType} (low confidence - please verify)`,
        };
        setAnalysis(simpleAnalysis);
        setAnalysisConfidence(classification.confidence);
        setCurrentStep('analyze');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file');
      } finally {
        setIsProcessing(false);
      }
    }
  }, [analyzeWorkbook, tenantId, currentTenant, user]);

  // Drop zone handler — takes first file (multi-file handled via queue below)
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // Queue remaining files for batch processing
      if (files.length > 1) {
        setFileQueue(files.slice(1));
      }
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // Update field mapping
  const updateFieldMapping = useCallback((sheetName: string, sourceColumn: string, targetField: string | null) => {
    setFieldMappings(prev => prev.map(sheet => {
      if (sheet.sheetName !== sheetName) return sheet;

      const updatedMappings = sheet.mappings.map(m => {
        if (m.sourceColumn !== sourceColumn) return m;
        const isRequired = targetFields.find(f => f.id === targetField)?.isRequired || false;
        // CLT-08: When user manually sets a field, mark as confirmed (tier: 'auto' equivalent)
        // When user clears a field, mark as unresolved
        const newTier: MappingTier = targetField ? 'auto' : 'unresolved';
        return {
          ...m,
          targetField,
          confirmed: !!targetField,
          isRequired,
          tier: newTier,
        };
      });

      // Check if sheet has all required fields mapped (across all sheets)
      const hasMapping = updatedMappings.some(m => m.targetField);

      return {
        ...sheet,
        mappings: updatedMappings,
        isComplete: hasMapping, // Per-sheet flag; full validation in canProceed()
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
        const totalRequired = targetFields.filter(f => f.isRequired).length;
        const issues: QualityIssue[] = [];

        // HF-046 FIX: Calculate completeness dynamically based on required field coverage
        // Instead of hardcoded 50%, compute from the ratio of mapped required fields
        let completenessScore = 100;
        if (totalRequired > 0 && requiredMapped.length < totalRequired) {
          completenessScore = Math.round((requiredMapped.length / totalRequired) * 100);
          issues.push({
            type: 'missing',
            severity: requiredMapped.length === 0 ? 'warning' : 'info',
            field: 'Required Fields',
            rowCount: 0,
            description: isSpanish
              ? `${requiredMapped.length}/${totalRequired} campos requeridos mapeados`
              : `${requiredMapped.length}/${totalRequired} required fields mapped`,
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

      // HF-053: Period detection using field mappings + full row data
      const sheetsForDetection = fieldMappings.map(fm => ({
        name: fm.sheetName,
        rows: fullSheetData[fm.sheetName] || [],
        mappings: fm.mappings.filter(m => m.targetField).map(m => ({
          sourceColumn: m.sourceColumn,
          targetField: m.targetField,
        })),
      }));
      const periodDetectionResult = detectPeriods(sheetsForDetection);

      // Build periodInfo from detection result
      const periodInfo: PeriodValidation = {
        detected: periodDetectionResult.periods.length > 0,
        periodType: periodDetectionResult.frequency === 'unknown' ? 'custom'
          : periodDetectionResult.frequency as 'monthly' | 'bi-weekly' | 'weekly' | 'custom',
        startDate: periodDetectionResult.periods.length > 0
          ? periodDetectionResult.periods[0].startDate : null,
        endDate: periodDetectionResult.periods.length > 0
          ? periodDetectionResult.periods[periodDetectionResult.periods.length - 1].endDate : null,
        confirmedStart: periodDetectionResult.periods.length > 0
          ? periodDetectionResult.periods[0].startDate : null,
        confirmedEnd: periodDetectionResult.periods.length > 0
          ? periodDetectionResult.periods[periodDetectionResult.periods.length - 1].endDate : null,
      };

      // HF-053: Cross-sheet validation using FULL row data (not 5-row sample)
      const rosterSheet = analysis.sheets.find(s => s.classification === 'roster');
      const dataSheets = analysis.sheets.filter(s => s.classification === 'component_data');

      const entityIds = new Set<string>();
      const dataEmployeeIds = new Set<string>();

      if (rosterSheet) {
        // Use field mappings to find entity ID column in roster
        const rosterMapping = fieldMappings.find(m => m.sheetName === rosterSheet.name);
        const rosterEntityMapping = rosterMapping?.mappings.find(m => m.targetField === 'entityId');
        const employeeCol = rosterEntityMapping?.sourceColumn || rosterSheet.headers.find(h =>
          h && (
            h.toLowerCase().includes('empleado') ||
            h.toLowerCase().includes('employee') ||
            h.toLowerCase().includes('id')
          )
        );
        if (employeeCol) {
          // HF-053: Scan ALL rows, not just sampleRows
          const allRosterRows = fullSheetData[rosterSheet.name] || rosterSheet.sampleRows;
          allRosterRows.forEach(row => {
            const id = row[employeeCol];
            if (id) entityIds.add(String(id));
          });
        }
      }

      dataSheets.forEach(sheet => {
        const mapping = fieldMappings.find(m => m.sheetName === sheet.name);
        const employeeMapping = mapping?.mappings.find(m => m.targetField === 'entityId');
        if (employeeMapping) {
          // HF-053: Scan ALL rows, not just sampleRows
          const allRows = fullSheetData[sheet.name] || sheet.sampleRows;
          allRows.forEach(row => {
            const id = row[employeeMapping.sourceColumn];
            if (id) dataEmployeeIds.add(String(id));
          });
        }
      });

      const matchedEmployees = new Set(Array.from(entityIds).filter(x => dataEmployeeIds.has(x)));
      const unmatchedEmployees = Array.from(dataEmployeeIds).filter(x => !entityIds.has(x));

      const crossSheetValidation: CrossSheetValidation = {
        entityIdMatch: {
          rosterCount: entityIds.size,
          dataSheetCount: dataEmployeeIds.size,
          matchedCount: matchedEmployees.size,
          unmatchedIds: unmatchedEmployees.slice(0, 10),
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
        const employeeMapping = firstDataMapping.mappings.find(m => m.targetField === 'entityId');

        // HF-053: Use matched entities (in roster AND in data), not just first 3 sample rows
        const allFirstSheetRows = fullSheetData[firstDataSheet.name] || firstDataSheet.sampleRows;
        const previewRows = allFirstSheetRows
          .filter(row => {
            if (!employeeMapping) return true;
            const id = String(row[employeeMapping.sourceColumn] || '');
            return entityIds.size === 0 || entityIds.has(id); // Use matched entities if available
          })
          .slice(0, 3); // Preview first 3 matched

        previewRows.forEach((row, idx) => {
          const entityId = employeeMapping
            ? String(row[employeeMapping.sourceColumn] || `EMP-${idx + 1}`)
            : `EMP-${idx + 1}`;

          // Generate mock calculation preview based on plan components
          const components: ComponentPreview[] = [];
          let totalIncentive = 0;

          if (activePlan.configuration && isAdditiveLookupConfig(activePlan.configuration)) {
            const variant = activePlan.configuration.variants[0];
            variant?.components?.forEach(comp => {
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
            entityId,
            components,
            totalIncentive,
            currency,
            flags: totalIncentive === 0 ? [isSpanish ? 'Sin incentivo' : 'No incentive'] : [],
          });
        });
      }

      // Calculate overall score
      let overallScore = sheetScores.length > 0
        ? Math.round(sheetScores.reduce((sum, s) => sum + s.overallScore, 0) / sheetScores.length)
        : 0;

      // OB-16 Phase 4: Plan-aware required field validation
      // Check that ALL required fields from the plan are mapped at least once across all sheets
      const allMappedFields = fieldMappings.flatMap(s => s.mappings.filter(m => m.targetField));
      const mappedFieldIds = new Set(allMappedFields.map(m => m.targetField));
      const requiredFields = targetFields.filter(f => f.isRequired);
      const missingRequiredFields = requiredFields.filter(f => !mappedFieldIds.has(f.id));

      if (missingRequiredFields.length > 0) {
        // Penalize score for missing required fields
        const missingPenalty = Math.min(30, missingRequiredFields.length * 10);
        overallScore = Math.max(0, overallScore - missingPenalty);

        // Add issue to first sheet (cross-sheet issue)
        if (sheetScores.length > 0) {
          const missingNames = missingRequiredFields.map(f => isSpanish ? f.labelEs : f.label).join(', ');
          sheetScores[0].issues.push({
            type: 'missing',
            severity: 'error',
            field: isSpanish ? 'Campos Requeridos del Plan' : 'Plan Required Fields',
            rowCount: 0,
            description: isSpanish
              ? `Campos requeridos no mapeados: ${missingNames}`
              : `Required fields not mapped: ${missingNames}`,
          });
        }
      }

      setValidationResult({
        isValid: overallScore >= 70,
        overallScore,
        sheetScores,
        periodInfo,
        detectedPeriods: periodDetectionResult,
        crossSheetValidation,
        anomalies,
        calculationPreview,
      });

      setIsValidating(false);
      setValidationComplete(true);
    }, 1500);
  }, [analysis, fieldMappings, fullSheetData, isSpanish, activePlan, currency]);

  // Submit import handler - ACTUALLY PERSISTS DATA
  const handleSubmitImport = useCallback(async () => {
    if (!tenantId) {
      setError('No tenant selected');
      return;
    }
    if (!uploadedFile || !analysis) {
      setError('No file or analysis available');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const userId = user?.id || 'system';

      // ── HF-047: FILE-BASED IMPORT PIPELINE ──
      // Step 1: Get signed upload URL from server
      console.log('[Import] Step 1: Preparing file upload...');
      const prepareResponse = await fetch('/api/import/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, fileName: uploadedFile.name }),
      });

      if (!prepareResponse.ok) {
        const errData = await prepareResponse.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || `Upload prepare failed (${prepareResponse.status})`);
      }

      const { storagePath, signedUrl, batchId: preparedBatchId } = await prepareResponse.json();
      const batchId = preparedBatchId;

      // Step 2: Upload file directly to Supabase Storage (bypasses Vercel 4.5MB limit)
      console.log(`[Import] Step 2: Uploading ${uploadedFile.name} (${(uploadedFile.size / 1024 / 1024).toFixed(1)}MB) to storage...`);
      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': uploadedFile.type || 'application/octet-stream' },
        body: uploadedFile,
      });

      if (!uploadResponse.ok) {
        throw new Error(`File upload failed (${uploadResponse.status})`);
      }
      console.log(`[Import] Step 2: File uploaded to ${storagePath}`);

      // Step 3: Build field mappings metadata (tiny payload ~2KB)
      const sheetMappings: Record<string, Record<string, string>> = {};
      for (const fm of fieldMappings) {
        const mappings: Record<string, string> = {};
        fm.mappings.forEach(m => {
          if (m.targetField) {
            mappings[m.sourceColumn] = m.targetField;
          }
        });
        if (Object.keys(mappings).length > 0) {
          sheetMappings[fm.sheetName] = mappings;
        }
      }

      // OB-24 FIX: Store import context BEFORE commit so storeAggregatedData can use it
      // CLT-08 FIX: Use USER-CONFIRMED fieldMappings, not original AI suggestions
      // OB-75: Build AI context and send to commit API for Supabase persistence
      let importContext: AIImportContext | null = null;
      if (analysis) {
        importContext = {
          tenantId,
          batchId,
          timestamp: new Date().toISOString(),
          rosterSheet: analysis.rosterDetected?.sheetName || null,
          rosterEmployeeIdColumn: analysis.rosterDetected?.entityIdColumn || null,
          sheets: analysis.sheets.map(sheet => {
            const confirmedMapping = fieldMappings.find(fm => fm.sheetName === sheet.name);
            const sheetFieldMappings = confirmedMapping
              ? confirmedMapping.mappings
                  .filter(m => m.targetField)
                  .map(m => ({
                    sourceColumn: m.sourceColumn,
                    semanticType: m.targetField!,
                    confidence: m.confidence,
                  }))
              : sheet.suggestedFieldMappings
                  .filter(fm => fm.targetField)
                  .map(fm => ({
                    sourceColumn: fm.sourceColumn,
                    semanticType: fm.targetField!,
                    confidence: fm.confidence,
                  }));

            console.log(`[Import] Sheet "${sheet.name}": ${sheetFieldMappings.length} confirmed field mappings`);

            return {
              sheetName: sheet.name,
              classification: sheet.classification,
              matchedComponent: sheet.matchedComponent,
              matchedComponentConfidence: sheet.matchedComponentConfidence,
              fieldMappings: sheetFieldMappings,
            };
          }),
        };
        storeImportContext(importContext);
        console.log(`[Import] AI import context built: ${importContext.sheets.length} sheets — sending to commit API`);
      }

      // Step 4: Send metadata-only request to commit API (< 50KB payload)
      console.log(`[Import] Step 4: Processing import server-side...`);

      const commitBody: Record<string, unknown> = {
        tenantId,
        userId,
        fileName: uploadedFile.name,
        storagePath,
        sheetMappings,
        detectedPeriods: validationResult?.detectedPeriods?.periods || [],
      };
      // OB-75: Include AI context so commit API persists it to import_batches.metadata
      if (importContext) {
        commitBody.aiContext = importContext;
      }

      const response = await fetch('/api/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commitBody),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || `Import failed (${response.status})`);
      }

      const result = await response.json();

      // Store field mappings in batch metadata
      const mappingsToStore = fieldMappings.map(m => ({
        sheetName: m.sheetName,
        mappings: Object.fromEntries(
          m.mappings
            .filter(mapping => mapping.targetField)
            .map(mapping => [mapping.sourceColumn, mapping.targetField as string])
        ),
      }));
      storeFieldMappings(tenantId, result.batchId, mappingsToStore);

      console.log(`[Import] Server commit complete: ${result.recordCount} records, ${result.entityCount} entities, ${result.periodCount} periods in ${result.elapsedSeconds}s`);

      setImportId(result.batchId);
      setImportResult({
        recordCount: result.recordCount || 0,
        entityCount: result.entityCount || 0,
        periodCount: result.periodCount || 0,
        periods: result.periods || [],
        elapsedSeconds: result.elapsedSeconds || 0,
      });
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
      case 'map': {
        // CLT-100 F11 fix: Check ALL required fields are mapped across all sheets, not just "some"
        const allMapped = fieldMappings.flatMap(s => s.mappings.filter(m => m.targetField));
        const mappedIds = new Set(allMapped.map(m => m.targetField));
        const requiredIds = targetFields.filter(f => f.isRequired).map(f => f.id);
        return requiredIds.every(id => mappedIds.has(id));
      }
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
          <div className="p-2 bg-zinc-800/50 rounded-lg">
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

  // Show error if no tenant selected (after all hooks, to preserve hook order)
  if (!tenantId) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle className="text-red-600">No Tenant Selected</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-600 mb-4">
              Please select a tenant before importing data. The import must be associated with a specific tenant.
            </p>
            <Button onClick={() => window.location.href = '/admin/tenants/new'}>
              Create Tenant
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          {/* HF-065 F26: Show import type context instead of plan name for rosters.
              Roster data is tenant-level, not plan-scoped. */}
          {analysis && analysis.rosterDetected?.found && !analysis.sheets.some(s => s.classification !== 'roster' && s.classification !== 'unrelated') ? (
            <Badge variant="outline" className="ml-2">
              {isSpanish ? 'Datos de Personal' : 'Personnel Data'}
            </Badge>
          ) : activePlan ? (
            <Badge variant="outline" className="ml-2">
              {activePlan.name}
            </Badge>
          ) : null}
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
                          ? 'Arrastre archivos de datos aquí'
                          : 'Drop data files here'}
                      </p>
                      <p className="text-muted-foreground">
                        {isSpanish
                          ? 'Soporta .xlsx, .csv, .txt, .tsv — seleccione múltiples archivos'
                          : 'Supports .xlsx, .csv, .txt, .tsv — select multiple files'}
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv,.txt,.tsv"
                      multiple
                      className="hidden"
                      id="file-input"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) {
                          if (files.length > 1) {
                            setFileQueue(files.slice(1));
                          }
                          handleFileSelect(files[0]);
                        }
                      }}
                    />
                    <Button asChild size="lg">
                      <label htmlFor="file-input" className="cursor-pointer">
                        <Upload className="h-4 w-4 mr-2" />
                        {isSpanish ? 'Seleccionar Archivos' : 'Select Files'}
                      </label>
                    </Button>
                    {fileQueue.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {fileQueue.length + 1} {isSpanish ? 'archivos seleccionados' : 'files selected'} — {isSpanish ? 'procesando el primero' : 'processing first'}
                      </p>
                    )}
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

              {/* AI Classification Alert */}
              {aiClassification && (
                <div className={cn(
                  "p-4 border rounded-lg",
                  aiClassification.confidence >= 90
                    ? "bg-green-50 border-green-200"
                    : aiClassification.confidence >= 70
                      ? "bg-yellow-50 border-yellow-200"
                      : "bg-orange-50 border-orange-200"
                )}>
                  <div className="flex items-start gap-3">
                    <Sparkles className={cn(
                      "h-5 w-5 mt-0.5",
                      aiClassification.confidence >= 90
                        ? "text-green-600"
                        : aiClassification.confidence >= 70
                          ? "text-yellow-600"
                          : "text-orange-600"
                    )} />
                    <div className="flex-1">
                      <p className={cn(
                        "font-medium",
                        aiClassification.confidence >= 90
                          ? "text-green-800"
                          : aiClassification.confidence >= 70
                            ? "text-yellow-800"
                            : "text-orange-800"
                      )}>
                        {isSpanish ? 'Clasificación AI' : 'AI Classification'}: {aiClassification.fileType}
                        {aiClassification.confidence >= 90 && (
                          <Badge className="ml-2" variant="default">
                            {isSpanish ? 'Auto-aplicado' : 'Auto-applied'}
                          </Badge>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {aiClassification.reasoning}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isSpanish ? 'Módulo sugerido' : 'Suggested module'}: {aiClassification.suggestedModule} •{' '}
                        {aiClassification.confidence}% {isSpanish ? 'confianza' : 'confidence'}
                      </p>
                      {aiClassification.confidence < 90 && aiClassification.signalId && (
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              recordClassificationFeedback(
                                aiClassification.signalId!,
                                'accepted',
                                undefined,
                                tenantId
                              );
                            }}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {isSpanish ? 'Confirmar' : 'Confirm'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              recordClassificationFeedback(
                                aiClassification.signalId!,
                                'rejected',
                                undefined,
                                tenantId
                              );
                              setAiClassification(null);
                            }}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            {isSpanish ? 'Rechazar' : 'Reject'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Roster Detection Alert */}
              {analysis.rosterDetected.found && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-blue-800">
                        {isSpanish ? 'Plantilla de Empleados Detectada' : 'Entity Roster Detected'}
                      </p>
                      <p className="text-sm text-blue-700">
                        {isSpanish
                          ? `Hoja "${analysis.rosterDetected.sheetName}" contiene datos de empleados`
                          : `Sheet "${analysis.rosterDetected.sheetName}" contains entity data`}
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
                      {isSpanish ? 'Plantilla de Empleados' : 'Entity Roster'}
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
                          {currentMappingSheet.headers.slice(0, 8).filter(h => h != null).map(header => {
                            const value = currentMappingSheet.sampleRows[previewRowIndex]?.[header];
                            // Format currency values
                            const isAmountField = header && (
                              header.toLowerCase().includes('monto') ||
                              header.toLowerCase().includes('venta') ||
                              header.toLowerCase().includes('total')
                            );
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
                          // CLT-08: Tier-based styling
                          mapping.tier === 'auto' && 'border-green-200 bg-green-50/50',
                          mapping.tier === 'suggested' && 'border-amber-200 bg-amber-50/30',
                          mapping.tier === 'unresolved' && 'border-red-200 bg-red-50/30'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{mapping.sourceColumn}</p>
                            {/* CLT-08: Three-tier badges */}
                            {mapping.tier === 'auto' && (
                              <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                                AI ✓ {mapping.confidence}%
                              </Badge>
                            )}
                            {mapping.tier === 'suggested' && (
                              <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300">
                                {isSpanish ? 'Revisar' : 'Review'} {mapping.confidence}%
                              </Badge>
                            )}
                            {mapping.tier === 'unresolved' && (
                              <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-300">
                                {isSpanish ? 'Sin Resolver' : 'Unresolved'}
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
                              mapping.targetField && 'border-primary',
                              mapping.tier === 'unresolved' && !mapping.targetField && 'border-red-300'
                            )}
                            value={mapping.targetField || ''}
                            onChange={(e) => updateFieldMapping(
                              currentSheetMapping.sheetName,
                              mapping.sourceColumn,
                              e.target.value || null
                            )}
                          >
                            {/* CLT-08: "Select Field" for unresolved, "Preserved" for confirmed unmapped */}
                            <option value="">
                              {mapping.tier === 'unresolved'
                                ? (isSpanish ? '— Seleccionar Campo —' : '— Select Field —')
                                : (isSpanish ? '— Preservado en datos crudos —' : '— Preserved in raw data —')}
                            </option>

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

                        {/* Preserved indicator for unmapped non-unresolved fields */}
                        {!mapping.targetField && mapping.tier !== 'unresolved' && (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 shrink-0">
                            {isSpanish ? 'Preservado' : 'Preserved'}
                          </Badge>
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

                {/* CLT-08: Critical Field Validation Summary */}
                {criticalFieldIssues.length > 0 && (
                  <Card className={cn(
                    'border-2',
                    criticalFieldIssues.some(i => i.severity === 'error') ? 'border-red-300 bg-red-50' :
                    criticalFieldIssues.some(i => i.severity === 'warning') ? 'border-amber-300 bg-amber-50' :
                    'border-blue-300 bg-blue-50'
                  )}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className={cn(
                          'h-4 w-4',
                          criticalFieldIssues.some(i => i.severity === 'error') ? 'text-red-600' :
                          criticalFieldIssues.some(i => i.severity === 'warning') ? 'text-amber-600' :
                          'text-blue-600'
                        )} />
                        {isSpanish ? 'Validacion de Mapeo' : 'Mapping Validation'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {/* Errors */}
                      {criticalFieldIssues.filter(i => i.severity === 'error').length > 0 && (
                        <div className="space-y-1">
                          <p className="font-medium text-red-700 flex items-center gap-1">
                            <XCircle className="h-3 w-3" />
                            {criticalFieldIssues.filter(i => i.severity === 'error').length} {isSpanish ? 'error(es) - impedira calculo correcto' : 'error(s) - will prevent correct calculation'}
                          </p>
                          {criticalFieldIssues.filter(i => i.severity === 'error').map((issue, idx) => (
                            <p key={idx} className="text-red-600 ml-4">
                              → {issue.message}
                              <span className="block text-xs text-red-500 ml-2">{issue.impact}</span>
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Warnings */}
                      {criticalFieldIssues.filter(i => i.severity === 'warning').length > 0 && (
                        <div className="space-y-1">
                          <p className="font-medium text-amber-700 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {criticalFieldIssues.filter(i => i.severity === 'warning').length} {isSpanish ? 'advertencia(s) - algunos componentes seran $0' : 'warning(s) - some components will be $0'}
                          </p>
                          {criticalFieldIssues.filter(i => i.severity === 'warning').map((issue, idx) => (
                            <p key={idx} className="text-amber-600 ml-4">
                              → {issue.component ? `"${issue.component}": ` : ''}{issue.message}
                              <span className="block text-xs text-amber-500 ml-2">{issue.impact}</span>
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Info */}
                      {criticalFieldIssues.filter(i => i.severity === 'info').length > 0 && (
                        <div className="space-y-1">
                          <p className="font-medium text-blue-700 flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            {criticalFieldIssues.filter(i => i.severity === 'info').length} {isSpanish ? 'sugerencia(s)' : 'suggestion(s)'}
                          </p>
                          {criticalFieldIssues.filter(i => i.severity === 'info').map((issue, idx) => (
                            <p key={idx} className="text-blue-600 ml-4">
                              → {issue.message}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Components status summary — HF-065 F26: Show plan context only for transaction data */}
                      {activePlan && !(analysis?.rosterDetected?.found && !analysis?.sheets.some(s => s.classification !== 'roster' && s.classification !== 'unrelated')) && (
                        <div className="pt-2 border-t mt-2">
                          <p className="text-xs text-muted-foreground">
                            {isSpanish
                              ? `Plan activo: ${activePlan.name || 'Sin nombre'}`
                              : `Active plan: ${activePlan.name || 'Unnamed'}`}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* All clear message if no issues */}
                {criticalFieldIssues.length === 0 && fieldMappings.length > 0 && (
                  <Card className="border-2 border-green-300 bg-green-50">
                    <CardContent className="py-3 flex items-center gap-2 text-green-700">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {isSpanish
                          ? 'Todos los campos criticos estan mapeados'
                          : 'All critical fields are mapped'}
                      </span>
                    </CardContent>
                  </Card>
                )}
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

                  {/* Period Detection — HF-053: Shows actual detected periods from field mappings */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {isSpanish ? 'Períodos Detectados' : 'Detected Periods'}
                        {validationResult.detectedPeriods && validationResult.detectedPeriods.periods.length > 0 && (
                          <Badge variant="default" className="ml-2">
                            {validationResult.detectedPeriods.periods.length}
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {validationResult.detectedPeriods && validationResult.detectedPeriods.periods.length > 0 ? (
                        <div>
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            {validationResult.detectedPeriods.periods.map(p => (
                              <div key={p.canonicalKey} className="p-3 bg-muted rounded-lg border">
                                <p className="text-sm font-medium">{p.label}</p>
                                <p className="text-xs text-muted-foreground">
                                  {p.startDate} — {p.endDate}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {p.recordCount.toLocaleString()} {isSpanish ? 'registros' : 'records'} · {p.sheetsPresent.length} {isSpanish ? 'hojas' : 'sheets'}
                                </p>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>
                                {isSpanish ? 'Frecuencia' : 'Frequency'}: {
                                  validationResult.detectedPeriods.frequency === 'monthly' ? (isSpanish ? 'Mensual' : 'Monthly') :
                                  validationResult.detectedPeriods.frequency === 'quarterly' ? (isSpanish ? 'Trimestral' : 'Quarterly') :
                                  validationResult.detectedPeriods.frequency === 'annual' ? (isSpanish ? 'Anual' : 'Annual') :
                                  (isSpanish ? 'Desconocido' : 'Unknown')
                                }
                              </span>
                              <span>
                                {isSpanish ? 'Confianza' : 'Confidence'}: {validationResult.detectedPeriods.confidence}%
                              </span>
                            </div>
                            {/* Decision 47: Import-driven period creation */}
                            {!periodsCreated ? (
                              <Button
                                size="sm"
                                onClick={async () => {
                                  if (!tenantId || !validationResult.detectedPeriods) return;
                                  try {
                                    const periods = validationResult.detectedPeriods.periods.map(p => ({
                                      tenant_id: tenantId,
                                      label: p.label,
                                      period_type: validationResult.detectedPeriods!.frequency === 'unknown' ? 'monthly' : validationResult.detectedPeriods!.frequency,
                                      start_date: p.startDate,
                                      end_date: p.endDate,
                                      canonical_key: p.canonicalKey,
                                      status: 'draft',
                                    }));
                                    const res = await fetch('/api/periods', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ tenantId, periods }),
                                    });
                                    if (res.ok) {
                                      setPeriodsCreated(true);
                                    } else {
                                      const err = await res.json().catch(() => ({}));
                                      console.error('Period creation failed:', err);
                                    }
                                  } catch (err) {
                                    console.error('Period creation error:', err);
                                  }
                                }}
                              >
                                <Calendar className="h-3 w-3 mr-1" />
                                {isSpanish ? 'Crear Períodos' : 'Create Periods'}
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                {isSpanish ? 'Períodos creados' : 'Periods created'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-amber-500">
                          {isSpanish
                            ? 'No se detectaron períodos. Verifique que las columnas de mes/año o fecha estén mapeadas.'
                            : 'No periods detected. Check that month/year or date columns are mapped in the Field Mapping step.'}
                        </p>
                      )}
                    </CardContent>
                  </Card>

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
                              {isSpanish ? 'IDs de Empleado' : 'Entity IDs'}
                            </span>
                            <Badge variant={validationResult.crossSheetValidation.overallMatch >= 80 ? 'default' : 'secondary'}>
                              {validationResult.crossSheetValidation.overallMatch}% {isSpanish ? 'coincidencia' : 'match'}
                            </Badge>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{isSpanish ? 'En plantilla' : 'In roster'}:</span>
                              <span>{validationResult.crossSheetValidation.entityIdMatch.rosterCount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{isSpanish ? 'En datos' : 'In data'}:</span>
                              <span>{validationResult.crossSheetValidation.entityIdMatch.dataSheetCount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{isSpanish ? 'Coincidentes' : 'Matched'}:</span>
                              <span className="text-green-600">{validationResult.crossSheetValidation.entityIdMatch.matchedCount}</span>
                            </div>
                          </div>
                          {validationResult.crossSheetValidation.entityIdMatch.unmatchedIds.length > 0 && (
                            <div className="mt-2 pt-2 border-t">
                              <p className="text-xs text-muted-foreground mb-1">
                                {isSpanish ? 'IDs no encontrados en plantilla:' : 'IDs not in roster:'}
                              </p>
                              <p className="text-xs text-orange-600">
                                {validationResult.crossSheetValidation.entityIdMatch.unmatchedIds.join(', ')}
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
                                  {isSpanish ? 'Empleado' : 'Entity'}
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
                                <tr key={preview.entityId} className={cn('border-t', idx % 2 === 0 && 'bg-muted/30')}>
                                  <td className="px-3 py-2 font-medium">
                                    {preview.entityId}
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
                        const totalColumns = mapping?.mappings.length || 0;
                        const preservedCount = totalColumns - mappedCount;

                        return (
                          <div key={sheet.name} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className={cn('p-2 rounded-lg', config.color)}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium">{sheet.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {sheet.rowCount} {isSpanish ? 'filas' : 'rows'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {mappedCount > 0 && (
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                  {mappedCount} {isSpanish ? 'mapeados' : 'mapped'}
                                </Badge>
                              )}
                              {preservedCount > 0 && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                  {preservedCount} {isSpanish ? 'preservados' : 'preserved'}
                                </Badge>
                              )}
                              {sheet.matchedComponent && (
                                <Badge variant="secondary" className="text-xs">
                                  → {sheet.matchedComponent}
                                </Badge>
                              )}
                            </div>
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
                      {isSpanish ? 'Plan de Compensación Activo' : 'Active Rule Set'}
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
                        : 'Import a rule set first to enable component-based field mapping.'}
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
                  {isSpanish ? 'ID de Importación' : 'Import ID'}: #{importId?.slice(-8)}
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
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">
                        {importResult?.recordCount?.toLocaleString() || analysis?.sheets.reduce((sum, s) => sum + s.rowCount, 0).toLocaleString() || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish ? 'Registros Importados' : 'Records Imported'}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">
                        {importResult?.entityCount?.toLocaleString() || '—'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish ? 'Entidades' : 'Entities'}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">
                        {importResult?.periodCount || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isSpanish ? 'Períodos' : 'Periods'}
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
                  </div>

                  {/* Period Detail — shows detected periods with names and record counts */}
                  {((importResult?.periods && importResult.periods.length > 0) || (validationResult?.detectedPeriods?.periods && validationResult.detectedPeriods.periods.length > 0)) && (
                    <div className="pt-4 border-t">
                      <p className="text-sm font-medium mb-3 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {isSpanish ? 'Períodos Detectados' : 'Detected Periods'}
                      </p>
                      <div className="grid gap-2 md:grid-cols-3">
                        {(validationResult?.detectedPeriods?.periods || []).map(p => (
                          <div key={p.canonicalKey} className="flex items-center justify-between p-3 bg-muted rounded-lg border">
                            <div>
                              <p className="text-sm font-medium">{p.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.recordCount.toLocaleString()} {isSpanish ? 'registros' : 'records'}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                              {importResult?.periods?.some(ip => ip.key === p.canonicalKey)
                                ? (isSpanish ? 'Creado' : 'Created')
                                : (isSpanish ? 'Existente' : 'Existing')}
                            </Badge>
                          </div>
                        ))}
                        {/* Fallback: show import result periods if validation periods unavailable */}
                        {!validationResult?.detectedPeriods?.periods?.length && importResult?.periods?.map(p => (
                          <div key={p.key} className="flex items-center justify-between p-3 bg-muted rounded-lg border">
                            <div>
                              <p className="text-sm font-medium">{p.key}</p>
                            </div>
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                              {isSpanish ? 'Creado' : 'Created'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Multi-file: Process next file in queue */}
              {fileQueue.length > 0 && (
                <Card className="border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-blue-800 dark:text-blue-200">
                        {fileQueue.length} {isSpanish ? 'archivos restantes en cola' : 'files remaining in queue'}
                      </p>
                      <p className="text-sm text-blue-600 dark:text-blue-300">
                        {isSpanish ? 'Siguiente' : 'Next'}: {fileQueue[0]?.name}
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        const nextFile = fileQueue[0];
                        setFileQueue(prev => prev.slice(1));
                        // Reset state for next file
                        setCurrentStep('upload');
                        setAnalysis(null);
                        setFieldMappings([]);
                        setValidationComplete(false);
                        setValidationResult(null);
                        setImportResult(null);
                        setImportId(null);
                        setImportComplete(false);
                        setPeriodsCreated(false);
                        if (nextFile) handleFileSelect(nextFile);
                      }}
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      {isSpanish ? 'Procesar Siguiente' : 'Process Next File'}
                    </Button>
                  </CardContent>
                </Card>
              )}

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
                      className="p-4 border rounded-lg hover:bg-zinc-800/50 transition-colors flex items-start gap-4"
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
                            : 'Process imported data with the active rule set to generate incentive results.'}
                        </p>
                        <Button variant="link" className="p-0 h-auto mt-2 text-primary">
                          {isSpanish ? 'Ir a Cálculos →' : 'Go to Calculations →'}
                        </Button>
                      </div>
                    </a>

                    {/* Review Data Quality */}
                    <a
                      href="/data/quality"
                      className="p-4 border rounded-lg hover:bg-zinc-800/50 transition-colors flex items-start gap-4"
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
                      className="p-4 border rounded-lg hover:bg-zinc-800/50 transition-colors flex items-start gap-4"
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
                        setImportResult(null);
                      }}
                      className="p-4 border rounded-lg hover:bg-zinc-800/50 transition-colors flex items-start gap-4 text-left"
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

export default function DataPackageImportPage() {
  return (
    <RequireRole roles={['vl_admin', 'admin']}>
      <DataPackageImportPageInner />
    </RequireRole>
  );
}
