# HF-247: Plan Import Integrity — Cold-Start, Cache Quality, Silent-Fallback Elimination

**§0 CC Standing Rules**

Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.
Drafting reference: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.
Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.
Binding rules: AP-17 (single pipeline), AP-25 (Korean Test), SR-34 (no bypass), SR-41 (revert discipline), Rules 25-28 (completion report discipline), Rule 29 (CC paste LAST).
Decisions: 127 (half-open), 151 (intent executor sole authority), 153 (plan intelligence as L2 signals), 154 (Korean Test four classes).

---

## §1 Problem Statement

DIAG-056 captured the raw LLM response and revealed that BCL plan import producing 0 components is not a prompt regression. The LLM correctly responded `components: []` because it was only given 165 chars of plan text from one sheet (Metas Mensuales), not the full plan including the rate tables. The LLM did its job correctly given the input it received.

The platform's plan-import pipeline has five class defects that collectively prevent cold-start operation, corrupt entity data on failed imports, silently propagate failures, and create cross-import dependencies that break Korean Test:

### Defect 1 — Workbook plan signature requires external data types (Korean Test violation)

`SCI-PLAN-WORKBOOK` signature check requires `hasRefOrTgt=true` as a precondition before classifying a multi-sheet workbook as a plan. Evidence from production logs (2026-05-21 12:58:33):

```
[SCI-PLAN-WORKBOOK] file=BCL_Plan_Comisiones_2025.xlsx sheets=3 totalRows=49 
  hasTx=false hasRefOrTgt=false rateTableSignal=true — no plan signature
```

The same file in an earlier session classified as plan:

```
[SCI-PLAN-WORKBOOK] file=BCL_Plan_Comisiones_2025.xlsx sheets=3 totalRows=49 
  signature=match — reclassifying all sheets to 'plan'
```

The `hasRefOrTgt` precondition makes one data type's classification depend on the presence of another data type. Per T1-E910 v2 (Korean Test, Decision 154): structural primitives must be identified from their own content, not from sibling data types. A plan workbook is a plan workbook because of what's in it.

This blocks cold-start: a customer's first plan import (no reference data, no targets) cannot succeed.

### Defect 2 — Flywheel cache poisons failure as authoritative classification

When prior plan import failed (returned 0 components), the SCI fingerprint cache stored the failed sheet classifications. On reimport, Tier 1 match injects stale `unknown@0.85` role bindings:

```
HF-236: Plan General flywheel cache missing native columnRole on ≥1 binding — forcing fresh-LLM HC re-emission
Tier 1: injected 3 fieldBindings from flywheel into Metas Mensuales (native columnRole, HF-236)
[SCI-HC-DIAG] sheet=Plan General roles=[BANCO CUMBRE DEL LITORAL:unknown@0.85, __EMPTY:unknown@0.85, ...]
```

With `unknown` roles and no measure detection, the classifier scores each plan sheet as `entity@90%`. The poisoned cache propagates failure as truth.

Per T1-E906 v2 (read-before-derive, closed-loop intelligence): the loop must not propagate failure as a learned signal. Cache writes from failed-outcome interpretations are anti-learning.

### Defect 3 — Silent JSON parse fallback masks LLM emission failures

`parseJsonResponse` in `anthropic-adapter.ts:1074-1099` returns `{rawContent, parseError: true, confidence: 0}` on JSON parse failure. The SCI plan-interpretation guard at `plan-interpretation.ts:156-167` checks `interpretation.fallback || interpretation.error` — NOT `parseError`. Failed interpretations propagate to `normalizeComponents(undefined)`, which silently returns `[]` (line 187), and the rule_set persists with zero components and "Unnamed Plan" as the name.

This is data corruption disguised as recovery. Per Carry Everything Express Contextually (T1-E902 v2): failure modes are signal, not silently coerced into success-shaped outputs.

### Defect 4 — Misclassified plan sheets commit as entity data

When Defect 1's downstream effect classifies plan sheets as entity, the bulk commit pipeline writes rate-table rows into the entities table:

```
[SCI Bulk] Entity: 23 new, 0 existing, 0 enriched
[commitContentUnit] entity (sci-bulk): 36 rows committed, data_type=entity, 
  entity_id_field="C1: COLOCACIÓN DE CRÉDITO — Ejecutivo Senior", source_dates=0/36
```

"C1: COLOCACIÓN DE CRÉDITO — Ejecutivo Senior" is a plan component name, not an entity identifier. No commit-stage validation catches this. The entity table now contains plan structure as rows.

### Defect 5 — Cold-start not exercised

Every successful BCL import in session history operated on prior tenant state (existing fingerprints, prior bindings). Cold-start was not exercised. A customer's very first import — no fingerprints, no classification_signals, no bindings — must work.

### Combined-treatment rationale

All five defects block plan import from cold-start and corrupt state on failure. Fixing only Defect 1 leaves the cache poisoning. Fixing only the cache leaves silent fallback. Each defect masks the others. They ship together because verification requires all five resolved.

---

## §2 Substrate-Bound Discipline Applications

**T1-E910 v2 / Decision 154 (Korean Test):** Plan workbook signature derived from own content (rate-table structural signal, multi-sheet plan-vocabulary signature). No precondition on sibling data types being present.

**T1-E906 v2 (Closed-Loop Intelligence):** Cache writes gated on successful outcome. Failed interpretations are recorded for diagnostic purposes but do NOT become authoritative Tier 1 anchors.

**T1-E902 v2 (Carry Everything Express Contextually):** Failure modes carry through the pipeline. `parseError` becomes `error`. The SCI guard catches it. No silent coercion to success-shaped output.

**T1-E904 (Calculation Sovereignty):** Plan classification depends only on the plan document (sovereign input #1). Not on the presence or absence of other tenant data.

**Decision 153 (Plan intelligence as L2 signals):** Failed plan interpretations are L2 signals of failure — recorded, queryable, but not promoted as classification authority.

**Reconciliation-channel separation:** GT values are architect-channel. CC reports calculated values verbatim. CC does not interpret.

---

## §3 Phase 1 — Plan Workbook Signature Independence

### 3.1 Read the current signature logic

Locate the function emitting `[SCI-PLAN-WORKBOOK]` log lines. Search:

```bash
grep -rn "SCI-PLAN-WORKBOOK" web/src/lib/
grep -rn "hasRefOrTgt" web/src/lib/
grep -rn "rateTableSignal" web/src/lib/
```

Paste the verbatim function in the completion report — the conditional chain that decides `signature=match` vs `no plan signature`.

### 3.2 Remove the external-data precondition

The plan signature must qualify on:
- Workbook contains a sheet with rate-table structural signal (`rateTableSignal=true`)
- OR workbook contains a sheet with plan-vocabulary structural signature (multi-row sheet with attribute headers, no transactional identifiers)
- OR workbook contains multiple sheets where ≥1 carries plan-style content (rate tables, tier breaks, payout values)

The signature must NOT depend on `hasRefOrTgt`, `hasTx`, or any external-data flag. The plan document stands alone.

### 3.3 Single-sheet plan support

The current signature operates at workbook level. A single-sheet plan file (one Excel sheet containing the entire plan) must also qualify. The signature check generalizes from "multi-sheet workbook with rate-table signal" to "any workbook with plan structural signal."

### 3.4 Halt condition

- HALT-1: If the signature change reclassifies workbooks that previously classified as `transaction` or `entity` AS `plan` (regression on non-plan files), the structural heuristic is too broad. Report which structural patterns now fire as plan-like and refine the signature to be specific to plan content (rate-table values, payout amounts, tier-break thresholds).

### 3.5 Commit

```
git add -A && git commit -m "HF-247 Phase 1: plan workbook signature independence — remove hasRefOrTgt precondition, support cold-start and single-sheet" && git push origin dev
```

---

## §4 Phase 2 — Flywheel Cache Outcome Quality Gate

### 4.1 Read the cache write paths

Locate where SCI fingerprint cache writes occur. Search:

```bash
grep -rn "SCI-FINGERPRINT.*Stored" web/src/lib/
grep -rn "SCI-FINGERPRINT.*Updated" web/src/lib/
grep -rn "fingerprint" web/src/lib/sci/
```

Paste the verbatim functions that write to `structural_fingerprints` and that update `classification_signals` with plan-interpretation outcomes.

### 4.2 Gate cache writes on outcome quality

A plan interpretation outcome qualifies as cache-authoritative if and only if:
- `components.length > 0` AND
- `ruleSetName !== 'Unnamed Plan'` AND
- No `parseError` flag AND
- Validator did not throw `UnconvertibleComponentError`

If any of these fail, the fingerprint and classification signals are recorded with `outcome: 'failed'` for diagnostic purposes but are NOT promoted to Tier 1 match authority. Subsequent imports of the same fingerprint do NOT receive Tier 1 cache injection from failed outcomes.

The Tier 1 match query filters by `outcome = 'success'` (or absence of failure marker).

### 4.3 Cleanup of existing poisoned cache

After the code fix, the existing poisoned cache for BCL needs cleanup. The architect will run the clean-slate SQL (already drafted earlier this session) which deletes `structural_fingerprints` and `classification_signals` for the BCL tenant. No CC action required for this — architect-manual.

### 4.4 Halt condition

- HALT-2: If gating cache writes on success-quality causes ALL Tier 1 matches to disappear (every import becomes Tier 3 / LLM call), the gate is too strict. Verify that previously successful imports (`69aec3d5` era) still produce cache-authoritative writes. The 4-component successful import IS a quality outcome and must qualify.

### 4.5 Commit

```
git add -A && git commit -m "HF-247 Phase 2: flywheel cache outcome quality gate — failed outcomes do not become Tier 1 authority" && git push origin dev
```

---

## §5 Phase 3 — Silent Fallback Elimination

### 5.1 Read parseJsonResponse and the SCI guard

`web/src/lib/ai/providers/anthropic-adapter.ts:1074-1099` (verbatim, already extracted in DIAG-056):

```typescript
private parseJsonResponse(content: string): Record<string, unknown> {
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) jsonStr = objectMatch[0];
  try {
    return JSON.parse(jsonStr);
  } catch {
    return { rawContent: content, parseError: true, confidence: 0 };
  }
}
```

`web/src/lib/sci/plan-interpretation.ts:156-167` (verbatim):

```typescript
const interpretation = response.result;
if (interpretation.fallback || interpretation.error) { ... }
```

### 5.2 Eliminate the silent path

`parseJsonResponse` parse failure must set `error: 'JSON parse failed: ' + parseError.message` on the returned object. The SCI guard `fallback || error` then catches it. The interpretation result surfaces the failure instead of persisting a corrupted rule_set.

Additionally: when the LLM returns valid JSON with `components: []` AND the input was classified as a plan workbook (i.e., the LLM was given plan content and returned no components), this is ALSO a failure mode. The SCI guard must catch this case and refuse to persist the rule_set.

The combined guard:
- `interpretation.error` → fail (existing semantic)
- `interpretation.fallback` → fail (existing semantic)
- `interpretation.parseError` → fail (NEW: parse-failure path)
- `interpretation.components.length === 0` when the workbook was classified as plan → fail (NEW: empty-components-on-plan path)

The fail branch surfaces the failure to the user with a diagnostic message: "Plan interpretation produced no components. The LLM may have received incomplete plan text or could not extract structure. Check upstream sheet classification."

### 5.3 Commit

```
git add -A && git commit -m "HF-247 Phase 3: silent fallback elimination — parseError surfaces as error, empty components on plan workbook surfaces as error" && git push origin dev
```

---

## §6 Phase 4 — Commit-Stage Type Validation

### 6.1 Read the commit pipeline

Locate `commitContentUnit` and the bulk commit path that writes `data_type=entity` rows. Search:

```bash
grep -rn "commitContentUnit" web/src/lib/
grep -rn "data_type=entity" web/src/lib/
grep -rn "rateTableSignal" web/src/lib/
```

Paste the verbatim function and the surrounding logic that decides which `data_type` to commit.

### 6.2 Validate type-content consistency at commit boundary

Before writing rows with `data_type=entity`, validate:
- Sheet has identifier column (`hasEntityId=true`)
- Sheet has name column (`hasName=true`) OR the identifier IS the name
- Sheet does NOT carry `rateTableSignal=true`
- Sheet's `entity_id_field` is a stable identifier pattern (not a content title like "C1: COLOCACIÓN DE CRÉDITO — Ejecutivo Senior")

Before writing rows with `data_type=plan`:
- Sheet has plan structural signal (rate-table values, tier breaks, payout amounts)

If a sheet's classification AND its content-type are inconsistent, the commit must refuse and surface a diagnostic. The pipeline halts at the commit boundary with: "Sheet classified as `entity` but carries rate-table signal. Refusing to commit — classification likely incorrect."

### 6.3 Cleanup hook for orphaned rows

After the validation gate is in place, the architect's clean-slate SQL will remove the corrupted entity rows currently in BCL's tenant. CC does not need to run the cleanup — architect-manual.

### 6.4 Commit

```
git add -A && git commit -m "HF-247 Phase 4: commit-stage type validation — refuse classification-content inconsistent commits" && git push origin dev
```

---

## §7 Phase 5 — Cold-Start Operation

### 7.1 Verify Tier 3 path from cold start

When `structural_fingerprints` count for a tenant is 0 AND `classification_signals` count is 0, the SCI pipeline must:
- Skip Tier 1 match (no cache to match against — verify the code path doesn't error)
- Skip Tier 2 contextual learning (no signals to learn from)
- Call Tier 3 (LLM-driven structural classification) directly
- Confidence calibration reflects "cold start" — not inflated by absent cache

Search:

```bash
grep -rn "tier=1" web/src/lib/sci/
grep -rn "tier=3" web/src/lib/sci/
grep -rn "fingerprint" web/src/lib/sci/fingerprint
```

Verify the cold-start path operates without errors. Add a log line at Tier 1 entry that emits `[SCI-FINGERPRINT] cold-start (no prior fingerprints for tenant) — skipping to Tier 3` when the tenant has zero fingerprints.

### 7.2 Halt condition

- HALT-3: If cold-start path has implicit dependencies on cached data (e.g., reads from `synaptic_density` and errors on empty result), report the dependency. Cold start must be a first-class operating mode.

### 7.3 Commit

```
git add -A && git commit -m "HF-247 Phase 5: cold-start operation — Tier 3 reachable with zero prior cache" && git push origin dev
```

---

## §8 Phase 6 — Verification

### 8.1 Build

Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` responds. Zero TypeScript errors.

### 8.2 Cold-start verification

The architect will:
1. Run the BCL clean-slate SQL (deletes all BCL tenant data including fingerprints, classification signals, rule_sets, committed_data, entities).
2. Import ONLY the BCL plan file through the browser. No data files. No personnel template.
3. Capture from the log:
   - `[SCI-PLAN-WORKBOOK]` signature outcome — must be `signature=match`
   - `[SCI plan-interp] Batched plan saved` line — must show `N components` where N > 0
   - `[PrimeValidator]` lines if the validator fires
   - Any `error` or `parseError` surfaces

### 8.3 Subsequent verification

After plan-only import succeeds:
1. Import the personnel template and data files.
2. Calculate October.
3. Report `[CalcRecon-T1] componentTotals` and `Grand total` verbatim.

Architect reconciles against GT. CC reports numbers without interpretation.

### 8.4 Commit

```
git add -A && git commit -m "HF-247 Phase 6: verification evidence" && git push origin dev
```

---

## §9 HALT Conditions

| ID | Condition | Action |
|---|---|---|
| HALT-1 | Plan signature change reclassifies non-plan workbooks as plan | Report. Refine signature to be specific to plan content. |
| HALT-2 | Cache quality gate causes ALL Tier 1 matches to disappear | Report. Verify successful 69aec3d5-era imports still qualify. |
| HALT-3 | Cold-start path has implicit cached-data dependencies | Report each dependency. Cold start is a first-class mode. |
| HALT-4 | parseError-as-error breaks an existing working flow | Report. The change must be additive to the failure surface, not breaking. |
| HALT-5 | Commit-stage validation rejects a previously-valid import | Report. Validation must distinguish "inconsistent classification" from "ambiguous structure." |
| HALT-6 | Cold-start plan-only import still produces 0 components | NOT a HF-247 failure. Report the `[DIAG-LLM-RAW]` line. The LLM may have received insufficient plan text — escalate to plan extraction layer. |

---

## §10 Reporting Discipline

Completion report: `docs/completion-reports/HF-247_COMPLETION_REPORT.md`

Per Rules 25-28. Structure per `COMPLETION_REPORT_ENFORCEMENT.md`. Evidence means paste, not describe. Commit-per-phase.

Required evidence per phase:
- Phase 1: paste verbatim BEFORE and AFTER of the signature function. Show the conditions that no longer reference external-data flags.
- Phase 2: paste verbatim BEFORE and AFTER of cache write logic. Show the outcome quality gate.
- Phase 3: paste verbatim BEFORE and AFTER of `parseJsonResponse` and the SCI guard.
- Phase 4: paste verbatim BEFORE and AFTER of the commit-stage validation logic.
- Phase 5: paste verbatim cold-start path with the new log line.
- Phase 6: build evidence + architect-manual verification placeholders.

---

## §10A Out of Scope

- The calculation engine changes (OB-200 grammar, scale metadata, HF-244 validator, HF-244 scale mutual exclusion). These remain as-is. They operate on persisted rule_sets — once HF-247 enables plan import to persist correct rule_sets, the engine logic applies.
- C0 truncation (3-leaf tree). When plan reimport produces a complete tree, the HF-244 validator will either accept it or throw `UnconvertibleComponentError`. Either outcome surfaces the LLM's actual capability — separate HF if the LLM still truncates.
- CRP and Meridian verification. After BCL cold-start verifies, the same plan-import path applies to other tenants. The architect runs CRP and Meridian as separate verifications.
- Evaluator unit test suite (deferred from OB-200).
- Temporal prime extensions.
- Substrate supersession candidates (VG-side).

## §10A Residuals

- After HF-247 ships and BCL plan-only import succeeds, the calculation will exercise HF-244 Phase 1 (scale mutual exclusion) for the first time on a clean tree. If C1 still hits $37,390 across periods, the scale fix has a deeper issue — separate HF.
- The flywheel cache for OTHER tenants may still contain poisoned outcomes from prior failed imports. Production rollout needs a one-time cache audit per tenant. Not blocking HF-247 — operational followup.
- Plan supersession (HF-244 Phase 3) is in place. With cold-start working, the supersession will be exercised correctly on reimport flows.

---

## BUILD AND DEPLOY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — zero errors
4. `npm run dev` — `localhost:3000` responds
5. Git from repo root (`spm-platform`) NOT `web/`
6. `gh pr create --base main --head dev` with title: "HF-247: Plan import integrity — cold-start, cache quality, silent fallback elimination, commit-stage validation"
7. PR body: "Closes five class defects revealed by DIAG-056 production logs: (1) workbook plan signature now derived from own content per Korean Test, (2) flywheel cache outcome quality gate prevents failure propagation as authoritative classification, (3) silent JSON parse fallback eliminated — parseError surfaces as error, (4) commit-stage type validation refuses classification-content inconsistent commits, (5) cold-start operation as first-class mode with Tier 3 reachable from zero prior cache. Verification path: clean-slate BCL → plan-only import → confirm components > 0 → import data → calculate → reconcile. Out of scope: calculation engine, C0 truncation, CRP/Meridian verification."
