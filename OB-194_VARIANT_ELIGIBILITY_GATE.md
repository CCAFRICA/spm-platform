# OB-194: VARIANT ELIGIBILITY GATE — EXCLUDE NON-QUALIFYING ENTITIES
## Type: OB (Operational Build)
## Date: March 29, 2026
## Vertical Slice: Engine (variant exclusion) + Experience (exclusion visibility in Calculate + Reconciliation)

**AUTONOMY DIRECTIVE: NEVER ask yes/no. NEVER say "shall I". Just act.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. This prompt — read completely before writing any code

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev --title "OB-194: Variant eligibility gate — exclude non-qualifying entities" --body "..."`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### Rule 51v2 (Build Verification)
After `git stash`: `npx tsc --noEmit` AND `npx next lint`. Use `git show HEAD:filepath | grep` to verify committed state.

### Rule 44 (Mandatory Localhost Proof for UI Fixes)
This OB changes calculation behavior and UI. Before PR creation, you MUST complete Phase 4 (localhost proof).

---

## CONTEXT — WHY THIS OB EXISTS

### CRP Reconciliation: 23/23 Exact but NOT 100%

After HF-179 (header parsing), OB-193 (period normalization), and HF-180 (selected period filtering), the reconciliation shows:

```
Match rate: 71.9% (23 exact, 0 tolerance, 0 amber, 0 red)
VL=$73,672.40, Benchmark=$73,142.72, Delta=$529.68
Entity matching: 23 matched, 8 VL-only, 1 file-only
```

Every matched entity has delta = $0.00. The engine calculation is perfect. But there are 8 VL-only entities (7 DMs/RVPs + 1 other) that the engine calculated at $150 each. These entities should NOT have been calculated for this plan.

### Root Cause — TWO LAYERS (from actual code review)

**Layer 1: SCI Execute assigns every entity to every plan.**

From `web/src/app/api/import/sci/execute/route.ts`:
```typescript
for (const rs of activeRuleSets) {
    for (const entityId of allEntityIds) {
        if (!assignedSet.has(`${entityId}:${rs.id}`)) {
            newAssignments.push({...});
        }
    }
}
```
Every entity × every active plan = assignment. No role/variant filtering. 31 entities × 4 plans = 124 assignments, even though Plan 1 only applies to Reps and Senior Reps.

**Layer 2: The engine calculates entities that match NO variant by falling back to the last variant.**

From the calculation engine's variant routing (in AUD-001 code extraction):
```typescript
if (discScores[0].matches > (discScores[1]?.matches ?? 0)) {
    selectedVariantIndex = discScores[0].index;
    method = 'discriminant_token';
} else {
    // ... total overlap attempt ...
    // Still tied — default to last variant
    selectedVariantIndex = variants.length - 1;
    method = 'default_last';
}
```
A District Manager has role tokens ["district", "manager"]. Plan 1 variants have discriminants ["senior"] and ["rep"]. Score: V0=0, V1=0. Tied → default to last variant → DM gets calculated at Rep rates → $150 (intercept only, because their revenue is for districts not personal equipment sales).

### What The Architecture Already Says

From the Calculation Flow Architecture: `"An entity matching NO variant is an explicit error, not a silent zero."` The architecture defines this behavior but the implementation does the opposite — it silently falls back.

### Platform Principle

Standing Rule 34: no bypass recommendations. We are not going to SQL-delete assignments. The platform must handle this automatically. When a plan has variants with specific eligibility criteria, entities that match none of those variants should be excluded from the calculation — not silently calculated with a default variant.

---

## ARCHITECTURE DECISION GATE

### Problem
Entities that don't match any variant in a plan are currently calculated using a fallback variant. This produces incorrect payouts and inflates population counts.

### Options Considered

**Option A: Fix at assignment time (SCI Execute)**
- During assignment, check if the entity's role/attributes match at least one variant in the plan
- Only create assignments for entities with qualifying variants
- Pro: Prevents the problem upstream — no assignment = no calculation
- Con: At import time, entity metadata (role) may not be fully resolved yet. Plans may be imported after entities. Assignment would need to be re-evaluated when plans or entities change.

**Option B: Fix at calculation time (engine variant routing)**
- During calculation, when an entity matches NO variant with a score above a threshold, exclude it from results instead of falling back
- Record the exclusion in the calculation batch metadata (entity X excluded: no qualifying variant)
- Pro: Works regardless of assignment state. Self-correcting on every calculation run. Uses the most current entity attributes (via materializedState).
- Con: Entities still appear in assignments (cosmetic, not functional).

**Option C: Fix at both layers**
- Assignment intelligence + calculation exclusion
- Pro: Clean end-to-end
- Con: Significantly larger scope. Assignment intelligence needs its own design — entity attributes may not be available at import time.

### Decision: Option B — Fix at Calculation Time

The engine already has all the information it needs: the plan's variant eligibility criteria (from AI interpretation) and the entity's resolved attributes (from materializedState). When the variant routing score is 0 for ALL variants (no discriminant match AND no total overlap), the entity is not eligible for this plan. The engine should:

1. Exclude the entity from calculation results
2. Record the exclusion in the batch metadata with a reason
3. Surface exclusions in the Calculate page and Reconciliation results

This is the minimum viable fix that works for ALL tenants, ALL plans, immediately upon recalculation. Assignment cleanup (Option A) is a future enhancement — the engine-level gate means incorrect assignments are harmless.

**Why not just "fix assignments":** Because assignments are created at import time when entity attributes may be incomplete. The engine calculates at a later point when all data is resolved. The engine is the right place to make the eligibility decision because it has the fullest context.

---

## PHASE 1: ENGINE — VARIANT ELIGIBILITY GATE

**File:** The calculation engine file that contains variant routing (the one with `discScores`, `selectedVariantIndex`, `method = 'default_last'`).

### Step 0: Find the Exact File

```bash
echo "=== FIND VARIANT ROUTING CODE ==="
grep -rn "default_last\|discScores\|selectedVariantIndex\|variantDiscriminants" web/src/lib/ web/src/app/api/ --include="*.ts" | head -20
```

Paste the output. This tells us the exact file and line numbers.

### Step 1: Understand Current Behavior

Before making any changes, trace the current logic:

```bash
echo "=== CURRENT VARIANT ROUTING BLOCK ==="
# Get the file from Step 0, then extract the variant routing block
grep -n -B 5 -A 50 "Score by discriminant" <FILE_FROM_STEP_0> | head -80
```

Paste the output. We need to see the full block from discriminant scoring through `selectedComponents = ...`.

### Step 2: Add Eligibility Gate

After the variant routing scoring block (where `method` is determined), add an eligibility gate. The logic:

**When a plan has 2+ variants (i.e., the plan explicitly defines variant populations), AND the entity's best discriminant score is 0, AND the total overlap score is also 0 → the entity does not qualify for this plan.**

```typescript
// OB-194: Variant Eligibility Gate
// When a plan defines multiple variants (explicit population segments),
// entities matching NO variant are excluded from calculation.
// Architecture: "An entity matching NO variant is an explicit error, not a silent zero."
if (variants.length > 1 && method === 'default_last') {
  // Check if ANY scoring method produced a match above zero
  const bestDiscScore = discScores[0]?.matches ?? 0;
  const bestOverlap = variantTokenSets.reduce((best, tokens) => {
    const overlap = Array.from(tokens).filter(t => entityTokens.has(t)).length;
    return Math.max(best, overlap);
  }, 0);
  
  if (bestDiscScore === 0 && bestOverlap === 0) {
    // Entity matches no variant — exclude from calculation
    const entityName = entityInfo?.display_name ?? entityId;
    console.log(`[VARIANT] ${entityName}: NO MATCH — excluded (disc=0, overlap=0, variants=${variants.length})`);
    
    // Record exclusion instead of calculating
    entityResults.push({
      entityId,
      entityName: entityInfo?.display_name ?? '',
      externalId: entityInfo?.external_id ?? entityId,
      storeId: entityStoreId !== undefined ? String(entityStoreId) : undefined,
      totalIncentive: 0,
      components: [],
      metadata: {
        excluded: true,
        exclusionReason: 'no_qualifying_variant',
        variantCount: variants.length,
        entityTokens: Array.from(entityTokens).slice(0, 10), // first 10 for diagnostics
      },
    } as unknown as CalculationResult);
    continue; // Skip to next entity — do NOT calculate
  }
}
```

**IMPORTANT NOTES:**
- The `continue` statement skips the rest of the entity's calculation loop. Verify this is inside a `for` loop over `calculationEntityIds`.
- The exclusion result has `totalIncentive: 0` and `excluded: true` in metadata. This allows downstream consumers (Calculate page, Reconciliation) to distinguish "excluded because no variant" from "calculated and got $0."
- The `entityTokens` slice in metadata is for diagnostics — helps trace WHY the entity didn't match.
- This ONLY triggers when `method === 'default_last'` — meaning the scoring produced no winner. If ANY variant has a non-zero discriminant or overlap match, the entity is still calculated normally.

### Step 3: Update Batch Summary

After all entities are calculated, the batch metadata should include exclusion count:

```typescript
// OB-194: Count excluded entities
const excludedEntities = entityResults.filter(r => 
  (r as unknown as { metadata?: { excluded?: boolean } }).metadata?.excluded === true
);
const calculatedEntities = entityResults.filter(r => 
  !(r as unknown as { metadata?: { excluded?: boolean } }).metadata?.excluded
);
```

Log the exclusion count:
```typescript
console.log(`[CalcEngine] Batch complete: ${calculatedEntities.length} calculated, ${excludedEntities.length} excluded (no qualifying variant), total=$${calculatedEntities.reduce((s, r) => s + r.totalIncentive, 0).toFixed(2)}`);
```

### Step 4: Ensure Excluded Entities Are NOT Written to calculation_results

Find where `entityResults` are written to the `calculation_results` table. Excluded entities (where `metadata.excluded === true`) should NOT be inserted. They should either be:
- Filtered out before the insert, OR
- Written to a separate `calculation_exclusions` table (if one exists), OR
- Omitted entirely (simplest)

The simplest approach: filter them out before the batch insert:

```typescript
const resultsToStore = entityResults.filter(r => 
  !(r as unknown as { metadata?: { excluded?: boolean } }).metadata?.excluded
);
// Use resultsToStore instead of entityResults for the INSERT
```

And update the batch `entity_count` and `total_payout` to reflect only calculated entities:

```typescript
// Update batch with calculated-only counts
const batchTotal = resultsToStore.reduce((s, r) => s + r.totalIncentive, 0);
const batchEntityCount = resultsToStore.length;
```

**Commit after Phase 1.** Message: `"OB-194 Phase 1: Variant eligibility gate — exclude entities matching no variant"`

---

## PHASE 2: EXPERIENCE — CALCULATE PAGE EXCLUSION VISIBILITY

**File:** `web/src/app/operate/calculate/page.tsx` (or the calculate results display component)

### Step 0: Find the Calculate Results Display

```bash
echo "=== CALCULATE RESULTS DISPLAY ==="
grep -rn "entity_count\|entityCount\|total_payout\|totalPayout\|calculated\|PREVIEW" web/src/app/operate/calculate/ --include="*.tsx" | head -20
```

### Step 1: Show Exclusion Count

After a calculation runs, if entities were excluded, the Calculate page should show this information. Find where the batch summary displays entity count and total payout. Add an exclusion indicator:

The batch metadata (stored in `calculation_batches.metadata`) should now contain the exclusion count from Phase 1. Display it:

```
31 entities · $73,142.72 · PREVIEW
↳ 7 entities excluded (no qualifying variant)
```

This is a small text line below the main summary. It tells the admin what happened and why the entity count is 24 instead of 31.

### Step 2: Diagnostic — Log Excluded Entity Details

When the admin clicks "Calculate" and the engine runs, the Vercel logs should show which entities were excluded and why. This is already handled by the `console.log` in Phase 1. No additional UI work needed for this — the DIAG logs are the proof.

**Commit after Phase 2.** Message: `"OB-194 Phase 2: Calculate page exclusion visibility"`

---

## PHASE 3: EXPERIENCE — RECONCILIATION EXCLUSION CONTEXT

**File:** `web/src/app/operate/reconciliation/page.tsx`

### What Changes

After OB-194, when the admin recalculates Plan 1, the engine produces 24 results (not 31). The reconciliation will then compare:
- 23 matched entities (24 VL minus CRP-6038 which is file-only) — all exact match
- 0 VL-only (previously 8 — now those 7 DMs/RVPs are excluded from calculation, so they don't appear in VL results)
- 1 file-only (CRP-6038)

The VL-only panel should be empty or gone. The match rate should be 23/24 = 95.8% (or 23/23 = 100% if CRP-6038 is excluded from the denominator as file-only).

### What To Verify

No code changes may be needed in this phase — the reconciliation already handles the case where VL has fewer entities than before. But verify:

1. The VL-only panel shows 0 entities (or doesn't render at all)
2. The match rate reflects the new population
3. The benchmark total still equals $73,142.72
4. Tyler Morrison still shows delta = $0.00

If any of these fail, diagnose and fix. If all pass, document as "Phase 3: Verified — no code changes needed."

**Commit after Phase 3 (if changes needed).** Message: `"OB-194 Phase 3: Reconciliation exclusion context"`

---

## PHASE 4: LOCALHOST VERIFICATION (MANDATORY — Rule 44)

### Step 1: Recalculate CRP Plan 1 Jan 1-15

1. Navigate to `localhost:3000/operate/calculate`
2. Select CRP tenant, Capital Equipment Commission Plan, January 1-15 period
3. Click Calculate
4. Check console output for:
   - `[VARIANT] <name>: NO MATCH — excluded (disc=0, overlap=0, variants=2)` for each DM/RVP
   - `[CalcEngine] Batch complete: 24 calculated, 7 excluded`
   - Total should be close to $73,142.72

### Step 2: Verify Calculate Page

1. Plan card shows 24 entities (not 31)
2. Total shows $73,142.72 (not $73,672.40)
3. Exclusion indicator visible: "7 entities excluded (no qualifying variant)"

### Step 3: Run Reconciliation

1. Navigate to Reconciliation
2. Select Capital Equipment Commission Plan, January 1-15
3. Upload CRP_Resultados_Esperados.xlsx
4. Analyze → Run Reconciliation
5. Check results:
   - Match rate: near 100% for matched entities
   - VL total: $73,142.72
   - Benchmark total: $73,142.72
   - Delta: $0.00 (or very close)
   - Tyler Morrison: VL $10,971.62, Benchmark $10,971.62, Delta $0.00
   - VL-only: 0 entities (or 1 if there's a legitimate VL entity not in the GT file)
   - File-only: 1 (CRP-6038)

### Step 4: Verify BCL Is Not Affected

**CRITICAL: This change must not break BCL or Meridian.**

BCL has a single variant (or variants where all entities match). The eligibility gate only triggers when `variants.length > 1 AND method === 'default_last' AND bestDiscScore === 0 AND bestOverlap === 0`. If BCL entities match their variant, this gate never fires.

```bash
echo "=== BCL VARIANT CHECK ==="
# Check how many variants BCL's plan has
# This is a diagnostic, not a test — just verify the gate won't trigger
```

If BCL has 1 variant, the gate cannot trigger (`variants.length > 1` is false).
If BCL has 2+ variants, verify that BCL entities have role tokens that match at least one variant.

### Step 5: Paste Evidence

Paste ALL console output and UI descriptions into the completion report.

**Commit after Phase 4.** Message: `"OB-194 Phase 4: Localhost verification — CRP recalculation + reconciliation proof"`

---

## ANTI-PATTERN REGISTRY CHECK

| # | Anti-Pattern | Check |
|---|-------------|-------|
| AP-25 | Korean Test | Variant matching uses structural token overlap, not hardcoded role names. The eligibility gate checks scores, not role strings. |
| FP-116 | Variable propagation | No re-parse. Single code path through variant routing. |
| FP-117 | Algorithmic polish masking structural bug | The fix changes behavior (exclude vs. fallback), not algorithm quality. |
| Standing Rule 34 | No bypass | This is not SQL cleanup. This is a platform-level engine behavior change. |
| Vertical Slice | Engine + Experience | Phase 1 (engine) + Phase 2 (Calculate page) + Phase 3 (Reconciliation verification) in one PR. |

---

## WHAT NOT TO DO

1. **Do NOT modify SCI Execute assignment logic.** The all-entities-to-all-plans assignment stays as-is for now. The engine-level gate makes incorrect assignments harmless.
2. **Do NOT hardcode role names** like "District Manager" or "Regional VP". The gate uses the existing token overlap scoring — if the score is 0 across all variants, the entity is excluded. This is structural, not name-based.
3. **Do NOT change variant routing for single-variant plans.** The gate only fires when `variants.length > 1`. Single-variant plans (or plans where all entities match) are unaffected.
4. **Do NOT delete or modify existing calculation results.** The fix takes effect on the NEXT calculation. Previous results remain. The admin recalculates to get the corrected results.
5. **Do NOT change BCL or Meridian behavior.** Verify they are unaffected in Phase 4.

---

## PROOF GATES — HARD (must ALL pass)

| # | Gate | Evidence Required |
|---|------|-------------------|
| H1 | Console shows `NO MATCH — excluded` for 7 DMs/RVPs | Paste the VARIANT log lines |
| H2 | Console shows `Batch complete: 24 calculated, 7 excluded` | Paste the batch summary line |
| H3 | Calculation total = ~$73,142.72 (not $73,672.40) | Paste the total from batch summary or Calculate page |
| H4 | Reconciliation match rate near 100% for matched entities | Paste match rate from reconciliation results |
| H5 | Tyler Morrison: VL = Benchmark = $10,971.62, Delta = $0.00 | Paste from reconciliation DIAG logs |
| H6 | VL-only entities = 0 or 1 (not 8) | Paste from reconciliation entity matching line |
| H7 | BCL is NOT affected (verify variant count or run quick calc) | Paste evidence BCL variant gate doesn't trigger |
| H8 | Rule 51v2: `npx tsc --noEmit` = 0, `npx next lint` = 0 after `git stash` | Paste output |

## PROOF GATES — SOFT (should pass, document if not)

| # | Gate | Evidence Required |
|---|------|-------------------|
| S1 | Calculate page shows exclusion count | Describe what the page shows after recalculation |
| S2 | Reconciliation benchmark total = $73,142.72 | Paste from DIAG logs |
| S3 | Reconciliation delta = $0.00 or near-zero | Paste from DIAG logs |
| S4 | Excluded entity metadata contains `exclusionReason` and `entityTokens` | Paste a sample from console |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-194_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## FINAL STEP

```bash
gh pr create --base main --head dev \
  --title "OB-194: Variant eligibility gate — exclude non-qualifying entities" \
  --body "Platform fix: entities matching NO variant in a multi-variant plan are now excluded from calculation instead of silently falling back to the last variant.

Root cause: SCI Execute assigns all entities to all plans. The engine's variant routing uses token overlap scoring. When an entity (e.g., District Manager) matches no variant (e.g., Senior Rep / Rep), the previous behavior fell back to the last variant and calculated a meaningless result.

Fix: When variants.length > 1 AND discriminant score = 0 AND total overlap = 0, the entity is excluded from calculation with metadata { excluded: true, exclusionReason: 'no_qualifying_variant' }. Excluded entities are not written to calculation_results.

Impact: CRP Plan 1 Jan 1-15 goes from 31 entities ($73,672.40) to 24 entities ($73,142.72). The $529.68 gap disappears. Reconciliation match rate goes from 71.9% to near 100%.

Safety: Gate only triggers for multi-variant plans where entity matches NO variant. Single-variant plans, plans where entities match at least one variant, and existing tenants (BCL, Meridian) are unaffected.

Proof: BCL verification included. Recalculate CRP → reconcile → 100% accuracy."
```

---

## WHAT SUCCESS LOOKS LIKE

After this OB deploys and the admin recalculates CRP Plan 1 Jan 1-15:

1. Engine processes 31 assigned entities
2. 24 entities match a variant (Senior Rep or Rep) → calculated normally
3. 7 entities match no variant (DMs, RVPs) → excluded with clear reason
4. Batch total: $73,142.72 = GT exactly
5. Reconciliation: 23 matched, all exact, delta $0.00
6. Match rate: 100% for comparable entities
7. The admin sees "7 entities excluded (no qualifying variant)" — transparency, not mystery

**The engine was already right. Now the platform knows which entities should be in scope.**

---

*"An entity matching NO variant is an explicit error, not a silent zero." — Calculation Flow Architecture*
*Today we enforce what the architecture already defined.*
