# DIAG-051 — CRP Plan 2 + Plan 4 Failure Surface Diagnostic

**Date:** 2026-05-19
**Type:** Read-only diagnostic. No code modifications.
**Locus:** CCAFRICA/spm-platform, branch main (post-PR #417 merge)
**Branch:** `diag-051-crp-plan2-plan4`

---

## §0 — Standing Rules

`CC_STANDING_ARCHITECTURE_RULES.md` binds. Rule 27 (evidence = paste).

---

## §1 — Phase 0: Branch

```bash
cd ~/spm-platform
git checkout main && git pull origin main
git checkout -b diag-051-crp-plan2-plan4
git log --oneline -3
```

Paste output.

---

## §2 — Probe 1: Plan 2 metric derivation filter application

The audit (AUD-010 Stage 5A) identified the Plan 2 January delta ($3,244.03) as "consistent with unfiltered numerator." Convergence produces `consumable_revenue → sum(total_amount) filters=[product_category=Consumables]`. The question: does `resolveMetricsFromConvergenceBindings` at `web/src/app/api/calculation/run/route.ts` apply that filter when summing entity rows, or sum all `total_amount` regardless?

**Probe 1A:** Read the metric derivation application code.

```bash
grep -n "applyMetricDerivation\|rowMatchesFilter\|derivation.*filter\|filters.*length" web/src/app/api/calculation/run/route.ts | head -30
```

Then read the function that applies derivations to entity rows. Paste the complete function body — specifically the block where `filters` from the derivation rule are checked against each row.

**Probe 1B:** Dump CRP Plan 2's live `input_bindings` to see the exact derivation shape the engine receives.

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb
    .from('rule_sets')
    .select('id, name, input_bindings')
    .eq('tenant_id', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7')
    .eq('name', 'Consumables Commission Plan')
    .single();
  console.log(JSON.stringify(data, null, 2));
})();
"
```

Paste the full output. Key question: does `input_bindings.metric_derivations` carry `filters` arrays with content, or are they `[]`?

**Probe 1C:** Dump the live `convergence_bindings` for Plan 2 (if stored separately from `input_bindings`).

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb
    .from('rule_sets')
    .select('id, name, convergence_bindings')
    .eq('tenant_id', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7')
    .eq('name', 'Consumables Commission Plan')
    .single();
  console.log(JSON.stringify(data?.convergence_bindings, null, 2));
})();
"
```

Paste output. If `convergence_bindings` doesn't exist as a column, note that — the bindings may be inside `input_bindings`.

---

## §3 — Probe 2: Plan 4 failure surface disambiguation

The audit (AUD-010 Stage 5B) identified three possible failure surfaces for Plan 4's $0 output. These probes disambiguate.

**Probe 2A:** Dump CRP Plan 4's live `input_bindings` (the calculationIntent shape the engine receives).

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb
    .from('rule_sets')
    .select('id, name, input_bindings, components')
    .eq('tenant_id', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7')
    .eq('name', 'District Override Plan')
    .single();
  console.log('=== input_bindings ===');
  console.log(JSON.stringify(data?.input_bindings, null, 2));
  console.log('=== components ===');
  console.log(JSON.stringify(data?.components, null, 2));
})();
"
```

Paste full output. Key questions: does the component's calculationMethod reference `scope_aggregate` as an IntentSource? Is it wrapped in `scalar_multiply`? What metric names does the intent reference?

**Probe 2B:** Dump a sample DM entity's metadata to check for `district` field.

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb
    .from('entities')
    .select('external_id, name, metadata')
    .eq('tenant_id', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7')
    .in('external_id', ['CRP-6003', 'CRP-6004', 'CRP-6005', 'CRP-6006', 'CRP-6001', 'CRP-6002']);
  for (const e of (data || [])) {
    console.log(e.external_id, e.name, JSON.stringify(e.metadata));
  }
})();
"
```

Paste output. Key question: does `metadata` contain `district` and/or `region` fields? The scope aggregate code at `route.ts:2345-2397` reads `entityMetadata.district` and `entityMetadata.region`.

**Probe 2C:** Dump the cross-plan derivations that OB-186 resolution found for Plan 4.

The calc log showed `OB-186: Cross-plan metric resolution — 1 derivations from other plans` for January and `5 derivations from other plans` for February. Dump all plans' `input_bindings.metric_derivations` to see what keys exist:

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb
    .from('rule_sets')
    .select('name, input_bindings')
    .eq('tenant_id', 'e44bbcb1-2710-4880-8c7d-a1bd902720b7');
  for (const rs of (data || [])) {
    const derivations = rs.input_bindings?.metric_derivations || rs.input_bindings?.convergence_bindings?.metric_derivations || [];
    console.log('---', rs.name, '---');
    for (const d of derivations) {
      console.log('  metric:', d.metric_name || d.metricName, '→', d.source_column || d.sourceColumn, 'agg:', d.aggregation, 'filters:', JSON.stringify(d.filters));
    }
  }
})();
"
```

Paste output. Key question: what metric names do the other plans' derivations carry, and does Plan 4's intent reference those same names?

---

## §4 — Output

Single diagnostic document: `docs/diagnostics/DIAG-051_CRP_PLAN2_PLAN4_FAILURE_SURFACE_20260519.md`

Structure:
- Probe 1 findings (Plan 2): pasted code for filter application logic + pasted input_bindings + assessment of whether filters are being applied
- Probe 2 findings (Plan 4): pasted calculationIntent + pasted entity metadata + pasted cross-plan derivations + identification of which failure surface(s) are operative

Commit and push:
```bash
git add docs/diagnostics/DIAG-051_CRP_PLAN2_PLAN4_FAILURE_SURFACE_20260519.md
git commit -m "DIAG-051: CRP Plan 2 + Plan 4 failure surface diagnostic"
git push origin diag-051-crp-plan2-plan4
```

---

## §5 — Completion Report

Author completion report BEFORE final push:

Path: `docs/completion-reports/DIAG-051_COMPLETION_REPORT.md`

Structure per Rule 26:
- Date, PR link, commit hash
- Files created table (diagnostic document + this report)
- Probe results summary table (Probe 1A/1B/1C, Probe 2A/2B/2C — one-line finding per probe)
- Standing rule compliance block (Rule 1, 6, 18, 27, 41)
- Known issues (if any path corrections needed)
- No next steps — architect dispositions

```bash
git add docs/completion-reports/DIAG-051_COMPLETION_REPORT.md
git commit -m "DIAG-051: completion report per Rule 25"
git push origin diag-051-crp-plan2-plan4
gh pr create --base main --head diag-051-crp-plan2-plan4 \
  --title "DIAG-051: CRP Plan 2 + Plan 4 failure surface diagnostic" \
  --body "Read-only diagnostic. Probes Plan 2 input_bindings for filter presence and Plan 4 calculationIntent/entity metadata for scope_aggregate failure surface disambiguation. No code modifications."
```

Report PR URL and paste the full diagnostic document content.
