# HF-253 COMPLETION REPORT

*Per-Variant Binding Scope + Distribution Signal in Column Mapping*

## Date
2026-05-29

## Execution Time
(filled at completion)

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| `ad286d32` | 1 | Architecture Decision Record (+ directive, Rule 29) |
| (pending) | 2 | Pre-edit reference enumeration |
| (pending) | 3.3.1 | Carry variantId through extractComponents |
| (pending) | 3.3.2 | Scope binding pass per variant |
| (pending) | 3.3.3 | Distribution signal in mapping prompt |
| (pending) | report | Completion report + build verification |

## FILES MODIFIED

| File | Change |
|---|---|
| `web/src/lib/intelligence/convergence-service.ts` | `PlanComponent.variantId?` added; `extractComponents` carries variantId; `generateAllComponentBindings` scopes the binding pass per variant group; `resolveColumnMappingsViaAI` column list enriched with min/max/mean + one neutral consistency instruction. |
| `docs/completion-reports/HF-253_ADR.md` | Phase 1 ADR (new). |
| `docs/vp-prompts/HF-253_DIRECTIVE_20260529.md` | Directive (Rule 29). |

## ARCHITECTURE DECISION RECORD

See `docs/completion-reports/HF-253_ADR.md` (Phase 1, committed `ad286d32`). Chosen:
Option A — per-variant binding scope + distribution signal. Rejected: Option B
(detection != fix), Option C (scope overreach + registry risk).

## PRE-EDIT REFERENCE ENUMERATION (Phase 2)

Raw grep output (run from repo root), with per-hit classification. Classification key:
**(1)** variant-flatten site to make variant-aware; **(2)** global-exclusion site to
scope per-variant; **(3)** mapping-prompt construction/call site; **(4)** measureColumns
assembly carrying `stats` (read-only, confirms stats availability); **(5)** out-of-scope
reference.

```
=== variants flatten sites (extractComponents, detectBoundaryScale) ===
758:  // Format 1: { variants: [{ variantId: "...", components: [...] }] }
767:    const variants = cj.variants as Array<Record<string, unknown>> | undefined;
768:    if (Array.isArray(variants) && variants.length > 0) {
769-781: HF-243 flatten loop (for (const v of variants) { comps.push(...vc) })
3183:  // flat component list across all variants, not just variants[0].
3184:  const variants = (cj.variants as Array<Record<string, unknown>>) ?? [];
3186:  for (const v of variants) {
=== boundColumnToField (global exclusion map) all references ===
2564:  const boundColumnToField = new Map<string, string>();
2591:        const priorField = boundColumnToField.get(proposedColumnName);
2614:          boundColumnToField.set(proposedColumnName, req.metricField);
2631:          const pf = boundColumnToField.get(mc.name);
2653:        boundColumnToField.set(best.name, req.metricField);
=== resolveColumnMappingsViaAI call sites + definition ===
2211:async function resolveColumnMappingsViaAI(
2546:  const aiMapping = await resolveColumnMappingsViaAI(
=== column-list prompt construction (contextualIdentity-only line) ===
2264-2265:  const columnList = measureColumns.map((c, i) => `${i + 1}. "${c.name}" (${c.fi.contextualIdentity})`)
582,1014,1020,1215,2487,2537: field_identity construction elsewhere (not the prompt)
=== measureColumns assembly (stats already in scope) ===
2214:  measureColumns: Array<{ name: string; fi: FieldIdentity; stats: ColumnValueStats }>,
2460:  const measureColumns: Array<{ name; fi; stats: ColumnValueStats; batchId }> = [];
2478,2488,2535: push({ name, fi, stats: cap.columnStats[...], batchId })
2549:    measureColumns,   // passed to resolveColumnMappingsViaAI
=== generateAllComponentBindings signature + match loop ===
2422:async function generateAllComponentBindings(
2468:  for (const match of matches) {   // measureColumns assembly
2499:  for (const match of matches) {   // allRequirements collection
2566:  for (const match of matches) {   // binding apply loop (AI + fallback)
```

### Per-hit classification

| Line(s) | Site | Class | Action |
|---|---|---|---|
| 758, 767-768 | `extractComponents` format-1 variant detection | (1) | Detect variants; capture each variant's `variantId`. |
| 769-781 | HF-243 flatten loop in `extractComponents` | (1) | Carry `variantId` onto each component pushed from variant `v`. Global flat `index` unchanged. |
| 3183-3188 | `detectBoundaryScale` variant flatten | **(5) out-of-scope / independent** | Indexes the SAME global flat list by `componentIndex` and reads that one component's `tierConfig`/`boundaries`. It does NOT consult `boundColumnToField` and has no cross-variant contention — each component's boundary scale resolves correctly by index regardless of variant. No per-variant treatment needed (§6A residual: confirmed independent). |
| 2564 | `boundColumnToField` declaration | (2) | Move inside per-variant group loop; reset (fresh `Map`) per group. |
| 2591, 2614 | exclusion consult/set on AI-mapping path | (2) | Now consults the per-group map. |
| 2631, 2653 | exclusion consult/set on boundary-fallback path | (2) | DD-2: the SECOND contention site. Same per-group map fixes both simultaneously. |
| 2211, 2546 | `resolveColumnMappingsViaAI` def + call | (3) | Call moves inside the per-group loop with the group's components + requirements. |
| 2264-2265 | column-list prompt construction | (3) | Enrich each line with `[min=, max=, mean=]` from `c.stats`; add one neutral consistency instruction. |
| 582, 1014, 1020, 1215, 2487, 2537 | `contextualIdentity` in field-identity construction elsewhere | (5) | Out of scope — not the mapping prompt. |
| 2214, 2460, 2478, 2488, 2535, 2549 | `measureColumns` assembly carrying `stats` | (4) | Read-only confirmation: `ColumnValueStats {min,max,mean,sampleCount}` is already on every `measureColumns` entry → Cause B fix needs no new data, only surfacing. |
| 2468, 2499 | measureColumns assembly loop + allRequirements loop | (4)/(2) | measureColumns assembly stays global (same data both variants); allRequirements collection moves into the per-group loop. |
| 2566 | binding apply loop `for (const match of matches)` | (2) | Becomes `for each variant group { reset map; AI call; for (match of group.matches) {...} }`. |

**Both DD-2 contention sites enumerated and in scope** (AI-mapping path lines 2591/2614;
boundary-fallback path lines 2631/2653). Both consume the single `boundColumnToField`;
resetting it per variant group closes the contention class at both.

## PROOF GATES — HARD

| # | Criterion (VERBATIM) | PASS/FAIL | Evidence (pasted) |
|---|---|---|---|
| EPG-1 | Components extract with correct per-variant `variantId` (8 across two variants, 4+4) | (pending) | |
| EPG-2 | Ejecutivo Captación `depositos_actuales` binds to the raw-measure column, not `Pct_Meta_Depositos` | (pending — architect-run) | |
| EPG-3 | Non-variant plan (Meridian) bindings byte-identical to pre-HF path | (pending) | |
| EPG-4 | Korean Test: zero new hardcoded column-name / language literals in touched functions | (pending) | |
| EPG-5 | `npm run build` exits 0; `localhost:3000` responds | (pending) | |

## STANDING RULE COMPLIANCE
(filled at completion)

## KNOWN ISSUES
(filled at completion)

## VERIFICATION SCRIPT OUTPUT
(filled at completion)
