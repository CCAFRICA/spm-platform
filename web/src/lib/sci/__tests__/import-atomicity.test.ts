/**
 * HF-280 — plan-import atomicity + retry-feedback deterministic tests.
 *
 *   1. A failed component outcome aborts the import; the structured reason carries
 *      variant + component name + underlying error (-> caller returns before any
 *      rule_set persistence; zero rows written).
 *   2. All-success outcomes do NOT abort (persist proceeds — behavior unchanged).
 *   3. Retry envelope: the plan_component prompt carries the prior attempt's
 *      violation message when retryFeedback is present (and only then).
 *
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluateImportAtomicity } from '../plan-interpretation';
import type { ComponentOutcome } from '../interpretation-errors';
import { AnthropicAdapter } from '../../ai/providers/anthropic-adapter';

const ok = (id: string, name: string, appliesTo?: string[]): ComponentOutcome => ({
  id, name, status: 'success', attempts: 1, appliesTo, lastAttemptAt: 'now',
});
const fail = (id: string, name: string, appliesTo: string[], errMessage: string): ComponentOutcome => ({
  id, name, status: 'failed', attempts: 3, errClass: 'cognition_violation', errMessage, appliesTo, lastAttemptAt: 'now',
});

// ── 1. A failed component aborts the import with a structured, named reason ──
test('HF-280: one failed component (the BCL c2-ejecutivo shape) aborts the import', () => {
  const outcomes = [
    ok('c1-ejecutivo-senior', 'Colocación de Crédito', ['ejecutivo-senior']),
    ok('c1-ejecutivo', 'Colocación de Crédito', ['ejecutivo']),
    ok('c2-ejecutivo-senior', 'Captación de Depósitos', ['ejecutivo-senior']),
    fail('c2-ejecutivo', 'Captación de Depósitos', ['ejecutivo'],
      'a ratio-source band (reference_field="deposit_achievement") was emitted WITH a scale (side="convergence", value=100)'),
    ok('c3-ejecutivo', 'Productos Cruzados', ['ejecutivo']),
  ];
  const result = evaluateImportAtomicity({ componentsCount: 4, componentOutcomes: outcomes });
  assert.ok(result, 'import must abort when any component failed');
  // structured reason carries component name + variant + underlying error
  assert.match(result!.reason, /HF-280 atomicity/);
  assert.match(result!.reason, /Captación de Depósitos/);
  assert.match(result!.reason, /\[variant ejecutivo\]/);
  assert.match(result!.reason, /deposit_achievement/);
  assert.match(result!.reason, /1 of 5 component/); // 1 failed of 5 outcomes
});

// ── 2. All components succeed -> no abort (persist proceeds, behavior unchanged) ──
test('HF-280: all components succeed -> evaluateImportAtomicity returns null (persist proceeds)', () => {
  const outcomes = [
    ok('c1-ejecutivo-senior', 'A', ['ejecutivo-senior']),
    ok('c1-ejecutivo', 'A', ['ejecutivo']),
    ok('c2-ejecutivo-senior', 'B', ['ejecutivo-senior']),
    ok('c2-ejecutivo', 'B', ['ejecutivo']),
  ];
  assert.equal(evaluateImportAtomicity({ componentsCount: 4, componentOutcomes: outcomes }), null);
});

test('HF-280: zero usable components aborts with the no-components reason (DD-7 — message preserved)', () => {
  const r = evaluateImportAtomicity({ componentsCount: 0, componentOutcomes: [] });
  assert.ok(r);
  assert.match(r!.reason, /produced no components/);
});

test('HF-280: skeleton failure aborts with the skeleton reason (DD-7 — message preserved)', () => {
  const r = evaluateImportAtomicity({ skeletonError: 'HTTP 503', componentsCount: 0, componentOutcomes: [] });
  assert.ok(r);
  assert.match(r!.reason, /Plan skeleton call failed: HTTP 503/);
});

test('HF-280: a skipped-from-prior success (reimport-resume) does not abort', () => {
  const outcomes: ComponentOutcome[] = [
    { id: 'c1', name: 'A', status: 'success', attempts: 0, skippedFromPrior: true, lastAttemptAt: 'now' },
    ok('c2', 'B'),
  ];
  assert.equal(evaluateImportAtomicity({ componentsCount: 2, componentOutcomes: outcomes }), null);
});

// ── 3. Retry envelope: the violation message reaches the plan_component prompt ──
function planComponentPrompt(retryFeedback?: string): string {
  const adapter = new AnthropicAdapter({ apiKey: 'test-key' } as never);
  const req = {
    task: 'plan_component',
    input: {
      content: 'PLAN TEXT: component pays tiers on deposit attainment.',
      format: 'text',
      componentSpec: { id: 'c2-ejecutivo', name: 'Captación de Depósitos', appliesToEmployeeTypes: ['ejecutivo'], briefSemantic: '' },
      ...(retryFeedback ? { retryFeedback } : {}),
    },
  };
  // buildUserPrompt is private (TS-only); callable at runtime.
  return (adapter as unknown as { buildUserPrompt(r: unknown): string }).buildUserPrompt(req);
}

test('HF-280: retry envelope carries the prior violation message into the plan_component prompt', () => {
  const violation = 'composed a structurally-incoherent intent: a ratio-source band (reference_field="deposit_achievement") was emitted WITH a scale; emit scale: null for ratio-source bands';
  const withFb = planComponentPrompt(violation);
  assert.match(withFb, /PREVIOUS ATTEMPT AT THIS COMPONENT WAS REJECTED/);
  assert.ok(withFb.includes(violation), 'the structured violation text is embedded verbatim');
});

test('HF-280: first attempt (no retryFeedback) has no rejection block (DD-7 — prompt unchanged)', () => {
  const first = planComponentPrompt(undefined);
  assert.doesNotMatch(first, /PREVIOUS ATTEMPT AT THIS COMPONENT WAS REJECTED/);
});
