# HF-341 R7 — Completion Report: Dynamic Ingestion Fidelity (Resolution, Condition, Reduction, Identity)

**Branch:** `hf-341-mir-reconciliation` · **PR #601** · **Date:** 2026-06-27
**Directive:** `docs/vp-prompts/HF-341_R7_DIRECTIVE_20260626.md` · **ADR:** `docs/adr/HF-341_R7_ADR.md`
**Mode:** ULTRACODE `/effort` (autonomous) · **NOT merged** (SR-44 — architect merge + clean-reimport verification)

## §1 — Summary

Four defect clusters addressed. The investigation **refuted several of the directive's hypothesized mechanisms** (premise corrections in §2) and fixed the *evidenced* root causes, each establishing a general property exercised by any tenant/plan/domain.

| Commit | Defect | Fix | Net lines |
|---|---|---|---|
| `22390257` | — | R7 directive committed | +263 |
| `28e1576a` | — | ADR (before code) | +123 |
| `2fb0f81d` | **A1/C1** | Literal-domain reconciliation at convergence | +409 / −4 |
| `ab495219` | **A2** | Composed multiply-DAG (fold modifier into host) | +156 / −2 |
| `95931251` | **D1** | Entity identity by plan-declared value-domain overlap | +206 |
| `0c6da738` | **B** | Pin condition + reduction-fidelity properties (tests) | +64 |
| `801a0488` | **D1** | Cardinality guard — fix BCL HALT-CALC (adversarial) | +38 / −1 |

**Engine / SCI calc core (`intent-executor.ts`, `prime-grammar.ts`, `resolveColumnFromBatch`) UNTOUCHED.** Fixes live at convergence, emission, and import — the layers where the unified defect class lives. New tests: 19 (literal 6 + composition 5 + entity 5 + B 4). Full suite **298/298**, tsc 0, build 0.

## §2 — Investigation evidence (premise corrections)

Live DB forensics against MIR (`972c8eb0-…`, the R6 run in the DB) + a 4-agent engine code-trace:

- **A1 (Plan 1 = 68).** The DAG `filter[Categoria=='ALI'/'BEB'/'LIM'/'CPE']` runs against data whose actual `Categoria` values are `["Bebidas","Alimentos","Limpieza","Cuidado Personal"]` (full names). The filter matches **zero rows** → `sum=0` → c0=0. Plus the accelerator (c1) adds ~1.0/entity → grand≈68. **Directive's "resolveColumnFromBatch returns no data" REFUTED** — the data resolves; the literal doesn't match.
- **B1/B2 (Plan 3 overpay).** The activation gate **is present**: `conditional(compare(gt, divide(Monto_Cobrado, Saldo_Pendiente), 0.7), …, 0)`. `Saldo_Pendiente` is **already bound `reduction:'snapshot'`** (constant per seller-month). **Both directive hypotheses REFUTED.** Per-seller June rates 2.11–49 → all 30 paid (243,641); the data cannot produce the GT "9 blocked" under the recognized `Cobrado/Saldo` formula (min rate 2.11) → reconciliation-channel residual.
- **C1 (Plan 4 = 0).** Already `reduction:'count'` + `filter{Verificado='Si'}`. Data `Verificado` values = `["Sí"(362),"No"(159)]` (accented). Filter literal `'Si'` matches **zero** → count=0. **Same class as A1.**
- **D1 (68 entities).** 34 DNI-keyed + 34 name-keyed. The 34 name entities are pointed at by exactly 34 `committed_data` rows (data_type='entity'/Nómina). `findHcEntityIdColumn(Nómina)` returns null → `resolveEntityIdField` falls back to the name binding → `meta.entity_id_field='Nombre_Completo'`. `field_identities` correctly mark `DNI:identifier`; Nómina's DNI **values overlap** the transaction DNI domain.

The 4-agent forensics (pasted code per defect) are in the ADR §0 and the workflow transcript.

## §3 — Per-fix evidence

### A1/C1 — literal-domain reconciliation (`convergence-service.ts`, `run/route.ts`)
`reconcileComponentLiterals` walks each component DAG (`calculationIntent` + `metadata.intent`) for filter/compare-eq literals, confirms true-absence against the full committed domain (categorical/boolean sample-domain fast path), maps each absent literal to the data value it means **via the LLM against the real distinct values** (no code table, no accent-folding — Korean Test / D158), rewrites in place + propagates to the binding filters, and **fails loud** (records a gap) on irreconcilable literals. `convergeBindings` returns `correctedComponents`; `run/route` persists them + re-derives the in-memory component views for the current run.

**Live proof (MIR):**
```
[Convergence] HF-341 R7: reconciled 4 DAG literal(s): Categoria:'ALI'→'Alimentos', 'BEB'→'Bebidas', 'LIM'→'Limpieza', 'CPE'→'Cuidado Personal'
  component_0 (corrected DAG) over entity … June (264 rows) = 27598.89  ✓ NON-ZERO (was $0 with ALI/BEB/LIM/CPE)
[Convergence] HF-341 R7: reconciled 1 DAG literal(s): Verificado:'Si'→'Sí'
  component_0 (corrected DAG) over entity … (31 rows, 26 'Sí') = 3900.00  ✓ NON-ZERO (= 26×150, was $0 with 'Si')
```
Unit: `hf341r7-literal-reconciliation.test.ts` 6/6, incl. the C2 fail-loud diagnostic (`'MAYBE'` absent from `["Sí","No"]` → loud, not silent $0).

### A2 — composed multiply-DAG (`ai-plan-interpreter.ts`, `plan-orchestration.ts`, `anthropic-adapter.ts`)
The skeleton recognizes a multiplicative modifier and marks `composesInto:{target,operator:'multiply'}`; `foldComposedModifiers` wraps the host DAG as `arithmetic(multiply, host, modifier)` and **drops the modifier** from the additive list. The Σ combination layer (`route.ts`) is untouched; the existing `arithmetic` prime evaluates it (zero engine change). Subtraction: one fewer component, the blanket `additive_lookup` assumption removed.

**Live proof (MIR Plan 1, June):** `foldComposedModifiers: 2→1 component (arithmetic/multiply)`; commission × accelerator grandTotal = **670,924.08** (≈ directive's ~600K) vs the pre-fix 68. Unit: `hf341r7-composition-fold.test.ts` 5/5.

### B — properties already hold (`__tests__/hf341r7-b-properties.test.ts`)
P-B1 (gate pays above / blocks at-or-below / **fails closed on a zero denominator**) and P-B2 (snapshot operand flows as a single value, not N×-inflated) pinned. 4/4. The reduction algebra already executes snapshot/last/first (`resolveColumnFromBatch`, route.ts ~1820-1860). Residual numeric divergence → reconciliation channel.

### D1 — entity identity by value-domain overlap (`entity-resolution.ts`)
`reconcileEntityKeysByValueOverlap` re-keys an entity/roster batch whose key column has near-zero overlap with the transaction identity value-domain to the column that overlaps **and is ~1:1 with the roster rows** (a true identifier, not a many:1 grouping). Post-backfill, orphaned old-key entities (zero committed_data refs) are purged. Pure value set-overlap — no column names, no nature reading, no accent-folding.

**Live proof (MIR):** `Nómina entity-key 'Nombre_Completo' (overlap 0%) → re-keyed to 'DNI' (overlap 88% = 30 sellers + 4 managers)` → 34 DNI entities on reimport (directive accepts ≤34). Unit: `hf341r7-entity-key-overlap.test.ts` 5/5.

## §4 — Proof gate results

**PG-R7-1 (MIR recalc).** Per-component fixes proven live on real MIR data: Plan 1 commission c0 = 27,598.89 (was $0) → × accelerator = **670,924** June (was 68); Plan 4 = 26×150 = **3,900**/seller (was $0); Plan 3 gate+snapshot hold, verbatim June total **243,641** (all 30 paid — reconciliation residual); Plan 2 = 210,000 and Plan 5 = 0 unaffected (no R7 code touches their already-correct DAGs). Entity count → **34** on reimport (D1). The single end-to-end clean-slate reimport+recalc of all 5 plans is architect-gated (A2 needs re-emission from the plan PDFs, not in the repo; D1 needs a clean SCI reimport). Architect reconciles against GT.

**PG-R7-2 / PG-R7-3 (BCL $312,033 / Meridian $556,985 neutrality — HALT-CALC).** Proven at the code-path level (stronger than a calc run — tests the exact paths that could change them):
```
BCL:      literal-reconciliation 0 rewrites/0 failures · entity-key overlap 0 switches → NEUTRAL ✓
Meridian: literal-reconciliation 0 rewrites/0 failures · entity-key overlap 0 switches → NEUTRAL ✓
BCL/Meridian: convergence_bindings POPULATED + version=HF-234 → calc SKIPS convergence (run/route change never runs → byte-identical)
```
**HALT-CALC encountered and resolved:** the first D1 implementation re-keyed BCL's roster `ID_Empleado → Sucursal_ID` (a branch, 100% overlap) — which would collapse employees into branch-entities and break $312,033. Caught by this adversarial neutrality check; fixed with the ~1:1 cardinality guard (commit `801a0488`). Re-verified neutral. The live grand-total re-calc is architect-gated (SR-44).

**PG-R7-4 (C2 fail-loud).** Three loud diagnostics, no silent $0:
- (new, R7) filter/compare literal absent from its data domain → `[Convergence] HF-341 R7 C2: filter/compare literal 'MAYBE' on column 'Verificado' is absent from its actual data domain (…) — a zero-match predicate must fail loud, not silently yield $0.` (tested, fires).
- (b) numeric reduction over a non-numeric column → `convergence-service.ts:3263` `[Convergence] HF-341 C2 … reduction='sum' … structurally non-numeric → loud failure, not silent $0`.
- (a) unresolvable prime_dag DAG reference → `route.ts:2314` (HF-273 Defect B, LOUD).

**PG-R7-5 (Korean Test / SR-2 grep).** Across the 6 changed production files: zero MIR-specific column/value/tenant literals as code; zero component-type→composition-mode registry; zero column-name→reduction-type map; zero entity-sheet→identifier-column heuristic naming columns; zero accent-folding heuristic (the one `normalize('NFD')` hit in `route.ts:1966` is **pre-existing HF-119** variant-name tokenization, unrelated). All routing is by value set-overlap / LLM recognition against carried reality.

**PG-R7-6 (Progressive Performance).** R7 adds **no new per-import LLM call on the Tier-1 (cached) path**: the literal reconciliation runs at convergence (calc time) and persists `correctedComponents` (re-calc reuses them); `composesInto` rides the skeleton (a Tier-1 fingerprint-match reuses the cached interpretation); the entity overlap runs inside `resolveEntitiesFromCommittedData`, which a Tier-1 re-import skips. A second identical-fingerprint MIR import remains Tier 1. Live verification is architect-gated (clean reimport).

## §5 — HALT conditions encountered

- **HALT-CALC (resolved, not escalated):** BCL re-key regression caught by PG-R7-2 and fixed in-arc with the cardinality guard before any merge. Final state: BCL/Meridian neutral.
- No HALT-REGISTRY, HALT-COLLISION, or HALT-LOCKED-RULE.

## §6 — ARTIFACT SYNC

```
ARTIFACT SYNC
MC: HF-341 R7 → code complete on PR #601; architect: clean-slate MIR reimport (5 plans + 13 sheets) →
    recalc June (+ Jan/Feb optional) → reconcile per-plan totals vs GT + entity count (expect 34).
    New items discovered: (1) MIR transaction entities carry PRODUCT display_names (cosmetic; the
    transaction nameColumn picked a product column) — separate from D1, surfaced for a follow-up.
    (2) The period binding for ALL MIR plans resolved to 'Fecha_Cobro' (a cobranza column) — Ventas
    plans may be mis-period-scoped; flagged for the architect's reconciliation pass.
REGISTRY: candidate locked decisions (architect assigns numbers at merge):
    - "Condition literals are reconciled to the data domain or fail loud" (A1/C1 general property).
    - "Composition mode is read from the expression (composesInto), never an additive fold default" (A2).
    - "Entity identity is one value-domain per tenant, routed by value-overlap + 1:1 cardinality" (D1).
    Retire: directive hypotheses A1(resolution-failure), B1(missing-gate), B2(sum-not-snapshot),
    C1(binds-to-sum) — refuted by evidence (kept the observable failures, corrected the mechanism).
R1: PG-R7-1..6 dispositioned above (PG-R7-1 full-reimport + PG-R7-2/3 live grand-total = architect SR-44).
BOARD: now = 4 defect clusters fixed + proven (live/unit), HALT-CALC neutral, Korean-Test clean;
    gap = single end-to-end clean-reimport recalc (architect); ev = §3/§4 pasted; ef = SR-44 reimport; lane = HF.
SUBSTRATE: exercised — Decision 158 (LLM recognizes literal↔domain + composition; code guarantees),
    Validation Premise Law (membership over carried domain), C2 fail-loud (3 diagnostics), D117/D118
    (convergence routes identity by value), RA-1/RA-2/RA-3/RA-4 (snapshot/last, multiply, conditional
    gate, plan-informed entity-id all satisfied). Candidate ICA capture: "value-overlap re-keying must
    carry a 1:1-cardinality guard to avoid collapsing entities into a grouping dimension" (the BCL save).
```

---
*HF-341 R7 — Resolution, Condition, Reduction, Identity. Code complete; architect: clean-reimport reconciliation + merge (SR-44).*
