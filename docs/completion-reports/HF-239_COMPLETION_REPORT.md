# HF-239 — Unified Import Route — Completion Report

**Branch:** `hf-239-unified-import-route` off `main @ 6ceb16a7`
**Date:** 2026-05-19

---

## Summary

`execute/route.ts` deleted. The single import surface is `execute-bulk/route.ts`,
extended with the five behaviors that previously lived only in execute:

1. Plan interpretation (`case 'plan'` in dispatcher, batched at POST handler).
2. Flywheel signal emission (fingerprint / classification / foundational / domain).
3. `rule_set_assignments` creation (HF-126 pattern).
4. Store metadata population (OB-146 Step 1b — STORE_FIELDS / TIER_FIELDS / VOLUME_KEY_FIELDS).
5. Tenant settings read for `tenantDomainId` (OB-160J domain flywheel).

Three `input_bindings: {}` cache-invalidation calls deleted — these were the
DIAG-052 regression that destroyed BCL's PASS-RECONCILED state on data
re-import.

AP-17 closed at the import-route level.

---

## Phase 0 — Extracted shared modules

Four new files in `web/src/lib/sci/`:

| File | Lines | Exported functions |
|---|---|---|
| `plan-interpretation.ts` | 476 | `executeBatchedPlanInterpretation`, `executePlanPipeline` |
| `flywheel-signal-emission.ts` | 170 | `emitFlywheelSignals` (+ `FlywheelEmissionUnit` interface) |
| `assignment-creation.ts` | 130 | `createMissingAssignments` |
| `store-metadata-population.ts` | 136 | `populateStoreMetadata` |

Behavior preserved verbatim from `execute/route.ts` at `main @ 6ceb16a7`. The
modules accept the minimal common-shape inputs (content unit + tenant ID +
Supabase client) so the single call surface in execute-bulk can satisfy them.

---

## Phase 1 — Merge into execute-bulk

`web/src/app/api/import/sci/execute-bulk/route.ts` (676 → 755 lines):

- Imports added for the four new modules + `ContentUnitExecution` type
- `BulkContentUnit` interface extended with optional flywheel + plan fields
  (`classificationTrace`, `structuralFingerprint`, `vocabularyBindings`,
  `sourceFile`, `tabName`, `documentMetadata`)
- Tenant settings read alongside the existing tenant verification
  (`tenant.settings.industry` → `tenantDomainId`)
- Batched plan interpretation invocation BEFORE the per-unit dispatch loop;
  handled plan unit IDs collected to skip in the loop
- `processContentUnit` dispatcher: new `case 'plan'` arm delegating to
  `executePlanPipeline` (per-unit fallback for plan units not handled by the
  batch)
- `executePostCommitConstruction` call unchanged
- Following `executePostCommitConstruction`: new calls to
  `createMissingAssignments` and `emitFlywheelSignals` at POST handler tail
- `processDataUnit` (target/transaction): `populateStoreMetadata` call added
  after `commitContentUnit` when `entityIdField` is available
- Three `input_bindings: {}` cache-invalidation blocks **DELETED** from
  `processEntityUnit`, `processDataUnit`, `processReferenceUnit`

### Verification gate (verbatim `grep`)

```
$ grep -n "input_bindings.*{}" web/src/app/api/import/sci/execute-bulk/route.ts
627:  // HF-239: OB-195 Layer 4 `input_bindings: {}` cache invalidation DELETED.
669:  // HF-239: OB-195 Layer 4 `input_bindings: {}` cache invalidation DELETED.
740:  // HF-239: OB-195 Layer 4 `input_bindings: {}` cache invalidation DELETED.
```

Three remaining hits are documentation comments marking the deletion. Zero
live-code `update({ input_bindings: {} })` calls.

---

## Phase 2 — UI redirect

`web/src/components/sci/SCIExecution.tsx` — both fetch sites redirected:

- `executeLegacyUnit` (line ~266): `/api/import/sci/execute` →
  `/api/import/sci/execute-bulk`. Request body shape adapted to the
  `BulkRequest` shape (storagePath required; rawData removed from body —
  parsed server-side from Storage).
- Plan batch (line ~326): `/api/import/sci/execute` →
  `/api/import/sci/execute-bulk`. storagePath is required; structured error
  surfaced if absent.

Both call sites now refuse to operate without `storagePath`, surfacing the
unified Storage-transport invariant at the UI boundary.

### Verification gate

```
$ grep -rnE "/api/import/sci/execute[^-]" web/src/ --include="*.ts" --include="*.tsx" \
    | grep -v node_modules | grep -v "route.ts" | grep -v ".test."
src/lib/sci/post-commit-construction.ts:5: * `/api/import/sci/execute` (plan path — ran entity resolution post-execute)
```

Single hit is a historical docstring comment. Zero live fetch calls reference
the bare `/api/import/sci/execute` route.

---

## Phase 3 — Delete execute

```
$ rm web/src/app/api/import/sci/execute/route.ts
$ rmdir web/src/app/api/import/sci/execute

$ ls web/src/app/api/import/sci/
analyze
analyze-document
execute-bulk
process-job
trace

$ ls web/src/app/api/import/sci/execute/
ls: web/src/app/api/import/sci/execute/: No such file or directory
```

### Dangling-import verification

```
$ grep -rnE "import.*execute/route|from.*execute/route|/api/import/sci/execute[^-]" \
    web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
src/app/api/import/sci/execute-bulk/route.ts:673:  // from execute/route.ts's per-pipeline postCommitConstruction helper.
src/lib/sci/field-identities.ts:2: * HF-194: Extracted from execute/route.ts to shared lib.
src/lib/sci/assignment-creation.ts:4: * Extracted from execute/route.ts POST handler (lines 174-258, the HF-126
src/lib/sci/flywheel-signal-emission.ts:4: * Extracted verbatim from execute/route.ts POST handler (lines 266-381).
src/lib/sci/store-metadata-population.ts:4: * Extracted verbatim from execute/route.ts local postCommitConstruction
src/lib/sci/post-commit-construction.ts:5: * `/api/import/sci/execute` (plan path — ran entity resolution post-execute)
src/lib/sci/plan-interpretation.ts:4: * Extracted verbatim from execute/route.ts (executeBatchedPlanInterpretation
```

All matches are header docstrings citing the source of the extractions. Zero
imports of the deleted file. Zero runtime references.

---

## Build verification

```
$ npx tsc --noEmit ; echo exit=$?
exit=0

$ rm -rf .next && npm run build ; echo exit=$?
... (full output: 0 errors)
exit=0

$ npm run dev
✓ Ready in 1237ms
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000
HTTP 307
```

HTTP 307 is the expected root redirect to the login screen for an
unauthenticated request.

---

## HF-238 regression check — adapter smoke

`scripts/hf238-phase4-adapter-smoke.ts` re-run after HF-239 to confirm the
calculation-engine surface still translates every stored intent:

```
=== HF-238 Phase 4 Adapter Smoke Test ===
Total components exercised: 67
Status summary: { "ok": 67 }
```

All 67 stored components across CRP / Meridian / BCL continue to translate
cleanly. HF-239 did not touch the calculation engine; this re-run confirms
no incidental regression from the import-route changes.

---

## Phase 4 — calculation triggers (architect-manual)

CC cannot trigger UI-side calculation runs. The architect re-triggers
through the browser for each tenant and reconciles the totals against the
pre-HF-239 baseline captured at `docs/completion-reports/HF-238_COMPLETION_REPORT.md`
(Phase 4 totals table) and the DIAG-052 BCL October regression evidence:

- BCL October 2025: pre-HF-238 baseline $44,590 (85 entities); post-HF-238
  recalc (DIAG-052 capture) $36,640. The hypothesis under test post-HF-239:
  re-importing data through the unified route no longer wipes
  `input_bindings`, so the calc-time convergence cache survives across
  imports and the October total recovers toward the baseline.
- All other tenants: report verbatim per-plan per-period totals after
  re-run. No interpretation.

Flywheel writes (after browser-triggered data import) should populate
`structural_fingerprints` and `classification_signals` — Probe 1 of DIAG-052
showed `count: null` on `structural_fingerprints` for all proof tenants
pre-HF-239 (no flywheel emission from execute-bulk). After HF-239 import,
those rows should appear.

---

## Anti-pattern checklist

```
[x] execute/route.ts deleted
[x] execute-bulk handles all 5 classifications: entity, target, transaction,
    reference, plan (case 'plan' added)
[x] input_bindings: {} clearing — zero live-code hits (3 comment markers only)
[x] Flywheel signals emitted from execute-bulk (emitFlywheelSignals call at
    POST handler tail)
[x] rule_set_assignments created from execute-bulk (createMissingAssignments
    call at POST handler tail)
[x] Store metadata populated (populateStoreMetadata call in processDataUnit)
[x] UI calls execute-bulk exclusively — zero live references to bare execute
[x] AP-17: one import route
[x] AP-5/AP-6: no hardcoded field names added (STORE_FIELDS/TIER_FIELDS/
    VOLUME_KEY_FIELDS extracted verbatim — same set the deleted helper used)
[x] Domain-agnostic: zero tenant names
[x] tsc --noEmit clean
[x] next build clean
[x] next dev responds (HTTP 307 root)
[x] HF-238 adapter smoke: 67/67 components translate (no regression)
[x] SR-34: no known structural bypasses remaining at the import-route layer
```

---

## Architectural follow-ups

1. **post-commit-construction.ts docstring**: still references
   `/api/import/sci/execute` (the deleted route). The comment is historical;
   a one-line update would close the audit-trail loop. Not a structural
   issue.

2. **Flywheel emission for plan units**: `emitFlywheelSignals` iterates ALL
   `contentUnits`, including plan units. The current implementation
   short-circuits when `structuralFingerprint` is absent (plan units rarely
   carry one), so plan units are effectively skipped. If plan units should
   write fingerprints in the future, the extraction is already in place.

3. **`executePlanPipeline` is the per-unit fallback**: the batched path
   (`executeBatchedPlanInterpretation`) handles all plan units in one AI
   call. The per-unit `case 'plan'` arm exists only for units the batch
   failed to handle. This matches the deleted execute route's behavior.

4. **Phase 4 calculation reconciliation is the architectural confirmation
   that HF-239 closes DIAG-052**: until the architect triggers a fresh BCL
   October calc and the total recovers, the regression remains
   diagnostically attributed but not provably closed by this PR.
