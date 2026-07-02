// HF-359 (Part A) — the byte budget that sizes each commit pulse to the REAL storage object-size limit,
// discovered at runtime. DIAG-079 established the commit is already pulsed (one CSV per window) but the
// boundary was sized in ROWS (20,000) while the storage limit is in BYTES — a fixed row count has no
// relationship to the real constraint and is wrong for wide files. This module discovers the limit and
// derives the budget; pulse-accumulator.ts uses it to flush a pulse before its CSV would exceed it.
//
// HF-373 Phase E (D6) — the EFFECTIVE per-object cap is the MINIMUM of every cap in force, not the
// bucket's file_size_limit alone. On 2026-07-02 the bucket limit was raised to 100MiB (HF-372
// pre-deploy step) while the Supabase PROJECT-GLOBAL upload cap stayed at its default — the budget
// grew to 0.8×100MiB, the first ~84MB pulse exceeded the real (~50MiB) cap, and the 86,607-row
// staging failed at part 1 ("The object exceeded the maximum allowed size"). The global cap is NOT
// readable via the storage REST API, so it is encoded here as an architect-verifiable configuration
// (SUPABASE_GLOBAL_UPLOAD_LIMIT_BYTES) with the Supabase default (50MiB) as the conservative floor.
// The platform adapts to whatever cap exists — raising limits is never the fix (HF-373 §1 D6).
//
// THE ONLY CONSTANTS ARE LABELED SAFETY BOUNDS — none is the pulse-sizing mechanism:
//   HEADROOM_FRACTION   — a safety margin below the limit (CSV quoting/encoding variance + the rare
//                         remediation-grown cell that the pre-commit byte estimate does not yet see).
//   FALLBACK_LIMIT_BYTES — the conservative last-resort used ONLY when the bucket's file_size_limit is
//                         null/unreadable. It SURFACES when used.
//   GLOBAL_UPLOAD_LIMIT_DEFAULT_BYTES — the Supabase project-global per-object upload cap default;
//                         overridden by SUPABASE_GLOBAL_UPLOAD_LIMIT_BYTES when the architect has
//                         verified a different project setting (SR-44).
//   MAX_PULSE_ROWS      — an upper safety cap on rows-per-pulse (bounds the raw rows held in memory for a
//                         pathologically narrow file); NOT the boundary — the byte budget governs.

import type { SupabaseClient } from '@supabase/supabase-js';

export const HEADROOM_FRACTION = 0.8;
export const FALLBACK_LIMIT_BYTES = 40 * 1024 * 1024; // 40 MB — below common Supabase global defaults
export const GLOBAL_UPLOAD_LIMIT_DEFAULT_BYTES = 50 * 1024 * 1024; // Supabase project-global default (not API-readable)
export const MAX_PULSE_ROWS = 20_000;                 // former CHUNK_ROW_SIZE, demoted to a safety cap

export interface UploadBudget {
  /** Bytes a single pulse's CSV must not exceed = floor(HEADROOM_FRACTION × effectiveLimit). */
  byteBudget: number;
  /** The EFFECTIVE limit the budget derives from = min(bucket limit | fallback, global cap). */
  effectiveLimit: number;
  /** Which cap governed the minimum. 'fallback' means the bucket limit was unreadable and SURFACED. */
  limitSource: 'bucket' | 'fallback' | 'global-env' | 'global-default';
}

/** The project-global per-object cap: architect-verified env override, else the Supabase default. */
export function globalUploadCap(): { bytes: number; source: 'global-env' | 'global-default' } {
  const raw = process.env.SUPABASE_GLOBAL_UPLOAD_LIMIT_BYTES;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return { bytes: Math.floor(parsed), source: 'global-env' };
  return { bytes: GLOBAL_UPLOAD_LIMIT_DEFAULT_BYTES, source: 'global-default' };
}

/** PURE min-cap composition (unit-tested): the effective limit is the smallest cap in force. */
export function composeEffectiveLimit(
  bucketLimit: number | null,
  global: { bytes: number; source: 'global-env' | 'global-default' },
): { effectiveLimit: number; limitSource: UploadBudget['limitSource'] } {
  const bucketBytes = bucketLimit != null && bucketLimit > 0 ? bucketLimit : FALLBACK_LIMIT_BYTES;
  const bucketSource: UploadBudget['limitSource'] = bucketLimit != null && bucketLimit > 0 ? 'bucket' : 'fallback';
  if (bucketBytes <= global.bytes) return { effectiveLimit: bucketBytes, limitSource: bucketSource };
  return { effectiveLimit: global.bytes, limitSource: global.source };
}

/**
 * Discover the upload byte budget for `bucket` at runtime: min(bucket file_size_limit | fallback,
 * project-global cap). When the bucket limit is null/unreadable the conservative fallback floor stands
 * in AND is surfaced (warn + limitSource='fallback') — never a silent guess. Never throws.
 */
export async function discoverUploadByteBudget(supabase: SupabaseClient, bucket = 'ingestion-raw'): Promise<UploadBudget> {
  let bucketLimit: number | null = null;
  try {
    const { data, error } = await supabase.storage.getBucket(bucket);
    const lim = (data as { file_size_limit?: number | null } | null)?.file_size_limit;
    if (!error && typeof lim === 'number' && lim > 0) bucketLimit = lim;
  } catch {
    /* fall through to the fallback floor */
  }
  const { effectiveLimit, limitSource } = composeEffectiveLimit(bucketLimit, globalUploadCap());
  if (limitSource === 'fallback') {
    console.warn(
      `[pulse-budget] '${bucket}'.file_size_limit is null/unreadable — the pulse byte budget is governed by ` +
        `the conservative fallback floor (${(FALLBACK_LIMIT_BYTES / 1048576).toFixed(0)}MB). ` +
        `ARCHITECT: set the bucket's file_size_limit so the budget derives from the real limit (SR-44).`,
    );
  }
  if (limitSource === 'global-default') {
    console.log(
      `[pulse-budget] effective cap = project-global default ${(GLOBAL_UPLOAD_LIMIT_DEFAULT_BYTES / 1048576).toFixed(0)}MB ` +
        `(bucket limit ${bucketLimit != null ? (bucketLimit / 1048576).toFixed(0) + 'MB' : 'unreadable'} exceeds it; ` +
        `set SUPABASE_GLOBAL_UPLOAD_LIMIT_BYTES if the project's global upload cap differs — architect-verified, SR-44).`,
    );
  }
  return { byteBudget: Math.floor(HEADROOM_FRACTION * effectiveLimit), effectiveLimit, limitSource };
}

/**
 * Estimate the total pulse count for honest "~Y" progression (Part B): est. total CSV bytes / byte budget.
 * Never zero (at least one pulse). The count is an ESTIMATE — byte-budgeting's pulse count emerges; this is
 * shown as "~Y" and refined as pulses land.
 */
export function estimatePulseTotal(totalRows: number, avgRowBytes: number, byteBudget: number): number {
  if (totalRows <= 0 || byteBudget <= 0) return 1;
  return Math.max(1, Math.ceil((totalRows * Math.max(1, avgRowBytes)) / byteBudget));
}

/**
 * HF-362 (Part B) — the DYNAMIC hand-off decision (one source of truth for it). A unit that needs MORE than
 * one pulse hands off to the pg_cron worker (the synchronous path would risk the serverless ceiling); a unit
 * that fits in ONE pulse commits synchronously (fast, no worker latency). The decision is the byte budget
 * itself — the same `estimatePulseTotal` that SIZES pulses (HF-359) decides whether pulsing is NEEDED. No env
 * var, no new threshold: `> 1` means "more than one pass", not a magic byte number.
 */
export function shouldHandOff(estTotalPulses: number): boolean {
  return estTotalPulses > 1;
}

// ── HF-373 Phase E (D6): staged-load capabilities, probed from the DATABASE ────────────────────────
// gzip-compressed parts need the migrated FDW load path (bulk_commit_from_storage reading
// `compress 'gzip'` for *.gz objects). The capability is DISCOVERED by probing the migration's
// marker function — never an env flag, never a deploy-ordering hazard: until the architect applies
// the migration (and live-verifies the wrappers S3 FDW gzip option — SR-44), staging writes plain
// CSV exactly as before.
export interface StagedLoadCapabilities {
  gzip: boolean;
}

export async function discoverStagedLoadCapabilities(supabase: SupabaseClient): Promise<StagedLoadCapabilities> {
  try {
    const { data, error } = await supabase.rpc('staged_load_capabilities');
    if (error) return { gzip: false };
    const caps = (data ?? {}) as { gzip?: boolean };
    return { gzip: caps.gzip === true };
  } catch {
    return { gzip: false };
  }
}
