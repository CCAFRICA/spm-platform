/**
 * ML Flywheel Verification Test
 *
 * Proves that the normalization dictionary learns from user actions:
 *
 *   1. Seed dictionary (~200 entries from weeks 1-5)
 *   2. Classify week 6 articulos -> record auto-resolved count
 *   3. Accept ALL week 6 suggestions (dictionary grows)
 *   4. Classify week 7 articulos -> record auto-resolved count
 *   5. Assert: week 7 auto-resolved > week 6 auto-resolved
 *
 * This is the core ML Flywheel: the more users accept/correct,
 * the more the system auto-resolves on the next import.
 *
 * Hard Gate HG-7: Week 7 auto-resolved count > Week 6 auto-resolved count
 */

import {
  classifyBatch,
  acceptSuggestion,
  getDictionaryStats,
} from './normalization-engine';
import { seedNormalizationDictionary } from './dictionary-seeder';
import { generateWeekData } from '@/lib/demo/frmx-data-generator';
import { parseArticulosFile, extractRawDescriptions } from '@/lib/financial/articulos-parser';

// =============================================================================
// TYPES
// =============================================================================

export interface FlywheelResult {
  passed: boolean;
  week6: {
    totalDescriptions: number;
    autoResolved: number;
    suggested: number;
    manual: number;
    autoRate: number;
  };
  week7: {
    totalDescriptions: number;
    autoResolved: number;
    suggested: number;
    manual: number;
    autoRate: number;
  };
  dictionaryGrowth: {
    beforeWeek6: number;
    afterWeek6Accepts: number;
    afterWeek7: number;
  };
  message: string;
}

// =============================================================================
// VERIFICATION
// =============================================================================

/**
 * Run the full ML Flywheel verification.
 *
 * IMPORTANT: This seeds dictionary and accepts suggestions.
 * Run on a tenant that can be reset (e.g., 'flywheel-test').
 */
export async function runFlywheelVerification(
  tenantId: string = 'flywheel-test'
): Promise<FlywheelResult> {
  console.log('[Flywheel] Starting ML Flywheel verification...');

  // Step 1: Seed dictionary
  console.log('[Flywheel] Step 1: Seeding dictionary...');
  const seedCount = seedNormalizationDictionary(tenantId);
  const dictBefore = getDictionaryStats(tenantId);
  console.log(`[Flywheel] Seeded ${seedCount} entries (${dictBefore.totalEntries} in dict)`);

  // Step 2: Generate and classify week 6
  console.log('[Flywheel] Step 2: Generating week 6 data...');
  const week6Data = generateWeekData(6);
  const week6Parsed = parseArticulosFile(week6Data.articulosTSV, 'week6.tsv');
  const week6Descriptions = extractRawDescriptions(week6Parsed.articulos);

  console.log(`[Flywheel] Classifying ${week6Descriptions.length} week 6 descriptions...`);
  const week6Result = await classifyBatch(tenantId, week6Descriptions);

  const week6Stats = {
    totalDescriptions: week6Result.stats.total,
    autoResolved: week6Result.stats.autoClassified,
    suggested: week6Result.stats.suggested,
    manual: week6Result.stats.manual,
    autoRate: week6Result.stats.total > 0
      ? week6Result.stats.autoClassified / week6Result.stats.total
      : 0,
  };

  console.log(`[Flywheel] Week 6: ${week6Stats.autoResolved} auto, ${week6Stats.suggested} suggest, ${week6Stats.manual} manual`);

  // Step 3: Accept all week 6 suggestions (simulate user review)
  console.log('[Flywheel] Step 3: Accepting all week 6 suggestions...');
  let acceptCount = 0;
  for (const entry of week6Result.entries) {
    if (entry.tier === 'suggest' || entry.tier === 'manual') {
      acceptSuggestion(tenantId, entry, 'flywheel-test');
      acceptCount++;
    }
  }
  console.log(`[Flywheel] Accepted ${acceptCount} suggestions`);

  const dictAfterAccepts = getDictionaryStats(tenantId);
  console.log(`[Flywheel] Dictionary grew to ${dictAfterAccepts.totalEntries} entries`);

  // Step 4: Generate and classify week 7
  console.log('[Flywheel] Step 4: Generating week 7 data...');
  const week7Data = generateWeekData(7);
  const week7Parsed = parseArticulosFile(week7Data.articulosTSV, 'week7.tsv');
  const week7Descriptions = extractRawDescriptions(week7Parsed.articulos);

  console.log(`[Flywheel] Classifying ${week7Descriptions.length} week 7 descriptions...`);
  const week7Result = await classifyBatch(tenantId, week7Descriptions);

  const week7Stats = {
    totalDescriptions: week7Result.stats.total,
    autoResolved: week7Result.stats.autoClassified,
    suggested: week7Result.stats.suggested,
    manual: week7Result.stats.manual,
    autoRate: week7Result.stats.total > 0
      ? week7Result.stats.autoClassified / week7Result.stats.total
      : 0,
  };

  console.log(`[Flywheel] Week 7: ${week7Stats.autoResolved} auto, ${week7Stats.suggested} suggest, ${week7Stats.manual} manual`);

  const dictAfterWeek7 = getDictionaryStats(tenantId);

  // Step 5: Verify flywheel
  const passed = week7Stats.autoResolved > week6Stats.autoResolved;
  const message = passed
    ? `PASS: Week 7 auto-resolved (${week7Stats.autoResolved}) > Week 6 auto-resolved (${week6Stats.autoResolved}). Flywheel working.`
    : `FAIL: Week 7 auto-resolved (${week7Stats.autoResolved}) <= Week 6 auto-resolved (${week6Stats.autoResolved}). Flywheel not improving.`;

  console.log(`[Flywheel] ${message}`);

  return {
    passed,
    week6: week6Stats,
    week7: week7Stats,
    dictionaryGrowth: {
      beforeWeek6: dictBefore.totalEntries,
      afterWeek6Accepts: dictAfterAccepts.totalEntries,
      afterWeek7: dictAfterWeek7.totalEntries,
    },
    message,
  };
}

/**
 * Quick check: just compare dictionary sizes without full classification.
 * Useful for verifying that acceptSuggestion grows the dictionary.
 */
export function checkDictionaryGrowth(tenantId: string): {
  entries: number;
  totalHits: number;
  avgConfidence: number;
  topCategories: string[];
} {
  const stats = getDictionaryStats(tenantId);

  return {
    entries: stats.totalEntries,
    totalHits: stats.totalHits,
    avgConfidence: stats.avgConfidence,
    topCategories: stats.topCategories.map(c => `${c.category} (${c.count})`),
  };
}
