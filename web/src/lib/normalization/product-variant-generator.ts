/**
 * Product Variant Generator
 *
 * Generates realistic messy product descriptions from 60 canonical products
 * using 20 naming conventions. Simulates the inconsistency of real POS data
 * where each location names products differently.
 *
 * 20 Naming Conventions x 60 Canonical Products = ~1,200 unique descriptions
 *
 * Korean Test: All product names, categories, and conventions come from data
 * structures. Zero hardcoded field names or labels in the transform logic.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CanonicalProduct {
  id: number;
  name: string;           // Standardized product name
  category: string;       // Product category
  abbr: string;           // Abbreviated form
  code: string;           // POS short code (5-8 chars)
  en: string;             // English translation
  typos: string[];        // Common misspellings
  slang?: string;         // Colloquial/slang name
  regional?: string;      // Regional name variant
}

export interface NamingConvention {
  id: string;
  name: string;
  description: string;
  transform: (product: CanonicalProduct) => string;
}

export interface ProductVariant {
  canonicalId: number;
  canonicalName: string;
  category: string;
  conventionId: string;
  variant: string;
}

// =============================================================================
// 60 CANONICAL PRODUCTS
// =============================================================================

export const CANONICAL_PRODUCTS: CanonicalProduct[] = [
  // ---- Entradas (Starters) ---- 8
  { id: 1, name: 'Guacamole', category: 'Entradas', abbr: 'GUAC', code: 'ENT-01', en: 'Guacamole', typos: ['GUACAMLE', 'GUACAMOL', 'WACAMOLE'] },
  { id: 2, name: 'Nachos con Queso', category: 'Entradas', abbr: 'NACHOS QSO', code: 'ENT-02', en: 'Cheese Nachos', typos: ['NACHOS CON QESO', 'NACOS CON QUESO'] },
  { id: 3, name: 'Alitas de Pollo', category: 'Entradas', abbr: 'ALITAS', code: 'ENT-03', en: 'Chicken Wings', typos: ['ALITAS DE POLO', 'ALITAS D POLLO'] },
  { id: 4, name: 'Sopa de Tortilla', category: 'Entradas', abbr: 'SOPA TORT', code: 'ENT-04', en: 'Tortilla Soup', typos: ['SOPA DE TORTILA', 'SOPA D TORTILLA'] },
  { id: 5, name: 'Elote en Vaso', category: 'Entradas', abbr: 'ELOTE', code: 'ENT-05', en: 'Corn in a Cup', typos: ['ELOTE EN BASO', 'ELOTE N VASO'] },
  { id: 6, name: 'Quesadilla de Queso', category: 'Entradas', abbr: 'QSADILLA QSO', code: 'ENT-06', en: 'Cheese Quesadilla', typos: ['QUESADIYA DE QUESO', 'QUESADILLA D QESO'], slang: 'Queca de Queso' },
  { id: 7, name: 'Tostadas de Tinga', category: 'Entradas', abbr: 'TOSTADAS', code: 'ENT-07', en: 'Tinga Tostadas', typos: ['TOSTADAS DE TINGA', 'TOSTADS DE TINGA'] },
  { id: 8, name: 'Ceviche de Pescado', category: 'Entradas', abbr: 'CEVICHE', code: 'ENT-08', en: 'Fish Ceviche', typos: ['SEBICHE DE PESCADO', 'CEVICHE D PESCDO'], regional: 'Ceviche de Caracol' },

  // ---- Platos Fuertes (Mains) ---- 20
  { id: 9, name: 'Hamburguesa Clasica', category: 'Platos Fuertes', abbr: 'HAMB CLAS', code: 'PLT-01', en: 'Classic Burger', typos: ['HAMBURGESA CLASICA', 'AMBURGUESA CLASICA', 'HAMBURGUESA CLASCA'] },
  { id: 10, name: 'Hamburguesa con Queso', category: 'Platos Fuertes', abbr: 'HAMB QSO', code: 'PLT-02', en: 'Cheeseburger', typos: ['HAMBURGESA CON QUESO', 'HAMBURGUESA CON QESO'] },
  { id: 11, name: 'Hamburguesa BBQ', category: 'Platos Fuertes', abbr: 'HAMB BBQ', code: 'PLT-03', en: 'BBQ Burger', typos: ['HAMBURGESA BBQ', 'HAMBURGUESA BQQ'] },
  { id: 12, name: 'Tacos al Pastor', category: 'Platos Fuertes', abbr: 'TACOS PAST', code: 'PLT-04', en: 'Pastor Tacos', typos: ['TACOS AL PASTO', 'TACOS AL PASROR'], slang: 'Unos de Pastor' },
  { id: 13, name: 'Tacos de Bistec', category: 'Platos Fuertes', abbr: 'TACOS BIST', code: 'PLT-05', en: 'Steak Tacos', typos: ['TACOS DE BISTECK', 'TACOS D BISTEC'] },
  { id: 14, name: 'Tacos de Pollo', category: 'Platos Fuertes', abbr: 'TACOS POLLO', code: 'PLT-06', en: 'Chicken Tacos', typos: ['TACOS DE POLO', 'TACOS D POLLO'] },
  { id: 15, name: 'Enchiladas Verdes', category: 'Platos Fuertes', abbr: 'ENCH VRDS', code: 'PLT-07', en: 'Green Enchiladas', typos: ['ENCHILADAS VERDE', 'ENCHILADS VERDES'] },
  { id: 16, name: 'Enchiladas Rojas', category: 'Platos Fuertes', abbr: 'ENCH ROJAS', code: 'PLT-08', en: 'Red Enchiladas', typos: ['ENCHILADAS ROJA', 'ENCHILADS ROJAS'] },
  { id: 17, name: 'Enchiladas Suizas', category: 'Platos Fuertes', abbr: 'ENCH SUIZ', code: 'PLT-09', en: 'Swiss Enchiladas', typos: ['ENCHILADAS SUISAS', 'ENCHILADS SUIZAS'] },
  { id: 18, name: 'Burrito de Carne', category: 'Platos Fuertes', abbr: 'BURR CARNE', code: 'PLT-10', en: 'Beef Burrito', typos: ['BURRTO DE CARNE', 'BURITO DE CARNE'], slang: 'Burro de Carne' },
  { id: 19, name: 'Burrito de Pollo', category: 'Platos Fuertes', abbr: 'BURR POLLO', code: 'PLT-11', en: 'Chicken Burrito', typos: ['BURRTO DE POLLO', 'BURITO DE POLO'] },
  { id: 20, name: 'Torta de Milanesa', category: 'Platos Fuertes', abbr: 'TORTA MIL', code: 'PLT-12', en: 'Milanesa Sandwich', typos: ['TORTA DE MILANEZA', 'TORTA D MILANESA'], regional: 'Cemita de Milanesa' },
  { id: 21, name: 'Torta Hawaiana', category: 'Platos Fuertes', abbr: 'TORTA HAW', code: 'PLT-13', en: 'Hawaiian Sandwich', typos: ['TORTA AWAIANA', 'TORTA HAWAYANA'] },
  { id: 22, name: 'Carne Asada', category: 'Platos Fuertes', abbr: 'C. ASADA', code: 'PLT-14', en: 'Grilled Steak', typos: ['CARNE ASDA', 'CARNE AZADA'] },
  { id: 23, name: 'Filete de Pescado', category: 'Platos Fuertes', abbr: 'FILETE PESC', code: 'PLT-15', en: 'Fish Fillet', typos: ['FILTE DE PESCADO', 'FILETE D PESCDO'] },
  { id: 24, name: 'Camarones a la Diabla', category: 'Platos Fuertes', abbr: 'CAM DIABLA', code: 'PLT-16', en: 'Deviled Shrimp', typos: ['CAMARONES ALA DIABLA', 'CAMARNES A LA DIABLA'] },
  { id: 25, name: 'Pollo a la Plancha', category: 'Platos Fuertes', abbr: 'POLLO PLAN', code: 'PLT-17', en: 'Grilled Chicken', typos: ['POLO A LA PLANCHA', 'POLLO ALA PLANCHA'] },
  { id: 26, name: 'Chilaquiles Verdes', category: 'Platos Fuertes', abbr: 'CHILAQ VRD', code: 'PLT-18', en: 'Green Chilaquiles', typos: ['CHILAQUILES VERDE', 'CHILAQILES VERDES'] },
  { id: 27, name: 'Chilaquiles Rojos', category: 'Platos Fuertes', abbr: 'CHILAQ ROJ', code: 'PLT-19', en: 'Red Chilaquiles', typos: ['CHILAQUILES ROJO', 'CHILAQILES ROJOS'] },
  { id: 28, name: 'Milanesa de Res', category: 'Platos Fuertes', abbr: 'MIL RES', code: 'PLT-20', en: 'Beef Milanese', typos: ['MILANEZA DE RES', 'MILANESA D RES'] },

  // ---- Guarniciones (Sides) ---- 6
  { id: 29, name: 'Arroz Rojo', category: 'Guarniciones', abbr: 'ARROZ R', code: 'GRN-01', en: 'Red Rice', typos: ['AROZ ROJO', 'ARROZ ROJO'] },
  { id: 30, name: 'Frijoles Refritos', category: 'Guarniciones', abbr: 'FRIJOLES', code: 'GRN-02', en: 'Refried Beans', typos: ['FRIJOLES REFRTOS', 'FRIJLES REFRITOS'] },
  { id: 31, name: 'Papas Fritas', category: 'Guarniciones', abbr: 'PAPAS FR', code: 'GRN-03', en: 'French Fries', typos: ['PAPAS FRITA', 'PAPAZ FRITAS'], slang: 'Papitas' },
  { id: 32, name: 'Ensalada Cesar', category: 'Guarniciones', abbr: 'ENS CESAR', code: 'GRN-04', en: 'Caesar Salad', typos: ['ENSALDA CESAR', 'ENSALADA CESSAR'] },
  { id: 33, name: 'Ensalada Mixta', category: 'Guarniciones', abbr: 'ENS MIXTA', code: 'GRN-05', en: 'Mixed Salad', typos: ['ENSALDA MIXTA', 'ENSALADA MICTA'] },
  { id: 34, name: 'Esquites', category: 'Guarniciones', abbr: 'ESQUITES', code: 'GRN-06', en: 'Corn Kernels', typos: ['EZQUITES', 'ESQUITES'] },

  // ---- Postres (Desserts) ---- 6
  { id: 35, name: 'Flan Napolitano', category: 'Postres', abbr: 'FLAN', code: 'PST-01', en: 'Neapolitan Flan', typos: ['FLAN NAPOITANO', 'FLAN NAPOLITNO'] },
  { id: 36, name: 'Churros con Chocolate', category: 'Postres', abbr: 'CHURROS', code: 'PST-02', en: 'Churros w/ Chocolate', typos: ['CHUROS CON CHOCOLTE', 'CHURROS CON CHOCLATE'] },
  { id: 37, name: 'Arroz con Leche', category: 'Postres', abbr: 'ARROZ LECHE', code: 'PST-03', en: 'Rice Pudding', typos: ['AROZ CON LECHE', 'ARROZ CON LECE'] },
  { id: 38, name: 'Pastel de Chocolate', category: 'Postres', abbr: 'PASTEL CHOC', code: 'PST-04', en: 'Chocolate Cake', typos: ['PASTEL DE CHOCOLTE', 'PASTEL D CHOCOLATE'] },
  { id: 39, name: 'Helado de Vainilla', category: 'Postres', abbr: 'HELADO VAIN', code: 'PST-05', en: 'Vanilla Ice Cream', typos: ['ELADO DE VAINILLA', 'HELADO DE BAINILLA'] },
  { id: 40, name: 'Tres Leches', category: 'Postres', abbr: 'TRES LECHES', code: 'PST-06', en: 'Three Milks Cake', typos: ['TRES LECES', 'TREZ LECHES'] },

  // ---- Bebidas (Beverages) ---- 12
  { id: 41, name: 'Coca Cola', category: 'Bebidas', abbr: 'COCA', code: 'BEB-01', en: 'Coca Cola', typos: ['COCA COLA', 'COCACOLA'], slang: 'Coca' },
  { id: 42, name: 'Agua Natural', category: 'Bebidas', abbr: 'AGUA NAT', code: 'BEB-02', en: 'Still Water', typos: ['AGUA NATRAL', 'AGUA NATURAL'] },
  { id: 43, name: 'Agua Mineral', category: 'Bebidas', abbr: 'AGUA MIN', code: 'BEB-03', en: 'Sparkling Water', typos: ['AGUA MINRAL', 'AGUA MINERAL'] },
  { id: 44, name: 'Cerveza Corona', category: 'Bebidas', abbr: 'CRV CORONA', code: 'BEB-04', en: 'Corona Beer', typos: ['CERVESA CORONA', 'CERVEZA CARONA'] },
  { id: 45, name: 'Cerveza Modelo', category: 'Bebidas', abbr: 'CRV MODELO', code: 'BEB-05', en: 'Modelo Beer', typos: ['CERVESA MODELO', 'CERVEZA MODDELO'] },
  { id: 46, name: 'Margarita', category: 'Bebidas', abbr: 'MARG', code: 'BEB-06', en: 'Margarita', typos: ['MARGRITA', 'MARGARIT'] },
  { id: 47, name: 'Cafe Americano', category: 'Bebidas', abbr: 'CAFE AMER', code: 'BEB-07', en: 'American Coffee', typos: ['CAFE AMRICANO', 'CAFE AMERICNO'] },
  { id: 48, name: 'Cafe con Leche', category: 'Bebidas', abbr: 'CAFE LECHE', code: 'BEB-08', en: 'Coffee with Milk', typos: ['CAFE CON LECE', 'CAFE C LECHE'] },
  { id: 49, name: 'Jugo de Naranja', category: 'Bebidas', abbr: 'JUGO NAR', code: 'BEB-09', en: 'Orange Juice', typos: ['JUGO DE NARANJA', 'JUGO D NARANJA'] },
  { id: 50, name: 'Limonada', category: 'Bebidas', abbr: 'LIMON', code: 'BEB-10', en: 'Lemonade', typos: ['LIMONADA', 'LIMONDA'] },
  { id: 51, name: 'Horchata', category: 'Bebidas', abbr: 'HORCHATA', code: 'BEB-11', en: 'Horchata', typos: ['ORCHATA', 'HORCHATA'] },
  { id: 52, name: 'Jamaica', category: 'Bebidas', abbr: 'JAMAICA', code: 'BEB-12', en: 'Hibiscus Tea', typos: ['JAMICA', 'HAMAICA'] },

  // ---- Extras ---- 8
  { id: 53, name: 'Salsa Extra', category: 'Extras', abbr: 'SALSA EX', code: 'EXT-01', en: 'Extra Salsa', typos: ['SALSA EXRA', 'SALSA EXTRA'] },
  { id: 54, name: 'Crema Extra', category: 'Extras', abbr: 'CREMA EX', code: 'EXT-02', en: 'Extra Sour Cream', typos: ['CREMA EXRA', 'CREMA EXTRA'] },
  { id: 55, name: 'Pan de la Casa', category: 'Extras', abbr: 'PAN CASA', code: 'EXT-03', en: 'House Bread', typos: ['PAN DE LA CAZA', 'PAN DLA CASA'] },
  { id: 56, name: 'Tortillas de Maiz', category: 'Extras', abbr: 'TORT MAIZ', code: 'EXT-04', en: 'Corn Tortillas', typos: ['TORTILLAS DE MAIS', 'TORTILLAS D MAIZ'] },
  { id: 57, name: 'Tortillas de Harina', category: 'Extras', abbr: 'TORT HAR', code: 'EXT-05', en: 'Flour Tortillas', typos: ['TORTILLAS DE ARINA', 'TORTILLAS D HARINA'] },
  { id: 58, name: 'Aguacate Extra', category: 'Extras', abbr: 'AGUAC EX', code: 'EXT-06', en: 'Extra Avocado', typos: ['AGUACTE EXTRA', 'AGUACATE EXRA'] },
  { id: 59, name: 'Queso Extra', category: 'Extras', abbr: 'QUESO EX', code: 'EXT-07', en: 'Extra Cheese', typos: ['QESO EXTRA', 'QUESO EXRA'] },
  { id: 60, name: 'Chile Habanero', category: 'Extras', abbr: 'CHILE HAB', code: 'EXT-08', en: 'Habanero Pepper', typos: ['CHILE ABANERO', 'CHLE HABANERO'] },
];

// =============================================================================
// 20 NAMING CONVENTIONS
// =============================================================================

export const NAMING_CONVENTIONS: NamingConvention[] = [
  {
    id: 'canonical',
    name: 'Canonical',
    description: 'Standardized product name (title case)',
    transform: (p) => p.name,
  },
  {
    id: 'uppercase',
    name: 'All Uppercase',
    description: 'Common POS register output',
    transform: (p) => p.name.toUpperCase(),
  },
  {
    id: 'lowercase',
    name: 'All Lowercase',
    description: 'Mobile POS entry',
    transform: (p) => p.name.toLowerCase(),
  },
  {
    id: 'abbreviated',
    name: 'Abbreviated',
    description: 'Shortened names for receipt printing',
    transform: (p) => p.abbr,
  },
  {
    id: 'short_code',
    name: 'POS Short Code',
    description: 'System SKU codes',
    transform: (p) => p.code,
  },
  {
    id: 'typo_v1',
    name: 'Common Typo (Variant 1)',
    description: 'First common misspelling',
    transform: (p) => p.typos[0] || p.name.toUpperCase(),
  },
  {
    id: 'typo_v2',
    name: 'Common Typo (Variant 2)',
    description: 'Second common misspelling',
    transform: (p) => p.typos[1] || p.typos[0] || p.name.toUpperCase(),
  },
  {
    id: 'english',
    name: 'English Translation',
    description: 'Tourist-facing or bilingual location',
    transform: (p) => p.en,
  },
  {
    id: 'spanglish',
    name: 'Spanglish Mix',
    description: 'Mixed Spanish/English common at border locations',
    transform: (p) => {
      const words = p.name.split(' ');
      const enWords = p.en.split(' ');
      if (words.length >= 2 && enWords.length >= 2) {
        return words[0] + ' ' + enWords.slice(1).join(' ');
      }
      return p.name + ' (' + p.en + ')';
    },
  },
  {
    id: 'extra_spaces',
    name: 'Extra Spaces',
    description: 'Sloppy data entry with extra whitespace',
    transform: (p) => p.name.toUpperCase().replace(/ /g, '  '),
  },
  {
    id: 'hyphenated',
    name: 'Hyphenated',
    description: 'Words joined with hyphens',
    transform: (p) => p.name.toUpperCase().replace(/ /g, '-'),
  },
  {
    id: 'concatenated',
    name: 'Concatenated',
    description: 'No spaces between words',
    transform: (p) => p.name.toUpperCase().replace(/ /g, ''),
  },
  {
    id: 'size_prefix',
    name: 'Size Prefix',
    description: 'Common in fast-food POS: GDE/MED/CH prefix',
    transform: (p) => {
      const sizes = ['GDE', 'MED', 'CH'];
      const size = sizes[p.id % sizes.length];
      return `${size} ${p.name.toUpperCase()}`;
    },
  },
  {
    id: 'trailing_code',
    name: 'Trailing Code',
    description: 'Name with internal reference number appended',
    transform: (p) => `${p.name.toUpperCase()} #${String(p.id).padStart(2, '0')}`,
  },
  {
    id: 'pos_shorthand',
    name: 'POS Shorthand',
    description: 'Extreme abbreviation for fast entry',
    transform: (p) => {
      const words = p.name.split(' ');
      if (words.length === 1) return words[0].substring(0, 4).toUpperCase();
      return words.map(w => w.substring(0, 3).toUpperCase()).join('.');
    },
  },
  {
    id: 'kitchen_ticket',
    name: 'Kitchen Ticket',
    description: 'Format seen on kitchen display/printer',
    transform: (p) => `1x ${p.abbr}`,
  },
  {
    id: 'misspelled_abbrev',
    name: 'Misspelled + Abbreviated',
    description: 'Abbreviation with typos',
    transform: (p) => {
      const typo = p.typos[0] || p.name;
      const words = typo.split(' ');
      if (words.length <= 1) return typo.substring(0, 6).toUpperCase();
      return words.map(w => w.substring(0, 4)).join(' ').toUpperCase();
    },
  },
  {
    id: 'colloquial',
    name: 'Colloquial/Slang',
    description: 'Informal names staff use verbally',
    transform: (p) => p.slang || `La ${p.name.split(' ')[0]}`,
  },
  {
    id: 'reversed_order',
    name: 'Reversed Word Order',
    description: 'Modifier before main word',
    transform: (p) => {
      const words = p.name.split(' ');
      if (words.length <= 1) return p.name.toUpperCase();
      return [...words.slice(1), words[0]].join(' ').toUpperCase();
    },
  },
  {
    id: 'regional',
    name: 'Regional Variant',
    description: 'Location-specific product names',
    transform: (p) => p.regional || p.name.toUpperCase().replace('DE ', 'D '),
  },
];

// =============================================================================
// VARIANT GENERATION
// =============================================================================

/**
 * Generate a specific variant of a product using a naming convention.
 */
export function generateVariant(product: CanonicalProduct, convention: NamingConvention): string {
  return convention.transform(product);
}

/**
 * Generate all possible variants (20 conventions x 60 products = 1,200).
 */
export function generateAllVariants(): ProductVariant[] {
  const variants: ProductVariant[] = [];

  for (const product of CANONICAL_PRODUCTS) {
    for (const convention of NAMING_CONVENTIONS) {
      variants.push({
        canonicalId: product.id,
        canonicalName: product.name,
        category: product.category,
        conventionId: convention.id,
        variant: convention.transform(product),
      });
    }
  }

  return variants;
}

/**
 * Get a set of messy product descriptions for a specific location.
 * Each location uses 2-3 naming conventions, creating realistic variation.
 *
 * @param locationId - Location identifier (used as seed for convention selection)
 * @param productSubset - Optional subset of product IDs to use (default: all)
 * @returns Map of canonical product name -> messy variant
 */
export function getLocationVariants(
  locationId: string,
  productSubset?: number[]
): Map<string, string> {
  const variants = new Map<string, string>();

  // Use location ID hash to deterministically pick 2-3 conventions
  const hash = simpleHash(locationId);
  const numConventions = 2 + (hash % 2); // 2 or 3 conventions
  const conventionPool = NAMING_CONVENTIONS.filter(c => c.id !== 'canonical');
  const selectedConventions: NamingConvention[] = [];

  for (let i = 0; i < numConventions; i++) {
    const idx = (hash + i * 7) % conventionPool.length;
    selectedConventions.push(conventionPool[idx]);
  }

  const products = productSubset
    ? CANONICAL_PRODUCTS.filter(p => productSubset.includes(p.id))
    : CANONICAL_PRODUCTS;

  for (const product of products) {
    // Pick convention based on product id + location hash
    const convention = selectedConventions[(product.id + hash) % selectedConventions.length];
    variants.set(product.name, convention.transform(product));
  }

  return variants;
}

/**
 * Get the unique raw descriptions a location would produce.
 * Returns array of messy descriptions for use in articulos generation.
 */
export function getLocationDescriptions(locationId: string): Array<{
  canonicalId: number;
  canonicalName: string;
  category: string;
  description: string;
  conventionId: string;
}> {
  const hash = simpleHash(locationId);
  const numConventions = 2 + (hash % 2);
  const conventionPool = NAMING_CONVENTIONS.filter(c => c.id !== 'canonical');
  const selectedConventions: NamingConvention[] = [];

  for (let i = 0; i < numConventions; i++) {
    const idx = (hash + i * 7) % conventionPool.length;
    selectedConventions.push(conventionPool[idx]);
  }

  return CANONICAL_PRODUCTS.map(product => {
    const convention = selectedConventions[(product.id + hash) % selectedConventions.length];
    return {
      canonicalId: product.id,
      canonicalName: product.name,
      category: product.category,
      description: convention.transform(product),
      conventionId: convention.id,
    };
  });
}

/**
 * Get statistics about the variant space.
 */
export function getVariantStats(): {
  totalProducts: number;
  totalConventions: number;
  totalVariants: number;
  categories: Array<{ name: string; count: number }>;
  conventionSummary: Array<{ id: string; name: string }>;
} {
  const catCounts = new Map<string, number>();
  for (const p of CANONICAL_PRODUCTS) {
    catCounts.set(p.category, (catCounts.get(p.category) || 0) + 1);
  }

  return {
    totalProducts: CANONICAL_PRODUCTS.length,
    totalConventions: NAMING_CONVENTIONS.length,
    totalVariants: CANONICAL_PRODUCTS.length * NAMING_CONVENTIONS.length,
    categories: Array.from(catCounts.entries()).map(([name, count]) => ({ name, count })),
    conventionSummary: NAMING_CONVENTIONS.map(c => ({ id: c.id, name: c.name })),
  };
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
