'use client';

import { useState, useEffect } from 'react';
import { audit } from '@/lib/audit-service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, Filter, Download, Eye } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { TransactionDetailModal } from '@/components/transactions/transaction-detail-modal';

// Mock data - 50 transactions
const mockTransactions = Array.from({ length: 50 }, (_, i) => ({
  id: `txn-${i + 1}`,
  orderId: `ORD-2024-${String(i + 1).padStart(5, '0')}`,
  date: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString(),
  customerName: ['Acme Corp', 'TechGiant', 'Global Solutions', 'Innovative Systems', 'Premier Enterprises'][i % 5],
  productName: ['Enterprise Suite', 'Analytics Module', 'Cloud Infrastructure', 'Support Package'][i % 4],
  salesRepName: ['Sarah Chen', 'Marcus Johnson', 'Emily Rodriguez', 'David Kim'][i % 4],
  amount: Math.floor(Math.random() * 100000) + 5000,
  commissionAmount: Math.floor(Math.random() * 8000) + 500,
  status: (['completed', 'completed', 'completed', 'pending', 'cancelled'] as const)[i % 5],
  region: ['West', 'East', 'North', 'South'][i % 4],
}));

export default function OrdersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTransaction, setSelectedTransaction] = useState<typeof mockTransactions[0] | null>(null);

  // Audit log page view
  useEffect(() => {
    audit.log({
      action: 'view',
      entityType: 'transaction',
      metadata: { page: 'orders' }
    });
  }, []);

  const filteredTransactions = mockTransactions.filter((t) => {
    const matchesSearch =
      t.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: mockTransactions.length,
    completed: mockTransactions.filter((t) => t.status === 'completed').length,
    pending: mockTransactions.filter((t) => t.status === 'pending').length,
    cancelled: mockTransactions.filter((t) => t.status === 'cancelled').length,
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      completed: 'default',
      pending: 'secondary',
      cancelled: 'destructive',
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Orders</h1>
              <p className="text-muted-foreground">View and manage all transaction orders</p>
            </div>
            <Button><Download className="mr-2 h-4 w-4" />Export</Button>
          </div>

          {/* Status Filter Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            {Object.entries(statusCounts).map(([status, count]) => (
              <Card
                key={status}
                className={`cursor-pointer transition-all hover:shadow-md border-0 shadow-md ${
                  statusFilter === status ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setStatusFilter(status)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium capitalize">
                    {status === 'all' ? 'All Orders' : status}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{count}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Search and Filters */}
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by order ID, customer, or product..."
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Orders Table */}
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Sales Rep</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.slice(0, 20).map((txn) => (
                    <TableRow key={txn.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono text-sm">{txn.orderId}</TableCell>
                      <TableCell>{formatDate(txn.date)}</TableCell>
                      <TableCell>{txn.customerName}</TableCell>
                      <TableCell>{txn.productName}</TableCell>
                      <TableCell>{txn.salesRepName}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(txn.amount)}
                      </TableCell>
                      <TableCell>
                        <span className="text-green-600 font-medium">
                          {formatCurrency(txn.commissionAmount)}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(txn.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedTransaction(txn)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 text-sm text-muted-foreground">
                Showing {Math.min(filteredTransactions.length, 20)} of {filteredTransactions.length} orders
              </div>
            </CardContent>
          </Card>

          {/* Transaction Detail Modal */}
          {selectedTransaction && (
            <TransactionDetailModal
              transaction={selectedTransaction}
              open={!!selectedTransaction}
              onClose={() => setSelectedTransaction(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
