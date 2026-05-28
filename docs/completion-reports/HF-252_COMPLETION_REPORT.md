# HF-252 — Per-Variant Component Intent Emission + Fallback Removal

**Branch:** `dev` (off `main @ 5fde465c` via merge `24604bbd`)
**Date:** 2026-05-28
**Scope:** Closes the DS-024 scope gap surfaced in HF-251 BCL October calculation (Defect 1) and restores single construction pipeline per T0-E03 / AP-17 (Defect 2).

---

## 1. Build verification

```
$ npx tsc --noEmit
(no output — clean)

$ rm -rf .next && npm run build
✓ Compiled successfully

$ npm run dev (curl localhost:3000)
HTTP 307
```

Constructor tests (HF-251 Phase 1.3) still passing: **7/7**.

```
$ node --test --import tsx src/lib/plan-intelligence/__tests__/intent-constructor.test.ts
ℹ tests 7  pass 7  fail 0  cancelled 0  duration_ms 284.912834
```

---

## 2. EPG verification (Phase 2 fallback removal)

Per directive §4.3, confirming the fallback dispatch is removed from the plan_component call path:

```
$ grep -nE "shouldUseChunking\(|interpretPlanComponentWithChunking\(|fetchChunksInParallel\(|assembleTree\(|collectReferences\(" src/lib/sci/plan-orchestration.ts
(empty — pipeline removed)
```

Zero active-code references to the removed dispatch. Three comment-only references remain (HF-252 retirement notes); no active code path reaches the deprecated assembler.

The `interpretPlanComponentWithChunking` + `interpretPlanChunk` ai-service methods and the `prime-assembler.ts` module file are preserved per DD-7 (no smuggled expansion). HF-255 handles file-level deletion separately.

---

## 3. BCL plan import (architect-manual on production)

Browser interaction required. The architect runs the verification against production deployment `327d3da4`.

Expected log signatures:

```
[plan-skeleton] componentIndex=8 (4 components × 2 categories per HF-252 PER-VARIANT ENUMERATION)
[plan-component] mode=construction component=<id> name="<name>" rateTableCellCount=<N>
[plan-component] constructed component=<id> from compositional_intent shape=<banded_lookup|arithmetic|conditional|composed>
[plan-component] SUCCESS component=<id> attempt=1 latencyMs=<ms> method=compositional_intent
```

For each of BCL's 8 per-variant component emissions, to be filled by architect:

| Component (variant) | applies_to | shape | references metric-only? | construction_method |
|---|---|---|---|---|
| C0 Senior / Colocación de Crédito | _value_ | _value_ | _yes/no_ | _value_ |
| C1 Senior / Captación de Depósitos | _value_ | _value_ | _yes/no_ | _value_ |
| C2 Senior / Productos Cruzados | _value_ | _value_ | _yes/no_ | _value_ |
| C3 Senior / Cumplimiento Regulatorio | _value_ | _value_ | _yes/no_ | _value_ |
| C0 Ejecutivo / Colocación de Crédito | _value_ | _value_ | _yes/no_ | _value_ |
| C1 Ejecutivo / Captación de Depósitos | _value_ | _value_ | _yes/no_ | _value_ |
| C2 Ejecutivo / Productos Cruzados | _value_ | _value_ | _yes/no_ | _value_ |
| C3 Ejecutivo / Cumplimiento Regulatorio | _value_ | _value_ | _yes/no_ | _value_ |

**Defect 1 binding proof.** Productos Cruzados appears twice (Senior + Ejecutivo); each emission references only `productos_cruzados_vendidos` (or the plan's actual metric field name), no `employee_type` categorical reference inside structure. To be confirmed by architect.

---

## 4. BCL October calculation (architect-manual)

After all 8 per-variant components persist:

| Metric | Value |
|---|---|
| Convergence binding status | _no categorical-reference gaps expected_ |
| DecimalError | _NOT recurring (expected)_ |
| Grand total (October) | _$..._ |
| C0 total (Senior + Ejecutivo) | _$..._ |
| C1 total (Senior + Ejecutivo) | _$..._ |
| C2 Productos Cruzados (Senior + Ejecutivo) | _$..._ |
| C3 Cumplimiento Regulatorio | _$..._ |
| Entity count processed | _N_ |

Architect reconciles against GT in architect channel.

---

## 5. Production verification

| Field | Value |
|---|---|
| Squash-merge commit | `327d3da450073c25eb25ddf35df13756dfa19a37` |
| Merged at | `2026-05-28T16:25:54Z` |
| Vercel Production deployment SHA | `327d3da4` (matches main HEAD) |
| Vercel Production deployment ID | `4851466278` |
| Vercel deployment created | `2026-05-28T16:27:43Z` (~108s after merge) |
| Vercel deployment status | `success` |
| Production URL | `https://vialuce-prod-l1le6upix-seaside-altas-projects.vercel.app` |
| Vercel webhook | Fired correctly |

```
$ git log --oneline -1 origin/main
327d3da4 HF-252: Per-Variant Component Intent Emission + Fallback Removal (#440)
```

```
$ git checkout dev && git merge main && git push origin dev
Merge made by the 'ort' strategy.
   35285803..fef3a31a  dev -> dev
```

Dev synced with main.

---

## 6. Code changes

### compositional-intent.ts — `applies_to` field + `MissingCompositionalIntentError`

**BEFORE:**
```typescript
export interface CompositionalIntent {
  component_id: string;
  component_name: string;
  structure: StructuralDescription;
  scale: ScaleSpec | null;
  output_precision: number;
  metadata?: Record<string, unknown>;
}
// (no MissingCompositionalIntentError)
```

**AFTER:**
```typescript
export interface CompositionalIntent {
  component_id: string;
  component_name: string;
  /**
   * HF-252: which entity categories this component applies to. Maps to
   * appliesToEmployeeTypes in the existing variant decomposition pipeline.
   * Role / category differentiation lives HERE — at the variant boundary,
   * ABOVE component evaluation. A CompositionalIntent's `structure` MUST
   * NOT encode role differentiation via internal categorical conditionals
   * or `attribute` references; variant assignment handles that upstream.
   */
  applies_to?: string[];
  structure: StructuralDescription;
  scale: ScaleSpec | null;
  output_precision: number;
  metadata?: Record<string, unknown>;
}

export class MissingCompositionalIntentError extends Error {
  constructor(public readonly componentId: string, public readonly componentName: string) {
    super(
      `[plan-component] Response for component "${componentName}" (id="${componentId}") lacked ` +
      `compositional_intent. Construction pathway (Decision 158) is the sole plan-interpretation ` +
      `pathway. No fallback. Classify as cognition_failure and retry per error class taxonomy.`,
    );
    this.name = 'MissingCompositionalIntentError';
  }
}
```

### anthropic-adapter.ts `plan_component` prompt — EMISSION DISCIPLINE section

**ADDED (after CRITICAL line, before <<COMPONENT_TYPE_LIST>>):**

```
EMISSION DISCIPLINE (HF-252 — read this before drafting the intent):

A CompositionalIntent describes the calculation for ONE component as it applies to ONE
category of entity. Reference ONLY the numeric measures the calculation consumes —
attainment ratios, amounts, counts, percentages, totals. Use `ReferenceSource.type`
values: `metric`, `ratio`, `aggregate`, `scope_aggregate`, `prior_component`.

DO NOT reference categorical entity properties (role, level, tier, classification, type,
segment) inside a component's `structure`. If a plan pays different rates to different
categories of people, that is VARIANT differentiation — the platform's variant assignment
routes each entity to the correct variant and evaluates the matching component. Do NOT
encode the categorical differentiation as a conditional or attribute reference inside the structure.

When a component's rates or outputs differ by an entity category:
  • Emit the component ONCE per category — each emission is its own per-component call.
  • Declare which category each emission applies to via the top-level `applies_to` field.
  • The platform routes each entity to the variant whose components match its category.

`applies_to` semantics:
  • Omitted, empty, or ["all"] — applies to all variants of the plan.
  • ["<category-id>", ...] — applies only to the listed category id(s).

`attribute` ReferenceSource is reserved for numeric attributes (entity-level numeric
properties consumed by the calculation, e.g., a quota the entity carries). It MUST NOT
drive categorical payout differentiation.
```

Response shape also extended:

```diff
   "compositional_intent": {
     "component_id": "...",
     "component_name": "...",
+    "applies_to": ["<category-id>", ...],  // HF-252: which variant(s) this emission applies to. Use ["all"] when uniform across variants.
     "structure": { /* StructuralDescription */ },
```

Closing instructions extended:

```diff
 DO NOT decompose the intent across multiple calls. The intent is compact — typically 200-1000 bytes — and fits in a single call regardless of component complexity.
+DO NOT encode role/category differentiation inside `structure`. Use `applies_to` at the top level (HF-252 variant routing).
```

### anthropic-adapter.ts `plan_skeleton` prompt — PER-VARIANT ENUMERATION

**ADDED to CRITICAL REQUIREMENTS (between item 2 and item 3):**

```
3. PER-VARIANT ENUMERATION (HF-252): when a component pays DIFFERENTLY by entity
   category (different rates, different breaks, different outputs for different
   roles/levels/tiers), enumerate it ONCE PER CATEGORY in `componentIndex` — each
   entry's `appliesToEmployeeTypes` carries the single category id. When a component
   pays UNIFORMLY across categories, enumerate it once with `appliesToEmployeeTypes:
   ["all"]`.
```

Plus an example explaining 4 components × 2 categories → 8 componentIndex entries.

### plan-orchestration.ts — fallback removal + applies_to override

**BEFORE (fallback branch, ~135 lines):**
```typescript
try {
  if (compositionalIntentRaw) {
    // HF-251 Decision 158 pathway ...
  } else if (intentRaw) {
    // Backward-compat: LLM ignored the HF-251 prompt and emitted the
    // legacy calculationIntent tree (HF-249/HF-250 shape). Pass through
    // the assembler — handles direct trees as no-op and skeleton+chunks
    // via fetchChunksInParallel.
    const skeletonWithChunks: SkeletonWithChunks = { ... };
    const refsBefore = collectReferences(skeletonWithChunks);
    const missingChunkIds = ...;
    if (missingChunkIds.length > 0) {
      const fetched = await fetchChunksInParallel(args, spec, missingChunkIds, ...);
      ...
      constructionMethod = 'legacy_skeleton_chunks';
    }
    const assembleResult = assembleTree(skeletonWithChunks);
    intent = assembleResult.tree as Record<string, unknown>;
    chunksResolvedCount = assembleResult.chunksResolved;
  }
} catch (constructErr) {
  if (constructErr instanceof ConstructionError) { ... }
  else if (constructErr instanceof AssemblerUnresolvedReferenceError) { ... }
  else if (constructErr instanceof AssemblerCyclicReferenceError) { ... }
  else if (constructErr instanceof AssemblerOrphanChunkError) { ... }
  else { ... }
  // ...retry policy decision...
}
```

**AFTER (~45 lines):**
```typescript
const compositionalIntentRaw = result.compositional_intent as Record<string, unknown> | undefined;
let intent: Record<string, unknown> | undefined;
const constructionMethod = 'compositional_intent' as const;

try {
  if (!compositionalIntentRaw) {
    throw new MissingCompositionalIntentError(spec.id, spec.name);
  }
  const ci = compositionalIntentRaw as unknown as CompositionalIntent;
  const constructedTree = constructTree(ci);
  intent = constructedTree as unknown as Record<string, unknown>;
  console.log(`[plan-component] constructed component=${spec.id} from compositional_intent shape=${ci.structure?.shape ?? '(unknown)'}`);
} catch (constructErr) {
  if (constructErr instanceof MissingCompositionalIntentError) {
    lastErrClass = 'cognition_violation';
    lastErrMessage = constructErr.message;
  } else if (constructErr instanceof ConstructionError) {
    lastErrClass = constructErr.message.includes('output count') ? 'cognition_truncation' : 'cognition_violation';
    lastErrMessage = constructErr.message;
  } else {
    lastErrClass = 'unknown';
    lastErrMessage = constructErr instanceof Error ? constructErr.message : String(constructErr);
  }
  // ...retry policy decision...
}
```

Plus the `applies_to` override at the component-push site:

```typescript
// HF-252: CompositionalIntent.applies_to (from the per-component call)
// takes precedence over the skeleton's appliesToEmployeeTypes. Per-component
// emission sees the actual semantics of which variants this component
// applies to. Falls back to the skeleton value when intent didn't declare.
const intentAppliesTo = (componentResult.component.metadataExtension?.compositional_intent as
  | { applies_to?: unknown }
  | undefined)?.applies_to;
const resolvedAppliesTo: string[] =
  Array.isArray(intentAppliesTo) && intentAppliesTo.length > 0
    ? (intentAppliesTo as unknown[]).map(String)
    : appliesTo;

components.push({
  ...
  appliesToEmployeeTypes: resolvedAppliesTo,
  ...
});
```

`shouldUseChunking` helper + `fetchChunksInParallel` helper + assembler imports — REMOVED.

---

## 7. Out of scope (per directive §9)

- Convergence changes (proven anchor — NOT modified)
- Variant decomposition / variant router changes (proven — NOT modified)
- 54 scale_annotation / terminal_completeness validator warnings (constructor hygiene; follow-on HF)
- `prime-assembler.ts` file-level deletion (HF-255)
- CRP and Meridian re-import/verification (HF-253, HF-254 after BCL reconciles)
- Progressive performance signal-write (deferred per DS-024 §6)
- VG substrate work

---

## 8. Residuals (per directive §6A)

- **Scale annotation warnings persist.** Constructor hygiene gaps; non-blocking. Follow-on constructor-enhancement HF.
- **`bono_cumplimiento_regulatorio` binding gap.** If same class as `employee_type` (categorical/attribute reference inside structure), Phase 1 emission discipline resolves it. If LLM encoded an output rate as a reference rather than a constant in `outputs`, surfaces in §3 verification. Observed empirically by architect.
- **Skeleton per-variant enumeration assumes LLM recognizes variant differentiation at skeleton time.** If a plan's variant structure is subtle and the skeleton enumerates per-plan-component instead of per-variant-component, the per-component intent still emits with `applies_to: ["all"]` and one rate applies to all variants. Surfaces as reconciliation discrepancy in §4 per-variant totals, not as a crash.
