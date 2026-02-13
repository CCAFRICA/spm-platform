/**
 * FRMX Demo Data -- Normalization Scenario
 *
 * Simulates messy POS product descriptions from 8 restaurant franchise locations.
 * Each location uses slightly different naming conventions, abbreviations,
 * and languages (English/Spanish mix) for the same products.
 *
 * This data exercises the 3-tier normalization engine:
 *   - Some items are clean and will auto-classify (Tier 1)
 *   - Some have abbreviations/misspellings that AI can resolve (Tier 2)
 *   - Some are ambiguous and require manual classification (Tier 3)
 *
 * Korean Test: All location names, product descriptions, and categories
 * come from this data file. The engine itself has zero hardcoded product names.
 */

import {
  upsertDictionaryEntry,
  ensureCategory,
} from './normalization-engine';

// =============================================================================
// LOCATION DEFINITIONS
// =============================================================================

export interface DemoLocation {
  id: string;
  name: string;
  city: string;
  posSystem: string;
}

export const DEMO_LOCATIONS: DemoLocation[] = [
  { id: 'loc-001', name: 'Centro Historico', city: 'CDMX', posSystem: 'SoftRestaurant' },
  { id: 'loc-002', name: 'Polanco', city: 'CDMX', posSystem: 'SoftRestaurant' },
  { id: 'loc-003', name: 'Santa Fe', city: 'CDMX', posSystem: 'ICG' },
  { id: 'loc-004', name: 'Monterrey Sur', city: 'Monterrey', posSystem: 'SoftRestaurant' },
  { id: 'loc-005', name: 'Guadalajara Centro', city: 'Guadalajara', posSystem: 'ICG' },
  { id: 'loc-006', name: 'Puebla Angelopolis', city: 'Puebla', posSystem: 'SoftRestaurant' },
  { id: 'loc-007', name: 'Cancun Zona Hotelera', city: 'Cancun', posSystem: 'ICG' },
  { id: 'loc-008', name: 'Queretaro Juriquilla', city: 'Queretaro', posSystem: 'SoftRestaurant' },
];

// =============================================================================
// PRODUCT CATEGORIES (ground truth)
// =============================================================================

export const DEMO_CATEGORIES = [
  { id: 'cat-burgers', name: 'Burgers', description: 'All burger variants' },
  { id: 'cat-chicken', name: 'Chicken', description: 'Chicken dishes and combos' },
  { id: 'cat-sides', name: 'Sides', description: 'Side dishes and accompaniments' },
  { id: 'cat-beverages', name: 'Beverages', description: 'Drinks and refreshments' },
  { id: 'cat-desserts', name: 'Desserts', description: 'Sweet items and ice cream' },
  { id: 'cat-combos', name: 'Combos', description: 'Meal combinations' },
  { id: 'cat-breakfast', name: 'Breakfast', description: 'Morning menu items' },
  { id: 'cat-salads', name: 'Salads', description: 'Salads and healthy options' },
  { id: 'cat-extras', name: 'Extras', description: 'Add-ons and modifications' },
  { id: 'cat-promos', name: 'Promotions', description: 'Promotional and seasonal items' },
];

// =============================================================================
// MESSY POS DATA BY LOCATION
// =============================================================================

export interface POSTransaction {
  transactionId: string;
  locationId: string;
  date: string;
  rawProductName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/**
 * Generate messy POS transactions for all 8 locations.
 * Each location has slightly different naming for the same products.
 */
export function generateDemoTransactions(): POSTransaction[] {
  const transactions: POSTransaction[] = [];
  let txId = 1000;

  // Product name variations by location (same product, different POS entries)
  const productVariations: Array<{
    groundTruth: string;
    category: string;
    variations: Record<string, string>; // locationId -> raw POS name
    basePrice: number;
  }> = [
    {
      groundTruth: 'Classic Burger',
      category: 'Burgers',
      variations: {
        'loc-001': 'HAMBURGUESA CLASICA',
        'loc-002': 'Hamb. Clasica',
        'loc-003': 'CLASSIC BURGER',
        'loc-004': 'HBGSA CLASIC',
        'loc-005': 'Hamburguesa Clasica Regular',
        'loc-006': 'HAMB CLASICA 1/4 LB',
        'loc-007': 'Classic Burg.',
        'loc-008': 'HAMBURGESA CLASICA',  // typo intentional
      },
      basePrice: 89,
    },
    {
      groundTruth: 'Double Cheeseburger',
      category: 'Burgers',
      variations: {
        'loc-001': 'DOBLE HAMBURGUESA CON QUESO',
        'loc-002': 'Dbl Cheeseburg',
        'loc-003': 'DBL CHEESEBURGER',
        'loc-004': '2X HBGSA QUESO',
        'loc-005': 'Hamburguesa Doble Queso',
        'loc-006': 'DOBLE QUESO BURGER',
        'loc-007': 'Double Cheese Burg',
        'loc-008': 'HAMB DOBLE C/QUESO',
      },
      basePrice: 129,
    },
    {
      groundTruth: 'Bacon BBQ Burger',
      category: 'Burgers',
      variations: {
        'loc-001': 'HAMBURGUESA BBQ TOCINO',
        'loc-002': 'Bacon BBQ Hamb',
        'loc-003': 'BBQ BACON BURGER',
        'loc-004': 'HBGSA BBQ C/TOCINO',
        'loc-005': 'Hamburguesa Barbacoa Tocino',
        'loc-006': 'BBQ TOCINO BURG',
        'loc-007': 'Bacon BBQ Burg.',
        'loc-008': 'HAMB TOCINO BBQ',
      },
      basePrice: 139,
    },
    {
      groundTruth: 'Crispy Chicken Sandwich',
      category: 'Chicken',
      variations: {
        'loc-001': 'SANDWICH POLLO CRUJIENTE',
        'loc-002': 'Sand. Pollo Crispy',
        'loc-003': 'CRISPY CHKN SANDWICH',
        'loc-004': 'SDWCH POLLO CRISP',
        'loc-005': 'Sandwich de Pollo Crujiente',
        'loc-006': 'CRISPY POLLO SAND',
        'loc-007': 'Crispy Chick Sand',
        'loc-008': 'SANDWCH POLLO CRUGIENTE',  // typo
      },
      basePrice: 109,
    },
    {
      groundTruth: 'Chicken Nuggets 10pc',
      category: 'Chicken',
      variations: {
        'loc-001': 'NUGGETS DE POLLO X10',
        'loc-002': '10 Nuggets',
        'loc-003': 'CHKN NUGGETS 10PC',
        'loc-004': 'NUGGS POLLO 10',
        'loc-005': 'Nuggets Pollo (10 piezas)',
        'loc-006': '10PC CHICKEN NUGGETS',
        'loc-007': 'Chkn Nugg 10',
        'loc-008': 'NUGGETS X10 POLLO',
      },
      basePrice: 79,
    },
    {
      groundTruth: 'French Fries Large',
      category: 'Sides',
      variations: {
        'loc-001': 'PAPAS FRITAS GRANDE',
        'loc-002': 'Papas Gdes',
        'loc-003': 'LG FRENCH FRIES',
        'loc-004': 'PAPAS GDE',
        'loc-005': 'Papas a la Francesa Grande',
        'loc-006': 'FRENCH FRIES LG',
        'loc-007': 'Lg Fries',
        'loc-008': 'PAPAS FRANCESAS GDE',
      },
      basePrice: 49,
    },
    {
      groundTruth: 'Coca-Cola Medium',
      category: 'Beverages',
      variations: {
        'loc-001': 'COCA COLA MEDIANA',
        'loc-002': 'Coca Med',
        'loc-003': 'MED COCA COLA',
        'loc-004': 'COCA MED',
        'loc-005': 'Coca-Cola Mediana',
        'loc-006': 'COCA COLA M',
        'loc-007': 'Med Coke',
        'loc-008': 'COCACOLA MED',
      },
      basePrice: 35,
    },
    {
      groundTruth: 'Chocolate Milkshake',
      category: 'Beverages',
      variations: {
        'loc-001': 'MALTEADA CHOCOLATE',
        'loc-002': 'Malteada Choco',
        'loc-003': 'CHOC MILKSHAKE',
        'loc-004': 'MALT CHOCO',
        'loc-005': 'Malteada de Chocolate',
        'loc-006': 'CHOCOLATE SHAKE',
        'loc-007': 'Choc Shake',
        'loc-008': 'MALTEADA CHOCOLTE',  // typo
      },
      basePrice: 65,
    },
    {
      groundTruth: 'Ice Cream Sundae',
      category: 'Desserts',
      variations: {
        'loc-001': 'SUNDAE HELADO',
        'loc-002': 'Sundae',
        'loc-003': 'ICE CREAM SUNDAE',
        'loc-004': 'HELADO SUNDAE',
        'loc-005': 'Sundae de Helado',
        'loc-006': 'SUNDAE ICE CRM',
        'loc-007': 'Ice Crm Sundae',
        'loc-008': 'SUNDAY HELADO',  // typo
      },
      basePrice: 45,
    },
    {
      groundTruth: 'Combo #1 Burger Meal',
      category: 'Combos',
      variations: {
        'loc-001': 'COMBO #1 HAMBURGUESA',
        'loc-002': 'Combo 1 Hamb',
        'loc-003': 'COMBO 1 BURGER MEAL',
        'loc-004': 'CMB1 HBGSA',
        'loc-005': 'Combo Numero 1 Hamburguesa',
        'loc-006': '#1 COMBO MEAL',
        'loc-007': 'Combo #1 Burg Meal',
        'loc-008': 'COMBO1 HAMB COMPLETO',
      },
      basePrice: 149,
    },
    {
      groundTruth: 'Garden Salad',
      category: 'Salads',
      variations: {
        'loc-001': 'ENSALADA JARDIN',
        'loc-002': 'Ensalada Verde',
        'loc-003': 'GARDEN SALAD',
        'loc-004': 'ENSL JARDIN',
        'loc-005': 'Ensalada del Jardin',
        'loc-006': 'ENSALADA GARDEN',
        'loc-007': 'Garden Sal.',
        'loc-008': 'ENSALADA DE JARDIN',
      },
      basePrice: 69,
    },
    {
      groundTruth: 'Breakfast Burrito',
      category: 'Breakfast',
      variations: {
        'loc-001': 'BURRITO DESAYUNO',
        'loc-002': 'Burrito Desy.',
        'loc-003': 'BKFST BURRITO',
        'loc-004': 'BURR DESAYUNO',
        'loc-005': 'Burrito de Desayuno',
        'loc-006': 'BREAKFAST BURR',
        'loc-007': 'Bkfst Burr.',
        'loc-008': 'BURRTO DESAYUNO',  // typo
      },
      basePrice: 79,
    },
    {
      groundTruth: 'Extra Cheese',
      category: 'Extras',
      variations: {
        'loc-001': 'EXTRA QUESO',
        'loc-002': 'Extra Qso',
        'loc-003': 'ADD CHEESE',
        'loc-004': 'EXT QUESO',
        'loc-005': 'Queso Extra',
        'loc-006': 'EXTRA CHEESE',
        'loc-007': 'Add Chz',
        'loc-008': 'QUESO EXTRA',
      },
      basePrice: 15,
    },
    {
      groundTruth: 'Happy Hour 2x1 Burger',
      category: 'Promotions',
      variations: {
        'loc-001': 'HAPPY HOUR 2X1 HAMB',
        'loc-002': 'HH 2x1 Hamb',
        'loc-003': 'HAPPY HOUR 2FOR1 BURGER',
        'loc-004': 'HH 2X1 HBGSA',
        'loc-005': 'Hora Feliz 2x1 Hamburguesa',
        'loc-006': '2X1 BURGER PROMO',
        'loc-007': 'Happy Hr 2x1',
        'loc-008': 'PROMO 2X1 HAMBURGUESA',
      },
      basePrice: 89,
    },
    {
      groundTruth: 'Onion Rings',
      category: 'Sides',
      variations: {
        'loc-001': 'AROS DE CEBOLLA',
        'loc-002': 'Aros Cebolla',
        'loc-003': 'ONION RINGS',
        'loc-004': 'AROS CBLLA',
        'loc-005': 'Aros de Cebolla',
        'loc-006': 'ONION RINGS PORCION',
        'loc-007': 'Onion Rngs',
        'loc-008': 'AROS CEBOYA',  // typo
      },
      basePrice: 55,
    },
  ];

  // Generate 30 days of transactions for each location
  const baseDate = new Date(2025, 0, 1); // Jan 2025

  for (const location of DEMO_LOCATIONS) {
    for (let day = 0; day < 30; day++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + day);
      const dateStr = date.toISOString().split('T')[0];

      // Each location sells 20-40 items per day
      const itemCount = 20 + Math.floor(Math.random() * 20);

      for (let i = 0; i < itemCount; i++) {
        const productIdx = Math.floor(Math.random() * productVariations.length);
        const product = productVariations[productIdx];
        const rawName = product.variations[location.id] || product.groundTruth;
        const quantity = 1 + Math.floor(Math.random() * 3);
        // Slight price variation per location (+/- 10%)
        const priceVariation = 0.9 + Math.random() * 0.2;
        const unitPrice = Math.round(product.basePrice * priceVariation);

        transactions.push({
          transactionId: `tx-${txId++}`,
          locationId: location.id,
          date: dateStr,
          rawProductName: rawName,
          quantity,
          unitPrice,
          total: quantity * unitPrice,
        });
      }
    }
  }

  return transactions;
}

/**
 * Seed the normalization dictionary with a few known mappings.
 * This gives the engine a head start (Tier 1 hits) while leaving
 * most items for AI classification (Tier 2) or manual review (Tier 3).
 */
export function seedDictionary(tenantId: string): void {
  // Seed categories
  for (const cat of DEMO_CATEGORIES) {
    ensureCategory(tenantId, cat.id, cat.name, cat.description);
  }

  // Seed a few dictionary entries (only ~30% of variations)
  // This simulates a dictionary that's been partially trained
  const seeds: Array<{ raw: string; normalized: string; category: string }> = [
    { raw: 'HAMBURGUESA CLASICA', normalized: 'Classic Burger', category: 'Burgers' },
    { raw: 'CLASSIC BURGER', normalized: 'Classic Burger', category: 'Burgers' },
    { raw: 'DOBLE HAMBURGUESA CON QUESO', normalized: 'Double Cheeseburger', category: 'Burgers' },
    { raw: 'DBL CHEESEBURGER', normalized: 'Double Cheeseburger', category: 'Burgers' },
    { raw: 'COCA COLA MEDIANA', normalized: 'Coca-Cola Medium', category: 'Beverages' },
    { raw: 'PAPAS FRITAS GRANDE', normalized: 'French Fries Large', category: 'Sides' },
    { raw: 'LG FRENCH FRIES', normalized: 'French Fries Large', category: 'Sides' },
    { raw: 'NUGGETS DE POLLO X10', normalized: 'Chicken Nuggets 10pc', category: 'Chicken' },
    { raw: 'COMBO #1 HAMBURGUESA', normalized: 'Combo #1 Burger Meal', category: 'Combos' },
    { raw: 'GARDEN SALAD', normalized: 'Garden Salad', category: 'Salads' },
    { raw: 'ONION RINGS', normalized: 'Onion Rings', category: 'Sides' },
    { raw: 'ICE CREAM SUNDAE', normalized: 'Ice Cream Sundae', category: 'Desserts' },
  ];

  for (const seed of seeds) {
    upsertDictionaryEntry(tenantId, seed.raw, seed.normalized, seed.category, 0.95, 'system');
  }
}

/**
 * Get unique raw product names across all transactions, grouped by location.
 * Useful for showing the normalization challenge to the user.
 */
export function getUniqueProductsByLocation(
  transactions: POSTransaction[]
): Map<string, string[]> {
  const byLocation = new Map<string, Set<string>>();

  for (const tx of transactions) {
    let set = byLocation.get(tx.locationId);
    if (!set) {
      set = new Set<string>();
      byLocation.set(tx.locationId, set);
    }
    set.add(tx.rawProductName);
  }

  const result = new Map<string, string[]>();
  Array.from(byLocation.entries()).forEach(([locId, productSet]) => {
    result.set(locId, Array.from(productSet).sort());
  });
  return result;
}

/**
 * Extract all unique raw product names from transactions for normalization.
 */
export function extractUniqueRawValues(transactions: POSTransaction[]): string[] {
  const unique = new Set<string>();
  for (const tx of transactions) {
    unique.add(tx.rawProductName);
  }
  return Array.from(unique).sort();
}

/**
 * Get transaction summary by normalized product name after normalization.
 */
export function buildNormalizedSummary(
  transactions: POSTransaction[],
  normalizationMap: Map<string, string> // raw -> normalized
): Array<{
  normalizedName: string;
  totalQuantity: number;
  totalRevenue: number;
  locationCount: number;
  rawVariants: string[];
}> {
  const groups = new Map<string, {
    totalQuantity: number;
    totalRevenue: number;
    locations: Set<string>;
    variants: Set<string>;
  }>();

  for (const tx of transactions) {
    const normalized = normalizationMap.get(tx.rawProductName) || tx.rawProductName;
    let group = groups.get(normalized);
    if (!group) {
      group = { totalQuantity: 0, totalRevenue: 0, locations: new Set(), variants: new Set() };
      groups.set(normalized, group);
    }
    group.totalQuantity += tx.quantity;
    group.totalRevenue += tx.total;
    group.locations.add(tx.locationId);
    group.variants.add(tx.rawProductName);
  }

  return Array.from(groups.entries())
    .map(([normalizedName, data]) => ({
      normalizedName,
      totalQuantity: data.totalQuantity,
      totalRevenue: data.totalRevenue,
      locationCount: data.locations.size,
      rawVariants: Array.from(data.variants),
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}
