# HF-196 Phase 1F — Supersession Trigger Correction via Content Hash

**Continuation of HF-196 vertical slice**
**Branch:** `hf-196-platform-restoration-vertical-slice` (HEAD: `3293b543` Phase 1E)
**Date authored:** 2026-05-03
**Architect:** Andrew (vialuce founder)

---

## 1. PHASE OBJECTIVE

Phase 1E supersession trigger uses `(tenant_id, structural_fingerprint)` per DS-017. Empirical evidence at Phase 5C-2 shows this triggers wrongly: Oct + Nov BCL transaction files share fingerprint `fbead6eed137...` (DS-017 §2.3 anticipates this — same column shape produces same fingerprint). Phase 1E supersession misfired: Nov superseded Oct.

DS-017 fingerprint identifies *classification class*, not *dataset identity*. Supersession trigger needs a different primitive: **file content identity (SHA-256)**.

This phase replaces the supersession trigger primitive without changing Phase 1E's compliance-preserving architecture. The supersede-not-delete pattern, audit columns, engine operative-only filtering, and SOC 2 / GDPR / LGPD discipline all remain. Only the *condition under which supersession fires* changes.

---

## 2. SUBSTRATE GROUNDING

### 2.1 OB-50 (LOCKED Feb 17, 2026) — SHA-256 Content Hash

> "SOC2 Security: File content hash verification. SHA-256 computed client-side, verified server-side."
> 
> "Three-Layer Data Architecture: Raw Layer (immutable) → Transformed → Committed. Original data is sacrosanct."

OB-50 defined `file_hash_sha256` on `ingestion_events` as the dataset-identity primitive. Web Crypto API spec verbatim:

```typescript
async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

### 2.2 Phase 1F-0 Verdict (this session, 2026-05-03)

OB-50 surface unwired: 4/19 columns present on `ingestion_events`; 0 rows for any tenant; SCI flow bypasses entirely; `upload-service.ts` orphaned. SHA-256 primitive is not operationally available via OB-50 surface.

**Path Z (substrate-extending):** Compute SHA-256 inline in SCI flow + store on `import_batches` directly. Bypasses broken OB-50 surface; documented as carry-forward; OB-50 wiring restoration deferred to HF-199.

### 2.3 DS-017 (LOCKED March 18, 2026) — Structural Fingerprint Distinct From Content Hash

> "Fingerprint excludes: data values, row count, file name, file size."

DS-017 fingerprint stays unchanged for analyze-time Tier 1 immunity (Phase 5-RESET-4 verified this works correctly: same fingerprint → match_count increment → LLM skipped). DS-017's purpose is classification reuse, not dataset identity. Two different primitives, two different surfaces, two different purposes.

### 2.4 HF-132 (March 12, 2026) — Plan Rule_Set Supersession Precedent

> "SCI execute sets status='active' when saving an AI-interpreted plan. Prior active rule_sets for the same tenant set to 'superseded'."

Plans handle supersession at the `rule_sets` layer independently of `import_batches`. This means plan re-imports under Phase 1F's content-hash supersession can be uniform across classifications: same content → supersede import_batch; different content (corrected plan) → additive import_batch + rule_sets layer activates the new plan and supersedes the prior. No classification-aware logic needed at the import_batches layer.

### 2.5 HF-141 (March 18, 2026) — Per-File Storage Path Isolation

> "storagePaths?.[sourceFile] || storagePath — the fallback to file 1's path when file N's key was missing. Fix: multi-file mode never falls back to another file's path. Upload paths use index + randomUUID for uniqueness."

HF-141 established that multi-file imports already produce per-file isolation at the storage layer. Phase 1F's SHA-256 computation operates on per-file content already isolated by HF-141.

### 2.6 OB-42 Phase 4 (LOCKED Feb 16, 2026) — Engine-Side Operative Selection

`getActiveBatch` substrate pattern from `web/src/lib/calculation/calculation-service.ts`:

```typescript
let query = supabase
  .from('calculation_batches')
  .select('*')
  .eq('tenant_id', tenantId)
  .is('superseded_by', null)
  .order('created_at', { ascending: false })
  .limit(1);
```

Engine-side operative selection uses `superseded_by IS NULL`. Phase 1E mirrored this on `import_batches`. Phase 1F preserves; engine reads need no change.

### 2.7 Memory Entry 30 — Reconstructive Regression Pattern

This session has produced four remediation cycles:
- Phase 1B: HF-186 entity classifier regression
- Phase 1C: source_date semantic role honoring
- Phase 1D: semantic data_type derivation
- Phase 1E: import idempotency (correct architecture, wrong trigger primitive)

Phase 1F is the trigger correction. The session's discipline going forward: empirical verification before each phase; no substrate citation without body-fidelity; CC reports structural facts, architect dispositions, Claude designs.

### 2.8 Recusal Gate

**PASS.** Phase 1F amends VP code surfaces + applies a schema migration. Does not amend IRA-governing substrate.

### 2.9 Architect Approval Gate (with Substrate-Extending Acknowledgment)

**PASS with substrate-extending acknowledgment.** Architect dispositioned 2026-05-03:
- Path Z.1-A: SHA-256 supersession trigger uniform across classifications
- Substrate-extending: `import_batches.file_hash_sha256` becomes the SHA anchor (substrate intent per OB-50 was `ingestion_events`); HF-199 candidate restores OB-50 properly
- Phase 1E architecture preserved (supersession columns, engine operative filter, audit-trail discipline)
- Plans handled uniformly via Z.1-A; rule_sets-layer plan supersession (HF-132) is the additional plan-correction mechanism

---

## 3. INVARIANTS

- **Phase 1E architecture preserved.** Supersession columns, audit-trail, engine operative filter unchanged.
- **DS-017 fingerprint unchanged.** Stays as locked for analyze-time Tier 1 immunity.
- **SHA-256 content identity primitive.** New surface on `import_batches.file_hash_sha256`. Computed inline in SCI execute-bulk + execute (server-side, since file is already parsed at that point in flow).
- **Path B-prime FK retained.** `structural_fingerprints.import_batch_id` from Phase 1E stays as lineage primitive (which import_batch first established this fingerprint?). Not load-bearing for supersession; preserves lineage for foundational flywheel work.
- **D154/D155 single canonical surface.** import_batches is supersession source-of-truth; classification stays on structural_fingerprints; SHA stays on import_batches.
- **Korean Test (T1-E910).** SHA-256 is structural primitive (cryptographic hash of bytes); zero domain literals.
- **SOC 2 / GDPR / LGPD compliance.** Audit trail preserved; no destructive operations; supersession audit columns retained.
- **Memory entry 30.** Same-content re-import produces operative-row count = single-import row count; same-shape different-content imports accumulate.

---

## 4. CRITICAL HALT CONDITIONS

1. **SHA-256 cannot be computed inline at SCI execute-bulk site** — file content not available at the supersession-check site; surface for architect; Phase 1F design needs adjustment
2. **Existing 4 BCL import_batches cannot be backfilled with SHA-256** — would leave Phase 1F partially operational; surface
3. **Engine query patterns reveal hidden coupling to fingerprint-based supersession** — Phase 1E engine reads filter via `superseded_by IS NULL` (pattern preserved); but if any engine-side code reads the fingerprint at supersession-check time, surface
4. **Plan import path (commit/route.ts) shows different SHA computation requirements** — surface; substrate-extending plan-side decision
5. **Build fails** with structural defect not solvable in scope
6. **Korean Test gate fails**
7. **SR-39 compliance matrix has un-fillable cell** beyond Decision 123 (already TBD per Phase 1E)

---

## 5. AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER pause for confirmation between sub-phases. Execute every sub-phase sequentially. HALT only on Critical HALT Conditions or architect-signal-required points.

---

## 6. CC FAILURE PATTERNS TO PREVENT

| # | Pattern | Prevention |
|---|---|---|
| FP-49 | Schema fabrication | Phase 1F-1 audit before 1F-2 migration |
| Recurrence | Substrate citation drift | This phase cites HF-132 (plan supersession), HF-141 (per-file isolation), OB-42 Phase 4 (engine pattern) — all body-fidelity verified via project_knowledge_search |
| Bypass (SR-34) | Rolling back Phase 1E instead of correcting trigger | Phase 1F preserves Phase 1E architecture; only trigger primitive changes |
| Korean Test | Filename matching introduced as side effect of SHA computation | SHA computes over file CONTENT bytes only; filename excluded |
| Architect-as-courier | CC interpreting plan-supersession ambiguity | Z.1-A is architect-dispositioned; CC implements uniformly |
| Vertical Slice | Schema migration without engine alignment | Engine reads need no change (Phase 1E filter already correct); explicitly verified in 1F-5 |
| FP-70 | Phase deferral as completion | All sub-phases ship single commit; closure requires 5-RESET-5 PASS |

---

## 7. PHASE STRUCTURE

| Sub-phase | Scope | Architect signal? |
|---|---|---|
| 1F-1 | Schema audit + SHA computation site identification (read-only) | No |
| 1F-2 | Migration SQL authoring + application | **Yes** ("migration applied") |
| 1F-3 | Update supersession helper module | No |
| 1F-4 | Wire SHA-256 computation into 2 SCI paths | No |
| 1F-5 | Engine query verification (no change expected; verify) | No |
| 1F-6 | Korean Test gate | No |
| 1F-7 | SR-39 compliance verification | No |
| 1F-8 | Self-test (read-only) | No |
| 1F-9 | Commit + push | No |
| 5-RESET-5 | Empirical verification | **Yes** (wipe; first import; second-same-content; third-different-content) |

---

## 8. COMPLETION REPORT SCAFFOLD (CC POPULATES)

```markdown
# HF-196 Phase 1F — Completion Report

**Phase:** 1F (Supersession Trigger Correction via Content Hash)
**Branch:** hf-196-platform-restoration-vertical-slice
**Final commit:** <SHA>
**Date executed:** <YYYY-MM-DD>

## Phase 1F-1: Schema Audit + SHA Site Identification
- import_batches columns post-Phase-1E: <pasted>
- Existing file content access points in execute-bulk: <pasted line refs>
- Existing file content access points in execute: <pasted line refs>
- SHA computation insertion site identified: <line ref>
- Decision: compute via Web Crypto subtle.digest in Node runtime (server-side; same primitive as OB-50 client-side spec; bytes are bytes)

## Phase 1F-2: Migration
- Migration file path: <path>
- SQL pasted: <yes/no>
- Architect signal "migration applied": <timestamp>
- Post-application verification output: <pasted>
- Backfill verification: existing 4 BCL batches received SHA values: <pasted>

## Phase 1F-3: Supersession Helper Update
- findPriorOperativeBatch query updated: structural_fingerprint → file_hash_sha256
- Function signature unchanged (same param: tenantId, hash, newBatchId)
- TypeScript build: <exit code>

## Phase 1F-4: SHA Computation Wiring
- execute-bulk SHA computation site: <line ref>
- execute SHA computation site: <line ref>
- grep verification: <pasted>
- Build: <exit code>

## Phase 1F-5: Engine Query Verification
- All Phase 1E-5 sites still filter via superseded_by IS NULL: <pasted grep>
- No engine-side reads consume fingerprint for operative-batch resolution: <pasted>

## Phase 1F-6: Korean Test
- Script output: <pasted>
- Verdict: PASS/FAIL

## Phase 1F-7: SR-39 Compliance Matrix
| Requirement | Verification | Verdict |
|---|---|---|
| SOC 2 CC6.1 | <evidence> | PASS/FAIL |
| SOC 2 CC7.2 | <evidence> | PASS/FAIL |
| GDPR Article 30 | <evidence> | PASS/FAIL |
| LGPD Article 37 | <evidence> | PASS/FAIL |
| DS-014 access control | <evidence> | PASS/FAIL |
| Decision 123 | <evidence> | PASS/FAIL/GAP |

## Phase 1F-8: Self-Test
- Pre-Phase-5-RESET-5 import_batches state: <pasted>
- file_hash_sha256 values for current BCL batches: <pasted>

## Phase 1F-9: Commit
- Commit SHA: <SHA>
- Push confirmation: <pasted>

## Phase 5-RESET-5: Empirical Verification
- Wipe applied: <timestamp>
- First import (BCL_Plantilla_Personal.xlsx): SHA captured: <hash>; status operative
- Second import (SAME file): SHA matches; supersession FIRES (Phase 1E behavior preserved)
- Third import (BCL_Datos_Oct2025.xlsx): different SHA; additive (NEW operative batch); supersession does NOT fire
- Fourth import (BCL_Datos_Nov2025.xlsx): different SHA than Oct; additive (NEW operative batch); fingerprint match_count increments (analyze-layer Tier 1 still works)

## Phase 1F PASS criteria
| Check | Expected | Actual | Verdict |
|---|---|---|---|
| import_batches schema | file_hash_sha256 column present | <yes/no> | |
| Backfill complete | All 4 BCL batches have non-null SHA | <count> | |
| Roster re-import (same content) | supersedes prior | <yes/no> | |
| Oct + Nov transactions | both operative | <count operative> | |
| Engine query | reads operative-only | <pasted> | |
| Phase 1E architecture preserved | supersession columns + audit trail | <verified> | |

## Out-of-Scope Carry-Forward
- HF-199 candidate: OB-50 surface restoration (15 schema columns + SCI integration to ingestion_events)
- HF-198 candidate: OB-42 Phase 4 calculation_batches audit-column gap (superseded_at + supersession_reason)
- commit/route.ts + intelligence/wire/route.ts data_type vocabulary (Phase 1D carry-forward)
- Cross-tenant fingerprint sharing (Tier 2 foundational flywheel)

## Phase 1F Verdict
PASS / FAIL / PASS-WITH-DELTA
```

---

## 9. OUT OF SCOPE

- **OB-50 surface restoration** — 15 missing columns on ingestion_events; SCI flow integration to ingestion_events; upload-service wiring to current import path. HF-199 candidate.
- **calculation_batches audit-column gap** — `superseded_at` + `supersession_reason` missing per Phase 1E-1 finding. HF-198 candidate.
- **commit/route.ts + intelligence/wire/route.ts data_type vocabulary** — Phase 1D out-of-scope.
- **Plan-side import_batches semantics under Z.1-A** — uniform with rosters/transactions in Phase 1F; HF-132 rule_sets-layer plan supersession is the plan-correction mechanism. If 5D plan import surfaces issue, separate disposition.
- **UI rendering correctness** — UI showing 34% confidence on Tier 1 hit (5-RESET-3 finding); UI vertical slice post-HF-196.

---

## 10. END OF DIRECTIVE — NEXT SECTION IS CC PASTE BLOCK

Per Rule 29: nothing follows §11.

---

## 11. CC PASTE BLOCK

> CC: paste this section verbatim into operational context. Execute sequentially. HALT only at explicit signal-required points.

### 11.1 Read first

- `CC_STANDING_ARCHITECTURE_RULES.md` (SR-34, SR-39, SR-41, SR-42, Rule 27, Rule 28, Rule 29)
- `SCHEMA_REFERENCE_LIVE.md`

### 11.2 Phase 1F-1 — Schema audit + SHA computation site identification

#### 11.2.1 Confirm Phase 1E columns present on import_batches
```bash
cd ~/spm-platform/web
set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const probes = ['superseded_by','supersedes','superseded_at','supersession_reason','file_hash_sha256'];
console.log('=== import_batches Phase 1E + 1F probe ===');
for (const col of probes) {
  const { error } = await sb.from('import_batches').select(col).limit(0);
  console.log(\`  \${col}: \${error ? 'ABSENT' : 'present'}\`);
}
" 2>&1
```
Expected: 4 Phase 1E columns present, `file_hash_sha256` ABSENT (target of Phase 1F migration). Paste output.

#### 11.2.2 Identify SHA computation insertion sites in execute-bulk
```bash
cd ~/spm-platform
echo "=== execute-bulk file content access points ==="
grep -nE "downloadAsBuffer|file\\.arrayBuffer|XLSX\\.read|readFile|Buffer\\.from" web/src/app/api/import/sci/execute-bulk/route.ts | head -20
echo "---"
echo "=== execute-bulk supersession helper invocation ==="
grep -nE "linkFingerprintAndSupersedePriorBatch|supersedePriorBatchIfExists|findPriorOperativeBatch" web/src/app/api/import/sci/execute-bulk/route.ts | head -10
echo "---"
echo "=== execute file content access points ==="
grep -nE "downloadAsBuffer|file\\.arrayBuffer|XLSX\\.read|readFile|Buffer\\.from" web/src/app/api/import/sci/execute/route.ts | head -20
echo "---"
echo "=== execute supersession helper invocation ==="
grep -nE "linkFingerprintAndSupersedePriorBatch|supersedePriorBatchIfExists|findPriorOperativeBatch" web/src/app/api/import/sci/execute/route.ts | head -10
```
Paste output. Identify the insertion site for SHA-256 computation: ideally where the file buffer is already available, BEFORE the supersession check fires.

#### 11.2.3 Verify supersession helper module current state
```bash
echo "=== current findPriorOperativeBatch implementation ==="
grep -A 30 "findPriorOperativeBatch" web/src/lib/sci/import-batch-supersession.ts | head -50
```
Paste output. Confirm current query uses `(tenant_id, structural_fingerprint)` pattern; identify what changes for SHA-based query.

#### 11.2.4 Synthesis
Produce table:

| Surface | Current state | Phase 1F action |
|---|---|---|
| import_batches.file_hash_sha256 | <ABSENT/present> | Add via migration |
| SHA computation sites | <line refs> | Insert hash computation before supersession check |
| Supersession helper | (tenant_id, structural_fingerprint) | (tenant_id, file_hash_sha256) |
| Engine query filter | superseded_by IS NULL | Unchanged |

Surface to architect for review. **HALT** for architect confirmation before Phase 1F-2.

### 11.3 Phase 1F-2 — Migration SQL

#### 11.3.1 Author migration
After architect confirms 1F-1, create `web/supabase/migrations/<UTC-timestamp>_hf196_phase1f_import_batch_content_hash.sql`:

```sql
-- HF-196 Phase 1F: Import Batch Content Hash (Path Z.1-A)
-- Substrate-extending: import_batches becomes SHA anchor (OB-50 surface unwired per Phase 1F-0)
-- HF-199 candidate restores OB-50 ingestion_events surface properly
-- Pattern: dataset-identity primitive separate from DS-017 classification-identity primitive

BEGIN;

-- Add SHA-256 content hash column to import_batches
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS file_hash_sha256 TEXT;

-- Index for supersession lookup: (tenant_id, file_hash_sha256) finds prior operative batch
CREATE INDEX IF NOT EXISTS idx_import_batches_tenant_content_hash
  ON import_batches (tenant_id, file_hash_sha256)
  WHERE superseded_by IS NULL;

-- Backfill: compute deterministic placeholder hash for existing batches
-- Existing 4 BCL batches predate this column; cannot retroactively SHA the original files
-- Strategy: use a synthetic hash derived from batch.id (deterministic; ensures NOT NULL constraint
-- can be added in future migration after a clean-slate cycle)
-- Pre-Phase-1F batches will be cleared by 5-RESET-5 wipe; backfill is for safety only
UPDATE import_batches
  SET file_hash_sha256 = 'pre_phase1f_' || substring(replace(id::text, '-', ''), 1, 16)
  WHERE file_hash_sha256 IS NULL;

COMMIT;
```

Paste full SQL adjusted per 1F-1 audit.

#### 11.3.2 Surface to architect
**HALT for architect signal "migration applied"** — architect pastes SQL into Supabase Dashboard SQL Editor, executes, signals back.

#### 11.3.3 Post-application verification
```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// Verify column exists + populated for existing batches
const { data, error } = await sb
  .from('import_batches')
  .select('id, file_name, file_hash_sha256, superseded_by')
  .eq('tenant_id', tenantId);
console.log('post-migration import_batches:', JSON.stringify(data, null, 2));
console.log('error:', error?.message);
" 2>&1
```
Paste output. All 4 BCL batches must have non-null `file_hash_sha256` (placeholder values acceptable; will be cleared on 5-RESET-5 wipe).

#### 11.3.4 Refresh SCHEMA_REFERENCE_LIVE.md
Update import_batches section with `file_hash_sha256` column. Commit at 1F-9.

### 11.4 Phase 1F-3 — Update supersession helper module

File: `web/src/lib/sci/import-batch-supersession.ts`

Modify `findPriorOperativeBatch`:

```typescript
async function findPriorOperativeBatch(
  supabase: SupabaseClient,
  tenantId: string,
  fileHashSha256: string,  // RENAMED from fingerprintHash
  newBatchId: string,
): Promise<string | null> {
  // Query import_batches by (tenant_id, file_hash_sha256), filtered to operative
  const { data, error } = await supabase
    .from('import_batches')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('file_hash_sha256', fileHashSha256)
    .is('superseded_by', null)
    .neq('id', newBatchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Supersession lookup failed: ${error.message}`);
  }

  return data?.id ?? null;
}
```

Update `supersedePriorBatchIfExists` and `linkFingerprintAndSupersedePriorBatch` callers to pass `fileHashSha256` instead of `fingerprintHash`. Function names may stay (the supersession-trigger primitive is the change; function semantics are still "supersede prior on identity match").

Korean Test compliant: `fileHashSha256` is structural primitive (cryptographic hash output).

Build:
```bash
cd web && npx tsc --noEmit 2>&1 | head -10
```
Must exit 0.

### 11.5 Phase 1F-4 — Wire SHA-256 computation into SCI paths

#### 11.5.1 SHA-256 computation utility

Add to `web/src/lib/sci/import-batch-supersession.ts` (or shared utility module):

```typescript
import { createHash } from 'node:crypto';

/**
 * Compute SHA-256 hash of file content bytes.
 * Server-side equivalent of OB-50 spec (which used Web Crypto API client-side).
 * Bytes are bytes; produces same hex digest as Web Crypto subtle.digest.
 */
export function computeFileHashSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
```

#### 11.5.2 execute-bulk wiring

At the site where file is downloaded/parsed (per 11.2.2 line refs), compute SHA after the file buffer is available, BEFORE the supersession helper invocation:

```typescript
import { computeFileHashSha256 } from '@/lib/sci/import-batch-supersession';

// After: const buffer = await downloadAsBuffer(storagePath);  (or equivalent)
const fileHashSha256 = computeFileHashSha256(buffer);

// When inserting import_batch:
const { data: newBatch } = await supabase
  .from('import_batches')
  .insert({
    tenant_id: tenantId,
    file_name: fileName,
    file_hash_sha256: fileHashSha256,
    // ... other fields
  })
  .select()
  .single();

// Then supersession check uses the same hash:
const supersessionResult = await supersedePriorBatchIfExists(
  supabase,
  tenantId,
  fileHashSha256,  // NOT fingerprintHash
  newBatch.id,
);
```

#### 11.5.3 execute (plan path) wiring

Same pattern for `web/src/app/api/import/sci/execute/route.ts`.

#### 11.5.4 Verify
```bash
cd ~/spm-platform
grep -rn "computeFileHashSha256\|file_hash_sha256" web/src/ --include="*.ts" 2>&1 | head -30
```
Expected: 1 utility export + 2 import_batches insertion sites + 2 supersession-check sites referencing fileHashSha256. Paste output.

#### 11.5.5 Build
```bash
cd web && rm -rf .next && npm run build 2>&1 | tail -20
```
Must exit 0. Paste tail.

### 11.6 Phase 1F-5 — Engine query verification

```bash
echo "=== Verify all Phase 1E engine query sites still filter via superseded_by IS NULL ==="
grep -rnE "superseded_by|fetchSupersededBatchIds" web/src/lib/calculation/ web/src/app/api/calculation/ web/src/lib/intelligence/ --include="*.ts" 2>&1 | head -30
echo "---"
echo "=== Verify no engine-side reads consume structural_fingerprint for operative-batch resolution ==="
grep -rnE "structural_fingerprint.*superseded|fingerprint.*operative" web/src/lib/calculation/ web/src/app/api/calculation/ --include="*.ts" 2>&1 | head -10
echo "(expected: zero matches — engine resolves operativeness via superseded_by, not fingerprint)"
```
Paste output. Confirm Phase 1E engine pattern preserved.

### 11.7 Phase 1F-6 — Korean Test
```bash
cd ~/spm-platform
bash scripts/verify-korean-test.sh 2>&1 | tail -20
```
Must PASS.

### 11.8 Phase 1F-7 — SR-39 Compliance Matrix

| Requirement | Verification | Verdict |
|---|---|---|
| SOC 2 CC6.1 | No destructive ops; supersession audit columns retained from Phase 1E; existing RLS unchanged | PASS |
| SOC 2 CC7.2 | Same-content re-imports preserve prior batch (Phase 1E behavior); different content additive (no destruction); audit chain complete | PASS |
| GDPR Article 30 | Complete supersession lineage queryable via supersedes/superseded_by | PASS |
| LGPD Article 37 | Same as GDPR | PASS |
| DS-014 access control | Existing tenant_id RLS preserved; supersession respects tenant scope | PASS |
| Decision 123 | <CC retrieves; if unretrievable, mark TBD per Phase 1E precedent> | TBD |

Paste in completion report.

### 11.9 Phase 1F-8 — Self-test (read-only)

```typescript
// scripts/diag-hf196-phase1f-verification.ts (DO NOT COMMIT)
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

const { data: batches } = await sb
  .from('import_batches')
  .select('id, file_name, file_hash_sha256, superseded_by, supersedes, superseded_at, created_at')
  .eq('tenant_id', tenantId)
  .order('created_at', { ascending: false });
console.log('post-Phase-1F import_batches state:', JSON.stringify(batches, null, 2));
```
Paste; delete script.

### 11.10 Phase 1F-9 — Commit

```bash
cd ~/spm-platform
git add -A
git status
```
Confirm scope:
- `web/src/lib/sci/import-batch-supersession.ts` (modified — helper update + SHA utility)
- `web/src/app/api/import/sci/execute-bulk/route.ts` (modified — SHA computation wiring)
- `web/src/app/api/import/sci/execute/route.ts` (modified — SHA computation wiring)
- `web/supabase/migrations/<timestamp>_hf196_phase1f_*.sql` (new)
- `SCHEMA_REFERENCE_LIVE.md` (modified)

```bash
git commit -m "HF-196 Phase 1F: Supersession trigger correction via SHA-256 content hash — DS-017 fingerprint preserved for analyze-time Tier 1; import_batches.file_hash_sha256 substrate-extending anchor (HF-199 restores OB-50 properly); Phase 1E architecture preserved; closes Oct/Nov supersession misfire"
git push origin hf-196-platform-restoration-vertical-slice
git log --oneline -1
```
Paste commit SHA + push confirmation.

### 11.11 Phase 5-RESET-5 — Empirical verification

Restart dev server:
```bash
pkill -f "next dev" 2>&1; sleep 1
cd ~/spm-platform/web
rm -rf .next
set -a && source .env.local && set +a
npm run build 2>&1 | tail -20
> /tmp/hf196_dev.log
npm run dev > /tmp/hf196_dev.log 2>&1 &
sleep 8
curl -I http://localhost:3000/login
git log --oneline -1
```
Paste outputs.

**HALT — surface to architect:**

> Phase 1F commit landed: <SHA>. Dev rebuilt. Awaiting architect signals for empirical verification:
>
> 1. **"wipe applied"** — BCL clean-slate via Supabase Dashboard SQL Editor (same SQL as Phase 5-RESET-3/4)
> 2. **"5-RESET-5 first import done"** — architect imports BCL_Plantilla_Personal.xlsx (first encounter; operative; SHA stored)
> 3. **"5-RESET-5 second import done"** — architect imports SAME BCL_Plantilla_Personal.xlsx file again (Phase 1E supersession should still fire — same SHA = same content)
> 4. **"5-RESET-5 third import done"** — architect imports BCL_Datos_Oct2025.xlsx (different SHA; additive — supersession should NOT fire even though fingerprint may match prior transactions)
> 5. **"5-RESET-5 fourth import done"** — architect imports BCL_Datos_Nov2025.xlsx (different SHA from Oct; additive — supersession should NOT fire even though fingerprint matches Oct)

CC verifies after each signal.

#### Phase 1F PASS criteria

After signal 5:
| Check | Expected | Actual | Verdict |
|---|---|---|---|
| import_batches count | 4 | <pasted> | |
| Roster supersession (signal 2) | older roster superseded by newer | <pasted> | |
| Oct SHA | non-null, distinct from roster SHA | <pasted> | |
| Nov SHA | non-null, distinct from Oct SHA | <pasted> | |
| Oct supersession check | Oct NOT superseded | superseded_by null | |
| Nov supersession check | Nov NOT superseded | superseded_by null | |
| structural_fingerprints match_count for transaction fingerprint | 2 (analyze-layer flywheel firing per DS-017) | <pasted> | |
| Operative committed_data | 85 (roster) + 85 (Oct) + 85 (Nov) = 255 | <pasted> | |
| Total committed_data preserved | 85 (superseded roster) + 255 = 340 | <pasted> | |
| Vercel-equivalent log shows '[Phase 1E] Superseded prior batch' | exactly 1 (signal 2 only) | <pasted> | |

**If all PASS:** Phase 1F closure CONFIRMED. Memory entry 30 commit-layer obligation honored AND multi-month accumulation preserved. Ready for Phase 5C continuation (Dic/Ene/Feb/Mar transactions + plan + calc + reconcile to $312,033).

**If any FAIL:** surface verdict; HALT for architect.

### 11.12 Final Completion Report

Populate §8 scaffold; surface to architect channel.

**End of Phase 1F directive.**
