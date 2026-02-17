'use client';

/**
 * Adaptive Reconciliation Results Panel
 *
 * OB-38 Phase 6: Displays results from the Adaptive Multi-Layer Comparison Engine.
 *
 * Shows:
 *   - Depth assessment (what layers were compared)
 *   - L0 Aggregate comparison with false-green indicator
 *   - False green alerts (highest priority)
 *   - Store-level comparisons (L4)
 *   - Employee-level summary (links to existing ReconciliationTable)
 *
 * Uses Wayfinder L2 patterns: opacity/weight/attention, NOT stoplight colors.
 */

import { useCurrency } from '@/contexts/tenant-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Layers,
  CheckCircle,
  MinusCircle,
  Store,
  ShieldAlert,
} from 'lucide-react';
import type { AdaptiveComparisonResult } from '@/lib/reconciliation/adaptive-comparison-engine';
import type { ComparisonLayer, LayerStatus } from '@/lib/reconciliation/comparison-depth-engine';
import type { DeltaFlag } from '@/lib/reconciliation/comparison-engine';

interface AdaptiveResultsPanelProps {
  result: AdaptiveComparisonResult;
}

// ============================================
// LAYER DISPLAY CONFIG
// ============================================

const LAYER_LABELS: Record<ComparisonLayer, string> = {
  aggregate: 'Aggregate',
  employee: 'Employee',
  component: 'Component',
  metric: 'Metric',
  store: 'Store',
};

const STATUS_STYLES: Record<LayerStatus, { badge: string; icon: typeof CheckCircle }> = {
  available: { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle },
  partial: { badge: 'bg-amber-100 text-amber-800 border-amber-200', icon: MinusCircle },
  unavailable: { badge: 'bg-slate-100 text-slate-500 border-slate-200', icon: MinusCircle },
};

// Wayfinder L2: opacity/weight, NOT red/green stoplight
const FLAG_STYLES: Record<DeltaFlag, string> = {
  exact: 'text-zinc-100 font-normal',
  tolerance: 'text-zinc-400 font-normal',
  amber: 'text-zinc-100 font-semibold',
  red: 'text-zinc-100 font-bold underline decoration-2',
};

export function AdaptiveResultsPanel({ result }: AdaptiveResultsPanelProps) {
  const { format: fmt } = useCurrency();

  return (
    <div className="space-y-4">
      {/* Depth Assessment Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" />
            Comparison Depth
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {result.depth.layers.map(layer => {
              const style = STATUS_STYLES[layer.status];
              const Icon = style.icon;
              return (
                <Badge key={layer.layer} className={`${style.badge} text-xs py-1`}>
                  <Icon className="h-3 w-3 mr-1" />
                  {LAYER_LABELS[layer.layer]}
                  {layer.status === 'available' && layer.depth > 0 && (
                    <span className="ml-1 opacity-60">{layer.depth}%</span>
                  )}
                </Badge>
              );
            })}
          </div>
          {result.depth.recommendations.length > 0 && (
            <div className="mt-3 space-y-1">
              {result.depth.recommendations.map((rec, i) => (
                <p key={i} className="text-xs text-slate-500">{rec}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* False Green Alerts -- Highest Priority */}
      {result.falseGreens.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-amber-800">
              <ShieldAlert className="h-4 w-4" />
              False Greens Detected ({result.falseGreens.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-amber-700 mb-3">
              These employees have matching totals but diverging components.
              Offsetting errors may be masking real discrepancies.
            </p>
            <div className="space-y-2">
              {result.falseGreens.slice(0, 10).map(fg => (
                <div key={fg.entityId} className="p-2 bg-amber-50 rounded border border-amber-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{fg.entityName}</span>
                    <span className="text-xs text-amber-600 font-mono">
                      {fg.componentFlags.length} component(s) diverge
                    </span>
                  </div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {fg.componentFlags.map((cf, i) => (
                      <span key={i} className="text-xs text-amber-700">
                        {cf.componentName}: {fmt(Math.abs(cf.delta))}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {result.falseGreens.length > 10 && (
                <p className="text-xs text-amber-600 text-center">
                  +{result.falseGreens.length - 10} more
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* L0: Aggregate Comparison */}
      {result.aggregate && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Aggregate Totals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500">VL Total</p>
                <p className="text-lg font-bold">{fmt(result.aggregate.vlTotal)}</p>
                <p className="text-xs text-slate-400">{result.aggregate.entityCountVL} employees</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">File Total</p>
                <p className="text-lg font-bold">{fmt(result.aggregate.fileTotal)}</p>
                <p className="text-xs text-slate-400">{result.aggregate.entityCountFile} rows</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Difference</p>
                <p className={`text-lg font-bold ${FLAG_STYLES[result.aggregate.flag]}`}>
                  {result.aggregate.delta >= 0 ? '+' : ''}{fmt(Math.abs(result.aggregate.delta))}
                </p>
                <p className="text-xs text-slate-400">
                  {(result.aggregate.deltaPercent * 100).toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">False Green Risk</p>
                <Badge className={
                  result.depth.falseGreenRisk === 'high' ? 'bg-amber-100 text-amber-800' :
                  result.depth.falseGreenRisk === 'medium' ? 'bg-slate-100 text-slate-700' :
                  'bg-emerald-100 text-emerald-800'
                }>
                  {result.depth.falseGreenRisk}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* L1 Employee Summary */}
      {result.summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Employee Match Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold">{result.summary.matched}</p>
                <p className="text-xs text-slate-500">Matched</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{result.summary.exactMatches}</p>
                <p className="text-xs text-slate-500">Exact</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{result.summary.toleranceMatches}</p>
                <p className="text-xs text-slate-500">Within 5%</p>
              </div>
              <div>
                <p className="text-2xl font-bold opacity-80">{result.summary.amberFlags}</p>
                <p className="text-xs text-slate-500">5-15%</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{result.summary.redFlags}</p>
                <p className="text-xs text-slate-500">&gt;15%</p>
              </div>
            </div>
            <div className="flex gap-4 mt-3 text-xs text-slate-500 justify-center">
              <span>File-only: {result.summary.fileOnly}</span>
              <span>VL-only: {result.summary.vlOnly}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* L4: Store-Level Comparisons */}
      {result.storeComparisons.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="h-4 w-4" />
              Store-Level Comparison ({result.storeComparisons.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead className="text-right">VL Total</TableHead>
                  <TableHead className="text-right">File Total</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.storeComparisons.slice(0, 20).map(sc => (
                  <TableRow key={sc.storeId}>
                    <TableCell className="font-medium">
                      {sc.storeName || sc.storeId}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(sc.vlTotal)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(sc.fileTotal)}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${FLAG_STYLES[sc.flag]}`}>
                      {sc.delta >= 0 ? '+' : ''}{fmt(Math.abs(sc.delta))}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {sc.entityCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {result.storeComparisons.length > 20 && (
              <p className="text-xs text-slate-500 mt-2 text-center">
                Showing 20 of {result.storeComparisons.length} stores
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Compared Layers Footer */}
      <div className="flex items-center gap-2 text-xs text-slate-400 justify-center">
        <span>Compared layers:</span>
        {result.comparedLayers.map(layer => (
          <Badge key={layer} variant="outline" className="text-[10px]">
            {LAYER_LABELS[layer]}
          </Badge>
        ))}
      </div>
    </div>
  );
}
