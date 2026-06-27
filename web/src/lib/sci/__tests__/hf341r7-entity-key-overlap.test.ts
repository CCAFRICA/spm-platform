/**
 * HF-341 R7 (D1) — entity-identity fidelity. Deterministic proof of the GENERAL
 * property: an entity is identified by ONE value-domain per tenant — the domain the
 * transactions reference. A roster batch keyed by a column whose VALUES do not overlap
 * that domain (a name) but which HAS a column that does (its DNI) is re-keyed to the
 * overlapping column, so the roster's people resolve to the SAME external_ids as the
 * transactions (eliminating the name-namespace duplicate set). Pure value set-overlap —
 * no column names, no nature reading, no accent-folding (Korean Test). GUARDED so a
 * roster whose key already overlaps is byte-identical.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { reconcileEntityKeysByValueOverlap } from '@/lib/sci/entity-resolution';
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
type Info = { idColumn: string; nameColumn: string | null; attributeColumns: string[]; isEventUnit: boolean };
const SB = null as unknown as SupabaseClient; // unused when readBatchRows is injected

// a roster with DNI + name; transactions reference the DNI value-domain
const ROSTER: Row[] = [
  { DNI: '10300001', Nombre_Completo: 'Ann Q', Cargo: 'Vendedor' },
  { DNI: '10300002', Nombre_Completo: 'Bob R', Cargo: 'Vendedor' },
  { DNI: '10300003', Nombre_Completo: 'Cy S', Cargo: 'Gerente' },
];
const TXN: Row[] = [
  { DNI_Vendedor: '10300001', Monto: 5 }, { DNI_Vendedor: '10300002', Monto: 9 },
  { DNI_Vendedor: '10300001', Monto: 2 }, { DNI_Vendedor: '10300003', Monto: 7 },
];

test('D1: a roster keyed by a NAME (zero overlap) is re-keyed to its DNI (full overlap)', async () => {
  const batchIdentifiers = new Map<string, Info>([
    ['roster', { idColumn: 'Nombre_Completo', nameColumn: 'Nombre_Completo', attributeColumns: [], isEventUnit: false }],
    ['txn', { idColumn: 'DNI_Vendedor', nameColumn: null, attributeColumns: [], isEventUnit: true }],
  ]);
  const reader = async (b: string) => (b === 'roster' ? ROSTER : TXN);
  const switches = await reconcileEntityKeysByValueOverlap(SB, 'T', batchIdentifiers, reader);

  assert.equal(batchIdentifiers.get('roster')!.idColumn, 'DNI'); // re-keyed
  assert.equal(switches.length, 1);
  assert.equal(switches[0].from, 'Nombre_Completo');
  assert.equal(switches[0].to, 'DNI');
  assert.equal(switches[0].fromOverlap, 0);     // names overlap the DNI domain not at all
  assert.equal(switches[0].toOverlap, 1);        // every roster DNI is referenced by a transaction
});

test('D1 GUARD: a roster already keyed by the overlapping column is NOT re-keyed (byte-identical)', async () => {
  const batchIdentifiers = new Map<string, Info>([
    ['roster', { idColumn: 'DNI', nameColumn: 'Nombre_Completo', attributeColumns: [], isEventUnit: false }],
    ['txn', { idColumn: 'DNI_Vendedor', nameColumn: null, attributeColumns: [], isEventUnit: true }],
  ]);
  const reader = async (b: string) => (b === 'roster' ? ROSTER : TXN);
  const switches = await reconcileEntityKeysByValueOverlap(SB, 'T', batchIdentifiers, reader);
  assert.equal(switches.length, 0);
  assert.equal(batchIdentifiers.get('roster')!.idColumn, 'DNI'); // unchanged
});

test('D1: no transaction batches → no canonical domain → no re-keying (single-sheet tenant untouched)', async () => {
  const batchIdentifiers = new Map<string, Info>([
    ['roster', { idColumn: 'Nombre_Completo', nameColumn: 'Nombre_Completo', attributeColumns: [], isEventUnit: false }],
  ]);
  const reader = async () => ROSTER;
  const switches = await reconcileEntityKeysByValueOverlap(SB, 'T', batchIdentifiers, reader);
  assert.equal(switches.length, 0);
  assert.equal(batchIdentifiers.get('roster')!.idColumn, 'Nombre_Completo'); // unchanged
});

test('D1 GUARD (HALT-CALC / BCL): a many:1 GROUPING dimension that overlaps is NOT a re-key target', async () => {
  // The BCL hazard: a roster correctly keyed by its employee id (ID_Empleado, whose values
  // do NOT overlap the transaction key) must NOT be re-keyed to a branch column (Sucursal_ID)
  // that overlaps 100% but is shared across many employees — that would COLLAPSE employees
  // into branch-entities. Only a ~1:1 per-row identifier is a valid re-key target.
  const bclRoster: Row[] = [
    { ID_Empleado: 'E001', Sucursal_ID: 'SUC-1', Nombre: 'A' },
    { ID_Empleado: 'E002', Sucursal_ID: 'SUC-1', Nombre: 'B' },
    { ID_Empleado: 'E003', Sucursal_ID: 'SUC-2', Nombre: 'C' },
    { ID_Empleado: 'E004', Sucursal_ID: 'SUC-2', Nombre: 'D' },
  ];
  // transactions key by the branch (Sucursal_ID) — so the canonical domain is branch ids
  const bclTxn: Row[] = [{ Sucursal_ID: 'SUC-1' }, { Sucursal_ID: 'SUC-2' }, { Sucursal_ID: 'SUC-1' }];
  const batchIdentifiers = new Map<string, Info>([
    ['roster', { idColumn: 'ID_Empleado', nameColumn: 'Nombre', attributeColumns: [], isEventUnit: false }],
    ['txn', { idColumn: 'Sucursal_ID', nameColumn: null, attributeColumns: [], isEventUnit: true }],
  ]);
  const reader = async (b: string) => (b === 'roster' ? bclRoster : bclTxn);
  const switches = await reconcileEntityKeysByValueOverlap(SB, 'T', batchIdentifiers, reader);
  // ID_Empleado has 0% overlap with the branch domain, and Sucursal_ID overlaps 100% — but
  // Sucursal_ID is 2 distinct / 4 rows = 0.5 uniqueness < 0.9 → NOT a valid identifier → no switch.
  assert.equal(switches.length, 0);
  assert.equal(batchIdentifiers.get('roster')!.idColumn, 'ID_Empleado'); // employee key preserved
});

test('D1 GUARD: a partially-overlapping key (≥50%) is left alone (only near-zero keys re-key)', async () => {
  // roster keyed by a column that already overlaps the domain for most rows → not disrupted
  const partialRoster: Row[] = [
    { partial: '10300001', DNI: '10300001', Nombre_Completo: 'Ann' },
    { partial: '10300002', DNI: '10300002', Nombre_Completo: 'Bob' },
    { partial: 'X', DNI: '10300003', Nombre_Completo: 'Cy' },
  ];
  const batchIdentifiers = new Map<string, Info>([
    ['roster', { idColumn: 'partial', nameColumn: null, attributeColumns: [], isEventUnit: false }],
    ['txn', { idColumn: 'DNI_Vendedor', nameColumn: null, attributeColumns: [], isEventUnit: true }],
  ]);
  const reader = async (b: string) => (b === 'roster' ? partialRoster : TXN);
  const switches = await reconcileEntityKeysByValueOverlap(SB, 'T', batchIdentifiers, reader);
  assert.equal(switches.length, 0); // 2/3 ≈ 67% overlap ≥ 0.5 → left as-is
  assert.equal(batchIdentifiers.get('roster')!.idColumn, 'partial');
});
