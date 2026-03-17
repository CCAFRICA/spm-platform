# HF-126: SCI Pipeline Must Create Rule Set Assignments
## The last mile between import and calculation. No SQL workarounds.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE_LIVE.md` — actual database schema
3. This prompt in its entirety

---

## CLT REGISTRY CROSS-REFERENCE

**This is the single most documented gap in the platform.** It has appeared in FIVE CLT sessions across 3 months:

| ID | Finding | Session | Status |
|----|---------|---------|--------|
| CLT111-F43 | Calc fails — no entity rule_set_assignments | CLT-111, Feb 27 | ❌ OPEN |
| CLT122-F77 | No entities assigned to plans | CLT-122, Feb 28 | ❌ OPEN |
| CLT122-F80 | Platform does not wire imports → calculable state | CLT-122, Feb 28 | ❌ OPEN — CORE GAP |
| CLT122-F82 | No entity-to-plan assignment UI | CLT-122, Feb 28 | ❌ OPEN |
| CLT142-F11 | No plan assignments created from import | CLT-142, ~Mar 4 | ❌ OPEN |
| CLT166-NEW | BCL has 0 rule_set_assignments after browser import | CLT-166, Mar 12 | ❌ OPEN |

**Pattern:** "No entity assignment mechanism" — CLT R7 Cross-CLT Patterns section. Documented as recurring across CLT111→CLT122. Now CLT-142 and CLT-166 confirm it is STILL unfixed.

**HF-125 Phase 2B documented:** The calculation engine queries `rule_set_assignments` to find entities. Zero assignments = 400 error "No entities assigned to this rule set." The import commit route (`/api/import/commit`) creates assignments. The SCI execute route (`/api/import/sci/execute`) does NOT. BCL imported through SCI execute. Therefore BCL has zero assignments.

### Findings This HF Fixes

| ID | New Status After Fix |
|----|---------------------|
| CLT111-F43 | ✅ FIXED — SCI creates assignments |
| CLT122-F77 | ✅ FIXED — SCI creates assignments |
| CLT122-F80 | 🔄 PARTIALLY — assignment gap closed, other wiring gaps may remain |
| CLT142-F11 | ✅ FIXED — SCI creates assignments |
| CLT166-NEW | ✅ FIXED — BCL assignments created |

---

## THE PROBLEM

The SCI execute route creates entities and commits data but does NOT create `rule_set_assignments`. The calculation engine requires `rule_set_assignments` to route entities to plans. Without assignments, calculation returns "No entities assigned to this rule set" (400 error).

**Current state:** BCL tenant has 85 entities (created by SCI), 170 committed_data rows (85 transaction + 85 roster), 1 active rule_set, 6 periods, and ZERO rule_set_assignments.

**Required state:** Every entity created during import must be assigned to the active rule_set for the tenant.

---

## CC EVASION WARNINGS

1. **CC will create assignments in a new standalone API route instead of fixing the SCI execute path.** The fix belongs in the SCI execute route where entities are created. If entity creation and assignment creation are in different code paths, they will desync again. One transaction, one code path.

2. **CC will create assignments for hardcoded entity types or plan names.** The assignment logic must be domain-agnostic: every entity created during import gets assigned to every active rule_set for the tenant. No filtering by entity_type, no matching by plan name.

3. **CC will report PASS based on code changes without verifying assignments exist in the database.** The proof gate is a Supabase query showing non-zero rule_set_assignments for BCL. Not code review. Not build passes.

4. **CC will add the fix but break entity resolution or convergence.** The entity resolution and convergence steps in SCI execute must remain unchanged. The assignment creation is an ADDITION after entity resolution, not a replacement.

---

## PHASE 0: DIAGNOSTIC

```bash
echo "============================================"
echo "HF-126 PHASE 0: DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: SCI EXECUTE — ENTITY CREATION ==="
echo "Find where entities are created in SCI execute"
grep -n "entity\|entities\|Entity\|INSERT\|insert\|create" \
  web/src/app/api/import/sci/execute/route.ts | head -40

echo ""
echo "=== 0B: IMPORT COMMIT — ASSIGNMENT CREATION ==="
echo "Find where assignments are created in import commit"
grep -n "rule_set_assignment\|assignment\|assign" \
  web/src/app/api/import/commit/route.ts | head -20

echo ""
echo "=== 0C: WIRE API — ASSIGNMENT CREATION ==="
grep -n "rule_set_assignment\|assignment\|assign" \
  web/src/app/api/intelligence/wire/route.ts 2>/dev/null | head -20

echo ""
echo "=== 0D: RULE_SET_ASSIGNMENTS SCHEMA ==="
echo "Verify columns from SCHEMA_REFERENCE_LIVE.md"
grep -A 20 "rule_set_assignments" SCHEMA_REFERENCE_LIVE.md | head -25

echo ""
echo "=== 0E: HOW IMPORT COMMIT CREATES ASSIGNMENTS ==="
echo "Extract the exact assignment creation code from import commit"
grep -B 5 -A 20 "rule_set_assignment" \
  web/src/app/api/import/commit/route.ts | head -40

echo ""
echo "=== 0F: BCL CURRENT STATE ==="
echo "RUN IN SUPABASE SQL EDITOR:"
echo "SELECT 'entities' as tbl, COUNT(*) FROM entities WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'"
echo "UNION ALL SELECT 'assignments', COUNT(*) FROM rule_set_assignments WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'"
echo "UNION ALL SELECT 'rule_sets', COUNT(*) FROM rule_sets WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' AND status = 'active'"
echo "UNION ALL SELECT 'committed_data', COUNT(*) FROM committed_data WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';"
```

**Document findings. Paste the assignment creation code from import commit — this is the pattern to replicate.**

**Commit:** `HF-126 Phase 0: Diagnostic — SCI assignment gap`

---

## PHASE 1: ADD ASSIGNMENT CREATION TO SCI EXECUTE

**The fix:** After the entity resolution step in the SCI execute route, add assignment creation for all newly created AND existing entities.

**Logic:**

1. After entity resolution completes (entities created/linked), query all active rule_sets for the tenant
2. For each active rule_set, for each entity that was part of this import batch:
   - Check if a rule_set_assignment already exists (tenant_id + entity_id + rule_set_id)
   - If not, INSERT into rule_set_assignments
3. Use ON CONFLICT DO NOTHING to handle duplicates safely

**Code pattern (adapt from import commit route):**

```typescript
// After entity resolution step
const { data: activeRuleSets } = await supabaseService
  .from('rule_sets')
  .select('id')
  .eq('tenant_id', tenantId)
  .eq('status', 'active');

if (activeRuleSets?.length && createdEntityIds?.length) {
  const assignments = [];
  for (const rs of activeRuleSets) {
    for (const entityId of createdEntityIds) {
      assignments.push({
        tenant_id: tenantId,
        rule_set_id: rs.id,
        entity_id: entityId,
        assignment_type: 'direct',
        metadata: {}
      });
    }
  }
  
  // Batch insert with conflict handling
  const { error: assignError } = await supabaseService
    .from('rule_set_assignments')
    .upsert(assignments, { 
      onConflict: 'tenant_id,rule_set_id,entity_id',
      ignoreDuplicates: true 
    });
    
  if (assignError) {
    console.error('[SCI Execute] Assignment creation failed:', assignError);
  } else {
    console.log(`[SCI Execute] ${assignments.length} rule_set_assignments created/verified`);
  }
}
```

**Requirements:**
- The assignment creation MUST be in the same code path as entity creation (SCI execute route)
- The assignment MUST handle duplicates (ON CONFLICT or upsert with ignoreDuplicates)
- The assignment MUST use service role client (not browser client) since this is a server-side write
- The assignment MUST log the count of assignments created
- The assignment MUST NOT hardcode rule_set_ids, entity_types, or plan names
- The assignment MUST work for any tenant with any number of active rule_sets

**Check the actual column names against SCHEMA_REFERENCE_LIVE.md before writing the INSERT.** If the table has different columns than shown above (e.g., `effective_from` instead of `effective_date`), use the correct column names. This is FP-49 (SQL Schema Fabrication prevention).

**Commit:** `HF-126 Phase 1: Auto-create rule_set_assignments in SCI execute after entity resolution`

---

## PHASE 2: CREATE ASSIGNMENTS FOR EXISTING BCL ENTITIES

The BCL tenant already has 85 entities with zero assignments. Phase 1 fixes the code path for FUTURE imports. This phase creates assignments for the EXISTING entities.

**Option A (preferred):** If the SCI execute route can be re-invoked for existing data, trigger it. This tests Phase 1's code.

**Option B:** If re-invocation is not practical, create a one-time SQL migration that creates assignments for BCL:

```typescript
// In the SCI execute route or as a separate server-side function:
// Query all entities for BCL + all active rule_sets
// Insert assignments for any entity missing one
```

**The key constraint:** This must be a code-driven fix, not a manual SQL INSERT that Andrew runs. The platform must handle this automatically. If a tenant imports data and has zero assignments, the next calculation attempt should either:
- (a) Create assignments automatically before calculating, OR
- (b) The import pipeline should have created them (Phase 1 fix)

**For BCL specifically:** After Phase 1 code is deployed, re-import one BCL file (or trigger a recalculation) to verify assignments are created. Alternatively, add a backfill step that runs once for existing entities.

**LOCALHOST VERIFICATION:**
```sql
-- After fix, verify BCL has assignments
SELECT COUNT(*) FROM rule_set_assignments
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
-- MUST be > 0. Expected: 85 (one per entity × one active rule_set)
```

**Commit:** `HF-126 Phase 2: Backfill assignments for existing BCL entities`

---

## PHASE 3: VERIFY CALCULATION PRODUCES RESULTS

**This is the proof that the entire chain works: import → entities → assignments → calculate → results.**

On localhost (if BCL auth is available) or via script:

1. Trigger a calculation for BCL tenant, October 2025 period
2. Verify results are non-zero
3. If October GT is available ($48,314), compare

**If calculation cannot be tested on localhost:**
1. Verify assignments exist (Supabase query)
2. Verify the calculation route reads assignments correctly (code trace)
3. State: "Calculation test requires production verification by Andrew"

**Proof gate:** Paste the Supabase query result showing:
- rule_set_assignments COUNT > 0
- If calculation was run: calculation_results showing non-zero payouts

**Commit:** `HF-126 Phase 3: Verify calculation data path complete`

---

## PHASE 4: COMPLETION REPORT

Create `HF-126_COMPLETION_REPORT.md`:

```markdown
# HF-126 Completion Report — SCI Auto-Assignment

## Phase 0: Diagnostic
- SCI execute entity creation location: [file:line]
- Import commit assignment creation location: [file:line]
- Pattern extracted from import commit: [describe]
- BCL state: [entity count, assignment count, rule_set count]

## Phase 1: Assignment Creation Added
- Code location: [file:line where assignments are now created]
- Trigger: [after entity resolution / after convergence / other]
- Conflict handling: [upsert / ON CONFLICT DO NOTHING / other]
- Log message: [paste the log format]

## Phase 2: BCL Backfill
- Method: [re-import / backfill function / migration]
- BCL assignments after backfill: [paste query result]

## Phase 3: Calculation Verification
- Assignments exist: [paste COUNT query]
- Calculation result: [non-zero / $0 / not testable]

## CLT Registry Updates
| Finding | Previous | New | Evidence |
|---------|----------|-----|----------|
| CLT111-F43 | OPEN | [status] | [evidence] |
| CLT122-F77 | OPEN | [status] | [evidence] |
| CLT122-F80 | OPEN | [status] | [evidence] |
| CLT142-F11 | OPEN | [status] | [evidence] |

## Regression
- Meridian calculation: [unaffected / verified]
- Entity resolution: [unchanged / verified]
- Convergence: [unchanged / verified]

## Build
[Paste last 10 lines of npm run build]
```

**Commit:** `HF-126 Phase 4: Completion report`

---

## PHASE 5: PR

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "HF-126: SCI Auto-Assignment — Create rule_set_assignments on entity resolution" \
  --body "## The Gap (5 CLT sessions, 3 months)
SCI execute creates entities but not rule_set_assignments. Calculation requires assignments. Every tenant that imports through SCI and tries to calculate hits 'No entities assigned.'

## The Fix
After entity resolution in SCI execute, auto-create rule_set_assignments for all entities × active rule_sets. Upsert with conflict handling. Backfill for existing BCL entities.

## CLT Findings Resolved
- CLT111-F43, CLT122-F77, CLT122-F80, CLT142-F11

## Evidence
See HF-126_COMPLETION_REPORT.md"
```

---

## REGRESSION — DO NOT BREAK

- Meridian calculation: MX$185,063 must still work
- BCL entity resolution: 85 entities must remain linked
- BCL convergence bindings: 4 component bindings must remain
- Existing rule_set_assignments for other tenants: unchanged
- SCI classification: unchanged
- SCI convergence: unchanged

---

*"The SCI pipeline classifies content, creates entities, and commits data. It then stops. The calculation engine requires one more step: assignments. This HF adds that step. Five CLT sessions. Three months. One INSERT."*
