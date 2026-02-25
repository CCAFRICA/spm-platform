'use client';

/**
 * Monthly Operating Summary Page
 *
 * P&L-style financial summary with per-location breakdown.
 * All data from committed_data (pos_cheque) via financial-data-service.
 */

import { useEffect, useState } from 'react';
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
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { loadSummaryData, type SummaryPageData } from '@/lib/financial/financial-data-service';

export default function MonthlySummaryPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const { format } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SummaryPageData | null>(null);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let cancelled = false;
    loadSummaryData(tenantId)
      .then(result => { if (!cancelled) setData(result); })
      .catch(err => console.error('Failed to load summary data:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

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
            <p className="text-muted-foreground">Import POS data to see the monthly operating summary.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <Link href="/financial" className="hover:text-foreground">Financial</Link>
        <ChevronRight className="h-4 w-4 mx-1" />
        <span className="text-foreground font-medium">Summary</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          Monthly Operating Summary
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

      {/* Location Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Location Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Gross Revenue</TableHead>
                  <TableHead className="text-right">Food</TableHead>
                  <TableHead className="text-right">Beverage</TableHead>
                  <TableHead className="text-right">Tips</TableHead>
                  <TableHead className="text-right">Discounts</TableHead>
                  <TableHead className="text-right">Net Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.locationBreakdown.map((loc) => (
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
