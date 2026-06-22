# OB-228 Completion Report — The Living Plan Surface: Foundation

**OB:** OB-228 (DS-029 Slice 1+2) · **Date:** 2026-06-21 · **Proof tenant:** MIR (Almacenes Mirasol, `972c8eb0-e3ae-4e4c-ad30-8b34804c893a`)
**Branch:** `ob-228-living-plan-surface` · **CC does not merge (SR-44 architect-only).**
**Builds gap-analysis Category 2 P1:** "admin cannot view/edit plan components, rates, tier tables through the browser" → **BUILT.**

Evidentiary discipline: every section pastes code / terminal / query output. No PASS/FAIL self-attestation. Phase-1 diagnostic at `docs/diagnostics/OB-228_PHASE1_DIAGNOSTIC.md`.

> **Live-data note.** MIR was **re-imported by the architect mid-build** (SR-44 channel): the rule_set ids changed (`dcf89202…` → `63a7ada5…`) and the new interpretation dropped the accelerator's `scope` boundary. The surface reads `rule_sets.components` at render time, so it always reflects current state — this is the Korean Test / Carry Everything discipline in action (no hardcoded ids; the canvas adapted with zero code change). All proofs below are against the post-reimport live state.

---

## Phase 1 — Diagnostic & Architecture Decision Gate

Full diagnostic: `docs/diagnostics/OB-228_PHASE1_DIAGNOSTIC.md` (committed `da45c259`). Scripts: `web/scripts/ob228-phase1-diagnostic.ts`, `web/scripts/ob228-phase1-bindings.ts`.

**Premise corrections surfaced (not coerced):**
1. **`components` dialect.** MIR is `{ variants: [{ components: [...] }] }` (bare variants, no `configuration` wrapper), and **every componentType is `prime_dag`** — NOT the assumed `tier_lookup/matrix_lookup/percentage/conditional_percentage`. The logic lives in `calculationIntent` (a 9-type PrimeNode tree). This is literally DS-029 §3①'s "the prime-DAG made visible." HALT-1 **not fired** (normalizes cleanly).
2. **`input_bindings` is `{}` for all 5 plans** — bindings are *implicit* in the prime-DAG `field` references.
3. **`profiles` has no `persona` column** — seam resolves from `role` + `capabilities` (HALT-3 **not fired**). `profile_scope` empty platform-wide → admin defaults all-visible.
4. **MIR uncalculated** (EPO=0, CR=0, traces=0, batches=0) → no baseline. Combined with the resolution layer being locked in the byte-identical live calc route → **HALT-4 FIRED**.
5. **All 75,227 rows have `period_id` NULL** → distribution scopes by `source_date`.

**Architecture Decision (full record in the diagnostic):** PrimeDagRenderer (dispatches on structural shape) + mandatory GenericComponentRenderer fallback (Korean Test); recompute is the single surfaced seam (HALT-4); distribution aggregates server-side → bucket counts only; persona seam reads `resolveIdentity` + `profile_scope`.

**HALT-2 (scoped):** binding-resolution table (the OB-214 surface the canvas faithfully renders) —

```
Comisiones Mayorista · Comision por Categoria : Monto_Total, Categoria        -> RESOLVE
Comisiones Mayorista · Acelerador por Volumen : Monto_Total (agg)             -> RESOLVE
Bono por Cuota Mensual· Bono por Nivel        : ventas_brutas_mensuales       -> HALT-2 (interpreter token; data is wide-format Cuotas)
Plan de Cobranza      · Tasa de Incentivo     : Monto_Cobrado, Saldo_Pendiente-> RESOLVE (post-reimport Cobranza data present)
Bono por Cartera Nueva· Bono cliente nuevo    : Verificado                    -> RESOLVE
Ajustes/Devoluciones  · Clawback              : Monto_Original, ...           -> HALT-2 (cross-period reversal fields)
```

---

## Phase 2 — Persona seam + canvas data layer (`web/src/lib/plan-surface/`)

`types.ts` · `normalize.ts` · `prime-dag-view.ts` · `binding-extract.ts` · `persona.ts` · `structure.ts` · `distribution.ts` · `baseline.ts` · `index.ts`.

**`normalizeComponents` (the Korean-Test core — carries every dialect, never drops):**

```ts
export function resolveVariantList(componentsJson: unknown): { variants: Bag[]; recognized: boolean } {
  if (isObj(componentsJson)) {
    if (Array.isArray(componentsJson.configuration?.variants)) return { variants: componentsJson.configuration.variants, recognized: true };
    if (Array.isArray(componentsJson.variants)) return { variants: componentsJson.variants, recognized: true };
    if (Array.isArray(componentsJson.components)) return { variants: [{ variantId: 'default', variantName: 'Default', components: componentsJson.components }], recognized: true };
    return { variants: [{ variantId: 'default', variantName: 'Default', components: Object.values(componentsJson).filter(isObj) }], recognized: false };
  }
  if (Array.isArray(componentsJson)) return { variants: [{ variantId: 'default', variantName: 'Default', components: componentsJson }], recognized: true };
  return { variants: [], recognized: false };
}
// normalizeComponent sets isKnownType by membership in KNOWN_RENDERER_TYPES but NEVER gates inclusion;
// unknown types flow to GenericComponentRenderer. config.raw preserves the whole component (Carry Everything).
```

**Unit tests (`__tests__/normalize.test.ts`) — 6/6 incl. Korean Test:**
```
✔ MIR dialect — bare { variants: [...] } with prime_dag
✔ alt dialect — { configuration: { variants: [...] } }
✔ BCL array dialect — components are the array directly
✔ KOREAN TEST — unknown componentType is CARRIED, never dropped   (한국어 구성요소 / 미지의_유형)
✔ malformed / empty input does not throw and flags unrecognized
✔ confidence is a hint, never a gate — low-confidence component is carried
ℹ pass 6  ℹ fail 0
```

**Live `getVisiblePlans` + `getComponentDistribution` (script `ob228-phase2-proof.ts`) — bucket counts from real MIR committed data:**
```
getVisiblePlans → 5 plans (all normalized, shapeUnrecognized=false, confidence hoisted 0.97/0.95/0.93)
[Comision por Categoria]   resolved grain=row total=4576  buckets: Alimentos=1822 Bebidas=1137 Limpieza=913 Cuidado Personal=704
[Bono cliente nuevo]       resolved grain=row total=81    buckets: Sí=61  No=20
[Tasa de Incentivo]        resolved grain=row total=7760  buckets: 0–47.4K=7660 … 379.2K=1
[Bono por Nivel]           UNRESOLVED (HALT-2): no rows carry [cumplimiento] — flagged, not fabricated
[Clawback]                 UNRESOLVED (HALT-2): no rows carry [Monto_Original] — flagged, not fabricated
getBaselineOutcomes → 0 rows (MIR uncalculated — consequence baseline ABSENT, HALT-4 seam)
```
§A.2: distribution aggregates server-side and returns **bucket counts only** (no per-row payload). Period scope = `source_date` (period_id NULL on MIR data).

---

## Phase 3 — The Living Plan Canvas (Concept ①)

Routes `/configure/plans` (Zone A rail) + `/configure/plans/[ruleSetId]` (Zone B canvas) — nav "Plans & Canvas" repointed from the dead `/design` redirect (`workspace-config.ts`). API `/api/plan-surface/plans` (persona seam) + `/distribution` (server aggregation).

**Renderer dispatch (Korean Test, HF-195 Rule 27 compliant).** The HF-195 build gate forbids the legacy lookup-type literals (`tier_lookup` etc.); MIR's real type is `prime_dag`. So:
```ts
export const RENDERERS: Record<string, Renderer> = { prime_dag: PrimeDagRenderer };
export function resolveRenderer(componentType: string): Renderer {
  return RENDERERS[componentType] ?? GenericComponentRenderer;   // <-- mandatory fallback = the Korean-Test proof
}
```
PrimeDagRenderer dispatches on the analyzer's **structural shape** (banded_lookup → TierRenderer, conditional → ConditionalRenderer, filtered_count → RateRenderer, matrix → MatrixRenderer) with a generic structural outline fallback — so the bespoke visual renderers are used without legacy literals.

**Rendered evidence (`ob228-phase3-render-proof.ts`, renderToStaticMarkup over LIVE MIR):**
```
PLAN "Comision por Categoria"   → PrimeDagRenderer 5164b  "Monto_Total × rate, banded by Categoria | Categoria Rate <1 2.5% 1–2 2% 2–3 3% ≥3 3.5% | Accelerator…"  dist resolved(4576)
PLAN "Acelerador por Volumen"   → PrimeDagRenderer 2615b  "… <150000 100% ≥150000 1.25 …"                                                    dist resolved(4576)
PLAN "Bono por Nivel"           → PrimeDagRenderer 5271b  band table rendered                                                              dist FLAGGED (HALT-2)
PLAN "Bono cliente nuevo"       → PrimeDagRenderer 1468b  "Count where Verificado eq Si | 150 per Verificado · 81 records"                 dist resolved(81)
PLAN "Tasa de Incentivo"        → PrimeDagRenderer 1675b  "When Monto_Cobrado gt 0.7 | Pay 1.5% of Monto_Cobrado … 7,760 records"          dist resolved(7760)
PLAN "Clawback"                 → PrimeDagRenderer 2398b  "Clawback (reversal) | Monto_Original | Tasa_Comision_Original | …"               dist FLAGGED (HALT-2)
KOREAN TEST: unknown componentType "미지의_유형" → GenericComponentRenderer, html=1167b non-empty   ✓ fallback fired
SUMMARY: components rendered non-empty: 6 ; with resolved live distribution: 4 ; Korean-Test fallback renders unknown type: true
```
All 5 MIR plans render as canvases; distribution sparklines show real MIR entity/record counts; the `?? GenericComponentRenderer` fallback is proven (rendered) for an unknown type.

---

## Phase 4 — The Consequence Engine (Concept ②) — HALT-4 seam

Per the Phase-1 HALT-4 finding, the edit affordance + structural diff + commit path are **fully built and shipped**; the payout recompute is the **single surfaced seam** ("recompute pending architect disposition" — no fabricated numbers, AP-22 / Decision 158).

- `edit-model.ts` — `extractEditableValues` (prime-DAG constants by path, structural role) + immutable `applyEdits` (value-synced compositional_intent).
- `consequence.ts` — `recomputeConsequence` (seam: `available=false` + precise reason) · `diffConsequence` (real, ready for the adapter) · `summarizeEdits` (deterministic before→after).
- `ConsequenceTray.tsx` (Zone C) — editable inputs · deterministic diff · labeled recompute-pending seam · Commit/Discard.
- `POST /api/plan-surface/commit` — writes edited component to `rule_sets.components` (D158) + emits `classification_signals` (scope='tenant', Three-Scope Flywheel); requires `icm.configure_plans` + tenant scope.

**Reversible live commit round-trip (`ob228-phase4-proof.ts`):**
```
EDIT MODEL — 7 editable values (4 rate, 3 threshold) extracted with paths + roles + Categoria context
STRUCTURAL DIFF (deterministic): Rate (else): 0.025 -> 0.05 (100%)
RECOMPUTE SEAM (HALT-4): available=false
  reason="Recompute pending architect disposition (HALT-4): the deterministic per-entity recompute requires the
   metrics-resolution layer to be extracted from the byte-identical live calc route (architect-channel, GT-reconciled)
   — and MIR has no calculated baseline yet. The edit + commit are deterministic and shipped; the payout consequence
   preview lands when the recompute adapter does."
LIVE COMMIT: rule_sets.components updated (0.05 present in calculationIntent = true); metadata.intent synced = true
  classification_signals row: type=plan.component.edited scope=tenant source=plan-surface
    signal_value={"edits":[{"to":0.05,"from":0.025,"label":"Rate (else)"}],"ruleSetId":"63a7ada5…","componentId":"comision-categoria"}
RESTORED: original value 0.025 back in calculationIntent = true   (non-destructive proof; signal row retained as flywheel evidence)
```

**Recompute SEAM (the single surfaced item):** a follow-on OB extracts the metrics-resolution layer (`resolveMetricsFromConvergenceBindings` / `resolveColumnFromBatch` + cache builders, `run/route.ts:1475/1692/868–987`) into a shared module so `recomputeConsequence` can drive the engine kernel (`executeIntent`) over committed_data — architect-channel because it touches the byte-identical calc path and needs GT reconciliation.

---

## Phase 5 — Confidence Topology (③) + Provenance (④)

- `confidence.ts` — `assessComponent`/`buildPlanTopology`: severity from binding resolution (unresolved bound column = silent-$0 risk = **Critical**) + interpreter confidence (advisory display bands, RATIFIED). "Needs Review" = critical+warning.
- `binding-status.ts` — precise per-column existence probe (fixed a sampled-universe false negative; now matches distribution resolution exactly).
- `provenance.ts` — `getProvenance` (source note from `compositional_intent.metadata.note`, binding match reason, field refs) + `getCorrectionHistory` (`classification_signals`).
- UI: `ConfidenceGlyph`, confidence overlay + **Acknowledge** in `ComponentCard`, `ProvenancePanel` (binding-chip toggle), PlanRail health glyph + header "Needs Review" count. Routes `/provenance`, `/acknowledge`.

**Live proof (`ob228-phase5-proof.ts`):**
```
bound columns present in committed_data: Verificado, Monto_Cobrado, Monto_Total
CONFIDENCE TOPOLOGY — TOTAL components needing review across MIR: 2
  [CRITICAL] Bono por Nivel de Cumplimiento — "ventas_brutas_mensuales" absent → silent $0 / wrong payout
  [CRITICAL] Ajuste por Devolución (Clawback) — "Monto_Original" absent → silent $0 / wrong payout
  [INFO]     Comision / Acelerador / Bono cliente nuevo (Verificado) / Tasa de Incentivo — clean & bound
PROVENANCE — "Comision por Categoria":
  source note: "Band order maps to ALI=2.5%, BEB=2.0%, LIM=3.0%, CPE=3.5%; accelerator (1.25x when monthly gross >= S/150,000)…"
  method=compositional_intent confidence=0.97 binding=Monto_Total ; fieldRefs Monto_Total:reference, Categoria:reference
CORRECTION HISTORY — "Comision por Categoria": 1  (plan.component.edited @ 2026-06-22 — the Phase-4 edit)
```
The "Needs Review" number that matters surfaces exactly the two genuinely-broken interpreter bindings (DS-029 §3③ thesis), and aligns with the distribution resolution — recede the confident, surface the exception.

---

## Phase 6 — Integration, build, IAP, PR

**Persona → renderer seam (Concept ⑧, `persona-renderers.tsx`):**
```ts
const PERSONA_CANVAS: Record<string, (p: PersonaCanvasProps) => React.ReactNode> = { admin: AdminCanvas };
export function resolvePersonaCanvas(persona: string) {
  return PERSONA_CANVAS[persona] ?? ((p) => <DeferredPersonaCanvas persona={persona || 'rep'} ... />);  // OB-229 slot-fill
}
```
Only `AdminCanvas` exists this OB; Rep/Manager are a map-entry slot-fill (verified by inspection — not a refactor). The seam resolves scope + persona for all personas (the header shows "Viewing as **admin** · all plans").

**Build verification (kill dev → `rm -rf .next` → `npm run build` → `npm run dev`):**
```
[korean-test-gate] PASS: zero hardcoded legacy primitive-name string literals outside registry
npm run build → exit 0 (clean); legend "○ (Static) / ƒ (Dynamic) server-rendered on demand"
  ƒ /configure/plans                 281 B   174 kB
  ƒ /configure/plans/[ruleSetId]     345 B   174 kB
  ƒ /api/plan-surface/plans          0 B
  ƒ /api/plan-surface/distribution   0 B
  ƒ /api/plan-surface/commit /provenance /acknowledge
npm run dev → ✓ Ready in 1130ms
  curl  /                       → HTTP 307 → /login           (auth middleware)
  curl  /configure/plans       → HTTP 200                    (route live)
  curl  /api/plan-surface/plans→ HTTP 401                    (auth seam enforced)
tsc --noEmit → 0 errors ; eslint plan-surface → clean ; no-developer-numbers gate → clean ; unit tests 6/6
```

### IAP Gate (Principle 9 — every element scores all three or is cut)
| Concept | Intelligence | Acceleration | Performance | Verdict |
|---|---|---|---|---|
| ① Living Canvas | prime-DAG made visible + real-data distribution per card | one surface for view (no mode-switch) | aggregated server-side → bucket counts (no per-row render); scales to 75K | **keep** |
| ② Consequence | deterministic structural diff (modeled change) | edit→see-change inline; commit in one action | structural diff is O(edits); recompute bounded (seam) | **keep** |
| ③ Confidence topology | binding/anomaly severity as first-class property | "Needs Review" = 2 focuses attention | recede-the-confident reduces load; one per-column probe | **keep** |
| ④ Provenance thread | every value → source sentence + binding reason | one click to origin | read on demand (lazy correction history) | **keep** |
| ⑧ Persona seam | viewer-adapted scope (role+capabilities+scope) | right view, no navigation | one object, refracted at expression time | **keep** |
All pass. None cut.

### ARTIFACT SYNC
```
MC: plan-editing-UI (Category 2 P1, NOT BUILT) → BUILT (view/edit components, rates, tier tables in-browser against MIR).
    New items discovered: (a) recompute adapter seam (HALT-4) → follow-on OB; (b) MIR interpreter-token bindings
    (ventas_brutas_mensuales, Monto_Cobrado@first-import, Monto_Original) → OB-214; (c) Rep/Manager refractions → OB-229.
REGISTRY: Plan Management → evidence: /configure/plans canvas + /api/plan-surface/* (plans/distribution/commit/provenance/acknowledge).
    Proposed L-level Δ: Plan Management view/edit L0(none)→L2 (browser view + edit + commit); simulate L0→L1 (edit modeled, recompute seam).
R1: "admin can view/edit plan components, rates, tier tables through the browser" → status: TRUE (render proof + commit round-trip).
    "what if I change this rate" → PARTIAL (structural modeled change shipped; payout recompute = surfaced seam, HALT-4).
BOARD (CAPS): now=plan-surface read+edit+confidence+provenance live; gap=payout recompute preview; ev=render/commit/topology proofs;
    ef=server-aggregated distribution + per-column probe; fl=classification_signals (plan.component.edited / plan.confidence.acknowledged); lane=Plan Management.
SUBSTRATE exercised: Korean Test (dispatch-map + generic fallback, proven on 미지의_유형); Carry Everything (normalize carries every
    dialect/field; confidence is a hint); Decision 158 (recognition=confidence/provenance, construction=edit/commit; consequence=deterministic);
    Three-Scope Flywheel (tenant signals on edit + acknowledge). Capture candidate: "interpreter-token binding = Critical anomaly" pattern.
```

### Residuals (per directive §6A)
- **Recompute seam (HALT-4)** — follow-on OB extracts the metrics-resolution layer; OB-228 ships the surface with consequence-preview pending.
- **MIR interpreter defects (OB-214)** — the canvas faithfully renders + flags them (Needs Review = 2); not a blocker.
- **Rep/Manager refractions (OB-229)** — seam shipped; renderers deferred (slot-fill).
- **i18n** — site-wide es-PE English-render defect is a parallel-track demo blocker; the canvas renders `components` labels (Spanish) natively.

---

## PR
`gh pr create --base main` — see PR link appended below. **CC does not merge (SR-44).**
