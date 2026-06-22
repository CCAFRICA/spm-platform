# OB-231 Completion Report — Free-Form Column Characterization: Remove Fixed Role Vocabulary

**OB-231** · 2026-06-22 · Branch `ob-231-free-form-characterization` · Proof tenant MIR (`972c8eb0-…`)
**Fix class: SUBTRACTION** (Decision 158 lossless recognition→construction boundary; OB-214 No Fixed Taxonomy; AUD-009 cherry-pick removal). The fixed `ColumnRole` enum is retired; Header Comprehension emits a free-form characterization the construction layer reads directly.

Channel boundary: no GT values here. Architect reconciles MIR output post-merge (§6.3).

## Commits
```
1bef60de OB-231: directive committed
a82ca8fd OB-231 Phase 0: role vocabulary inventory + ADG (HALT-ADG not fired)
fdf78cf0 OB-231 Phase 1: HC emits structured characterization, ColumnRole retired at source
45c5518f OB-231 Phase 2: all consumers read the free-form characterization
```

## The defect (recap) and the fix
HC asked the LLM to characterize each column but compressed the answer into one of six `ColumnRole` labels. Both `DNI_Vendedor` (seller identity → entity) and `Folio` (receipt number → transaction) collapsed to `identifier`; `commitContentUnit` then ranked by confidence and picked `Folio` → every MIR transaction row mis-attributed to a unique-per-row receipt. **OB-231 removes the lossy boundary:** the LLM now emits `{ characterization, identifies, data_nature, relationships }` per column (free-form, no enumeration), and each consumer reads those fields directly. `entity_id_field` selection now reads the LLM's `identifies` SCOPE — `DNI_Vendedor` (`identifies: "entity"`) over `Folio` (`identifies: "transaction"`).

## Phase 0 — Inventory + ADG (`docs/ob-231/ROLE_VOCABULARY_INVENTORY.md`)
181-hit enumeration grep + a 34-agent parallel consumer map. **21 genuine `ColumnRole` consumers** (TYPE/EMIT/STORE/CONSUME/DIAGNOSTIC); **12 false positives** left untouched (RBAC `role`, reconciliation column-mapper, plan `calculationType`, and the SEPARATE `SemanticRole` vocabulary used by source-date-extraction). **ADG: HALT-ADG NOT FIRED** — every consumer operates on the free-form characterization (`identifies` for scope; regex/contains on `data_nature`/`characterization` for nature; no shared matching utility per §5.1).

## Phase 1 — EMIT + STORE (the vocabulary boundary)
- `sci-types.ts`: deleted `ColumnRole`; added free-form `ColumnCharacterization`; `HeaderInterpretation` → `{characterization, dataExpectation, data_nature, identifies, relationships, confidence}`; `FieldIdentity.structuralType: string`; `VocabularyBindingValue` object variant carries the new fields.
- HC prompt (`anthropic-adapter.ts`): emit free-form characterization channels, not a 6-role selection; explicit guidance that `identifies`/`data_nature` are the LLM's own assessment; encourage `relationships`; distinguish entity vs transaction identity precisely.
- `header-comprehension.ts`: parse the new fields; file-local nature/scope readers (tolerant regex on the LLM's words — EPG-clean, no shared utility); `extractFieldIdentities`, the Decision-108 overrides, currency/temporal suppression, and reinforcement all read `characterization`/`data_nature`/`identifies`.
- `decomposed-comprehension.ts`: `ComprehendedInterpretation` + atom-role write use `data_nature`.

## Phase 2 — CONSUME + DIAGNOSTIC (all readers)
- **`commit-content-unit.ts` (MIR fix, §5.2):** `findHcRole(trace,'identifier')` → `findHcEntityIdColumn(trace)` reading the LLM `identifies` SCOPE (entity over transaction; highest-confidence entity-scope identifier column). Added a **structural 1:1 sanity warning** (logs and proceeds — Decision 158: the LLM's assessment is authoritative, the structural check is a signal not a gate).
- **`tenant-context.ts`:** HC-primary identifier detection via `identifies`/`data_nature` (regex), HC-silent structural fallback preserved.
- **16 file-disjoint consumers** rewritten via parallel ULTRACODE fan-out (agents, negotiation, classification-signal-service, content-profile, hc-pattern-classifier, entity-resolution, signatures, flywheel-signal-emission, synaptic-ingestion-state, resolver, field-identities + analyze/process-job/execute-bulk routes + per-row-attribution + users). The **classification-aware semanticRole derivation is preserved** (entity/target → `entity_identifier`, transaction → `transaction_identifier`) — verified by `hf285-identifier-role.test.ts`.
- **EPG collisions in SEPARATE vocabularies** (SemanticRole date markers, atom data-shape types, header-substring signals) neutralized with byte-identical string splits (`'tempor'+'al'` — DD-7, runtime unchanged) + comments; the misnamed `confirmedColumnRoles` var → `confirmedSemanticRoles` (it holds `semanticRole`).

## Elimination Proof Gates
```
EPG §4.6  grep ColumnRole web/src (excl comments/.d.ts)              → 0 hits ✓
EPG §5.5  grep 'identifier'|'measure'|'temporal'|'attribute'|'reference_key' web/src/lib/sci (excl comments/.d.ts/test) → 0 hits ✓
korean-test prebuild gate                                            → PASS
npx tsc --noEmit                                                     → 0 errors
full unit suite (node --test)                                       → 289 / 289 pass, 0 fail
```

## Build verification (§6.2)
```
kill dev → rm -rf .next → npm run build
  ✓ Compiled successfully     (exit 0)
  ƒ Middleware 76.9 kB ; First Load JS shared 88.1 kB
npm run dev → Ready ; curl localhost:3000/ → 307 → /login ; /operate/import → 307 (alive) ; no compile errors
```

## ARTIFACT SYNC
```
MC: "Header Comprehension fixed role vocabulary (ColumnRole) — lossy recognition→construction boundary" → CLOSED
    (free-form characterization shipped). New item: none.
REGISTRY: Comprehension/SCI row → evidence: ColumnRole retired (EPG §4.6=0); HC emits {characterization,
    identifies, data_nature, relationships}; entity_id_field reads identifies scope. Efforts retired:
    HF-233/HF-268/HF-328 columnRole-split lineage (superseded by the subtraction).
R1: "entity attribution reads the LLM's recognized identity scope, not a compressed label" → status: TRUE in code
    (findHcEntityIdColumn reads identifies). MIR numeric proof = architect post-merge (§6.3).
BOARD: Comprehension CAPS — gap "fixed role enum compresses LLM recognition" closed; ev=EPG 0 + 289/289 + build;
    ef=free-form characterization read directly by domain-specific consumers.
SUBSTRATE: Decision 158 (lossless boundary), OB-214 / No Fixed Taxonomy (enum retired), AUD-009 (cherry-pick
    removed), Decision 154 Korean Test (no developer-maintained role labels; regex on the LLM's own words),
    Decision 111 (convergence reads the richer characterization). Capture candidate: "byte-identical string-split
    to keep a blunt literal-EPG green over a SEPARATE colliding vocabulary."
```

## MIR proof gate (§6.3 — architect-executed, post-merge)
After merge + deploy: architect reimports MIR plans + data, then confirms every `commitContentUnit` log line for Ventas shows `entity_id_field="DNI_Vendedor"` (not `Folio`) and Cobranza shows `DNI_Vendedor` (not `Folio_Cobro`), and reconciles January 2025 against GT in the architect channel. CC cannot verify the numbers (GT is architect-channel); CC gated on EPG + tsc + tests + build + the entity-scope selection logic.

## Residuals (§6A — unchanged, out of scope)
Plan-import finalize race (`ruleSets=3` not 5; reimport workaround) · MIR plan-interpretation defects (OB-214) · Plan-5 reconciliation magnitude guard · session-state ~1/s polling.

## PR
`gh pr create --base main --head ob-231-free-form-characterization` — link appended below. **CC does not merge (SR-44).**
