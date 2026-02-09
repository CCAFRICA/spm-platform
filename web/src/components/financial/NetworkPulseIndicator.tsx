'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';

interface NetworkMetrics {
  avgRevenue: number;
  disputeRate: number;
  syncStatus: 'synced' | 'partial' | 'offline';
  activeLocations: number;
  totalLocations: number;
  lastSync: string;
}

interface NetworkPulseIndicatorProps {
  metrics?: NetworkMetrics;
  className?: string;
}

// Calculate health score from metrics
function calculateHealthScore(metrics: NetworkMetrics): number {
  let score = 0;

  // Revenue contribution (0-40 points)
  // Assume $50k/month is baseline for full points
  const revenueScore = Math.min(40, (metrics.avgRevenue / 50000) * 40);
  score += revenueScore;

  // Dispute rate contribution (0-30 points)
  // Lower is better: 0% = 30pts, 5% = 0pts
  const disputeScore = Math.max(0, 30 - (metrics.disputeRate / 5) * 30);
  score += disputeScore;

  // Sync status contribution (0-20 points)
  const syncScore =
    metrics.syncStatus === 'synced' ? 20 :
    metrics.syncStatus === 'partial' ? 10 : 0;
  score += syncScore;

  // Active locations (0-10 points)
  const locationScore = metrics.totalLocations > 0
    ? (metrics.activeLocations / metrics.totalLocations) * 10
    : 0;
  score += locationScore;

  return Math.round(score);
}

// Get color based on score
function getScoreColor(score: number): { ring: string; bg: string; text: string } {
  if (score >= 80) {
    return { ring: 'stroke-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-700' };
  } else if (score >= 60) {
    return { ring: 'stroke-amber-500', bg: 'bg-amber-100', text: 'text-amber-700' };
  } else {
    return { ring: 'stroke-red-500', bg: 'bg-red-100', text: 'text-red-700' };
  }
}

// Get status label
function getStatusLabel(score: number, isSpanish: boolean): string {
  if (score >= 80) {
    return isSpanish ? 'Saludable' : 'Healthy';
  } else if (score >= 60) {
    return isSpanish ? 'Atención' : 'Needs Attention';
  } else {
    return isSpanish ? 'Crítico' : 'Critical';
  }
}

export function NetworkPulseIndicator({ metrics, className = '' }: NetworkPulseIndicatorProps) {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { user } = useAuth();
  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : currentTenant?.locale === 'es-MX';

  // Default metrics for demo
  const defaultMetrics: NetworkMetrics = useMemo(() => ({
    avgRevenue: 67500,
    disputeRate: 1.2,
    syncStatus: 'synced',
    activeLocations: 12,
    totalLocations: 12,
    lastSync: new Date().toISOString(),
  }), []);

  const displayMetrics = metrics || defaultMetrics;
  const healthScore = calculateHealthScore(displayMetrics);
  const colors = getScoreColor(healthScore);
  const statusLabel = getStatusLabel(healthScore, isSpanish);

  // SVG gauge parameters
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (healthScore / 100) * circumference;

  return (
    <Card className={`border-0 shadow-lg ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-500" />
            {isSpanish ? 'Pulso de la Red' : 'Network Pulse'}
          </CardTitle>
          <Badge className={`${colors.bg} ${colors.text}`}>
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          {/* Gauge */}
          <div className="relative">
            <svg width={size} height={size} className="transform -rotate-90">
              {/* Background circle */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                className="text-slate-200 dark:text-slate-700"
              />
              {/* Progress circle */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - progress}
                className={colors.ring}
                style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
              />
            </svg>
            {/* Score text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                {healthScore}
              </span>
            </div>
          </div>

          {/* Metrics */}
          <div className="flex-1 space-y-3">
            {/* Avg Revenue */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {isSpanish ? 'Ingresos Prom.' : 'Avg Revenue'}
              </span>
              <span className="font-medium text-slate-900 dark:text-slate-50">
                {format(displayMetrics.avgRevenue)}
              </span>
            </div>

            {/* Dispute Rate */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {isSpanish ? 'Tasa Disputas' : 'Dispute Rate'}
              </span>
              <span className={`font-medium ${displayMetrics.disputeRate > 3 ? 'text-red-600' : 'text-slate-900 dark:text-slate-50'}`}>
                {displayMetrics.disputeRate.toFixed(1)}%
              </span>
            </div>

            {/* Sync Status */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {isSpanish ? 'Sincronización' : 'Sync Status'}
              </span>
              <span className={`font-medium ${
                displayMetrics.syncStatus === 'synced' ? 'text-emerald-600' :
                displayMetrics.syncStatus === 'partial' ? 'text-amber-600' : 'text-red-600'
              }`}>
                {displayMetrics.syncStatus === 'synced'
                  ? (isSpanish ? 'Sincronizado' : 'Synced')
                  : displayMetrics.syncStatus === 'partial'
                    ? (isSpanish ? 'Parcial' : 'Partial')
                    : (isSpanish ? 'Sin conexión' : 'Offline')}
              </span>
            </div>

            {/* Active Locations */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">
                {isSpanish ? 'Ubicaciones' : 'Locations'}
              </span>
              <span className="font-medium text-slate-900 dark:text-slate-50">
                {displayMetrics.activeLocations}/{displayMetrics.totalLocations}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
