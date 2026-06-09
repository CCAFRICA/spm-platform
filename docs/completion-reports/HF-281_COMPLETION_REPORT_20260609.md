# HF-281 Completion Report — Convergence Binding Completeness

**Date:** 2026-06-09
**Branch:** `hf-281-binding-completeness` (from `main` @ 8e887370, the HF-280 merge)
**Builds on:** HF-279, HF-280 (both merged)
**Status:** Implemented + deterministic verification PASS + build/dev PASS. **Post-merge re-bind/re-import (SR-44) is the outstanding production gate — see §7.**

---

## 1. Phase 0 — Reads (pasted) + cause determination

### 0.1 / 0.2 Where bindings are assembled and what "required tokens" are
Convergence lives in `web/src/lib/intelligence/convergence-service.ts` (not the directive's assumed `web/src/lib/convergence/`). `generateAllComponentBindings` (line 2580) groups matches by structural `variantId` (HF-253, line 2722), then **per variant group** requests one AI column mapping (`resolveColumnMappingsViaAI`) and assembles bindings. For each component, `extractInputRequirements(comp)` (line 1640) derives required tokens by walking the intent DAG for reference fields (`extractReferencesFromDAG`) — `role = metricField = field`. This IS the structural `requiredTokens` source. Per token, a binding entry `bindings[component_<index>][role]` is written only when a column is **proposed-and-validated** (2812) or **boundary-distinct** (2866).

### 0.3 The silent gap — HF-112/HF-222 validation can leave a token unmapped
Three terminal paths per token: validated → writes entry; HF-272 no-column → writes a `match_pass:'failed'` marker entry; **HF-222 ambiguous (line 2881–2886) → writes NOTHING ("today's silent behavior for the ambiguous case is unchanged — no marker written")**. A token on the silent path leaves no binding entry at all.

### 0.4 HF-165 reuse gate + invalidation
`run/route.ts:255` runs calc-time convergence only when bindings are empty/stale (`!hasMetricDerivations && !hasConvergenceBindings || !bindingsAreCurrent`); otherwise it **reuses** persisted bindings (line 311–312, "already populated — skipping convergence"). HF-269 Phase C clears `input_bindings` on import (execute-bulk:385–397), so cause (c) [stale bindings from a prior generation] is already mitigated. Convergence failure is currently caught **non-blocking** (307–310) — calc proceeds regardless.

### 0.5 DB evidence — cause determination (`scripts/hf281-phase0-evidence.ts`, rule_set be74de80)
```
convergence_version=HF-234   (current — bindings freshly derived, not stale)
component_4 [coordinador-senior] "Utilización de Flota": roles=[period, entity_identifier]   <- MISSING both tokens (no entry, not even a failed marker -> silent ambiguous path)
component_9 [coordinador]        "Utilización de Flota": roles=[period, entity_identifier,
                                  cargas_totales_hub->Cargas_Flota_Hub[mp=1],
                                  capacidad_total_hub->Capacidad_Flota_Hub[mp=1]]            <- COMPLETE
Both components' intents require IDENTICAL tokens: [cargas_totales_hub, capacidad_total_hub].
```
**Cause = (b)** validated-partial / silent-gap mapping. Intent requirements identical across both groups → **rules out (a)**. `convergence_version=HF-234` (fresh) → **rules out (c)**.
**HALT-1 cleared** — no completeness gate exists at the binding phase; the incomplete binding persisted and calc ran. **HALT-2 cleared** — not cause (c); the binding phase ran. So **§2.3 (binding invalidation on supersede) is NOT in scope**; §2.4's retry surface is optional (the AI mapping is one-shot per group, no retry loop at that seam). The completeness **gate** is the fix.

---

## 2. ADR
`docs/completion-reports/HF-281_ADR.md` (68483e64). Invariant: a component binding is complete only if it maps every intent-required token; any incomplete binding fails the binding phase; calc never runs against it. Options B (flagged-zero calc sufficient), C (per-cause handling), D (silent auto-repair) rejected.

---

## 3. Implementation (diffs by file)

| File | Change |
|---|---|
| `convergence-service.ts` | **2.1** Pure exported `findIncompleteBindings(componentsJson, convergenceBindings)`, `requiredTokensForComponent(component)`, `mappedTokensForBinding(binding)` + `IncompleteBinding`. Predicate: `requiredTokens(intent DAG refs) ⊆ mappedTokens(binding roles with a resolved real column — non-empty column AND match_pass !== 'failed')`. Uses the same `extractComponents`/`extractInputRequirements` the binding assembly uses, so the `component_<index>` keying aligns exactly (flattened-across-variants index). |
| `calc/run/route.ts` | **2.2** The HF-165 block now gates calc. Fresh path: an incomplete binding set is **not persisted** (`&& incompleteBindings.length === 0` on the persist). Reuse path: a previously-persisted incomplete set is **re-validated**. After the block, a phase gate returns **HTTP 422** with a structured error naming variant group + component + missing tokens through the route's existing `{error, log}` channel; **calc never runs**. Scoped to the `convergence_bindings` path (computed only when `bindingCount > 0` / `hasConvergenceBindings`) — the legacy `metric_derivations` path is untouched. |

**Korean Test / AUD-009:** the predicate is `requiredTokens ⊆ mappedTokens` — structure only; no field/component/tenant literals, no token-name patterns, no enumeration of *why* a token is unmapped (silent-gap, failed-marker, requirements-omitted all incomplete identically). Names are display data in the message.
**Atomicity / Vertical Slice:** incomplete ⇒ nothing persists to `input_bindings`, calc aborts; the 422 + `log` surfaces through the run route's existing failure channel (operator-visible), no new chrome.
**DD-7:** the calc-time T3 RESOLUTION_FAILURE surface is retained (backstop for bind-vs-calc data drift); every currently-reconciling (complete) binding behaves identically; legacy `metric_derivations` plans untouched.

---

## 4. Deterministic Verification (pre-PR) — PASS

`node --test --import tsx src/lib/intelligence/__tests__/binding-completeness.test.ts` → **7/7 pass**.

| Test | Asserts | Result |
|---|---|---|
| Missing-token (Meridian senior-c4 shape) | `findIncompleteBindings` flags exactly `component_0` (senior), names `Utilización de Flota`, variant `coordinador-senior`, missing `[capacidad_total_hub, cargas_totales_hub]`; the complete sibling not flagged | PASS |
| All complete | returns `[]` (DD-7) | PASS |
| `match_pass:'failed'` marker | counts as unmapped → flagged with that one missing token | PASS |
| `mappedTokensForBinding` | excludes empty-column and failed entries | PASS |
| requiredTokens — constructed ratio | `[capacidad_total_hub, cargas_totales_hub]` from `divide(a,b)` | PASS |
| requiredTokens — single pre-computed metric | `[on_time_delivery_percentage]` | PASS |
| requiredTokens — multi-field DAG | `[actual_income, hub_route_volume, target_income]` | PASS |

§3C mapping: test 1 = phase fails + names group/component/token (the route discards the unpersisted fresh set and returns 422 — nothing written); test 2 = all-complete identical (DD-7); test 3 = requiredTokens from intent structure for all three shapes, no literals.

**Regression:** HF-279 construction (17) + HF-280 atomicity (7) + adapter normalization (11) + HF-281 (7) = **42/42 pass**.
**Korean-test gate:** PASS. **Build (HALT-0):** `rm -rf .next && npm run build` → `✓ Compiled successfully`. **Dev:** `localhost:3000 → HTTP 307`.

---

## 5. Scope
HF-279/HF-280 surfaces untouched. Calc-time T3 RESOLUTION_FAILURE retained as backstop. §2.3 (binding invalidation) out of scope (not cause c). NULL-entity_id committed_data rows (Meridian 36 / BCL 510) out of scope.

## 6. Files changed
```
web/src/lib/intelligence/convergence-service.ts            +82  (2.1 predicate)
web/src/app/api/calculation/run/route.ts                   +50/-2 (2.2 phase gate)
web/src/lib/intelligence/__tests__/binding-completeness.test.ts +115 (Phase 3 tests)
web/scripts/hf281-phase0-evidence.ts                              (Phase 0.5 evidence, read-only)
```

---

## 7. Post-merge production gate — Re-bind / re-import (SR-44, OUTSTANDING)
Requires the architect channel (live tenants + LLM mapping + Supabase) — not executed here (no live-tenant claim; AP-20 honored). On re-bind, the senior group's mapping must either resolve both Utilización tokens (→ exact reconciliation) or the binding phase fails loudly with the missing tokens named — never silent zeros.
1. Re-bind/cold re-import **Meridian** → senior c4 binding carries both tokens → Jan/Feb/Mar **185,063 / 175,585 / 196,337** exact, `resolutionFailures=[none]`; OR a loud 422 naming `Utilización de Flota [variant coordinador-senior]: missing cargas_totales_hub, capacidad_total_hub`.
2. **BCL** (still outstanding from HF-280) → ejecutivo carries Captación → Oct/Nov/Dec c1 **10,170 / 12,530 / 18,140**; grands **44,590 / 46,291 / 61,986**.
3. Bindings SQL: every component binding of both rule_sets carries its intent-required tokens — `scripts/hf281-phase0-evidence.ts`.
4. Second Meridian import → fingerprint match, non-amnesiac.

**§6A residual:** if the senior-group mapping genuinely cannot be produced (column ambiguity in the tenant file), the binding phase now fails loudly with the missing tokens named — a dispositionable surface, not silent zeros. The cause of the senior/coordinador asymmetry (identical intent + columns, one group mapped, one didn't) is a convergence-mapping-quality item surfaced by — not fixed by — this gate.

## 8. Branch note
Per the HF-279/280 pattern: work on `hf-281-binding-completeness` off current `main`; PR `--base main`.

---
*HF-281 · Convergence Binding Completeness · vialuce.ai*
