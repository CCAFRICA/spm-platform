// Default to TechCorp tenant data for backwards compatibility
import customersData from '@/data/tenants/techcorp/customers.json';
import productsData from '@/data/tenants/techcorp/products.json';
import transactionDetailsData from '@/data/tenants/techcorp/transactions.json';
import financialSummariesData from '@/data/tenants/techcorp/financial-summaries.json';
import importHistoryData from '@/data/tenants/techcorp/import-history.json';

// Types
export interface Customer {
  id: string;
  name: string;
  industry: string;
  region: string;
  tier: 'Enterprise' | 'Mid-Market' | 'SMB';
  contactName: string;
  contactEmail: string;
  createdAt: string;
  status: 'active' | 'inactive';
}

export interface Product {
  id: string;
  name: string;
  category: string;
  type: 'Subscription' | 'One-time';
  basePrice: number;
  commissionRate: number;
  status: 'active' | 'inactive';
  description: string;
}

export interface TransactionDetail {
  transactionId: string;
  customerId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  paymentMethod: string;
  paymentStatus: 'paid' | 'pending' | 'overdue' | 'refunded';
  invoiceNumber: string;
  notes: string;
}

export interface Transaction {
  id: string;
  orderId: string;
  date: string;
  customerName: string;
  customerId: string;
  productName: string;
  productId: string;
  salesRepName: string;
  salesRepId: string;
  amount: number;
  commissionAmount: number;
  status: 'completed' | 'pending' | 'cancelled';
  region: string;
  details?: TransactionDetail;
}

export interface ImportJob {
  id: string;
  fileName: string;
  fileSize: number;
  importedAt: string;
  importedBy: string;
  status: 'completed' | 'failed' | 'processing';
  totalRows: number;
  successRows: number;
  errorRows: number;
  warningRows: number;
  source: string;
  dataType: string;
  duration: number;
  errors: { row: number; field: string; message: string }[];
}

export interface RevenueByPeriod {
  period: string;
  revenue: number;
  deals: number;
  avgDealSize: number;
}

export interface RevenueBySalesRep {
  repId: string;
  name: string;
  region: string;
  revenue: number;
  deals: number;
  quota: number;
  attainment: number;
}

export interface RevenueByProduct {
  productId: string;
  name: string;
  revenue: number;
  deals: number;
  percentage: number;
}

export interface RevenueByRegion {
  region: string;
  revenue: number;
  target: number;
  attainment: number;
  repCount: number;
  deals: number;
}

export interface CommissionExpense {
  period: string;
  revenue: number;
  commission: number;
  rate: number;
  budget: number;
}

// Data access functions
export function getCustomers(): Customer[] {
  return customersData as Customer[];
}

export function getCustomerById(id: string): Customer | undefined {
  return (customersData as Customer[]).find((c) => c.id === id);
}

export function getProducts(): Product[] {
  return productsData as Product[];
}

export function getProductById(id: string): Product | undefined {
  return (productsData as Product[]).find((p) => p.id === id);
}

export function getTransactionDetails(): TransactionDetail[] {
  return transactionDetailsData as TransactionDetail[];
}

export function getTransactionDetailById(transactionId: string): TransactionDetail | undefined {
  return (transactionDetailsData as TransactionDetail[]).find(
    (td) => td.transactionId === transactionId
  );
}

export function getImportHistory(): ImportJob[] {
  return importHistoryData as ImportJob[];
}

// Financial summaries
export function getRevenueByPeriod(type: 'monthly' | 'quarterly' = 'monthly'): RevenueByPeriod[] {
  const summaries = financialSummariesData as typeof financialSummariesData;
  return type === 'monthly'
    ? summaries.revenueByPeriod.monthly
    : summaries.revenueByPeriod.quarterly.map(q => ({
        period: q.period,
        revenue: q.revenue,
        deals: 0,
        avgDealSize: 0,
        target: q.target,
        attainment: q.attainment
      }));
}

export function getRevenueBySalesRep(): RevenueBySalesRep[] {
  return (financialSummariesData as typeof financialSummariesData).revenueBySalesRep;
}

export function getRevenueByProduct(): RevenueByProduct[] {
  return (financialSummariesData as typeof financialSummariesData).revenueByProduct;
}

export function getRevenueByRegion(): RevenueByRegion[] {
  return (financialSummariesData as typeof financialSummariesData).revenueByRegion;
}

export function getCommissionExpense(): CommissionExpense[] {
  return (financialSummariesData as typeof financialSummariesData).commissionExpense.monthly;
}

export function getCommissionSummary() {
  return (financialSummariesData as typeof financialSummariesData).commissionExpense.summary;
}

export function getYearOverYear() {
  return (financialSummariesData as typeof financialSummariesData).revenueByPeriod.yearOverYear;
}

// Aggregate calculations
export function calculateTotalRevenue(): number {
  const monthly = getRevenueByPeriod('monthly');
  return monthly.reduce((sum, m) => sum + m.revenue, 0);
}

export function calculateTotalDeals(): number {
  const monthly = getRevenueByPeriod('monthly');
  return monthly.reduce((sum, m) => sum + m.deals, 0);
}

export function calculateAverageCommissionRate(): number {
  const expense = getCommissionExpense();
  const totalRate = expense.reduce((sum, e) => sum + e.rate, 0);
  return totalRate / expense.length;
}

// Format helpers
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
