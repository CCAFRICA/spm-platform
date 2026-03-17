/**
 * Fingerprint Flywheel — DS-017 §3-4
 *
 * Three Tiers of Recognition:
 *   Tier 1: Exact tenant-specific fingerprint match → skip LLM entirely
 *   Tier 2: Foundational (cross-tenant) match → targeted LLM prompt
 *   Tier 3: Novel structure → full LLM classification
 *
 * Read Path (§4.2): Check before LLM call
 * Write Path: After every successful classification
 *
 * OB-174 Phase 3
 */

import { createClient } from '@supabase/supabase-js';
import { computeFingerprintHashSync } from './structural-fingerprint';

export interface FlywheelLookupResult {
  tier: 1 | 2 | 3;
  match: boolean;
  fingerprintHash: string;
  classificationResult: Record<string, unknown> | null;
  columnRoles: Record<string, string> | null;
  confidence: number;
  matchCount: number;
}

/**
 * Read Path — Query structural_fingerprints for a match.
 * Returns tier assignment and cached classification if found.
 */
export async function lookupFingerprint(
  tenantId: string,
  columns: string[],
  sampleRows: Record<string, unknown>[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<FlywheelLookupResult> {
  const fingerprintHash = computeFingerprintHashSync(columns, sampleRows);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Tier 1: Exact tenant-specific match
  const { data: tier1 } = await supabase
    .from('structural_fingerprints')
    .select('classification_result, column_roles, match_count, confidence')
    .eq('tenant_id', tenantId)
    .eq('fingerprint_hash', fingerprintHash)
    .maybeSingle();

  if (tier1 && tier1.classification_result && Object.keys(tier1.classification_result as object).length > 0) {
    console.log(`[SCI-FINGERPRINT] tier=1 match=true hash=${fingerprintHash.substring(0, 12)} confidence=${tier1.confidence} matchCount=${tier1.match_count}`);
    console.log(`[SCI-FINGERPRINT] LLM skipped — Tier 1 match from ${tier1.match_count} prior imports`);
    return {
      tier: 1,
      match: true,
      fingerprintHash,
      classificationResult: tier1.classification_result as Record<string, unknown>,
      columnRoles: tier1.column_roles as Record<string, string>,
      confidence: Number(tier1.confidence),
      matchCount: tier1.match_count,
    };
  }

  // Tier 2: Foundational (cross-tenant) match — same hash, tenant_id IS NULL
  const { data: tier2 } = await supabase
    .from('structural_fingerprints')
    .select('classification_result, column_roles, match_count, confidence')
    .is('tenant_id', null)
    .eq('fingerprint_hash', fingerprintHash)
    .maybeSingle();

  if (tier2 && tier2.classification_result && Object.keys(tier2.classification_result as object).length > 0) {
    console.log(`[SCI-FINGERPRINT] tier=2 match=true hash=${fingerprintHash.substring(0, 12)} confidence=${tier2.confidence} (foundational)`);
    return {
      tier: 2,
      match: true,
      fingerprintHash,
      classificationResult: tier2.classification_result as Record<string, unknown>,
      columnRoles: tier2.column_roles as Record<string, string>,
      confidence: Number(tier2.confidence),
      matchCount: tier2.match_count,
    };
  }

  // Tier 3: No match — novel structure
  console.log(`[SCI-FINGERPRINT] tier=3 match=false hash=${fingerprintHash.substring(0, 12)} — novel structure`);
  console.log(`[SCI-FINGERPRINT] LLM called — Tier 3 novel structure, fingerprint stored for future recognition`);
  return {
    tier: 3,
    match: false,
    fingerprintHash,
    classificationResult: null,
    columnRoles: null,
    confidence: 0,
    matchCount: 0,
  };
}

/**
 * Write Path — Store or update fingerprint after successful classification.
 * Called after every classification (any tier).
 *
 * Tier 1 match: increment match_count, Bayesian confidence update
 * Tier 3 novel: insert new record with initial confidence
 */
export async function writeFingerprint(
  tenantId: string,
  fingerprintHash: string,
  classificationResult: Record<string, unknown>,
  columnRoles: Record<string, string>,
  sourceFileName: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if record exists
    const { data: existing } = await supabase
      .from('structural_fingerprints')
      .select('id, match_count, confidence')
      .eq('tenant_id', tenantId)
      .eq('fingerprint_hash', fingerprintHash)
      .maybeSingle();

    if (existing) {
      // Update: increment match_count, Bayesian confidence update
      const newMatchCount = existing.match_count + 1;
      // Bayesian: confidence approaches 1.0 asymptotically
      // P(correct | N matches) = (N * prior + 0.7) / (N + 1)
      const prior = Number(existing.confidence);
      const newConfidence = Math.min(0.9999, (newMatchCount * prior + 0.7) / (newMatchCount + 1));

      await supabase
        .from('structural_fingerprints')
        .update({
          match_count: newMatchCount,
          confidence: Number(newConfidence.toFixed(4)),
          classification_result: classificationResult,
          column_roles: columnRoles,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      console.log(`[SCI-FINGERPRINT] Updated: hash=${fingerprintHash.substring(0, 12)} matchCount=${newMatchCount} confidence=${newConfidence.toFixed(4)}`);
    } else {
      // Insert new fingerprint record
      await supabase
        .from('structural_fingerprints')
        .insert({
          tenant_id: tenantId,
          fingerprint_hash: fingerprintHash,
          fingerprint: fingerprintHash, // store hash as both for uniqueness
          classification_result: classificationResult,
          column_roles: columnRoles,
          match_count: 1,
          confidence: 0.7000,
          source_file_sample: sourceFileName,
        });

      console.log(`[SCI-FINGERPRINT] Stored new: hash=${fingerprintHash.substring(0, 12)} file=${sourceFileName}`);
    }
  } catch (err) {
    // Flywheel write failure must NEVER block classification
    console.warn(`[SCI-FINGERPRINT] Write failed (non-blocking): ${err instanceof Error ? err.message : 'unknown'}`);
  }
}
