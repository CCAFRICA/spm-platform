# HF-244 — Scale Mutual Exclusion, Validator Enforcement, Plan Supersession

**Branch:** `dev` (off `main @ 14d7c28c` via merge `d551fbe9`)
**Date:** 2026-05-21
**Scope:** Three defects from OB-200 post-merge BCL verification, fixed at class level.

---

## Phase 1 — Scale Mutual Exclusion

### Three sites traced

**Site 1 — `convergence-service.ts:1745` (BEFORE):**

```typescript
if (requirement.scaleMetadata && typeof requirement.scaleMetadata.scale === 'number') {
  const scale = requirement.scaleMetadata.scale;
  if (requirement.expectedRange) {
    const { min: expMin, max: expMax } = requirement.expectedRange;
    if (expMax > expMin) {
      const scaledMin = stats.min * scale;
      const scaledMax = stats.max * scale;
      const overlapMin = Math.max(scaledMin, expMin);
      const overlapMax = Math.min(scaledMax, expMax);
      const overlap = Math.max(0, overlapMax - overlapMin);
      const boundarySpan = expMax - expMin;
      const fit = boundarySpan > 0 ? overlap / boundarySpan : 0.5;
      return { score: Math.max(0.5, fit), scaleFactor: scale };   // ← BUG
    }
  }
  return { score: 0.6, scaleFactor: scale };                       // ← BUG
}
```

The returned `scaleFactor` lands on the binding's `scale_factor` field via `generateAllComponentBindings` (line ~2462), which spreads `scale_factor: scaleFactor !== 1 ? scaleFactor : undefined` onto the binding entry.

**Site 1 — `convergence-service.ts:1745` (AFTER):**

```typescript
if (requirement.scaleMetadata && typeof requirement.scaleMetadata.scale === 'number') {
  const scale = requirement.scaleMetadata.scale;
  if (requirement.expectedRange) {
    const { min: expMin, max: expMax } = requirement.expectedRange;
    if (expMax > expMin) {
      const scaledMin = stats.min * scale;
      const scaledMax = stats.max * scale;
      const overlapMin = Math.max(scaledMin, expMin);
      const overlapMax = Math.min(scaledMax, expMax);
      const overlap = Math.max(0, overlapMax - overlapMin);
      const boundarySpan = expMax - expMin;
      const fit = boundarySpan > 0 ? overlap / boundarySpan : 0.5;
      return { score: Math.max(0.5, fit), scaleFactor: 1 };        // ← FIX
    }
  }
  return { score: 0.6, scaleFactor: 1 };                            // ← FIX
}
```

The LLM-emitted `scale` value is still used for SCORING (does the column's distribution × scale fit the expectedRange?), but returns `scaleFactor: 1` so the binding's `scale_factor` field is `undefined`. The evaluator alone handles scaling via `meta.scale` on the constant node.

**Site 2 — `intent-executor.ts:168-185` (UNCHANGED, the surviving authority):**

```typescript
case 'compare': {
  const leftMeta = isConstantWithMeta(node.inputs[0]) ? node.inputs[0].meta : undefined;
  const rightMeta = isConstantWithMeta(node.inputs[1]) ? node.inputs[1].meta : undefined;
  let a = evaluate(node.inputs[0], context);
  let b = evaluate(node.inputs[1], context);
  if (leftMeta && !rightMeta) {
    b = b.mul(toDecimal(leftMeta.scale));
  } else if (rightMeta && !leftMeta) {
    a = a.mul(toDecimal(rightMeta.scale));
  }
  // … op switch unchanged
}
```

**Site 3 — `route.ts:1326` (UNCHANGED, the legacy-tree fallback path):**

```typescript
const scaled = fieldBinding.scale_factor ? rawValue * fieldBinding.scale_factor : rawValue;
```

For DAG trees emitted before OB-200 (no `meta` on constants), the HF-243 `extractExpectedRangeFromDAG` path still infers scale via threshold distribution and sets `scale_factor` on the binding. This line then applies it at metric resolution time. The evaluator's compare case has no meta to react to, so it does not double-scale. Backward compatible.

### Rule

For any binding, exactly one of {convergence `scale_factor`, evaluator `meta.scale`} fires, never both.

- LLM emits `meta` on constants → evaluator scales at compare time → convergence sets `scaleFactor: 1` → binding's `scale_factor` is undefined → `route.ts` metric resolution does NOT scale.
- Legacy tree without `meta` → convergence's HF-243 heuristic sets `scale_factor` on the binding → `route.ts` metric resolution scales → evaluator does NOT scale (no `meta` to react to).

---

## Phase 2 — Validator Exhaustive Emission Enforcement

### Prompt extension (`prime-grammar.ts:generatePromptGrammarSection`)

```
HF-244 — RATE-TABLE CELL DECLARATION (REQUIRED for components with rate tables):
Alongside the calculationIntent on each component, emit a sibling field "rateTableCellCount"
with the integer total number of cells in the source rate table. A 5-tier 1D band:
rateTableCellCount: 5. A 6×5 matrix: rateTableCellCount: 30. The platform's
post-generation validator checks that the emitted tree carries at least
rateTableCellCount constant leaves; if fewer, the component is REJECTED. When the
component has no rate table (simple rate × metric, linear function, etc.), omit
rateTableCellCount entirely.
```

### Validator severity (`prime-grammar.ts:validatePrimeTree`)

```typescript
// BEFORE — warning only
if (typeof opts.expectedCellCount === 'number' && opts.expectedCellCount > 0) {
  if (constantLeafCount < opts.expectedCellCount) {
    violations.push({
      check: 'exhaustive_emission',
      nodePath: '$',
      message: `Plan declares ${opts.expectedCellCount} rate-table cells but the emitted tree carries only ${constantLeafCount} constant leaves. Cells are missing.`,
      severity: 'warning',                                                   // ← warning
    });
  }
}
```

```typescript
// AFTER — critical, throws via convertComponent
if (typeof opts.expectedCellCount === 'number' && opts.expectedCellCount > 0) {
  if (constantLeafCount < opts.expectedCellCount) {
    violations.push({
      check: 'exhaustive_emission',
      nodePath: '$',
      message: `Plan declares ${opts.expectedCellCount} rate-table cells but the emitted tree carries only ${constantLeafCount} constant leaves. Cells are missing — the LLM truncated the table.`,
      severity: 'critical',                                                  // ← critical
    });
  }
}
```

### convertComponent wiring (`ai-plan-interpreter.ts`)

```typescript
// HF-244: rateTableCellCount on the component output is the LLM's
// declaration of source rate-table dimensions; the validator counts
// emitted constant leaves and rejects truncated trees. Closes the
// BCL C0 class defect (30-cell matrix → 3-leaf tree silently persisted).
const expectedCellCount = typeof comp.rateTableCellCount === 'number' && comp.rateTableCellCount > 0
  ? comp.rateTableCellCount
  : undefined;
const validation = validateComponentIntent(intentNode, { componentLabel: base.name, expectedCellCount });
logValidationViolations(validation, base.name);
if (!validation.valid) {
  const critical = validation.violations.filter(v => v.severity === 'critical');
  throw new UnconvertibleComponentError(
    `[convertComponent] "${base.name}" emitted a prime-DAG calculationIntent ` +
    `with ${critical.length} critical grammar violation(s): ` +
    `${critical.map(v => `${v.check}@${v.nodePath}: ${v.message}`).join('; ')}.`,
  );
}
```

`InterpretedComponent.rateTableCellCount?: number` added; `normalizeComponents` reads from the LLM JSON (`Math.floor` integer coercion, omitted when absent or non-positive).

### `[PrimeValidator]` log output

The validator-side log expectation cannot be captured until the next BCL reimport through the browser (architect-manual). Expected line on next BCL reimport for C0:

```
[PrimeValidator] Credit Placement (critical) exhaustive_emission @ $: Plan declares 30 rate-table cells but the emitted tree carries only 3 constant leaves. Cells are missing — the LLM truncated the table.
```

Followed by `UnconvertibleComponentError` thrown from `convertComponent`. The truncated tree never persists.

---

## Phase 3 — Plan Supersession

### Root cause (status enum mismatch)

`web/supabase/migrations/002_rule_sets_and_periods.sql:`

```sql
status            TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'pending_approval', 'active', 'archived')),
```

The DB CHECK constraint allows four statuses. `'superseded'` is not one of them.

`web/src/lib/sci/plan-interpretation.ts` (pre-HF-244, both sites):

```typescript
const { error: supersedeError, data: supersededRows } = await supabase
  .from('rule_sets')
  .update({ status: 'superseded', updated_at: new Date().toISOString() })  // ← invalid status
  .eq('tenant_id', tenantId)
  .neq('status', 'superseded')                                              // ← no-op filter (no row carries this)
  .select('id, name, status');
if (supersedeError) {
  console.error('[SCI plan-interp] Supersession query failed:', supersedeError);  // ← logged, not blocked
}
// upsert proceeds anyway
```

Every BCL reimport with an existing active row hit the check-constraint error, logged it, and proceeded to upsert a new active row → two actives.

### Fix (both sites in plan-interpretation.ts)

```typescript
const { error: supersedeError, data: supersededRows } = await supabase
  .from('rule_sets')
  .update({ status: 'archived', updated_at: new Date().toISOString() })   // ← valid status
  .eq('tenant_id', tenantId)
  .neq('status', 'archived')                                                // ← matching filter
  .select('id, name, status');
if (supersedeError) {
  console.error('[SCI plan-interp] Supersession query failed — aborting upsert to prevent multi-active state:', supersedeError);
  return /* failed result */;                                                // ← BLOCKS upsert
}
```

### Before / After SQL query

**Before (multi-active state):**

```
BCL rule_sets:
  69aec3d5  status=active  created=2026-05-21T02:04:56  (newer)
  f8836be6  status=active  created=2026-05-21T02:03:55  (older)
```

**After running `scripts/hf244-supersede-duplicate-rulesets.ts`:**

```
═══ Tenant b1c2d3e4-aaaa-bbbb-cccc-111111111111 ═══
  Found 2 active rule_sets:
    69aec3d5-782f-44bd-9442-6a491c3e863b | "Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026" | created=2026-05-21T02:04:56.515378+00:00
    f8836be6-a7ad-4e4b-ae05-beaed299d393 | "Banco Cumbre del Litoral - Retail Banking Commission Plan 2025-2026" | created=2026-05-21T02:03:55.511082+00:00
  Keep:       69aec3d5-782f-44bd-9442-6a491c3e863b (newest)
  Superseded: f8836be6-a7ad-4e4b-ae05-beaed299d393

────────────────────────────────────────
Tenants with multi-active state: 1
Total rule_sets superseded:      1
```

**Post-cleanup verification:**

```
BCL rule_sets post-cleanup:
  69aec3d5  status=active    created=2026-05-21T02:04:56
  f8836be6  status=archived  created=2026-05-21T02:03:55
```

Exactly one active. The other now `archived`.

---

## Phase 4 — Verification

### Build verification (CC, local)

```
pkill -f "next dev"
rm -rf .next
npm run build    → ✓ Compiled successfully
npm run dev      → HTTP 307 at /
npx tsc --noEmit → clean (each phase verified independently)
```

### BCL runtime verification — architect-manual

The directive's runtime numbers (convergence log, componentTotals, grand total, T2 entity lines) require an architect-manual BCL October calculation through the browser:

1. Wipe BCL bindings:
   ```sql
   UPDATE rule_sets SET input_bindings = '{}'
   WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111' AND status = 'active';
   ```
   Or run `web/scripts/ob200-wipe-bcl-crp-bindings.ts`.

2. Trigger BCL October through the browser.

3. Capture from the server-side log:
   - Convergence lines for `cumplimiento_depositos` and `cumplimiento_colocacion` — `scale=…` should now be ABSENT (Phase 1 mutual exclusion).
   - `[CalcRecon-T1] componentTotals` line.
   - `Grand total` line.
   - 3 sample entity T2 lines (one Senior, two Ejecutivo).

4. Run `web/scripts/ob200-report-results.ts` to read calculation_results from the DB.

Expected post-HF-244 (Phase 1):

- `cumplimiento_depositos` binding: `scale_factor` field absent (was `scale_factor: 100`).
- Metric resolution: `cumplimiento_depositos = 1.282` (raw, no scale applied).
- Evaluator compare: `compare(gte, 1.282, 130)` → applies `meta.scale=100` to LHS → `128.2 vs 130` → false → falls to next tier.
- C1 total should match the GT range (`$10,170` to `$18,140` across periods) rather than the broken `$37,390` flat ceiling.

C0 remains incomplete until architect-manual reimport (Phase 2 only enforces at the next emission boundary — the truncated tree currently in `rule_sets.components` persists until replaced). On reimport, the LLM should emit `rateTableCellCount: 30`; if the tree still carries only 3 leaves, the validator will throw `UnconvertibleComponentError` and surface the truncation explicitly.

To be filled by architect after the manual run:

| Line | Value |
|---|---|
| `cumplimiento_depositos` binding `scale_factor` | _absent / value_ |
| `cumplimiento_colocacion` binding `scale_factor` | _absent / value_ |
| `[CalcRecon-T1] componentTotals` | _verbatim line_ |
| `Grand total` | _verbatim line_ |
| BCL-5003 (Senior Exec) T2 | _verbatim_ |
| BCL-5xxx Ejecutivo #1 T2 | _verbatim_ |
| BCL-5xxx Ejecutivo #2 T2 | _verbatim_ |

### Supersession verification (already complete)

```
BCL rule_sets:
  69aec3d5  status=active    created=2026-05-21T02:04:56
  f8836be6  status=archived  created=2026-05-21T02:03:55
```

### Validator verification — architect-manual

Inspect logs during the next BCL plan reimport. If the LLM emits `rateTableCellCount: 30` for C0 (Credit Placement) and the tree still has 3 leaves, expect:

```
[PrimeValidator] Credit Placement (critical) exhaustive_emission @ $: Plan declares 30 rate-table cells but the emitted tree carries only 3 constant leaves.
```

Followed by an UnconvertibleComponentError. If the LLM does NOT emit `rateTableCellCount` (HALT-1), the check silently passes — the prompt instruction needs reinforcement, but this is non-blocking for Phases 1 and 3.

---

## HALT conditions

| ID | Condition | Status |
|---|---|---|
| HALT-1 | LLM does not emit `rateTableCellCount` on rate-table components | TBD — first BCL reimport will surface this. Non-blocking for other phases. |
| HALT-2 | Mutual exclusion breaks legacy trees (no `meta`) | Cleared. HF-243 path is unchanged for trees without `meta`; route.ts:1326 still applies `scale_factor` from convergence in that path. |
| HALT-3 | Supersession UPDATE affects other tenants | Cleared. `.eq('tenant_id', tenantId)` is the first filter; cleanup script's UPDATE also keys on `id`. |
| HALT-4 | C1 total still $37,390 after Phase 1 | Pending architect-manual runtime verification. Phase 1 fixes the scaling pathway; if C1 still hits $37,390, the convergence binding shape itself may need inspection. |

---

## Files changed

Phase 1:
- `web/src/lib/intelligence/convergence-service.ts` (scoreColumnForRequirement scaleFactor: scale → scaleFactor: 1 when scaleMetadata present)

Phase 2:
- `web/src/lib/calculation/prime-grammar.ts` (prompt RATE-TABLE CELL DECLARATION section; exhaustive_emission severity warning → critical)
- `web/src/lib/compensation/ai-plan-interpreter.ts` (InterpretedComponent.rateTableCellCount; normalizeComponents read; convertComponent wires expectedCellCount)

Phase 3:
- `web/src/lib/sci/plan-interpretation.ts` (both supersession sites: status 'superseded' → 'archived'; .neq filter matched; supersedeError now blocks upsert)
- `web/scripts/hf244-supersede-duplicate-rulesets.ts` (new — cleanup script, run-once)

Phase 5:
- `docs/completion-reports/HF-244_COMPLETION_REPORT.md` (this file)

---

## Out of scope

- BCL clean-slate plan reimport through browser. Required for Phase 2 to fire on C0. Architect-manual.
- CRP verification (mutual exclusion may also affect CRP).
- Evaluator unit test suite (deferred from OB-200).
- Adding 'superseded' as a distinct status (vs. 'archived'). Future migration if needed.
