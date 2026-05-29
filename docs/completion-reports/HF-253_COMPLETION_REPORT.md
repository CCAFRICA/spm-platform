# HF-253 COMPLETION REPORT

*Per-Variant Binding Scope + Distribution Signal in Column Mapping*

## Date
2026-05-29

## Execution Time
~2026-05-29, single CC session (~35 min active).

## COMMITS (in order)

| Hash | Phase | Description |
|---|---|---|
| `ad286d32` | 1 | Architecture Decision Record (+ directive, Rule 29) |
| `8d160bcf` | 2 | Pre-edit reference enumeration |
| `884f6fed` | 3.3.1 | Carry variantId through extractComponents |
| `646b175d` | 3.3.2 | Scope binding pass per variant group |
| `22717dae` | 3.3.3 | Distribution signal in mapping prompt |
| (this commit) | report | Completion report + build verification |

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

| # | Criterion (VERBATIM) | PASS/FAIL | Evidence |
|---|---|---|---|
| EPG-1 | Components extract with correct per-variant `variantId` (8 across two variants, 4+4) | **PASS** | See EPG-1 block below. |
| EPG-2 | Ejecutivo Captación `depositos_actuales` binds to the raw-measure column, not `Pct_Meta_Depositos` | **PENDING — architect-run** | Requires live re-import + convergence run for BCL (architect triggers per §5). SQL + assertion criteria below. |
| EPG-3 | Non-variant plan (Meridian) bindings byte-identical to pre-HF path | **PENDING — architect-run (structural proof PASS)** | Live Meridian convergence diff is architect-run. Structural reduction proof below. |
| EPG-4 | Korean Test: zero new hardcoded column-name / language literals in touched functions | **PASS** | See EPG-4 block below. |
| EPG-5 | `npm run build` exits 0; `localhost:3000` responds | **PASS** | See EPG-5 block below. |

### EPG-1 (PASS) — per-variant variantId extraction

Probe (`web/scripts/_hf253-epg1-probe.ts`, temporary; `extractComponents` temporarily
exported for the probe, both reverted before the Phase 3.3.1 commit) output against
BCL rule_set `ebfdc935-b86b-4b67-931d-69a873f3c04e`:

```
extracted component_count: 8
{"index":0,"name":"Colocación de Crédito","variantId":"ejecutivo-senior"}
{"index":1,"name":"Captación de Depósitos","variantId":"ejecutivo-senior"}
{"index":2,"name":"Productos Cruzados","variantId":"ejecutivo-senior"}
{"index":3,"name":"Cumplimiento Regulatorio","variantId":"ejecutivo-senior"}
{"index":4,"name":"Colocación de Crédito","variantId":"ejecutivo"}
{"index":5,"name":"Captación de Depósitos","variantId":"ejecutivo"}
{"index":6,"name":"Productos Cruzados","variantId":"ejecutivo"}
{"index":7,"name":"Cumplimiento Regulatorio","variantId":"ejecutivo"}
per-variant counts: {"ejecutivo-senior":4,"ejecutivo":4}
```

8 components, 4+4 across two distinct variantIds; global flat index 0-7 preserved.
HALT-1 NOT triggered (`v.variantId` present in persisted shape). Note: index 5 =
Captación de Depósitos / `ejecutivo` — the EPG-2 target (`component_5`).

### EPG-2 (PENDING — architect-run) — Ejecutivo Captación binding column

After architect re-imports BCL + runs convergence, run in Supabase SQL Editor:

```sql
SELECT input_bindings->'convergence_bindings'->'component_5' AS ejecutivo_captacion
FROM rule_sets WHERE id = 'ebfdc935-b86b-4b67-931d-69a873f3c04e';
-- (try component_4 / component_5 per the flat index; EPG-1 confirms component_5 = Ejecutivo Captación)
```

**PASS condition (architect asserts column identity only — no dollar figure):**
`depositos_actuales.column` == `Depositos_Nuevos_Netos` (the raw measure), NOT
`Pct_Meta_Depositos`. If it still shows `Pct_Meta_Depositos` → **HALT-2**: stop, report
the binding row + the `[Convergence] HF-253` log lines for the `ejecutivo` variant group.

### EPG-3 (architect-run live diff; structural proof PASS) — non-variant byte-identical

**Structural reduction proof.** For a non-variant plan every `PlanComponent.variantId`
is `undefined`, so `variantGroups` has exactly one entry keyed `undefined` containing
all matches in original iteration order. Within that single group:
- `allRequirements` is collected from the same `matches` in the same order as the pre-HF
  global collection → identical.
- `groupComponents = groupMatches.map(m => m.component)` (matched components). The AI call
  previously received the full `components` param; `resolveColumnMappingsViaAI` uses
  `components` ONLY for `components.find(c => c.name === r.compName)` semantic-intent
  lookup, and every `r.compName` originates from a match → the lookup resolves to the
  same component object. `measureColumns` and `metricComprehension` are unchanged
  (global) → identical AI-call inputs.
- `boundColumnToField` is a single fresh map for the single group → identical exclusion
  lifetime and identical (column→field) one-column-once semantics (HF-243 unchanged).
- The apply loop iterates `groupMatches` (= `matches`) in the same order.

Therefore the non-variant path reduces to the pre-HF single pass with identical inputs
and identical exclusion logic; given the same AI response the produced bindings are
byte-identical. `tsc --noEmit`: 0 errors. **Live confirmation** (fresh Meridian
convergence run diffed against pre-HF persisted bindings) is architect-run; if ANY
binding differs → **HALT-3**.

### EPG-4 (PASS) — Korean Test

```
$ grep -nE '"(Pct_|Meta_|Depositos|Cumplimiento|Ingreso)[A-Za-z_]*"' web/src/lib/intelligence/convergence-service.ts || echo "ZERO domain column literals — PASS"
ZERO domain column literals — PASS
```

Both edits are structural: `variantId` is the persisted grouping key; the distribution
signal surfaces numeric `min`/`max`/`mean` only. No field-name literals, no
language-specific tokens, no closed enum added.

### EPG-5 (PASS) — build + localhost

```
$ rm -rf .next && npm run build
> bash scripts/verify-korean-test.sh
[korean-test-gate] PASS: zero hardcoded legacy primitive-name string literals outside registry
 ✓ Compiled successfully
   Linting and checking validity of types ...
BUILD_EXIT=0
```

```
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
307   (redirect to auth — expected for unauthenticated root; dev server "✓ Ready")
```

The "Dynamic server usage" notices in the build log are pre-existing static-prerender
informational messages for dynamic API routes (cookies/searchParams), not build errors;
build exit code is 0.

## STANDING RULE COMPLIANCE

- **D.1 (commit+push per phase):** 5 phase commits, each pushed to `dev` (hashes above).
- **D.2 (cache clear + build):** `rm -rf .next` → `npm run build` (exit 0) → `npm run dev`
  → localhost:3000 responds. Run at Phase 3.3.4 (code-bearing phase); docs-only Phases
  1/2 carried no code change.
- **D.3 (PR):** `gh pr create --base main --head dev` — PR URL in KNOWN ISSUES / below.
- **D.4 (ASCII commits):** all commit messages ASCII.
- **Section B (ADR before code):** ADR committed (`ad286d32`) before any implementation.
- **AP-25 / Korean Test:** EPG-4 PASS; prebuild korean-test-gate PASS.
- **AP-13 (verify schema):** variantId key verified against persisted shape (DIAG-051 +
  EPG-1), with `typeof === 'string'` guard and undefined fall-through.
- **AP-17 (single pipeline):** binding pipeline scoped, not duplicated; non-variant takes
  the same path (one implicit group).
- **DD-7 / SR-38 (no unauthorized behavioral change):** scope limited to Cause A + Cause
  B; non-variant byte-identical (EPG-3 structural proof).
- **Reconciliation-channel separation:** no GT values asserted; calculated output left to
  architect channel (see KNOWN ISSUES).

## KNOWN ISSUES

1. **EPG-2 and EPG-3 live runs are architect-gated.** Per §5 the BCL re-import +
   convergence run (EPG-2) and the Meridian convergence diff (EPG-3) are architect-
   triggered. This report ships the code, the structural proof (EPG-3), and the exact
   SQL + PASS criteria (EPG-2). HALT-2/HALT-3 conditions are documented for the architect.
2. **Calculated BCL October output (verbatim, for architect reconciliation):** not
   produced in this session — generating it requires the architect-run convergence +
   calculation pass (EPG-2 precondition). CC asserts NO dollar figure and makes NO
   comparison to any target (reconciliation-channel separation). The architect runs the
   calculation and reconciles component-by-component against GT in the architect channel.
3. **Apply-loop body indentation:** the per-match apply-loop body retains its prior
   indentation depth under the new outer variant-group nesting (cosmetic only; `tsc` and
   lint clean, build exit 0). Not reindented to avoid a large mechanical diff over proven
   logic (DD-7 minimal-change discipline).
4. **`maxTokens` (500) unchanged:** the distribution enrichment is input-side (prompt);
   the AI output shape ({metric: column}) is unchanged, so 500 remains adequate.

### §6A residual disposition
- **`detectBoundaryScale` variant flatten (lines ~3184-3189):** classified
  **out-of-scope / independent** (Phase 2 enumeration). It indexes the same global flat
  component list by `componentIndex` and reads that one component's `tierConfig`/
  `boundaries`; it does NOT consult `boundColumnToField` and has no cross-variant
  contention. No per-variant treatment needed. Not a follow-on.
- **Asymmetric plausibility (HF-203):** unchanged; symmetric too-small-ratio detection
  remains a separate candidate follow-on (out of scope per §6).
- **Kind-carry-through (Option C):** flagged for the architect; not implemented.

## VERIFICATION SCRIPT OUTPUT

- EPG-1 probe output: pasted above (EPG-1 block).
- EPG-4 grep: pasted above (EPG-4 block).
- Build: `BUILD_EXIT=0`, `[korean-test-gate] PASS`, `✓ Compiled successfully` (EPG-5 block).
- `tsc --noEmit -p tsconfig.json`: 0 errors (after 3.3.2 and after 3.3.3).
- localhost:3000: HTTP 307 (EPG-5 block).
