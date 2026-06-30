// HF-359 (Part A) — the byte budget that sizes each commit pulse to the REAL storage object-size limit,
// discovered at runtime. DIAG-079 established the commit is already pulsed (one CSV per window) but the
// boundary was sized in ROWS (20,000) while the storage limit is in BYTES — a fixed row count has no
// relationship to the real constraint and is wrong for wide files. This module discovers the limit and
// derives the budget; pulse-accumulator.ts uses it to flush a pulse before its CSV would exceed it.
//
// THE ONLY CONSTANTS ARE LABELED SAFETY BOUNDS — neither is the pulse-sizing mechanism:
//   HEADROOM_FRACTION   — a safety margin below the limit (CSV quoting/encoding variance + the rare
//                         remediation-grown cell that the pre-commit byte estimate does not yet see).
//   FALLBACK_LIMIT_BYTES — the conservative last-resort used ONLY when the bucket's file_size_limit is
//                         null/unreadable (the ingestion-raw reality, FP-49). It SURFACES when used.
//   MAX_PULSE_ROWS      — an upper safety cap on rows-per-pulse (bounds the raw rows held in memory for a
//                         pathologically narrow file); NOT the boundary — the byte budget governs.

import type { SupabaseClient } from '@supabase/supabase-js';

export const HEADROOM_FRACTION = 0.8;
export const FALLBACK_LIMIT_BYTES = 40 * 1024 * 1024; // 40 MB — below common Supabase global defaults
export const MAX_PULSE_ROWS = 20_000;                 // former CHUNK_ROW_SIZE, demoted to a safety cap

export interface UploadBudget {
  /** Bytes a single pulse's CSV must not exceed = floor(HEADROOM_FRACTION × effectiveLimit). */
  byteBudget: number;
  /** The limit the budget derives from (the bucket's file_size_limit, or the fallback floor). */
  effectiveLimit: number;
  /** Where the limit came from — 'fallback' means the bucket limit was unreadable and SURFACED. */
  limitSource: 'bucket' | 'fallback';
}

/**
 * Discover the upload byte budget for `bucket` at runtime. Reads the bucket's `file_size_limit`; when it is
 * null/unreadable (ingestion-raw today) the conservative fallback floor governs AND is surfaced (warn +
 * limitSource='fallback') — never a silent guess. Never throws.
 */
export async function discoverUploadByteBudget(supabase: SupabaseClient, bucket = 'ingestion-raw'): Promise<UploadBudget> {
  let effectiveLimit = FALLBACK_LIMIT_BYTES;
  let limitSource: 'bucket' | 'fallback' = 'fallback';
  try {
    const { data, error } = await supabase.storage.getBucket(bucket);
    const lim = (data as { file_size_limit?: number | null } | null)?.file_size_limit;
    if (!error && typeof lim === 'number' && lim > 0) {
      effectiveLimit = lim;
      limitSource = 'bucket';
    }
  } catch {
    /* fall through to the fallback floor */
  }
  if (limitSource === 'fallback') {
    console.warn(
      `[pulse-budget] '${bucket}'.file_size_limit is null/unreadable — the pulse byte budget is governed by ` +
        `the conservative fallback floor (${(FALLBACK_LIMIT_BYTES / 1048576).toFixed(0)}MB). ` +
        `ARCHITECT: set the bucket's file_size_limit so the budget derives from the real limit (SR-44).`,
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
