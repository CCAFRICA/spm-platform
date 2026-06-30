// OB-256 — W-4 (classification rationale truth) + W-5 (Intelligence Summary counts plan creation).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildVerdictSummary } from '../proposal-intelligence';
import { projectImportTelemetry, unitFieldKey } from '../session-telemetry-accumulator';
import type { AgentScore, ContentProfile, NegotiationResult, FieldAffinity } from '../sci-types';

const planAffinity = (fieldName: string): FieldAffinity => ({
  fieldName, winner: 'plan', isShared: false,
  affinities: { plan: 0.85, entity: 0.15, target: 0.3, transaction: 0.2, reference: 0.1 },
});

// W-4 — a plan ::split has a correct winner but NO round-2 signal (synthesized vector); its evidence is
// the field affinities. The verdict must report the recognized columns, not "by elimination".
test('OB-256 W-4: plan ::split verdict reports the recognized commission-rule columns, not "by elimination"', () => {
  const scores: AgentScore[] = [{ agent: 'plan', confidence: 0.8, signals: [], reasoning: '' }];
  const negotiation = {
    contentUnitId: 'x', round1Scores: scores, round2Scores: scores, claims: [], isSplit: false, log: [],
    fieldAffinities: ['% AUTORIZADO', 'BASE COMISION', 'FORMULA BASE COMISION'].map(planAffinity),
  } as unknown as NegotiationResult;
  const verdict = buildVerdictSummary('plan', scores, {} as ContentProfile, negotiation);
  assert.ok(!/by elimination/.test(verdict), `must not say "by elimination": ${verdict}`);
  assert.match(verdict, /% AUTORIZADO/);
  assert.match(verdict, /3 columns recognized/);
});

test('OB-256 W-4: a winner with NO affinities still falls back to the honest "by elimination" line', () => {
  const scores: AgentScore[] = [{ agent: 'reference', confidence: 0.5, signals: [], reasoning: '' }];
  const negotiation = { contentUnitId: 'x', round1Scores: scores, round2Scores: scores, claims: [], isSplit: false, log: [], fieldAffinities: [] } as unknown as NegotiationResult;
  assert.match(buildVerdictSummary('reference', scores, {} as ContentProfile, negotiation), /by elimination/);
});

// W-5 — plan creation (rule_sets, not committed_data rows) is counted in the Intelligence Summary.
test('OB-256 W-5: projectImportTelemetry surfaces plan creation counts', () => {
  const unit_states: Record<string, unknown> = {
    [unitFieldKey('u1', 'plansCreated')]: 1, [unitFieldKey('u1', 'componentsCreated')]: 9,
    [unitFieldKey('u2', 'plansCreated')]: 1, [unitFieldKey('u2', 'componentsCreated')]: 11,
  };
  const rec = { tenant_id: 't', import_session_id: 's', total_signals_written: 0, signals_per_type: {}, unit_states, updated_at: '2026-06-30T00:00:00Z' } as never;
  const t = projectImportTelemetry(rec);
  assert.equal(t.plans.created, 2);
  assert.equal(t.plans.components, 20);
});

test('OB-256 W-5: a plan-free import reports zero plans (no false counts)', () => {
  const rec = { tenant_id: 't', import_session_id: 's', total_signals_written: 0, signals_per_type: {}, unit_states: { [unitFieldKey('u1', 'rowsCommitted')]: 100, [unitFieldKey('u1', 'expectedRows')]: 100 }, updated_at: '2026-06-30T00:00:00Z' } as never;
  const t = projectImportTelemetry(rec);
  assert.equal(t.plans.created, 0);
  assert.equal(t.plans.components, 0);
});
