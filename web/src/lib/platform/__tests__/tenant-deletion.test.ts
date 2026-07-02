/**
 * HF-352 — tenant-deletion safety logic. Runner: node --test --import tsx.
 * P2/P3 foundation: the cascade-dependency rule (B1), the directive category order (I3), the
 * Delete-Tenant completeness (EDGE 2), and audit_logs exclusion from clean-slate (I6).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  CLEAN_SLATE_CATEGORIES, CATEGORY_REQUIRES, DELETE_TENANT_TABLES,
  validateCleanSlateSelection, type CleanSlateCategoryKey,
} from '../tenant-deletion';

test('Clean Slate categories match the directive (5 categories, dependents-first tables)', () => {
  assert.deepEqual(CLEAN_SLATE_CATEGORIES.map((c) => c.key), ['calc', 'plan', 'entity', 'data', 'intelligence']);
  const byKey = Object.fromEntries(CLEAN_SLATE_CATEGORIES.map((c) => [c.key, c.tables]));
  // HF-370 O5 expanded each category to the full tenant-scoped leaf footprint (dependents-first,
  // DELETE_TENANT_TABLES order); HF-371 appended import_finalize_runs (the finalize coalescing ledger);
  // OB-257 appended summary_rollups (the MSP rollup store — derived data, re-materialized on finalize).
  assert.deepEqual(byKey.calc, ['calculation_traces', 'calculation_results', 'entity_period_outcomes', 'summary_artifacts', 'summary_rollups', 'calculation_batches']);
  assert.deepEqual(byKey.plan, ['rule_set_assignments', 'rule_set_lifecycle_events', 'plan_interpretation_runs', 'rule_sets']); // dependents before rule_sets
  assert.deepEqual(byKey.entity, ['entity_relationships', 'entities']); // relationships before entities
  // OB-251 (P-D2): the Data layer also clears in-flight async ingestion state so a Clean Slate leaves
  // no stale "in progress"/"N imports" residue. committed_data stays FIRST (EDGE-1 calc_traces sever).
  assert.deepEqual(byKey.data, ['committed_data', 'processing_jobs', 'import_session_telemetry', 'ingestion_events', 'pulse_load_jobs', 'ingestion_configs', 'file_objects', 'import_finalize_runs']);
  assert.deepEqual(byKey.intelligence, ['classification_signals', 'structural_fingerprints', 'surface_bindings', 'synaptic_density', 'comprehension_artifacts', 'intelligence_artifacts', 'ai_call_metrics', 'agent_invocations']);
});

test('B1 cascade-dependency: entity REQUIRES calc + plan; others self-contained', () => {
  assert.deepEqual(CATEGORY_REQUIRES.entity, ['calc', 'plan']);
  assert.equal(CATEGORY_REQUIRES.calc, undefined);
  assert.equal(CATEGORY_REQUIRES.plan, undefined);
  assert.equal(CATEGORY_REQUIRES.data, undefined);
  assert.equal(CATEGORY_REQUIRES.intelligence, undefined);
});

test('validateCleanSlateSelection enforces the cascade dependency', () => {
  // entity alone → rejected (would cascade-wipe calc + plan)
  let v = validateCleanSlateSelection(['entity']);
  assert.equal(v.ok, false);
  assert.deepEqual(v.missing.entity, ['calc', 'plan']);
  // entity WITH calc + plan → ok
  v = validateCleanSlateSelection(['entity', 'calc', 'plan']);
  assert.equal(v.ok, true);
  // self-contained categories → ok alone
  for (const k of ['calc', 'plan', 'data', 'intelligence'] as CleanSlateCategoryKey[]) {
    assert.equal(validateCleanSlateSelection([k]).ok, true, `${k} alone should be valid`);
  }
  // entity + calc but NOT plan → rejected (plan still missing)
  v = validateCleanSlateSelection(['entity', 'calc']);
  assert.equal(v.ok, false);
  assert.deepEqual(v.missing.entity, ['plan']);
});

test('Delete Tenant table list: NO-ACTION blockers present + dependents-first; never the tenant row; never the dead approval_queue', () => {
  const t = DELETE_TENANT_TABLES;
  // the reference_* trio (the only hard blockers of DELETE FROM tenants) must be present, child-first
  assert.ok(t.includes('reference_data') && t.includes('reference_items') && t.includes('alias_registry'));
  assert.ok(t.indexOf('alias_registry') < t.indexOf('reference_items'), 'alias_registry before reference_items');
  assert.ok(t.indexOf('reference_items') < t.indexOf('reference_data'), 'reference_items before reference_data');
  // entities deleted after its dependents
  assert.ok(t.indexOf('entity_relationships') < t.indexOf('entities'));
  assert.ok(t.indexOf('rule_set_assignments') < t.indexOf('rule_sets'));
  assert.ok(t.indexOf('calculation_results') < t.indexOf('calculation_batches'));
  // the tenants row is deleted SEPARATELY (runDeleteTenant), never as a tenant_id-scoped table here
  assert.ok(!t.includes('tenants'));
  // the dead 'approval_queue' (does not exist) must not appear; the real table does
  assert.ok(!t.includes('approval_queue'));
  assert.ok(t.includes('approval_requests'));
});

test('audit_logs is NEVER a clean-slate target (preserve audit history, I6)', () => {
  for (const c of CLEAN_SLATE_CATEGORIES) {
    assert.ok(!c.tables.includes('audit_logs'), `${c.key} must not include audit_logs`);
  }
});
