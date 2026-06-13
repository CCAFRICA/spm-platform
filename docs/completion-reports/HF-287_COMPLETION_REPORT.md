# HF-287 — Convergence Binding Determinism (Meridian Regression Fix) — COMPLETION REPORT

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-13 (CC, against `docs/vp-prompts/HF-287_*` directive)
**Diagnosed by:** `docs/diagnostics/DIAG-068_MERIDIAN_CONVERGENCE_REGRESSION_OUTPUT.md`
**Type:** HF — ships code. One convergence binding-gate change. No server route change, no SQL, no schema reference.
**Branch:** `hf/287-convergence-binding-determinism` → PR to `main` (branch-protected).
**Collision gate:** `ls docs/completion-reports/HF-287* docs/vp-prompts/HF-287*` → no completion-report match. CLEAR.

---

## 1 — SHAs

| Phase | SHA | Content |
|---|---|---|
| Base (main) | `3d0fe489` | DIAG-068 merge |
| Phase 1 | `344d194d` | order-independent AI-explicit recovery (the fix) |
| Phase 3 | `31432e3d` | proof artifacts (Phase-0 reproduction + Meridian/BCL verify harness) |
| Merge | _(on merge)_ | |

`web/src/lib/intelligence/convergence-service.ts | 40 insertions(+), 5 deletions(-)`

---

## 2 — §3A Phase-0 score capture (read before fixing)

Reproduced Meridian convergence on `8affd52c` via the real `convergeBindings` entry point (DB-driven; emits the same provenance signals a calc does), with temporary gate instrumentation. Captured distribution for the failing token:

```
[HF-287-PHASE0] Utilización de Flota (component_9, variant=coordinador) role=cargas_totales_hub
  token=cargas_totales_hub expectedRange=null n=9 top=0.1000 second=0.1000 stddev=0.0000 verdict=REJECT
  candidates=[Entregas_Tiempo:0.1, Entregas_Totales:0.1, Volumen_Rutas_Hub:0.1, Capacidad_Flota_Hub:0.1,
              Cumplimiento_Ingreso:0.1, Tasa_Utilizacion_Hub:0.1, Año:0.1, Cargas_Totales:0.1, Capacidad_Total:0.1]
```

**The scores are perfectly degenerate** — all 9 candidates at exactly `0.1000`, `stddev=0.0000`, so `top − second = 0 > stddev = 0` is false → REJECT. This is the `scoreColumnForRequirement` baseline floor (`:1918-1920`: `if (!requirement.expectedRange) return { score: 0.1 }`) — the fleet-ratio token is a raw reference field with no boundary constants, so every candidate ties at the floor. **No ordering of this candidate set can separate a winner — M1 in the fallback gate alone cannot rescue a degenerate tie.**

But the deeper capture relocated the root. The failing column `Cargas_Flota_Hub` was **absent from the candidate pool**, and a second instrumentation pass showed why:

```
[HF-287-PHASE0-CONTENTION] group=coordinador        columns claimed by >1 token: [["Cargas_Flota_Hub",["hub_loads_per_month","cargas_totales_hub"]]]
[HF-287-PHASE0-CONTENTION] group=coordinador-senior columns claimed by >1 token: []

# the binding trace:
HF-112 component_4 (coordinador-senior): cargas_totales_hub → Cargas_Flota_Hub   (AI-mapping, mp=1)   ✓ complete
HF-112 component_9 (coordinador):        capacidad_total_hub → Capacidad_Flota_Hub (AI-mapping)
                                         cargas_totales_hub  → (excluded) → fallback → REJECT          ✗ missing
```

**Established root (not assumed):** the coordinador variant's AI mapping legitimately maps **two** tokens — `hub_loads_per_month` and `cargas_totales_hub` — to the **same** physical column `Cargas_Flota_Hub`. The one-column-once exclusion (HF-243/HF-253) lets the first-processed token claim it and forces `cargas_totales_hub` onto the degenerate fallback above → unbound → HF-281 abort. The senior variant has no such contention (`hub_route_volume → Volumen_Rutas_Hub`, distinct), so component_4 binds cleanly. The defect is **order-dependent** (whichever token processes first wins), hence generation-sensitive — the clean-slate reimport's token vocabulary (`hub_loads_per_month`) landed the contention on the coordinador variant this generation; a prior generation landed it on the senior variant (DIAG-068's inversion).

The AI mapping itself is **consistent** across variants (both groups map `cargas_totales_hub → Cargas_Flota_Hub`), so the defect is neither AI inconsistency nor the fallback threshold per se — it is the **exclusion guard vetoing a legitimate multi-token→one-column mapping**.

---

## 3 — §2 Architecture Decision (Design Gate)

**Decision: M1 (order-independent binding determinism), realized as an AI-explicit recovery at the fallback-failure point. M2 NOT required; M3 not used.**

Justified by §3A: the scores are degenerate (so no fallback-threshold tweak or ordering rescues the tie — the directive's M1-in-the-fallback-gate framing would not bind), **and** the AI already correctly recognizes the right column (`cargas_totales_hub → Cargas_Flota_Hub`) — so no intent-derived discriminator (M2) is needed. The fix honors that existing recognition deterministically: when a token's boundary fallback fails, bind the AI's explicit per-token column even if an earlier token in the same variant group already claimed it (a single physical column may satisfy multiple AI-mapped tokens). This makes the bind **order-independent** — whichever contending token is processed first, the other recovers — closing the generation-sensitivity.

**Anti-Pattern Registry: PASS.** One general invariant (explicit AI recognition is honored over the speculative one-column-once guard when the alternative is an unbound token); not a Meridian special-case (no `cargas`/`hub`/tenant literal); no enumerated-shape patch; preserves existing binds (DD-7, proven below).

---

## 4 — §3B The fix (as committed, `convergence-service.ts`)

Replaces the prior `else if (candidates.length > 0) { gap-log } else { HF-272 marker }` failure structure with a recovery-first structure. The boundary-distinct bind (match_pass 3) and the HF-272 no-real-column marker are unchanged; the recovery is inserted ahead of them:

```ts
      } else {
        // HF-287: order-independent AI-explicit recovery. The boundary fallback could not
        // distinctly bind (degenerate look-alike cluster, or no candidate). BEFORE surfacing a
        // gap/marker, honor the AI's EXPLICIT per-token recognition: the AI may have deliberately
        // mapped THIS token to a real column that an EARLIER token in this same variant group
        // already claimed (intra-group column contention — DIAG-068/HF-287 root cause). The
        // one-column-once guard on the AI-mapping path above is a speculative-reuse guard, not a
        // veto over explicit recognition: a single physical column may legitimately satisfy
        // multiple AI-mapped tokens (e.g. a loads column read by both a monthly-loads metric and a
        // fleet-utilization ratio numerator). Binding here makes the result ORDER-INDEPENDENT —
        // whichever contending token is processed first, the other recovers its AI-recognized
        // column — closing the generation-sensitivity that flipped which variant aborted across
        // re-imports. DD-7: this fires ONLY on the fallback-failure (would-be-unbound) path; every
        // currently-binding token binds above and never reaches here. Decision 158 / Korean Test:
        // binds the AI's structural per-token choice (no column-name literal, no language string).
        const aiProposed = aiMapping[req.metricField];
        const aiCol = typeof aiProposed === 'string' ? aiProposed : aiProposed?.column;
        const aiMc = aiCol ? measureColumns.find(c => c.name === aiCol) : undefined;
        const aiNullRate = aiCol ? (individualNullRates.get(aiCol) ?? 0) : 1;
        if (aiMc && aiNullRate < 1) {
          const { scaleFactor } = scoreColumnForRequirement(aiMc.name, aiMc.stats, req);
          const aiFilters = typeof aiProposed === 'object' && aiProposed !== null && Array.isArray(aiProposed.filters) ? aiProposed.filters : [];
          bindings[compKey][req.role] = {
            column: aiMc.name,
            field_identity: aiMc.fi,
            match_pass: 2,  // AI-explicit recovery (recognized, not independently boundary-distinct)
            confidence: 0.6 * (1 - aiNullRate),
            scale_factor: scaleFactor !== 1 ? scaleFactor : undefined,
            learning_provenance: { batch_id: aiMc.batchId, learned_at: new Date().toISOString() },
            filters: aiFilters,
          };
          boundColumnToField.set(aiMc.name, req.metricField);
          console.log(`[Convergence] HF-287 ${comp.name}:${req.role} → ${aiMc.name} (AI-explicit recovery over intra-group contention; nullRate=${aiNullRate.toFixed(2)})`);
        } else if (candidates.length > 0) {
          // Ambiguous: real columns exist but none distinctly THE match, and the AI made no
          // viable explicit proposal. Decision 108 / §6A territory.
          console.log(`[Convergence] HF-222: ${comp.name}:${req.role}: candidate distribution insufficient to bind (top=${candidates[0].score.toFixed(4)}, n=${candidates.length}); surfacing as convergence gap.`);
        } else {
          // HF-272 no-real-column marker (unchanged)
          ...
        }
      }
```

The Phase-0 temporary instrumentation was removed in this commit (verified: `grep HF-287-PHASE0` → none).

---

## 5 — §3C Proof gate

### Proof 1 — Meridian binds complete on `8affd52c` ✓
Real `convergeBindings` reproduction, post-fix:
```
HF-287 Utilización de Flota:cargas_totales_hub → Cargas_Flota_Hub (AI-explicit recovery over intra-group contention; nullRate=0.00)
component_9: cargas_totales_hub→Cargas_Flota_Hub(mp=2)  capacidad_total_hub→Capacidad_Flota_Hub(mp=1)  entity_identifier→No_Empleado(mp=1)  period→Mes(mp=1)
total component bindings: 10
HF-281 completeness check (findIncompleteBindings): COMPLETE — all components map their required tokens (calc would proceed).
```
`cargas_totales_hub [coordinador]` binds → `Cargas_Flota_Hub` (mp=2). 10/10 complete; HF-281 does **not** abort.

### Proof 3 — Order-independence ✓ (by construction + deterministic re-run)
Within the coordinador group, `hub_loads_per_month` and `cargas_totales_hub` both map to `Cargas_Flota_Hub`. Whichever is processed first binds via AI-mapping (mp=1); the other reaches the fallback-failure and binds via the HF-287 recovery (mp=2). **No ordering leaves either token unbound** — the COMPLETE outcome is invariant to processing order. The reproduction harness yields COMPLETE deterministically across repeated runs (`distinctEnoughToBind` and the recovery are pure functions of the same DB inputs).

### Proof 4 — BCL behavior preserved (R3 / DD-7) ✓ — HALT-2 cleared
`web/scripts/diag/hf287-verify.ts` runs both tenants' convergence and reports whether the HF-287 path fired:
```
================ Meridian (fix target) ================
  component bindings: 10   completeness: COMPLETE (calc proceeds)   HF-287 recovery fired: YES ×1
================ BCL (DD-7 gate) ================
  component bindings: 8    completeness: COMPLETE (calc proceeds)   HF-287 recovery fired: NO (binding path byte-identical to pre-fix)
```
BCL produces 8/8 complete bindings with the **HF-287 recovery path not taken** — the fix's only behavioral branch never executes for BCL, so BCL's bindings are byte-identical to pre-fix, hence BCL's calc is unchanged. (BCL's live rule_set is `54fe1094-89fc-4ea9-a439-14ce44af3911`; the old scripts' `b1c20001…` id is stale.)

### Proof 5 — Korean Test ✓ (inspection)
The recovery binds `aiMapping[req.metricField]` — the AI's structural per-token recognition (Decision 158: AI recognizes, code guarantees). The fix contains **zero column-name literals, zero language-specific strings, and no per-tenant lookup** — `grep -iE "cargas|flota|hub|coordinador|meridian"` over the diff returns nothing. The disambiguation survives a Korean tenant uploading the same shape with Hangul column names, because the AI does the cross-language recognition and the code only honors its explicit per-token choice.

### Proof 6 — Build ✓
`rm -rf web/.next && npm run build` → `✓ Compiled successfully` (exit 0); `npx tsc --noEmit` → 0 errors. (The build log's `Dynamic server usage` lines are pre-existing static-prerender notices on unrelated routes; none reference `convergence-service.ts`.)

### Proof 2 / Proof 4-calc — calculated values for architect reconciliation — DEFERRED to the authenticated app
The full per-period calc-number run (Meridian Jan/Feb/Mar 2025; BCL re-prove) executes through `/api/calculation/run`, which is **auth-gated** (`middleware.ts` PUBLIC_PATHS excludes it), and `runCalculation` is wired to the browser/anon Supabase client — neither is drivable headlessly from a script, and the auth gate must not be bypassed (HALT-discipline, consistent with the HF-286 boundary). The binding-layer proofs above are decisive for the fix itself: Meridian now binds **10/10 complete** (the abort is removed, so the calc proceeds) and BCL is **byte-identical**. The verbatim calc-number reconciliation against architect-held targets (channel separation — CC reports numbers, architect reconciles) runs in the authenticated app via the normal flow; `hf287-verify.ts` reproduces the binding gate on demand. **This is the one honest boundary of this HF — no calc numbers are asserted here.**

---

## 6 — Korean Test attestation

The fix's disambiguation is `bindings[compKey][req.role] = { column: aiMc.name, ... }` where `aiMc = measureColumns.find(c => c.name === aiMapping[req.metricField])`. The decision to honor it is purely structural: *the boundary fallback failed AND the AI explicitly proposed a real, non-100%-null column for this token.* No field-name string, no language token, no tenant id appears in the fix. PASS.

---

## 7 — Residuals
- **M2 (intent-derived expected-range / discriminator for ratio tokens) deferred.** Not needed for Meridian (the AI already recognizes the correct column). It remains a robustness enhancement so future degenerate look-alike clusters bind on the boundary path without relying on the AI-explicit recovery — candidate follow-on, not this HF.
- **Calc-number reconciliation (proofs 2 & 4-calc)** runs in the authenticated app (above). The binding-completeness + DD-7 proofs are the CC-side gate; the architect's R3 number reconciliation is the remaining step.
- **Broader audit of other relative/order-dependent gates** in convergence (beyond this AI-mapping contention) — flagged in DIAG-068 §6A as separate scope; none fixed here.
- The HF-281 completeness invariant is untouched (correct — it caught the incomplete bind).

---

## 8 — ARTIFACT SYNC
```
ARTIFACT SYNC
MC: HF-287 → CODE-COMPLETE, PR-open. Order-independent AI-explicit recovery closes the
    intra-variant-group column-contention defect (DIAG-068). Meridian binds 10/10; BCL byte-identical.
    Open: architect R3 calc-number reconciliation (auth-gated app).
REGISTRY: + convergence-determinism capability — "a physical column may satisfy multiple AI-mapped
    tokens; binding is order-independent (the contended token recovers via explicit AI recognition)".
    Evidence: hf287-phase0-repro.ts (root capture), hf287-verify.ts (Meridian 10/10 + BCL no-op).
    Meridian status Δ: abort → binds complete.
R1: Tier-A engine integrity — Meridian convergence no longer aborts; binding completeness restored.
    Number reconciliation pending (architect, authenticated app).
BOARD: CAPS — Intelligence + (deterministic generation-stable binding); Performance/Acceleration unchanged.
SUBSTRATE: exercised — generateAllComponentBindings AI-mapping + boundary-fallback paths, the
    one-column-once exclusion, scoreColumnForRequirement baseline floor. ICA capture candidate:
    "binding must be generation-stable — a relative/order-dependent gate (or a one-column-once guard
    that vetoes legitimate multi-token→one-column AI mappings) is a latent-regression class:
    same fingerprint must bind identically across encounters."
```

*End HF-287 completion report. Code-complete; binding-layer proofs decisive; PR open against `main`.*
