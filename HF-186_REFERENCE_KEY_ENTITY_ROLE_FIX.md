# HF-186: Fix `inferRoleForAgent` — reference_key Must Not Map to entity_identifier for Entity Agent

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit and push after each phase.

---

## CC STANDING ARCHITECTURE RULES (MANDATORY)

### SECTION A: DESIGN PRINCIPLES
1. **AI-First, Never Hardcoded** — NEVER hardcode field names, column patterns, or language-specific strings. Korean Test applies.
2. **Scale by Design** — Every decision works at 10x current volume.
3. **Fix Logic, Not Data** — Never provide answer values. Fix the logic.
4. **Domain-Agnostic Always** — Platform works across any domain.

### SECTION B: ARCHITECTURE DECISION GATE — Required before implementation.
### SECTION C: ANTI-PATTERN REGISTRY — Check before every code change.

### CC OPERATIONAL RULES
- After EVERY commit: `git push origin dev`
- After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
- Final step: `gh pr create --base main --head dev` with descriptive title and body
- Git from repo root (`spm-platform`), NOT `web/`

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### ADDITIONAL STANDING RULES
- **Rule 36:** No unauthorized behavioral changes. Scope is exactly what this prompt specifies.
- **Rule 48:** This is a numbered item (HF-186) with its own completion report.
- **Rule 49 (SQL Verification Gate):** If any SQL is written, query live table schema first.
- **Rule 51v2:** `npx tsc --noEmit` AND `npx next lint` run after `git stash` on committed code only.

---

## PROBLEM STATEMENT

The function `inferRoleForAgent` in `web/src/lib/sci/negotiation.ts` maps HC `reference_key` to semantic role `entity_identifier` **unconditionally** — before the agent-specific switch statement. This is correct for target/transaction agents (where a `reference_key` like `sales_rep_id` IS the entity identifier linking transaction data to an entity). But it is **wrong for the entity agent**, where `reference_key` indicates a hierarchical reference to ANOTHER entity (e.g., `reports_to` on a roster points to a manager, not the row's own identifier).

### Impact

On a roster with columns `employee_id:identifier` and `reports_to:reference_key`:
1. `inferRoleForAgent` maps BOTH to `entity_identifier`
2. Flywheel stores these bindings
3. On Tier 1 reimport, the flywheel injects both as `entity_identifier`
4. `processEntityUnit` calls `confirmedBindings.find(b => b.semanticRole === 'entity_identifier')` — picks whichever is first
5. If `reports_to` wins (JSON roundtrip through flywheel doesn't guarantee array order), only 7 unique manager values → 7 entities created instead of 32
6. Population collapses from 24 calculated entities to 5 → $950 instead of $73,142.72

This caused a **regression** in CRP Plan 1, which was previously proven at $73,142.72 (24/24 exact match).

### Root Cause Code (CURRENT — WRONG)

```typescript
function inferRoleForAgent(
  field: FieldProfile,
  agent: AgentType,
  hcRole?: ColumnRole,
): { role: SemanticBinding['semanticRole']; context: string; confidence: number } {
  // HC identifier or structural sequential integer → entity_identifier
  if (hcRole === 'identifier' || (field.dataType === 'integer' && !!field.distribution.isSequential)) {
    return { role: 'entity_identifier', context: `${field.fieldName} — links to entity`, confidence: 0.90 };
  }

  // HC reference_key → entity_identifier (for reference tables)
  // ❌ BUG: This runs for ALL agents, including entity agent
  if (hcRole === 'reference_key') {
    return { role: 'entity_identifier', context: `${field.fieldName} — reference key`, confidence: 0.90 };
  }

  switch (agent) {
    case 'entity':
      // ... agent-specific roles
  }
}
```

---

## PHASE 0: DIAGNOSTIC — READ ACTUAL CODE

1. Open `web/src/lib/sci/negotiation.ts`
2. Find `inferRoleForAgent` function
3. Confirm the `reference_key → entity_identifier` mapping exists before the agent switch
4. Confirm the `SemanticRole` type in `web/src/lib/sci/sci-types.ts` includes `entity_relationship` (defined as "hierarchical link (manager, parent)")
5. Log: paste the current function signature and the first 20 lines

**DO NOT proceed until you have read the actual code and confirmed the bug exists.**

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: reference_key HC role maps to entity_identifier for ALL agents,
including entity agent. On entity-classified files, this causes hierarchical
reference columns (reports_to, manager_id) to be treated as the row's own
identifier, creating wrong entities.

Option A: Make reference_key mapping agent-aware in inferRoleForAgent
  - For entity agent: reference_key → entity_relationship
  - For all other agents: reference_key → entity_identifier (unchanged)
  - Scale test: Works at 10x? YES — no data volume impact
  - AI-first: Any hardcoding? NO — uses HC columnRole (structural signal)
  - Transport: Data through HTTP bodies? NO — classification logic only
  - Atomicity: Clean state on failure? YES — classification is stateless

Option B: Add secondary filter in processEntityUnit to prefer the FIRST identifier
  - Keep inferRoleForAgent unchanged, fix ordering in entity pipeline
  - Scale test: Works at 10x? YES
  - AI-first: Any hardcoding? NO
  - Transport: NO
  - Atomicity: YES
  - PROBLEM: Fragile — depends on array ordering. Does not fix the semantic error.

Option C: Store original HC columnRole in flywheel alongside semanticRole
  - Preserves roundtrip fidelity but does not fix the semantic mapping error
  - Scale test: YES
  - AI-first: YES
  - PROBLEM: Treats symptom (flywheel roundtrip loss) not disease (wrong mapping)

CHOSEN: Option A because it fixes the semantic error at its source. The
SemanticRole type already includes entity_relationship for exactly this purpose.
The fix is one code change in one function. No downstream consumers need updating
because entity_relationship is already a valid SemanticRole.

REJECTED: Option B because ordering-dependent fixes are fragile (FP-117 class).
REJECTED: Option C because it treats the flywheel roundtrip as the bug when the
actual bug is the semantic mapping.
```

---

## PHASE 2: IMPLEMENTATION

### File: `web/src/lib/sci/negotiation.ts`
### Function: `inferRoleForAgent`

**Change the `reference_key` mapping from unconditional to agent-aware:**

The current code has this block BEFORE the agent switch:
```typescript
if (hcRole === 'reference_key') {
  return { role: 'entity_identifier', context: `${field.fieldName} — reference key`, confidence: 0.90 };
}
```

Replace with:
```typescript
if (hcRole === 'reference_key') {
  if (agent === 'entity') {
    // On entity-classified files, reference_key means hierarchical link
    // (e.g., reports_to → manager). NOT this row's own identifier.
    return { role: 'entity_relationship', context: `${field.fieldName} — hierarchical reference`, confidence: 0.75 };
  }
  // For target/transaction/reference agents, reference_key IS the entity link
  return { role: 'entity_identifier', context: `${field.fieldName} — reference key`, confidence: 0.90 };
}
```

### Verification after edit:
1. `grep -n 'reference_key' web/src/lib/sci/negotiation.ts` — confirm the change
2. `grep -n 'entity_relationship' web/src/lib/sci/negotiation.ts` — confirm new role used
3. `grep -n 'entity_relationship' web/src/lib/sci/sci-types.ts` — confirm role exists in type

### NO OTHER FILES SHOULD BE MODIFIED.
This is a one-function, one-file fix. The `entity_relationship` SemanticRole already exists in the type system. No downstream consumers (entity pipeline, flywheel write, convergence) need changes because:
- `processEntityUnit` searches for `entity_identifier` — `entity_relationship` will NOT match, so only the true identifier (`employee_id`) will be found
- Flywheel write stores whatever `semanticRole` the bindings have — `entity_relationship` is valid
- Convergence does not consume `entity_relationship` bindings — it looks for measures and identifiers

---

## PHASE 3: BUILD VERIFICATION

1. `git stash` (stash any uncommitted work)
2. `npx tsc --noEmit` — must pass with zero errors
3. `npx next lint` — must pass
4. `git stash pop`
5. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev`
6. Confirm localhost:3000 responds

---

## PROOF GATES — HARD

| # | Criterion | How to verify |
|---|-----------|---------------|
| G1 | `inferRoleForAgent` maps `reference_key` to `entity_relationship` when `agent === 'entity'` | `grep -A5 'reference_key' web/src/lib/sci/negotiation.ts` — paste output |
| G2 | `inferRoleForAgent` maps `reference_key` to `entity_identifier` when `agent !== 'entity'` | Same grep — paste output showing the else branch |
| G3 | `entity_relationship` exists in `SemanticRole` type | `grep 'entity_relationship' web/src/lib/sci/sci-types.ts` — paste output |
| G4 | `npx tsc --noEmit` passes | Paste exit code |
| G5 | `npx next lint` passes | Paste exit code |
| G6 | `npm run build` succeeds | Paste exit code |

## PROOF GATES — SOFT

| # | Criterion | How to verify |
|---|-----------|---------------|
| S1 | No other files modified beyond `negotiation.ts` | `git diff --name-only` — paste output |
| S2 | Korean Test: zero hardcoded field names added | `grep -n 'reports_to\|manager_id\|employee_id' web/src/lib/sci/negotiation.ts` — paste output showing zero NEW hits in the changed code |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-186_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## FINAL STEP

```bash
gh pr create --base main --head dev --title "HF-186: Fix reference_key → entity_relationship for entity agent" --body "Root cause fix for CRP Plan 1 regression. inferRoleForAgent mapped reference_key to entity_identifier unconditionally. For entity-classified files, reports_to:reference_key was treated as entity_identifier, creating entities keyed on manager IDs instead of employee IDs. Fix makes the mapping agent-aware: entity agent → entity_relationship, all others → entity_identifier (unchanged)."
```
