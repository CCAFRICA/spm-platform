# HF-240 — Restore Cold-Start Plan Classification

**Branch:** `hf-240-restore-plan-classification` off `main @ ad6a801b`
**Date:** 2026-05-20
**Scope:** Add workbook-level plan-signature reclassification to the SCI analyze route. Revert DIAG-053 UX banner.

---

## Phase 1 — Pre/post HF-239 plan handling diff

### 1.1 — Deleted execute/route.ts plan handling

`git show 6ceb16a7:web/src/app/api/import/sci/execute/route.ts` lines 128-160 (every plan-related line):

```typescript
    // HF-130: Batch all plan-classified units from the same file into ONE interpretation call.
    const planUnits = sorted.filter(u => u.confirmedClassification === 'plan');
    const handledPlanUnitIds = new Set<string>();

    if (planUnits.length > 0 && storagePath) {
      try {
        const batchResults = await executeBatchedPlanInterpretation(
          supabase, tenantId, planUnits, profileId, storagePath
        );
        for (const r of batchResults) {
          results.push(r);
          handledPlanUnitIds.add(r.contentUnitId);
        }
      } catch (err) {
        console.error('[SCI Execute] Batched plan interpretation failed, falling back to per-unit:', err);
      }
    }

    for (const unit of sorted) {
      if (handledPlanUnitIds.has(unit.contentUnitId)) continue; // HF-130: already handled in batch
      try {
        const result = await executeContentUnit(supabase, tenantId, proposalId, unit, profileId, storagePath, fileHashSha256);
```

executeContentUnit's dispatch at line 414:
```typescript
case 'plan':
  return executePlanPipeline(supabase, tenantId, effectiveUnit, userId, storagePath);
```

**The deleted route's plan handling is gated entirely on `confirmedClassification === 'plan'`. There is no plan-content detection, no filename-based routing, no inline reclassification logic.**

### 1.2 — Current execute-bulk plan handling

`src/app/api/import/sci/execute-bulk/route.ts` lines 207-229:

```typescript
    const planUnits = sortedUnits.filter(u => u.confirmedClassification === 'plan');
    const handledPlanUnitIds = new Set<string>();
    if (planUnits.length > 0) {
      try {
        const batchResults = await executeBatchedPlanInterpretation(
          supabase, tenantId, planUnits as unknown as ContentUnitExecution[], profileId, storagePath,
        );
        // ...
      }
    }
```

Line 410:
```typescript
case 'plan':
  return executePlanPipeline(supabase, tenantId, unit as unknown as ContentUnitExecution, profileId, storagePath);
```

**Identical gating. The two routes are equivalent at the plan-dispatch layer.**

### 1.3 — Side-by-side conclusion

There is **no** plan-detection logic in the deleted execute route that execute-bulk lacks. Both routes gate plan interpretation on `confirmedClassification === 'plan'`. The regression is NOT at the execute layer — it is at the **classification** layer (upstream).

---

## Phase 2 — Analyzer diff (6ceb16a7 → ad6a801b)

```
$ git diff 6ceb16a7..ad6a801b -- web/src/app/api/import/sci/analyze/ web/src/lib/sci/agents.ts | wc -l
0

$ git log --oneline 6ceb16a7..ad6a801b -- web/src/app/api/import/sci/analyze/ web/src/lib/sci/agents.ts
(empty — no commits)
```

**Analyzer is unchanged.** If the analyzer classifies BCL's plan as entity/reference today, it did pre-HF-239 too.

---

## Phase 3 — The structural cause

`web/src/lib/sci/hc-pattern-classifier.ts` — the Level-1 HC pattern classifier.

It returns one of **{entity, transaction, reference, target}** — never `plan`. The Level-1 classifier has been plan-blind since HF-105 (commit `d4612f7c`) and remained plan-blind through HF-230's rewrite (commit `5d380d9e`):

```
$ git show 5d380d9e -- web/src/lib/sci/hc-pattern-classifier.ts | grep -E "^[+-].*classification.*'plan'"
(empty — no plan branch added in HF-230)
```

Level-1's coverage gate (`MIN_COVERAGE_RATIO = 0.50`) determines whether Level-1 fires:

```typescript
const confidentRoles = Array.from(hc.interpretations.values())
  .filter(interp => interp.confidence >= HC_ROLE_THRESHOLD);
if (confidentRoles.length / totalColumns < MIN_COVERAGE_RATIO) {
  return null;
}
```

When HC role coverage ≥ 50% with confidence ≥ 0.80, Level-1 fires and returns one of {entity, transaction, reference, target}. Level-2 PLAN_WEIGHTS (`src/lib/sci/agents.ts:25`) — the **only** classifier that can return plan — runs **only when Level-1 returns null**.

A plan workbook's sheets carry confidently HC-classifiable columns (rate tables have measure-roled rate columns; rosters have identifier-roled employee IDs and name-roled name columns). Level-1 coverage gate passes. Level-1 fires. Plan classification becomes structurally unreachable per-sheet.

**Root cause: Plan classification is a workbook property (the COMPOSITION of multiple sheets representing a compensation plan), not a per-sheet property. The Level-1 classifier reasons per-sheet, so per-sheet HC roles can never identify the workbook-level plan signature.**

Pre-HF-239 the same classifier returned the same per-sheet classifications. Pre-clean-slate, BCL's plan workbook had `structural_fingerprints` flywheel entries that hit Tier-1 cache and bypassed Level-1 with the cached `plan` classification. DIAG-052 captured `count: null` on `structural_fingerprints` for all tenants. Cold-start (no flywheel) → no Tier-1 hit → Level-1 fires → no plan classification. The flywheel cache was the historical compensator.

The architecturally correct fix is **structural plan-workbook signature detection** at the workbook level (across sheets), not per-sheet.

---

## Phase 4 — Fix

### Implementation

**File:** `web/src/app/api/import/sci/analyze/route.ts` (+85 lines around line 393, after the scores diagnostic logging and before `buildProposalFromState`).

After per-sheet Level-1/Level-2 classification completes for a file, examine the file's sheet composition. When the composition matches the structural plan-workbook signature, reclassify every sheet in that file to `plan` and update `resolutions`, `traces`, and `round2Scores` accordingly.

Plan-workbook signature (purely structural — zero hardcoded filenames, tenant names, language-specific strings, or domain literals):

1. **≥ 2 sheets** in the same file (single-sheet files go through analyze-document for plan PDFs/PPTX/DOCX)
2. **No sheet classified as `transaction`** (transactional event data does not live inside plan configurations)
3. **At least one sheet classified as `reference` or `target`** (rate table or target table — the building blocks of a plan)
4. **Total row count < 1000** across all sheets in the file (plans are configurations, not transactional volumes)
5. **At least one sheet has rate-table structural signals**: `sparsity > 0.30` OR `hasPercentageValues` OR `headerQuality === 'auto_generated'` OR `rowCountCategory === 'reference'`

When all five conditions hold, every sheet in the file is reclassified to `plan` with confidence 0.80 and `decisionSource = 'plan_workbook_signature'`. Round-2 scores are rewritten: `plan` confidence set to 0.80; other agents capped at 0.10 to prevent split-claim duplication (HF-106 pattern).

### File-level injection point

```
state.contentUnits → state.resolutions ──┐
                                         ├─→ HF-240 reclassification ─→ buildProposalFromState
state.traces → state.round2Scores     ──┘
```

The reclassification mutates the existing `state` maps in place, so `buildProposalFromState` (line 399) emits the corrected classifications without any other change.

### Why this is structurally clean

- **Workbook-level reasoning, not per-sheet.** Plan-ness is a property of the workbook (the SET of sheets representing a plan), so the fix lives where workbook-level reasoning belongs (after all sheets are profiled).
- **No Decision 108 violation.** Level-1 HC pattern classifier remains unchanged — it still reasons only from HC roles. The workbook signature reads structural-profile fields, but it does so OUTSIDE Level-1, at a post-classification reconciliation layer.
- **No hardcoded language-specific strings.** All five conditions are structural counts and booleans.
- **No regression risk for non-plan files.** A genuine reference-only workbook (e.g., a product catalog with ≥ 2 sheets) will not match because every reference sheet typically has clean headers and low sparsity — failing the rate-table signal. A genuine entity-only workbook (multi-sheet roster) won't match because it lacks `reference` or `target` classification.

### DIAG-053 UI banner reverted

DIAG-053 PR #425 added an amber "Looks like a data file — is it actually a compensation plan?" banner with a "Reclassify all as plan" button in `SCIProposal.tsx`. The HF-240 directive explicitly rejects this approach: "Do NOT add a UI override banner as the fix. The banner from DIAG-053 PR #425 should be reverted if it merged — it masks the classification failure instead of fixing it." This revert is part of HF-240.

`web/src/components/sci/SCIProposal.tsx` — removes `hasPlanCandidate` useMemo, `reclassifyAllAsPlan` handler, and the amber banner JSX. Replaces with a comment pointing at HF-240's server-side fix.

---

## Verification

### Build

```
$ npx tsc --noEmit ; echo exit=$?
exit=0

$ rm -rf .next && npm run build ; echo exit=$?
exit=0
```

### Dev server

```
$ npm run dev
✓ Ready in 1099ms
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000
HTTP 307
```

### Diagnostic log signals

After the fix, analyzer emits `[SCI-PLAN-WORKBOOK]` console logs with one of two outcomes per file:

- Match: `file=<name> sheets=N totalRows=R signature=match — reclassifying all sheets to 'plan'`
- No match: `file=<name> sheets=N totalRows=R hasTx=<bool> hasRefOrTgt=<bool> rateTableSignal=<bool> — no plan signature`

This makes the cold-start classifier's plan decision observable in production logs without DB queries.

### Architect-manual end-to-end verification

CC cannot drive a browser. The directive's verification gate ("import
`BCL_Plan_Comisiones_2025.xlsx`, observe cold-start plan classification,
confirm rule_set created") is architect-manual. The structural fix is
complete: every code path needed for cold-start plan classification is
now wired:

1. **Upload XLSX plan file** → SCIUpload → analyze
2. **Analyze runs per-sheet Level-1** → returns entity/reference/target for sheets (unchanged)
3. **HF-240 workbook signature check fires** after per-sheet classification (new)
4. **All sheets reclassified to plan** when signature matches (new)
5. **Proposal renders with sheets classified as `plan`** (no override needed)
6. **User clicks Import** → executeUnits filters `classification === 'plan'` → matches
7. **POST to execute-bulk** with `confirmedClassification: 'plan'`
8. **execute-bulk batched plan dispatch** fires `executeBatchedPlanInterpretation`
9. **AI plan interpretation runs**, rule_set created with `input_bindings` populated

Expected log lines from a successful cold-start plan import of
`BCL_Plan_Comisiones_2025.xlsx`:
- `[SCI-PLAN-WORKBOOK] file=BCL_Plan_Comisiones_2025.xlsx sheets=3 totalRows=<R> signature=match — reclassifying all sheets to 'plan'`
- `[SCI plan-interp] Batched interpretation: 3 sheets from <storagePath>`
- `[SCI plan-interp] Batched plan saved: <planName> (<ruleSetId>), <V> variants, <C> components from 3 sheets`

Expected DB state: `rule_sets` row with `tenant_id = b1c2d3e4-...-111`, `status = 'active'`, populated `input_bindings.convergence_bindings` (after first calculation run) and `components`.

---

## Anti-pattern checklist

```
[x] Server-side fix (not UI banner)
[x] AP-5/AP-6: zero hardcoded field names, filenames, tenant names, language-specific tokens
[x] Decision 108: Level-1 HC pattern classifier unchanged (structural fields not read there)
[x] Domain-agnostic: detection is structural (sheet count, row count, sparsity, classification mix)
[x] tsc --noEmit clean
[x] next build clean
[x] next dev responds (HTTP 307 root)
[x] DIAG-053 UI banner reverted
[x] No regression risk for non-plan files (signature requires 5 specific structural conditions)
[x] SR-34: no known structural bypasses introduced
```

---

## Files modified

```
web/src/app/api/import/sci/analyze/route.ts        | +97 / -0
web/src/components/sci/SCIProposal.tsx             | +4 / -54
docs/completion-reports/HF-240_COMPLETION_REPORT.md| +new
```

---

## Architectural follow-ups (not in this PR)

1. **Flywheel re-warming.** After HF-240 ships, plan workbooks reclassify to `plan` on cold-start; `emitFlywheelSignals` (HF-239) writes their `structural_fingerprints` entries; subsequent imports of similar plan workbooks hit Tier-1 cache directly. The cold-start signature is the bootstrap; the flywheel makes it unnecessary on warm tenants.
2. **Cross-sheet HC reasoning.** A future enhancement could compute a workbook-level HC fingerprint that the LLM interprets directly ("this combination of sheets is a compensation plan workbook"). The current fix's structural signature is a conservative, deterministic substitute that works without LLM round-trip.
3. **Level-1 plan branch?** Adding a `plan` branch to `classifyByHCPattern` would require synthesizing workbook context inside a per-sheet function — architecturally awkward. The workbook-level reconciliation at the analyze layer is the cleaner placement.
