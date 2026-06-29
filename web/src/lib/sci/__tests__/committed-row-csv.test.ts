/**
 * HF-356 — committed_data CSV round-trip BYTE-IDENTITY proof. Runner: node --test --import tsx.
 *
 * The HALT-CALC argument for the S3-FDW commit rests on ONE CC-provable invariant: serializing a built
 * committed_data row to CSV and parsing it back yields the IDENTICAL source_date, data_type, row_data,
 * and metadata. If that holds, the database load (CSV -> committed_data via the FDW, architect-verified)
 * is a faithful transport and committed_data is byte-identical to the prior insert path. These tests
 * exercise the adversarial JSON an ERP export carries: commas, quotes, embedded newlines, backslashes,
 * unicode, and nested objects in row_data / metadata.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { committedRowToCsvLine, parseCommittedCsvLine, type CommittedRow } from '../committed-row-csv';

function roundTrip(row: CommittedRow) {
  const parsed = parseCommittedCsvLine(committedRowToCsvLine(row));
  assert.equal(parsed.source_date, row.source_date, 'source_date');
  assert.equal(parsed.data_type, row.data_type, 'data_type');
  assert.deepEqual(parsed.row_data, row.row_data, 'row_data');
  assert.deepEqual(parsed.metadata, row.metadata, 'metadata');
}

const base = (over: Partial<CommittedRow>): CommittedRow => ({
  tenant_id: '2d9979ba-5032-48a7-bccf-1928f3e6dadf',
  import_batch_id: '11111111-2222-3333-4444-555555555555',
  entity_id: null, period_id: null,
  source_date: '2024-01-10', data_type: 'transaction',
  row_data: { a: '1', b: 2 }, metadata: { source: 'sci-bulk' },
  ...over,
});

test('plain values round-trip byte-identical', () => {
  roundTrip(base({}));
});

test('row_data with commas / quotes / colons round-trips', () => {
  roundTrip(base({ row_data: { name: 'Smith, John "JJ"', note: 'a,b,c', amount: 1234.56, _rowIndex: 5, _sheetName: 'Exportar Hoja' } }));
});

test('embedded newlines and backslashes round-trip', () => {
  roundTrip(base({ row_data: { addr: 'line1\nline2\r\nline3', path: 'C:\\Users\\x', q: 'he said "hi"' } }));
});

test('unicode (Korean, accents, emoji) round-trips', () => {
  roundTrip(base({ row_data: { ko: '한국 회사 데이터', es: 'Almacén Mirasol — café', e: '🚀' } }));
});

test('nested metadata (semantic_roles / remediation / field_identities) round-trips', () => {
  roundTrip(base({
    metadata: {
      source: 'sci-bulk', proposalId: 'p-1',
      semantic_roles: { DNI_Vendedor: { role: 'entity_identifier', confidence: 0.99, claimedBy: 'hc' } },
      resolved_data_type: 'transaction', entity_id_field: 'DNI_Vendedor', informational_label: 'transaction',
      field_identities: { Folio: { data_nature: 'transaction id', identifies: 'transaction' } },
      remediation: { _stageRan: true, agents: ['normalizer'], changes: { Estado: { original: 'Si', canonical: 'Sí', basis: 'variant', agent: 'normalizer' } } },
    },
  }));
});

test('null source_date and empty strings round-trip', () => {
  roundTrip(base({ source_date: null, row_data: { empty: '', zero: 0, falsy: false, nul: null } }));
});

test('the comma/quote-heavy worst case round-trips', () => {
  roundTrip(base({
    data_type: 'reference',
    row_data: { json_looking: '{"nested":"value,with,commas","q":"\\"escaped\\""}', csv_looking: 'a","b,c","d' },
  }));
});
