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
_(filled in Phase C)_

## Phase D — Order-independent linking (Root 2)
_(filled in Phase D)_

## Phase E — End-to-end proof
_(filled in Phase E)_
