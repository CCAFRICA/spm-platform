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
// OB-203 Phase 4 (DI-7): the HF-247 outcome-quality gate emits a remediation signal on every
// blocked learning write. Fire-and-forget (architect redirect) — remediation must never add
// latency or failure coupling to the import path.
import { fireSignal, buildLearningWriteBlockedSignal } from './comprehension-signal-vocabulary';
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
    // HF-145: Confidence threshold gates Tier 1 routing.
    // Below 0.5 → demote to Tier 2 (re-classify with minimal LLM).
    // Self-correction (OB-177) decreases confidence on binding failures.
    // 3 failures: 0.92 → 0.72 → 0.52 → 0.32 → Tier 2 re-classification triggered.
    const conf = Number(tier1.confidence);
    // HF-247 Phase 2: outcome quality gate at the read surface. Per T1-E906
    // v2 closed-loop intelligence, the cache must not propagate failure as
    // a learned signal. A cached column_roles map carrying any 'unknown'
    // value is a record of failed classification — promoting it to Tier 1
    // authority injects `unknown@0.85` roles into the new import (live BCL
    // evidence: `[SCI-HC-DIAG] sheet=Plan General roles=[BANCO CUMBRE DEL
    // LITORAL:unknown@0.85, …]`), poisoning the next pass with the prior
    // failure. The gate demotes such entries to Tier 2 (caller re-classifies
    // with the LLM). The cache row remains for diagnostic queryability per
    // Decision 153 (failed plan interpretations as L2 signals).
    const cachedRoles = (tier1.column_roles ?? {}) as Record<string, string>;
    const hasUnknownRole = Object.values(cachedRoles).some(role => role === 'unknown' || role === '' || role == null);
    if (conf >= 0.5 && !hasUnknownRole) {
      console.log(`[SCI-FINGERPRINT] tier=1 match=true hash=${fingerprintHash.substring(0, 12)} confidence=${conf} matchCount=${tier1.match_count}`);
      console.log(`[SCI-FINGERPRINT] LLM skipped — Tier 1 match from ${tier1.match_count} prior imports`);
      return {
        tier: 1,
        match: true,
        fingerprintHash,
        classificationResult: tier1.classification_result as Record<string, unknown>,
        columnRoles: cachedRoles,
        confidence: conf,
        matchCount: tier1.match_count,
      };
    }
    if (hasUnknownRole) {
      console.log(`[SCI-FINGERPRINT] tier=1 DEMOTED (poisoned cache): hash=${fingerprintHash.substring(0, 12)} confidence=${conf} — cached column_roles contains 'unknown' (HF-247 outcome quality gate)`);
      // DI-7: the gate blocked a Tier-1 learning READ — emit remediation (fire-and-forget).
      fireSignal(
        buildLearningWriteBlockedSignal({ tenantId, surface: 'tier1_read', reason: 'unknown_role', fingerprintHash }),
        supabaseUrl, supabaseServiceKey,
      );
    }
    // DIAG-010 / OB-178: Demoted Tier 1 returns as Tier 2 match with existing data.
    // Caller runs targeted re-classification (HC + CRR) instead of full Tier 3 LLM.
    // This preserves the flywheel's memory while allowing re-classification.
    console.log(`[SCI-FINGERPRINT] tier=1 DEMOTED to tier=2: hash=${fingerprintHash.substring(0, 12)} confidence=${conf} < 0.5 — returning existing data for re-classification`);
    return {
      tier: 2,
      match: true,
      fingerprintHash,
      classificationResult: tier1.classification_result as Record<string, unknown>,
      columnRoles: tier1.column_roles as Record<string, string>,
      confidence: conf,
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
  // HF-247 Phase 5: cold-start log. When neither Tier 1 nor Tier 2 hit and
  // the tenant has zero prior fingerprints, this is a customer's first
  // import — distinguish it from a "novel-structure-but-other-fingerprints-exist"
  // case so operators can recognize cold-start in production logs. One
  // extra count query per cache miss; negligible at SCI rates.
  const { count: tenantFpCount } = await supabase
    .from('structural_fingerprints')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('granularity', 'sheet'); // OB-203: cold-start = no prior SHEET fingerprints (atom rows excluded)
  if ((tenantFpCount ?? 0) === 0) {
    console.log(`[SCI-FINGERPRINT] cold-start (no prior fingerprints for tenant) — skipping to Tier 3 (HF-247 Phase 5)`);
  }
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
    // HF-247 Phase 2: outcome quality gate at the write surface. A cache
    // entry whose column_roles contains 'unknown' (or empty/null) records
    // a failed classification — promoting it to authority would inject
    // unknown@<confidence> bindings into future imports. Skip the write
    // entirely. The fingerprint isn't suppressed forever: a subsequent
    // successful classification of the same structure will write the
    // resolved roles cleanly.
    const hasUnknownRole = Object.values(columnRoles).some(role => role === 'unknown' || role === '' || role == null);
    if (hasUnknownRole) {
      console.log(`[SCI-FINGERPRINT] Skipped write (failed-outcome quality gate, HF-247): hash=${fingerprintHash.substring(0, 12)} file=${sourceFileName} — columnRoles contains 'unknown'`);
      // DI-7: the gate blocked a fingerprint learning WRITE — emit remediation (fire-and-forget).
      fireSignal(
        buildLearningWriteBlockedSignal({ tenantId, surface: 'fingerprint_write', reason: 'unknown_role', fingerprintHash, sourceFileName }),
        supabaseUrl, supabaseServiceKey,
      );
      return;
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if record exists
    const { data: existing } = await supabase
      .from('structural_fingerprints')
      .select('id, match_count, confidence')
      .eq('tenant_id', tenantId)
      .eq('fingerprint_hash', fingerprintHash)
      .maybeSingle();

    if (existing) {
      // HF-145: Optimistic locking — only update if match_count hasn't changed since read.
      // Prevents parallel worker race condition (DIAG-008: matchCount 12→13→12 in 47ms).
      // If another worker already incremented, this update is a no-op (acceptable loss of one increment).
      const newMatchCount = existing.match_count + 1;
      const newConfidence = 1 - (1 / (newMatchCount + 1));

      const { count: updated } = await supabase
        .from('structural_fingerprints')
        .update({
          match_count: newMatchCount,
          confidence: Number(newConfidence.toFixed(4)),
          classification_result: classificationResult,
          column_roles: columnRoles,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('match_count', existing.match_count);  // optimistic lock

      if (updated === 0) {
        console.log(`[SCI-FINGERPRINT] Skipped (concurrent update): hash=${fingerprintHash.substring(0, 12)}`);
      } else {
        console.log(`[SCI-FINGERPRINT] Updated: hash=${fingerprintHash.substring(0, 12)} matchCount=${newMatchCount} confidence=${newConfidence.toFixed(4)}`);
      }
    } else {
      // Insert new fingerprint record — confidence = 1 - 1/(1+1) = 0.5
      await supabase
        .from('structural_fingerprints')
        .insert({
          tenant_id: tenantId,
          fingerprint_hash: fingerprintHash,
          fingerprint: fingerprintHash,
          granularity: 'sheet', // OB-203: explicit (sheet path; atom rows go via atom-flywheel)
          classification_result: classificationResult,
          column_roles: columnRoles,
          match_count: 1,
          confidence: 0.5,
          source_file_sample: sourceFileName,
        });

      console.log(`[SCI-FINGERPRINT] Stored new: hash=${fingerprintHash.substring(0, 12)} file=${sourceFileName}`);
    }
  } catch (err) {
    // Flywheel write failure must NEVER block classification
    console.warn(`[SCI-FINGERPRINT] Write failed (non-blocking): ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

/**
 * HF-218 Component 3 — OB-177 self-correction decrement loop.
 *
 * Symmetric counterpart to writeFingerprint's Bayesian increment (line 152
 * `1 - 1/(matchCount+1)`). Per ADR Decision 2: per-event decrement of -0.20,
 * floored at 0. The arithmetic reproduces the comment at lines 54-55:
 *   3 failures: 0.92 → 0.72 → 0.52 → 0.32 → Tier 2 re-classification triggered.
 *
 * Optimistic-lock pattern mirrors the increment at lines 158-164.
 *
 * Caller invokes on binding-failure paths (e.g., engine structural_exception in
 * HF-218 Component 2). The decrement signal is persisted into classification_signals
 * with signal_type='flywheel:fingerprint_decrement' for SOC-grade audit.
 */
export async function decrementFingerprintConfidence(
  tenantId: string,
  fingerprintHash: string,
  reason: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<{ updated: boolean; preConfidence: number; postConfidence: number }> {
  const DECREMENT = 0.20; // per-event decrement (ADR Decision 2, anchored to fingerprint-flywheel.ts:54-55 arithmetic)
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: existing } = await supabase
      .from('structural_fingerprints')
      .select('id, match_count, confidence')
      .eq('tenant_id', tenantId)
      .eq('fingerprint_hash', fingerprintHash)
      .maybeSingle();

    if (!existing) {
      console.log(`[SCI-FINGERPRINT] HF-218 decrement skipped (no fingerprint): hash=${fingerprintHash.substring(0, 12)}`);
      return { updated: false, preConfidence: 0, postConfidence: 0 };
    }

    const preConfidence = Number(existing.confidence);
    const postConfidence = Math.max(0, preConfidence - DECREMENT);

    const { count: updated } = await supabase
      .from('structural_fingerprints')
      .update({
        confidence: Number(postConfidence.toFixed(4)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('confidence', existing.confidence); // optimistic lock symmetric to increment path

    if (updated === 0) {
      console.log(`[SCI-FINGERPRINT] HF-218 decrement skipped (concurrent update): hash=${fingerprintHash.substring(0, 12)}`);
      return { updated: false, preConfidence, postConfidence: preConfidence };
    }

    console.log(`[SCI-FINGERPRINT] HF-218 decremented: hash=${fingerprintHash.substring(0, 12)} confidence ${preConfidence.toFixed(4)} → ${postConfidence.toFixed(4)} reason=${reason}`);

    // Emit signal via canonical writer (lazy import to avoid circular dependency).
    try {
      const { writeSignal } = await import('@/lib/intelligence/canonical-signal-writer');
      await writeSignal({
        tenantId,
        signalType: 'flywheel:fingerprint_decrement',
        signalValue: {
          fingerprint_hash: fingerprintHash,
          pre_confidence: preConfidence,
          post_confidence: postConfidence,
          decrement_amount: DECREMENT,
          reason,
        },
        confidence: postConfidence,
        source: 'system',
        decisionSource: 'flywheel_self_correction',
      }, supabaseUrl, supabaseServiceKey);
    } catch (sigErr) {
      console.warn(`[SCI-FINGERPRINT] HF-218 decrement signal write failed (non-blocking): ${sigErr instanceof Error ? sigErr.message : 'unknown'}`);
    }

    return { updated: true, preConfidence, postConfidence };
  } catch (err) {
    console.warn(`[SCI-FINGERPRINT] HF-218 decrement failed (non-blocking): ${err instanceof Error ? err.message : 'unknown'}`);
    return { updated: false, preConfidence: 0, postConfidence: 0 };
  }
}
