/**
 * OB-217 — per-row attribution module unit proof. Runner: node --test --import tsx.
 *
 * Proves, deterministically and without the DB:
 *  - prime-DAG classification on the REAL live intent shapes (BCL Productos Cruzados =
 *    additive; BCL tiered conditional→constant = non-attributable; CRP Consumables gated
 *    multiply = qualified; CRP Equipment add(multiply,const) = non-attributable for now).
 *  - SR-38 reconciliation: Σ(per-row) === raw outcome exactly; round_half_even(Σ,0) ===
 *    stored integer payout; the rounding residual is the single entity-level adjustment.
 *  - transaction_ref structural extraction (identifier that is not the entity id).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  classifyAttributionPattern,
  analyzePrimeDag,
  attributeRows,
  extractTransactionRef,
  extractTemporalAdjustment,
  computeReversal,
} from '@/lib/calculation/per-row-attribution';
import type { PlanComponent } from '@/types/compensation-plan';

function comp(intent: unknown): PlanComponent {
  return { name: 'x', calculationIntent: intent as Record<string, unknown> } as unknown as PlanComponent;
}

// Real BCL component[2] "Productos Cruzados" shape.
const BCL_PRODUCTOS = {
  op: 'multiply', prime: 'arithmetic',
  inputs: [{ field: 'cross_products_sold_count', prime: 'reference' }, { prime: 'constant', value: 25 }],
};
// Real BCL component[0] shape (truncated): nested conditional over a ratio → constants.
const BCL_TIERED = {
  prime: 'conditional',
  condition: { op: 'gte', prime: 'compare', inputs: [{ field: 'portfolio_quality_ratio', prime: 'reference' }, { prime: 'constant', value: 0.95 }] },
  then: { prime: 'constant', value: 200 },
  else: { prime: 'constant', value: 0 },
};
// Real CRP Consumables inner shape: gate → multiply(revenue, rate) with a constant floor.
const CRP_CONSUMABLES = {
  prime: 'conditional',
  condition: { op: 'gte', prime: 'compare', inputs: [{ op: 'divide', prime: 'arithmetic', inputs: [{ field: 'consumable_revenue', prime: 'reference' }, { field: 'monthly_quota', prime: 'reference' }] }, { prime: 'constant', value: 1.2 }] },
  then: { op: 'multiply', prime: 'arithmetic', inputs: [{ field: 'consumable_revenue', prime: 'reference' }, { prime: 'constant', value: 0.08 }] },
  else: { prime: 'constant', value: 0 },
};
// Real CRP Equipment: add(multiply(revenue, 0.06), constant(200)) — mixed → not single-metric linear.
const CRP_EQUIPMENT = {
  op: 'add', prime: 'arithmetic',
  inputs: [{ op: 'multiply', prime: 'arithmetic', inputs: [{ field: 'period_equipment_revenue', prime: 'reference' }, { prime: 'constant', value: 0.06 }] }, { prime: 'constant', value: 200 }],
};

test('classify: BCL Productos Cruzados (multiply ref×const) → additive', () => {
  assert.equal(classifyAttributionPattern(comp(BCL_PRODUCTOS)), 'additive');
});

test('classify: BCL tiered conditional → constants → non-attributable', () => {
  assert.equal(classifyAttributionPattern(comp(BCL_TIERED)), 'non-attributable');
});

test('classify: CRP Consumables (gated multiply) → qualified', () => {
  assert.equal(classifyAttributionPattern(comp(CRP_CONSUMABLES)), 'qualified');
});

test('classify: CRP Equipment add(multiply,const) → non-attributable (mixed, deferred)', () => {
  assert.equal(classifyAttributionPattern(comp(CRP_EQUIPMENT)), 'non-attributable');
});

test('classify: bare reference → additive; bare constant → non-attributable', () => {
  assert.equal(classifyAttributionPattern(comp({ prime: 'reference', field: 'x' })), 'additive');
  assert.equal(classifyAttributionPattern(comp({ prime: 'constant', value: 5 })), 'non-attributable');
  assert.equal(classifyAttributionPattern(comp(null)), 'non-attributable');
});

test('analyze: rate folding + gated flag', () => {
  const a = analyzePrimeDag(BCL_PRODUCTOS);
  assert.equal(a.terms.length, 1);
  assert.deepEqual(a.terms[0], { rate: 25, metricField: 'cross_products_sold_count', kind: 'reference', gated: false });
  assert.equal(a.hasGate, false);

  const g = analyzePrimeDag(CRP_CONSUMABLES);
  assert.equal(g.hasGate, true);
  assert.ok(g.terms.some(t => t.metricField === 'consumable_revenue' && t.rate === 0.08 && t.gated));
});

test('SR-38: Σ per-row === raw outcome; round_half_even(Σ,0) === stored integer payout', () => {
  // additive: 25 × {3,1,4} = {75,25,100}; raw = 200; stored 200.
  const rows = [3, 1, 4].map((v, i) => ({ committedDataId: `c${i}`, rawValue: v, transactionRef: null }));
  const out = attributeRows({ rows, effectiveRate: 25, metricColumn: 'Cantidad_Productos_Cruzados', pattern: 'additive', rawOutcome: 200, storedPayout: 200 });
  assert.equal(out.matched, true);
  assert.equal(out.reconciled, true);
  assert.equal(out.perRowSum, 200);
  assert.equal(out.roundedSum, 200);
  assert.equal(out.traces.length, 3);
  assert.equal((out.traces[0].output as Record<string, unknown>).contribution, 75);
});

test('SR-38: fractional rate reconciles to a rounded integer payout (0 dp, half-even)', () => {
  // 0.03 × {100.50, 50.50} = {3.015, 1.515}; raw = 4.53; round_half_even(4.53,0)=5.
  const rows = [100.5, 50.5].map((v, i) => ({ committedDataId: `c${i}`, rawValue: v, transactionRef: null }));
  const raw = 0.03 * 100.5 + 0.03 * 50.5; // 4.53
  const out = attributeRows({ rows, effectiveRate: 0.03, metricColumn: 'rev', pattern: 'additive', rawOutcome: raw, storedPayout: 5 });
  assert.equal(out.matched, true, `delta=${out.delta}`);
  assert.equal(out.roundedSum, 5);
  assert.equal(out.reconciled, true);
});

test('SR-38: a wrong rate does NOT match the raw outcome (mismatch detectable)', () => {
  const rows = [10, 20].map((v, i) => ({ committedDataId: `c${i}`, rawValue: v, transactionRef: null }));
  const out = attributeRows({ rows, effectiveRate: 25, metricColumn: 'm', pattern: 'additive', rawOutcome: 999, storedPayout: 999 });
  assert.equal(out.matched, false);
});

test('transaction_ref: identifier that is not the entity id', () => {
  const meta = { entity_id_field: 'ID_Empleado', field_identities: {
    ID_Empleado: { structuralType: 'identifier', natureRole: 'identifier', contextualIdentity: 'employee_identifier' },
    Folio: { structuralType: 'identifier', natureRole: 'identifier', contextualIdentity: 'transaction_identifier' },
    Monto: { structuralType: 'measure', natureRole: 'measure', contextualIdentity: 'amount' },
  } };
  const rd = { ID_Empleado: 'E1', Folio: 'F-7788', Monto: 100 };
  assert.equal(extractTransactionRef(rd, meta, 'ID_Empleado'), 'F-7788');
});

test('transaction_ref: null when only the entity identifier exists', () => {
  const meta = { entity_id_field: 'ID_Empleado', field_identities: {
    ID_Empleado: { structuralType: 'identifier', natureRole: 'identifier', contextualIdentity: 'employee_identifier' },
    Cantidad: { structuralType: 'measure', natureRole: 'measure', contextualIdentity: 'count' },
  } };
  const rd = { ID_Empleado: 'E1', Cantidad: 3 };
  assert.equal(extractTransactionRef(rd, meta, 'ID_Empleado'), null);
});

test('transaction_ref (OB-218): excludes BOTH binding entity col AND metadata.entity_id_field', () => {
  // BCL-class case: binding key = ID_Empleado, metadata.entity_id_field = Sucursal, only identifier
  // is the employee id → must be null (not the employee id).
  const meta = { entity_id_field: 'Sucursal', field_identities: {
    ID_Empleado: { structuralType: 'identifier', natureRole: 'identifier', contextualIdentity: 'identifier' },
    Sucursal: { structuralType: 'reference_key', contextualIdentity: 'reference_key' },
  } };
  const rd = { ID_Empleado: 'BCL-5083', Sucursal: 'BCL-MAC-001', Cantidad_Productos_Cruzados: 4 };
  assert.equal(extractTransactionRef(rd, meta, 'ID_Empleado'), null);
});

// ── OB-218 Pattern D (clawback) ──
const CLAWBACK_MOD = {
  modifier: 'temporal_adjustment', adjustmentType: 'per_transaction_reversal',
  referenceMapping: { returnField: 'Folio_Original', originalField: 'Folio', originalDataType: 'Ventas' },
  recoveryRate: 1.0, lookbackPeriods: 1,
};

test('classify: temporal_adjustment modifier on component.modifiers → clawback', () => {
  const c = { name: 'Clawback', modifiers: [CLAWBACK_MOD], calculationIntent: { prime: 'reference', field: 'x' } } as unknown as PlanComponent;
  assert.equal(classifyAttributionPattern(c), 'clawback');
});

test('classify: temporal_adjustment modifier on calculationIntent.modifiers → clawback', () => {
  const c = { name: 'Clawback', calculationIntent: { prime: 'reference', field: 'x', modifiers: [CLAWBACK_MOD] } } as unknown as PlanComponent;
  assert.equal(classifyAttributionPattern(c), 'clawback');
});

test('extractTemporalAdjustment: parses referenceMapping + rate; null when absent/malformed', () => {
  const c = comp({ prime: 'reference', field: 'x' });
  (c as unknown as Record<string, unknown>).modifiers = [CLAWBACK_MOD];
  const m = extractTemporalAdjustment(c);
  assert.equal(m?.returnField, 'Folio_Original');
  assert.equal(m?.originalField, 'Folio');
  assert.equal(m?.originalDataType, 'Ventas');
  assert.equal(m?.recoveryRate, 1.0);
  assert.equal(extractTemporalAdjustment(comp({ prime: 'reference', field: 'x' })), null);
  // malformed (missing returnField) → treated as absent
  const bad = comp({ prime: 'reference', field: 'x' });
  (bad as unknown as Record<string, unknown>).modifiers = [{ modifier: 'temporal_adjustment', adjustmentType: 'per_transaction_reversal', referenceMapping: { originalField: 'Folio' } }];
  assert.equal(extractTemporalAdjustment(bad), null);
});

test('computeReversal: -recoveryRate × original (decimal exact)', () => {
  assert.equal(computeReversal(1.0, 500).toNumber(), -500);
  assert.equal(computeReversal(0.5, 500).toNumber(), -250);
  assert.equal(computeReversal(0.5, '500.50').toNumber(), -250.25);
  assert.ok(computeReversal(1.0, 0).toNumber() === 0); // -0 === 0 (JSON-serializes to 0)
});
