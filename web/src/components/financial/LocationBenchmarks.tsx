'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, MapPin, ArrowRight, Users } from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { isCCAdmin } from '@/types/auth';

export interface LocationPerformance {
  id: string;
  name: string;
  revenue: number;
  revenuePerHead: number;
  headcount: number;
  yoyDelta: number; // Year-over-year change percentage
  rank: number;
}

interface LocationBenchmarksProps {
  locations?: LocationPerformance[];
  showCount?: number;
  variant?: 'top' | 'bottom' | 'both';
  className?: string;
}

// Default demo data
const defaultLocations: LocationPerformance[] = [
  { id: 'loc-001', name: 'Downtown Flagship', revenue: 245000, revenuePerHead: 24500, headcount: 10, yoyDelta: 12.5, rank: 1 },
  { id: 'loc-002', name: 'Westside Mall', revenue: 198000, revenuePerHead: 22000, headcount: 9, yoyDelta: 8.3, rank: 2 },
  { id: 'loc-003', name: 'Airport Terminal', revenue: 187000, revenuePerHead: 23375, headcount: 8, yoyDelta: 15.2, rank: 3 },
  { id: 'loc-004', name: 'University District', revenue: 156000, revenuePerHead: 19500, headcount: 8, yoyDelta: -2.1, rank: 4 },
  { id: 'loc-005', name: 'Harbor Front', revenue: 142000, revenuePerHead: 17750, headcount: 8, yoyDelta: 5.7, rank: 5 },
  { id: 'loc-006', name: 'Tech Park', revenue: 134000, revenuePerHead: 16750, headcount: 8, yoyDelta: -8.4, rank: 6 },
  { id: 'loc-007', name: 'Suburban Plaza', revenue: 98000, revenuePerHead: 14000, headcount: 7, yoyDelta: -12.3, rank: 7 },
  { id: 'loc-008', name: 'North End', revenue: 87000, revenuePerHead: 12429, headcount: 7, yoyDelta: -5.8, rank: 8 },
];

export function LocationBenchmarks({
  locations,
  showCount = 3,
  variant = 'both',
  className = '',
}: LocationBenchmarksProps) {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { user } = useAuth();
  const userIsCCAdmin = user && isCCAdmin(user);
  const isSpanish = userIsCCAdmin ? false : currentTenant?.locale === 'es-MX';

  const displayLocations = locations || defaultLocations;

  const { topPerformers, bottomPerformers } = useMemo(() => {
    const sorted = [...displayLocations].sort((a, b) => b.revenuePerHead - a.revenuePerHead);
    return {
      topPerformers: sorted.slice(0, showCount),
      bottomPerformers: sorted.slice(-showCount).reverse(),
    };
  }, [displayLocations, showCount]);

  const renderLocationRow = (location: LocationPerformance, isTop: boolean) => (
    <Link
      key={location.id}
      href={`/configuration/locations/${location.id}`}
      className="block"
    >
      <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            isTop ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>
            #{location.rank}
          </div>
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-50 group-hover:text-indigo-600 transition-colors">
              {location.name}
            </p>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Users className="h-3 w-3" />
              {location.headcount} {isSpanish ? 'empleados' : 'staff'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold text-slate-900 dark:text-slate-50">
            {format(location.revenuePerHead)}
            <span className="text-xs text-slate-500 font-normal">
              /{isSpanish ? 'persona' : 'head'}
            </span>
          </p>
          <div className={`flex items-center justify-end gap-1 text-xs ${
            location.yoyDelta >= 0 ? 'text-emerald-600' : 'text-red-600'
          }`}>
            {location.yoyDelta >= 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span>
              {location.yoyDelta >= 0 ? '+' : ''}{location.yoyDelta.toFixed(1)}% YoY
            </span>
          </div>
        </div>
      </div>
    </Link>
  );

  return (
    <Card className={`border-0 shadow-lg ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4 text-slate-500" />
            {isSpanish ? 'Comparativa de Ubicaciones' : 'Location Benchmarks'}
          </CardTitle>
          <Link href="/configuration/locations">
            <Button variant="ghost" size="sm" className="gap-1 text-xs">
              {isSpanish ? 'Ver todas' : 'View all'}
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top Performers */}
        {(variant === 'top' || variant === 'both') && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-emerald-100 text-emerald-700">
                <TrendingUp className="h-3 w-3 mr-1" />
                {isSpanish ? 'Mejores' : 'Top'}
              </Badge>
              <span className="text-xs text-slate-500">
                {isSpanish ? 'Ingresos por persona' : 'Revenue per head'}
              </span>
            </div>
            <div className="space-y-1">
              {topPerformers.map((loc) => renderLocationRow(loc, true))}
            </div>
          </div>
        )}

        {/* Separator */}
        {variant === 'both' && (
          <div className="border-t border-slate-200 dark:border-slate-700" />
        )}

        {/* Bottom Performers */}
        {(variant === 'bottom' || variant === 'both') && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-red-100 text-red-700">
                <TrendingDown className="h-3 w-3 mr-1" />
                {isSpanish ? 'Atención' : 'Needs Focus'}
              </Badge>
              <span className="text-xs text-slate-500">
                {isSpanish ? 'Oportunidad de mejora' : 'Improvement opportunity'}
              </span>
            </div>
            <div className="space-y-1">
              {bottomPerformers.map((loc) => renderLocationRow(loc, false))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
