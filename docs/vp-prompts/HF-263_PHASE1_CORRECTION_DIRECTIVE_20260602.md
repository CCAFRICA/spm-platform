# HF-263 Phase 1 Correction — Entity Type from Field Identity

## §0 — Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Commit + push after completion. Build gate before reporting.

---

## §1 — Problem

Phase 1 (commit d684925e) typed entities as `'location'` when ALL source committed_data rows had `data_type='reference'`. This failed: hub names appear in transaction data as well as reference data, so the check never triggered. All 12 hub entities remain `entity_type='individual'`.

The data_type discriminant was wrong. The correct discriminant is the **field_identity structuralType** of the column that produced the external_id. This is the Decision 111 architecture: field identity determines what a column IS, stably, regardless of import order.

The HC classification already produces this — confirmed in the current import logs:
- `No_Empleado: identifier@0.95` → the column that declares individuals
- `Hub: reference_key@0.88` → the column that references grouping entities
- `Hub_Asignado: reference_key@0.88` → same

The `FieldIdentity.structuralType` enum (`identifier`, `reference_key`, `measure`, `temporal`, `attribute`, `name`) is confirmed current — convergence-service.ts reads it from `committed_data.metadata.field_identities` at current HEAD.

The fix: when `resolveEntitiesFromCommittedData` discovers an external_id from a column, it must know that column's structuralType. If `identifier` → `entity_type: 'individual'`. If `reference_key` → `entity_type: 'location'`. Import-order independent because HC classifies the column the same way regardless of what was imported before. Korean Test compliant because it uses structuralType, not column names or contextualIdentity string matching.

---

## §2 — Execution

**P1.1 — Read the current function.** Paste the FULL body of `resolveEntitiesFromCommittedData` from `web/src/lib/sci/entity-resolution.ts`. Do not summarize. Do not abbreviate. Paste every line.

```bash
cat web/src/lib/sci/entity-resolution.ts
```

If the file exceeds reasonable length, paste from the function declaration through its closing brace.

Identify in your paste:
- Where external_ids are discovered (which columns, which batches)
- Where new entities are created (the insert/upsert block)
- Whether the function currently reads `field_identities` from committed_data metadata
- Whether the function tracks which column produced each discovered external_id
- Any existing `contextualIdentity` string matching (e.g., `.includes('person')`) — if present, this is a Korean Test violation to remove, not a pattern to preserve
- The current entity_type assignment (should be line ~283 per CC's HALT-1 grep)

**P1.2 — Implement the fix.** Based on what P1.1 reveals about the ACTUAL current code structure:

The entity_type at the insert point must be derived from the structuralType of the column that produced the external_id. The function already tracks which column is the `idColumn` per batch (or equivalent). The field_identities are on committed_data metadata (or accessible from the batch's metadata).

Thread the structuralType through to the entity creation point:
- External_ids discovered from a column with `structuralType === 'identifier'` → `entity_type: 'individual'`
- External_ids discovered from a column with `structuralType === 'reference_key'` → `entity_type: 'location'`
- External_ids discovered from a column with any other structuralType or no field_identity → `entity_type: 'individual'` (safe default — individuals are the common case)

Remove the data_type-based discriminant from commit d684925e. The structuralType check replaces it entirely.

If the function does NOT currently track which column produced each external_id (i.e., if external_ids are collected into a flat set without column provenance), you must thread that provenance. The mechanism: when adding an external_id to the discovery set, record the structuralType of the column it came from. At entity creation, read that recorded type.

**If the function currently contains `contextualIdentity?.toLowerCase().includes('person')` or ANY other string-content matching against contextualIdentity values:** remove it. This is a Korean Test violation (hardcoded vocabulary). The structuralType enum (`identifier`, `reference_key`) is the structural discriminant. contextualIdentity is informational metadata for the AI prompt, not a gate.

**P1.3 — Build.** `npm run build` must succeed.

**P1.4 — Report.** Paste:
- The full function as read in P1.1
- The git diff of your modification
- Build output (final lines)
- Any Korean Test violations found and removed

Commit: `HF-263 Phase 1 correction: entity_type from field_identity structuralType (Decision 111)`

Push.

---

## §3 — HALT

**HALT-E:** The function discovers external_ids through a mechanism that does NOT involve per-column iteration (e.g., it reads entity_id values from committed_data rows directly, or uses a name-matching fallback that doesn't go through field_identities at all). If the discovery mechanism has no column provenance to thread structuralType through, report the actual mechanism with pasted code. Do not guess.

**HALT-F:** `field_identities` metadata is NOT present on the committed_data rows that entity-resolution reads. If the function reads batches that don't carry field_identities in their metadata, the structuralType is unavailable. Report which batches are missing field_identities and what metadata they carry instead.

---

## §4 — Out of Scope

- Phase 4 entity filtering (already committed, will work once Phase 1 types entities correctly)
- CPI relationship discovery (Phase 2, already committed, will work once non-individual entities exist)
- Convergence key-space preference (Phase 3, already committed and working — C5 is nonzero)
- The `'location'` label itself — using `'location'` for all non-individual entities is acceptable for now. Entity type vocabulary refinement (location vs team vs organization) is a follow-on.
