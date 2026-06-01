# HF-244: Scale Mutual Exclusion, Validator Enforcement, Plan Supersession

**§0 CC Standing Rules**

Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.
Drafting reference: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.
Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.
Binding rules: AP-17 (single pipeline), AP-25 (Korean Test), SR-34 (no bypass), SR-35 (EPG for math), SR-38 (mathematical review gate), SR-41 (revert discipline), Rules 25-28 (completion report discipline).
Decisions: 127 (half-open intervals), 151 (intent executor sole calculation authority), 153 (plan intelligence as L2 signals), 154 (Korean Test four classes).

---

## §1 Problem Statement

OB-200 (PR #431) introduced the prime-grammar canonical declaration, LLM-emitted scale metadata on constant nodes, and convergence pipeline unification. Post-merge BCL verification revealed three defects:

### Defect 1 — Double scaling (class: Decision-Implementation Gap)

OB-200 added scale reconciliation at the evaluator (Phase 2: `intent-executor.ts` compare case multiplies the non-meta side by `meta.scale`) WITHOUT retiring the pre-existing scale reconciliation at convergence (HF-243: `convergence-service.ts` sets `scale_factor` on bindings from `extractExpectedRangeFromDAG` or the new `extractScaleMetadataFromDAG`). Both fire. Data gets scaled twice.

Evidence from live BCL calculation (2026-05-21):
- Convergence binding: `cumplimiento_depositos → Pct_Meta_Depositos, scale_factor=100`
- DAG tree C1 constants: `constant(130, {unit:"percent", scale:100})`
- Data stores ratio: `cumplimiento_depositos = 1.282`
- Metric resolution: `1.282 × 100 = 128.2` (convergence scale_factor)
- Evaluator compare: `128.2 × 100 = 12,820` vs `130` → true (evaluator meta.scale)
- Result: ALL 85 entities hit top tier ($550 Senior / $420 Ejecutivo)
- C1 total: $37,390 every period (impossible — GT varies $10,170 to $18,140)
- GT C1 October: $10,170. Actual C1 October: $37,390. Delta: +$27,220.

This is a class defect, not an instance defect. ANY component where the DAG tree carries `meta.scale` AND the convergence binding carries `scale_factor` will be double-scaled.

### Defect 2 — Incomplete C0 emission (class: Validator Gap)

The LLM emitted only 3 non-zero leaves for BCL C0 (Credit Placement), which requires 30 cells (6 attainment rows × 5 quality columns). The grammar's exhaustive emission instruction ("emit exactly N×M constant leaf nodes") was present in the prompt but the LLM still collapsed. The post-generation validator (`prime-validator.ts`, OB-200 Phase 4) has an `expectedCellCount` check but it only fires when the caller passes the expected count. Plan interpretation does not pass it.

Evidence from live SQL extraction:
- C0 tree has 3 conditional branches, all gated on `cumplimiento_colocacion >= 120` (top attainment row only)
- Non-zero leaves: 700, 680, 560 (3 quality bands within the top row)
- Missing: 27 cells (5 lower attainment rows × 5 quality bands + 2 quality bands in top row)
- C0 October: $7,520 vs GT $17,990. Delta: -$10,470.

### Defect 3 — Plan supersession not firing

Two active rule_sets exist for BCL with identical names and identical tree structures. HF-241 broadened the supersession match but reimporting the plan still creates a new active rule_set without deactivating the prior one.

Evidence: SQL query returned 2 rows with `status = 'active'` for `tenant_id = 'b1c2d3e4-...'`. Both created 2026-05-21, 60 seconds apart (02:03:55 and 02:04:56). Both have identical component structures.

### Combined-treatment rationale

All three defects block BCL reconciliation. Fixing only Defect 1 produces correct C1 but wrong C0. Fixing only Defect 2 produces potentially correct C0 but double-scaled C1. Fixing neither and only fixing Defect 3 changes nothing. They ship together because verification requires all three resolved.

---

## §2 Substrate-Bound Discipline Applications

**Decision 151 (intent executor sole calculation authority):** Scale reconciliation happens in the evaluator. The evaluator reads `meta.scale` from the constant node and scales the reference value before comparing. This is the ONE site. Convergence does NOT also scale.

**T1-E904 (Calculation Sovereignty — two inputs only):** Scale metadata lives ON the DAG tree (plan = sovereign input #1). Not on the binding (ambient context). The `scale_factor` field on convergence bindings is the Tier 2 fallback for legacy trees without `meta`. When `meta` is present, `scale_factor` is NOT set.

**T1-E910 v2 (Korean Test):** The validator's exhaustive emission check uses structural heuristics (count distinct compare constants per reference field → compute Cartesian product → expected cell count). No field-name matching. No language-specific literals.

**T1-E920 (Repeated Fix Failure Is a Pattern):** The six-iteration audit-fix cycle (AUD-011 → DIAG-054) was caused by instance-level fixes. This HF closes at the class level: scale has ONE site, the validator structurally prevents incomplete emission, supersession is atomic.

**Reconciliation-channel separation:** GT values are architect-channel only. CC reports calculated values verbatim. CC does not interpret or compare against GT.

---

## §3 Phase 1 — Scale Mutual Exclusion

### 3.1 Read the scaling chain end-to-end

Before changing anything, read and trace the complete scaling path:

1. `web/src/lib/intelligence/convergence-service.ts` — find `extractScaleMetadataFromDAG`, find where `scale_factor` is set on bindings, find `scoreColumnForRequirement`.
2. `web/src/lib/calculation/intent-executor.ts` — find the `compare` case in `evaluate()`, find the `isConstantWithMeta` check, find `a = a.mul(toDecimal(rightMeta.scale))`.
3. `web/src/app/api/calculation/run/route.ts` — find `resolveMetricsFromConvergenceBindings`, find where `binding.scale_factor` is applied to the raw column value.

Paste the verbatim code at all three sites in the completion report.

### 3.2 Implement mutual exclusion

In `convergence-service.ts`, in the function that sets `scale_factor` on bindings (inside `scoreColumnForRequirement` or `generateAllComponentBindings`):

When `scaleMetadata` is present on the `ComponentInputRequirement` (meaning the DAG tree's constants carry `meta`), do NOT set `scale_factor` on the binding. The evaluator will handle scale via `meta.scale`. Set `scale_factor = 1` explicitly (or omit it) to signal "no convergence-side scaling."

When `scaleMetadata` is absent (legacy trees without `meta`), set `scale_factor` as before using the `extractExpectedRangeFromDAG` heuristic. This is the Tier 2 fallback. No change to existing behavior for legacy trees.

The rule: **for any given component binding, exactly ONE of {convergence scale_factor, evaluator meta.scale} fires, never both.**

### 3.3 Verification

After this change, a binding for `cumplimiento_depositos` where the DAG constant carries `meta: {scale: 100}` should have `scale_factor` absent or `scale_factor = 1` on the binding. The evaluator's compare case applies `× 100` once. Data `1.282` → evaluator scales to `128.2` → compared against `130` → `128.2 < 130` → false → falls to next tier. Correct.

### 3.4 Commit

```
git add -A && git commit -m "HF-244 Phase 1: scale mutual exclusion — convergence skips scale_factor when DAG constants carry meta.scale" && git push origin dev
```

---

## §4 Phase 2 — Validator Exhaustive Emission Enforcement

### 4.1 Structural cell count inference

In `web/src/lib/calculation/prime-validator.ts`, add a function `inferExpectedCellCount(node)`:

Walk the tree. For each `reference` field that appears in a `compare` node, collect the set of distinct compare constants. If TWO distinct reference fields appear in compare nodes within the same conditional chain, the structure is a 2D band lookup. The expected cell count is `|constants_field_A| × |constants_field_B|`.

If ONE reference field appears, the structure is a 1D band lookup. The expected cell count is `|constants_field_A|` (number of distinct tiers).

If ZERO reference fields appear in compare nodes, the structure is not a band lookup (scalar, linear, etc.) — skip the check.

Example for BCL C0:
- `cumplimiento_colocacion` appears in compares with constants: {120} — but GT has {70, 80, 90, 100, 120} = 6 values (THIS IS THE PROBLEM — the LLM only emitted 1 of 6 attainment thresholds, so the inference can only work with what the tree actually contains)

**Revised approach:** The inference from the TREE won't work because the tree is already truncated. The validator needs the expected count from OUTSIDE the tree. Two options:

**(A)** Plan interpretation passes `expectedCellCount` from the plan's metadata. When the plan document contains a visible rate table, the LLM can emit the table dimensions alongside the tree. Add a field to the component output: `rateTableDimensions: { rows: N, cols: M }` or `rateTableCellCount: N`.

**(B)** The validator uses the grammar illustration as a structural template. The illustration for SC-06 (2D band) shows a 3×3 matrix with 9 leaves. The validator checks that the tree's nesting depth and branching factor are consistent with a full matrix. A 2D tree with only 3 leaves at depth 3 when the outer conditional has 1 branch (not 6) is structurally suspicious.

**Implement option (A).** In the plan interpretation prompt (generated by `generatePromptGrammarSection()`), add an instruction:

"When the plan contains a rate table (1D or 2D), emit alongside the calculationIntent a field `rateTableCellCount` with the total number of cells in the table. For a 5-tier 1D table: `rateTableCellCount: 5`. For a 6×5 2D table: `rateTableCellCount: 30`."

In `ai-plan-interpreter.ts`, `convertComponent`: read `rateTableCellCount` from the LLM's component output. Pass it to `validateComponentIntent` as `expectedCellCount`. The validator's existing check then fires with the correct count.

Elevate the exhaustive emission check from `warning` to `critical` severity when `expectedCellCount` is provided AND `constantLeafCount < expectedCellCount`. A critical violation throws `UnconvertibleComponentError`, preventing a truncated tree from being persisted.

### 4.2 Halt condition

- HALT-1: If the LLM does not reliably emit `rateTableCellCount` (i.e., it's absent on components that clearly have rate tables), report this. The field may need stronger prompt reinforcement or a structural extraction from the plan's parsed content.

### 4.3 Commit

```
git add -A && git commit -m "HF-244 Phase 2: validator exhaustive emission enforcement — rateTableCellCount from LLM, critical violation on truncation" && git push origin dev
```

---

## §5 Phase 3 — Plan Supersession

### 5.1 Read the current supersession logic

In `web/src/lib/compensation/ai-plan-interpreter.ts` (or wherever rule_sets are created), find the code that checks for existing active rule_sets before creating a new one. Paste the verbatim code in the completion report.

### 5.2 Fix supersession

Before inserting a new rule_set with `status = 'active'`, query for existing rule_sets with the same `tenant_id` AND `status = 'active'`. If any exist, set their status to `superseded` (or `inactive`). Then insert the new one. This must be atomic — use a transaction or a single UPDATE followed by INSERT.

```sql
-- Conceptual (implement in TypeScript via Supabase client):
UPDATE rule_sets SET status = 'superseded' 
WHERE tenant_id = $tenantId AND status = 'active';

INSERT INTO rule_sets (...) VALUES (..., status = 'active');
```

The match is tenant-scoped, not name-scoped. A tenant has exactly ONE active rule_set at any time. If multi-plan tenants are needed in the future, the match should scope by plan name — but for now, single-plan-per-tenant is the operative model for all three proof tenants.

### 5.3 Clean up existing duplicates

After the code fix, clean up the BCL duplicate. The NEWER rule_set (69aec3d5, created 02:04:56) should remain active. The OLDER one (f8836be6, created 02:03:55) should be superseded:

Emit a script `scripts/hf244-supersede-duplicate-rulesets.ts` that:
1. Queries each tenant for rule_sets with `status = 'active'`, ordered by `created_at DESC`.
2. If more than one exists, sets all but the most recent to `status = 'superseded'`.
3. Logs each change.

Run the script and paste the output.

### 5.4 Commit

```
git add -A && git commit -m "HF-244 Phase 3: plan supersession — deactivate prior rule_sets on reimport, clean up existing duplicates" && git push origin dev
```

---

## §6 Phase 4 — Verification

### 4.1 Build

Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` responds. Zero TypeScript errors.

### 4.2 BCL wipe and reimport

Wipe BCL bindings so convergence re-runs with the mutual exclusion logic:

```sql
UPDATE rule_sets SET input_bindings = '{}' 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' AND status = 'active';
```

Trigger BCL October calculation through the browser.

Report verbatim:
- Convergence log lines for `cumplimiento_depositos` and `cumplimiento_colocacion` — specifically whether `scale=` appears on the binding or not.
- The `[CalcRecon-T1] componentTotals` line.
- The `Grand total` line.
- 3 sample entity T2 lines (one Senior, two Ejecutivo).

### 4.3 Verify supersession

```sql
SELECT id, status, created_at FROM rule_sets 
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' 
ORDER BY created_at DESC;
```

Report: exactly 1 active, others superseded.

### 4.4 Verify validator

Check logs for `[PrimeValidator]` lines during the most recent plan interpretation. If `rateTableCellCount` was emitted and the exhaustive emission check fired, report the log line. If it didn't fire, report that too — this is HALT-1 territory.

### 4.5 Commit

```
git add -A && git commit -m "HF-244 Phase 4: verification evidence" && git push origin dev
```

---

## §7 HALT Conditions

| ID | Condition | Action |
|---|---|---|
| HALT-1 | LLM does not emit `rateTableCellCount` on components with rate tables | Report. The prompt instruction may need reinforcement. Do not block the HF — Phases 1 and 3 are independent of Phase 2. |
| HALT-2 | Removing convergence `scale_factor` breaks legacy trees (trees without `meta`) | Report. The mutual exclusion must be conditional: skip `scale_factor` only when `scaleMetadata` is present. Legacy path unchanged. |
| HALT-3 | Supersession UPDATE affects rule_sets for OTHER tenants | Report immediately. The UPDATE must be scoped by `tenant_id`. |
| HALT-4 | C1 total is still $37,390 after Phase 1 | The double-scaling was not the only cause. Report the convergence log and evaluator trace. |

---

## §8 Reporting Discipline

Completion report: `docs/completion-reports/HF-244_COMPLETION_REPORT.md`

Per Rules 25-28. Structure per `COMPLETION_REPORT_ENFORCEMENT.md`. Evidence means paste, not describe. Commit-per-phase.

Additional required evidence:
- Phase 1: paste the THREE code sites (convergence scale_factor set, evaluator meta.scale multiply, metric resolution scale_factor apply) BEFORE and AFTER the change.
- Phase 2: paste `validateComponentIntent` call site showing `expectedCellCount` wiring. Paste any `[PrimeValidator]` log output.
- Phase 3: paste the supersession query BEFORE (2 active) and AFTER (1 active).
- Phase 4: paste convergence log, componentTotals, grand total, 3 entity T2 lines.

---

## §9 Out of Scope

- BCL clean-slate plan reimport through browser to force LLM re-emission of C0 with the new validator. This requires architect browser interaction. The HF prepares the validator; the reimport is a separate architect action.
- CRP verification. CRP's rule_sets may also have double-scaling. After BCL is verified, the architect runs the same wipe-and-calculate sequence for CRP.
- Evaluator unit test suite (deferred from OB-200).
- Temporal prime extensions.
- Substrate supersession candidates (VG-side).

---

## §9A Residuals

- C0 (Credit Placement) will remain incomplete until the plan is reimported through the browser. The validator (Phase 2) ensures that the NEXT reimport either produces a complete tree or throws an error. The current 3-leaf tree persists until reimport. C0 will still produce incorrect results for this calculation run.
- The `rateTableCellCount` instruction depends on the LLM reliably emitting it. If the LLM ignores the instruction (HALT-1), a fallback structural inference approach (option B from Phase 2 analysis) may be needed in a follow-on HF.
- The single-plan-per-tenant supersession model (§5.2) is sufficient for proof tenants. Multi-plan tenants require name-scoped supersession — deferred.
- After HF-244 merges and C1 is verified, the architect must reimport the BCL plan through the browser to force C0 re-emission under the validator. This is the critical path to BCL full reconciliation.

---

## BUILD AND DEPLOY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — zero errors
4. `npm run dev` — `localhost:3000` responds
5. Git from repo root (`spm-platform`) NOT `web/`
6. `gh pr create --base main --head dev` with title: "HF-244: Scale mutual exclusion + validator exhaustive emission enforcement + plan supersession"
7. PR body: "Closes OB-200 double-scaling regression (convergence scale_factor AND evaluator meta.scale both firing), adds structural exhaustive emission enforcement to prime-validator via LLM-emitted rateTableCellCount, and fixes plan supersession to ensure exactly one active rule_set per tenant."
