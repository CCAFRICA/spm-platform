# HF-196 Phase 5-RESET-3 — Re-import + Progressive Performance Measurement

# Continuation of HF-196 vertical slice
# Branch: hf-196-platform-restoration-vertical-slice (HEAD: 70e28a40 Phase 1D)
# Date: 2026-05-02

---

## SUBSTRATE GROUNDING

Memory entry 30 (constitutional, locked 2026-05-02):

> "Progressive Performance is constitutional and was demonstrated working: same-fingerprint second encounter at $0/~100ms (Tier 1), 6-file second-cycle 0.6s vs 72s, observed Observatory metrics. Decreasing-cost curve (Synaptic State Spec) is the moat. Reconstruction restores what worked, not builds anew. Every HF/OB closure verifies non-amnesiac behavior empirically against documented operating ranges. A surface that produces cold-start results on every encounter is FAILURE."

This phase tests the constitutional commitment empirically. Two-encounter sequence on identical file: first encounter pays full Tier 3 cost (novel structure); second encounter must approach Tier 1 cost properties ($0, ~100ms).

If second encounter does NOT exhibit Tier 1 properties: progressive performance code paths are inert post-drift. This is a finding, not a failure of HF-196's signal-surface scope. HF-196 still closes on its scope (D154/D155 coherence achieved); the inert layer becomes the next vertical slice's scope — empirically grounded.

If second encounter DOES exhibit Tier 1 properties: the flywheel survived drift; HF-196 + flywheel compose; closure path straightforward.

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER pause for confirmation. Execute every sub-phase sequentially. HALT only on explicit Critical HALT Conditions.

## CRITICAL HALT CONDITIONS

1. **Wipe verification fails** — post-wipe table counts non-zero; data integrity compromised
2. **First-encounter import fails** — error or anomaly preventing measurement capture
3. **Build / dev server unavailable** — code not actually loaded
4. **Phase 5B/5C cumulative verification fails** — distinct_entity_ids ≠ 85, source_dates wrong, or data_types not semantic

ALL OTHER ISSUES (including second-encounter NOT showing Tier 1 properties): SURFACE AND CONTINUE. Tier 1 failure is informational, not blocking.

---

## ARCHITECT-PROVIDED SIGNALS (PREREQUISITES)

Architect provides BEFORE Phase 5-RESET-3 begins:

1. **"wipe applied"** — BCL clean-slate via Supabase Dashboard SQL Editor:
   ```sql
   BEGIN;
   DELETE FROM entity_period_outcomes  WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
   DELETE FROM calculation_results     WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
   DELETE FROM classification_signals  WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
   DELETE FROM structural_fingerprints WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
   DELETE FROM import_batches          WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
   DELETE FROM rule_sets               WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
   DELETE FROM committed_data          WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
   DELETE FROM entities                WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
   COMMIT;
   ```

2. **"5B-first import done"** — confirms architect imported `BCL_Plantilla_Personal.xlsx` via http://localhost:3000 (THIS IS THE FIRST ENCOUNTER — full Tier 3 cost expected).

CC then executes Phase 5-RESET-3 step 1. CC waits at end of step 1 for "5B-second import done" before proceeding.

---

## PHASE 5-RESET-3 STEP 1: FIRST-ENCOUNTER MEASUREMENT (FRESH IMPORT)

### 1A: Wipe verification (no architect work; CC verifies)
```bash
cd ~/spm-platform/web
set -a && source .env.local && set +a
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const tables = ['committed_data', 'entities', 'rule_sets', 'classification_signals', 'import_batches', 'structural_fingerprints', 'calculation_results', 'entity_period_outcomes'];
for (const t of tables) {
  const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  console.log(\`\${t}: \${count ?? 'error'}\`);
}
"
```
Expected: every table shows 0. If any shows non-zero pre-import: HALT (Critical HALT #1).

### 1B: Capture pre-import baseline measurements
```bash
# Capture log file size pre-import (so we can isolate first-import log range)
wc -l /tmp/hf196_dev.log > /tmp/hf196_first_baseline.txt
date +%s > /tmp/hf196_first_start.txt
```

### 1C: HALT — surface to architect
Surface:
- Wipe verified (counts 0 across all tables)
- /tmp/hf196_first_baseline.txt captured (log line count baseline)
- Awaiting architect "5B-first import done" signal — architect imports BCL_Plantilla_Personal.xlsx via http://localhost:3000

### 1D: On "5B-first import done" — capture first-encounter measurements

```bash
# Capture wall-clock end of first import (architect just signaled completion)
date +%s > /tmp/hf196_first_end.txt
echo "First-encounter elapsed: $(($(cat /tmp/hf196_first_end.txt) - $(cat /tmp/hf196_first_start.txt)))s"

# Isolate first-import log range
FIRST_BASELINE=$(awk '{print $1}' /tmp/hf196_first_baseline.txt)
tail -n +$((FIRST_BASELINE + 1)) /tmp/hf196_dev.log > /tmp/hf196_first_logs.txt
wc -l /tmp/hf196_first_logs.txt
```

### 1E: Phase 5B verification (entity resolution + data_type)
```bash
npx tsx scripts/verify-hf195-import-state.ts b1c2d3e4-aaaa-bbbb-cccc-111111111111 _discovery_
```
Paste output. Identify roster band.
```bash
npx tsx scripts/verify-hf195-import-state.ts b1c2d3e4-aaaa-bbbb-cccc-111111111111 <discovered_band>
```
Paste output.

PASS criteria:
- distinct_entity_ids = 85 (Phase 1B holds)
- distinct_source_dates = 0 (Phase 1C holds)
- data_type = 'entity' for all 85 rows (Phase 1D holds — semantic, NOT per-filename stem)

If any fail: HALT (Critical HALT #4).

### 1F: First-encounter cost extraction
Extract LLM-call evidence from first-import log range:
```bash
# Anthropic API calls during first import
grep -nE "POST /v1/messages|anthropic|claude-|input_tokens|output_tokens|cost.*\\$|task_type" /tmp/hf196_first_logs.txt | head -40
echo "---"
# SCI agent invocation evidence
grep -nE "\\[SCI|\\[AI|tier_|fingerprint|classification_signals" /tmp/hf196_first_logs.txt | head -40
echo "---"
# Time/duration evidence  
grep -nE "duration|elapsed|took|seconds" /tmp/hf196_first_logs.txt | head -20
```
Paste all output verbatim.

### 1G: Capture first-encounter signal/density state

Read what was written during first import to flywheel surfaces:
```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// classification_signals written during first import
const { data: signals, count: signalCount } = await sb
  .from('classification_signals')
  .select('signal_type, classification, confidence, decision_source, structural_fingerprint', { count: 'exact' })
  .eq('tenant_id', tenantId);
console.log('classification_signals count:', signalCount);
console.log('first 5 rows:', signals?.slice(0, 5));

// structural_fingerprints written
const { data: fingerprints, count: fpCount } = await sb
  .from('structural_fingerprints')
  .select('fingerprint, classification, confidence, hit_count', { count: 'exact' })
  .eq('tenant_id', tenantId);
console.log('structural_fingerprints count:', fpCount);
console.log('first 5 rows:', fingerprints?.slice(0, 5));
" 2>&1
```
Paste output. If `structural_fingerprints` query errors with table-not-found, paste error and continue (table may not exist post-drift; informational).

### 1H: First-encounter measurement summary

CC produces synthesis table — paste verbatim:

| Metric | First-encounter value |
|---|---|
| Wall-clock elapsed | (from 1D) |
| LLM API calls observed | (from 1F grep — count of POST /v1/messages or equivalent) |
| Total input_tokens | (from 1F if extractable) |
| Total output_tokens | (from 1F if extractable) |
| Estimated cost | (compute if tokens captured) |
| classification_signals rows written | (from 1G) |
| structural_fingerprints rows written | (from 1G; or "table absent" if errored) |
| SCI tier verdict for the import | (from 1F grep — Tier 1 / Tier 2 / Tier 3 / not-emitted) |

DO NOT HALT after 1H. Continue to step 2.

---

## PHASE 5-RESET-3 STEP 2: SECOND-ENCOUNTER MEASUREMENT (RE-IMPORT)

### 2A: HALT — surface to architect
Surface:
- First-encounter measurements captured (1H synthesis above)
- Awaiting architect "5B-second import done" signal — architect imports the SAME BCL_Plantilla_Personal.xlsx file AGAIN via http://localhost:3000 (this is the second encounter — Tier 1 cost properties expected if progressive performance is intact)

Note for architect: same file, same path, no modification. The fingerprint should be identical.

### 2B: Pre-second-import baseline
```bash
wc -l /tmp/hf196_dev.log > /tmp/hf196_second_baseline.txt
date +%s > /tmp/hf196_second_start.txt
```

### 2C: On "5B-second import done"
```bash
date +%s > /tmp/hf196_second_end.txt
echo "Second-encounter elapsed: $(($(cat /tmp/hf196_second_end.txt) - $(cat /tmp/hf196_second_start.txt)))s"

SECOND_BASELINE=$(awk '{print $1}' /tmp/hf196_second_baseline.txt)
tail -n +$((SECOND_BASELINE + 1)) /tmp/hf196_dev.log > /tmp/hf196_second_logs.txt
wc -l /tmp/hf196_second_logs.txt
```

### 2D: Phase 5B re-verification
```bash
npx tsx scripts/verify-hf195-import-state.ts b1c2d3e4-aaaa-bbbb-cccc-111111111111 _discovery_
npx tsx scripts/verify-hf195-import-state.ts b1c2d3e4-aaaa-bbbb-cccc-111111111111 <discovered_band>
```
Paste output. Note: second import may produce duplicate rows in committed_data (85 + 85 = 170 entity-band rows) OR may dedupe — surface whichever and continue.

### 2E: Second-encounter cost extraction (mirror 1F)
```bash
grep -nE "POST /v1/messages|anthropic|claude-|input_tokens|output_tokens|cost.*\\$|task_type" /tmp/hf196_second_logs.txt | head -40
echo "---"
grep -nE "\\[SCI|\\[AI|tier_|fingerprint|classification_signals" /tmp/hf196_second_logs.txt | head -40
echo "---"
grep -nE "duration|elapsed|took|seconds" /tmp/hf196_second_logs.txt | head -20
```
Paste all output verbatim.

### 2F: Capture second-encounter signal/density delta
```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

const { count: signalCount } = await sb
  .from('classification_signals')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', tenantId);
console.log('classification_signals total count post-second:', signalCount);

const { data: fingerprints, count: fpCount } = await sb
  .from('structural_fingerprints')
  .select('fingerprint, classification, confidence, hit_count')
  .eq('tenant_id', tenantId);
console.log('structural_fingerprints count:', fpCount);
console.log('rows:', fingerprints);
" 2>&1
```
Paste output. Pay attention to `hit_count` — if structural_fingerprints exists and hit_count incremented (1 → 2), the flywheel is firing.

### 2G: Second-encounter measurement summary

CC produces synthesis table — paste verbatim:

| Metric | First | Second | Ratio | Per memory #30 |
|---|---|---|---|---|
| Wall-clock elapsed | | | | Tier 1 target: ≤100ms (will likely be longer for full import; compare ratio) |
| LLM API calls observed | | | | Tier 1 target: 0 |
| Total input_tokens | | | | Tier 1 target: 0 |
| Total output_tokens | | | | Tier 1 target: 0 |
| classification_signals delta (Δ) | | | | informational |
| structural_fingerprints hit_count delta | | | | If existed: should increment +1 |
| SCI tier verdict | | | | Should shift Tier 3 → Tier 1 |

### 2H: PROGRESSIVE PERFORMANCE VERDICT

CC produces verdict (no architect-disposition required; surface for architect review):

**INTACT** — second-encounter LLM calls = 0 AND wall-clock elapsed ≤ first-encounter × 0.2 AND tier verdict shifts to Tier 1
**PARTIAL** — some indicators show progressive behavior but not Tier 1 properties (e.g., LLM calls reduced but not zero; or fingerprint table exists but hit_count not incrementing)
**INERT** — second-encounter cost ≈ first-encounter cost; no Tier 1 properties; LLM calls equal; fingerprint table absent or unchanged

This is the empirical answer to memory entry 30's constitutional commitment for the current code state.

---

## PHASE 5-RESET-3 STEP 3: TRANSACTION RE-IMPORT (Oct/Nov/Dic/Ene)

Architect imports 4 transaction files via http://localhost:3000 (one-by-one OR all 4 sequentially — architect's choice).

### 3A: HALT — surface to architect
Surface:
- Step 2 progressive performance verdict
- Awaiting architect "5C re-4 done" signal — architect imports BCL_Datos_Oct2025 + Nov2025 + Dic2025 + Ene2026 via http://localhost:3000

### 3B: On "5C re-4 done" — Phase 5C cumulative verification
```bash
npx tsx scripts/verify-hf195-import-state.ts b1c2d3e4-aaaa-bbbb-cccc-111111111111 _discovery_
```
Paste output. Identify ALL transaction bands (note: post Phase 1D, all 4 should land on data_type='transaction' — single canonical class).

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

const { data: distinctTypes } = await sb
  .from('committed_data')
  .select('data_type')
  .eq('tenant_id', tenantId);
const types = new Set(distinctTypes!.map(r => r.data_type));
console.log('distinct data_type values:', Array.from(types));

const { count: txnCount } = await sb
  .from('committed_data')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', tenantId)
  .eq('data_type', 'transaction');
console.log('transaction band total rows:', txnCount);

const { data: bySource } = await sb
  .from('committed_data')
  .select('source_date')
  .eq('tenant_id', tenantId)
  .eq('data_type', 'transaction');
const sourceDates = bySource!.reduce((acc: Record<string, number>, r: any) => {
  const sd = r.source_date ?? 'NULL';
  acc[sd] = (acc[sd] ?? 0) + 1;
  return acc;
}, {});
console.log('transaction rows by source_date:', sourceDates);
" 2>&1
```
Paste output.

PASS criteria:
- distinct data_type values = exactly 2 ('entity', 'transaction') — Phase 1D holds
- transaction total rows = 340 (85 × 4 months)
- transaction source_date distribution: Oct=85, Nov=85, Dic=85, Ene=85
- entity_id resolution: 100% on transaction rows (back-link to roster employees)

If any fail: HALT (Critical HALT #4).

### 3C: Commit Phase 5-RESET-3 evidence
```bash
cd ~/spm-platform
git add -A
# Should be no functional code changes — only ephemeral logs / scripts that should already be gitignored
git status
```
If git status shows code changes: surface as anomaly. If clean: NO COMMIT (RESET-3 produces evidence in chat, not in repo).

---

## STEP 4: SURFACE TO ARCHITECT FOR PHASE 5C STEP 5/6 SIGNAL

Surface:
- Phase 5-RESET-3 complete
- Phase 5B re-verification PASS (entity / source_date / data_type all correct)
- Step 2 Progressive Performance Verdict: [INTACT / PARTIAL / INERT] — empirical state of flywheel
- Phase 5C cumulative re-verification PASS (4 months on data_type='transaction'; correct source_dates)
- Awaiting architect "5C Feb2026 imported" signal — Phase 5C resumes from step 5/6

---

## DO NOT HALT FOR (informational only — surface and continue)

- Second-encounter shows INERT progressive performance — this is empirical finding, not failure
- structural_fingerprints table absent — informational; logged for follow-on flywheel work
- classification_signals row count lower than expected — informational
- Observatory route check (NOT in this directive scope; deferred to follow-on flywheel audit)

---

## END OF DIRECTIVE

CC executes step 1 → step 4 sequentially. Architect provides 4 signals: (1) wipe applied, (2) 5B-first import done, (3) 5B-second import done, (4) 5C re-4 done. Phase 5C resumes at step 5/6 of original directive after Phase 5-RESET-3 completes.
