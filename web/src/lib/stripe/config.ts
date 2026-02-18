/**
 * Stripe Configuration — Pricing, Tiers, and Module Definitions
 *
 * Central source of truth for all Stripe-related configuration.
 * Price IDs are loaded from environment variables for per-environment flexibility.
 */

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export const STRIPE_CONFIG = {
  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
  secretKey: process.env.STRIPE_SECRET_KEY || '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
} as const;

// ---------------------------------------------------------------------------
// Platform Tiers
// ---------------------------------------------------------------------------

export interface PlatformTier {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;         // USD
  entityLimit: number;          // max compensable entities
  userLimit: number;            // max platform users
  priceId: string;              // Stripe Price ID from env
  features: string[];
  recommended?: boolean;
  contactSales?: boolean;       // true → "Contact Us" instead of checkout
}

export const PLATFORM_TIERS: PlatformTier[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Explore the platform with sample data',
    monthlyPrice: 0,
    entityLimit: 10,
    userLimit: 1,
    priceId: '',
    features: [
      'GPV activation wizard',
      'Single calculation run',
      'Basic dashboard',
    ],
  },
  {
    id: 'inicio',
    name: 'Inicio',
    description: 'For small sales teams getting started',
    monthlyPrice: 299,
    entityLimit: 50,
    userLimit: 5,
    priceId: process.env.STRIPE_PRICE_INICIO || '',
    features: [
      'Up to 50 entities',
      '5 platform users',
      'Monthly calculations',
      'Basic reporting',
      'Email support',
    ],
  },
  {
    id: 'crecimiento',
    name: 'Crecimiento',
    description: 'For growing teams with complex plans',
    monthlyPrice: 999,
    entityLimit: 200,
    userLimit: 20,
    priceId: process.env.STRIPE_PRICE_CRECIMIENTO || '',
    features: [
      'Up to 200 entities',
      '20 platform users',
      'Weekly calculations',
      'Advanced reporting',
      'Manager dashboards',
      'Priority support',
    ],
    recommended: true,
  },
  {
    id: 'profesional',
    name: 'Profesional',
    description: 'For established organizations',
    monthlyPrice: 2999,
    entityLimit: 1000,
    userLimit: 100,
    priceId: process.env.STRIPE_PRICE_PROFESIONAL || '',
    features: [
      'Up to 1,000 entities',
      '100 platform users',
      'Daily calculations',
      'Full analytics suite',
      'Agent intelligence',
      'Coaching module',
      'Dedicated support',
    ],
  },
  {
    id: 'empresarial',
    name: 'Empresarial',
    description: 'For large enterprises',
    monthlyPrice: 7999,
    entityLimit: 10000,
    userLimit: 500,
    priceId: process.env.STRIPE_PRICE_EMPRESARIAL || '',
    features: [
      'Up to 10,000 entities',
      '500 platform users',
      'Real-time calculations',
      'Full platform access',
      'Custom integrations',
      'White-glove onboarding',
      'SLA guarantee',
    ],
    contactSales: true,
  },
  {
    id: 'corporativo',
    name: 'Corporativo',
    description: 'Custom solutions for global organizations',
    monthlyPrice: 0,
    entityLimit: Infinity,
    userLimit: Infinity,
    priceId: '',
    features: [
      'Unlimited entities',
      'Unlimited users',
      'Custom SLA',
      'Dedicated infrastructure',
      'On-premise option',
      'Custom development',
    ],
    contactSales: true,
  },
];

// ---------------------------------------------------------------------------
// Add-On Modules
// ---------------------------------------------------------------------------

export interface ModulePrice {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;         // USD per month
  priceId: string;              // Stripe Price ID from env
  requiredTier?: string;        // minimum tier to purchase
}

export const MODULE_PRICES: ModulePrice[] = [
  {
    id: 'icm',
    name: 'Compensation (ICM)',
    description: 'Incentive compensation management — calculation engine, plan design, approvals',
    monthlyPrice: 0,
    priceId: '',
    requiredTier: 'inicio',
  },
  {
    id: 'financial',
    name: 'Financial Intelligence (TFI)',
    description: 'Revenue analytics, leakage detection, location benchmarking',
    monthlyPrice: 499,
    priceId: process.env.STRIPE_PRICE_MODULE_FINANCIAL || '',
    requiredTier: 'crecimiento',
  },
  {
    id: 'projection',
    name: 'Projection Engine',
    description: 'What-if scenarios, quota modeling, commission forecasting',
    monthlyPrice: 399,
    priceId: process.env.STRIPE_PRICE_MODULE_PROJECTION || '',
    requiredTier: 'crecimiento',
  },
  {
    id: 'manager',
    name: 'Manager Acceleration',
    description: 'Team coaching insights, performance acceleration, 1:1 preparation',
    monthlyPrice: 299,
    priceId: process.env.STRIPE_PRICE_MODULE_MANAGER || '',
    requiredTier: 'profesional',
  },
  {
    id: 'dispute',
    name: 'Dispute Resolution',
    description: 'Structured dispute workflow, pre-screening, audit trail',
    monthlyPrice: 199,
    priceId: process.env.STRIPE_PRICE_MODULE_DISPUTE || '',
    requiredTier: 'profesional',
  },
  {
    id: 'compliance',
    name: 'Compliance Suite',
    description: 'SOD validation, audit trails, regulatory reporting',
    monthlyPrice: 599,
    priceId: process.env.STRIPE_PRICE_MODULE_COMPLIANCE || '',
    requiredTier: 'empresarial',
  },
];

// ---------------------------------------------------------------------------
// Bundle Discounts
// ---------------------------------------------------------------------------

export const BUNDLE_DISCOUNTS: Record<number, number> = {
  2: 0.10,  // 10% off when 2 modules
  3: 0.15,  // 15% off when 3 modules
  4: 0.20,  // 20% off when 4+ modules
  5: 0.20,
  6: 0.25,
};

export function getBundleDiscount(moduleCount: number): number {
  if (moduleCount >= 6) return BUNDLE_DISCOUNTS[6];
  return BUNDLE_DISCOUNTS[moduleCount] || 0;
}

// ---------------------------------------------------------------------------
// Experience Tiers (support levels)
// ---------------------------------------------------------------------------

export interface ExperienceTier {
  id: string;
  name: string;
  multiplier: number;   // applied to base subscription
  features: string[];
}

export const EXPERIENCE_TIERS: ExperienceTier[] = [
  {
    id: 'standard',
    name: 'Standard',
    multiplier: 1.0,
    features: ['Email support', '48h response time', 'Knowledge base access'],
  },
  {
    id: 'priority',
    name: 'Priority',
    multiplier: 1.15,
    features: ['Priority email', '24h response time', 'Quarterly reviews', 'Slack channel'],
  },
  {
    id: 'premium',
    name: 'Premium',
    multiplier: 1.30,
    features: ['Dedicated CSM', '4h response time', 'Monthly reviews', 'Phone support', 'Custom training'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getTier(tierId: string): PlatformTier | undefined {
  return PLATFORM_TIERS.find(t => t.id === tierId);
}

export function getModule(moduleId: string): ModulePrice | undefined {
  return MODULE_PRICES.find(m => m.id === moduleId);
}

export function getModulePriceId(moduleId: string): string {
  return MODULE_PRICES.find(m => m.id === moduleId)?.priceId || '';
}

/**
 * Auto-recommend a tier based on entity count
 */
export function recommendTier(entityCount: number): string {
  if (entityCount <= 10) return 'free';
  if (entityCount <= 50) return 'inicio';
  if (entityCount <= 200) return 'crecimiento';
  if (entityCount <= 1000) return 'profesional';
  return 'empresarial';
}

/**
 * Calculate monthly total for a subscription
 */
export function calculateMonthlyTotal(
  tierId: string,
  moduleIds: string[],
  experienceTierId: string = 'standard',
): number {
  const tier = getTier(tierId);
  if (!tier) return 0;

  const basePrice = tier.monthlyPrice;

  // Module prices with bundle discount
  const moduleTotal = moduleIds.reduce((sum, id) => {
    const mod = getModule(id);
    return sum + (mod?.monthlyPrice || 0);
  }, 0);
  const discount = getBundleDiscount(moduleIds.length);
  const discountedModules = moduleTotal * (1 - discount);

  // Experience multiplier
  const experience = EXPERIENCE_TIERS.find(e => e.id === experienceTierId);
  const multiplier = experience?.multiplier || 1.0;

  return Math.round((basePrice + discountedModules) * multiplier);
}
