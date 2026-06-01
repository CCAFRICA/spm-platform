# DIAG-049 — Post-HF-234 Convergence Pipeline State Extraction

**Status:** ACTIVE
**Type:** Diagnostic, read-only (Phase 0)
**Scope:** Extract the current code at every point in the convergence pipeline that touches categorical fields, capabilities, and Pass 4 inputs. Verify what HF-234's removal of the categorical aggregation loop affected.
**Predecessor:** HF-234 (PR #412), HF-228 (PR #406), AUD-009 (LLM output fidelity)
**Context:** Post-HF-234, Pass 4 fires but produces 0 derivations (gaps) or filter-less derivations. Pre-HF-234, Pass 4 produced correct filter derivations. The code changed. This DIAG extracts the current code to identify what changed.

---

## STANDING RULES

1. **Read-only. No code changes. No migrations. No fixes.**
2. After EVERY phase: `git add -A && git commit -m "DIAG-049 Phase N: [description]" && git push origin diag-049-post-hf234-convergence-state`
3. Git from repo root (spm-platform), NOT from web/.
4. Read `CC_STANDING_ARCHITECTURE_RULES.md` before any operations.
5. **DO NOT INTERPRET FINDINGS.** Paste code verbatim. Paste data verbatim. Architect interprets.

---

## BRANCH SETUP

```bash
cd ~/spm-platform
git fetch origin
git checkout main && git pull origin main
git checkout -b diag-049-post-hf234-convergence-state
git add -A && git commit --allow-empty -m "DIAG-049 Phase 0: branch setup" && git push -u origin diag-049-post-hf234-convergence-state
```

---

## Phase 1 — generateAllComponentBindings: categorical field collection and aggregation

### 1.1 Read the FULL function body of generateAllComponentBindings

```bash
grep -n "function generateAllComponentBindings" web/src/lib/intelligence/convergence-service.ts
```

Read the ENTIRE function from declaration to closing brace. Paste verbatim with line numbers. This is the function that builds capabilities, matches components, collects categorical fields, and builds measureColumns.

**Critical questions this answers:**
- Where are `cap.categoricalFields` populated (HF-227 line 1110)?
- Is there a categorical aggregation loop that feeds Call 1? (HF-234 removed it)
- Is there a cross-source categorical field loop from HF-228? Does it still exist?
- What categorical data reaches the `capabilities` array that is passed to Pass 4?

### 1.2 Find every reference to categoricalFields in the file

```bash
grep -n "categoricalFields\|categorical" web/src/lib/intelligence/convergence-service.ts
```

Paste ALL hits with line numbers. This shows every point where categorical fields are read, written, or referenced.

Append under `## Phase 1 — generateAllComponentBindings categorical fields` in output file.

```bash
git add docs/diagnostics/DIAG-049_POST_HF234_CONVERGENCE_STATE_OUTPUT.md
git commit -m "DIAG-049 Phase 1: generateAllComponentBindings categorical field collection"
git push origin diag-049-post-hf234-convergence-state
```

---

## Phase 2 — convergeBindings: capabilities flow from construction to Pass 4

### 2.1 Read the convergeBindings function — the orchestrator

```bash
grep -n "function convergeBindings\|async function convergeBindings" web/src/lib/intelligence/convergence-service.ts
```

Read from declaration through the Pass 4 invocation. Paste verbatim. Show:
- Where `capabilities` is constructed (from `inventoryData` or `matchComponentsToData`)
- Where `capabilities` is passed to `generateAllComponentBindings`
- Where `capabilities` is passed to `generateAISemanticDerivations` (Pass 4)
- Are these the SAME capabilities object, or does one get a subset?

### 2.2 Read the Pass 4 invocation site

Find where `generateAISemanticDerivations` is called:

```bash
grep -n "generateAISemanticDerivations" web/src/lib/intelligence/convergence-service.ts
```

Read 40 lines of context around the call. Paste verbatim. Show:
- What arguments are passed (especially the capabilities parameter)
- What `metricContexts` are passed (the metric list)
- Is `hasCategoricalData` computed from the same capabilities?

Append under `## Phase 2 — convergeBindings capabilities flow` in output file.

```bash
git add docs/diagnostics/DIAG-049_POST_HF234_CONVERGENCE_STATE_OUTPUT.md
git commit -m "DIAG-049 Phase 2: convergeBindings capabilities flow to Pass 4"
git push origin diag-049-post-hf234-convergence-state
```

---

## Phase 3 — inventoryData: what capabilities does it produce?

### 3.1 Read the FULL function body of inventoryData

```bash
grep -n "function inventoryData\|async function inventoryData" web/src/lib/intelligence/convergence-service.ts
```

Read the ENTIRE function. Paste verbatim. Show:
- How `categoricalFields` are populated on each DataCapability
- Whether the HF-228 schema-aware sampling change affects categorical field discovery
- What the cap at 30/50 rows means for categorical field detection

### 3.2 Runtime verification — what capabilities exist for CRP right now

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

  // Replicate what inventoryData does
  const { data: allRows } = await sb
    .from('committed_data')
    .select('data_type, row_data')
    .eq('tenant_id', tenantId)
    .not('row_data', 'is', null)
    .limit(500);

  const byType = new Map();
  for (const r of allRows || []) {
    if (!byType.has(r.data_type)) byType.set(r.data_type, []);
    byType.get(r.data_type).push(r.row_data);
  }

  for (const [dt, rows] of byType.entries()) {
    console.log('\\ndata_type=' + JSON.stringify(dt) + ' (' + rows.length + ' rows):');

    // Categorical fields — fields with string values and <20 distinct
    const catFields = [];
    const allCols = new Set();
    for (const rd of rows) {
      if (rd && typeof rd === 'object') {
        for (const k of Object.keys(rd)) allCols.add(k);
      }
    }

    for (const col of allCols) {
      if (col.startsWith('_')) continue;
      const vals = rows.map(r => r[col]).filter(v => typeof v === 'string');
      const distinct = [...new Set(vals)];
      if (distinct.length > 0 && distinct.length <= 20) {
        catFields.push({ field: col, distinctCount: distinct.length, values: distinct });
      }
    }

    if (catFields.length > 0) {
      console.log('  categorical fields (' + catFields.length + '):');
      for (const cf of catFields) {
        console.log('    ' + cf.field + ' (' + cf.distinctCount + ' values): ' + JSON.stringify(cf.values));
      }
    } else {
      console.log('  categorical fields: NONE');
    }

    // Numeric fields
    const numFields = [];
    for (const col of allCols) {
      if (col.startsWith('_')) continue;
      const vals = rows.map(r => r[col]).filter(v => typeof v === 'number');
      if (vals.length > rows.length * 0.3) {
        numFields.push(col);
      }
    }
    console.log('  numeric fields: ' + (numFields.length > 0 ? numFields.join(', ') : 'NONE'));
  }
})();
"
```

Paste complete output verbatim. This shows what categorical fields EXIST in the data right now.

Append under `## Phase 3 — inventoryData capabilities` in output file.

```bash
git add docs/diagnostics/DIAG-049_POST_HF234_CONVERGENCE_STATE_OUTPUT.md
git commit -m "DIAG-049 Phase 3: inventoryData capabilities and runtime verification"
git push origin diag-049-post-hf234-convergence-state
```

---

## Phase 4 — generateAISemanticDerivations: current prompt construction

### 4.1 Read the FULL current function body

```bash
grep -n "function generateAISemanticDerivations\|async function generateAISemanticDerivations" web/src/lib/intelligence/convergence-service.ts
```

Read the ENTIRE function from declaration to closing brace. Paste verbatim with line numbers.

Compare against AUD-009 Phase 3.4 (pre-HF-228/234 version). Identify any differences in:
- How `columnDescriptions` are built
- Whether `cap.categoricalFields` is still iterated at line ~2632
- Whether sample data query changed
- Whether the prompt text changed

### 4.2 Read the metricContexts construction

Find where `MetricContext[]` is built before being passed to Pass 4:

```bash
grep -n "MetricContext\|metricContexts\|metricContext" web/src/lib/intelligence/convergence-service.ts | head -20
```

Read the construction code. Paste verbatim. Show what `name`, `label`, `operation`, `semanticIntent`, `metricInputs` values are populated for each metric.

Append under `## Phase 4 — generateAISemanticDerivations current state` in output file.

```bash
git add docs/diagnostics/DIAG-049_POST_HF234_CONVERGENCE_STATE_OUTPUT.md
git commit -m "DIAG-049 Phase 4: generateAISemanticDerivations current prompt"
git push origin diag-049-post-hf234-convergence-state
```

---

## Phase 5 — Diff: what HF-228 and HF-234 actually changed in the convergence file

### 5.1 HF-228 changes to convergence-service.ts

```bash
git log --oneline --all | grep -i "hf-228\|hf228" | head -5
git diff eba2cfc4^..eba2cfc4 -- web/src/lib/intelligence/convergence-service.ts | head -200
```

If the merge commit hash doesn't work, find the HF-228 merge:

```bash
git log --oneline | grep -i "228" | head -5
```

Then diff the merge against its parent for convergence-service.ts only. Paste the diff verbatim (first 200 lines). This shows exactly what HF-228 added to the categorical field handling.

### 5.2 HF-234 changes to convergence-service.ts

```bash
git log --oneline | grep -i "234" | head -5
```

Diff the HF-234 merge against its parent:

```bash
git diff <HF234_MERGE_SHA>^..<HF234_MERGE_SHA> -- web/src/lib/intelligence/convergence-service.ts | head -200
```

Paste the diff verbatim. This shows exactly what HF-234 removed and what it preserved.

Append under `## Phase 5 — HF-228 and HF-234 diffs` in output file.

```bash
git add docs/diagnostics/DIAG-049_POST_HF234_CONVERGENCE_STATE_OUTPUT.md
git commit -m "DIAG-049 Phase 5: HF-228 and HF-234 convergence diffs"
git push origin diag-049-post-hf234-convergence-state
```

---

## Output file specification

**Path:** `docs/diagnostics/DIAG-049_POST_HF234_CONVERGENCE_STATE_OUTPUT.md`

**Self-check before commit:**
1. ☐ Every section contains verbatim code or data — no paraphrase
2. ☐ No PASS/FAIL claims
3. ☐ No fix proposals
4. ☐ No source files modified
5. ☐ Line numbers included for all code pastes

---

## PR

```bash
gh pr create --base main --head diag-049-post-hf234-convergence-state \
  --title "DIAG-049: Post-HF-234 convergence pipeline state extraction" \
  --body "Read-only diagnostic extracting current convergence-service.ts state after HF-228 and HF-234 modifications. Five phases: generateAllComponentBindings categorical field collection, convergeBindings capabilities flow, inventoryData capabilities, generateAISemanticDerivations current prompt, and HF-228/HF-234 diffs. No code changes."
```

HALT after PR. Architect interprets findings.
