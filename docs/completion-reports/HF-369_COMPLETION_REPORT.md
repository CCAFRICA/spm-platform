# HF-369 — Sheet data_type from model recognition (Phase 0 REFUTES the directive's premise)

## Headline (HALT-0A + HALT-3)

Phase 0 evidence **refutes** the directive's core assumption. `resolved_data_type` / the
committed `data_type` is **NOT** derived from the `semantic_roles` reference-claim layer. It is
an identity map from the sheet's `confirmedClassification`, which is produced by the **expression
classifier that HF-367/HF-368 built** (`decisionSource: "expression"`). The BCL Datos sheet
classified `reference` **from the expression classifier itself**, because the entity-identifier
and name/categorical columns arrived at the classifier with `scope_role = nature_role = undefined`
— i.e. the model's bare primitives were **missing on those columns**, so the classifier found no
entity/transaction identifier and fell to its `reference` residual.

Root cause of the missing primitives: **HF-368 added `scope_role`/`nature_role` to the atom
`column_roles` recognition schema but did NOT bump `ATOM_ALGORITHM_VERSION` (still `2`).** So
flywheel atoms cached before HF-368 (the generic, reused `ID_Empleado`/`Nombre_Completo`/`Sucursal`
columns) are still claimed and **warm-recalled without the bare primitives**, while the novel
per-tenant measure columns went through a fresh LLM call and DID get them.

Therefore the directive's prescribed fix (derive `data_type` from `field_identities.natureRole`)
would **also fail here** — the entity-id's `natureRole` is `undefined` too, so "entity identifier
present" is not readable from `natureRole`. Per HALT-0A/HALT-3, the fix belongs at the
**flywheel/comprehension-recall completeness layer**, not a `data_type` re-derivation, and NOT the
`semantic_roles` layer. The implemented fix (Phase 2) is the version bump + a classifier fail-loud
that surfaces incomplete recognition instead of silently defaulting to `reference`.

## Phase 0 — Located resolution (pasted evidence)

### EPG-0.2 — where `resolved_data_type` / `data_type` is chosen

`commit-content-unit.ts` `buildUnitCsvMetadata` (the sci-bulk per-row metadata):
```ts
return {
  source: args.source,
  proposalId: args.proposalId,
  semantic_roles: args.semanticRoles,          // descriptive; NOT the data_type source
  resolved_data_type: args.dataType,           // <-- comes from args.dataType
  entity_id_field: args.entityIdField,
  informational_label: args.classification,
  field_identities: args.fieldIdentities,
  ...
};
```
`args.dataType` = `resolveDataTypeFromClassification(classification)` (commit-content-unit.ts:401,
makeRowByteEstimator; and the same at the streamed/windowed commit). `resolveDataTypeFromClassification`
(`data-type-resolver.ts`) is an **identity map**: `entity→entity, transaction→transaction, …`.
`classification` = the content unit's `confirmedClassification`. So:

```
committed_data.data_type  =  resolved_data_type  =  resolveDataTypeFromClassification(confirmedClassification)
```

`confirmedClassification` is the sheet classification from the proposal, built in
`synaptic-ingestion-state.ts:buildProposalFromState` from `round2Scores` (the resolver synthesizes
these as a single winner from `deriveClassificationFromExpression`). **It is the expression
classifier's verdict — the `semantic_roles`/`claimedBy` layer does not feed it.**

### EPG-0.2b — live proof it IS the expression classifier (VLTEST2, post-HF-368)

Committed Datos row (committed `2026-07-01T05:32:29Z`, i.e. AFTER HF-368 merged at `05:24:50Z` —
this is fresh, not stale):
```
committed_data.data_type: reference     metadata.source: sci-bulk
metadata.resolved_data_type: reference  metadata.informational_label: reference
```
Its proposal content-unit (processing_jobs, same import):
```
classification: reference   claimType: FULL   confidence: 0.97
trace.finalClassification: reference   decisionSource: expression
reasoning: "Expression-derived: model recognized no entity- and no transaction-identifying column
            — a dimensional lookup (reference)"
allScores: reference@0.97 (expression), entity/target/transaction/plan @0.05
```
The trace's per-column recognition — the SMOKING GUN (some columns have the bare primitives, the
entity-id/name/categorical do NOT):
```
Periodo                : scope_role="reference" nature_role="temporal"     ✓ has primitives (fresh)
Monto_Colocacion       : scope_role="none"      nature_role="measure"      ✓
Cumplimiento_Colocacion: scope_role="none"      nature_role="measure"      ✓
... (all 9 measures)   : scope_role="none/ref"  nature_role="measure"      ✓
ID_Empleado            : scope_role=undefined   nature_role=undefined      ✗ MISSING (stale flywheel atom)
Nombre_Completo        : scope_role=undefined   nature_role=undefined      ✗ MISSING
Sucursal               : scope_role=undefined   nature_role=undefined      ✗ MISSING
```
`deriveClassificationFromExpression`: no column has `nature_role==='identifier'` (ID_Empleado's is
undefined) → no `entityIdCol`, no `txnIdCol` → `reference` residual. Correct logic, incomplete input.

The committed `field_identities` mirror this (`natureRole` undefined for ID_Empleado/Nombre/Sucursal,
present for the measures/temporal); `semantic_roles` separately carries `ID_Empleado: entity_identifier@0.95`
all `claimedBy:"reference"` — but that layer is **not** what set `data_type`.

### EPG-0.1 — the assembly functions
- `field_identities`: `header-comprehension.ts` `deriveFieldIdentitiesFromComprehension` /
  `extractFieldIdentitiesFromTrace` → `structuralType = interp.data_nature`,
  `natureRole = interp.nature_role` (HF-368). Undefined when the interp lacks `nature_role`.
- `semantic_roles` / `claimedBy`: `commit-content-unit.ts` `buildCommitSemanticRoles(confirmedBindings)`
  → `{role: binding.semanticRole, confidence, claimedBy: binding.claimedBy}`.
- `resolved_data_type`: `buildUnitCsvMetadata` (above) ← `resolveDataTypeFromClassification(confirmedClassification)`.

### EPG-0.3 — consumers of `data_type`
The calc/convergence read `committed_data.data_type` (the column) to partition entity/transaction/
reference/target; `metadata.resolved_data_type` is a mirror. Both come from the single identity map,
so the blast radius of "how data_type is derived" is entirely upstream at `confirmedClassification`
(the expression classifier), not in a second resolver.

### Root-cause site
`atom-fingerprint.ts:23` — `export const ATOM_ALGORITHM_VERSION = 2;`
`atom-flywheel.ts` `lookupAtoms` filters claimable atoms by `.eq('algorithm_version', ATOM_ALGORITHM_VERSION)`
(line 110) and writes `column_roles: {role, roleConfidence, identifies, characterization, relationships,
scope_role, nature_role}` (HF-368 added the last two). Because the version was not bumped, v2 atoms
(no `scope_role`/`nature_role`) remain claimable → warm recall returns them with the bare primitives
undefined.

## Phase 1 — Architecture Decision Record (against the TRUE root cause)

```
Problem: NOT a semantic_roles override. The expression classifier (HF-367/368) fell to its
  `reference` residual because the entity-id/name/categorical columns were warm-recalled from
  pre-HF-368 flywheel atoms that predate the scope_role/nature_role schema — so their bare
  primitives were undefined and the classifier could not see the entity identifier.

What is FIXED (at the layer HALT-3 points to — recognition completeness, NOT a data_type heuristic):
  1. ATOM_ALGORITHM_VERSION 2 → 3. HF-368 changed the atom recognition schema (added
     scope_role/nature_role to column_roles) but omitted the version bump. Bumping invalidates
     stale v2 atoms → they re-comprehend via the fresh LLM path (which DOES emit the bare
     primitives, proven live) → the classifier sees the entity id → transaction.
  2. Classifier fail-loud on INCOMPLETE recognition: before returning the `reference` residual,
     if any comprehended column (non-empty data_nature) lacks its bare nature_role, raise a
     structured error naming those columns — do NOT silently default to reference. This is the
     directive's C2 fail-loud, closing the silent partial-recognition gap that masked this bug.

What is NOT done (premise refuted): deriving data_type from field_identities.natureRole /
  stripping semantic_roles authority — semantic_roles never had authority over data_type, and the
  entity-id's natureRole is itself undefined, so that derivation could not resolve the sheet.

CONFIRM:
  - Matches specific column-name or language strings?               NO.
  - Adds weighted scoring / facet-sum / claim contest?              NO.
  - Defaults to a data_type when recognition is incomplete?         NO — raises (fail-loud).
  - Reads the model's recognition and lets it drive data_type?      YES — by making the flywheel
     serve COMPLETE recognition (the bare primitives) so the model's entity-id is visible.

CHOSEN: version bump (re-comprehend stale atoms → complete bare primitives) + classifier
        fail-loud on incomplete recognition. No heuristic, no word list, no re-classifier.
```

## Phase 2: Implementation

Two changes, both at the recognition/completeness layer (per HALT-3), neither a heuristic,
word list, scoring table, or `data_type` re-derivation:

1. **`atom-fingerprint.ts` — `ATOM_ALGORITHM_VERSION` `2 → 3`.** The one-line remedy HF-368
   omitted: HF-368 added `scope_role`/`nature_role` to the atom `column_roles` recognition schema
   but left the version at 2, so pre-HF-368 atoms (without the bare primitives) are still claimed
   and warm-recalled incomplete. Bumping to v3 makes v2 atoms non-matchable → they re-comprehend
   via the fresh LLM path (which emits the bare primitives, proven live) → the classifier sees the
   entity id → `transaction`.

2. **`expression-classifier.ts` — fail-loud on INCOMPLETE recognition (the directive's C2 ADR
   requirement).** Before returning the `reference` residual, if any comprehended column (non-empty
   `data_nature`, not the `unknown` sentinel) lacks its bare `nature_role`, raise
   `MissingRecognitionError` naming those columns — do NOT silently default to `reference`. This is
   the exact silent-default that hid the bug (BCL Datos: `ID_Empleado` warm-recalled incomplete →
   silently dropped → reference). A TRUE reference sheet (all columns complete, none an
   entity/transaction identifier) is unaffected — its columns carry `nature_role`, so the residual
   is legitimately reached and returned.

## Phase 3: Verification

### EPG-3.2 / EPG-3.3 — mechanism proof (LIVE model call + real classifier)
A FRESH comprehension of the full BCL Datos sheet — exactly what the v3 bump forces when the stale
`ID_Empleado` atom is re-comprehended on re-import:
```
ID_Empleado            : scope_role="entity"  nature_role="identifier"   ← now present (was undefined)
Periodo                : scope_role="none"    nature_role="temporal"
Cumplimiento_Colocacion: scope_role="none"    nature_role="measure"
→ CLASSIFICATION: transaction @ 0.98
  [model scopes "ID_Empleado" as an entity identifier, with period + measures — per-period performance]
```
The reference residual is gone: with `ID_Empleado`'s bare primitives present, the classifier finds
the entity id + period + measures → `transaction`. (The clean-slate re-import + committed_data SQL
query + convergence-binding + payout gates are the architect's browser-driven step per §4/SR-44 —
this proves the deterministic mechanism the re-import will exercise.)

### EPG-3.4 — no regression on the large file (Casa Diaz, read-only)
```
Exportar Hoja de Trabajo :: transaction: 1000
```
Remains `transaction`. (The v3 bump and the fail-loud affect future imports/classification only;
already-committed rows are untouched. A Casa Diaz re-import re-comprehends fresh — its export sheet
has an entity id + measures and classifies `transaction`, same as today.)

### EPG-3.5 — fail-loud on incomplete recognition (unit test, in the suite)
```
test 'HF-369: incomplete recognition (comprehended column, no bare nature_role) → raises, no reference default'
  input: ID_Empleado (data_nature prose, NO nature_role) + Periodo(temporal) + Ventas(measure)
  result: throws MissingRecognitionError — message names sheet "BCL_Datos_stale", column "ID_Empleado",
          and "INCOMPLETE" — does NOT return reference.  → pass
```

### EPG-3.6 — suite + build
```
src/lib/sci/__tests__/*.test.ts : 241 tests, 241 pass, 0 fail
npm run build                   : green (.next/BUILD_ID present)
```

## HALT conditions
- **HALT-0A (TRIGGERED, reported):** `resolved_data_type`/`data_type` is NOT derived from the
  `semantic_roles` reference-claim layer — it is `resolveDataTypeFromClassification(confirmedClassification)`,
  the expression classifier's verdict (`decisionSource: expression`). The reference verdict is that
  classifier's residual, caused by warm-recalled stale atoms lacking the bare primitives. The fix is
  the atom-version bump + classifier fail-loud, not a data_type re-derivation.
- **HALT-2 (deferred to architect):** the convergence-binding / non-zero-payout gates require the
  live clean-slate re-import (browser pipeline). If, after Datos classifies `transaction`, convergence
  still yields 0 bindings, that is the SEPARATE convergence field-matching / percent-scale gap noted in
  §5/§6A — not expanded here.
- **HALT-3 (honored):** the entity-id recognition was genuinely absent from the warm-recalled
  `field_identities` (stale atom), so the fix belongs at the flywheel/comprehension-recall layer (the
  version bump) — NOT a data_type heuristic reading `natureRole` (which is itself undefined there).

## ARTIFACT SYNC
- **MC:** the sci-bulk `data_type` is the expression classifier's verdict (identity map from
  `confirmedClassification`), NOT a `semantic_roles` override. BCL Datos classified `reference`
  because warm-recalled pre-HF-368 flywheel atoms served the entity-id/name/categorical columns
  without `scope_role`/`nature_role`. Fixed by `ATOM_ALGORITHM_VERSION 2→3` (re-comprehend stale
  atoms → complete bare primitives) + classifier fail-loud on incomplete recognition.
- **REGISTRY:** no classifier/word-list/scoring added; the fix REMOVES a silent reference default
  and restores complete model recognition on the flywheel path.
- **R1:** BCL Datos → transaction (live mechanism proof @0.98); Casa Diaz export stays transaction.
- **BOARD:** the directive's premise (semantic_roles override) was refuted by Phase-0 evidence; the
  real defect was an un-versioned recognition-schema change in HF-368.
- **SUBSTRATE:** Decision 158 upheld — the flywheel may skip the LLM only when it carries COMPLETE
  recognition; C2 fail-loud on incomplete recognition replaces the silent reference default.
