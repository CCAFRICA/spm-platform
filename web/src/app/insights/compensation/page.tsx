"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CompensationPieChart } from "@/components/charts/CompensationPieChart";
import { CompensationTrendChart } from "@/components/charts/CompensationTrendChart";
import {
  DollarSign,
  TrendingUp,
  Users,
  PieChart,
  Download,
  Calendar,
  ArrowUpRight,
} from "lucide-react";

// Mock data for the compensation page
const statsData = {
  currentPeriod: 525000,
  yearToDate: 1850000,
  avgPerRep: 46250,
  budgetUtilization: 87.5,
  periodChange: 12.3,
  ytdChange: 8.7,
};

const pieChartData = [
  { name: "Accelerator Plan", value: 245000, color: "#6366f1" },
  { name: "Tiered Plan", value: 185000, color: "#8b5cf6" },
  { name: "Basic Plan", value: 52000, color: "#a855f7" },
  { name: "Team-Based Plan", value: 35000, color: "#d946ef" },
  { name: "Executive Plan", value: 8000, color: "#ec4899" },
];

const trendData = [
  { month: "Jan", actual: 380000, budget: 400000 },
  { month: "Feb", actual: 420000, budget: 400000 },
  { month: "Mar", actual: 395000, budget: 420000 },
  { month: "Apr", actual: 450000, budget: 420000 },
  { month: "May", actual: 480000, budget: 450000 },
  { month: "Jun", actual: 465000, budget: 450000 },
  { month: "Jul", actual: 490000, budget: 480000 },
  { month: "Aug", actual: 510000, budget: 480000 },
  { month: "Sep", actual: 495000, budget: 500000 },
  { month: "Oct", actual: 520000, budget: 500000 },
  { month: "Nov", actual: 545000, budget: 520000 },
  { month: "Dec", actual: 525000, budget: 520000 },
];

const paymentHistory = [
  { id: 1, date: "2024-12-15", employee: "Sarah Chen", amount: 7500, planType: "Accelerator", status: "completed" },
  { id: 2, date: "2024-12-14", employee: "Marcus Johnson", amount: 6200, planType: "Accelerator", status: "completed" },
  { id: 3, date: "2024-12-14", employee: "Emily Rodriguez", amount: 2100, planType: "Tiered", status: "completed" },
  { id: 4, date: "2024-12-13", employee: "David Kim", amount: 8900, planType: "Accelerator", status: "processing" },
  { id: 5, date: "2024-12-12", employee: "Lisa Thompson", amount: 4500, planType: "Tiered", status: "completed" },
  { id: 6, date: "2024-12-12", employee: "James Wilson", amount: 1800, planType: "Basic", status: "completed" },
  { id: 7, date: "2024-12-11", employee: "Amanda Foster", amount: 5600, planType: "Accelerator", status: "completed" },
  { id: 8, date: "2024-12-10", employee: "Michael Brown", amount: 3200, planType: "Tiered", status: "pending" },
  { id: 9, date: "2024-12-10", employee: "Rachel Martinez", amount: 1500, planType: "Basic", status: "completed" },
  { id: 10, date: "2024-12-09", employee: "Christopher Lee", amount: 4100, planType: "Tiered", status: "completed" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CompensationPage() {
  const [dateRange, setDateRange] = useState("q4-2024");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Compensation Overview
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Track compensation payouts, trends, and budget utilization
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="q4-2024">Q4 2024</SelectItem>
                <SelectItem value="q3-2024">Q3 2024</SelectItem>
                <SelectItem value="q2-2024">Q2 2024</SelectItem>
                <SelectItem value="q1-2024">Q1 2024</SelectItem>
                <SelectItem value="2024">Full Year 2024</SelectItem>
              </SelectContent>
            </Select>
            <Button className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Current Period</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    {formatCurrency(statsData.currentPeriod)}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm text-emerald-600 font-medium">
                      +{statsData.periodChange}%
                    </span>
                    <span className="text-sm text-slate-500">vs last period</span>
                  </div>
                </div>
                <div className="p-3 bg-indigo-100 rounded-full dark:bg-indigo-900/30">
                  <DollarSign className="h-5 w-5 text-indigo-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Year-to-Date</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    {formatCurrency(statsData.yearToDate)}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm text-emerald-600 font-medium">
                      +{statsData.ytdChange}%
                    </span>
                    <span className="text-sm text-slate-500">vs last year</span>
                  </div>
                </div>
                <div className="p-3 bg-emerald-100 rounded-full dark:bg-emerald-900/30">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Average per Rep</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    {formatCurrency(statsData.avgPerRep)}
                  </p>
                  <p className="text-sm text-slate-500 mt-2">40 active reps</p>
                </div>
                <div className="p-3 bg-purple-100 rounded-full dark:bg-purple-900/30">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Budget Utilization</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    {statsData.budgetUtilization}%
                  </p>
                  <div className="mt-2 h-2 w-24 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{ width: `${statsData.budgetUtilization}%` }}
                    />
                  </div>
                </div>
                <div className="p-3 bg-amber-100 rounded-full dark:bg-amber-900/30">
                  <PieChart className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          {/* Commission Breakdown Pie Chart */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Commission by Plan Type</CardTitle>
              <CardDescription>
                Distribution of commissions across compensation plans
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CompensationPieChart data={pieChartData} />
            </CardContent>
          </Card>

          {/* Monthly Trend Line Chart */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Monthly Compensation Trend</CardTitle>
              <CardDescription>
                Actual payouts vs budget over the last 12 months
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CompensationTrendChart data={trendData} />
            </CardContent>
          </Card>
        </div>

        {/* Payment History Table */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Payment History</CardTitle>
                <CardDescription>
                  Recent compensation payments and their status
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Employee</TableHead>
                    <TableHead className="font-semibold">Plan Type</TableHead>
                    <TableHead className="text-right font-semibold">Amount</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentHistory.map((payment) => (
                    <TableRow
                      key={payment.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {formatDate(payment.date)}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-slate-50">
                        {payment.employee}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            payment.planType === "Accelerator"
                              ? "bg-indigo-100 text-indigo-700"
                              : payment.planType === "Tiered"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-slate-100 text-slate-700"
                          }
                        >
                          {payment.planType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-900 dark:text-slate-50">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            payment.status === "completed"
                              ? "bg-emerald-100 text-emerald-700"
                              : payment.status === "processing"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                          }
                        >
                          {payment.status.charAt(0).toUpperCase() +
                            payment.status.slice(1)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
              <p>Showing 10 of 156 payments</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled>
                  Previous
                </Button>
                <Button variant="outline" size="sm">
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
