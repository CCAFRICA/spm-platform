'use client';

/**
 * Operating Summary Page
 *
 * P&L-style financial summary with per-location breakdown.
 * All data from committed_data (pos_cheque) via financial-data-service.
 */

import { useEffect, useState, useMemo } from 'react';
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
  FileText,
  Activity,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Lightbulb,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { loadSummaryData, type SummaryPageData } from '@/lib/financial/financial-data-service';

type SortField = 'name' | 'brand' | 'revenue' | 'food' | 'bev' | 'tips' | 'discounts' | 'netRevenue';
type SortOrder = 'asc' | 'desc';

export default function OperatingSummaryPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { format } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SummaryPageData | null>(null);
  const [sortField, setSortField] = useState<SortField>('revenue');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let cancelled = false;
    loadSummaryData(tenantId)
      .then(result => { if (!cancelled) setData(result); })
      .catch(err => console.error('Failed to load summary data:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  // Auto-generate insights from data
  const insights = useMemo(() => {
    if (!data) return [];
    const locs = data.locationBreakdown;
    if (locs.length < 2) return [];

    const results: Array<{ icon: 'alert' | 'trend' | 'insight'; title: string; detail: string; color: string }> = [];

    // Find highest and lowest revenue locations
    const sorted = [...locs].sort((a, b) => b.revenue - a.revenue);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    if (top && bottom && top.revenue > 0) {
      const ratio = top.revenue / bottom.revenue;
      if (ratio > 2) {
        results.push({
          icon: 'alert',
          title: `${ratio.toFixed(1)}x revenue gap`,
          detail: `${top.name} generates ${ratio.toFixed(1)}x more than ${bottom.name}`,
          color: 'text-amber-400',
        });
      }
    }

    // Find location with highest discount rate
    const withDiscountRate = locs.map(l => ({
      ...l,
      discountRate: l.revenue > 0 ? ((l.discounts + l.comps) / l.revenue) * 100 : 0,
    }));
    const highDiscount = withDiscountRate.sort((a, b) => b.discountRate - a.discountRate)[0];
    if (highDiscount && highDiscount.discountRate > 5) {
      results.push({
        icon: 'alert',
        title: `High leakage: ${highDiscount.name}`,
        detail: `${highDiscount.discountRate.toFixed(1)}% discount+comp rate — above 5% threshold`,
        color: 'text-red-400',
      });
    }

    // Find brand with best tip performance
    const brandTips = new Map<string, { brand: string; tips: number; revenue: number }>();
    for (const loc of locs) {
      const existing = brandTips.get(loc.brand) || { brand: loc.brand, tips: 0, revenue: 0 };
      existing.tips += loc.tips;
      existing.revenue += loc.revenue;
      brandTips.set(loc.brand, existing);
    }
    const brandTipRates = Array.from(brandTips.values())
      .filter(b => b.revenue > 0)
      .map(b => ({ ...b, tipRate: (b.tips / b.revenue) * 100 }))
      .sort((a, b) => b.tipRate - a.tipRate);
    if (brandTipRates.length >= 2) {
      const best = brandTipRates[0];
      results.push({
        icon: 'trend',
        title: `${best.brand} leads tips`,
        detail: `${best.tipRate.toFixed(1)}% tip rate — highest across brands`,
        color: 'text-green-400',
      });
    }

    // Food vs Bev concentration
    const totalFood = locs.reduce((s, l) => s + l.food, 0);
    const totalBev = locs.reduce((s, l) => s + l.bev, 0);
    const totalRev = totalFood + totalBev;
    if (totalRev > 0) {
      const foodPct = (totalFood / totalRev) * 100;
      results.push({
        icon: 'insight',
        title: `Food:Bev split ${foodPct.toFixed(0)}:${(100 - foodPct).toFixed(0)}`,
        detail: foodPct > 70 ? 'Beverage upsell opportunity — food-heavy mix' :
               foodPct < 40 ? 'Strong beverage performance' :
               'Balanced food and beverage mix',
        color: 'text-blue-400',
      });
    }

    return results.slice(0, 4);
  }, [data]);

  const sortedLocations = useMemo(() => {
    if (!data) return [];
    const locs = [...data.locationBreakdown];
    locs.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'brand': cmp = a.brand.localeCompare(b.brand); break;
        case 'revenue': cmp = a.revenue - b.revenue; break;
        case 'food': cmp = a.food - b.food; break;
        case 'bev': cmp = a.bev - b.bev; break;
        case 'tips': cmp = a.tips - b.tips; break;
        case 'discounts': cmp = (a.discounts + a.comps) - (b.discounts + b.comps); break;
        case 'netRevenue': cmp = a.netRevenue - b.netRevenue; break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return locs;
  }, [data, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const SortableHead = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`cursor-pointer hover:bg-zinc-800/50 transition-colors ${className || ''}`}
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field ? (
          sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-zinc-500" />
        )}
      </div>
    </TableHead>
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <Card className="max-w-xl mx-auto">
          <CardContent className="pt-6 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Data</h2>
            <p className="text-muted-foreground">Import POS data to see the operating summary.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          Operating Summary
        </h1>
        <p className="text-zinc-400">{data.periodLabel}</p>
      </div>

      {/* P&L Table */}
      <Card>
        <CardHeader>
          <CardTitle>Operating Statement</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left py-2 font-medium text-zinc-400">Line Item</th>
                <th className="text-right py-2 font-medium text-zinc-400">Amount</th>
                <th className="text-right py-2 font-medium text-zinc-400">% of Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line, i) => (
                <tr
                  key={i}
                  className={`border-b border-zinc-800/50 last:border-0 ${
                    line.isTotal ? 'bg-zinc-800/30 font-bold' :
                    line.isSubtotal ? 'font-semibold' : ''
                  }`}
                >
                  <td className={`py-2 ${line.isTotal || line.isSubtotal ? 'text-zinc-100' : 'text-zinc-300'}`}>
                    {line.label}
                  </td>
                  <td className={`py-2 text-right ${
                    line.isTotal ? 'text-amber-400 text-lg' :
                    line.amount < 0 ? 'text-red-400' : 'text-zinc-200'
                  }`}>
                    {line.label === 'Total Checks' || line.label === 'Cancelled Checks' || line.label === 'Total Guests'
                      ? line.amount.toLocaleString()
                      : line.label === 'Average Guests/Check'
                        ? line.amount.toFixed(1)
                        : format(Math.abs(line.amount))
                    }
                    {line.amount < 0 && line.label !== 'Total Checks' ? ' ▼' : ''}
                  </td>
                  <td className="py-2 text-right text-zinc-500">
                    {line.percent !== undefined ? `${line.percent}%` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {insights.map((insight, i) => (
            <Card key={i} className="border-l-2" style={{ borderLeftColor: insight.color === 'text-amber-400' ? '#fbbf24' : insight.color === 'text-red-400' ? '#f87171' : insight.color === 'text-green-400' ? '#4ade80' : '#60a5fa' }}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start gap-2">
                  {insight.icon === 'alert' && <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${insight.color}`} />}
                  {insight.icon === 'trend' && <TrendingUp className={`h-4 w-4 mt-0.5 shrink-0 ${insight.color}`} />}
                  {insight.icon === 'insight' && <Lightbulb className={`h-4 w-4 mt-0.5 shrink-0 ${insight.color}`} />}
                  <div>
                    <p className={`text-sm font-medium ${insight.color}`}>{insight.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{insight.detail}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Location Breakdown — Sortable */}
      <Card>
        <CardHeader>
          <CardTitle>Location Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead field="name">Location</SortableHead>
                  <SortableHead field="brand">Brand</SortableHead>
                  <SortableHead field="revenue" className="text-right">Gross Revenue</SortableHead>
                  <SortableHead field="food" className="text-right">Food</SortableHead>
                  <SortableHead field="bev" className="text-right">Beverage</SortableHead>
                  <SortableHead field="tips" className="text-right">Tips</SortableHead>
                  <SortableHead field="discounts" className="text-right">Discounts</SortableHead>
                  <SortableHead field="netRevenue" className="text-right">Net Revenue</SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLocations.map((loc) => (
                  <TableRow key={loc.name}>
                    <TableCell className="font-medium">{loc.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        style={{ backgroundColor: `${loc.brandColor}20`, color: loc.brandColor }}
                      >
                        {loc.brand}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{format(loc.revenue)}</TableCell>
                    <TableCell className="text-right text-zinc-400">{format(loc.food)}</TableCell>
                    <TableCell className="text-right text-zinc-400">{format(loc.bev)}</TableCell>
                    <TableCell className="text-right text-zinc-400">{format(loc.tips)}</TableCell>
                    <TableCell className="text-right text-red-400">{format(loc.discounts + loc.comps)}</TableCell>
                    <TableCell className="text-right font-medium text-amber-400">{format(loc.netRevenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
