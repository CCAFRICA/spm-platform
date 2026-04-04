# DIAG-015: Tier 1 Flywheel Drops entity_id_field on Subsequent Imports
## March 30, 2026
## Type: Diagnostic — CC must execute this BEFORE any fix is designed

---

## SYMPTOM

CRP Plan 1 Jan 16-31 produces $4,000 (base intercepts only) instead of $109,139.46 (GT).
CRP Plan 1 Jan 1-15 produces $73,142.72 = GT exactly. Same plan, same entities, different period.

## EVIDENCE CHAIN (all from production, not speculation)

### Evidence 1: DIAG Logs — Jan 1-15 (WORKING)
```
HF-165: input_bindings empty — running calc-time convergence
[Convergence] OB-185 Pass 4: 1 unresolved metrics — invoking AI semantic derivation
Pass 4 derivation: period_equipment_revenue → sum(total_amount) filters=[{"field":"product_category","operator":"eq","value":"Capital Equipment"}]
OB-183: Resolved 182 rows to entities at calc time (entity_id was NULL)
182 committed_data rows (182 entity-level, 0 store-level)
Grand total: 73,142.72
```

### Evidence 2: DIAG Logs — Jan 16-31 (BROKEN)
```
HF-165: input_bindings already populated — skipping convergence
207 committed_data rows (0 entity-level, 207 store-level)
Store data: 0 unique stores
Grand total: 4,000
```

### Evidence 3: Database Query — committed_data metadata by source_date
```sql
SELECT metadata->>'entity_id_field', source_date, COUNT(*)
FROM committed_data
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7' AND source_date IS NOT NULL
GROUP BY 1, 2 ORDER BY 2
```

**Result:**
- Jan 1 through Jan 15: `entity_id_field = 'sales_rep_id'` ← CORRECT
- Jan 16 through Feb 15: `entity_id_field = null` ← BROKEN

Clean boundary at the file split. Jan 1-15 was one CSV. Jan 16-31 was a separate CSV. All files have identical column structure.

### Evidence 4: OB-183 Entity Resolution Code (AUD-001 extraction)
```typescript
let entityIdFieldFromMeta: string | null = null;
for (const row of committedData) {
  const meta = row.metadata as Record<string, unknown> | null;
  if (meta?.entity_id_field && typeof meta.entity_id_field === 'string') {
    entityIdFieldFromMeta = meta.entity_id_field;
    break;
  }
}
```
When `entity_id_field` is null on ALL rows for a period, `entityIdFieldFromMeta` stays null → resolution never fires → 0 entity-level rows → all data unattributed → derived metrics = 0 → engine computes only intercepts.

### Evidence 5: OB-182 Import Code (AUD-001 extraction)
```typescript
const entityIdBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier');
const entityIdField = entityIdBinding?.sourceField;

metadata: {
  source: 'sci-bulk',
  entity_id_field: entityIdField || null,
}
```
`entity_id_field` is set from `confirmedBindings`. If `confirmedBindings` lacks an `entity_identifier` binding, `entityIdField` is undefined → metadata stores null.

### Evidence 6: Flywheel Write Path (AUD-001 extraction)
```typescript
// In analyze/route.ts — after classification, before proposal return
const columnRoles: Record<string, string> = {};
for (const binding of unit.fieldBindings) {
  columnRoles[binding.sourceField] = binding.semanticRole;
}
writeFingerprint(tenantId, hash, {
  classification: unit.classification,
  confidence: unit.confidence,
  fieldBindings: unit.fieldBindings,  // ← full bindings stored in classificationResult
  tabName: unit.tabName,
}, columnRoles, ...);
```

### Evidence 7: Flywheel Read Path — Tier 1 (AUD-001 extraction)
```typescript
// lookupFingerprint returns:
{
  tier: 1,
  classificationResult: tier1.classification_result,  // has fieldBindings
  columnRoles: tier1.column_roles,                     // has { sales_rep_id: 'entity_identifier' }
  confidence: conf,
  matchCount: tier1.match_count,
}
```

## CONFIRMED ROOT CAUSE

The first CRP transaction file (Jan 1-15) imported as **Tier 3** (novel structure). Full LLM classification ran. The LLM correctly identified `sales_rep_id` as `entity_identifier`. `confirmedBindings` included this role. OB-182's execute code read it and stored `metadata.entity_id_field = 'sales_rep_id'` on all 182 rows.

The second CRP transaction file (Jan 16-31) imported as **Tier 1** (exact fingerprint match — same columns, same structure). The LLM was skipped. The proposal was built from stored flywheel data (`classificationResult` + `columnRoles`).

**THE GAP:** The Tier 1 path returns `classificationResult` and `columnRoles` from the fingerprint. But somewhere between the Tier 1 lookup result and the execute pipeline's `ContentUnitExecution.confirmedBindings`, the `entity_identifier` semantic role is NOT being reconstructed into the `confirmedBindings` array. As a result, OB-182's execute code finds no `entity_identifier` binding → `entityIdField` is undefined → `metadata.entity_id_field` is null.

## DIAGNOSTIC TASK FOR CC

**Do NOT write any fix yet.** This diagnostic must be completed first.

### Phase 1: Trace the Tier 1 → confirmedBindings reconstruction

Read the ACTUAL code in `web/src/app/api/import/sci/analyze/route.ts`. Find the section where a Tier 1 flywheel match (from `lookupFingerprint`) is used to build the `SCIProposal`. Specifically:

1. Find where `lookupFingerprint` is called
2. Find where its return value (`classificationResult`, `columnRoles`) is used to build `ContentUnit.fieldBindings` or `ContentUnit.confirmedBindings`
3. Trace how this data flows to the proposal that gets displayed in `SCIProposal.tsx`
4. Trace how the user's "Confirm" action passes bindings to the execute route
5. In the execute route, find where `confirmedBindings` is read and how `entity_identifier` gets (or doesn't get) into the `ContentUnitExecution`

**Output required:** Paste the exact code for each of these 5 steps. File path and line numbers for each.

### Phase 2: Compare Tier 3 vs Tier 1 binding flow

For the same 5 steps above, trace the Tier 3 path (full LLM classification). Paste the code for each step. Then identify the EXACT point where the Tier 1 path diverges and loses the `entity_identifier` binding.

**Output required:** A table showing:
| Step | Tier 3 Code Path | Tier 1 Code Path | Same/Different |

### Phase 3: Verify with database evidence

Run these queries against the CRP tenant:

```sql
-- 1. What does the structural_fingerprints record look like for CRP transaction files?
SELECT
  fingerprint_hash,
  classification_result::text,
  column_roles::text,
  match_count,
  confidence
FROM structural_fingerprints
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

-- 2. What do the import_batches look like for CRP? (shows which were Tier 1 vs Tier 3)
SELECT
  id,
  created_at,
  metadata->>'recognitionTier' as tier,
  metadata->>'sourceFileName' as filename,
  LEFT(metadata::text, 500) as meta_preview
FROM import_batches
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
ORDER BY created_at;

-- 3. What do the processing_jobs show for classification on each file?
SELECT
  id,
  created_at,
  job_type,
  LEFT(classification_result::text, 500) as classification_preview
FROM processing_jobs
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
ORDER BY created_at;
```

**Output required:** Paste full query results.

### Phase 4: Write findings report

Based on Phases 1-3, produce a findings document:

```markdown
# DIAG-015 FINDINGS

## Tier 1 → confirmedBindings reconstruction code path
[paste file:line for each step]

## The divergence point
[exact file, exact line, exact code where entity_identifier is lost]

## Database evidence
[does column_roles in structural_fingerprints contain sales_rep_id: entity_identifier?]
[does Tier 1 classificationResult contain fieldBindings with entity_identifier?]

## Root cause confirmed/revised
[either confirms the hypothesis or identifies the real cause]

## Recommended fix location
[exact file, exact function, exact line — what code needs to change]
```

**Commit:** `DIAG-015: Tier 1 flywheel entity_id_field loss — findings`

---

## WHAT CC MUST NOT DO

1. **DO NOT write any fix in this prompt.** This is diagnostic only.
2. **DO NOT hypothesize from function names.** Read the actual code at the actual lines.
3. **DO NOT skip any of the 5 trace steps.** The gap could be at any point in the chain.
4. **DO NOT update committed_data metadata via SQL.** Standing Rule 34.
5. **DO NOT modify any source files.** This diagnostic reads code and queries data. Zero code changes.

## WHAT CC MUST DO

1. `git stash` any uncommitted changes before starting
2. Read actual source files with `cat` or `grep` — not from memory
3. Paste exact code snippets with file paths and line numbers
4. Run all 3 SQL queries and paste results
5. Commit the findings document to project root
6. `git stash pop` after committing

---

## COMPLIANCE

- [ ] CC_STANDING_ARCHITECTURE_RULES.md v2.0 loaded
- [ ] CC_DIAGNOSTIC_PROTOCOL.md Rules 19-24 loaded
- [ ] Rule 21: Trace actual code path — this entire DIAG is Rule 21
- [ ] Rule 13: Read code first — no fix until code is read
- [ ] Standing Rule 34: No SQL data patches
- [ ] FP-49: No SQL schema fabrication

---

## POST-DIAGNOSTIC: What happens next

After DIAG-015 findings are committed, Andrew + Claude will review the findings and design the HF. The fix will be one of:

**Option A:** The Tier 1 proposal builder doesn't reconstruct `confirmedBindings` from `columnRoles` → Fix the reconstruction to include ALL semantic roles, especially `entity_identifier`.

**Option B:** The Tier 1 path stores `fieldBindings` in `classificationResult` but the proposal builder doesn't read them → Fix the proposal builder to read `classificationResult.fieldBindings`.

**Option C:** Something else entirely that only reading the actual code will reveal.

The fix will be a single-task HF (Standing Rule 46) because this has a clear, isolated root cause.

---

*"Read the code. Don't trust descriptions. The data proves the first file classified correctly and every subsequent file did not. The gap is in the Tier 1 reconstruction path."*
