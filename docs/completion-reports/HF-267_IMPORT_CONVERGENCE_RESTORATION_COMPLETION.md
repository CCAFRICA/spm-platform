# HF-267 — Import → Convergence Path Restoration — COMPLETION REPORT
## HEAD SHA: 0c3daca419c305f0c8e3d35ded6c5ee621202e06 · Date: 2026-06-02

Defect class: classification overrides/gates that suppress correct structural signals and route data to the wrong pipeline, so it never reaches committed_data and convergence has nothing to bind.

## P1 — HF-247 plan_workbook_signature override (FIXED)
```diff
diff --git a/web/src/app/api/import/sci/analyze/route.ts b/web/src/app/api/import/sci/analyze/route.ts
index 8fda38ed..6a8f2ce1 100644
--- a/web/src/app/api/import/sci/analyze/route.ts
+++ b/web/src/app/api/import/sci/analyze/route.ts
@@ -434,14 +434,23 @@ export async function POST(req: NextRequest) {
           );
           let totalRows = 0;
           let hasRateTableSignal = false;
+          // HF-267 P1 (Decision 108): a strong entity-identifier signal — HC's authoritative
+          // identifier role, surfaced structurally as profile.patterns.hasEntityIdentifier (the
+          // SAME signal the Plan Agent reads for its has_entity_id weight) — excludes a file from
+          // the plan override. A roster/quota carries an entity identifier; a plan document does not.
+          let anyHasEntityIdentifier = false;
           for (const r of fileResolutions) {
             if (!r.profile) continue;
             totalRows += r.profile.structure.rowCount;
+            if (r.profile.patterns.hasEntityIdentifier) anyHasEntityIdentifier = true;
             if (
+              // HF-267 P1: GENUINE plan discriminants only. rowCountCategory === 'reference'
+              // (merely rowCount < 50) was REMOVED — it is a row-count threshold, not a plan
+              // signal, and it let small rosters/quotas trip the override (a 32-row CRP roster
+              // scored entity:0.93 but was force-routed to plan@0.80).
               r.profile.structure.sparsity > 0.30
               || r.profile.patterns.hasPercentageValues
               || r.profile.structure.headerQuality === 'auto_generated'
-              || r.profile.patterns.rowCountCategory === 'reference'
             ) {
               hasRateTableSignal = true;
             }
@@ -457,7 +466,11 @@ export async function POST(req: NextRequest) {
           const matchesPlanSignature =
             !hasTransaction
             && totalRows < 1000
-            && hasRateTableSignal;
+            && hasRateTableSignal
+            // HF-267 P1: exclude files carrying a strong entity-identifier (rosters/quotas).
+            // A genuine plan document has no entity-identifier column; this preserves cold-start
+            // plan detection while stopping the override from capturing entity/target data.
+            && !anyHasEntityIdentifier;
           if (matchesPlanSignature) {
             console.log(
               `[SCI-PLAN-WORKBOOK] file=${file.fileName} sheets=${fileResolutions.length} ` +
```
- Root (from the prior investigation): a 32-row CRP roster scored entity:0.93 but the override forced plan@0.80, capped others to 0.10, set requiresHumanReview=false. hasRateTableSignal was satisfied by rowCountCategory==='reference' (rowCount<50).
- Fix: (a) removed rowCountCategory==='reference' from hasRateTableSignal (a row-count threshold, not a plan signal); (b) added && !anyHasEntityIdentifier to matchesPlanSignature. A roster/quota carries an entity identifier (profile.patterns.hasEntityIdentifier — HC's authoritative identifier role, Decision 108, the same signal the Plan Agent reads); a plan document does not.
- Cold-start preservation: genuine plans (no entity-id; sparsity/percentage/auto-header structure) still match (§2 architect assertion).
- Residual review: where the override no longer fires, the file falls back to the agents' scores + the normal requiresHumanReview gate (top<0.50 || gap<0.10) — the Entity win flows through naturally, not a forced auto-confirm.

## P2 — Carry-Everything safety net (FIXED)
```diff
diff --git a/web/src/lib/sci/plan-interpretation.ts b/web/src/lib/sci/plan-interpretation.ts
index 4c755783..62d153d8 100644
--- a/web/src/lib/sci/plan-interpretation.ts
+++ b/web/src/lib/sci/plan-interpretation.ts
@@ -108,7 +108,7 @@ export async function executeBatchedPlanInterpretation(
     }
     documentContent = sheetTexts.join('\n');
     console.log(`[SCI plan-interp] XLSX text extracted: ${documentContent.length} chars from ${planSheetNames.size} sheets`);
-  } else {
+  } else if (ext === 'pptx' || ext === 'docx') {
     const JSZip = (await import('jszip')).default;
     const zip = await JSZip.loadAsync(fileBuffer);
     if (ext === 'pptx') {
@@ -137,6 +137,23 @@ export async function executeBatchedPlanInterpretation(
         documentContent = matches.map(m => m[1].trim()).filter(Boolean).join(' ');
       }
     }
+  } else {
+    // HF-267 P2 (Carry Everything safety net): a tabular/unknown-format file reached the plan
+    // pipeline (misclassified as plan). Do NOT run JSZip document extraction — JSZip.loadAsync on a
+    // CSV throws "Can't find end of central directory" (and other tabular inputs hang downstream).
+    // Return an explicit, non-crashing failure so the import surfaces a clear message. No re-route
+    // (that would risk the duplicate-execution class HF-264 closed). This guard runs BEFORE the
+    // single-flight claim, so it strands nothing. XLSX/XLS plans are handled in their own branch
+    // above and are unaffected (HALT-4 CLEAR).
+    console.error(`[SCI plan-interp] HF-267: tabular/non-document file (.${ext}) reached plan interpretation — refusing document extraction (misclassified as plan).`);
+    return planUnits.map(u => ({
+      contentUnitId: u.contentUnitId,
+      classification: 'plan' as const,
+      success: false,
+      rowsProcessed: 0,
+      pipeline: 'plan-interpretation',
+      error: `File format ".${ext ?? '?'}" is a tabular data file, not a plan document — it was misclassified as a plan. Re-import it (or correct its classification: entity/target/transaction/reference). No plan was interpreted.`,
+    }));
   }
 
   if (!documentContent && !pdfBase64ForAI) {
```
- The extractor's else branch ran JSZip.loadAsync on any non-pdf/xlsx file; a CSV throws 'Can't find end of central directory'. Gated JSZip to pptx/docx; a tabular/unknown file now returns an explicit non-crashing 'misclassified as plan' failure. Guard runs BEFORE the single-flight claim (strands nothing); no re-route (avoids the HF-264 duplicate-execution class).

## P3 — Quota → committed_data (verified; resolved upstream by P1)
- Commit path (commit-content-unit.ts:356-396): processDataUnit('target') -> commitContentUnit inserts row_data: { ...row, _sheetName, _rowIndex } with data_type — ALL measure columns (e.g. monthly_quota) land in committed_data. The commit path is correct.
- Live CRP committed_data query: **{} (0 rows, empty)** — confirming data never reached committed_data because the whole import was blocked by misclassification (roster->plan crash, quota->plan hang), NOT a commit-path narrowing defect.
- Disposition: no P3-specific change. P1 (classify quota as target) is the root fix; once classified target, the existing commit path lands monthly_quota. HALT-6 boundary (convergence/calc) NOT reached.

## P4 — Import sequence independence (verified; residual flagged, no change)
- HF-183 entity-overlap boost EXISTS (analyze/route.ts:285-311): computeEntityIdOverlap(profile, sheet.rows, tenantCtx.existingEntityExternalIds) — classification confidence can depend on entities already existing (roster-first).
- Disposition: the ACUTE order-insensitive-but-wrong path (the forced override) is fixed by P1. The remaining overlap boost is an intentional confidence nudge from legitimate structural evidence (entity-id overlap), not a forced route. Whether it changes the ROUTED pipeline requires a live two-order test (architect-executed). Any change to it modifies agent scoring -> **HALT-8 (architect disposition required before touching agent weights)**. Verify-only; NO change in this HF.

## P5 — HC authority inversion (verified; RESOLVED)
- execute-bulk/route.ts:507: const idBinding = unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier'). confirmedBindings = proposalUnit.fieldBindings (SCIExecution.tsx:173/250/315) — HC/agent semantic bindings from analyze. The pipeline resolves the entity identifier from HC's authoritative role (Decision 108), NOT a convergence input_binding.
- 'No entity_identifier binding found' (execute-bulk:512) throws ONLY when HC assigned no entity_identifier role — not because it requires a pre-existing convergence binding.
- Disposition: **HALT-9 — P5 already resolved.** No change. HALT-10 boundary (convergence at import time) NOT reached.

## Build Gate
```
rm -rf .next && npm run build -> Compiled successfully
npm run dev -> Ready in 1063ms ; curl localhost:3000 -> HTTP 307 (auth redirect, normal)
```

## HALT Disposition Log
- HALT-1 (override consumers): CLEAR — plan_workbook_signature referenced only inside its own block.
- HALT-2 (hasEntityIdentifier availability): CLEAR — profile.patterns.hasEntityIdentifier on each resolution profile (same signal the Plan Agent reads).
- HALT-3 (genuine-plan suppression): not triggered — genuine plans retain sparsity/percentage/auto-header signals (§2). Architect regression on CRP/BCL/Meridian plan files recommended.
- HALT-4 (XLSX plans): CLEAR — XLSX/XLS handled in their own branch; the safety net gates only the JSZip path; XLSX plans unaffected.
- HALT-5 (P3 already resolved): N/A — committed_data empty; commit path correct; fixed upstream by P1.
- HALT-6 (P3 touches convergence/calc): not reached — import-side only.
- HALT-7 (P4 satisfied by P1): partial — acute override fixed by P1; HF-183 overlap boost remains (see HALT-8).
- HALT-8 (P4 needs agent-weight change): TRIGGERED-as-boundary — the overlap boost is agent-scoring; any change deferred to architect disposition. No change made.
- HALT-9 (P5 already resolved): CONFIRMED — pipeline honors HC identifier role.
- HALT-10 (P5 moves convergence to import): not reached.

## Expected live-verification outcomes (architect-executed)
- Roster CSV -> classified entity (not plan) -> entities created (CRP roster row count).
- Quota CSV -> classified target -> monthly_quota in committed_data row_data.
- The four CRP plan PDFs interpret (Plan 3 may still hit the HF-266 §6A emission pattern — out of scope).
- No file crashes on JSZip; no file hangs in plan interpretation (P2 safety net).
- CC did NOT run the imports; the architect captures results. CRP committed_data is currently empty — a fresh CRP import is required to verify end-to-end.

## Residuals (§10A)
- P4 overlap-boost order-dependency: separate scored-change HF with cross-tenant regression (HALT-8).
- Re-verify BCL + Meridian imports (they use rosters) to confirm P1 did not alter their classification (architect-executed).

*HF-267 — P1+P2 implemented + build-verified; P3/P4/P5 verified (P3 resolved-upstream, P4 residual-flagged, P5 already-resolved). Live import architect-executed.*
