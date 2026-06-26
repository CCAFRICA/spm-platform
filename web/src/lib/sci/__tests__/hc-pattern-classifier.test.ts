/**
 * OB-203 class fix (AUD-009) — pattern conditions key on resolved role PRESENCE; confidence applied
 * once at the coverage gate. Fixes the heterogeneous-confidence flip (D5 atom arm + flywheel arm).
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyByHCPattern } from '../hc-pattern-classifier';
import type { ContentProfile, HeaderInterpretation } from '../sci-types';

function profileFrom(roles: Array<{ col: string; role: string; conf: number; identifies?: string }>, idRepeatRatio: number): ContentProfile {
  const interpretations = new Map<string, HeaderInterpretation>();
  for (const r of roles) {
    interpretations.set(r.col, {
      columnName: r.col, characterization: r.role, dataExpectation: '',
      data_nature: r.role, identifies: r.identifies ?? '', relationships: [], confidence: r.conf,
    });
  }
  return {
    contentUnitId: 'cu', sourceFile: 'f.xlsx', tabName: 'Datos_Rendimiento', tabIndex: 0,
    structure: {
      rowCount: 200, columnCount: roles.length, sparsity: 0, headerQuality: 'clean',
      numericFieldRatio: 0.7, categoricalFieldRatio: 0.1, categoricalFieldCount: 1,
      identifierRepeatRatio: idRepeatRatio,
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

const measures = (conf: number) => Array.from({ length: 12 }, (_, i) => ({ col: `m${i}`, role: 'measure', conf }));

// HF-341 R5: rewritten from a LABEL assertion (which asserted the idRepeatRatio registry being
// eradicated) to an EXPRESSION assertion — the sheet-type discriminant reads the LLM's `identifies`
// scope. A per-row TRANSACTION-scope identifier (an event id, e.g. Folio) means the sheet records events.
test('(a) a transaction-scope identifier (per-row event id) -> the sheet records events', () => {
  const roles = [
    { col: 'Folio', role: 'identifier', conf: 0.95, identifies: 'the sales transaction' },
    { col: 'DNI_Vendedor', role: 'identifier', conf: 0.97, identifies: 'the seller' },
    ...measures(0.80),
    { col: 'Mes', role: 'temporal', conf: 0.30 },
  ];
  const r = classifyByHCPattern(profileFrom(roles, 1.0))!; // ratio is irrelevant now — no threshold
  assert.equal(r.classification, 'transaction'); // driven by the expression (Folio identifies a transaction), not a ratio
  assert.ok(r.matchedConditions.some(c => c.includes('transaction-scope identifier')));
});

// HF-341 R5: with NO event id, no reference key, the sheet is per-entity records — the label is target,
// and that is INERT (no behavioral gate reads it). This replaces the deleted idRepeatRatio>1.5->transaction.
test('(a2) entity-scoped identifier only, no event id -> per-entity records (label inert)', () => {
  const roles = [
    { col: 'No_Empleado', role: 'identifier', conf: 0.95, identifies: 'the employee' },
    ...measures(0.80),
    { col: 'Mes', role: 'temporal', conf: 0.30 },
  ];
  const r = classifyByHCPattern(profileFrom(roles, 4.02))!; // high ratio — no longer consulted
  assert.equal(r.classification, 'target'); // no transaction-scope id -> per-entity records; provenance only
});

test('(b) coverage gate still returns null on thin HC (few confident roles)', () => {
  const roles = [
    { col: 'No_Empleado', role: 'identifier', conf: 0.95 }, // only this is >= 0.80
    ...Array.from({ length: 14 }, (_, i) => ({ col: `c${i}`, role: 'measure', conf: 0.30 })),
  ];
  assert.equal(classifyByHCPattern(profileFrom(roles, 4.02)), null); // < 50% coverage -> Level-2 owns it
});

// HF-341 R5: this test's VALUE is the cached/atom/fresh CONSISTENCY (identical role assignments →
// identical classification regardless of confidence scale — the R4 cached===fresh guarantee). The
// specific label assertion is removed (it asserted the registry); the behavioral invariant — all three
// arms agree — is what protects against the cached-vs-fresh divergence the whole HF-341 R4/R5 arc fixed.
test('(c) cached / atom / fresh arms classify IDENTICALLY given identical role assignments (any confidence)', () => {
  const base = (temporalConf: number) => [
    { col: 'Folio', role: 'identifier', conf: 0.95, identifies: 'the sales transaction' },
    { col: 'No_Empleado', role: 'identifier', conf: 0.95, identifies: 'the employee' },
    ...measures(0.80),
    { col: 'Mes', role: 'temporal', conf: temporalConf },
  ];
  const flywheelArm = classifyByHCPattern(profileFrom(base(0.30), 4.02))!; // sheet-flywheel injection
  const atomArm = classifyByHCPattern(profileFrom(base(0.75), 4.02))!;     // atom-claimed
  const llmArm = classifyByHCPattern(profileFrom(base(0.98), 4.02))!;      // fresh LLM
  assert.equal(flywheelArm.classification, atomArm.classification);        // the behavioral invariant
  assert.equal(atomArm.classification, llmArm.classification);
});

test('regression: no-temporal snapshot (idRepeatRatio<=1.5) still -> target', () => {
  const roles = [
    { col: 'No_Empleado', role: 'identifier', conf: 0.95 },
    ...measures(0.80),
    // genuinely NO temporal role assigned
  ];
  const r = classifyByHCPattern(profileFrom(roles, 1.0))!; // one row per entity, no temporal
  assert.equal(r.classification, 'target');
});
