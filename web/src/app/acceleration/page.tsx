"use client";

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
  Zap,
  Bell,
  AlertTriangle,
  TrendingUp,
  Trophy,
  Target,
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  ArrowRight,
} from "lucide-react";

// Mock alerts data
const alerts = [
  {
    id: "ALT-001",
    type: "budget",
    severity: "warning",
    title: "Budget Threshold Alert",
    message: "West Region has exceeded 90% of Q4 commission budget. Consider reviewing upcoming payouts.",
    timestamp: "2024-12-15T10:30:00Z",
    read: false,
    actionUrl: "/insights/compensation",
  },
  {
    id: "ALT-002",
    type: "performance",
    severity: "success",
    title: "Top Performer Achievement",
    message: "Sarah Chen has achieved 150% quota attainment this quarter - eligible for accelerator bonus.",
    timestamp: "2024-12-14T15:45:00Z",
    read: false,
  },
  {
    id: "ALT-003",
    type: "goal",
    severity: "success",
    title: "Team Goal Achieved",
    message: "West-Enterprise team has hit their Q4 target ahead of schedule. Congratulations!",
    timestamp: "2024-12-13T09:00:00Z",
    read: true,
  },
  {
    id: "ALT-004",
    type: "performance",
    severity: "critical",
    title: "Underperformance Alert",
    message: "5 sales reps are below 60% quota attainment with 2 weeks remaining in the quarter.",
    timestamp: "2024-12-11T14:20:00Z",
    read: false,
    actionUrl: "/performance",
  },
  {
    id: "ALT-005",
    type: "system",
    severity: "info",
    title: "Data Sync Complete",
    message: "Monthly transaction data has been synchronized successfully from Salesforce.",
    timestamp: "2024-12-10T06:00:00Z",
    read: true,
  },
];

const recommendations = [
  {
    id: "REC-001",
    title: "Focus on North Region",
    description: "North Region is underperforming by 6.5%. Consider additional support or SPIF incentives.",
    impact: "High",
    category: "Performance",
    icon: Target,
  },
  {
    id: "REC-002",
    title: "Review Tiered Plan Effectiveness",
    description: "Tiered commission plan shows 15% higher attainment vs basic plan. Consider expanding eligibility.",
    impact: "Medium",
    category: "Compensation",
    icon: TrendingUp,
  },
  {
    id: "REC-003",
    title: "Q1 Planning Preparation",
    description: "Begin quota planning for Q1 2025. Historical data suggests 8% YoY growth target is achievable.",
    impact: "High",
    category: "Planning",
    icon: Lightbulb,
  },
  {
    id: "REC-004",
    title: "Recognize Top Performers",
    description: "10 reps have exceeded 110% attainment. Schedule recognition at next team meeting.",
    impact: "Medium",
    category: "Engagement",
    icon: Trophy,
  },
];

const activeSpifs = [
  {
    id: "SPIF-001",
    name: "Holiday Push SPIF",
    description: "Extra $500 per deal closed before Dec 20",
    startDate: "2024-12-01",
    endDate: "2024-12-20",
    status: "active",
    participants: 40,
    totalPayout: 12500,
  },
  {
    id: "SPIF-002",
    name: "New Product Launch",
    description: "2x commission on new Analytics module sales",
    startDate: "2024-11-15",
    endDate: "2024-12-31",
    status: "active",
    participants: 35,
    totalPayout: 28000,
  },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSeverityStyle(severity: string): { bg: string; text: string; border: string } {
  switch (severity) {
    case "critical":
      return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" };
    case "warning":
      return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
    case "success":
      return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
    default:
      return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" };
  }
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <AlertTriangle className="h-5 w-5 text-red-500" />;
    case "warning":
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case "success":
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    default:
      return <Bell className="h-5 w-5 text-blue-500" />;
  }
}

export default function AccelerationPage() {
  const unreadAlerts = alerts.filter((a) => !a.read).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Acceleration & Alerts
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Active incentives, notifications, and AI-powered recommendations
          </p>
        </div>

        {/* Active SPIFs */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Active Incentive Programs
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {activeSpifs.map((spif) => (
              <Card key={spif.id} className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500 mb-2">
                        Active SPIF
                      </Badge>
                      <h3 className="font-semibold text-slate-900">{spif.name}</h3>
                      <p className="text-sm text-slate-600 mt-1">{spif.description}</p>
                    </div>
                    <Zap className="h-8 w-8 text-amber-400" />
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-amber-200">
                    <div>
                      <p className="text-xs text-slate-500">Ends</p>
                      <p className="font-medium">
                        {new Date(spif.endDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Participants</p>
                      <p className="font-medium">{spif.participants}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Total Payout</p>
                      <p className="font-medium text-emerald-600">
                        ${spif.totalPayout.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Alerts Panel */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-slate-400" />
                    Notifications
                  </CardTitle>
                  <CardDescription>System alerts and important updates</CardDescription>
                </div>
                {unreadAlerts > 0 && (
                  <Badge className="bg-red-500 text-white hover:bg-red-500">
                    {unreadAlerts} New
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {alerts.map((alert) => {
                  const style = getSeverityStyle(alert.severity);
                  return (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-lg border ${style.border} ${style.bg} ${
                        !alert.read ? "ring-2 ring-offset-2 ring-slate-200" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {getSeverityIcon(alert.severity)}
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <h4 className={`font-medium ${style.text}`}>
                              {alert.title}
                            </h4>
                            {!alert.read && (
                              <span className="w-2 h-2 bg-blue-500 rounded-full" />
                            )}
                          </div>
                          <p className="text-sm text-slate-600 mt-1">
                            {alert.message}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-slate-500">
                              {formatDate(alert.timestamp)}
                            </span>
                            {alert.actionUrl && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                                View Details
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Recommendations Panel */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                AI Recommendations
              </CardTitle>
              <CardDescription>
                Insights and suggested actions based on your data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-4 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors dark:border-slate-700"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-slate-100 rounded-lg dark:bg-slate-800">
                        <rec.icon className="h-5 w-5 text-slate-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <h4 className="font-medium text-slate-900 dark:text-slate-50">
                            {rec.title}
                          </h4>
                          <Badge
                            variant="secondary"
                            className={
                              rec.impact === "High"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            }
                          >
                            {rec.impact} Impact
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">
                          {rec.description}
                        </p>
                        <div className="flex items-center justify-between mt-3">
                          <Badge variant="outline" className="text-xs">
                            {rec.category}
                          </Badge>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                            Take Action
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
