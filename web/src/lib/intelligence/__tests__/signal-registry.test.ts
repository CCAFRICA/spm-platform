// OB-199 Phase 2 — signal-registry.ts coverage assertions.
// Tests the registry's confidence_required schema, observability:write_failure
// presence, AI_TASK_LEVEL_MAP collapse closure (F-AUD-006-005), and
// registration-time confidence_required enforcement (defense-in-depth).

import { test } from 'node:test';
import assert from 'node:assert';
import {
  all,
  lookup,
  isRegistered,
  register,
  lookupAITaskSignalType,
  type SignalTypeDeclaration,
} from '../signal-registry';

test('OB-199 §5.2 registry — every registered signal_type declares confidence_required:boolean', () => {
  const decls = all();
  assert.ok(decls.length > 0, 'registry must be populated');
  for (const decl of decls) {
    assert.strictEqual(
      typeof decl.confidence_required,
      'boolean',
      `signal_type '${decl.identifier}' missing confidence_required:boolean (got ${typeof decl.confidence_required})`,
    );
  }
});

test('OB-199 §5.2 registry — lifecycle:briefing and lifecycle:stream register confidence_required:false (F-AUD-006-007 closure)', () => {
  const briefing = lookup('lifecycle:briefing');
  const stream = lookup('lifecycle:stream');
  assert.ok(briefing, 'lifecycle:briefing must be registered');
  assert.ok(stream, 'lifecycle:stream must be registered');
  assert.strictEqual(briefing!.confidence_required, false, 'lifecycle:briefing must declare confidence_required:false');
  assert.strictEqual(stream!.confidence_required, false, 'lifecycle:stream must declare confidence_required:false');
});

test('OB-199 §5.2 registry — observability:write_failure registered with declared reader', () => {
  const obs = lookup('observability:write_failure');
  assert.ok(obs, 'observability:write_failure must be registered');
  assert.ok(obs!.declared_readers.length > 0, 'observability:write_failure must have ≥1 declared reader');
  assert.strictEqual(obs!.confidence_required, false, 'observability:write_failure must declare confidence_required:false');
  assert.strictEqual(obs!.signal_level, 'L3', 'observability:write_failure registers at L3 (cross-flywheel)');
});

test('OB-199 §5.3 registry — register() throws when confidence_required is omitted (defense-in-depth)', () => {
  // Cast through unknown to bypass TypeScript's required-field check;
  // the runtime guard is the real defense against silent default drift.
  const bad = {
    identifier: 'test:missing_confidence_required',
    signal_level: 'L1',
    originating_flywheel: 'tenant',
    declared_writers: ['test'],
    declared_readers: ['test'],
    description: 'test signal — must fail registration',
    // confidence_required intentionally omitted
  } as unknown as SignalTypeDeclaration;
  assert.throws(
    () => register(bad),
    /missing explicit confidence_required:boolean/,
    'register() must throw when confidence_required is not a boolean',
  );
});

test('OB-199 §5.3 registry — register() throws when confidence_required is a non-boolean type (string)', () => {
  const bad = {
    identifier: 'test:string_confidence_required',
    signal_level: 'L1',
    originating_flywheel: 'tenant',
    declared_writers: ['test'],
    declared_readers: ['test'],
    description: 'test signal — confidence_required is not boolean',
    confidence_required: 'yes' as unknown as boolean,
  } as SignalTypeDeclaration;
  assert.throws(
    () => register(bad),
    /missing explicit confidence_required:boolean/,
    'register() must throw when confidence_required is not strictly boolean',
  );
});

test('OB-199 §5.3 registry — all 16 AI_TASK_LEVEL_MAP former identifiers are registered (F-AUD-006-005 closure)', () => {
  const aiTaskTypes = [
    'file_classification',
    'sheet_classification',
    'document_analysis',
    'field_mapping',
    'field_mapping_second_pass',
    'import_field_mapping',
    'header_comprehension',
    'plan_interpretation',
    'workbook_analysis',
    'entity_extraction',
    'convergence_mapping',
    'anomaly_detection',
    'recommendation',
    'narration',
    'dashboard_assessment',
    'natural_language_query',
  ];
  for (const taskType of aiTaskTypes) {
    const signalType = lookupAITaskSignalType(taskType);
    assert.ok(signalType, `AITaskType '${taskType}' must resolve to a registered signal_type via lookupAITaskSignalType`);
    assert.ok(
      isRegistered(signalType!),
      `signal_type '${signalType}' (mapped from AITaskType '${taskType}') must be in the registry`,
    );
    const decl = lookup(signalType!);
    assert.strictEqual(
      decl!.confidence_required,
      true,
      `AI training signal '${signalType}' should declare confidence_required:true (carries AI's self-asserted confidence)`,
    );
  }
});

test('OB-199 §5.3 registry — lookupAITaskSignalType returns null for unmapped task', () => {
  assert.strictEqual(lookupAITaskSignalType('nonexistent_task_type'), null);
});

test('OB-199 §5.3 registry — registry has at least 33 signal_types (15 pre-OB + 16 ai_-prefix + 1 observability + 1 lifecycle:outcome retroactive)', () => {
  const count = all().length;
  assert.ok(count >= 33, `registry must contain at least 33 signal_types (got ${count})`);
});

test('OB-199 Phase 2 retroactive — lifecycle:outcome registered with confidence_required:true', () => {
  // Discovered during Phase 4 inventory at training-signal-service.ts:126
  // (recordOutcome writes wasCorrect ? 1.0 : 0.0). Pre-OB-199 fired the
  // [SignalRegistry] not registered soft-warn; post-Phase-3 would throw.
  const decl = lookup('lifecycle:outcome');
  assert.ok(decl, 'lifecycle:outcome must be registered (Phase 2 retroactive add)');
  assert.strictEqual(decl!.confidence_required, true);
  assert.strictEqual(decl!.signal_level, 'L1');
  assert.ok(decl!.declared_readers.length > 0);
});
