# HF-267 — Import → Convergence Path Restoration

## §0 — Standing Rules

Read `CC_STANDING_ARCHITECTURE_RULES.md`. Anti-Pattern Registry checked every build. Architecture Decision Gate: this HF modifies classification and routing on EXISTING surfaces — no new tables, no new agents, no new pipeline stages. Drafting per `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

EVIDENTIARY GATES: every phase requires pasted code, terminal output, or query results. No self-attestation. No "should now work" — paste the proof.

Commit + push after each phase. Build gate before completion report.

---

## §1 — Problem Statement

One defect class, recurring for months: **classification overrides and gates that suppress correct structural signals, routing data to the wrong pipeline so it never reaches committed_data, so convergence has nothing to bind.** Five surfaces, two confirmed-current and three requiring current-state verification.

**P1 — HF-247 `plan_workbook_signature` override (CONFIRMED, acute blocker).** In `web/src/app/api/import/sci/analyze/route.ts` (~lines 436-497), a heuristic force-reclassifies any file matching `!hasTransaction && totalRows < 1000 && hasRateTableSignal` to `plan@0.80`, caps every other agent to `min(conf, 0.10)`, and sets `requiresHumanReview = false`. Evidence (live classification_signals, this session): a 32-row CRP employee roster scored `entity:0.93` by the agents, but the override forced `plan@0.80`, capped Entity to 0.10, and auto-confirmed. `hasRateTableSignal` is satisfied by `rowCountCategory === 'reference'`, which is merely `rowCount < 50` (content-profile.ts:636). A small roster or quota trips all three conjuncts. The override predates the 48-hour window (no recent commit) — long-standing.

**P2 — Misclassification → data never reaches committed_data (CONFIRMED).** Every data pipeline (`processEntityUnit`, `processDataUnit`, `processReferenceUnit`) writes to committed_data via `commitContentUnit`. `executeBatchedPlanInterpretation` does NOT. A roster forced to `plan` creates no entities; a quota forced to `plan` lands no `monthly_quota`. The roster CSV throws on JSZip (`Can't find end of central directory`); the quota file hangs in the LLM skeleton call plus the HF-264/265 claim+retry machinery. Either way, convergence has nothing to bind. This violates T1-E902 v2 (Carry Everything, Express Contextually) and Decision 111 (all data → committed_data).

**P3 — Quota → committed_data visibility (HISTORICAL, verify).** HF-235 history: a quota file misclassified as `entity` landed `monthly_quota` in entity metadata, not committed_data, so convergence and the engine could not see it (CRP Plan 2's delta area). May be partially addressed since. CC must verify current state before any change.

**P4 — Import sequence dependency (HISTORICAL, verify).** Decision 152 mandates import-order independence. HF-183 history: classification quality depended on the roster being imported first (entity-overlap boost). CC must verify whether current classification is still order-dependent.

**P5 — HC authority inversion (HISTORICAL, verify).** Decision 108 (HC Override Authority): Header Comprehension's column-role assignment is authoritative. HF-235 history: HC emitted `entity_id:identifier@0.95`, but the import pipeline ignored it and looked for a convergence binding that does not exist on first import → `No entity_identifier binding found`. CC must verify whether the import pipeline now honors HC's identifier role.

**Restoration goal:** CRP imports end-to-end — roster creates entities, quota lands `monthly_quota` in committed_data, all four plans interpret, sales data commits, convergence binds, calculation runs and reconciles against ground truth.

---

## §2 — Substrate-Bound Discipline Applications

**Decision 108 (HC Override Authority):** P1 and P5 both enforce it. HC's structural signals (the entity-identifier role) are authoritative over a downstream heuristic. The P1 fix uses `hasEntityIdentifier` — a structural signal HC already produces — to exclude rosters from the plan override. No vocabulary (Korean Test).

**T1-E902 v2 (Carry Everything, Express Contextually):** P2 enforces it. A tabular data file's rows must reach committed_data even under classification uncertainty. Persistence-time narrowing — here, losing the data entirely by routing it to a pipeline that doesn't persist rows — is the prohibited violation class.

**Decision 152 (import sequence independence):** P4. Classification correctness must not depend on which file arrived first. The P1 fix must not introduce a new order dependency.

**Decision 111 (all data → committed_data):** P2, P3. Every classification's data lands in the single committed_data surface; the engine resolves meaning at calc time.

**Korean Test:** P1 uses `hasEntityIdentifier` and existing structural profile fields. Zero language-specific string literals introduced. P3/P4/P5 fixes (if any) must derive from field_identities / HC roles, never hardcoded field names.

**Cold-start plan preservation:** A genuine plan document (PPTX/PDF, or a thin XLSX plan) has NO entity-identifier column and DOES carry rate-table / percentage / auto-generated-header signals. The P1 fix must still classify those as plan. A roster carries an entity-identifier; it must not.

---

## §3 — Phase 1: Fix the HF-247 Override (confirmed)

**P1.1 — Read the current override.** Paste the full `matchesPlanSignature` block from `web/src/app/api/import/sci/analyze/route.ts` (~436-497), including the `hasRateTableSignal` computation, the per-sheet reclassification, and the round-2 score capping. Paste the surrounding context that shows where `hasEntityIdentifier` / the entity-identifier signal is available at this point (the content profile or agent scores per resolution).

**P1.2 — Add the entity-identifier exclusion and require a positive plan signal.** The override must NOT fire when a strong entity-identifier signal is present, and "few rows + no dates" alone must not be sufficient. Modify `matchesPlanSignature` so it requires BOTH:
- a genuine positive plan discriminant (a real rate-table / percentage / auto-generated-header signal — NOT merely `rowCountCategory === 'reference'`, which is just `rowCount < 50`), AND
- the absence of a strong entity-identifier signal (`!hasEntityIdentifier` on the resolution's profile).

The intent: a thin plan document (no entity-id column, has descriptive/percentage/auto-header structure) still matches; a small roster or quota (has an entity-identifier column) no longer matches. Derive `hasEntityIdentifier` from the existing content-profile field (`profile.patterns.hasEntityIdentifier`) — the same signal the Plan Agent already reads for its `has_entity_id` weight.

Specifically, remove `rowCountCategory === 'reference'` from the `hasRateTableSignal` disjunction (it is not a plan signal — it is a row-count threshold), and add `&& !anyResolutionHasEntityIdentifier` to the `matchesPlanSignature` conjunction.

**P1.3 — Preserve human review on the residual.** Where the override still fires (genuine cold-start plan), `requiresHumanReview` may remain as the override sets it. But where the override NO LONGER fires (a roster), the file falls back to the agents' own scores and the normal review gate — confirm the agents' Entity win (0.93) now flows through with its natural `requiresHumanReview` determination, NOT a forced auto-confirm.

**HALT-1:** The override has callers or downstream consumers beyond this block (e.g. another module reads the forced `plan` classification or the capped scores). If removing the force-route breaks a dependency, paste the dependency and HALT.

**HALT-2:** `profile.patterns.hasEntityIdentifier` is not available at the override site, or is computed differently than the Plan Agent's `has_entity_id` signal. If the entity-identifier signal must be threaded from elsewhere, paste the actual available signal and HALT before guessing.

**HALT-3:** Removing `rowCountCategory === 'reference'` from `hasRateTableSignal` suppresses detection of a genuine thin plan file in the proof set. If any known plan file (CRP Plans 1-4, BCL, Meridian) relies on that signal to be detected as a plan, paste evidence and HALT — the discriminant needs refinement, not removal.

Commit: `HF-267 P1: HF-247 override — entity-identifier exclusion + positive plan discriminant (Decision 108)`

---

## §4 — Phase 2: Carry-Everything Safety Net (confirmed)

A tabular data file must NEVER crash or hang in the plan pipeline. Even with P1 fixing classification, defense-in-depth: a file that reaches plan interpretation but is structurally tabular (parsed to rows) must not run JSZip document extraction.

**P2.1 — Read the plan-path entry.** In `web/src/lib/sci/plan-interpretation.ts`, paste the block where the file is downloaded from storage and document extraction (JSZip / PDF / text) begins. Identify where a format check could gate document extraction.

**P2.2 — Guard document extraction on file format.** Before attempting JSZip/document extraction, check whether the file is a spreadsheet/CSV via the existing `isSpreadsheetPath` / `extensionOf` helpers (`@/lib/sci/file-format`). If the plan unit's source file is tabular (CSV/XLSX/TSV):
- Do NOT run JSZip document extraction (this is what throws `Can't find end of central directory` and what hangs).
- Return an explicit, non-crashing failure for the plan unit with a clear message: the file is tabular and was misclassified as a plan; it should be re-imported or its classification corrected.

This is fail-safe: it converts a crash/hang into a clear error. It does NOT attempt to re-route or double-process (that risks the duplicate-execution class HF-264 addressed).

**HALT-4:** A genuine plan can legitimately be an XLSX (history: thin XLSX fee-schedule plans exist). If gating on `isSpreadsheetPath` would block a legitimate XLSX plan, the guard must distinguish "tabular data file" from "XLSX plan" by a signal other than format alone. Paste how XLSX plans currently reach interpretation and HALT — do not block legitimate XLSX plans.

Commit: `HF-267 P2: Carry-Everything safety net — tabular files never crash/hang in plan extraction`

---

## §5 — Phase 3: Quota → committed_data Visibility (verify-then-fix)

**P3.1 — Verify current state.** Determine whether a quota/target file's values currently reach committed_data. Read the target/transaction pipeline (`processDataUnit` in execute-bulk, which calls `commitContentUnit`) and `commitContentUnit` itself. Paste the code showing whether target-classified rows land in committed_data with their measure columns (e.g. `monthly_quota`) in `row_data`.

Then query live CRP committed_data for quota visibility:
```bash
# CC: via the service-role tsx script pattern — confirm monthly_quota is in committed_data row_data
npx tsx scripts/<existing-committed-data-inspector>.ts e44bbcb1-2710-4880-8c7d-a1bd902720b7
```
(Use an existing inspection script; do not author SQL against an assumed schema — FP-49.)

**P3.2 — Disposition.**
- If `monthly_quota` (or the quota measure) IS in committed_data row_data → **HALT-5: P3 already resolved.** Report the evidence, make NO change.
- If it is NOT → identify why (quota misclassified to entity/plan, or commit narrowing the columns) and fix so target-classified rows land their measure columns in committed_data. The P1 override fix likely resolves the misclassification root; confirm whether any additional commit-path fix is needed.

**HALT-6:** The fix would touch convergence binding or the calculation engine (reading the quota at calc time). That is OUT of import scope. Paste the boundary and HALT — convergence/calc fixes are a separate HF.

Commit (only if a change was needed): `HF-267 P3: quota measure columns reach committed_data`

---

## §6 — Phase 4: Import Sequence Independence (verify-then-fix)

**P4.1 — Verify current state.** Decision 152 requires that classification produce the same result regardless of import order. Read the analyze route's classification flow and any entity-overlap boost. Paste the code that shows whether classification confidence depends on entities already existing (roster-first dependency).

Determine empirically if possible: does the same file classify identically whether imported alone or after the roster? If a prior signal/log shows this, paste it; if not, state that it requires a live two-order test (architect-executed) and note it.

**P4.2 — Disposition.**
- If classification is order-independent (or the P1 fix makes it so by removing the forced override) → **HALT-7: P4 already satisfied.** Report evidence, no change.
- If a genuine order dependency remains that changes the PIPELINE a file routes to → fix it so a data file reaches committed_data regardless of order (Carry Everything). Do NOT make classification depend on import order.

**HALT-8:** Eliminating an order dependency requires changing the entity-overlap boost or the agent scoring weights. Changing agent weights is a high-blast-radius change that affects every tenant's classification. Paste the proposed change and HALT for architect disposition before modifying any agent weight.

Commit (only if a change was needed): `HF-267 P4: import sequence independence restored (Decision 152)`

---

## §7 — Phase 5: HC Authority Inversion (verify-then-fix)

**P5.1 — Verify current state.** Decision 108: HC's column-role assignment is authoritative. Read the data/target pipeline path that resolves the entity-identifier column. Paste the code that shows whether it reads HC's `identifier` role (from `field_identities` / classification trace) or whether it requires a convergence binding (`input_bindings`) that does not exist on first import.

Reproduce the historical failure signature: search for where `No entity_identifier binding found` is thrown and paste the resolution logic around it.

**P5.2 — Disposition.**
- If the pipeline already reads HC's identifier role (no dependency on a pre-existing convergence binding) → **HALT-9: P5 already resolved.** Report evidence, no change.
- If it still requires a convergence binding that is absent on first import → fix it to read HC's `identifier` role from field_identities (Decision 108), so the entity-identifier is resolved from HC's authoritative assignment, not a developer-built binding. Korean Test: derive from the structural `identifier` role, never a hardcoded column name.

**HALT-10:** The fix would require convergence to run at import time (it runs at calc time per Decision 92). Paste the boundary and HALT — do not move convergence to import time.

Commit (only if a change was needed): `HF-267 P5: import pipeline honors HC identifier role (Decision 108)`

---

## §8 — Build Gate + Live Verification

```bash
rm -rf .next && npm run build
npm run dev
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Build must succeed; dev must respond.

**Live verification is architect-executed** (CC reports the code state; the architect runs the CRP import and reconciles). CC states the expected outcome so the architect can verify:
- Roster CSV imports → classified `entity` (not plan) → entities created (CRP roster row count).
- Quota CSV imports → classified `target` → `monthly_quota` in committed_data.
- All four CRP plan PDFs interpret (Plans 1, 2, 4 confirmed this session; Plan 3 may still hit the intermittent intent-emission pattern — out of this HF's scope, tracked under HF-266 §6A).
- No file crashes on JSZip; no file hangs in plan interpretation.

CC does NOT fabricate import results. The architect captures them.

---

## §9 — Reporting

Completion report: `docs/completion-reports/HF-267_IMPORT_CONVERGENCE_RESTORATION_COMPLETION.md` (NOT repo root).

Structure:
- P1: pasted override before/after diff; confirmation the entity-identifier exclusion fires and cold-start plan detection is preserved.
- P2: pasted safety-net diff; confirmation tabular files no longer reach JSZip.
- P3: current-state evidence (committed_data query) + disposition (HALT-5 resolved, or the fix diff).
- P4: current-state evidence + disposition (HALT-7 satisfied, or the fix diff).
- P5: current-state evidence (`No entity_identifier binding found` resolution path) + disposition (HALT-9 resolved, or the fix diff).
- Build gate output.
- HALT disposition log: each of HALT-1 through HALT-10 marked CLEAR / TRIGGERED with evidence.
- Expected live-verification outcomes for the architect.

Push. `gh pr create --base main --head dev --title "HF-267: Import → convergence path restoration" --body "Fixes HF-247 plan_workbook_signature override force-routing rosters/quotas to plan (P1). Adds Carry-Everything safety net so tabular files never crash/hang in plan extraction (P2). Verifies and fixes (or confirms resolved) quota→committed_data visibility (P3), import sequence independence (P4), and HC authority inversion (P5). Restores the import path so convergence can bind."`

---

## §10 — Out of Scope

- Convergence binding logic and the calculation engine (reading quota at calc time, DAG evaluation). P3/P5 HALT at this boundary.
- CRP Plan 3 intent-emission non-determinism (`reference.type: "arithmetic"` malformation) — tracked under HF-266 §6A emission-prompt DIAG.
- Agent scoring weight changes — HALT-8 gates any weight modification for architect disposition.
- Moving convergence to import time — HALT-10. Convergence runs at calc time (Decision 92).
- The auth/MFA redirect (separate SR-39 HF) and CanonicalWriter retry/backoff (HF-260 ADR R2).

## §10A — Residuals

- If P4 confirms an order dependency that can only be eliminated by changing agent weights (HALT-8), that is a separate scored-change HF with cross-tenant regression testing.
- If P3 finds the quota reaches committed_data but convergence still can't bind it, that is a convergence HF (HALT-6 boundary) — the import side is then proven correct.
- After this HF, re-verify BCL and Meridian imports (they use rosters too) to confirm the override change did not alter their classification — architect-executed regression.
