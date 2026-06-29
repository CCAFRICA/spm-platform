// HF-356 (RC1 / I1 / I5) — the writer-controlled CSV serialization of committed_data rows.
//
// The serverless function no longer sends rows to the database over HTTP. It serializes the SAME row
// objects `commitContentUnit.buildCommittedRow` already produces into a CSV (this module), writes ONE
// file to Storage, and the database loads it directly via the S3 FDW (one RPC). Because the row OBJECTS
// are byte-identical to today's insert payload, committed_data is byte-identical (HALT-CALC) — only the
// transport changes.
//
// FORMAT (I5 — writer-controlled, fixed): a header row then one line per committed row, columns in this
// exact order, matching the FDW foreign table and the bulk_commit_from_storage RPC:
//   tenant_id, import_batch_id, source_date, data_type, row_data, metadata
// entity_id / period_id are NULL at import (the RPC sets them). row_data and metadata are JSON, emitted
// as RFC-4180-quoted CSV fields (wrapped in ", internal " doubled) so the database reads each back as a
// JSON string and casts ::jsonb. EVERY field is quoted — unconditional quoting is the simplest format
// the FDW CSV reader and Postgres both parse unambiguously (no delimiter/embedded-newline ambiguity).

import { Readable } from 'node:stream';

// A committed_data row as built by commitContentUnit.buildCommittedRow.
export interface CommittedRow {
  tenant_id: string;
  import_batch_id: string;
  entity_id: string | null;
  period_id: string | null;
  source_date: string | null;
  data_type: string;
  row_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export const CSV_COLUMNS = ['tenant_id', 'import_batch_id', 'source_date', 'data_type', 'row_data', 'metadata'] as const;
export const CSV_HEADER = CSV_COLUMNS.join(',');

/** RFC-4180 field: always quoted, internal quotes doubled. */
function q(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Serialize ONE committed row to a CSV line (no trailing newline). */
export function committedRowToCsvLine(row: CommittedRow): string {
  return [
    q(row.tenant_id),
    q(row.import_batch_id),
    q(row.source_date ?? ''),
    q(row.data_type),
    q(JSON.stringify(row.row_data)),
    q(JSON.stringify(row.metadata)),
  ].join(',');
}

/** Serialize a batch of rows to CSV lines (no header — the caller emits the header once). */
export function committedRowsToCsv(rows: CommittedRow[]): string {
  let out = '';
  for (const r of rows) out += committedRowToCsvLine(r) + '\n';
  return out;
}

// HF-358 (Part A) — the full CSV document bytes for `rowCount` rows, exactly as the streaming writer
// produces them: `CSV_HEADER + '\n'` then `line + '\n'` per row. This is the SAME byte sequence the
// pre-HF-358 materialize-then-upload path produced (`CSV_HEADER + '\n' + lines.join('\n') + '\n'`) — the
// canonical reference for the PG-A2 byte-identity proof.
export function committedCsvDocument(rowCount: number, buildLine: (i: number) => string): string {
  let out = CSV_HEADER + '\n';
  for (let i = 0; i < rowCount; i++) out += buildLine(i) + '\n';
  return out;
}

/**
 * HF-358 (Part A, OOM fix) — a pull-based Readable that serializes `rowCount` rows to the committed_data
 * CSV in BOUNDED slices, so peak heap is one slice — never the whole window as array + joined string +
 * Buffer simultaneously (DIAG-078 defect #1). `buildLine(i)` returns the RFC-4180 line for row i (the
 * caller wires it to `committedRowToCsvLine(buildCommittedRow(rows[i], i))`); it is invoked exactly once
 * per row, in ascending order, so any per-row accumulation in the caller (e.g. source-date min/max) stays
 * identical to the prior in-order loop. Output bytes are byte-identical to `committedCsvDocument` above.
 * A throw in `buildLine` destroys the stream so the upload rejects (→ the caller's failCommit), never a
 * silent truncation.
 */
export function committedRowsCsvStream(
  rowCount: number,
  buildLine: (i: number) => string,
  sliceRows = 1000,
): Readable {
  let i = 0;
  let headerSent = false;
  return new Readable({
    read() {
      try {
        if (!headerSent) { headerSent = true; this.push(CSV_HEADER + '\n'); return; }
        if (i >= rowCount) { this.push(null); return; }
        const end = Math.min(i + sliceRows, rowCount);
        let chunk = '';
        for (; i < end; i++) chunk += buildLine(i) + '\n';
        this.push(chunk);
      } catch (err) {
        this.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });
}

// ── Round-trip parser (used ONLY by the byte-identity proof — the DB does the real parse via the FDW) ──

/** Parse one CSV line of N always-quoted fields back into raw strings (mirrors the FDW reader). */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '"') throw new Error(`expected quote at ${i} in: ${line.slice(0, 60)}`);
    i++; // opening quote
    let val = '';
    for (;;) {
      if (i >= line.length) throw new Error('unterminated field');
      if (line[i] === '"') {
        if (line[i + 1] === '"') { val += '"'; i += 2; continue; } // escaped quote
        i++; break; // closing quote
      }
      val += line[i++];
    }
    fields.push(val);
    if (i < line.length) { if (line[i] !== ',') throw new Error(`expected comma at ${i}`); i++; }
  }
  return fields;
}

/**
 * Parse a CSV line back into the committed-row projection the database would INSERT (source_date,
 * data_type, row_data::jsonb, metadata::jsonb) — for the byte-identity proof against the originals.
 */
export function parseCommittedCsvLine(line: string): { source_date: string | null; data_type: string; row_data: unknown; metadata: unknown } {
  const [, , source_date, data_type, row_data, metadata] = parseCsvLine(line);
  return {
    source_date: source_date === '' ? null : source_date,
    data_type,
    row_data: JSON.parse(row_data),
    metadata: JSON.parse(metadata),
  };
}
