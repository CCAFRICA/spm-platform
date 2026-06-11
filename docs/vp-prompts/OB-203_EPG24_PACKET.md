# OB-203 EPG-2.4 — RUN PACKET (architect-executed; merge gate)

**Nothing merges before BOTH runs verify.** Blind-holdout: the Meridian source file is
architect-held; CC never touches it. CC verifies post-run via service-role reads only.

## 1. Sandbox tenant
- **tenant_id: `24103940-ab33-4a21-b6fd-bd1042f4762c`** (slug `ob203-epg24-sandbox`,
  "OB-203 EPG-2.4 Sandbox (Meridian re-import)"). Clean-slate — provisioned by cloning the Meridian
  tenant's settings/features/locale/currency; zero committed_data, zero fingerprints. NEVER the
  closed Meridian tenant (`5035b1e8-…`).

## 2. Build under test
- Branch **`OB-203-phase-2`** at commit **`25d0244d`** (the EPG-2.4 commit: engine + decomposed
  dispatch + reinforcement-gating + provenance, all live). Confirm the preview/dev you run against
  was built from this SHA before executing. (CI/Vercel preview for the branch, or local dev on the
  branch.)

## 3. Two-run protocol (same sandbox tenant, no reset between runs)
**RUN 1 — COLD.** Import the Meridian source file into the sandbox tenant via `/operate/import`
through the SCI proposal path; confirm the proposal. Exercises the decomposed dispatch end-to-end:
novel atoms → bounded per-unit comprehension. Expected: substantial LLM dispatch (cold), atoms
accumulate (match_count=1), classifications produced.

**RUN 2 — WARM.** Immediately re-import the identical file into the SAME sandbox tenant. Exercises
read-before-derive live: known atoms claim roles, near-zero LLM. Expected: atom match_count→2,
decision_source shifts to prior-signal/recognized, the provenance chip shows high "% atoms · no LLM".

Report to CC after each run: the run completed (or any FETCH FAILED — expected for large files,
does not fail verification; the proposal lands server-side).

## 4. CC verification (read-only, post-run) — staged queries
Run against `tenant_id = 24103940-…`. Pasted into the EPG-2.4 evidence with both runs side by side.

### (A) Binding verification vs cac8c391 expectations
```ts
// reads rule_set cac8c391 component expectations + the sandbox run's classification_signals,
// asserts: every Meridian sheet classified consistently (entity roster / target / transaction),
// bindings token-complete (no 'unknown' role survives on a bound field).
const { data: rs } = await sb.from('rule_sets').select('components').eq('id','cac8c391-...').maybeSingle();
const { data: sigs } = await sb.from('classification_signals')
  .select('sheet_name, classification, decision_source, confidence, header_comprehension, vocabulary_bindings, created_at')
  .eq('tenant_id', SANDBOX).gte('created_at', RUN_START).order('created_at');
// assert: classifications match the Meridian structural ground truth; bindings cover the expected
// fields with non-'unknown' roles. Paste the per-sheet classification table + any gap.
```

### (B) Tier-distribution (Progressive Performance, cold vs warm)
```ts
// atom store accumulation + decision-source shift across the two runs
const { data: atoms } = await sb.from('structural_fingerprints')
  .select('match_count, confidence').eq('tenant_id', SANDBOX).eq('granularity','atom');
// run 1 -> atoms at match_count=1; run 2 -> match_count=2 (recognized).
const { data: sigs } = await sb.from('classification_signals')
  .select('decision_source, created_at').eq('tenant_id', SANDBOX);
// bucket by run window: decision_source distribution (llm/crr vs prior_signal),
// atom recognized-fraction per run. Paste run1 vs run2 side by side — the shift is the witness.
```
Tier-distribution must show the cold→warm shift (cold: novel/LLM-heavy; warm: recognized/near-zero
LLM). This is the first live Progressive Performance evidence under the new engine, on the record at
the merge gate.

## 5. Gate
- EPG-2.4 passes only if BOTH runs verify: binding-complete + classification-consistent (run 1),
  AND the recognition shift (run 2). If RUN 1 diverges → CC does a structural read on the branch,
  fixes, re-runs BOTH. The gate does not soften (HALT-9 discipline on any anchor delta).
- Phase 2 PR merges only after this packet's evidence is pasted and verified.

**Awaiting architect execution of RUN 1 + RUN 2.**

---

## EPG-2.4 v2 — CLEAN 3-RUN PROTOCOL (architect-approved 2026-06-11, on 3d8c818e+)

**Why v2:** the v1 identical-file two-run protocol structurally could not exercise the atom
READ-before-derive (Run 2's identical file hits sheet-level Tier-1, bypassing the atom path) — an
architect-side packet gap, caught at the gate. RUN 1 also revealed the atom-WRITE defect
(classification_result NOT NULL, fixed `7218f034`; silent-catch hardened `3d8c818e`). v2 adds RUN 3
(modified file) as the live witness of partial recognition.

**Sandbox CLEARED 2026-06-11** (CC, service-role): structural_fingerprints 0, committed_data 0,
classification_signals 0, entities 0, import_batches 0. Genuinely cold. Tenant
`24103940-ab33-4a21-b6fd-bd1042f4762c`. Build under test: `OB-203-phase-2` @ `3d8c818e`+.

### RUN 1 — COLD (atom WRITE witness)
Import the unmodified Meridian file. All sheets sheet-Tier-3 → decomposed dispatch comprehends all
columns (novel) → **atoms now accumulate** (write fix live). Verify after: `structural_fingerprints`
has `granularity='atom'` rows; classifications entity/transaction/reference.

### RUN 2 — WARM IDENTICAL (sheet flywheel witness)
Re-import the identical file. All sheets sheet-Tier-1, LLM skipped, fast. (Atom path bypassed by
sheet-Tier-1 — expected; this run witnesses the existing sheet flywheel, not the atom path.)

### RUN 3 — MODIFIED (atom READ / partial-recognition witness) — the new gate evidence
**Modify the Meridian file (architect-held): add ONE new column to the `Datos_Rendimiento` sheet —**
**a boolean column named `Activo` with true/false values** (boolean is a dataType absent from the
sheet, so it is a guaranteed-novel atom; every other column is unchanged → its atom is known).
Re-import the modified file.
- Expected: `Datos_Rendimiento` becomes **sheet-Tier-3** (composite fingerprint changed by the new
  column) → enters the decomposed dispatch → `lookupAtoms` finds the 19 existing atoms (known) →
  plan: 19 known claimed WITHOUT LLM, only `Activo` is novel residue → **one bounded comprehension
  call covering exactly `Activo`** → `recognitionProvenance` ≈ "95% atoms · 1 new". The other two
  sheets stay sheet-Tier-1 (unchanged).
- This is the live witness of the OB's central R1 mechanism (partial recognition / read-before-derive).

### CC verification after the three runs (read-only, pasted)
1. RUN 1: atom rows written (`granularity='atom'` count + match_count); classifications correct.
2. RUN 2: sheet-Tier-1 (the existing flywheel); no regression.
3. RUN 3: `Datos_Rendimiento` sheet-Tier-3, atom recognized-fraction high, bounded comprehension of
   ONLY the novel column, provenance line — partial recognition, live.
4. Atom-write-failure observability: zero `comprehension:atom_write_failed` signals (the write fix
   holds); any present is surfaced.

Gate passes only if all three witnesses verify. RUN 1/3 divergence → structural read, fix, re-run.
