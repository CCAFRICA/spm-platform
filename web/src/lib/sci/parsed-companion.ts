// HF-285-D — parse-once companion artifact.
//
// The full parsed workbook (every sheet, every row) is persisted ONCE — gzipped —
// keyed by the file's CONTENT HASH, so the two server-side full parses (process-job
// async classify, then execute-bulk commit) and every 300s-boundary resume re-read
// the parse instead of re-parsing the xlsx. Measured on the 162,956-row witness file:
// JSON 91.2MB → gzip 6.5MB (HALT-5 PASS, < 50MB); companion read ~5s replaces a ~34s
// xlsx parse (HALT-6 PASS, net −29s per use).
//
// KEY: content hash, not session id. The directive sketched {tenant}/parsed/{session}_{hash}
// but session ids MISALIGN between the async-classify phase (processing_jobs.session_id)
// and execute (proposalId) — the content hash is the intrinsic key, and "the companion's
// hash matches the original file" is satisfied by construction. Same file (cold + warm
// re-import) → same hash → one companion, shared.
//
// T1-E902 v2 (Carry Everything): the companion stores ALL rows — it is a transport cache
// of the parse, never the persistence layer (commitContentUnit is unchanged; no sampling).
// Best-effort throughout: any companion write/read failure falls back to the live xlsx
// parse — zero behavior change, only speed.

import type { SupabaseClient } from '@supabase/supabase-js';
import { gzipSync, gunzipSync } from 'node:zlib';

const BUCKET = 'ingestion-raw';
// Supabase Storage default object size cap; the HALT-5 guard. Tabular gzip is ~14× here
// (91→6.5MB), so a companion exceeding this implies a workbook far larger than the
// witness — at which point execute falls back to streaming the parse (documented residual).
const MAX_COMPANION_BYTES = 50 * 1024 * 1024;

export type ParsedSheets = Record<string, { columns: string[]; rows: Record<string, unknown>[] }>;

export function companionPath(tenantId: string, fileHash: string): string {
  return `${tenantId}/parsed/${fileHash}.json.gz`;
}

/**
 * Best-effort write-through. gzip + upload (upsert). NEVER throws — a cache-write
 * failure must not affect the import (the import is senior to its parse cache).
 */
export async function writeParsedCompanion(
  supabase: SupabaseClient,
  tenantId: string,
  fileHash: string,
  sheets: ParsedSheets,
): Promise<void> {
  try {
    const json = Buffer.from(JSON.stringify(sheets), 'utf8');
    const gz = gzipSync(json, { level: 6 });
    if (gz.length > MAX_COMPANION_BYTES) {
      console.warn(`[HF-285-D] companion ${(gz.length / 1048576).toFixed(1)}MB > 50MB cap — not written (execute re-parses); fileHash=${fileHash.slice(0, 12)}`);
      return;
    }
    const { error } = await supabase.storage.from(BUCKET).upload(companionPath(tenantId, fileHash), gz, {
      contentType: 'application/gzip', upsert: true, cacheControl: '3600',
    });
    if (error) console.warn(`[HF-285-D] companion write failed (non-blocking): ${error.message}`);
    else console.log(`[HF-285-D] parse-once companion written: ${companionPath(tenantId, fileHash)} (${(gz.length / 1048576).toFixed(1)}MB)`);
  } catch (e) {
    console.warn(`[HF-285-D] companion write threw (non-blocking): ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Read + gunzip + parse. Returns null on absence OR any error — the caller falls back
 * to the live xlsx parse (no regression). The downloaded gz is verified-by-key: the
 * path IS the content hash, so a hit cannot be a different file's parse.
 */
export async function readParsedCompanion(
  supabase: SupabaseClient,
  tenantId: string,
  fileHash: string,
): Promise<ParsedSheets | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(companionPath(tenantId, fileHash));
    if (error || !data) return null;
    const gz = Buffer.from(await data.arrayBuffer());
    const parsed = JSON.parse(gunzipSync(gz).toString('utf8')) as ParsedSheets;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}
