// ============================================================================
// SPM Platform Data Service Layer
// ============================================================================

import type {
  User,
  Transaction,
  PerformanceMetric,
  RuleSet,
  OrganizationalUnit,
  TransactionFilters,
  LeaderboardEntry,
  DashboardStats,
  Alert,
  DataLoad,
  Goal,
} from './types';

// Import mock data
import usersData from '../../../mock-data/users.json';
import transactionsData from '../../../mock-data/transactions.json';
import performanceData from '../../../mock-data/performance-data.json';
import compensationPlansData from '../../../mock-data/compensation-plans.json';
import organizationalData from '../../../mock-data/organizational-hierarchy.json';

// ============================================================================
// User Functions
// ============================================================================

export function getUsers(): User[] {
  return usersData.users as User[];
}

export function getUserById(id: string): User | undefined {
  return usersData.users.find((user) => user.id === id) as User | undefined;
}

export function getUsersByRole(role: string): User[] {
  return usersData.users.filter((user) => user.role === role) as User[];
}

export function getUsersByRegion(region: string): User[] {
  return usersData.users.filter((user) => user.region === region) as User[];
}

export function getUsersByTeam(team: string): User[] {
  return usersData.users.filter((user) => user.team === team) as User[];
}

export function getUsersByManager(managerId: string): User[] {
  return usersData.users.filter((user) => user.managerId === managerId) as User[];
}

// ============================================================================
// Transaction Functions
// ============================================================================

export function getTransactions(filters?: TransactionFilters): Transaction[] {
  let transactions = transactionsData.transactions as Transaction[];

  if (filters) {
    if (filters.dateRange) {
      transactions = transactions.filter(
        (t) => t.date >= filters.dateRange!.start && t.date <= filters.dateRange!.end
      );
    }
    if (filters.status && filters.status.length > 0) {
      transactions = transactions.filter((t) => filters.status!.includes(t.status));
    }
    if (filters.region && filters.region.length > 0) {
      transactions = transactions.filter((t) => filters.region!.includes(t.region));
    }
    if (filters.minAmount !== undefined) {
      transactions = transactions.filter((t) => t.amount >= filters.minAmount!);
    }
    if (filters.maxAmount !== undefined) {
      transactions = transactions.filter((t) => t.amount <= filters.maxAmount!);
    }
    if (filters.userId) {
      transactions = transactions.filter((t) => t.userId === filters.userId);
    }
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      transactions = transactions.filter(
        (t) =>
          t.customer.toLowerCase().includes(query) ||
          t.product.toLowerCase().includes(query) ||
          t.id.toLowerCase().includes(query)
      );
    }
  }

  return transactions;
}

export function getTransactionsByUser(userId: string): Transaction[] {
  return transactionsData.transactions.filter((t) => t.userId === userId) as Transaction[];
}

export function getTransactionsByPeriod(period: string): Transaction[] {
  return transactionsData.transactions.filter((t) => t.payPeriod === period) as Transaction[];
}

export function getRecentTransactions(limit: number = 10): Transaction[] {
  return [...(transactionsData.transactions as Transaction[])]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

// ============================================================================
// Performance Functions
// ============================================================================

export function getPerformanceData(userId?: string, period?: string): PerformanceMetric[] {
  let metrics = performanceData.performanceMetrics as PerformanceMetric[];

  if (userId) {
    metrics = metrics.filter((m) => m.userId === userId);
  }
  if (period) {
    metrics = metrics.filter((m) => m.period === period);
  }

  return metrics;
}

export function getPerformanceByUser(userId: string): PerformanceMetric[] {
  return performanceData.performanceMetrics.filter((m) => m.userId === userId) as PerformanceMetric[];
}

export function getQuarterlyAggregates() {
  return performanceData.quarterlyAggregates;
}

export function getRegionalPerformance() {
  return performanceData.regionalPerformance;
}

// ============================================================================
// Compensation Plan Functions
// ============================================================================

export function getRuleSets(): RuleSet[] {
  return compensationPlansData.compensationPlans as RuleSet[];
}

export function getRuleSetById(id: string): RuleSet | undefined {
  return compensationPlansData.compensationPlans.find((p) => p.id === id) as RuleSet | undefined;
}

export function getActivePlans(): RuleSet[] {
  return compensationPlansData.compensationPlans.filter((p) => p.status === 'active') as RuleSet[];
}

// ============================================================================
// Organization Functions
// ============================================================================

export function getOrganizationalUnits(): OrganizationalUnit[] {
  return organizationalData.organizationalUnits as OrganizationalUnit[];
}

export function getOrganizationalHierarchy() {
  return organizationalData.hierarchy;
}

export function getTeams(): OrganizationalUnit[] {
  return organizationalData.organizationalUnits.filter((u) => u.type === 'team') as OrganizationalUnit[];
}

export function getRegions(): OrganizationalUnit[] {
  return organizationalData.organizationalUnits.filter((u) => u.type === 'region') as OrganizationalUnit[];
}

// ============================================================================
// Aggregate Functions
// ============================================================================

export function getTotalCompensation(period?: string): number {
  let transactions = transactionsData.transactions as Transaction[];

  if (period) {
    transactions = transactions.filter((t) => t.payPeriod === period);
  }

  return transactions
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + t.commission, 0);
}

export function getTotalSales(period?: string): number {
  let transactions = transactionsData.transactions as Transaction[];

  if (period) {
    transactions = transactions.filter((t) => t.payPeriod === period);
  }

  return transactions
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);
}

export function getTopPerformers(limit: number = 10, period?: string): LeaderboardEntry[] {
  const metrics = period
    ? performanceData.performanceMetrics.filter((m) => m.period === period)
    : performanceData.performanceMetrics.filter((m) => m.period === '2024-12');

  const sortedMetrics = [...metrics].sort((a, b) => b.sales - a.sales).slice(0, limit);

  return sortedMetrics.map((m, index) => {
    const user = getUserById(m.userId);
    return {
      rank: index + 1,
      userId: m.userId,
      name: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
      avatar: user?.avatarUrl,
      value: m.sales,
      attainment: m.attainment,
      trend: m.attainment >= 100 ? 'up' : m.attainment >= 80 ? 'stable' : 'down',
      trendValue: m.attainment - 100,
    };
  });
}

export function getCompensationByPlanType(): { ruleSetType: string; total: number; count: number }[] {
  const transactions = transactionsData.transactions as Transaction[];
  const users = usersData.users as User[];
  const plans = compensationPlansData.compensationPlans;

  const planTotals: Record<string, { total: number; count: number }> = {};

  transactions.forEach((t) => {
    const user = users.find((u) => u.id === t.userId);
    if (user) {
      const plan = plans.find((p) => p.id === user.compensationPlanId);
      if (plan) {
        if (!planTotals[plan.type]) {
          planTotals[plan.type] = { total: 0, count: 0 };
        }
        planTotals[plan.type].total += t.commission;
        planTotals[plan.type].count += 1;
      }
    }
  });

  return Object.entries(planTotals).map(([ruleSetType, data]) => ({
    ruleSetType,
    total: data.total,
    count: data.count,
  }));
}

export function getMonthlyTrend(months: number = 12): { month: string; actual: number; budget: number }[] {
  const transactions = transactionsData.transactions as Transaction[];
  const monthlyData: Record<string, number> = {};

  transactions.forEach((t) => {
    if (t.status === 'completed') {
      if (!monthlyData[t.payPeriod]) {
        monthlyData[t.payPeriod] = 0;
      }
      monthlyData[t.payPeriod] += t.commission;
    }
  });

  const sortedMonths = Object.keys(monthlyData).sort().slice(-months);
  const budgetPerMonth = 450000; // Example budget

  return sortedMonths.map((month) => ({
    month,
    actual: monthlyData[month],
    budget: budgetPerMonth,
  }));
}

// ============================================================================
// Dashboard Functions
// ============================================================================

export function getDashboardStats(userId?: string): DashboardStats {
  const userTransactions = userId
    ? getTransactionsByUser(userId)
    : transactionsData.transactions as Transaction[];

  const currentYearTransactions = userTransactions.filter(
    (t) => t.date.startsWith('2024') && t.status === 'completed'
  );
  const currentMonthTransactions = userTransactions.filter(
    (t) => t.payPeriod === '2024-12' && t.status === 'completed'
  );

  const ytdCompensation = currentYearTransactions.reduce((sum, t) => sum + t.commission, 0);
  const mtdCompensation = currentMonthTransactions.reduce((sum, t) => sum + t.commission, 0);

  const pendingTransactions = userTransactions.filter(
    (t) => t.status === 'processing' || t.status === 'open'
  );
  const pendingCommissions = pendingTransactions.reduce((sum, t) => sum + t.commission, 0);

  const userPerformance = userId
    ? getPerformanceByUser(userId).find((p) => p.period === '2024-12')
    : performanceData.performanceMetrics.find((p) => p.period === '2024-12');

  return {
    totalCompensationYTD: ytdCompensation,
    totalCompensationMTD: mtdCompensation,
    quotaAttainment: userPerformance?.attainment || 0,
    ranking: userPerformance?.ranking || 0,
    rankingTotal: userPerformance?.rankingTotal || 40,
    pendingCommissions,
    recentTransactions: getRecentTransactions(5),
  };
}

// ============================================================================
// Alert & Notification Functions
// ============================================================================

export function getAlerts(): Alert[] {
  return [
    {
      id: 'ALT-001',
      type: 'budget',
      severity: 'warning',
      title: 'Budget Threshold Alert',
      message: 'West Region has exceeded 90% of Q4 commission budget.',
      timestamp: '2024-12-15T10:30:00Z',
      read: false,
      actionUrl: '/insights/compensation',
    },
    {
      id: 'ALT-002',
      type: 'performance',
      severity: 'info',
      title: 'Top Performer Achievement',
      message: 'Sarah Chen has achieved 150% quota attainment this quarter.',
      timestamp: '2024-12-14T15:45:00Z',
      read: false,
      relatedUserId: 'U001',
    },
    {
      id: 'ALT-003',
      type: 'goal',
      severity: 'success',
      title: 'Team Goal Achieved',
      message: 'West-Enterprise team has hit their Q4 target ahead of schedule.',
      timestamp: '2024-12-13T09:00:00Z',
      read: true,
    },
    {
      id: 'ALT-004',
      type: 'system',
      severity: 'info',
      title: 'Data Sync Complete',
      message: 'Monthly transaction data has been synchronized successfully.',
      timestamp: '2024-12-12T06:00:00Z',
      read: true,
    },
    {
      id: 'ALT-005',
      type: 'performance',
      severity: 'critical',
      title: 'Underperformance Alert',
      message: '5 reps are below 60% quota attainment with 2 weeks remaining.',
      timestamp: '2024-12-11T14:20:00Z',
      read: false,
      actionUrl: '/performance',
    },
  ];
}

// ============================================================================
// Data Operations Functions
// ============================================================================

export function getDataLoads(): DataLoad[] {
  return [
    {
      id: 'DL-001',
      timestamp: '2024-12-15T06:00:00Z',
      source: 'Salesforce CRM',
      recordsProcessed: 1250,
      recordsSuccess: 1248,
      recordsFailed: 2,
      status: 'completed',
      duration: 45,
    },
    {
      id: 'DL-002',
      timestamp: '2024-12-14T06:00:00Z',
      source: 'SAP ERP',
      recordsProcessed: 890,
      recordsSuccess: 890,
      recordsFailed: 0,
      status: 'completed',
      duration: 32,
    },
    {
      id: 'DL-003',
      timestamp: '2024-12-13T06:00:00Z',
      source: 'Excel Upload',
      recordsProcessed: 150,
      recordsSuccess: 145,
      recordsFailed: 5,
      status: 'completed',
      duration: 12,
    },
    {
      id: 'DL-004',
      timestamp: '2024-12-15T08:30:00Z',
      source: 'API Integration',
      recordsProcessed: 500,
      recordsSuccess: 0,
      recordsFailed: 500,
      status: 'failed',
      duration: 5,
      errors: [
        {
          id: 'ERR-001',
          loadId: 'DL-004',
          severity: 'critical',
          message: 'Authentication token expired',
        },
      ],
    },
  ];
}

// ============================================================================
// Goals Functions
// ============================================================================

export function getGoals(userId?: string): Goal[] {
  const goals: Goal[] = [
    {
      id: 'GOAL-001',
      userId: 'U001',
      type: 'individual',
      name: 'Q4 Sales Target',
      description: 'Achieve $600,000 in closed sales for Q4 2024',
      targetValue: 600000,
      currentValue: 520000,
      unit: 'currency',
      startDate: '2024-10-01',
      endDate: '2024-12-31',
      status: 'on_track',
      progress: 86.7,
    },
    {
      id: 'GOAL-002',
      userId: 'U001',
      type: 'individual',
      name: 'New Logo Acquisition',
      description: 'Close 5 new enterprise accounts',
      targetValue: 5,
      currentValue: 4,
      unit: 'count',
      startDate: '2024-10-01',
      endDate: '2024-12-31',
      status: 'on_track',
      progress: 80,
    },
    {
      id: 'GOAL-003',
      userId: 'U001',
      type: 'team',
      name: 'West-Enterprise Team Goal',
      description: 'Team achieves $2M in Q4 revenue',
      targetValue: 2000000,
      currentValue: 1850000,
      unit: 'currency',
      startDate: '2024-10-01',
      endDate: '2024-12-31',
      status: 'on_track',
      progress: 92.5,
    },
    {
      id: 'GOAL-004',
      userId: 'U002',
      type: 'individual',
      name: 'Q4 Sales Target',
      description: 'Achieve $550,000 in closed sales for Q4 2024',
      targetValue: 550000,
      currentValue: 480000,
      unit: 'currency',
      startDate: '2024-10-01',
      endDate: '2024-12-31',
      status: 'at_risk',
      progress: 87.3,
    },
    {
      id: 'GOAL-005',
      userId: 'U003',
      type: 'individual',
      name: 'SMB Growth Target',
      description: 'Increase SMB customer base by 20%',
      targetValue: 20,
      currentValue: 12,
      unit: 'percentage',
      startDate: '2024-10-01',
      endDate: '2024-12-31',
      status: 'behind',
      progress: 60,
    },
  ];

  if (userId) {
    return goals.filter((g) => g.userId === userId);
  }
  return goals;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getPerformanceTierColor(tier: string): string {
  switch (tier) {
    case 'top':
      return 'text-emerald-600 bg-emerald-100';
    case 'high':
      return 'text-blue-600 bg-blue-100';
    case 'medium':
      return 'text-amber-600 bg-amber-100';
    case 'low':
      return 'text-red-600 bg-red-100';
    default:
      return 'text-slate-600 bg-slate-100';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'text-emerald-600 bg-emerald-100';
    case 'open':
    case 'pending':
      return 'text-amber-600 bg-amber-100';
    case 'processing':
      return 'text-blue-600 bg-blue-100';
    case 'cancelled':
    case 'failed':
      return 'text-red-600 bg-red-100';
    default:
      return 'text-slate-600 bg-slate-100';
  }
}
