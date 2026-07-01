/**
 * HF-370 O2 — phantom-entity prevention. Entity creation derives ONLY from the model's recognition
 * of a genuine entity identifier (scope_role==='entity' && nature_role==='identifier'), never from a
 * row-index ('#') or a rate-table band label. Proves:
 *   • findHcEntityIdCandidates reads the model's bare scope_role/nature_role — a '#' row ordinal and
 *     band-label columns are NOT candidates; a real entity id IS.
 *   • looksLikeRowIndex flags an ordinal column.
 *   • the processEntityUnit selection rule (honor the heuristic binding IFF it is a model candidate;
 *     else the model wins; the fallback is row-index-guarded) never selects a '#' or band label.
 * Runner: node --test --import tsx.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { findHcEntityIdCandidates } from '../commit-content-unit';
import { looksLikeRowIndex } from '../entity-resolution';

// Build a classificationTrace with the model's per-column bare primitives (as the real trace carries).
const trace = (cols: Record<string, { scope_role?: string; nature_role?: string; confidence?: number }>) => ({
  headerComprehension: { interpretations: cols },
});

// The processEntityUnit selection rule, mirrored for test (route logic, execute-bulk):
function selectEntityId(
  t: Record<string, unknown>,
  bindingField: string | null,
  sampleValues: (field: string) => string[],
): string | null {
  const modelCandidates = findHcEntityIdCandidates(t);
  let id: string | null =
    bindingField && modelCandidates.includes(bindingField) ? bindingField
    : (modelCandidates[0] ?? null);
  if (!id && bindingField) {
    if (!looksLikeRowIndex(sampleValues(bindingField))) id = bindingField;
  }
  return id;
}

test('HF-370 O2: a "#" row-ordinal column is NOT a model entity-id candidate', () => {
  const t = trace({
    '#': { scope_role: 'none', nature_role: 'categorical', confidence: 0.9 },       // model: row ordinal
    'RangoComision': { scope_role: 'reference', nature_role: 'categorical', confidence: 0.9 },
    'Tasa': { scope_role: 'none', nature_role: 'measure', confidence: 0.95 },
  });
  assert.deepEqual(findHcEntityIdCandidates(t), []); // no entity identifier recognized → no entities
});

test('HF-370 O2: rate-table band labels are NOT model entity-id candidates', () => {
  const t = trace({
    'Banda': { scope_role: 'reference', nature_role: 'categorical', confidence: 0.92 }, // "<70%", "≥120%"
    'Porcentaje': { scope_role: 'none', nature_role: 'measure', confidence: 0.95 },
  });
  assert.deepEqual(findHcEntityIdCandidates(t), []);
});

test('HF-370 O2: a genuine entity identifier IS a candidate', () => {
  const t = trace({
    'ID_Empleado': { scope_role: 'entity', nature_role: 'identifier', confidence: 0.99 },
    'Nombre': { scope_role: 'entity', nature_role: 'name', confidence: 0.97 },
  });
  assert.deepEqual(findHcEntityIdCandidates(t), ['ID_Empleado']);
});

test('HF-370 O2: looksLikeRowIndex flags an ordinal, not a real id', () => {
  assert.equal(looksLikeRowIndex(['1', '2', '3', '4', '5']), true);
  assert.equal(looksLikeRowIndex(['BCL-5001', 'BCL-5002', 'BCL-5003']), false);
});

// ── The full selection rule ──

test('HF-370 O2: Plan-General shape ("#" binding, no model entity id) → NO entity id selected', () => {
  const t = trace({ '#': { scope_role: 'none', nature_role: 'categorical', confidence: 0.9 } });
  const id = selectEntityId(t, '#', () => ['1', '2', '3', '4']); // heuristic bound "#", values are ordinal
  assert.equal(id, null); // refused → processEntityUnit returns error, spawns 0 entities
});

test('HF-370 O2: roster — heuristic binding agrees with the model → honored (no ID_Gerente regression)', () => {
  // model recognizes BOTH ID_Empleado and ID_Gerente as entity identifiers; the binding picked the
  // correct one (ID_Empleado). Honoring a model-valid binding preserves the disambiguation.
  const t = trace({
    'ID_Empleado': { scope_role: 'entity', nature_role: 'identifier', confidence: 0.99 },
    'ID_Gerente': { scope_role: 'entity', nature_role: 'identifier', confidence: 0.99 },
    'Nombre': { scope_role: 'entity', nature_role: 'name', confidence: 0.97 },
  });
  const id = selectEntityId(t, 'ID_Empleado', () => ['BCL-5001', 'BCL-5002']);
  assert.equal(id, 'ID_Empleado');
});

test('HF-370 O2: heuristic binding NOT model-recognized → the model wins over the heuristic', () => {
  // binding heuristically picked "#" (first column), but the model recognized ID_Empleado as the id.
  const t = trace({
    '#': { scope_role: 'none', nature_role: 'categorical', confidence: 0.9 },
    'ID_Empleado': { scope_role: 'entity', nature_role: 'identifier', confidence: 0.99 },
  });
  const id = selectEntityId(t, '#', () => ['1', '2', '3']);
  assert.equal(id, 'ID_Empleado'); // NOT "#": the model's recognition overrides the heuristic binding
});
