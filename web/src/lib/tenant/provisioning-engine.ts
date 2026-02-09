/**
 * Tenant Provisioning Engine
 *
 * Handles dynamic tenant creation, configuration templates, and lifecycle management.
 * Replaces static JSON-file-based tenant loading with runtime provisioning.
 */

import type {
  TenantConfig,
  TenantFeatures,
  TenantTerminology,
  TenantIndustry,
  TenantSummary,
  Currency,
  Locale,
} from '@/types/tenant';
import { DEFAULT_FEATURES, DEFAULT_TERMINOLOGY } from '@/types/tenant';

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEYS = {
  TENANTS: 'clearcomp_tenants',
  TENANT_DATA_PREFIX: 'clearcomp_tenant_data_',
  TENANT_REGISTRY: 'clearcomp_tenant_registry',
} as const;

// ============================================
// INDUSTRY TEMPLATES
// ============================================

export interface IndustryTemplate {
  industry: TenantIndustry;
  name: string;
  description: string;
  defaultFeatures: Partial<TenantFeatures>;
  defaultTerminology: Partial<TenantTerminology>;
  samplePlans: string[];
  defaultCurrency: Currency;
  defaultLocale: Locale;
  defaultTimezone: string;
}

const INDUSTRY_TEMPLATES: Record<TenantIndustry, IndustryTemplate> = {
  Technology: {
    industry: 'Technology',
    name: 'Technology / SaaS',
    description: 'Software, SaaS, and technology companies with complex commission structures',
    defaultFeatures: {
      compensation: true,
      performance: true,
      forecasting: true,
      apiAccess: true,
      transactions: true,
    },
    defaultTerminology: {
      salesRep: 'Account Executive',
      salesRepPlural: 'Account Executives',
      transaction: 'Deal',
      transactionPlural: 'Deals',
      order: 'Opportunity',
      orderPlural: 'Opportunities',
    },
    samplePlans: ['ae_standard', 'sdr_pipeline', 'csm_retention'],
    defaultCurrency: 'USD',
    defaultLocale: 'en-US',
    defaultTimezone: 'America/Los_Angeles',
  },

  Retail: {
    industry: 'Retail',
    name: 'Retail',
    description: 'Retail stores with product-based commissions and SPIFFs',
    defaultFeatures: {
      compensation: true,
      performance: true,
      gamification: true,
      transactions: true,
      mobileApp: true,
    },
    defaultTerminology: {
      salesRep: 'Sales Associate',
      salesRepPlural: 'Sales Associates',
      location: 'Store',
      locationPlural: 'Stores',
      transaction: 'Sale',
      transactionPlural: 'Sales',
      shift: 'Shift',
      shiftPlural: 'Shifts',
    },
    samplePlans: ['store_commission', 'product_spiff', 'manager_override'],
    defaultCurrency: 'USD',
    defaultLocale: 'en-US',
    defaultTimezone: 'America/New_York',
  },

  Hospitality: {
    industry: 'Hospitality',
    name: 'Hospitality / Restaurant',
    description: 'Restaurants, hotels, and hospitality with tips and daily incentives',
    defaultFeatures: {
      compensation: true,
      performance: true,
      gamification: true,
      transactions: true,
      whatsappIntegration: true,
      mobileApp: true,
    },
    defaultTerminology: {
      salesRep: 'Server',
      salesRepPlural: 'Servers',
      manager: 'Shift Manager',
      managerPlural: 'Shift Managers',
      location: 'Restaurant',
      locationPlural: 'Restaurants',
      transaction: 'Check',
      transactionPlural: 'Checks',
      commission: 'Tip',
      commissionPlural: 'Tips',
    },
    samplePlans: ['server_tips', 'upsell_bonus', 'shift_incentive'],
    defaultCurrency: 'MXN',
    defaultLocale: 'es-MX',
    defaultTimezone: 'America/Mexico_City',
  },

  Finance: {
    industry: 'Finance',
    name: 'Financial Services',
    description: 'Banks, insurance, and financial services with regulatory compliance',
    defaultFeatures: {
      compensation: true,
      performance: true,
      salesFinance: true,
      transactions: true,
      apiAccess: true,
    },
    defaultTerminology: {
      salesRep: 'Financial Advisor',
      salesRepPlural: 'Financial Advisors',
      transaction: 'Policy',
      transactionPlural: 'Policies',
      order: 'Application',
      orderPlural: 'Applications',
    },
    samplePlans: ['advisor_commission', 'aum_bonus', 'retention_incentive'],
    defaultCurrency: 'USD',
    defaultLocale: 'en-US',
    defaultTimezone: 'America/New_York',
  },

  Healthcare: {
    industry: 'Healthcare',
    name: 'Healthcare / Medical',
    description: 'Medical device sales, pharma reps, and healthcare services',
    defaultFeatures: {
      compensation: true,
      performance: true,
      transactions: true,
      learning: true,
    },
    defaultTerminology: {
      salesRep: 'Territory Rep',
      salesRepPlural: 'Territory Reps',
      region: 'Territory',
      regionPlural: 'Territories',
      transaction: 'Order',
      transactionPlural: 'Orders',
    },
    samplePlans: ['territory_quota', 'product_launch_spiff', 'growth_accelerator'],
    defaultCurrency: 'USD',
    defaultLocale: 'en-US',
    defaultTimezone: 'America/Chicago',
  },

  Manufacturing: {
    industry: 'Manufacturing',
    name: 'Manufacturing / Industrial',
    description: 'Industrial sales with long cycles and channel partners',
    defaultFeatures: {
      compensation: true,
      performance: true,
      salesFinance: true,
      transactions: true,
    },
    defaultTerminology: {
      salesRep: 'Sales Engineer',
      salesRepPlural: 'Sales Engineers',
      region: 'Territory',
      regionPlural: 'Territories',
      transaction: 'Quote',
      transactionPlural: 'Quotes',
      order: 'Purchase Order',
      orderPlural: 'Purchase Orders',
    },
    samplePlans: ['engineer_commission', 'channel_partner', 'project_bonus'],
    defaultCurrency: 'USD',
    defaultLocale: 'en-US',
    defaultTimezone: 'America/Chicago',
  },

  Other: {
    industry: 'Other',
    name: 'Other / Custom',
    description: 'Custom configuration for other industries',
    defaultFeatures: {
      compensation: true,
      performance: true,
      transactions: true,
    },
    defaultTerminology: {},
    samplePlans: ['standard_commission'],
    defaultCurrency: 'USD',
    defaultLocale: 'en-US',
    defaultTimezone: 'America/New_York',
  },
};

// ============================================
// PROVISIONING REQUEST
// ============================================

export interface TenantProvisioningRequest {
  // Required fields
  name: string;
  displayName: string;
  industry: TenantIndustry;
  country: string;
  adminEmail: string;
  adminName?: string; // Optional admin name, falls back to email prefix

  // Optional overrides
  currency?: Currency;
  locale?: Locale;
  timezone?: string;
  features?: Partial<TenantFeatures>;
  terminology?: Partial<TenantTerminology>;
  primaryColor?: string;
  logo?: string;
}

export interface ProvisioningResult {
  success: boolean;
  tenant?: TenantConfig;
  tenantId?: string;
  error?: string;
  warnings: string[];
}

// ============================================
// TENANT PROVISIONING ENGINE
// ============================================

export class TenantProvisioningEngine {
  private tenants: Map<string, TenantConfig> = new Map();
  private initialized: boolean = false;

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Load tenants from localStorage
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STORAGE_KEYS.TENANTS);
      if (stored) {
        const tenantArray: TenantConfig[] = JSON.parse(stored);
        for (const tenant of tenantArray) {
          this.tenants.set(tenant.id, tenant);
        }
      }
      this.initialized = true;
    } catch (error) {
      console.error('Failed to load tenants from storage:', error);
    }
  }

  /**
   * Save tenants to localStorage
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const tenantArray = Array.from(this.tenants.values());
      localStorage.setItem(STORAGE_KEYS.TENANTS, JSON.stringify(tenantArray));
      this.updateRegistry();
    } catch (error) {
      console.error('Failed to save tenants to storage:', error);
    }
  }

  /**
   * Update the tenant registry summary
   */
  private updateRegistry(): void {
    if (typeof window === 'undefined') return;

    const summaries: TenantSummary[] = Array.from(this.tenants.values()).map((t) => ({
      id: t.id,
      displayName: t.displayName,
      industry: t.industry,
      country: t.country,
      status: t.status,
      userCount: this.getTenantUserCount(t.id),
      lastActivityAt: t.updatedAt,
    }));

    localStorage.setItem(
      STORAGE_KEYS.TENANT_REGISTRY,
      JSON.stringify({
        tenants: summaries,
        lastUpdated: new Date().toISOString(),
      })
    );
  }

  /**
   * Get user count for a tenant (from tenant-specific data)
   */
  private getTenantUserCount(tenantId: string): number {
    if (typeof window === 'undefined') return 0;

    try {
      const userData = localStorage.getItem(`${STORAGE_KEYS.TENANT_DATA_PREFIX}${tenantId}_users`);
      if (userData) {
        const users = JSON.parse(userData);
        return Array.isArray(users) ? users.length : 0;
      }
    } catch {
      // Ignore parsing errors
    }
    return 0;
  }

  /**
   * Generate a unique tenant ID from name
   */
  private generateTenantId(name: string): string {
    const baseId = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 20);

    // Ensure uniqueness
    let id = baseId;
    let counter = 1;
    while (this.tenants.has(id)) {
      id = `${baseId}_${counter}`;
      counter++;
    }

    return id;
  }

  /**
   * Get industry template
   */
  getIndustryTemplate(industry: TenantIndustry): IndustryTemplate {
    return INDUSTRY_TEMPLATES[industry];
  }

  /**
   * Get all available industry templates
   */
  getAllIndustryTemplates(): IndustryTemplate[] {
    return Object.values(INDUSTRY_TEMPLATES);
  }

  /**
   * Provision a new tenant
   */
  provisionTenant(request: TenantProvisioningRequest): ProvisioningResult {
    const warnings: string[] = [];

    // Validate required fields
    if (!request.name || request.name.trim().length < 2) {
      return {
        success: false,
        error: 'Tenant name must be at least 2 characters',
        warnings,
      };
    }

    if (!request.displayName || request.displayName.trim().length < 2) {
      return {
        success: false,
        error: 'Display name must be at least 2 characters',
        warnings,
      };
    }

    if (!request.adminEmail || !request.adminEmail.includes('@')) {
      return {
        success: false,
        error: 'Valid admin email is required',
        warnings,
      };
    }

    // Get industry template
    const template = this.getIndustryTemplate(request.industry);

    // Generate tenant ID
    const tenantId = this.generateTenantId(request.name);

    // Merge features with template defaults
    const features: TenantFeatures = {
      ...DEFAULT_FEATURES,
      ...template.defaultFeatures,
      ...request.features,
    };

    // Merge terminology with template defaults
    const terminology: TenantTerminology = {
      ...DEFAULT_TERMINOLOGY,
      ...template.defaultTerminology,
      ...request.terminology,
    };

    // Create tenant config
    const now = new Date().toISOString();
    const tenant: TenantConfig = {
      id: tenantId,
      name: request.name.trim(),
      displayName: request.displayName.trim(),
      industry: request.industry,
      country: request.country,
      currency: request.currency || template.defaultCurrency,
      locale: request.locale || template.defaultLocale,
      timezone: request.timezone || template.defaultTimezone,
      features,
      terminology,
      primaryColor: request.primaryColor,
      logo: request.logo,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // Store tenant
    this.tenants.set(tenantId, tenant);
    this.saveToStorage();

    // Initialize tenant data isolation
    this.initializeTenantDataStore(tenantId, request.adminEmail, request.adminName);

    // Check for common issues
    if (!features.compensation) {
      warnings.push('Compensation feature is disabled - core functionality will be limited');
    }

    if (request.country === 'MX' && request.currency !== 'MXN') {
      warnings.push('Mexico-based tenant using non-MXN currency');
    }

    return {
      success: true,
      tenant,
      tenantId,
      warnings,
    };
  }

  /**
   * Initialize isolated data store for tenant
   */
  private initializeTenantDataStore(tenantId: string, adminEmail: string, adminName?: string): void {
    if (typeof window === 'undefined') return;

    const prefix = `${STORAGE_KEYS.TENANT_DATA_PREFIX}${tenantId}_`;

    // Initialize empty data stores
    const initialStores = {
      users: [
        {
          id: `${tenantId}_admin_1`,
          email: adminEmail,
          name: adminName || adminEmail.split('@')[0], // Use provided name or fallback to email prefix
          role: 'admin',
          status: 'active',
          createdAt: new Date().toISOString(),
        },
      ],
      plans: [],
      periods: [],
      transactions: [],
      calculations: [],
      employees: [],
    };

    for (const [key, value] of Object.entries(initialStores)) {
      localStorage.setItem(`${prefix}${key}`, JSON.stringify(value));
    }
  }

  /**
   * Get tenant by ID
   */
  getTenant(tenantId: string): TenantConfig | undefined {
    return this.tenants.get(tenantId);
  }

  /**
   * Get all tenants
   */
  getAllTenants(): TenantConfig[] {
    return Array.from(this.tenants.values());
  }

  /**
   * Get active tenants
   */
  getActiveTenants(): TenantConfig[] {
    return Array.from(this.tenants.values()).filter((t) => t.status === 'active');
  }

  /**
   * Update tenant configuration
   */
  updateTenant(
    tenantId: string,
    updates: Partial<Omit<TenantConfig, 'id' | 'createdAt'>>
  ): TenantConfig | undefined {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return undefined;

    const updated: TenantConfig = {
      ...tenant,
      ...updates,
      id: tenant.id, // Preserve ID
      createdAt: tenant.createdAt, // Preserve creation date
      updatedAt: new Date().toISOString(),
    };

    this.tenants.set(tenantId, updated);
    this.saveToStorage();

    return updated;
  }

  /**
   * Suspend a tenant
   */
  suspendTenant(tenantId: string, reason?: string): boolean {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;

    this.updateTenant(tenantId, { status: 'suspended' });

    // Log suspension
    if (typeof window !== 'undefined') {
      const auditKey = `${STORAGE_KEYS.TENANT_DATA_PREFIX}${tenantId}_audit`;
      const audit = JSON.parse(localStorage.getItem(auditKey) || '[]');
      audit.push({
        action: 'tenant_suspended',
        reason,
        timestamp: new Date().toISOString(),
      });
      localStorage.setItem(auditKey, JSON.stringify(audit));
    }

    return true;
  }

  /**
   * Reactivate a suspended tenant
   */
  reactivateTenant(tenantId: string): boolean {
    const tenant = this.tenants.get(tenantId);
    if (!tenant || tenant.status !== 'suspended') return false;

    this.updateTenant(tenantId, { status: 'active' });
    return true;
  }

  /**
   * Delete tenant and all associated data (DESTRUCTIVE)
   */
  deleteTenant(tenantId: string, confirmPhrase: string, deletedBy?: string): boolean {
    if (confirmPhrase !== `DELETE_${tenantId.toUpperCase()}`) {
      console.error('Deletion confirmation phrase does not match');
      return false;
    }

    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;

    // Log deletion to global audit log BEFORE removing data
    if (typeof window !== 'undefined') {
      const globalAuditKey = 'clearcomp_deletion_audit_log';
      const auditLog = JSON.parse(localStorage.getItem(globalAuditKey) || '[]');
      auditLog.push({
        action: 'tenant_deleted',
        tenantId,
        tenantName: tenant.name,
        tenantDisplayName: tenant.displayName,
        tenantIndustry: tenant.industry,
        tenantCountry: tenant.country,
        deletedBy: deletedBy || 'unknown',
        deletedAt: new Date().toISOString(),
        tenantCreatedAt: tenant.createdAt,
        tenantLastUpdated: tenant.updatedAt,
      });
      localStorage.setItem(globalAuditKey, JSON.stringify(auditLog));
      console.log(`[Audit] Tenant deletion logged: ${tenantId} (${tenant.displayName})`);
    }

    // Remove from memory
    this.tenants.delete(tenantId);

    // Remove from storage
    if (typeof window !== 'undefined') {
      // Remove all tenant-specific data
      const prefix = `${STORAGE_KEYS.TENANT_DATA_PREFIX}${tenantId}_`;
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    }

    this.saveToStorage();
    return true;
  }

  /**
   * Clone tenant configuration (for creating similar tenants)
   */
  cloneTenantConfig(
    sourceTenantId: string,
    newName: string,
    newDisplayName: string
  ): TenantProvisioningRequest | undefined {
    const source = this.tenants.get(sourceTenantId);
    if (!source) return undefined;

    return {
      name: newName,
      displayName: newDisplayName,
      industry: source.industry,
      country: source.country,
      adminEmail: '', // Must be provided
      currency: source.currency,
      locale: source.locale,
      timezone: source.timezone,
      features: { ...source.features },
      terminology: { ...source.terminology },
      primaryColor: source.primaryColor,
    };
  }

  /**
   * Validate tenant data isolation
   */
  validateDataIsolation(tenantId: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (typeof window === 'undefined') {
      return { valid: true, issues: [] };
    }

    const prefix = `${STORAGE_KEYS.TENANT_DATA_PREFIX}${tenantId}_`;

    // Check required data stores exist
    const requiredStores = ['users', 'plans', 'periods', 'transactions'];
    for (const store of requiredStores) {
      const key = `${prefix}${store}`;
      if (!localStorage.getItem(key)) {
        issues.push(`Missing data store: ${store}`);
      }
    }

    // Check for cross-tenant data leakage
    const tenantData = localStorage.getItem(`${prefix}transactions`);
    if (tenantData) {
      try {
        const transactions = JSON.parse(tenantData);
        for (const tx of transactions) {
          if (tx.tenantId && tx.tenantId !== tenantId) {
            issues.push(`Cross-tenant data detected in transactions: ${tx.id}`);
          }
        }
      } catch {
        issues.push('Failed to parse transaction data');
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get tenant data store
   */
  getTenantData<T>(tenantId: string, store: string): T | null {
    if (typeof window === 'undefined') return null;

    const key = `${STORAGE_KEYS.TENANT_DATA_PREFIX}${tenantId}_${store}`;
    const data = localStorage.getItem(key);

    if (!data) return null;

    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set tenant data store
   */
  setTenantData<T>(tenantId: string, store: string, data: T): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const key = `${STORAGE_KEYS.TENANT_DATA_PREFIX}${tenantId}_${store}`;
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Append to tenant data array
   */
  appendTenantData<T>(tenantId: string, store: string, item: T): boolean {
    const existing = this.getTenantData<T[]>(tenantId, store) || [];
    existing.push(item);
    return this.setTenantData(tenantId, store, existing);
  }

  /**
   * Export tenant configuration (for backup/migration)
   */
  exportTenantConfig(tenantId: string): string | null {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return null;

    const exportData = {
      tenant,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import tenant configuration
   */
  importTenantConfig(configJson: string): ProvisioningResult {
    try {
      const importData = JSON.parse(configJson);

      if (!importData.tenant || !importData.tenant.id) {
        return {
          success: false,
          error: 'Invalid tenant configuration format',
          warnings: [],
        };
      }

      const tenant = importData.tenant as TenantConfig;

      // Check for ID collision
      if (this.tenants.has(tenant.id)) {
        return {
          success: false,
          error: `Tenant ID already exists: ${tenant.id}`,
          warnings: [],
        };
      }

      // Update timestamps
      tenant.updatedAt = new Date().toISOString();

      this.tenants.set(tenant.id, tenant);
      this.saveToStorage();

      return {
        success: true,
        tenant,
        tenantId: tenant.id,
        warnings: ['Imported tenant - data stores not initialized'],
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse configuration: ${error}`,
        warnings: [],
      };
    }
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let engineInstance: TenantProvisioningEngine | null = null;

export function getTenantProvisioningEngine(): TenantProvisioningEngine {
  if (!engineInstance) {
    engineInstance = new TenantProvisioningEngine();
  }
  return engineInstance;
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

export function provisionTenant(request: TenantProvisioningRequest): ProvisioningResult {
  return getTenantProvisioningEngine().provisionTenant(request);
}

export function getTenant(tenantId: string): TenantConfig | undefined {
  return getTenantProvisioningEngine().getTenant(tenantId);
}

export function getAllTenants(): TenantConfig[] {
  return getTenantProvisioningEngine().getAllTenants();
}

export function getIndustryTemplates(): IndustryTemplate[] {
  return getTenantProvisioningEngine().getAllIndustryTemplates();
}
