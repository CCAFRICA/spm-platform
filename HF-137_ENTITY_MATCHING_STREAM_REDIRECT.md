# HF-137: IMPORT ENTITY MATCHING + STREAM INTELLIGENCE + LOGIN REDIRECT

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference
3. `PRE_PROMPT_COMPLIANCE_DIRECTIVE.md`

---

## WHY THIS HF EXISTS

CLT-172 post-deploy verification found three issues that together break the BCL vertical slice:

**Issue 1 (P1): November import — 85 rows parsed, 0 committed.** SCI classified correctly (transaction@90%, ID_Empleado=identifier@1.00), file downloaded and parsed by execute-bulk, but zero rows reached committed_data. Entity matching failed — the execute-bulk route cannot match November's ID_Empleado values against BCL's 85 entities.

**Issue 2 (P1): /stream shows "No Intelligence Available."** BCL has $44,590 calculated (October, POSTED lifecycle). The State Reader (OB-170) is not finding this data. Most likely: the query filters by lifecycle_state and excludes POSTED, which OB-171 introduced.

**Issue 3 (P1): Post-login lands on /operate, not /stream.** Decision 128 (LOCKED) says /stream is the canonical landing. Patricia logs in and sees /operate instead.

All three must work for the BCL multi-period proof: login → /stream shows October intelligence → import November → calculate → /stream shows trajectory.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Diagnostic-first. Phase 0 produces ZERO code changes.**

---

## CRITICAL CONTEXT

### BCL State
- Tenant ID: `b1c2d3e4-aaaa-bbbb-cccc-111111111111`
- 85 entities: external_id pattern `BCL-5001` through `BCL-5085`
- 170 committed_data rows (October: 85 transaction + 85 roster)
- 1 calculated period: October 2025, $44,590, lifecycle_state = **POSTED** (OB-171 advanced it)
- Active rule_set with 4 components, 2 variants

### SCI Logs for November Import (Evidence)
```
[SCI-HC-DIAG] sheet=Datos roles=[ID_Empleado:identifier@1.00, ...]
[SCI-SCORES-DIAG] sheet=Datos winner=transaction@90%
[SCI Bulk] Parsed 85 rows across 1 sheets in 118ms
[SCI Bulk] Complete: 0 rows in 991ms
```

AI classified correctly. File parsed correctly. Zero rows committed. Entity matching is the failure point.

### Key Schema
- `entities`: `id` (uuid PK), `tenant_id`, `external_id` (text), `display_name`
- `committed_data`: `id`, `tenant_id`, `entity_id` (uuid FK → entities), `source_date`, `data_type`, `row_data` (jsonb), `period_id` (nullable)
- `calculation_batches`: `lifecycle_state` — values include DRAFT, PREVIEW, OFFICIAL, PENDING_APPROVAL, APPROVED, POSTED
- `calculation_results`: `batch_id` (FK → calculation_batches), `total_payout`, `components` (jsonb)

---

## PHASE 0: DIAGNOSTIC — THREE TRACES (Zero Code Changes)

### 0A: Trace Entity Matching in execute-bulk

```bash
# Find the execute-bulk route
find web/src/app/api/import -name "*.ts" -path "*execute*" -o -name "*.ts" -path "*bulk*" | sort

# Find entity matching logic
grep -n "entity\|external_id\|identifier\|match\|lookup\|resolve" \
  web/src/app/api/import/sci/execute-bulk/route.ts 2>/dev/null | head -30

# Find where rows are filtered/dropped
grep -n "filter\|skip\|drop\|unmatched\|0 rows\|matched\|entityMap\|entityLookup" \
  web/src/app/api/import/sci/execute-bulk/route.ts 2>/dev/null | head -20

# Find how the identifier column is determined
grep -n "identifier\|semantic\|role\|binding\|header\|column" \
  web/src/app/api/import/sci/execute-bulk/route.ts 2>/dev/null | head -20
```

**Key questions to answer from the code:**
1. How does execute-bulk know which column contains the entity identifier?
2. Does it use the SCI semantic binding (ID_Empleado:identifier@1.00) or something else?
3. How does it look up entities? `.eq('external_id', value)` or something else?
4. What happens when lookup returns no match — skip row or create entity?
5. Is there a log line showing WHAT values it tried to match and WHAT it found?

### 0B: Verify BCL Entities Exist

```sql
-- Confirm BCL entities exist with expected external_ids
SELECT external_id, display_name
FROM entities
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY external_id
LIMIT 10;
-- EXPECTED: BCL-5001 through BCL-5010 with display_names
```

```sql
-- Count
SELECT COUNT(*) FROM entities
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
-- EXPECTED: 85
```

### 0C: Trace /stream Intelligence Loading

```bash
# Find the /stream page data loading
grep -n "loadIntelligence\|getStateReader\|calculation_results\|calculation_batches\|lifecycle" \
  web/src/app/stream/page.tsx 2>/dev/null | head -20

# Find the state reader query
grep -n "lifecycle_state\|PREVIEW\|OFFICIAL\|POSTED\|IN\|in(" \
  web/src/lib/intelligence/state-reader.ts 2>/dev/null | head -20

# Find intelligence stream loader if separate
find web/src -name "*intelligence*loader*" -o -name "*stream*loader*" | sort
grep -rn "lifecycle_state" web/src/lib/intelligence/ --include="*.ts" | head -10
```

**Key question:** Does the query filter include `POSTED`? OB-170 may have coded the filter as `IN ('PREVIEW', 'OFFICIAL')` when BCL was at PREVIEW. OB-171 advanced BCL to POSTED. If POSTED isn't in the filter, the State Reader finds nothing.

### 0D: Trace Post-Login Redirect

```bash
# Find where login redirect destination is set
grep -rn "redirect\|redirectTo\|callbackUrl\|/stream\|/operate\|post.*login\|after.*login" \
  web/src/app/login/ web/src/app/auth/ web/src/middleware.ts \
  --include="*.ts" --include="*.tsx" 2>/dev/null | head -20

# Check if there's a default route after auth
grep -rn "defaultRoute\|landingPage\|homePage\|DEFAULT_REDIRECT" \
  web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10
```

**Key question:** After successful login, where does the user get sent? Is it hardcoded to `/operate`, or configurable? Decision 128 says it must be `/stream`.

### 0E: Document All Three Root Causes

In the completion report, state:

1. **Entity matching failure:** Exact code path. Which column does execute-bulk use? How does it look up? Why zero matches?
2. **/stream data loading:** Exact lifecycle_state filter. Does it include POSTED?
3. **Login redirect:** Exact redirect destination. Where is it configured?

**Commit:** `git add -A && git commit -m "HF-137 Phase 0: Triple diagnostic — entity matching, stream loading, login redirect" && git push origin dev`

---

## PHASE 1: FIX ENTITY MATCHING IN EXECUTE-BULK

### The Fix

Based on Phase 0 findings, the fix will be one of these scenarios:

**Scenario A: execute-bulk doesn't use SCI semantic binding for identifier**

If execute-bulk determines the identifier column by a different method (hardcoded column name, first column, etc.) rather than using the SCI proposal's `identifier` role:

Fix: Pass the SCI semantic bindings to execute-bulk and use the `identifier` role to determine which column to match against `entities.external_id`.

**Scenario B: execute-bulk uses identifier but matching format differs**

If execute-bulk correctly identifies ID_Empleado as the identifier but the values don't match entities.external_id (e.g., row has "5001" but entity has "BCL-5001", or row has "BCL-5001\t" with whitespace):

Fix: Normalize both sides before matching. Trim whitespace, case-insensitive, strip common prefixes if needed.

```typescript
function normalizeId(id: string): string {
  return String(id).trim().toLowerCase();
}
// Match: normalizeId(rowValue) === normalizeId(entity.external_id)
```

**Scenario C: execute-bulk requires entities to exist but entity creation path is separate**

If the October import created entities because it included roster data (classified as entity), but November only has transaction data (no roster), and execute-bulk expects entities to already exist:

This is correct behavior — entities SHOULD exist from October's import. The fix is in the matching logic, not in entity creation.

**Scenario D: execute-bulk creates a new import_batch and the entity lookup is scoped wrong**

If the entity lookup queries committed_data instead of entities table, or if it's scoped to the current import_batch (which would be empty for the new November batch):

Fix: Entity lookup must query the `entities` table, not committed_data.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Root cause of 0/85 entity match documented | Code path with evidence |
| PG-2 | Fix applied | Entity matching works for BCL November data |
| PG-3 | 85 rows committed to committed_data | SQL verification |
| PG-4 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "HF-137 Phase 1: Fix entity matching in execute-bulk" && git push origin dev`

---

## PHASE 2: FIX /STREAM INTELLIGENCE LOADING

### The Fix

Add POSTED (and all post-OFFICIAL states) to the lifecycle_state filter in the State Reader.

The State Reader should find calculation batches in ANY non-DRAFT state. The intelligence stream should show data regardless of whether the batch is in PREVIEW, OFFICIAL, PENDING_APPROVAL, APPROVED, or POSTED.

```typescript
// WRONG: Only finds PREVIEW/OFFICIAL
.in('lifecycle_state', ['PREVIEW', 'OFFICIAL'])

// RIGHT: Finds any batch with results
.in('lifecycle_state', ['PREVIEW', 'OFFICIAL', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'CLOSED', 'PAID', 'PUBLISHED'])

// OR BETTER: Exclude only DRAFT (batches with no results yet)
.neq('lifecycle_state', 'DRAFT')
```

The `.neq('lifecycle_state', 'DRAFT')` approach is more resilient — it includes all states that have calculation results, including any future states added to the lifecycle.

Also check the trajectory loader (OB-172) for the same filter:

```bash
grep -n "lifecycle_state\|PREVIEW\|OFFICIAL" \
  web/src/lib/intelligence/state-reader.ts \
  web/src/lib/intelligence/trajectory-service.ts 2>/dev/null | head -10
```

Fix BOTH the state reader and trajectory loader if they have restrictive filters.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-5 | State Reader finds POSTED batches | BCL October $44,590 found |
| PG-6 | /stream shows System Health | $44,590 visible, not "No Intelligence" |
| PG-7 | Trajectory loader also updated | Same filter fix if applicable |
| PG-8 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "HF-137 Phase 2: Fix /stream to find POSTED calculation batches" && git push origin dev`

---

## PHASE 3: FIX POST-LOGIN REDIRECT TO /STREAM

### The Fix

After successful authentication, the user must land on `/stream` (Decision 128).

Find the login success handler and change the redirect destination:

```typescript
// WRONG: Redirect to /operate or /
router.push('/operate');

// RIGHT: Redirect to /stream (Decision 128)
router.push(redirectTo || '/stream');
```

The `redirectTo` parameter (from middleware's redirect with `?redirectTo=/path`) takes priority — if the user was trying to reach a specific page, send them there after login. Default is `/stream`.

Also check the middleware redirect — when it sends unauthenticated users to `/login`, it should preserve the original destination:

```typescript
// In middleware (HF-136 already does this):
const loginUrl = new URL('/login', request.url);
loginUrl.searchParams.set('redirectTo', pathname);
return NextResponse.redirect(loginUrl);

// In login success handler:
const redirectTo = searchParams.get('redirectTo') || '/stream';
router.push(redirectTo);
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-9 | Login success → /stream | Not /operate |
| PG-10 | redirectTo parameter honored | /perform/statements → login → /perform/statements |
| PG-11 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "HF-137 Phase 3: Post-login redirect to /stream (Decision 128)" && git push origin dev`

---

## PHASE 4: BROWSER VERIFICATION (CLT-172 CONTINUATION)

### 4A: Login Redirect Test

1. Open incognito → navigate to vialuce.ai → redirected to /login
2. Login as Patricia (BCL admin)
3. **EXPECTED:** Lands on /stream (not /operate)

### 4B: /stream Intelligence Test

1. On /stream, verify:
   - System Health shows $44,590, 85 entities, October 2025
   - Lifecycle shows POSTED
   - Pipeline Readiness shows 5 periods needing data
   - "No Intelligence Available" does NOT appear

### 4C: November Import Test

1. Navigate to /operate/import
2. Upload BCL_Datos_Nov2025.xlsx
3. SCI classifies as transaction@90% (already confirmed)
4. Click "Import 85 rows"
5. **EXPECTED:** Import Complete shows 85 Records imported, 50+ Entities matched
6. Navigate to /operate/calculate → select November 2025 → calculate
7. Navigate to /stream → **EXPECTED:** Trajectory section appears (2 periods: Oct + Nov)

### 4D: Meridian Regression

1. Switch to Meridian
2. /stream shows MX$185,063

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-12 | Login → /stream | Decision 128 enforced |
| PG-13 | /stream shows $44,590 | System Health with Five Elements |
| PG-14 | November: 85 rows committed | Not 0 |
| PG-15 | November entities matched | >0 matched |
| PG-16 | November calculation succeeds | Total close to GT $46,291 |
| PG-17 | /stream shows trajectory (2 periods) | Period comparison card visible |
| PG-18 | Meridian MX$185,063 | No regression |

**Commit:** `git add -A && git commit -m "HF-137 Phase 4: CLT-172 continuation — all three fixes verified" && git push origin dev`

---

## PHASE 5: COMPLETION REPORT + PR

Create `HF-137_COMPLETION_REPORT.md` at project root:

```markdown
# HF-137: Import Entity Matching + Stream Intelligence + Login Redirect

## Status: [COMPLETE / PARTIAL / FAILED]

## Issue 1: Entity Matching (85 parsed → 0 committed)
- Root cause: [exact code path and why matching failed]
- Fix: [description]
- Result: [N] rows committed for November

## Issue 2: /stream "No Intelligence Available"
- Root cause: [lifecycle_state filter excluded POSTED]
- Fix: [filter change]
- Result: System Health shows $44,590

## Issue 3: Post-Login Redirect
- Root cause: [redirect destination was /operate]
- Fix: [changed to /stream]
- Result: Login → /stream

## Proof Gates
[PG-1 through PG-18: PASS/FAIL]
```

```bash
gh pr create --base main --head dev \
  --title "HF-137: Entity Matching + Stream Loading + Login Redirect — CLT-172 Fixes" \
  --body "## Three CLT-172 Fixes

### Entity Matching (CLT172-F05)
- Root cause: [from diagnostic]
- Fix: [description]
- November import: 85 rows committed

### Stream Intelligence (CLT172-F04)
- lifecycle_state filter now includes all non-DRAFT states
- /stream shows \$44,590 System Health

### Login Redirect (CLT172-F03)
- Post-login destination: /stream (Decision 128)
- redirectTo parameter preserved

## Proof Gates: see HF-137_COMPLETION_REPORT.md"
```

**Commit:** `git add -A && git commit -m "HF-137 Phase 5: Completion report + PR" && git push origin dev`

---

## PRODUCTION VERIFICATION — FOR ANDREW (Post-Merge)

1. **Incognito → vialuce.ai → /login** (auth still works)
2. **Login as Patricia → /stream** (not /operate)
3. **/stream shows $44,590** (not "No Intelligence")
4. **Import BCL November → 85 rows committed**
5. **Calculate November → /stream shows period comparison**
6. **Meridian: MX$185,063**

---

*HF-137 — March 15, 2026*
*"Three symptoms, three root causes, one vertical slice: login → see intelligence → import more data → see trajectory."*
*vialuce.ai — Intelligence. Acceleration. Performance.*
