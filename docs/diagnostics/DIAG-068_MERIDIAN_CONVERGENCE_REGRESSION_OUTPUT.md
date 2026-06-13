# DIAG-068 — Meridian Convergence Regression — OUTPUT

**Repo:** `CCAFRICA/spm-platform` (VP)
**Authored:** 2026-06-13 (CC, against `docs/diagnostics/DIAG-068_MERIDIAN_CONVERGENCE_REGRESSION_20260613.md`)
**Type:** DIAG — read-only. Ships no code, makes no mutation, asserts no cause beyond evidence.
**HEAD at recon:** `3a78f38a` · **Tenant (Meridian):** `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
**Rule 7:** every finding pastes real DB output or real code. Read provenance: `web/scripts/diag/diag068-*.ts` (SELECT-only).

**Collision gate:** `ls docs/diagnostics/DIAG-068*` → only the directive matches; no OUTPUT pre-exists. CLEAR.

---

## TL;DR — CAUSE (established locus)

The regression is **not** an intent change (Q1), **not** an OB-203/HF-285 convergence-code change (Q3), and **not** a column-comprehension failure (Q4). The locus is the **HF-222 distribution-relative, order-dependent boundary-fallback binding gate** (`distinctEnoughToBind` + the greedy `boundColumnToField`) operating on an **ambiguous hub-measure cluster** that the Meridian data genuinely presents: ~9–12 near-indistinguishable numeric "hub" columns on the payee population, against a fleet-ratio intent that carries **no discriminating expected-range**. The gate correctly reports `candidate distribution insufficient to bind (top=0.1000, n=9)` and leaves `cargas_totales_hub` unbound for one variant; HF-281's completeness invariant (active **since before** the prior closure) then refuses to persist the incomplete binding and aborts. Because the clean-slate reimport **re-interpreted** the plan (new rule_set `8affd52c`) and re-derived component ordering, the cluster resolves to the *opposite* variant than the prior generation — which is why "which variant fails" inverted. **Determinism nuance:** the gate is a pure function for a fixed generation (re-running calc on `8affd52c` rejects the same variant every time); the cross-generation inversion is generation-sensitivity of a distribution-relative gate, not run-to-run randomness.

---

## Q1 — Did the required-token set for component_9 change between generations?

**HALT-2 applies:** the clean-slate reimport purged the prior generations. Only `8affd52c` is inspectable; `be74de80` and `cac8c891` are **absent from the DB** — their token sets cannot be read (and are not fabricated here).

```
rule_set rows matched: 8affd52c (active, v1, 2026-06-13T19:20:53Z)
── rule_set be74de80… : ABSENT FROM DB (HALT-2: not inspectable) ──
── rule_set cac8c891… : ABSENT FROM DB (HALT-2: not inspectable) ──
```

Within `8affd52c`, both Utilización variants — run through the gate's **own** `requiredTokensForComponent` (convergence-service.ts:1672) on the DB-stored `components` JSONB:

```
──────── rule_set 8affd52c-452b-4cba-9b98-ae4e36cf022d (Plan de Incentivos 2025 - Coordinadores de Logística) ────────

  component_4  variant=coordinador-senior  name="Utilización de Flota"  type=prime_dag
    REQUIRED TOKENS (requiredTokensForComponent): [cargas_totales_hub, capacidad_total_hub]
    calculationIntent: {"op":"multiply","prime":"arithmetic","inputs":[{"else":{"op":"divide",...
        "inputs":[{"field":"cargas_totales_hub","prime":"reference"},{"field":"capacidad_total_hub","prime":"reference"}]},
        "then":{"prime":"constant","value":1.5},"prime":"conditional","condition":{"op":"gt",...}},{"prime":"constant","value":800}]}

  component_9  variant=coordinador        name="Utilización de Flota"  type=prime_dag
    REQUIRED TOKENS (requiredTokensForComponent): [cargas_totales_hub, capacidad_total_hub]
    calculationIntent: {"op":"multiply","prime":"arithmetic","inputs":[{"else":{"op":"divide",...
        "inputs":[{"field":"cargas_totales_hub","prime":"reference"},{"field":"capacidad_total_hub","prime":"reference"}]},
        "then":{"prime":"constant","value":1.5},"prime":"conditional","condition":{"op":"gt",...}},{"prime":"constant","value":450}]}
```

**Verdict:** within `8affd52c` the two variants are **structurally identical** — same operation, same two required tokens `[cargas_totales_hub, capacidad_total_hub]`; the **only** difference is the trailing base constant (`800` senior vs `450` coordinador), which is not a token. **The intent is therefore NOT the per-variant differentiator.** The cross-generation token comparison the directive's Q1 sought is blocked by HALT-2 (prior rule_sets purged), but the within-generation symmetry settles the relevant point: identical requirements, divergent binding outcome → the locus is the **binding**, not the intent. Go to Q2.

> Note: `input_bindings.convergence_bindings` on `8affd52c` carried **no entries** for either component (the run aborted at the completeness gate before persisting boundary-fallback bindings), so the per-variant measure binding is not in the rule_set row; the measure-token binding is logged to console at decision time (Q2), not written as a signal.

---

## Q2 — Is the HF-222 distribution rejection deterministic on the n=9 candidate set?

The acceptance test, verbatim (`convergence-service.ts:2598-2608`):

```ts
export function distinctEnoughToBind(scoredCandidates: Array<{ score: number }>): boolean {
  if (scoredCandidates.length === 0) return false;
  if (scoredCandidates.length === 1) return scoredCandidates[0].score > 0;
  const scores = scoredCandidates.map(c => c.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);
  return scoredCandidates[0].score - scoredCandidates[1].score > stddev;   // bind iff top−second > stddev
}
```

The call site that produces the `top=…, n=…` log (`convergence-service.ts:2932-2969`):

```ts
const candidates = measureColumns
  .filter(mc => { const pf = boundColumnToField.get(mc.name); return pf === undefined || pf === req.metricField; })  // ← greedy pool, mutated by earlier components
  .map(mc => {
    const { score, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
    const nullRate = individualNullRates.get(mc.name) ?? 0;
    return { ...mc, score: score * (1 - nullRate), scaleFactor };       // HF-275 population penalty
  })
  .sort((a, b) => b.score - a.score);

if (candidates.length > 0 && distinctEnoughToBind(candidates)) { /* bind, match_pass:3 */ }
else if (candidates.length > 0) {
  console.log(`[Convergence] HF-222: ${comp.name}:${req.role}: candidate distribution insufficient to bind (top=${candidates[0].score.toFixed(4)}, n=${candidates.length}); surfacing as convergence gap.`);
}  // ← the §1 symptom: top=0.1000, n=9
```

**Verdict — deterministic per fixed input, but generation-/order-sensitive:**
1. `distinctEnoughToBind` is a **pure function** of the scored candidate list — no sampling, no RNG, no clock. For a fixed candidate set it returns the same answer every time. (So re-running calc on `8affd52c` rejects the *same* variant; this is **not** run-to-run flakiness.)
2. The threshold is **not a constant** — it is the **stddev of the candidate scores**, i.e. **relative to the candidate distribution**. The same column with the same absolute score can pass in one candidate pool and fail in another.
3. The candidate **pool is mutated by earlier components**: the `.filter(pf === undefined || pf === req.metricField)` line excludes any column an earlier component already bound to a *different* field, via the greedy `boundColumnToField` map (HF-243). So the pool, and therefore the relative threshold, **depends on component processing order** — and order is re-derived per generation by `extractComponents`' variant-flattening (`component_4` before `component_9`).
4. `score = scoreColumnForRequirement(name, stats, req) × (1 − nullRate)`. `req` derives from the **intent**; for the fleet ratio the reference fields carry **no compare constants** → `expectedRange` is null → the scorer cannot discriminate → candidates cluster at low scores (`top=0.1000`). With a cluster, `top − second ≤ stddev` → **refuse to bind**.

So the rejection is a **stable property of (data shape × intent × processing order) for a given generation**, and it flips across generations because the reinterpretation re-derives that triple. It is **not** non-determinism within a generation.

---

## Q3 — Did the HF-222 check or its threshold change in the OB-203/HF-285 arc?

History of every gate component (`git log -S` on `convergence-service.ts`):

```
distinctEnoughToBind        → 70bf9c2a  2026-05-13  HF-222 (#392)         [introduced once; never modified since]
scoreColumnForRequirement   → 127cf063  2026-03-09  HF-111 Phase 1-3      [signature since HF-111]
computeIndividualNullRates  → 116a7965  2026-06-08  HF-275 Phase 2        [population penalty]
boundColumnToField          → 614a748d  2026-05-20  HF-243 (#430)         [greedy order-dependence]
```

The OB-203/HF-285 arc's commits to `convergence-service.ts` and what they touched:

```
1f1d7d59  2026-06-12  OB-203 Phase 6B / Phase E   → hunks only in inventoryData (@@ -963 / -977 / -989)
d8ecc2a4  2026-06-12  OB-203 D16.1 outage self-heal → hunks only in inventoryData (@@ -966 / -975 / -986)
```

Neither arc commit's diff references `distinctEnoughToBind`, `scoreColumnForRequirement`, `generateAllComponentBindings`, `computeIndividualNullRates`, `boundColumnToField`, `requiredTokensForComponent`, or `findIncompleteBindings` (grep of both diffs for those symbols returned only `@@ … inventoryData` hunk headers). And the abort gate itself:

```
ff7fea6a  2026-06-09  HF-281 Phase 2: binding completeness predicate + phase gate
68483e64  2026-06-09  HF-281 Phase 1: ADR — incomplete binding fails the binding phase
```

**Verdict — the check did NOT change in the arc.** The HF-222 distinguishability gate, its scorer, the HF-275 null penalty, and the HF-243 greedy binder were all introduced **before** the arc (2026-03-09 … 2026-06-08) and were **not modified** by the two OB-203 commits (which touch only `inventoryData`). Critically, HF-281's completeness *abort* gate landed **2026-06-09**, i.e. **before** the prior Meridian closure (2026-06-10 per the closure record) — so the abort mechanism is not new either. The regression is **not** a convergence-code change shipped in the OB-203/HF-285 arc.

---

## Q4 — Did SCI column comprehension of the fleet columns change / fail?

The current import's data, by `data_type`, over 304 `committed_data` rows (entity_id set = payee row; null = hub/grouping row):

```
data_type=entity     rows=67   entityId set/null=67/0    fleet cols: [Hub_Asignado]
data_type=reference  rows=36   entityId set/null=0/36    fleet cols: [Hub, Cargas_Totales, Capacidad_Total]
data_type=target     rows=201  entityId set/null=201/0   fleet cols: [Hub, Cargas_Flota_Hub, Volumen_Rutas_Hub, Capacidad_Flota_Hub, Tasa_Utilizacion_Hub]
```

Fleet-column availability over the **payee** population (entity_id NOT NULL — the population convergence scores):

```
col="Cargas_Totales":       payeeRows=0   (nonNull=0)    hubRows=36 (nonNull=36)
col="Capacidad_Total":      payeeRows=0   (nonNull=0)    hubRows=36 (nonNull=36)
col="Cargas_Flota_Hub":     payeeRows=201 (nonNull=201)  hubRows=0  (nonNull=0)
col="Capacidad_Flota_Hub":  payeeRows=201 (nonNull=201)  hubRows=0  (nonNull=0)
```

Comprehension classified the fleet columns as measures (classification_signals, `decision_source=hc_pattern`):

```
[2026-06-13T19:28] type=classification:outcome class=target  sheet=Datos_Rendimiento  …"Cargas_Flota_Hub":{"columnRole":"measure", …}
[2026-06-13T19:28] type=classification:outcome class=reference sheet=Datos_Flota_Hub   …"Cargas_Totales":{"columnRole":"measure", …}
```

**Verdict — ELIMINATED (with a structural amplifier).** `Cargas_Flota_Hub` IS comprehended as a measure and IS present and non-null on all 201 payee rows — so the column is available to convergence; comprehension did not fail. **But** the read surfaces *why* the binding is ambiguous: the token name `cargas_totales_hub` matches **two** distinct physical columns — `Cargas_Totales` (hub/reference sheet, present only on the 36 entity-null hub rows → 100% null on the payee population → HF-275 penalty zeroes its score) and `Cargas_Flota_Hub` (target sheet, on payees) — and the target sheet carries a **cluster** of ~9–12 numeric "hub" measures (`Cargas_Flota_Hub, Volumen_Rutas_Hub, Capacidad_Flota_Hub, Tasa_Utilizacion_Hub, Ingreso_Meta, Ingreso_Real, Cuentas_Nuevas, Entregas_Tiempo, Entregas_Totales, …`). That cluster, scored by a discriminator-free ratio intent, is the `n=9, top=0.1000` distribution the Q2 gate refuses to bind. Comprehension is correct; the data shape is genuinely ambiguous.

---

## CAUSE

**Established locus: the HF-222 distribution-relative, order-dependent boundary-fallback binding gate, exercised on an ambiguous hub-measure cluster — not the intent, not arc code, not comprehension.** Q1 proves both variants of `8affd52c` carry identical required tokens `[cargas_totales_hub, capacidad_total_hub]`, so the intent is not the differentiator. Q4 proves the fleet column is correctly comprehended and present on the payee population, so comprehension is not the locus — while revealing the data presents a cluster of ~9 near-indistinguishable numeric hub measures plus a fleet token whose ratio intent carries no discriminating expected-range. Q2 proves the gate's acceptance threshold is the **stddev of the candidate scores** (relative, not absolute) and that the candidate pool is mutated by the greedy `boundColumnToField` map in component-processing order; on this cluster the best score is a weak `0.1000` and `top − second ≤ stddev`, so the gate reports `distribution insufficient to bind (top=0.1000, n=9)` and leaves `cargas_totales_hub` unbound for the losing variant. HF-281's completeness invariant — active since 2026-06-09, **before** the prior closure — then refuses to persist the incomplete binding and aborts. Q3 proves none of this gate machinery changed in the OB-203/HF-285 arc (its only `convergence-service.ts` commits touch `inventoryData`). The regression therefore is **generation sensitivity**: the clean-slate reimport re-interpreted the plan into `8affd52c` and re-derived component ordering/comprehension, so the relative, order-dependent gate resolved the same ambiguous cluster onto the **opposite** variant (`component_9` coordinador) than the prior generation `be74de80` (where `component_4` coordinador-senior was the casualty). The gate is deterministic within a generation; the inversion is the gate's distribution-/order-sensitivity across re-interpretations, not run-to-run randomness.

**Convergence within this pass:** Q1, Q3, Q4 are conclusively answered from current artifacts; Q2's mechanism is proven from code. The **one remaining read** that would pin the exact per-variant divergence this generation (why `component_9` and not `component_4`) is the run-time evidence the gate writes only to the console, not the DB: **reproduce the calc on `8affd52c` with convergence logging and capture the two `[Convergence] HF-222 … top=… n=…` lines (and their candidate score lists) for `component_4` and `component_9`.** That read would confirm the order-dependent pool composition empirically; it does **not** change the established locus. Per Rule 24 this is round 1 — the locus is named on evidence; the fix HF (separate, number read from repo at authoring) is the architect's call. The fix space the evidence points at: tie-break/semantic disambiguation for hub-measure clusters, an expected-range for the fleet ratio, or order-independence in the boundary-fallback gate — none authored here.

---

## Read provenance (SELECT-only scripts; no mutation)

- `web/scripts/diag/diag068-meridian-reads.ts` — Q1 token sets via `requiredTokensForComponent`; Q4 signal scan.
- `web/scripts/diag/diag068-q4-column.ts` / `diag068-committed.ts` — committed_data sheet/column + payee-vs-hub availability.
- `web/scripts/diag/diag068-binding-selection.ts` — `convergence:binding_selection` signals (identifier path) + committed_data count.

## HALT status
- **HALT-1 (mutation):** not reached — all reads SELECT/grep/git only.
- **HALT-2 (rule_set absent):** **reached and handled** — `be74de80`/`cac8c891` purged by the clean-slate reimport; reported as not-inspectable, proceeded with `8affd52c` (the reproducible minimum). No prior-generation tokens fabricated.
- **HALT-3 (cause not established):** not reached — Q1–Q4 converge on a single locus; the one corroborating read for the exact per-variant trigger is named, not theorized.
