# HF-045: SERVER-SIDE IMPORT COMMIT — FIX BROWSER TIMEOUT ON LARGE DATASETS

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## WHY THIS HOTFIX EXISTS

CLT-64 testing: "Approve & Import" on RetailCDMX (119,129 records, 7 sheets) hangs indefinitely. The browser makes ~238 sequential Supabase INSERT calls (500-row chunks), each a network round trip. The page either:
- Times out and shows Firefox reload spinner
- Kills in-flight requests on any navigation
- Leaves data in partial state (entities created, committed_data empty)

**This is a P0 architecture bug.** No real-world dataset can be imported through the current browser-side commit path.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Final step: `gh pr create --base main --head dev`
4. **SUPABASE MIGRATIONS: Must execute live via `supabase db push` or SQL Editor AND verify with DB query. File existence ≠ applied.**

---

## THE FIX: SERVER-SIDE API ROUTE

Move the entire commit operation to a Next.js API route that:
1. Receives the mapped/transformed data from the client in ONE POST
2. Uses the **service role client** (bypasses RLS, faster writes)
3. Executes ALL writes in a single operation (entities, periods, committed_data, import_batch update)
4. Uses **bulk inserts** — one INSERT per table with all rows, not 500-row chunks
5. Returns progress via response streaming OR completes synchronously and returns result
6. Client shows immediate feedback: "Import in progress..." with a spinner

---

## PHASE 0: DIAGNOSTIC — CURRENT COMMIT PATH

```bash
echo "============================================"
echo "HF-045 PHASE 0: IMPORT COMMIT ARCHITECTURE"
echo "============================================"

echo ""
echo "=== 0A: CURRENT COMMIT FUNCTION ==="
grep -rn "directCommitImportDataAsync\|commitImport\|handleApprove\|handleCommit" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== 0B: HOW DATA IS WRITTEN — CHUNK SIZE ==="
grep -rn "chunk\|batch.*insert\|500\|BATCH_SIZE\|CHUNK_SIZE" web/src/lib/supabase/data-service.ts | head -15

echo ""
echo "=== 0C: WHICH SUPABASE CLIENT IS USED ==="
grep -rn "createClient\|createServiceRole\|supabase.*from\|getSupabase" web/src/lib/supabase/data-service.ts | head -15

echo ""
echo "=== 0D: WHAT TABLES ARE WRITTEN ==="
grep -rn "\.from(" web/src/lib/supabase/data-service.ts | grep "insert\|upsert\|update" | head -20

echo ""
echo "=== 0E: EXISTING API ROUTES ==="
find web/src/app/api -name "route.ts" | sort

echo ""
echo "=== 0F: CURRENT RETAILCDMX STATE ==="
echo "Run in Supabase SQL Editor:"
echo "  SELECT COUNT(*) FROM entities WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';"
echo "  SELECT COUNT(*) FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';"
echo "  SELECT COUNT(*) FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';"
echo "  SELECT * FROM import_batches WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';"
```

**Commit:** `HF-045 Phase 0: Import commit architecture diagnostic`

---

## PHASE 1: BUILD SERVER-SIDE IMPORT API ROUTE

### 1A: Create the API route

Create `web/src/app/api/import/commit/route.ts`:

```typescript
// POST /api/import/commit
// Receives: { tenantId, importBatchId, sheets[], fieldMappings, planConfig }
// Executes: entity resolution, period creation, committed_data bulk insert
// Returns: { success, entityCount, periodCount, recordCount, batchId }

// MUST use service role client for:
// 1. Bypassing RLS (faster, no per-row policy checks)
// 2. Bulk inserts (single INSERT with all rows)
// 3. Transaction-like behavior (all-or-nothing)
```

**Key requirements:**

1. **Authentication check** — Verify the request comes from an authenticated user (check auth header/cookie)
2. **Service role client** — Use `createServiceRoleClient()` for all writes
3. **Entity resolution** — Deduplicate entities BEFORE insert (one INSERT for all unique entities)
4. **Period creation** — Extract unique periods from Año/Mes columns, deduplicate, one INSERT for all periods
5. **Committed data** — ONE bulk insert per sheet, not 500-row chunks. Supabase/PostgREST handles large inserts server-side.
6. **Import batch update** — Set status='committed', row_count=total, completed_at=now()
7. **Error handling** — If any step fails, return the error. Don't leave partial state.

### 1B: Payload optimization

The client should NOT send 119K raw rows over HTTP. Instead:

**Option A (preferred):** Client sends the field mappings + sheet metadata. Server re-reads from a stored upload (if file was stored) or client sends compressed/summarized data.

**Option B (if file isn't stored):** Client sends transformed rows but compressed. The mapped data (entity_id, period, metrics JSONB) is much smaller than raw Excel data.

**Option C (simplest, may work):** Client sends all transformed rows as JSON. For 119K records with ~5 fields each, this is ~20-50MB of JSON. Acceptable for a server-side route but needs the Next.js body size limit increased:

```typescript
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
  },
};
// OR for App Router:
export const runtime = 'nodejs';
// and in next.config.js:
// api: { bodyParser: { sizeLimit: '100mb' } }
```

### 1C: Bulk insert strategy

Instead of:
```typescript
// BAD: 238 sequential calls
for (const chunk of chunks(rows, 500)) {
  await supabase.from('committed_data').insert(chunk);
}
```

Do:
```typescript
// GOOD: 1 call per sheet, server-side
const { error } = await serviceClient
  .from('committed_data')
  .insert(allRowsForSheet);
// Supabase handles large inserts efficiently server-side
```

If a single insert of 50K+ rows is too large for PostgREST, use larger chunks (5,000-10,000 per call) — still 10-20 calls instead of 238.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | API route exists at /api/import/commit | File exists | route.ts created |
| PG-2 | Route uses service role client | grep for createServiceRoleClient | Found in route |
| PG-3 | Route does NOT use 500-row chunks | grep for chunk size | No BATCH_SIZE=500 pattern |
| PG-4 | Route validates authentication | Code review | Auth check present |
| PG-5 | Route handles errors without partial state | Code review | Error returns before partial writes, or cleanup on failure |

**Commit:** `HF-045 Phase 1: Server-side import commit API route`

---

## PHASE 2: UPDATE CLIENT TO USE API ROUTE

### 2A: Modify the enhanced import page

In `web/src/app/operate/import/enhanced/page.tsx` (or wherever `directCommitImportDataAsync` is called):

Replace the direct Supabase calls with a single fetch to the new API route:

```typescript
// BEFORE: Direct Supabase calls from browser
const result = await directCommitImportDataAsync(supabase, tenantId, ...);

// AFTER: Server-side API call
const response = await fetch('/api/import/commit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tenantId,
    importBatchId,
    sheets: transformedSheets,
    fieldMappings,
    planConfig,
  }),
});
const result = await response.json();
```

### 2B: Add user feedback

While the API call is in flight:

```typescript
setImportStatus('committing'); // Shows: "Importing data... This may take a minute."
// Single fetch call — no chunked progress needed
// The browser won't timeout on a single POST (default timeout is 2+ minutes)
const result = await fetch('/api/import/commit', ...);
setImportStatus('complete'); // Shows: "Import complete! X records imported."
```

Display states:
- `committing` → Full-screen overlay or modal: "Importing 119,129 records across 7 sheets... Please don't close this page."
- `complete` → Success message with record count, entity count, period count
- `error` → Error message with details and "Retry" button

### 2C: GPV Wizard — same fix

If the GPV Wizard has its own import path, update it to use the same `/api/import/commit` route. One import path, not two.

```bash
grep -rn "directCommitImportDataAsync\|commitImport\|import_batches.*insert" web/src/components/gpv/ --include="*.tsx" --include="*.ts" | head -10
```

Update any direct Supabase calls to use the API route.

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-6 | Enhanced import calls /api/import/commit | grep for fetch('/api/import/commit') | Found |
| PG-7 | No direct Supabase insert calls remain in import page | grep for .from('committed_data').insert | Zero matches in page.tsx |
| PG-8 | Loading state shown during commit | Code review | setImportStatus or similar |
| PG-9 | GPV wizard uses same API route | grep | Same /api/import/commit call |

**Commit:** `HF-045 Phase 2: Client updated to use server-side import API`

---

## PHASE 3: PERIOD DEDUPLICATION FIX

The period auto-creation from OB-64 may create duplicate periods. Fix:

1. **Extract unique periods FIRST** — Before any inserts, collect all unique (year, month) combinations from the entire dataset
2. **Deduplicate** — One period per unique combination
3. **Check existing** — Query periods table for this tenant, only create missing ones
4. **Single insert** — One INSERT for all new periods

```typescript
// CORRECT:
const uniquePeriods = new Map(); // key: "2024-01" → value: { year: 2024, month: 1 }
for (const row of allRows) {
  const year = row[yearField];
  const month = row[monthField];
  if (year && month) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    uniquePeriods.set(key, { year, month });
  }
}
// Now insert only unique periods not already in DB
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-10 | Period creation deduplicates before insert | Code review | Map/Set used for uniqueness |
| PG-11 | Existing periods checked before creation | Code review | SELECT before INSERT |

**Commit:** `HF-045 Phase 3: Period deduplication fix`

---

## PHASE 4: CLEAN UP RETAILCDMX + TEST

### 4A: Clean up partial state

The previous failed import left 1,125 entities and a 'pending' import batch. Clean up via SQL (include in completion report):

```sql
-- Clean up RetailCDMX partial import state
DELETE FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM entities WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM import_batches WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
DELETE FROM rule_set_assignments WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
```

**DO NOT delete rule_sets** — the plan import is valid and should be preserved.

### 4B: Test on localhost

1. Login → select RetailCDMX
2. Navigate to /operate/import/enhanced
3. Upload RetailCDMX Excel data package
4. Map fields → Validate → Approve & Import
5. **Import completes within 30 seconds** (not minutes)
6. **UI shows progress/completion status**
7. Verify in Supabase:

```sql
SELECT COUNT(*) FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: > 100,000

SELECT COUNT(*) FROM entities WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: > 0

SELECT COUNT(*) FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: 1-3 (NOT 1,201)

SELECT status, row_count FROM import_batches WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f' ORDER BY created_at DESC LIMIT 1;
-- Expected: status='committed', row_count > 100000
```

### 4C: Apply any new migrations to Supabase

If this HF creates new migrations:
1. Run them in Supabase SQL Editor
2. Verify with DB query
3. Include evidence in completion report

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-12 | RetailCDMX cleanup complete | Supabase queries | 0 committed_data, 0 entities (pre-test) |
| PG-13 | Import completes within 60 seconds | Timer | < 60s for 119K records |
| PG-14 | committed_data rows > 100,000 | Supabase query | COUNT > 100000 |
| PG-15 | Periods ≤ 5 (deduplicated) | Supabase query | COUNT between 1 and 5 |
| PG-16 | Import batch status = 'committed' | Supabase query | status field |
| PG-17 | UI showed progress/status during commit | Visual verification | Not a blank/frozen screen |

**Commit:** `HF-045 Phase 4: RetailCDMX cleanup and import verification`

---

## PHASE 5: BUILD + COMPLETION REPORT + PR

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
```

### Proof gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-18 | TypeScript: zero errors | exit code 0 | |
| PG-19 | Build: clean | exit code 0 | |

### Completion report

Create `HF-045_COMPLETION_REPORT.md` at PROJECT ROOT with:
- Architecture before/after diagram
- All 19 proof gates with evidence
- Supabase query results showing successful import
- Performance: time for 119K record import (before vs after)

### Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-045: Server-Side Import Commit — Fix Browser Timeout on Large Datasets" \
  --body "## Root Cause
Import commit sends 238 sequential Supabase INSERT calls from the browser (500-row chunks).
For 119K records, this hangs indefinitely, times out, or creates partial state on page refresh.

## Fix
- New API route: POST /api/import/commit
- Service role client for bulk inserts (bypasses RLS, faster writes)
- Bulk inserts per sheet (1 call per sheet, not 238 calls total)
- Period deduplication: extracts unique periods, checks existing, single insert
- Client shows 'Importing...' status during the single API call
- GPV wizard updated to use same API route

## Performance
- Before: hangs after ~2 minutes, partial state on failure
- After: completes in < 60 seconds, atomic (all or nothing)

## Proof Gates: 19 — see HF-045_COMPLETION_REPORT.md"
```

**Commit:** `HF-045 Phase 5: Build verification, completion report, PR`

---

## ANTI-PATTERNS TO AVOID

- **Do NOT keep 500-row chunks** — the whole point is bulk inserts
- **Do NOT use the browser Supabase client for writes** — use the service role client server-side
- **Do NOT leave partial state on error** — if entities write but committed_data fails, clean up the entities
- **Do NOT forget to handle the GPV wizard path** — both import UIs must use the same API route
- **Do NOT create a new migration without executing it** — standing rule

---

*HF-045 — February 19, 2026*
*"Never ask a browser to do a server's job."*
