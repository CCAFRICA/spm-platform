/**
 * RetailCGMX Incentive Plan
 *
 * Complete implementation of the Mexican retail optical chain commission plan.
 * Two employee types: Certified and Non-Certified Optometrists
 * Six incentive components with matrix lookups, tiered lookups, and percentages.
 * Currency: MXN (Mexican Pesos)
 */

import type { CompensationPlanConfig, PlanComponent, MatrixConfig, TierConfig } from '@/types/compensation-plan';

// ============================================
// COMPONENT DEFINITIONS
// ============================================

// Component 1: Venta Óptica (Optical Sales) - Matrix Lookup
// Row: % Cumplimiento de meta Óptica (Optical goal attainment %)
// Column: $ Venta de Óptica de la tienda en el mes (Monthly store optical sales MXN)

const OPTICAL_SALES_MATRIX_CERTIFIED: MatrixConfig = {
  rowMetric: 'optical_attainment',
  rowMetricLabel: '% Cumplimiento de meta Óptica',
  rowBands: [
    { min: 0, max: 80, label: '<80%' },
    { min: 80, max: 90, label: '80%-90%' },
    { min: 90, max: 100, label: '90%-100%' },
    { min: 100, max: 150, label: '100%-150%' },
    { min: 150, max: Infinity, label: '150%+' },
  ],
  columnMetric: 'store_optical_sales',
  columnMetricLabel: 'Venta de Óptica de la tienda',
  columnBands: [
    { min: 0, max: 60000, label: '<$60k' },
    { min: 60000, max: 100000, label: '$60k-$100k' },
    { min: 100000, max: 120000, label: '$100k-$120k' },
    { min: 120000, max: 180000, label: '$120k-$180k' },
    { min: 180000, max: Infinity, label: '$180k+' },
  ],
  values: [
    // Certified Optometrist Matrix
    //  <$60k  $60k-$100k  $100k-$120k  $120k-$180k  $180k+
    [0,       0,          0,           500,         800],    // <80%
    [200,     300,        500,         800,         1100],   // 80%-90%
    [300,     500,        800,         1100,        1500],   // 90%-100%
    [800,     1100,       1500,        1800,        2500],   // 100%-150%
    [1000,    1300,       1800,        2200,        3000],   // 150%+
  ],
  currency: 'MXN',
};

const OPTICAL_SALES_MATRIX_NON_CERTIFIED: MatrixConfig = {
  rowMetric: 'optical_attainment',
  rowMetricLabel: '% Cumplimiento de meta Óptica',
  rowBands: [
    { min: 0, max: 80, label: '<80%' },
    { min: 80, max: 90, label: '80%-90%' },
    { min: 90, max: 100, label: '90%-100%' },
    { min: 100, max: 150, label: '100%-150%' },
    { min: 150, max: Infinity, label: '150%+' },
  ],
  columnMetric: 'store_optical_sales',
  columnMetricLabel: 'Venta de Óptica de la tienda',
  columnBands: [
    { min: 0, max: 60000, label: '<$60k' },
    { min: 60000, max: 100000, label: '$60k-$100k' },
    { min: 100000, max: 120000, label: '$100k-$120k' },
    { min: 120000, max: 180000, label: '$120k-$180k' },
    { min: 180000, max: Infinity, label: '$180k+' },
  ],
  values: [
    // Non-Certified Optometrist Matrix (lower payouts)
    //  <$60k  $60k-$100k  $100k-$120k  $120k-$180k  $180k+
    [0,       0,          0,           250,         400],    // <80%
    [100,     150,        250,         400,         550],    // 80%-90%
    [150,     250,        400,         550,         750],    // 90%-100%
    [400,     550,        750,         900,         1250],   // 100%-150%
    [500,     650,        900,         1100,        1500],   // 150%+
  ],
  currency: 'MXN',
};

// Component 2: Venta de Tienda (Store Sales) - Tiered Lookup (same for both)
const STORE_SALES_TIERS: TierConfig = {
  metric: 'store_sales_attainment',
  metricLabel: '% Cumplimiento meta venta tienda',
  tiers: [
    { min: 0, max: 100, label: '<100%', value: 0 },
    { min: 100, max: 105, label: '100%-104.99%', value: 150 },
    { min: 105, max: 110, label: '105%-109.99%', value: 300 },
    { min: 110, max: Infinity, label: '>=110%', value: 500 },
  ],
  currency: 'MXN',
};

// Component 3: Clientes Nuevos (New Customers) - Tiered Lookup (same for both)
const NEW_CUSTOMERS_TIERS: TierConfig = {
  metric: 'new_customers_attainment',
  metricLabel: '% cumplimiento clientes nuevos RetailCorp',
  tiers: [
    { min: 0, max: 100, label: '<100%', value: 0 },
    { min: 100, max: 105, label: '100%-104.99%', value: 150 },
    { min: 105, max: 110, label: '105%-109.99%', value: 200 },
    { min: 110, max: 115, label: '110%-114.99%', value: 250 },
    { min: 115, max: 120, label: '115%-119.99%', value: 300 },
    { min: 120, max: 125, label: '120%-124.99%', value: 350 },
    { min: 125, max: Infinity, label: '>=125%', value: 400 },
  ],
  currency: 'MXN',
};

// Component 4: Cobranza en Tienda (In-Store Collections) - Tiered Lookup (same for both)
const COLLECTIONS_TIERS: TierConfig = {
  metric: 'collections_attainment',
  metricLabel: '% cumplimiento monto cobranza',
  tiers: [
    { min: 0, max: 100, label: '<100%', value: 0 },
    { min: 100, max: 105, label: '100%-104.99%', value: 150 },
    { min: 105, max: 110, label: '105%-109.99%', value: 200 },
    { min: 110, max: 115, label: '110%-114.99%', value: 250 },
    { min: 115, max: 120, label: '115%-119.99%', value: 300 },
    { min: 120, max: 125, label: '120%-124.99%', value: 350 },
    { min: 125, max: Infinity, label: '>=125%', value: 400 },
  ],
  currency: 'MXN',
};

// Component 5: Venta de Seguros (Insurance Sales) - Conditional Percentage
// Based on store goal attainment:
// - If <=80% or <100%: 3% of individual sales
// - If >=100%: 5% of individual sales

// Component 6: Venta de Servicios (Extended Warranty) - Flat 4%

// ============================================
// CERTIFIED OPTOMETRIST COMPONENTS
// ============================================

function getCertifiedComponents(): PlanComponent[] {
  return [
    {
      id: 'venta-optica-certified',
      name: 'Venta Óptica',
      description: 'Incentivo por ventas ópticas basado en cumplimiento y volumen de tienda',
      order: 1,
      enabled: true,
      componentType: 'matrix_lookup',
      measurementLevel: 'store',
      matrixConfig: OPTICAL_SALES_MATRIX_CERTIFIED,
    },
    {
      id: 'venta-tienda',
      name: 'Venta de Tienda',
      description: 'Incentivo por cumplimiento de meta de venta de tienda',
      order: 2,
      enabled: true,
      componentType: 'tier_lookup',
      measurementLevel: 'store',
      tierConfig: STORE_SALES_TIERS,
    },
    {
      id: 'clientes-nuevos',
      name: 'Clientes Nuevos',
      description: 'Incentivo por cumplimiento de clientes nuevos',
      order: 3,
      enabled: true,
      componentType: 'tier_lookup',
      measurementLevel: 'store',
      tierConfig: NEW_CUSTOMERS_TIERS,
    },
    {
      id: 'cobranza',
      name: 'Cobranza en Tienda',
      description: 'Incentivo por cumplimiento de cobranza',
      order: 4,
      enabled: true,
      componentType: 'tier_lookup',
      measurementLevel: 'store',
      tierConfig: COLLECTIONS_TIERS,
    },
    {
      id: 'seguros',
      name: 'Venta de Seguros',
      description: 'Reactivación Club de Protección - porcentaje basado en cumplimiento de tienda',
      order: 5,
      enabled: true,
      componentType: 'conditional_percentage',
      measurementLevel: 'individual',
      conditionalConfig: {
        conditions: [
          {
            metric: 'store_goal_attainment',
            metricLabel: 'Cumplimiento meta tienda',
            min: 0,
            max: 80,
            rate: 0,
            label: '<=80% cumplimiento',
          },
          {
            metric: 'store_goal_attainment',
            metricLabel: 'Cumplimiento meta tienda',
            min: 80,
            max: 100,
            rate: 0.03,
            label: '80%-99.99% cumplimiento',
          },
          {
            metric: 'store_goal_attainment',
            metricLabel: 'Cumplimiento meta tienda',
            min: 100,
            max: Infinity,
            rate: 0.05,
            label: '>=100% cumplimiento',
          },
        ],
        appliedTo: 'individual_insurance_sales',
        appliedToLabel: 'Ventas individuales de seguros',
      },
    },
    {
      id: 'servicios',
      name: 'Venta de Servicios',
      description: 'Garantia Extendida - 4% de ventas individuales',
      order: 6,
      enabled: true,
      componentType: 'percentage',
      measurementLevel: 'individual',
      percentageConfig: {
        rate: 0.04,
        appliedTo: 'individual_warranty_sales',
        appliedToLabel: 'Ventas individuales de garantia extendida',
      },
    },
  ];
}

// ============================================
// NON-CERTIFIED OPTOMETRIST COMPONENTS
// ============================================

function getNonCertifiedComponents(): PlanComponent[] {
  return [
    {
      id: 'venta-optica-noncertified',
      name: 'Venta Optica',
      description: 'Incentivo por ventas opticas basado en cumplimiento y volumen de tienda (tarifa reducida)',
      order: 1,
      enabled: true,
      componentType: 'matrix_lookup',
      measurementLevel: 'store',
      matrixConfig: OPTICAL_SALES_MATRIX_NON_CERTIFIED,
    },
    {
      id: 'venta-tienda',
      name: 'Venta de Tienda',
      description: 'Incentivo por cumplimiento de meta de venta de tienda',
      order: 2,
      enabled: true,
      componentType: 'tier_lookup',
      measurementLevel: 'store',
      tierConfig: STORE_SALES_TIERS,
    },
    {
      id: 'clientes-nuevos',
      name: 'Clientes Nuevos',
      description: 'Incentivo por cumplimiento de clientes nuevos',
      order: 3,
      enabled: true,
      componentType: 'tier_lookup',
      measurementLevel: 'store',
      tierConfig: NEW_CUSTOMERS_TIERS,
    },
    {
      id: 'cobranza',
      name: 'Cobranza en Tienda',
      description: 'Incentivo por cumplimiento de cobranza',
      order: 4,
      enabled: true,
      componentType: 'tier_lookup',
      measurementLevel: 'store',
      tierConfig: COLLECTIONS_TIERS,
    },
    {
      id: 'seguros',
      name: 'Venta de Seguros',
      description: 'Reactivacion Club de Proteccion - porcentaje basado en cumplimiento de tienda',
      order: 5,
      enabled: true,
      componentType: 'conditional_percentage',
      measurementLevel: 'individual',
      conditionalConfig: {
        conditions: [
          {
            metric: 'store_goal_attainment',
            metricLabel: 'Cumplimiento meta tienda',
            min: 0,
            max: 80,
            rate: 0,
            label: '<=80% cumplimiento',
          },
          {
            metric: 'store_goal_attainment',
            metricLabel: 'Cumplimiento meta tienda',
            min: 80,
            max: 100,
            rate: 0.03,
            label: '80%-99.99% cumplimiento',
          },
          {
            metric: 'store_goal_attainment',
            metricLabel: 'Cumplimiento meta tienda',
            min: 100,
            max: Infinity,
            rate: 0.05,
            label: '>=100% cumplimiento',
          },
        ],
        appliedTo: 'individual_insurance_sales',
        appliedToLabel: 'Ventas individuales de seguros',
      },
    },
    {
      id: 'servicios',
      name: 'Venta de Servicios',
      description: 'Garantia Extendida - 4% de ventas individuales',
      order: 6,
      enabled: true,
      componentType: 'percentage',
      measurementLevel: 'individual',
      percentageConfig: {
        rate: 0.04,
        appliedTo: 'individual_warranty_sales',
        appliedToLabel: 'Ventas individuales de garantia extendida',
      },
    },
  ];
}

// ============================================
// PLAN FACTORIES
// ============================================

export function createRetailCGMXCertifiedPlan(): CompensationPlanConfig {
  const now = new Date().toISOString();
  return {
    id: 'plan-retailcgmx-certified-2025',
    tenantId: 'retailcgmx',
    name: 'RetailCGMX Incentive Plan - Optometrista Certificado',
    description: 'Plan de incentivos para optometristas certificados con tablas de pago superiores',
    planType: 'additive_lookup',
    status: 'active',
    effectiveDate: '2025-01-01T00:00:00Z',
    endDate: null,
    eligibleRoles: ['optometrista', 'sales_rep'],
    version: 1,
    previousVersionId: null,
    createdBy: 'system',
    createdAt: now,
    updatedBy: 'system',
    updatedAt: now,
    approvedBy: 'system',
    approvedAt: now,
    configuration: {
      type: 'additive_lookup',
      variants: [
        {
          variantId: 'certified',
          variantName: 'Optometrista Certificado',
          description: 'Tablas de pago superiores para optometristas con certificación',
          eligibilityCriteria: { isCertified: true },
          components: getCertifiedComponents(),
        },
      ],
    },
  };
}

export function createRetailCGMXNonCertifiedPlan(): CompensationPlanConfig {
  const now = new Date().toISOString();
  return {
    id: 'plan-retailcgmx-noncertified-2025',
    tenantId: 'retailcgmx',
    name: 'RetailCGMX Incentive Plan - Optometrista No Certificado',
    description: 'Plan de incentivos para optometristas no certificados con tablas de pago reducidas',
    planType: 'additive_lookup',
    status: 'active',
    effectiveDate: '2025-01-01T00:00:00Z',
    endDate: null,
    eligibleRoles: ['optometrista', 'sales_rep'],
    version: 1,
    previousVersionId: null,
    createdBy: 'system',
    createdAt: now,
    updatedBy: 'system',
    updatedAt: now,
    approvedBy: 'system',
    approvedAt: now,
    configuration: {
      type: 'additive_lookup',
      variants: [
        {
          variantId: 'non-certified',
          variantName: 'Optometrista No Certificado',
          description: 'Tablas de pago reducidas para optometristas sin certificación',
          eligibilityCriteria: { isCertified: false },
          components: getNonCertifiedComponents(),
        },
      ],
    },
  };
}

// ============================================
// UNIFIED PLAN (BOTH VARIANTS IN ONE)
// ============================================

export function createRetailCGMXUnifiedPlan(): CompensationPlanConfig {
  const now = new Date().toISOString();
  return {
    id: 'plan-retailcgmx-unified-2025',
    tenantId: 'retailcgmx',
    name: 'RetailCGMX Incentive Plan',
    description: 'Plan de incentivos unificado para optometristas certificados y no certificados',
    planType: 'additive_lookup',
    status: 'active',
    effectiveDate: '2025-01-01T00:00:00Z',
    endDate: null,
    eligibleRoles: ['optometrista', 'sales_rep'],
    version: 1,
    previousVersionId: null,
    createdBy: 'system',
    createdAt: now,
    updatedBy: 'system',
    updatedAt: now,
    approvedBy: 'system',
    approvedAt: now,
    configuration: {
      type: 'additive_lookup',
      variants: [
        {
          variantId: 'certified',
          variantName: 'Optometrista Certificado',
          description: 'Tablas de pago superiores para optometristas con certificación',
          eligibilityCriteria: { isCertified: true },
          components: getCertifiedComponents(),
        },
        {
          variantId: 'non-certified',
          variantName: 'Optometrista No Certificado',
          description: 'Tablas de pago reducidas para optometristas sin certificación',
          eligibilityCriteria: { isCertified: false },
          components: getNonCertifiedComponents(),
        },
      ],
    },
  };
}

// ============================================
// LABELS (Spanish with English translations)
// ============================================

export const RETAILCGMX_LABELS = {
  planName: {
    es: 'RetailCGMX Plan de Incentivos',
    en: 'RetailCGMX Incentive Plan',
  },
  certified: {
    es: 'Optometrista Certificado',
    en: 'Certified Optometrist',
  },
  nonCertified: {
    es: 'Optometrista No Certificado',
    en: 'Non-Certified Optometrist',
  },
  components: {
    opticalSales: {
      es: 'Venta Óptica',
      en: 'Optical Sales',
    },
    storeSales: {
      es: 'Venta de Tienda',
      en: 'Store Sales',
    },
    newCustomers: {
      es: 'Clientes Nuevos',
      en: 'New Customers',
    },
    collections: {
      es: 'Cobranza en Tienda',
      en: 'In-Store Collections',
    },
    insurance: {
      es: 'Venta de Seguros',
      en: 'Insurance Sales',
    },
    warranty: {
      es: 'Venta de Servicios',
      en: 'Extended Warranty',
    },
  },
  metrics: {
    opticalAttainment: {
      es: '% Cumplimiento de meta Óptica',
      en: 'Optical Goal Attainment %',
    },
    storeOpticalSales: {
      es: 'Venta de Óptica de la tienda',
      en: 'Store Optical Sales',
    },
    storeSalesAttainment: {
      es: '% Cumplimiento meta venta tienda',
      en: 'Store Sales Goal Attainment %',
    },
    newCustomersAttainment: {
      es: '% cumplimiento clientes nuevos',
      en: 'New Customers Goal Attainment %',
    },
    collectionsAttainment: {
      es: '% cumplimiento monto cobranza',
      en: 'Collections Goal Attainment %',
    },
    individualInsuranceSales: {
      es: 'Ventas individuales de seguros',
      en: 'Individual Insurance Sales',
    },
    individualWarrantySales: {
      es: 'Ventas individuales de garantía',
      en: 'Individual Warranty Sales',
    },
  },
};
