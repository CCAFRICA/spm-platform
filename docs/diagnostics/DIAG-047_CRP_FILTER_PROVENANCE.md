# DIAG-047: CRP Filter Provenance -- Signal Write Through Engine Application

**Type:** Read-only diagnostic (no modification)
**Predecessors:** DIAG-036 (metric population path, commit 95d80180 -- stale), DIAG-046 (confirmed `filters: []` in CRP Plan 1 metric_derivation), AUD-002 v2 (V-001 seeds violation, V-002 gate regression), HF-196 (D153 atomic cutover)
**Purpose:** Trace how a product_category filter flows (or fails to flow) through four pipeline stages: (1) LLM plan interpretation signal emission, (2) convergence signal consumption, (3) metric_derivation construction, (4) engine application at calc time. DIAG-036 traced this at commit 95d80180. Many HFs have landed since (HF-222 through HF-225 all modified route.ts and convergence-service.ts). This diagnostic reads current HEAD verbatim.
**Output:** Single consolidated file at `docs/diagnostics/DIAG-047_CRP_FILTER_PROVENANCE_OUTPUT.md`

## Standing rules (read first, every CC turn)

Read `CC_STANDING_ARCHITECTURE_RULES.md` in full. All rules apply.

Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act. Execute every phase sequentially. Commit after each phase. Push after each commit.

## Phase 0 -- Repo orientation and output file scaffold

Confirm working directory is VP repo root (`spm-platform`). Confirm on main post-HF-225 merge.

```bash
pwd
git checkout main
git pull origin main
git log --oneline -5
git rev-parse HEAD
```

Create the output file scaffold at `docs/diagnostics/DIAG-047_CRP_FILTER_PROVENANCE_OUTPUT.md`:

```markdown
# DIAG-047 -- CRP Filter Provenance Output

**Date:** [CC inserts]
**Branch:** [CC inserts]
**HEAD commit:** [CC inserts]
**Scope:** How does a product_category filter flow through signal write -> signal read -> derivation construction -> engine application?

CC pastes verbatim code at every section. No interpretation. No PASS/FAIL. No design proposals.
```

```bash
git checkout -b diag-047-crp-filter-provenance
mkdir -p docs/diagnostics
git add docs/diagnostics/DIAG-047_CRP_FILTER_PROVENANCE_OUTPUT.md
git commit -m "DIAG-047 Phase 0: output file scaffold"
git push origin diag-047-crp-filter-provenance
```

Paste `git log -1 --oneline` verbatim.

## Phase 1 -- Stage 1: What does the plan-comprehension-emitter write?

The signal writer is `plan-comprehension-emitter.ts`. DIAG-036 Surface 5.3 identified line 111 as the `persistSignalBatch` call site but did not read the full function body or the shape of signal_value being written.

### 1.1 Full file read

```bash
wc -l web/src/lib/compensation/plan-comprehension-emitter.ts
cat web/src/lib/compensation/plan-comprehension-emitter.ts
```

Paste full file verbatim. This is a small file (DIAG-036 Surface 6 showed ai-plan-interpreter.ts at 600 lines; the emitter is likely smaller). The full read answers:
- What is the shape of signal_value being persisted?
- Does signal_value include filter information (filters, product_category, operation, source_field)?
- Where does the emitter get its input from? (Is it the raw LLM interpretation output, or a processed/reduced form?)

### 1.2 What does the emitter receive as input?

From the full file read, identify where the emitter is called. Then read the caller to see what data flows into the emitter:

```bash
grep -rn "PlanComprehensionEmitter\|planComprehensionEmitter\|comprehensionEmitter\|emitComprehension\|emitPlanComprehension" web/src/ --include="*.ts" | grep -v node_modules | grep -v ".next"
```

For each call site, read 30 lines of context. Paste verbatim.

### 1.3 Read the actual CRP Plan 1 signal_value from the database

Write to `web/scripts/diag047-signal-content.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  // Find Capital Equipment plan rule_set
  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name, created_at')
    .eq('tenant_id', tenantId)
    .ilike('name', '%Capital Equipment%')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!ruleSets?.length) { console.log('No Capital Equipment rule_set found'); return; }

  const rsId = ruleSets[0].id;
  console.log(`Rule set: ${ruleSets[0].name} (${rsId}, created: ${ruleSets[0].created_at})`);

  // Read ALL classification_signals for this rule_set
  const { data: signals, error } = await supabase
    .from('classification_signals')
    .select('id, signal_type, signal_value, confidence, created_at')
    .eq('rule_set_id', rsId)
    .order('created_at', { ascending: true });

  if (error) { console.error('Error:', error); return; }

  console.log(`\nTotal signals for this rule_set: ${signals.length}`);
  for (const s of signals) {
    console.log('\n---');
    console.log(`signal_type: ${s.signal_type}`);
    console.log(`confidence: ${s.confidence}`);
    console.log(`signal_value: ${JSON.stringify(s.signal_value, null, 2)}`);
  }

  // Also check: does signal_value contain 'filter' or 'product_category' anywhere?
  for (const s of signals) {
    const sv = JSON.stringify(s.signal_value || {});
    if (sv.includes('filter') || sv.includes('product_category') || sv.includes('Capital Equipment')) {
      console.log(`\n>>> Signal ${s.id} CONTAINS filter/product_category/Capital Equipment reference`);
    }
  }
}

main();
```

Run:

```bash
cd web && npx tsx scripts/diag047-signal-content.ts 2>&1
cd ..
```

Paste full output verbatim.

Append all under `## Phase 1 -- Signal writer` in the output file.

```bash
git add docs/diagnostics/DIAG-047_CRP_FILTER_PROVENANCE_OUTPUT.md web/scripts/diag047-signal-content.ts
git commit -m "DIAG-047 Phase 1: signal writer analysis and CRP signal content"
git push origin diag-047-crp-filter-provenance
```

## Phase 2 -- Stage 2: How does convergence consume the signal?

The signal reader is `loadMetricComprehensionSignals` at convergence-service.ts (DIAG-036 Surface 5 documented lines 757-775). The consumption site is `convergeBindings` at line 199. But many HFs have modified convergence-service.ts since.

### 2.1 Read the current loadMetricComprehensionSignals function

```bash
grep -n "function loadMetricComprehensionSignals" web/src/lib/intelligence/convergence-service.ts
```

Read the full function body (from function declaration to closing brace). Paste verbatim.

### 2.2 Read how metricComprehensionSignals are consumed

The signals are loaded into `observations.metricComprehension`. Find every site in convergence-service.ts that reads `metricComprehension` or `observations.metricComprehension`:

```bash
grep -n "metricComprehension\|metric_comprehension_signal\|metricInputs" web/src/lib/intelligence/convergence-service.ts | head -30
```

For each hit that is a consumption site (not a comment or log), read 30 lines of context. Paste verbatim. The critical question: when convergence uses the signal to construct a derivation or binding, does it extract filter information from the signal_value?

### 2.3 Read all derivations.push sites

DIAG-036 Surface 7.5 documented derivation push sites at lines 278, 446, 456, 551, 2214 (at commit 95d80180). These have likely shifted. Find them on current HEAD:

```bash
grep -n "derivations\.push" web/src/lib/intelligence/convergence-service.ts
```

For each push site, read 20 lines of context. Paste verbatim. For each, document: does the push include a `filters` field? If yes, where does the filter value come from? If the filters field is `[]` (empty array literal), document that.

Append all under `## Phase 2 -- Signal consumption and derivation construction` in the output file.

```bash
git add docs/diagnostics/DIAG-047_CRP_FILTER_PROVENANCE_OUTPUT.md
git commit -m "DIAG-047 Phase 2: convergence signal consumption and derivation construction"
git push origin diag-047-crp-filter-provenance
```

## Phase 3 -- Stage 3: How does the engine apply filters from metric_derivations?

HF-172 (March 2026) fixed `applyMetricDerivations` to apply `rule.filters` for `sum` operations. This code is in route.ts. Many HFs have modified route.ts since.

### 3.1 Locate applyMetricDerivations

```bash
grep -n "function applyMetricDerivations\|applyMetricDerivations" web/src/app/api/calculation/run/route.ts | head -10
```

### 3.2 Read the full function body

Read from the function declaration to its closing brace. Paste verbatim. The critical questions:
- Does the `sum` branch read `rule.filters`?
- Does it call a `rowMatchesFilters` helper?
- Does the helper compare row values against filter predicates?
- If filters is empty (`[]`), does it skip filtering and sum all rows?

### 3.3 Read rowMatchesFilters if it exists

```bash
grep -n "function rowMatchesFilters\|rowMatchesFilters" web/src/app/api/calculation/run/route.ts | head -5
```

If found, read the full function body. Paste verbatim.

### 3.4 Where is applyMetricDerivations called?

```bash
grep -n "applyMetricDerivations" web/src/app/api/calculation/run/route.ts | head -10
```

Read 10 lines of context around each call site. Paste verbatim. Verify the function is called and its output actually reaches the entity's metrics map.

Append all under `## Phase 3 -- Engine filter application` in the output file.

```bash
git add docs/diagnostics/DIAG-047_CRP_FILTER_PROVENANCE_OUTPUT.md
git commit -m "DIAG-047 Phase 3: engine filter application path"
git push origin diag-047-crp-filter-provenance
```

## Phase 4 -- Stage 4: The AI prompt -- does it teach filter emission?

The plan interpretation prompt teaches the LLM how to express plan understanding. If the prompt doesn't teach the LLM to include filter information in its output, the emitter can't persist what the LLM didn't produce.

### 4.1 Search for filter-related guidance in the prompt

```bash
grep -n "filter\|product_category\|WHERE\|category\|subset\|segment.*data\|scope.*filter" web/src/lib/ai/providers/anthropic-adapter.ts | head -20
```

### 4.2 Read the metric_derivation / metricSemantics section of the prompt

```bash
grep -n "metricSemantics\|metric_semantics\|metric.*filter\|derivation.*filter\|filters.*field" web/src/lib/ai/providers/anthropic-adapter.ts | head -15
```

For each hit, read 30 lines of context. Paste verbatim. The critical question: does the prompt instruct the LLM to include filter predicates when a metric applies to a subset of transactions (e.g., only Capital Equipment transactions)?

### 4.3 Read the LLM's raw plan interpretation output for CRP Plan 1

The LLM's interpretation was saved as the rule_set's components. Read the full raw LLM output if it's persisted anywhere (e.g., in `import_batches.metadata`, or in the plan interpretation log):

```bash
grep -rn "raw.*interpretation\|llm.*output\|ai.*interpretation\|plan.*result" web/src/app/api/import/sci/execute/route.ts | head -10
```

If the raw LLM output is persisted, read it for CRP Plan 1 via a tsx script. If not persisted, document that.

Append all under `## Phase 4 -- Prompt filter guidance` in the output file.

```bash
git add docs/diagnostics/DIAG-047_CRP_FILTER_PROVENANCE_OUTPUT.md
git commit -m "DIAG-047 Phase 4: prompt filter guidance analysis"
git push origin diag-047-crp-filter-provenance
```

## Phase 5 -- Completion

Append to the output file:

```markdown
## Phase 5 -- DIAG-047 Complete

All four pipeline stages traced on current HEAD:
- Stage 1: What plan-comprehension-emitter writes to signal_value (does it include filters?)
- Stage 2: How convergence reads signals and constructs derivations (does it carry filters?)
- Stage 3: How the engine applies filters from metric_derivations (does HF-172 fix survive?)
- Stage 4: Does the prompt teach the LLM to emit filter predicates?

Plus: actual CRP Plan 1 signal_value content from the database (does it contain product_category filter information?).

CC does not interpret findings. Architect dispositions in architect channel.
```

```bash
git add docs/diagnostics/DIAG-047_CRP_FILTER_PROVENANCE_OUTPUT.md
git commit -m "DIAG-047 Phase 5: complete"
git push origin diag-047-crp-filter-provenance
```

Paste `git log -5 --oneline` verbatim.

Create the PR:

```bash
gh pr create --base main --head diag-047-crp-filter-provenance \
  --title "DIAG-047: CRP filter provenance -- signal write through engine application" \
  --body "Read-only diagnostic. Traces product_category filter through four pipeline stages: signal emission, convergence consumption, derivation construction, engine application. Reads current HEAD verbatim (post-HF-225). No code changes."
```

Paste the PR URL verbatim.

Kill dev server. `rm -rf .next`. `npm run build`. `npm run dev`. Confirm localhost:3000.

End of diagnostic.
