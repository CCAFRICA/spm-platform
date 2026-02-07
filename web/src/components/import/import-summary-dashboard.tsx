'use client';

/**
 * Import Summary Dashboard
 *
 * Displays classification breakdown, quality score, and anomaly flags.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Wrench,
  TrendingUp,
  Users,
  Calendar,
  DollarSign,
  AlertOctagon,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { ImportBatchSummary, AnomalyFlag } from '@/lib/data-architecture/types';
import { useLocale } from '@/contexts/locale-context';
import { cn } from '@/lib/utils';

interface ImportSummaryDashboardProps {
  summary: ImportBatchSummary;
  className?: string;
}

const COLORS = {
  clean: '#22c55e',
  autoCorrected: '#eab308',
  quarantined: '#f97316',
  rejected: '#ef4444',
};

export function ImportSummaryDashboard({
  summary,
  className,
}: ImportSummaryDashboardProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const chartData = [
    {
      name: isSpanish ? 'Limpios' : 'Clean',
      value: summary.cleanRecords,
      color: COLORS.clean,
    },
    {
      name: isSpanish ? 'Auto-corregidos' : 'Auto-corrected',
      value: summary.autoCorrectedRecords,
      color: COLORS.autoCorrected,
    },
    {
      name: isSpanish ? 'En Cuarentena' : 'Quarantined',
      value: summary.quarantinedRecords,
      color: COLORS.quarantined,
    },
    {
      name: isSpanish ? 'Rechazados' : 'Rejected',
      value: summary.rejectedRecords,
      color: COLORS.rejected,
    },
  ].filter((d) => d.value > 0);

  const getQualityLabel = (score: number): string => {
    if (score >= 90) return isSpanish ? 'Excelente' : 'Excellent';
    if (score >= 75) return isSpanish ? 'Bueno' : 'Good';
    if (score >= 50) return isSpanish ? 'Regular' : 'Fair';
    return isSpanish ? 'Necesita Atención' : 'Needs Attention';
  };

  const getQualityColor = (score: number): string => {
    if (score >= 90) return 'text-green-600';
    if (score >= 75) return 'text-blue-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Quality Score and Classification Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quality Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {isSpanish ? 'Puntuación de Calidad' : 'Data Quality Score'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-4">
              <div className="relative">
                <svg className="w-32 h-32">
                  <circle
                    className="text-muted stroke-current"
                    strokeWidth="10"
                    fill="transparent"
                    r="52"
                    cx="64"
                    cy="64"
                  />
                  <circle
                    className={cn('stroke-current', getQualityColor(summary.dataQualityScore))}
                    strokeWidth="10"
                    strokeLinecap="round"
                    fill="transparent"
                    r="52"
                    cx="64"
                    cy="64"
                    strokeDasharray={`${(summary.dataQualityScore / 100) * 327} 327`}
                    transform="rotate(-90 64 64)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={cn('text-3xl font-bold', getQualityColor(summary.dataQualityScore))}>
                    {summary.dataQualityScore}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {getQualityLabel(summary.dataQualityScore)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Classification Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {isSpanish ? 'Clasificación de Registros' : 'Record Classification'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-32 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={50}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [value, isSpanish ? 'Registros' : 'Records']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">{isSpanish ? 'Limpios' : 'Clean'}</span>
                  </div>
                  <span className="font-medium">{summary.cleanRecords}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm">{isSpanish ? 'Auto-corregidos' : 'Auto-corrected'}</span>
                  </div>
                  <span className="font-medium">{summary.autoCorrectedRecords}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className="text-sm">{isSpanish ? 'Cuarentena' : 'Quarantined'}</span>
                  </div>
                  <span className="font-medium">{summary.quarantinedRecords}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm">{isSpanish ? 'Rechazados' : 'Rejected'}</span>
                  </div>
                  <span className="font-medium">{summary.rejectedRecords}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Impact */}
      {summary.financialImpact && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              {isSpanish ? 'Impacto Financiero' : 'Financial Impact'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  {isSpanish ? 'Valor Total' : 'Total Value'}
                </p>
                <p className="text-2xl font-bold">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: summary.financialImpact.currency,
                    minimumFractionDigits: 0,
                  }).format(summary.financialImpact.totalCompensationValue)}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Empleados' : 'Employees'}
                  </p>
                </div>
                <p className="text-2xl font-bold">
                  {summary.financialImpact.affectedEmployees}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {isSpanish ? 'Períodos' : 'Periods'}
                  </p>
                </div>
                <p className="text-2xl font-bold">
                  {summary.financialImpact.affectedPeriods.length}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  {isSpanish ? 'Moneda' : 'Currency'}
                </p>
                <p className="text-2xl font-bold">{summary.financialImpact.currency}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Anomaly Flags */}
      {summary.anomalyFlags.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertOctagon className="h-5 w-5" />
              {isSpanish ? 'Alertas Detectadas' : 'Detected Anomalies'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summary.anomalyFlags.map((flag, index) => (
                <AnomalyCard key={index} flag={flag} isSpanish={isSpanish} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Record Count Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {isSpanish ? 'Total de Registros' : 'Total Records'}
            </span>
            <span className="font-bold">{summary.totalRecords}</span>
          </div>
          <Progress
            value={
              ((summary.cleanRecords + summary.autoCorrectedRecords) /
                summary.totalRecords) *
              100
            }
            className="h-2"
          />
          <p className="text-xs text-muted-foreground mt-2">
            {summary.cleanRecords + summary.autoCorrectedRecords} {isSpanish ? 'registros listos para importar' : 'records ready to import'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AnomalyCard({ flag, isSpanish }: { flag: AnomalyFlag; isSpanish: boolean }) {
  const severityColors = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    critical: 'bg-red-50 border-red-200 text-red-800',
  };

  const severityLabels = {
    info: isSpanish ? 'Info' : 'Info',
    warning: isSpanish ? 'Advertencia' : 'Warning',
    critical: isSpanish ? 'Crítico' : 'Critical',
  };

  const typeLabels: Record<string, { en: string; es: string }> = {
    volume_spike: { en: 'Volume Spike', es: 'Pico de Volumen' },
    value_outlier: { en: 'Value Outlier', es: 'Valor Atípico' },
    pattern_deviation: { en: 'Pattern Deviation', es: 'Desviación de Patrón' },
    missing_expected: { en: 'Missing Expected', es: 'Faltante Esperado' },
    duplicate_detected: { en: 'Duplicates', es: 'Duplicados' },
  };

  return (
    <div className={cn('p-3 rounded-lg border', severityColors[flag.severity])}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {typeLabels[flag.type]?.[isSpanish ? 'es' : 'en'] || flag.type}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {severityLabels[flag.severity]}
            </Badge>
          </div>
          <p className="text-sm mt-1">{flag.message}</p>
        </div>
        <span className="text-sm font-medium">
          {flag.affectedRecords} {isSpanish ? 'registros' : 'records'}
        </span>
      </div>
    </div>
  );
}
