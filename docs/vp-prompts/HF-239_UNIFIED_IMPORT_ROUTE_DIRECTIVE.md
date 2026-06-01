# HF-239 — Unified Import Route

**Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.**

---

## PROBLEM STATEMENT

Two import API routes exist: `execute/route.ts` (1465 lines) and `execute-bulk/route.ts` (676 lines). Both call `commitContentUnit` for committed_data writes. They diverge on everything else:

- `execute-bulk` clears `input_bindings` to `{}` on every data import. `execute` does not. This clearing destroyed BCL's PASS-RECONCILED state ($312,033 → $36,640) when data was re-imported through the browser.
- `execute` handles plan interpretation (AI call, rule_set upsert, comprehension signals). `execute-bulk` has no plan case.
- `execute` writes flywheel signals (fingerprint, classification, foundational, domain). `execute-bulk` writes none. The primary import path produces zero learning.
- `execute` creates rule_set_assignments (HF-126). `execute-bulk` does not.
- `execute` has a local `postCommitConstruction` per pipeline. `execute-bulk` relies solely on the shared `executePostCommitConstruction`.

The UI (`SCIExecution.tsx`) calls both routes. This has been identified, named, and deferred since March. HF-231 unified the committed_data write but left both routes alive. This HF closes the class.

**One route. `execute-bulk`'s transport model. `execute`'s side effects. `execute` deleted.**

---

## ARCHITECTURE DECISION RECORD

```
ARCHITECTURE DECISION RECORD
============================
Problem: Two import routes with divergent side effects.
         Primary path (execute-bulk) destroys convergence state.
         Primary path writes zero flywheel signals.
         Plan interpretation reachable only through secondary path.
         AP-17 open at route level since platform inception.

Option A: Keep both, align behaviors
  - AP-17: FAILS — two routes continue to drift independently
  - History: HF-184, HF-194, HF-231, HF-233 each aligned one behavior.
    Drift recurred at the next unaligned behavior. Four closures of
    instances without closing the class.
  REJECTED.

Option B: Delete execute, merge into execute-bulk
  - AP-17: PASSES — one route
  - Transport: Storage (execute-bulk model) — server-side parse, no
    request body size limits
  - Side effects: plan interp + flywheel + assignments merged in
  - Binding clearing: removed entirely
  CHOSEN.

CHOSEN: Option B.
```

---

## GOVERNING CONSTRAINTS

1. **ONE route.** After this HF, `web/src/app/api/import/sci/execute/route.ts` does not exist. The directory can be removed.

2. **No binding clearing.** The three `input_bindings: {}` write sites in execute-bulk are DELETED. Not modified. Not made conditional. Deleted. Calc-time convergence has a versioning gate (`convergence_version`) that re-derives when stale. The blanket wipe that destroyed BCL's PASS-RECONCILED state is removed.

3. **Plan interpretation survives.** `execute-bulk`'s `processContentUnit` dispatcher gains a `case 'plan'` arm. Plan interpretation logic from `execute` is extracted into a shared module or moved directly into execute-bulk.

4. **Flywheel survives.** The signal emission block from `execute`'s POST handler tail (fingerprint write, classification signal, foundational aggregation, domain aggregation) moves into execute-bulk's POST handler tail. Fire-and-forget. Never blocks import.

5. **Assignment creation survives.** HF-126's rule_set_assignment creation moves into execute-bulk's POST handler tail, after `executePostCommitConstruction`.

6. **Store metadata survives.** `execute`'s local `postCommitConstruction` helper contains store metadata population logic (STORE_FIELDS, TIER_FIELDS, VOLUME_KEY_FIELDS). This logic must be absorbed into the shared `executePostCommitConstruction` module or into execute-bulk directly. It cannot be silently dropped.

7. **Domain-agnostic.** Zero tenant names, zero plan names, zero product category names anywhere.

8. **Reconciliation-channel separation.** After completion, trigger calculation for all active tenants. Report calculated values. Do not interpret.

---

## PHASE 0 — EXTRACT SHARED MODULES

Before modifying either route, extract reusable logic from `execute/route.ts` into shared modules. This prevents the merge from creating a 2000+ line monolith.

### 0.1 — Plan interpretation module

Extract `executeBatchedPlanInterpretation` (lines 709-965) and `executePlanPipeline` (lines 972-1215) from `execute/route.ts` into:

`web/src/lib/sci/plan-interpretation.ts`

The module exports two functions with the same signatures. Internal logic unchanged — file download from Storage, text extraction (XLSX/PPTX/DOCX/PDF), AI interpretation, bridge to engine format, rule_set supersession + upsert, comprehension signal emission.

### 0.2 — Flywheel signal emission module

Extract the signal emission block from `execute/route.ts` POST handler (lines 826-940) into:

`web/src/lib/sci/flywheel-signal-emission.ts`

Export a single function: `emitFlywheelSignals(params)` that takes the content units, tenant ID, and Supabase client/env vars. Performs: `writeClassificationSignal`, `writeFingerprint` (with HF-236 enriched bindings), `aggregateToFoundational`, `aggregateToDomain`. All fire-and-forget.

### 0.3 — Assignment creation

Extract the HF-126 assignment block from `execute/route.ts` POST handler (lines 734-817) into:

`web/src/lib/sci/assignment-creation.ts`

Export: `createMissingAssignments(supabase, tenantId)`. Fetches all entities, all active rule_sets, finds unassigned pairs, bulk inserts.

### 0.4 — Store metadata population

The local `postCommitConstruction` helper in `execute/route.ts` (lines 1228-1465) contains store metadata logic (STORE_FIELDS, TIER_FIELDS, VOLUME_KEY_FIELDS — lines 1894-1986 in AUD-012). Extract into:

`web/src/lib/sci/store-metadata-population.ts`

Or absorb into the existing `executePostCommitConstruction` shared module. Read the shared module first — if it already handles store metadata, no extraction needed. If not, add it.

**Verification gate:** After Phase 0, both routes still work unchanged. The extractions are additive — new files, no modifications to either route yet. `npm run build` clean.

---

## PHASE 1 — MERGE INTO EXECUTE-BULK

### 1.1 — Add plan case to dispatcher

In `execute-bulk/route.ts`, add `case 'plan'` to `processContentUnit` (line ~310):

```typescript
case 'plan':
  return processPlanUnit(supabase, tenantId, proposalId, unit, rows, fileName, tabName, profileId, fileHashSha256);
```

Implement `processPlanUnit` by calling the extracted plan interpretation module from Phase 0.1. The function receives the Storage path (already available in execute-bulk's POST handler — `storagePath` from the request body). Plan units from the same file should be batched into one AI call (same as `executeBatchedPlanInterpretation`).

Handle the batching at the POST handler level: before the per-unit dispatch loop, collect plan-classified units. If any exist, call the batched interpretation function with the Storage path. Mark handled plan units so the dispatch loop skips them. This is the same pattern `execute` uses (lines 685-701).

### 1.2 — Add flywheel signals to POST handler tail

After `executePostCommitConstruction` (line ~240), call the extracted flywheel signal emission module from Phase 0.2:

```typescript
await executePostCommitConstruction({ supabase, tenantId, source: 'sci-bulk' });

// Flywheel signals — fire-and-forget
try {
  await emitFlywheelSignals({ contentUnits, tenantId, supabase, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
} catch { /* never blocks import */ }
```

The content units from the request body carry `confirmedClassification`, `structuralFingerprint`, `confirmedBindings`, `classificationTrace`, `originalClassification`, `originalConfidence`. These are the inputs to the signal functions. Read the extracted module to confirm the parameter shape.

### 1.3 — Add assignment creation to POST handler tail

After flywheel signals, call the extracted assignment creation module from Phase 0.3:

```typescript
try {
  await createMissingAssignments(supabase, tenantId);
} catch (err) {
  console.error('[SCI Bulk] Assignment creation failed (non-blocking):', err);
}
```

### 1.4 — Add store metadata to post-commit

If Phase 0.4 determined store metadata is missing from `executePostCommitConstruction`, add it. If already present, no change.

### 1.5 — Remove binding clearing

DELETE the three `input_bindings: {}` blocks:

- `processEntityUnit` lines ~528-538
- `processDataUnit` lines ~575-586
- `processReferenceUnit` lines ~653-664

Delete entirely. Not conditional. Not behind a flag. These three blocks are why BCL's PASS-RECONCILED state was destroyed.

**Verification gate:** `grep -rn "input_bindings.*{}" web/src/app/api/import/sci/execute-bulk/route.ts` returns zero hits.

---

## PHASE 2 — UPDATE UI

### 2.1 — SCIExecution.tsx

All three fetch calls point to `/api/import/sci/execute-bulk`:

- Line 189: already calls execute-bulk. No change.
- Line 266 (`executeLegacyUnit`): change `/api/import/sci/execute` to `/api/import/sci/execute-bulk`. The request body shape must match execute-bulk's `BulkRequest` shape. Read both request shapes and map.
- Line 326 (plan batch): change `/api/import/sci/execute` to `/api/import/sci/execute-bulk`. Plan units now go through execute-bulk's new `case 'plan'` arm.

If the request body shape differs between execute and execute-bulk (execute sends `contentUnits` with `rawData` embedded; execute-bulk sends `storagePath` + `contentUnits` without `rawData`), the UI must send the Storage path for all cases. Plans and data alike go through Storage transport. If `executeLegacyUnit` currently sends rawData in the request body, it must instead upload to Storage and send the path — or the function must be eliminated entirely if execute-bulk's primary path already handles all cases.

Read the UI code at HEAD to determine: does the primary execute-bulk path already cover all content unit types that `executeLegacyUnit` handles? If yes, delete `executeLegacyUnit`. If no, adapt it to use execute-bulk's transport.

### 2.2 — Verify no other callers

```bash
grep -rn "/api/import/sci/execute" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v route.ts | grep -v ".test."
```

After changes, every hit must point to `/api/import/sci/execute-bulk`. Zero references to `/api/import/sci/execute` (without `-bulk`).

---

## PHASE 3 — DELETE EXECUTE

### 3.1 — Delete the route file

```bash
rm web/src/app/api/import/sci/execute/route.ts
```

If the directory contains only this file, remove the directory too.

### 3.2 — Verify no dangling imports

```bash
grep -rn "import.*execute/route\|from.*execute/route\|/api/import/sci/execute[^-]" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Zero hits. Nothing imports from or references the deleted route.

**Verification gate:** `npm run build` clean. The build will fail if anything references the deleted file.

---

## PHASE 4 — CALCULATE AND REPORT

### 4.1 — Trigger calculation for all active tenants

Through the browser or via script. All tenants, all plans, all periods.

Report per-tenant, per-plan, per-period commission totals. Report grand totals per tenant.

Do NOT interpret the results. Report the numbers.

### 4.2 — Verify flywheel writes

After importing data through the browser for any tenant, confirm flywheel signals are emitted. Check `structural_fingerprints` for new/updated rows. Check `classification_signals` for new entries.

---

## PHASE 5 — COMPLETION REPORT

Save to `docs/completion-reports/HF-239_COMPLETION_REPORT.md` and commit.

Must include:

1. **Extracted modules.** List each new file created in Phase 0 with line counts and exported functions.

2. **Deletion evidence.**
   ```bash
   ls web/src/app/api/import/sci/execute/
   ```
   Should return "No such file or directory."

3. **Binding-clearing evidence.**
   ```bash
   grep -rn "input_bindings.*{}" web/src/app/api/import/sci/ --include="*.ts"
   ```
   Zero hits.

4. **UI evidence.**
   ```bash
   grep -rn "/api/import/sci/execute" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v route.ts
   ```
   All hits reference `execute-bulk`. Zero references to bare `execute`.

5. **Plan import verification.** Import a plan through the browser. Confirm it routes through execute-bulk's new plan arm. Paste the stored `rule_set` showing `input_bindings` populated from AI interpretation.

6. **Flywheel verification.** Import data through the browser. Confirm `structural_fingerprints` updated. Paste evidence.

7. **Calculation results.** Per-tenant, per-plan, per-period totals. Grand totals.

8. **Build verification.** `npm run build` clean. `localhost:3000` responding.

---

## BUILD AND DEPLOY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — zero errors
4. `npm run dev` — `localhost:3000` responds
5. Git commands from repo root (`spm-platform`), NOT from `web/`
6. Branch: `hf-239-unified-import-route` off `main`
7. `gh pr create --base main --head hf-239-unified-import-route` with title: "HF-239: Unified import route — delete execute, merge side effects into execute-bulk, remove binding clearing"
8. PR body: "Deletes execute/route.ts (1465 lines). Merges plan interpretation, flywheel signals, assignment creation, and store metadata into execute-bulk. Removes three input_bindings clearing calls that destroyed BCL PASS-RECONCILED state. Extracts shared modules for plan interpretation, flywheel emission, and assignment creation. Single import API. AP-17 closed at route level."

---

## ANTI-PATTERN CHECKLIST

```
Before submitting completion report, verify:
□ execute/route.ts deleted?
□ execute-bulk handles all 5 classifications (entity, target, transaction, reference, plan)?
□ input_bindings clearing — zero hits?
□ Flywheel signals emitted from execute-bulk?
□ rule_set_assignments created from execute-bulk?
□ Store metadata populated?
□ UI calls execute-bulk exclusively — zero references to bare execute?
□ AP-17: ONE import route?
□ AP-5/AP-6: No hardcoded field names added?
□ Domain-agnostic: zero tenant names?
□ Build clean?
□ SR-34: No known bypasses remaining?
```
