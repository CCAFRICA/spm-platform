'use client';

/**
 * Dispute Analytics — /insights/disputes
 *
 * Wired to GET /api/disputes for real stats.
 * Funnel + outcome charts require step-tracking (future) — shown as empty state.
 * Category breakdown computed from real dispute data.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';

interface DisputeRow {
  id: string;
  category: string;
  status: string;
  amount_disputed: number | null;
  amount_resolved: number | null;
  created_at: string;
  resolved_at: string | null;
}

const CATEGORY_LABELS: Record<string, { en: string; es: string }> = {
  data_error: { en: 'Data Error', es: 'Error de Datos' },
  calculation_error: { en: 'Calculation Error', es: 'Error de Cálculo' },
  plan_interpretation: { en: 'Plan Interpretation', es: 'Interpretación de Plan' },
  missing_transaction: { en: 'Missing Transaction', es: 'Transacción Faltante' },
  wrong_attribution: { en: 'Wrong Attribution', es: 'Atribución Incorrecta' },
  incorrect_amount: { en: 'Incorrect Amount', es: 'Monto Incorrecto' },
  wrong_rate: { en: 'Wrong Rate', es: 'Tasa Incorrecta' },
  split_error: { en: 'Split Error', es: 'Error de División' },
  timing_issue: { en: 'Timing Issue', es: 'Problema de Tiempo' },
  other: { en: 'Other', es: 'Otro' },
};

export default function DisputeAnalyticsPage() {
  const { currentTenant } = useTenant();
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDisputes = useCallback(async () => {
    if (!currentTenant) return;
    setIsLoading(true);
    try {
      const response = await fetch('/api/disputes');
      if (response.ok) {
        const data = await response.json();
        setDisputes((data.disputes || []) as DisputeRow[]);
      }
    } catch (err) {
      console.error('[DisputeAnalytics] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  // Compute stats from real data
  const total = disputes.length;
  const openCount = disputes.filter(d => d.status === 'open' || d.status === 'investigating' || d.status === 'escalated').length;
  const resolvedCount = disputes.filter(d => d.status === 'resolved').length;
  const totalDisputed = disputes.reduce((s, d) => s + (d.amount_disputed || 0), 0);
  const totalResolved = disputes.filter(d => d.status === 'resolved').reduce((s, d) => s + (d.amount_resolved || 0), 0);

  // Category breakdown
  const categoryMap = new Map<string, { total: number; resolved: number; pending: number }>();
  for (const d of disputes) {
    const cat = d.category || 'other';
    const entry = categoryMap.get(cat) || { total: 0, resolved: 0, pending: 0 };
    entry.total++;
    if (d.status === 'resolved' || d.status === 'rejected') {
      entry.resolved++;
    } else {
      entry.pending++;
    }
    categoryMap.set(cat, entry);
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">
            {isSpanish ? 'Cargando analíticas...' : 'Loading analytics...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          {isSpanish ? 'Analíticas de Disputas' : 'Dispute Analytics'}
        </h1>
        <p className="text-muted-foreground">
          {isSpanish ? 'Estadísticas y tendencias de disputas' : 'Dispute statistics and trends'}
        </p>
      </div>

      {/* Metrics Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center dark:bg-blue-900/30">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{total}</div>
                <div className="text-sm text-muted-foreground">
                  {isSpanish ? 'Total Disputas' : 'Total Disputes'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center dark:bg-amber-900/30">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{openCount}</div>
                <div className="text-sm text-muted-foreground">
                  {isSpanish ? 'Pendientes' : 'Open'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center dark:bg-green-900/30">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{resolvedCount}</div>
                <div className="text-sm text-muted-foreground">
                  {isSpanish ? 'Resueltas' : 'Resolved'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center dark:bg-purple-900/30">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {total > 0 ? Math.round((resolvedCount / total) * 100) : 0}%
                </div>
                <div className="text-sm text-muted-foreground">
                  {isSpanish ? 'Tasa de Resolución' : 'Resolution Rate'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>{isSpanish ? 'Desglose por Categoría' : 'Category Breakdown'}</CardTitle>
          <CardDescription>
            {isSpanish ? 'Distribución de disputas por tipo' : 'Dispute distribution by type'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categoryMap.size === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{isSpanish ? 'No hay datos de disputas' : 'No dispute data available'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from(categoryMap.entries())
                .sort((a, b) => b[1].total - a[1].total)
                .map(([category, stats]) => {
                  const pct = total > 0 ? (stats.total / total) * 100 : 0;
                  const catLabel = CATEGORY_LABELS[category];
                  return (
                    <div key={category} className="flex items-center gap-4">
                      <div className="w-40 text-sm font-medium truncate">
                        {catLabel ? (isSpanish ? catLabel.es : catLabel.en) : category}
                      </div>
                      <div className="flex-1">
                        <div className="h-6 bg-muted rounded-full overflow-hidden flex">
                          <div
                            className="h-full bg-green-500 transition-all"
                            style={{ width: `${total > 0 ? (stats.resolved / total) * 100 : 0}%` }}
                          />
                          <div
                            className="h-full bg-amber-400 transition-all"
                            style={{ width: `${total > 0 ? (stats.pending / total) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-20 text-right text-sm">
                        <span className="font-medium">{stats.total}</span>
                        <span className="text-muted-foreground ml-1">({pct.toFixed(0)}%)</span>
                      </div>
                    </div>
                  );
                })}
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                  {isSpanish ? 'Cerradas' : 'Closed'}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  {isSpanish ? 'Pendientes' : 'Pending'}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Amount Summary */}
      {totalDisputed > 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center dark:bg-red-900/30">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">${totalDisputed.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">
                    {isSpanish ? 'Total Disputado' : 'Total Disputed'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center dark:bg-green-900/30">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">${totalResolved.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">
                    {isSpanish ? 'Total Resuelto' : 'Total Resolved'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
