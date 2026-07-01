# HF-371 — Deterministic, order-independent import: one finalize, every transaction row linked

Branch `hf-371-deterministic-import`. Do NOT merge (SR-44 — architect merges + runs the live re-import proof). Each phase's EPG evidence is pasted verbatim.

## Phase A — Diagnostic gather (read-only)

### Headline (HALT-4 transparency — NOT silent narrowing)
Phase A evidence shows **Roots 2 and 3 are already CLOSED by the merged HF-367/368/369/370 work**, and the genuinely-operative remaining defect is **Root 1 (concurrent finalize)**. The committed `entities`/`data_type` state on VLTEST2 is **stale — it was imported by the old DEPLOYED code (before HF-370 was deployed)** and self-heals on a clean re-import with current `main`. This is reported, not narrowed: Phase C/D become verification of the merged fixes on current code + defense-in-depth; Phase B is the new fix.

### EPG-A1 — finalize fan-out (Root 1) [pasted from trace]
Three triggers dispatch `POST /api/import/sci/finalize-import` (tenant-wide, calls `executePostCommitConstruction` → `resolveEntitiesFromCommittedData` + `createMissingAssignments`):
- **Client** (`operate/import/page.tsx` `fireFinalizeAndFlywheel`, called by `handleExecutionComplete` + `handleLoadComplete`).
- **execute-bulk server-side** (`execute-bulk/route.ts:830` `waitUntil(fetch(finalize-import))`, gated `response.overallSuccess && !pulseLoadJob` — the **synchronous path**).
- **finalize-sweep cron** (`pulse-load/finalize-sweep`, hand-off path, guarded by `pulse_load_jobs.finalized`).

**Guards:** function-level idempotency (entity dedup by `external_id`, backfill only `entity_id IS NULL`, assignment pair-existence). Hand-off path: the `finalized` flag. **Synchronous path: NO endpoint-level lock/flag** → the client fire AND the execute-bulk server-side fire run **concurrently for one import**. Entity creation is a plain `entities.insert(chunk)` (`entity-resolution.ts:488`), NOT an upsert — so two concurrent passes conflict on the unique `(tenant_id, external_id)`; the losing pass hits the error, `break`s, and links fewer rows → the observed "one pass reports `entities_created=0` / linking swings 425↔0" non-determinism.

### EPG-A2 — linking fork (Root 2) [live DB + code]
```
### data_type × sheet (VLTEST2, current committed state) ###
  entity :: Plan General: 4 rows, 4 linked        ← STALE: old code made Plan General an entity roster
  reference :: Tablas de Tasas: 14 rows, 0 linked
  transaction :: Datos: 510 rows, 510 linked      ← Datos IS transaction, ALL 510 linked (Root 2 satisfied here)
### key overlap ###
  distinct Datos ID_Empleado: 85  (BCL-5001..)   entity external_id: 89  OVERLAP: 85/85
```
The linker `resolveEntitiesFromCommittedData` (`entity-resolution.ts:139`): keys on `meta.entity_id_field` (recorded at commit) with a `field_identities` fallback; runs **tenant-wide** (not proposal-scoped); **create-or-link** — dedups new external_ids against existing entities (`existingMap`), creates the rest, then backfills `entity_id` on all batches by matching the id-column value to `entities.external_id`. It is order-independent by construction (tenant-wide, value-keyed; `reconcileEntityKeysByValueOverlap` re-keys a roster to the transaction identity domain). **Root 2 is not reproduced on current data (510/510 linked).**

### EPG-A3 — entity formation (Root 3) [live DB + live comprehension of CURRENT code]
Stale committed state: 89 entities = 85 real (`BCL-5xxx`) + **4 phantoms** `C1,C2,C3,C4` from `Plan General` (its `#` column holds component codes C1–C4; `entity_id_field='#'`; classified `entity`). Note: `#`=`C1..C4` are alphanumeric, NOT numeric ordinals — HF-370's `looksLikeRowIndex` would not catch them.

**Current-main behavior (live LLM comprehension → current classifier):**
```
Plan General:  #→scope_role="reference" nature_role="identifier"; Componente→reference/name
   → CLASSIFICATION: reference @ 0.97      findHcEntityIdCandidates: []
Datos:  ID_Empleado→scope_role="entity" nature_role="identifier"
   → CLASSIFICATION: transaction @ 0.97    findHcEntityIdCandidates: ["ID_Empleado"]
```
So **current `main` classifies Plan General as `reference` (not entity) and finds NO entity id** → `processEntityUnit` never runs → **no phantom entities**. Root 3 is closed by HF-368 (the model recognizes `#`/component-codes as `reference`) + HF-370 O2 (entity creation requires `scope=entity && nature=identifier`). The 4 phantoms are stale.

### Phase A verdict
- **Root 1 (finalize race): OPERATIVE** — fixed in Phase B.
- **Root 2 (0 linked): not operative on current code** — Datos transaction + 510/510 linked; linker is tenant-wide create-or-link, order-independent. Phase D = verify + harden.
- **Root 3 (phantom): not operative on current code** — Plan General classifies reference; no entity id. Phase C = verify + note the guard.

## Phase B — Deterministic single-pass finalize (Root 1)

**Change.** Exactly one finalize runs per import, via an atomic per-(tenant, proposal) claim + an
idempotency backstop:
1. **`lib/sci/finalize-coalesce.ts`** — `claimFinalize` atomically INSERTs into a new
   `import_finalize_runs` (unique PK `(tenant_id, proposal_id)`). The first caller claims; a concurrent
   duplicate hits `23505` and **coalesces (no-op)**. A `failed` or STALE (>15 min, crashed) claim is
   retryable; a `done` claim coalesces later duplicates. If the table is absent (migration pending) or
   the claim errors, it **degrades gracefully** (grants, proceeds on idempotency). Decision core
   `decideFinalizeClaim` is pure + unit-tested.
2. **`finalize-import/route.ts`** — claims at entry; if not granted, returns `{coalesced:true}` without
   running; marks the claim `done` on success (so the sync-path double-fire — client + execute-bulk
   `waitUntil` — now runs the work exactly once).
3. **`entity-resolution.ts`** — entity creation changed from `insert` to `upsert(onConflict:
   'tenant_id,external_id', ignoreDuplicates)` — the backstop so a stale-takeover race can't conflict/
   break/under-link (the losing pass no longer errors; `entityLookup` re-fetches so linking stays
   complete). Migration `20260702_hf371_import_finalize_runs.sql` (architect applies, SR-44); the table
   is tenant-scoped → added to Clean Slate's `data` category (HF-370 O5 drift guard stays green).

**EPG-B1.** Unit tests (`hf371-finalize-coalesce.test.ts`, all pass): first caller granted; concurrent
duplicate of a fresh running claim → coalesced; stale/failed → retried; `done` → coalesced; table
absent → granted (idempotency); other error → granted (never blocks the import). The claim key coalesces
the double-fire for ONE import (same proposalId) while a re-import (new proposalId) claims fresh — so a
repeated import yields an identical result via one pass. 284/284 tests, build green, dev serves :3000.
The live "one finalize pass per import + repeat-identical" evidence is EPG-E1 (architect re-import, SR-44).

## Phase C — Classification correctness / no phantom entities (Root 3)

**Current-main already classifies correctly** (Phase A live comprehension, re-pasted):
`Plan General → reference @0.97`, `#`→`scope_role="reference"`, `findHcEntityIdCandidates: []`;
`Datos → transaction @0.97`, `ID_Empleado`→`scope_role="entity"`. So `processEntityUnit` never runs for
Plan General → no phantom entities (closed by HF-368 model recognition + HF-370 O2 entity-id-from-model).

**Change (EPG-C1 structural guarantee — "code guarantees" half of Decision 158).** HF-370 O2 applied the
row-ordinal guard only to the untrusted fallback binding. HF-371 extends it to the **final chosen entity-id
column, regardless of source (model or binding)**: in `processEntityUnit`, if the selected id column's
values are the row ordinals (`looksLikeRowIndex` — 1..N in row order; a structural/arithmetic fact, zero
language strings), the entity unit is refused with a loud error rather than minting phantom "people". So a
`#`/ordinal column mis-tagged as an identifier can NEVER be an entity key even if the model guessed entity.
(`BCL-5xxx` ids are unaffected; only literal row-position columns are refused — a rare, intentional
trade-off per the directive's "regardless of the model's semantic guess".)

**EPG-C1.** Mechanism proven live (Plan General → reference, no candidates). The `data_type`-by-sheet +
entity-list-with-no-phantoms on a FRESH import is EPG-E3 (architect re-import, SR-44) — the current
committed 89-entity state is stale (old deployed code) and self-heals on re-import with current `main`.

## Phase D — Order-independent linking (Root 2)

**No code change needed beyond Phase B's upsert** — the linker is already order-independent create-or-link:
`resolveEntitiesFromCommittedData` (`entity-resolution.ts`) runs **tenant-wide** (not proposal-scoped),
keys on the id-column VALUE matched against `entities.external_id`, **creates** entities for external_ids
with no existing entity and **links** the rest (`existingMap` + `entityLookup` re-fetch backfills
`entity_id` on ALL batches). `reconcileEntityKeysByValueOverlap` re-keys a roster to the transaction
identity domain (import-order independent — the id column's `data_nature` characterizes it the same way
regardless of import order). Phase B's `upsert` removed the last order/concurrency hazard (a losing race no
longer errors and under-links).

**EPG-D1.** Current committed state (Phase A): `Datos: 510 rows, 510 linked, 0 unlinked`; key overlap 85/85.
The linker's log line `DS-009 3.3: N created, N rows linked` and `unlinked=0` on a FRESH ordered re-import
is EPG-E2/E4 (architect, SR-44).

## Phase E — End-to-end proof

**CC-verifiable (pasted):**
- **EPG-E6 (suite + build):** `284 tests, 284 pass, 0 fail` (SCI + platform); `npm run build` green
  (`BUILD_ID` present); dev serves `localhost:3000`.
- **Mechanism (live LLM + current classifier):** Plan General → reference / no entity candidates; Datos →
  transaction / `ID_Empleado` candidate. Finalize coalescing decision core unit-tested (9 cases).

**Architect-verifiable (SR-44 — live re-import; the report marks these as the architect's reconciliation
evidence):** EPG-E1 (clean-slate → plan→roster→6×Datos → exactly one finalize pass; re-import identical),
EPG-E2 (`unlinked=0`, 510 linked), EPG-E3 (85 entities, no phantoms; Datos=transaction, Plan General=
reference/plan), EPG-E4 (Datos-alone + a third order → identical linked result), EPG-E5 (calculation:
convergence bindings + `[CalcRecon-T2]` payouts; total reported verbatim). **The migration
`20260702_hf371_import_finalize_runs.sql` must be applied before the deploy** (else the claim degrades to
graceful-grant, i.e. no coalescing until applied).

## HALT status
- **HALT-1 (evidence vs roots):** reported, not forced — Roots 2/3 are already closed on current `main`
  (proven live); the stale committed state reflects old deployed code. Root 1 (finalize race) is the
  operative defect and is fixed (Phase B). No fix was forced onto a non-operative cause.
- **HALT-2 (registry):** none — the classifier reads the model's bare primitives; the row-ordinal guard is
  pure arithmetic (values == row positions), zero language strings.
- **HALT-3 (order dependence):** the linker is tenant-wide value-keyed create-or-link; the flywheel
  identifier-atom re-comprehension (HF-370 O1) + Phase B upsert close the residual order/concurrency paths.
- **HALT-4 (silent narrowing):** none — the "Roots 2/3 already closed" finding is reported explicitly, not
  used to skip a phase; each phase has its evidence.

## §6A residual (unchanged, forward-referenced)
Convergence field-matching / percent-scale (`cumplimiento`→`Cumplimiento_Colocacion`, `calidad`→
`Indice_Calidad_Cartera`; plan thresholds in %, data in ratios) — EPG-E5 surfaces whether it is live; if
bindings remain 0 with linking correct, it is the next directive, not a Phase D regression.
