'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Eye, Edit, Trash2, MoreHorizontal, Download } from 'lucide-react';
import { formatCurrency } from '@/lib/financial-service';
import { cn } from '@/lib/utils';
import { useIsVialuce } from '@/hooks/use-is-vialuce';

export interface TransactionRow {
  id: string;
  orderId: string;
  date: string;
  customerName: string;
  productName: string;
  salesRepName: string;
  amount: number;
  commission: number;
  status: 'completed' | 'pending' | 'cancelled';
  region: string;
}

interface TransactionTableProps {
  transactions: TransactionRow[];
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onExport?: (ids: string[]) => void;
  selectable?: boolean;
}

export function TransactionTable({
  transactions,
  onView,
  onEdit,
  onDelete,
  onExport,
  selectable = true,
}: TransactionTableProps) {
  const isVialuce = useIsVialuce(); // HF-315: dark table → design-spec .card flush + .tbl + .pill status
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === transactions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(transactions.map((t) => t.id));
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive'; className: string }> = {
      completed: { variant: 'default', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
      pending: { variant: 'secondary', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
      cancelled: { variant: 'destructive', className: '' },
    };
    const config = variants[status] || variants.pending;
    return (
      <Badge variant={config.variant} className={config.className}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // HF-315: Vialuce status → design-spec .pill variants (success/danger/neutral).
  const getStatusPill = (status: string) => {
    const variant = status === 'completed' ? 'success' : status === 'cancelled' ? 'danger' : 'neutral';
    return (
      <span className={`pill ${variant}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isVialuce) {
    return (
      <div>
        {selectable && selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between p-3 mb-3 rounded-lg"
            style={{ background: 'var(--vl-indigo-50)', border: '1px solid var(--vl-line)' }}
          >
            <span style={{ fontSize: '13px', color: 'var(--vialuce-indigo)' }}>
              {selectedIds.length} transaction(s) selected
            </span>
            <div className="flex gap-2">
              {onExport && (
                <Button size="sm" variant="outline" onClick={() => onExport(selectedIds)}>
                  <Download className="h-4 w-4 mr-1" />
                  Export Selected
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                Clear Selection
              </Button>
            </div>
          </motion.div>
        )}

        <div className="card flush" style={{ marginTop: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                {selectable && (
                  <th style={{ width: '48px' }}>
                    <Checkbox
                      checked={selectedIds.length === transactions.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                )}
                <th>Order ID</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Sales Rep</th>
                <th className="r">Amount</th>
                <th className="r">Commission</th>
                <th>Status</th>
                <th style={{ width: '48px' }}></th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {transactions.map((transaction, index) => (
                  <motion.tr
                    key={transaction.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.02 }}
                  >
                    {selectable && (
                      <td>
                        <Checkbox
                          checked={selectedIds.includes(transaction.id)}
                          onCheckedChange={() => toggleSelect(transaction.id)}
                        />
                      </td>
                    )}
                    <td className="num">{transaction.orderId}</td>
                    <td className="mut">{formatDate(transaction.date)}</td>
                    <td className="name">{transaction.customerName}</td>
                    <td>{transaction.productName}</td>
                    <td>{transaction.salesRepName}</td>
                    <td className="num">{formatCurrency(transaction.amount)}</td>
                    <td className="num"><span className="num up">{formatCurrency(transaction.commission)}</span></td>
                    <td>{getStatusPill(transaction.status)}</td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {onView && (
                            <DropdownMenuItem onClick={() => onView(transaction.id)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                          )}
                          {onEdit && (
                            <DropdownMenuItem onClick={() => onEdit(transaction.id)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {onDelete && (
                            <DropdownMenuItem
                              onClick={() => onDelete(transaction.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      {selectable && selectedIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-3 mb-3 bg-sky-50 dark:bg-sky-950/30 rounded-lg border border-sky-200 dark:border-sky-800"
        >
          <span className="text-sm text-sky-700 dark:text-sky-300">
            {selectedIds.length} transaction(s) selected
          </span>
          <div className="flex gap-2">
            {onExport && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onExport(selectedIds)}
              >
                <Download className="h-4 w-4 mr-1" />
                Export Selected
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds([])}
            >
              Clear Selection
            </Button>
          </div>
        </motion.div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-900">
              {selectable && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedIds.length === transactions.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
              )}
              <TableHead>Order ID</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Sales Rep</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {transactions.map((transaction, index) => (
                <motion.tr
                  key={transaction.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.02 }}
                  className={cn(
                    'border-b transition-colors hover:bg-slate-900',
                    selectedIds.includes(transaction.id) &&
                      'bg-sky-950/20'
                  )}
                >
                  {selectable && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(transaction.id)}
                        onCheckedChange={() => toggleSelect(transaction.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-sm">
                    {transaction.orderId}
                  </TableCell>
                  <TableCell className="text-slate-500">
                    {formatDate(transaction.date)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {transaction.customerName}
                  </TableCell>
                  <TableCell>{transaction.productName}</TableCell>
                  <TableCell>{transaction.salesRepName}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(transaction.amount)}
                  </TableCell>
                  <TableCell className="text-right text-emerald-600">
                    {formatCurrency(transaction.commission)}
                  </TableCell>
                  <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onView && (
                          <DropdownMenuItem onClick={() => onView(transaction.id)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                        )}
                        {onEdit && (
                          <DropdownMenuItem onClick={() => onEdit(transaction.id)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {onDelete && (
                          <DropdownMenuItem
                            onClick={() => onDelete(transaction.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </motion.tr>
              ))}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
