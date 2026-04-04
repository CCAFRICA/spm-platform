# HF-190: Entity Enrichment Fields Written to Metadata

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit and push after each phase.

---

## CC STANDING ARCHITECTURE RULES (MANDATORY)

### SECTION A: DESIGN PRINCIPLES
1. **AI-First, Never Hardcoded** — Korean Test applies. NO hardcoded field names.
2. **Scale by Design** — Works at 10x current volume.
3. **Fix Logic, Not Data** — Structural fix in entity pipeline.
4. **Domain-Agnostic Always** — Enrichment is structural, not domain-specific.

### CC OPERATIONAL RULES
- After EVERY commit: `git push origin dev`
- After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
- Final step: `gh pr create --base main --head dev` with descriptive title and body
- Git from repo root (`spm-platform`), NOT `web/`

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build verification
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### ADDITIONAL STANDING RULES
- **Rule 36:** No unauthorized behavioral changes.
- **Rule 48:** This is a numbered item (HF-190) with its own completion report.
- **Rule 51v2:** `npx tsc --noEmit` AND `npx next lint` run after `git stash` on committed code only.

---

## PROBLEM STATEMENT

`processEntityUnit` collects enrichment fields (entity_attribute bindings like district, region, department) and correctly stores them in `temporal_attributes`. But it does NOT write them to the entity `metadata` JSONB — only `role` and `product_licenses` are written to metadata.

The calculation route's scope aggregation (line 1624) reads `entityMetadata.district` and `entityMetadata.region` from `metadata` to determine which entities belong to which scope. Since these fields aren't in metadata, scope aggregation never fires — producing $0 for all scope_aggregate calculations.

**Verified evidence:**
- James Whitfield (CRP-6003) `temporal_attributes`: `[{key:"district", value:"NE-NE"}, {key:"region", value:"NE"}]` ✅
- James Whitfield (CRP-6003) `metadata`: `{"role": "District Manager"}` — no district, no region ❌
- Route.ts line 1624: `entityMetadata.district` → undefined → scope aggregation skipped → $0

### The Fix

Spread the enrichment dictionary into the entity metadata object. This makes ALL enrichment fields available in metadata — not just role. No hardcoded field names. The enrichment pipeline already collected them structurally.

**Two code locations in the same function:**
1. **New entity creation** — the metadata object in the `newEntities.map()` block
2. **Existing entity enrichment** — the metadata merge in the enrichment loop for existing entities

---

## PHASE 0: DIAGNOSTIC — READ ACTUAL CODE

### 0A: Find the new entity metadata construction
```bash
grep -n -B 2 -A 10 'meta?.role.*role.*meta?.licenses\|role: meta.role\|product_licenses: meta.licenses' web/src/lib/sci/execute.ts | head -20
```
Paste output. Identify the metadata object that only spreads `role` and `product_licenses`.

### 0B: Find the existing entity metadata merge
```bash
grep -n -B 3 -A 15 'enrich EXISTING\|Also update metadata.role\|existingMeta.*metadata' web/src/lib/sci/execute.ts | head -30
```
Paste output. Identify where existing entity metadata is updated during enrichment.

### 0C: Confirm enrichment dict contains district/region fields
```bash
grep -n -B 2 -A 8 'normalizedKey.*sourceField\|meta.enrichment\[' web/src/lib/sci/execute.ts | head -20
```
Paste output. Confirm the enrichment dictionary collects all entity_attribute binding values.

**DO NOT proceed until all reads are pasted with evidence.**

**Commit:** `git add -A && git commit -m "HF-190 Phase 0: Diagnostic — entity metadata enrichment code read" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: Entity enrichment fields (district, region) are written to
temporal_attributes but NOT to metadata. Scope aggregation reads from
metadata. Result: scope_aggregate calculations produce $0.

Option A: Spread enrichment into metadata (entity pipeline change)
  - Add ...meta.enrichment to the metadata object in processEntityUnit
  - Same for existing entity enrichment merge
  - Korean Test: YES — no hardcoded field names
  - Scale test: YES — same enrichment dict, one extra spread
  - PRO: One file, two lines changed
  - PRO: All enrichment fields available in metadata for any future use
  - PRO: Scope aggregation code in route.ts needs zero changes

Option B: Read from temporal_attributes in route.ts scope aggregation
  - Change line 1624 to scan temporal_attributes array for district/region
  - Korean Test: FAIL — would require hardcoding "district" and "region" keys
  - CON: temporal_attributes is an array of objects, not a flat map
  - CON: O(n) scan per entity per calculation

Option C: Add a separate metadata update step after entity creation
  - CON: Extra DB round-trip
  - CON: Doesn't fix root cause

CHOSEN: Option A — one file, domain-agnostic, fixes the source.
Enrichment fields should be in metadata because they ARE metadata.
temporal_attributes is for temporal versioning (effective dates).
metadata is for current-state attributes used by calculation.

REJECTED: Option B — Korean Test failure, wrong abstraction level
REJECTED: Option C — over-engineered, doesn't fix root cause
```

**Commit:** `git add -A && git commit -m "HF-190 Phase 1: Architecture decision — enrichment to metadata" && git push origin dev`

---

## PHASE 2: IMPLEMENTATION

### File: `web/src/lib/sci/execute.ts`

### Change 1: New entity metadata — spread enrichment

Find the metadata construction in the `newEntities.map()` block:

```typescript
// BEFORE:
metadata: {
  ...(meta?.role ? { role: meta.role } : {}),
  ...(meta?.licenses ? { product_licenses: meta.licenses } : {}),
} as Record<string, Json>,
```

```typescript
// AFTER:
metadata: {
  ...(meta?.enrichment || {}),  // HF-190: All enrichment fields in metadata for scope resolution
  ...(meta?.role ? { role: meta.role } : {}),
  ...(meta?.licenses ? { product_licenses: meta.licenses } : {}),
} as Record<string, Json>,
```

Note: `role` and `product_licenses` are spread AFTER enrichment so they take precedence if there's a collision (e.g., if a field called `role` exists in enrichment AND was detected by `ROLE_TARGETS`).

### Change 2: Existing entity enrichment — merge enrichment into metadata

Find the existing entity metadata update block (the "Also update metadata.role if detected" section). Currently it only writes `role` to metadata for existing entities. Change it to also spread enrichment:

Find the pattern where existing entity metadata is updated:

```typescript
// BEFORE (approximate):
if (meta.role) {
  const { data: entData } = await supabase.from('entities').select('metadata').eq('id', entityId).single();
  const existingMeta = (entData?.metadata ?? {}) as Record<string, Json>;
  await supabase.from('entities').update({
    metadata: { ...existingMeta, role: meta.role },
  }).eq('id', entityId);
}
```

```typescript
// AFTER:
if (meta.enrichment && Object.keys(meta.enrichment).length > 0) {
  const { data: entData } = await supabase.from('entities').select('metadata').eq('id', entityId).single();
  const existingMeta = (entData?.metadata ?? {}) as Record<string, Json>;
  await supabase.from('entities').update({
    metadata: {
      ...existingMeta,
      ...meta.enrichment,  // HF-190: All enrichment fields in metadata
      ...(meta.role ? { role: meta.role } : {}),
    },
  }).eq('id', entityId);
  enriched++;
}
```

The condition broadens from "if role detected" to "if any enrichment exists" — because district/region are enrichment fields that don't trigger the role detection path.

### What NOT to change:
- `temporal_attributes` population — KEEP IT. Temporal versioning is still valuable.
- The enrichment binding detection (`entity_attribute`, `descriptive_label`) — UNCHANGED.
- The `ROLE_TARGETS` detection — UNCHANGED.
- `route.ts` scope aggregation code — ZERO changes needed. It already reads `entityMetadata.district`.
- `intent-executor.ts` — NO changes.
- `intent-transformer.ts` — NO changes.

---

## PHASE 3: BUILD VERIFICATION

1. `git stash`
2. `npx tsc --noEmit` — must pass
3. `npx next lint` — must pass
4. `git stash pop`
5. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev`
6. Confirm localhost:3000

**Commit:** `git add -A && git commit -m "HF-190 Phase 3: Build verification" && git push origin dev`

---

## PROOF GATES — HARD

| # | Criterion | How to verify |
|---|-----------|---------------|
| G1 | Enrichment spread in new entity metadata | `grep -A 5 'enrichment.*metadata\|HF-190' web/src/lib/sci/execute.ts` — paste output showing `...meta.enrichment` in metadata object |
| G2 | Enrichment spread in existing entity metadata merge | Same grep — paste output showing enrichment merge for existing entities |
| G3 | `role` and `product_licenses` still override enrichment (spread after) | Same grep — paste showing `role` spread comes AFTER enrichment |
| G4 | `temporal_attributes` still populated (not removed) | `grep 'buildTemporalAttrs\|temporal_attributes' web/src/lib/sci/execute.ts` — paste showing it still exists |
| G5 | `npx tsc --noEmit` passes | Paste exit code |
| G6 | `npx next lint` passes | Paste exit code |
| G7 | `npm run build` succeeds | Paste exit code |

## PROOF GATES — SOFT

| # | Criterion | How to verify |
|---|-----------|---------------|
| S1 | Only execute.ts modified | `git diff --name-only` |
| S2 | No changes to route.ts, intent-executor, or intent-transformer | Same |
| S3 | Korean Test: no hardcoded field names (district, region, etc.) | `grep -n 'district\|region\|NE-NE\|NE-MA' web/src/lib/sci/execute.ts` in HF-190 changes — zero hits |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-190_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE.

---

## POST-MERGE VERIFICATION

After merge to production, clean slate reimport is required because existing entity metadata must be repopulated with enrichment fields. The existing CRP entities have `metadata: {"role": "..."}` without district/region. Reimporting the roster through HF-190 will populate them.

**After reimport, verify:**
```sql
SELECT external_id, display_name, metadata::text
FROM entities 
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7' 
  AND external_id IN ('CRP-6003', 'CRP-6001');
```
Expected: James Whitfield metadata should include `district: "NE-NE"`, `region: "NE"` alongside `role: "District Manager"`.

Then recalculate Plan 4 January → verify $66,756.90.

---

## FINAL STEP

```bash
gh pr create --base main --head dev --title "HF-190: Entity enrichment fields written to metadata for scope resolution" --body "processEntityUnit collected enrichment fields (district, region, department) into temporal_attributes but did NOT write them to entity metadata. The scope aggregation code reads entityMetadata.district/region from metadata to determine scope boundaries. Result: scope_aggregate calculations produced $0 because the scope fields were in temporal_attributes, not metadata. Fix: spread the enrichment dictionary into the metadata JSONB object alongside role and product_licenses. Korean Test compliant — no hardcoded field names. All enrichment fields now available in metadata for scope resolution and any future consumption."
```
