# HF-196 Phase 1F-0 — Empirical State Verification (Read-Only)

**Continuation of HF-196 vertical slice**
**Branch:** `hf-196-platform-restoration-vertical-slice` (HEAD: `3293b543` Phase 1E)
**Date authored:** 2026-05-03
**Architect:** Andrew (vialuce founder)

---

## 1. PURPOSE

Phase 5C-2 surfaced an architectural defect in Phase 1E: the supersession trigger uses `(tenant_id, structural_fingerprint)` per DS-017, but `structural_fingerprint` identifies *classification class* (correctly anticipates monthly files share fingerprint per DS-017 §3.1) — NOT *dataset identity*. Oct → Nov transactions (different content, same shape) wrongly fired supersession.

OB-50 substrate (LOCKED Feb 17, 2026) defined `ingestion_events.file_hash_sha256` as the dataset-identity primitive. Phase 1F is the candidate correction: replace fingerprint-based supersession trigger with file-content-hash-based trigger.

**Before designing Phase 1F, we verify what's actually operational.** The May 1 substrate noted `ingestion_events` columns missing live (`classification_result`, `validation_result`); whether `file_hash_sha256` is populated by current SCI flows is unverified.

This phase produces empirical evidence to disambiguate three paths:

- **Path X:** `ingestion_events` operative + populated with SHA → Phase 1F uses existing surface
- **Path Y:** `ingestion_events` partially populated → Phase 1F includes wiring repair (scope expansion)
- **Path Z:** SHA-256 not available via OB-50 surface → Phase 1F computes SHA inside SCI flow + stores on `import_batches` directly (substrate-extending)

Each path has different architectural implications; cannot proceed to Phase 1F design without disambiguation.

---

## 2. SUBSTRATE GROUNDING

### 2.1 OB-50 (LOCKED Feb 17, 2026) — Three-Layer Architecture

> "Three-Layer Data Architecture: Raw Layer (immutable) → Transformed Layer (full lineage) → Committed Layer (calculation engine). Original data is sacrosanct."

`ingestion_events` is the immutable audit log; `file_hash_sha256` is the integrity primitive.

### 2.2 OB-50 SHA-256 Spec

```typescript
async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

Computed client-side via Web Crypto API; verified server-side; SOC 2 integrity.

### 2.3 DS-017 (LOCKED March 18, 2026) — Structural Fingerprint Distinct from Content Hash

> "Fingerprint excludes: data values, row count, file name, file size. October and November files with different numbers but the same columns produce the same fingerprint."

DS-017 fingerprint is for classification reuse at analyze-time. NOT for dataset identity. Different primitive, different purpose.

### 2.4 May 1 Substrate Finding

> "The signal_audit confirms the ingestion_events `classification_result` and `validation_result` columns DO NOT EXIST live."

OB-50 schema partially deployed. Whether `file_hash_sha256` is populated is unverified.

### 2.5 Memory Entry 30 (Constitutional, LOCKED 2026-05-02)

> "Reconstruction restores what worked, not builds anew."

Reconstruction requires verification of operational state, not assumption of substrate intent.

---

## 3. SCOPE BOUNDARY

**This phase is read-only. Phase 1F-0 does NOT:**
- Modify any code
- Create or modify any database schema (no DDL)
- Insert/update/delete any rows
- Draft Phase 1F migration or helper module
- Make architectural decisions — surfaces evidence; architect dispositions

**This phase DOES:**
- Query DB schemas via tsx-script (`SELECT` only)
- Query DB row counts and sample row contents (`SELECT` only)
- Grep code surfaces for OB-50 wiring presence
- Synthesize findings into a Path X/Y/Z disposition table
- Surface evidence to architect

---

## 4. CRITICAL HALT CONDITIONS

1. **Schema query reveals divergence too large to characterize** — schema partially exists in unexpected configuration; halt for architect direction
2. **No clear path emerges from evidence** — surfaces don't fit X/Y/Z; halt for architect framing
3. **CC capability fails** — tsx-script tooling unavailable; route through alternative

ALL OTHER ISSUES: continue, surface findings, let architect disposition.

---

## 5. AUTONOMY DIRECTIVE

NEVER ask yes/no. Execute every sub-phase sequentially through synthesis. Halt only at synthesis to surface evidence.

---

## 6. PHASE STRUCTURE

| Sub-phase | Scope | Architect signal |
|---|---|---|
| 1F-0.1 | Verify ingestion_events schema | No |
| 1F-0.2 | Verify ingestion_events data state for BCL | No |
| 1F-0.3 | Verify SCI execute-bulk wiring to ingestion_events | No |
| 1F-0.4 | Verify upload-service operative state | No |
| 1F-0.5 | Verify import_batches ↔ ingestion_events relationship | No |
| 1F-0.6 | Synthesis — produce Path X/Y/Z disposition | Halt for architect |

---

## 7. COMPLETION REPORT SCAFFOLD (CC POPULATES)

```markdown
# HF-196 Phase 1F-0 — Empirical State Verification Report

**Phase:** 1F-0 (Read-Only Verification)
**Branch:** hf-196-platform-restoration-vertical-slice
**Date executed:** <YYYY-MM-DD>

## Phase 1F-0.1: ingestion_events Schema
- Table exists: <yes/no>
- Columns present: <list>
- file_hash_sha256 column: <PRESENT/ABSENT>
- batch_id FK to import_batches: <present/absent>
- supersedes_event_id FK: <present/absent>
- Indexes: <list>

## Phase 1F-0.2: ingestion_events Data State (BCL tenant)
- Total rows for tenant: <count>
- Rows with non-null file_hash_sha256: <count>
- Most recent row sample: <pasted minus PII>
- Status distribution: <count by status>

## Phase 1F-0.3: SCI execute-bulk Wiring
- Reference to ingestion_events in route file: <yes/no>
- Reference to ingestion-events POST route: <yes/no>
- Reference to upload-service module: <yes/no>
- file_hash_sha256 populated by execute-bulk: <yes/no, with line refs>

## Phase 1F-0.4: upload-service Module
- File exists: <yes/no, path>
- computeSHA256 function present: <yes/no>
- Module imported by which surfaces: <list>
- Module operative for current import flow: <PASS/FAIL/UNKNOWN>

## Phase 1F-0.5: import_batches ↔ ingestion_events Relationship
- For BCL recent batches (Phase 1E + 5-RESET-4 era): is there a corresponding ingestion_events row?
- If yes: how is the linkage made (FK direction, populated values)?
- If no: import_batches exists in isolation from OB-50 audit chain

## Phase 1F-0.6: Synthesis

| Surface | Operative? | Evidence |
|---|---|---|
| ingestion_events table | yes/partial/no | <ref> |
| file_hash_sha256 column | yes/partial/no | <ref> |
| SHA computation in flow | yes/partial/no | <ref> |
| OB-50 → import_batches link | yes/partial/no | <ref> |

**Path verdict:** X / Y / Z / Other

**Path X (operative + populated):** Phase 1F can use ingestion_events.file_hash_sha256 directly. Schema additions to import_batches: just FK to ingestion_events (or use existing batch_id if present). Helper module updates: replace fingerprint-based query with SHA-based query.

**Path Y (partial):** Phase 1F includes wiring repair — ensure SCI execute-bulk populates ingestion_events with SHA for every import. Scope expansion vs Path X.

**Path Z (unwired):** Phase 1F adds SHA computation directly inside SCI execute-bulk + stores on import_batches.file_hash_sha256 column. Bypasses OB-50 surface (substrate-extending decision required); SOC 2 audit-trail discipline preserved by ensuring import_batches becomes the audit anchor.

**Architectural implications surfaced:**
- <any unanticipated findings>
- <any related surface drift discovered>
```

---

## 8. END OF DIRECTIVE — NEXT SECTION IS CC PASTE BLOCK

The remainder (§9) is CC's operational paste content. Per Rule 29: nothing follows.

---

## 9. CC PASTE BLOCK

> CC: paste this entire section verbatim into operational context. Execute sequentially. HALT only at 1F-0.6 synthesis to surface evidence to architect.

### 9.1 Read first

- `CC_STANDING_ARCHITECTURE_RULES.md`
- `SCHEMA_REFERENCE_LIVE.md`

### 9.2 Phase 1F-0.1 — ingestion_events schema

```bash
cd ~/spm-platform/web
set -a && source .env.local && set +a

# Probe ingestion_events schema via column-by-column existence test
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const probes = ['id','tenant_id','batch_id','uploaded_by','uploaded_by_email','uploaded_by_role','file_name','file_size_bytes','file_type','file_hash_sha256','storage_path','uploaded_at','status','classification_result','validation_result','record_count','sheet_count','supersedes_event_id','created_at'];
console.log('=== ingestion_events column probe ===');
for (const col of probes) {
  const { error } = await sb.from('ingestion_events').select(col).limit(0);
  console.log(\`  \${col}: \${error ? 'ABSENT — ' + error.message : 'present'}\`);
}
" 2>&1
```
Paste output. Identify which columns from OB-50 spec are present vs absent.

### 9.3 Phase 1F-0.2 — ingestion_events data state for BCL

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// Total row count
const { count: totalCount, error: countError } = await sb
  .from('ingestion_events')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', tenantId);
console.log('Total ingestion_events rows for BCL:', totalCount, countError ? 'ERROR: '+countError.message : '');

// Try to fetch with file_hash_sha256 if present (will error if column absent)
const { data, error } = await sb
  .from('ingestion_events')
  .select('id, batch_id, file_name, file_hash_sha256, status, created_at')
  .eq('tenant_id', tenantId)
  .order('created_at', { ascending: false })
  .limit(5);
if (error) {
  console.log('Sample query error (likely column missing):', error.message);
} else {
  console.log('Most recent 5 rows:', JSON.stringify(data, null, 2));
}
" 2>&1
```
Paste output.

### 9.4 Phase 1F-0.3 — SCI execute-bulk wiring to ingestion_events

```bash
cd ~/spm-platform

echo '=== Search for ingestion_events references in SCI execute paths ==='
grep -n "ingestion_events" web/src/app/api/import/sci/execute-bulk/route.ts 2>&1 | head -20
echo '---'
grep -n "ingestion_events" web/src/app/api/import/sci/execute/route.ts 2>&1 | head -20
echo '---'
grep -n "file_hash_sha256\|fileHashSha256\|fileHash" web/src/app/api/import/sci/execute-bulk/route.ts web/src/app/api/import/sci/execute/route.ts 2>&1 | head -30
echo '---'
echo '=== Search for upload-service imports in SCI paths ==='
grep -rn "upload-service\|upload_service\|uploadService" web/src/app/api/import/ web/src/lib/sci/ --include="*.ts" 2>&1 | head -20
echo '---'
echo '=== Search for /api/ingest references ==='
grep -rn "/api/ingest" web/src/ --include="*.ts" --include="*.tsx" 2>&1 | head -20
```
Paste output.

### 9.5 Phase 1F-0.4 — upload-service operative state

```bash
echo '=== upload-service module existence ==='
ls -la web/src/lib/ingestion/ 2>&1
echo '---'
test -f web/src/lib/ingestion/upload-service.ts && echo "upload-service.ts EXISTS" || echo "upload-service.ts ABSENT"
echo '---'
echo '=== upload-service callers (where is it imported?) ==='
grep -rn "from.*ingestion/upload-service\|from.*upload-service" web/src/ --include="*.ts" --include="*.tsx" 2>&1 | head -20
echo '---'
echo '=== /api/ingest/event route existence ==='
ls -la web/src/app/api/ingest/ 2>&1
echo '---'
echo '=== SHA-256 hash computation references in code ==='
grep -rn "computeSHA256\|crypto.subtle.digest\|sha256.*file\|SHA-256" web/src/ --include="*.ts" --include="*.tsx" 2>&1 | head -20
```
Paste output.

### 9.6 Phase 1F-0.5 — import_batches ↔ ingestion_events relationship

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// Get current BCL import_batches
const { data: batches } = await sb
  .from('import_batches')
  .select('id, file_name, created_at')
  .eq('tenant_id', tenantId)
  .order('created_at', { ascending: false });
console.log('=== BCL import_batches ===');
console.log(JSON.stringify(batches, null, 2));

// For each, look up matching ingestion_events row by batch_id
console.log('\\n=== Matching ingestion_events rows ===');
for (const batch of batches ?? []) {
  const { data: events, error: e } = await sb
    .from('ingestion_events')
    .select('id, file_name, status, created_at')
    .eq('batch_id', batch.id);
  console.log(\`batch_id \${batch.id} (\${batch.file_name}): \${e ? 'error: '+e.message : (events?.length ?? 0) + ' matching events'}\`);
  if (events && events.length > 0) {
    console.log('  ', JSON.stringify(events, null, 2));
  }
}
" 2>&1
```
Paste output.

### 9.7 Phase 1F-0.6 — Synthesis

CC produces synthesis table per §7 scaffold. Surfaces all evidence; produces Path X / Y / Z verdict; HALTS for architect disposition.

**Synthesis must include:**

1. **Schema operativeness:** which OB-50 columns exist on `ingestion_events` (yes/no per column)
2. **Data populativeness:** does BCL have any rows in `ingestion_events`? Are file_hash_sha256 values populated for any?
3. **Wiring evidence:** does SCI execute-bulk reference `ingestion_events`? Does it reference `upload-service`? Does it compute SHA-256?
4. **Linkage evidence:** for the 4 BCL import_batches in current state (Phase 1E + Phase 5-RESET-4 + Oct + Nov roster + transactions), how many have corresponding `ingestion_events` rows?
5. **Path verdict:** X / Y / Z / Other (with reasoning from above evidence)
6. **Anything unanticipated:** related surfaces, drift discoveries, schema unknowns

CC writes the synthesis to chat (no file commit). Pastes the full evidence to architect channel. Halts for architect's Phase 1F path disposition.

### 9.8 Phase 1F-0 closing

No commit (read-only phase; nothing to commit). After architect dispositions Path X/Y/Z, Phase 1F design begins as a separate directive.

**End of Phase 1F-0 directive.**
