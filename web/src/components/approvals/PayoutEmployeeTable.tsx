'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { PayoutEmployee } from '@/lib/payout-service';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface PayoutEmployeeTableProps {
  employees: PayoutEmployee[];
}

export function PayoutEmployeeTable({ employees }: PayoutEmployeeTableProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const totalIncentives = employees.reduce((sum, e) => sum + e.incentives, 0);
  const totalAdjustments = employees.reduce((sum, e) => sum + e.adjustments, 0);
  const grandTotal = employees.reduce((sum, e) => sum + e.total, 0);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Transactions</TableHead>
            <TableHead className="text-right">Incentives</TableHead>
            <TableHead className="text-right">Adjustments</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((employee) => (
            <TableRow key={employee.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {employee.name}
                      {employee.disputes > 0 && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {employee.disputes} dispute{employee.disputes > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{employee.role}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{employee.location}</TableCell>
              <TableCell className="text-right">{employee.transactions}</TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(employee.incentives)}
              </TableCell>
              <TableCell className={cn(
                'text-right',
                employee.adjustments > 0 && 'text-green-600',
                employee.adjustments < 0 && 'text-red-600'
              )}>
                {employee.adjustments !== 0 && (
                  <>
                    {employee.adjustments > 0 ? '+' : ''}
                    {formatCurrency(employee.adjustments)}
                  </>
                )}
                {employee.adjustments === 0 && '-'}
              </TableCell>
              <TableCell className="text-right font-bold">
                {formatCurrency(employee.total)}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                >
                  <Link href={`/transactions?employee=${employee.id}`}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}

          {/* Totals Row */}
          <TableRow className="bg-muted/50 font-medium">
            <TableCell colSpan={3} className="text-right">
              Totals ({employees.length} employees)
            </TableCell>
            <TableCell className="text-right">{formatCurrency(totalIncentives)}</TableCell>
            <TableCell className={cn(
              'text-right',
              totalAdjustments > 0 && 'text-green-600',
              totalAdjustments < 0 && 'text-red-600'
            )}>
              {totalAdjustments !== 0 ? (
                <>
                  {totalAdjustments > 0 ? '+' : ''}
                  {formatCurrency(totalAdjustments)}
                </>
              ) : '-'}
            </TableCell>
            <TableCell className="text-right text-lg">{formatCurrency(grandTotal)}</TableCell>
            <TableCell></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
