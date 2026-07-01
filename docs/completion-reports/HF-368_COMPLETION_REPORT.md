# HF-368 — scope-predicates Registry Eradication

## Summary

`web/src/lib/sci/scope-predicates.ts` — five bilingual synonym regexes
(`ENTITY_SCOPE`, `TXN_SCOPE`, `IDENTIFIER_NATURE`, `MEASURE_NATURE`, `TEMPORAL_NATURE`;
HF-367 grew the last two) — is **deleted entirely**, not relocated. It was a developer-typed
vocabulary registry (Korean Test + fixed-taxonomy violation) read by BOTH the sheet
classifier and the entity-id resolver. The three scopes (`entity`/`transaction`/`reference`)
and the natures (`identifier`/`measure`/`temporal`/`name`/`categorical`) are the platform's
**fixed structural primitives**, not a vocabulary: **the MODEL now names which primitive each
column is** (new bare `scope_role`/`nature_role` fields it emits, framed in the producer
prompt as "which of the platform's fixed structural roles/natures does this column play" —
NO synonym list), read directly by both consumers via equality against the fixed primitive
set. `identifies`/`data_nature` prose and `characterization` are retained as free-form
display/audit and are never word-matched by the bridge. Fail-loud (C2) is defined precisely:
absent OR novel primitive raises a structured error, never a default, never a word-match.

## Phase 0 — Map the violation; determine what the model emits

### EPG-0.1 — the violation + all consumers

`scope-predicates.ts` in full (current on-main, post-HF-367):

```ts
// HF-341 R4: single-source scope predicates over the LLM's FREE-FORM `identifies` channel (OB-231).
export const ENTITY_SCOPE = /\b(entity|entidad|seller|vendedor|employee|empleado|person|persona|account|cuenta|organization|organizaci[oó]n|member|miembro|rep|staff|worker|salesperson|agent|agente)\b/i;
export const TXN_SCOPE = /\b(transaction|transacci[oó]n|receipt|recibo|folio|invoice|factura|order|pedido|ticket|event|evento|record|registro|line|l[ií]nea)\b/i;
export const IDENTIFIER_NATURE = /\b(identifier|identif|\bid\b|document|documento|dni|code|c[oó]digo|n[uú]mero|key|clave)\b/i;
export const MEASURE_NATURE = /\b(measure|medida|amount|monto|importe|metric|m[eé]trica|quantity|cantidad|numeric|num[eé]rico|monetary|monetario|currency|moneda|value|valor)\b/i;
export const TEMPORAL_NATURE = /\b(temporal|date|fecha|time|tiempo|month|mes|year|a[ñn]o|period|periodo|per[ií]odo|day|d[ií]a|quarter|trimestre|week|semana)\b/i;
```

Consumers (grep, non-test):
- **`expression-classifier.ts:50`** — imports all five (sheet classifier). **ON-PATH.**
- **`commit-content-unit.ts:33`** — imports ENTITY_SCOPE/TXN_SCOPE/IDENTIFIER_NATURE; used in `findHcEntityIdCandidates` (:204, over `identifies` + a `data_nature + characterization` blob at :202). **ON-PATH** (entity-id resolution).
- **`remediation-stage.ts:22`** — imports IDENTIFIER_NATURE; plus a local `MEASURE_TEMPORAL_NATURE` regex (:44). **OFF-PATH** (value-normalization exclusion, runs AFTER classification/resolution) but breaks on deletion → re-pointed here.

Critical-path trace (verified against the code, per §6A): the two final outputs are
`committed_data.data_type` (classifier → resolver) and `committed_data.entity_id`
(`findHcEntityIdCandidates`). Verdicts:
- **scope-predicates.ts → ON-PATH** (both outputs). Eradicated + both consumers re-pointed.
- **header-comprehension.ts:278–298 local regexes → OFF-PATH.** They set `profile.patterns.*`,
  which neither `deriveClassificationFromExpression` (reads only `headerComprehension`) nor the
  entity-id resolver (reads only `classificationTrace.headerComprehension.interpretations`)
  ever reads back. Residual (§6A.1).
- **remediation-stage.ts → OFF-PATH** (runs at `commit-content-unit.ts:636`, after data_type
  @:466 and entity_id @:571 are fixed; rewrites values only). Import forces a re-point here.
- **signatures.ts:36 → OFF-PATH, DEAD** (`detectSignatures` has zero call sites; the CRR
  scorer/`signatureChecks` were deleted at HF-341 R6). Does not import scope-predicates →
  no break. Residual.
- **entity-resolution.ts:32–43 local regexes → OFF-PATH** for the two outputs (entity-key
  reconciliation over `structuralType`/values); reads the free-form `data_nature` prose,
  which this HF leaves UNTOUCHED, so it is unaffected. Residual.

### EPG-0.2 — what the model emits + the producer prompt + Fork determination

**Live per-column output** (tenant `5b078b52`, job `b06361fe`, read-only). Every `identifies`
value is PROSE with a leading scope word, `data_nature` sometimes compound; no bare-primitive
field exists:
```
ID_Empleado      identifies="entity (an individual employee who may recur…)"   data_nature="identifier"                       scope_role=undefined  nature_role=undefined
ID_Gerente       identifies="entity (references another employee…)"            data_nature="identifier (foreign key…)"        scope_role=undefined  nature_role=undefined
Nombre_Completo  identifies="entity (the human person behind the record)"      data_nature="name"                             scope_role=undefined  nature_role=undefined
Sucursal_ID      identifies="reference (a branch…)"                            data_nature="categorical identifier"           scope_role=undefined  nature_role=undefined
Fecha_Ingreso    identifies="nothing (a temporal attribute…)"                 data_nature="temporal"                         scope_role=undefined  nature_role=undefined
```

**Producer prompt** (`lib/ai/providers/anthropic-adapter.ts`, `header_comprehension`, verbatim
lines 841–870) — instructs FREE-FORM prose, explicitly NOT a discrete token:
> "Describe each column in your own words; do NOT select from a fixed list of labels."
> "identifies: your assessment of WHAT SCOPE this column identifies. Write the scope in your own words — for example: entity (…), transaction (…), product, reference (…), or nothing …"
> "data_nature: … in your own words — for example: identifier, measure, temporal, categorical, name, computed. Not a selection from a list — describe it as you see it."

Answers:
1. **Bare vs prose:** the model does NOT emit a bare-primitive token today — `identifies` is a
   sentence that merely *begins* with a scope word ("entity (an individual…)"); `data_nature`
   is sometimes compound ("categorical identifier"). This is PROSE → **Fork B**, not Fork A.
2. **Per-column resolver need:** the model's per-column output carries BOTH the sheet-relevant
   scope (via `identifies`) AND the per-column entity-identifier judgment (a column that both
   scopes `entity` and is `identifier`-nature) — the resolver's need exists at the column
   level. So the model CAN render both the sheet-scope and the per-column entity-id judgment;
   it just renders them as prose today. **No HALT-3.**
3. **Fork B prompt change:** add two discrete fields — `scope_role` (exactly one of
   `entity`/`transaction`/`reference`/`none`) and `nature_role` (exactly one of
   `identifier`/`measure`/`temporal`/`name`/`categorical`) — framed as "which of the
   platform's fixed structural roles / natures does this column play," naming ONLY the fixed
   primitives (never synonyms), with all explanation kept in `characterization`.

**HALT-0:** not triggered — the primitive is rendered by the MODEL (Fork B), not derived by
matching the model's words against a developer list.

## Phase 1 — Architecture Decision Record

```
Problem: scope-predicates.ts is a bilingual synonym-registry (Korean Test + C0/AP-26
  violation) read by BOTH the sheet classifier and the entity-id resolver. HF-367 grew it.
  Deleted, not relocated (incl. NOT into a prompt).

Fork (EPG-0.2): B — model emits prose; the producer prompt renders the bare primitive.

DELETED entirely: ENTITY_SCOPE, TXN_SCOPE, IDENTIFIER_NATURE, MEASURE_NATURE,
  TEMPORAL_NATURE (the whole file). No survivor, no relocation, no move-to-prompt-as-synonyms.

REPLACES the bridge (model judgment naming a primitive, NOT a word list):
  - Producer prompt emits per column a BARE `scope_role` ∈ {entity,transaction,reference,none}
    and a BARE `nature_role` ∈ {identifier,measure,temporal,name,categorical}, by asking which
    of the platform's FIXED structural roles/natures the column plays. NO synonym enumeration.
    `characterization` (+ the retained free-form `identifies`/`data_nature`) hold all prose and
    are never matched by the bridge.
  - Consumers read the bare fields via equality against the fixed primitive set:
      classifier: scope_role==='entity'|'transaction', nature_role==='identifier'|'measure'|'temporal'.
      resolver (findHcEntityIdCandidates): scope_role==='entity' && nature_role==='identifier'.
  - New bare fields are ADDED (not overwriting identifies/data_nature) so every OFF-PATH prose
    consumer (entity-resolution.ts, header-comprehension locals, signatures) is untouched.
  - remediation (off-path, but imports IDENTIFIER_NATURE) reads a bare `natureRole` slot added
    to FieldIdentity, via fixed-set membership — no word list, import removed.

Consumers re-pointed: expression-classifier.ts (sheet scope+nature), commit-content-unit.ts
  (per-column entity-id), remediation-stage.ts (value-exclusion nature).

Fail-loud (C2) — PRECISE:
  - absent = no header comprehension, or scope_role/nature_role empty for a needed column.
  - novel  = a non-empty scope_role/nature_role OUTSIDE the fixed set → raise, surfacing the
    novel value. NEVER a cue to word-match or default.
  - absent or novel → throw naming sheet + field. No default. No fallback scan.

CONFIRM:
  - ANY developer word list / regex-over-model-text / synonym enumeration in ANY file INCLUDING
    the prompt?  NO. (Bridge reads bare fields via `===`/Set membership over the FIXED
    primitives; prompt names only the fixed roles, lists no synonyms.)
  - Match the model's PROSE against developer words?  NO. (Prose is never read by the bridge.)
  - Relocate/rename/wrap/move-to-prompt the lists instead of deleting?  NO. (File deleted;
    prompt lists no synonyms.)
  - Does the prompt enumerate SYNONYMS for the primitives?  NO. (Names entity/transaction/
    reference and the five natures — the fixed architecture — and nothing else.)
  - Primitive comes from the MODEL's judgment (model renders the bare field)?  YES.
  - Korean Test: works for a Korean/Portuguese/novel-word roster with NO developer edit?  YES.
    (The multilingual model maps its recognition onto the bare primitive; the code compares to
    the fixed token `entity`, never to a synonym.)

CHOSEN: B — producer prompt renders the bare primitive; bridge reads it; scope-predicates deleted.
```

**HALT-0:** not triggered — every CONFIRM is answered as required.

## Phase 2: Implementation

**Deleted:** `web/src/lib/sci/scope-predicates.ts` (the whole file — all five synonym regexes).

**Added:** `web/src/lib/sci/structural-primitives.ts` — the FIXED primitives (three scopes, five
natures) + `PrimitiveRecognitionError` + `isScope/NaturePrimitive` + `validateScope/validateNature`.
No synonyms; equality/Set membership only.

**Producer prompt** (`anthropic-adapter.ts`, `header_comprehension`): added `scope_role` and
`nature_role`, each defined as "which of the platform's fixed structural roles/natures does this
column play; reply with EXACTLY ONE bare token" with a STRUCTURAL definition of each primitive
(e.g. `entity` = "a recurring subject the rows are ABOUT and group by") and the instruction
"Decide from your OWN understanding in ANY language — do not match words." The pre-existing
`identifies`/`data_nature` prose bullets were stripped of their example word-lists (now pure
free-form display). NO synonym list anywhere.

**Fork B plumbing** (bare fields flow fresh + warm; additive, no migration — `column_roles` is
jsonb): types (`HeaderInterpretation`, `ColumnCharacterization`, `FieldIdentity.natureRole`,
`AtomExpression`, `ComprehendedInterpretation`, `LLMHeaderResponse`, `ClassificationTrace`,
planner `knownColumns`); fresh parse (`buildComprehensionFromLLM`, residue parse); warm recall
(`header-comprehension.ts` known+novel reconstruction); persistence (atom write/read in
`atom-flywheel.ts`, `decomposed-comprehension.ts`, `comprehension-planner.ts`); trace carry
(`resolver.ts`); `field-identities` → `natureRole`.

**Bridge re-pointed to bare equality:**
- `expression-classifier.ts` — reads `scope_role`/`nature_role` by `===`; fail-loud (absent →
  `MissingRecognitionError`; novel → `PrimitiveRecognitionError` via `validateScope/Nature`).
- `commit-content-unit.ts` `findHcEntityIdCandidates` — `scope_role==='entity' && nature_role==='identifier'`.
- `remediation-stage.ts` (off-path, import forced the change) — reads `FieldIdentity.natureRole`
  via `NON_TEXT_NATURES` Set membership; scope-predicates import removed; prose regexes deleted.

## Phase 3: Verification

### EPG-3.1 — structural anti-registry audit (whole non-test diff)
```
A: surviving scope-predicates refs  → only comments naming the DELETED file (structural-
   primitives.ts, expression-classifier.ts, commit-content-unit.ts, remediation-stage.ts). No code.
B: regex/keyword MECHANISM on model text (.test/.match/.includes/.indexOf/RegExp/=/…/)  → <none>
C: regex-literal constants introduced  → <none>
```
No regex over model text, no word list, no synonym enumeration survives in any bridge file.

**Full producer prompt (scope_role/nature_role) — affirmed SYNONYM-FREE:** each role/nature is
defined structurally (what the primitive MEANS), the three scopes + five natures are named as the
platform's fixed architecture, and NO word-equivalents are listed. "Decide from your OWN
understanding in ANY language — do not match words." (Full text in `anthropic-adapter.ts:841–885`.)

**Bridge files pasted + affirmed clean (§0 rule 3):**

`structural-primitives.ts` — the FIXED primitives, NOT a synonym registry (compares the model's
bare token to the three scopes / five natures; lists no synonyms; `.has()`/`===` only, no regex):
```
SCOPE_PRIMITIVES  = ['entity','transaction','reference','none']
NATURE_PRIMITIVES = ['identifier','measure','temporal','name','categorical']
isScopePrimitive(v)  = SCOPE_SET.has(v)      isNaturePrimitive(v) = NATURE_SET.has(v)
validateScope/validateNature → throw PrimitiveRecognitionError on a value OUTSIDE the fixed set
```
`expression-classifier.ts` bridge read — no word list, no regex:
```
validateScope(sheet, col, i.scope_role); validateNature(sheet, col, i.nature_role);  // novel → throw
recognized = all.filter(i => i.nature_role?.trim())                                   // absent → throw
txnIdCol    = recognized.find(i => i.nature_role==='identifier' && i.scope_role==='transaction')
entityIdCol = recognized.find(i => i.nature_role==='identifier' && i.scope_role==='entity')
hasMeasure  = recognized.some(i => i.nature_role==='measure');  hasPeriod = …==='temporal'
```
`commit-content-unit.ts` `findHcEntityIdCandidates` bridge read — no word list, no regex:
```
if (interp.scope_role === 'entity' && interp.nature_role === 'identifier') candidates.push(colName);
```

### EPG-3.2 — Korean Test proof (LIVE model call through the real prompt)
A KOREAN employee roster (`직원명부`: `사원번호`, `성명`, `부서`, `입사일`) — terms the deleted
regex `entity|entidad|seller|…` matches NONE of. The live model rendered:
```
사원번호  scope_role="entity"      nature_role="identifier"
성명      scope_role="entity"      nature_role="name"
부서      scope_role="reference"   nature_role="categorical"
입사일    scope_role="none"        nature_role="temporal"
→ CLASSIFICATION: entity @ 0.98   (from 사원번호's bare scope_role='entity' — NO developer word list, NO edit)
```
This is the point of the HF: recognition no longer depends on a developer typing the word. It
also proves HALT-2 does not fire — the model reliably renders bare tokens when asked.

### EPG-3.3 — regression (LIVE model call + real classifier)
```
Spanish Plantilla (ID_Empleado entity/identifier, no measures)         → entity @ 0.97
Spanish datos (ID_Empleado entity/identifier + Periodo temporal + Ventas/Comision measure) → transaction @ 0.97
```
Driven by the model's bare primitives; no list.

### EPG-3.4 — fail-loud, BOTH triggers (unit tests, in the suite)
- **absent** (columns carry no bare `nature_role`, only prose) → `MissingRecognitionError` naming
  the sheet. Never defaults to `reference`.
- **novel** (`scope_role="product"` / `nature_role="quantum"` — outside the fixed set) →
  `PrimitiveRecognitionError` surfacing the novel value. Never word-matched, never defaulted.

### EPG-3.5 — suite + build
- `src/lib/sci/__tests__/*.test.ts`: **240 tests, 240 pass, 0 fail.**
- `npm run build`: **green** (`.next/BUILD_ID` present).
- Tests updated: `expression-classifier.test.ts` rewritten to bare primitives (adds the Korean-Test
  and novel/absent fail-loud tests); `hf351-entity-id-selection.test.ts` `trace()` fixtures moved
  from `identifies`/`data_nature` prose to `scope_role`/`nature_role`.

## Residuals (OFF-PATH, proven independent of data_type/entity_id — §6A)
1. `header-comprehension.ts:281–298` local regexes → set `profile.patterns.*`, which the classifier
   and resolver never read back (traced). They read the untouched prose `data_nature`/`identifies`
   → unaffected by this HF. Same defect class; separate follow-up.
2. `signatures.ts:32–36` local regexes → `detectSignatures` has ZERO call sites (dead since the
   HF-341 R6 CRR removal). Off-path.
3. `entity-resolution.ts:32–43` local regexes → entity-key reconciliation over `structuralType`
   (prose) + row values; off the data_type/entity_id path; reads the untouched prose → unaffected.
4. `remediation-stage.ts` `NON_TEXT_ROLE` → reads the platform's CONTROLLED `SemanticRole` enum
   (assigned tokens), NOT the model's free-form recognition text; left as-is (not a Korean-Test
   surface). Its scope-predicates dependency IS removed here.

## Behavior note
Warm recall of PRE-migration atoms/fingerprints (which lack the bare primitives) → the bridge
fails loud → the sheet re-imports fresh, where the model renders the primitives (verified live).
The architect's Clean Slate + re-import (SR-44) regenerates all recognition with the new prompt.

## ARTIFACT SYNC
- **MC:** the bilingual synonym registry `scope-predicates.ts` (ENTITY_SCOPE/TXN_SCOPE/
  IDENTIFIER_NATURE/MEASURE_NATURE/TEMPORAL_NATURE) is ERADICATED, not relocated. The MODEL names
  the bare structural primitive (`scope_role`/`nature_role`); the classifier and entity-id resolver
  read it by equality against the fixed set (structural-primitives.ts). No word list in any file,
  including the prompt.
- **REGISTRY:** the last developer word-list on the classification/resolution path is closed.
  `structural-primitives.ts` holds only the platform's fixed primitives (the skeleton), which is
  architecture, not vocabulary. HF-367's `MEASURE_NATURE`/`TEMPORAL_NATURE` additions are gone.
- **R1:** BCL Plantilla → entity (live @0.97); a Korean roster → entity (live @0.98) with no edit.
- **BOARD:** recognition is language-independent — a Korean/Portuguese/novel-word roster classifies
  because the multilingual model maps its recognition onto the fixed primitive; no developer edit.
- **SUBSTRATE:** Decision 158 restored across BOTH the classifier and the entity-id resolver — the
  model recognizes and names the primitive; deterministic code reads that name. Korean Test held
  structurally (no language-specific matching survives on the path). C2 fail-loud: absent OR novel
  primitive raises; never a default, never a word-match.
