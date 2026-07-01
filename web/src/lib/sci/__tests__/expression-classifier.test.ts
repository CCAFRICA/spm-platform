/**
 * HF-368 — deriveClassificationFromExpression reads the MODEL's BARE structural primitives
 * (`scope_role` ∈ {entity,transaction,reference,none}, `nature_role` ∈
 * {identifier,measure,temporal,name,categorical}) by EQUALITY against the fixed primitive set
 * (structural-primitives.ts). The bilingual word-list registry scope-predicates.ts is DELETED;
 * the classifier no longer regex-matches the model's prose. These tests assert:
 *   • the bare primitive drives the class (transaction-scope id → transaction; entity id + period
 *     + measures → transaction (DIAG-080); entity id, no per-period measures → entity; no id → reference);
 *   • the prose fields (identifies/data_nature/characterization) are NEVER read — a roster whose
 *     prose is Korean still classifies from scope_role='entity' with NO developer word list (Korean Test);
 *   • C2 fail-loud: absent bare primitive → MissingRecognitionError; NOVEL primitive → PrimitiveRecognitionError;
 *   • identical recognition classifies identically at any confidence.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { deriveClassificationFromExpression, MissingRecognitionError } from '../expression-classifier';
import { PrimitiveRecognitionError } from '../structural-primitives';
import type { ContentProfile, HeaderInterpretation } from '../sci-types';

// Build a profile from per-column BARE primitives. `identifies`/`data_nature`/`char` are set to
// DELIBERATELY misleading or non-English prose to prove the bridge reads ONLY the bare primitives.
function profileFrom(
  cols: Array<{ col: string; scope_role?: string; nature_role?: string; conf: number; identifies?: string; data_nature?: string; char?: string }>,
  tab = 'Datos',
): ContentProfile {
  const interpretations = new Map<string, HeaderInterpretation>();
  for (const r of cols) {
    interpretations.set(r.col, {
      columnName: r.col,
      characterization: r.char ?? 'prose that must never be word-matched',
      dataExpectation: '',
      data_nature: r.data_nature ?? 'prose nature',
      identifies: r.identifies ?? 'prose scope',
      scope_role: r.scope_role,
      nature_role: r.nature_role,
      relationships: [],
      confidence: r.conf,
    });
  }
  return {
    contentUnitId: 'cu', sourceFile: 'f.xlsx', tabName: tab, tabIndex: 0,
    structure: { rowCount: 200, columnCount: cols.length, sparsity: 0, headerQuality: 'clean', numericFieldRatio: 0.7, categoricalFieldRatio: 0.1, categoricalFieldCount: 1, identifierRepeatRatio: 1.0 },
    fields: [],
    patterns: { hasEntityIdentifier: true, hasDateColumn: true, hasTemporalColumns: true, hasCurrencyColumns: 1, hasPercentageValues: false, hasDescriptiveLabels: false, hasStructuralNameColumn: true, rowCountCategory: 'transactional', volumePattern: 'many' },
    observations: [],
    headerComprehension: { interpretations, crossSheetInsights: [], llmCallDuration: 0, llmModel: 'test', fromVocabularyBinding: false },
  } as ContentProfile;
}

const measures = (conf: number) => Array.from({ length: 12 }, (_, i) => ({ col: `m${i}`, nature_role: 'measure', scope_role: 'none', conf }));

// THE HF-368 POINT (Korean Test): a roster whose model PROSE is Korean/novel — the OLD regex
// (entity|entidad|seller|…) would MISS every word — still classifies entity, because the
// multilingual model rendered the bare primitive scope_role='entity'. No developer word list.
test('HF-368 Korean Test: Korean-prose roster classifies entity from the bare primitive (no word list)', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: '직원ID', scope_role: 'entity', nature_role: 'identifier', conf: 0.98, identifies: '직원 (반복되는 개인)', data_nature: '식별자', char: '각 직원의 고유 식별자' },
    { col: '이름', scope_role: 'entity', nature_role: 'name', conf: 0.95, identifies: '사람', data_nature: '이름' },
    { col: '부서', scope_role: 'reference', nature_role: 'categorical', conf: 0.9, identifies: '참조', data_nature: '범주' },
  ], '직원명부'));
  assert.equal(r.classification, 'entity');
  assert.equal(r.confidence, 0.98);
});

// Plantilla shape (bare primitives) → entity. Prose set to reference-word-laden English to prove
// the deleted isReferenceKey scan cannot resurrect: the bare scope_role='entity' wins.
test('HF-368: BCL Plantilla (bare primitives) → entity, prose ignored', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'ID_Empleado', scope_role: 'entity', nature_role: 'identifier', conf: 0.99, identifies: 'entity (…used to reference employees)', data_nature: 'identifier', char: 'a foreign key that references employees' },
    { col: 'Nombre_Completo', scope_role: 'entity', nature_role: 'name', conf: 0.99 },
    { col: 'Sucursal_ID', scope_role: 'reference', nature_role: 'categorical', conf: 0.82 },
    { col: 'Fecha_Ingreso', scope_role: 'none', nature_role: 'temporal', conf: 0.99 },
  ], 'BCL_Plantilla'));
  assert.equal(r.classification, 'entity');
  assert.ok(r.matchedConditions.some(c => c.includes('ID_Empleado')));
});

test('HF-368: transaction-scope identifier → transaction', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'Folio', scope_role: 'transaction', nature_role: 'identifier', conf: 0.95 },
    { col: 'DNI_Vendedor', scope_role: 'entity', nature_role: 'identifier', conf: 0.97 },
    ...measures(0.80),
    { col: 'Mes', scope_role: 'none', nature_role: 'temporal', conf: 0.30 },
  ]));
  assert.equal(r.classification, 'transaction');
});

test('HF-368 / DIAG-080: entity id + period + measures → transaction, never entity', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'ID_Empleado', scope_role: 'entity', nature_role: 'identifier', conf: 0.97 },
    { col: 'Periodo', scope_role: 'none', nature_role: 'temporal', conf: 0.90 },
    ...measures(0.85),
  ]));
  assert.equal(r.classification, 'transaction');
  assert.ok(r.matchedConditions.some(c => /per-period performance/.test(c)));
});

test('HF-368: entity id, no measure → entity (roster)', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'No_Empleado', scope_role: 'entity', nature_role: 'identifier', conf: 0.95 },
    { col: 'Nombre', scope_role: 'entity', nature_role: 'name', conf: 0.90 },
  ]));
  assert.equal(r.classification, 'entity');
});

test('HF-368: no entity/transaction identifier → reference', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'Hub', scope_role: 'reference', nature_role: 'categorical', conf: 0.95 },
    { col: 'Capacidad', scope_role: 'none', nature_role: 'measure', conf: 0.90 },
  ]));
  assert.equal(r.classification, 'reference');
  assert.equal(r.confidence, 0.95);
});

// C2 fail-loud: the model rendered NO bare nature primitive for any column → absent → raise.
test('HF-368: absent bare primitive → MissingRecognitionError (no default)', () => {
  assert.throws(
    () => deriveClassificationFromExpression(profileFrom([
      { col: 'a', conf: 0.5, identifies: 'entity (prose only)', data_nature: 'identifier (prose only)' },
      { col: 'b', conf: 0.5 },
    ], 'StaleSheet')),
    (err: unknown) => {
      assert.ok(err instanceof MissingRecognitionError);
      assert.match((err as Error).message, /StaleSheet/);
      return true;
    },
  );
});

// C2 fail-loud: the model rendered a NOVEL primitive outside the fixed set → raise, surfacing it.
test('HF-368: novel scope primitive → PrimitiveRecognitionError surfacing the novel value', () => {
  assert.throws(
    () => deriveClassificationFromExpression(profileFrom([
      { col: 'Producto', scope_role: 'product', nature_role: 'identifier', conf: 0.9 },
    ], 'NovelSheet')),
    (err: unknown) => {
      assert.ok(err instanceof PrimitiveRecognitionError);
      assert.match((err as Error).message, /NovelSheet/);
      assert.match((err as Error).message, /product/);
      return true;
    },
  );
});

test('HF-368: novel nature primitive → PrimitiveRecognitionError', () => {
  assert.throws(
    () => deriveClassificationFromExpression(profileFrom([
      { col: 'X', scope_role: 'entity', nature_role: 'quantum', conf: 0.9 },
    ])),
    PrimitiveRecognitionError,
  );
});

test('HF-368: absent header comprehension raises', () => {
  const p = profileFrom([{ col: 'x', scope_role: 'entity', nature_role: 'identifier', conf: 0.9 }]);
  (p as { headerComprehension?: unknown }).headerComprehension = undefined;
  assert.throws(() => deriveClassificationFromExpression(p), MissingRecognitionError);
});

// Identical recognition classifies identically at any confidence (cached === atom === fresh).
test('HF-368: identical recognition classifies identically at any confidence', () => {
  const base = (conf: number) => [
    { col: 'Folio', scope_role: 'transaction', nature_role: 'identifier', conf },
    { col: 'No_Empleado', scope_role: 'entity', nature_role: 'identifier', conf },
    ...measures(conf),
  ];
  const fresh = deriveClassificationFromExpression(profileFrom(base(0.98)));
  const atom = deriveClassificationFromExpression(profileFrom(base(0.75)));
  const flywheel = deriveClassificationFromExpression(profileFrom(base(0.30)));
  assert.equal(fresh.classification, atom.classification);
  assert.equal(atom.classification, flywheel.classification);
  assert.equal(fresh.classification, 'transaction');
});
