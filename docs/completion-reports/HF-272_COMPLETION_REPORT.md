# HF-272 Completion Report (R2) — Restore the Unified Recognition→Construction Pathway

**Remove the interpretation-time field-resolution gate (subtraction) + land the hallucination-catch as a per-component convergence failure.**

- Branch: `dev`
- Baseline / Phase-1 SHA: `5fb6e45e8a4e20f6b251917bd6c2eef5ee4f52e0`
- Commits: `11c08cc0` (P2), `275f52b9` (P3), `a5eb4d71` (P4.3 proof)
- Status: **Phases 1–3 complete + committed; Phase 4.1 (build) PASS; Phase 4.3 (deterministic proof) PASS; Phase 4.2 (clean cold import of BCL + Meridian) PENDING — see §Phase 4.2.** PR not yet opened (gated on 4.2 evidence).

---

## Phase 1 — Currency confirmation (read-only)

HEAD = `5fb6e45e` (= the established baseline). All seven anchors re-confirmed present and unchanged in kind at this SHA:

| Anchor | Expected | Found |
|---|---|---|
| Gate membership rejection | 538–547 | `anchorSet.has` / `extractReferencesFromDAG(constructedTree)` / `throw new FieldResolutionError` at 542–545 ✓ |
| `requiredInputs` fallback | 206–217 | `Array.isArray(skeletonRaw.requiredInputs)` at 209 ✓ |
| Prompt hint render + enforcement prose | 1257–1270 | `AVAILABLE COMPREHENDED FIELDS` 1257/1267; "enforces membership and will reject" 1269 ✓ |
| HF-271 proofread | 548–578 | `collectDeclaredRatios(ci` 560 / `collectTwoFieldDivides(constructedTree` 570 ✓ |
| Convergence no-bind branch | 2753–2755 | `surfacing as convergence gap` 2754 ✓ |
| Convergence gap detection | 716–748 | `could not be derived` 729 / `No matching data type found` 741 ✓ |
| Calc swallow-catch | 301–304 | `should not prevent calculation attempt` 302 ✓ |
| Calc consumer | run-calculation.ts 256 | `export function evaluateComponent` 256 ✓ |

`FieldResolutionError`: def `compositional-intent.ts:240`, import `plan-orchestration.ts:35`, used only at 545/599. HALT-1a / HALT-1c remain cleared (established in the prior AUD); no structural drift → proceeded.

---

## Phase 2 — Subtraction (commit `11c08cc0`)

Removed the HF-270 interpretation-time field-resolution gate and its incomplete-enumeration anchor; restored the unified recognition pathway.

- **`plan-orchestration.ts`**: deleted the post-`constructTree` membership rejection (the `anchorSet`/`extractReferencesFromDAG`/`FieldResolutionError` block, 538–547) and its `cognition_violation` routing (599–606); removed the `requiredInputs` fallback so `fieldAnchor` is the HC-of-data-sheets set **or empty** (no declared-list fallback); dropped the now-dead `FieldResolutionError` + `extractReferencesFromDAG` imports; updated stale comments.
- **`anthropic-adapter.ts`**: reframed the field block as **informational context that does NOT constrain naming**; stripped the defunct enforcement sentence ("a deterministic post-construction check enforces membership and will reject an unresolved reference"); block is ABSENT when no HC present.
- **`compositional-intent.ts`**: removed the now-dead `FieldResolutionError` class.
- **HF-271 proofread**: left untouched (helpers 413/431, asserts 542–558 post-edit).

**EPG (Korean Test / AUD-009):** (i) no membership-against-an-enumeration rejection remains at interpretation time; (ii) no `requiredInputs`-derived set feeds the gate or the prompt; (iii) the prompt no longer states enforcement and no longer constrains naming; (iv) HF-271 proofread intact. **String literals introduced:** reframed prompt prose only ("FOR CONTEXT, the imported data contains these columns …" + trailing guidance) and the log label "HF-272 field hint = …". Zero field names, zero synonyms.

---

## Phase 3 — Relocation: per-component convergence failure (commit `275f52b9`)

Architect disposition **Option 1** (per-component `failed`, no run abort, **data marker not thrown exception**).

- **`convergence-service.ts`**: added `resolutionFailure?: { token; reason: 'no_real_column_match'; candidatesConsidered }` to `ComponentBinding`. At the binding loop's **no-real-column branch** (the `else` after AI mapping proposed none AND boundary fallback had **zero** candidates) it now records the marker (no throw) instead of a silent no-bind. The ambiguous-candidates case (`candidates.length > 0` but not distinct) is **unchanged** (Decision 108 / §6A matching-quality territory — DD-7, no over-fire). Exported pure helper `findComponentResolutionFailure(compBindings)`.
- **`run-calculation.ts`**: added `status?: 'failed'` + `resolutionFailure?` to `ComponentResult`; `evaluateComponent` gained an optional `resolutionFailure` param and short-circuits to a loud `failed` result when supplied.
- **`run/route.ts` (LIVE intent-engine path)**: imports `findComponentResolutionFailure`; reads the marker per component; on a marker → empty metrics + marks the `componentResult` `failed` (status + named token in `details`); surfaces distinctly in the `[CalcRecon-T1]` footer (`resolutionFailures=[…]`) and a per-run `[CalcRecon-T3] RESOLUTION_FAILURE …` line. The run **continues**; other components compute. The swallow-catch (301–304) is **left intact** — the marker is data, not a throw, so it flows regardless (Phase 3.4).

**Consumer discrepancy (flagged):** the directive baseline named `evaluateComponent` (run-calculation.ts) as the calc consumer, but the **live** API path is the `run/route.ts` intent engine (`executeIntent`); `runCalculation`/`evaluateComponent` is dead for the API (only a page.tsx comment references it). The failure was therefore landed in the **live path** AND in `evaluateComponent` (for path-consistency + the deterministic proof). Without this, the relocation would have landed in a dead path (a silent half-measure, SR-34).

**EPG (Korean Test / AUD-009 / HALT-3):** the failure fires on "no real column matched" (compared against `measureColumns` — the real columns convergence evaluated), **never** against `requiredInputs`/any declared/enumerated list; it is **per-component** (no run abort — no throw, swallow-catch untouched); a real-column-mapped token binds and `continue`s, never reaching the marker (no over-fire). **Literals introduced:** `resolutionFailure`, `'no_real_column_match'`, `status:'failed'`, the field_identity sentinel (`'unknown'`/`'unresolved'`), and log/detail text (`RESOLUTION_FAILURE`, `resolutionFailures`, `failed`, `reason`, `unresolvedToken`, `resolutionReason`). No field names, no synonyms, no enumerated sets. **HALT-3 not triggered.**

---

## Phase 4

### 4.1 — Build gate — **PASS**
`pkill next dev → rm -rf .next → npm run build` →
```
> bash scripts/verify-korean-test.sh
[korean-test-gate] PASS: zero hardcoded legacy primitive-name string literals outside registry
 ✓ Compiled successfully
```
(remaining output is pre-existing ESLint warnings only — no errors). `npm run dev` → `✓ Ready in 1417ms`, `http://localhost:3000` → HTTP 307 (auth redirect). `npx tsc --noEmit` → exit 0.

### 4.3 — Deterministic enforcement proof — **PASS (7/7)**
`scripts/hf272-resolution-check.ts` (commit `a5eb4d71`) — exercises the **real** `findComponentResolutionFailure` + `evaluateComponent` plus a verbatim mirror of the convergence bind-vs-marker branch:
```
PASS  A: no-real-column token writes a resolutionFailure marker — match_pass=failed token=meta_inexistente_xyz
PASS  B: real-column token writes a normal binding (NO marker) — no over-fire — match_pass=1 column=ventas_mes
PASS  A: findComponentResolutionFailure detects the marker — {"token":"meta_inexistente_xyz","reason":"no_real_column_match","candidatesConsidered":0}
PASS  B: findComponentResolutionFailure returns null (no marker)
PASS  A: surfaces as LOUD per-component `failed` (status + named token), NOT silent $0 — status=failed token=meta_inexistente_xyz payout=0 details.failed=true
PASS  B: computes normally — NOT failed, no resolutionFailure (no over-fire) — status=(none) payout=0
PASS  NO-ABORT: both components produced a result (A failed did not abort B) — [compA:failed, compB:ok]
PROOF: 7/7 assertions pass, 0 fail.
```
This is the positive proof of the loud-failure surface (point i) and the no-over-fire boundary (point ii), including no-abort co-evaluation.

### 4.2 — Clean cold import (BCL + Meridian, all periods) — **PENDING**
This gate requires a destructive live operation against the shared Supabase database (clean-slate wipe **including** `structural_fingerprints`, re-import BCL + Meridian plan+data, recalculate every period) per the architect's clean-slate procedure and with the import files staged. It mutates shared state and is framed as the architect's procedure; it is **not** self-attested here. Awaiting architect direction (run it + paste logs, or authorize/point me at the specific clean-slate + import scripts and files). The per-tenant per-period `[CalcRecon-T1]` footers, `HF-114 AI mapping` lines, `[plan-orchestrator]` field-hint lines, and any `resolutionFailures=[…]` will be pasted verbatim here once run.

### 4.4 / 4.5 / SR-38 / PR — **PENDING** (gated on 4.2)

---

## §6 / §6A adherence
HF-271 proofread KEPT untouched; HC-of-data-sheets prompt hint KEPT (now informational); `constructTree` unchanged; convergence matching algorithm unchanged except the Phase-3 marker; `structural_fingerprints` flywheel not modified; rounding regression out of scope. Plan-only-before-data now fails loud (was silent) — correct per §6A.
