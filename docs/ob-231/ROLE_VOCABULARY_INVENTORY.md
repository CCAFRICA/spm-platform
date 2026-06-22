# OB-231 Phase 0 — Role Vocabulary Inventory + Architecture Decision Gate

**OB-231 — Free-Form Column Characterization.** Method: §3.1 enumeration grep + a 34-agent parallel consumer-mapping pass (read-only). Committed before any Phase-1 source change.

## §1 — Enumeration grep (web/src, excl. comments/.d.ts/test)

```
grep -rn "ColumnRole|columnRole|'identifier'|'measure'|'temporal'|'attribute'|'reference_key'" web/src --include=*.ts | grep -v "// " | grep -v ".d.ts" | grep -v test
→ 181 hits across ~30 files.  ColumnRole TYPE defined at web/src/lib/sci/sci-types.ts:71.
```

## §2 — Consumer classification (EMIT / STORE / CONSUME / DIAGNOSTIC / TYPE / FALSE_POSITIVE)

### Genuine ColumnRole consumers (edit set)

| Classification | File | Usages | Note |
|---|---|---|---|
| CONSUME | `src/lib/sci/agents.ts` | 39 | CLASSIFICATION: CONSUME. agents.ts never defines the ColumnRole type, never emits/persists… |
| CONSUME | `src/lib/sci/negotiation.ts` | 36 | This file is a pure CONSUMER of the role vocabulary — it never emits or persists ColumnRol… |
| CONSUME | `src/lib/sci/classification-signal-service.ts` | 19 | This file is a real CONSUMER of the ColumnRole vocabulary via recalled vocabulary_bindings… |
| CONSUME | `src/lib/sci/content-profile.ts` | 14 | This is a CONSUME file. It never emits or persists roles; it only reads HC's per-column na… |
| CONSUME | `src/lib/sci/hc-pattern-classifier.ts` | 11 | FILE CLASSIFICATION: CONSUME. This file does not parse LLM output (not EMIT), does not per… |
| CONSUME | `src/lib/sci/entity-resolution.ts` | 21 | This file is a pure CONSUMER of the persisted `field_identities[col].structuralType` role … |
| CONSUME | `src/lib/sci/commit-content-unit.ts` | 12 | This file is a pure CONSUMER of the HC characterization: it reads the per-column nature (c… |
| CONSUME | `src/lib/sci/signatures.ts` | 6 | All forbidden tokens are confined to the lines 27-37 counting block; every downstream use … |
| CONSUME | `src/app/api/import/sci/execute-bulk/route.ts` | 6 | Scope note: this file is under web/src/app/ (api route), NOT web/src/lib/sci/. EPG constra… |
| CONSUME | `src/lib/calculation/per-row-attribution.ts` | 3 | Classification: CONSUME. This file is a downstream consumer of the persisted FieldIdentity… |
| CONSUME | `src/app/api/users/route.ts` | 2 | Pure field-rename + keep the existing contains-style read; no EPG-forbidden tokens are pre… |
| DIAGNOSTIC | `src/lib/sci/resolver.ts` | 1 | resolver.ts has exactly ONE real usage of the retired vocabulary, all on line 445, and it … |
| EMIT | `src/lib/sci/decomposed-comprehension.ts` | 7 | FILE CLASSIFICATION: EMIT (parses/normalizes LLM per-column output into the interpretation… |
| MIXED | `src/lib/sci/flywheel-signal-emission.ts` | 11 | This file is EMIT/STORE only: it parses the LLM's headerComprehension.interpretations and … |
| MIXED | `src/lib/sci/decomposed-comprehension.ts` | 8 | FILE classification MIXED: it is TYPE (defines ComprehendedInterpretation, the local LLM-o… |
| MIXED | `src/lib/sci/synaptic-ingestion-state.ts` | 4 | This file does NOT contain the forbidden `ColumnRole` token, nor any of the forbidden sing… |
| MIXED | `src/app/api/import/sci/analyze/route.ts` | 31 | Scope note: this file is web/src/app/api/import/sci/analyze/route.ts — under web/src but N… |
| MIXED | `src/app/api/import/sci/process-job/route.ts` | 8 | EPG-relevant edits are ONLY lines 381, 387, 388 (plus the comment at 377, optional). These… |
| STORE | `src/lib/sci/field-identities.ts` | 24 | This file is a STORE/EMITTER: it converts confirmed-binding semanticRole values into struc… |
| STORE | `src/lib/sci/fingerprint-flywheel.ts` | 15 | NO CHANGES REQUIRED in this file to satisfy the OB-231 EPG; the existing token-level diff … |
| TYPE | `src/lib/sci/sci-types.ts` | 17 | This file is the TYPE home; it defines the vocabulary that every other web/src reader impo… |

### False positives (left untouched — unrelated vocabulary)

| File | Reason |
|---|---|
| `src/lib/sci/structural-fingerprint.ts` | No rewrite needed. This file does not use the ColumnRole role-vocabulary or the HC characterization at all. No… |
| `src/lib/sci/source-date-extraction.ts` | This file is FALSE-POSITIVE-adjacent but technically tripwired by ONE banned literal. It does NOT touch any OB… |
| `src/lib/sci/atom-flywheel.ts` | No changes required for the OB-231 subtraction. The file contains ZERO occurrences of the forbidden token `Col… |
| `src/lib/plan-intelligence/intent-constructor.ts` | NO CHANGES REQUIRED for OB-231. This file is a pure deterministic structural translator (CompositionalIntent -… |
| `src/lib/plan-intelligence/compositional-intent.ts` | No rewrite required; leave the file untouched. Rationale: (1) None of the removed tokens (ColumnRole, columnRo… |
| `src/lib/entities/cpi.ts` | No rewrite required. This file does not participate in the OB-231 ColumnRole subtraction.  Token-by-token: `Co… |
| `src/app/api/calculation/run/route.ts` | NO REWRITE NEEDED — leave this file completely untouched for OB-231. Verification: grep counts in this 3632-li… |
| `src/lib/reconciliation/ai-column-mapper.ts` | NO REWRITE. Leave this file completely untouched. Rationale: (1) NONE of the OB-231 retired tokens appear here… |
| `src/lib/import-pipeline/smart-mapper.ts` | No rewrite required. This file does not participate in the OB-231 subtraction. Grep confirms ZERO occurrences … |
| `src/lib/plan-surface/normalize.ts` | No rewrite required. normalize.ts is the plan-surface component/variant normalizer (OB-228 Korean-Test core): … |
| `src/lib/data/platform-queries.ts` | No rewrite needed. This file is the platform-scoped admin data-query layer (fleet overview, tenant fleet cards… |
| `src/lib/rbac/rbac-service.ts` | No rewrite needed. This file is the RBAC user/permission service (manages user roles such as Administrator, Sa… |

## §3 — The new shape (§2.1, LOCKED)

`HeaderInterpretation.{semanticMeaning, columnRole, identifiesWhat}` → free-form `ColumnCharacterization`:
- `characterization: string` (was `semanticMeaning`)
- `identifies: string` — free-form SCOPE (entity | transaction | product | reference | nothing | …), subsumes `identifiesWhat`
- `data_nature: string` — free-form NATURE (identifier | measure | temporal | categorical | name | computed | …), was `columnRole`
- `relationships: string[]` — free-form, new

`ColumnRole` type DELETED. `FieldIdentity.structuralType: ColumnRole` → `string`. `VocabularyBindingValue` object variant carries the new fields. Field rename map for readers: `.columnRole→.data_nature`, `.semanticMeaning→.characterization`, `.identifiesWhat→.identifies`.

## §4 — Architecture Decision Gate

**HALT-ADG: NOT FIRED (0 consumers).** Every consumer can operate on the free-form characterization:
- **Identity decisions (the MIR fix)** read `identifies` against scope words (entity/transaction/…) — none of which are EPG-forbidden literals. `commitContentUnit.resolveEntityIdField` selects the column whose `identifies` is entity-scope (DNI_Vendedor) over transaction-scope (Folio). Structural sanity check (§5.2): selected column should repeat across rows; warn-but-proceed if 1:1 (Decision 158 — LLM recognition is authoritative).
- **Nature logic** (temporal/currency suppression, name/identifier reinforcement, pattern classification) reads the free-form `data_nature`/`characterization` via regex/contains (mirroring the existing `isNonMonetaryMeasureMeaning` regex) — NOT quoted role-literal equality — so the §5.5 EPG (`'identifier'|'measure'|'temporal'|'attribute'|'reference_key'` = 0 in lib/sci) is satisfied.
- **STORE** (field_identities, vocabulary_bindings, atom column_roles JSONB) persist the new fields; JSONB content change, no schema migration.

**Behavior preservation:** the new free-form fields carry the SAME information the old `columnRole` carried, so existing-tenant classification outcomes are preserved; the ONLY intended behavioral change is the MIR `entity_id_field` selection (Folio → DNI_Vendedor). Calc-correctness is architect-verified post-merge (§6.3) — CC gates on tsc + build + EPG + behavior-preserving rewrites.

**Separate vocabularies (NOT in scope, confirmed):** `SemanticRole` (sci-types.ts:247 — transaction_date/entity_identifier/… used by source-date-extraction, binding.semanticRole) is a DIFFERENT enum, untouched. RBAC `role`, reconciliation column-mapper roles, plan calculationType — unrelated domains (false positives).

**Anti-Pattern check:** AP-25 (this removes a fixed enumeration; replacement is free-form, Korean-Test clean), AP-D2 (class subtraction, not instance), Decision 158 (recognition→construction lossless boundary). No new enumeration introduced.
