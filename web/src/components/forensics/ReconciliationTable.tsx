'use client';

/**
 * Reconciliation Table
 *
 * Shows per-employee reconciliation results with dynamic component columns.
 * Column count driven by plan — zero hardcoded column names.
 */

import { useState, useMemo } from 'react';
import { useCurrency } from '@/contexts/tenant-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, ArrowUpDown, ExternalLink, AlertTriangle } from 'lucide-react';
import type { ReconciliationSession, EmployeeReconciliation } from '@/lib/forensics/types';

interface ReconciliationTableProps {
  session: ReconciliationSession;
  onEmployeeClick?: (entityId: string) => void;
}

type SortField = 'entityId' | 'vlTotal' | 'gtTotal' | 'difference';
type FilterType = 'all' | 'true_match' | 'coincidental_match' | 'mismatch';

export function ReconciliationTable({ session, onEmployeeClick }: ReconciliationTableProps) {
  const { format: formatCurrency } = useCurrency();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('difference');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  // Dynamic component columns from session
  const componentColumns = session.aggregates.componentTotals;

  const filtered = useMemo(() => {
    let results = [...session.employeeResults];

    if (search.trim()) {
      const q = search.toLowerCase();
      results = results.filter(r =>
        r.entityId.toLowerCase().includes(q) ||
        (r.storeId?.toLowerCase().includes(q))
      );
    }

    if (filter !== 'all') {
      results = results.filter(r => r.matchClassification === filter);
    }

    results.sort((a, b) => {
      const aVal = a[sortField] as number;
      const bVal = b[sortField] as number;
      return sortAsc ? aVal - bVal : bVal - aVal;
    });

    return results;
  }, [session.employeeResults, search, sortField, sortAsc, filter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const classificationBadge = (c: EmployeeReconciliation['matchClassification']) => {
    switch (c) {
      case 'true_match':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Match</Badge>;
      case 'coincidental_match':
        return (
          <Badge className="bg-amber-100 text-amber-700 border-amber-200">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Coincidental
          </Badge>
        );
      case 'mismatch':
        return <Badge variant="destructive">Mismatch</Badge>;
    }
  };

  const fmt = (n: number) => formatCurrency(n);
  const fmtDiff = (n: number) => {
    const prefix = n > 0 ? '+' : '';
    return `${prefix}${formatCurrency(Math.abs(n))}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Employee Reconciliation</CardTitle>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search employee..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-56"
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({session.employeeResults.length})</SelectItem>
                <SelectItem value="true_match">Matches ({session.population.trueMatches})</SelectItem>
                <SelectItem value="coincidental_match">Coincidental ({session.population.coincidentalMatches})</SelectItem>
                <SelectItem value="mismatch">Mismatches ({session.population.mismatches})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-auto max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-slate-950 z-10">Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => handleSort('vlTotal')}>
                    VL Total <ArrowUpDown className="h-3 w-3 ml-1" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => handleSort('gtTotal')}>
                    GT Total <ArrowUpDown className="h-3 w-3 ml-1" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => handleSort('difference')}>
                    Diff <ArrowUpDown className="h-3 w-3 ml-1" />
                  </Button>
                </TableHead>
                {/* Dynamic component columns from plan */}
                {componentColumns.map(cc => (
                  <TableHead key={cc.componentId} className="text-center">
                    <span className="text-xs">{cc.componentName}</span>
                  </TableHead>
                ))}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 100).map(emp => (
                <TableRow key={emp.entityId}>
                  <TableCell className="sticky left-0 bg-slate-950 z-10 font-mono text-sm">
                    {emp.entityId}
                    {emp.storeId && (
                      <span className="text-xs text-slate-400 ml-1">@{emp.storeId}</span>
                    )}
                  </TableCell>
                  <TableCell>{classificationBadge(emp.matchClassification)}</TableCell>
                  <TableCell className="font-mono text-sm">{fmt(emp.vlTotal)}</TableCell>
                  <TableCell className="font-mono text-sm">{fmt(emp.gtTotal)}</TableCell>
                  <TableCell className={`font-mono text-sm ${
                    Math.abs(emp.difference) < 1 ? 'text-green-600' :
                    Math.abs(emp.difference) < 100 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {fmtDiff(emp.difference)}
                  </TableCell>
                  {/* Dynamic component diffs */}
                  {componentColumns.map(cc => {
                    const cd = emp.componentDiffs[cc.componentId];
                    if (!cd) return <TableCell key={cc.componentId} className="text-center text-slate-300">—</TableCell>;
                    return (
                      <TableCell key={cc.componentId} className={`text-center font-mono text-xs ${
                        Math.abs(cd.diff) < 0.01 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {Math.abs(cd.diff) < 0.01 ? '✓' : fmtDiff(cd.diff)}
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    {onEmployeeClick && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEmployeeClick(emp.entityId)}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {filtered.length > 100 && (
          <p className="text-xs text-slate-500 mt-2 text-center">
            Showing 100 of {filtered.length} results
          </p>
        )}
      </CardContent>
    </Card>
  );
}
