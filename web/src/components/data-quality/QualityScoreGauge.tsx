'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { QualityScore } from '@/types/data-quality';
import { getQualityStatusLabel, getQualityStatusColor } from '@/lib/data-quality/quality-score-service';
import { useLocale } from '@/contexts/locale-context';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QualityScoreGaugeProps {
  score: QualityScore;
  showDimensions?: boolean;
  showTrend?: boolean;
  compact?: boolean;
}

export function QualityScoreGauge({
  score,
  showDimensions = true,
  showTrend = true,
  compact = false,
}: QualityScoreGaugeProps) {
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';

  // Calculate trend direction
  const getTrendDirection = () => {
    if (score.trend.length < 2) return 'stable';
    const lastTwo = score.trend.slice(-2);
    const diff = lastTwo[1].score - lastTwo[0].score;
    if (diff > 2) return 'up';
    if (diff < -2) return 'down';
    return 'stable';
  };

  const trendDirection = getTrendDirection();

  const getScoreColor = (value: number) => {
    if (value >= 90) return 'text-green-600';
    if (value >= 75) return 'text-blue-600';
    if (value >= 50) return 'text-amber-600';
    return 'text-red-600';
  };

  const getProgressColor = (value: number) => {
    if (value >= 90) return 'bg-green-500';
    if (value >= 75) return 'bg-blue-500';
    if (value >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className={cn('text-3xl font-bold', getScoreColor(score.overall))}>
          {score.overall}
        </div>
        <div className="flex flex-col">
          <Badge
            variant="secondary"
            className={cn('text-xs', getQualityStatusColor(score.status))}
          >
            {getQualityStatusLabel(score.status, isSpanish)}
          </Badge>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            {trendDirection === 'up' && (
              <TrendingUp className="h-3 w-3 text-green-500" />
            )}
            {trendDirection === 'down' && (
              <TrendingDown className="h-3 w-3 text-red-500" />
            )}
            {trendDirection === 'stable' && (
              <Minus className="h-3 w-3 text-muted-foreground" />
            )}
            <span>
              {trendDirection === 'up'
                ? isSpanish
                  ? 'Mejorando'
                  : 'Improving'
                : trendDirection === 'down'
                  ? isSpanish
                    ? 'Disminuyendo'
                    : 'Declining'
                  : isSpanish
                    ? 'Estable'
                    : 'Stable'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          {isSpanish ? 'Puntuación de Calidad' : 'Quality Score'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Score */}
        <div className="text-center">
          <div className={cn('text-5xl font-bold', getScoreColor(score.overall))}>
            {score.overall}
            <span className="text-xl text-muted-foreground">/100</span>
          </div>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Badge
              variant="secondary"
              className={cn('text-sm', getQualityStatusColor(score.status))}
            >
              {getQualityStatusLabel(score.status, isSpanish)}
            </Badge>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              {trendDirection === 'up' && (
                <>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span className="text-green-600">
                    {isSpanish ? 'Mejorando' : 'Improving'}
                  </span>
                </>
              )}
              {trendDirection === 'down' && (
                <>
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  <span className="text-red-600">
                    {isSpanish ? 'Disminuyendo' : 'Declining'}
                  </span>
                </>
              )}
              {trendDirection === 'stable' && (
                <>
                  <Minus className="h-4 w-4" />
                  <span>{isSpanish ? 'Estable' : 'Stable'}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Dimensions */}
        {showDimensions && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              {isSpanish ? 'Dimensiones de Calidad' : 'Quality Dimensions'}
            </h4>
            {Object.entries(score.dimensions).map(([key, dimension]) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{isSpanish ? dimension.nameEs : dimension.name}</span>
                  <span className={getScoreColor(dimension.score)}>
                    {dimension.score}%
                  </span>
                </div>
                <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn('h-full transition-all', getProgressColor(dimension.score))}
                    style={{ width: `${dimension.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Trend Chart */}
        {showTrend && score.trend.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {isSpanish ? 'Tendencia (7 días)' : '7-Day Trend'}
            </h4>
            <div className="flex items-end gap-1 h-16">
              {score.trend.map((point, index) => (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div
                    className={cn(
                      'w-full rounded-t transition-all',
                      getProgressColor(point.score)
                    )}
                    style={{ height: `${(point.score / 100) * 100}%` }}
                    title={`${point.date}: ${point.score}`}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(point.date).toLocaleDateString(
                      isSpanish ? 'es-MX' : 'en-US',
                      { weekday: 'narrow' }
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Impacting Issues */}
        {score.impactingIssues.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {isSpanish ? 'Problemas que Impactan' : 'Impacting Issues'}
            </h4>
            <div className="space-y-2">
              {score.impactingIssues.slice(0, 3).map((issue, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-sm p-2 rounded bg-muted/50"
                >
                  <span>{isSpanish ? issue.issueEs : issue.issue}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {issue.count}
                    </Badge>
                    <span className="text-red-600 font-medium">
                      -{issue.impact}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
