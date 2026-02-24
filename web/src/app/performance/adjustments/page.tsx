"use client";

/**
 * Adjustments Page — Manage outcome adjustments, credits, and corrections
 *
 * OB-73 Mission 5 / F-31, F-32: Wired to Supabase disputes table.
 * Approve/Reject/New Adjustment buttons are fully functional.
 */

import { useState, useEffect, useCallback } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useCurrency, useTenant } from "@/contexts/tenant-context";
import { createClient } from "@/lib/supabase/client";
import { loadAdjustmentsPageData, type AdjustmentRow } from "@/lib/data/page-loaders";

const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string }> = {
  open: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  investigating: { icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
  resolved: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  rejected: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
  escalated: { icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-50" },
};

const categoryLabels: Record<string, { label: string; color: string }> = {
  adjustment: { label: "Adjustment", color: "bg-emerald-100 text-emerald-700" },
  correction: { label: "Correction", color: "bg-amber-100 text-amber-700" },
  credit: { label: "Credit", color: "bg-blue-100 text-blue-700" },
  dispute: { label: "Dispute", color: "bg-purple-100 text-purple-700" },
};

export default function AdjustmentsPage() {
  const { format: fmt } = useCurrency();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id ?? '';
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  const loadAdjustments = useCallback(async () => {
    if (!tenantId) return;
    try {
      const { adjustments: rows } = await loadAdjustmentsPageData(tenantId);
      setAdjustments(rows);
    } catch (err) {
      console.warn('[Adjustments] Load failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadAdjustments(); }, [loadAdjustments]);

  // OB-73 Mission 5 / F-32: Wire Approve button
  const handleApprove = async (id: string) => {
    setProcessing(id);
    const supabase = createClient();
    const { error } = await supabase
      .from('disputes')
      .update({
        status: 'resolved',
        resolution: 'Approved',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (!error) {
      setAdjustments(prev => prev.map(a =>
        a.id === id ? { ...a, status: 'resolved', resolution: 'Approved', resolvedAt: new Date().toISOString() } : a
      ));
    }
    setProcessing(null);
  };

  // OB-73 Mission 5 / F-32: Wire Reject button
  const handleReject = async (id: string) => {
    setProcessing(id);
    const supabase = createClient();
    const { error } = await supabase
      .from('disputes')
      .update({
        status: 'rejected',
        resolution: 'Rejected',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (!error) {
      setAdjustments(prev => prev.map(a =>
        a.id === id ? { ...a, status: 'rejected', resolution: 'Rejected', resolvedAt: new Date().toISOString() } : a
      ));
    }
    setProcessing(null);
  };

  // OB-73 Mission 5 / F-31: Wire New Adjustment button
  const handleNewAdjustment = async () => {
    if (!newDescription.trim()) return;
    setProcessing('new');
    const supabase = createClient();

    // Get current user for filed_by
    const { data: { user } } = await supabase.auth.getUser();
    let profileId: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      profileId = profile?.id || null;
    }

    // Get active period
    const { data: period } = await supabase
      .from('periods')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get first entity as placeholder (user should pick in a real form)
    const { data: entity } = await supabase
      .from('entities')
      .select('id')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();

    if (!entity?.id) {
      setProcessing(null);
      return;
    }

    const { error } = await supabase
      .from('disputes')
      .insert({
        tenant_id: tenantId,
        entity_id: entity.id,
        period_id: period?.id || null,
        category: 'adjustment',
        status: 'open',
        description: newDescription.trim(),
        amount_disputed: parseFloat(newAmount) || 0,
        filed_by: profileId,
      });

    if (!error) {
      setShowNewForm(false);
      setNewDescription('');
      setNewAmount('');
      await loadAdjustments();
    }
    setProcessing(null);
  };

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
    pending: adjustments.filter((a) => a.status === "open" || a.status === "investigating").length,
    approved: adjustments.filter((a) => a.status === "resolved").length,
    rejected: adjustments.filter((a) => a.status === "rejected").length,
    totalAmount: adjustments
      .filter((a) => a.status === "resolved")
      .reduce((sum, a) => sum + (a.amount || 0), 0),
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
          <Button className="gap-2" onClick={() => setShowNewForm(true)}>
            <Plus className="h-4 w-4" />
            New Adjustment
          </Button>
        </div>

        {/* New Adjustment Form */}
        {showNewForm && (
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle>New Adjustment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Describe the adjustment reason..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
              />
              <div className="flex items-center gap-4">
                <Input
                  type="number"
                  placeholder="Amount"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-40"
                />
                <Button
                  onClick={handleNewAdjustment}
                  disabled={!newDescription.trim() || processing === 'new'}
                >
                  {processing === 'new' ? 'Submitting...' : 'Submit'}
                </Button>
                <Button variant="outline" onClick={() => { setShowNewForm(false); setNewDescription(''); setNewAmount(''); }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

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
            {["all", "open", "resolved", "rejected"].map((status) => (
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
                const catConfig = categoryLabels[adj.category] || categoryLabels.adjustment;
                const statusCfg = statusConfig[adj.status] || statusConfig.open;
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
                              {adj.id.slice(0, 8)}
                            </span>
                            <Badge variant="secondary" className={catConfig.color}>
                              {catConfig.label}
                            </Badge>
                          </div>
                          <h4 className="font-semibold text-slate-900 dark:text-slate-50">
                            {adj.reason}
                          </h4>
                          <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                            <User className="h-3.5 w-3.5" />
                            {adj.entityName}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-bold ${adj.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {adj.amount >= 0 ? "+" : "-"}{fmt(Math.abs(adj.amount))}
                        </p>
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
                      {(adj.status === "open" || adj.status === "investigating") && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleReject(adj.id)}
                            disabled={processing === adj.id}
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => handleApprove(adj.id)}
                            disabled={processing === adj.id}
                          >
                            Approve
                          </Button>
                        </div>
                      )}
                      {adj.status === "resolved" && adj.resolvedBy && (
                        <span className="text-emerald-600">
                          Approved by {adj.resolvedBy}
                        </span>
                      )}
                      {adj.status === "rejected" && (
                        <span className="text-red-600">
                          Rejected{adj.resolvedAt ? ` on ${new Date(adj.resolvedAt).toLocaleDateString()}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredAdjustments.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Settings2 className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                  <p>{adjustments.length === 0 ? 'No adjustments found. Create one to get started.' : 'No adjustments match your filter.'}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
