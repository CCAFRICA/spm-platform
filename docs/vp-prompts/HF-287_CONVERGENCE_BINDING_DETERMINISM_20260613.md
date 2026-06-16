# HF-287 — Convergence Binding Determinism (Meridian Regression Fix)

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-13 (architect channel)
**Type:** HF — ships code. Convergence binding-gate fix. **Design Gate applies** — §2 is a required architecture-decision phase before any edit.
**Number:** HF-287 (next-free; HF-286 consumed by PR #489 this session). **Collision gate:** before first commit, CC runs `ls docs/completion-reports/HF-287* docs/vp-prompts/HF-287*`; if any match, HALT and report — do not renumber.
**Diagnosed by:** `docs/diagnostics/DIAG-068_MERIDIAN_CONVERGENCE_REGRESSION_OUTPUT.md` (CAUSE established). Read it before executing.
**Branch + PR:** author on `hf/287-convergence-binding-determinism`, PR to `main` (branch-protected; never push to main directly). Final step: `gh pr create --base main --head hf/287-convergence-binding-determinism`.

---

## §0 — CC Standing Rules header

`CC_STANDING_ARCHITECTURE_RULES.md` governs — read top-to-bottom before executing. Binding throughout:
- **Rule 1 / Korean Test (T1-E910 v2) — THE central constraint of this HF.** The defect is a cluster of look-alike numeric "hub" measures that the binding gate cannot disambiguate. The fix MUST disambiguate **structurally** — by semantic role, intent-derived expected-range, or token-semantics — and MUST NOT introduce any column-name literal, language-specific string, or per-tenant lookup. If the fix's disambiguation would not survive a Korean tenant uploading the same shape with Hangul column names, it is wrong. This is non-negotiable and is re-checked at §2 and at the proof gate.
- **Rule 7 (Prove, Don't Describe)** — every proof is pasted evidence (DB rows, calc output, the captured score-distribution log), never "verified."
- **AUD-009 / one general invariant per layer** — the fix adds ONE general invariant (binding determinism under candidate ordering / relative threshold). It does NOT add a Meridian special-case, a per-column branch, or an enumerated-shape patch. A fix that only makes `cargas_totales_hub` bind is the prohibited form.
- **Decision 158** — LLM recognizes, deterministic code constructs/guarantees. Any new discriminator the LLM emits is a hint; the binding guarantee is code.
- **DD-7 (behavior preservation)** — BCL and every currently-binding tenant must bind identically after the fix. The change is additive determinism, not a re-tuning that shifts existing successful binds.
- **SR-41** — main protected; ship via PR; never force-push.

Drafting source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`. File IS the prompt; phase prose is the executable; no §7 / no "CC Execution Block" / no tail summary; ends at §6A.

**Reconciliation-channel separation:** this HF carries NO ground-truth values. The re-prove gate (§3C) instructs CC to report calculated values verbatim; the architect reconciles them against architect-held targets. CC is given no targets.

**FP-49 SQL Verification Gate:** if any phase authors SQL or references a column/table, CC FIRST verifies against `SCHEMA_REFERENCE_LIVE.md` / `information_schema` and pastes the verification. Phase 0's reads must be schema-verified. The fix logic itself may touch no SQL; if it does, the gate applies.

---

## §1 — Problem Statement

Meridian was CLOSED (reconciled), then aborted at convergence after a clean-slate reimport (rule_set `8affd52c`): `Utilización de Flota [coordinador] component_9` missing `cargas_totales_hub`; HF-281's completeness invariant aborts. **DIAG-068 established CAUSE:** the HF-222 fallback gate `distinctEnoughToBind` accepts a boundary-fallback binding only when the top candidate's score beats the **stddev of all candidate scores** (a *relative* threshold), over a candidate pool **mutated in component-processing order** by the greedy binder. Meridian carries ~9 near-identical numeric hub measures and the fleet-ratio intent (`cargas_totales_hub / capacidad_total_hub`) carries **no discriminating expected-range**, so the top score is a weak 0.1000, top−second ≤ stddev, the gate reports "distribution insufficient to bind (top=0.1000, n=9)", the token is unbound, and HF-281 aborts.

**This is a latent regression**, precisely stated: the code did not change in the OB-203/HF-285 arc (DIAG-068 Q3 — gate, scorer, binder all pre-date it). The defect is a **pre-existing order-dependence** in the relative-threshold fallback gate that was always able to land the rejection on either variant; the clean-slate reimport re-derived component ordering and so surfaced it on `component_9 [coordinador]` this generation, where the prior generation (`be74de80`) landed it on `component_4 [coordinador-senior]`. A customer who had a working calculation lost it on reimport — observable regression — caused by latent fragility, not by the arc.

**Two coupled defects to fix:**
1. **Generation-sensitivity** — the gate's pass/reject for the same data depends on candidate-processing order. Binding must be **deterministic regardless of generation/order**.
2. **Genuine ambiguity** — even made order-stable, the fleet-ratio token competes blind against ~8 look-alike hub measures with no discriminator, so it may still fail to bind. The intent needs a **structural discriminator** so the correct column binds.

Defect 1 is the structural correction (makes failure-or-success consistent). Defect 2 is what makes it **succeed**. The Phase-0 reproduction (§3A) determines whether fixing 1 alone binds, or whether 2 is mandatory — the fix is authored against the real score distribution, not assumed.

---

## §2 — Architecture Decision (Design Gate — REQUIRED before any edit)

This HF changes binding behavior; per the Architecture Decision Gate it must record the decision before implementation. CC does not begin §3B until this section's decision is confirmed against the Phase-0 evidence.

**Decision frame — three candidate mechanisms (from DIAG-068):**

- **(M1) Order-independence in the fallback gate.** Make `distinctEnoughToBind`'s candidate pool and threshold invariant to component-processing order — e.g. evaluate the binding against the full, stably-sorted candidate set rather than a pool mutated by prior greedy binds; or replace the stddev-relative threshold with one that does not depend on which candidates remain unbound at evaluation time. **Attacks Defect 1 (generation-sensitivity) — the structural root.**
- **(M2) Intent-derived expected-range / discriminator for the ratio token.** Give `cargas_totales_hub` (and ratio tokens generally) a structural constraint derived from the intent — a magnitude/range/role expectation the LLM emits as a hint (Decision 158) and code enforces — so the correct hub measure is distinguished from the look-alike cluster on semantics, not name. **Attacks Defect 2 (ambiguity) — makes the bind succeed.** Korean Test: the discriminator is intent/semantic, never a column-name match.
- **(M3) Tie-break for indistinguishable clusters.** A structural tie-break when ≥N candidates score within ε — deterministic, semantic, non-name-based. Closest to the Korean-Test edge; use only if M1+M2 are insufficient and the tie-break can be made purely structural.

**The decision (authored against §3A evidence):** **M1 is the structural correction and is included regardless** — generation-stable binding is the invariant this HF owes (AUD-009: the general fix, not the Meridian patch). **Whether M2 is also required is determined by §3A's captured scores:**
- If, with M1's order-independence, the fleet-ratio token's top score cleanly clears the (order-stable) threshold → **M1 alone**; M2 deferred as a separate enhancement.
- If the scores are degenerate (all candidates ~0.1, no separation possible by ordering) → **M1 + M2**; the discriminator is mandatory because no ordering rescues a tie among identical-looking measures.
- **M3 only** if M1+M2 still leave a true tie — and only structurally.

CC fills the decision verdict in the completion report with the §3A scores as the justification. **HALT-4 if the only path that binds requires a column-name literal or per-tenant rule** — that violates the Korean Test; stop and escalate rather than ship a hardcoded disambiguation.

**Anti-Pattern Registry check (record PASS/FAIL in report):** not an enumerated-shape patch (M1 is a general determinism invariant); no hardcoded field names (M2/M3 are semantic); preserves existing successful binds (DD-7 — BCL re-proves). 

---

## §3 — Phases

### §3A — Phase 0: capture the real score distribution (option A — read before fixing)

Reproduce the Meridian convergence on `8affd52c` with convergence logging enabled, to capture the actual per-variant HF-222 scores — the one fact not in the DB (DIAG-068 honest boundary). This is read-only instrumentation: a temporary log, no logic change.

1. Read `SCHEMA_REFERENCE_LIVE.md` and the convergence implementation (`distinctEnoughToBind`, the scorer, the greedy binder `boundColumnToField`, `requiredTokensForComponent`) — paste the relevant function bodies so the fix in §3B is authored against current code, not the DIAG's description (D3).
2. Add temporary convergence logging at the HF-222 gate to emit, for BOTH variants of `Utilización de Flota`: the candidate set, each candidate's score, the stddev, the top and second scores, and the pass/reject verdict. (Temporary `console.log` at the gate — not an HF-tracked logic change; removed in §3B's commit or explicitly retained behind a debug flag.)
3. Reproduce the calc on Meridian `8affd52c` (the tenant is already reimported and the abort is reproducible). Capture the log. **Paste the captured score lines for both variants** into the completion report §3A evidence.
4. From the captured scores, state which §2 decision branch holds: M1-alone, or M1+M2. This is the gate between Phase 0 and the fix.

**HALT-0A:** if the calc cannot be reproduced (tenant state changed, abort no longer fires), STOP and report — do not author the fix blind. The abort must be reproduced to capture the scores.

### §3B — Phase 1: implement the determinism invariant (M1, + M2 if §3A requires)

Author against the §3A-pasted code and scores. Implement M1 (order-independent binding) as the structural invariant. If §3A showed degenerate scores, also implement M2 (intent-derived discriminator), Korean-Test-clean. Remove the Phase-0 temporary logging (or gate it behind an explicit debug flag — state which in the report).

Constraints enforced in code:
- **Order-independence:** the binding verdict for a token must not depend on component-processing order or on which candidates were bound before it. Prove this in §3C by re-running with a different component order (or by the deterministic-set construction making order irrelevant by construction).
- **Korean Test:** no column-name literal, no language string, no per-tenant map. If M2 is implemented, the discriminator is a semantic/intent property the code derives; the LLM may emit a hint but code guarantees (Decision 158).
- **Behavior preservation (DD-7):** existing successful binds are unchanged — BCL's bindings, and Meridian's 9 already-binding component bindings, bind identically.

Commit:
```
cd /Users/AndrewAfrica/spm-platform
git add <the convergence file(s) actually edited — listed from §3A reads>
git commit -m "HF-287 Phase 1: order-independent binding determinism [+ intent discriminator if required]"
```

### §3C — Phase 2: proof gate (Rule 7 — live evidence; R3 re-prove)

| # | Proof | Pass criterion |
|---|---|---|
| 1 | **Meridian binds complete on `8affd52c`** | Convergence binds 10/10 component bindings; HF-281 does NOT abort; `cargas_totales_hub [coordinador]` binds. Paste the convergence log showing 10/10 + the bound column. |
| 2 | **Meridian calculates** | The calc completes all three periods (Jan/Feb/Mar 2025), `resolutionFailures=[none]`. **Paste the calculated totals verbatim — do NOT assert pass/fail; the architect reconciles against held targets.** |
| 3 | **Order-independence** | Re-run convergence with component order permuted (or demonstrate by construction the verdict is order-invariant). Same 10/10 result. Paste evidence. |
| 4 | **BCL behavior preserved (R3)** | Re-run BCL convergence + calc. Paste BCL's calculated total verbatim and `resolutionFailures` — architect reconciles. BCL bindings unchanged. |
| 5 | **Korean Test** | Paste the disambiguation code; confirm by inspection zero column-name literals / language strings / per-tenant lookups in the fix. |
| 6 | **Build** | `rm -rf web/.next && cd web && npm run build` exit 0; `npx tsc --noEmit` 0 errors; `localhost:3000` 200. |

Proofs 2 and 4 are reported as **pasted calculated values only** — CC makes no reconciliation claim (channel separation). The architect compares to targets.

---

## §4 — Reporting discipline

Completion report `docs/completion-reports/HF-287_COMPLETION_REPORT.md` (Rules 25-28):
1. **SHAs** — phase commits + merge.
2. **§3A score capture** — pasted per-variant scores; the M1-alone vs M1+M2 decision they drove.
3. **§2 decision** — which mechanism(s) shipped, justified by the §3A scores; Anti-Pattern Registry PASS/FAIL.
4. **§3B** — pasted final state of the edited convergence code.
5. **§3C proof** — all six, with pasted evidence; proofs 2 & 4 as pasted calculated values only (no pass claim).
6. **Korean Test attestation** — the inspected disambiguation, zero hardcoded literals.
7. **Residuals** — anything observed and deliberately not fixed (e.g. if M2 deferred).
8. **ARTIFACT SYNC** (SKILL.md completion-report contract):
```
ARTIFACT SYNC
MC: [HF-287 → status; new items discovered]
REGISTRY: [convergence-determinism capability row → evidence; Meridian status Δ]
R1: [Tier A engine-integrity criteria — Meridian re-verification status]
BOARD: [CAPS deltas]
SUBSTRATE: [entries exercised; ICA candidate — e.g. "binding must be generation-stable: relative/order-dependent gates are a latent-regression class"]
```

Final step (main protected):
```
cd /Users/AndrewAfrica/spm-platform
git push origin hf/287-convergence-binding-determinism
gh pr create --base main --head hf/287-convergence-binding-determinism \
  --title "HF-287: convergence binding determinism (Meridian regression fix)" \
  --body "Order-independent binding gate [+ intent discriminator if required]. Fixes the latent order-dependent HF-222 fallback fragility surfaced by Meridian clean-slate reimport (DIAG-068). Korean-Test-clean disambiguation; BCL re-proved; Meridian binds 10/10. Calculated values reported verbatim for architect reconciliation."
```

---

## §5 — HALT Conditions

- **HALT-0A — calc not reproducible** (§3A): cannot capture scores → STOP, do not author the fix blind.
- **HALT-1 — Korean Test violation forced:** if the only binding path requires a column-name literal / language string / per-tenant rule → STOP and escalate. Do NOT ship a hardcoded disambiguation. (This is the dominant risk of this HF.)
- **HALT-2 — BCL regresses:** if proof 4 shows BCL's bindings or calc change → STOP, the fix is not behavior-preserving (DD-7); report and do not merge.
- **HALT-3 — SQL/schema fabrication:** any SQL authored without schema verification → STOP (FP-49).
- **HALT-4 — scope expansion:** if the fix grows beyond the binding-determinism invariant (touching calc engine, intent interpretation beyond the discriminator hint, or other tenants' tuning) → STOP; that is not this HF.

---

## §6 — Out of Scope

- The HF-281 completeness invariant (it is correct — it caught the incomplete bind; do not weaken it).
- Plan interpretation / SCI classification (DIAG-068 eliminated both as the locus).
- The session-state pollers (HF-286, shipped).
- DS-028 experience layer.
- CRP (needs reimport; separate). BCL is CLOSED — touched here only as the re-prove behavior-preservation gate, not modified.
- Any reconciliation/ground-truth value in this directive.

---

## §6A — Residuals

- If §3A shows M1 alone binds and M2 is deferred: the intent-derived discriminator remains a robustness enhancement for future look-alike-cluster shapes — candidate follow-on, not this HF.
- The DIAG-068 honest-boundary read (per-variant score divergence) is captured by §3A and becomes part of this HF's evidence; no separate DIAG needed.
- Generation-stable binding is a Progressive-Performance prerequisite (same fingerprint must bind identically across encounters); ICA capture candidate per §4 ARTIFACT SYNC. The broader audit of other relative/order-dependent gates in convergence (if any beyond `distinctEnoughToBind`) is separate scope — flag any found during §3A reads, do not fix here.
