# HF-189: Self-Healing Assignment Gap — Missing Entities Get Assigned at Calc Time

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit and push after each phase.

---

## CC STANDING ARCHITECTURE RULES (MANDATORY)

### SECTION A: DESIGN PRINCIPLES
1. **AI-First, Never Hardcoded** — Korean Test applies.
2. **Scale by Design** — Works at 10x current volume.
3. **Fix Logic, Not Data** — Structural fix, not SQL patch.
4. **Domain-Agnostic Always** — Entity-to-rule-set assignment is structural.

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
- **Rule 48:** This is a numbered item (HF-189) with its own completion report.
- **Rule 51v2:** `npx tsc --noEmit` AND `npx next lint` run after `git stash` on committed code only.

---

## PROBLEM STATEMENT

`HF-126` creates `rule_set_assignments` at **plan import time** for all entities that exist at that moment. If a tenant imports plan PDFs before their full roster is processed, entities created afterward are never assigned to existing rule sets.

CRP tenant: Plan 4 (District Override) was imported when only 24 entities existed (from quota file). The roster was imported afterward, creating 8 additional entities (6 managers, 2 ops). These 8 entities were never assigned to Plan 4. Result: Plan 4 calculates 0 entities because the 6 managers it needs have no assignments.

**This violates Decision 152 (import sequence independence).** The calculation result should be the same regardless of whether plans or rosters are imported first.

### Current self-healing code (HF-126):

```typescript
if (entityIds.length === 0) {
  // Zero assignments found — auto-create from all entities
  const allEntities = [...]; // fetch all tenant entities
  // insert assignments for all
  entityIds = allEntities;
}
```

This only fires when there are ZERO assignments. Plan 4 has 24 assignments (the 24 sales reps), so self-healing doesn't trigger. The 8 missing entities are invisible.

### The fix:

After fetching assignments AND all entities (for population filter), compare. If any tenant entities are unassigned for this rule set, create the missing assignments. This broadens HF-126 from "zero → assign all" to "missing → assign missing."

---

## PHASE 0: DIAGNOSTIC — READ ACTUAL CODE

### 0A: Find the HF-126 self-healing block
```bash
grep -n -B 3 -A 25 'HF-126\|Zero assignments\|auto-creat' web/src/app/api/calculation/run/route.ts | head -40
```
Paste output. Identify:
- The `if (entityIds.length === 0)` check
- The entity fetch within that block
- The assignment insert

### 0B: Find where all entities are fetched (for population filter)
```bash
grep -n -B 2 -A 5 'entities.*select.*id.*external\|entity_id.*display' web/src/app/api/calculation/run/route.ts | head -20
```
Paste output. There should already be a fetch of all tenant entities later in the route — the population filter uses this.

### 0C: Check if there's a UNIQUE constraint on rule_set_assignments
```bash
grep -n 'rule_set_assignments' /mnt/project/SCHEMA_REFERENCE_LIVE.md
```
Also run in Supabase:
```sql
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'rule_set_assignments';
```
We need to know if inserting a duplicate (entity_id + rule_set_id) would fail or silently succeed.

**DO NOT proceed until all reads are pasted with evidence.**

**Commit:** `git add -A && git commit -m "HF-189 Phase 0: Diagnostic — assignment gap code read" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: Entities created after plan import are never assigned to existing
rule sets. The HF-126 self-healing only fires when zero assignments exist.

Option A: Broaden HF-126 self-healing in the calculation route
  - After fetching assignments, compare against ALL tenant entities
  - If any entities are unassigned, create the missing assignments
  - Scale test: YES — one additional query (entity count), bulk insert
  - AI-first: YES — no field names
  - Decision 152: YES — fixes import sequence dependency
  - PRO: Minimal change — same file, same mechanism
  - PRO: Self-heals at calc time — no separate migration needed

Option B: Create assignments in the entity pipeline (at entity creation time)
  - When processEntityUnit creates new entities, also create assignments
    to all existing active rule sets
  - Scale test: YES
  - PRO: Fixes the problem at the source
  - CON: Creates import sequence dependency in the OTHER direction —
    entity pipeline must know about rule sets
  - CON: Larger change across multiple files

Option C: Create a separate assignment reconciliation job
  - Periodic job that ensures all entities are assigned to all rule sets
  - CON: Adds infrastructure (cron, job scheduling)
  - CON: Stale assignments until next job run

CHOSEN: Option A — broadens the existing self-healing with minimal change.
The calculation route already fetches both assignments and entities.
The comparison is O(n) with a Set lookup. The insert is bulk (existing pattern).
No new files, no new infrastructure.

REJECTED: Option B — creates reverse dependency (entity pipeline → rule sets)
REJECTED: Option C — over-engineered for a gap-fill
```

**Commit:** `git add -A && git commit -m "HF-189 Phase 1: Architecture decision — broaden HF-126 self-healing" && git push origin dev`

---

## PHASE 2: IMPLEMENTATION

### File: `web/src/app/api/calculation/run/route.ts`

### The change:

The current HF-126 block looks like:

```typescript
// HF-126: Self-healing — if zero assignments, auto-create from all entities
if (entityIds.length === 0) {
  addLog('Zero assignments found — auto-creating from tenant entities');
  // ... fetch all entities, create assignments ...
}
```

Replace with a broader check that handles BOTH zero AND partial assignments:

```typescript
// HF-126 + HF-189: Self-healing — ensure ALL tenant entities are assigned
// HF-126 original: fires when zero assignments exist
// HF-189 expansion: also fires when some entities are missing (import timing gap)
{
  // Fetch all tenant entity IDs
  const allTenantEntityIds: string[] = [];
  let entPage = 0;
  while (true) {
    const { data: ep } = await supabase
      .from('entities')
      .select('id')
      .eq('tenant_id', tenantId)
      .range(entPage * PAGE_SIZE, (entPage + 1) * PAGE_SIZE - 1);
    if (!ep || ep.length === 0) break;
    allTenantEntityIds.push(...ep.map(e => e.id));
    if (ep.length < PAGE_SIZE) break;
    entPage++;
  }

  // Find entities not yet assigned to this rule set
  const assignedSet = new Set(entityIds);
  const missingEntityIds = allTenantEntityIds.filter(id => !assignedSet.has(id));

  if (missingEntityIds.length > 0) {
    const INSERT_BATCH = 5000;
    const newAssignments = missingEntityIds.map(eid => ({
      tenant_id: tenantId,
      rule_set_id: ruleSetId,
      entity_id: eid,
      assignment_type: 'direct',
      metadata: {},
    }));
    for (let i = 0; i < newAssignments.length; i += INSERT_BATCH) {
      const slice = newAssignments.slice(i, i + INSERT_BATCH);
      await supabase.from('rule_set_assignments').insert(slice);
    }
    entityIds = [...entityIds, ...missingEntityIds];
    addLog(`HF-189: Assigned ${missingEntityIds.length} missing entities to rule set (import timing gap)`);
  } else if (entityIds.length === 0 && allTenantEntityIds.length > 0) {
    // Original HF-126 case — zero assignments, all entities
    entityIds = allTenantEntityIds;
    addLog(`HF-126: Auto-created ${allTenantEntityIds.length} assignments (zero existed)`);
  }
}
```

**Key implementation notes:**

1. The `allTenantEntityIds` fetch uses the SAME pagination pattern already in the HF-126 block. Not new code — same pattern, moved up to run unconditionally.

2. The `assignedSet` comparison is O(n) Set lookup — works at 10x scale.

3. The `INSERT_BATCH = 5000` is the same batch size used in the existing HF-126 block.

4. The `entityIds` array is expanded to include the newly assigned entities. This means the rest of the calculation route processes ALL entities, including the previously missing ones.

5. If there's a UNIQUE constraint on `(tenant_id, rule_set_id, entity_id)`, the insert might fail for duplicates. If so, use `upsert` with `onConflict` instead of `insert`. **Phase 0C determines this.**

6. The log message distinguishes HF-189 (partial gap-fill) from HF-126 (zero-to-all) for observability.

### What NOT to change:
- `processEntityUnit` — NO changes
- `resolveEntitiesFromCommittedData` — NO changes
- SCI execute route — NO changes
- The rest of the calculation route — NO changes

---

## PHASE 3: BUILD VERIFICATION

1. `git stash` (stash any uncommitted work)
2. `npx tsc --noEmit` — must pass with zero errors
3. `npx next lint` — must pass
4. `git stash pop`
5. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev`
6. Confirm localhost:3000 responds

**Commit:** `git add -A && git commit -m "HF-189 Phase 3: Build verification" && git push origin dev`

---

## PROOF GATES — HARD

| # | Criterion | How to verify |
|---|-----------|---------------|
| G1 | Missing entity detection compares assignment set against all tenant entities | `grep -A 10 'missingEntityIds\|assignedSet' web/src/app/api/calculation/run/route.ts` — paste output |
| G2 | Missing assignments are bulk inserted | `grep -A 5 'HF-189.*insert\|missingEntityIds.*insert\|newAssignments' web/src/app/api/calculation/run/route.ts` — paste output |
| G3 | entityIds array includes newly assigned entities | `grep -A 2 'entityIds.*missing\|entityIds.*push.*missing' web/src/app/api/calculation/run/route.ts` — paste output |
| G4 | Log message identifies HF-189 gap-fill | `grep 'HF-189' web/src/app/api/calculation/run/route.ts` — paste output |
| G5 | `npx tsc --noEmit` passes | Paste exit code |
| G6 | `npx next lint` passes | Paste exit code |
| G7 | `npm run build` succeeds | Paste exit code |

## PROOF GATES — SOFT

| # | Criterion | How to verify |
|---|-----------|---------------|
| S1 | Only route.ts modified | `git diff --name-only` — paste output |
| S2 | No changes to SCI execute or entity pipeline | Same |
| S3 | Korean Test: no hardcoded entity IDs or field names | Zero domain-specific strings in HF-189 code |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-189_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## FINAL STEP

```bash
gh pr create --base main --head dev --title "HF-189: Self-healing assignment gap — missing entities assigned at calc time" --body "Broadens HF-126 self-healing from 'zero assignments → assign all' to 'missing assignments → assign missing.' Fixes import timing gap where entities created after plan import are never assigned to existing rule sets. CRP tenant: 6 management entities existed but had no Plan 4 assignments because plans were imported before roster. Decision 152 compliance: calculation results are now independent of import order. One code block expansion in route.ts."
```
