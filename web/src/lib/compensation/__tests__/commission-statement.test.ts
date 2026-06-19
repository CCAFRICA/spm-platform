/**
 * OB-219 — commission-statement pure-transform unit proof. Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  isClawbackTrace,
  groupTracesByComponent,
  buildStatementComponents,
} from '@/lib/compensation/commission-statement';

const src = new Map<string, { row_data: unknown; source_date: string | null }>([
  ['cd1', { row_data: { Folio: 'TXN-1', Monto: 100, _sheetName: 'Ventas' }, source_date: '2026-01-02' }],
  ['cd2', { row_data: { Folio: 'TXN-2', Monto: 200, _sheetName: 'Ventas' }, source_date: '2026-01-01' }],
  ['cdr', { row_data: { Folio_Original: 'TXN-1', Monto: -100 }, source_date: '2026-02-01' }],
]);

test('isClawbackTrace: pattern clawback only', () => {
  assert.equal(isClawbackTrace({ pattern: 'clawback' }), true);
  assert.equal(isClawbackTrace({ pattern: 'additive' }), false);
  assert.equal(isClawbackTrace({}), false);
});

test('groupTracesByComponent: groups, skips null committed_data_id, joins source, sorts by date', () => {
  const traces = [
    { component_name: 'Sales', committed_data_id: 'cd1', transaction_ref: 'TXN-1', formula: '0.04 × Monto', inputs: { Monto: 100 }, output: { rate: 0.04, contribution: 4, pattern: 'additive' }, steps: [] },
    { component_name: 'Sales', committed_data_id: 'cd2', transaction_ref: 'TXN-2', formula: '0.04 × Monto', inputs: { Monto: 200 }, output: { rate: 0.04, contribution: 8, pattern: 'additive' }, steps: [] },
    { component_name: 'EntityBonus', committed_data_id: null, transaction_ref: null, formula: null, inputs: {}, output: {}, steps: [] },
  ];
  const g = groupTracesByComponent(traces, src);
  assert.equal(g.has('Sales'), true);
  assert.equal(g.has('EntityBonus'), false); // null committed_data_id skipped
  const sales = g.get('Sales')!;
  assert.equal(sales.length, 2);
  assert.equal(sales[0].transactionRef, 'TXN-2'); // sorted: 2026-01-01 before 2026-01-02
  assert.equal(sales[0].sourceDate, '2026-01-01');
  assert.equal(sales[1].rate, 0.04);
  assert.equal(sales[1].contribution, 4);
  assert.deepEqual(sales[1].sourceRow, { Folio: 'TXN-1', Monto: 100, _sheetName: 'Ventas' });
});

test('buildStatementComponents: merges authoritative components with traces', () => {
  const traces = [
    { component_name: 'Sales', committed_data_id: 'cd1', transaction_ref: 'TXN-1', formula: 'f', inputs: { Monto: 100 }, output: { rate: 0.04, contribution: 4, pattern: 'additive' }, steps: [] },
    { component_name: 'Sales', committed_data_id: 'cd2', transaction_ref: 'TXN-2', formula: 'f', inputs: { Monto: 200 }, output: { rate: 0.04, contribution: 8, pattern: 'additive' }, steps: [] },
    { component_name: 'Returns', committed_data_id: 'cdr', transaction_ref: 'TXN-1', formula: '-1 × 4', inputs: { Monto: -100 }, output: { rate: 1, contribution: -4, pattern: 'clawback', originalContribution: 4 }, steps: [] },
  ];
  const g = groupTracesByComponent(traces, src);
  const components = buildStatementComponents([
    { name: 'Sales', payout: 12, planName: 'Plan A' },
    { name: 'Returns', payout: -4, planName: 'Plan A' },
    { name: 'FlatBonus', payout: 500, planName: 'Plan A' }, // Pattern C — no traces
  ], g);

  const sales = components.find(c => c.name === 'Sales')!;
  assert.equal(sales.attributable, true);
  assert.equal(sales.pattern, 'additive');
  assert.equal(sales.tracedSubtotal, 12); // 4 + 8 === payout
  assert.equal(sales.transactions.length, 2);

  const returns = components.find(c => c.name === 'Returns')!;
  assert.equal(returns.attributable, true);
  assert.equal(returns.pattern, 'clawback');
  assert.equal(returns.tracedSubtotal, -4);

  const flat = components.find(c => c.name === 'FlatBonus')!;
  assert.equal(flat.attributable, false);
  assert.equal(flat.pattern, 'entity-level');
  assert.equal(flat.transactions.length, 0);
});
