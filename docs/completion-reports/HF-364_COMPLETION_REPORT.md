# HF-364 COMPLETION REPORT — Structural-Dominance Classifier

## Summary

`expression-classifier.ts` derived a content unit's classification (entity / target /
transaction / reference) from an **ordered if/else branch ladder** (Branch 1 → 2 → 2.5 →
3 → 4). Branch ordering was load-bearing: whichever branch fired first won. Branch 2.5
(HF-351 F2, commit `8e84a68a`) returned `entity@0.88` for any sheet with an entity-scope
identifier + a name column + no per-row event id — and **did not yield** to a sheet
carrying a temporal period column + measures (per-period performance data). The BCL `datos`
sheet (`ID_Empleado` + `Nombre_Completo` + `Periodo` + 12 measures) satisfied Branch 2.5 and
was misclassified `entity`, producing zero transaction rows, wrong entity metadata, and a $0
grand total (DIAG-080, PR #640).

HF-364 replaces the branch ladder with an **order-independent structural-dominance
derivation**. Every recognized structural signal contributes weighted support to the data
natures it structurally constitutes; the classification is the `argmax` over the summed
support. Rearranging the derivation logic in any order produces byte-identical output (sums
are commutative; the winner is selected by `argmax` over a fixed structural-specificity
precedence, not by code position). Temporal dominance is enforced structurally: a sheet
carrying temporal + measures can never be `entity`. The HF-351 F2 roster case is preserved
by the *absence* of a temporal signal, not by branch ordering. This is the last enumerated
registry in the SCI classification chain.

---

## Phase 0: Registry / Vocabulary / Validator Sweep

All sweeps run from `web/src`. Output pasted verbatim below, each hit classified
`REGISTRY` / `COSMETIC` / `STRUCTURAL`.

### Sweep A — ordered branch ladders returning classification

```
app/api/import/sci/analyze/route.ts:518            // ... `classification === 'transaction'`   [STRUCTURAL read — plan post-pass reads expressed temporal+entity signals, not a label]
app/api/import/sci/analyze/route.ts:528            r => r.classification === 'reference' || r.classification === 'target',  [COSMETIC — diagnostic-only, HF-247 removed from the AND chain]
app/api/import/sci/analyze/route.ts:577            resolution.classification = 'plan' as AgentType;  [STRUCTURAL — HF-240/247/267 workbook-level plan signature; reads sparsity/%/headerQuality/hasEntityIdentifier, NOT a vocabulary]
app/api/import/sci/analyze/route.ts:633            cu.classification !== 'plan'  [COSMETIC read]
app/api/import/sci/analyze-document/route.ts:173   classificationMap[analysis.documentType] || 'plan'  [REGISTRY — documentType→classification Record map; DOCUMENT modality only (PDF/PPTX/DOCX), NOT the tabular path]
app/api/import/sci/analyze-document/route.ts:201-219  classification === 'plan'/'entity'/... ? conf : 0.05  [COSMETIC — score-vector synthesis from the map result, mirrors resolver.ts]
app/api/import/sci/process-job/route.ts:373        !(... && cu.classification !== 'plan')  [COSMETIC read — split filter]
app/api/import/sci/process-job/route.ts:511        if (unit.classification === 'plan') continue;  [COSMETIC read]
components/sci/SCIProposal.tsx:111                  unit.classification === 'plan' && ...  [COSMETIC — UI]
components/sci/SCIExecution.tsx:492-493             u.classification === 'plan' / !== 'plan'  [COSMETIC — UI partition]
lib/sci/synaptic-ingestion-state.ts:348-349        resolution.classification !== 'plan' / !== 'transaction'  [STRUCTURAL read — dual-sheet detection]
lib/sci/windowed-commit.ts:91, 268                 params.classification === 'reference'  [STRUCTURAL read — commit consumes the assigned data_type]
lib/sci/classification-signal-service.ts:832-833   if (measure>0 && temporal>0) classification='transaction'; else if (identifier>0 && name>0 && measure===0) classification='entity';  [REGISTRY (INERT) — lookupLexicalPrior; emits a PriorSignal that is never consumed for classification post-R6]
lib/sci/commit-content-unit.ts:289, 606            classification === 'reference' / === 'entity'  [STRUCTURAL read — commit consumes the assigned data_type]
```

### Sweep B — Record<string,…> classification/type maps

```
app/api/import/sci/analyze-document/route.ts:167   classificationMap: Record<string, 'plan'|'entity'|'target'|'transaction'>  [REGISTRY — same document-path map as A; see §6A.2]
lib/sci/sheet-stream.ts:69                          sample: Record<string, unknown>[]  [COSMETIC — a row-sample type, not a classification map]
lib/sci/commit-content-unit.ts:644                  changesByRow = Map<number, Record<...>>  [COSMETIC — remediation change ledger]
lib/ai/training-signal-service.ts:188              ((row.signalValue as Record<...>)?.task) || 'file_classification'  [COSMETIC — AI-task label default, not a sheet classifier]
```

### Sweep C — hardcoded confidence constants

```
lib/sci/expression-classifier.ts:106,125,135,153,163,171,183,190  [REGISTRY — the branch-ladder per-branch confidence constants 0.50/0.85/0.90/0.88/0.85… — THIS IS THE TARGET, removed in Phase 2]
lib/sci/agents.ts:108-169  role:'entity_identifier'… confidence:0.95/0.85/0.80…  [STRUCTURAL — per-FIELD role assignment (entity_identifier/transaction_identifier), a different concern from sheet classification; not in scope]
```

### Sweep D — constrained field vocabularies in LLM prompts

```
app/api/analyze-workbook/route.ts:125,135,145  suggestedFieldMappings[].targetField  [REGISTRY (OFF-PATH) — consumed only by analyze-workbook + legacy import/commit; the SCI tabular classify path (app/api/import/sci, lib/sci) does NOT read suggestedFieldMappings — grep empty]
app/api/import/commit/route.ts:246             m.targetField === 'entity_id'  [REGISTRY (LEGACY) — legacy HF-047 commit path, no client callers]
lib/ai/providers/anthropic-adapter.ts:1439     "targetField": "entity_id|entity_name|store_id|…"  [REGISTRY (OFF-PATH) — the enum in the analyze-workbook prompt; downstream SCI classification does not gate on it; see §6A.4]
```

### Sweep E — filename-based classification

```
app/api/import/commit/route.ts:56, 773             normalizeFileNameToDataType(fileName)  [REGISTRY (LEGACY) — filename→data_type on the legacy HF-047 commit path; no client callers]
app/api/intelligence/wire/route.ts:33, 116         normalizeFileNameToDataType(rawName)  [REGISTRY (UTILITY) — renames legacy committed_data.data_type 'component_data:<name>' prefixes; a data-cleanup utility, not the import classification path]
app/api/import/sci/execute-bulk/route.ts:88        // normalizeFileNameToDataType deleted — D154 violation removed  [COSMETIC — comment confirming the live SCI path has NO filename classifier]
```

### Sweep F — surviving classifyByHCPattern / columnRole / ColumnRole

```
app/api/import/sci/analyze/route.ts:472            // classifyByHCPattern returns …  [COSMETIC — comment; the function is deleted]
app/api/import/sci/process-job/route.ts:364        // resolveClassification (… classifyByHCPattern override …)  [COSMETIC — comment]
app/api/import/sci/analyze/route.ts:768-792        columnRoles: Record<string,string> from data_nature/semanticRole  [STRUCTURAL — an LLM-derived field-role map for display/binding, NOT the retired ColumnRole enum]
app/api/import/sci/process-job/route.ts:440-459    columnRoles from b.semanticRole  [STRUCTURAL — same]
lib/sci/source-date-extraction.ts:29,153           SemanticRole vocab (explicitly NOT the retired ColumnRole)  [STRUCTURAL — comment + SemanticRole list]
```

### EPG-0.1 / EPG-0.2 — REGISTRY findings and HALT-1 disposition

The ONLY `REGISTRY` hit that is **load-bearing on the live SCI tabular classification →
commit → calc path** is the branch ladder in `expression-classifier.ts` (Sweep C) — the
target of this HF. Every other `REGISTRY` hit is off that path:

| # | Hit | Why NOT load-bearing on the live tabular path | Disposition |
|---|-----|-----------------------------------------------|-------------|
| 1 | `classification-signal-service.ts:832-833` (`lookupLexicalPrior`) | Emits a `PriorSignal` into `state.priorSignals`. Post-HF-341 R6 the Bayesian posterior that consumed prior signals is **deleted**; `resolver.ts` reads only `deriveClassificationFromExpression`. Grep for any read of `priorSignals` for classification = **empty**. Inert telemetry. | §6A.1 residual |
| 2 | `analyze-document/route.ts:167` (`classificationMap`) | DOCUMENT modality only (PDF/PPTX/DOCX, called from `operate/import/page.tsx:376`). Tabular `.xlsx` sheets go through `analyze`/`process-job` → expression-classifier. Different code path AND different modality. | §6A.2 residual |
| 3 | `import/commit/route.ts:56` (`normalizeFileNameToDataType`) | Legacy HF-047 commit path; **no client callers** (`grep api/import/commit'` in `app/`/`components/` = empty). | §6A.3 residual |
| 4 | `intelligence/wire/route.ts:33` (`normalizeFileNameToDataType`) | A maintenance utility that renames already-committed legacy `component_data:` data_type prefixes; not the import classification path. | §6A.3 residual |
| 5 | `anthropic-adapter.ts:1439` + `analyze-workbook` `targetField` enum | Consumed only by `analyze-workbook` + legacy `import/commit`; the SCI path does not read `suggestedFieldMappings` (grep over `app/api/import/sci`,`lib/sci` = empty). | §6A.4 residual |

**HALT-1: NOT triggered.** No co-resident registry independently determines `data_type` or
classification on the live SCI tabular path. The plan post-pass (`analyze/route.ts:561`) is a
structural workbook-level signature (reads `hasTemporalColumns`/`hasEntityIdentifier`/
`sparsity`/`hasPercentageValues`/`headerQuality`), not a vocabulary registry, and does not
capture BCL `datos` (which carries a transaction signal `hasTemporal && hasEntityIdentifier`
and a strong entity identifier → `matchesPlanSignature` is false). All non-load-bearing
`REGISTRY` hits are logged as §6A residuals with architect disposition (the HALT-1 "split into
a separate item" branch).

---

## Phase 1: Architecture Decision

```
ARCHITECTURE DECISION RECORD
============================
Problem: expression-classifier.ts uses an ordered if/else branch ladder
         to derive classification from LLM-recognized signals. Branch
         ordering is load-bearing. Branch 2.5 (entity) preempts Branch 3
         (transaction) for per-period performance data with entity
         identifiers, causing total calculation failure (DIAG-080).

Option A: Add temporal/measure exclusion to Branch 2.5
  - Scale test: YES
  - AI-first: YES (reads LLM signals)
  - Registry: STILL A REGISTRY — adds a 4th condition to Branch 2.5;
    next edge case adds a 5th; accretion pattern continues
  - Order-independent: NO — branch ordering still load-bearing

Option B: Reorder branches (move 2.5 after 3/4)
  - Scale test: YES
  - AI-first: YES
  - Registry: STILL A REGISTRY — ordering still determines outcome
  - Order-independent: NO — different order = different results

Option C: Replace branch ladder with structural-dominance derivation
  - Scale test: YES — O(1) signal property composition
  - AI-first: YES — reads LLM-recognized structural signals only
  - Registry: NO — no enumerated branches, no position-dependent rules;
    a flat facet list summed per nature, argmax over the sums
  - Order-independent: YES — facet support is summed (commutative);
    rearranging the facet list / score expressions = identical output
  - Korean Test: YES — structural signals (LLM data_nature / identifies),
    never a column name, never a language-specific pattern

CHOSEN: Option C — structural-dominance derivation
REJECTED: Option A — perpetuates registry accretion pattern
REJECTED: Option B — ordering is still load-bearing
```

### Design committed under the Gate

Each LLM-recognized structural signal contributes **weighted structural support** to the
data natures it constitutes. The four natures' supports are summed independently from a flat
facet list; the classification is the `argmax`. There is no ordered branch, no first-match,
no per-branch confidence constant.

**Signals** (booleans from the LLM expression, integers from the structural profile):
`hasEntityScopeIdentifier`, `hasName`, `hasTxnScopeIdentifier`, `hasTemporal`, `hasMeasure`,
`hasReferenceKey`, `identifierCount`, `measureCount`.

**Facets** (each a self-contained predicate; weight = structural specificity on a 3-level
scale: `3` = a defining/dominant structural mark, `2` = a compound structural pattern,
`1` = a corroborating signal):

| Nature | Facet | Weight | Structural claim |
|--------|-------|--------|------------------|
| transaction | `hasTxnScopeIdentifier` | 3 | a per-row event id — each row is a distinct event (**event-id dominance**) |
| transaction | `hasMeasure && hasReferenceKey && id≥1` | 2 | measured rows carry a foreign key — events reference entities |
| transaction | `hasMeasure && hasTemporal && hasReferenceKey` | 1 | per-period measured rows reference entities |
| target | `hasMeasure && id≥1 && !txnId && !refKey` | 2 | measures attributed to an identifier, no event id, no FK — entity-level records |
| target | `hasMeasure && hasTemporal && id≥1 && !txnId` | 1 | temporal + measures over an identifier — per-period performance (**temporal dominance**: not a roster) |
| entity | `hasEntityScopeId && hasName && !hasTemporal && !txnId` | 3 | entity-scope id + name, no temporal, no event id — a roster/master (**entity remainder**) |
| entity | `!hasMeasure` | 2 | no measures — the sheet defines entities rather than measuring them |
| reference | `hasReferenceKey && id===0` | 3 | reference key with no identifier — a pure lookup (**reference isolation**) |
| reference | `hasMeasure && id===0` | 1 | measures with no identifier — an aggregate parameter table |

**Invariant satisfaction:**
- *Temporal dominance* — `entity` has **no** facet that fires when `hasTemporal`; its only
  measure-tolerant facet (weight 3) requires `!hasTemporal`. So `hasTemporal && hasMeasure`
  can never make `entity` the argmax (its support stays 0 while target/transaction score).
- *HF-351 F2 preservation* — the entity weight-3 facet fires on `hasEntityScopeId && hasName
  && !hasTemporal && !txnId` regardless of measure/reference-key, and at weight 3 it beats the
  transaction weight-2 FK facet. The roster is preserved by the **absence** of temporal, not
  by ordering.
- *No per-classification confidence constants* — `confidence` is derived from the score
  margin: `top===0 ? 0.50 : 0.5 + 0.5·(top − second)/(top + second + 1)` where `top`/`second`
  are the two highest nature supports. More decisive support ⇒ higher confidence. One global
  formula, not a lookup of per-branch constants.
- *Tiebreak* — `argmax` iterates a fixed structural-specificity precedence
  `[transaction, target, entity, reference]` (most-specific structural claim first) and takes
  strictly-greater, so the result is deterministic and independent of facet-list order. No
  natural tie arises in any verified case (the precedence is a safety net).
- *Empty input* — a sheet with zero recognized columns is a degenerate precondition (no
  signals to derive from) → `reference@0.50` with a `defaulted` provenance string (byte-
  identical to the prior code's first guard). This precondition is outside the dominance
  derivation.
