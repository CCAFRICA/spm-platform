# HF-196 Phase 1E — Import Supersession on Fingerprint Match

**Continuation of HF-196 vertical slice**
**Branch:** `hf-196-platform-restoration-vertical-slice` (HEAD: `70e28a40` Phase 1D)
**Date authored:** 2026-05-02
**Date executed:** TBD
**Architect:** Andrew (vialuce founder)
**Author (Claude design):** Substrate-grounded application of Rule 30 + DS-017

---

## 1. PHASE OBJECTIVE

Close the commit-layer gap exposed by Phase 5-RESET-3 empirical measurement: same-fingerprint second encounter must produce stable row count + Tier 1 cost properties end-to-end, not just at the analyze layer.

Memory Entry 30 (constitutional, locked 2026-05-02): *"A surface that produces cold-start results on every encounter is FAILURE."*

Phase 5-RESET-3 verdict: Progressive Performance **PARTIAL** — analyze-layer flywheel intact (LLM skipped, Tier 1 verdict, fingerprint match_count incremented); execute-bulk commit layer inert (85→170 row inflation on identical re-import; 41.6s elapsed vs 11.4s — 3.65× slower).

Phase 1E applies locked architecture (Rule 30 supersession pattern + DS-017 fingerprint identity) to `import_batches`, paralleling the same pattern already locked on `calculation_batches` per OB-42 Phase 4.

---

## 2. SUBSTRATE GROUNDING (BODY-FIDELITY VERIFIED)

### 2.1 Three-Layer Data Architecture (LOCKED Feb 7, 2026)

> "Original data is sacrosanct. Three-Layer Data Architecture for every import:
> - **Raw Layer** — original data exactly as received, immutable
> - **Transformed Layer** — normalized/enriched/corrected with full lineage
> - **Committed Layer** — approved data that enters the calculation engine
>
> Rollback = uncommit transformed/committed layers; raw layer remains as evidence the import happened. Rollback is architecturally safe because raw is immutable."

### 2.2 Rule 30 — Lifecycle Immutability (LOCKED Feb 14, 2026)

> "OFFICIAL+ batches are immutable records. They cannot be overwritten, reset, or silently replaced. Re-running creates a NEW batch that supersedes the original. The original remains in the database with status `superseded`. Every supersession requires: reason text, actor identity, timestamp, link to predecessor batch."

### 2.3 OB-42 Phase 4 — Supersession Schema (LOCKED Feb 16, 2026, HG-9)

Schema body-fidelity confirmed via `project_knowledge_search` against `AUD-001_CODE_EXTRACTION.md`:

```typescript
calculation_batches: {
  Row: {
    id, tenant_id, period_id, rule_set_id, batch_type, lifecycle_state,
    superseded_by: string | null,
    supersedes: string | null,
    entity_count, summary, config, started_at, completed_at, created_by, created_at, updated_at
  }
}
```

Note: column names are `superseded_by` and `supersedes` (NOT `..._batch_id` suffix). Phase 1E follows same naming on `import_batches`.

### 2.4 DS-017 Adaptive Immunity / Structural Fingerprinting (LOCKED March 18, 2026)

> "Tier 1 — Exact Match (within-tenant immunity). The structural fingerprint matches a stored fingerprint exactly. Cost: ~100ms. This is the 99% case for recurring imports."

Match identifier per DS-017: `(tenant_id, fingerprint_hash)`.

Fingerprint excludes: data values, row count, file name, file size. Two files with different data but the same structure produce the same fingerprint.

### 2.5 SOC/GAAP/Privacy Compliance (Feb 17, 2026; SR-39 governs)

- SOC 2 CC6.1 — logical access controls + audit log integrity
- SOC 2 CC7.2 — system monitoring + logging integrity (records cannot be modified or destroyed)
- GDPR Article 30 — records of processing activities preserved
- LGPD Article 37 — same as GDPR
- DS-014 — access control architecture (existing RLS unchanged)

### 2.6 Memory Entry 30 — Progressive Performance (LOCKED 2026-05-02)

> "A surface that produces cold-start results on every encounter is FAILURE. Reconstruction restores what worked, not builds anew. Every HF/OB closure verifies non-amnesiac behavior empirically against documented operating ranges."

### 2.7 Recusal Gate

**PASS.** Phase 1E amends VP code surfaces + applies a schema migration. Does not amend IRA-governing substrate. Does not amend any T0/T1 IGF substrate.

### 2.8 Architect Approval Gate

**PASS.** Architect dispositioned 2026-05-02:
- Path 1 — extend HF-196 scope to close re-import idempotency
- Supersession (Rule 30 pattern), not destructive replace
- Match identifier `(tenant_id, fingerprint_hash)` per DS-017
- Schema extension to `import_batches` paralleling locked OB-42 Phase 4 calculation_batches
- All evidence preserved (Three-Layer; SOC 2 CC7.2; GDPR Article 30; LGPD Article 37)

---

## 3. INVARIANTS

- **Three-Layer Data Architecture.** Raw layer immutable; superseded committed_data preserved; nothing deleted.
- **Rule 30 supersession pattern applied to import_batches.** Same column shape as calculation_batches: `superseded_by`, `supersedes`, lifecycle state.
- **Single canonical surface (D154/D155).** `import_batches` is lifecycle source-of-truth; `committed_data` inherits via JOIN to `import_batches` lifecycle state.
- **Korean Test (T1-E910).** Match identifier is structural primitive `(tenant_id, fingerprint_hash)`; zero domain literals.
- **DS-017 fingerprint identity.** Within-tenant Tier 1 immunity governs match.
- **SOC 2 / GDPR / LGPD compliance.** Audit trail preserved; no destructive operations on superseded data.
- **Memory entry 30 closure.** Same-file second encounter produces operative-row count = single-import row count; Vercel log shows supersession event.

---

## 4. CRITICAL HALT CONDITIONS

1. **structural_fingerprints schema lacks expected primitives** — if 1E-1 audit reveals fingerprint table doesn't carry `(tenant_id, fingerprint_hash)` queryable surface, supersession lookup cannot proceed structurally. Halt for architect disposition.
2. **calculation_batches schema discrepancy** — if 1E-1 reveals `superseded_by`/`supersedes` columns missing from production schema (despite OB-42 Phase 4 lock), substrate-vs-state divergence; halt per SR-42.
3. **Migration cannot be authored without schema verification** — Phase 1E-2 migration depends on 1E-1 audit. Authoring before audit = FP-49 risk. Sequence enforced.
4. **Engine query pattern unsuited for JOIN-based filtering** — if engine reads from `committed_data` via complex query patterns where adding `import_batches.status='operative'` filter is non-trivial, scope creep risk; halt for architect.
5. **Build fails** with structural defect not solvable in scope.
6. **Korean Test gate fails.**
7. **SR-39 compliance matrix has un-fillable cell** — Decision 123 substrate citation, if unretrievable, surfaced for architect.

ALL OTHER ISSUES: CC resolves structurally and continues.

---

## 5. AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER pause for confirmation between sub-phases. Execute every sub-phase sequentially through commit + push without architect intervention. HALT only on explicit Critical HALT Conditions or architect-signal-required points (migration application, post-merge production verification).

---

## 6. CC FAILURE PATTERNS TO PREVENT

| # | Pattern | Prevention |
|---|---|---|
| FP-49 | Schema fabrication | Phase 1E-1 schema audit MUST run before Phase 1E-2 migration authoring |
| Recurrence | "Apply pattern from history without reading substrate" | Substrate citations in §2 are authoritative; do not invent vocabulary |
| Bypass (SR-34) | Destructive replace instead of supersession | Rule 30 prohibits; supersession only |
| Korean Test (T1-E910) | Tenant/domain literals introduced | Match identifier is `(tenant_id, fingerprint_hash)` — pure structural |
| Architect-as-courier | CC interpreting ambiguous output | CC reports structural facts only |
| Vertical Slice violation | Schema migration without engine query alignment | Phase 1E-5 engine reads MUST be updated; one PR; no partial ship |
| FP-70 | Phase deferral as completion | All Phase 1E sub-phases ship in single commit; closure requires 5-RESET-4 PASS |

---

## 7. PHASE STRUCTURE OVERVIEW

| Sub-phase | Scope | Architect signal required? |
|---|---|---|
| 1E-1 | Schema audit (read-only) | No |
| 1E-2 | Migration SQL authoring + application | **Yes** ("migration applied") |
| 1E-3 | Supersession helper module | No |
| 1E-4 | Wire into 2 import paths | No |
| 1E-5 | Engine query alignment | No |
| 1E-6 | Korean Test gate | No |
| 1E-7 | SR-39 compliance verification | No |
| 1E-8 | Self-test (read-only) | No |
| 1E-9 | Commit + push | No |
| 5-RESET-4 | Empirical verification | **Yes** ("wipe applied"; "first import done"; "second import done") |

---

## 8. COMPLETION REPORT SCAFFOLD (CC POPULATES)

CC populates the following sections as evidence accumulates. Final populated report becomes the closing artifact for HF-196 PR.

```markdown
# HF-196 Phase 1E — Completion Report

**Phase:** 1E (Import Supersession on Fingerprint Match)
**Branch:** hf-196-platform-restoration-vertical-slice
**Final commit:** <SHA>
**Date executed:** <YYYY-MM-DD>

## Phase 1E-1: Schema Audit
- import_batches columns (pre-migration): <pasted output>
- structural_fingerprints columns: <pasted output>
- calculation_batches columns (precedent verification): <pasted output>
- Engine query sites identified: <count>; pasted grep output
- Synthesis verdict: <PROCEED to migration | HALT for architect>

## Phase 1E-2: Migration
- Migration file path: web/supabase/migrations/<timestamp>_hf196_phase1e_import_batch_supersession.sql
- SQL pasted: <yes/no>
- Architect signal "migration applied" received: <timestamp>
- Post-application verification query output: <pasted>
- SCHEMA_REFERENCE_LIVE.md updated: <yes/no>

## Phase 1E-3: Supersession Helper
- Module path: web/src/lib/sci/import-batch-supersession.ts
- Module signature: <pasted>
- TypeScript build: <exit code>

## Phase 1E-4: Import Path Wiring
- execute-bulk wired: <yes/no, line reference>
- execute (plan) wired: <yes/no, line reference>
- grep verification: <pasted output, expected 1 definition + 2 call sites>
- Build: <exit code>

## Phase 1E-5: Engine Query Alignment
- Sites updated: <count>
- Per-site before/after: <pasted>
- Verification grep: <pasted>
- Build: <exit code>

## Phase 1E-6: Korean Test
- Script output: <pasted>
- Verdict: PASS/FAIL

## Phase 1E-7: SR-39 Compliance Matrix
| Requirement | Verification | Verdict |
|---|---|---|
| SOC 2 CC6.1 | <evidence> | PASS/FAIL |
| SOC 2 CC7.2 | <evidence> | PASS/FAIL |
| GDPR Article 30 | <evidence> | PASS/FAIL |
| LGPD Article 37 | <evidence> | PASS/FAIL |
| DS-014 access control | <evidence> | PASS/FAIL |
| Decision 123 | <evidence> | PASS/FAIL/GAP |

## Phase 1E-8: Self-Test (read-only)
- Pre-Phase-5-RESET-4 import_batches state: <pasted>
- committed_data by batch counts: <pasted>

## Phase 1E-9: Commit
- Commit SHA: <SHA>
- Push confirmation: <pasted>
- Files changed: <list>

## Phase 5-RESET-4: Empirical Verification
- Wipe applied: <timestamp>
- First import elapsed: <Xs>
- Second import elapsed: <Ys>
- Operative committed_data row count: <should be 85>
- Total committed_data row count: <should be 170 — both batches preserved>
- Engine query (filter operative): <returned row count>
- structural_fingerprints match_count: <should be 2>
- Vercel/dev-log "[Phase 1E] Superseded prior batch" emission: <pasted>

## Progressive Performance Verdict (Memory Entry 30)
- Analyze layer: <INTACT / PARTIAL / INERT>
- Commit layer: <INTACT / PARTIAL / INERT>
- End-to-end: <INTACT / PARTIAL / INERT>

## Out-of-Scope Carry-Forward
- commit/route.ts data_type vocabulary (Phase 1D carry-forward)
- intelligence/wire/route.ts data_type vocabulary (Phase 1D carry-forward)
- Cross-tenant fingerprint sharing (Tier 2 foundational flywheel)
- <other items surfaced during execution>

## Phase 1E Verdict
PASS / FAIL / PASS-WITH-DELTA

## Architect Sign-Off
- Production verification (post-merge): <pending architect>
```

---

## 9. OUT OF SCOPE (LOG; DO NOT FIX IN PHASE 1E)

- **commit/route.ts and intelligence/wire/route.ts data_type derivation** — substrate-extending; Phase 1D carry-forward
- **Cross-tenant fingerprint sharing (Tier 2 foundational flywheel)** — separate vertical slice for foundational pattern aggregation
- **structural_fingerprints schema extensions** — if 1E-1.2 surfaces gaps beyond `(tenant_id, fingerprint_hash)` queryability, surface for follow-on
- **UI confidence display correctness** — Phase 5-RESET-3 surfaced 34% confidence shown on Tier 1 hit; UI-layer defect; post-HF-196

---

## 10. END OF DIRECTIVE — NEXT SECTION IS CC PASTE BLOCK

The remainder of this artifact (§11) is CC's operational paste content. Per Rule 29: nothing follows.

---

## 11. CC PASTE BLOCK

> CC: paste this entire section verbatim into your operational context. Execute sequentially. HALT only at explicit signal-required points.

### 11.1 Read first

Read these files completely before any other action:
- `CC_STANDING_ARCHITECTURE_RULES.md` (specifically: SR-34, SR-39, SR-41, SR-42, Rule 27, Rule 28, Rule 29)
- `SCHEMA_REFERENCE_LIVE.md`

### 11.2 Phase 1E-1 — Schema Audit (read-only)

#### 11.2.1 import_batches schema
```bash
cd ~/spm-platform/web
set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await sb.from('import_batches').select('*').limit(1);
console.log('import_batches sample row keys:', data?.[0] ? Object.keys(data[0]).sort() : '(no rows; querying nullable types alternative)');
" 2>&1
```
Paste output.

If empty (no rows): query an existing batch with known data, OR use this fallback to introspect via projection:
```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
// Probe known columns
const probes = ['id','tenant_id','file_name','file_type','row_count','status','error_summary','uploaded_by','created_at','completed_at','superseded_by','supersedes','superseded_at','supersession_reason','batch_type','fingerprint_hash'];
for (const col of probes) {
  const { error } = await sb.from('import_batches').select(col).limit(0);
  console.log(\`\${col}: \${error ? 'ABSENT' : 'present'}\`);
}
" 2>&1
```
Paste output.

#### 11.2.2 structural_fingerprints schema
```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await sb.from('structural_fingerprints').select('*').limit(1);
console.log('structural_fingerprints sample row keys:', data?.[0] ? Object.keys(data[0]).sort() : '(no rows)');
" 2>&1
```
Paste output. Confirm presence of: `tenant_id`, `fingerprint_hash`, `match_count`, `confidence`. If `import_batch_id` exists on this table, note for use in supersession lookup. If absent, note that lookup must JOIN through some other surface.

#### 11.2.3 calculation_batches schema (precedent)
```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await sb.from('calculation_batches').select('*').limit(1);
console.log('calculation_batches sample row keys:', data?.[0] ? Object.keys(data[0]).sort() : '(no rows)');
" 2>&1
```
Paste output. **Verify columns include**: `superseded_by`, `supersedes`, `batch_type`, `lifecycle_state`. If any absent → Critical HALT #2.

#### 11.2.4 Engine query sites
```bash
cd ~/spm-platform
grep -rnE "from\('committed_data'\)|from\('import_batches'\)|FROM committed_data|FROM import_batches" web/src/lib/calculation/ web/src/app/api/calculation/ web/src/lib/intelligence/ --include="*.ts" 2>&1 | head -30
```
Paste output. Each match becomes a Phase 1E-5 work item.

#### 11.2.5 Synthesis table
Produce table:

| Surface | Current state (from 11.2.1–11.2.3) | Phase 1E action |
|---|---|---|
| import_batches columns | <list> | Add `superseded_by`, `supersedes`, `superseded_at`, `supersession_reason`, possibly `batch_type` |
| structural_fingerprints columns | <list> | Verify `(tenant_id, fingerprint_hash)` queryable; identify supersession-lookup path |
| calculation_batches columns | <list> | Confirm precedent schema present |
| Engine query sites | <count from 11.2.4> | Each updated in Phase 1E-5 to filter operative batches |

Surface to architect for review. **HALT** for architect confirmation of column names + scope before Phase 1E-2.

### 11.3 Phase 1E-2 — Migration SQL

#### 11.3.1 Author migration
After architect confirms 1E-1 synthesis, create `web/supabase/migrations/<UTC-timestamp>_hf196_phase1e_import_batch_supersession.sql`.

**Template (CC adjusts column names per 11.2 audit):**

```sql
-- HF-196 Phase 1E: Import Batch Supersession Schema
-- Architecture: Rule 30 (LOCKED 2026-02-14) + OB-42 Phase 4 (LOCKED 2026-02-16, HG-9)
-- Pattern: parallels calculation_batches.superseded_by / supersedes
-- Compliance: SOC 2 CC6.1/CC7.2; GDPR Article 30; LGPD Article 37
-- Match identifier: (tenant_id, fingerprint_hash) per DS-017

BEGIN;

-- Add Rule 30 supersession columns to import_batches
-- Naming follows OB-42 Phase 4 precedent on calculation_batches: superseded_by, supersedes (no _batch_id suffix)
ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES import_batches(id),
  ADD COLUMN IF NOT EXISTS supersedes UUID REFERENCES import_batches(id),
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supersession_reason TEXT;

-- Existing 'status' column — verify enum/text; add 'superseded' as valid value
-- (CC: if status is enum, ALTER TYPE; if text, no schema change but add CHECK constraint;
--  if status column absent, add it with default 'operative')
-- TEMPLATE — adjust per 11.2.1 audit:
-- ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'operative';

-- Index: find operative import_batches per tenant
CREATE INDEX IF NOT EXISTS idx_import_batches_tenant_operative
  ON import_batches (tenant_id)
  WHERE superseded_by IS NULL;

-- Index: traverse supersession chain
CREATE INDEX IF NOT EXISTS idx_import_batches_superseded_by
  ON import_batches (superseded_by)
  WHERE superseded_by IS NOT NULL;

-- Constraint: supersession integrity
ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_supersession_consistency
  CHECK (
    (superseded_by IS NULL AND superseded_at IS NULL AND supersession_reason IS NULL)
    OR
    (superseded_by IS NOT NULL AND superseded_at IS NOT NULL)
  );

COMMIT;
```

Paste full SQL with column names verified against 1E-1 audit.

#### 11.3.2 Surface to architect
**HALT for architect signal "migration applied"** — architect pastes SQL into Supabase Dashboard SQL Editor (per memory entry 26 capability-first routing), executes, signals back.

#### 11.3.3 Post-application verification
```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
// Verify all columns queryable
const probes = ['id', 'superseded_by', 'supersedes', 'superseded_at', 'supersession_reason'];
for (const col of probes) {
  const { error } = await sb.from('import_batches').select(col).limit(0);
  console.log(\`\${col}: \${error ? 'FAIL: '+error.message : 'OK'}\`);
}
" 2>&1
```
Paste output. All probes must show `OK`. If any FAIL → Critical HALT #1.

#### 11.3.4 Refresh SCHEMA_REFERENCE_LIVE.md
Update `~/spm-platform/SCHEMA_REFERENCE_LIVE.md` import_batches section. Commit at 1E-9.

### 11.4 Phase 1E-3 — Supersession helper module

Create `web/src/lib/sci/import-batch-supersession.ts`:

```typescript
/**
 * HF-196 Phase 1E — Import batch supersession per Rule 30 + DS-017.
 *
 * Match identifier: (tenant_id, fingerprint_hash).
 * Pattern: parallels calculation_batches supersession (OB-42 Phase 4 LOCKED).
 * Compliance: SOC 2 CC6.1/CC7.2, GDPR Article 30, LGPD Article 37 — audit trail preserved.
 *
 * Behavior:
 *   - On import: check whether (tenant_id, fingerprint_hash) has prior operative batch
 *   - If yes: mark prior batch superseded_by = new batch; new batch supersedes = prior
 *   - If no: standard new-import path (no prior batch action)
 *   - Nothing deleted. Nothing destructive. All evidence preserved.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SupersessionResult {
  prior_batch_id: string | null;
  prior_batch_status: 'superseded' | 'no_prior';
  new_batch_id: string;
  reason: string;
}

/**
 * Find prior operative batch for this (tenant, fingerprint), if any.
 * Returns prior batch id or null.
 *
 * Adjustment per Phase 1E-1 audit:
 *   If structural_fingerprints carries import_batch_id: query through that table
 *   If structural_fingerprints does NOT carry import_batch_id: query import_batches
 *     filtered by tenant + fingerprint_hash column (must be added to import_batches in migration)
 */
async function findPriorOperativeBatch(
  supabase: SupabaseClient,
  tenantId: string,
  fingerprintHash: string,
  newBatchId: string,
): Promise<string | null> {
  // CC: implement per 1E-1 schema audit. Two paths:
  //
  // Path A — structural_fingerprints carries import_batch_id:
  //   Query structural_fingerprints WHERE tenant_id=$1 AND fingerprint_hash=$2
  //   Returns: import_batch_id
  //   Then: SELECT id FROM import_batches WHERE id=$found AND superseded_by IS NULL
  //
  // Path B — import_batches needs fingerprint_hash column:
  //   Schema migration adds fingerprint_hash to import_batches
  //   Query: SELECT id FROM import_batches WHERE tenant_id=$1 AND fingerprint_hash=$2 AND superseded_by IS NULL AND id != $newBatchId
  //
  // The path is dictated by 1E-1.2 audit output. Do not assume.

  throw new Error('IMPLEMENT per 1E-1 schema audit synthesis');
}

/**
 * Supersede prior operative batch if (tenant_id, fingerprint_hash) match exists.
 *
 * Returns supersession result for caller logging. Throws on error.
 */
export async function supersedePriorBatchIfExists(
  supabase: SupabaseClient,
  tenantId: string,
  fingerprintHash: string,
  newBatchId: string,
  reason: string = 'fingerprint_match_reimport',
): Promise<SupersessionResult> {
  const priorBatchId = await findPriorOperativeBatch(
    supabase,
    tenantId,
    fingerprintHash,
    newBatchId,
  );

  if (!priorBatchId) {
    return {
      prior_batch_id: null,
      prior_batch_status: 'no_prior',
      new_batch_id: newBatchId,
      reason: 'no_prior_operative_batch',
    };
  }

  // Mark prior as superseded
  const { error: updateError } = await supabase
    .from('import_batches')
    .update({
      superseded_by: newBatchId,
      superseded_at: new Date().toISOString(),
      supersession_reason: reason,
    })
    .eq('id', priorBatchId);

  if (updateError) {
    throw new Error(`Supersession update failed: ${updateError.message}`);
  }

  // Link new batch back to predecessor
  const { error: linkError } = await supabase
    .from('import_batches')
    .update({ supersedes: priorBatchId })
    .eq('id', newBatchId);

  if (linkError) {
    throw new Error(`Supersession back-link failed: ${linkError.message}`);
  }

  return {
    prior_batch_id: priorBatchId,
    prior_batch_status: 'superseded',
    new_batch_id: newBatchId,
    reason,
  };
}
```

Korean Test compliant: `tenantId`, `fingerprintHash`, `newBatchId` are structural primitives.

Build verification:
```bash
cd web && npx tsc --noEmit 2>&1 | head -10
```
Must exit 0.

### 11.5 Phase 1E-4 — Wire into import paths

#### 11.5.1 execute-bulk
File: `web/src/app/api/import/sci/execute-bulk/route.ts`

After fingerprint computation + import_batches row insert, BEFORE committed_data inserts:

```typescript
import { supersedePriorBatchIfExists } from '@/lib/sci/import-batch-supersession';

// HF-196 Phase 1E — supersede prior batch on fingerprint match
const supersessionResult = await supersedePriorBatchIfExists(
  supabase,
  tenantId,
  fingerprintHash,  // from earlier fingerprint computation
  newBatchId,        // the just-inserted import_batch row id
);

if (supersessionResult.prior_batch_status === 'superseded') {
  console.log(
    `[Phase 1E] Superseded prior batch ${supersessionResult.prior_batch_id} → new batch ${supersessionResult.new_batch_id} ` +
    `(tenant=${tenantId} fingerprint=${fingerprintHash.substring(0, 12)} reason=${supersessionResult.reason})`
  );
}
```

#### 11.5.2 execute (plan path)
File: `web/src/app/api/import/sci/execute/route.ts` — same wiring pattern.

#### 11.5.3 Verify
```bash
cd ~/spm-platform
grep -rn "supersedePriorBatchIfExists" web/src/ --include="*.ts"
```
Paste output. Expected: 1 export + 2 call sites.

#### 11.5.4 Build
```bash
cd web && rm -rf .next && npm run build
```
Must exit 0. Paste tail.

### 11.6 Phase 1E-5 — Engine query alignment

For each site identified in 11.2.4, update reads to filter operative batches.

**Standard pattern:**
```typescript
// BEFORE:
const { data } = await supabase
  .from('committed_data')
  .select('*')
  .eq('tenant_id', tenantId);

// AFTER (HF-196 Phase 1E):
const { data } = await supabase
  .from('committed_data')
  .select('*, import_batches!inner(superseded_by)')
  .eq('tenant_id', tenantId)
  .is('import_batches.superseded_by', null);
```

Per-site, paste before+after.

Verify:
```bash
grep -rnE "from\('committed_data'\)" web/src/lib/calculation/ web/src/app/api/calculation/ web/src/lib/intelligence/ --include="*.ts"
```
For each match: confirm operative-only filter applied. Annotate output.

Build:
```bash
cd web && rm -rf .next && npm run build
```
Must exit 0.

### 11.7 Phase 1E-6 — Korean Test
```bash
cd ~/spm-platform
bash scripts/verify-korean-test.sh 2>&1 | tail -20
```
Must PASS. Paste output. If FAIL → Critical HALT #6.

### 11.8 Phase 1E-7 — SR-39 Compliance Matrix

CC populates matrix:

| Requirement | Phase 1E Verification | Verdict |
|---|---|---|
| SOC 2 CC6.1 (logical access + audit log integrity) | No destructive operations on import_batches; supersession marks `superseded_at`+`supersession_reason`; existing RLS unchanged | PASS |
| SOC 2 CC7.2 (records cannot be modified or destroyed) | Supersession preserves prior batch + all committed_data; nothing deleted | PASS |
| GDPR Article 30 (records of processing activities) | Complete supersession lineage queryable via supersedes/superseded_by traversal | PASS |
| LGPD Article 37 | Same as GDPR | PASS |
| DS-014 access control | Existing RLS unchanged; supersession does not bypass; engine queries respect tenant_id filtering | PASS |
| Decision 123 | <CC retrieves substrate; if unretrievable, mark GAP and surface> | TBD |

Paste matrix in completion report. If any FAIL → Critical HALT #7.

### 11.9 Phase 1E-8 — Self-test (read-only)

Diagnostic script (do NOT commit):
```typescript
// scripts/diag-hf196-phase1e-verification.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

const { data: batches } = await sb
  .from('import_batches')
  .select('id, file_name, superseded_by, supersedes, superseded_at, supersession_reason, created_at')
  .eq('tenant_id', tenantId)
  .order('created_at', { ascending: false });
console.log('current import_batches state:', JSON.stringify(batches, null, 2));
```

Run; paste output; delete script.

### 11.10 Phase 1E-9 — Commit

```bash
cd ~/spm-platform
git add -A
git status
```
Paste git status output. Confirm scope:
- `web/src/lib/sci/import-batch-supersession.ts` (new)
- `web/src/app/api/import/sci/execute-bulk/route.ts` (modified)
- `web/src/app/api/import/sci/execute/route.ts` (modified)
- Engine query sites (modified per 11.6)
- `web/supabase/migrations/<timestamp>_hf196_phase1e_*.sql` (new)
- `SCHEMA_REFERENCE_LIVE.md` (modified)
- NO unrelated changes

```bash
git commit -m "HF-196 Phase 1E: Import batch supersession on fingerprint match — Rule 30 pattern applied to import_batches; engine reads filter operative; SOC 2 CC6/CC7.2 + GDPR Art 30 audit trail preserved; closes Memory Entry 30 commit-layer gap"
git push origin hf-196-platform-restoration-vertical-slice
git log --oneline -1
```
Paste commit SHA + push confirmation.

### 11.11 Phase 5-RESET-4 — Empirical verification

Restart dev server with Phase 1E code:
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

> Phase 1E commit landed: <SHA>. Dev rebuilt with Phase 1E code. Awaiting architect signals for empirical verification:
>
> 1. **"wipe applied"** — BCL clean-slate via Supabase Dashboard SQL Editor (same SQL as Phase 5-RESET-3)
> 2. **"5-RESET-4 first import done"** — architect imports BCL_Plantilla_Personal.xlsx (first encounter)
> 3. **"5-RESET-4 second import done"** — architect imports SAME file again (supersession should fire)

#### On signal 1 (wipe applied)
Verify wipe via tsx-script (paste counts; all = 0).

#### On signal 2 (first import done)
Verify standard import succeeded:
```typescript
// Expected: 1 import_batch (operative); 85 committed_data rows
```
Paste output.

#### On signal 3 (second import done) — Phase 1E PASS criteria
```typescript
const { data: batches } = await sb
  .from('import_batches')
  .select('id, file_name, superseded_by, supersedes, superseded_at, supersession_reason, created_at')
  .eq('tenant_id', tenantId)
  .order('created_at', { ascending: false });
console.log('post-second-import import_batches:', JSON.stringify(batches, null, 2));

// Operative count
const { count: operativeRows } = await sb
  .from('committed_data')
  .select('*, import_batches!inner(superseded_by)', { count: 'exact', head: true })
  .eq('tenant_id', tenantId)
  .is('import_batches.superseded_by', null);
console.log('operative committed_data rows:', operativeRows);

// Total count
const { count: totalRows } = await sb
  .from('committed_data')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', tenantId);
console.log('total committed_data rows (should be 170 — both batches preserved):', totalRows);

// Fingerprint match progression
const { data: fingerprints } = await sb
  .from('structural_fingerprints')
  .select('fingerprint_hash, match_count, confidence')
  .eq('tenant_id', tenantId);
console.log('fingerprints:', fingerprints);

// Supersession log emission
console.log('checking dev log for [Phase 1E] Superseded marker...');
```
```bash
grep "\[Phase 1E\] Superseded prior batch" /tmp/hf196_dev.log | head -5
```

**Phase 1E PASS criteria (all must hold):**

| Check | Expected | Actual | Verdict |
|---|---|---|---|
| import_batches count | 2 | <pasted> | |
| Older batch superseded_by | = newer batch id | <pasted> | |
| Newer batch supersedes | = older batch id | <pasted> | |
| Older batch superseded_at | non-null | <pasted> | |
| Older batch supersession_reason | 'fingerprint_match_reimport' | <pasted> | |
| Operative committed_data row count | 85 | <pasted> | |
| Total committed_data row count (preserved) | 170 | <pasted> | |
| structural_fingerprints match_count | 2 | <pasted> | |
| Vercel-equivalent log shows '[Phase 1E] Superseded prior batch' | 1 occurrence | <pasted> | |

**If all PASS:** Memory Entry 30 closure CONFIRMED end-to-end. Populate completion report. Surface for architect Phase 5C resumption from step 5/6.

**If any FAIL:** Surface verdict with row-level annotation. HALT for architect disposition.

### 11.12 Final Completion Report

Populate the scaffold from §8 of the directive. Surface to architect channel as the closing artifact for HF-196 PR.
