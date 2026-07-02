/**
 * HF-373 Phase G (D10) — recognition carry: semantic roles derive from the model's BARE
 * primitives (never prose regexes), and the atom role-stability key is the stable bare
 * nature_role (never per-run prose).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignSemanticRole } from '../agents';
import { resolveAtomRole, AMBIGUOUS_ROLE } from '../atom-flywheel';
import type { FieldProfile } from '../sci-types';

const field = (over: Partial<FieldProfile>): FieldProfile => ({
  fieldName: 'col', fieldIndex: 3, dataType: 'decimal', nullRate: 0, distinctCount: 50,
  distribution: {},
  nameSignals: { containsId: false, containsName: false, containsTarget: false, containsDate: false, containsAmount: false, containsRate: false, looksLikePersonName: false },
  ...over,
});
const interp = (nature_role?: string, scope_role?: string, data_nature?: string) =>
  ({ nature_role, scope_role, data_nature }) as never;

test('D10 THE FIX: a decimal/boolean measure maps to the measure arm from the bare primitive — never unknown (the 5/6 gate-block shape)', () => {
  // Indice_Calidad_Cartera: decimal, prose without English regex keywords
  const r1 = assignSemanticRole(field({ fieldName: 'Indice_Calidad_Cartera', dataType: 'decimal' }), 'transaction',
    interp('measure', 'none', 'A normalized quality score reflecting portfolio health.'), 85);
  assert.equal(r1.role, 'transaction_count');
  // Infracciones_Regulatorias: boolean platformType (had NO arm at all pre-fix)
  const r2 = assignSemanticRole(field({ fieldName: 'Infracciones_Regulatorias', dataType: 'boolean' }), 'transaction',
    interp('measure', 'none', 'A quantitative count of compliance violations.'), 85);
  assert.equal(r2.role, 'transaction_count');
});

test('D10 poison killed: \\bperiod\\b in a measure\'s prose can no longer flip it to transaction_date', () => {
  const r = assignSemanticRole(field({ fieldName: 'Monto_Colocacion', dataType: 'decimal' }), 'transaction',
    interp('measure', 'none', "A quantitative monetary measure representing the employee's loan origination output for the period."), 85);
  assert.notEqual(r.role, 'transaction_date');
  assert.equal(r.role, 'transaction_count');
  // and a REAL temporal column still maps to transaction_date
  const t = assignSemanticRole(field({ fieldName: 'Periodo', dataType: 'date' }), 'transaction',
    interp('temporal', 'none', 'The reporting month.'), 85);
  assert.equal(t.role, 'transaction_date');
});

test('identifier scope discrimination via scope_role — no identifies-prose word list', () => {
  const e = assignSemanticRole(field({ fieldName: 'ID_Empleado', dataType: 'text', distinctCount: 85 }), 'transaction',
    interp('identifier', 'entity', 'A unique employee identifier code.'), 510);
  assert.equal(e.role, 'entity_identifier');
  const tx = assignSemanticRole(field({ fieldName: 'Folio', dataType: 'text', distinctCount: 510 }), 'transaction',
    interp('identifier', 'transaction', 'A per-event folio.'), 510);
  assert.equal(tx.role, 'transaction_identifier');
  const ref = assignSemanticRole(field({ fieldName: 'Sucursal_ID', dataType: 'text', distinctCount: 4 }), 'entity',
    interp('identifier', 'reference', 'A branch lookup key.'), 85);
  assert.equal(ref.role, 'entity_relationship'); // HF-186 semantics preserved
});

test('silence falls to structural arms (no default classification from absence)', () => {
  const r = assignSemanticRole(field({ fieldName: 'X', dataType: 'currency' }), 'transaction', undefined, 85);
  assert.equal(r.role, 'transaction_amount');
});

test('atom role stability: bare nature_role agrees across runs — no more prose churn to ambiguous', () => {
  // pre-fix: role was per-run prose -> second encounter always differed -> AMBIGUOUS (sticky)
  assert.equal(resolveAtomRole('measure', 'measure'), 'measure');
  assert.equal(resolveAtomRole('temporal', 'temporal'), 'temporal');
  // a GENUINE structural collision (same value-shape, different nature) still goes ambiguous
  assert.equal(resolveAtomRole('measure', 'identifier'), AMBIGUOUS_ROLE);
  assert.equal(resolveAtomRole(AMBIGUOUS_ROLE, 'measure'), AMBIGUOUS_ROLE);
});
