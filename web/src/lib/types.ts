// ============================================================================
// SPM Platform Type Definitions
// ============================================================================

// User & Organization Types
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'sales_rep' | 'manager' | 'vp' | 'director';
  region: 'North' | 'South' | 'East' | 'West';
  team: string;
  managerId: string | null;
  hireDate: string;
  status: 'active' | 'inactive';
  performanceTier: 'top' | 'high' | 'medium' | 'low';
  compensationPlanId: string;
  avatarUrl?: string;
}

export interface OrganizationalUnit {
  id: string;
  name: string;
  type: 'region' | 'team' | 'department';
  parentId: string | null;
  managerId: string;
  headcount: number;
}

// Compensation Types
export interface CompensationPlan {
  id: string;
  name: string;
  type: 'basic' | 'tiered' | 'accelerator' | 'team_based' | 'executive';
  description: string;
  effectiveDate: string;
  endDate: string | null;
  status: 'active' | 'inactive' | 'draft';
  structure: CommissionStructure;
  eligibleRoles: string[];
  quotaAmount: number;
}

export interface CommissionStructure {
  baseRate?: number;
  tiers?: CommissionTier[];
  acceleratorRate?: number;
  acceleratorThreshold?: number;
  teamPoolPercentage?: number;
  bonusStructure?: BonusStructure;
}

export interface CommissionTier {
  minAmount: number;
  maxAmount: number | null;
  rate: number;
}

export interface BonusStructure {
  type: 'quarterly' | 'annual' | 'milestone';
  amount: number;
  criteria: string;
}

// Transaction Types
export interface Transaction {
  id: string;
  userId: string;
  date: string;
  orderId: string;
  customer: string;
  product: string;
  productCategory: string;
  amount: number;
  quantity: number;
  status: 'completed' | 'open' | 'cancelled' | 'processing';
  commission: number;
  commissionRate: number;
  region: string;
  payPeriod: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  salesRepId: string;
  orderDate: string;
  products: OrderItem[];
  totalAmount: number;
  status: 'completed' | 'open' | 'cancelled' | 'processing';
  region: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// Performance Types
export interface PerformanceMetric {
  id: string;
  userId: string;
  period: string; // YYYY-MM format
  year: number;
  month: number;
  quarter: number;
  sales: number;
  quota: number;
  attainment: number; // percentage
  commissionEarned: number;
  dealsWon: number;
  dealsPipeline: number;
  avgDealSize: number;
  ranking: number;
  rankingTotal: number;
}

export interface Goal {
  id: string;
  userId: string;
  type: 'individual' | 'team';
  name: string;
  description: string;
  targetValue: number;
  currentValue: number;
  unit: 'currency' | 'percentage' | 'count';
  startDate: string;
  endDate: string;
  status: 'on_track' | 'at_risk' | 'behind' | 'achieved';
  progress: number; // percentage
}

// Alert & Notification Types
export interface Alert {
  id: string;
  type: 'budget' | 'performance' | 'goal' | 'system' | 'approval';
  severity: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  relatedUserId?: string;
}

// Data Operations Types
export interface DataLoad {
  id: string;
  timestamp: string;
  source: string;
  recordsProcessed: number;
  recordsSuccess: number;
  recordsFailed: number;
  status: 'completed' | 'failed' | 'in_progress';
  duration: number; // seconds
  errors?: DataError[];
}

export interface DataError {
  id: string;
  loadId: string;
  severity: 'warning' | 'error' | 'critical';
  message: string;
  recordId?: string;
  field?: string;
}

// Dashboard Types
export interface DashboardStats {
  totalCompensationYTD: number;
  totalCompensationMTD: number;
  quotaAttainment: number;
  ranking: number;
  rankingTotal: number;
  pendingCommissions: number;
  recentTransactions: Transaction[];
}

// Filter Types
export interface TransactionFilters {
  dateRange?: { start: string; end: string };
  status?: string[];
  region?: string[];
  minAmount?: number;
  maxAmount?: number;
  userId?: string;
  searchQuery?: string;
}

export interface PerformanceFilters {
  period?: string;
  region?: string;
  team?: string;
  performanceTier?: string[];
}

// Chart Data Types
export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface TimeSeriesData {
  date: string;
  value: number;
  comparativeValue?: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatar?: string;
  value: number;
  attainment: number;
  trend: 'up' | 'down' | 'stable';
  trendValue: number;
}
