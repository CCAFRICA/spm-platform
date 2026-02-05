'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Receipt, Plus, Upload, Search, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useTenant, useTerm, useCurrency } from '@/contexts/tenant-context';
import { pageVariants } from '@/lib/animations';
import { TableSkeleton } from '@/components/ui/skeleton-loaders';

// Mock transaction data for TechCorp (Deals)
const mockTechCorpTransactions = [
  { id: 'TXN-001', date: '2024-12-15', customer: 'Acme Corp', product: 'Enterprise Suite', amount: 125000, commission: 8750, status: 'completed', rep: 'Sarah Chen' },
  { id: 'TXN-002', date: '2024-12-14', customer: 'TechGiant Inc', product: 'Analytics Pro', amount: 45000, commission: 3150, status: 'completed', rep: 'Marcus Johnson' },
  { id: 'TXN-003', date: '2024-12-13', customer: 'Global Solutions', product: 'Cloud Platform', amount: 89000, commission: 6230, status: 'pending', rep: 'Emily Rodriguez' },
  { id: 'TXN-004', date: '2024-12-12', customer: 'Innovative Systems', product: 'Security Bundle', amount: 67500, commission: 4725, status: 'completed', rep: 'David Kim' },
  { id: 'TXN-005', date: '2024-12-11', customer: 'Premier Enterprises', product: 'Enterprise Suite', amount: 150000, commission: 10500, status: 'completed', rep: 'Sarah Chen' },
  { id: 'TXN-006', date: '2024-12-10', customer: 'NextGen Corp', product: 'Starter Bundle', amount: 15000, commission: 1050, status: 'cancelled', rep: 'Marcus Johnson' },
  { id: 'TXN-007', date: '2024-12-09', customer: 'DataDriven LLC', product: 'Analytics Pro', amount: 52000, commission: 3640, status: 'completed', rep: 'Emily Rodriguez' },
  { id: 'TXN-008', date: '2024-12-08', customer: 'CloudFirst Inc', product: 'Cloud Platform', amount: 78000, commission: 5460, status: 'pending', rep: 'David Kim' },
];

// Mock transaction data for RestaurantMX (Checks)
const mockRestaurantMXTransactions = [
  { id: 'CHK-001', date: '2024-12-15', table: 'Mesa 12', items: 8, amount: 2450, tip: 490, status: 'paid', server: 'Carlos García' },
  { id: 'CHK-002', date: '2024-12-15', table: 'Mesa 5', items: 4, amount: 1200, tip: 240, status: 'paid', server: 'María López' },
  { id: 'CHK-003', date: '2024-12-15', table: 'Mesa 8', items: 6, amount: 1850, tip: 370, status: 'pending', server: 'Carlos García' },
  { id: 'CHK-004', date: '2024-12-14', table: 'Mesa 3', items: 3, amount: 890, tip: 178, status: 'paid', server: 'Ana Martínez' },
  { id: 'CHK-005', date: '2024-12-14', table: 'Mesa 15', items: 10, amount: 3200, tip: 640, status: 'paid', server: 'María López' },
  { id: 'CHK-006', date: '2024-12-14', table: 'Mesa 7', items: 5, amount: 1450, tip: 290, status: 'cancelled', server: 'Carlos García' },
  { id: 'CHK-007', date: '2024-12-13', table: 'Mesa 11', items: 7, amount: 2100, tip: 420, status: 'paid', server: 'Ana Martínez' },
  { id: 'CHK-008', date: '2024-12-13', table: 'Mesa 2', items: 2, amount: 650, tip: 130, status: 'paid', server: 'María López' },
];

export default function TransactionsPage() {
  const { currentTenant } = useTenant();
  const transactionTerm = useTerm('transaction', true);
  const transactionSingular = useTerm('transaction');
  const repTerm = useTerm('salesRep');
  const { format } = useCurrency();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  const isHospitality = currentTenant?.industry === 'Hospitality';
  const transactions = isHospitality ? mockRestaurantMXTransactions : mockTechCorpTransactions;

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (searchQuery) {
        const search = searchQuery.toLowerCase();
        const searchFields = isHospitality
          ? [t.id, (t as typeof mockRestaurantMXTransactions[0]).table, (t as typeof mockRestaurantMXTransactions[0]).server]
          : [t.id, (t as typeof mockTechCorpTransactions[0]).customer, (t as typeof mockTechCorpTransactions[0]).product, (t as typeof mockTechCorpTransactions[0]).rep];
        return searchFields.some(field => field?.toLowerCase().includes(search));
      }
      return true;
    });
  }, [transactions, statusFilter, searchQuery, isHospitality]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      paid: 'default',
      pending: 'secondary',
      cancelled: 'destructive',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className="p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            {transactionTerm}
          </h1>
          <p className="text-muted-foreground">
            {filteredTransactions.length} {transactionTerm.toLowerCase()} found
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/data/import">
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Link>
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New {transactionSingular}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${transactionTerm.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value={isHospitality ? 'paid' : 'completed'}>
                  {isHospitality ? 'Paid' : 'Completed'}
                </SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <TableSkeleton rows={8} columns={isHospitality ? 6 : 7} />
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No {transactionTerm.toLowerCase()} found
            </div>
          ) : isHospitality ? (
            // Restaurant/Hospitality table (Checks)
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>{repTerm}</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Tip</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((t) => {
                  const check = t as typeof mockRestaurantMXTransactions[0];
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono font-medium">{check.id}</TableCell>
                      <TableCell>{check.date}</TableCell>
                      <TableCell>{check.table}</TableCell>
                      <TableCell>{check.server}</TableCell>
                      <TableCell className="text-right">{format(check.amount)}</TableCell>
                      <TableCell className="text-right text-green-600">{format(check.tip)}</TableCell>
                      <TableCell>{getStatusBadge(check.status)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            // Tech company table (Deals/Orders)
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>{repTerm}</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((t) => {
                  const deal = t as typeof mockTechCorpTransactions[0];
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono font-medium">{deal.id}</TableCell>
                      <TableCell>{deal.date}</TableCell>
                      <TableCell>{deal.customer}</TableCell>
                      <TableCell>{deal.product}</TableCell>
                      <TableCell>{deal.rep}</TableCell>
                      <TableCell className="text-right">{format(deal.amount)}</TableCell>
                      <TableCell className="text-right text-green-600">{format(deal.commission)}</TableCell>
                      <TableCell>{getStatusBadge(deal.status)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
