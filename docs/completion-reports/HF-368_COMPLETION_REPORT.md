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
_(filled in Phase 2)_

## Phase 3: Verification
_(filled in Phase 3)_
