# HF-237 — CRP Plan 2 Quota Resolution + Plan 4 Scope Aggregate Closure

**Date:** 2026-05-19
**Authority:** DIAG-051 (PR #418, defects D1/D2/D3), AUD-010 (PR #417, engine capability confirmed)
**Branch:** `hf-237-plan2-plan4-closure`

---

## §0 — Standing Rules

`CC_STANDING_ARCHITECTURE_RULES.md` binds. Korean Test (T1-E910 v2): no registries, no hardcoded vocabulary lists. Carry Everything (T1-E902 v2): LLM comprehension persists faithfully. Vertical Slice (T2-E04): single PR.

---

## §1 — Phase 0: Branch + Plan 2 quota diagnostic

```bash
cd ~/spm-platform
git checkout main && git pull origin main
git checkout -b hf-237-plan2-plan4-closure
```

Dump the actual quota values the engine resolves for CRP Plan 2 entities. This identifies the Plan 2 delta source.

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  // Get Plan 2's metric_derivations to find quota derivation shape
  const { data: rs } = await sb
    .from('rule_sets')
    .select('input_bindings')
    .eq('tenant_id', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7')
    .eq('name', 'Consumables Commission Plan')
    .single();
  console.log('=== Plan 2 metric_derivations ===');
  const derivations = rs?.input_bindings?.metric_derivations || [];
  for (const d of derivations) {
    console.log(JSON.stringify(d));
  }

  // Get Plan 2's component calculationMethod to find targetValue / segments
  const { data: rs2 } = await sb
    .from('rule_sets')
    .select('components')
    .eq('tenant_id', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7')
    .eq('name', 'Consumables Commission Plan')
    .single();
  console.log('=== Plan 2 components (calculationMethod) ===');
  for (const c of (rs2?.components || [])) {
    console.log(JSON.stringify(c.calculationMethod || c.calculation_method, null, 2));
  }

  // Get sample entity's committed_data rows to check actual monthly_quota values
  const { data: rows } = await sb
    .from('committed_data')
    .select('row_data, metadata')
    .eq('tenant_id', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7')
    .like('metadata->>source_file', '%quota%')
    .limit(10);
  console.log('=== Sample quota rows in committed_data ===');
  for (const r of (rows || [])) {
    console.log(JSON.stringify(r.row_data));
  }

  // If no quota-file rows, check roster rows for monthly_quota column
  if (!rows || rows.length === 0) {
    const { data: rows2 } = await sb
      .from('committed_data')
      .select('row_data')
      .eq('tenant_id', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7')
      .not('row_data->>monthly_quota', 'is', null)
      .limit(10);
    console.log('=== Rows with monthly_quota column ===');
    for (const r of (rows2 || [])) {
      console.log(JSON.stringify(r.row_data));
    }
  }
})();
"
```

Paste all output. This tells us:
- What quota values exist in committed_data
- Whether Plan 2's component carries `targetValue` per variant
- Whether the `monthly_quota` derivation sums correctly against reference ($25K Senior / $18K Rep)

If the diagnostic reveals the delta source, fix inline in Phase 2. If it requires separate investigation, note it and proceed with Plan 4 closure.

---

## §2 — Phase 1: Plan 4 — Remove prompt vocabulary constraint on LLM

Read the plan interpretation prompt in the Anthropic adapter.

```bash
grep -rn "scope_aggregate\|source.*types\|allowed.*source\|valid.*source\|sourceType\|source_type" web/src/lib/ai/ web/src/lib/compensation/ai-plan-interpreter.ts | head -30
```

Then read the prompt template that defines what source types the LLM can emit. Paste the relevant section.

The fix: the LLM emits its comprehension of the plan's compensation structure without being constrained to an enumerated list of source types. The LLM should describe WHAT the plan says (aggregate across district entities, scope to region, etc.) and `convertComponent` translates to engine-native types.

Two approaches depending on what the prompt looks like:

**If the prompt enumerates allowed source types:** remove the enumeration. Let the LLM describe the data source in natural terms. `convertComponent` does the translation.

**If the prompt uses a response schema with a fixed union type:** widen the schema to accept the LLM's natural description and move the type narrowing to `convertComponent`.

In both cases: `convertComponent` must handle `scope_aggregate` translation. Read `convertComponent` as it exists. If it has no case for scope_aggregate, add one:

- LLM says anything indicating scope-level aggregation across entities within a group (district/region/team) → emit `source: 'scope_aggregate'` with `sourceSpec: { field: <metric>, aggregation: <sum|count|avg>, scope: <district|region|team> }`
- If the LLM emits a concept `convertComponent` has no engine primitive for → structured failure. Log the LLM's original emission verbatim. DO NOT silently downgrade to a known primitive.

Add the structured failure path:
```typescript
// HF-237: Per T1-E910 v2, structured failure on unrecognized source type.
// Preserve LLM's original emission for architect review.
console.error(`[PLAN-INTERPRET] Unrecognized source concept from LLM: ${JSON.stringify(llmSource)}. No engine primitive mapped. Plan component will not calculate.`);
```

Build and commit:
```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build && echo "BUILD: $?"
cd ~/spm-platform && git add -A && git commit -m "HF-237 Phase 1: remove prompt vocabulary constraint; convertComponent handles scope_aggregate; structured failure on unrecognized" && git push origin hf-237-plan2-plan4-closure
```

---

## §3 — Phase 2: Plan 4 — Ensure derivations persist for cross-plan resolution (D3)

DIAG-051 Probe 2C: Plans 1, 3, 4 have zero `metric_derivations` in `input_bindings`. Plan 1's convergence log shows Pass 5 DOES produce derivations at calc time (`period_equipment_revenue → sum(total_amount) filters=[product_category=Capital Equipment]`), but they don't persist to `input_bindings`.

Read the convergence write-back path:
```bash
grep -n "metric_derivations\|input_bindings.*update\|derivations.*write\|persistBindings\|saveConvergence" web/src/lib/intelligence/convergence-service.ts web/src/app/api/calculation/run/route.ts | head -30
```

Find where calc-time convergence results get written back to `rule_sets.input_bindings`. Paste the code. If derivations are NOT being persisted (only component_bindings are persisted), that's D3's root cause — the write-back path drops derivations.

Fix: ensure `metric_derivations` from convergence (including filters) persist to `input_bindings` alongside component_bindings. The next calc run for Plan 4 then finds Plan 1's `equipment_revenue` derivation via OB-186 cross-plan resolution.

Build and commit:
```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build && echo "BUILD: $?"
cd ~/spm-platform && git add -A && git commit -m "HF-237 Phase 2: persist metric_derivations to input_bindings on convergence write-back" && git push origin hf-237-plan2-plan4-closure
```

---

## §4 — Phase 3: Plan 4 — Re-import plan PDF to regenerate intent

After Phase 1's prompt fix, CRP's District Override Plan needs re-interpretation to emit the correct intent shape. The existing stored intent has `source: 'aggregate'` (D1) with wrong keys (D2). Re-importing the plan PDF through the updated prompt + `convertComponent` produces the corrected intent.

If CRP's plan PDFs are accessible, re-import the District Override Plan via the UI.

If re-import is an architect action, note it and proceed to Phase 4.

---

## §5 — Phase 4: Plan 2 fix (conditional on Phase 0 findings)

Based on Phase 0's diagnostic output:

- If the delta is caused by incorrect `targetValue` or missing variant-specific quotas: fix the component's `calculationMethod` to carry the correct values, or fix the derivation path that resolves `monthly_quota`.
- If the delta is caused by the engine summing `monthly_quota` across rows instead of reading a single quota value per entity: fix the aggregation logic for quota metrics.
- If the delta requires further investigation: document findings and carry forward.

Build and commit whatever fix Phase 0 evidence supports.

---

## §6 — Phase 5: Recalculate + Build + PR

```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build && echo "FINAL BUILD: $?"
```

```bash
cd ~/spm-platform
gh pr create --base main --head hf-237-plan2-plan4-closure \
  --title "HF-237: CRP Plan 2 quota resolution + Plan 4 scope_aggregate closure" \
  --body "Closes DIAG-051 defects D1/D2/D3.

Phase 1: Plan interpretation prompt no longer constrains LLM source vocabulary. convertComponent handles scope_aggregate. Structured failure (T1-E910 v2) on unrecognized concepts — never silent downgrade.

Phase 2: Convergence metric_derivations persist to input_bindings on write-back. Cross-plan resolution (OB-186) can now find sibling plans' filtered derivations.

Phase 3: District Override Plan re-interpreted with corrected prompt.

Phase 4: Plan 2 quota resolution fix (per Phase 0 diagnostic findings).

Verification: CRP Plan 2 reconciliation against \$60,328.79 (2 periods). CRP Plan 4 reconciliation against \$136,530.42 (2 periods)."
```

---

## §7 — Completion Report

Path: `docs/completion-reports/HF-237_COMPLETION_REPORT.md`

Structure per Rule 26:
- Date, PR, commits table
- Files modified table
- Phase 0 diagnostic findings (Plan 2 quota values vs reference)
- Substrate citations (T1-E902 v2, T1-E910 v2, T2-E06 v2)
- Proof gates (each phase build, grep evidence for prompt change, grep evidence for derivation persistence, grep evidence for structured failure path)
- Standing rule compliance
- Known issues
- Next steps (architect recalculates CRP Plans 2+4, reconciles)

```bash
git add docs/completion-reports/HF-237_COMPLETION_REPORT.md
git commit -m "HF-237: completion report per Rule 25"
git push origin hf-237-plan2-plan4-closure
```

Report PR URL, Phase 0 diagnostic output verbatim, and completion report content.
