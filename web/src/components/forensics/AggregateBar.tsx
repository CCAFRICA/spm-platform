'use client';

/**
 * Aggregate Bar
 *
 * Summary cards for reconciliation session — VL vs GT totals,
 * match classification breakdown, and dynamic per-component aggregates.
 * All component names from plan.
 */

import { useCurrency } from '@/contexts/tenant-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import type { ReconciliationSession } from '@/lib/forensics/types';

interface AggregateBarProps {
  session: ReconciliationSession;
}

export function AggregateBar({ session }: AggregateBarProps) {
  const { format: fmt } = useCurrency();
  const { aggregates, population } = session;
  const diffPct = aggregates.gtTotal && aggregates.gtTotal > 0
    ? ((aggregates.difference ?? 0) / aggregates.gtTotal * 100).toFixed(2)
    : null;

  return (
    <div className="space-y-4">
      {/* Top summary row */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">VL Total</p>
            <p className="text-xl font-bold">{fmt(aggregates.vlTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">GT Total</p>
            <p className="text-xl font-bold">
              {aggregates.gtTotal !== undefined ? fmt(aggregates.gtTotal) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Difference</p>
            <p className={`text-xl font-bold ${
              aggregates.difference !== undefined && Math.abs(aggregates.difference) < 1
                ? 'text-green-600' : 'text-red-600'
            }`}>
              {aggregates.difference !== undefined
                ? `${aggregates.difference >= 0 ? '+' : ''}${fmt(Math.abs(aggregates.difference))}`
                : '—'}
              {diffPct && <span className="text-sm ml-1">({diffPct}%)</span>}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Population</p>
            <p className="text-xl font-bold">{population.totalEmployees}</p>
            <div className="flex gap-2 mt-1">
              <Badge className="bg-green-100 text-green-700 text-xs">
                <CheckCircle className="h-3 w-3 mr-0.5" />
                {population.trueMatches}
              </Badge>
              <Badge className="bg-amber-100 text-amber-700 text-xs">
                <AlertTriangle className="h-3 w-3 mr-0.5" />
                {population.coincidentalMatches}
              </Badge>
              <Badge className="bg-red-100 text-red-700 text-xs">
                <XCircle className="h-3 w-3 mr-0.5" />
                {population.mismatches}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-component aggregates — dynamic from plan */}
      {aggregates.componentTotals.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-3">Component Breakdown</p>
            <div className="grid gap-3" style={{
              gridTemplateColumns: `repeat(${Math.min(aggregates.componentTotals.length, 6)}, 1fr)`,
            }}>
              {aggregates.componentTotals.map(ct => (
                <div key={ct.componentId} className="text-center">
                  <p className="text-xs font-medium text-slate-700 truncate">{ct.componentName}</p>
                  <p className="text-sm font-bold mt-1">{fmt(ct.vlTotal)}</p>
                  {ct.difference !== undefined && (
                    <p className={`text-xs ${Math.abs(ct.difference) < 1 ? 'text-green-600' : 'text-red-600'}`}>
                      {ct.difference >= 0 ? '+' : ''}{fmt(Math.abs(ct.difference))}
                    </p>
                  )}
                  {ct.employeesAffected !== undefined && ct.employeesAffected > 0 && (
                    <p className="text-xs text-slate-400">{ct.employeesAffected} affected</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
