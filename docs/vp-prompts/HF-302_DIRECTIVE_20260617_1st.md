# HF-302: Convergence File-Affinity + Entity-Key Rollup

**Date:** 2026-06-17
**Type:** HF — structural fix (regression closure)
**Predecessor:** DIAG-072 (merged main HEAD — confirm with `git rev-parse HEAD`)
**Drafted per:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` (DD-1 → DD-12)
**Number:** HF-302. VERIFY before use: `ls docs/vp-prompts/ docs/diagnostics/ docs/completion-reports/ | grep -iE "HF-302"` must be empty. If taken, halt and surface — do not derive a replacement.

---

## §-1 — CRITICAL PATH TO OBJECTIVE

MIR is the active critical path: 5 plans calculating end-to-end and reconciling against locked ground truth. DIAG-072 proved why every entity returns $0 on PLAN DE AJUSTES Y DEVOLUCIONES (CLAWBACK): convergence binds the plan's component inputs to columns from the wrong data file, and even a correct binding could not reach the paying entity. This HF closes the three compounding root causes so the clawback — and the other four MIR plans — compute non-zero. It is the last engine blocker before MIR freeze and Spanish rehearsal.

---

## §0 — STANDING RULES + DISCIPLINE

`CC_STANDING_ARCHITECTURE_RULES.md` applies in full. Drafted against `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

- Commit + push after every change. Git from repo root (`spm-platform`), NOT `web/`.
- Architecture Decision Gate before implementation; Anti-Pattern Registry checked every build.
- Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` before the completion report.
- This HF modifies a persisted data flow (`input_bindings.convergence_bindings`, written by convergence, read by the calc engine) and the calc route's in-memory `dataByBatch` index. **The LOCKED Data Contract Map gate (`DESIGN_GATE_PREREQUISITE_DATA_CONTRACT_MAP.md`) applies. §2 contains the map. Read it before touching code.**
- **Korean Test (Decision 154):** every change keys on structural identifiers — `data_type`, `batchId`, value-overlap against `entities.external_id` — NEVER on a literal column name in any language. No `DNI_Vendedor`, no `Codigo_Cliente`, no Spanish string literals anywhere in the fix. Structured failure on the unrecognized, never silent fallback.
- **DD-7 scope fence:** fix the three named root causes only. No adjacent refactor, no behavior expansion.

---

## §1 — ROOT CAUSE (from DIAG-072, proven)

Three compounding causes; all three must be fixed for the clawback to compute non-zero:

- **RC-1 (regression): flat cross-data-type candidate pool.** `convergence-service.ts` boundary-matches a component to a data_type, then the HF-228 add-loop pushes EVERY other data_type's numeric columns into the AI candidate pool tagged `cross_source_numeric` at 0.4 confidence. The prompt is one flat DATA COLUMNS list. The hard cross-source guard (HF-263 P3.2, commit `dc9c89e3`) was REMOVED by HF-269 Phase A (commit `bc57f1df`). → the AI binds the clawback's four inputs to Cobranza columns.
- **RC-2: resolution drops the source batch.** `resolveColumnFromBatch` (`run/route.ts`) takes `column` + `entityExternalId` and uses the FIRST batch with rows for the entity — the persisted `ComponentBinding.source_batch_id` is not threaded in.
- **RC-3: no secondary-identifier aggregation.** `dataByBatch` is keyed by each batch's PRIMARY `entity_id_field`. Transaction rows keyed by the client identifier never roll up to the paying entity via the seller-identifier column present in those same rows.

**Why single-file tenants passed:** one data source → the cross-source add-loop contributes nothing → wrong-file binding is structurally impossible. MIR is the first multi-file tenant.

---

## §2 — DATA CONTRACT MAP (LOCKED GATE — read before code)

The fix touches one persisted structure and one in-memory structure. CC must confirm each shape against the LIVE code before editing (the extracts below are from project knowledge and MUST be re-verified — see §3.0).

### A. Shape — `input_bindings.convergence_bindings` (persisted JSONB)
Per-component map. The `ComponentBinding` interface (convergence-service.ts) is:
```ts
export interface ComponentBinding {
  source_batch_id: string;       // ← ALREADY PRESENT — the field RC-2 must thread
  column: string;
  field_identity: FieldIdentity;
  match_pass: number;            // 1=structural/boundary, 2=contextual/AI, 3=token
  confidence: number;
  scale_factor?: number;         // HF-111
}
```
Persisted form (HF-108 / Decision 111): `convergence_bindings = { component_N: { <inputName>: ComponentBinding, ... } }`.

### B. Writer
`convergence_bindings` ← written by `convergeBindings` (`convergence-service.ts`) via the component-binding generation path, persisted to `rule_sets.input_bindings` by the calc route's HF-165 convergence block (`run/route.ts`) and by the import/finalize convergence path. **RC-1 changes WHICH candidate columns the AI may bind here. RC-2 requires `source_batch_id` to be populated on each binding (confirm it already is — the interface carries it).**

### C. Reader
`convergence_bindings` ← read by the calc route metric-resolution path (`run/route.ts`, the `HF-108 Using convergence_bindings` branch) which calls `resolveColumnFromBatch` per component input. **RC-2 changes this reader to honor `source_batch_id`. RC-3 changes how the `dataByBatch` index this reader consults is built.** Absence behavior today: a column not found in the chosen batch's rows returns `null` → component evaluates 0 (the observed failure). Post-fix absence behavior must be **structured** (logged resolution failure with the reason), never a silent 0 that masks a mis-binding.

### D. In-memory — `dataByBatch` (calc route, not persisted)
Built in `run/route.ts` (~`:800-845` per DIAG-072) keyed by each batch's primary `entity_id_field`. **RC-3 adds a secondary index entry: for any batch whose rows contain a column whose values overlap `entities.external_id`, also index those rows under that secondary identifier**, so rows reach the paying entity. This is additive — the primary key index is unchanged.

> If CC's live read finds any shape divergence from the above (e.g., `source_batch_id` absent from the persisted binding, or a 4th arg on `convergeBindings`), STOP and surface it before editing. Do not adapt silently — the HF-226 post-mortem that locked this gate was caused by exactly that drift.

---

## §3 — IMPLEMENTATION

### §3.0 — Setup + live-shape verification (do this first, prove before editing)
```bash
cd ~/spm-platform
git checkout main && git pull origin main
git rev-parse HEAD
git checkout -b hf-302-convergence-file-affinity

# Verify the live shapes the Data Contract Map depends on:
grep -n "interface ComponentBinding" -A12 web/src/lib/intelligence/convergence-service.ts
grep -n "async function convergeBindings\|export async function convergeBindings" web/src/lib/intelligence/convergence-service.ts
grep -n "cross_source_numeric\|matchedDataTypes\|measureColumns.push\|resolveColumnMappingsViaAI" web/src/lib/intelligence/convergence-service.ts
grep -n "function resolveColumnFromBatch\|dataByBatch\b" web/src/app/api/calculation/run/route.ts
```
Confirm: (1) `ComponentBinding.source_batch_id` exists; (2) the live `convergeBindings` arg list (project knowledge shows 3 args; logs show a 4th `calculationRunId` — use the LIVE signature); (3) the HF-228 add-loop location; (4) the `resolveColumnFromBatch` signature and the `dataByBatch` build site. **If any shape differs from §2, halt and surface.**

### §3.1 — RC-1: partition the candidate pool by matched data_type (option a)
In `convergence-service.ts`, at the HF-228 cross-source add-loop (DIAG-072: `:2764-2777`): **gate the add-loop so a component's candidate pool contains ONLY columns from the data_type(s) the boundary matcher associated with that component** (and any data_type the component explicitly cross-references via its declared structure — NOT all numeric columns tenant-wide).

- Keep the matched-data_type columns as the pool.
- Drop the unconditional `cross_source_numeric` injection. If a component genuinely needs a cross-referenced data_type, that reference must come from the component's declared cross-reference structure (boundary-matcher output), not from a blanket "add every other file's numbers" loop.
- This restores the file affinity that HF-269 Phase A removed, deterministically — keyed on `data_type` / `batchId`, no magnitude proxy, no name matching (Korean-Test-clean). Do NOT restore HF-263 P3.2 (the magnitude-proxy redirect was deliberately deleted as override-class closure — reintroducing it is forbidden).
- **DD-2/DD-3 sweep:** grep every consumer of `measureColumns` / the candidate pool to confirm the partition holds at all binding-generation sites, not just the one DIAG-072 cited. Close the class, not the instance.

### §3.2 — RC-3: structural secondary-identifier rollup
In the calc route where `dataByBatch` is built (`run/route.ts` ~`:800-845`): after building the primary-key index for a batch, **derive whether the batch carries a secondary identifier that maps to a paying entity, structurally**:

- The paying entities for this calc are already loaded (the assigned `entities` rows, DNI-keyed via `external_id`). Build the set of `entities.external_id` values once.
- For each batch, inspect its row columns: if a column's values overlap the `entities.external_id` set above a clear threshold (most rows' value for that column is a known external_id), that column is a **rollup key**. Index that batch's rows ALSO under that column's value (the paying entity's external_id), in addition to the primary key.
- This is fully structural: no column-name literal. The signal is "this column's values ARE entity external_ids." `DNI_Vendedor` is discovered because its values match the roster; `Codigo_Cliente` is not, because its values don't.
- Structured failure: if no rollup key is found for a batch whose data_type a component needs, log it explicitly (the component will resolve to a logged failure, not a silent 0).

### §3.3 — RC-2: thread `source_batch_id` into resolution
In `resolveColumnFromBatch` (`run/route.ts` ~`:1534-1546`): accept the binding's `source_batch_id` and, when present, resolve the column against THAT batch's rows for the entity (consulting both the primary and the RC-3 secondary index), instead of the first batch with any rows. Fall back to the current first-match behavior only when `source_batch_id` is absent (legacy bindings), and log when it does.

- Thread `source_batch_id` from the `ComponentBinding` at the call site(s) in the metric-resolution path. **DD-1: enumerate every call site of `resolveColumnFromBatch` and update the signature consistently** — do not leave an adjacent caller on the old signature.

### §3.4 — Build + self-check
```bash
# kill dev server first
rm -rf .next
npm run build          # tsc 0 errors, build green
npm run dev            # confirm localhost:3000
```
Paste the build result (errors count, pass/fail) into the completion report.

---

## §4 — VERIFICATION (SR-44 — browser, the only valid gate)

Self-attestation is rejected (Rules 25-28). The completion report carries pasted evidence for each gate.

**Architect runs the production calc; CC's report states expected vs the mechanism, not a PASS claim.**

- **G1 — MIR clawback non-zero.** Recalculate PLAN DE AJUSTES Y DEVOLUCIONES (CLAWBACK), MIR Jan 2025. Forensic trace must show the four inputs bound to **Ventas** columns (original-sales), `resolveColumnFromBatch` returning non-null `perRowValues`, and a non-zero grand total. Paste the convergence AI-mapping line and the per-entity resolution lines.
- **G2 — all 5 MIR plans.** Each of the five plans computes non-zero where ground truth is non-zero, and reconciles against `MIR_Resultados_Esperados.xlsx` in the architect channel.
- **G3 — regression checks (no single-file breakage).** BCL ($44,590 Oct / $312,033 full), Meridian (Q1 exact), CRP (Plans 1+3 = $364,457.84) recalculate to their locked values. The matched-data_type partition must be a no-op for single-file tenants — prove it.
- **G4 — Korean Test.** Confirm no column-name literal entered the fix (grep the diff for `DNI`, `Codigo`, `Vendedor`, `Cliente`, `Monto`, `Saldo` — must be absent from changed lines).

---

## §5 — COMPLETION REPORT

Write `docs/completion-reports/HF-302_COMPLETION_REPORT.md` committed to the branch BEFORE opening the PR (Rules 25-28). It contains: the live-shape verification output (§3.0), the three edits with file:line and the actual diff hunks, the build result, the §2 Data Contract Map reconciled against what was actually changed, and the G1-G4 evidence placeholders for architect to fill from the production run. Surface it in the architect channel for assessment before merge. Completion report ≠ working — G1-G4 browser proof is the gate.

---

## §6 — SHIP

```bash
git add -A
git commit -m "HF-302: convergence file-affinity (RC-1 data_type partition) + entity-key rollup (RC-3) + source_batch_id resolution (RC-2)"
git push origin hf-302-convergence-file-affinity
gh pr create --base main --head hf-302-convergence-file-affinity \
  --title "HF-302: Convergence file-affinity + entity-key rollup + source-batch resolution" \
  --body "Closes DIAG-072 three root causes. RC-1 restores file affinity removed by HF-269 Phase A via deterministic data_type partition (not the deleted HF-263 P3.2 magnitude proxy). RC-3 adds structural secondary-identifier rollup (value-overlap with entities.external_id, no column-name literal). RC-2 threads existing ComponentBinding.source_batch_id into resolveColumnFromBatch. Data Contract Map in directive §2. SR-44 gates G1-G4 in completion report."
```
State the PR number and the branch HEAD SHA.

## §6A — HALT

After the PR is open and the completion report is committed, **HALT**. Architect runs G1-G4 in production and dispositions merge. Do not merge.

---

*HF-302 · Convergence File-Affinity + Entity-Key Rollup · 2026-06-17 · vialuce.ai · Intelligence. Acceleration. Performance.*
