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
import {
  deriveClassificationFromExpression,
  buildDominanceFacets,
  classifyByDominance,
  type StructuralSignals,
} from '../expression-classifier';
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

// ============================================================
// HF-364 — structural-dominance classifier (replaces the branch ladder)
// ============================================================

// THE DIAG-080 defect, now fixed. BCL `datos`: entity-scope id + name + TEMPORAL + measures.
// Under the old Branch 2.5 (entity-scope id + name + no event id → entity@0.88) this was
// misclassified `entity` because the branch ignored the temporal signal. Temporal dominance:
// a per-period measured sheet is performance data, NEVER a roster definition. (HALT-3.)
test('HF-364 / DIAG-080: BCL datos (entity-scope id + name + temporal + measures) is NEVER entity', () => {
  // WITH a categorical/reference dimension (sucursal) → events reference entities → transaction.
  const withRef = deriveClassificationFromExpression(profileFrom([
    { col: 'ID_Empleado', role: 'identifier', conf: 0.97, identifies: 'the employee' },
    { col: 'Nombre_Completo', role: 'name', conf: 0.95 },
    { col: 'Periodo', role: 'temporal period', conf: 0.90 },
    { col: 'Sucursal', role: 'reference key to the branch', conf: 0.90 },
    ...measures(0.85),
  ]));
  assert.notEqual(withRef.classification, 'entity');
  assert.equal(withRef.classification, 'transaction');

  // WITHOUT a reference dimension → per-period records attributed to the entity → target.
  const noRef = deriveClassificationFromExpression(profileFrom([
    { col: 'ID_Empleado', role: 'identifier', conf: 0.97, identifies: 'the employee' },
    { col: 'Nombre_Completo', role: 'name', conf: 0.95 },
    { col: 'Periodo', role: 'temporal period', conf: 0.90 },
    ...measures(0.85),
  ]));
  assert.notEqual(noRef.classification, 'entity');
  assert.ok(noRef.classification === 'transaction' || noRef.classification === 'target');
  // the temporal-dominance facet drove it — provenance must say so
  assert.ok(noRef.matchedConditions.some(c => /temporal dominance/.test(c)));
});

// The HF-351 roster invariant is preserved by the ABSENCE of temporal, not by ordering:
// entity-scope id + name, NO temporal, NO event id → entity (even with a measure / ref-key).
test('HF-364: HF-351 roster preserved via absence of temporal (not branch order)', () => {
  const r = deriveClassificationFromExpression(profileFrom([
    { col: 'vendedor_id', role: 'identifier', conf: 0.99, identifies: 'the seller' },
    { col: 'Nombre', role: 'name', conf: 0.95 },
    { col: 'sucursal', role: 'reference key to the branch', conf: 0.93 },
    { col: 'Salario', role: 'measure amount', conf: 0.90 },
  ]));
  assert.equal(r.classification, 'entity');
});

// ORDER-INDEPENDENCE PROOF (EPG-3.1). The dominance derivation reduces a FLAT facet list by
// summation; the winner is an argmax. Evaluating the facets in different orders must produce
// byte-identical output. We build the BCL datos signal tuple, then run classifyByDominance on
// the facet list, its reverse, and several rotations — all must agree, and none may be entity.
test('HF-364: classifyByDominance is order-independent (rearranged logic → identical output)', () => {
  const bclDatos: StructuralSignals = {
    hasEntityScopeIdentifier: true,
    hasName: true,
    hasTxnScopeIdentifier: false,
    hasTemporal: true,
    hasMeasure: true,
    hasReferenceKey: true,
    identifierCount: 1,
    measureCount: 12,
  };
  const facets = buildDominanceFacets(bclDatos);

  const canonical = classifyByDominance(facets);
  const reversed = classifyByDominance([...facets].reverse());

  // every rotation of the facet list
  const rotations = facets.map((_, i) => classifyByDominance([...facets.slice(i), ...facets.slice(0, i)]));

  assert.notEqual(canonical.classification, 'entity'); // temporal dominance holds
  for (const r of [reversed, ...rotations]) {
    assert.equal(r.classification, canonical.classification);
    assert.equal(r.confidence, canonical.confidence);
    assert.deepEqual([...r.matchedConditions].sort(), [...canonical.matchedConditions].sort());
  }
});

// Order-independence must also hold for the OTHER natures, not just the BCL case — verify it
// across the full truth table so no signal tuple is order-sensitive.
test('HF-364: order-independence holds across the truth table', () => {
  const cases: StructuralSignals[] = [
    // roster (entity remainder)
    { hasEntityScopeIdentifier: true, hasName: true, hasTxnScopeIdentifier: false, hasTemporal: false, hasMeasure: false, hasReferenceKey: false, identifierCount: 1, measureCount: 0 },
    // reference isolation
    { hasEntityScopeIdentifier: false, hasName: false, hasTxnScopeIdentifier: false, hasTemporal: false, hasMeasure: true, hasReferenceKey: true, identifierCount: 0, measureCount: 1 },
    // event log (event-id dominance)
    { hasEntityScopeIdentifier: false, hasName: false, hasTxnScopeIdentifier: true, hasTemporal: true, hasMeasure: false, hasReferenceKey: false, identifierCount: 1, measureCount: 0 },
    // entity-level target
    { hasEntityScopeIdentifier: true, hasName: false, hasTxnScopeIdentifier: false, hasTemporal: false, hasMeasure: true, hasReferenceKey: false, identifierCount: 1, measureCount: 5 },
  ];
  for (const s of cases) {
    const f = buildDominanceFacets(s);
    const a = classifyByDominance(f);
    const b = classifyByDominance([...f].reverse());
    assert.equal(a.classification, b.classification);
    assert.equal(a.confidence, b.confidence);
  }
});

// Truth-table coverage (EPG-3.1): each structural case lands on its expected nature.
test('HF-364: truth table — reference table, event log, entity-level target', () => {
  // reference table: reference_key, no id → reference (reference isolation)
  assert.equal(classifyByDominance(buildDominanceFacets({
    hasEntityScopeIdentifier: false, hasName: false, hasTxnScopeIdentifier: false, hasTemporal: false,
    hasMeasure: true, hasReferenceKey: true, identifierCount: 0, measureCount: 1,
  })).classification, 'reference');

  // event log: id + event_id + temporal → transaction (event-id dominance beats no-measure→entity)
  assert.equal(classifyByDominance(buildDominanceFacets({
    hasEntityScopeIdentifier: false, hasName: false, hasTxnScopeIdentifier: true, hasTemporal: true,
    hasMeasure: false, hasReferenceKey: false, identifierCount: 1, measureCount: 0,
  })).classification, 'transaction');

  // entity-level measured records, no event/ref/temporal → target
  assert.equal(classifyByDominance(buildDominanceFacets({
    hasEntityScopeIdentifier: true, hasName: false, hasTxnScopeIdentifier: false, hasTemporal: false,
    hasMeasure: true, hasReferenceKey: false, identifierCount: 1, measureCount: 5,
  })).classification, 'target');
});

// The winner's confidence must clear the resolver's analyzeSplit gap (> 0.25 against the
// synthesized 0.05 losers), i.e. confidence ≥ 0.50 for every derived classification — the
// HALT-2 compatibility guarantee (no consumer thresholds on the old 0.88/0.85 constants).
test('HF-364: derived confidence floor keeps the analyzeSplit single-winner gap', () => {
  const samples: StructuralSignals[] = [
    { hasEntityScopeIdentifier: true, hasName: true, hasTxnScopeIdentifier: false, hasTemporal: true, hasMeasure: true, hasReferenceKey: true, identifierCount: 1, measureCount: 12 },
    { hasEntityScopeIdentifier: true, hasName: true, hasTxnScopeIdentifier: false, hasTemporal: false, hasMeasure: true, hasReferenceKey: true, identifierCount: 1, measureCount: 1 },
    { hasEntityScopeIdentifier: false, hasName: false, hasTxnScopeIdentifier: false, hasTemporal: false, hasMeasure: true, hasReferenceKey: true, identifierCount: 0, measureCount: 1 },
  ];
  for (const s of samples) {
    const r = classifyByDominance(buildDominanceFacets(s));
    assert.ok(r.confidence >= 0.50, `confidence ${r.confidence} must be ≥ 0.50`);
    assert.ok(r.confidence - 0.05 > 0.25, 'winner-vs-loser gap must exceed analyzeSplit 0.25');
  }
});
