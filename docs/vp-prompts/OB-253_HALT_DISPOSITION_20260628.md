# OB-253 — HALT DISPOSITION + PHASE 2–4 RESUMPTION

**Date:** 2026-06-28
**Architect disposition on:** HALT-DIVERGE-1, HALT-DIVERGE-2, HALT-SURFACE-3
**Governing directive:** `docs/vp-prompts/OB-253_DIRECTIVE_20260628.md` (unchanged — this supplements it)
**Phase 1 status:** PG-1 PASS. True-state map committed at `docs/diagnostics/OB-253_TRUE_STATE_MAP.md`.
**Mode:** ULTRACODE continues. Anti-narrowing clause from the governing directive binds throughout.

---

## ARCHITECT DISPOSITIONS ON THE THREE HALTS

### HALT-DIVERGE-1 — G7 surface split across three tables

**Disposition: Option 1 — logical read-adapter. APPROVED.**

G7 says one CANONICAL signal surface. Canonical is a logical commitment, not a physical mandate. The three tables (`structural_fingerprints`, `synaptic_density`, `classification_signals`) serve genuinely different structural roles — fingerprints are file-level atoms, density is accumulated learning keyed by calc pattern, classification_signals are per-value assessments. Those are not accidental silos; they are structural decomposition of one logical surface.

**Build a read adapter** — a composing function (or set of composing queries) that presents all three tables as one logical co-present surface for joint recognition. The adapter is a READ path only. It does NOT unify the physical tables. It does NOT modify the engine's existing density reads (G9 untouched). It does NOT create a new physical table.

**The adapter is the enabling architecture for Phase 3.** When a remediation facet needs co-present signal (see a value's structural fingerprint AND its density history AND prior classification signals together), the adapter composes them. Without this adapter, the facets cannot see each other's context, and joint recognition is impossible. Build it in Phase 2 so Phase 3 can use it.

---

### HALT-DIVERGE-2 — synaptic_density is calc-keyed, not ingestion-keyed

**Disposition: the true state corrects the directive. Density is NOT read at ingestion time.**

The governing directive §3A.2 said "read synaptic_density at the START of a classification/comprehension run." Phase 1 revealed that density is keyed by CALC pattern signature (5 rows, calc-domain), not by file structure. The actual ingestion-time prediction surface is `structural_fingerprints` (121 rows, file-structure-keyed) — and the fingerprint read-path is already live and working. First-vs-repeat speedup already holds.

**Corrected architecture:**
- **Ingestion time:** `structural_fingerprints` predicts structure. ALREADY LIVE. Do not rebuild.
- **Calc time:** `synaptic_density` predicts calc patterns. ALREADY THE ENGINE'S DOMAIN. Do not touch (G9).
- **Joint recognition (Phase 3):** The read adapter from HALT-1 makes BOTH available for co-present reasoning. The facets see fingerprint-scoped AND density-scoped signal together without either being forced into the other's key-space.

**The directive's §3A.2 instruction to read density at ingestion is WITHDRAWN.** Replace it with: the read adapter (HALT-1) composes both key-spaces at Phase 3's joint recognition point. Phase 2's read-path work is limited to verifying what's already live and ensuring the consolidation write-back (§3A.3) is wired end-to-end.

---

### HALT-SURFACE-3 — Data Operations workspace is 100% hardcoded mock

**Disposition: wire the existing surface live. This is NOT a new surface.**

`/data/page.tsx` was shipped as part of OB-250 (PR #615). The route exists. The navigation entry exists. The capability gate (`prism_enabled`) exists. It currently displays hardcoded mock data.

**Replace the mock data in `/data/page.tsx` with real reads from the signal surface.** This means:
- Read `classification_signals` for the tenant's recent comprehension/remediation signals.
- Read `structural_fingerprints` for the tenant's known file structures and flywheel state.
- Read `processing_jobs` for the tenant's ingestion job history and status.
- In Phase 4: display precision-weighted trust-flagged items that need operator acknowledgment.

§6 of the governing directive says no new production surfaces. This is not a new surface — it is the Vertical Slice Rule completing an existing surface. The route, layout, gate, and nav entry are already live. Only the data source changes from hardcoded arrays to live queries.

**Timing:** The mock→live wiring is part of Phase 3 (where remediation signals become the primary content) and Phase 4 (where precision-weighted flags surface for operator acknowledgment). Do NOT defer this to a separate OB. Do NOT create a separate page. Wire it as you build Phases 3 and 4 — the Vertical Slice Rule demands it.

---

## PHASE 2 — WHAT REMAINS (MOST IS ALREADY MET)

Phase 1 established that the following Phase 2 deliverables are ALREADY LIVE and PASS:

- **§3A.1 comprehension-before-commitment** — PASS. Comprehension writes atoms/fingerprints/signals in process-job `status='classified'` before `commitContentUnit` writes `committed_data`.
- **§3A.2 read-path closure (fingerprint half)** — PASS. `lookupFingerprint` Tier routing + `lookupAtoms` read-before-derive are live.
- **§3A.3 fingerprint write-back** — PASS. Fingerprint + atom hash computed and stored.

**Phase 2 remaining work:**

1. **Build the read adapter (HALT-1 disposition).** The logical co-presence function that composes `structural_fingerprints` + `classification_signals` + `synaptic_density` into one queryable surface for Phase 3. This is Phase 2 work because Phase 3 depends on it.

2. **Verify consolidation write-back end-to-end (§3A.3 completeness).** Fingerprint write-back is live. Verify that `synaptic_density` records are also updated after a run (confidence, total_executions, execution_mode recalculation). If density write-back is NOT wired for ingestion-originated runs (it may only fire for calc-originated runs), wire it — but respect the calc key-space (do not change what density is keyed on).

3. **PG-2 gate evidence.** The governing directive requires a timed comparison: same file structure uploaded twice, second one measurably faster because prediction from the read-path skipped full LLM classification. Phase 1 says this already holds for fingerprints. **Capture the timing evidence** — first-ever vs. repeat upload, with timestamps and token-cost or LLM-call-count comparison. Paste in the completion report. If the timing difference is already demonstrated in Phase 1's true-state map, reference it and mark PG-2 PASS.

---

## PHASE 3 — THE PARADIGM SHIFT (THE REAL BUILD)

Phase 3 deliverables from the governing directive (§3B) are unchanged. The three HALT dispositions give you the enabling architecture:

- **The read adapter (HALT-1)** provides co-presence — every remediation facet sees all signal from all three tables in one logical query.
- **The density key-space (HALT-2)** stays calc-keyed; the adapter bridges it to ingestion-time facets without forcing a key-space change.
- **The Data Operations workspace (HALT-3)** is wired live during this phase — remediation signals become its primary content.

**Key Phase 3 invariants (restated from governing directive — still binding):**

- Decision 158: each facet's FIRST pass is DETERMINISTIC. LLM only at the apex on irreducible surprise.
- Iterative-joint (architect-settled Q1): assess → post to surface → read all → re-assess → converge. NOT one monolithic LLM prompt.
- The Normalizer (OB-249) is RE-POSITIONED, not deleted. Its code becomes one facet. Its LLM call becomes the apex expression.
- PG-3 requires four specific demonstrations — correction, identity, anomaly, and the co-presence proof (a value whose correct classification depends on seeing multiple facets together). All four with pasted evidence.

---

## PHASE 4 — PRECISION-WEIGHTING

Phase 4 deliverables from the governing directive (§3C) are unchanged. Two HALT dispositions affect it:

- **HALT-2:** consequence signal can reference density even though density is calc-keyed — the read adapter bridges the key-spaces.
- **HALT-3:** trust-flagged items surface in `/data/page.tsx` (the Data Operations workspace), which is wired live in Phase 3. Phase 4 adds the precision-weighting flags and the operator acknowledgment flow to the already-live surface.

Precision-weighting calibration is a LEARNING SURFACE (architect-settled Q2). Do not hardcode thresholds. Build the feedback loop. PG-4 requires the falsifiable proof: a value the model expects but should be surfaced, and operator feedback feeding back into the flywheel.

---

## EXECUTION SEQUENCE

1. **Phase 2 remaining** → build read adapter, verify density write-back, capture PG-2 evidence. Should be fast — most work is already met.
2. **Phase 3** → the paradigm shift. This is where the build time lives. Remediation facets on the surface, Normalizer re-founded, Data Operations wired live, PG-3 four-demonstration gate.
3. **Phase 4** → precision-weighting. Consequence + exposure signals, override function, operator feedback loop, PG-4 falsifiable proof.
4. **Completion report** → `docs/completion-reports/OB-253_COMPLETION_REPORT.md` with all four gates' evidence. ARTIFACT SYNC block per the governing directive §5.
5. **PR** → `gh pr create --base main --head ob-253-thalamus-substrate` with descriptive title and body.

All standing rules from §0 of the governing directive remain binding. All HALT conditions from §4 remain active. The anti-narrowing clause remains binding — every phase deliverable is a guarantee. CC HALTs on new forks; CC does NOT silently narrow.

Commit this disposition as `docs/vp-prompts/OB-253_HALT_DISPOSITION_20260628.md` before resuming execution.
