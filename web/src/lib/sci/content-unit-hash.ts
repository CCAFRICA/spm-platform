import { createHash } from 'node:crypto';

/**
 * HF-213: Content unit hash SHA-256 — supersession identity primitive.
 *
 * Computes a deterministic SHA-256 hash over normalized canonical CSV
 * serialization of a content unit's record-level content.
 *
 * Normalization domain:
 *   - Column names: lexicographic sort
 *   - Rows: lexicographic sort (after column normalization)
 *   - Values: trim whitespace, case-preserve, UTF-8
 *   - Excluded: filename, sheet name, formatting, encoding metadata
 *
 * Korean Test compliance: Hash uses structural inputs only. Column names
 * are data content, not pattern-matched. Hash invariant under translation.
 *
 * MUST be invoked from ALL ingestion code paths that compute content unit
 * identity. Single canonical function — divergent normalization = supersession
 * identity break (Decision-Implementation Gap risk per HF-213 Enforcement
 * Category 7 Finding (a)).
 */
export function computeContentUnitHashSha256(rows: Record<string, unknown>[], salt?: string): string {
  // OB-251 HOTFIX: `salt` distinguishes the chunk-windows of ONE large file's streamed/windowed commit
  // so two byte-identical windows cannot falsely supersede each other (HF-213 content-match) and drop
  // rows. The salt is the window's file-global row offset; it is ABSENT (undefined) for every
  // single-batch caller, so their hash — and supersession identity — is byte-identical. A re-import of
  // the same file produces the same windows at the same offsets → same salted hashes → re-import dedup
  // still holds. The hash is a supersession key only (never read by the calc engine).
  const prefix = salt ? `␟${salt}\n` : '';
  if (rows.length === 0) {
    return createHash('sha256').update(prefix).digest('hex');
  }

  const columnSet = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) columnSet.add(k);
  }
  const sortedColumns = Array.from(columnSet).sort();

  const normalizedRows: string[] = [];
  for (const row of rows) {
    const cells: string[] = [];
    for (const col of sortedColumns) {
      const v = row[col];
      const s = v == null ? '' : String(v).trim();
      const escaped = /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      cells.push(escaped);
    }
    normalizedRows.push(cells.join(','));
  }
  normalizedRows.sort();

  const header = sortedColumns
    .map(c => /[,"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)
    .join(',');
  const canonical = prefix + [header, ...normalizedRows].join('\n');

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
