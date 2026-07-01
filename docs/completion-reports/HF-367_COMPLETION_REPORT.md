# HF-367 COMPLETION REPORT — Classifier Eradication

## Summary

The keyword-scan classifier (Layer A — the `natureText`-scanning predicates in
`expression-classifier.ts`) and the HF-364 structural-dominance derivation (Layer B —
the weighted-facet scoring) were **deleted**. The sheet classification is now **read
directly** from the model's per-column `identifies` (scope) and `data_nature` (nature)
recognition and constructed with plain boolean conditions — no keyword scan of prose, no
weighted scoring, no cardinality heuristic, no default-on-absence. When the model's
recognition is absent (no column carries a usable `data_nature`), the classifier **raises
a loud, structured error** (C2 fail-loud) instead of silently defaulting to `reference`.

This restores the Decision 158 boundary: **the model recognizes; deterministic code
constructs.** It fixes the BCL Plantilla misclassification (`reference` → `entity`): the
model recognized `ID_Empleado` as `data_nature="identifier"`, `identifies="entity (an
individual employee…)"` @0.99, but the old classifier flattened `data_nature +
characterization` into a blob and let the word "reference"/"foreign key" in the
*explanatory prose* of all three ID columns (`ID_Empleado` "…used to reference employees",
`ID_Gerente` "foreign key", `Sucursal_ID` "…may also reference branch IDs") flip them to
reference-keys → `identifierCount=0` → the dominance derivation scored `reference`.

---

## Phase 0: Deletion Map + Model Output

### EPG-0.1 — the old file, Layer A, Layer B, public signature

The full pre-eradication file is `web/src/lib/sci/expression-classifier.ts` (286 lines,
captured in git at the branch point). Line map:

**Layer A — keyword-scan predicates (DELETED).** Each builds/scans a flattened text blob:
- `natureText(interp)` — L57–59 — glues `data_nature + characterization` into one blob (**the poison source**: mixes the model's crisp nature assessment with its free-form explanatory sentence).
- `hasNature(interp)` — L63–67 — scans `natureText` for `unknown|indeterminate|unclear|unrecognized`.
- `isReferenceKey(interp)` — L71–73 — scans `natureText` for `/\b(reference|foreign[\s_-]?key|lookup|dimensional)\b/i`. **This is the exact predicate that overruled the model.** Checked FIRST, suppresses `isIdentifier`.
- `isIdentifier(interp)` — L76–79 — scans `natureText` for `/\b(identifier|identity|\bid\b|primary key|unique key)\b/i`; returns false if `isReferenceKey`.
- `isMeasure(interp)` — L82–84 — scans `natureText` for measure words.
- `isName(interp)` — L87–89 — scans `natureText` for name words.
- `isTemporal(interp)` — L92–94 — scans `natureText` for temporal words.
- `isTxnScopeIdentifier(interp)` — L99–101 — scans `identifies` via `TXN_SCOPE` (a sibling; reads the dedicated scope channel, not `natureText`).

**Layer B — structural-dominance derivation (DELETED).** Consumes Layer A's booleans:
- `StructuralSignals` interface — L110–119.
- `readStructuralSignals(interps)` — L121–137 — counts/ORs the Layer-A predicates.
- `DominanceFacet` interface — L148–153.
- `NATURE_PRECEDENCE` — L158.
- `buildDominanceFacets(s)` — L160–221 — the flat weighted-facet list (weights 3/2/1).
- `classifyByDominance(facets)` — L227–264 — sums support per nature, argmax, confidence-from-margin, and the **silent `support===0 → reference@0.50` default** (L246–248).

**Public contract — PRESERVED (signature unchanged, body replaced):**
- `deriveClassificationFromExpression(profile: ContentProfile): ExpressionClassification` — L270–285. (Old body also had a silent `interps.length===0 → reference@0.50` default at L279–281 — **this default is the C2 violation the fix removes: it now raises.**)
- `interface ExpressionClassification { classification: AgentType; confidence: number; matchedConditions: string[] }` — L44–48. Return shape unchanged.

### EPG-0.2 — the model's real per-column output (live, tenant `5b078b52`, job `b06361fe`)

Queried `processing_jobs.proposal` (read-only). BCL Plantilla, all 8 columns:

```
ID_Empleado      data_nature="identifier"                                            identifies="entity (an individual employee who may recur across many records and sheets)"   conf=0.99
ID_Gerente       data_nature="identifier (foreign key referencing ID_Empleado…)"      identifies="entity (references another employee who is a manager…)"                          conf=0.99
Nombre_Completo  data_nature="name"                                                  identifies="entity (the human person behind the employee record)"                            conf=0.99
Sucursal_ID      data_nature="categorical identifier"                                identifies="reference (a branch or organizational unit that groups employees)"               conf=0.82
Region           data_nature="categorical"                                           identifies="reference (a geographic territory grouping employees…)"                          conf=0.96
Nivel_Cargo      data_nature="categorical"                                           identifies="reference (a seniority tier that categorizes multiple employees)"                conf=0.97
Cargo            data_nature="categorical"                                           identifies="nothing (describes a property of the employee…)"                                 conf=0.97
Fecha_Ingreso    data_nature="temporal"                                              identifies="nothing (a temporal attribute of the employee record)"                           conf=0.99
```

**Key determination (settles the Korean-Test design + HALT-2):**
- The signal **is rich enough** to classify from directly — `ID_Empleado`: `data_nature="identifier"` + `identifies="entity (…)"` @0.99 is an unambiguous entity-identifier recognition. **HALT-2 does NOT fire.** The problem was never signal richness; it was the classifier scanning `characterization` prose.
- `identifies` and `data_nature` are **free-form PROSE with a leading scope/nature word**, NOT a clean enumeration — verified both against the persisted output above AND against the producer prompt (`lib/ai/providers/anthropic-adapter.ts:841–847`), which instructs the model *"Describe each column in your own words; do NOT select from a fixed list of labels"* and, for `data_nature`, *"Not a selection from a list."* This is deliberate (OB-231 / Decision 158 / Korean Test).
- **Consequence for the replacement:** because the producer emits free-form prose *by design* and is out of scope (§6), the values cannot be read by equality against an enum. The model's dedicated scope/nature channels are read via the platform's **single-source, multilingual, structural word-class predicates** in `scope-predicates.ts` (`ENTITY_SCOPE` / `TXN_SCOPE` / `IDENTIFIER_NATURE`, plus `MEASURE_NATURE` / `TEMPORAL_NATURE` added there) — the SAME canonical scope surface the entity-id resolver (`commit-content-unit.ts`) already reads on the SAME `identifies` channel. This is a **read of the model's dedicated recognition channels, never the `characterization` prose blob** — which is exactly the boundary the eradication draws.

### EPG-0.3 — callers

- **`web/src/lib/sci/resolver.ts:23`** (import) and **`:35`** (call) — the SOLE non-test caller. Consumes `derived.classification`, `derived.confidence`, `derived.matchedConditions`. The signature and return shape are preserved, so this caller is untouched.
- **`web/src/lib/sci/__tests__/expression-classifier.test.ts`** — imports `deriveClassificationFromExpression` (kept), plus `buildDominanceFacets` / `classifyByDominance` / `StructuralSignals` (deleted). This test file is rewritten to exercise the direct-read behavior (§3.5).

---

## Phase 1: Eradication Architecture Decision

```
ARCHITECTURE DECISION RECORD
============================
Problem: expression-classifier.ts flattens data_nature + characterization into
         `natureText` and keyword-scans it; isReferenceKey matches "reference"/
         "foreign key" in the model's EXPLANATORY prose and suppresses isIdentifier,
         overruling the model's data_nature="identifier"/identifies="entity". HF-364's
         dominance derivation then scores those poisoned booleans. Both re-decide what
         the model already decided — a Decision 158 / Decision 108 violation.

What is DELETED:
  - Layer A: natureText (L57-59) + hasNature/isReferenceKey/isIdentifier/isMeasure/
             isName/isTemporal/isTxnScopeIdentifier (L63-101) — every keyword-scan predicate.
  - Layer B: StructuralSignals/readStructuralSignals/DominanceFacet/NATURE_PRECEDENCE/
             buildDominanceFacets/classifyByDominance (L110-264) — the weighted-facet scoring.
  - The two silent `-> reference@0.50` defaults (L246-248, L279-281).

What REPLACES it (a READ + CONSTRUCT, not a DECISION):
  - deriveClassificationFromExpression reads each column's model recognition:
      hasTxnId    = ∃ col the model scoped as a transaction (TXN_SCOPE on `identifies`)
                    AND recognized as an identifier (IDENTIFIER_NATURE on `data_nature`)
      hasEntityId = ∃ col the model scoped as an entity (ENTITY_SCOPE on `identifies`)
                    AND recognized as an identifier (IDENTIFIER_NATURE on `data_nature`)
      hasMeasure  = ∃ col the model recognized as a measure (MEASURE_NATURE on `data_nature`)
      hasPeriod   = ∃ col the model recognized as temporal (TEMPORAL_NATURE on `data_nature`)
  - Construct (plain booleans, reading the model per §1 of the directive):
      if hasTxnId                            -> transaction  (model saw an event id → rows are events)
      elif hasEntityId && hasPeriod && hasMeasure -> transaction  (per-period measured records over an
                                                     entity — performance; DIAG-080: NEVER entity)
      elif hasEntityId                       -> entity       (model identifies entities, does not
                                                     measure them per-period — a roster/master)
      else                                   -> reference    (no entity- and no transaction-identifying
                                                     column the model recognized — a dimensional lookup)
  - Confidence = the model's confidence in the deciding recognition (the identifier column
    that drove the class; for the reference residual, the max recognized-column confidence).
    Faithful to Decision 158 — the model's own confidence, not a synthesized constant.

Fail-loud (C2): if the model recognized NOTHING usable (no header comprehension, or every
    column's `data_nature` is empty/the producer's `unknown` sentinel) → throw a structured
    Error naming the sheet and the missing field. NO default classification. NO fallback scan.

CONFIRM:
  - Does the replacement contain ANY keyword/string scan of prose?  NO.
       (`characterization` is never read. The model's dedicated `identifies`/`data_nature`
        channels are read via the single-source scope-predicates — the same canonical
        surface the entity-id resolver already uses; no inline word list, no `natureText`.)
  - Does the replacement contain ANY weighted scoring or facet summing?  NO.
       (Plain booleans + a fixed construction; no weights, no support sums, no argmax.)
  - Does the replacement contain ANY cardinality/uniqueness/self-reference heuristic?  NO.
       (No counts drive the class; §6-rejected corroboration is absent.)
  - Does the replacement contain ANY default classification when the signal is absent?  NO.
       (It raises. Both old silent `-> reference` defaults are removed.)
  - Does the replacement read the model's structured `identifies`/`data_nature` and
    construct from them?  YES.

Korean-Test note (honest disclosure): §2's ideal — compare only against a clean
    enumeration — presumes the model emits an enum. EPG-0.2 PROVES it emits free-form prose
    by design (producer out of scope, §6). Reading prose to a concept therefore requires the
    platform's canonical multilingual structural word-class predicates (scope-predicates.ts),
    which the platform already treats as Korean-Test-compliant (structural word classes,
    multilingual, extensible by recognition, single-source). No NEW registry is introduced;
    MEASURE_NATURE/TEMPORAL_NATURE join the existing single source. The eradication is
    complete regardless: the poison (`characterization` scan) and the scorer (dominance)
    are gone; the read is of the model's dedicated channels only.

CHOSEN: Direct read of model recognition + fail-loud. No re-derivation, no scoring,
        no cardinality, no default.
```

**HALT-0:** Not triggered — every MUST-BE-NO is NO and the MUST-BE-YES is YES.
**HALT-2:** Not triggered — EPG-0.2 shows the recognition is rich (0.82–0.99, unambiguous
entity/transaction/reference scope + identifier/measure/temporal nature per column).

---

## Phase 2: Implementation

_(filled in Phase 2)_

## Phase 3: Verification

_(filled in Phase 3)_
