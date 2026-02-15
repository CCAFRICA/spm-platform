'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, PieChart, Target, ArrowUpRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useTenant, useCurrency, useTerm, useFeature } from '@/contexts/tenant-context';
import { pageVariants, containerVariants, itemVariants } from '@/lib/animations';

export default function SalesFinancePage() {
  const [activeTab, setActiveTab] = useState('overview');
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const locationTerm = useTerm('location', true);
  const repTerm = useTerm('salesRep', true);
  const salesFinanceEnabled = useFeature('salesFinance');
  const router = useRouter();

  // Redirect if feature not enabled
  useEffect(() => {
    if (currentTenant && !salesFinanceEnabled) {
      router.push('/insights');
    }
  }, [salesFinanceEnabled, router, currentTenant]);

  if (!salesFinanceEnabled) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center text-muted-foreground">
          <p>Finance module is not enabled for this tenant.</p>
        </div>
      </div>
    );
  }

  // Mock data for RestaurantMX
  const metrics = {
    totalRevenue: 1250000,
    revenueChange: 12.5,
    totalCost: 875000,
    costPercent: 70,
    grossMargin: 375000,
    marginPercent: 30,
    compensation: 125000,
    compensationPercent: 10,
  };

  const periodData = [
    { period: 'Week 1', revenue: 280000, cost: 196000, margin: 84000 },
    { period: 'Week 2', revenue: 310000, cost: 217000, margin: 93000 },
    { period: 'Week 3', revenue: 295000, cost: 206500, margin: 88500 },
    { period: 'Week 4', revenue: 365000, cost: 255500, margin: 109500 },
  ];

  const locationData = [
    { name: 'Centro', revenue: 450000, margin: 135000, marginPct: 30 },
    { name: 'Polanco', revenue: 380000, margin: 114000, marginPct: 30 },
    { name: 'Condesa', revenue: 280000, margin: 84000, marginPct: 30 },
    { name: 'Roma', revenue: 140000, margin: 42000, marginPct: 30 },
  ];

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className="p-6 space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Finance
        </h1>
        <p className="text-muted-foreground">
          Revenue, cost, and margin analysis from transactional data
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="cost">Cost</TabsTrigger>
          <TabsTrigger value="margin">Margin</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Total Revenue
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{format(metrics.totalRevenue)}</div>
                    <p className="text-xs flex items-center gap-1 text-green-600">
                      <ArrowUpRight className="h-3 w-3" />
                      +{metrics.revenueChange}% from last period
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <TrendingDown className="h-4 w-4" />
                      Total Cost
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{format(metrics.totalCost)}</div>
                    <p className="text-xs text-muted-foreground">{metrics.costPercent}% of revenue</p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Gross Margin
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{format(metrics.grossMargin)}</div>
                    <p className="text-xs text-green-600">{metrics.marginPercent}% margin</p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Outcome
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{format(metrics.compensation)}</div>
                    <p className="text-xs text-muted-foreground">{metrics.compensationPercent}% of revenue</p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 md:grid-cols-2">
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue by Period</CardTitle>
                    <CardDescription>Weekly revenue breakdown</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {periodData.map((item) => (
                        <div key={item.period} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>{item.period}</span>
                            <span className="font-medium">{format(item.revenue)}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${(item.revenue / 400000) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue by {locationTerm}</CardTitle>
                    <CardDescription>Performance across {locationTerm.toLowerCase()}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {locationData.map((item) => (
                        <div key={item.name} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>{item.name}</span>
                            <span className="font-medium">{format(item.revenue)}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${(item.revenue / 500000) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Margin Analysis */}
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle>Margin Analysis</CardTitle>
                  <CardDescription>Revenue vs Cost breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 rounded-lg bg-primary/10">
                      <p className="text-sm text-muted-foreground">Revenue</p>
                      <p className="text-xl font-bold">{format(metrics.totalRevenue)}</p>
                      <p className="text-xs text-muted-foreground">100%</p>
                    </div>
                    <div className="p-4 rounded-lg bg-red-500/10">
                      <p className="text-sm text-muted-foreground">Cost</p>
                      <p className="text-xl font-bold">{format(metrics.totalCost)}</p>
                      <p className="text-xs text-muted-foreground">{metrics.costPercent}%</p>
                    </div>
                    <div className="p-4 rounded-lg bg-green-500/10">
                      <p className="text-sm text-muted-foreground">Margin</p>
                      <p className="text-xl font-bold">{format(metrics.grossMargin)}</p>
                      <p className="text-xs text-muted-foreground">{metrics.marginPercent}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Analysis</CardTitle>
              <CardDescription>Detailed revenue breakdown by period, {locationTerm.toLowerCase()}, and {repTerm.toLowerCase()}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Revenue charts - implement with Recharts</p>
                  <p className="text-sm">Coming in future release</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cost Tab */}
        <TabsContent value="cost" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Cost Analysis</CardTitle>
              <CardDescription>Outcome expense and operational costs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                <div className="text-center">
                  <PieChart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Cost breakdown charts - implement with Recharts</p>
                  <p className="text-sm">Coming in future release</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Margin Tab */}
        <TabsContent value="margin" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Margin Analysis</CardTitle>
              <CardDescription>Gross margin by segment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Margin trend charts - implement with Recharts</p>
                  <p className="text-sm">Coming in future release</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Budget Tab */}
        <TabsContent value="budget" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Budget vs Actual</CardTitle>
              <CardDescription>Variance reporting</CardDescription>
            </CardHeader>
            <CardContent className="py-12 text-center">
              <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Budget Module</h3>
              <p className="text-muted-foreground">
                Budget planning and variance analysis coming in future release.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
