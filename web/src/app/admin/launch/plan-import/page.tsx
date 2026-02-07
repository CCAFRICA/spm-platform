'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { isCCAdmin } from '@/types/auth';
import { useAdminLocale } from '@/hooks/useAdminLocale';
import { savePlan } from '@/lib/compensation/plan-storage';
import { parseFile } from '@/lib/import-pipeline/file-parser';
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
  },
  'es-MX': {
    title: 'Importar Plan',
    subtitle: 'Importar e interpretar la estructura del plan de compensación',
    uploadTitle: 'Subir Archivo de Plan',
    uploadDesc: 'Arrastre y suelte o haga clic para subir archivos CSV, Excel, JSON, TSV o PowerPoint',
    supportedFormats: 'Formatos soportados: CSV, XLSX, XLS, JSON, TSV, PPTX',
    analyzing: 'Analizando estructura del plan...',
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
  },
};

interface DetectedComponent {
  id: string;
  name: string;
  type: PlanComponent['componentType'];
  metricSource: string;
  measurementLevel: string;
  confidence: number;
  reasoning: string;
  config: Partial<PlanComponent>;
}

interface ParsedPlan {
  name: string;
  description: string;
  components: DetectedComponent[];
  rawData: Record<string, unknown>[];
  detectedFormat: string;
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

    try {
      // Use unified file parser (handles CSV, TSV, JSON, PPTX)
      const parsedFile = await parseFile(file);

      // Build ParsedPlan from parsed file
      const data = parsedFile.rows;
      const detectedFormat = parsedFile.format.toUpperCase();

      // If PPTX, add info about slides
      let description = `Imported from ${file.name}`;
      if (parsedFile.format === 'pptx' && parsedFile.slides) {
        description += ` (${parsedFile.slides.length} slides, ${parsedFile.slides.reduce((sum, s) => sum + s.tables.length, 0)} tables found)`;
      }

      // Detect components from data structure
      const components = detectComponents(data);

      const parsed: ParsedPlan = {
        name: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        description,
        components,
        rawData: data,
        detectedFormat,
      };

      setParsedPlan(parsed);
      setPlanName(parsed.name);
    } catch (error) {
      console.error('Error processing file:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Detect plan components from data
  const detectComponents = (data: Record<string, unknown>[]): DetectedComponent[] => {
    if (data.length === 0) return [];

    const components: DetectedComponent[] = [];
    const headers = Object.keys(data[0]);

    // Look for common patterns
    const matrixPatterns = ['attainment', 'quota', 'tier', 'level', 'band'];
    const percentagePatterns = ['rate', 'percentage', 'commission', '%'];
    const tierPatterns = ['threshold', 'min', 'max', 'range'];

    // Check for matrix-like structures (multiple numeric columns)
    const numericColumns = headers.filter((h) =>
      data.every((row) => !isNaN(Number(row[h])))
    );

    // Detect matrix lookup
    if (
      headers.some((h) => matrixPatterns.some((p) => h.toLowerCase().includes(p))) &&
      numericColumns.length >= 2
    ) {
      components.push({
        id: `comp-${Date.now()}-1`,
        name: 'Sales Performance Matrix',
        type: 'matrix_lookup',
        metricSource: headers.find((h) => h.toLowerCase().includes('attainment')) || numericColumns[0],
        measurementLevel: 'individual',
        confidence: 85,
        reasoning: locale === 'es-MX'
          ? 'Detectado patrón de matriz con columnas de rendimiento y valores de pago'
          : 'Detected matrix pattern with attainment columns and payout values',
        config: {
          componentType: 'matrix_lookup',
          measurementLevel: 'individual',
        },
      });
    }

    // Detect tier lookup
    if (headers.some((h) => tierPatterns.some((p) => h.toLowerCase().includes(p)))) {
      components.push({
        id: `comp-${Date.now()}-2`,
        name: 'Tiered Bonus',
        type: 'tier_lookup',
        metricSource: headers.find((h) => h.toLowerCase().includes('metric')) || headers[0],
        measurementLevel: 'individual',
        confidence: 78,
        reasoning: locale === 'es-MX'
          ? 'Detectada estructura de niveles con umbrales mínimos y máximos'
          : 'Detected tier structure with min/max thresholds',
        config: {
          componentType: 'tier_lookup',
          measurementLevel: 'individual',
        },
      });
    }

    // Detect percentage commission
    if (headers.some((h) => percentagePatterns.some((p) => h.toLowerCase().includes(p)))) {
      components.push({
        id: `comp-${Date.now()}-3`,
        name: 'Commission Rate',
        type: 'percentage',
        metricSource: headers.find((h) => h.toLowerCase().includes('sales') || h.toLowerCase().includes('revenue')) || headers[0],
        measurementLevel: 'individual',
        confidence: 72,
        reasoning: locale === 'es-MX'
          ? 'Detectada columna de porcentaje/tasa indicando comisión'
          : 'Detected percentage/rate column indicating commission',
        config: {
          componentType: 'percentage',
          measurementLevel: 'individual',
        },
      });
    }

    // If no patterns detected, create generic component
    if (components.length === 0 && data.length > 0) {
      components.push({
        id: `comp-${Date.now()}-0`,
        name: 'Custom Component',
        type: 'tier_lookup',
        metricSource: headers[0],
        measurementLevel: 'individual',
        confidence: 45,
        reasoning: locale === 'es-MX'
          ? 'No se detectaron patrones específicos - se requiere configuración manual'
          : 'No specific patterns detected - manual configuration required',
        config: {
          componentType: 'tier_lookup',
          measurementLevel: 'individual',
        },
      });
    }

    return components;
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

      // Build plan configuration
      const planConfig: CompensationPlanConfig = {
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
                    currency: 'USD',
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
                    currency: 'USD',
                  },
                }),
              })),
            },
          ],
        },
      };

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
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              {t.uploadTitle}
            </CardTitle>
            <CardDescription>{t.supportedFormats}</CardDescription>
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
            <Sparkles className="h-12 w-12 text-blue-500 animate-pulse mb-4" />
            <p className="text-lg font-medium mb-4">{t.analyzing}</p>
            <Progress value={66} className="w-64" />
          </CardContent>
        </Card>
      )}

      {/* Parsed Plan */}
      {parsedPlan && !importResult?.success && (
        <>
          {/* Plan Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>{t.detected}</CardTitle>
              <CardDescription>
                Format: {parsedPlan.detectedFormat} | {parsedPlan.rawData.length} rows
              </CardDescription>
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
        <DialogContent>
          {editingComponent && (
            <>
              <DialogHeader>
                <DialogTitle>{t.editComponent}</DialogTitle>
                <DialogDescription>{editingComponent.name}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
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
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setEditingComponent(null)}>
                    {t.cancel}
                  </Button>
                  <Button onClick={() => handleUpdateComponent(editingComponent)}>
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
