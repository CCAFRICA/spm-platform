# HF-328 — Comprehension-Authoritative SCI Commit — Completion Report

**Branch:** `hf-328-comprehension-authoritative-commit`
**Date:** 2026-06-21
**Class:** Decision 158 subtraction at the SCI commit layer (sibling of HF-325 at the engine layer).
**Build:** `tsc --noEmit` exit 0 · `next build` exit 0.

---

## 1 — Summary

The SCI commit path split `entity_id_field` selection by sheet classification: for `transaction`
sheets `resolveEntityIdField` read the **`reference_key`** columnRole instead of the **`identifier`**.
On per-entity performance data that mis-selected a dimensional grouping column over the real entity
identifier. HF-328 **subtracts** the split: comprehension's `identifier` columnRole is the entity key
for **every** non-reference classification (entity, target, transaction). One path, no re-derivation.

**Single-site change.** `web/src/lib/sci/commit-content-unit.ts` → `resolveEntityIdField`. No engine,
convergence, plan-interpretation, prompt, or schema changes (C5/HALT-2 honored).

**Proven outcome (against each tenant's stored `classification_signals.classification_trace`, no re-import):**

| Tenant · sheet | classification | BEFORE | AFTER |
|---|---|---|---|
| Meridian · Datos_Rendimiento | transaction | `Hub` | **`No_Empleado`** ✅ (HALT-4 cleared) |
| BCL · Datos | transaction | `Sucursal` | **`ID_Empleado`** ✅ (HALT-3) |
| Meridian · Plantilla | entity | `No_Empleado` | `No_Empleado` (unchanged) |
| BCL · Personal | entity | `ID_Empleado` | `ID_Empleado` (unchanged) |
| Meridian · Datos_Flota_Hub | reference | `none` | `none` (unchanged, §6A) |

---

## 2 — Premise corrections (verified against live DB)

Three directive premises were stale/inverted. The fix is still correct; the *consequences* differ from
the directive's framing. Reported per the reconciliation/non-regression discipline.

**P1 — BCL was NOT previously `ID_Empleado`; it was `Sucursal`.** HALT-3/PG-6 assume BCL's existing
`committed_data` already carries `entity_id_field="ID_Empleado"` and can be verified by reading the DB
without re-import. Reality: BCL's stored value is **`Sucursal`** (its `reference_key`), the exact same
class of mis-selection as Meridian's `Hub`. BCL nevertheless calculates `$312,033` EXACT — because the
calc engine's payout path resolves the entity key via **convergence bindings + value-overlap discovery**
(Decision 111), which **ignores** `committed_data.metadata.entity_id_field`. So `entity_id_field` was
never the reason BCL worked. **HF-328 makes BCL's *future* import resolve `ID_Empleado`** (proven in §1);
the existing rows stay `Sucursal` until BCL is re-imported. PG-6, read literally against current data,
cannot pass — the value is `Sucursal`. The code path now produces `ID_Empleado` (this is what HALT-3
actually wants: "the comprehension classification for BCL's identifier column must resolve to the same
field" — it does: `ID_Empleado`).

**P2 — Meridian `materializedState` is NOT empty (Consequence B is stale).** Sampled Meridian entities
carry `temporal_attributes = [tipo_coordinador, region, fecha_ingreso, …]` (HF-199 D3 already projects
entity-sheet `attribute` columns at entity resolution). So no attribute-projection code change was
needed for PG-2 — it already works. Moreover, variant discrimination (`run/route.ts:2057-2098`) does
**not** read `materializedState` *or* `entities.metadata` at all; it tokenizes the entity's **transaction
`row_data` string values**. The real reason all entities fell to `default_last` is that with
`entity_id_field="Hub"` the calc-time OB-183 grouping (`run/route.ts:805-811`,
`extId = row_data[entity_id_field]`) keyed transaction rows on hub names — which don't match any entity
UUID — so each entity's `entityRowsFlat` was empty → zero discriminating tokens → `default_last`.
**Fixing `entity_id_field` to `No_Empleado` (this HF) repopulates that grouping**, which is the actual
mechanism behind Consequence B. Stated cause wrong; PG-1 still resolves it.

**P3 — `identifiesWhat` is not a usable discriminator.** The directive's clean "identifier → entity key"
rule is correct for every *currently live* tenant because, in all of them, the `identifier` columnRole is
the entity (it repeats across rows: No_Empleado 67/201, ID_Empleado 85/300) and the `reference_key` is
dimensional. The one case where this rule would mis-fire — a true sales-event sheet where
`identifier`=event id (unique per row) and `reference_key`=the entity — is **not present in any tenant**
(Cascade Revenue Partners, the original HF-268/CRP subject, currently has **no** identifier/reference_key
columns classified). The only signal that distinguishes entity-identifier from event-identifier would be
the HC LLM's `identifiesWhat` (person vs transaction), but it is **null on every column** in the
decomposed-comprehension path, so it cannot be relied on. See §5 residual.

---

## 3 — Proof Gates

**PG-1 — entity_id_field code evidence.** `web/src/lib/sci/commit-content-unit.ts`, `resolveEntityIdField`.

BEFORE (independent re-derivation — transaction read the reference_key):
```ts
if (classification === 'transaction') {
  // HF-268 A2: a transaction's entity association is its reference_key …
  return findHcRole(classificationTrace, 'reference_key');
}
const hcIdentifier = findHcRole(classificationTrace, 'identifier');
if (hcIdentifier) return hcIdentifier;
const binding = bindings.find(b => b.semanticRole === 'entity_identifier');
return binding?.sourceField ?? null;
```

AFTER (one path for entity/target/transaction — reads the classified `identifier`; `reference_key`
is never a candidate; null when comprehension classified no identifier, §6A):
```ts
const hcIdentifier = findHcRole(classificationTrace, 'identifier');
if (hcIdentifier) return hcIdentifier;
const binding = bindings.find(b => b.semanticRole === 'entity_identifier');
return binding?.sourceField ?? null;
```
The `transaction → reference_key` branch is **removed** (subtraction). `findHcRole` is only ever called
with `'identifier'`; `reference_key` columns can no longer be selected as `entity_id_field`.

**PG-2 — attribute projection.** No change required. HF-199 D3 (`entity-resolution.ts:162-170,242-257,
296-307`) already projects `attribute`-columnRole columns from entity-typed batches into
`entities.temporal_attributes`. Verified live: Meridian entities carry
`temporal_attributes=[tipo_coordinador, region, fecha_ingreso, …]`. (See P2 — the directive's
"materializedState={}" premise is stale, and variant discrimination doesn't read it anyway.)

**PG-3 — spatial audit.** Every site that selects/assigns/reads `entity_id_field` in the SCI commit +
entity-resolution paths:

| Site | Role | HF-328 |
|---|---|---|
| `commit-content-unit.ts` `resolveEntityIdField` (163) | **THE selection** | **Fixed (subtraction)** |
| `commit-content-unit.ts:437` | writes `metadata.entity_id_field` | uses fixed selection (no change) |
| `commit-content-unit.ts:571` | returns `entityIdField` → execute-bulk | uses fixed selection (no change) |
| `entity-resolution.ts:93-96` | reads `metadata.entity_id_field` as authoritative `idColumn` | reads fixed value; its `field_identities`/`semantic_roles` fallbacks (124-132, 142) fire only when the field is null and are already `isEventUnit`-aware (correct for the FK-only case) — no orphaned heuristic |
| `store-metadata-population.ts:51` | keys store metadata by `entityIdField` | uses fixed value (no change) |
| `tenant-context.ts:150-159` | `sheetIdentifierColumn` for overlap context | already comprehension-authoritative (`getHCRole === 'identifier'` first); distinct surface; consistent, no change |
| `run/route.ts:805-811` | calc-time OB-183 grouping reads `metadata.entity_id_field` | ENGINE (HALT-2) — reads fixed value, not modified |
| `per-row-attribution.ts:244` | reads `entity_id_field` only to *exclude* it | ENGINE (HALT-2) — not modified |

Only one selection site exists; it now reads comprehension. No orphaned heuristic selection paths remain.

**PG-4 / PG-5 — Meridian clean-slate re-import + Jan-2025 calc.** Architect channel (SR-44 / §6A):
clean-slate re-import + recalc + GT reconciliation are the architect's verification step. CC-side proof
is the stored-trace replay in §1 (the fixed selection yields `No_Empleado` on Datos_Rendimiento, not
`Hub`), plus the structural analysis in P2 that the OB-183 grouping (the real driver of variant routing
and entity-keyed metric lookup) is repopulated once `entity_id_field=No_Empleado`. Note for the recalc:
the convergence value-overlap discovery path (`run/route.ts:875-970`, HALT-2) is independent of
`entity_id_field`; if any Meridian component still resolves via `sheet-matching (fallback)` after a clean
re-import, that residual lives in the convergence layer, not the SCI commit path this HF scopes.

**PG-6 — BCL non-regression.** See P1. The fixed code path resolves BCL's identifier column to
`ID_Empleado` (proven §1). BCL's *existing* committed_data shows `Sucursal` (its pre-HF-328 value);
it is unaffected by a code-only change and updates to `ID_Empleado` on next import. Engine output is
unchanged either way (the calc path ignores `entity_id_field`; BCL stays `$312,033`).

**PG-7 — build.** `tsc --noEmit` exit 0. `next build` exit 0. `hf285-identifier-role.test.ts` 4/4 pass
(the `semanticRole` derivation layer is untouched).

---

## 4 — HALT conditions

| ID | Status |
|---|---|
| HALT-1 (new heuristic) | **Clear.** Pure subtraction — the `transaction` branch is removed; the single read is `findHcRole('identifier')`. No new selector, module, or discriminator. |
| HALT-2 (engine/convergence/plan change) | **Clear.** Only `commit-content-unit.ts` changed (SCI commit path). |
| HALT-3 (BCL ≠ ID_Empleado) | **Clear in code:** the fixed path resolves BCL's identifier to `ID_Empleado` (§1). Premise correction P1: BCL's *stored* value was `Sucursal`, not `ID_Empleado`. |
| HALT-4 (Meridian still `Hub`) | **Clear.** Resolves to `No_Empleado` (§1). |
| HALT-5 (materializedState still empty) | **N/A.** Meridian `temporal_attributes` already populated (P2); not an attribute-projection defect. |

---

## 5 — Residual (documented, out of scope)

The fix uses `columnRole=identifier` as the entity key for all non-reference sheets. For a true
sales-event sheet (`transaction_id`:identifier as a per-row event id + `reference_key` as the entity FK),
this would name the event id as `entity_id_field`. This is **not live** in any tenant, and it cannot
fabricate phantom entities (entity-resolution OB-203 D3 suppresses creation from transaction-only ids).
The robust discriminator would be the HC LLM's `identifiesWhat` (person vs transaction), but it is
currently null on every column in the decomposed-comprehension path. Re-enabling `identifiesWhat` (or an
equivalent structural entity-vs-event signal) is the comprehension-layer work that would let a single
rule serve both performance data and sales-event data — a comprehension change, outside this HF's scope.

Sabor's financial import uses the financial-agent commit path, not `commitContentUnit`; it does not call
`resolveEntityIdField` and is unaffected (§6A).
