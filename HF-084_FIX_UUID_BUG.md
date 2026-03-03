# HF-084: FIX UUID BUG IN SCI EXECUTE — PLAN SAVE FAILS
## "invalid input syntax for type uuid: 'sci-execute'"

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute all phases. Commit after each. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `web/src/app/api/import/sci/execute/route.ts` — THE BROKEN FILE. Read completely.

---

## CONTEXT

Andrew tested plan import on `vialuce.ai` production. SCI analyze works (95% confidence, 6 components detected). SCI execute fails with:

```
[SCI Execute] Plan save failed: { 
  code: '22P02', 
  details: null, 
  hint: null, 
  message: 'invalid input syntax for type uuid: "sci-execute"' 
}
```

Somewhere in the execute route, the literal string `"sci-execute"` is being passed to a UUID column in Supabase. PostgreSQL rejects it because it's not a valid UUID.

**This is a P0 blocker.** No customer can import a plan until this is fixed.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. **Commit this prompt to git as first action.**
4. **Git from repo root (spm-platform), NOT web/.**

---

# PHASE 0: FIND THE BUG

```bash
echo "=== FIND 'sci-execute' IN CODEBASE ==="
grep -rn "sci-execute\|sci_execute\|'sci.execute'" web/src/ --include="*.ts" --include="*.tsx"

echo ""
echo "=== FIND ALL HARDCODED STRING IDS IN EXECUTE ROUTE ==="
grep -n "created_by\|profile_id\|user_id\|batch_id\|assigned_by\|updated_by" \
  web/src/app/api/import/sci/execute/route.ts

echo ""
echo "=== CHECK WHAT COLUMNS ARE UUID TYPE ==="
echo "Columns that would reject a non-UUID string:"
echo "- rule_sets.created_by"
echo "- import_batches.created_by"  
echo "- rule_set_assignments.assigned_by"
echo "- committed_data.created_by"

echo ""
echo "=== THE PLAN SAVE SECTION ==="
grep -B 10 -A 10 "Plan save\|rule_sets\|\.insert\|\.upsert" \
  web/src/app/api/import/sci/execute/route.ts | head -60
```

**Identify:**
1. Which line passes `"sci-execute"` 
2. Which column/table receives it
3. What the value SHOULD be (user's profile ID from the auth session)

**Commit:** `HF-084 Phase 0: Diagnostic — found UUID bug at [file:line]`

---

# PHASE 1: FIX THE BUG

### 1A: Get the user's profile ID from the session

The execute route should already have auth context. Find how other routes get the user ID:

```bash
echo "=== HOW OTHER ROUTES GET USER ID ==="
grep -n "session\|getUser\|user\.id\|profile\.id\|auth" \
  web/src/app/api/import/commit/route.ts | head -10

echo ""
grep -n "session\|getUser\|user\.id\|profile\.id\|auth" \
  web/src/app/api/calculation/run/route.ts | head -10
```

### 1B: Replace the hardcoded string

Replace `"sci-execute"` with the actual user UUID from the auth session. The pattern should be something like:

```typescript
// BEFORE (broken):
created_by: 'sci-execute'

// AFTER (fixed):
created_by: session.user.id  // or profile.id, whatever the route uses
```

If there's no auth session available in the execute route, add it using the same pattern as other API routes.

### 1C: Check for other hardcoded string IDs

```bash
echo "=== ANY OTHER HARDCODED IDS? ==="
grep -n "sci-analyze\|sci-import\|system\|admin\|placeholder" \
  web/src/app/api/import/sci/execute/route.ts
  
echo ""
echo "=== ALSO CHECK ANALYZE ROUTE ==="
grep -n "sci-analyze\|sci-execute\|created_by\|profile_id" \
  web/src/app/api/import/sci/analyze/route.ts
```

Fix ALL hardcoded string IDs, not just the one that crashed.

**Proof gate PG-01:** `"sci-execute"` replaced with proper UUID. No hardcoded string IDs remain in SCI routes.

**Commit:** `HF-084 Phase 1: Replace 'sci-execute' with auth user UUID`

---

# PHASE 2: BUILD + DEPLOY

### 2A: Build

```bash
cd web && rm -rf .next && npm run build
```

### 2B: Push + merge to main

```bash
cd /Users/AndrewAfrica/spm-platform
git add -A
git commit -m "HF-084: Fix UUID bug in SCI execute — plan save was passing 'sci-execute' string to UUID column"
git push origin dev
gh pr create --base main --head dev \
  --title "HF-084: Fix plan import — UUID bug in SCI execute" \
  --body "## P0 Fix

Plan import on vialuce.ai fails with:
\`\`\`
invalid input syntax for type uuid: 'sci-execute'
\`\`\`

The SCI execute route passed the literal string 'sci-execute' to a UUID column.
Fixed: now uses the authenticated user's ID.

**Must deploy to production immediately — blocks all plan imports.**"

gh pr merge --squash
```

### 2C: Wait for Vercel deploy (~2 min)

### 2D: Production verification

```
ANDREW WILL TEST ON vialuce.ai:
1. Log in as admin@opticaluminar.mx
2. Upload RetailCorp Plan1.pptx
3. Confirm All → Import Data
4. Verify plan creation succeeds
```

**Proof gate PG-02:** Build clean. PR merged to main. Vercel deploying.

**Commit:** `HF-084 Phase 2: Deployed to production`

---

# PHASE 3: COMPLETION REPORT

```markdown
# HF-084 COMPLETION REPORT
## Fix UUID Bug in SCI Execute

### Bug
`[SCI Execute] Plan save failed: invalid input syntax for type uuid: "sci-execute"`

### Root Cause
File: [file:line]
The SCI execute route passed the literal string "sci-execute" as [column_name] 
when inserting into [table_name]. PostgreSQL rejected it because the column type is UUID.

### Fix
Replaced "sci-execute" with [auth user UUID / crypto.randomUUID()].
Also fixed [any other hardcoded IDs found].

### Files Changed
- [list]

### Deployed
PR #[X] merged to main. Vercel production deploy triggered.
```

**Commit:** `HF-084 Phase 3: Completion report`

---

## ANTI-PATTERNS

| Don't | Do |
|-------|-----|
| Use `crypto.randomUUID()` if user auth is available | Use the authenticated user's ID — it's auditable |
| Fix only the one occurrence | Search for ALL hardcoded string IDs in SCI routes |
| Skip the merge to main | This MUST reach production. Andrew is testing NOW. |
| Add a migration | This is a code fix, not a schema change |
