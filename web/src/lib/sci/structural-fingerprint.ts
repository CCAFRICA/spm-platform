/**
 * Structural Fingerprint — DS-017 §2
 *
 * Produces a deterministic SHA-256 hash from file structure (columns + types + ratios).
 * Two files with the same column structure produce the same fingerprint regardless
 * of data content, row count, or language.
 *
 * Korean Test: Uses column names as-is (lowercased + sorted). No pattern matching.
 * A Korean file with Hangul columns produces a fingerprint unique to that structure.
 * The same Korean company's second monthly file matches the first.
 *
 * Performance: Operates on header + sample rows only. < 10ms for any file size.
 *
 * OB-174 Phase 2
 */

/**
 * Raw column type detection for fingerprinting.
 * Classifies each column by inspecting sample values.
 * Returns: 'numeric', 'temporal', 'text', 'mixed', 'empty'
 */
function detectColumnType(values: unknown[]): string {
  if (values.length === 0) return 'empty';

  let numericCount = 0;
  let dateCount = 0;
  let textCount = 0;
  let nonNull = 0;

  for (const v of values) {
    if (v == null || v === '') continue;
    nonNull++;

    if (typeof v === 'number') {
      numericCount++;
    } else if (v instanceof Date) {
      dateCount++;
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      // Check if it's a numeric string
      if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        numericCount++;
      } else if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        dateCount++;
      } else {
        textCount++;
      }
    }
  }

  if (nonNull === 0) return 'empty';
  const total = nonNull;
  if (numericCount / total > 0.8) return 'numeric';
  if (dateCount / total > 0.8) return 'temporal';
  if (textCount / total > 0.8) return 'text';
  return 'mixed';
}

/**
 * Compute a deterministic structural fingerprint hash from parsed file data.
 *
 * Input: columns + sample rows (first 50 rows max).
 * Output: SHA-256 hex hash.
 *
 * The fingerprint captures:
 * 1. Column count
 * 2. Sorted column names (lowercased)
 * 3. Column type signature (sorted by column name)
 * 4. Structural ratios (numeric ratio, identifier repeat ratio — bucketed to 1 decimal)
 *
 * Files with the same columns and data types produce identical fingerprints
 * regardless of row data values, row count, or insertion order.
 */
export async function computeFingerprintHash(
  columns: string[],
  sampleRows: Record<string, unknown>[],
): Promise<string> {
  const sortedColumns = [...columns].map(c => c.toLowerCase()).sort();

  // Detect types from sample (max 50 rows for speed)
  const sample = sampleRows.slice(0, 50);
  const typeSignature = sortedColumns.map(col => {
    const values = sample.map(row => row[col] ?? row[columns.find(c => c.toLowerCase() === col) || col]);
    return detectColumnType(values);
  });

  // Compute structural ratios
  const numericCount = typeSignature.filter(t => t === 'numeric').length;
  const numericRatio = columns.length > 0 ? Math.round((numericCount / columns.length) * 10) / 10 : 0;

  // Identifier repeat ratio: for text columns, check cardinality vs row count
  let identifierRepeatRatio = 0;
  if (sample.length > 1) {
    const textCols = sortedColumns.filter((_, i) => typeSignature[i] === 'text');
    if (textCols.length > 0) {
      const ratios = textCols.map(col => {
        const vals = sample.map(row => String(row[col] ?? row[columns.find(c => c.toLowerCase() === col) || col] ?? ''));
        const unique = new Set(vals.filter(v => v.trim())).size;
        return unique > 0 ? sample.length / unique : 0;
      });
      identifierRepeatRatio = Math.round(Math.min(...ratios) * 10) / 10;
    }
  }

  // Build composite string
  const composite = [
    `cols:${columns.length}`,
    `names:${sortedColumns.join(',')}`,
    `types:${typeSignature.join(',')}`,
    `numRatio:${numericRatio}`,
    `idRepeat:${identifierRepeatRatio}`,
  ].join('|');

  // SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(composite);

  // Use Web Crypto API (available in Node.js 18+ and all browsers)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Synchronous version using Node.js crypto module.
 * Use this in server-side contexts where Web Crypto may not be available.
 */
export function computeFingerprintHashSync(
  columns: string[],
  sampleRows: Record<string, unknown>[],
): string {
  const sortedColumns = [...columns].map(c => c.toLowerCase()).sort();

  const sample = sampleRows.slice(0, 50);
  const typeSignature = sortedColumns.map(col => {
    const values = sample.map(row => row[col] ?? row[columns.find(c => c.toLowerCase() === col) || col]);
    return detectColumnType(values);
  });

  const numericCount = typeSignature.filter(t => t === 'numeric').length;
  const numericRatio = columns.length > 0 ? Math.round((numericCount / columns.length) * 10) / 10 : 0;

  let identifierRepeatRatio = 0;
  if (sample.length > 1) {
    const textCols = sortedColumns.filter((_, i) => typeSignature[i] === 'text');
    if (textCols.length > 0) {
      const ratios = textCols.map(col => {
        const vals = sample.map(row => String(row[col] ?? row[columns.find(c => c.toLowerCase() === col) || col] ?? ''));
        const unique = new Set(vals.filter(v => v.trim())).size;
        return unique > 0 ? sample.length / unique : 0;
      });
      identifierRepeatRatio = Math.round(Math.min(...ratios) * 10) / 10;
    }
  }

  const composite = [
    `cols:${columns.length}`,
    `names:${sortedColumns.join(',')}`,
    `types:${typeSignature.join(',')}`,
    `numRatio:${numericRatio}`,
    `idRepeat:${identifierRepeatRatio}`,
  ].join('|');

  // Node.js crypto
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto');
  return nodeCrypto.createHash('sha256').update(composite).digest('hex');
}

/**
 * Build the human-readable fingerprint string (for debugging/display).
 * This is the composite string BEFORE hashing.
 */
export function computeFingerprintComposite(
  columns: string[],
  sampleRows: Record<string, unknown>[],
): string {
  const sortedColumns = [...columns].map(c => c.toLowerCase()).sort();

  const sample = sampleRows.slice(0, 50);
  const typeSignature = sortedColumns.map(col => {
    const values = sample.map(row => row[col] ?? row[columns.find(c => c.toLowerCase() === col) || col]);
    return detectColumnType(values);
  });

  const numericCount = typeSignature.filter(t => t === 'numeric').length;
  const numericRatio = columns.length > 0 ? Math.round((numericCount / columns.length) * 10) / 10 : 0;

  return [
    `cols:${columns.length}`,
    `names:${sortedColumns.join(',')}`,
    `types:${typeSignature.join(',')}`,
    `numRatio:${numericRatio}`,
  ].join('|');
}
