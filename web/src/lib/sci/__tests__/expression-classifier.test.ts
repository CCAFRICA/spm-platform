/**
 * HF-341 R6 — deriveClassificationFromExpression (replaces the deleted heuristic
 * classifyByHCPattern + the Bayesian CRR scorer). The classification is now derived
 * SOLELY from the LLM's free-form expression (data_nature / identifies). These tests
 * assert the BEHAVIOR that drives the calc:
 *   • the expression decides the data nature (a transaction-scope id → transaction;
 *     entity-scope id + measure → target; no measure → entity; reference-key → reference);
 *   • it ALWAYS produces a classification (no coverage-gate null — there is no Level-2
 *     to hand off to);
 *   • identical role assignments produce an identical classification regardless of the
 *     confidence scale the supplying layer used (the R4/R5 cached === atom === fresh
 *     guarantee — the real cached-vs-fresh divergence protection).
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { deriveClassificationFromExpression } from '../expression-classifier';
import type { ContentProfile, HeaderInterpretation } from '../sci-types';

function profileFrom(roles: Array<{ col: string; role: string; conf: number; identifies?: string }>): ContentProfile {
  const interpretations = new Map<string, HeaderInterpretation>();
  for (const r of roles) {
    interpretations.set(r.col, {
      columnName: r.col, characterization: r.role, dataExpectation: '',
      data_nature: r.role, identifies: r.identifies ?? '', relationships: [], confidence: r.conf,
    });
  }
  return {
    contentUnitId: 'cu', sourceFile: 'f.xlsx', tabName: 'Datos', tabIndex: 0,
    structure: {
      rowCount: 200, columnCount: roles.length, sparsity: 0, headerQuality: 'clean',
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

const measures = (conf: number) => Array.from({ length: 12 }, (_, i) => ({ col: `m${i}`, role: 'measure', conf }));

// A per-row TRANSACTION-scope identifier (an event id, e.g. Folio) — the LLM expressed
// that the sheet records events → transaction. Driven by `identifies`, not a ratio.
test('transaction-scope identifier (per-row event id) -> transaction', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'Folio', role: 'identifier', conf: 0.95, identifies: 'the sales transaction' },
    { col: 'DNI_Vendedor', role: 'identifier', conf: 0.97, identifies: 'the seller' },
    ...measures(0.80),
    { col: 'Mes', role: 'temporal', conf: 0.30 },
  ]));
  assert.equal(r.classification, 'transaction');
  assert.ok(r.matchedConditions.some(c => c.includes('transaction-scope identifier')));
});

// An entity-scope identifier + measures, no event id, no reference key -> per-entity
// records (target). The event discriminant is the LLM's expressed scope, never a ratio.
test('entity-scoped identifier + measure, no event id -> target', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'No_Empleado', role: 'identifier', conf: 0.95, identifies: 'the employee' },
    ...measures(0.80),
    { col: 'Mes', role: 'temporal', conf: 0.30 },
  ]));
  assert.equal(r.classification, 'target');
});

// A reference key with no entity identifier -> dimensional reference (lookup table).
test('reference key, no identifier -> reference', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'Hub', role: 'reference key to the hub', conf: 0.95 },
    { col: 'Capacidad', role: 'measure', conf: 0.90 },
  ]));
  assert.equal(r.classification, 'reference');
});

// No measure at all -> the sheet DEFINES entities (roster), not measures them.
test('no measure -> entity', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'No_Empleado', role: 'identifier', conf: 0.95, identifies: 'the employee' },
    { col: 'Nombre', role: 'name', conf: 0.90 },
  ]));
  assert.equal(r.classification, 'entity');
});

// R6: there is NO coverage gate and NO Level-2 fallback — the function ALWAYS returns a
// classification. A sheet with no recognized expression defaults to reference (loud).
test('always returns — empty/unrecognized expression defaults to reference (no null)', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'c0', role: 'unknown', conf: 0.10 },
    { col: 'c1', role: 'unknown', conf: 0.10 },
  ]));
  assert.equal(r.classification, 'reference');
  assert.ok(r.matchedConditions.some(c => /defaulted/.test(c)));
});

// THE load-bearing invariant (R4/R5 cached === atom === fresh): identical role
// assignments classify identically regardless of the confidence scale the supplying
// layer used (LLM ~0.95, atom recognition, sheet-flywheel 0.30). Protects against the
// cached-vs-fresh divergence the whole HF-341 R4/R5/R6 arc fixed.
test('identical role assignments classify identically at any confidence', () => {
  const base = (conf: number) => [
    { col: 'Folio', role: 'identifier', conf, identifies: 'the sales transaction' },
    { col: 'No_Empleado', role: 'identifier', conf, identifies: 'the employee' },
    ...measures(conf),
    { col: 'Mes', role: 'temporal', conf },
  ];
  const fresh = deriveClassificationFromExpression(profileFrom(base(0.98)));
  const atom = deriveClassificationFromExpression(profileFrom(base(0.75)));
  const flywheel = deriveClassificationFromExpression(profileFrom(base(0.30)));
  assert.equal(fresh.classification, atom.classification);
  assert.equal(atom.classification, flywheel.classification);
});

// ── HF-351 F2: a salaried roster (Personal) with a branch column is NOT a transaction ──

test('HF-351 F2: salaried roster — entity-scope id + NAME + measure + reference-key, NO event id -> entity', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'vendedor_id', role: 'identifier', conf: 0.99, identifies: 'the seller' },
    { col: 'Nombre', role: 'name', conf: 0.95 },
    { col: 'sucursal', role: 'reference key to the branch / dimensional lookup', conf: 0.93 },
    { col: 'Salario', role: 'measure amount', conf: 0.90 },
  ]));
  // pre-HF-351 this hit Branch 3 (identifier + reference-key → transaction); now entity.
  assert.equal(r.classification, 'entity');
  assert.ok(r.matchedConditions.some(c => /roster\/master/.test(c)));
});

test('HF-351 F2 neutrality: a target/quota sheet (NO name) stays target even with the new branch', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'No_Empleado', role: 'identifier', conf: 0.95, identifies: 'the employee' },
    { col: 'Sucursal', role: 'reference key to the branch', conf: 0.93 },
    ...measures(0.80),
  ]));
  assert.equal(r.classification, 'transaction'); // reference-key + measure + no name + no entity-only signal → unchanged Branch 3
});

test('HF-351 F2 neutrality: a transaction with a folio event id + a denormalized name stays transaction', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'Folio', role: 'identifier', conf: 0.95, identifies: 'the sales transaction' },
    { col: 'vendedor_id', role: 'identifier', conf: 0.97, identifies: 'the seller' },
    { col: 'Nombre_Vendedor', role: 'name', conf: 0.90 },  // denormalized name present
    ...measures(0.80),
  ]));
  // hasTxnScopeIdentifier (Folio) → roster branch skipped → transaction (MIR Ventas shape)
  assert.equal(r.classification, 'transaction');
});
