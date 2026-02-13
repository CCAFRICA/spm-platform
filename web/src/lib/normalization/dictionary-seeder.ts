/**
 * Normalization Dictionary Seeder
 *
 * Pre-seeds the normalization dictionary with ~200 entries representing
 * one month of learned mappings from weeks 1-5. This gives the normalization
 * engine a foundation so that:
 *   - Week 6 import: ~40% auto-resolve (Tier 1), rest need review
 *   - Week 7 import: ~60% auto-resolve (dictionary grew from week 6 reviews)
 *
 * The seed covers 3 naming conventions per product (uppercase, abbreviated,
 * one typo variant) plus selected entries from other conventions.
 *
 * Korean Test: All entries come from the product variant generator.
 * Zero hardcoded product or category names in the seeding logic.
 */

import {
  upsertDictionaryEntry,
  ensureCategory,
  dictionaryLookup,
  loadDictionary,
  saveDictionary,
} from './normalization-engine';
import {
  CANONICAL_PRODUCTS,
  NAMING_CONVENTIONS,
  type CanonicalProduct,
} from './product-variant-generator';

// =============================================================================
// SEED CONFIGURATION
// =============================================================================

// Conventions to seed for ALL products (gives broad coverage)
const ALWAYS_SEED_CONVENTIONS = ['uppercase', 'abbreviated'];

// Conventions to seed for POPULAR products only (top 30 by ID)
const POPULAR_SEED_CONVENTIONS = ['typo_v1', 'lowercase'];

// Conventions to seed for OCCASIONAL products (random 15)
const OCCASIONAL_SEED_CONVENTIONS = ['english', 'hyphenated', 'pos_shorthand'];

// Popularity threshold: products 1-30 are "popular", 31-60 are "long tail"
const POPULAR_THRESHOLD = 30;

// =============================================================================
// SEEDER
// =============================================================================

/**
 * Seed the normalization dictionary with ~200 entries.
 * Simulates a month of learning from weeks 1-5 data.
 *
 * @returns Number of entries seeded
 */
export function seedNormalizationDictionary(tenantId: string): number {
  let count = 0;

  // Step 1: Ensure all product categories exist
  const categories = new Set(CANONICAL_PRODUCTS.map(p => p.category));
  Array.from(categories).forEach(cat => {
    ensureCategory(tenantId, cat.toLowerCase().replace(/\s+/g, '_'), cat);
  });

  // Step 2: Seed ALL products with always-seed conventions
  for (const product of CANONICAL_PRODUCTS) {
    for (const convId of ALWAYS_SEED_CONVENTIONS) {
      const convention = NAMING_CONVENTIONS.find(c => c.id === convId);
      if (!convention) continue;

      const variant = convention.transform(product);
      const confidence = 0.92 + Math.random() * 0.06; // 0.92-0.98
      const hitCount = 5 + Math.floor(Math.random() * 20); // 5-24 hits

      seedEntry(tenantId, variant, product, confidence, hitCount);
      count++;
    }
  }

  // Step 3: Seed POPULAR products with additional conventions
  const popularProducts = CANONICAL_PRODUCTS.filter(p => p.id <= POPULAR_THRESHOLD);
  for (const product of popularProducts) {
    for (const convId of POPULAR_SEED_CONVENTIONS) {
      const convention = NAMING_CONVENTIONS.find(c => c.id === convId);
      if (!convention) continue;

      const variant = convention.transform(product);
      const confidence = 0.88 + Math.random() * 0.08; // 0.88-0.96
      const hitCount = 3 + Math.floor(Math.random() * 12); // 3-14 hits

      seedEntry(tenantId, variant, product, confidence, hitCount);
      count++;
    }
  }

  // Step 4: Seed OCCASIONAL products with niche conventions
  const occasionalProducts = CANONICAL_PRODUCTS.filter(p => p.id % 4 === 0); // Every 4th = 15
  for (const product of occasionalProducts) {
    for (const convId of OCCASIONAL_SEED_CONVENTIONS) {
      const convention = NAMING_CONVENTIONS.find(c => c.id === convId);
      if (!convention) continue;

      const variant = convention.transform(product);
      const confidence = 0.85 + Math.random() * 0.10; // 0.85-0.95
      const hitCount = 1 + Math.floor(Math.random() * 5); // 1-5 hits

      seedEntry(tenantId, variant, product, confidence, hitCount);
      count++;
    }
  }

  console.log(`[Dictionary Seeder] Seeded ${count} entries for tenant ${tenantId}`);
  return count;
}

/**
 * Get the expected seed count without actually seeding.
 */
export function getExpectedSeedCount(): number {
  const alwaysCount = CANONICAL_PRODUCTS.length * ALWAYS_SEED_CONVENTIONS.length;
  const popularCount = CANONICAL_PRODUCTS.filter(p => p.id <= POPULAR_THRESHOLD).length
    * POPULAR_SEED_CONVENTIONS.length;
  const occasionalCount = CANONICAL_PRODUCTS.filter(p => p.id % 4 === 0).length
    * OCCASIONAL_SEED_CONVENTIONS.length;

  return alwaysCount + popularCount + occasionalCount;
}

/**
 * Verify dictionary coverage against a set of raw descriptions.
 * Returns what percentage would auto-resolve.
 */
export function estimateCoverage(
  tenantId: string,
  rawDescriptions: string[]
): {
  total: number;
  covered: number;
  coverageRate: number;
  uncovered: string[];
} {
  // Uses dictionaryLookup imported at top

  let covered = 0;
  const uncovered: string[] = [];

  for (const desc of rawDescriptions) {
    const hit = dictionaryLookup(tenantId, desc);
    if (hit && hit.confidence >= 0.9) {
      covered++;
    } else {
      uncovered.push(desc);
    }
  }

  return {
    total: rawDescriptions.length,
    covered,
    coverageRate: rawDescriptions.length > 0 ? covered / rawDescriptions.length : 0,
    uncovered,
  };
}

// =============================================================================
// INTERNAL
// =============================================================================

function seedEntry(
  tenantId: string,
  rawVariant: string,
  product: CanonicalProduct,
  confidence: number,
  hitCount: number
): void {
  // Use upsertDictionaryEntry which handles dedup
  const entry = upsertDictionaryEntry(
    tenantId,
    rawVariant,
    product.name,
    product.category,
    Math.round(confidence * 100) / 100,
    'system'
  );

  // Simulate hit count from weeks 1-5
  entry.hitCount = hitCount;

  // Save the updated entry by re-saving the full dictionary
  // (upsertDictionaryEntry already saved, but we need to update hitCount)
  const dict = loadDictionary(tenantId);
  const existing = dict.find((d: { rawPattern: string }) =>
    d.rawPattern === rawVariant.toLowerCase().trim()
  );
  if (existing) {
    existing.hitCount = hitCount;
    saveDictionary(tenantId, dict);
  }
}
