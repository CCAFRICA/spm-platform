'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, Calendar, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { pageVariants, containerVariants, itemVariants } from '@/lib/animations';
import { RevenueByPeriod } from '@/components/reports/revenue-by-period';
import { RevenueByRep } from '@/components/reports/revenue-by-rep';
import { RevenueByProduct } from '@/components/reports/revenue-by-product';
import { RevenueByRegion } from '@/components/reports/revenue-by-region';
import { CommissionExpense } from '@/components/reports/commission-expense';
import { CardGridSkeleton } from '@/components/ui/skeleton-loaders';
import {
  getRevenueByPeriod,
  getRevenueBySalesRep,
  getRevenueByProduct,
  getRevenueByRegion,
  getCommissionExpense,
  getCommissionSummary,
  formatCurrency,
} from '@/lib/financial-service';

export default function ReportsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState('2024');

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const monthlyData = getRevenueByPeriod('monthly');
  const quarterlyData = getRevenueByPeriod('quarterly');
  const salesRepData = getRevenueBySalesRep();
  const productData = getRevenueByProduct();
  const regionData = getRevenueByRegion();
  const commissionData = getCommissionExpense();
  const commissionSummary = getCommissionSummary();

  const handleExport = (reportType: string) => {
    toast.success('Export Started', {
      description: `Exporting ${reportType} report to Excel...`,
    });
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      toast.success('Reports Refreshed');
    }, 1000);
  };

  // Calculate totals
  const totalRevenue = monthlyData.reduce((sum, m) => sum + m.revenue, 0);
  const totalDeals = monthlyData.reduce((sum, m) => sum + m.deals, 0);

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
              Financial Reports
            </h1>
            <p className="text-slate-500 mt-1">
              Analyze revenue, outcomes, and performance
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[120px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
                <SelectItem value="2022">2022</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => handleExport('all')}>
              <Download className="h-4 w-4 mr-2" />
              Export All
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {isLoading ? (
          <CardGridSkeleton count={4} />
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid gap-4 md:grid-cols-4 mb-6"
          >
            <motion.div variants={itemVariants}>
              <Card className="border-0 shadow-md bg-gradient-to-br from-sky-500 to-sky-600 text-white">
                <CardContent className="p-5">
                  <p className="text-sky-100 text-sm">Total Revenue</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(totalRevenue)}</p>
                  <p className="text-sky-200 text-xs mt-1">+18.4% YoY</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={itemVariants}>
              <Card className="border-0 shadow-md bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                <CardContent className="p-5">
                  <p className="text-purple-100 text-sm">Total Outcome</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(commissionSummary.totalCommission)}</p>
                  <p className="text-purple-200 text-xs mt-1">{commissionSummary.averageRate.toFixed(1)}% avg rate</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={itemVariants}>
              <Card className="border-0 shadow-md bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
                <CardContent className="p-5">
                  <p className="text-emerald-100 text-sm">Total Deals</p>
                  <p className="text-2xl font-bold mt-1">{totalDeals}</p>
                  <p className="text-emerald-200 text-xs mt-1">+12.5% YoY</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={itemVariants}>
              <Card className="border-0 shadow-md bg-gradient-to-br from-amber-500 to-amber-600 text-white">
                <CardContent className="p-5">
                  <p className="text-amber-100 text-sm">Avg Deal Size</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(totalRevenue / totalDeals)}</p>
                  <p className="text-amber-200 text-xs mt-1">+5.2% YoY</p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}

        {/* Reports Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sales-rep">By Entity</TabsTrigger>
            <TabsTrigger value="product">By Product</TabsTrigger>
            <TabsTrigger value="region">By Region</TabsTrigger>
            <TabsTrigger value="commission">Outcome</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {isLoading ? (
              <Card className="border-0 shadow-lg h-[400px] animate-pulse bg-slate-100" />
            ) : (
              <>
                <RevenueByPeriod monthlyData={monthlyData} quarterlyData={quarterlyData} />
                <div className="grid gap-6 lg:grid-cols-2">
                  <RevenueByProduct data={productData} />
                  <RevenueByRegion data={regionData} />
                </div>
              </>
            )}
          </TabsContent>

          {/* By Sales Rep Tab */}
          <TabsContent value="sales-rep">
            {isLoading ? (
              <Card className="border-0 shadow-lg h-[400px] animate-pulse bg-slate-100" />
            ) : (
              <RevenueByRep data={salesRepData} />
            )}
          </TabsContent>

          {/* By Product Tab */}
          <TabsContent value="product">
            {isLoading ? (
              <Card className="border-0 shadow-lg h-[400px] animate-pulse bg-slate-100" />
            ) : (
              <RevenueByProduct data={productData} />
            )}
          </TabsContent>

          {/* By Region Tab */}
          <TabsContent value="region">
            {isLoading ? (
              <Card className="border-0 shadow-lg h-[400px] animate-pulse bg-slate-100" />
            ) : (
              <RevenueByRegion data={regionData} />
            )}
          </TabsContent>

          {/* Commission Tab */}
          <TabsContent value="commission">
            {isLoading ? (
              <Card className="border-0 shadow-lg h-[400px] animate-pulse bg-slate-100" />
            ) : (
              <CommissionExpense data={commissionData} summary={commissionSummary} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}
