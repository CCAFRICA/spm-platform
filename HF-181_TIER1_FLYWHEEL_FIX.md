# HF-181: Tier 1 Flywheel entity_id_field Loss
## Based on DIAG-015 Findings (commit 5336c074)
## Priority: P0 — Blocks ALL CRP calculations except Plan 1 Jan 1-15

---

## INCLUDE AT TOP OF PROMPT
- CC_STANDING_ARCHITECTURE_RULES.md v2.0
- CC_DIAGNOSTIC_PROTOCOL.md

---

## CONTEXT

CRP Plan 1 Jan 1-15 calculates correctly ($73,142.72 = GT, 24/24 exact match). CRP Plan 1 Jan 16-31 produces $4,000 (intercepts only). DIAG-015 traced the root cause to two compounding bugs in the SCI import pipeline's Tier 1 flywheel path.

### Root Cause (from DIAG-015, commit 5336c074)

**Bug 1 (PRIMARY):** In `analyze/route.ts` lines 120-135, when `flywheelResult.tier === 1`, `skipHC = true` prevents LLM from running. The flywheel returns `classificationResult` (which contains `fieldBindings`) and `columnRoles`, but NEITHER is injected into the profile. `generateSemanticBindings()` runs on structural heuristics only → `entity_identifier` not assigned → OB-182's execute code finds no `entity_identifier` binding → `metadata.entity_id_field = null` → OB-183 entity resolution at calc time has nothing to resolve with → 0 entity-level rows → derived metrics = 0 → engine computes only intercepts.

**Bug 2 (SECONDARY):** The structural fingerprint's `column_roles` and `classification_result.fieldBindings` were written from the PRE-LLM classification (structural heuristics only). The fingerprint stores `sales_rep_id: "category_code"` instead of `"entity_identifier"`. Even if Bug 1 is fixed to inject flywheel data, the injected roles are wrong.

### Evidence

```
Jan 1-15 committed_data: metadata.entity_id_field = 'sales_rep_id' (Tier 3, LLM ran)
Jan 16+  committed_data: metadata.entity_id_field = null             (Tier 1, flywheel)

structural_fingerprints.column_roles: { sales_rep_id: "category_code" }  ← WRONG
```

---

## ARCHITECTURE DECISION GATE

Before writing any code, answer these questions:

1. Does this HF modify any table schema? **NO** — all fixes are code-level.
2. Does this HF affect BCL or Meridian? **YES** — BCL future imports will go through the corrected Tier 1 path. BCL's existing data is unaffected (already has entity_id populated from pre-OB-182 imports). The fix must be backward-compatible.
3. Does this HF violate any locked decisions? **NO** — it enforces Decision 92 (calc-time binding) by ensuring the metadata needed for calc-time resolution is correctly set.
4. Korean Test: **PASS** — no domain vocabulary added. The fix is structural (semantic role propagation).

---

## THE FIX — THREE LAYERS

### Layer 1: Inject flywheel fieldBindings into Tier 1 proposals (Bug 1)

**File:** `web/src/app/api/import/sci/analyze/route.ts`
**Location:** After the `skipHC` block (lines 120-135), BEFORE `buildProposalFromState()` is called.

**What to do:**

When `flywheelResult.tier === 1 && flywheelResult.match && flywheelResult.classificationResult`:

1. Read `flywheelResult.classificationResult.fieldBindings` (array of `SemanticBinding`)
2. If `fieldBindings` exists and has entries, inject them directly as the profile's field bindings
3. These bindings should be used BY the proposal builder instead of generating new bindings from structural heuristics

**Implementation approach:**

The cleanest path is to set the flywheel's `fieldBindings` on the profile BEFORE `buildProposalFromState()` runs. The `buildProposalFromState()` → `generateSemanticBindings()` chain currently ignores flywheel data because `profile.headerComprehension` is null. Rather than patching `generateSemanticBindings()`, inject the flywheel bindings as a synthetic `headerComprehension` or — better — add a `flywheelBindings` field to the profile that `buildProposalFromState()` checks first.

**Read the actual code** in `buildProposalFromState()` and `generateSemanticBindings()` to determine the simplest injection point. The goal: when Tier 1 flywheel has `fieldBindings`, those bindings become the proposal's `fieldBindings` without modification.

**Critical:** The injected bindings from Layer 1 will initially contain wrong roles (Bug 2: `category_code` instead of `entity_identifier`). Layer 2 fixes this for future imports. For the CRP tenant specifically, a reimport of one file through the corrected path (after Layer 2 deploys) will update the fingerprint, and subsequent files will get correct roles.

### Layer 2: Update fingerprint after user confirmation (Bug 2)

**File:** `web/src/app/api/import/sci/execute/route.ts`
**Location:** After successful execution, in the signal-writing section (where `writeClassificationSignal` is called).

**What to do:**

After the user confirms the proposal and execute completes successfully, the `confirmedBindings` contain the correct semantic roles (either from LLM classification or from user correction). Update the structural fingerprint with these confirmed roles:

1. Compute the fingerprint hash for the file (same hash computation used in `analyze/route.ts`)
2. Build `column_roles` from `confirmedBindings`:
   ```typescript
   const confirmedColumnRoles: Record<string, string> = {};
   for (const binding of unit.confirmedBindings) {
     confirmedColumnRoles[binding.sourceField] = binding.semanticRole;
   }
   ```
3. Build updated `classificationResult` that includes the confirmed `fieldBindings`
4. Call `writeFingerprint()` with the confirmed roles — this updates the existing fingerprint record (optimistic lock on match_count)

**Why this is correct:** The write path in `analyze/route.ts` currently writes the fingerprint from pre-LLM structural-only bindings. The execute route has the POST-confirmation bindings. Moving (or duplicating) the write to execute ensures the fingerprint reflects confirmed reality, not initial guesses.

**Backward compatibility:** `writeFingerprint()` already handles the update case (existing fingerprint → increment match_count, update classification_result). The confirmed roles will overwrite the initial structural-only roles. This is the correct behavior — the fingerprint should reflect the most recent confirmed classification.

### Layer 3: Engine-level fallback for missing entity_id_field (Defense in depth)

**File:** `web/src/app/api/calculation/run/route.ts`
**Location:** In the OB-183 entity resolution section, after the `entityIdFieldFromMeta` detection loop.

**What to do:**

If `entityIdFieldFromMeta` is null after scanning all committed_data metadata (no rows have `entity_id_field` set), add a fallback that discovers the entity identifier column from the data itself:

1. Get the set of known entity `external_id` values (already available in `extIdToUuid`)
2. For the first committed_data row, check each text field in `row_data`
3. If a field's value matches an entity `external_id`, that field is likely the entity identifier
4. Confirm by checking a sample of rows (e.g., 10 rows) — if >80% match, use this field
5. Log: `OB-183: entity_id_field not in metadata — discovered '{fieldName}' from data (N/M rows matched)`

**Why this is correct:** This follows "Carry Everything, Express Contextually." The entity identifier data IS in every `row_data` (the `sales_rep_id` values like "CRP-6007" match entity `external_id` values). The metadata just didn't label it. The engine should be resilient to metadata gaps.

**Why this is defense-in-depth, not a bypass:** Layers 1 and 2 fix the root cause (SCI classification pipeline). Layer 3 ensures the engine works even if the classification pipeline has other undiscovered gaps. This is the same principle as OB-183's existing dual-path: entity_id FK first, row_data resolution second.

**Korean Test compliance:** The fallback does NOT hardcode field names. It discovers the identifier by matching VALUES against known entities. Any column name works — `sales_rep_id`, `employee_id`, `codigo_empleado`, `직원번호`.

---

## PHASE STRUCTURE

### Phase 0: Verify DIAG-015 findings are current
```bash
cd ~/spm-platform
git stash
git checkout dev
git pull origin dev

# Verify the code locations match DIAG-015
grep -n "skipHC" web/src/app/api/import/sci/analyze/route.ts
grep -n "entityIdFieldFromMeta" web/src/app/api/calculation/run/route.ts
grep -n "writeFingerprint" web/src/app/api/import/sci/analyze/route.ts
grep -n "writeFingerprint" web/src/app/api/import/sci/execute/route.ts
```

Paste output. If line numbers differ from DIAG-015, note the actual lines.

**Commit:** `HF-181 Phase 0: DIAG-015 verification`

### Phase 1: Layer 2 — Update fingerprint after confirmation

**Why Layer 2 first:** Fixing the stored fingerprint data is prerequisite for Layer 1 to inject correct roles.

1. In `execute/route.ts`, after the existing `writeClassificationSignal` block:
   - For each content unit that has `confirmedBindings`:
   - Compute the fingerprint hash (import `computeFingerprintHashSync`)
   - Build `confirmedColumnRoles` from `confirmedBindings`
   - Build updated `classificationResult` with confirmed `fieldBindings`
   - Call `writeFingerprint()` with confirmed data

2. The write must be fire-and-forget (fingerprint update should not block execute)

**Verification:**
```bash
# After build, grep to confirm writeFingerprint is called in execute route
grep -n "writeFingerprint" web/src/app/api/import/sci/execute/route.ts
```

**Commit:** `HF-181 Phase 1: Update fingerprint after user confirmation`

### Phase 2: Layer 1 — Inject flywheel bindings into Tier 1 proposals

1. In `analyze/route.ts`, after the `skipHC` block:
   - If `flywheelResult.tier === 1 && flywheelResult.match`
   - Read `flywheelResult.classificationResult?.fieldBindings`
   - If fieldBindings exists with entries, inject them into the profile or directly into the proposal builder's input
   - Log: `[SCI-FINGERPRINT] Tier 1: injecting {N} fieldBindings from flywheel`

2. Read `buildProposalFromState()` to determine the injection point. The goal is that `generateSemanticBindings()` is bypassed when flywheel bindings are available.

**Verification:**
```bash
# After build, grep to confirm injection path exists
grep -n "fieldBindings.*flywheel\|flywheelBindings\|Tier 1.*inject" web/src/app/api/import/sci/analyze/route.ts
```

**Commit:** `HF-181 Phase 2: Inject flywheel fieldBindings into Tier 1 proposals`

### Phase 3: Layer 3 — Engine fallback for missing entity_id_field

1. In `run/route.ts`, after the `entityIdFieldFromMeta` detection loop:
   - If `entityIdFieldFromMeta` is null AND `extIdToUuid.size > 0` AND `committedData.length > 0`:
   - Sample first row's `row_data` — iterate text fields
   - For each text field, check if value exists in `extIdToUuid`
   - If found, sample 10 more rows to confirm (>80% match rate)
   - If confirmed, set `entityIdFieldFromMeta` to the discovered field name
   - Log the discovery with field name and match rate

2. This fallback runs ONLY when metadata has no `entity_id_field`. It does not override a populated field.

**Verification:**
```bash
# Write a verification script that simulates the discovery logic
cat > scripts/verify-hf181-layer3.ts << 'EOF'
// Simulate: given row_data with sales_rep_id values and entity external_ids,
// verify the discovery logic finds the correct field
const extIds = new Set(['CRP-6007', 'CRP-6008', 'CRP-6009']);
const row = { transaction_id: 'TXN-001', sales_rep_id: 'CRP-6007', total_amount: 5000 };

for (const [field, value] of Object.entries(row)) {
  if (typeof value === 'string' && extIds.has(value)) {
    console.log(`Discovered entity identifier field: ${field} (value=${value} matches entity)`);
  }
}
EOF
npx ts-node scripts/verify-hf181-layer3.ts
```

**Commit:** `HF-181 Phase 3: Engine fallback for missing entity_id_field`

### Phase 4: Build verification

```bash
cd ~/spm-platform/web
rm -rf .next
npm run build
# Must exit 0

cd ~/spm-platform
git stash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | head -20
git stash pop
```

**Commit:** `HF-181 Phase 4: Build verification`

### Phase 5: Completion report

Create `HF-181_COMPLETION_REPORT.md` in project root with:
- All commits listed
- Files created/modified
- Proof gates with PASTED evidence (Rule 27)
- Standing rule compliance

**Commit:** `HF-181 Phase 5: Completion report`

### Phase 6: PR creation

```bash
cd ~/spm-platform
gh pr create --base main --head dev \
  --title "HF-181: Fix Tier 1 flywheel entity_id_field loss (DIAG-015)" \
  --body "Three-layer fix for Tier 1 flywheel imports losing entity_id_field metadata.
  
  Layer 1: Inject flywheel fieldBindings into Tier 1 proposals (analyze/route.ts)
  Layer 2: Update fingerprint after user confirmation with confirmed roles (execute/route.ts)
  Layer 3: Engine-level fallback discovers entity identifier from data when metadata missing (run/route.ts)
  
  Root cause: DIAG-015 (commit 5336c074). Tier 1 imports skip LLM, flywheel data retrieved but never injected into proposal. Fingerprint stored pre-LLM roles.
  
  Impact: Unblocks CRP Plan 1 Jan 16-31 and all subsequent period/plan calculations."
```

---

## PROOF GATES — HARD

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | `npm run build` exits 0 | Paste exit code |
| 2 | `tsc --noEmit` exits 0 (on committed code via git stash) | Paste output |
| 3 | `npm run lint` exits 0 (on committed code via git stash) | Paste output |
| 4 | Layer 1: `grep -n "fieldBindings.*flywheel\|Tier 1.*inject\|flywheelBindings" web/src/app/api/import/sci/analyze/route.ts` returns matches | Paste grep output |
| 5 | Layer 2: `grep -n "writeFingerprint" web/src/app/api/import/sci/execute/route.ts` returns matches | Paste grep output |
| 6 | Layer 3: `grep -n "entity_id_field not in metadata\|discovered.*from data" web/src/app/api/calculation/run/route.ts` returns matches | Paste grep output |
| 7 | No hardcoded field names in Layer 3 fallback (Korean Test): `grep -n "sales_rep_id\|employee_id\|codigo" web/src/app/api/calculation/run/route.ts` returns 0 matches | Paste grep output |
| 8 | One commit per phase (minimum 6 commits) | Paste `git log --oneline -8` |

## PROOF GATES — SOFT

| # | Criterion |
|---|-----------|
| 1 | Layer 2 write is fire-and-forget (`.catch(() => {})` pattern) |
| 2 | Layer 3 fallback logs discovery with field name and match rate |
| 3 | Layer 3 requires >80% match rate across sample before accepting |
| 4 | No modifications to files outside the 3 target files |
| 5 | DIAG-015 findings file not modified |

---

## WHAT NOT TO DO

1. **DO NOT update committed_data metadata via SQL.** Standing Rule 34. The platform fixes this through the import pipeline.
2. **DO NOT hardcode `sales_rep_id` or any field name.** Korean Test. Layer 3 discovers by value matching.
3. **DO NOT remove the existing `generateSemanticBindings()` path.** It's still needed for Tier 2 and Tier 3. Layer 1 adds a Tier 1-specific bypass, not a replacement.
4. **DO NOT modify the fingerprint hash computation.** The hash is correct. The stored roles are wrong. Fix the roles, not the hash.
5. **DO NOT move `writeFingerprint` out of `analyze/route.ts`.** Keep the existing write in analyze (for initial fingerprint creation). ADD a second write in execute (for role correction after confirmation). Both calls use the same `writeFingerprint()` function.
6. **DO NOT add console.log inside any per-row loops.** Rule 20. Summary logging only.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-181_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## POST-MERGE PRODUCTION VERIFICATION (Andrew)

After merging PR and Vercel deploys:

1. **Delete the CRP structural fingerprint** to force Tier 3 re-classification on next import:
   ```sql
   -- READ ONLY verification first
   SELECT fingerprint_hash, match_count, column_roles::text
   FROM structural_fingerprints
   WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
   
   -- Then delete to force fresh classification
   DELETE FROM structural_fingerprints
   WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
   ```

2. **Reimport one CRP transaction file** (any file — Jan 16-31 is ideal):
   - Vercel logs should show: Tier 3 (novel — fingerprint was deleted)
   - After confirm + execute, check: `entity_id_field` should be `'sales_rep_id'` on the new rows
   - Fingerprint should now show `sales_rep_id: "entity_identifier"` in `column_roles`

3. **Reimport a second CRP transaction file** (a different period):
   - Vercel logs should show: Tier 1 (fingerprint match)
   - Vercel logs should show: `[SCI-FINGERPRINT] Tier 1: injecting N fieldBindings from flywheel`
   - After confirm + execute, check: `entity_id_field` should be `'sales_rep_id'`

4. **Calculate CRP Plan 1 Jan 16-31:**
   - If Layer 3 deployed: should work even WITHOUT reimport (engine discovers entity field from data)
   - Expected: 24 entities, $109,139.46
   - If total ≠ GT, check Vercel logs for entity resolution and metric derivation

5. **BCL regression:** BCL should be unaffected. BCL data has entity_id populated from pre-OB-182 imports. The OB-183 entity resolution uses entity_id FK first, row_data resolution second.

---

*"The flywheel stores what it learns. But it was storing what it guessed, not what was confirmed. Two bugs, three layers, one principle: confirmed reality overwrites initial guesses."*
