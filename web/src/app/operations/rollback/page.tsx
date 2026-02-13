'use client';

/**
 * Rollback Management Page
 *
 * Manage rollbacks, checkpoints, and tenant resets.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  RotateCcw,
  Clock,
  Bookmark,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';
import {
  simulateRollback,
  executeRollback,
  createCheckpoint,
  getTenantCheckpoints,
  getRollbackEligibleBatches,
  getRollbackHistory,
  resetTenant,
  type RollbackSimulation,
  type ResetMode,
} from '@/lib/rollback';
import type { Checkpoint } from '@/lib/data-architecture/types';
import { ImpactRatingBadge } from '@/components/approvals/impact-rating-badge';
import { useLocale } from '@/contexts/locale-context';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';

export default function RollbackManagementPage() {
  const { locale } = useLocale();
  const { currentTenant, isVLAdmin } = useTenant();
  const { user } = useAuth();
  const isSpanish = locale === 'es-MX';

  const [activeTab, setActiveTab] = useState('batches');
  const [isProcessing, setIsProcessing] = useState(false);

  // Batch rollback state
  const [eligibleBatches, setEligibleBatches] = useState<
    Array<{ batch: NonNullable<ReturnType<typeof simulateRollback>['cascadeAnalysis']>; simulation: RollbackSimulation }>
  >([]);
  const [selectedSimulation, setSelectedSimulation] = useState<RollbackSimulation | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');

  // Checkpoint state
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [showCreateCheckpoint, setShowCreateCheckpoint] = useState(false);
  const [newCheckpointName, setNewCheckpointName] = useState('');
  const [newCheckpointDesc, setNewCheckpointDesc] = useState('');

  // Reset state
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetMode, setResetMode] = useState<ResetMode>('demo');

  const tenantId = currentTenant?.id || 'default';
  const userId = user?.id || 'admin';

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const loadData = () => {
    const batches = getRollbackEligibleBatches(tenantId);
    setEligibleBatches(batches as never);
    setCheckpoints(getTenantCheckpoints(tenantId));
  };

  const handleSimulate = (batchId: string) => {
    const simulation = simulateRollback(batchId);
    setSelectedSimulation(simulation);
  };

  const handleExecuteRollback = async () => {
    if (!selectedSimulation || !rollbackReason) return;

    setIsProcessing(true);
    try {
      const result = await executeRollback(selectedSimulation.batchId, userId, {
        reason: rollbackReason,
        skipApproval: false,
      });

      if (result.success) {
        setSelectedSimulation(null);
        setRollbackReason('');
        loadData();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateCheckpoint = () => {
    if (!newCheckpointName) return;

    createCheckpoint(tenantId, newCheckpointName, newCheckpointDesc, userId);
    setShowCreateCheckpoint(false);
    setNewCheckpointName('');
    setNewCheckpointDesc('');
    loadData();
  };

  const handleReset = () => {
    resetTenant(tenantId, userId, resetMode);
    setShowResetDialog(false);
    loadData();
  };

  const rolledBackBatches = getRollbackHistory(tenantId);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <RotateCcw className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {isSpanish ? 'Gestión de Reversiones' : 'Rollback Management'}
            </h1>
            <p className="text-muted-foreground">
              {isSpanish
                ? 'Administre reversiones, puntos de control y reinicios'
                : 'Manage rollbacks, checkpoints, and resets'}
            </p>
          </div>
        </div>
        {isVLAdmin && (
          <Button variant="destructive" onClick={() => setShowResetDialog(true)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {isSpanish ? 'Reiniciar Tenant' : 'Reset Tenant'}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="batches" className="gap-2">
            <Clock className="h-4 w-4" />
            {isSpanish ? 'Lotes' : 'Batches'}
            {eligibleBatches.length > 0 && (
              <Badge variant="secondary">{eligibleBatches.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="checkpoints" className="gap-2">
            <Bookmark className="h-4 w-4" />
            {isSpanish ? 'Puntos de Control' : 'Checkpoints'}
            {checkpoints.length > 0 && (
              <Badge variant="secondary">{checkpoints.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            {isSpanish ? 'Historial' : 'History'}
          </TabsTrigger>
        </TabsList>

        {/* Batches Tab */}
        <TabsContent value="batches" className="space-y-4">
          {eligibleBatches.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                <h3 className="text-lg font-medium">
                  {isSpanish ? 'No hay lotes para revertir' : 'No batches to rollback'}
                </h3>
                <p className="text-muted-foreground">
                  {isSpanish
                    ? 'Todos los lotes están en estado inicial'
                    : 'All batches are in initial state'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {eligibleBatches.map(({ batch, simulation }) => (
                <Card key={batch.batchId}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">
                            {isSpanish ? 'Lote' : 'Batch'} #{batch.batchId.slice(-8)}
                          </h3>
                          <Badge variant="outline">
                            {simulation.cascadeAnalysis.recordCount} {isSpanish ? 'registros' : 'records'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(batch.batchId.split('-')[1]).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <ImpactRatingBadge
                          rating={simulation.cascadeAnalysis.impactRating}
                          showLabel={false}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSimulate(batch.batchId)}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          {isSpanish ? 'Simular' : 'Simulate'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Checkpoints Tab */}
        <TabsContent value="checkpoints" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateCheckpoint(true)}>
              <Bookmark className="h-4 w-4 mr-2" />
              {isSpanish ? 'Crear Punto de Control' : 'Create Checkpoint'}
            </Button>
          </div>

          {checkpoints.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bookmark className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">
                  {isSpanish ? 'Sin puntos de control' : 'No checkpoints'}
                </h3>
                <p className="text-muted-foreground">
                  {isSpanish
                    ? 'Cree un punto de control para restaurar más tarde'
                    : 'Create a checkpoint to restore later'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {checkpoints.map((checkpoint) => (
                <Card key={checkpoint.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{checkpoint.name}</h3>
                        {checkpoint.description && (
                          <p className="text-sm text-muted-foreground">
                            {checkpoint.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(checkpoint.createdAt).toLocaleString()} •{' '}
                          {checkpoint.snapshotData.recordCounts.committed}{' '}
                          {isSpanish ? 'registros' : 'records'}
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        <RotateCcw className="h-4 w-4 mr-1" />
                        {isSpanish ? 'Restaurar' : 'Restore'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {rolledBackBatches.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">
                  {isSpanish ? 'Sin historial de reversiones' : 'No rollback history'}
                </h3>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {rolledBackBatches.map((batch) => (
                <Card key={batch.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <XCircle className="h-5 w-5 text-red-500" />
                      <div>
                        <h3 className="font-medium">
                          {isSpanish ? 'Lote' : 'Batch'} #{batch.id.slice(-8)}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {isSpanish ? 'Revertido' : 'Rolled back'} •{' '}
                          {batch.summary.totalRecords} {isSpanish ? 'registros' : 'records'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Simulation Dialog */}
      <Dialog open={!!selectedSimulation} onOpenChange={() => setSelectedSimulation(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              {isSpanish ? 'Simulación de Reversión' : 'Rollback Simulation'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish
                ? 'Revise el impacto antes de ejecutar'
                : 'Review impact before executing'}
            </DialogDescription>
          </DialogHeader>

          {selectedSimulation && (
            <div className="space-y-4">
              {/* Impact Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Registros' : 'Records'}
                  </p>
                  <p className="text-2xl font-bold">
                    {selectedSimulation.cascadeAnalysis.recordCount}
                  </p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Afectados' : 'Affected'}
                  </p>
                  <p className="text-2xl font-bold">
                    {selectedSimulation.cascadeAnalysis.summary.totalAffected}
                  </p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Impacto' : 'Impact'}
                  </p>
                  <ImpactRatingBadge
                    rating={selectedSimulation.cascadeAnalysis.impactRating}
                    size="lg"
                  />
                </div>
              </div>

              {/* Warnings */}
              {selectedSimulation.cascadeAnalysis.warnings.length > 0 && (
                <div className="space-y-2">
                  {selectedSimulation.cascadeAnalysis.warnings.map((warning, i) => (
                    <div
                      key={i}
                      className={cn(
                        'p-3 rounded-lg flex items-start gap-2',
                        warning.severity === 'critical' && 'bg-red-50 border border-red-200',
                        warning.severity === 'warning' && 'bg-yellow-50 border border-yellow-200',
                        warning.severity === 'info' && 'bg-blue-50 border border-blue-200'
                      )}
                    >
                      <AlertTriangle
                        className={cn(
                          'h-5 w-5 mt-0.5',
                          warning.severity === 'critical' && 'text-red-600',
                          warning.severity === 'warning' && 'text-yellow-600',
                          warning.severity === 'info' && 'text-blue-600'
                        )}
                      />
                      <div>
                        <p
                          className={cn(
                            'font-medium',
                            warning.severity === 'critical' && 'text-red-800',
                            warning.severity === 'warning' && 'text-yellow-800',
                            warning.severity === 'info' && 'text-blue-800'
                          )}
                        >
                          {isSpanish ? warning.messageEs : warning.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendation */}
              <div
                className={cn(
                  'p-4 rounded-lg border',
                  selectedSimulation.recommendation.action === 'proceed' && 'bg-green-50 border-green-200',
                  selectedSimulation.recommendation.action === 'review' && 'bg-yellow-50 border-yellow-200',
                  selectedSimulation.recommendation.action === 'escalate' && 'bg-red-50 border-red-200'
                )}
              >
                <p className="font-medium">
                  {isSpanish ? 'Recomendación' : 'Recommendation'}:{' '}
                  <span className="capitalize">{selectedSimulation.recommendation.action}</span>
                </p>
                <p className="text-sm">
                  {isSpanish
                    ? selectedSimulation.recommendation.reasonEs
                    : selectedSimulation.recommendation.reason}
                </p>
              </div>

              {/* Reason input */}
              {selectedSimulation.canRollback && (
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    {isSpanish ? 'Razón de la reversión' : 'Rollback reason'}
                  </label>
                  <Textarea
                    value={rollbackReason}
                    onChange={(e) => setRollbackReason(e.target.value)}
                    placeholder={
                      isSpanish
                        ? 'Describa por qué se revierte este lote...'
                        : 'Describe why this batch is being rolled back...'
                    }
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedSimulation(null)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            {selectedSimulation?.canRollback && (
              <Button
                variant="destructive"
                onClick={handleExecuteRollback}
                disabled={!rollbackReason || isProcessing}
              >
                {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {selectedSimulation.requiresApproval
                  ? isSpanish
                    ? 'Solicitar Aprobación'
                    : 'Request Approval'
                  : isSpanish
                    ? 'Ejecutar Reversión'
                    : 'Execute Rollback'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Checkpoint Dialog */}
      <Dialog open={showCreateCheckpoint} onOpenChange={setShowCreateCheckpoint}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isSpanish ? 'Crear Punto de Control' : 'Create Checkpoint'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish
                ? 'Guarde el estado actual para restaurar más tarde'
                : 'Save current state to restore later'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                {isSpanish ? 'Nombre' : 'Name'}
              </label>
              <Input
                value={newCheckpointName}
                onChange={(e) => setNewCheckpointName(e.target.value)}
                placeholder={
                  isSpanish ? 'Ej: Antes de importación Q4' : 'E.g., Before Q4 import'
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                {isSpanish ? 'Descripción (opcional)' : 'Description (optional)'}
              </label>
              <Textarea
                value={newCheckpointDesc}
                onChange={(e) => setNewCheckpointDesc(e.target.value)}
                placeholder={isSpanish ? 'Notas adicionales...' : 'Additional notes...'}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateCheckpoint(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleCreateCheckpoint} disabled={!newCheckpointName}>
              {isSpanish ? 'Crear' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              {isSpanish ? 'Reiniciar Tenant' : 'Reset Tenant'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isSpanish
                ? 'Esta acción eliminará todos los datos del tenant. Esta acción no se puede deshacer.'
                : 'This action will delete all tenant data. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">
              {isSpanish ? 'Modo de reinicio' : 'Reset Mode'}
            </label>
            <div className="space-y-2">
              {(['demo', 'sandbox', 'full'] as ResetMode[]).map((mode) => (
                <label key={mode} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="resetMode"
                    value={mode}
                    checked={resetMode === mode}
                    onChange={() => setResetMode(mode)}
                  />
                  <span className="capitalize">{mode}</span>
                </label>
              ))}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{isSpanish ? 'Cancelar' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSpanish ? 'Reiniciar' : 'Reset'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
