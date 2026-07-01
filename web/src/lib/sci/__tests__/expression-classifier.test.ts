/**
 * HF-367 — deriveClassificationFromExpression is now a DIRECT READ of the model's per-column
 * recognition (the `identifies` scope + `data_nature` nature the model assessed, OB-231). The
 * keyword-scan predicates (Layer A) and the HF-364 structural-dominance derivation (Layer B)
 * are DELETED. These tests assert the constructed behavior that drives the calc:
 *   • a transaction-scope identifier → transaction (rows are events);
 *   • an entity-scope identifier + period + measures → transaction (per-period performance,
 *     NEVER entity — the DIAG-080 fix);
 *   • an entity-scope identifier without per-period measures → entity (roster/master);
 *   • no entity- and no transaction-identifying column → reference (dimensional lookup);
 *   • NO default on absent recognition — it RAISES (C2 fail-loud);
 *   • the classification is identical regardless of the confidence scale the supplying layer
 *     used (cached === atom === fresh).
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  deriveClassificationFromExpression,
  MissingRecognitionError,
} from '../expression-classifier';
import type { ContentProfile, HeaderInterpretation } from '../sci-types';

// Build a profile from per-column model recognition. `nature` → data_nature (the dedicated
// nature channel), `identifies` → the dedicated scope channel. `char` (characterization) is
// set to a DELIBERATELY MISLEADING prose sentence in some tests to prove it is NEVER read.
function profileFrom(
  cols: Array<{ col: string; nature: string; conf: number; identifies?: string; char?: string }>,
  tab = 'Datos',
): ContentProfile {
  const interpretations = new Map<string, HeaderInterpretation>();
  for (const r of cols) {
    interpretations.set(r.col, {
      columnName: r.col,
      characterization: r.char ?? r.nature,
      dataExpectation: '',
      data_nature: r.nature,
      identifies: r.identifies ?? 'nothing',
      relationships: [],
      confidence: r.conf,
    });
  }
  return {
    contentUnitId: 'cu', sourceFile: 'f.xlsx', tabName: tab, tabIndex: 0,
    structure: {
      rowCount: 200, columnCount: cols.length, sparsity: 0, headerQuality: 'clean',
      numericFieldRatio: 0.7, categoricalFieldRatio: 0.1, categoricalFieldCount: 1,
      identifierRepeatRatio: 1.0,
    },
    fields: [],
    patterns: {
      hasEntityIdentifier: true, hasDateColumn: true, hasTemporalColumns: true, hasCurrencyColumns: 1,
      hasPercentageValues: false, hasDescriptiveLabels: false, hasStructuralNameColumn: true,
      rowCountCategory: 'transactional', volumePattern: 'many',
    },
    observations: [],
    headerComprehension: { interpretations, crossSheetInsights: [], llmCallDuration: 0, llmModel: 'test', fromVocabularyBinding: false },
  } as ContentProfile;
}

const measures = (conf: number) => Array.from({ length: 12 }, (_, i) => ({ col: `m${i}`, nature: 'measure', conf }));

// ── THE HF-367 FIX: the BCL Plantilla (real model output). An all-text employee roster.
// The model scopes ID_Empleado as an entity identifier @0.99. The OLD classifier flipped it
// to reference because the *characterization* prose ("…used to reference employees", "foreign
// key", "…may also reference branch IDs") contained reference-words. The direct read reads the
// dedicated identifies/data_nature channels and NEVER the characterization → entity. ──
test('HF-367: BCL Plantilla (real model output) classifies as entity (was reference)', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'ID_Empleado', nature: 'identifier', conf: 0.99, identifies: 'entity (an individual employee who may recur across many records and sheets)', char: 'A unique alphanumeric identifier assigned to each employee, used to reference employees across sheets' },
    { col: 'ID_Gerente', nature: 'identifier (foreign key referencing ID_Empleado in the same sheet)', conf: 0.99, identifies: 'entity (references another employee who is a manager)', char: 'The employee ID of this employee\'s direct manager — a foreign key' },
    { col: 'Nombre_Completo', nature: 'name', conf: 0.99, identifies: 'entity (the human person behind the employee record)', char: 'The full legal name of the employee' },
    { col: 'Sucursal_ID', nature: 'categorical identifier', conf: 0.82, identifies: 'reference (a branch or organizational unit that groups employees)', char: 'An identifier indicating which branch the employee belongs to; may also reference branch IDs' },
    { col: 'Region', nature: 'categorical', conf: 0.96, identifies: 'reference (a geographic territory grouping employees)', char: 'The geographic region' },
    { col: 'Nivel_Cargo', nature: 'categorical', conf: 0.97, identifies: 'reference (a seniority tier that categorizes multiple employees)' },
    { col: 'Cargo', nature: 'categorical', conf: 0.97, identifies: 'nothing (describes a property of the employee)' },
    { col: 'Fecha_Ingreso', nature: 'temporal', conf: 0.99, identifies: 'nothing (a temporal attribute of the employee record)' },
  ], 'BCL_Plantilla'));
  assert.equal(r.classification, 'entity');
  assert.equal(r.confidence, 0.99); // the model's confidence in ID_Empleado — not a synthesized constant
  assert.ok(r.matchedConditions.some(c => c.includes('ID_Empleado') && /entity identifier/.test(c)));
});

// A per-row TRANSACTION-scope identifier (Folio) — the model scoped the sheet as recording
// events → transaction. Driven by the model's `identifies`, not a ratio.
test('HF-367: transaction-scope identifier (per-row event id) -> transaction', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'Folio', nature: 'identifier', conf: 0.95, identifies: 'transaction (the sales receipt / folio)' },
    { col: 'DNI_Vendedor', nature: 'identifier', conf: 0.97, identifies: 'entity (the seller)' },
    ...measures(0.80),
    { col: 'Mes', nature: 'temporal', conf: 0.30 },
  ]));
  assert.equal(r.classification, 'transaction');
  assert.ok(r.matchedConditions.some(c => c.includes('Folio') && /transaction identifier/.test(c)));
});

// DIAG-080: BCL datos — entity-scope id + name + PERIOD + measures. Per-period performance
// over the entity → transaction, NEVER entity (the old Branch 2.5 called it entity → $0).
test('HF-367 / DIAG-080: entity-scope id + period + measures is transaction, never entity', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'ID_Empleado', nature: 'identifier', conf: 0.97, identifies: 'entity (an individual employee)' },
    { col: 'Nombre_Completo', nature: 'name', conf: 0.95, identifies: 'entity (the person)' },
    { col: 'Periodo', nature: 'temporal period', conf: 0.90, identifies: 'nothing' },
    { col: 'Sucursal', nature: 'categorical', conf: 0.90, identifies: 'reference (the branch)' },
    ...measures(0.85),
  ]));
  assert.notEqual(r.classification, 'entity');
  assert.equal(r.classification, 'transaction');
  assert.ok(r.matchedConditions.some(c => /per-period performance/.test(c)));
});

// A reference key with no entity- and no transaction-identifier -> dimensional reference.
test('HF-367: no entity/transaction identifier -> reference', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'Hub', nature: 'categorical', conf: 0.95, identifies: 'reference (the distribution hub)' },
    { col: 'Capacidad', nature: 'measure', conf: 0.90, identifies: 'nothing' },
  ]));
  assert.equal(r.classification, 'reference');
  assert.equal(r.confidence, 0.95); // strongest recognized column
});

// No measure at all + entity-scope id -> the sheet DEFINES entities (roster), not measures them.
test('HF-367: entity-scope id, no measure -> entity', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'No_Empleado', nature: 'identifier', conf: 0.95, identifies: 'entity (the employee)' },
    { col: 'Nombre', nature: 'name', conf: 0.90, identifies: 'entity (the person)' },
  ]));
  assert.equal(r.classification, 'entity');
});

// HF-351 F2 roster: entity-scope id + NAME + a Salario measure + a branch reference, NO period.
// Not per-period performance → a salaried roster → entity. (No name/reference-key heuristic; it
// is entity because there is an entity id and no period+measure performance pattern.)
test('HF-367: salaried roster (entity id + name + measure + reference, NO period) -> entity', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'vendedor_id', nature: 'identifier', conf: 0.99, identifies: 'entity (the seller)' },
    { col: 'Nombre', nature: 'name', conf: 0.95, identifies: 'entity (the person)' },
    { col: 'sucursal', nature: 'categorical', conf: 0.93, identifies: 'reference (the branch)' },
    { col: 'Salario', nature: 'measure amount', conf: 0.90, identifies: 'nothing' },
  ]));
  assert.equal(r.classification, 'entity');
});

// C2 FAIL-LOUD: the model recognized nothing usable (every data_nature is the producer's
// `unknown` sentinel) → RAISE, never default to reference.
test('HF-367: no recognition raises MissingRecognitionError (no silent default)', () => {
  assert.throws(
    () => deriveClassificationFromExpression(profileFrom([
      { col: 'c0', nature: 'unknown', conf: 0.10, identifies: 'nothing' },
      { col: 'c1', nature: '', conf: 0.10, identifies: 'nothing' },
    ], 'MysterySheet')),
    (err: unknown) => {
      assert.ok(err instanceof MissingRecognitionError);
      assert.match((err as Error).message, /MysterySheet/);
      assert.match((err as Error).message, /data_nature/);
      return true;
    },
  );
});

// C2 FAIL-LOUD: no header comprehension at all → RAISE.
test('HF-367: absent header comprehension raises', () => {
  const p = profileFrom([{ col: 'x', nature: 'identifier', conf: 0.9, identifies: 'entity' }]);
  (p as { headerComprehension?: unknown }).headerComprehension = undefined;
  assert.throws(() => deriveClassificationFromExpression(p), MissingRecognitionError);
});

// The `characterization` prose is NEVER read: a column whose characterization is a misleading
// "this is a reference / foreign key" sentence still classifies from its data_nature/identifies.
test('HF-367: characterization prose is ignored (only identifies/data_nature drive the class)', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'ID', nature: 'identifier', conf: 0.98, identifies: 'entity (the employee)', char: 'A reference / foreign key / lookup / dimensional pointer used to reference other records' },
    { col: 'Nombre', nature: 'name', conf: 0.9, identifies: 'entity (the person)' },
  ]));
  assert.equal(r.classification, 'entity'); // reference-words in the characterization no longer flip it
});

// Cached === atom === fresh: identical role assignments classify identically regardless of the
// confidence scale the supplying layer used. (Confidence now reflects the model's confidence,
// so it differs by scale — but the CLASSIFICATION, which drives the calc, is invariant.)
test('HF-367: identical recognition classifies identically at any confidence', () => {
  const base = (conf: number) => [
    { col: 'Folio', nature: 'identifier', conf, identifies: 'transaction (the sale)' },
    { col: 'No_Empleado', nature: 'identifier', conf, identifies: 'entity (the employee)' },
    ...measures(conf),
    { col: 'Mes', nature: 'temporal', conf },
  ];
  const fresh = deriveClassificationFromExpression(profileFrom(base(0.98)));
  const atom = deriveClassificationFromExpression(profileFrom(base(0.75)));
  const flywheel = deriveClassificationFromExpression(profileFrom(base(0.30)));
  assert.equal(fresh.classification, atom.classification);
  assert.equal(atom.classification, flywheel.classification);
  assert.equal(fresh.classification, 'transaction');
});

// The winner's confidence clears the resolver's analyzeSplit gap (> 0.25 vs the synthesized
// 0.05 losers) for real recognitions (the model's confidences are high). Verified against the
// deciding-column confidence, which is what the direct read reports.
test('HF-367: derived confidence clears the analyzeSplit single-winner gap for real recognition', () => {
  const samples = [
    profileFrom([{ col: 'ID', nature: 'identifier', conf: 0.99, identifies: 'entity (emp)' }, { col: 'n', nature: 'name', conf: 0.9, identifies: 'entity' }]),
    profileFrom([{ col: 'Folio', nature: 'identifier', conf: 0.82, identifies: 'transaction (sale)' }, ...measures(0.8)]),
    profileFrom([{ col: 'Hub', nature: 'categorical', conf: 0.90, identifies: 'reference (hub)' }]),
  ];
  for (const p of samples) {
    const r = deriveClassificationFromExpression(p);
    assert.ok(r.confidence - 0.05 > 0.25, `winner-vs-loser gap must exceed analyzeSplit 0.25 (got ${r.confidence})`);
  }
});
