/**
 * Multi-Tenant Types - ViaLuce SPM Platform
 */

// Tenant Configuration
export interface TenantConfig {
  id: string;
  name: string;
  displayName: string;
  industry: TenantIndustry;
  country: string;
  currency: Currency;
  locale: Locale;
  timezone: string;
  logo?: string;
  primaryColor?: string;
  features: TenantFeatures;
  terminology: TenantTerminology;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'inactive' | 'suspended';
}

export type TenantIndustry = 'Technology' | 'Hospitality' | 'Retail' | 'Finance' | 'Healthcare' | 'Manufacturing' | 'Other';
export type Currency = 'USD' | 'MXN' | 'EUR' | 'GBP' | 'CAD';
export type Locale = 'en-US' | 'es-MX' | 'en-GB' | 'fr-FR';

export interface TenantFeatures {
  compensation: boolean;
  performance: boolean;
  salesFinance: boolean;
  transactions: boolean;
  forecasting: boolean;
  gamification: boolean;
  learning: boolean;
  coaching: boolean;
  whatsappIntegration: boolean;
  mobileApp: boolean;
  apiAccess: boolean;
  financial: boolean; // Financial Module - POS data analysis for restaurants
  /** Lifecycle pipeline config: 'launch' (simplified) or 'production' (full) */
  lifecyclePipeline?: string;
}

export const DEFAULT_FEATURES: TenantFeatures = {
  compensation: true,
  performance: true,
  salesFinance: false,
  transactions: true,
  forecasting: false,
  gamification: false,
  learning: false,
  coaching: false,
  whatsappIntegration: false,
  mobileApp: false,
  apiAccess: false,
  financial: false, // Disabled by default, enabled per tenant
};

export interface TenantTerminology {
  salesRep: string;
  salesRepPlural: string;
  manager: string;
  managerPlural: string;
  region: string;
  regionPlural: string;
  location: string;
  locationPlural: string;
  team: string;
  teamPlural: string;
  transaction: string;
  transactionPlural: string;
  order: string;
  orderPlural: string;
  commission: string;
  commissionPlural: string;
  bonus: string;
  bonusPlural: string;
  incentive: string;
  incentivePlural: string;
  period: string;
  periodPlural: string;
  shift: string;
  shiftPlural: string;
}

export const DEFAULT_TERMINOLOGY: TenantTerminology = {
  salesRep: 'Sales Rep',
  salesRepPlural: 'Sales Reps',
  manager: 'Manager',
  managerPlural: 'Managers',
  region: 'Region',
  regionPlural: 'Regions',
  location: 'Location',
  locationPlural: 'Locations',
  team: 'Team',
  teamPlural: 'Teams',
  transaction: 'Transaction',
  transactionPlural: 'Transactions',
  order: 'Order',
  orderPlural: 'Orders',
  commission: 'Commission',
  commissionPlural: 'Commissions',
  bonus: 'Bonus',
  bonusPlural: 'Bonuses',
  incentive: 'Incentive',
  incentivePlural: 'Incentives',
  period: 'Period',
  periodPlural: 'Periods',
  shift: 'Shift',
  shiftPlural: 'Shifts',
};

// User Types
export type UserRole = 'vl_admin' | 'admin' | 'manager' | 'sales_rep';

export interface TenantSummary {
  id: string;
  displayName: string;
  industry: TenantIndustry;
  country: string;
  status: 'active' | 'inactive' | 'suspended';
  userCount: number;
  lastActivityAt?: string;
}

export interface TenantRegistry {
  tenants: TenantSummary[];
  defaultTenantId?: string;
  lastUpdated: string;
}

// Helper Functions
export function formatTenantCurrency(amount: number, currency: Currency, locale: Locale): string {
  // OB-101 PDR-01: No cents on amounts >= 1,000 (cleaner display for large financial amounts)
  const fractionDigits = Math.abs(amount) >= 1000 ? 0 : 2;
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
  // Distinguish MXN from USD — both use $ in native locales.
  // Replace bare $ with MX$ for MXN to avoid ambiguity.
  if (currency === 'MXN' && !formatted.includes('MX')) {
    return formatted.replace('$', 'MX$');
  }
  return formatted;
}

export function formatTenantDate(date: string | Date, locale: Locale): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}
