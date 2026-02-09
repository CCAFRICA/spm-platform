'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LineChart, Download, Calendar } from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';

type DateRange = '7d' | '30d' | '90d' | '1y';

interface DataPoint {
  date: string;
  retail: number;
  hospitality: number;
  services: number;
  projection?: number;
}

interface RevenueTimelineProps {
  data?: DataPoint[];
  className?: string;
}

// Generate demo data based on date range
function generateDemoData(range: DateRange): DataPoint[] {
  const now = new Date();
  const points: DataPoint[] = [];
  let numPoints: number;
  let intervalDays: number;

  switch (range) {
    case '7d':
      numPoints = 7;
      intervalDays = 1;
      break;
    case '30d':
      numPoints = 30;
      intervalDays = 1;
      break;
    case '90d':
      numPoints = 12;
      intervalDays = 7;
      break;
    case '1y':
      numPoints = 12;
      intervalDays = 30;
      break;
  }

  for (let i = numPoints - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * intervalDays);

    // Generate realistic revenue with some variance
    const baseRetail = 45000 + Math.random() * 15000;
    const baseHospitality = 32000 + Math.random() * 12000;
    const baseServices = 28000 + Math.random() * 10000;

    // Add seasonal trend (slight upward)
    const trend = 1 + (numPoints - i) * 0.01;

    points.push({
      date: date.toISOString().split('T')[0],
      retail: Math.round(baseRetail * trend),
      hospitality: Math.round(baseHospitality * trend),
      services: Math.round(baseServices * trend),
    });
  }

  // Add projections for the next 3 periods
  for (let i = 1; i <= 3; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i * intervalDays);

    const lastPoint = points[points.length - 1];
    const projectionMultiplier = 1 + Math.random() * 0.05;

    points.push({
      date: date.toISOString().split('T')[0],
      retail: Math.round(lastPoint.retail * projectionMultiplier),
      hospitality: Math.round(lastPoint.hospitality * projectionMultiplier),
      services: Math.round(lastPoint.services * projectionMultiplier),
      projection: Math.round(
        (lastPoint.retail + lastPoint.hospitality + lastPoint.services) * projectionMultiplier
      ),
    });
  }

  return points;
}

export function RevenueTimeline({ data, className = '' }: RevenueTimelineProps) {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { user } = useAuth();
  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : currentTenant?.locale === 'es-MX';

  const [dateRange, setDateRange] = useState<DateRange>('30d');

  const displayData = useMemo(() => {
    return data || generateDemoData(dateRange);
  }, [data, dateRange]);

  // Calculate chart dimensions
  const chartHeight = 200;
  const chartWidth = 600;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Calculate scales
  const maxValue = useMemo(() => {
    return Math.max(...displayData.flatMap((d) => [d.retail, d.hospitality, d.services]));
  }, [displayData]);

  const yScale = (value: number) => {
    return innerHeight - (value / maxValue) * innerHeight;
  };

  const xScale = (index: number) => {
    return (index / (displayData.length - 1)) * innerWidth;
  };

  // Generate path data for each line
  const generatePath = (key: 'retail' | 'hospitality' | 'services') => {
    return displayData
      .map((d, i) => {
        const x = xScale(i);
        const y = yScale(d[key]);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  // Find projection start index
  const projectionStartIndex = displayData.findIndex((d) => d.projection !== undefined);

  // Export data as CSV
  const handleExport = () => {
    const headers = ['Date', 'Retail', 'Hospitality', 'Services', 'Total'];
    const rows = displayData.map((d) => [
      d.date,
      d.retail,
      d.hospitality,
      d.services,
      d.retail + d.hospitality + d.services,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revenue-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dateRangeLabels: Record<DateRange, string> = {
    '7d': isSpanish ? '7 días' : '7 days',
    '30d': isSpanish ? '30 días' : '30 days',
    '90d': isSpanish ? '90 días' : '90 days',
    '1y': isSpanish ? '1 año' : '1 year',
  };

  // Calculate totals
  const totals = useMemo(() => {
    const nonProjection = displayData.filter((d) => d.projection === undefined);
    return {
      retail: nonProjection.reduce((sum, d) => sum + d.retail, 0),
      hospitality: nonProjection.reduce((sum, d) => sum + d.hospitality, 0),
      services: nonProjection.reduce((sum, d) => sum + d.services, 0),
    };
  }, [displayData]);

  return (
    <Card className={`border-0 shadow-lg ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <LineChart className="h-4 w-4 text-slate-500" />
            {isSpanish ? 'Tendencia de Ingresos' : 'Revenue Trends'}
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Date range selector */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              {(['7d', '30d', '90d', '1y'] as DateRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    dateRange === range
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {dateRangeLabels[range]}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1">
              <Download className="h-3 w-3" />
              {isSpanish ? 'Exportar' : 'Export'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-indigo-500" />
            <span className="text-slate-600">Retail</span>
            <span className="font-medium text-slate-900 dark:text-slate-50">{format(totals.retail)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-slate-600">{isSpanish ? 'Hospitalidad' : 'Hospitality'}</span>
            <span className="font-medium text-slate-900 dark:text-slate-50">{format(totals.hospitality)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-slate-600">{isSpanish ? 'Servicios' : 'Services'}</span>
            <span className="font-medium text-slate-900 dark:text-slate-50">{format(totals.services)}</span>
          </div>
          {projectionStartIndex > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-slate-400 border-dashed border-t-2 border-slate-400" />
              <span className="text-slate-500">{isSpanish ? 'Proyección' : 'Projection'}</span>
            </div>
          )}
        </div>

        {/* SVG Chart */}
        <div className="overflow-x-auto">
          <svg
            width="100%"
            height={chartHeight}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <g transform={`translate(${padding.left}, ${padding.top})`}>
              {/* Y-axis grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                const y = innerHeight * (1 - tick);
                const value = Math.round(maxValue * tick);
                return (
                  <g key={tick}>
                    <line
                      x1={0}
                      y1={y}
                      x2={innerWidth}
                      y2={y}
                      stroke="currentColor"
                      strokeOpacity={0.1}
                    />
                    <text
                      x={-10}
                      y={y + 4}
                      textAnchor="end"
                      className="text-[10px] fill-slate-400"
                    >
                      {(value / 1000).toFixed(0)}k
                    </text>
                  </g>
                );
              })}

              {/* Projection area */}
              {projectionStartIndex > 0 && (
                <rect
                  x={xScale(projectionStartIndex)}
                  y={0}
                  width={innerWidth - xScale(projectionStartIndex)}
                  height={innerHeight}
                  fill="currentColor"
                  fillOpacity={0.05}
                  className="text-slate-500"
                />
              )}

              {/* Lines */}
              <path
                d={generatePath('retail')}
                fill="none"
                stroke="#6366f1"
                strokeWidth={2}
                strokeLinejoin="round"
              />
              <path
                d={generatePath('hospitality')}
                fill="none"
                stroke="#10b981"
                strokeWidth={2}
                strokeLinejoin="round"
              />
              <path
                d={generatePath('services')}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeLinejoin="round"
              />

              {/* Data points */}
              {displayData.map((d, i) => (
                <g key={d.date}>
                  <circle
                    cx={xScale(i)}
                    cy={yScale(d.retail)}
                    r={3}
                    fill="#6366f1"
                    className={d.projection ? 'opacity-50' : ''}
                  />
                  <circle
                    cx={xScale(i)}
                    cy={yScale(d.hospitality)}
                    r={3}
                    fill="#10b981"
                    className={d.projection ? 'opacity-50' : ''}
                  />
                  <circle
                    cx={xScale(i)}
                    cy={yScale(d.services)}
                    r={3}
                    fill="#f59e0b"
                    className={d.projection ? 'opacity-50' : ''}
                  />
                </g>
              ))}

              {/* X-axis labels (show every few) */}
              {displayData
                .filter((_, i) => i % Math.ceil(displayData.length / 6) === 0 || i === displayData.length - 1)
                .map((d, _) => {
                  const originalIndex = displayData.findIndex((dd) => dd.date === d.date);
                  const date = new Date(d.date);
                  const label =
                    dateRange === '1y'
                      ? date.toLocaleDateString(isSpanish ? 'es-MX' : 'en-US', { month: 'short' })
                      : date.toLocaleDateString(isSpanish ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric' });
                  return (
                    <text
                      key={d.date}
                      x={xScale(originalIndex)}
                      y={innerHeight + 20}
                      textAnchor="middle"
                      className="text-[10px] fill-slate-400"
                    >
                      {label}
                    </text>
                  );
                })}
            </g>
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
