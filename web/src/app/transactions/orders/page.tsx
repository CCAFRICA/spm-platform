'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { audit } from '@/lib/audit-service';
import { pageVariants, containerVariants, itemVariants } from '@/lib/animations';
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
import { Search, Filter, Download, Eye, Package, DollarSign, Calendar } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { TransactionDetailModal } from '@/components/transactions/transaction-detail-modal';
import { TableSkeleton, CardGridSkeleton, TransactionCardSkeleton } from '@/components/ui/skeleton-loaders';
import { LoadingButton } from '@/components/ui/loading-button';
import { EmptyState } from '@/components/ui/empty-state';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Simulate initial data load
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

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

  const handleExport = async () => {
    setIsExporting(true);
    await new Promise(r => setTimeout(r, 1500));

    // Create CSV content
    const headers = ['Order ID', 'Date', 'Customer', 'Product', 'Sales Rep', 'Amount', 'Commission', 'Status'];
    const rows = filteredTransactions.map(t => [
      t.orderId, formatDate(t.date), t.customerName, t.productName,
      t.salesRepName, t.amount, t.commissionAmount, t.status
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orders-export.csv';
    a.click();
    URL.revokeObjectURL(url);

    setIsExporting(false);
    toast.success('Export Complete', {
      description: `Exported ${filteredTransactions.length} orders to CSV`
    });

    audit.log({
      action: 'view',
      entityType: 'transaction',
      metadata: { action: 'export', count: filteredTransactions.length }
    });
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900"
    >
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                Orders
              </h1>
              <p className="text-muted-foreground text-sm md:text-base">
                View and manage all transaction orders
              </p>
            </div>
            <LoadingButton
              loading={isExporting}
              loadingText="Exporting..."
              onClick={handleExport}
            >
              <Download className="mr-2 h-4 w-4" />Export
            </LoadingButton>
          </div>

          {/* Status Filter Cards */}
          {isLoading ? (
            <CardGridSkeleton count={4} />
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-4"
            >
              {Object.entries(statusCounts).map(([status, count]) => (
                <motion.div key={status} variants={itemVariants}>
                  <Card
                    className={`cursor-pointer transition-all duration-200 hover:shadow-md border-0 shadow-md ${
                      statusFilter === status ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setStatusFilter(status)}
                  >
                    <CardHeader className="pb-2 px-4 pt-4">
                      <CardTitle className="text-xs md:text-sm font-medium capitalize">
                        {status === 'all' ? 'All Orders' : status}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="text-xl md:text-2xl font-bold">{count}</div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Search and Filters */}
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-4 md:pt-6">
              <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search orders..."
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
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

          {/* Orders - Desktop Table View */}
          <Card className="border-0 shadow-lg hidden md:block">
            <CardContent className="pt-6">
              {isLoading ? (
                <TableSkeleton rows={8} cols={8} />
              ) : filteredTransactions.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No orders found"
                  description="Try adjusting your search or filter criteria"
                />
              ) : (
                <>
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
                      {filteredTransactions.slice(0, 20).map((txn, index) => (
                        <motion.tr
                          key={txn.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setSelectedTransaction(txn)}
                        >
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
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTransaction(txn);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="mt-4 text-sm text-muted-foreground">
                    Showing {Math.min(filteredTransactions.length, 20)} of {filteredTransactions.length} orders
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Orders - Mobile Card View */}
          <div className="md:hidden space-y-3">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TransactionCardSkeleton key={i} />
              ))
            ) : filteredTransactions.length === 0 ? (
              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <EmptyState
                    icon={Package}
                    title="No orders found"
                    description="Try adjusting your search or filter criteria"
                  />
                </CardContent>
              </Card>
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-3"
              >
                {filteredTransactions.slice(0, 20).map((txn) => (
                  <motion.div key={txn.id} variants={itemVariants}>
                    <Card
                      className="border-0 shadow-md cursor-pointer transition-all hover:shadow-lg active:scale-[0.99]"
                      onClick={() => setSelectedTransaction(txn)}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-mono text-sm font-medium">{txn.orderId}</p>
                            <p className="text-sm text-muted-foreground">{txn.customerName}</p>
                          </div>
                          {getStatusBadge(txn.status)}
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(txn.date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {txn.productName}
                          </span>
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t">
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">{formatCurrency(txn.amount)}</span>
                          </div>
                          <div className="text-green-600 font-medium">
                            +{formatCurrency(txn.commissionAmount)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}

                <p className="text-sm text-muted-foreground text-center py-2">
                  Showing {Math.min(filteredTransactions.length, 20)} of {filteredTransactions.length} orders
                </p>
              </motion.div>
            )}
          </div>

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
    </motion.div>
  );
}
