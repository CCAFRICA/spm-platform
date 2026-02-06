'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, MoreHorizontal, Search, Eye, Edit, Copy, History, FileText } from 'lucide-react';
import { useTenant } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context';
import { getPlans, clonePlan, initializePlans } from '@/lib/compensation/plan-storage';
import type { CompensationPlanConfig, PlanStatus } from '@/types/compensation-plan';

const STATUS_BADGES: Record<PlanStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  pending_approval: { label: 'Pending Approval', variant: 'outline' },
  active: { label: 'Active', variant: 'default' },
  archived: { label: 'Archived', variant: 'destructive' },
};

const PLAN_TYPE_LABELS: Record<string, string> = {
  additive_lookup: 'Additive Lookup',
  weighted_kpi: 'Weighted KPI',
};

export default function PlansPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const [plans, setPlans] = useState<CompensationPlanConfig[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PlanStatus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize plans on mount
    initializePlans();
  }, []);

  useEffect(() => {
    if (currentTenant?.id) {
      setIsLoading(true);
      try {
        const tenantPlans = getPlans(currentTenant.id);
        setPlans(tenantPlans);
      } finally {
        setIsLoading(false);
      }
    }
  }, [currentTenant?.id]);

  const loadPlans = () => {
    setIsLoading(true);
    try {
      const tenantPlans = getPlans(currentTenant?.id || '');
      setPlans(tenantPlans);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPlans = plans.filter((plan) => {
    const matchesSearch =
      searchQuery === '' ||
      plan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plan.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || plan.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleClone = async (planId: string, planName: string) => {
    const newName = `${planName} (Copy)`;
    const cloned = clonePlan(planId, newName, user?.id || 'system');
    if (cloned) {
      loadPlans();
      router.push(`/performance/plans/${cloned.id}`);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatRoles = (roles: string[]) => {
    return roles.map((r) => r.replace('_', ' ')).join(', ');
  };

  // Access control - only admin can access this page
  if (user?.role !== 'admin' && user?.role !== 'cc_admin') {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              You do not have permission to access plan management.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Compensation Plans</h1>
          <p className="text-muted-foreground">
            Configure and manage compensation plan structures
          </p>
        </div>
        <Button onClick={() => router.push('/performance/plans/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Create Plan
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Plans</div>
            <div className="text-2xl font-bold">{plans.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Active</div>
            <div className="text-2xl font-bold text-green-600">
              {plans.filter((p) => p.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Pending Approval</div>
            <div className="text-2xl font-bold text-yellow-600">
              {plans.filter((p) => p.status === 'pending_approval').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Drafts</div>
            <div className="text-2xl font-bold text-gray-600">
              {plans.filter((p) => p.status === 'draft').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search plans..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PlanStatus | 'all')}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Plans Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading plans...</div>
          ) : filteredPlans.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <div className="text-muted-foreground">
                {plans.length === 0
                  ? 'No compensation plans configured yet.'
                  : 'No plans match your search criteria.'}
              </div>
              {plans.length === 0 && (
                <Button className="mt-4" onClick={() => router.push('/performance/plans/new')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Plan
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Eligible Roles</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlans.map((plan) => (
                  <TableRow
                    key={plan.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/performance/plans/${plan.id}`)}
                  >
                    <TableCell>
                      <div>
                        <div className="font-medium">{plan.name}</div>
                        <div className="text-sm text-muted-foreground truncate max-w-xs">
                          {plan.description}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{PLAN_TYPE_LABELS[plan.planType] || plan.planType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGES[plan.status].variant}>
                        {STATUS_BADGES[plan.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{formatRoles(plan.eligibleRoles)}</TableCell>
                    <TableCell>{formatDate(plan.effectiveDate)}</TableCell>
                    <TableCell>v{plan.version}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/performance/plans/${plan.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          {plan.status === 'draft' && (
                            <DropdownMenuItem onClick={() => router.push(`/performance/plans/${plan.id}?edit=true`)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClone(plan.id, plan.name);
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Clone
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => router.push(`/performance/plans/${plan.id}?tab=history`)}>
                            <History className="h-4 w-4 mr-2" />
                            History
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
