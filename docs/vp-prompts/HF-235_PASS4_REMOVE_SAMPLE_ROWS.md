# HF-235: PASS 4 PROMPT — REMOVE NON-DETERMINISTIC SAMPLE ROWS

## Governance

- **Predecessor:** HF-234 (PR #412, separation of concerns — Call 1 maps columns, Pass 4 derives filters), DIAG-049 (PR #413, post-HF-234 convergence state extraction)
- **Governing decisions:** D111 (convergence_bindings sole structural output), D153 LOCKED (signal surface), D154 LOCKED (Korean Test)
- **Defect evidence:** Post-HF-234, Pass 4 fires for ALL metrics (`hasCategoricalData=true`) but produces 0 derivations (gaps) or filter-less derivations (`filters=[]`). DIAG-049 confirmed: column descriptions correctly include `product_category: categorical (values: Capital Equipment, Consumables)`. But the 3-row sample query (`.limit(3)`, no data_type filter, no ordering) returns random rows that may be roster/entity data with no product_category or total_amount. The sample contradicts the column descriptions and confuses the AI.

## Why This HF Exists

HF-234 established the separation of concerns: Call 1 maps columns (structural). Pass 4 derives metrics with qualifications (contextual). This is the complementary fix to HF-234 — Pass 4 should focus on filter derivation from column metadata, not on re-observing raw data.

Pass 4's job is semantic reasoning: given a metric name ("Equipment Revenue") and column metadata (`product_category: categorical [Capital Equipment, Consumables]`, `total_amount: numeric`), produce a derivation rule with the correct filter.

The column descriptions from `capabilities` contain everything Pass 4 needs:
- Numeric column names with stats (avg, min, max)
- Categorical column names with ALL distinct values
- Boolean column names with true/false labels
- Data type grouping (transaction, entity, target)

The 3-row sample adds nothing to filter reasoning. The AI doesn't need to see a row with `{product_category: "Capital Equipment", total_amount: 45000}` to understand that "Equipment Revenue" = `sum(total_amount) WHERE product_category = Capital Equipment`. The column descriptions already state that `product_category` has the value `Capital Equipment`.

The sample is actively harmful:
- **Non-deterministic:** `.limit(3)` with no ordering returns whatever Supabase returns first. Different rows on different runs.
- **Cross-data-type contamination:** No `data_type` filter. Returns roster rows, quota rows, or transaction rows randomly. Roster rows have no product_category — contradicts column descriptions.
- **Prompt pollution:** 3 full JSON row objects consume tokens that could be used for better metric context or more column detail.
- **Root cause of P1/P3/P4 regression:** When sample rows happen to include Capital Equipment transactions, the AI produces the filter. When they don't, the AI produces a gap. Same data, same prompt, different results.

## What Changes (1 file, ~15 lines removed)

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Function:** `generateAISemanticDerivations` (line 2622)

### Change 1: Remove the sample rows query

Remove lines 2650-2663:

```typescript
// REMOVE — HF-235:
// 2. Get sample rows
// HF-196 Phase 1E: filter out superseded batches per Rule 30.
const { fetchSupersededBatchIds: fetchSupersededBatchIds2 } = await import('@/lib/sci/import-batch-supersession');
const supersededIds3 = await fetchSupersededBatchIds2(supabase, tenantId);
let q3 = supabase
  .from('committed_data')
  .select('row_data')
  .eq('tenant_id', tenantId)
  .not('row_data', 'is', null)
  .limit(3);
if (supersededIds3.length > 0) q3 = q3.not('import_batch_id', 'in', `(${supersededIds3.join(',')})`);
const { data: sampleRows } = await q3;

const sampleData = (sampleRows || []).map(r => r.row_data);
```

### Change 2: Remove the sample data from the prompt

Remove from the userPrompt template (lines 2748-2749):

```typescript
// REMOVE — HF-235:
Data sample (first ${sampleData.length} rows):
${JSON.stringify(sampleData, null, 2)}
```

### Change 3: Update the prompt closing instruction

The current closing line says: "Generate derivation rules for each required metric. Use filters to narrow broad fields to specific subsets when the metric label implies a category."

Keep this line — it correctly instructs the AI to use filters. The column descriptions provide the categorical values needed.

### What this preserves

- Column descriptions from `capabilities` — unchanged, complete, deterministic
- Metric descriptions with labels, operations, semantic intent, plan-agent context — unchanged
- The AI prompt instructions about filter usage — unchanged
- The AI response parser — unchanged
- The `temperature: 0` setting — unchanged

### What this eliminates

- The `.limit(3)` query — no more non-deterministic DB read at convergence time
- The `sampleData` JSON in the prompt — no more cross-data-type contamination
- The `fetchSupersededBatchIds2` import — one fewer async import in the function
- ~15 lines of code and one DB query per convergence run

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Final step: `gh pr create --base main --head hf-235-pass4-remove-sample-rows` with descriptive title+body
5. Commit this prompt to git as first action.
6. Read `CC_STANDING_ARCHITECTURE_RULES.md` before any code changes.
7. **Every proof gate requires pasted evidence — code, terminal output, or grep results. PASS/FAIL self-attestation is NOT accepted.**

---

## PHASE 0: DIAGNOSTIC (5 min)

```bash
cd ~/spm-platform
git fetch origin
git checkout main && git pull origin main
git checkout -b hf-235-pass4-remove-sample-rows
```

### 0A: Read the current sample query and prompt injection

```bash
grep -n "sampleRows\|sampleData\|limit(3)\|Data sample\|first.*rows" web/src/lib/intelligence/convergence-service.ts | head -10
```

Read 20 lines of context around each hit. Paste verbatim. Confirm the sample query location and the prompt injection location.

### 0B: Confirm column descriptions are built independently of sample rows

```bash
grep -n "columnDescriptions" web/src/lib/intelligence/convergence-service.ts | head -10
```

Confirm `columnDescriptions` is built from `capabilities` (line 2635-2648), NOT from `sampleData`. Paste evidence.

**Proof gate 0 (IMMUTABLE):**
```
□ Sample query location identified (paste lines)
□ Prompt injection location identified (paste lines)
□ columnDescriptions built from capabilities, not sampleData (paste evidence)
```

**Commit:** `git add -A && git commit -m "HF-235 Phase 0: diagnostic — sample rows in Pass 4 prompt" && git push origin hf-235-pass4-remove-sample-rows`

---

## PHASE 1: REMOVE SAMPLE ROWS (10 min)

**File:** `web/src/lib/intelligence/convergence-service.ts`

### 1A: Remove the sample query block

Delete the entire sample rows section: the import of `fetchSupersededBatchIds2`, the query construction, the `sampleData` mapping. Replace with a comment:

```typescript
// HF-235: Sample rows REMOVED from Pass 4 prompt.
// Column descriptions from capabilities provide complete metadata
// (numeric stats, categorical distinct values, boolean labels) —
// sufficient for filter derivation. The previous 3-row sample
// was non-deterministic (.limit(3), no ordering, no data_type filter)
// and could contradict the column descriptions by returning rows
// from a different data_type than the metrics reference.
```

### 1B: Remove the sample data from the prompt template

In the `userPrompt` template string, remove the lines:

```
Data sample (first ${sampleData.length} rows):
${JSON.stringify(sampleData, null, 2)}
```

Ensure no dangling reference to `sampleData` remains in the function.

### 1C: Verify no other references to sampleData

```bash
grep -n "sampleData\|sampleRows" web/src/lib/intelligence/convergence-service.ts
```

Must return 0 hits (or only the HF-235 comment).

**Proof gate 1 (IMMUTABLE):**
```
□ Sample query block removed (paste the removed lines or the replacement comment)
□ Sample data removed from prompt template (paste the prompt section before/after)
□ Zero remaining references to sampleData/sampleRows:
    grep -n "sampleData\|sampleRows" web/src/lib/intelligence/convergence-service.ts
    Must return 0 functional hits
□ npm run build exits 0
```

**Commit:** `git add -A && git commit -m "HF-235 Phase 1: remove non-deterministic sample rows from Pass 4 prompt" && git push origin hf-235-pass4-remove-sample-rows`

---

## PHASE 2: CLEAR BINDINGS + COMPLETION REPORT + PR (5 min)

### 2A: Clear CRP input_bindings

```bash
cd ~/spm-platform/web
npx tsx --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const tenantId = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';
  const { data, error } = await sb
    .from('rule_sets')
    .update({ input_bindings: {} })
    .eq('tenant_id', tenantId)
    .select('id, name');
  console.log('Cleared ' + (data?.length || 0) + ' rule_sets');
  for (const rs of data || []) console.log('  ' + rs.name);
})();
"
```

### 2B: Write completion report

Write to `docs/completion-reports/HF-235_COMPLETION_REPORT.md` per Rules 25-28.

### 2C: Final build + PR

```bash
cd ~/spm-platform && rm -rf web/.next && cd web && npm run build
echo "BUILD EXIT: $?"
```

```bash
gh pr create --base main --head hf-235-pass4-remove-sample-rows \
  --title "HF-235: Remove non-deterministic sample rows from Pass 4 prompt" \
  --body "Removes the .limit(3) committed_data query and its JSON injection from the Pass 4 (generateAISemanticDerivations) prompt. Column descriptions from capabilities are complete and sufficient for filter derivation — they include numeric stats, categorical distinct values, and boolean labels. The sample rows were non-deterministic (no ordering, no data_type filter) and could contradict the column descriptions by returning rows from a different data_type. This caused Pass 4 to produce gaps or filter-less derivations depending on which 3 rows Supabase returned. Companion to HF-234 (Call 1 maps columns, Pass 4 derives filters) — together they establish clean separation: Call 1 uses column names only, Pass 4 uses column metadata only."
```

HALT after PR creation. Architect calculates all four CRP plans. Pass 4 should now consistently produce filter derivations because the prompt contains only deterministic column metadata.

---

## SCOPE BOUNDARY

- **Do NOT modify** the column descriptions construction (lines 2635-2648) — correct and complete
- **Do NOT modify** the metric descriptions construction — correct
- **Do NOT modify** the prompt instructions about filter usage — correct
- **Do NOT modify** the AI response parser — correct
- **Do NOT modify** the `temperature: 0` setting — correct
- **Do NOT modify** any other file

## ANTI-PATTERNS

**AP-1: Replacing the sample with a "better" sample.** The fix is removing the sample, not fixing it. If you find yourself writing a new query to get "representative" rows, STOP. Column descriptions are sufficient.

**AP-2: Adding sample data from capabilities.** The capabilities already contribute column descriptions. Adding sample values from capabilities is redundant. STOP.
