/**
 * Normalization Engine
 *
 * 3-tier AI classification system for messy product/service descriptions:
 *   Tier 1 (Auto):    Dictionary hit with confidence >= 0.9 -- auto-mapped
 *   Tier 2 (Suggest): AI classification with confidence 0.5-0.89 -- user review
 *   Tier 3 (Manual):  Low confidence or no match -- user must classify
 *
 * The dictionary learns from user corrections. Over time, Tier 1 grows
 * and Tier 3 shrinks as the system observes the customer's data patterns.
 *
 * Korean Test: All category names, product descriptions, and field labels
 * come from the data. Zero hardcoded product or category names.
 */

import { getAIService } from '@/lib/ai/ai-service';

// =============================================================================
// TYPES
// =============================================================================

export type ClassificationTier = 'auto' | 'suggest' | 'manual';

export interface NormalizationEntry {
  id: string;
  rawValue: string;
  normalizedValue: string;
  category: string;
  tier: ClassificationTier;
  confidence: number;
  source: 'dictionary' | 'ai' | 'user';
  reviewed: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface DictionaryEntry {
  rawPattern: string;          // Lowercase trimmed raw value or regex pattern
  normalizedValue: string;
  category: string;
  confidence: number;
  hitCount: number;
  lastUsed: string;
  createdBy: string;           // 'system' | 'ai' | user name
  createdAt: string;
}

export interface NormalizationResult {
  entries: NormalizationEntry[];
  stats: {
    total: number;
    autoClassified: number;
    suggested: number;
    manual: number;
    dictionaryHits: number;
    aiClassified: number;
  };
}

export interface CategoryDefinition {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
}

// =============================================================================
// DICTIONARY
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DICT_PREFIX = 'vialuce_norm_dict_';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ENTRY_PREFIX = 'vialuce_norm_entries_';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CATEGORY_PREFIX = 'vialuce_norm_categories_';

/**
 * Load the normalization dictionary for a tenant.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function loadDictionary(_tenantId: string): DictionaryEntry[] {
  return [];
}

/**
 * Save the normalization dictionary.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function saveDictionary(_tenantId: string, _entries: DictionaryEntry[]): void {
  // no-op: localStorage removed
}

/**
 * Add or update a dictionary entry. Increments hit count if exists.
 */
export function upsertDictionaryEntry(
  tenantId: string,
  rawPattern: string,
  normalizedValue: string,
  category: string,
  confidence: number,
  createdBy: string
): DictionaryEntry {
  const dict = loadDictionary(tenantId);
  const pattern = rawPattern.toLowerCase().trim();
  const existing = dict.find(d => d.rawPattern === pattern);

  if (existing) {
    existing.normalizedValue = normalizedValue;
    existing.category = category;
    existing.confidence = Math.max(existing.confidence, confidence);
    existing.hitCount += 1;
    existing.lastUsed = new Date().toISOString();
    saveDictionary(tenantId, dict);
    return existing;
  }

  const entry: DictionaryEntry = {
    rawPattern: pattern,
    normalizedValue,
    category,
    confidence,
    hitCount: 1,
    lastUsed: new Date().toISOString(),
    createdBy,
    createdAt: new Date().toISOString(),
  };
  dict.push(entry);
  saveDictionary(tenantId, dict);
  return entry;
}

/**
 * Look up a raw value in the dictionary.
 * Returns the best match with confidence, or null.
 */
export function dictionaryLookup(
  tenantId: string,
  rawValue: string
): DictionaryEntry | null {
  const dict = loadDictionary(tenantId);
  const normalized = rawValue.toLowerCase().trim();

  // Exact match first
  const exact = dict.find(d => d.rawPattern === normalized);
  if (exact) return exact;

  // Fuzzy: check if any pattern is contained in the value
  for (const entry of dict) {
    if (normalized.includes(entry.rawPattern) || entry.rawPattern.includes(normalized)) {
      // Reduce confidence for partial match
      return { ...entry, confidence: entry.confidence * 0.8 };
    }
  }

  return null;
}

// =============================================================================
// CATEGORIES
// =============================================================================

/**
 * Load category definitions for a tenant.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function loadCategories(_tenantId: string): CategoryDefinition[] {
  return [];
}

/**
 * Save category definitions.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function saveCategories(_tenantId: string, _categories: CategoryDefinition[]): void {
  // no-op: localStorage removed
}

/**
 * Add a category if it doesn't exist.
 */
export function ensureCategory(
  tenantId: string,
  id: string,
  name: string,
  description?: string,
  parentId?: string
): void {
  const cats = loadCategories(tenantId);
  if (cats.find(c => c.id === id)) return;
  cats.push({ id, name, description, parentId });
  saveCategories(tenantId, cats);
}

// =============================================================================
// NORMALIZATION ENGINE
// =============================================================================

/**
 * Classify a batch of raw values through the 3-tier system.
 *
 * 1. Check dictionary (Tier 1: auto)
 * 2. AI classification for unknowns (Tier 2: suggest or Tier 3: manual)
 * 3. Return all entries with tier assignments
 */
export async function classifyBatch(
  tenantId: string,
  rawValues: string[],
  existingCategories?: string[]
): Promise<NormalizationResult> {
  const entries: NormalizationEntry[] = [];
  const unknowns: Array<{ index: number; value: string }> = [];

  // Phase 1: Dictionary lookup (Tier 1)
  for (let i = 0; i < rawValues.length; i++) {
    const raw = rawValues[i];
    const dictHit = dictionaryLookup(tenantId, raw);

    if (dictHit && dictHit.confidence >= 0.9) {
      // Tier 1: Auto-classified
      entries.push({
        id: `norm-${i}-${Date.now()}`,
        rawValue: raw,
        normalizedValue: dictHit.normalizedValue,
        category: dictHit.category,
        tier: 'auto',
        confidence: dictHit.confidence,
        source: 'dictionary',
        reviewed: false,
        createdAt: new Date().toISOString(),
      });
      // Increment hit count
      upsertDictionaryEntry(
        tenantId,
        dictHit.rawPattern,
        dictHit.normalizedValue,
        dictHit.category,
        dictHit.confidence,
        'system'
      );
    } else {
      unknowns.push({ index: i, value: raw });
    }
  }

  // Phase 2: AI classification for unknowns
  if (unknowns.length > 0) {
    try {
      const aiService = getAIService();
      const categories = existingCategories || loadCategories(tenantId).map(c => c.name);

      // Batch AI call (up to 50 at a time)
      const batchSize = 50;
      for (let batch = 0; batch < unknowns.length; batch += batchSize) {
        const batchItems = unknowns.slice(batch, batch + batchSize);
        const response = await aiService.execute(
          {
            task: 'recommendation',
            input: {
              analysisData: {
                items: batchItems.map(u => u.value),
                knownCategories: categories,
              },
              context: {
                type: 'product_normalization',
                instructions: [
                  'Classify each product/service description into a normalized name and category.',
                  'For each item, return: normalizedName (clean, standardized name),',
                  'category (from known categories if possible, or suggest a new one),',
                  'and confidence (0-1, how certain you are).',
                  'Handle abbreviations, misspellings, and varying formats.',
                  'Return JSON array with same order as input items.',
                ].join(' '),
              },
            },
            options: { responseFormat: 'json' },
          },
          true,
          { tenantId, userId: 'system' }
        );

        // Parse AI results
        const results = parseAIClassificationResults(response.result, batchItems.length);

        for (let j = 0; j < batchItems.length; j++) {
          const unknown = batchItems[j];
          const aiResult = results[j];
          const confidence = aiResult?.confidence || 0;
          const tier: ClassificationTier = confidence >= 0.5 ? 'suggest' : 'manual';

          entries.push({
            id: `norm-${unknown.index}-${Date.now()}`,
            rawValue: unknown.value,
            normalizedValue: aiResult?.normalizedName || unknown.value,
            category: aiResult?.category || 'Uncategorized',
            tier,
            confidence,
            source: 'ai',
            reviewed: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.warn('[Normalization] AI classification failed (non-fatal):', err);
      // Fall back to manual for all unknowns
      for (const unknown of unknowns) {
        entries.push({
          id: `norm-${unknown.index}-${Date.now()}`,
          rawValue: unknown.value,
          normalizedValue: unknown.value,
          category: 'Uncategorized',
          tier: 'manual',
          confidence: 0,
          source: 'ai',
          reviewed: false,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  // Sort entries by original index (maintain input order)
  entries.sort((a, b) => {
    const aIdx = parseInt(a.id.split('-')[1]);
    const bIdx = parseInt(b.id.split('-')[1]);
    return aIdx - bIdx;
  });

  const stats = {
    total: entries.length,
    autoClassified: entries.filter(e => e.tier === 'auto').length,
    suggested: entries.filter(e => e.tier === 'suggest').length,
    manual: entries.filter(e => e.tier === 'manual').length,
    dictionaryHits: entries.filter(e => e.source === 'dictionary').length,
    aiClassified: entries.filter(e => e.source === 'ai').length,
  };

  return { entries, stats };
}

/**
 * Parse AI classification response into structured results.
 */
function parseAIClassificationResults(
  result: unknown,
  expectedCount: number
): Array<{ normalizedName: string; category: string; confidence: number }> {
  const defaults = Array.from({ length: expectedCount }, () => ({
    normalizedName: '',
    category: 'Uncategorized',
    confidence: 0,
  }));

  if (!result) return defaults;

  try {
    // Handle various AI response formats
    let items: unknown[];

    if (Array.isArray(result)) {
      items = result;
    } else if (typeof result === 'object' && result !== null) {
      const obj = result as Record<string, unknown>;
      if (Array.isArray(obj.items)) {
        items = obj.items;
      } else if (Array.isArray(obj.classifications)) {
        items = obj.classifications;
      } else if (Array.isArray(obj.results)) {
        items = obj.results;
      } else {
        return defaults;
      }
    } else {
      return defaults;
    }

    return items.map((item, idx) => {
      if (!item || typeof item !== 'object') return defaults[idx];
      const obj = item as Record<string, unknown>;
      return {
        normalizedName: String(obj.normalizedName || obj.normalized_name || obj.name || ''),
        category: String(obj.category || obj.categoryName || 'Uncategorized'),
        confidence: Number(obj.confidence || 0),
      };
    });
  } catch {
    return defaults;
  }
}

/**
 * Accept a normalization suggestion -- learn it into the dictionary.
 */
export function acceptSuggestion(
  tenantId: string,
  entry: NormalizationEntry,
  reviewedBy: string,
  correctedValue?: string,
  correctedCategory?: string
): NormalizationEntry {
  const finalValue = correctedValue || entry.normalizedValue;
  const finalCategory = correctedCategory || entry.category;

  // Learn into dictionary with boosted confidence
  upsertDictionaryEntry(
    tenantId,
    entry.rawValue,
    finalValue,
    finalCategory,
    Math.min(0.95, entry.confidence + 0.1),
    reviewedBy
  );

  // Ensure category exists
  ensureCategory(tenantId, finalCategory.toLowerCase().replace(/\s+/g, '_'), finalCategory);

  // Return updated entry
  return {
    ...entry,
    normalizedValue: finalValue,
    category: finalCategory,
    reviewed: true,
    reviewedBy,
    reviewedAt: new Date().toISOString(),
  };
}

/**
 * Reject a suggestion -- mark as manual, don't learn.
 */
export function rejectSuggestion(
  entry: NormalizationEntry,
  reviewedBy: string
): NormalizationEntry {
  return {
    ...entry,
    tier: 'manual',
    reviewed: true,
    reviewedBy,
    reviewedAt: new Date().toISOString(),
  };
}

// =============================================================================
// PERSISTENCE
// =============================================================================

/**
 * Save normalization entries for a batch/import session.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function saveNormalizationEntries(_tenantId: string, _sessionId: string, _entries: NormalizationEntry[]): void {
  // no-op: localStorage removed
}

/**
 * Load normalization entries for a batch/import session.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function loadNormalizationEntries(_tenantId: string, _sessionId: string): NormalizationEntry[] {
  return [];
}

/**
 * Get dictionary statistics for a tenant.
 */
export function getDictionaryStats(tenantId: string): {
  totalEntries: number;
  topCategories: Array<{ category: string; count: number }>;
  avgConfidence: number;
  totalHits: number;
} {
  const dict = loadDictionary(tenantId);
  const catCounts = new Map<string, number>();

  let totalConfidence = 0;
  let totalHits = 0;

  for (const entry of dict) {
    const count = catCounts.get(entry.category) || 0;
    catCounts.set(entry.category, count + 1);
    totalConfidence += entry.confidence;
    totalHits += entry.hitCount;
  }

  const topCategories = Array.from(catCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalEntries: dict.length,
    topCategories,
    avgConfidence: dict.length > 0 ? totalConfidence / dict.length : 0,
    totalHits,
  };
}
