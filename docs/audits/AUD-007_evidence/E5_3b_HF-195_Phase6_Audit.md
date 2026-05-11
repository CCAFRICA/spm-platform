# E5.3b — HF-195/Phase-6-AUDIT_Import_To_Calculate_Flow_20260502.md (truncated)

**File:** `docs/audit-evidence/HF-195/Phase-6-AUDIT_Import_To_Calculate_Flow_20260502.md`
**Total lines:** 775 (head 100 + tail 100 surfaced; 575 elided)

## First 100 lines

```markdown
# HF-195 Phase 6-AUDIT — Import-to-Calculate Flow Structural Code Audit

| Field | Value |
|---|---|
| Audit ID | HF-195-Phase-6-AUDIT |
| Date | 2026-05-02 |
| Branch | `hf-195-prompt-layer-registry-derivation` |
| Author | CC (read-only structural audit, diagnostic-only) |
| Trigger | Phase 6B verification surfaced `ALL_NULL_ENTITY` flag — 85 committed_data rows imported under BCL roster band, 0 with resolved `entity_id` |
| Scope | Code paths from import API entry → SCI dispatch → committed_data write → entity materialization → entity_id back-link → plan import → convergence → calculation |
| Output discipline | Structural observations only. No fix proposals. No architectural dispositions. No GT values. Korean Test compliant in any code citations (verbatim quotes only). |

---

## Pre-Audit Anchor (Verbatim BCL Tenant State, 2026-05-02)

```
table: committed_data         rows_for_BCL: 85   (all entity_id = NULL, all source_date = NULL)
table: entities               rows_for_BCL: 85
table: import_batches         rows_for_BCL: 1
table: rule_sets              rows_for_BCL: 0
table: calculation_results    rows_for_BCL: 0
table: classification_signals rows_for_BCL: 0  (post-wipe, post-roster-reimport)
table: structural_fingerprints rows_for_BCL: 0
table: entity_period_outcomes rows_for_BCL: 0
```

The asymmetry is the audit's central diagnostic anchor: **`entities` has 85 rows but no committed_data row references any of them.**

---

## PART 1 — Single import surface entry point

### A1. Locate the canonical import API tree

**Command:**
```
find src/app/api/import -type f | sort
```

**Output:**
```
src/app/api/import/commit/route.ts
src/app/api/import/prepare/route.ts
src/app/api/import/sci/analyze-document/route.ts
src/app/api/import/sci/analyze/route.ts
src/app/api/import/sci/execute-bulk/route.ts
src/app/api/import/sci/execute/route.ts
src/app/api/import/sci/process-job/route.ts
src/app/api/import/sci/trace/route.ts
```

### A2. Per-file handler signatures + initial logic

**`src/app/api/import/prepare/route.ts`** — POST handler. Generates signed Storage upload URL.
```
/**
 * POST /api/import/prepare
 *
 * HF-047: Prepares for file-based import by:
 *   1. Ensuring the 'imports' storage bucket exists
 *   2. Generating a signed upload URL for the client
 *
 * The client uploads the file DIRECTLY to Supabase Storage using the signed URL.
 * This bypasses Vercel's 4.5MB body limit — the file never passes through Vercel.
 */
export async function POST(request: NextRequest) {
  ...
  const { tenantId, fileName } = await request.json();
  ...
  // Generate unique storage path
  const batchId = crypto.randomUUID();
  const storagePath = `${tenantId}/${batchId}/${fileName}`;
  // Create signed upload URL (bypasses RLS, expires in 1 hour)
  const { data, error } = await supabase.storage
    .from('imports')
    .createSignedUploadUrl(storagePath);
  ...
}
```

**`src/app/api/import/commit/route.ts`** — POST handler. Older row-data-by-mappings commit path; downloads file, parses XLSX, writes `committed_data` directly. Header at line 1-10:
```
/**
 * POST /api/import/commit
 *
 * HF-047: File-based import pipeline.
 * Receives metadata only (< 50KB). Downloads file from Supabase Storage,
 * parses Excel server-side, applies field mappings, bulk inserts to DB.
 */
```

**`src/app/api/import/sci/analyze-document/route.ts`** — POST handler. Document content extraction (PDF/PPTX/DOCX/text). OB-133 / HF-101.

**`src/app/api/import/sci/analyze/route.ts`** — POST handler. SCI proposal generator (consolidated scoring pipeline). Decision 77 / OB-127 / OB-160C. Calls `generateContentProfile`, `enhanceWithHeaderComprehension`, `resolveClassification`, `classifyByHCPattern`. PROCESSING_ORDER = `{plan: 0, entity: 1, target: 2, transaction: 3, reference: 4}`.

**`src/app/api/import/sci/execute/route.ts`** — POST handler. Decision 77 / OB-127. Currently used for **plan units only** (per UI dispatcher, see A3). Imports `resolveEntitiesFromCommittedData` from `@/lib/sci/entity-resolution` (line 14).

**`src/app/api/import/sci/execute-bulk/route.ts`** — POST handler. OB-156. Server-side file processing for **non-plan units** (entity, target, transaction, reference). Header verbatim at line 1-3:
```
```

## [...575 lines elided per directive Section 0 truncation rule...]

## Last 100 lines

```markdown
1b4e4bdc HF-194 Phase 2: migrate execute/route.ts to import from lib/sci
4029b2b0 HF-194 Phase 1: extract buildFieldIdentitiesFromBindings to lib/sci
b784291c HF-194 Phase 3: add field_identities to execute-bulk metadata
34f2c42d HF-194 Phase 2: migrate execute/route.ts to import from lib/sci
d56f3e66 HF-194 Phase 1: extract buildFieldIdentitiesFromBindings to lib/sci
95efc14d HF-193 Phase 2: delete plan_agent_seeds; bridge writes metric_comprehension signals; convergence reads signals
37111ab7 Revert "HF-193-A Phase 2.2b: bridge return-shape extension"
3c628702 HF-193-A Phase 2.2b: bridge return-shape extension
```

### H2. Per-surface overlap

| Audited surface (Parts 1-7) | Touching commits (last 14d) |
|---|---|
| Part 1 (import API) | OB-198 Phase 1 (writer/reader vocab alignment); HF-194 Phase 2/3 (field_identities migration + execute-bulk metadata add); 9ebc340e (OB-196 Phase 1.5 importer refactor); 95efc14d (HF-193 Phase 2 plan_agent_seeds deletion) |
| Part 2 (SCI agents) | HF-194 Phase 1 (4029b2b0 / d56f3e66 — buildFieldIdentitiesFromBindings extracted to lib/sci); HF-194 Phase 2 (1b4e4bdc / 34f2c42d — execute/route.ts migrated to import from lib/sci); 02e77142 (OB-197 Phase 3 convergence read-path) |
| Part 3 (committed_data writes) | HF-194 Phase 3 (455474a7 / b784291c — field_identities added to execute-bulk metadata); 9ebc340e (importer refactor at OB-196 boundary) |
| Part 4 (entities writes) | None directly observed in this window — `processEntityUnit` body has not been touched recently per the log. (HF-184 unified-write predates the 14-day window.) |
| Part 5 (entity_id back-link) | **None.** The dead `_postCommitConstruction_REMOVED` function and the `resolveEntitiesFromCommittedData` library function have not been modified in the 14-day window. The dead-code marker (`// OB-182:`) predates this window. The structural-absence at calc-time also predates. |
| Part 6 (plan import) | HF-195 Phase 4 (415056d3 — Korean Test gate); HF-194 Phase 1 (1541e109 — convertComponent canonical 12-case); 9ebc340e (OB-196 Phase 1.5 — importer + plan-agent prompt refactor); ec0eceb9 (OB-196 Phase 1 — primitive-registry.ts) |
| Part 7 (convergence + calculation) | 02e77142 (OB-197 Phase 3 — convergence service read-path); 6a350c2d (OB-197 Phase 2 — write-site run_id propagation); 7b9662f9 (Phase 2 — run-calculation.ts structured failure); 390eb9ba (Phase 1.6.5 — calc-side legacy disposition) |

### Structural finding — Part 8

The entity-materialization-vs-back-link gap (Part 5) was **not introduced by any commit in the 14-day window.** The dead-code marker on `_postCommitConstruction_REMOVED` cites OB-182 (older than 14 days). The `resolveEntitiesFromCommittedData` library function is unchanged in the window. The asymmetry between `execute-bulk` (no entity-resolution call) and `execute` (calls `resolveEntitiesFromCommittedData`) is a state inherited from before the audit window, not a regression introduced during HF-194/HF-195 work.

The OB-196/HF-194/HF-195 series modified plan-side surfaces (importer prompt, convertComponent dispatch, primitive-registry) and ICS-side metadata fields (field_identities propagation through execute-bulk) but did not touch entity-resolution logic in either branch of the import surface.

---

## SUMMARY

### 1. Single-import-surface confirmation/contradiction

**Architect statement:** ONE import surface for all data files.
**Code state:** **Two endpoints, not one.** Routed by classification at the UI layer:
- `src/components/sci/SCIExecution.tsx:285-326` filters units → `execute` for plan, `execute-bulk` for non-plan.
- `src/app/api/import/sci/execute/route.ts` (used for plan + single-unit fallback)
- `src/app/api/import/sci/execute-bulk/route.ts` (used for entity, target, transaction, reference)

A third path (`src/app/api/import/commit/route.ts`, the HF-047 alternate) exists but is not exercised by the current SCI UI.

The two SCI endpoints share the upstream surface (`prepare` → Storage, `analyze` → SCI proposal) but diverge in their write/back-link behavior — see finding #4 below.

### 2. Code paths that EXIST but appear NOT TO FIRE during normal import flow

- **`_postCommitConstruction_REMOVED` in `execute-bulk/route.ts:866-1085`** — full implementation of: (a) `entities` create-if-missing, (b) `committed_data.entity_id` back-link, (c) `rule_set_assignments` create-if-missing, (d) entity store-metadata population. Function is marked `_REMOVED` per OB-182 with `@typescript-eslint/no-unused-vars` directive. **Zero callers.**
- **`resolveEntitiesFromCommittedData` in `entity-resolution.ts:26`** — DS-009 Layer 3 entity-resolution implementation. Called only from `execute/route.ts:232` (plan-pathway). **Not called from `execute-bulk` (the bulk path used for roster, target, transaction, reference imports).**
- **The OB-128 period-agnostic SELECT in `run/route.ts:441-453`** — fetches rows where `period_id IS NULL AND source_date IS NULL`. This is reachable but only useful for entity-band rows (rosters); since rosters' `entity_id` is also NULL post-import, calc-time grouping by `entity_id` collapses these rows under the NULL key.

### 3. Code paths that SHOULD EXIST per architectural spec/memory but ABSENT in code

- **Calc-time entity binding (per OB-182 documentation in `execute-bulk/route.ts:11` and lines 632-634).** The OB-182 stated architecture: "Entity binding deferred to calculation time per sequence-independence principle. committed_data.entity_id is NULL at import — engine resolves at calc time." **The calc-time resolver does not exist.** Search confirms zero `UPDATE committed_data SET entity_id` and zero in-memory equivalent (no JOIN logic that resolves `entity_id_field` from row metadata against `entities.external_id` at read time) anywhere in `src/lib/calculation/` or `src/app/api/calculation/`.
- **Symmetric entity-resolution invocation in `execute-bulk/route.ts`.** The plan path (`execute/route.ts:232`) calls `resolveEntitiesFromCommittedData(supabase, tenantId)` post-execute. The bulk path has no analogous call. Architectural symmetry would require either both paths to call it OR neither to call it (with calc-time taking over instead).

### 4. Entity-materialization-vs-back-link diagnosis (Part 5 E3)

**Answer: hybrid (a)+(c).**

- **(a)** The back-link code path EXISTS:
  - in `entity-resolution.ts:283` (DS-009 3.3 — paginated UPDATE keyed by `import_batch_id` and `is('entity_id', null)`)
  - in `execute/route.ts:1654` (inline UPDATE inside the plan-pathway entity-id-binding block)
  - in `execute-bulk/route.ts:988` (inside the dead `_postCommitConstruction_REMOVED` function)

- **(c)** No back-link code path runs for the BCL roster scenario:
  - `processEntityUnit` (the handler that ran for the BCL roster) writes `entity_id: null` and returns without invoking any of the three back-link sites.
  - `execute-bulk/route.ts` does not call `resolveEntitiesFromCommittedData`.
  - `_postCommitConstruction_REMOVED` is dead code.
  - Calc-time has no equivalent.

**Code evidence** (verbatim, key lines):
- `execute-bulk/route.ts:534`: `entity_id: null,`
- `execute-bulk/route.ts:11`: `// OB-182: convergeBindings removed from import — runs at calc time`
- `execute-bulk/route.ts:632-634`:
  ```
  // OB-182: Entity identifier field detected for semantic role tagging (NOT for binding).
  // Entity binding deferred to calculation time per sequence-independence principle.
  // committed_data.entity_id is NULL at import — engine resolves at calc time.
  ```
- `execute-bulk/route.ts:866-870`:
  ```
  // ── Post-commit construction — REMOVED by OB-182 (sequence-independence)
  // Entity binding, assignments, and store metadata deferred to calculation time.
  // Function retained as dead code reference until calc-time equivalents verified.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function _postCommitConstruction_REMOVED(
  ```
- Calc-side absence: zero `UPDATE committed_data` / zero metadata-driven entity_id resolver in `src/lib/calculation/` or `src/app/api/calculation/`.

The OB-182 promise — "engine resolves at calc time" — is documented in import-side comments but the engine-side implementation is missing. The architecture is in a *transitional state*: import-side post-commit construction has been removed, calc-side replacement has not landed.

### 5. Recent-work overlap risk

**No commit in the 14-day window introduced the entity-materialization-vs-back-link gap.** The OB-182 dead-code marker, the `resolveEntitiesFromCommittedData` library, the `execute/route.ts:232` invocation, and the calc-time absence all predate the 14-day window. The HF-194 / HF-195 / OB-196 / OB-197 / OB-198 series has touched: importer field_identities propagation, plan-prompt registry derivation, convertComponent dispatch, convergence service vocabulary, structured-failure hardening, and calc-side legacy disposition — but has **not** modified entity-resolution code on either branch of the import surface, and has not added a calc-time entity_id resolver.

The audited symmetry is therefore a **pre-existing structural state** carried from at least the OB-182 timeframe, not a regression from current HF-195 work.

---

## End of Audit
```
