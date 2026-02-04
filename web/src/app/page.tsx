"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DollarSign,
  TrendingUp,
  Trophy,
  Target,
  ArrowUpRight,
  ArrowRight,
  BarChart3,
  Receipt,
  Settings,
  Clock,
  CheckCircle2,
} from "lucide-react";

// Mock dashboard data
const dashboardData = {
  user: {
    name: "Sarah Chen",
    role: "Senior Account Executive",
    team: "West-Enterprise",
  },
  stats: {
    ytdCompensation: 127450,
    mtdCompensation: 14700,
    quotaAttainment: 122.5,
    ranking: 1,
    rankingTotal: 40,
    pendingCommissions: 12000,
  },
  recentActivity: [
    {
      id: 1,
      type: "commission",
      description: "Commission earned - Acme Corp deal",
      amount: 7500,
      date: "2024-12-15",
      status: "completed",
    },
    {
      id: 2,
      type: "bonus",
      description: "Q4 Accelerator Bonus",
      amount: 5000,
      date: "2024-12-14",
      status: "completed",
    },
    {
      id: 3,
      type: "commission",
      description: "Commission - TechGiant Industries",
      amount: 2700,
      date: "2024-12-14",
      status: "processing",
    },
    {
      id: 4,
      type: "spif",
      description: "Product Launch SPIF",
      amount: 1500,
      date: "2024-12-12",
      status: "completed",
    },
  ],
  quickLinks: [
    {
      title: "View Insights",
      description: "Compensation & performance analytics",
      href: "/insights",
      icon: BarChart3,
      color: "bg-indigo-500",
    },
    {
      title: "Transactions",
      description: "View all your transactions",
      href: "/transactions",
      icon: Receipt,
      color: "bg-emerald-500",
    },
    {
      title: "Performance",
      description: "Goals and plan details",
      href: "/performance",
      icon: Target,
      color: "bg-amber-500",
    },
    {
      title: "Configuration",
      description: "Plan settings and rules",
      href: "/configuration",
      icon: Settings,
      color: "bg-slate-500",
    },
  ],
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function DashboardPage() {
  const { user, stats, recentActivity, quickLinks } = dashboardData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <Avatar className="h-12 w-12 border-2 border-white shadow-md">
              <AvatarImage src="/avatars/sarah.jpg" />
              <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-lg">
                SC
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                Welcome back, {user.name.split(" ")[0]}!
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                {user.role} • {user.team}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {/* YTD Compensation */}
          <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-indigo-100">
                    YTD Compensation
                  </p>
                  <p className="text-3xl font-bold mt-1">
                    {formatCurrency(stats.ytdCompensation)}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpRight className="h-4 w-4 text-emerald-300" />
                    <span className="text-sm text-indigo-100">
                      <span className="text-emerald-300 font-medium">+12.5%</span> vs last year
                    </span>
                  </div>
                </div>
                <div className="p-3 bg-white/20 rounded-full">
                  <DollarSign className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quota Attainment */}
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Quota Attainment
                  </p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    {stats.quotaAttainment}%
                  </p>
                  <Badge className="mt-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    Exceeding
                  </Badge>
                </div>
                <div className="p-3 bg-emerald-100 rounded-full dark:bg-emerald-900/30">
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ranking */}
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Team Ranking
                  </p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    #{stats.ranking}
                  </p>
                  <p className="text-sm text-slate-500 mt-2">
                    of {stats.rankingTotal} reps
                  </p>
                </div>
                <div className="p-3 bg-amber-100 rounded-full dark:bg-amber-900/30">
                  <Trophy className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pending Commissions */}
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Pending Commissions
                  </p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                    {formatCurrency(stats.pendingCommissions)}
                  </p>
                  <p className="text-sm text-slate-500 mt-2">2 transactions</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full dark:bg-blue-900/30">
                  <Clock className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recent Activity */}
          <Card className="border-0 shadow-lg lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Your latest compensation events</CardDescription>
              </div>
              <Link href="/transactions">
                <Button variant="ghost" size="sm" className="gap-1">
                  View all
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-full ${
                          activity.status === "completed"
                            ? "bg-emerald-100 dark:bg-emerald-900/30"
                            : "bg-blue-100 dark:bg-blue-900/30"
                        }`}
                      >
                        {activity.status === "completed" ? (
                          <CheckCircle2
                            className={`h-4 w-4 ${
                              activity.status === "completed"
                                ? "text-emerald-600"
                                : "text-blue-600"
                            }`}
                          />
                        ) : (
                          <Clock className="h-4 w-4 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-50">
                          {activity.description}
                        </p>
                        <p className="text-sm text-slate-500">
                          {new Date(activity.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900 dark:text-slate-50">
                        +{formatCurrency(activity.amount)}
                      </p>
                      <Badge
                        variant="secondary"
                        className={
                          activity.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-100 text-blue-700"
                        }
                      >
                        {activity.status === "completed" ? "Paid" : "Processing"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Navigate to key sections</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {quickLinks.map((link) => (
                  <Link key={link.href} href={link.href}>
                    <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group">
                      <div className={`p-2.5 rounded-lg ${link.color}`}>
                        <link.icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900 dark:text-slate-50 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {link.title}
                        </p>
                        <p className="text-sm text-slate-500">{link.description}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Summary */}
        <Card className="border-0 shadow-lg mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Q4 Performance Summary</CardTitle>
                <CardDescription>October - December 2024</CardDescription>
              </div>
              <Link href="/performance">
                <Button variant="outline" size="sm" className="gap-1">
                  View Details
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-4">
              <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                  {formatCurrency(520000)}
                </p>
                <p className="text-sm text-slate-500 mt-1">Total Sales</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">18</p>
                <p className="text-sm text-slate-500 mt-1">Deals Closed</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                  {formatCurrency(28889)}
                </p>
                <p className="text-sm text-slate-500 mt-1">Avg Deal Size</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <p className="text-3xl font-bold text-emerald-600">86.7%</p>
                <p className="text-sm text-slate-500 mt-1">Goal Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
