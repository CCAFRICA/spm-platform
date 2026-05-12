# HF-213: Content Unit Hash SHA-256 — Supersession Identity Primitive Closure

**Classification:** HF (Hotfix) — atomic vertical slice closing supersession identity primitive at content-unit layer
**Author:** Architect-drafted; CC executes
**Date:** 2026-05-07
**PR Target:** dev → main
**Branch:** `hf-213-atomic-supersession-resolver-closure` (Phase 0 probe baseline `dc99c8f5`)
**Predecessor invocations:** HF-213 Synthesis (`docs/IRA-responses/IRA_HF_213_Synthesis_20260507.md` — `ira_request_hash 6a68392c...`), HF-213 Enforcement (`docs/IRA-responses/IRA_HF_213_Enforcement_20260507.md` — `ira_request_hash ee93894d...`)

CC reads `CC_STANDING_ARCHITECTURE_RULES.md` from project root before Phase 1. SR-34 (no bypass), SR-41 (revert discipline via `git revert <SHA>`), SR-42 (locked-rule halt), Rule 25 (completion report first deliverable), Rule 26 (mandatory CR structure), Rule 27 (evidence = paste), Rule 28 (one commit per phase), Rule 29 (CC paste-block discipline) all active.

After every code-modifying phase: `kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000` before proceeding.

Final step: `gh pr create --base main --head hf-213-atomic-supersession-resolver-closure` with descriptive title and body.

---

## Closes

**Defect class:** Supersession identity primitive scope-mismatch at content-unit boundary. HF-196 Phase 1F's locked semantic `(tenant_id, file_hash_sha256)` operates at file-level; substrate principle requires content-unit-level identity. Two empirical manifestations:

### Manifestation 1 — Multi-content-unit single-file imports supersession-chaining each other

Production tenant Meridian (UUID `5035b1e8-0754-4527-b7ec-9f93f85e4c79`) imported `Meridian_Datos_Q1_2025.xlsx` twice on 2026-05-07. The file contains three content units. Six `import_batches` resulted, all sharing `file_hash_sha256 = 6b0fc9a6ea713fa3094ec17c4bde8231ddd30e4d3a88539e4cb1f1f16c017a65`. Six-batch supersession chain formed across content units. Operative state: 36 rows (last batch only). Plantilla and Datos_Rendimiento filtered as superseded. Engine returns `grandTotal=$0`.

### Manifestation 2 — Same record content arriving in different file containers

Two production files with bit-exact identical record content for shared content units, different file SHAs:
- `Meridian_Datos_Q1_2025.xlsx` SHA `6b0fc9a6...017a65` (3 content units)
- `Meridian_Logistics_Benchmark.xlsx` SHA `ca08f6e7...9afee` (5 content units, including the same 3)
- Three shared content units bit-exact identical record content; normalized hashes match across files

Customer's lived case at Meridian: session 1 sent individual files; session 2 sent consolidated multi-tab file. Same record content, different containers. Under Phase 1F's `(tenant_id, file_hash_sha256)` scope, no supersession fires across containers despite identical content units.

### Substrate-grounded basis (per HF-213 Synthesis)

Four independent governing principles each independently named HF-196 Phase 1F's locked semantic as supersession-required:

- **T1-E902 (Carry Everything, Express Contextually):** Phase 1F scope causes content units to supersede each other within a single file; data persisted but not carried.
- **T1-E904 (Calculation Sovereignty):** Phase 1F supersession scope is import-time identity decision filtering committed data before engine reads; import-time logic influencing calculation results by proxy.
- **T1-E905 (Evidence Chain Integrity):** Cross-content-unit supersession links assert semantically false relationships; SOC 2 CC7.2 / GDPR Article 30 audit-chain integrity compromised.
- **T1-E910 (Korean Test):** File-level SHA-256 is container identity, not content identity; structurally blind to content-unit boundaries.

Decision 77 (IGF-T2-E30) body retrieved post-Synthesis. Decision 77 locks SCI as single entry point but does NOT specify identity primitive. HF-213 augments Decision 77 within SCI architecture (does not bypass; does not create second path). Per HF-213 Enforcement: T1-E914 not violated.

Per HF-213 Enforcement: Option A ranked 1 (VALIDITY_PASS_WITH_FINDINGS, 0 FAILs), recommended SHIP.

---

## Implements

### Supersession identity primitive

**`content_unit_hash_sha256`** — SHA-256 of normalized canonical CSV serialization of each content unit, computed at SCI Layer 1 (Content Profile Generation), one hash per content unit (one per tab for xlsx; one per CSV file).

**Normalization domain (canonical, single source of truth):**
- Column ordering: lexicographic sort of column names before serialization
- Row ordering: lexicographic sort of rows after column normalization
- Value normalization: `String(value).trim()`; case-preserve; UTF-8 encoded
- Inclusion: column names (post-sort) + row values (post-sort)
- Exclusion: file metadata (filename, sheet name, sheet index), formatting, encoding metadata, file-level container bytes
- Serialization: canonical CSV with `\n` line terminator, comma separator, no BOM, no trailing newline

**Korean Test compliance:** Hash uses structural inputs only. Column names included as data content (not pattern-matched). Hash invariant under column-name translation (Korean column names with identical content produce identical hash).

### Storage

**New column on `import_batches`:**
- `content_unit_hash_sha256` text NOT NULL — added in migration; backfilled via sentinel `'<legacy_uncomputable>'` for pre-HF-213 rows; locked NOT NULL post-backfill.

**Retained column on `import_batches`:**
- `file_hash_sha256` text NOT NULL — preserved per HF-196 Phase 1F audit intent. Available for file-level audit. No longer load-bearing for supersession decision.

**New index:**
- `idx_import_batches_content_unit_hash` btree on `(tenant_id, content_unit_hash_sha256)` — supersession lookup performance.

### Supersession primitive scope change

`web/src/lib/sci/import-batch-supersession.ts` — scope changes from `(tenant_id, file_hash_sha256)` to `(tenant_id, content_unit_hash_sha256)`. All HF-196 Phase 1E columns preserved unchanged (`superseded_by`, `supersedes`, `superseded_at`, `supersession_reason`, CHECK constraint). Append-only discipline preserved.

### Engine read filter (UNCHANGED)

`fetchSupersededBatchIds(supabase, tenantId)` already returns `import_batches.id WHERE superseded_by IS NOT NULL`. The 6/6 `committed_data` SELECT sites in `web/src/app/api/calculation/run/route.ts` already filter via the existing `NOT IN` pattern (Phase 0 §7). No engine code changes.

### Calc-time entity resolver (UNCHANGED)

Per Phase 0 §3 + §4: `resolveEntitiesAtCalcTime` and the per-row metadata read at `route.ts:606-625` are operative and substrate-correct. HF-183 closed per-row entity_id_field resolution. No changes.

---

## Implements (substrate)

- **HF-196 Phase 1F supersession** — explicitly named and superseded. Phase 1F's `(tenant_id, file_hash_sha256)` supersession scope → HF-213's `(tenant_id, content_unit_hash_sha256)` supersession scope. File-level audit retained via column preservation.
- **Decision 77 (IGF-T2-E30)** — augmented (not superseded). HF-213 operates within SCI architecture; no second path; no bypass.
- **HF-196 Phase 1E** — preserved unchanged.
- **DS-005 §2.3 / ingestion_events** — not modified by HF-213. HF-199 candidate carry-forward.
- **DS-017 structural_fingerprints** — not modified by HF-213.

---

## Builds On

- HF-213 Phase 0 probe report at `docs/CC-artifacts/HF-213_Phase0_PROBE_REPORT.md` (commit `dc99c8f5`)
- HF-196 PR #359 SHA `73d52791`
- HF-196 Artifact A durable code-audit reference
- AUD-005 calc-execution live code reference at SHA `5314c365`
- HF-213 Synthesis (cost $1.56)
- HF-213 Enforcement (cost $1.89, Option A ranked 1)

---

## AUTONOMY DIRECTIVE

NEVER ask yes/no. NEVER say "shall I." NEVER pause for confirmation between phases EXCEPT at architect-mediated handoff points explicitly named in Phases 1.3 and 6 below.

Execute every phase sequentially through Phase 7 (Completion Report + PR) without architect intervention except the named handoffs.

HALT only on the explicit Critical HALT Conditions below.

---

## CRITICAL HALT CONDITIONS

1. **Schema verification fails** (live `information_schema.columns` query reveals column shapes incompatible with directive)
2. **Build fails AND root cause is structural defect not solvable by code-level fix within scope**
3. **Korean Test build gate fails AND violation cannot be remediated structurally within scope**
4. **Hash regression on existing tenants** — implementation produces different hash for content that was previously bit-identical (would orphan supersession chains)
5. **Reconciliation mismatch on Meridian, BCL, or CRP** — calc output diverges from baseline pre-Phase-1F state in a way not explained by HF-213's supersession-scope correction
6. **SR-42 trigger** — locked rule dictates action; surface verbatim from primary substrate; halt for architect verification
7. **Tenant data integrity risk** — any operation that would write to or modify production data outside explicitly-authorized scope

ALL OTHER ISSUES: CC resolves structurally and continues.

---

## PHASE 1: SCHEMA MIGRATION

### 1.1 SQL Verification Gate (FP-49 prevention)

CC verifies live schema state before authoring migration:

```bash
cd web && set -a && source .env.local && set +a
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await supabase
    .from('import_batches')
    .select('id, file_hash_sha256, superseded_by')
    .limit(3);
  console.log('Pre-migration sample:', JSON.stringify(data, null, 2));
})();
"
```

Paste output. Verify `file_hash_sha256` and `superseded_by` columns visible.

### 1.2 Migration file authoring

CC creates migration file at `web/supabase/migrations/<timestamp>_hf_213_content_unit_hash_sha256.sql`:

```sql
-- HF-213: Content Unit Hash SHA-256 — Supersession Identity Primitive
-- Supersedes: HF-196 Phase 1F (tenant_id, file_hash_sha256) supersession scope
-- New supersession scope: (tenant_id, content_unit_hash_sha256)
-- file_hash_sha256 retained for file-level audit (HF-196 Phase 1F audit intent preserved)

ALTER TABLE import_batches
  ADD COLUMN content_unit_hash_sha256 text;

UPDATE import_batches
SET content_unit_hash_sha256 = '<legacy_uncomputable>'
WHERE content_unit_hash_sha256 IS NULL;

ALTER TABLE import_batches
  ALTER COLUMN content_unit_hash_sha256 SET NOT NULL;

CREATE INDEX idx_import_batches_content_unit_hash
  ON import_batches(tenant_id, content_unit_hash_sha256);

COMMENT ON COLUMN import_batches.content_unit_hash_sha256 IS
  'HF-213: SHA-256 of normalized canonical CSV serialization of content unit. Supersession identity primitive (supersedes HF-196 Phase 1F file-level scope). Computed via web/src/lib/sci/content-unit-hash.ts. Sentinel <legacy_uncomputable> for pre-HF-213 rows.';

COMMENT ON COLUMN import_batches.file_hash_sha256 IS
  'HF-196 Phase 1F: SHA-256 of raw file bytes. Preserved post-HF-213 for file-level audit. NO LONGER load-bearing for supersession (HF-213 supersedes Phase 1F supersession scope).';
```

### 1.3 Architect-mediated migration application — HALT POINT 1

CC commits migration file (does NOT execute migration). HALTs and surfaces to architect:
- Branch + commit SHA
- Migration file path
- Pre-migration SQL verification output (from 1.1)
- Status: "Phase 1 complete. Architect runs migration via Supabase Dashboard SQL Editor. CC resumes Phase 2 after architect confirmation."

Architect runs migration in Dashboard. Architect surfaces post-migration column listing back to architect-channel:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'import_batches'
ORDER BY ordinal_position;
```

CC resumes Phase 2 after architect surfaces post-migration column shape confirming `content_unit_hash_sha256 NOT NULL` present.

### 1.4 Phase 1 commit

```bash
git add web/supabase/migrations/<timestamp>_hf_213_content_unit_hash_sha256.sql
git commit -m "HF-213 Phase 1: Schema migration for content_unit_hash_sha256 (supersedes HF-196 Phase 1F file-level supersession scope)"
git push origin hf-213-atomic-supersession-resolver-closure
```

---

## PHASE 2: HASH COMPUTATION MODULE

### 2.1 Create `web/src/lib/sci/content-unit-hash.ts`

CC creates the file:

```typescript
import { createHash } from 'node:crypto';

/**
 * HF-213: Content unit hash SHA-256 — supersession identity primitive.
 *
 * Computes a deterministic SHA-256 hash over normalized canonical CSV
 * serialization of a content unit's record-level content.
 *
 * Normalization domain:
 *   - Column names: lexicographic sort
 *   - Rows: lexicographic sort (after column normalization)
 *   - Values: trim whitespace, case-preserve, UTF-8
 *   - Excluded: filename, sheet name, formatting, encoding metadata
 *
 * Korean Test compliance: Hash uses structural inputs only. Column names
 * are data content, not pattern-matched. Hash invariant under translation.
 *
 * MUST be invoked from ALL ingestion code paths that compute content unit
 * identity. Single canonical function — divergent normalization = supersession
 * identity break (Decision-Implementation Gap risk per HF-213 Enforcement
 * Category 7 Finding (a)).
 */
export function computeContentUnitHashSha256(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return createHash('sha256').update('').digest('hex');
  }

  const columnSet = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) columnSet.add(k);
  }
  const sortedColumns = Array.from(columnSet).sort();

  const normalizedRows: string[] = [];
  for (const row of rows) {
    const cells: string[] = [];
    for (const col of sortedColumns) {
      const v = row[col];
      const s = v == null ? '' : String(v).trim();
      const escaped = /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      cells.push(escaped);
    }
    normalizedRows.push(cells.join(','));
  }
  normalizedRows.sort();

  const header = sortedColumns
    .map(c => /[,"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)
    .join(',');
  const canonical = [header, ...normalizedRows].join('\n');

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
```

### 2.2 Unit tests

CC creates `web/src/lib/sci/__tests__/content-unit-hash.test.ts` with these tests:

- **Test 1** — Empty rows produces stable hash
- **Test 2** — Column order independence (`[{a:1, b:2}]` and `[{b:2, a:1}]` produce identical hashes)
- **Test 3** — Row order independence (`[{a:1}, {a:2}]` and `[{a:2}, {a:1}]` produce identical hashes)
- **Test 4** — Whitespace normalization (`{a:'foo'}` and `{a:'  foo  '}` produce identical hashes)
- **Test 5** — Null/undefined treated as empty (`{a:null}`, `{a:undefined}`, `{a:''}` produce identical hashes)
- **Test 6** — Different content produces different hashes
- **Test 7** — Korean Test: `{name:'Smith'}` and `{이름:'Smith'}` produce DISTINCT hashes; same Korean column names with same content produce identical hashes
- **Test 8** — CSV escape: values with commas, quotes, newlines do not collide with innocuous values
- **Test 9** — Manifestation 2 reproduction: identical record content in different input array orderings produces identical hashes

### 2.3 Run tests

```bash
cd web && npm test -- content-unit-hash
```

All 9 tests must pass. Paste verbatim output.

### 2.4 Phase 2 commit

```bash
git add web/src/lib/sci/content-unit-hash.ts web/src/lib/sci/__tests__/content-unit-hash.test.ts
git commit -m "HF-213 Phase 2: Content unit hash computation module + unit tests (Korean Test compliant)"
git push origin hf-213-atomic-supersession-resolver-closure
```

---

## PHASE 3: SUPERSESSION PRIMITIVE REFACTOR

### 3.1 Modify `web/src/lib/sci/import-batch-supersession.ts`

CC updates the module:

**`findPriorOperativeBatch` signature change:**
- Old: `findPriorOperativeBatch(supabase, tenantId, fileHashSha256, newBatchId)`
- New: `findPriorOperativeBatch(supabase, tenantId, contentUnitHashSha256, newBatchId)`
- Internal query: `.eq('content_unit_hash_sha256', contentUnitHashSha256)` (replaces `.eq('file_hash_sha256', fileHashSha256)`)

**`supersedePriorBatchIfExists` signature change:**
- Old: `supersedePriorBatchIfExists(supabase, tenantId, fileHashSha256, newBatchId, reason)`
- New: `supersedePriorBatchIfExists(supabase, tenantId, contentUnitHashSha256, newBatchId, reason)`

**`supersedePriorBatchOnContentMatch` signature change:**
- Old: `supersedePriorBatchOnContentMatch(supabase, tenantId, newBatchId, fileHashSha256, rows, reason)`
- New: `supersedePriorBatchOnContentMatch(supabase, tenantId, newBatchId, contentUnitHashSha256, rows, reason)`

**Module header comment updated to:**

```typescript
/**
 * HF-213 — Content unit hash supersession identity primitive.
 * Supersedes HF-196 Phase 1F's (tenant_id, file_hash_sha256) supersession scope.
 *
 * Supersession scope: (tenant_id, content_unit_hash_sha256).
 *   - Content units within the same file have distinct hashes — they do not
 *     supersede each other (Manifestation 1 closure).
 *   - Same content in different file containers has the same content unit hash —
 *     supersession chains correctly across containers (Manifestation 2 closure).
 *
 * file_hash_sha256 retained on import_batches for file-level audit per HF-196
 * Phase 1F audit intent. No longer load-bearing for supersession decision.
 *
 * Phase 1E architecture preserved unchanged:
 *   - Supersession columns (superseded_by, supersedes, superseded_at, supersession_reason)
 *   - CHECK constraint on supersession integrity
 *   - Engine operative-only filter via fetchSupersededBatchIds + NOT IN
 *   - Audit trail discipline (nothing destroyed; SOC 2 CC7.2; GDPR Article 30)
 *
 * Korean Test (T1-E910): content_unit_hash_sha256 is structural primitive
 * (cryptographic hash of normalized content); tenantId, contentUnitHashSha256,
 * newBatchId are pure structural primitives. Zero domain literals.
 */
```

### 3.2 `fetchSupersededBatchIds` UNCHANGED

This function remains exactly as in HF-196 Phase 1E/1F. Engine read filter at calc-time is unchanged. No engine code modifications required.

### 3.3 Phase 3 commit

```bash
git add web/src/lib/sci/import-batch-supersession.ts
git commit -m "HF-213 Phase 3: Supersession primitive scope refactor — content_unit_hash_sha256 supersedes file_hash_sha256 as supersession identity"
git push origin hf-213-atomic-supersession-resolver-closure
```

---

## PHASE 4: EXECUTE-BULK + EXECUTE INTEGRATION

### 4.1 Modify `web/src/app/api/import/sci/execute-bulk/route.ts`

Per Phase 0 §6, three pipelines invoke supersession (lines ~520-540 entity, ~630-650 data, ~800-820 reference). Each call site updated to:

1. Compute `contentUnitHashSha256` from rows via `computeContentUnitHashSha256(rows)`
2. Pass `contentUnitHashSha256` to `supersedePriorBatchOnContentMatch` (replacing `fileHashSha256` argument)
3. Insert `content_unit_hash_sha256` value into `import_batches.insert(...)` payload alongside existing `file_hash_sha256` (which remains for audit)

CC adds import statement at file head:

```typescript
import { computeContentUnitHashSha256 } from '@/lib/sci/content-unit-hash';
```

### 4.2 Modify `web/src/app/api/import/sci/execute/route.ts`

Per Phase 0 §6, non-bulk execute route also invokes `supersedePriorBatchOnContentMatch`. Same pattern as 4.1.

### 4.3 Single canonical hash invocation grep gate

```bash
grep -rn "createHash.*sha256\|sha256.*createHash" web/src/lib/sci/ web/src/app/api/import/
```

Paste grep output. Any matches outside `content-unit-hash.ts` and `file-content-hash.ts` are flagged. CC reads each match and confirms it is either (a) the existing `file_hash_sha256` computation in `file-content-hash.ts`, (b) the new `content_unit_hash_sha256` computation in `content-unit-hash.ts`, or (c) needs remediation. Document any remediation in commit message.

### 4.4 Korean Test grep gate

```bash
grep -rnE "Plantilla|Datos_Rendimiento|Datos_Flota|Hub_Asignado|No_Empleado" web/src/lib/sci/ web/src/app/api/import/sci/
```

Output must be empty. Any match indicates language-specific literal — Korean Test FAIL. CC remediates.

### 4.5 Phase 4 commit

```bash
git add web/src/app/api/import/sci/execute-bulk/route.ts web/src/app/api/import/sci/execute/route.ts
git commit -m "HF-213 Phase 4: Execute-bulk + execute integration — content_unit_hash_sha256 computed at all ingestion entry points"
git push origin hf-213-atomic-supersession-resolver-closure
```

---

## PHASE 5: BUILD + LINT + TEST

```bash
cd web
rm -rf .next
npm run build
npm run lint
npm test
```

Each command must exit 0 (build/lint) or with all tests passing. Paste verbatim output for all four. Any TypeScript error, lint error (new), or test failure halts.

```bash
git commit --allow-empty -m "HF-213 Phase 5: Build + lint + test — all gates PASS"
git push origin hf-213-atomic-supersession-resolver-closure
```

---

## PHASE 6: REGRESSION (architect-mediated)

### 6.1 Local dev server start

```bash
cd web
npm run dev &
sleep 10
curl -s http://localhost:3000/api/health | head -50
```

Confirm dev server responds.

### 6.2 Meridian regression — HALT POINT 2

CC HALTs. Surfaces to architect:
- Branch + commit SHA
- Dev server status
- Status: "Phase 6 awaiting architect-mediated regression. Architect: re-import Meridian_Datos_Q1_2025.xlsx via browser, re-run calc for January 2025, paste calc output verbatim to architect-channel."

CC does NOT see, reference, or compare against ground truth values. CC pastes only what comes out of dev server logs and HTTP responses when architect surfaces calc output.

Architect performs reconciliation in architect-channel against MX$185,063 ground truth (architect-channel exclusive per T2-E46). Architect surfaces verdict to CC: PASS or FAIL.

If PASS: CC proceeds to 6.3.
If FAIL: SR-34 — diagnose structurally. CC HALTs and surfaces diagnostic.

### 6.3 BCL regression

Same pattern as 6.2 for BCL (six-period sum, ground truth architect-channel exclusive).

### 6.4 CRP regression

Same pattern as 6.2 for CRP (pre-clawback baseline, ground truth architect-channel exclusive).

### 6.5 Phase 6 evidence commit

CC writes `docs/CC-artifacts/HF-213_Phase6_REGRESSION_EVIDENCE.md` with verbatim calc outputs (no reconciliation interpretation; no ground-truth values).

```bash
git add docs/CC-artifacts/HF-213_Phase6_REGRESSION_EVIDENCE.md
git commit -m "HF-213 Phase 6: Regression evidence captured (Meridian + BCL + CRP). Architect-channel reconciliation: PASS."
git push origin hf-213-atomic-supersession-resolver-closure
```

---

## PHASE 7: COMPLETION REPORT + PR

### 7.1 Completion Report

Per Rule 25-28: completion report at `docs/completion-reports/HF-213_COMPLETION_REPORT.md` produced as FIRST deliverable for Phase 7. Mandatory structure:

- **Commits:** every commit SHA from Phase 1-6 with message
- **Files:** every file added or modified with line-count delta
- **Hard Gates:** build PASS (paste output verbatim), lint PASS, test PASS, schema verification PASS, Korean Test grep PASS, hash module unit tests PASS (9/9), single canonical hash invocation grep PASS
- **Soft Gates:** Meridian + BCL + CRP regression PASS (architect-channel reconciliation)
- **Compliance:** SR-34 honored, SR-39 evaluated (SOC 2 CC7.2 audit chain integrity preserved via file_hash_sha256 retention), Korean Test compliance verified, append-only discipline preserved
- **Issues:** any defects or unexpected findings during implementation
- **Verification:** verbatim hash module test output, verbatim build output, verbatim lint output

Self-attestation rejected. Evidence = paste per Rule 27.

### 7.2 PR creation

```bash
gh pr create --base main --head hf-213-atomic-supersession-resolver-closure \
  --title "HF-213: Content Unit Hash SHA-256 — Supersession Identity Primitive (supersedes HF-196 Phase 1F)" \
  --body "$(cat <<'BODY'
## HF-213 — Atomic Closure: Content Unit Hash Supersession Identity

### Closes
- Manifestation 1: Multi-content-unit single-file imports supersession-chaining each other (Meridian production failure 2026-05-07)
- Manifestation 2: Same record content across different file containers (Meridian customer's lived case)

### Supersedes
- **HF-196 Phase 1F** locked semantic `(tenant_id, file_hash_sha256)` supersession scope → HF-213 `(tenant_id, content_unit_hash_sha256)` supersession scope
- file_hash_sha256 retained on import_batches for file-level audit (HF-196 Phase 1F audit intent preserved)

### Substrate basis
Per HF-213 Synthesis (cost \$1.56), four independent governing principles each named Phase 1F as supersession-required: T1-E902 Carry Everything, T1-E904 Calculation Sovereignty, T1-E905 Evidence Chain Integrity, T1-E910 Korean Test.

Per HF-213 Enforcement (cost \$1.89), Option A ranked 1, VALIDITY_PASS_WITH_FINDINGS, recommended SHIP.

### Carry-forward (post-merge substrate work, future focused effort)
- Substrate promotion: lock content_unit_hash_sha256 as Tier 2 Decision in igf.entries
- Decision 77 extension: cross-reference new identity primitive
- Decision 51 extension: cross-reference Carry Everything instantiation
- Adjacent-Arm Drift: calculation_batches (HF-198 candidate), plan_rule_sets, structural_fingerprints (DS-017), ingestion_events (HF-199 candidate)
- Substrate-maintenance: SCI specification → substrate gap; Decision 152 / 51 / 117 escalation

### IRA invocation audit pair
- prompts/IRA_HF_213_Synthesis_20260507.md + docs/IRA-responses/IRA_HF_213_Synthesis_20260507.md (ira_request_hash 6a68392c...)
- prompts/IRA_HF_213_Enforcement_20260507.md + docs/IRA-responses/IRA_HF_213_Enforcement_20260507.md (ira_request_hash ee93894d...)
BODY
)"
```

### 7.3 Phase 7 commit

```bash
git add docs/completion-reports/HF-213_COMPLETION_REPORT.md
git commit -m "HF-213 Phase 7: Completion report + PR. CLOSED pending architect merge."
git push origin hf-213-atomic-supersession-resolver-closure
```

CC surfaces PR URL to architect.

---

## CARRY-FORWARD (post-merge substrate work, future focused effort)

Per HF-213 Enforcement supersession_candidates and adjacent-arm drift findings:

1. **Substrate promotion of content_unit_hash_sha256** — lock as Tier 2 Decision in `igf.entries`. New Decision (next available number) cross-referencing Decision 77.
2. **Decision 77 extension** — cross-reference new identity primitive in `igf.entries` content for IGF-T2-E30.
3. **Decision 51 extension** — cross-reference Carry Everything instantiation in IGF-T2-E09.
4. **Adjacent-Arm Drift HFs** — calculation_batches (HF-198 candidate), plan_rule_sets, structural_fingerprints DS-017, ingestion_events HF-199 candidate. Each as independent vertical slice.
5. **Substrate-maintenance focused effort** — SCI specification → substrate gap (content-as-unit principle exists in design document but not in locked Decision 77); Decision 152 / 51 / 117 escalation from identifier_only to full body fidelity.

These items are NOT shipped by HF-213. Per architect direction: future focused effort.
