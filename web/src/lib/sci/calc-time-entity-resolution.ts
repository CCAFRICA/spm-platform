/**
 * HF-196 Phase 2: Calc-time entity resolution.
 *
 * Implements the calc-time entity binding architecture per Decision 92
 * (Calculation Sovereignty / IGF-T1-E904) and OB-182's stated intent:
 * "engine resolves at calc time." The calc-side replacement for the
 * post-import back-link work that OB-182 removed.
 *
 * Engineering decision (architect-pre-authorized, HF-196 directive Phase 2):
 *   Durable update at calc time. Engine reads `committed_data.entity_id`
 *   directly (no engine refactor needed). Resolver UPDATEs the column for
 *   rows where entity_id IS NULL and an entities-table match exists.
 *
 * Coexists with HF-196 Phase 1 import-time back-link (defense in depth):
 *   Import-time path populates entity_id immediately for typical imports.
 *   Calc-time path catches any rows the import-time path missed (late-arriving
 *   data, prior tenant state, etc.). The two paths are mutually idempotent.
 *
 * Korean Test (IGF-T1-E910) compliance:
 *   - Tenant-agnostic: tenant_id is a runtime parameter
 *   - Entity matching delegates to resolveEntitiesFromCommittedData which
 *     uses structural identifiers from `field_identities` metadata, not
 *     hardcoded field names
 *   - Zero domain-specific string literals
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveEntitiesFromCommittedData } from './entity-resolution';

export interface CalcTimeEntityResolutionResult {
  totalNullRowsBefore: number;
  matched: number;
  unmatched: number;
  durationMs: number;
}

/**
 * Run calc-time entity resolution for a tenant.
 *
 * Reads count of `committed_data` rows with NULL `entity_id` (before),
 * delegates to `resolveEntitiesFromCommittedData` for structural matching
 * + back-link UPDATE, then reads count of NULL rows again (after) to
 * compute matched/unmatched counts.
 *
 * Idempotent: safe to call repeatedly. A second call against an already-
 * resolved tenant returns matched=0 since no rows remain with NULL entity_id
 * matchable against existing entities.
 *
 * Non-blocking: errors surface via console.error and the function returns
 * zeros for matched/unmatched. The calc run continues; rows with unresolved
 * entity_id are surfaced as data-quality signals (handled by caller).
 */
export async function resolveEntitiesAtCalcTime(
  tenantId: string,
  supabase: SupabaseClient,
): Promise<CalcTimeEntityResolutionResult> {
  const startedAt = Date.now();

  // Count rows with NULL entity_id before resolution
  const beforeCountQ = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null);

  if (beforeCountQ.error) {
    console.error(
      `[CalcTimeEntityResolution] tenant=${tenantId} pre-count query failed:`,
      beforeCountQ.error.message,
    );
    return {
      totalNullRowsBefore: 0,
      matched: 0,
      unmatched: 0,
      durationMs: Date.now() - startedAt,
    };
  }
  const totalNullRowsBefore = beforeCountQ.count ?? 0;

  if (totalNullRowsBefore === 0) {
    // No work to do
    return {
      totalNullRowsBefore: 0,
      matched: 0,
      unmatched: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  // Delegate structural matching to existing library function (Korean Test compliant)
  try {
    await resolveEntitiesFromCommittedData(supabase, tenantId);
  } catch (err) {
    console.error(
      `[CalcTimeEntityResolution] tenant=${tenantId} resolveEntitiesFromCommittedData threw (non-blocking):`,
      err,
    );
    return {
      totalNullRowsBefore,
      matched: 0,
      unmatched: totalNullRowsBefore,
      durationMs: Date.now() - startedAt,
    };
  }

  // Count rows still with NULL entity_id after resolution
  const afterCountQ = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('entity_id', null);

  if (afterCountQ.error) {
    console.error(
      `[CalcTimeEntityResolution] tenant=${tenantId} post-count query failed:`,
      afterCountQ.error.message,
    );
    return {
      totalNullRowsBefore,
      matched: 0,
      unmatched: totalNullRowsBefore,
      durationMs: Date.now() - startedAt,
    };
  }
  const unmatched = afterCountQ.count ?? 0;
  const matched = totalNullRowsBefore - unmatched;

  return {
    totalNullRowsBefore,
    matched,
    unmatched,
    durationMs: Date.now() - startedAt,
  };
}
