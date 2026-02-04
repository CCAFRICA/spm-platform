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
  DollarSign,
  Users,
  TrendingUp,
  Calendar,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

// Mock compensation plans data
const compensationPlans = [
  {
    id: "CP001",
    name: "Basic Commission Plan",
    type: "basic",
    description: "Standard 5% commission on all closed sales",
    effectiveDate: "2024-01-01",
    status: "active",
    assignedReps: 12,
    avgPayout: 3500,
    quotaAmount: 500000,
    structure: {
      baseRate: "5%",
      description: "Flat rate on all sales",
    },
  },
  {
    id: "CP002",
    name: "Tiered Commission Plan",
    type: "tiered",
    description: "Progressive rates that increase with sales volume",
    effectiveDate: "2024-01-01",
    status: "active",
    assignedReps: 15,
    avgPayout: 5200,
    quotaAmount: 750000,
    structure: {
      tiers: [
        { range: "$0 - $50K", rate: "3%" },
        { range: "$50K - $100K", rate: "5%" },
        { range: "$100K+", rate: "7%" },
      ],
    },
  },
  {
    id: "CP003",
    name: "Accelerator Plan",
    type: "accelerator",
    description: "Base commission plus bonus above quota",
    effectiveDate: "2024-01-01",
    status: "active",
    assignedReps: 8,
    avgPayout: 8500,
    quotaAmount: 1000000,
    structure: {
      baseRate: "4%",
      acceleratorRate: "+2%",
      threshold: "Above 100% quota",
    },
  },
  {
    id: "CP004",
    name: "Team-Based Plan",
    type: "team_based",
    description: "Individual + team pool bonus structure",
    effectiveDate: "2024-01-01",
    status: "active",
    assignedReps: 10,
    avgPayout: 4800,
    quotaAmount: 2000000,
    structure: {
      baseRate: "3%",
      teamPool: "1%",
      bonus: "$5,000 quarterly",
    },
  },
  {
    id: "CP005",
    name: "Executive Compensation",
    type: "executive",
    description: "Comprehensive package for leadership",
    effectiveDate: "2024-01-01",
    status: "active",
    assignedReps: 5,
    avgPayout: 15000,
    quotaAmount: 10000000,
    structure: {
      baseRate: "2%",
      bonus: "$50K annual",
      additional: "Equity participation",
    },
  },
];

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  return `$${(amount / 1000).toFixed(0)}K`;
}

function getPlanTypeColor(type: string): string {
  switch (type) {
    case "basic":
      return "bg-slate-100 text-slate-700";
    case "tiered":
      return "bg-purple-100 text-purple-700";
    case "accelerator":
      return "bg-indigo-100 text-indigo-700";
    case "team_based":
      return "bg-emerald-100 text-emerald-700";
    case "executive":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function PlansPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Compensation Plans
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              View and manage compensation plan structures
            </p>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            5 Active Plans
          </Badge>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Plans</p>
                  <p className="text-2xl font-bold">5</p>
                </div>
                <DollarSign className="h-8 w-8 text-slate-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Assigned Reps</p>
                  <p className="text-2xl font-bold">50</p>
                </div>
                <Users className="h-8 w-8 text-slate-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Avg Payout</p>
                  <p className="text-2xl font-bold">$7.4K</p>
                </div>
                <TrendingUp className="h-8 w-8 text-slate-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Quota</p>
                  <p className="text-2xl font-bold">$14.2M</p>
                </div>
                <Calendar className="h-8 w-8 text-slate-300" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Plans Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {compensationPlans.map((plan) => (
            <Card key={plan.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <Badge
                      variant="secondary"
                      className={`${getPlanTypeColor(plan.type)} mb-2`}
                    >
                      {plan.type.replace("_", " ").charAt(0).toUpperCase() +
                        plan.type.replace("_", " ").slice(1)}
                    </Badge>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {plan.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-50 rounded-lg dark:bg-slate-800/50">
                      <p className="text-xs text-slate-500">Assigned Reps</p>
                      <p className="text-lg font-semibold">{plan.assignedReps}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg dark:bg-slate-800/50">
                      <p className="text-xs text-slate-500">Avg Payout</p>
                      <p className="text-lg font-semibold">
                        ${plan.avgPayout.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Structure Details */}
                  <div className="p-3 bg-slate-50 rounded-lg dark:bg-slate-800/50">
                    <p className="text-xs text-slate-500 mb-2">Plan Structure</p>
                    {plan.structure.baseRate && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Base Rate</span>
                        <span className="font-medium">{plan.structure.baseRate}</span>
                      </div>
                    )}
                    {plan.structure.acceleratorRate && (
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-slate-600">Accelerator</span>
                        <span className="font-medium text-emerald-600">
                          {plan.structure.acceleratorRate}
                        </span>
                      </div>
                    )}
                    {plan.structure.tiers && (
                      <div className="space-y-1">
                        {plan.structure.tiers.map((tier, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-slate-600">{tier.range}</span>
                            <span className="font-medium">{tier.rate}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {plan.structure.teamPool && (
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-slate-600">Team Pool</span>
                        <span className="font-medium">{plan.structure.teamPool}</span>
                      </div>
                    )}
                    {plan.structure.bonus && (
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-slate-600">Bonus</span>
                        <span className="font-medium text-indigo-600">
                          {plan.structure.bonus}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quota */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm text-slate-500">Annual Quota</span>
                    <span className="font-semibold">
                      {formatCurrency(plan.quotaAmount)}
                    </span>
                  </div>

                  {/* View Details Button */}
                  <Button variant="outline" className="w-full gap-2">
                    View Details
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
