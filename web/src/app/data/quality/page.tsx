'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Info,
  RefreshCw,
  Database,
  CheckCircle,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTenant } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import {
  getPendingItems,
  getResolvedItems,
  getQuarantineStats,
  resolveItem,
  applySuggestedFix,
  bulkResolve,
} from '@/lib/data-quality/quarantine-service';
import {
  calculateQualityScore,
  getDataSourceHealth,
  getQualityStatusLabel,
  getQualityStatusColor,
} from '@/lib/data-quality/quality-score-service';
import type { QuarantineItem, QualityScore, DataSourceHealth, QuarantineResolution } from '@/types/data-quality';
import { QualityScoreGauge } from '@/components/data-quality/QualityScoreGauge';
import { QuarantineTable } from '@/components/data-quality/QuarantineTable';

export default function DataQualityPage() {
  const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const { user } = useAuth();
  const isSpanish = locale === 'es-MX' || currentTenant?.locale === 'es-MX';
  const tenantId = currentTenant?.id || 'retailco';

  const [qualityScore, setQualityScore] = useState<QualityScore | null>(null);
  const [pendingItems, setPendingItems] = useState<QuarantineItem[]>([]);
  const [resolvedItems, setResolvedItems] = useState<QuarantineItem[]>([]);
  const [sourceHealth, setSourceHealth] = useState<DataSourceHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const score = calculateQualityScore(tenantId);
      const pending = getPendingItems(tenantId);
      const resolved = getResolvedItems(tenantId);
      const health = getDataSourceHealth(tenantId);

      setQualityScore(score);
      setPendingItems(pending);
      setResolvedItems(resolved);
      setSourceHealth(health);
    } catch (error) {
      console.error('Error loading data quality:', error);
      toast.error(isSpanish ? 'Error al cargar datos' : 'Error loading data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [tenantId, isSpanish]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
    toast.success(isSpanish ? 'Datos actualizados' : 'Data refreshed');
  };

  const handleResolve = (itemId: string, resolution: QuarantineResolution) => {
    try {
      resolveItem(itemId, resolution, user?.id || 'admin', user?.name || 'Admin');
      loadData();
      toast.success(
        resolution.action === 'approve'
          ? isSpanish
            ? 'Registro aprobado'
            : 'Record approved'
          : resolution.action === 'correct'
            ? isSpanish
              ? 'Registro corregido'
              : 'Record corrected'
            : isSpanish
              ? 'Registro rechazado'
              : 'Record rejected'
      );
    } catch (error) {
      console.error('Error resolving item:', error);
      toast.error(isSpanish ? 'Error al resolver' : 'Error resolving');
    }
  };

  const handleApplySuggestedFix = (itemId: string) => {
    try {
      applySuggestedFix(itemId, user?.id || 'admin', user?.name || 'Admin');
      loadData();
      toast.success(isSpanish ? 'Sugerencia aplicada' : 'Suggestion applied');
    } catch (error) {
      console.error('Error applying fix:', error);
      toast.error(isSpanish ? 'Error al aplicar' : 'Error applying fix');
    }
  };

  const handleBulkResolve = (itemIds: string[], resolution: QuarantineResolution) => {
    try {
      const count = bulkResolve(
        itemIds,
        resolution,
        user?.id || 'admin',
        user?.name || 'Admin'
      );
      loadData();
      toast.success(
        isSpanish
          ? `${count} registros ${resolution.action === 'approve' ? 'aprobados' : 'rechazados'}`
          : `${count} records ${resolution.action === 'approve' ? 'approved' : 'rejected'}`
      );
    } catch (error) {
      console.error('Error bulk resolving:', error);
      toast.error(isSpanish ? 'Error en operación masiva' : 'Error in bulk operation');
    }
  };

  const stats = getQuarantineStats(tenantId);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">
            {isSpanish ? 'Cargando calidad de datos...' : 'Loading data quality...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            {isSpanish ? 'Centro de Calidad de Datos' : 'Data Quality Center'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish
              ? 'Monitorea y resuelve problemas de calidad de datos'
              : 'Monitor and resolve data quality issues'}
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isSpanish ? 'Actualizar' : 'Refresh'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                {qualityScore && (
                  <>
                    <p className={`text-2xl font-bold ${getQualityStatusColor(qualityScore.status)}`}>
                      {qualityScore.overall}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getQualityStatusLabel(qualityScore.status, isSpanish)}
                    </p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg dark:bg-red-900/30">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.bySeverity.critical}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? 'Críticos' : 'Critical'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.bySeverity.warning}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? 'Advertencias' : 'Warnings'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg dark:bg-green-900/30">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.resolved}</p>
                <p className="text-xs text-muted-foreground">
                  {isSpanish ? 'Resueltos' : 'Resolved'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Quality Score */}
        <div className="lg:col-span-1">
          {qualityScore && <QualityScoreGauge score={qualityScore} />}

          {/* Data Source Health */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5" />
                {isSpanish ? 'Fuentes de Datos' : 'Data Sources'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sourceHealth.map((source) => (
                <div
                  key={source.source}
                  className="flex items-center justify-between p-2 rounded-lg border"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        source.status === 'healthy'
                          ? 'bg-green-500'
                          : source.status === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                      }`}
                    />
                    <span className="font-medium text-sm">
                      {isSpanish ? source.sourceNameEs : source.sourceName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {source.errorCount > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {source.errorCount}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {source.recordCount.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Quarantine Queue */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="pending" className="space-y-4">
            <TabsList>
              <TabsTrigger value="pending" className="gap-2">
                <AlertTriangle className="h-4 w-4" />
                {isSpanish ? 'Pendientes' : 'Pending'}
                <Badge variant="secondary" className="ml-1">
                  {stats.pending}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="resolved" className="gap-2">
                <CheckCircle className="h-4 w-4" />
                {isSpanish ? 'Resueltos' : 'Resolved'}
                <Badge variant="secondary" className="ml-1">
                  {stats.resolved}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              <QuarantineTable
                items={pendingItems}
                onResolve={handleResolve}
                onApplySuggestedFix={handleApplySuggestedFix}
                onBulkResolve={handleBulkResolve}
              />
            </TabsContent>

            <TabsContent value="resolved">
              {resolvedItems.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {isSpanish ? 'Elementos Resueltos' : 'Resolved Items'}
                    </CardTitle>
                    <CardDescription>
                      {isSpanish
                        ? 'Historial de elementos procesados'
                        : 'History of processed items'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {resolvedItems.slice(0, 10).map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div>
                            <p className="font-medium">{item.recordId}</p>
                            <p className="text-xs text-muted-foreground">
                              {isSpanish ? item.errorMessageEs : item.errorMessage}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                item.status === 'approved'
                                  ? 'default'
                                  : item.status === 'corrected'
                                    ? 'secondary'
                                    : 'destructive'
                              }
                            >
                              {item.status === 'approved'
                                ? isSpanish
                                  ? 'Aprobado'
                                  : 'Approved'
                                : item.status === 'corrected'
                                  ? isSpanish
                                    ? 'Corregido'
                                    : 'Corrected'
                                  : isSpanish
                                    ? 'Rechazado'
                                    : 'Rejected'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {item.resolvedByName}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Info className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      {isSpanish
                        ? 'No hay elementos resueltos'
                        : 'No resolved items yet'}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
