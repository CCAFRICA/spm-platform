# OB-50: DATA INGESTION FACILITY — IMMUNE SYSTEM FOUNDATION

## Autonomy Directive
NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

## Standing Rules
1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT (same level as package.json).
4. Never provide CC with answer values — fix logic not data.
5. Final step: `gh pr create --base main --head dev` with descriptive title and body.
6. Completion report file is created BEFORE final build verification, then appended with build results.
7. Commit this prompt to git as first action: `cp /path/to/prompt OB-50_DATA_INGESTION_FACILITY.md && git add . && git commit -m "OB-50: Data Ingestion Facility prompt" && git push origin dev`

## CC Anti-Patterns (DO NOT DO THESE)
- **Placeholder Syndrome:** Substitutes stubs for real logic
- **Schema Disconnect:** Writes to one field, reads from another
- **Silent Fallbacks:** Returns zero/null instead of throwing errors — if data is missing, show a visible error or empty state, do NOT silently swallow
- **Report Burial:** Saves reports in subdirectories instead of project root
- **Autonomy Leakage:** Stops to ask despite explicit autonomy directive
- **Proof Gate Rewriting:** Changing gate criteria to match what was built instead of fixing what wasn't

---

## DESIGN REFERENCE — READ FIRST

**CRITICAL:** Before writing ANY code, read these files:
- `DS-005_DATA_INGESTION_FACILITY.md` — The full design specification. This OB implements Phases 1-3. Read ALL of it.
- `DS-003_VISUALIZATION_VOCABULARY.md` — Visual form rules for upload status, validation results, file lists.
- `DS-004_NAVIGATION_ARCHITECTURE.md` — Navigation paradigm determines how upload surfaces render per persona.

These files may be in the project root or in `/mnt/user-data/outputs/`. Find them and read them.

---

## MISSION OVERVIEW

This OB builds the foundational data ingestion infrastructure from DS-005. Three missions covering DS-005 Phases 1-3:

**Mission 1: Storage & Audit Foundation (Phases 0-3)**
Supabase Storage bucket, `ingestion_events` table, TUS resumable upload, SHA-256 hashing, file type validation.

**Mission 2: Upload UI & Import Rewiring (Phases 4-7)**
Replace existing file upload components with the new Ingestion Facility UI. Wire into existing import pipeline. Batch upload support.

**Mission 3: Classification & Validation (Phases 8-11)**
Wire AI classification to ingestion events. Structural validation. Quarantine workflow. Admin resolution UI.

**The test:** After OB-50, creating a new tenant and uploading files should flow through the Ingestion Facility — files land in Supabase Storage, every upload generates an audit event, classification signals are captured, and the admin sees upload status with validation results.

---

## PHASE 0: OB-49 GAP REMEDIATION — PREREQUISITE CLEANUP

**CONTEXT:** OB-49 completion report claimed 13/13 proof gates PASS. Browser verification (CLT-48 screenshots post-merge) shows several claimed fixes DID NOT render in the actual application. The Rail cleanup (Cycle/Queue/Pulse removal, accordion collapse) DID land. The following DID NOT:

**Evidence from browser (post-OB-49 merge):**
- Observatory: 1,118 requests, 4.0 MB transferred — WORSE than pre-OB-49 (was ~300 target)
- Óptica Luminar: 1,147 requests, 4.1 MB transferred — WORSE than pre-OB-49
- Currency: "$20,662" displayed, NOT "MX$20,662" — `useCurrency()` hook not firing on this page
- Observatory section headings: visually unchanged low-contrast text
- Breadcrumb: shows "Optica Luminar > Home" — NO Status Chip with period + lifecycle state
- Tenant landing page: Gobernar (Govern) workspace loads by default — should be Operate or Dashboard
- "No hay periodos disponibles" banner still appears at top of tenant pages

**This phase MUST fix all of these before any new Ingestion Facility work begins.**

### 0A: Diagnose the request explosion

The Observatory is making 1,118 requests. The tenant page makes 1,147. OB-49 Phase 12 claimed N+1 query consolidation reduced ~300 to ~21. Either the fix didn't deploy, or the pages making the requests aren't the pages that were optimized.

```bash
echo "=== OBSERVATORY PAGE — WHAT RENDERS ==="
find web/src/app -path "*observatory*" -name "page.tsx" -o -path "*observatory*" -name "layout.tsx" | sort
find web/src/app -path "*platform*" -name "page.tsx" | sort

echo ""
echo "=== WHAT COMPONENT DOES THE OBSERVATORY PAGE ACTUALLY RENDER? ==="
# The Observatory page.tsx imports — trace what components it uses
head -50 web/src/app/observatory/page.tsx 2>/dev/null || head -50 web/src/app/platform/page.tsx 2>/dev/null

echo ""
echo "=== N+1 FIX LOCATION ==="
grep -rn "fetchTenantFleetCards\|fetchOperationsQueue\|fetchBillingData\|fetchOnboardingData" web/src/ \
  --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20

echo ""
echo "=== ARE THE CONSOLIDATED FUNCTIONS ACTUALLY CALLED? ==="
# Check if the page/components import and call the consolidated functions
grep -rn "import.*fetchTenantFleet\|import.*fetchOperations\|import.*fetchBilling\|import.*fetchOnboarding" web/src/ \
  --include="*.ts" --include="*.tsx" | grep -v node_modules | head -15

echo ""
echo "=== DUPLICATE SUPABASE CALLS ON PAGE LOAD ==="
# Look for useEffect or component-level fetches that might be duplicating
grep -rn "useEffect.*supabase\|useEffect.*fetch" web/src/app/*observatory* web/src/app/*platform* web/src/components/*platform* \
  --include="*.tsx" | grep -v node_modules | head -20
```

The root cause is likely one of:
- A) The consolidated functions exist but the page still imports and calls the OLD per-tenant loop functions
- B) Multiple components on the same page each independently fetch the same data
- C) The page re-renders in a loop (useEffect dependency issue)

Find the cause. Fix it. Target: Observatory page loads with <50 Supabase queries, not 1,100+.

### 0B: Fix currency — verify useCurrency() is actually used on the RENDERED page

```bash
echo "=== WHAT PAGE IS ACTUALLY RENDERING FOR OPTICA LUMINAR? ==="
# The screenshot shows "Gobernar / Governance & System Health" — find this page
grep -rn "Gobernar\|Governance.*System.*Health\|Gobern" web/src/app/ --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== DOES THIS PAGE USE useCurrency()? ==="
# Check the ACTUAL rendered page, not the pages OB-49 modified
grep -rn "useCurrency\|formatCurrency\|currencySymbol" web/src/app/*govern* web/src/app/*gobernar* \
  --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== WHICH PAGES DID OB-49 ACTUALLY MODIFY? ==="
grep -rn "useCurrency" web/src/components/dashboards/ web/src/app/operate/ web/src/app/my-compensation/ \
  --include="*.tsx" | grep -v node_modules | head -15

echo ""  
echo "=== PAGES THAT STILL USE HARDCODED $ OR MX$ ==="
grep -rn "'\$'\|\"\\$\"\|'MX\\$'\|MX\\\$\|\\$.*toLocaleString\|toFixed.*\\$" web/src/ \
  --include="*.tsx" | grep -v node_modules | grep -v useCurrency | head -20
```

The problem: OB-49 fixed currency in RepDashboard, AdminDashboard, ManagerDashboard, Operate page, My Compensation — but the page actually rendering is the **Govern** workspace. `useCurrency()` was never applied to that page because OB-49 didn't know it was the landing page.

Fix: Apply `useCurrency()` to EVERY page that displays monetary values, not just the ones OB-49 listed. Audit comprehensively.

### 0C: Fix the landing page — tenant should land on Operate, not Govern

```bash
echo "=== DEFAULT ROUTE AFTER TENANT SELECTION ==="
grep -rn "router.push\|redirect\|defaultRoute\|landingPage\|initialRoute" web/src/ \
  --include="*.ts" --include="*.tsx" | grep -v node_modules | grep "tenant\|login\|select" | head -15

echo ""
echo "=== LAYOUT ROOT REDIRECT ==="
cat web/src/app/page.tsx | head -30
cat web/src/app/layout.tsx | head -30
```

After selecting a tenant, the user should land on the **Operate** workspace (the primary workspace for Admin role), not Govern. Fix the default route.

### 0D: Fix Observatory section heading contrast

```bash
echo "=== SECTION HEADING STYLES ==="
grep -rn "OPERATIONS QUEUE\|TENANT FLEET\|ACTIVE TENANTS\|uppercase.*tracking\|text-xs.*text-zinc\|text-xs.*text-slate" \
  web/src/components/*platform* web/src/components/*observatory* \
  --include="*.tsx" | grep -v node_modules | head -15
```

OB-49 claimed to change `text-zinc-500 → text-zinc-400 with font-semibold`. Either the change didn't apply or the component rendering these headings isn't the one that was modified. Find the ACTUAL component rendering "OPERATIONS QUEUE" and "TENANT FLEET (2)" and fix the classes to:
- `text-sm text-slate-300 font-semibold tracking-wide uppercase`
- NOT `text-xs text-zinc-500` or anything with opacity below 0.5

### 0E: Fix breadcrumb Status Chip

```bash
echo "=== NAVBAR / BREADCRUMB ==="
grep -rn "StatusChip\|status.*chip\|breadcrumb.*period\|period.*breadcrumb" web/src/components/navigation/ \
  --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== WHAT NAVBAR ACTUALLY RENDERS ==="
cat web/src/components/navigation/Navbar.tsx | head -80
```

OB-49 Phase 4 claimed to add a Status Chip to the Navbar between breadcrumbs and search. The screenshot shows "Optica Luminar > Home" with no chip. Either the component was added but not rendered, or it's conditionally hidden. Fix: the Status Chip MUST be visible showing the current period name and lifecycle state when inside a tenant context.

### 0F: Fix "No hay periodos disponibles" persistent banner

```bash
echo "=== NO PERIODS AVAILABLE MESSAGE ==="
grep -rn "No hay periodos\|no.*period.*available\|periodos disponibles" web/src/ \
  --include="*.tsx" | grep -v node_modules | head -10
```

This banner appears despite seeded data existing. Either the query to fetch periods is failing, or it's filtering incorrectly. Trace the query, verify periods exist for the current tenant in Supabase, fix the query or condition.

### Phase 0 Proof Gates

| Gate | Check |
|------|-------|
| PG-0A | Observatory loads with <100 network requests (open DevTools Network tab, hard refresh, count) |
| PG-0B | Tenant page loads with <100 network requests |
| PG-0C | Currency displays as "MX$20,662" on the Óptica Luminar landing page (the ACTUALLY rendered page) |
| PG-0D | Tenant landing page is Operate workspace, not Govern |
| PG-0E | Observatory section headings visually readable (not faint/tiny) |
| PG-0F | Breadcrumb shows period name + lifecycle Status Chip inside tenant context |
| PG-0G | "No hay periodos disponibles" banner NOT shown when periods exist in Supabase |

**CRITICAL VERIFICATION METHOD:** Do NOT just check the code. Open http://localhost:3000 in a browser. Navigate to Observatory. Open DevTools Network tab. Count requests. Navigate to Óptica Luminar. Check the currency symbol rendered on screen. Check the breadcrumb text. If you cannot open a browser, use `curl` to fetch the page HTML and verify the rendered content.

**Commit:** `OB-50 Phase 0: OB-49 gap remediation — request explosion, currency, landing page, headings, Status Chip`

---

## PHASE 0.5: DIAGNOSTIC — CURRENT UPLOAD PATHS

Now that the platform baseline is correct, audit the current file upload implementation.

### 0.5.1 Find all file upload code

```bash
echo "=== FILE INPUT ELEMENTS ==="
grep -rn "type=\"file\"\|type='file'\|accept=\|<input.*file" web/src/ \
  --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v .next | sort

echo ""
echo "=== FILE READER / BLOB / FORMDATA ==="
grep -rn "FileReader\|new Blob\|FormData\|readAsArrayBuffer\|readAsText\|readAsDataURL" web/src/ \
  --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v .next | head -20

echo ""
echo "=== DRAG AND DROP HANDLERS ==="
grep -rn "onDrop\|onDragOver\|dropzone\|dragenter" web/src/ \
  --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v .next | head -15

echo ""
echo "=== XLSX / CSV PARSING ==="
grep -rn "xlsx\|XLSX\|read.*workbook\|parse.*csv\|papaparse\|SheetJS" web/src/ \
  --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v .next | head -15

echo ""
echo "=== CURRENT UPLOAD TO SUPABASE STORAGE ==="
grep -rn "supabase.*storage\|\.upload\|\.from.*bucket\|storage\.from" web/src/ \
  --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v .next | head -15

echo ""
echo "=== PPTX PARSING ==="
grep -rn "pptx\|PptxGen\|pptx.*parse\|mammoth\|officegen" web/src/ \
  --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v .next | head -10
```

### 0.5.2 Map all import pages

```bash
echo "=== IMPORT RELATED PAGES ==="
find web/src/app -path "*import*" -name "page.tsx" 2>/dev/null | sort
find web/src/app -path "*upload*" -name "page.tsx" 2>/dev/null | sort
find web/src/app -path "*data*" -name "page.tsx" 2>/dev/null | sort
find web/src/app -path "*plan*import*" -name "page.tsx" 2>/dev/null | sort
```

### 0.5.3 Check existing Supabase Storage usage

```bash
echo "=== SUPABASE STORAGE CONFIG ==="
grep -rn "createBucket\|storage.*bucket\|STORAGE_BUCKET\|storageBucket" web/src/ \
  --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== ENV VARS FOR STORAGE ==="
grep -rn "STORAGE\|BUCKET\|UPLOAD" web/.env.local 2>/dev/null | head -10
```

Document all findings in the completion report under "Phase 0.5 Diagnostic."

**Commit:** `OB-50 Phase 0.5: Diagnostic — current upload paths audit`

---

## PHASE 1: SUPABASE STORAGE BUCKET SETUP

### 1.1 Create the ingestion bucket

Create a Supabase Storage bucket via the management API or SQL. The bucket name is `ingestion-raw`.

```bash
echo "=== CHECK IF BUCKET EXISTS ==="
# Check via Supabase client in a quick script, or SQL
```

If using SQL migration or the Supabase dashboard:
- Bucket name: `ingestion-raw`
- Public: **NO** (private bucket)
- File size limit: 500MB (500 * 1024 * 1024 bytes)
- Allowed MIME types: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/csv`, `text/tab-separated-values`, `text/plain`, `application/pdf`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/zip`, `application/gzip`, `application/vnd.ms-excel`

### 1.2 Create RLS policies for the bucket

Storage policies use the `storage.objects` table:

```sql
-- Allow authenticated users with data_upload capability to INSERT files
-- Scoped to their tenant's folder
CREATE POLICY "tenant_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ingestion-raw'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- Allow authenticated users to SELECT (download) their tenant's files
CREATE POLICY "tenant_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ingestion-raw'
    AND (
      (storage.foldername(name))[1] = (
        SELECT tenant_id::text FROM profiles WHERE id = auth.uid()
      )
      OR (SELECT scope_level FROM profiles WHERE id = auth.uid()) = 'platform'
    )
  );

-- No UPDATE policy — files are immutable once uploaded
-- DELETE only for platform admins
CREATE POLICY "platform_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ingestion-raw'
    AND (SELECT scope_level FROM profiles WHERE id = auth.uid()) = 'platform'
  );
```

### 1.3 Create the bucket via API route

If the bucket doesn't exist, create it programmatically. Add an API route or a migration script:

```typescript
// In a setup script or API route
const { data, error } = await supabaseAdmin.storage.createBucket('ingestion-raw', {
  public: false,
  fileSizeLimit: 500 * 1024 * 1024, // 500MB
  allowedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'text/tab-separated-values',
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/gzip'
  ]
});
```

**Proof gate PG-1:** `ingestion-raw` bucket exists in Supabase Storage. RLS policies prevent cross-tenant access. No UPDATE policy exists.

**Commit:** `OB-50 Phase 1: Supabase Storage bucket with tenant isolation`

---

## PHASE 2: INGESTION EVENTS TABLE

### 2.1 Create the immutable audit log table

```sql
CREATE TABLE IF NOT EXISTS ingestion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES import_batches(id),
  
  -- WHO
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  uploaded_by_email TEXT NOT NULL,
  uploaded_by_role TEXT NOT NULL DEFAULT 'admin',
  
  -- WHAT
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  file_hash_sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  
  -- WHEN
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- RESULT
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'classified', 'mapped', 'validated', 'committed', 'quarantined', 'rejected')),
  classification_result JSONB,
  validation_result JSONB,
  record_count INTEGER,
  sheet_count INTEGER,
  
  -- CHAIN
  supersedes_event_id UUID REFERENCES ingestion_events(id),
  
  -- IMMUTABLE
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ingestion_tenant ON ingestion_events(tenant_id);
CREATE INDEX idx_ingestion_status ON ingestion_events(status);
CREATE INDEX idx_ingestion_batch ON ingestion_events(batch_id);
CREATE INDEX idx_ingestion_uploaded_at ON ingestion_events(uploaded_at DESC);

-- RLS
ALTER TABLE ingestion_events ENABLE ROW LEVEL SECURITY;

-- Tenant isolation for reads
CREATE POLICY "tenant_read_ingestion" ON ingestion_events
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    OR (SELECT scope_level FROM profiles WHERE id = auth.uid()) = 'platform'
  );

-- INSERT only — append only
CREATE POLICY "tenant_insert_ingestion" ON ingestion_events
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    OR (SELECT scope_level FROM profiles WHERE id = auth.uid()) = 'platform'
  );

-- NO UPDATE POLICY — events are immutable
-- NO DELETE POLICY — events are permanent audit records
```

### 2.2 Create the API route for ingestion event creation

Create `/api/ingest/event/route.ts` — server-side route using service role client:

```typescript
// POST: Create new ingestion event
// Body: { tenant_id, file_name, file_size_bytes, file_type, file_hash_sha256, storage_path, sheet_count? }
// Returns: { event_id, status }
```

This route:
1. Validates the request
2. Gets the uploading user's profile (from auth session)
3. Inserts into `ingestion_events` with status = 'received'
4. Returns the event ID

### 2.3 Create the API route for status progression

Create `/api/ingest/event/[eventId]/status/route.ts`:

```typescript
// POST: Progress the status of an ingestion event
// Body: { new_status, classification_result?, validation_result?, record_count? }
// This creates a NEW event that supersedes the previous one
// Returns: { new_event_id, status }
```

This does NOT update the original event. It creates a new event with `supersedes_event_id` pointing to the original. Immutable chain.

**Proof gate PG-2:** `ingestion_events` table exists with all columns. INSERT works. UPDATE is blocked by RLS (no policy). API routes respond correctly.

**Commit:** `OB-50 Phase 2: Ingestion events table — immutable audit log`

---

## PHASE 3: SHA-256 HASHING AND TUS UPLOAD SERVICE

### 3.1 Create the upload service

Create `web/src/lib/ingestion/upload-service.ts`:

```typescript
// Core upload service that handles:
// 1. Client-side SHA-256 hash computation
// 2. TUS resumable upload to Supabase Storage
// 3. Ingestion event creation
// 4. Progress tracking

interface UploadOptions {
  tenantId: string;
  file: File;
  batchId?: string;
  onProgress?: (progress: UploadProgress) => void;
}

interface UploadProgress {
  phase: 'hashing' | 'uploading' | 'registering';
  bytesUploaded: number;
  bytesTotal: number;
  percentage: number;
  estimatedSecondsRemaining?: number;
}

interface UploadResult {
  eventId: string;
  storagePath: string;
  fileHash: string;
  status: 'received';
}
```

**SHA-256 computation:**
Use the Web Crypto API (available in all modern browsers):
```typescript
async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**TUS upload:**
Use the `tus-js-client` library. Install it:
```bash
cd web && npm install tus-js-client
```

Implement resumable upload to Supabase Storage:
```typescript
import * as tus from 'tus-js-client';

// Upload to: ingestion-raw/{tenant_id}/{batch_id}/{file_name}
// Use Supabase's TUS endpoint: https://{project}.storage.supabase.co/upload/resumable
```

**Upload flow:**
1. Compute SHA-256 hash of file (show "Hashing..." progress)
2. Validate file type and size client-side
3. Start TUS upload to Supabase Storage (show upload progress bar)
4. On upload complete, call `/api/ingest/event` to create the ingestion event
5. Return the event ID to the caller

### 3.2 File type validation

Create `web/src/lib/ingestion/file-validator.ts`:

```typescript
const ACCEPTED_TYPES = {
  spreadsheets: {
    extensions: ['.xlsx', '.xls', '.csv', '.tsv'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'text/tab-separated-values'
    ],
    maxSize: 500 * 1024 * 1024 // 500MB
  },
  text: {
    extensions: ['.txt', '.dat', '.pipe'],
    mimeTypes: ['text/plain'],
    maxSize: 500 * 1024 * 1024
  },
  documents: {
    extensions: ['.pdf', '.pptx', '.docx'],
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    maxSize: 100 * 1024 * 1024 // 100MB
  },
  archives: {
    extensions: ['.zip', '.gz'],
    mimeTypes: ['application/zip', 'application/gzip'],
    maxSize: 1024 * 1024 * 1024 // 1GB
  }
};

const REJECTED_EXTENSIONS = ['.exe', '.bat', '.sh', '.js', '.py', '.cmd', '.ps1', '.vbs'];

interface ValidationResult {
  valid: boolean;
  category?: string;
  error?: string;
}

function validateFile(file: File): ValidationResult { ... }
```

**Proof gate PG-3:** Upload service computes SHA-256 hash, uploads to Supabase Storage via TUS, creates ingestion event. File type validation rejects `.exe` and accepts `.xlsx`. Upload progress reported to caller.

**Commit:** `OB-50 Phase 3: SHA-256 hashing, TUS upload service, file validation`

---

## PHASE 4: UPLOAD ZONE COMPONENT

### 4.1 Create the reusable UploadZone component

Create `web/src/components/ingestion/UploadZone.tsx`:

This is the primary upload interaction component used across all import pages. Per DS-005 Section 6, it supports:

- **Drag-and-drop:** Primary interaction. Large drop zone with clear visual affordance.
- **Click to browse:** Fallback. Opens native file picker.
- **Multi-file:** Accept multiple files in a single drop.
- **Progress per file:** Each file shows: name, size, hash progress, upload progress, status.
- **File validation inline:** Rejected files show error immediately, don't upload.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│     ┌──────────────────────────────────────────────────┐     │
│     │                                                  │     │
│     │    ↓  Drop files here or click to browse         │     │
│     │                                                  │     │
│     │    .xlsx  .csv  .txt  .pdf  .pptx                │     │
│     │    Max: 500MB per file                            │     │
│     │                                                  │     │
│     └──────────────────────────────────────────────────┘     │
│                                                              │
│  FILES                                                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📊 January_Sales.xlsx    4.2MB  ████████████░░ 78%    │  │
│  │ 📊 February_Roster.csv   12KB   ✅ Received           │  │
│  │ ❌ malware.exe            —     Rejected: file type   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Visual states per file:**
- `hashing` — Spinner + "Computing integrity hash..."
- `uploading` — Progress bar with percentage and bytes
- `registering` — Spinner + "Registering with platform..."
- `received` — Green checkmark + "Received"
- `rejected` — Red X + rejection reason
- `error` — Red warning + error message + retry button

**Dark theme:** Use existing design system colors. Drop zone border: `border-dashed border-slate-600 hover:border-indigo-500/50`. Active drag: `border-indigo-500 bg-indigo-500/10`.

### 4.2 Props interface

```typescript
interface UploadZoneProps {
  tenantId: string;
  batchId?: string;              // Links all uploads to a batch
  onFileReceived?: (event: IngestionEvent) => void;
  onAllComplete?: (events: IngestionEvent[]) => void;
  acceptCategories?: ('spreadsheets' | 'text' | 'documents' | 'archives')[];
  maxFiles?: number;             // Default: 20
  className?: string;
}
```

**Proof gate PG-4:** UploadZone renders with drag-and-drop. Dropping a valid file: hashes → uploads to Supabase Storage → creates ingestion event → shows "Received" status. Dropping an invalid file shows rejection immediately. Multi-file upload works with individual progress per file.

**Commit:** `OB-50 Phase 4: UploadZone component with drag-drop and progress`

---

## PHASE 5: REPLACE EXISTING IMPORT FILE UPLOADS

### 5.1 Audit and replace each upload point

From Phase 0 diagnostic, find every page that has a file `<input>` or drop handler. Replace each with the UploadZone component.

Expected locations (verify from Phase 0):
- Data Import page (main data upload)
- Enhanced Import / DPI page (if separate)
- Plan Import page (PPTX upload)
- Any other file upload in the admin area

### 5.2 Wire to existing import pipeline

After a file is uploaded to Supabase Storage and an ingestion event is created, the existing import pipeline needs to:
1. Download the file from Supabase Storage (server-side, via service role)
2. Parse it (XLSX, CSV, PPTX — existing parsers)
3. Run AI classification (existing service)
4. Continue with field mapping, transformation, commitment (existing pipeline)

Create a bridge function in `web/src/lib/ingestion/pipeline-bridge.ts`:

```typescript
// Takes an ingestion event ID
// Downloads the file from storage
// Feeds it into the existing import pipeline
// Updates ingestion event status as it progresses

async function processIngestionEvent(eventId: string): Promise<void> {
  // 1. Fetch event from ingestion_events
  // 2. Download file from storage path
  // 3. Parse file (detect type, use appropriate parser)
  // 4. Feed into existing classification / field mapping flow
  // 5. Update event status: received → classified → mapped → validated → committed
}
```

### 5.3 Plan Import integration

Plan import (PPTX) follows the same ingestion path:
1. File drops into UploadZone
2. Uploaded to Supabase Storage under `ingestion-raw/{tenant_id}/{batch_id}/plans/`
3. Ingestion event created
4. Existing plan interpreter service processes the file
5. Event status progresses through the chain

**Proof gate PG-5:** The Data Import page uses UploadZone. Files land in Supabase Storage (not just browser memory). The existing import pipeline processes the file. Plan Import page also uses UploadZone.

**Commit:** `OB-50 Phase 5: Replace all file uploads with UploadZone + pipeline bridge`

---

## PHASE 6: BATCH UPLOAD SESSION

### 6.1 Create batch management

When an admin uploads multiple files in one session, they should be grouped as a batch:

Create `web/src/lib/ingestion/batch-manager.ts`:

```typescript
interface BatchSession {
  batchId: string;
  tenantId: string;
  label?: string;           // "January 2026 Data Package"
  files: IngestionEvent[];
  totalFiles: number;
  completedFiles: number;
  totalRecords: number;
  status: 'uploading' | 'classifying' | 'ready_for_review' | 'committed';
}
```

### 6.2 Batch upload UI

When the user drops multiple files, or uploads sequentially within a session, show a batch summary panel below the UploadZone:

```
BATCH: January 2026 Data Package               3 of 5 files processed
┌─────────────────────────────────────────────────────────────────┐
│ 📊 Base_Venta_Individual.xlsx    │ 719 rows  │ ✅ Classified    │
│ 📊 Base_Venta_Tienda.xlsx        │ 22 rows   │ ✅ Classified    │
│ 📊 Datos_Colaborador.xlsx        │ 719 rows  │ ✅ Classified    │
│ 📊 Base_Cobranza.xlsx            │ 719 rows  │ ⏳ Classifying   │
│ 📊 Base_Clientes_Nuevos.xlsx     │ —         │ ⏳ Uploading 45% │
├─────────────────────────────────────────────────────────────────┤
│ Total: 5 files  │  2,179 records detected  │  0 quarantined    │
│                                                                 │
│  [Review & Commit Batch]                       [Cancel Batch]   │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Link batches to import_batches

The existing `import_batches` table should reference the ingestion batch. Add a column if needed:
```sql
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS ingestion_batch_label TEXT;
```

**Proof gate PG-6:** Uploading 3+ files in a single session groups them as a batch. Batch summary shows per-file status and total record count. "Review & Commit Batch" button exists.

**Commit:** `OB-50 Phase 6: Batch upload session management`

---

## PHASE 7: IMPORT HISTORY PAGE

### 7.1 Create the Import History page

Create or enhance the existing import history page to read from `ingestion_events`:

Route: `/operate/import-history` or integrate into existing Data Import section.

**Content:**
- Hero Card: Total files received this period, total records committed, classification accuracy %
- PrioritySortedList (per DS-003): Recent uploads sorted by date, quarantined items first
- Each row shows: file name, date, uploader, record count, sheet count, status badge, SHA-256 (truncated)
- Click row → expands to show: classification result, validation result, storage path, full audit chain

### 7.2 Per-file detail view

Clicking a file in the history list shows its full ingestion event chain:

```
January_Sales.xlsx
─────────────────────────────────────────────
Uploaded by:    maria.garcia@optica.com (Admin)
Uploaded at:    Feb 17, 2026 14:32:07
File size:      4.2 MB
SHA-256:        a3f2b9...c7d1 (copy button)
Storage path:   ingestion-raw/ol-tenant-id/batch-001/January_Sales.xlsx

EVENT CHAIN
  ● 14:32:07  Received                     File uploaded successfully
  ● 14:32:09  Classified (AI: 94%)         5 sheets: Roster, Sales, Store Sales, Collections, New Clients
  ● 14:32:11  Validated                    719 records, 2 warnings, 0 errors
  ● 14:32:15  Committed                    719 records → committed_data
```

**Proof gate PG-7:** Import History page shows real data from `ingestion_events`. Event chain visible for each file. Quarantined items highlighted.

**Commit:** `OB-50 Phase 7: Import History page with audit chain display`

---

## PHASE 8: CLASSIFICATION SIGNAL CAPTURE

### 8.1 Wire AI classification to ingestion events

The existing AI classification engine (in the import pipeline) already classifies sheets and maps fields. Wire it to:
1. Update the ingestion event status from 'received' to 'classified'
2. Store the classification result in the event's `classification_result` JSONB field
3. Generate `classification_signal` records for every classification decision

### 8.2 Ensure classification_signals table exists

```bash
echo "=== CHECK CLASSIFICATION SIGNALS TABLE ==="
grep -rn "classification_signals" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10
```

If the table exists from prior OBs, verify it has the columns from DS-005 Section 3.2. If not, create it:

```sql
CREATE TABLE IF NOT EXISTS classification_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id UUID REFERENCES ingestion_events(id),
  
  signal_type TEXT NOT NULL,
  ai_prediction TEXT,
  ai_confidence FLOAT,
  user_decision TEXT,
  was_corrected BOOLEAN DEFAULT FALSE,
  
  context JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signals_tenant ON classification_signals(tenant_id);
CREATE INDEX idx_signals_event ON classification_signals(event_id);
CREATE INDEX idx_signals_type ON classification_signals(signal_type);

ALTER TABLE classification_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read_signals" ON classification_signals
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    OR (SELECT scope_level FROM profiles WHERE id = auth.uid()) = 'platform'
  );
CREATE POLICY "tenant_insert_signals" ON classification_signals
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    OR (SELECT scope_level FROM profiles WHERE id = auth.uid()) = 'platform'
  );
```

### 8.3 Generate signals on every classification

When the AI classifies a sheet:
```typescript
// For each sheet classification:
await supabase.from('classification_signals').insert({
  tenant_id: tenantId,
  event_id: ingestionEventId,
  signal_type: 'sheet_classification',
  ai_prediction: 'roster',        // What AI guessed
  ai_confidence: 0.94,            // How confident
  user_decision: null,             // Null until admin confirms/overrides
  was_corrected: false,
  context: {
    sheet_name: 'Datos_Colaborador',
    column_headers: ['num_empleado', 'nombre', 'tienda', 'puesto'],
    sample_rows: 3,
    row_count: 719
  }
});
```

When the admin confirms or overrides:
```typescript
// Update the signal
await supabase.from('classification_signals')
  .update({
    user_decision: 'roster',     // What admin confirmed
    was_corrected: false          // Or true if they changed it
  })
  .eq('id', signalId);
```

**Proof gate PG-8:** Uploading a file generates classification signals in Supabase. Each sheet classification creates a signal record. Signal includes AI prediction, confidence, and context.

**Commit:** `OB-50 Phase 8: Classification signal capture wired to ingestion events`

---

## PHASE 9: STRUCTURAL VALIDATION

### 9.1 Create the validation service

Create `web/src/lib/ingestion/validation-service.ts`:

**Structural validation (Layer 1 — immediate, no AI needed):**

```typescript
interface ValidationFinding {
  severity: 'critical' | 'warning' | 'info';
  code: string;
  message: string;
  sheet?: string;
  row?: number;
  column?: string;
}

interface ValidationResult {
  valid: boolean;
  findings: ValidationFinding[];
  recordCount: number;
  sheetCount: number;
}

async function validateStructure(file: ParsedFile): Promise<ValidationResult> {
  const findings: ValidationFinding[] = [];
  
  // Check 1: File parses without errors
  // Check 2: No completely empty sheets classified as data-bearing
  // Check 3: Column headers present (first row not empty)
  // Check 4: Consistent column count across rows (detect jagged data)
  // Check 5: No duplicate column headers within a sheet
  // Check 6: Row count > 0 for data sheets
  // Check 7: Required fields present after field mapping (employee ID, period)
  // Check 8: Character encoding (detect non-UTF-8)
  
  return { valid: !findings.some(f => f.severity === 'critical'), findings, ... };
}
```

### 9.2 Run validation after classification

After AI classification, run structural validation. Update the ingestion event:
- If validation passes (no critical findings): status → 'validated'
- If validation fails (critical findings): status → 'quarantined'
- Store `validation_result` in the event JSONB field

**Proof gate PG-9:** Uploading a valid file passes structural validation. Uploading a file with empty data sheets or missing headers generates warning/critical findings. Quarantined files show in Import History with validation findings.

**Commit:** `OB-50 Phase 9: Structural validation service`

---

## PHASE 10: QUARANTINE UI

### 10.1 Quarantine resolution interface

When a file is quarantined, the admin needs to resolve it. Create a quarantine panel (inline on Import History, or as a dedicated section):

```
⚠️ QUARANTINED: February_Adjustments.xlsx
──────────────────────────────────────────────
FINDINGS:
  🔴 Critical: Sheet "Corrections" has 0 data rows — empty sheet classified as transaction data
  🟡 Warning: Column "monto" contains 3 non-numeric values (rows 45, 112, 287)
  🔵 Info: 2 new employee IDs not found in roster

ACTIONS:
  [Override & Commit]  — Accept the file despite findings (logged)
  [Reject & Delete]    — Remove the file from the pipeline
  [Re-upload]          — Upload a corrected version (supersedes this file)
```

### 10.2 Override audit trail

When an admin overrides a quarantine:
1. Create a new ingestion event with status 'validated' and `supersedes_event_id` pointing to the quarantined event
2. Log the override decision, the admin's ID, and timestamp
3. The file proceeds to commitment

This ensures the audit trail shows: File was quarantined → Admin reviewed findings → Admin chose to override → File was committed. Full accountability.

**Proof gate PG-10:** Quarantined files show action buttons. "Override & Commit" creates a new event in the audit chain. "Reject & Delete" marks the event as rejected. All actions are logged.

**Commit:** `OB-50 Phase 10: Quarantine resolution UI with audit trail`

---

## PHASE 11: OBSERVATORY INGESTION METRICS

### 11.1 Wire ingestion data to Observatory

Add an Ingestion Health section to the Observatory's Operations or Billing tab:

Query `ingestion_events` for platform-wide metrics:

```sql
-- Total files received this month
SELECT count(*) FROM ingestion_events 
WHERE uploaded_at > date_trunc('month', now());

-- Total records committed this month
SELECT sum(record_count) FROM ingestion_events 
WHERE status = 'committed' AND uploaded_at > date_trunc('month', now());

-- Classification accuracy (auto-accepted / total)
SELECT 
  count(*) FILTER (WHERE NOT cs.was_corrected) as auto_accepted,
  count(*) as total
FROM classification_signals cs
WHERE cs.created_at > date_trunc('month', now());

-- Quarantine rate
SELECT
  count(*) FILTER (WHERE status = 'quarantined') as quarantined,
  count(*) as total
FROM ingestion_events
WHERE uploaded_at > date_trunc('month', now());
```

Display as Hero Cards in the Observatory:
- **Files Received** (HeroMetric) — count this period
- **Records Committed** (HeroMetric) — sum this period
- **Classification Accuracy** (Gauge) — % auto-accepted
- **Quarantine Rate** (Gauge) — should be <5%

### 11.2 Per-tenant ingestion breakdown

In the tenant fleet cards or as drill-down, show per-tenant ingestion volume.

**Proof gate PG-11:** Observatory shows ingestion metrics from real `ingestion_events` data. Uploading a file immediately reflects in the Observatory counts on next load.

**Commit:** `OB-50 Phase 11: Observatory ingestion metrics`

---

## PHASE 12: AUTOMATED CLT VERIFICATION

```bash
# TypeScript check
npx tsc --noEmit

# Production build
npm run build

# Start dev server
npm run dev &
sleep 10

# Verify key pages respond
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login | grep 200

# Kill dev server
kill %1
```

### Proof Gate Summary

| Gate | Check | Pass? |
|------|-------|-------|
| PG-0A | Observatory loads with <100 network requests | |
| PG-0B | Tenant page loads with <100 network requests | |
| PG-0C | Currency displays as "MX$" on Óptica Luminar (the RENDERED page) | |
| PG-0D | Tenant landing page is Operate workspace, not Govern | |
| PG-0E | Observatory section headings visually readable | |
| PG-0F | Breadcrumb shows period + lifecycle Status Chip inside tenant | |
| PG-0G | "No hay periodos disponibles" NOT shown when periods exist | |
| PG-1 | Supabase Storage bucket `ingestion-raw` exists with tenant-isolated RLS | |
| PG-2 | `ingestion_events` table exists, INSERT works, UPDATE blocked | |
| PG-3 | Upload service: SHA-256 hash, TUS upload, file validation, event creation | |
| PG-4 | UploadZone: drag-drop, multi-file, per-file progress, rejection display | |
| PG-5 | Data Import and Plan Import pages use UploadZone, files in Supabase Storage | |
| PG-6 | Batch upload groups multiple files, shows batch summary | |
| PG-7 | Import History page shows real ingestion events with audit chain | |
| PG-8 | Classification signals generated for every sheet classification | |
| PG-9 | Structural validation runs, quarantines files with critical findings | |
| PG-10 | Quarantine UI: Override, Reject, Re-upload actions with audit trail | |
| PG-11 | Observatory shows ingestion metrics from real data | |
| PG-12 | TypeScript clean, production build clean, pages respond | |

### Completion Report

Create `OB-50_COMPLETION_REPORT.md` at project root with:
1. All 12 proof gates with PASS/FAIL
2. Phase 0 diagnostic output (all current upload paths documented)
3. Summary of changes per phase
4. Files modified/created
5. npm packages added (tus-js-client)
6. Supabase schema changes (tables created, RLS policies)
7. Any items deferred with rationale

### Final Step

```bash
gh pr create --base main --head dev --title "OB-50: Data Ingestion Facility — Immune System Foundation" --body "## OB-49 Gap Remediation (Phase 0)
- Fixed request explosion (Observatory/tenant pages 1100+ → <100 requests)
- Currency rendering on ALL pages including Govern workspace
- Tenant landing page routes to Operate, not Govern
- Observatory section heading contrast
- Breadcrumb Status Chip with period + lifecycle state
- Eliminated 'No hay periodos disponibles' false banner

## DS-005 Implementation (Phases 1-11)

### Mission 1: Storage & Audit Foundation
- Supabase Storage bucket \`ingestion-raw\` with tenant isolation
- \`ingestion_events\` table — immutable, append-only audit log
- TUS resumable upload with SHA-256 integrity hashing
- Client-side file type validation

### Mission 2: Upload UI & Import Rewiring
- UploadZone component (drag-drop, multi-file, progress tracking)
- Replaced all existing file inputs with UploadZone
- Pipeline bridge connecting new storage to existing import flow
- Batch upload session management

### Mission 3: Classification & Validation
- Classification signals captured on every AI decision
- Structural validation (8 checks)
- Quarantine workflow with admin resolution UI
- Observatory ingestion metrics wired to real data

### Design References
- DS-005: Data Ingestion Facility
- DS-003: Visualization Vocabulary
- DS-004: Navigation Architecture

### SOC2 Controls Implemented
- Immutable audit trail (no UPDATE/DELETE on ingestion_events)
- SHA-256 file integrity verification
- Tenant isolation via RLS + storage policies
- Least-privilege: upload capability separated from review/commit

## Proof Gates: See OB-50_COMPLETION_REPORT.md"
```

---

*OB-50 — February 17, 2026*
*"The immune system doesn't ask permission to protect the organism. It classifies, validates, quarantines, and remembers — automatically, continuously, and without fail."*
