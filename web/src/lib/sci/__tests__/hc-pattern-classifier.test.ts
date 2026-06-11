/**
 * OB-203 class fix (AUD-009) — pattern conditions key on resolved role PRESENCE; confidence applied
 * once at the coverage gate. Fixes the heterogeneous-confidence flip (D5 atom arm + flywheel arm).
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyByHCPattern } from '../hc-pattern-classifier';
import type { ContentProfile, HeaderInterpretation } from '../sci-types';

function profileFrom(roles: Array<{ col: string; role: string; conf: number }>, idRepeatRatio: number): ContentProfile {
  const interpretations = new Map<string, HeaderInterpretation>();
  for (const r of roles) {
    interpretations.set(r.col, {
      columnName: r.col, semanticMeaning: r.role, dataExpectation: '',
      columnRole: r.role as HeaderInterpretation['columnRole'], confidence: r.conf,
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

test('(a) Mes/Año temporal@0.30 -> hasTemporal=true (presence) -> transaction', () => {
  const roles = [
    { col: 'No_Empleado', role: 'identifier', conf: 0.95 },
    ...measures(0.80),
    { col: 'Mes', role: 'temporal', conf: 0.30 },  // injected at the flywheel artifact confidence
    { col: 'Año', role: 'temporal', conf: 0.30 },
  ];
  const r = classifyByHCPattern(profileFrom(roles, 4.02))!;
  assert.equal(r.classification, 'transaction');
  assert.equal(r.patternName, 'event_transactions_temporal');
  assert.ok(r.matchedConditions.some(c => c.includes('HAS temporal')));
});

test('(b) coverage gate still returns null on thin HC (few confident roles)', () => {
  const roles = [
    { col: 'No_Empleado', role: 'identifier', conf: 0.95 }, // only this is >= 0.80
    ...Array.from({ length: 14 }, (_, i) => ({ col: `c${i}`, role: 'measure', conf: 0.30 })),
  ];
  assert.equal(classifyByHCPattern(profileFrom(roles, 4.02)), null); // < 50% coverage -> Level-2 owns it
});

test('(c) both arms classify identically given identical role assignments (any confidence)', () => {
  const base = (temporalConf: number) => [
    { col: 'No_Empleado', role: 'identifier', conf: 0.95 },
    ...measures(0.80),
    { col: 'Mes', role: 'temporal', conf: temporalConf },
    { col: 'Año', role: 'temporal', conf: temporalConf },
  ];
  const flywheelArm = classifyByHCPattern(profileFrom(base(0.30), 4.02))!; // sheet-flywheel injection
  const atomArm = classifyByHCPattern(profileFrom(base(0.75), 4.02))!;     // atom-claimed (pre-D5 maturation)
  const llmArm = classifyByHCPattern(profileFrom(base(0.98), 4.02))!;      // fresh LLM
  assert.equal(flywheelArm.classification, atomArm.classification);
  assert.equal(atomArm.classification, llmArm.classification);
  assert.equal(flywheelArm.classification, 'transaction'); // identical, regardless of confidence scale
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
