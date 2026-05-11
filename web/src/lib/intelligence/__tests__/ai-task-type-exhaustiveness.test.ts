// OB-199 Phase 4 supplement C (Row 4-sub disposition):
//
// Compile-time AITaskType ↔ signal-registry exhaustiveness check.
//
// Pre-OB-199, AI_TASK_LEVEL_MAP was a `Record<AITaskType, string>` literal —
// adding a new AITaskType produced a TypeScript compile error at the literal
// if the new member was not added to the map. That exhaustiveness was lost
// when the map collapsed into 16 imperative `registerAITaskMapping()` calls
// in signal-registry.ts (no structural-typing constraint on which AITaskType
// values are covered).
//
// This test restores the compile-time guarantee via the `Exclude` pattern:
// if a new AITaskType member is added without extending ALL_AI_TASK_TYPES,
// the `_exhaustivenessCheck` line below produces TS2322. The runtime `test`
// block additionally fails if the literal is extended but the registry
// mapping is missing (defense-in-depth for the build-and-run flow).

import { test } from 'node:test';
import assert from 'node:assert';
import type { AITaskType } from '@/lib/ai/types';
import { lookupAITaskSignalType } from '@/lib/intelligence/signal-registry';

const ALL_AI_TASK_TYPES = [
  'file_classification',
  'sheet_classification',
  'field_mapping',
  'field_mapping_second_pass',
  'plan_interpretation',
  'workbook_analysis',
  'import_field_mapping',
  'entity_extraction',
  'anomaly_detection',
  'recommendation',
  'natural_language_query',
  'dashboard_assessment',
  'narration',
  'header_comprehension',
  'document_analysis',
  'convergence_mapping',
] as const satisfies readonly AITaskType[];

// Compile-time exhaustiveness: if a new AITaskType member is added to
// lib/ai/types.ts without extending ALL_AI_TASK_TYPES above, `Missing` resolves
// to that member instead of `never`, and the const assignment below fails TS
// compilation. This is the structural-typing parity to the deleted
// `Record<AITaskType, string>` exhaustiveness.
type Missing = Exclude<AITaskType, (typeof ALL_AI_TASK_TYPES)[number]>;
const _exhaustivenessCheck: Missing extends never ? true : never = true;
void _exhaustivenessCheck;

test('OB-199 Phase 4 supplement C — every AITaskType has a registered signal_type mapping', () => {
  const missing: string[] = [];
  for (const taskType of ALL_AI_TASK_TYPES) {
    const signalType = lookupAITaskSignalType(taskType);
    if (signalType === null) {
      missing.push(taskType);
    }
  }
  assert.deepStrictEqual(
    missing,
    [],
    `AITaskType members without registry mapping: [${missing.join(', ')}]. ` +
    `Add a registerAITaskMapping() call in lib/intelligence/signal-registry.ts ` +
    `for each missing entry.`,
  );
});
