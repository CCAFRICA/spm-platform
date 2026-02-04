"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  Users,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";

// Mock goals data
const individualGoals = [
  {
    id: "GOAL-001",
    name: "Q4 Sales Target",
    description: "Achieve $600,000 in closed sales",
    targetValue: 600000,
    currentValue: 520000,
    unit: "currency",
    startDate: "2024-10-01",
    endDate: "2024-12-31",
    status: "on_track",
    progress: 86.7,
    daysRemaining: 16,
  },
  {
    id: "GOAL-002",
    name: "New Logo Acquisition",
    description: "Close 5 new enterprise accounts",
    targetValue: 5,
    currentValue: 4,
    unit: "count",
    startDate: "2024-10-01",
    endDate: "2024-12-31",
    status: "on_track",
    progress: 80,
    daysRemaining: 16,
  },
  {
    id: "GOAL-003",
    name: "Pipeline Growth",
    description: "Build $1.5M in qualified pipeline",
    targetValue: 1500000,
    currentValue: 1200000,
    unit: "currency",
    startDate: "2024-10-01",
    endDate: "2024-12-31",
    status: "at_risk",
    progress: 80,
    daysRemaining: 16,
  },
  {
    id: "GOAL-004",
    name: "Customer Retention",
    description: "Maintain 95% renewal rate",
    targetValue: 95,
    currentValue: 92,
    unit: "percentage",
    startDate: "2024-01-01",
    endDate: "2024-12-31",
    status: "at_risk",
    progress: 96.8,
    daysRemaining: 16,
  },
];

const teamGoals = [
  {
    id: "TEAM-001",
    name: "West-Enterprise Team Goal",
    description: "Team achieves $2M in Q4 revenue",
    targetValue: 2000000,
    currentValue: 1850000,
    progress: 92.5,
    status: "on_track",
    members: [
      { name: "Sarah Chen", contribution: 520000 },
      { name: "Michelle Anderson", contribution: 445000 },
      { name: "Megan Adams", contribution: 480000 },
      { name: "Victoria Edwards", contribution: 405000 },
    ],
  },
  {
    id: "TEAM-002",
    name: "Regional Revenue Target",
    description: "West Region achieves $5.5M annually",
    targetValue: 5500000,
    currentValue: 4800000,
    progress: 87.3,
    status: "at_risk",
    members: [
      { name: "West-Enterprise", contribution: 1850000 },
      { name: "West-Mid-Market", contribution: 1650000 },
      { name: "West-SMB", contribution: 1300000 },
    ],
  },
];

function formatValue(value: number, unit: string): string {
  if (unit === "currency") {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  }
  if (unit === "percentage") {
    return `${value}%`;
  }
  return value.toString();
}

function getStatusColor(status: string): { bg: string; text: string; icon: typeof CheckCircle2 } {
  switch (status) {
    case "on_track":
      return { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2 };
    case "at_risk":
      return { bg: "bg-amber-100", text: "text-amber-700", icon: AlertCircle };
    case "behind":
      return { bg: "bg-red-100", text: "text-red-700", icon: AlertCircle };
    case "achieved":
      return { bg: "bg-blue-100", text: "text-blue-700", icon: CheckCircle2 };
    default:
      return { bg: "bg-slate-100", text: "text-slate-700", icon: Clock };
  }
}

function getProgressColor(progress: number): string {
  if (progress >= 90) return "bg-emerald-500";
  if (progress >= 70) return "bg-amber-500";
  return "bg-red-500";
}

export default function GoalsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Goals Tracking
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Monitor individual and team goal progress
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Active Goals</p>
                  <p className="text-2xl font-bold">6</p>
                </div>
                <Target className="h-8 w-8 text-slate-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">On Track</p>
                  <p className="text-2xl font-bold text-emerald-600">4</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">At Risk</p>
                  <p className="text-2xl font-bold text-amber-600">2</p>
                </div>
                <AlertCircle className="h-8 w-8 text-amber-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Days Remaining</p>
                  <p className="text-2xl font-bold">16</p>
                </div>
                <Calendar className="h-8 w-8 text-slate-300" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Individual Goals */}
        <Card className="border-0 shadow-lg mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-indigo-500" />
                  Individual Goals
                </CardTitle>
                <CardDescription>Your personal targets for Q4 2024</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-slate-100">
                4 Goals
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {individualGoals.map((goal) => {
                const statusStyle = getStatusColor(goal.status);
                const StatusIcon = statusStyle.icon;

                return (
                  <div
                    key={goal.id}
                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-slate-50">
                          {goal.name}
                        </h4>
                        <p className="text-sm text-slate-500">{goal.description}</p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`${statusStyle.bg} ${statusStyle.text} gap-1`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {goal.status.replace("_", " ").charAt(0).toUpperCase() +
                          goal.status.replace("_", " ").slice(1)}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-500">Progress</span>
                          <span className="font-medium">
                            {formatValue(goal.currentValue, goal.unit)} /{" "}
                            {formatValue(goal.targetValue, goal.unit)}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getProgressColor(goal.progress)} rounded-full transition-all`}
                            style={{ width: `${Math.min(goal.progress, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                          {goal.progress.toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {goal.daysRemaining} days remaining
                      </span>
                      <span>
                        Due: {new Date(goal.endDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Team Goals */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-500" />
                  Team Goals
                </CardTitle>
                <CardDescription>Collaborative team targets</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-slate-100">
                2 Goals
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {teamGoals.map((goal) => {
                const statusStyle = getStatusColor(goal.status);

                return (
                  <div
                    key={goal.id}
                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-slate-50">
                          {goal.name}
                        </h4>
                        <p className="text-sm text-slate-500">{goal.description}</p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`${statusStyle.bg} ${statusStyle.text}`}
                      >
                        {goal.status.replace("_", " ").charAt(0).toUpperCase() +
                          goal.status.replace("_", " ").slice(1)}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-500">Team Progress</span>
                          <span className="font-medium">
                            {formatValue(goal.currentValue, "currency")} /{" "}
                            {formatValue(goal.targetValue, "currency")}
                          </span>
                        </div>
                        <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getProgressColor(goal.progress)} rounded-full`}
                            style={{ width: `${Math.min(goal.progress, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                          {goal.progress.toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    {/* Individual Contributions */}
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                        Contributions
                      </p>
                      <div className="space-y-2">
                        {goal.members.map((member, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-slate-600 dark:text-slate-400">
                              {member.name}
                            </span>
                            <span className="font-medium">
                              {formatValue(member.contribution, "currency")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
