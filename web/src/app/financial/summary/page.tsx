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
