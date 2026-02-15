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
  Settings2,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  User,
  Filter,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCurrency } from "@/contexts/tenant-context";

// Mock adjustments data
const adjustments = [
  {
    id: "ADJ-001",
    type: "manual_credit",
    entityId: "maria-rodriguez",
    entityName: "Maria Rodriguez",
    amount: 150.00,
    reason: "Customer referral bonus",
    period: "2025-01",
    status: "approved",
    requestedBy: "John Manager",
    requestedAt: "2025-01-15T10:30:00Z",
    approvedBy: "Sofia Chen",
    approvedAt: "2025-01-15T14:45:00Z",
  },
  {
    id: "ADJ-002",
    type: "correction",
    entityId: "james-wilson",
    entityName: "James Wilson",
    amount: -85.00,
    reason: "Duplicate transaction correction",
    period: "2025-01",
    status: "pending",
    requestedBy: "James Wilson",
    requestedAt: "2025-01-18T09:15:00Z",
  },
  {
    id: "ADJ-003",
    type: "quota_adjustment",
    entityId: "sarah-chen",
    entityName: "Sarah Chen",
    amount: 0,
    quotaChange: -5000,
    reason: "Territory realignment",
    period: "2025-01",
    status: "pending",
    requestedBy: "Region Manager",
    requestedAt: "2025-01-19T11:00:00Z",
  },
  {
    id: "ADJ-004",
    type: "spiff",
    entityId: "maria-rodriguez",
    entityName: "Maria Rodriguez",
    amount: 250.00,
    reason: "Product launch promotion",
    period: "2025-01",
    status: "approved",
    requestedBy: "Marketing",
    requestedAt: "2025-01-10T08:00:00Z",
    approvedBy: "Sofia Chen",
    approvedAt: "2025-01-10T12:30:00Z",
  },
  {
    id: "ADJ-005",
    type: "manual_credit",
    entityId: "james-wilson",
    entityName: "James Wilson",
    amount: 320.00,
    reason: "Split transaction reattribution",
    period: "2025-01",
    status: "rejected",
    requestedBy: "James Wilson",
    requestedAt: "2025-01-12T14:20:00Z",
    rejectedBy: "Sofia Chen",
    rejectedAt: "2025-01-13T09:00:00Z",
    rejectionReason: "Transaction already credited to correct rep",
  },
];

const adjustmentTypes = {
  manual_credit: { label: "Manual Credit", color: "bg-emerald-100 text-emerald-700" },
  correction: { label: "Correction", color: "bg-amber-100 text-amber-700" },
  quota_adjustment: { label: "Target Adjustment", color: "bg-blue-100 text-blue-700" },
  spiff: { label: "SPIFF", color: "bg-purple-100 text-purple-700" },
  clawback: { label: "Clawback", color: "bg-red-100 text-red-700" },
};

const statusConfig = {
  pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  approved: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  rejected: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
};

export default function AdjustmentsPage() {
  const { format: fmt } = useCurrency();
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAdjustments = adjustments.filter((adj) => {
    if (filter !== "all" && adj.status !== filter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        adj.entityName.toLowerCase().includes(query) ||
        adj.reason.toLowerCase().includes(query) ||
        adj.id.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const stats = {
    total: adjustments.length,
    pending: adjustments.filter((a) => a.status === "pending").length,
    approved: adjustments.filter((a) => a.status === "approved").length,
    rejected: adjustments.filter((a) => a.status === "rejected").length,
    totalAmount: adjustments
      .filter((a) => a.status === "approved")
      .reduce((sum, a) => sum + (a.amount || 0), 0),
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Adjustments
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Manage outcome adjustments, credits, and corrections
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Adjustment
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-5 mb-8">
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Settings2 className="h-8 w-8 text-slate-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Pending</p>
                  <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                </div>
                <Clock className="h-8 w-8 text-amber-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Approved</p>
                  <p className="text-2xl font-bold text-emerald-600">{stats.approved}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Rejected</p>
                  <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-red-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Approved Total</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                    {fmt(stats.totalAmount)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-slate-300" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by entity, reason, or ID..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            {["all", "pending", "approved", "rejected"].map((status) => (
              <Button
                key={status}
                variant={filter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(status)}
                className="capitalize"
              >
                {status}
              </Button>
            ))}
          </div>
        </div>

        {/* Adjustments List */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-indigo-500" />
              Adjustment Requests
            </CardTitle>
            <CardDescription>
              Review and manage outcome adjustments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredAdjustments.map((adj) => {
                const typeConfig = adjustmentTypes[adj.type as keyof typeof adjustmentTypes];
                const statusCfg = statusConfig[adj.status as keyof typeof statusConfig];
                const StatusIcon = statusCfg.icon;

                return (
                  <div
                    key={adj.id}
                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-4">
                        <div className={`p-2 rounded-lg ${statusCfg.bg}`}>
                          <StatusIcon className={`h-5 w-5 ${statusCfg.color}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm text-slate-500">
                              {adj.id}
                            </span>
                            <Badge variant="secondary" className={typeConfig.color}>
                              {typeConfig.label}
                            </Badge>
                          </div>
                          <h4 className="font-semibold text-slate-900 dark:text-slate-50">
                            {adj.reason}
                          </h4>
                          <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                            <User className="h-3.5 w-3.5" />
                            {adj.entityName}
                            <span className="text-slate-300">|</span>
                            Period: {adj.period}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-bold ${adj.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {adj.amount >= 0 ? "+" : "-"}{fmt(Math.abs(adj.amount))}
                        </p>
                        {adj.quotaChange && (
                          <p className="text-sm text-slate-500">
                            Target: {adj.quotaChange > 0 ? "+" : ""}{adj.quotaChange.toLocaleString()}
                          </p>
                        )}
                        <Badge
                          variant="secondary"
                          className={`${statusCfg.bg} ${statusCfg.color} mt-2`}
                        >
                          {adj.status.charAt(0).toUpperCase() + adj.status.slice(1)}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500">
                      <div>
                        Requested by {adj.requestedBy} on{" "}
                        {new Date(adj.requestedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                      {adj.status === "pending" && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                            Reject
                          </Button>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                            Approve
                          </Button>
                        </div>
                      )}
                      {adj.status === "approved" && adj.approvedBy && (
                        <span className="text-emerald-600">
                          Approved by {adj.approvedBy}
                        </span>
                      )}
                      {adj.status === "rejected" && adj.rejectedBy && (
                        <span className="text-red-600" title={adj.rejectionReason}>
                          Rejected by {adj.rejectedBy}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredAdjustments.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Settings2 className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                  <p>No adjustments found</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
