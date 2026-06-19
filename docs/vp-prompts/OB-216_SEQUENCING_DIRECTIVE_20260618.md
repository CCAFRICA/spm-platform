# OB-216 — Sequencing Directive + Track C Correction (mid-build)

**Applies to:** the active `ob-216-convergence-unified-path` build (HEAD `d1341638`, Phase 0 cleared).
**Type:** course-correction + cadence. Read-only probe first, then phased implementation with two mandated review pauses. **No merge (SR-44).**

This directive does two things before Phases 1–5 proceed: (1) corrects a framing error in the Phase 0 Track C finding using live runtime evidence, and (2) fixes the review cadence for the remainder of the build.

---

## §A — Track C correction (the Phase 0 finding is half-right; the conclusion is wrong)

The Phase 0 report states: *"Track C is NOT the active MIR blocker, and Plan 3 already binds correctly."* The first clause does not follow from the second, and the live runtime contradicts it.

**Live evidence (Plan 3, INCENTIVO POR COBRANZA `e04a6eba`, January calc, this session):**
```
[Convergence] HF-114 AI mapping: {"Monto_Cobrado":"Monto_Cobrado","Saldo_Pendiente":"Saldo_Pendiente"}   ← binding CORRECT
[CalcAPI] [CalcTrace] resolveColumnFromBatch:exit entity=… column=Monto_Cobrado reason=column_in_no_batch returned=null   ← every entity
[CalcAPI] Grand total: 0
```

Plan 3 **bound correctly AND resolved to `column_in_no_batch` AND returned 0.** A correct binding that still resolves null is the **definition of the Track C failure firing**, not evidence of its absence. Plan 3 is precisely the plan where Track A (binding) is NOT the problem — which is why it isolates Track C cleanly. **Do not treat Phase 4 as optional SR-2 polish; on this evidence it is load-bearing for the MIR unblock.** Reading the persisted binding's `entity_identifier = DNI_Vendedor` does NOT resolve this, because the engine keys on a *different* value (see §B).

**Favorable-framing-drift guard:** if the build proceeds on "Track C is not the blocker," Plan 3 can still return 0 after Phases 1–3 ship. The static binding being correct must not be read as the runtime being correct — the logs already show they diverge.

---

## §B — Close UNKNOWN #1 correctly (read-only probe, BEFORE Phase 4 is scoped)

UNKNOWN #1 asks: **what does `knownEntityCols[0]` resolve to at runtime for Plan 3?** — NOT what the persisted binding's `entity_identifier` is. These differ because `entityCol` is `[0]` over the **merged binding set across all components**, in data-dependent order (`run/route.ts:813-820`):
```ts
const knownEntityCols = Array.from(new Set(
  Object.values(convergenceBindings)
    .map(comp => comp?.entity_identifier as { column?: string } | undefined)
    .map(eid => eid?.column).filter(...)));
const entityCol = knownEntityCols[0];     // global, for ALL sheets, data-dependent order
```
So the global `entityCol` used to key `dataByBatch` (`889-894`) can be a different column than Plan 3's own `entity_identifier`. If `[0]` is some other sheet's identifier, Cobranza rows get filed under a key the iterated `DNI_Vendedor` entity never matches → `column_in_no_batch` → 0, *despite* Plan 3's binding being `DNI_Vendedor`.

**Probe (headless, read-only — use the repo's recalc script path, e.g. `HF-216_phase6_recalc.ts`):** run a Plan 3 (`e04a6eba`) convergence+calc and capture, at runtime:
1. `knownEntityCols` (the full array) and `knownEntityCols[0]` (the chosen global key).
2. Plan 3's own `entity_identifier.column` from its binding.
3. Whether they are equal.

Paste all three. **Decision rule (record it):**
- If `knownEntityCols[0] !== 'DNI_Vendedor'` → **Track C confirmed as the Plan-3 zero cause**; Phase 4 (per-sheet entity key) is the load-bearing fix that unblocks Plan 3, and EPG-4 must prove `column_in_no_batch` is gone and Plan 3 computes non-zero.
- If `knownEntityCols[0] === 'DNI_Vendedor'` AND Plan 3 still hit `column_in_no_batch` → there is a **separate, uncharacterized resolution defect**; STOP and report it — Phase 4's scope must be re-derived before building, because per-sheet keying alone would not explain the failure.

This probe does **not** block Phase 1 (partition). It must be settled before Phase 4 is built.

---

## §C — Cadence for the remainder of the build

Execute phases sequentially with per-phase EPG evidence (as OB-216 specifies). Two **mandatory review pauses**; the rest run through with self-gating.

| Phase | Run mode | Gate |
|---|---|---|
| §B probe | Run now | Paste the 3 runtime values + decision. Proceed to Phase 1 regardless (probe informs Phase 4, not Phase 1). |
| **Phase 1** (sheet-aware partition, `inventoryData`) | **PAUSE at EPG-1 for architect review** | Foundational — five phases build on it and the partition key was revised. Architect reviews EPG-1 before 2–5 commit to it. |
| Phase 2 (sheet-scoped matching + role-aware candidates) | Run through to EPG-2 | Self-gate with pasted evidence; architect reviews in completion report. |
| Phase 3 (relative/CRL selection — threshold elimination) | Run through to EPG-3 | Self-gate; `no-developer-numbers-scan.sh` GREEN is the hard gate. |
| **Phase 4** (per-sheet entity key, Track C) | **PAUSE at EPG-4 for architect review** | The phase that actually unblocks Plan 3. EPG-4 must show `column_in_no_batch` gone + Plan 3 non-zero — the proof Track C is resolved. |
| Phase 5 (cross-period clawback) | Run through to EPG-5 | Self-gate; SR-38 hand-computation required. |
| PR | Open, do NOT merge | Completion report = PR body + all EPG evidence. |

**At each pause:** commit + push the phase, post the EPG evidence, and stop for architect review before continuing. Do not begin the next phase until the architect releases the pause.

---

## §D — EPG-1 must additionally confirm (partition-key Korean-Test)

The revised partition key `(data_type, column-signature)` is accepted. EPG-1 must explicitly confirm it is **Korean-Test-clean**: the column-signature is the *set of column names treated as an opaque structural shape* (a fingerprint), and the partition logic **never branches on what any column name means**. Paste the signature-construction code and state that no semantic/string-content branch exists. Also confirm the regression guard with the corrected expectation: **MIR → 6 caps** (Cobranza / Ventas / Ventas_Marzo / Clientes_Nuevos / Cuotas — collapsing identical-schema months); **BCL → 3 caps** (its 3 legitimate data_types, unchanged). The OB-216 "exactly 1 capability" guard text is superseded by these explicit per-tenant counts.

---

## §E — Disposition notes
- §B probe result and the Phase 4 decision are recorded in the completion report as the *correct* resolution of UNKNOWN #1 (superseding the Phase 0 static-binding read).
- If §B triggers its STOP branch (separate resolution defect), that becomes a blocking finding for architect disposition before Phase 4 — do not invent a fix.
- All other OB-216 disciplines stand unchanged (Korean Test, Decision 110 / scan GREEN, SR-34 no MIR special-case, SR-38 math gate, SR-44 architect-only merge/browser, reconciliation-channel separation — no ground-truth values in CC outputs).

---

*OB-216 sequencing directive · Track C correction + cadence · 2026-06-18 · vialuce.ai*
