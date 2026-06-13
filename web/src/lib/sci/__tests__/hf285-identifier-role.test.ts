/**
 * HF-285-B — classification-aware identifier role (proof gate B, unit level).
 * Runner: node --test --import tsx.
 *
 * Both copies of the identifier-role derivation (agents.ts assignSemanticRole via
 * resolveClaimsPhase1/generatePartialBindings, negotiation.ts inferRoleForAgent via
 * generatePartialBindings) must assign entity_identifier to a high-uniqueness
 * `identifier` column on an ENTITY-classified sheet — the DIAG-066 case (warm cache
 * stored transaction_identifier, diverging from the cold proposal's entity_identifier).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isEntityIdentifierAgent } from '../sci-types';
import { generatePartialBindings } from '../negotiation';
import type { ContentProfile, FieldProfile } from '../sci-types';

// Minimal profile with one unique identifier column (uniqueness 1.0 > 0.8) carrying
// HC columnRole 'identifier' and NO identifiesWhat — the warm-recall / LLM-silent case
// that previously fell to transaction_identifier.
function profileWithUniqueIdentifier(): ContentProfile {
  const field = (name: string, distinct: number, dataType: string): FieldProfile => ({
    fieldName: name,
    fieldIndex: 0,
    dataType: dataType as FieldProfile['dataType'],
    distinctCount: distinct,
    nullCount: 0,
    sampleValues: [],
    nameSignals: { looksLikePersonName: false } as FieldProfile['nameSignals'],
    distribution: { isSequential: false } as FieldProfile['distribution'],
  } as unknown as FieldProfile);

  const interpretations = new Map<string, { columnName: string; columnRole: string; confidence: number; semanticMeaning: string; dataExpectation: string }>();
  interpretations.set('location_id', { columnName: 'location_id', columnRole: 'identifier', confidence: 0.85, semanticMeaning: 'id', dataExpectation: '' });
  // no identifiesWhat → forces the deterministic/classification-aware fallback

  return {
    contentUnitId: 'f::Sucursales::0',
    tabName: 'Sucursales',
    fields: [field('location_id', 8, 'text')],
    structure: { rowCount: 8 } as ContentProfile['structure'],
    headerComprehension: { interpretations, crossSheetInsights: [], llmCallDuration: 0, llmModel: 'test', fromVocabularyBinding: false } as unknown as ContentProfile['headerComprehension'],
  } as unknown as ContentProfile;
}

test('isEntityIdentifierAgent: entity + target true; transaction/reference/plan false', () => {
  assert.equal(isEntityIdentifierAgent('entity'), true);
  assert.equal(isEntityIdentifierAgent('target'), true);
  assert.equal(isEntityIdentifierAgent('transaction'), false);
  assert.equal(isEntityIdentifierAgent('reference'), false);
  assert.equal(isEntityIdentifierAgent('plan'), false);
});

test('entity sheet: unique identifier → entity_identifier (was transaction_identifier pre-HF-285-B)', () => {
  const p = profileWithUniqueIdentifier();
  const bindings = generatePartialBindings(p, 'entity', ['location_id'], []);
  const idb = bindings.find(b => b.sourceField === 'location_id');
  assert.ok(idb, 'location_id binding exists');
  assert.equal(idb!.semanticRole, 'entity_identifier');
});

test('target sheet: unique identifier → entity_identifier (consistent with resolveEntityIdField)', () => {
  const p = profileWithUniqueIdentifier();
  const bindings = generatePartialBindings(p, 'target', ['location_id'], []);
  assert.equal(bindings.find(b => b.sourceField === 'location_id')!.semanticRole, 'entity_identifier');
});

test('transaction sheet: unique identifier still → transaction_identifier (event id, unchanged)', () => {
  const p = profileWithUniqueIdentifier();
  const bindings = generatePartialBindings(p, 'transaction', ['location_id'], []);
  assert.equal(bindings.find(b => b.sourceField === 'location_id')!.semanticRole, 'transaction_identifier');
});
