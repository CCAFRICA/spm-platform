/**
 * OB-253 Phase 3 — joint recognition. Runner: node --test.
 * PG-3 deterministic proof of the four facet outcomes AND the load-bearing co-presence flip:
 * a value normalization ALONE would collapse, but joint recognition keeps distinct because
 * deduplication is co-present. No LLM, no DB — pure structural recognition.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  buildColumnContext, assessNormalization, resolveJointly, recognizeColumn,
} from '../joint-recognition';

function ctxFrom(rows: Record<string, unknown>[], column: string) {
  return buildColumnContext(rows, column, Object.keys(rows[0] ?? {}));
}

test('PG-3 #1 CORRECTION — a typo collapses to the canonical (normalization, no competing facet)', async () => {
  const rows = [{ region: 'Mexico' }, { region: 'Mexico' }, { region: 'Mexcio' }, { region: 'Mexico' }];
  const res = await recognizeColumn(ctxFrom(rows, 'region'));
  const typo = res.find((r) => r.value === 'Mexcio');
  assert.ok(typo, 'the typo was assessed');
  assert.equal(typo!.resolvedFacet, 'normalization');
  assert.equal(typo!.action, 'collapse');
  assert.equal(typo!.canonical, 'Mexico');
});

test('PG-3 #2 IDENTITY — two look-alike values with disjoint row-context are kept distinct (deduplication)', async () => {
  // Same-looking names, but each associates with a DIFFERENT id → different entities.
  const rows = [
    { name: 'Jon Smith', id: 'A' }, { name: 'Jon Smith', id: 'A' },
    { name: 'Jon Smyth', id: 'B' }, { name: 'Jon Smyth', id: 'B' },
  ];
  const res = await recognizeColumn(ctxFrom(rows, 'name'));
  const smyth = res.find((r) => r.value === 'Jon Smyth');
  assert.ok(smyth, 'assessed');
  assert.equal(smyth!.resolvedFacet, 'deduplication');
  assert.equal(smyth!.action, 'keep_distinct');
});

test('PG-3 #3 ANOMALY — a numeric outlier surfaces, not silently corrected (anomaly, absence-of-competing-signal)', async () => {
  const rows = [10, 11, 9, 10, 12, 10, 11, 9, 1000].map((v) => ({ amount: String(v) }));
  const res = await recognizeColumn(ctxFrom(rows, 'amount'));
  const outlier = res.find((r) => r.value === '1000');
  assert.ok(outlier, 'assessed');
  assert.equal(outlier!.resolvedFacet, 'anomaly');
  assert.equal(outlier!.action, 'surface_anomaly');
});

test('PG-3 #4 CO-PRESENCE PROOF — normalization ALONE would collapse; joint keeps distinct (dedup co-present)', async () => {
  const rows = [
    { vendor: 'Acme Corp', acct: '1001' }, { vendor: 'Acme Corp', acct: '1001' },
    { vendor: 'Acme Corp.', acct: '7777' }, { vendor: 'Acme Corp.', acct: '7777' },
  ];
  const ctx = ctxFrom(rows, 'vendor');

  // What NORMALIZATION ALONE concludes (sequential / blind to other facets):
  const normAlone = assessNormalization('Acme Corp.', ctx);
  assert.equal(normAlone.claim, 'variant', 'normalization alone: a variant surface form');
  assert.equal(normAlone.canonical, 'Acme Corp', 'normalization alone WOULD collapse "Acme Corp." → "Acme Corp"');

  // What JOINT recognition concludes (all four facets co-present):
  const res = await recognizeColumn(ctx);
  const joint = res.find((r) => r.value === 'Acme Corp.');
  assert.ok(joint, 'assessed jointly');
  assert.equal(joint!.action, 'keep_distinct', 'JOINT: kept distinct — different acct ⇒ different entity');
  assert.equal(joint!.resolvedFacet, 'deduplication', 'deduplication owns it, suppressing normalization');
  // the audit shows BOTH co-present claims (the joint information sequential processing destroys)
  const claims = Object.fromEntries(joint!.assessments.map((a) => [a.facet, a.claim]));
  assert.equal(claims.normalization, 'variant', 'normalization still CLAIMED variant (co-present)');
  assert.equal(claims.deduplication, 'distinct_identity', 'deduplication CLAIMED distinct identity (co-present)');
  // and the reasoning records the suppression
  assert.match(joint!.reasoning, /suppress/i);
});

test('PG-3 RECONCILIATION — same magnitude, different format aligns (unit_mismatch)', async () => {
  const rows = [{ amt: '1000' }, { amt: '1000' }, { amt: '1,000' }, { amt: '500' }];
  const res = await recognizeColumn(ctxFrom(rows, 'amt'));
  const formatted = res.find((r) => r.value === '1,000');
  assert.ok(formatted, 'assessed');
  assert.equal(formatted!.resolvedFacet, 'reconciliation');
  assert.equal(formatted!.action, 'align');
});

test('resolveJointly is deterministic and records all four co-present assessments', () => {
  const assessments = [
    { facet: 'normalization' as const, claim: 'variant' as const, confidence: 0.9, canonical: 'X', evidence: {} },
    { facet: 'reconciliation' as const, claim: 'none' as const, confidence: 0, evidence: {} },
    { facet: 'deduplication' as const, claim: 'distinct_identity' as const, confidence: 0.8, canonical: 'X', evidence: {} },
    { facet: 'anomaly' as const, claim: 'none' as const, confidence: 0, evidence: {} },
  ];
  const r = resolveJointly('Y', 'col', assessments);
  assert.equal(r.action, 'keep_distinct');
  assert.equal(r.assessments.length, 4);
});
