'use client';

/**
 * Configure > Periods - Payroll Period Management
 *
 * Create and manage payroll periods for compensation calculations.
 * Uses PeriodProcessor to share storage with the Calculate page.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';
import {
  getPeriodProcessor,
  getValidTransitions,
  type PayrollPeriod,
  type PeriodStatus,
} from '@/lib/payroll/period-processor';
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
  Play,
  CheckCircle,
  Clock,
  Lock,
  RefreshCw,
  FileCheck,
  Calculator,
  Eye,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

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

type PeriodType = 'monthly' | 'quarterly';

export default function PeriodsPage() {
  const { currentTenant } = useTenant();
  const { user } = useAuth();

  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : currentTenant?.locale === 'es-MX';

  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);
  const [newStatus, setNewStatus] = useState<PeriodStatus | ''>('');
  const [isTransitioning, setIsTransitioning] = useState(false);

  // New period form state
  const [newPeriodYear, setNewPeriodYear] = useState(new Date().getFullYear());
  const [newPeriodMonth, setNewPeriodMonth] = useState(new Date().getMonth() + 1);
  const [newPeriodType, setNewPeriodType] = useState<PeriodType>('monthly');

  // Load periods from PeriodProcessor
  const loadPeriods = useCallback(() => {
    if (!currentTenant) return;
    const processor = getPeriodProcessor(currentTenant.id);
    const allPeriods = processor.getPeriods();
    setPeriods(allPeriods);
  }, [currentTenant]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  // Create a single monthly period
  const handleCreatePeriod = () => {
    if (!user || !currentTenant) return;

    const processor = getPeriodProcessor(currentTenant.id);
    const startDate = new Date(newPeriodYear, newPeriodMonth - 1, 1);
    const endDate = new Date(newPeriodYear, newPeriodMonth, 0); // Last day of month
    const payDate = new Date(newPeriodYear, newPeriodMonth, 15); // 15th of next month

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    try {
      processor.createPeriod({
        name: `${monthNames[newPeriodMonth - 1]} ${newPeriodYear}`,
        periodType: 'monthly',
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        payDate: payDate.toISOString().split('T')[0],
        createdBy: user.name || user.id,
      });

      loadPeriods();
      setShowCreateDialog(false);
      toast.success(isSpanish ? 'Período creado' : 'Period created');
    } catch (error) {
      toast.error(isSpanish ? 'Error al crear período' : 'Error creating period');
      console.error(error);
    }
  };

  // Generate all periods for a year
  const handleGenerateYear = () => {
    if (!user || !currentTenant) return;

    const processor = getPeriodProcessor(currentTenant.id);

    try {
      const newPeriods = processor.generateYearPeriods(
        newPeriodYear,
        newPeriodType,
        user.name || user.id
      );

      loadPeriods();
      setShowCreateDialog(false);
      toast.success(
        isSpanish
          ? `${newPeriods.length} períodos creados`
          : `${newPeriods.length} periods created`
      );
    } catch (error) {
      toast.error(isSpanish ? 'Error al generar períodos' : 'Error generating periods');
      console.error(error);
    }
  };

  // Change period status
  const handleStatusChange = async () => {
    if (!selectedPeriod || !newStatus || !user || !currentTenant) return;

    setIsTransitioning(true);

    try {
      const processor = getPeriodProcessor(currentTenant.id);
      const result = await processor.transitionStatus(
        selectedPeriod.id,
        newStatus,
        user.name || user.id
      );

      if (result.success) {
        loadPeriods();
        setShowStatusDialog(false);
        setSelectedPeriod(null);
        setNewStatus('');
        toast.success(isSpanish ? 'Estado actualizado' : 'Status updated');
      } else {
        toast.error(result.error || (isSpanish ? 'Error al actualizar' : 'Error updating'));
      }
    } catch (error) {
      toast.error(isSpanish ? 'Error al actualizar estado' : 'Error updating status');
      console.error(error);
    } finally {
      setIsTransitioning(false);
    }
  };

  // Delete a draft period
  const handleDeletePeriod = (periodId: string) => {
    if (!currentTenant) return;
    const processor = getPeriodProcessor(currentTenant.id);
    const success = processor.deletePeriod(periodId);

    if (success) {
      loadPeriods();
      toast.success(isSpanish ? 'Período eliminado' : 'Period deleted');
    } else {
      toast.error(isSpanish ? 'Solo se pueden eliminar períodos en borrador' : 'Only draft periods can be deleted');
    }
  };

  // Open status change dialog
  const openStatusDialog = (period: PayrollPeriod) => {
    setSelectedPeriod(period);
    setNewStatus('');
    setShowStatusDialog(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isSpanish ? 'Períodos de Nómina' : 'Payroll Periods'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isSpanish
              ? 'Crear y gestionar períodos para cálculos de compensación'
              : 'Create and manage periods for compensation calculations'}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {isSpanish ? 'Crear Período' : 'Create Period'}
        </Button>
      </div>

      {/* Periods Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            {isSpanish ? 'Períodos' : 'Periods'}
          </CardTitle>
          <CardDescription>
            {periods.length} {isSpanish ? 'períodos configurados' : 'periods configured'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>{isSpanish ? 'No hay períodos configurados' : 'No periods configured'}</p>
              <p className="text-sm mt-1">
                {isSpanish
                  ? 'Crea un período para comenzar'
                  : 'Create a period to get started'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isSpanish ? 'Período' : 'Period'}</TableHead>
                  <TableHead>{isSpanish ? 'Fecha Inicio' : 'Start Date'}</TableHead>
                  <TableHead>{isSpanish ? 'Fecha Fin' : 'End Date'}</TableHead>
                  <TableHead>{isSpanish ? 'Fecha de Pago' : 'Pay Date'}</TableHead>
                  <TableHead>{isSpanish ? 'Estado' : 'Status'}</TableHead>
                  <TableHead>{isSpanish ? 'Acciones' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map(period => {
                  const statusConfig = STATUS_CONFIG[period.status];
                  const allowedTransitions = getValidTransitions(period.status);

                  return (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">{period.name}</TableCell>
                      <TableCell>{formatDate(period.startDate)}</TableCell>
                      <TableCell>{formatDate(period.endDate)}</TableCell>
                      <TableCell>{formatDate(period.payDate)}</TableCell>
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
                              {isSpanish ? 'Cambiar Estado' : 'Change Status'}
                            </Button>
                          )}
                          {period.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDeletePeriod(period.id)}
                            >
                              {isSpanish ? 'Eliminar' : 'Delete'}
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

      {/* Create Period Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isSpanish ? 'Crear Período' : 'Create Period'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish
                ? 'Crea un nuevo período de nómina o genera todos los períodos del año'
                : 'Create a new payroll period or generate all periods for the year'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isSpanish ? 'Año' : 'Year'}</Label>
                <Input
                  type="number"
                  value={newPeriodYear}
                  onChange={(e) => setNewPeriodYear(parseInt(e.target.value))}
                  min={2020}
                  max={2030}
                />
              </div>
              <div>
                <Label>{isSpanish ? 'Mes' : 'Month'}</Label>
                <Select
                  value={String(newPeriodMonth)}
                  onValueChange={(v) => setNewPeriodMonth(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      'January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December',
                    ].map((month, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{isSpanish ? 'Tipo de Período' : 'Period Type'}</Label>
              <Select
                value={newPeriodType}
                onValueChange={(v) => setNewPeriodType(v as PeriodType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{isSpanish ? 'Mensual' : 'Monthly'}</SelectItem>
                  <SelectItem value="quarterly">{isSpanish ? 'Trimestral' : 'Quarterly'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleGenerateYear}>
              {isSpanish ? `Generar ${newPeriodYear}` : `Generate ${newPeriodYear}`}
            </Button>
            <Button onClick={handleCreatePeriod}>
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
              {selectedPeriod?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Label>{isSpanish ? 'Nuevo Estado' : 'New Status'}</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as PeriodStatus)}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Seleccionar estado' : 'Select status'} />
              </SelectTrigger>
              <SelectContent>
                {selectedPeriod && getValidTransitions(selectedPeriod.status).map(status => (
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
            <Button onClick={handleStatusChange} disabled={!newStatus || isTransitioning}>
              {isTransitioning
                ? (isSpanish ? 'Actualizando...' : 'Updating...')
                : (isSpanish ? 'Actualizar' : 'Update')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
