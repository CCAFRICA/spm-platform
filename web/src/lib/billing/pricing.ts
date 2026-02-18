/**
 * Commercial pricing engine for tenant onboarding
 * OB-57: Tier-based pricing with module fees and bundle discounts
 */

export type TenantTier = 'inicio' | 'crecimiento' | 'profesional' | 'empresarial' | 'corporativo';
export type ExperienceTier = 'self_service' | 'guided' | 'strategic';
export type ModuleKey = 'icm' | 'tfi';

export const TIER_LABELS: Record<TenantTier, string> = {
  inicio: 'Inicio',
  crecimiento: 'Crecimiento',
  profesional: 'Profesional',
  empresarial: 'Empresarial',
  corporativo: 'Corporativo',
};

export const TIER_ENTITY_LIMITS: Record<TenantTier, string> = {
  inicio: 'Up to 50',
  crecimiento: '50 – 500',
  profesional: '500 – 5,000',
  empresarial: '5,000 – 50,000',
  corporativo: '50,000+',
};

export const PLATFORM_FEES: Record<TenantTier, number> = {
  inicio: 299,
  crecimiento: 999,
  profesional: 2999,
  empresarial: 7999,
  corporativo: 14999,
};

export const MODULE_FEES: Record<ModuleKey, Record<TenantTier, number>> = {
  icm: { inicio: 199, crecimiento: 499, profesional: 1499, empresarial: 3999, corporativo: 7999 },
  tfi: { inicio: 199, crecimiento: 499, profesional: 1499, empresarial: 3999, corporativo: 7999 },
};

export const MODULE_INFO: Record<ModuleKey, { name: string; description: string }> = {
  icm: {
    name: 'Variable Compensation',
    description: 'Commissions, bonuses, incentives for individuals or teams',
  },
  tfi: {
    name: 'Financial Operations',
    description: 'Transaction processing, location performance, franchise royalties',
  },
};

export const EXPERIENCE_INFO: Record<ExperienceTier, { name: string; description: string; rate: number; restriction?: string }> = {
  self_service: {
    name: 'Self-Service',
    description: 'AI-powered help, documentation, email support. Best for technical teams.',
    rate: 0,
  },
  guided: {
    name: 'Guided',
    description: 'Named experience manager, monthly check-in, priority support. Best for growing organizations.',
    rate: 0.12,
  },
  strategic: {
    name: 'Strategic',
    description: 'Dedicated experience manager, weekly engagement, custom training. Best for enterprise operations.',
    rate: 0.18,
    restriction: 'profesional',
  },
};

export const SCALE_OPTIONS = [
  { label: 'Under 50', tier: 'inicio' as TenantTier },
  { label: '50 – 500', tier: 'crecimiento' as TenantTier },
  { label: '500 – 5,000', tier: 'profesional' as TenantTier },
  { label: '5,000 – 50,000', tier: 'empresarial' as TenantTier },
  { label: '50,000+', tier: 'corporativo' as TenantTier },
];

export const INDUSTRIES = [
  'Retail',
  'Telecommunications',
  'Financial Services',
  'Restaurant/Hospitality',
  'Manufacturing',
  'Professional Services',
  'Healthcare',
  'Insurance',
  'Logistics',
  'Other',
];

export const COUNTRIES = [
  { code: 'MX', name: 'Mexico', currency: 'MXN', locale: 'es-MX' },
  { code: 'CO', name: 'Colombia', currency: 'COP', locale: 'es-CO' },
  { code: 'US', name: 'United States', currency: 'USD', locale: 'en-US' },
  { code: 'BR', name: 'Brazil', currency: 'BRL', locale: 'pt-BR' },
  { code: 'GT', name: 'Guatemala', currency: 'GTQ', locale: 'es-GT' },
  { code: 'HN', name: 'Honduras', currency: 'HNL', locale: 'es-HN' },
];

export interface BillCalculation {
  platformFee: number;
  moduleTotal: number;
  bundleDiscount: number;
  discountedModules: number;
  experienceFee: number;
  monthlyTotal: number;
  annualTotal: number;
}

export function calculateBill(
  tier: TenantTier,
  modules: ModuleKey[],
  experienceTier: ExperienceTier
): BillCalculation {
  const platformFee = PLATFORM_FEES[tier];
  const moduleFees = modules.map(m => MODULE_FEES[m]?.[tier] || 0);

  // Bundle discount
  const bundleDiscount = modules.length >= 4 ? 0.20 : modules.length >= 3 ? 0.15 : modules.length >= 2 ? 0.10 : 0;
  const moduleTotal = moduleFees.reduce((a, b) => a + b, 0);
  const discountedModules = Math.round(moduleTotal * (1 - bundleDiscount));

  const subtotal = platformFee + discountedModules;

  // Experience tier
  const experienceRate = EXPERIENCE_INFO[experienceTier]?.rate || 0;
  const experienceFee = Math.round(subtotal * experienceRate);

  const monthlyTotal = subtotal + experienceFee;
  const annualTotal = Math.round(monthlyTotal * 12 * 0.80);

  return { platformFee, moduleTotal, bundleDiscount, discountedModules, experienceFee, monthlyTotal, annualTotal };
}
