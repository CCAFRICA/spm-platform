'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { pageVariants } from '@/lib/animations';
import { SummaryCards } from '@/components/financial/summary-cards';
import { TransactionTable, TransactionRow } from '@/components/financial/transaction-table';
import { TransactionFilters } from '@/components/financial/transaction-filters';
import { TableSkeleton, CardGridSkeleton } from '@/components/ui/skeleton-loaders';
import {
  calculateTotalRevenue,
  calculateTotalDeals,
  calculateAverageCommissionRate,
} from '@/lib/financial-service';
import { DateRange } from 'react-day-picker';

// Mock transaction data
const mockTransactions: TransactionRow[] = Array.from({ length: 50 }, (_, i) => ({
  id: `txn-${String(i + 1).padStart(3, '0')}`,
  orderId: `ORD-2024-${String(i + 1).padStart(5, '0')}`,
  date: new Date(2024, Math.floor(i / 5), (i % 28) + 1).toISOString(),
  customerName: ['Acme Corp', 'TechGiant Inc', 'Global Solutions', 'Innovative Systems', 'Premier Enterprises'][i % 5],
  productName: ['Enterprise Suite', 'Analytics Module', 'Cloud Infrastructure', 'Professional Bundle', 'Starter Bundle'][i % 5],
  salesRepName: ['Sarah Chen', 'Marcus Johnson', 'Emily Rodriguez', 'David Kim'][i % 4],
  amount: [50000, 15000, 25000, 25000, 8000][i % 5] + Math.floor(Math.random() * 10000),
  commission: [4000, 1500, 1750, 2250, 800][i % 5] + Math.floor(Math.random() * 500),
  status: (['completed', 'completed', 'completed', 'pending', 'cancelled'] as const)[i % 5],
  region: ['West', 'East', 'North', 'South'][i % 4],
}));

export default function TransactionsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const filteredTransactions = useMemo(() => {
    return mockTransactions.filter((t) => {
      const matchesSearch =
        t.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.salesRepName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchesRegion = regionFilter === 'all' || t.region === regionFilter;

      let matchesDate = true;
      if (dateRange?.from) {
        const txnDate = new Date(t.date);
        matchesDate = txnDate >= dateRange.from;
        if (dateRange.to) {
          matchesDate = matchesDate && txnDate <= dateRange.to;
        }
      }

      return matchesSearch && matchesStatus && matchesRegion && matchesDate;
    });
  }, [searchTerm, statusFilter, regionFilter, dateRange]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setRegionFilter('all');
    setDateRange(undefined);
  };

  const handleExport = (ids: string[]) => {
    toast.success('Export Started', {
      description: `Exporting ${ids.length} transactions to CSV`,
    });
  };

  const handleView = (id: string) => {
    toast.info(`Viewing transaction ${id}`);
  };

  const handleEdit = (id: string) => {
    toast.info(`Editing transaction ${id}`);
  };

  const handleDelete = (id: string) => {
    toast.error(`Delete transaction ${id}?`, {
      action: {
        label: 'Confirm',
        onClick: () => toast.success('Transaction deleted'),
      },
    });
  };

  const totalRevenue = calculateTotalRevenue();
  const totalDeals = calculateTotalDeals();
  const avgDealSize = totalRevenue / totalDeals;
  const avgCommissionRate = calculateAverageCommissionRate();

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900"
    >
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Transaction Repository
            </h1>
            <p className="text-slate-500 mt-1">
              Manage and track all sales transactions
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/data/imports')}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            <Button onClick={() => router.push('/data/transactions/new')}>
              <Plus className="h-4 w-4 mr-2" />
              New Transaction
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {isLoading ? (
          <CardGridSkeleton count={4} />
        ) : (
          <SummaryCards
            totalRevenue={totalRevenue}
            totalDeals={totalDeals}
            avgDealSize={avgDealSize}
            avgCommissionRate={avgCommissionRate}
          />
        )}

        {/* Transactions Table */}
        <Card className="mt-6 border-0 shadow-lg">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>All Transactions</CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  {filteredTransactions.length} of {mockTransactions.length} transactions
                </p>
              </div>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="mb-6">
              <TransactionFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                regionFilter={regionFilter}
                onRegionChange={setRegionFilter}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                onClearFilters={handleClearFilters}
              />
            </div>

            {/* Table */}
            {isLoading ? (
              <TableSkeleton rows={10} cols={9} />
            ) : (
              <TransactionTable
                transactions={filteredTransactions}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onExport={handleExport}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
