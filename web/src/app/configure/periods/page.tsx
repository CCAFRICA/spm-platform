'use client';

/**
 * Configure > Periods — Period Management
 *
 * Create and manage periods for outcome calculations.
 * Uses Supabase via /api/periods for all CRUD.
 *
 * Decision 48: Periods require start_date + end_date as explicit date fields.
 * Date pickers are the PRIMARY inputs. Quick Fill is a CONVENIENCE.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import { getTenantOnboardingState, type TenantOnboardingState } from '@/lib/insights'; // HF-326 Defect C
import { useLocale } from '@/contexts/locale-context';
import { useIsVialuce } from '@/hooks/use-is-vialuce';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Calendar,
  Plus,
  Sparkles,
  Play,
  CheckCircle,
  Clock,
  Lock,
  RefreshCw,
  FileCheck,
  Calculator,
  Eye,
  Wallet,
  Zap,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

// =============================================================================
// STATUS CONFIG
// =============================================================================

type PeriodStatus = 'draft' | 'open' | 'data_collection' | 'calculation_pending' | 'calculated' | 'review' | 'approved' | 'finalized' | 'paid' | 'closed';

const STATUS_CONFIG: Record<PeriodStatus, { label: string; labelEs: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', labelEs: 'Borrador', color: 'bg-slate-500', icon: <Clock className="h-3 w-3" /> },
  open: { label: 'Open', labelEs: 'Abierto', color: 'bg-blue-500', icon: <Play className="h-3 w-3" /> },
  data_collection: { label: 'Data Collection', labelEs: 'Recolección de Datos', color: 'bg-cyan-500', icon: <RefreshCw className="h-3 w-3" /> },
  calculation_pending: { label: 'Calculation Pending', labelEs: 'Cálculo Pendiente', color: 'bg-amber-500', icon: <Calculator className="h-3 w-3" /> },
  calculated: { label: 'Calculated', labelEs: 'Calculado', color: 'bg-purple-500', icon: <FileCheck className="h-3 w-3" /> },
  review: { label: 'In Review', labelEs: 'En Revisión', color: 'bg-orange-500', icon: <Eye className="h-3 w-3" /> },
  approved: { label: 'Approved', labelEs: 'Aprobado', color: 'bg-green-500', icon: <CheckCircle className="h-3 w-3" /> },
  finalized: { label: 'Finalized', labelEs: 'Finalizado', color: 'bg-emerald-600', icon: <CheckCircle className="h-3 w-3" /> },
  paid: { label: 'Paid', labelEs: 'Pagado', color: 'bg-teal-600', icon: <Wallet className="h-3 w-3" /> },
  closed: { label: 'Closed', labelEs: 'Cerrado', color: 'bg-slate-800', icon: <Lock className="h-3 w-3" /> },
};

const VALID_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  draft: ['open'],
  open: ['data_collection'],
  data_collection: ['calculation_pending', 'open'],
  calculation_pending: ['calculated', 'data_collection'],
  calculated: ['review', 'calculation_pending'],
  review: ['approved', 'calculated', 'calculation_pending'],
  approved: ['finalized', 'review'],
  finalized: ['paid', 'approved'],
  paid: ['closed'],
  closed: [],
};

type PeriodType = 'monthly' | 'quarterly';

interface SupabasePeriod {
  id: string;
  canonical_key: string;
  label: string;
  period_type: string;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
}

// =============================================================================
// HELPERS
// =============================================================================

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function lastDayOfMonth(year: number, month: number): string {
  // month is 1-based
  const d = new Date(year, month, 0);
  return d.toISOString().split('T')[0];
}

function firstDayOfMonth(year: number, month: number): string {
  // month is 1-based
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function buildCanonicalKey(startDate: string): string {
  // e.g. "2024-01-01" → "2024-01"
  return startDate.substring(0, 7);
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function PeriodsPage() {
  const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const isVialuce = useIsVialuce();
  const tenantId = currentTenant?.id;
  const isSpanish = locale === 'es-MX';

  const router = useRouter(); // HF-326 Defect C
  const [tenantState, setTenantState] = useState<TenantOnboardingState | null>(null); // HF-326 Defect C
  const [periods, setPeriods] = useState<SupabasePeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<SupabasePeriod | null>(null);
  const [newStatus, setNewStatus] = useState<PeriodStatus | ''>('');
  const [creating, setCreating] = useState(false);

  // OB-227 Cluster C: auto-detect periods from committed_data (/api/periods/detect + create-from-data)
  interface DetectedPeriod { label: string; period_type: string; start_date: string; end_date: string; transaction_count: number; exists: boolean }
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectedPeriod[] | null>(null);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const [creatingDetected, setCreatingDetected] = useState(false);

  // --- Create Period form state (Decision 48: date pickers are primary) ---
  const [periodName, setPeriodName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Quick Fill convenience
  const [qfYear, setQfYear] = useState(new Date().getFullYear());
  const [qfMonth, setQfMonth] = useState(new Date().getMonth() + 1);
  const [qfType, setQfType] = useState<PeriodType>('monthly');

  // ==========================================================================
  // LOAD PERIODS FROM SUPABASE
  // ==========================================================================

  const loadPeriods = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/periods?tenant_id=${tenantId}`);
      const data = await res.json();
      setPeriods(data.periods ?? []);
    } catch (err) {
      console.error('[Periods] Load failed:', err);
    }
    setLoading(false);
  }, [tenantId]);

  // OB-227 Cluster C handlers (declared after loadPeriods so the closure is available)
  const handleAutoDetect = useCallback(async () => {
    if (!tenantId) return;
    setAutoDetecting(true); setDetectMsg(null); setDetected(null);
    try {
      const res = await fetch('/api/periods/detect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const data = await res.json();
      if (!res.ok) { setDetectMsg(data.error || 'Auto-detect failed.'); return; }
      // HF-326 Defect B: the detect endpoint returns snake_case keys (suggested_periods, data_range)
      // — OB-227 read the camelCase `suggestedPeriods`, which was always undefined, so the empty
      // array always tripped the "No data uploaded yet" branch even for tenants with data. Read the
      // real keys, and key the no-data message on data_range.has_data (not on the suggestion count).
      const suggested = (data.suggested_periods ?? []) as DetectedPeriod[];
      const hasData = !!data.data_range?.has_data;
      const fresh = suggested.filter(p => !p.exists);
      if (fresh.length === 0) {
        setDetectMsg(!hasData
          ? (isSpanish ? 'No hay datos cargados aún. Carga datos para detectar períodos.' : 'No data uploaded yet. Upload data to auto-detect periods.')
          : (isSpanish ? 'Todos los períodos detectados ya existen.' : 'All detected periods already exist.'));
        return;
      }
      setDetected(fresh);
    } catch {
      setDetectMsg(isSpanish ? 'Error de red al detectar períodos.' : 'Network error detecting periods.');
    } finally { setAutoDetecting(false); }
  }, [tenantId, isSpanish]);

  const handleCreateDetected = useCallback(async () => {
    if (!tenantId) return;
    setCreatingDetected(true);
    try {
      const res = await fetch('/api/periods/create-from-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const data = await res.json();
      if (!res.ok) { setDetectMsg(data.error || 'Period creation failed.'); return; }
      setDetected(null);
      setDetectMsg(typeof data.created === 'number'
        ? `${isSpanish ? 'Creados' : 'Created'} ${data.created} ${isSpanish ? 'períodos' : 'periods'}.`
        : (data.message ?? null));
      await loadPeriods();
    } catch {
      setDetectMsg(isSpanish ? 'Error de red al crear períodos.' : 'Network error creating periods.');
    } finally { setCreatingDetected(false); }
  }, [tenantId, isSpanish, loadPeriods]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  // HF-326 Defect C: tenant-state awareness — refreshes when the period set changes (e.g. after
  // auto-detect/create) so the guidance reflects current preconditions.
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    getTenantOnboardingState(tenantId)
      .then(s => { if (!cancelled) setTenantState(s); })
      .catch(() => { /* guidance section simply hides */ });
    return () => { cancelled = true; };
  }, [tenantId, periods.length]);

  // ==========================================================================
  // QUICK FILL — Populate date fields from Year/Month/Type
  // ==========================================================================

  const handleQuickFill = () => {
    if (qfType === 'monthly') {
      const start = firstDayOfMonth(qfYear, qfMonth);
      const end = lastDayOfMonth(qfYear, qfMonth);
      setStartDate(start);
      setEndDate(end);
      setPeriodName(`${MONTH_NAMES[qfMonth - 1]} ${qfYear}`);
    } else {
      // Quarterly: month determines quarter
      const quarter = Math.ceil(qfMonth / 3);
      const startMonth = (quarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      const start = firstDayOfMonth(qfYear, startMonth);
      const end = lastDayOfMonth(qfYear, endMonth);
      setStartDate(start);
      setEndDate(end);
      setPeriodName(`Q${quarter} ${qfYear}`);
    }
  };

  // ==========================================================================
  // CREATE SINGLE PERIOD
  // ==========================================================================

  const handleCreatePeriod = async () => {
    if (!tenantId || !startDate || !endDate || !periodName) {
      toast.error('Period name, start date, and end date are required');
      return;
    }
    if (startDate >= endDate) {
      toast.error('Start date must be before end date');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          periods: [{
            label: periodName,
            period_type: qfType,
            start_date: startDate,
            end_date: endDate,
            canonical_key: buildCanonicalKey(startDate),
            status: 'open',
          }],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to create period');
      } else {
        toast.success(isSpanish ? 'Período creado' : 'Period created');
        setShowCreateDialog(false);
        resetForm();
        await loadPeriods();
      }
    } catch (err) {
      console.error('[Periods] Create failed:', err);
      toast.error('Failed to create period');
    }
    setCreating(false);
  };

  // ==========================================================================
  // GENERATE ALL PERIODS FOR A YEAR
  // ==========================================================================

  const handleGenerateYear = async () => {
    if (!tenantId) return;

    setCreating(true);
    try {
      const newPeriods: Array<{
        label: string;
        period_type: string;
        start_date: string;
        end_date: string;
        canonical_key: string;
        status: string;
      }> = [];

      if (qfType === 'monthly') {
        for (let m = 1; m <= 12; m++) {
          const start = firstDayOfMonth(qfYear, m);
          const end = lastDayOfMonth(qfYear, m);
          newPeriods.push({
            label: `${MONTH_NAMES[m - 1]} ${qfYear}`,
            period_type: 'monthly',
            start_date: start,
            end_date: end,
            canonical_key: buildCanonicalKey(start),
            status: 'open',
          });
        }
      } else {
        for (let q = 1; q <= 4; q++) {
          const startMonth = (q - 1) * 3 + 1;
          const endMonth = startMonth + 2;
          const start = firstDayOfMonth(qfYear, startMonth);
          const end = lastDayOfMonth(qfYear, endMonth);
          newPeriods.push({
            label: `Q${q} ${qfYear}`,
            period_type: 'quarterly',
            start_date: start,
            end_date: end,
            canonical_key: buildCanonicalKey(start),
            status: 'open',
          });
        }
      }

      const res = await fetch('/api/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, periods: newPeriods }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to generate periods');
      } else {
        const count = data.created?.length ?? newPeriods.length;
        toast.success(isSpanish ? `${count} períodos creados` : `${count} periods created`);
        setShowCreateDialog(false);
        resetForm();
        await loadPeriods();
      }
    } catch (err) {
      console.error('[Periods] Generate failed:', err);
      toast.error('Failed to generate periods');
    }
    setCreating(false);
  };

  // ==========================================================================
  // DELETE DRAFT PERIOD
  // ==========================================================================

  const handleDeletePeriod = async (periodId: string) => {
    if (!tenantId) return;
    try {
      const res = await fetch('/api/periods', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, period_id: periodId }),
      });

      if (res.ok) {
        toast.success(isSpanish ? 'Período eliminado' : 'Period deleted');
        await loadPeriods();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete');
      }
    } catch (err) {
      console.error('[Periods] Delete failed:', err);
      toast.error('Failed to delete period');
    }
  };

  // ==========================================================================
  // STATUS CHANGE (updates Supabase via PATCH — future, for now toast only)
  // ==========================================================================

  const handleStatusChange = async () => {
    if (!selectedPeriod || !newStatus) return;
    // Status transitions will be handled by the lifecycle engine
    // For now, just close the dialog
    toast.info('Status transitions coming soon via lifecycle engine');
    setShowStatusDialog(false);
    setSelectedPeriod(null);
    setNewStatus('');
  };

  const resetForm = () => {
    setPeriodName('');
    setStartDate('');
    setEndDate('');
  };

  const openStatusDialog = (period: SupabasePeriod) => {
    setSelectedPeriod(period);
    setNewStatus('');
    setShowStatusDialog(true);
  };

  return (
    <div className={isVialuce ? 'page space-y-6' : 'p-6 space-y-6'}>
      {/* Header */}
      {isVialuce ? (
        <div className="phead">
          <div>
            <h1>{isSpanish ? 'Períodos' : 'Periods'}</h1>
            <div className="sub">
              {isSpanish
                ? 'Crear y gestionar períodos para cálculos'
                : 'Create and manage periods for outcome calculations'}
            </div>
          </div>
          <div className="pactions flex items-center gap-2">
            <Button variant="outline" onClick={handleAutoDetect} disabled={autoDetecting}>
              <Sparkles className="h-4 w-4 mr-2" />
              {autoDetecting ? (isSpanish ? 'Detectando…' : 'Detecting…') : (isSpanish ? 'Detectar de datos' : 'Auto-detect from data')}
            </Button>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {isSpanish ? 'Crear Período' : 'Create Period'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">
              {isSpanish ? 'Períodos' : 'Periods'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {isSpanish
                ? 'Crear y gestionar períodos para cálculos'
                : 'Create and manage periods for outcome calculations'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleAutoDetect} disabled={autoDetecting}>
              <Sparkles className="h-4 w-4 mr-2" />
              {autoDetecting ? (isSpanish ? 'Detectando…' : 'Detecting…') : (isSpanish ? 'Detectar de datos' : 'Auto-detect from data')}
            </Button>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {isSpanish ? 'Crear Período' : 'Create Period'}
            </Button>
          </div>
        </div>
      )}

      {/* HF-326 Defect C: tenant-state awareness — turns the dead-end into the next step (IAP).
          Vialuce-only (C5). */}
      {isVialuce && tenantState && (() => {
        const ts = tenantState;
        const allMet = ts.has_data && ts.has_plan && ts.has_periods;
        const chip = (ok: boolean, label: string, detail?: string) => (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${ok ? 'bg-[color:var(--vl-success,#15936A)]/15 text-[color:var(--vl-success,#15936A)]' : 'bg-muted text-muted-foreground'}`}>
            <span>{ok ? '✓' : '○'}</span>{label}{detail ? <span className="opacity-70">· {detail}</span> : null}
          </span>
        );
        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{isSpanish ? 'Estado del flujo de cálculo' : 'Calculate flow status'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {chip(ts.has_data, isSpanish ? 'Datos cargados' : 'Data loaded', ts.has_data ? `${ts.import_count} ${isSpanish ? 'importaciones' : 'imports'}` : undefined)}
                {chip(ts.has_plan, isSpanish ? 'Plan importado' : 'Plan imported', ts.plan_name ?? undefined)}
                {chip(ts.has_periods, isSpanish ? 'Períodos creados' : 'Periods created', ts.has_periods ? `${ts.period_count}` : undefined)}
              </div>
              {allMet ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{ts.has_calculations ? (isSpanish ? 'Calculado — revisa o recalcula.' : 'Calculated — review or recalculate.') : (isSpanish ? 'Todo listo para calcular.' : 'All preconditions met — ready to calculate.')}</span>
                  <Button onClick={() => router.push('/operate')}>{isSpanish ? 'Ir a Calcular →' : 'Go to Calculate →'}</Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    {!ts.has_data ? (isSpanish ? 'Carga datos para continuar.' : 'Upload data to continue.')
                      : !ts.has_plan ? (isSpanish ? 'Importa un plan para continuar.' : 'Import a plan to continue.')
                      : (isSpanish ? 'Crea períodos arriba (manual o detectar).' : 'Create periods above (manually or auto-detect).')}
                  </span>
                  {(!ts.has_data || !ts.has_plan) && (
                    <Button variant="outline" onClick={() => router.push('/data/import')}>{isSpanish ? 'Ir a Importar →' : 'Go to Import →'}</Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* OB-227 Cluster C: auto-detect confirmation panel */}
      {(detected || detectMsg) && (
        <Card className="border-[color:var(--vl-kpi-accent,#4446B8)]/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[color:var(--vl-kpi-accent,#4446B8)]" />
              {isSpanish ? 'Períodos detectados' : 'Detected periods'}
            </CardTitle>
            {detectMsg && <CardDescription>{detectMsg}</CardDescription>}
          </CardHeader>
          {detected && detected.length > 0 && (
            <CardContent className="space-y-3">
              <div className="rounded-md border divide-y">
                {detected.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 text-sm">
                    <span className="font-medium">{p.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {p.start_date} → {p.end_date} · {p.period_type} · {p.transaction_count.toLocaleString()} {isSpanish ? 'registros' : 'records'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleCreateDetected} disabled={creatingDetected}>
                  {creatingDetected ? (isSpanish ? 'Creando…' : 'Creating…') : (isSpanish ? `Crear ${detected.length} períodos` : `Create ${detected.length} detected periods`)}
                </Button>
                <Button variant="ghost" onClick={() => { setDetected(null); setDetectMsg(null); }}>
                  {isSpanish ? 'Cancelar' : 'Cancel'}
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Periods Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            {isSpanish ? 'Períodos' : 'Periods'}
          </CardTitle>
          <CardDescription>
            {loading ? (isSpanish ? 'Cargando...' : 'Loading...') : `${periods.length} ${isSpanish ? 'períodos configurados' : 'periods configured'}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {periods.length === 0 && !loading ? (
            <div className="text-center py-12 text-slate-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>{isSpanish ? 'No hay períodos configurados' : 'No periods configured'}</p>
              <p className="text-sm mt-1">
                {isSpanish
                  ? 'Crea un período o genera un año completo'
                  : 'Create a period or generate a full year'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isSpanish ? 'Período' : 'Period'}</TableHead>
                  <TableHead>{isSpanish ? 'Rango de Fechas' : 'Date Range'}</TableHead>
                  <TableHead>{isSpanish ? 'Tipo' : 'Type'}</TableHead>
                  <TableHead>{isSpanish ? 'Estado' : 'Status'}</TableHead>
                  <TableHead>{isSpanish ? 'Acciones' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map(period => {
                  const statusConfig = STATUS_CONFIG[period.status] || STATUS_CONFIG.draft;
                  const allowedTransitions = VALID_TRANSITIONS[period.status] || [];

                  return (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">{period.label}</TableCell>
                      <TableCell className="text-sm text-zinc-400">
                        {formatDateDisplay(period.start_date)} – {formatDateDisplay(period.end_date)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {period.period_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusConfig.color} text-white gap-1`}>
                          {statusConfig.icon}
                          {isSpanish ? statusConfig.labelEs : statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {allowedTransitions.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openStatusDialog(period)}
                            >
                              {isSpanish ? 'Estado' : 'Status'}
                            </Button>
                          )}
                          {period.status === 'open' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-900/20"
                              onClick={() => handleDeletePeriod(period.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* CREATE PERIOD DIALOG — Decision 48                                */}
      {/* Date pickers are PRIMARY. Quick Fill is CONVENIENCE.              */}
      {/* ================================================================== */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isSpanish ? 'Crear Período' : 'Create Period'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish
                ? 'Crea un período con límites de fecha explícitos.'
                : 'Create a period with explicit date boundaries.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Period Name */}
            <div>
              <Label>{isSpanish ? 'Nombre del Período' : 'Period Name'}</Label>
              <Input
                value={periodName}
                onChange={(e) => setPeriodName(e.target.value)}
                placeholder="Q1 2024"
              />
            </div>

            {/* Date pickers — PRIMARY inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isSpanish ? 'Fecha Inicio' : 'Start Date'}</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label>{isSpanish ? 'Fecha Fin' : 'End Date'}</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Quick Fill — CONVENIENCE section */}
            <div className="border border-zinc-700 rounded-lg p-3 space-y-3">
              <p className="text-xs text-zinc-500 font-medium flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {isSpanish ? 'Llenado Rápido' : 'Quick Fill'}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">{isSpanish ? 'Año' : 'Year'}</Label>
                  <Input
                    type="number"
                    value={qfYear}
                    onChange={(e) => setQfYear(parseInt(e.target.value))}
                    min={2020}
                    max={2030}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">{isSpanish ? 'Mes' : 'Month'}</Label>
                  <Select
                    value={String(qfMonth)}
                    onValueChange={(v) => setQfMonth(parseInt(v))}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((month, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {month.substring(0, 3)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{isSpanish ? 'Tipo' : 'Type'}</Label>
                  <Select
                    value={qfType}
                    onValueChange={(v) => setQfType(v as PeriodType)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">{isSpanish ? 'Mensual' : 'Monthly'}</SelectItem>
                      <SelectItem value="quarterly">{isSpanish ? 'Trimestral' : 'Quarterly'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleQuickFill}
                className="w-full"
              >
                {isSpanish ? 'Llenar Fechas' : 'Auto-Fill Dates'}
              </Button>
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={handleGenerateYear}
              disabled={creating}
            >
              {creating ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : null}
              {isSpanish
                ? `Generar ${qfType === 'monthly' ? '12' : '4'} (${qfYear})`
                : `Generate ${qfType === 'monthly' ? '12' : '4'} (${qfYear})`}
            </Button>
            <Button
              onClick={handleCreatePeriod}
              disabled={creating || !periodName || !startDate || !endDate}
            >
              {creating ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : null}
              {isSpanish ? 'Crear Período' : 'Create Period'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isSpanish ? 'Cambiar Estado del Período' : 'Change Period Status'}
            </DialogTitle>
            <DialogDescription>
              {selectedPeriod?.label}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Label>{isSpanish ? 'Nuevo Estado' : 'New Status'}</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as PeriodStatus)}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Seleccionar estado' : 'Select status'} />
              </SelectTrigger>
              <SelectContent>
                {selectedPeriod && (VALID_TRANSITIONS[selectedPeriod.status] || []).map(status => (
                  <SelectItem key={status} value={status}>
                    {isSpanish ? STATUS_CONFIG[status].labelEs : STATUS_CONFIG[status].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleStatusChange} disabled={!newStatus}>
              {isSpanish ? 'Actualizar' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
